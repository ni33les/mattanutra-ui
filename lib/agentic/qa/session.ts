import { resetQueryBudget, setQueryNamespace } from "@/lib/agentic/plan/query-budget";
import { resetFunnelLedger } from "@/lib/agentic/funnel/ledger";
import { attributionOf, type FunnelAttribution } from "@/lib/agentic/funnel/events";
import type { AgenticStore } from "@/lib/agentic/store/types";
import type { AgenticRuntime } from "@/lib/agentic/runtime";
import { authorizeQaRequest } from "@/lib/agentic/qa/authorize";
import type { AgenticConfig, AgenticEnvironment } from "@/lib/agentic/config";
import { AGENTIC_SCHEMA_CHECKSUM } from "@/lib/agentic/info";
import { catalogueSnapshotId, freezeCatalogueSnapshot } from "@/lib/agentic/catalogue/freeze";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import {
  ensureCatalogueSnapshot,
  publishQaCatalogue,
  runWithCatalogueSnapshot
} from "@/lib/agentic/catalogue/snapshot";
import { getRequestClientIp } from "@/lib/request-client-ip";
import { hashCapability } from "@/lib/agentic/capabilities";
import {
  deletePersistedQaNamespace,
  dropCatalogueBodyForTests,
  hasActiveQaPackClient,
  listQaNamespacesForClient,
  loadPublishedCatalogue,
  loadQaNamespace,
  persistQaNamespace,
  persistQaNamespaceChannel,
  persistQaNamespaceClock
} from "@/lib/agentic/qa/persist";

export const QA_PACK_CLOCK = "2026-09-02T00:00:00.000Z";
export const QA_NAMESPACE_PREFIX = "qa-v3:";

export type QaSession = Readonly<{
  acquisitionMinor: number;
  attribution: FunnelAttribution;
  buildId: string;
  catalogueChecksum: string;
  catalogueVersion: string;
  frozenSnapshot: CatalogueSnapshot | null;
  namespace: string;
  now: string;
  principalScope: string;
  schemaChecksum: string;
}>;

const sessions = new Map<string, QaSession>();
let activeNamespace: string | null = null;
const costByCorrelation = new Map<
  string,
  Readonly<{ acquisitionMinor: number; attribution: FunnelAttribution }>
>();

export class QaRunInvalidError extends Error {
  readonly reasonCode = "run_invalid" as const;

  constructor(message = "Frozen catalogue snapshot is missing.") {
    super(message);
    this.name = "QaRunInvalidError";
  }
}

export function resetQaSessions() {
  sessions.clear();
  costByCorrelation.clear();
  activeNamespace = null;
}

export function qaSession(namespace: string | undefined | null) {
  if (!namespace) {
    return null;
  }
  return sessions.get(namespace) ?? null;
}

function rememberSession(session: QaSession) {
  sessions.set(session.namespace, session);
  return session;
}

export async function resolveQaSession(namespace?: string | null) {
  if (!namespace) {
    return null;
  }

  const local = sessions.get(namespace);
  if (local?.frozenSnapshot) {
    return local;
  }

  const loaded = await loadQaNamespace(namespace);
  if (!loaded) {
    return local ?? null;
  }

  const session: QaSession = {
    acquisitionMinor: loaded.acquisitionMinor,
    attribution: attributionOf(loaded.attribution),
    buildId: loaded.buildId,
    catalogueChecksum: loaded.snapshotId,
    catalogueVersion: loaded.frozenSnapshot?.catalogueVersion ?? "",
    frozenSnapshot: loaded.frozenSnapshot,
    namespace: loaded.namespace,
    now: loaded.now,
    principalScope: loaded.principalScope,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM
  };
  rememberSession(session);
  if (!activeNamespace) {
    activeNamespace = session.namespace;
  }
  return session;
}

export function forgetFrozenSnapshotForTests(namespace: string) {
  const current = sessions.get(namespace);
  if (!current) {
    return;
  }
  rememberSession({ ...current, frozenSnapshot: null });
  dropCatalogueBodyForTests(current.catalogueChecksum);
}

export function activeQaClock(): string | null {
  if (sessions.size === 0) {
    return null;
  }
  const clocks = [...new Set([...sessions.values()].map((item) => item.now))];
  if (clocks.length === 1 && clocks[0]) {
    return clocks[0];
  }
  return null;
}

export function resolveQaNow(namespace?: string) {
  return qaSession(namespace)?.now ?? activeQaClock() ?? QA_PACK_CLOCK;
}

