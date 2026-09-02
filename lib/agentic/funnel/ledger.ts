import {
  attributionOf,
  isFunnelEventType,
  rejectProhibitedFunnelPayload,
  type FunnelAttribution,
  type FunnelEventType
} from "@/lib/agentic/funnel/events";

export type FunnelEvent = Readonly<{
  attribution: FunnelAttribution;
  correlationId: string;
  createdAt: string;
  eventId: string;
  eventType: FunnelEventType;
  payload: Readonly<Record<string, never>>;
  sequence: number;
}>;

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

  if (!isFunnelEventType(input.eventType)) {
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
    eventType: input.eventType,
    payload: {},
    sequence: list.length + 1
  };
  list.push(event);
  ledgers.set(input.correlationId, list);
  seenEventIds.add(input.eventId);
  return { accepted: true as const, event };
}

export function listFunnelEvents(correlationId: string) {
  return [...(ledgers.get(correlationId) ?? [])];
}

export function funnelAttribution(correlationId: string): FunnelAttribution {
  return attributionByCorrelation.get(correlationId) ?? "unattributed";
}
