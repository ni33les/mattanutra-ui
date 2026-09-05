import { getSql } from "@/lib/db";
import { freezeCatalogueSnapshot } from "@/lib/agentic/catalogue/freeze";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";

const PUBLISHED_ID = "th";
const NAMESPACE_TTL_MS = 6 * 60 * 60 * 1000;

export type PersistedQaNamespace = Readonly<{
  acquisitionMinor: number;
  attribution: string;
  buildId: string;
  clientKey: string;
  contextVersion: number;
  expiresAtMs: number;
  frozenSnapshot: CatalogueSnapshot | null;
  namespace: string;
  now: string;
  principalScope: string;
  queryCounts: Record<string, number>;
  runId: string;
  snapshotId: string;
}>;

type MemoryNamespace = Omit<PersistedQaNamespace, "frozenSnapshot">;

const memoryCatalogues = new Map<string, CatalogueSnapshot>();
const memoryPublished = new Map<string, string>();
const memoryNamespaces = new Map<string, MemoryNamespace>();
const durableNamespaces = new Map<string, MemoryNamespace>();
const committedNamespaces = new Map<string, MemoryNamespace>();
const queryCountsByNamespace = new Map<string, Record<string, number>>();
const durableQueryCounts = new Map<string, Record<string, number>>();
const committedQueryCounts = new Map<string, Record<string, number>>();

function sql() {
  if (process.env.NODE_TEST_CONTEXT) {
    return null;
  }

  try {
    return getSql();
  } catch {
    return null;
  }
}

function asSnapshot(value: unknown): CatalogueSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as CatalogueSnapshot;
  if (typeof record.catalogueVersion !== "string" || typeof record.availabilityAsOf !== "string") {
    return null;
  }

  if (!Array.isArray(record.products) || !Array.isArray(record.supplements)) {
    return null;
  }

  return freezeCatalogueSnapshot(record);
}

export function resetQaPersistForTests() {
  memoryCatalogues.clear();
  memoryPublished.clear();
  memoryNamespaces.clear();
  durableNamespaces.clear();
  committedNamespaces.clear();
  queryCountsByNamespace.clear();
  durableQueryCounts.clear();
  committedQueryCounts.clear();
  persistCommitGate = null;
  queryBudgetCommitGate = null;
  queryBudgetPersistEntered = null;
}

function cloneNamespace(record: MemoryNamespace): MemoryNamespace {
  return {
    ...record,
    contextVersion: record.contextVersion ?? 1,
    queryCounts: { ...record.queryCounts }
  };
}

export function captureQaPersistLocal() {
  return {
    memoryNamespaces: new Map(
      [...memoryNamespaces.entries()].map(([key, value]) => [key, cloneNamespace(value)])
    ),
    queryCountsByNamespace: new Map(
      [...queryCountsByNamespace.entries()].map(([key, value]) => [key, { ...value }])
    )
  };
}

export function restoreQaPersistLocal(snapshot: ReturnType<typeof captureQaPersistLocal>) {
  memoryNamespaces.clear();
  queryCountsByNamespace.clear();
  for (const [key, value] of snapshot.memoryNamespaces) {
    memoryNamespaces.set(key, cloneNamespace(value));
  }
  for (const [key, value] of snapshot.queryCountsByNamespace) {
    queryCountsByNamespace.set(key, { ...value });
  }
}

export function primeLocalNamespaceFromDurable(namespace: string) {
  const durable = durableNamespaces.get(namespace);
  if (!durable) {
    return;
  }
  memoryNamespaces.set(namespace, cloneNamespace(durable));
  const counts = durableQueryCounts.get(namespace) ?? durable.queryCounts;
  queryCountsByNamespace.set(namespace, { ...counts });
}

function rememberDurable(record: MemoryNamespace) {
  durableNamespaces.set(record.namespace, cloneNamespace(record));
}

function rememberCommitted(record: MemoryNamespace) {
  committedNamespaces.set(record.namespace, cloneNamespace(record));
}

