import {
  attributionOf,
  rejectProhibitedFunnelPayload,
  toPublicFunnelEventType,
  type FunnelAttribution,
  type FunnelEventType
} from "@/lib/agentic/funnel/events";

export type FunnelEventPayload = Readonly<{
  anonymousCorrelation: string;
  locale: string;
}>;

export type FunnelEvent = Readonly<{
  attribution: FunnelAttribution;
  correlationId: string;
  createdAt: string;
  eventId: string;
  eventType: FunnelEventType;
  payload: FunnelEventPayload;
  sequence: number;
}>;

function publicFunnelPayload(
  correlationId: string,
  payload: unknown
): FunnelEventPayload {
  const raw =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const locale = typeof raw.locale === "string" && raw.locale.trim() ? raw.locale.trim() : "en";
  const anonymous =
    typeof raw.anonymousCorrelation === "string" && raw.anonymousCorrelation.trim()
      ? raw.anonymousCorrelation.trim()
      : correlationId;
  return {
    anonymousCorrelation: anonymous,
    locale
  };
}

const ledgers = new Map<string, FunnelEvent[]>();
const seenEventIds = new Set<string>();
const attributionByCorrelation = new Map<string, FunnelAttribution>();

export function resetFunnelLedger(correlationId?: string) {
  if (correlationId) {
    const existing = ledgers.get(correlationId) ?? [];
    for (const event of existing) {
      seenEventIds.delete(event.eventId);
    }
    ledgers.delete(correlationId);
    attributionByCorrelation.delete(correlationId);
    return;
  }

  ledgers.clear();
  seenEventIds.clear();
  attributionByCorrelation.clear();
}

export function recordFunnelEvent(input: Readonly<{
  attribution?: unknown;
  correlationId: string;
  createdAt: string;
  eventId: string;
  eventType: string;
  payload?: unknown;
}>) {
  const prohibited = rejectProhibitedFunnelPayload(input.payload);
  if (prohibited) {
    return { accepted: false as const, reasonCode: "unsafe_content" as const, field: prohibited };
  }

  const eventType = toPublicFunnelEventType(input.eventType);
  if (!eventType) {
    return { accepted: false as const, reasonCode: "invalid_request" as const, field: "eventType" };
  }

  if (seenEventIds.has(input.eventId)) {
    return { accepted: false as const, reasonCode: "duplicate" as const, field: "eventId" };
  }

  const list = ledgers.get(input.correlationId) ?? [];
  const locked = attributionByCorrelation.get(input.correlationId);
  const nextAttribution = locked ?? attributionOf(input.attribution);
  if (!locked) {
    attributionByCorrelation.set(input.correlationId, nextAttribution);
  }

  const event: FunnelEvent = {
    attribution: nextAttribution,
    correlationId: input.correlationId,
    createdAt: input.createdAt,
    eventId: input.eventId,
    eventType,
    payload: publicFunnelPayload(input.correlationId, input.payload),
    sequence: list.length + 1
  };
  list.push(event);
  ledgers.set(input.correlationId, list);
  seenEventIds.add(input.eventId);
  void persistFunnelEvent(event);
  return { accepted: true as const, event };
}

export function listFunnelEvents(correlationId: string) {
  return [...(ledgers.get(correlationId) ?? [])];
}

async function persistFunnelEvent(event: FunnelEvent) {
  if (process.env.NODE_TEST_CONTEXT) {
    return;
  }

  try {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    if (!sql) {
      return;
    }
    await sql`
      insert into public.agentic_funnel_events (
        event_id, correlation_id, event_type, attribution, payload, sequence, created_at
      ) values (
        ${event.eventId},
        ${event.correlationId},
        ${event.eventType},
        ${event.attribution},
        ${JSON.stringify(event.payload)}::jsonb,
        ${event.sequence},
        ${event.createdAt}::timestamptz
      )
      on conflict (event_id) do nothing
    `;
  } catch {
    // Persistence is best-effort; the in-memory ledger remains authoritative in-process.
  }
}

export async function loadPersistedFunnelEvents(correlationId: string) {
  if (ledgers.has(correlationId) && (ledgers.get(correlationId)?.length ?? 0) > 0) {
    return listFunnelEvents(correlationId);
  }

  if (process.env.NODE_TEST_CONTEXT) {
    return listFunnelEvents(correlationId);
  }

  try {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    if (!sql) {
      return listFunnelEvents(correlationId);
    }
    const rows = await sql`
      select event_id, correlation_id, event_type, attribution, payload, sequence, created_at
      from public.agentic_funnel_events
      where correlation_id = ${correlationId}
      order by sequence asc
    `;
    const restored: FunnelEvent[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const eventId = String(row.event_id ?? "");
      if (!eventId || seenEventIds.has(eventId)) {
        continue;
      }
      const event: FunnelEvent = {
        attribution: attributionOf(row.attribution),
        correlationId: String(row.correlation_id ?? correlationId),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at ?? ""),
        eventId,
        eventType: (toPublicFunnelEventType(String(row.event_type ?? "")) ??
          String(row.event_type ?? "")) as FunnelEvent["eventType"],
        payload: publicFunnelPayload(String(row.correlation_id ?? correlationId), row.payload),
        sequence: Number(row.sequence ?? restored.length + 1)
      };
      if (!toPublicFunnelEventType(event.eventType)) {
        continue;
      }
      restored.push(event);
      seenEventIds.add(eventId);
    }
    if (restored.length > 0) {
      ledgers.set(correlationId, restored);
      if (!attributionByCorrelation.has(correlationId) && restored[0]) {
        attributionByCorrelation.set(correlationId, restored[0].attribution);
      }
    }
  } catch {
    // Fall back to whatever is already in memory.
  }

  return listFunnelEvents(correlationId);
}

export function funnelAttribution(correlationId: string): FunnelAttribution {
  return attributionByCorrelation.get(correlationId) ?? "unattributed";
}
