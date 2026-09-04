import { createHash } from "node:crypto";
import {
  beginDeterministicIdsForTests,
  endDeterministicIdsForTests
} from "../../../lib/agentic/capabilities.ts";
import { loadAgenticConfig } from "../../../lib/agentic/config.ts";
import { handleQaJsonRpc } from "../../../lib/agentic/mcp/qa-dispatcher.ts";
import { handleJsonRpc } from "../../../lib/agentic/mcp/dispatcher.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../../../lib/agentic/runtime.ts";
import { createMemoryStore } from "../../../lib/agentic/store/memory.ts";
import type { AgenticStore } from "../../../lib/agentic/store/types.ts";
import { createMockPaymentAdapter } from "../../../lib/agentic/commerce/payment.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "../../helpers/gold-catalogue.ts";
import { planTool } from "../../../lib/agentic/plan/service.ts";
import { executeTool } from "../../../lib/agentic/commerce/execute.ts";
import { orderTool } from "../../../lib/agentic/commerce/order.ts";
import { goldenPlanRequest } from "../../../lib/agentic/qa/proofs.ts";
import {
  captureDurableFunnelState,
  captureFunnelProcessState,
  emptyDurableFunnelState,
  flushFunnelProcessCache,
  listCommittedFunnelEvents,
  loadPersistedFunnelEvents,
  resetFunnelLedger,
  restoreDurableFunnelState,
  restoreFunnelProcessState,
  snapshotCommittedFunnelRows
} from "../../../lib/agentic/funnel/ledger.ts";
import { resetCatalogueSnapshotCache } from "../../../lib/agentic/catalogue/snapshot.ts";
import {
  captureQaPersistLocal,
  emptyQaPersistLocal,
  primeLocalNamespaceFromDurable,
  resetQaPersistForTests,
  restoreQaPersistLocal,
  snapshotQaPersistDurable
} from "../../../lib/agentic/qa/persist.ts";
import {
  bindQaRuntime,
  captureQaLocalState,
  resetQaSessions,
  resolveQaSession,
  restoreQaLocalState
} from "../../../lib/agentic/qa/session.ts";
import {
  captureQueryBudgetState,
  resetQueryBudget,
  restoreQueryBudgetState,
  setQueryNamespace
} from "../../../lib/agentic/plan/query-budget.ts";
import { resetMatchPlanCache } from "../../../lib/agentic/plan/matching.ts";
import { resetInfoCache } from "../../../lib/agentic/info.ts";
import { DET_V3_BUILD_ID } from "../det-v3/manifest.ts";
import {
  V12_ACQUISITION,
  V12_CLOCK_00,
  V12_CLOCK_09,
  V12_FUNNEL,
  V12_SEQUENCES
} from "./manifest.ts";

export type HandlerId = "A" | "B" | "C" | "D";

type HandlerLocal = {
  durableFunnel: ReturnType<typeof captureDurableFunnelState>;
  funnel: ReturnType<typeof captureFunnelProcessState>;
  persist: ReturnType<typeof captureQaPersistLocal>;
  qa: ReturnType<typeof captureQaLocalState>;
  query: ReturnType<typeof captureQueryBudgetState>;
};

export type ReadyPlan = Readonly<{
  namespace: string;
  plan: Record<string, unknown>;
  planHandle: string;
  principal: string;
  revision: number;
}>;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)])
    );
  }
  return value;
}

