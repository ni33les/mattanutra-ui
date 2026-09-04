import { createMemoryStore } from "../../../lib/agentic/store/memory.ts";
import {
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../../../lib/agentic/runtime.ts";
import { planTool } from "../../../lib/agentic/plan/service.ts";
import { goldenPlanRequest } from "../../../lib/agentic/qa/proofs.ts";
import {
  captureDurableFunnelState,
  captureFunnelProcessState,
  emptyDurableFunnelState,
  flushFunnelProcessCache,
  restoreDurableFunnelState,
  restoreFunnelProcessState
} from "../../../lib/agentic/funnel/ledger.ts";
import { resetCatalogueSnapshotCache } from "../../../lib/agentic/catalogue/snapshot.ts";
import {
  captureQaPersistLocal,
  captureQaReplicaDurable,
  emptyQaPersistLocal,
  emptyQaReplicaDurable,
  primeReplicaFromCommitted,
  restoreQaPersistLocal,
  restoreQaReplicaDurable
} from "../../../lib/agentic/qa/persist.ts";
import {
  bindQaRuntime,
  captureQaLocalState,
  resolveQaSession,
  restoreQaLocalState
} from "../../../lib/agentic/qa/session.ts";
import {
  captureQueryBudgetState,
  restoreQueryBudgetState,
  setQueryNamespace
} from "../../../lib/agentic/plan/query-budget.ts";
import {
  asRecord,
  beginV12Run,
  canonicalHash,
  canonicalJson,
  contributionOf,
  createV12Runtime,
  endV12Run,
  executeOn as executeOnV12,
  expectedContribution,
  firstDiff,
  funnelView,
  observeOn as observeOnV12,
  orderOn as orderOnV12,
  payAndDeliver as payAndDeliverV12,
  qaCall,
  stripOpaque,
  type HandlerId
} from "../v12/harness.ts";
import {
  V13_ACQUISITION,
  V13_CLOCK_00,
  V13_CLOCK_09
} from "./manifest.ts";

export {
  asRecord,
  canonicalHash,
  canonicalJson,
  contributionOf,
  expectedContribution,
  firstDiff,
  funnelView,
  qaCall,
  stripOpaque
};
export type { HandlerId };

type HandlerLocal = {
  durableFunnel: ReturnType<typeof captureDurableFunnelState>;
  funnel: ReturnType<typeof captureFunnelProcessState>;
  persist: ReturnType<typeof captureQaPersistLocal>;
  qa: ReturnType<typeof captureQaLocalState>;
  query: ReturnType<typeof captureQueryBudgetState>;
  replica: ReturnType<typeof captureQaReplicaDurable>;
};

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
    },
    replica: emptyQaReplicaDurable()
  };
}

export function beginV13Run() {
  beginV12Run();
}

export function endV13Run() {
  endV12Run();
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
    const previousReplica = captureQaReplicaDurable();
    restoreQaLocalState(locals[id].qa);
    restoreQueryBudgetState(locals[id].query);
    restoreFunnelProcessState(locals[id].funnel);
    restoreDurableFunnelState(locals[id].durableFunnel);
    restoreQaPersistLocal(locals[id].persist);
    restoreQaReplicaDurable(locals[id].replica);
    setAgenticRuntimeForTests(runtimes[id]);
    try {
      return await work(runtimes[id]);
    } finally {
      locals[id] = {
        durableFunnel: captureDurableFunnelState(),
        funnel: captureFunnelProcessState(),
        persist: captureQaPersistLocal(),
        qa: captureQaLocalState(),
        query: captureQueryBudgetState(),
        replica: captureQaReplicaDurable()
      };
      restoreQaLocalState(previousQa);
      restoreQueryBudgetState(previousQuery);
      restoreFunnelProcessState(previousFunnel);
      restoreDurableFunnelState(previousDurableFunnel);
      restoreQaPersistLocal(previousPersist);
      restoreQaReplicaDurable(previousReplica);
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

  async function primeFromCommitted(id: HandlerId, namespace: string) {
    await asHandler(id, async () => {
      primeReplicaFromCommitted(namespace);
      await resolveQaSession(namespace);
    });
  }

  return { asHandler, clearHandler, primeFromCommitted, restartHandler, runtimes, store };
}

export type HandlerCluster = ReturnType<typeof createHandlerCluster>;

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
  acquisitionMinor = V13_ACQUISITION
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
    setQueryNamespace("v13-warm");
    return planTool({
      config: runtime.config,
      now: V13_CLOCK_09,
      payload: {
        idempotencyKey: `v13-warm-${suffix}xxxxxxxx`.slice(0, 24),
        request: goldenPlanRequest()
      },
      scope: { ...runtime.scope, principalScope: "v13-warm" },
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
        now: bound.now ?? input.now ?? V13_CLOCK_00,
        payload: {
          idempotencyKey: `v13-plan-${input.suffix}xxxxxxxx`.slice(0, 24),
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
  return executeOnV12(cluster as never, handler, input);
}

export async function orderOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{ namespace: string; orderHandle: string; principal: string }>
) {
  return orderOnV12(cluster as never, handler, input);
}

export async function observeOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  args: Record<string, unknown>
) {
  return observeOnV12(cluster as never, handler, args);
}

export async function payAndDeliver(
  cluster: HandlerCluster,
  input: Parameters<typeof payAndDeliverV12>[1]
) {
  return payAndDeliverV12(cluster as never, input);
}

export type ReadyPlan = Readonly<{
  namespace: string;
  plan: Record<string, unknown>;
  planHandle: string;
  principal: string;
  revision: number;
}>;

export async function setupDefaultExecuteContext(
  cluster: HandlerCluster,
  input: Readonly<{
    suffix: string;
    setup?: HandlerId;
    stale?: HandlerId;
    plan?: HandlerId;
    runId?: string;
    acquisitionMinor?: number;
    skipPlan?: boolean;
  }>
): Promise<ReadyPlan> {
  const setup = input.setup ?? "A";
  const stale = input.stale ?? "B";
  const planner = input.plan ?? "C";
  const begun = await beginNamespace(cluster, setup, input.runId ?? "A");
  await cluster.primeFromCommitted(stale, begun.namespace);
  await setClockOn(cluster, setup, begun.namespace, V13_CLOCK_09);
  await setChannelOn(cluster, setup, begun.namespace, input.acquisitionMinor ?? V13_ACQUISITION);
  if (planner !== setup) {
    await cluster.primeFromCommitted(planner, begun.namespace);
  }
  await warmMatchCache(cluster, planner, input.suffix);
  if (input.skipPlan) {
    return {
      namespace: begun.namespace,
      plan: {},
      planHandle: "",
      principal: begun.principal,
      revision: 0
    };
  }
  const plan = await planOn(cluster, planner, { ...begun, suffix: input.suffix });
  return {
    namespace: begun.namespace,
    plan,
    planHandle: String(plan.planHandle),
    principal: begun.principal,
    revision: Number(plan.revision)
  };
}