export function captureQaReplicaDurable() {
  return {
    durableNamespaces: new Map(
      [...durableNamespaces.entries()].map(([key, value]) => [key, cloneNamespace(value)])
    ),
    durableQueryCounts: new Map(
      [...durableQueryCounts.entries()].map(([key, value]) => [key, { ...value }])
    )
  };
}

export function restoreQaReplicaDurable(snapshot: ReturnType<typeof captureQaReplicaDurable>) {
  durableNamespaces.clear();
  durableQueryCounts.clear();
  for (const [key, value] of snapshot.durableNamespaces) {
    durableNamespaces.set(key, cloneNamespace(value));
  }
  for (const [key, value] of snapshot.durableQueryCounts) {
    durableQueryCounts.set(key, { ...value });
  }
}

export function emptyQaReplicaDurable() {
  return {
    durableNamespaces: new Map<string, MemoryNamespace>(),
    durableQueryCounts: new Map<string, Record<string, number>>()
  };
}

export function primeReplicaFromCommitted(namespace: string) {
  const committed = committedNamespaces.get(namespace);
  if (!committed) {
    return;
  }
  const next = cloneNamespace(committed);
  durableNamespaces.set(namespace, next);
  memoryNamespaces.set(namespace, cloneNamespace(next));
  const counts = committedQueryCounts.get(namespace) ?? next.queryCounts;
  durableQueryCounts.set(namespace, { ...counts });
  queryCountsByNamespace.set(namespace, { ...counts });
}

export function committedNamespaceOf(namespace: string) {
  const record = committedNamespaces.get(namespace);
  return record ? cloneNamespace(record) : null;
}

export function findCommittedQaNamespaceByRunId(runId: string, clientKey = "") {
  if (!clientKey) {
    return null;
  }
  const matches = [...committedNamespaces.values()].filter(
    (record) => record.runId === runId && record.clientKey === clientKey
  );
  return matches[0] ? cloneNamespace(matches[0]) : null;
}

export function emptyQaPersistLocal() {
  return {
    memoryNamespaces: new Map<string, MemoryNamespace>(),
    queryCountsByNamespace: new Map<string, Record<string, number>>()
  };
}

export function snapshotQaPersistDurable() {
  return {
    durableNamespaces: [...durableNamespaces.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([namespace, record]) => [namespace, cloneNamespace(record)] as const),
    durableQueryCounts: [...durableQueryCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([namespace, counts]) => [namespace, { ...counts }] as const)
  };
}

export function durableQueryCountsOf(namespace: string) {
  return { ...(durableQueryCounts.get(namespace) ?? {}) };
}

let persistCommitGate: Promise<void> | null = null;
let queryBudgetCommitGate: Promise<void> | null = null;
let queryBudgetPersistEntered: (() => void) | null = null;

export function setPersistCommitGateForTests(gate: Promise<void> | null) {
  persistCommitGate = gate;
}

export function setQueryBudgetCommitGateForTests(gate: Promise<void> | null) {
  queryBudgetCommitGate = gate;
}

export function setQueryBudgetPersistEnteredForTests(notify: (() => void) | null) {
  queryBudgetPersistEntered = notify;
}

async function awaitPersistCommitGate() {
  if (persistCommitGate) {
    await persistCommitGate;
  }
}

export function rememberCatalogue(snapshotId: string, snapshot: CatalogueSnapshot) {
  memoryCatalogues.set(snapshotId, freezeCatalogueSnapshot(snapshot));
}

export function firstWriterPublish(snapshotId: string, snapshot: CatalogueSnapshot) {
  rememberCatalogue(snapshotId, snapshot);
  if (!memoryPublished.has(PUBLISHED_ID)) {
    memoryPublished.set(PUBLISHED_ID, snapshotId);
  }
  const winnerId = memoryPublished.get(PUBLISHED_ID)!;
  return memoryCatalogues.get(winnerId) ?? freezeCatalogueSnapshot(snapshot);
}

export function replacePublishedCatalogue(snapshotId: string, snapshot: CatalogueSnapshot) {
  rememberCatalogue(snapshotId, snapshot);
  memoryPublished.set(PUBLISHED_ID, snapshotId);
  return memoryCatalogues.get(snapshotId)!;
}

