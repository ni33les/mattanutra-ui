import { getSql } from "@/lib/db";
import { metaConfig } from "@/lib/meta-config";
export type ConnectReport = { available: boolean; environment: string; rows: {
  provider: string; locale: string; visits: number; selected: number; copied: number; opened: number; prompted: number; verified: number; accepted: number;
}[] };
export async function connectReport(since: Date | string | null): Promise<ConnectReport> {
  const config = metaConfig(), sql = getSql();
  const report: ConnectReport = { available: false, environment: config.environment, rows: [] };
  if (!sql) return report;
  try {
    const rows = await sql`select coalesce(f.provider,'all') as provider,f.locale,
      count(distinct f.visitor_id) filter(where f.event_name='page_viewed')::int as visits,
      count(distinct f.visitor_id) filter(where f.event_name='provider_selected')::int as selected,
      count(distinct f.visitor_id) filter(where f.event_name='url_copied')::int as copied,
      count(distinct f.visitor_id) filter(where f.event_name='provider_opened')::int as opened,
      count(distinct f.visitor_id) filter(where f.event_name='prompt_copied')::int as prompted,
      count(distinct a.id)::int as verified,
      count(distinct m.id) filter(where m.status='accepted')::int as accepted
      from public.connect_funnel_events f
      left join public.connect_attempts a on f.attempt_id=a.id and f.event_name='verified' and a.verified_at is not null and a.environment=f.environment
      left join public.meta_conversion_events m on m.source_key='connect:' || a.id::text and m.event_name='McpConnectionVerified'
        and m.environment=f.environment and m.pixel_id=${config.pixelId}
      where f.environment=${config.environment} ${since ? sql`and f.occurred_at>=${since}` : sql``}
      group by f.provider,f.locale order by f.provider nulls first,f.locale`;
    report.rows = rows.map(row => ({ provider: row.provider, locale: row.locale, visits: Number(row.visits), selected: Number(row.selected), copied: Number(row.copied),
      opened: Number(row.opened), prompted: Number(row.prompted), verified: Number(row.verified), accepted: Number(row.accepted) }));
    report.available = true;
  } catch { /* Additive deployment: the rest of Marketing remains usable before migration. */ }
  return report;
}
