import { getSql } from "@/lib/db";
import { adminDashboardFilterSql, type AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import { pharmacySources, pharmacySource, type PharmacySource } from "@/lib/pharmacy-acquisition";
export type PharmacyFunnelStage = "landing" | "started" | "captured" | "revealed" | "orders";
export type PharmacyFunnelEvent = Readonly<{ id: string; ray: string | null; planId: string | null; pharmacy: string; source: PharmacySource; stage: PharmacyFunnelStage; orderId?: string }>;
export type PharmacySourceFunnel = { pharmacy: string; source: PharmacySource; landing: number; started: number; captured: number; revealed: number; orders: number; orderedJourneys: number };
/** A capture connects anonymous entry events to the durable assessment; repeated events never add conversions. */
export function summarizePharmacySources(events: readonly PharmacyFunnelEvent[]): PharmacySourceFunnel[] {
  const byRay = new Map(events.filter(event => event.ray && event.planId).map(event => [`${event.pharmacy}:${event.ray}`, event.planId!]));
  const groups = new Map<string, {row: PharmacySourceFunnel; sets: Map<string, Set<string>>}>();
  for (const pharmacy of [...new Set(events.map(event => event.pharmacy))].sort()) for (const source of pharmacySources) {
    groups.set(`${pharmacy}:${source}`, { row: { pharmacy, source, landing: 0, started: 0, captured: 0, revealed: 0, orders: 0, orderedJourneys: 0 }, sets: new Map() });
  }
  for (const event of events) {
    const group = groups.get(`${event.pharmacy}:${event.source}`)!;
    const subject = event.planId || (event.ray && byRay.get(`${event.pharmacy}:${event.ray}`)) || event.ray || event.id;
    const set = group.sets.get(event.stage) ?? new Set<string>();
    set.add(event.stage === "orders" ? event.orderId! : subject); group.sets.set(event.stage, set);
    group.row[event.stage] = set.size;
    if (event.stage === "orders") { const purchased = group.sets.get("orderedJourneys") ?? new Set<string>(); purchased.add(subject); group.sets.set("orderedJourneys", purchased); group.row.orderedJourneys = purchased.size; }
  }
  return [...groups.values()].map(group => group.row);
}
export async function getPharmacySourceFunnel(start: Date | null, filters: AdminDashboardFilters): Promise<PharmacySourceFunnel[]> {
  const sql = getSql(); if (!sql) return [];
  const events = await sql`
    select * from (select b.*,
      coalesce(a.answers->'inStorePharmacy'->>'slug', nullif(b.source_channel,''), 'unknown') as pharmacy,
      coalesce(a.answers #>> '{inStorePharmacy,acquisition,source}', nullif(b.source_detail,''), 'unknown') as source
    from public.bpm b left join public.assessments a on a.plan_id=b.plan_id
    where (${start}::timestamptz is null or b.occurred_at>=${start})
      and (b.traffic_source='pharmacy' or a.answers ? 'inStorePharmacy')
      and b.event_name in ('pharmacy_landing_viewed','assessment_started','chat_start','assessment_submitted','assessment_captured','assessment_recaptured','formulation_page_viewed')
    ) events where ${adminDashboardFilterSql(sql, filters)}
    order by occurred_at,id limit 100000`;
  // Project durable orders into existing filter columns. BPM delivery is not evidence of payment or a prerequisite for an order count.
  const orders = await sql`
    select * from (
      select o.id::text, o.metadata->>'planId' as plan_id, o.metadata->>'planId' as "planId",
        coalesce(o.metadata #>> '{acquisition,ray}', a.answers #>> '{inStorePharmacy,acquisition,ray}') as ray,
        coalesce(o.metadata->>'pharmacySlug', a.answers->'inStorePharmacy'->>'slug', org.slug) as pharmacy,
        coalesce(o.metadata #>> '{acquisition,source}', a.answers #>> '{inStorePharmacy,acquisition,source}', 'unknown') as source_detail,
        coalesce(o.metadata->>'pharmacySlug', org.slug) as source_channel, 'pharmacy'::text as traffic_source,
        coalesce(o.metadata->>'locale',a.locale) as locale, null::text as selected_plan, null::text as device_type,
        null::text as email_hash, null::text as utm_source, null::text as utm_medium, null::text as utm_campaign,
        null::text as campaign_name, null::text as campaign_id, null::text as affiliate_id, null::text as affiliate_ref,
        null::text as affiliate_sub_id, null::text as promo_code
      from public.retail_customer_orders o join public.organisations org on org.id=o.organisation_id
      left join public.assessments a on a.plan_id::text=o.metadata->>'planId'
      where o.source='pharmacy' and (${start}::timestamptz is null or o.placed_at>=${start})
    ) orders where ${adminDashboardFilterSql(sql, filters)}`;
  const stages: Record<string, PharmacyFunnelStage> = {pharmacy_landing_viewed:"landing",assessment_started:"started",chat_start:"started",assessment_submitted:"captured",assessment_captured:"captured",assessment_recaptured:"captured",formulation_page_viewed:"revealed"};
  return summarizePharmacySources([
    ...events.map(row => ({ id: row.id, ray: row.ray, planId: row.plan_id, pharmacy: row.pharmacy, source: pharmacySource(row.source,"unknown"), stage: stages[row.event_name] })),
    ...orders.map(row => ({ id: row.id, orderId: row.id, ray: row.ray, planId: row.plan_id, pharmacy: row.pharmacy, source: pharmacySource(row.source_detail,"unknown"), stage: "orders" as const }))
  ]);
}