export function loadPublishedCatalogueSync() {
  const snapshotId = memoryPublished.get(PUBLISHED_ID);
  if (!snapshotId) {
    return null;
  }
  return memoryCatalogues.get(snapshotId) ?? null;
}

export function dropCatalogueBodyForTests(snapshotId: string) {
  memoryCatalogues.delete(snapshotId);
}

export async function persistPublishedCatalogue(
  snapshotId: string,
  snapshot: CatalogueSnapshot,
  mode: "first-writer" | "replace" = "first-writer"
) {
  if (mode === "replace") {
    replacePublishedCatalogue(snapshotId, snapshot);
  } else {
    firstWriterPublish(snapshotId, snapshot);
  }

  const db = sql();
  if (!db) {
    return loadPublishedCatalogueSync();
  }

  try {
    await db`
      insert into public.agentic_qa_catalogues (snapshot_id, catalogue_version, snapshot_json)
      values (
        ${snapshotId},
        ${snapshot.catalogueVersion},
        ${db.json(JSON.parse(JSON.stringify(snapshot)) as never)}
      )
      on conflict (snapshot_id) do nothing
    `;

    if (mode === "replace") {
      await db`
        insert into public.agentic_qa_published (id, snapshot_id)
        values (${PUBLISHED_ID}, ${snapshotId})
        on conflict (id) do update set snapshot_id = excluded.snapshot_id
      `;
    } else {
      await db`
        insert into public.agentic_qa_published (id, snapshot_id)
        values (${PUBLISHED_ID}, ${snapshotId})
        on conflict (id) do nothing
      `;
      const rows = await db<{ snapshot_id: string }[]>`
        select snapshot_id from public.agentic_qa_published where id = ${PUBLISHED_ID} limit 1
      `;
      const winnerId = rows[0]?.snapshot_id;
      if (winnerId && winnerId !== snapshotId) {
        const winner = await loadCatalogueById(winnerId);
        if (winner) {
          memoryPublished.set(PUBLISHED_ID, winnerId);
          rememberCatalogue(winnerId, winner);
          return winner;
        }
      }
    }
  } catch {
    /* Memory remains the local cache; the next request may hydrate from DB. */
  }

  return loadPublishedCatalogueSync();
}

async function loadCatalogueById(snapshotId: string) {
  const cached = memoryCatalogues.get(snapshotId);
  if (cached) {
    return cached;
  }

  const db = sql();
  if (!db) {
    return null;
  }

  try {
    const rows = await db<{ snapshot_json: unknown }[]>`
      select snapshot_json
      from public.agentic_qa_catalogues
      where snapshot_id = ${snapshotId}
      limit 1
    `;
    const snapshot = asSnapshot(rows[0]?.snapshot_json);
    if (snapshot) {
      rememberCatalogue(snapshotId, snapshot);
    }
    return snapshot;
  } catch {
    return null;
  }
}

export async function loadPublishedCatalogue() {
  const local = loadPublishedCatalogueSync();
  if (local) {
    return local;
  }

  const db = sql();
  if (!db) {
    return null;
  }

  try {
    const rows = await db<{ snapshot_id: string; snapshot_json: unknown }[]>`
      select published.snapshot_id, catalogues.snapshot_json
      from public.agentic_qa_published as published
      join public.agentic_qa_catalogues as catalogues
        on catalogues.snapshot_id = published.snapshot_id
      where published.id = ${PUBLISHED_ID}
      limit 1
    `;
    const row = rows[0];
    const snapshot = asSnapshot(row?.snapshot_json);
    if (!row || !snapshot) {
      return null;
    }
    rememberCatalogue(row.snapshot_id, snapshot);
    memoryPublished.set(PUBLISHED_ID, row.snapshot_id);
    return snapshot;
  } catch {
    return null;
  }
}

