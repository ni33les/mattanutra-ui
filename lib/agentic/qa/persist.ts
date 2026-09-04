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
const queryCountsByNamespace = new Map<string, Record<string, number>>();
const durableQueryCounts = new Map<string, Record<string, number>>();

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
  queryCountsByNamespace.clear();
  durableQueryCounts.clear();
  persistCommitGate = null;
  queryBudgetCommitGate = null;
  queryBudgetPersistEntered = null;
}

function cloneNamespace(record: MemoryNamespace): MemoryNamespace {
  return { ...record, queryCounts: { ...record.queryCounts } };
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
    memoryNamespaces.set(namespace, { ...current, now });
  }
  const durable = durableNamespaces.get(namespace);
  if (durable) {
    rememberDurable({ ...durable, now });
  }

  const db = sql();
  if (!db) {
    return;
  }

  try {
    await db`
      update public.agentic_qa_namespaces
      set now_clock = ${now}
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
      attribution: input.attribution
    });
  }
  const durable = durableNamespaces.get(namespace);
  if (durable) {
    rememberDurable({
      ...durable,
      acquisitionMinor: input.acquisitionMinor,
      attribution: input.attribution
    });
  }

  const db = sql();
  if (!db) {
    return;
  }

  try {
    await db`
      update public.agentic_qa_namespaces
      set
        acquisition_minor = ${input.acquisitionMinor},
        attribution = ${input.attribution}
      where namespace = ${namespace}
    `;
  } catch {
    /* Local channel still updated in memory. */
  }
}

function persistQueryBudgetNow(namespace: string, counts: Record<string, number>) {
  queryCountsByNamespace.set(namespace, { ...counts });
  durableQueryCounts.set(namespace, { ...counts });
  const current = memoryNamespaces.get(namespace);
  if (current) {
    memoryNamespaces.set(namespace, { ...current, queryCounts: { ...counts } });
  }
  const durable = durableNamespaces.get(namespace);
  if (durable) {
    rememberDurable({ ...durable, queryCounts: { ...counts } });
  }
}

export function persistQueryBudget(namespace: string, counts: Record<string, number>) {
  queryBudgetPersistEntered?.();
  if (queryBudgetCommitGate) {
    const deferred = { ...counts };
    void queryBudgetCommitGate.then(() => persistQueryBudgetNow(namespace, deferred));
    return;
  }
  persistQueryBudgetNow(namespace, counts);
}

export function persistedQueryCounts(namespace: string) {
  return {
    ...(queryCountsByNamespace.get(namespace) ?? memoryNamespaces.get(namespace)?.queryCounts ?? {})
  };
}

export function hasPersistedQueryCounts(namespace: string) {
  return queryCountsByNamespace.has(namespace);
}

export async function deletePersistedQaNamespace(namespace: string) {
  memoryNamespaces.delete(namespace);
  durableNamespaces.delete(namespace);
  queryCountsByNamespace.delete(namespace);
  durableQueryCounts.delete(namespace);

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

export async function loadQaNamespace(namespace: string): Promise<PersistedQaNamespace | null> {
  const local = memoryNamespaces.get(namespace);
  if (local) {
    if (local.expiresAtMs <= Date.now()) {
      memoryNamespaces.delete(namespace);
      return null;
    }
    return hydrateRecord(local, memoryCatalogues.get(local.snapshotId) ?? null);
  }

  const db = sql();
  if (!db) {
    return null;
  }

  try {
    const rows = await db<
      {
        acquisition_minor: number;
        attribution: string;
        build_id: string;
        client_key: string | null;
        now_clock: string;
        principal_scope: string;
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
    const record: MemoryNamespace = {
      acquisitionMinor: row.acquisition_minor,
      attribution: row.attribution,
      buildId: row.build_id,
      clientKey: row.client_key ?? "",
      expiresAtMs: Date.now() + NAMESPACE_TTL_MS,
      namespace,
      now: row.now_clock,
      principalScope: row.principal_scope,
      queryCounts: {},
      runId: row.run_id,
      snapshotId: row.snapshot_id
    };
    memoryNamespaces.set(namespace, record);
    if (snapshot) {
      rememberCatalogue(row.snapshot_id, snapshot);
    }
    return hydrateRecord(record, snapshot);
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