export function bindQaRuntime(
  runtime: AgenticRuntime,
  request: Request,
  namespace?: string | null
): AgenticRuntime {
  if (!authorizeQaRequest(request, runtime.config.environment)) {
    return runtime;
  }
  const session = qaSession(namespace || qaNamespaceFromHeaders(request));
  if (!session) {
    const clock = activeQaClock();
    if (!clock) {
      return runtime;
    }
    return {
      ...runtime,
      now: clock
    };
  }
  setQueryNamespace(session.namespace);
  return {
    ...runtime,
    now: session.now,
    scope: {
      ...runtime.scope,
      principalScope: session.principalScope
    }
  };
}

export function qaNamespaceFromHeaders(request: Request) {
  return request.headers.get("x-mattanutra-qa-namespace")?.trim() || "";
}

export function qaNamespaceFromRpc(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "";
  }

  const root = body as Record<string, unknown>;
  if (typeof root.namespace === "string" && root.namespace.trim()) {
    return root.namespace.trim();
  }

  const params = root.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return "";
  }

  const record = params as Record<string, unknown>;
  if (typeof record.namespace === "string" && record.namespace.trim()) {
    return record.namespace.trim();
  }

  const meta = record._meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const namespace = (meta as { namespace?: unknown }).namespace;
    if (typeof namespace === "string" && namespace.trim()) {
      return namespace.trim();
    }
  }

  const args = record.arguments;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const namespace = (args as { namespace?: unknown }).namespace;
    if (typeof namespace === "string" && namespace.trim()) {
      return namespace.trim();
    }
  }

  return "";
}

export function qaNamespaceFromRequest(request: Request, body?: unknown) {
  return qaNamespaceFromHeaders(request) || qaNamespaceFromRpc(body);
}

function handleFromRpc(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "";
  }
  const params = (body as { params?: unknown }).params;
  const args =
    params && typeof params === "object" && !Array.isArray(params)
      ? ((params as { arguments?: unknown }).arguments ?? params)
      : body;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return "";
  }
  const record = args as Record<string, unknown>;
  for (const key of ["planHandle", "orderHandle", "supportHandle"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
    }
  }
  return "";
}

export async function hydrateQaRequest(
  request: Request,
  body?: unknown,
  store?: AgenticStore | null,
  config?: AgenticConfig | null
) {
  let namespace = qaNamespaceFromRequest(request, body);
  if (!namespace && store && config) {
    const handle = handleFromRpc(body);
    if (handle.length >= 32) {
      const record = await store.getCapabilityByHash(
        hashCapability(config.capabilitySecret, handle)
      );
      if (record?.principalScope?.startsWith(QA_NAMESPACE_PREFIX)) {
        namespace = record.principalScope;
      }
    }
  }
  if (namespace) {
    await resolveQaSession(namespace);
    return namespace;
  }

  const clientKey = getRequestClientIp(request);
  if (clientKey && (await hasActiveQaPackClient(clientKey))) {
    await loadPublishedCatalogue();
    const packed = await listQaNamespacesForClient(clientKey);
    for (const item of packed) {
      await resolveQaSession(item.namespace);
    }
    return "";
  }

  return null;
}

export async function beginQaRun(
  runId = "A",
  input: Readonly<{
    buildId?: string;
    clientKey?: string;
    environment?: AgenticEnvironment;
  }> = {}
): Promise<QaSession> {
  const environment = input.environment ?? "dev";
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const namespace = `${QA_NAMESPACE_PREFIX}${runId}:${nonce}`;
  setQueryNamespace(namespace);
  const live = await ensureCatalogueSnapshot(environment, "TH");
  const frozenSnapshot = freezeCatalogueSnapshot(live);
  publishQaCatalogue(frozenSnapshot);
  const session: QaSession = {
    acquisitionMinor: 0,
    attribution: "agent_connector",
    buildId: input.buildId ?? "",
    catalogueChecksum: catalogueSnapshotId(frozenSnapshot),
    catalogueVersion: frozenSnapshot.catalogueVersion,
    frozenSnapshot,
    namespace,
    now: QA_PACK_CLOCK,
    principalScope: namespace,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM
  };
  rememberSession(session);
  activeNamespace = namespace;
  try {
    await persistQaNamespace(session, runId, input.clientKey ?? "");
  } catch {
    /* Tests and local memory-only runs still freeze in-process. */
  }
  return session;
}