export async function persistQaNamespace(
  session: Readonly<{
    acquisitionMinor: number;
    attribution: string;
    buildId: string;
    catalogueChecksum: string;
    frozenSnapshot: CatalogueSnapshot | null;
    namespace: string;
    now: string;
    principalScope: string;
  }>,
  runId: string,
  clientKey = ""
) {
  if (session.frozenSnapshot) {
    rememberCatalogue(session.catalogueChecksum, session.frozenSnapshot);
  }

  const record: MemoryNamespace = {
    acquisitionMinor: session.acquisitionMinor,
    attribution: session.attribution,
    buildId: session.buildId,
    clientKey,
    contextVersion: 1,
    expiresAtMs: Date.now() + NAMESPACE_TTL_MS,
    namespace: session.namespace,
    now: session.now,
    principalScope: session.principalScope,
    queryCounts: {},
    runId,
    snapshotId: session.catalogueChecksum
  };
  memoryNamespaces.set(session.namespace, record);
  rememberDurable(record);
  rememberCommitted(record);

  if (session.frozenSnapshot) {
    await persistPublishedCatalogue(session.catalogueChecksum, session.frozenSnapshot, "first-writer");
  }

  const db = sql();
  if (!db) {
    return;
  }

  try {
    await db`
      insert into public.agentic_qa_namespaces (
        namespace, run_id, now_clock, principal_scope, build_id, snapshot_id,
        acquisition_minor, attribution, client_key, expires_at
      )
      values (
        ${record.namespace},
        ${record.runId},
        ${record.now},
        ${record.principalScope},
        ${record.buildId},
        ${record.snapshotId},
        ${record.acquisitionMinor},
        ${record.attribution},
        ${record.clientKey},
        now() + interval '6 hours'
      )
      on conflict (namespace) do update set
        now_clock = excluded.now_clock,
        acquisition_minor = excluded.acquisition_minor,
        attribution = excluded.attribution,
        client_key = excluded.client_key
    `;
  } catch {
    /* In-process memory still holds the namespace for this instance. */
  }
}

export async function persistQaNamespaceClock(namespace: string, now: string) {
  await awaitPersistCommitGate();
  const current = memoryNamespaces.get(namespace);
  if (current) {
    memoryNamespaces.set(namespace, {
      ...current,
      contextVersion: (current.contextVersion ?? 1) + 1,
      now
    });
  }
  const durable = durableNamespaces.get(namespace);
  if (durable) {
    rememberDurable({
      ...durable,
      contextVersion: (durable.contextVersion ?? 1) + 1,
      now
    });
  }
  const committed = committedNamespaces.get(namespace);
  if (committed) {
    rememberCommitted({
      ...committed,
      contextVersion: (committed.contextVersion ?? 1) + 1,
      now
    });
  }

  const db = sql();
  if (!db) {
    return;
  }

  try {
    const version = committedNamespaces.get(namespace)?.contextVersion ?? 1;
    await db`
      update public.agentic_qa_namespaces
      set now_clock = ${now}, context_version = ${version}
      where namespace = ${namespace}
    `;
  } catch {
    /* Local clock still updated in memory. */
  }
}

export async function persistQaNamespaceChannel(
  namespace: string,
  input: Readonly<{ acquisitionMinor: number; attribution: string }>
) {
  await awaitPersistCommitGate();
  const current = memoryNamespaces.get(namespace);
  if (current) {
    memoryNamespaces.set(namespace, {
      ...current,
      acquisitionMinor: input.acquisitionMinor,
      attribution: input.attribution,
      contextVersion: (current.contextVersion ?? 1) + 1
    });
  }
  const durable = durableNamespaces.get(namespace);
  if (durable) {
    rememberDurable({
      ...durable,
      acquisitionMinor: input.acquisitionMinor,
      attribution: input.attribution,
      contextVersion: (durable.contextVersion ?? 1) + 1
    });
  }
  const committed = committedNamespaces.get(namespace);
  if (committed) {
    rememberCommitted({
      ...committed,
      acquisitionMinor: input.acquisitionMinor,
      attribution: input.attribution,
      contextVersion: (committed.contextVersion ?? 1) + 1
    });
  }

  const db = sql();
  if (!db) {
    return;
  }

  try {
    const version = committedNamespaces.get(namespace)?.contextVersion ?? 1;
    await db`
      update public.agentic_qa_namespaces
      set
        acquisition_minor = ${input.acquisitionMinor},
        attribution = ${input.attribution},
        context_version = ${version}
      where namespace = ${namespace}
    `;
  } catch {
    /* Local channel still updated in memory. */
  }
}

