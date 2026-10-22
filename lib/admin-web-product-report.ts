import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { adminDashboardFilterSql, type AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import { funnelBpmSource } from "@/lib/admin-funnel-events";

export type GenerationStageReport = {
  stage: "formula" | "products";
  tasks: number; queued: number; running: number; completed: number; failed: number; review: number; cancelled: number;
  retries: number; errorEvents: number; timedCompletions: number; medianSeconds: number | null; p90Seconds: number | null;
};
export type ProductSalesTotals = {
  paidPayments: number; paidJourneys: number; orders: number; shipped: number; delivered: number;
  cancelled: number; returned: number; fulfillmentFailed: number; paidWithoutOrder: number;
  paymentsWithEvent: number; paymentsMissingEvent: number;
};
export type ProductSalesCampaign = ProductSalesTotals & {
  source: string; medium: string | null; campaign: string | null; campaignId: string | null;
  affiliate: string | null; promoCode: string | null; firstPaidAt: string; lastPaidAt: string;
};
export type WebProductReport = {
  generation: GenerationStageReport[];
  sales: ProductSalesTotals & {
    revenue: Array<{ currency: string; amountMicros: string }>;
    paymentEvents: number; eventPaymentIds: number; eventsWithoutPaidPayment: number;
  };
  campaigns: ProductSalesCampaign[];
};

/** Frozen payment acquisition wins. Old plans recover their original capture context.
 * All projections are aggregate-only; no answer or contact data leaves this query. */
function resourceSource(sql: postgres.Sql, kind: "tasks" | "payments") {
  const resources = kind === "payments"
    ? sql`select p.* from public.retail_checkout_payments p where p.stripe_mode='live'
        and not exists(select 1 from public.retail_customer_orders test_order where test_order.id=p.retail_customer_order_id
          and (coalesce(test_order.metadata->>'internal_test','false') in ('true','1')
            or coalesce(test_order.metadata->>'stripeMode','live') in ('test','mock')))`
    : sql`select t.*, t.payload as metadata from public.tasks t
        where t.task_type in ('generate_supplement_guidance','generate_product_recommendations')`;
  return sql`(
    select r.*, a.locale as assessment_locale, a.selected_plan,
      coalesce(acq.value->>'ray', b.ray::text) as ray, b.email_hash,
      coalesce(acq.value #>> '{attribution,deviceType}', b.device_type) as device_type,
      coalesce(acq.value #>> '{attribution,utmSource}', b.utm_source) as utm_source,
      coalesce(acq.value #>> '{attribution,trafficSource}', b.traffic_source) as traffic_source,
      coalesce(acq.value #>> '{attribution,sourceChannel}', b.source_channel) as source_channel,
      coalesce(acq.value #>> '{attribution,utmMedium}', b.utm_medium) as utm_medium,
      coalesce(acq.value #>> '{attribution,utmCampaign}', b.utm_campaign) as utm_campaign,
      coalesce(acq.value #>> '{attribution,campaignName}', b.campaign_name) as campaign_name,
      coalesce(acq.value #>> '{attribution,campaignId}', b.campaign_id) as campaign_id,
      coalesce(acq.value #>> '{attribution,affiliateId}', b.affiliate_id) as affiliate_id,
      coalesce(acq.value #>> '{attribution,affiliateRef}', b.affiliate_ref) as affiliate_ref,
      coalesce(acq.value #>> '{attribution,affiliateSubId}', b.affiliate_sub_id) as affiliate_sub_id,
      coalesce(acq.value #>> '{attribution,promoCode}', b.promo_code) as promo_code
    from (${resources}) r join public.assessments a on a.plan_id=r.plan_id
    left join lateral (select * from ${funnelBpmSource(sql)}
      where plan_id=a.plan_id and journey_channel='web'
        and funnel_event_name in ('assessment_captured','assessment_recaptured','assessment_submitted')
      order by occurred_at,id limit 1) b on true
    cross join lateral (select coalesce(nullif(r.metadata->'acquisitionAttribution','null'::jsonb),
      nullif(a.acquisition_attribution,'{}'::jsonb)) as value) acq
    where not (a.answers ? 'inStorePharmacy')
      and coalesce(a.answers->>'channel','') <> 'mcp' and coalesce(a.answers->>'source','') <> 'mcp'
      and coalesce(r.metadata->>'channel','web')='web'
      and coalesce(r.metadata->>'internal_test','false') not in ('true','1')
      and coalesce(r.metadata->>'stripeMode','live') not in ('test','mock')
      and coalesce(r.metadata->>'mocked','false') <> 'true'
      and coalesce(a.answers->>'internal_test','false') not in ('true','1')
      and not exists (select 1 from public.bpm marker where marker.plan_id=a.plan_id
        and marker.event_name in ('assessment_captured','assessment_recaptured','assessment_submitted')
        and (coalesce(marker.properties->>'internal_test','false') in ('true','1')
          or nullif(marker.properties->>'seedName','') is not null
          or coalesce(marker.emitted_by,'') in ('dev_campaign_seed','payment_skip_mock')
          or coalesce(marker.user_agent,'') ~* '(bot|crawler|spider|headless|playwright|facebookexternalhit|meta-externalagent)'))
  ) resource`;
}

const totalFields = ["paidPayments", "paidJourneys", "orders", "shipped", "delivered", "cancelled", "returned", "fulfillmentFailed", "paidWithoutOrder", "paymentsWithEvent", "paymentsMissingEvent"] as const;
function totals(row: Record<string, unknown> | undefined): ProductSalesTotals {
  return Object.fromEntries(totalFields.map(key => [key, Number(row?.[key]) || 0])) as ProductSalesTotals;
}

export function campaignSalesKey(row: Pick<ProductSalesCampaign, "source" | "medium" | "campaign" | "campaignId" | "affiliate" | "promoCode">) {
  return JSON.stringify([row.source || "direct", row.medium, row.campaign, row.campaignId, row.affiliate, row.promoCode]);
}

export async function getWebProductReport(start: Date | string | null, filters: AdminDashboardFilters): Promise<WebProductReport | undefined> {
  const sql = getSql();
  if (!sql) return undefined;
  const generation = await sql`
    with matched as (
      select resource.*, assessment_locale as locale from ${resourceSource(sql, "tasks")}
    ), scoped as (
      select * from matched where (${start}::timestamptz is null or created_at>=${start})
        and ${adminDashboardFilterSql(sql, filters)}
    )
    select case when task_type='generate_supplement_guidance' then 'formula' else 'products' end as stage,
      count(*)::int as tasks,
      count(*) filter(where status='queued')::int as queued,
      count(*) filter(where status in ('reserved','running'))::int as running,
      count(*) filter(where status='completed')::int as completed,
      count(*) filter(where status='failed')::int as failed,
      count(*) filter(where status in ('needs_review','waiting_approval'))::int as review,
      count(*) filter(where status in ('cancelled','skipped'))::int as cancelled,
      coalesce(sum(greatest(attempts-1,0) + case when retry_of_task_id is not null then 1 else 0 end),0)::int as retries,
      (select count(*)::int from public.task_events e join scoped st on st.id=e.task_id
        where st.task_type=scoped.task_type and e.event_status='failed') as "errorEvents",
      count(*) filter(where status='completed' and completed_at>=created_at)::int as "timedCompletions",
      percentile_cont(0.5) within group(order by extract(epoch from completed_at-created_at))
        filter(where status='completed' and completed_at>=created_at) as "medianSeconds",
      percentile_cont(0.9) within group(order by extract(epoch from completed_at-created_at))
        filter(where status='completed' and completed_at>=created_at) as "p90Seconds"
    from scoped group by task_type`;
  const sales = await sql`
    with eligible as materialized (
      select * from ${resourceSource(sql, "payments")}
    ), paid as materialized (
      select * from eligible where paid_at is not null
        and (${start}::timestamptz is null or paid_at>=${start}) and ${adminDashboardFilterSql(sql, filters)}
    ), events as materialized (
      select * from ${funnelBpmSource(sql)} where journey_channel='web'
        and funnel_event_name='retail_product_payment_succeeded'
    ), grouped as (
      select p.*, o.status as order_status, o.id as order_id, o.shipped_at as order_shipped_at, o.delivered_at as order_delivered_at,
        coalesce(nullif(utm_source,''),nullif(traffic_source,''),nullif(source_channel,''),'direct') as source,
        nullif(utm_medium,'') as medium, coalesce(nullif(utm_campaign,''),nullif(campaign_name,'')) as campaign,
        coalesce(nullif(affiliate_id,''),nullif(affiliate_ref,'')) as affiliate,
        exists(select 1 from events e where e.properties->>'checkoutPaymentId'=p.id::text) as has_event
      from paid p left join public.retail_customer_orders o on o.id=p.retail_customer_order_id
        and coalesce(o.metadata->>'internal_test','false') not in ('true','1')
        and coalesce(o.metadata->>'stripeMode','live') not in ('test','mock')
    )
    select grouping(source)::int as total, source, medium, campaign, nullif(campaign_id,'') as "campaignId", affiliate, nullif(promo_code,'') as "promoCode",
      min(paid_at) as "firstPaidAt", max(paid_at) as "lastPaidAt",
      count(*)::int as "paidPayments", count(distinct plan_id)::int as "paidJourneys",
      count(distinct order_id)::int as orders,
      count(distinct order_id) filter(where order_status in ('shipped','delivered') or order_shipped_at is not null or order_delivered_at is not null)::int as shipped,
      count(distinct order_id) filter(where order_status='delivered' or order_delivered_at is not null)::int as delivered,
      count(distinct order_id) filter(where order_status='cancelled')::int as cancelled,
      count(distinct order_id) filter(where order_status='returned')::int as returned,
      count(*) filter(where status='fulfillment_failed')::int as "fulfillmentFailed",
      count(*) filter(where order_id is null)::int as "paidWithoutOrder",
      count(*) filter(where has_event)::int as "paymentsWithEvent",
      count(*) filter(where not has_event)::int as "paymentsMissingEvent"
    from grouped group by grouping sets ((source,medium,campaign,campaign_id,affiliate,promo_code),())`;
  const revenue = await sql`
    select currency,sum(amount)::text as "amountMicros" from ${resourceSource(sql, "payments")}
    where paid_at is not null and (${start}::timestamptz is null or paid_at>=${start})
      and ${adminDashboardFilterSql(sql, filters)} group by currency order by currency`;
  const [events] = await sql`
    select count(*)::int as "paymentEvents", count(distinct properties->>'checkoutPaymentId')::int as "eventPaymentIds",
      count(*) filter(where not exists(select 1 from ${resourceSource(sql, "payments")}
        where resource.id::text=bpm.properties->>'checkoutPaymentId' and resource.paid_at is not null))::int as "eventsWithoutPaidPayment"
    from ${funnelBpmSource(sql)} where journey_channel='web'
      and funnel_event_name='retail_product_payment_succeeded'
      and (${start}::timestamptz is null or occurred_at>=${start}) and ${adminDashboardFilterSql(sql, filters)}`;
  return {
    generation: (["formula", "products"] as const).map(stage => {
      const row = generation.find(row => row.stage === stage);
      return { stage, tasks: Number(row?.tasks) || 0, queued: Number(row?.queued) || 0, running: Number(row?.running) || 0,
        completed: Number(row?.completed) || 0, failed: Number(row?.failed) || 0, review: Number(row?.review) || 0,
        cancelled: Number(row?.cancelled) || 0, retries: Number(row?.retries) || 0, errorEvents: Number(row?.errorEvents) || 0,
        timedCompletions: Number(row?.timedCompletions) || 0,
        medianSeconds: row?.medianSeconds == null ? null : Number(row.medianSeconds),
        p90Seconds: row?.p90Seconds == null ? null : Number(row.p90Seconds) };
    }),
    sales: { ...totals(sales.find(row => row.total === 1)), revenue: revenue.map(row => ({ currency: String(row.currency), amountMicros: String(row.amountMicros) })),
      paymentEvents: Number(events?.paymentEvents) || 0, eventPaymentIds: Number(events?.eventPaymentIds) || 0,
      eventsWithoutPaidPayment: Number(events?.eventsWithoutPaidPayment) || 0 },
    campaigns: sales.filter(row => row.total === 0).map(row => ({ ...totals(row), source: String(row.source),
      medium: row.medium as string | null, campaign: row.campaign as string | null, campaignId: row.campaignId as string | null,
      affiliate: row.affiliate as string | null, promoCode: row.promoCode as string | null,
      firstPaidAt: new Date(row.firstPaidAt).toISOString(), lastPaidAt: new Date(row.lastPaidAt).toISOString() }))
  };
}