export function canonicalHash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function firstDiff(
  left: unknown,
  right: unknown,
  path = "$"
): { path: string; left: unknown; right: unknown } | null {
  if (canonicalJson(left) === canonicalJson(right)) {
    return null;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const hit = firstDiff(left[index], right[index], `${path}[${index}]`);
      if (hit) {
        return hit;
      }
    }
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const keys = new Set([...Object.keys(left as object), ...Object.keys(right as object)]);
    for (const key of [...keys].sort()) {
      const hit = firstDiff(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`
      );
      if (hit) {
        return hit;
      }
    }
  }
  return { path, left, right };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stripOpaque(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripOpaque);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "formulaId") {
      next[key] = child;
      continue;
    }
    if (
      /handle|Handle|Id$|id$|Url$|url$|reference|Reference|namespace|correlation/i.test(key) &&
      typeof child === "string"
    ) {
      next[key] = "[opaque]";
      continue;
    }
    next[key] = stripOpaque(child);
  }
  return next;
}

function emptyHandlerLocal(): HandlerLocal {
  return {
    durableFunnel: emptyDurableFunnelState(),
    funnel: {
      attribution: new Map(),
      ledgers: new Map(),
      seen: new Set(),
      sharedAttribution: new Map(),
      sharedLedgers: new Map(),
      sharedSeen: new Set()
    },
    persist: emptyQaPersistLocal(),
    qa: {
      activeNamespace: null,
      costByCorrelation: new Map(),
      sessions: new Map()
    },
    query: {
      activeNamespace: "global",
      byNamespace: new Map()
    }
  };
}

export function createV12Runtime(store: AgenticStore, now = V12_CLOCK_00): AgenticRuntime {
  const config = {
    ...loadAgenticConfig(),
    buildId: DET_V3_BUILD_ID,
    environment: "dev" as const,
    internalQaHarness: true,
    paymentProvider: "mock" as const,
    thailandRetailerAdapter: "mock_thailand" as const
  };
  return createAgenticRuntime({
    config,
    now,
    payment: createMockPaymentAdapter(),
    scope: {
      environment: "dev",
      principalScope: null,
      tenantScope: "mattanutra"
    },
    store
  });
}

export function beginV12Run() {
  process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT ?? "v12";
  beginDeterministicIdsForTests();
  installGoldCatalogue();
  resetFunnelLedger();
  resetQaSessions();
  resetQaPersistForTests();
  resetQueryBudget();
  resetMatchPlanCache();
  resetInfoCache();
  resetCatalogueSnapshotCache();
}

export function endV12Run() {
  setAgenticRuntimeForTests(null);
  uninstallGoldCatalogue();
  endDeterministicIdsForTests();
  resetFunnelLedger();
  resetQaSessions();
  resetQaPersistForTests();
  resetQueryBudget();
  resetMatchPlanCache();
  resetInfoCache();
}

export function createHandlerCluster() {
  const store = createMemoryStore();
  const locals: Record<HandlerId, HandlerLocal> = {
    A: emptyHandlerLocal(),
    B: emptyHandlerLocal(),
    C: emptyHandlerLocal(),
    D: emptyHandlerLocal()
  };
  const runtimes: Record<HandlerId, AgenticRuntime> = {
    A: createV12Runtime(store),
    B: createV12Runtime(store),
    C: createV12Runtime(store),
    D: createV12Runtime(store)
  };

  async function asHandler<T>(id: HandlerId, work: (runtime: AgenticRuntime) => Promise<T> | T) {
    const previousQa = captureQaLocalState();
    const previousQuery = captureQueryBudgetState();
    const previousFunnel = captureFunnelProcessState();
    const previousDurableFunnel = captureDurableFunnelState();
    const previousPersist = captureQaPersistLocal();
    restoreQaLocalState(locals[id].qa);
    restoreQueryBudgetState(locals[id].query);
    restoreFunnelProcessState(locals[id].funnel);
    restoreDurableFunnelState(locals[id].durableFunnel);
    restoreQaPersistLocal(locals[id].persist);
    setAgenticRuntimeForTests(runtimes[id]);
    try {
      return await work(runtimes[id]);
    } finally {
      locals[id] = {
        durableFunnel: captureDurableFunnelState(),
        funnel: captureFunnelProcessState(),
        persist: captureQaPersistLocal(),
        qa: captureQaLocalState(),
        query: captureQueryBudgetState()
      };
      restoreQaLocalState(previousQa);
      restoreQueryBudgetState(previousQuery);
      restoreFunnelProcessState(previousFunnel);
      restoreDurableFunnelState(previousDurableFunnel);
      restoreQaPersistLocal(previousPersist);
    }
  }

  function clearHandler(id: HandlerId) {
    locals[id] = emptyHandlerLocal();
    flushFunnelProcessCache();
    resetCatalogueSnapshotCache();
  }

  function restartHandler(id: HandlerId) {
    clearHandler(id);
    runtimes[id] = createV12Runtime(store);
  }

  async function primeFromDurable(id: HandlerId, namespace: string) {
    await asHandler(id, async () => {
      primeLocalNamespaceFromDurable(namespace);
      await resolveQaSession(namespace);
    });
  }

  return { asHandler, clearHandler, primeFromDurable, restartHandler, runtimes, store };
}

export type HandlerCluster = ReturnType<typeof createHandlerCluster>;

export function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return asRecord(response?.result?.structuredContent ?? response?.result ?? {});
}

export async function qaCall(
  runtime: AgenticRuntime,
  name: string,
  args: Record<string, unknown> = {}
) {
  return structured(
    await handleQaJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: args, name }
    })
  );
}

export async function publicCall(
  runtime: AgenticRuntime,
  name: string,
  args: Record<string, unknown>,
  namespace?: string
) {
  const bound = bindQaRuntime(
    runtime,
    new Request("https://dev.mattanutra.com/api/mcp", {
      headers: namespace ? { "x-mattanutra-qa-namespace": namespace } : {}
    }),
    namespace ?? null
  );
  return structured(
    await handleJsonRpc(bound, {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: args, name }
    })
  );
}

export function contributionOf(executed: Record<string, unknown>) {
  const frozen = asRecord(executed.frozenPlan);
  const contribution = asRecord(frozen.contribution);
  const root = Object.keys(contribution).length > 0 ? contribution : frozen;
  return {
    acquisitionMinor: (root.acquisitionMinor as number | undefined) ?? null,
    checkoutExpiresAt: executed.checkoutExpiresAt ?? null,
    paymentFeeMinor: (root.paymentFeeMinor as number | undefined) ?? null,
    paymentMinor: (root.paymentMinor as number | undefined) ?? null,
    productCostMinor: (root.productCostMinor as number | undefined) ?? null,
    shippingSubsidyMinor: (root.shippingSubsidyMinor as number | undefined) ?? null
  };
}

export function expectedContribution(input: Readonly<{
  paymentMinor: number;
  productCostMinor: number;
  acquisitionMinor?: number;
}>) {
  return (
    input.paymentMinor -
    input.productCostMinor -
    (input.acquisitionMinor ?? V12_ACQUISITION)
  );
}

function bindNamespace(runtime: AgenticRuntime, namespace: string) {
  return bindQaRuntime(
    runtime,
    new Request("https://dev.mattanutra.com/api/mcp", {
      headers: { "x-mattanutra-qa-namespace": namespace }
    }),
    namespace
  );
}

export async function beginNamespace(cluster: HandlerCluster, handler: HandlerId, runId = "A") {
  const begun = await cluster.asHandler(handler, (runtime) => qaCall(runtime, "beginRun", { runId }));
  return {
    namespace: String(begun.namespace),
    principal: String(begun.principalScope ?? begun.namespace)
  };
}

export async function setClockOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  namespace: string,
  now: string
) {
  return cluster.asHandler(handler, (runtime) => qaCall(runtime, "setClock", { namespace, now }));
}

export async function setChannelOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  namespace: string,
  acquisitionMinor = V12_ACQUISITION
) {
  return cluster.asHandler(handler, (runtime) =>
    qaCall(runtime, "setChannel", {
      acquisitionMinor,
      attribution: "agent_connector",
      namespace
    })
  );
}

export async function warmMatchCache(cluster: HandlerCluster, handler: HandlerId, suffix: string) {
  await cluster.asHandler(handler, async (runtime) => {
    setQueryNamespace("v12-warm");
    return planTool({
      config: runtime.config,
      now: V12_CLOCK_09,
      payload: {
        idempotencyKey: `v12-warm-${suffix}xxxxxxxx`.slice(0, 24),
        request: goldenPlanRequest()
      },
      scope: { ...runtime.scope, principalScope: "v12-warm" },
      store: runtime.store
    });
  });
}

export async function planOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{
    namespace: string;
    principal: string;
    suffix: string;
    now?: string;
  }>
) {
  return asRecord(
    await cluster.asHandler(handler, (runtime) => {
      const bound = bindNamespace(runtime, input.namespace);
      return planTool({
        config: bound.config,
        now: bound.now ?? input.now ?? V12_CLOCK_00,
        payload: {
          idempotencyKey: `v12-plan-${input.suffix}xxxxxxxx`.slice(0, 24),
          request: goldenPlanRequest()
        },
        scope: {
          ...bound.scope,
          principalScope: bound.scope.principalScope ?? input.principal
        },
        store: bound.store
      });
    })
  );
}

export async function executeOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{
    namespace: string;
    planHandle: string;
    principal: string;
    revision: number;
    suffix: string;
  }>
) {
  return asRecord(
    await cluster.asHandler(handler, (runtime) => {
      const bound = bindNamespace(runtime, input.namespace);
      return executeTool({
        config: bound.config,
        expectedRevision: input.revision,
        idempotencyKey: `v12-exec-${input.suffix}xxxxxxxx`.slice(0, 24),
        now: bound.now ?? V12_CLOCK_00,
        payment: bound.payment,
        planHandle: input.planHandle,
        scope: {
          ...bound.scope,
          principalScope: bound.scope.principalScope ?? input.principal
        },
        store: bound.store
      });
    })
  );
}

export async function orderOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{ namespace: string; orderHandle: string; principal: string }>
) {
  return asRecord(
    await cluster.asHandler(handler, (runtime) => {
      const bound = bindNamespace(runtime, input.namespace);
      return orderTool({
        config: bound.config,
        now: bound.now ?? V12_CLOCK_00,
        orderHandle: input.orderHandle,
        scope: {
          ...bound.scope,
          principalScope: bound.scope.principalScope ?? input.principal
        },
        store: bound.store
      });
    })
  );
}

export async function observeOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  args: Record<string, unknown>
) {
  return cluster.asHandler(handler, (runtime) => qaCall(runtime, "observe", args));
}

export async function simulateOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{
    namespace: string;
    orderHandle: string;
    scenario: string;
  }>
) {
  return cluster.asHandler(handler, (runtime) =>
    qaCall(runtime, "simulate", {
      namespace: input.namespace,
      orderHandle: input.orderHandle,
      scenario: input.scenario
    })
  );
}

export async function fulfilOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{
    namespace: string;
    orderHandle: string;
    status: "dispatched" | "delivered" | "preparing";
  }>
) {
  return cluster.asHandler(handler, (runtime) =>
    qaCall(runtime, "simulateFulfilment", {
      namespace: input.namespace,
      orderHandle: input.orderHandle,
      status: input.status
    })
  );
}

export async function setupStaleExecuteContext(
  cluster: HandlerCluster,
  input: Readonly<{
    suffix: string;
    setup?: HandlerId;
    stale?: HandlerId;
    plan?: HandlerId;
    runId?: string;
    acquisitionMinor?: number;
  }>
): Promise<ReadyPlan> {
  const setup = input.setup ?? "A";
  const stale = input.stale ?? "B";
  const planner = input.plan ?? "C";
  const begun = await beginNamespace(cluster, setup, input.runId ?? "A");
  await setClockOn(cluster, setup, begun.namespace, V12_CLOCK_09);
  await cluster.primeFromDurable(stale, begun.namespace);
  await setChannelOn(cluster, setup, begun.namespace, input.acquisitionMinor ?? V12_ACQUISITION);
  if (planner !== setup) {
    await cluster.primeFromDurable(planner, begun.namespace);
  }
  await warmMatchCache(cluster, planner, input.suffix);
  const plan = await planOn(cluster, planner, { ...begun, suffix: input.suffix });
  return {
    namespace: begun.namespace,
    plan,
    planHandle: String(plan.planHandle),
    principal: begun.principal,
    revision: Number(plan.revision)
  };
}

export async function payAndDeliver(
  cluster: HandlerCluster,
  input: Readonly<{
    namespace: string;
    orderHandle: string;
    decline?: HandlerId;
    success?: HandlerId;
    dispatched?: HandlerId;
    delivered?: HandlerId;
  }>
) {
  await simulateOn(cluster, input.decline ?? "A", {
    namespace: input.namespace,
    orderHandle: input.orderHandle,
    scenario: "decline_insufficient_funds"
  });
  await simulateOn(cluster, input.success ?? "B", {
    namespace: input.namespace,
    orderHandle: input.orderHandle,
    scenario: "success"
  });
  await fulfilOn(cluster, input.dispatched ?? "C", {
    namespace: input.namespace,
    orderHandle: input.orderHandle,
    status: "dispatched"
  });
  await fulfilOn(cluster, input.delivered ?? "A", {
    namespace: input.namespace,
    orderHandle: input.orderHandle,
    status: "delivered"
  });
}

export function funnelView(events: Array<{ eventType?: unknown; sequence?: unknown }>) {
  return {
    sequences: events.map((item) => Number(item.sequence)),
    types: events.map((item) => String(item.eventType))
  };
}

export function assertFunnelContract(events: Array<{ eventType?: unknown; sequence?: unknown }>) {
  const view = funnelView(events);
  return {
    sequences: view.sequences,
    types: view.types,
    expectedSequences: [...V12_SEQUENCES],
    expectedTypes: [...V12_FUNNEL]
  };
}

export async function loadLedger(
  cluster: HandlerCluster,
  handler: HandlerId,
  correlationId: string
) {
  return cluster.asHandler(handler, () => loadPersistedFunnelEvents(correlationId));
}

export function observationEvidence(observed: Record<string, unknown>) {
  const queries = asRecord(observed.queries);
  const budget = asRecord(observed.dependencyBudget);
  const plan = asRecord(queries.plan);
  const match = asRecord(plan.match);
  return {
    clock: observed.clock ?? null,
    planMatch: queries["plan.match"] ?? plan.match ?? match.value ?? null,
    planMatchHit: queries["plan.match.hit"] ?? match.hit ?? null,
    planMatchHits: budget.planMatchHits ?? null,
    queries
  };
}

export function persistSideEffectSnapshot() {
  return {
    committedFunnel: snapshotCommittedFunnelRows(),
    durable: snapshotQaPersistDurable()
  };
}

export function committedFunnelOf(correlationId: string) {
  return listCommittedFunnelEvents(correlationId);
}