export function missingFrozenSnapshotError(session: QaSession | null) {
  if (session?.frozenSnapshot) {
    return null;
  }
  return {
    message: "Frozen catalogue snapshot is missing.",
    reasonCode: "run_invalid" as const
  };
}

export function frozenSnapshotMissingResult() {
  return {
    error: missingFrozenSnapshotError(null)!,
    ok: false as const
  };
}

export async function withQaSessionSnapshot<T>(
  namespace: string | undefined,
  work: () => T | Promise<T>
): Promise<T> {
  if (!namespace) {
    return await work();
  }

  if (!namespace.startsWith(QA_NAMESPACE_PREFIX)) {
    return await work();
  }

  const session = await resolveQaSession(namespace);
  if (!session?.frozenSnapshot) {
    throw new QaRunInvalidError();
  }

  return await runWithCatalogueSnapshot(session.frozenSnapshot, work);
}

export async function setQaClock(namespace: string, now: string) {
  const current = (await resolveQaSession(namespace)) ?? sessions.get(namespace);
  if (!current) {
    return null;
  }
  const next = { ...current, now };
  rememberSession(next);
  await persistQaNamespaceClock(namespace, now);
  return next;
}

export async function setQaChannel(
  namespace: string,
  input: Readonly<{ acquisitionMinor?: number; attribution?: unknown }>
) {
  const current = (await resolveQaSession(namespace)) ?? sessions.get(namespace);
  if (!current) {
    return null;
  }
  const next: QaSession = {
    ...current,
    acquisitionMinor:
      typeof input.acquisitionMinor === "number" && Number.isFinite(input.acquisitionMinor)
        ? Math.max(0, Math.trunc(input.acquisitionMinor))
        : current.acquisitionMinor,
    attribution: attributionOf(input.attribution)
  };
  rememberSession(next);
  await persistQaNamespaceChannel(namespace, {
    acquisitionMinor: next.acquisitionMinor,
    attribution: next.attribution
  });
  return next;
}

export function activeQaSession() {
  return activeNamespace ? sessions.get(activeNamespace) ?? null : null;
}

export function channelForScope(scope: Readonly<{ principalScope?: string | null }>) {
  if (scope.principalScope) {
    const byPrincipal = sessions.get(scope.principalScope);
    if (byPrincipal) {
      return {
        acquisitionMinor: byPrincipal.acquisitionMinor,
        attribution: byPrincipal.attribution
      };
    }
  }
  const active = activeQaSession();
  if (active) {
    return {
      acquisitionMinor: active.acquisitionMinor,
      attribution: active.attribution
    };
  }
  return {
    acquisitionMinor: 0,
    attribution: "unattributed" as const
  };
}

export function bindQaChannel(
  correlationId: string,
  session: Readonly<{ acquisitionMinor: number; attribution: FunnelAttribution }>
) {
  costByCorrelation.set(correlationId, {
    acquisitionMinor: session.acquisitionMinor,
    attribution: session.attribution
  });
}

export function channelCost(correlationId: string, namespace?: string) {
  const fromNamespace = namespace ? sessions.get(namespace) : null;
  if (fromNamespace) {
    return {
      acquisitionMinor: fromNamespace.acquisitionMinor,
      attribution: fromNamespace.attribution
    };
  }
  return (
    costByCorrelation.get(correlationId) ?? {
      acquisitionMinor: 0,
      attribution: "unattributed" as const
    }
  );
}

export async function resetQaRun(input: Readonly<{
  namespace: string;
  store: AgenticStore;
}>) {
  const session = (await resolveQaSession(input.namespace)) ?? sessions.get(input.namespace);
  if (!session) {
    return { ok: true as const, namespace: input.namespace };
  }
  if (!session.principalScope.startsWith(QA_NAMESPACE_PREFIX)) {
    return { ok: false as const, reasonCode: "not_found" as const };
  }
  const planIds = await input.store.listPlanIdsByPrincipal(session.principalScope);
  for (const planId of planIds) {
    resetFunnelLedger(planId);
    costByCorrelation.delete(planId);
  }
  await input.store.deletePrincipalScope(session.principalScope);
  sessions.delete(input.namespace);
  if (activeNamespace === input.namespace) {
    activeNamespace = null;
  }
  resetQueryBudget(input.namespace);
  await deletePersistedQaNamespace(input.namespace);
  return { ok: true as const, namespace: input.namespace };
}
