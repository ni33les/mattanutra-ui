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
const durableLedgers = new Map<string, FunnelEvent[]>();
const committedFunnelRows = new Map<string, FunnelEvent[]>();
const funnelAppendTail = new Map<string, Promise<unknown>>();
let funnelAppendBarrier: Promise<void> | null = null;

function enqueueFunnelAppend<T>(correlationId: string, work: () => Promise<T>): Promise<T> {
  const previous = funnelAppendTail.get(correlationId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  funnelAppendTail.set(correlationId, next);
  return next;
}

const globalFunnel = globalThis as typeof globalThis & {
  mattanutraSharedFunnel?: {
    attribution: Map<string, FunnelAttribution>;
    ledgers: Map<string, FunnelEvent[]>;
    seen: Set<string>;
  };
};

function sharedFunnel() {
  globalFunnel.mattanutraSharedFunnel ??= {
    attribution: new Map(),
    ledgers: new Map(),
    seen: new Set()
  };
  return globalFunnel.mattanutraSharedFunnel;
}

function rememberShared(event: FunnelEvent) {
  const shared = sharedFunnel();
  const list = shared.ledgers.get(event.correlationId) ?? [];
  if (list.some((item) => item.eventId === event.eventId)) {
    return;
  }
  shared.ledgers.set(event.correlationId, [...list, event]);
  shared.seen.add(event.eventId);
  if (!shared.attribution.has(event.correlationId)) {
    shared.attribution.set(event.correlationId, event.attribution);
  }
}

function hydrateFromShared(correlationId: string) {
  if ((ledgers.get(correlationId)?.length ?? 0) > 0) {
    return;
  }
  const shared = sharedFunnel().ledgers.get(correlationId);
  if (!shared?.length) {
    return;
  }
  ledgers.set(correlationId, [...shared]);
  for (const event of shared) {
    seenEventIds.add(event.eventId);
  }
  const attribution = sharedFunnel().attribution.get(correlationId);
  if (attribution) {
    attributionByCorrelation.set(correlationId, attribution);
  }
}

export function captureDurableFunnelState() {
  return new Map(
    [...durableLedgers.entries()].map(([key, list]) => [key, [...list]])
  );
}

export function restoreDurableFunnelState(snapshot: Map<string, FunnelEvent[]>) {
  durableLedgers.clear();
  for (const [key, list] of snapshot) {
    durableLedgers.set(key, [...list]);
  }
}

export function emptyDurableFunnelState() {
  return new Map<string, FunnelEvent[]>();
}

export function snapshotCommittedFunnelRows() {
  return [...committedFunnelRows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([correlationId, list]) => [correlationId, list.map((event) => ({ ...event }))] as const);
}

export function listCommittedFunnelEvents(correlationId: string) {
  return [...(committedFunnelRows.get(correlationId) ?? [])];
}

export function setFunnelAppendBarrierForTests(gate: Promise<void> | null) {
  funnelAppendBarrier = gate;
}

export function flushFunnelProcessCache() {
  ledgers.clear();
  seenEventIds.clear();
  attributionByCorrelation.clear();
}

export function captureFunnelProcessState() {
  const shared = sharedFunnel();
  return {
    attribution: new Map(attributionByCorrelation),
    ledgers: new Map([...ledgers.entries()].map(([key, list]) => [key, [...list]])),
    seen: new Set(seenEventIds),
    sharedAttribution: new Map(shared.attribution),
    sharedLedgers: new Map([...shared.ledgers.entries()].map(([key, list]) => [key, [...list]])),
    sharedSeen: new Set(shared.seen)
  };
}

export function restoreFunnelProcessState(
  snapshot: ReturnType<typeof captureFunnelProcessState>
) {
  ledgers.clear();
  seenEventIds.clear();
  attributionByCorrelation.clear();
  for (const [key, list] of snapshot.ledgers) {
    ledgers.set(key, [...list]);
  }
  for (const id of snapshot.seen) {
    seenEventIds.add(id);
  }
  for (const [key, value] of snapshot.attribution) {
    attributionByCorrelation.set(key, value);
  }
  const shared = sharedFunnel();
  shared.ledgers.clear();
  shared.seen.clear();
  shared.attribution.clear();
  for (const [key, list] of snapshot.sharedLedgers) {
    shared.ledgers.set(key, [...list]);
  }
  for (const id of snapshot.sharedSeen) {
    shared.seen.add(id);
  }
  for (const [key, value] of snapshot.sharedAttribution) {
    shared.attribution.set(key, value);
  }
}

function mergeFunnelRows(correlationId: string, incoming: readonly FunnelEvent[] | undefined) {
  if (!incoming?.length) {
    return;
  }
  const existing = ledgers.get(correlationId) ?? [];
  const seen = new Set(existing.map((item) => item.eventId));
  const merged = [...existing];
  for (const event of incoming) {
    if (seen.has(event.eventId)) {
      continue;
    }
    merged.push(event);
    seenEventIds.add(event.eventId);
    rememberShared(event);
  }
  merged.sort((left, right) =>
    left.sequence === right.sequence
      ? left.createdAt.localeCompare(right.createdAt)
      : left.sequence - right.sequence
  );
  if (merged.length > 0) {
    ledgers.set(correlationId, merged);
    if (!attributionByCorrelation.has(correlationId) && merged[0]) {
      attributionByCorrelation.set(correlationId, merged[0].attribution);
    }
  }
}

function hydrateFromDurable(correlationId: string) {
  mergeFunnelRows(correlationId, durableLedgers.get(correlationId));
}

function hydrateFromCommitted(correlationId: string) {
  mergeFunnelRows(correlationId, committedFunnelRows.get(correlationId));
}

function rememberCommitted(event: FunnelEvent) {
  const list = committedFunnelRows.get(event.correlationId) ?? [];
  if (list.some((item) => item.eventId === event.eventId)) {
    return;
  }
  committedFunnelRows.set(event.correlationId, [...list, event]);
}

export function resetFunnelLedger(correlationId?: string) {
  if (correlationId) {
    const existing = ledgers.get(correlationId) ?? [];
    for (const event of existing) {
      seenEventIds.delete(event.eventId);
    }
    ledgers.delete(correlationId);
    attributionByCorrelation.delete(correlationId);
    const shared = sharedFunnel();
    const sharedExisting = shared.ledgers.get(correlationId) ?? [];
    for (const event of sharedExisting) {
      shared.seen.delete(event.eventId);
    }
    shared.ledgers.delete(correlationId);
    shared.attribution.delete(correlationId);
    return;
  }

  ledgers.clear();
  seenEventIds.clear();
  attributionByCorrelation.clear();
  sharedFunnel().ledgers.clear();
  sharedFunnel().seen.clear();
  sharedFunnel().attribution.clear();
  durableLedgers.clear();
  committedFunnelRows.clear();
  funnelAppendTail.clear();
  funnelAppendBarrier = null;
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

  hydrateFromCommitted(input.correlationId);
  hydrateFromDurable(input.correlationId);
  hydrateFromShared(input.correlationId);
  if (seenEventIds.has(input.eventId)) {
    return { accepted: false as const, reasonCode: "duplicate" as const, field: "eventId" };
  }

  const list = ledgers.get(input.correlationId) ?? [];
  const locked = attributionByCorrelation.get(input.correlationId);
  const nextAttribution = locked ?? attributionOf(input.attribution);
  if (!locked) {
    attributionByCorrelation.set(input.correlationId, nextAttribution);
  }

  const committed = committedFunnelRows.get(input.correlationId) ?? [];
  const nextSequence =
    Math.max(
      list.reduce((max, item) => Math.max(max, item.sequence), 0),
      committed.reduce((max, item) => Math.max(max, item.sequence), 0)
    ) + 1;
  const event: FunnelEvent = {
    attribution: nextAttribution,
    correlationId: input.correlationId,
    createdAt: input.createdAt,
    eventId: input.eventId,
    eventType,
    payload: publicFunnelPayload(input.correlationId, input.payload),
    sequence: nextSequence
  };
  list.push(event);
  ledgers.set(input.correlationId, list);
  seenEventIds.add(input.eventId);
  rememberShared(event);
  rememberCommitted(event);
  const persisted = persistFunnelEvent(event);
  void persisted;
  return { accepted: true as const, event, persisted };
}

async function withPostgresFunnelLock<T>(correlationId: string, work: () => Promise<T>): Promise<T> {
  if (process.env.NODE_TEST_CONTEXT) {
    return work();
  }
  try {
    const { getSql } = await import("@/lib/db");
    const sql = getSql();
    if (!sql) {
      return work();
    }
    await sql`select pg_advisory_lock(hashtext(${correlationId}))`;
    try {
      return await work();
    } finally {
      await sql`select pg_advisory_unlock(hashtext(${correlationId}))`;
    }
  } catch {
    return work();
  }
}

export async function commitFunnelEvent(input: Readonly<{
  attribution?: unknown;
  correlationId: string;
  createdAt: string;
  eventId: string;
  eventType: string;
  payload?: unknown;
}>) {
  if (funnelAppendBarrier) {
    await funnelAppendBarrier;
  }
  return enqueueFunnelAppend(input.correlationId, () =>
    withPostgresFunnelLock(input.correlationId, async () => {
      await loadPersistedFunnelEvents(input.correlationId);
      const recorded = recordFunnelEvent(input);
      if (recorded.accepted) {
        await recorded.persisted;
      }
      return recorded;
    })
  );
}

export function listFunnelEvents(correlationId: string) {
  hydrateFromShared(correlationId);
  return [...(ledgers.get(correlationId) ?? [])];
}

async function persistFunnelEvent(event: FunnelEvent) {
  const durable = durableLedgers.get(event.correlationId) ?? [];
  if (!durable.some((item) => item.eventId === event.eventId)) {
    durableLedgers.set(event.correlationId, [...durable, event]);
  }
  rememberCommitted(event);
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
  hydrateFromShared(correlationId);
  hydrateFromDurable(correlationId);
  hydrateFromCommitted(correlationId);

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
      order by sequence asc, created_at asc
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
      rememberShared(event);
      rememberCommitted(event);
    }
    if (restored.length > 0) {
      const existing = ledgers.get(correlationId) ?? [];
      const seen = new Set(existing.map((item) => item.eventId));
      const merged = [...existing];
      for (const event of restored) {
        if (seen.has(event.eventId)) {
          continue;
        }
        merged.push(event);
        seen.add(event.eventId);
      }
      merged.sort((left, right) =>
        left.sequence === right.sequence
          ? left.createdAt.localeCompare(right.createdAt)
          : left.sequence - right.sequence
      );
      ledgers.set(correlationId, merged);
      if (!attributionByCorrelation.has(correlationId) && merged[0]) {
        attributionByCorrelation.set(correlationId, merged[0].attribution);
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
