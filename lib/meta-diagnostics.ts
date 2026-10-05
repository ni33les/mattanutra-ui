import { getSql } from "@/lib/db";
import { metaConfig } from "@/lib/meta-config";
import { metaEventName, type MetaEventName } from "@/lib/meta-event-policy";
import { emptyMetaCampaignReport, metaCampaignReport, type MetaCampaignReport } from "@/lib/meta-campaign-report";

export type MetaDiagnostics = {
  environment: string; pixelId: string; enabled: boolean;
  rows: { name: string; channel: string; status: string; count: number; lastAt: string }[];
  purchases: { confirmed: number; recorded: number; missing: number };
  campaigns: MetaCampaignReport;
};

/** Operational receipts, never contact hashes, browser identifiers or raw Meta errors. */
export async function metaDiagnostics(since: Date | string | null): Promise<MetaDiagnostics> {
  const config = metaConfig(), sql = getSql();
  const result: MetaDiagnostics = { environment: config.environment, pixelId: config.pixelId, enabled: config.enabled,
    rows: [], purchases: { confirmed: 0, recorded: 0, missing: 0 }, campaigns: emptyMetaCampaignReport() };
  if (!sql || !config.enabled) return result;
  const start = since ?? new Date(Date.now() - 30 * 86400000);
  const [rows, purchases, campaigns] = await Promise.all([
    sql`select event_name,status,
      case when custom_data->>'channel'='pharmacy' then 'retail' when custom_data->>'channel'='mcp_web' then 'mcp'
        when custom_data->>'channel' in ('web','retail','mcp') then custom_data->>'channel' else 'unknown' end as channel,
      count(*)::int as count,max(updated_at) as last_at from public.meta_conversion_events
      where environment=${config.environment} and pixel_id=${config.pixelId} and occurred_at>=${start}
      group by event_name,status,channel order by event_name,channel,status`,
    sql`with confirmations as (
      select 'payment' as resource_type,id::text as resource_id,'purchase:' || coalesce(stripe_checkout_session_id,'payment:' || id::text) as source_key,paid_at
        from public.payments where paid_at>=${start}
      union all
      select 'retail',id::text,'purchase:' || coalesce(stripe_checkout_session_id,'retail:' || id::text),paid_at
        from public.retail_checkout_payments where paid_at>=${start}
      union all
      select 'agentic',id::text,'purchase:' || coalesce(provider_session_id,'agentic:' || id::text),updated_at
        from public.agentic_orders where payment_status in ('paid','partially_refunded','refunded') and updated_at>=${start}
    ), eligible as (
      select distinct p.source_key from confirmations p join public.meta_tracking_bindings b using(resource_type,resource_id)
        join public.meta_tracking_contexts c on c.id=b.context_id
      where c.environment=${config.environment} and b.created_at<=p.paid_at
    ) select count(*)::int as confirmed,count(e.id)::int as recorded,count(*) filter(where e.id is null)::int as missing
      from eligible p left join public.meta_conversion_events e on e.source_key=p.source_key and e.event_name='Purchase'
        and e.environment=${config.environment} and e.pixel_id=${config.pixelId}`,
    metaCampaignReport(sql, config, start)
  ]);
  result.rows = rows.map(row => ({ name: metaEventName(row.event_name as MetaEventName, config.environment),
    channel: row.channel, status: row.status, count: Number(row.count), lastAt: new Date(row.last_at).toISOString() }));
  result.purchases = { confirmed: Number(purchases[0].confirmed), recorded: Number(purchases[0].recorded), missing: Number(purchases[0].missing) };
  result.campaigns = campaigns;
  return result;
}
