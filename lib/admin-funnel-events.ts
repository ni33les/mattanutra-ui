import type postgres from "postgres";

// Product payments and payment-related bookkeeping are not plan purchases.
export const planPaymentEventNames = [
  "checkout_completed", "checkout_paid", "payment_completed", "payment_confirmed",
  "payment_succeeded", "payment_fulfillment_succeeded", "plan_paid"
] as const;

// Older named purchase events use BPM's default "observed" status.
const planPaymentStatuses = ["observed", "complete", "completed", "paid", "success", "succeeded"];

export function isPlanPaymentEvent(row: { event_name: string; event_status: string | null }) {
  return planPaymentEventNames.some(name => name === row.event_name) &&
    (row.event_status === null || planPaymentStatuses.includes(row.event_status));
}

export function planPaymentEventSql(sql: postgres.Sql) {
  return sql`(event_name = any(${[...planPaymentEventNames]}::text[])
    and (event_status is null or event_status = any(${planPaymentStatuses}::text[])))`;
}

/** Journey is separate from acquisition (Facebook, TikTok, referral, etc.).
 * Assessment provenance wins over browser hints, including MCP's retail bridge.
 * Normalize on read: never manufacture historical events or replay Meta exports.
 * Exclude identified automation and demo events without deleting audit evidence.
 */
export function funnelBpmSource(sql: postgres.Sql) {
  return sql`(
    select b.*,
      case
        when exists (select 1 from public.assessments a where a.plan_id=b.plan_id and a.answers ? 'inStorePharmacy') then 'retail'
        when exists (select 1 from public.assessments a where a.plan_id=b.plan_id
          and (a.answers->>'channel'='mcp' or a.answers->>'source'='mcp')) then 'mcp'
        when b.traffic_source='pharmacy' or b.properties->>'journeyChannel' in ('pharmacy','retail')
          or coalesce(b.path,b.route,'') ~ '^/(en|th|zh-CN)/(retail|p)/' then 'retail'
        when b.traffic_source in ('mcp','agentic') or b.properties->>'journeyChannel'='mcp'
          or b.properties->>'channel' in ('mcp','mcp_web')
          or coalesce(b.path,b.route,'') ~ '^/(en|th|zh-CN)/mcp/' then 'mcp'
        when exists (select 1 from public.assessments a where a.plan_id=b.plan_id) then 'web'
        when b.properties->>'journeyChannel'='web'
          or coalesce(b.path,b.route,'') ~ '^/(en|th|zh-CN)(/(nutrition|assessment|basket|order|library|blog)(/|$)|/?$)'
          or b.event_name in ('home_viewed','blog_article_viewed','library_article_viewed') then 'web'
        else 'unknown'
      end as journey_channel,
      case
        when b.event_name='chat_start' then 'assessment_started'
        when b.event_name='page_viewed' and coalesce(b.path,b.route,'') ~ '^/(en|th|zh-CN)/nutrition/healthscore/?$'
          then 'healthscore_page_viewed'
        when b.event_name='page_viewed' and coalesce(b.path,b.route,'') ~ '^/(en|th|zh-CN)/(nutrition|assessment|basket|order|library|blog)(/|$)'
          then 'web_page_viewed'
        else b.event_name
      end as funnel_event_name
    from public.bpm b
    where coalesce(b.user_agent, '') !~* '(bot|crawler|spider|headless|playwright|facebookexternalhit|meta-externalagent)'
      and coalesce(b.emitted_by, '') not in ('dev_campaign_seed', 'payment_skip_mock')
      and nullif(b.properties->>'seedName', '') is null
      and coalesce(b.properties->>'mocked', 'false') <> 'true'
      and coalesce(b.properties->>'paymentSkipped', 'false') <> 'true'
  ) bpm`;
}

export const webEntryEventNames = [
  "home_viewed", "blog_article_viewed", "library_article_viewed", "web_page_viewed",
  "assessment_viewed", "healthscore_page_viewed", "healthscore_viewed",
  "formulation_page_viewed", "retail_product_checkout_viewed", "order_tracking_viewed"
] as const;

export const webJourneyEventNames = [...webEntryEventNames,
      "assessment_started", "assessment_submitted", "assessment_captured", "assessment_recaptured",
      "chat_channel_clicked", "formulation_ready", "free_email_requested", "free_email_sent", "product_clicked", "plan_selected",
      "retail_customer_order_created", "retail_delivery_details_confirmed", "retail_order_awaiting_stock", "retail_order_cancelled",
      "retail_order_created", "retail_order_delivered", "retail_order_returned", "retail_order_shipped", "retail_product_checkout_opened",
      "retail_product_checkout_requested", "retail_product_checkout_session_created", "retail_product_payment_succeeded"] as const;
