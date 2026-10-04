import { getSql } from "@/lib/db";
import { toPublicFunnelEventType, attributionOf } from "@/lib/agentic/funnel/events";

export const mcpReportStages = ["connected", "plan_ready", "confirmed", "checkout_created", "paid", "dispatched", "delivered"] as const;
type Stage = (typeof mcpReportStages)[number];
export type McpFunnelRow = { attribution: string; locale: string; transitions: Partial<Record<Stage, { numerator: number; denominator: number }>> } & Record<Stage, number>;
export type McpFunnelReport = { available: boolean; rows: McpFunnelRow[] };

export function summarizeMcpFunnel(events: readonly { correlation_id: string; event_type: string; attribution: string; payload: unknown; created_at?: Date | string }[]): McpFunnelRow[] {
  const groups = new Map<string, { row: McpFunnelRow; seen: Map<Stage, Set<string>>; times: Map<Stage, Map<string, number>> }>();
  for (const event of events) {
    const stage = toPublicFunnelEventType(event.event_type);
    // info is cached and is not evidence of a visitor, installation or plan.
    if (!stage || !mcpReportStages.includes(stage as Stage)) continue;
    let payload = event.payload;
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = null; } }
    const rawLocale = payload && typeof payload === "object" && "locale" in payload ? payload.locale : null;
    const locale = typeof rawLocale === "string" && ["en", "th", "zh-CN"].includes(rawLocale) ? rawLocale : "unknown";
    const attribution = attributionOf(event.attribution), key = `${attribution}:${locale}`;
    let group = groups.get(key);
    if (!group) {
      group = { row: { attribution, locale, transitions: {}, connected: 0, plan_ready: 0, confirmed: 0, checkout_created: 0, paid: 0, dispatched: 0, delivered: 0 }, seen: new Map(), times: new Map() };
      groups.set(key, group);
    }
    const seen = group.seen.get(stage as Stage) ?? new Set<string>();
    seen.add(event.correlation_id); group.seen.set(stage as Stage, seen); group.row[stage as Stage] = seen.size;
    const times = group.times.get(stage as Stage) ?? new Map<string, number>();
    const at = event.created_at ? new Date(event.created_at).getTime() : NaN;
    if (Number.isFinite(at)) times.set(event.correlation_id, Math.min(times.get(event.correlation_id) ?? Infinity, at));
    group.times.set(stage as Stage, times);
  }
  for (const group of groups.values()) for (let i=1; i<mcpReportStages.length; i++) {
    const from=group.times.get(mcpReportStages[i-1]), to=group.times.get(mcpReportStages[i]);
    group.row.transitions[mcpReportStages[i]] = { denominator: from?.size ?? 0,
      numerator: from ? [...from].filter(([subject,at]) => (to?.get(subject) ?? -Infinity) >= at).length : 0 };
  }
  return [...groups.values()].map(group => group.row).sort((a, b) => a.attribution.localeCompare(b.attribution) || a.locale.localeCompare(b.locale));
}

/** MCP has its own durable ledger. Website campaign filters have no equivalent here. */
export async function getAdminMcpFunnel(start: Date | null): Promise<McpFunnelReport> {
  const sql = getSql();
  if (!sql) return { available: false, rows: [] };
  try {
    const rows = await sql<Array<{ correlation_id: string; event_type: string; attribution: string; payload: unknown; created_at: Date }>>`
      select correlation_id,event_type,attribution,payload,created_at from public.agentic_funnel_events
      where (${start}::timestamptz is null or created_at >= ${start})
        and event_type in ('connected','plan_created','plan_ready','confirmed','execute_created','checkout_created','checkout_opened','paid','payment_succeeded','dispatched','fulfilment_dispatched','delivered','order_delivered')`;
    return { available: true, rows: summarizeMcpFunnel(rows) };
  } catch {
    return { available: false, rows: [] };
  }
}
