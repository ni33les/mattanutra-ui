import type postgres from "postgres";
import type { MetaPublicConfig } from "@/lib/meta-event-policy";

export type MetaCampaignDimensions = { campaignId: string | null; adsetId: string | null; adId: string | null; channel: string; locale: string };
export type MetaCampaignActivity = MetaCampaignDimensions & {
  visitors: number; starts: number; completions: number; checkouts: number; purchasingVisitors: number; purchaseRate: number | null;
};
export type MetaCampaignSales = MetaCampaignDimensions & {
  purchaseType: string; offer: string; currency: string; purchases: number; accepted: number; pending: number; failed: number; revenue: number;
};
export type MetaCampaignReport = { activity: MetaCampaignActivity[]; sales: MetaCampaignSales[]; limited: boolean; adsReportingConnected: false };
export const emptyMetaCampaignReport = (): MetaCampaignReport => ({ activity: [], sales: [], limited: false, adsReportingConnected: false });

/** Reports immutable event snapshots. It never labels a Meta delivery receipt as ad attribution. */
export async function metaCampaignReport(sql: postgres.Sql, config: MetaPublicConfig, start: Date | string): Promise<MetaCampaignReport> {
  // All values remain bound parameters; the shared projection contains no user input.
  const dimensions = sql.unsafe(`
    case when custom_data->>'campaign_id' ~ '^\\d{1,25}$' then custom_data->>'campaign_id' end as campaign_id,
    case when custom_data->>'adset_id' ~ '^\\d{1,25}$' then custom_data->>'adset_id' end as adset_id,
    case when custom_data->>'ad_id' ~ '^\\d{1,25}$' then custom_data->>'ad_id' end as ad_id,
    case when custom_data->>'channel' in ('retail','pharmacy') then 'retail' when custom_data->>'channel' in ('mcp','mcp_web') then 'mcp'
      when custom_data->>'channel'='web' then 'web' else 'unknown' end as channel,
    case when custom_data->>'locale' in ('en','th','zh-CN') then custom_data->>'locale' else 'unknown' end as locale`);
  const [activity, sales] = await Promise.all([
    sql`with events as (
      select context_id,event_name,${dimensions} from public.meta_conversion_events
      where environment=${config.environment} and pixel_id=${config.pixelId} and occurred_at>=${start}
    ), visitors as (
      select campaign_id,adset_id,ad_id,channel,locale,context_id,
        bool_or(event_name='PageView') as visited,bool_or(event_name='QuizStart') as started,
        bool_or(event_name='QuizSubmitted') as completed,bool_or(event_name='InitiateCheckout') as checkout,
        bool_or(event_name='Purchase') as purchased
      from events group by campaign_id,adset_id,ad_id,channel,locale,context_id
    ) select campaign_id,adset_id,ad_id,channel,locale,
      count(*) filter(where visited)::int as visitors,count(*) filter(where visited and started)::int as starts,
      count(*) filter(where visited and completed)::int as completions,count(*) filter(where visited and checkout)::int as checkouts,
      count(*) filter(where visited and purchased)::int as purchasing_visitors
    from visitors group by campaign_id,adset_id,ad_id,channel,locale
    having bool_or(visited) order by count(*) filter(where visited) desc,campaign_id,adset_id,ad_id,channel,locale limit 201`,
    sql`with purchases as (
      select status,${dimensions},
        case when custom_data->>'purchase_type' in ('plan','products') then custom_data->>'purchase_type' else 'unknown' end as purchase_type,
        case when custom_data->>'offer' in ('precision','pro') then custom_data->>'offer' else 'unknown' end as offer,
        case when custom_data->>'currency' ~ '^[A-Z]{3}$' then custom_data->>'currency' else 'unknown' end as currency,
        case when jsonb_typeof(custom_data->'value')='number' then (custom_data->>'value')::numeric else 0 end as value
      from public.meta_conversion_events where environment=${config.environment} and pixel_id=${config.pixelId}
        and occurred_at>=${start} and event_name='Purchase'
    ) select campaign_id,adset_id,ad_id,channel,locale,purchase_type,offer,currency,count(*)::int as purchases,
      count(*) filter(where status='accepted')::int as accepted,
      count(*) filter(where status in ('queued','sending','retrying'))::int as pending,
      count(*) filter(where status in ('rejected','suppressed'))::int as failed,sum(value)::text as revenue
    from purchases group by campaign_id,adset_id,ad_id,channel,locale,purchase_type,offer,currency
    order by count(*) desc,campaign_id,adset_id,ad_id,channel,locale,purchase_type,offer,currency limit 201`
  ]);
  const dim = (row: (typeof activity)[number]): MetaCampaignDimensions => ({
    campaignId: row.campaign_id, adsetId: row.adset_id, adId: row.ad_id, channel: row.channel, locale: row.locale
  });
  return {
    activity: activity.slice(0, 200).map(row => ({ ...dim(row), visitors: row.visitors, starts: row.starts, completions: row.completions,
      checkouts: row.checkouts, purchasingVisitors: row.purchasing_visitors,
      purchaseRate: row.visitors ? 100 * row.purchasing_visitors / row.visitors : null })),
    sales: sales.slice(0, 200).map(row => ({ ...dim(row), purchaseType: row.purchase_type, offer: row.offer, currency: row.currency,
      purchases: row.purchases, accepted: row.accepted, pending: row.pending, failed: row.failed, revenue: Number(row.revenue) })),
    limited: activity.length > 200 || sales.length > 200, adsReportingConnected: false
  };
}