function persistQueryBudgetNow(namespace: string, counts: Record<string, number>) {
  queryCountsByNamespace.set(namespace, { ...counts });
  durableQueryCounts.set(namespace, { ...counts });
  committedQueryCounts.set(namespace, { ...counts });
  const current = memoryNamespaces.get(namespace);
  if (current) {
    memoryNamespaces.set(namespace, { ...current, queryCounts: { ...counts } });
  }
  const durable = durableNamespaces.get(namespace);
  if (durable) {
    rememberDurable({ ...durable, queryCounts: { ...counts } });
  }
  const committed = committedNamespaces.get(namespace);
  if (committed) {
    rememberCommitted({ ...committed, queryCounts: { ...counts } });
  }
}

export async function persistQueryBudget(namespace: string, counts: Record<string, number>) {
  queryBudgetPersistEntered?.();
  if (queryBudgetCommitGate) {
    await queryBudgetCommitGate;
  }
  persistQueryBudgetNow(namespace, counts);
  const db = sql();
  if (!db) {
    return;
  }
  try {
    await db`
      update public.agentic_qa_namespaces
      set query_counts = ${JSON.stringify(counts)}::jsonb
      where namespace = ${namespace}
    `;
  } catch {
    /* Committed in-process counts remain authoritative for this instance. */
  }
}

export function persistedQueryCounts(namespace: string) {
  return {
    ...(queryCountsByNamespace.get(namespace) ?? {}),
    ...(memoryNamespaces.get(namespace)?.queryCounts ?? {}),
    ...(durableQueryCounts.get(namespace) ?? {}),
    ...(committedQueryCounts.get(namespace) ?? {})
  };
}

export function hasPersistedQueryCounts(namespace: string) {
  return (
    queryCountsByNamespace.has(namespace) ||
    durableQueryCounts.has(namespace) ||
    committedQueryCounts.has(namespace) ||
    Object.keys(memoryNamespaces.get(namespace)?.queryCounts ?? {}).length > 0 ||
    Object.keys(committedNamespaces.get(namespace)?.queryCounts ?? {}).length > 0
  );
}

export async function deletePersistedQaNamespace(namespace: string) {
  memoryNamespaces.delete(namespace);
  durableNamespaces.delete(namespace);
  committedNamespaces.delete(namespace);
  queryCountsByNamespace.delete(namespace);
  durableQueryCounts.delete(namespace);
  committedQueryCounts.delete(namespace);

  const db = sql();
  if (!db) {
    return;
  }

  try {
    await db`
      delete from public.agentic_qa_namespaces where namespace = ${namespace}
    `;
  } catch {
    /* Local map already dropped the namespace. */
  }
}

function hydrateRecord(
  record: MemoryNamespace,
  frozenSnapshot: CatalogueSnapshot | null
): PersistedQaNamespace {
  return { ...record, frozenSnapshot };
}

function activateNamespace(record: MemoryNamespace): PersistedQaNamespace | null {
  if (record.expiresAtMs <= Date.now()) {
    memoryNamespaces.delete(record.namespace);
    durableNamespaces.delete(record.namespace);
    queryCountsByNamespace.delete(record.namespace);
    durableQueryCounts.delete(record.namespace);
    return null;
  }
  const counts = {
    ...(durableQueryCounts.get(record.namespace) ?? {}),
    ...(record.queryCounts ?? {}),
    ...(committedQueryCounts.get(record.namespace) ?? {})
  };
  const next = cloneNamespace({ ...record, queryCounts: counts });
  memoryNamespaces.set(next.namespace, next);
  rememberDurable(next);
  if (Object.keys(counts).length > 0) {
    queryCountsByNamespace.set(next.namespace, { ...counts });
  }
  return hydrateRecord(next, memoryCatalogues.get(next.snapshotId) ?? null);
}

function loadCommittedNamespace(namespace: string): PersistedQaNamespace | null {
  const committed = committedNamespaces.get(namespace);
  if (committed) {
    return activateNamespace(committed);
  }
  const durable = durableNamespaces.get(namespace);
  if (durable) {
    return activateNamespace(durable);
  }
  const local = memoryNamespaces.get(namespace);
  if (local) {
    return activateNamespace(local);
  }
  return null;
}

export async function loadQaNamespace(namespace: string): Promise<PersistedQaNamespace | null> {
  const db = sql();
  if (!db) {
    return loadCommittedNamespace(namespace);
  }

  try {
    const rows = await db<
      {
        acquisition_minor: number;
        attribution: string;
        build_id: string;
        client_key: string | null;
        context_version: number | null;
        now_clock: string;
        principal_scope: string;
        query_counts: unknown;
        run_id: string;
        snapshot_id: string;
        snapshot_json: unknown;
      }[]
    >`
      select
        namespaces.run_id,
        namespaces.now_clock,
        namespaces.principal_scope,
        namespaces.build_id,
        namespaces.snapshot_id,
        namespaces.acquisition_minor,
        namespaces.attribution,
        namespaces.client_key,
        namespaces.context_version,
        namespaces.query_counts,
        catalogues.snapshot_json
      from public.agentic_qa_namespaces as namespaces
      left join public.agentic_qa_catalogues as catalogues
        on catalogues.snapshot_id = namespaces.snapshot_id
      where namespaces.namespace = ${namespace}
        and namespaces.expires_at > now()
      limit 1
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }

    const snapshot = asSnapshot(row.snapshot_json);
    const queryCounts =
      row.query_counts && typeof row.query_counts === "object" && !Array.isArray(row.query_counts)
        ? Object.fromEntries(
            Object.entries(row.query_counts as Record<string, unknown>).map(([key, value]) => [
              key,
              Number(value) || 0
            ])
          )
        : {};
    const record: MemoryNamespace = {
      acquisitionMinor: row.acquisition_minor,
      attribution: row.attribution,
      buildId: row.build_id,
      clientKey: row.client_key ?? "",
      contextVersion: Number(row.context_version ?? 1) || 1,
      expiresAtMs: Date.now() + NAMESPACE_TTL_MS,
      namespace,
      now: row.now_clock,
      principalScope: row.principal_scope,
      queryCounts,
      runId: row.run_id,
      snapshotId: row.snapshot_id
    };
    memoryNamespaces.set(namespace, record);
    rememberDurable(record);
    rememberCommitted(record);
    if (snapshot) {
      rememberCatalogue(row.snapshot_id, snapshot);
    }
    return activateNamespace(record);
  } catch {
    return null;
  }
}

export async function listQaNamespacesForClient(clientKey: string) {
  if (!clientKey) {
    return [] as PersistedQaNamespace[];
  }

  const now = Date.now();
  const local = [...memoryNamespaces.values()]
    .filter((record) => record.clientKey === clientKey && record.expiresAtMs > now)
    .map((record) => hydrateRecord(record, memoryCatalogues.get(record.snapshotId) ?? null));
  if (local.length > 0 || process.env.NODE_TEST_CONTEXT) {
    return local;
  }

  const db = sql();
  if (!db) {
    return local;
  }

  try {
    const rows = await db<{ namespace: string }[]>`
      select namespace
      from public.agentic_qa_namespaces
      where client_key = ${clientKey}
        and expires_at > now()
    `;
    const loaded: PersistedQaNamespace[] = [];
    for (const row of rows) {
      const item = await loadQaNamespace(row.namespace);
      if (item) {
        loaded.push(item);
      }
    }
    return loaded;
  } catch {
    return local;
  }
}

export async function hasActiveQaPackClient(clientKey: string) {
  if (!clientKey) {
    return false;
  }

  const now = Date.now();
  for (const record of memoryNamespaces.values()) {
    if (record.clientKey === clientKey && record.expiresAtMs > now) {
      return true;
    }
  }

  const db = sql();
  if (!db) {
    return false;
  }

  try {
    const rows = await db<{ namespace: string }[]>`
      select namespace
      from public.agentic_qa_namespaces
      where client_key = ${clientKey}
        and expires_at > now()
      limit 1
    `;
    return Boolean(rows[0]?.namespace);
  } catch {
    return false;
  }
}
