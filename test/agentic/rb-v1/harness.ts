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
import {
  captureFunnelProcessState,
  flushFunnelProcessCache,
  resetFunnelLedger,
  restoreFunnelProcessState
} from "../../../lib/agentic/funnel/ledger.ts";
import { resetCatalogueSnapshotCache } from "../../../lib/agentic/catalogue/snapshot.ts";
import { resetQaPersistForTests } from "../../../lib/agentic/qa/persist.ts";
import {
  bindQaRuntime,
  captureQaLocalState,
  resetQaSessions,
  restoreQaLocalState
} from "../../../lib/agentic/qa/session.ts";
import {
  captureQueryBudgetState,
  resetQueryBudget,
  restoreQueryBudgetState
} from "../../../lib/agentic/plan/query-budget.ts";
import { resetInfoCache } from "../../../lib/agentic/info.ts";
import { DET_V3_BUILD_ID } from "../det-v3/manifest.ts";
import { RB_V1_CLOCK_00 } from "./manifest.ts";

export type HandlerId = "A" | "B" | "C";

type HandlerLocal = {
  funnel: ReturnType<typeof captureFunnelProcessState>;
  qa: ReturnType<typeof captureQaLocalState>;
  query: ReturnType<typeof captureQueryBudgetState>;
};

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

function emptyHandlerLocal(): HandlerLocal {
  return {
    funnel: {
      attribution: new Map(),
      ledgers: new Map(),
      seen: new Set(),
      sharedAttribution: new Map(),
      sharedLedgers: new Map(),
      sharedSeen: new Set()
    },
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

export function createRbRuntime(store: AgenticStore, now = RB_V1_CLOCK_00): AgenticRuntime {
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

export function beginRbRun() {
  process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT ?? "rb-v1";
  beginDeterministicIdsForTests();
  installGoldCatalogue();
  resetFunnelLedger();
  resetQaSessions();
  resetQaPersistForTests();
  resetQueryBudget();
  resetInfoCache();
  resetCatalogueSnapshotCache();
}

export function endRbRun() {
  setAgenticRuntimeForTests(null);
  uninstallGoldCatalogue();
  endDeterministicIdsForTests();
  resetFunnelLedger();
  resetQaSessions();
  resetQaPersistForTests();
  resetQueryBudget();
  resetInfoCache();
}

export function createHandlerCluster() {
  const store = createMemoryStore();
  const locals: Record<HandlerId, HandlerLocal> = {
    A: emptyHandlerLocal(),
    B: emptyHandlerLocal(),
    C: emptyHandlerLocal()
  };
  const runtimes: Record<HandlerId, AgenticRuntime> = {
    A: createRbRuntime(store),
    B: createRbRuntime(store),
    C: createRbRuntime(store)
  };

  async function asHandler<T>(id: HandlerId, work: (runtime: AgenticRuntime) => Promise<T> | T) {
    const previousQa = captureQaLocalState();
    const previousQuery = captureQueryBudgetState();
    const previousFunnel = captureFunnelProcessState();
    restoreQaLocalState(locals[id].qa);
    restoreQueryBudgetState(locals[id].query);
    restoreFunnelProcessState(locals[id].funnel);
    setAgenticRuntimeForTests(runtimes[id]);
    try {
      return await work(runtimes[id]);
    } finally {
      locals[id] = {
        funnel: captureFunnelProcessState(),
        qa: captureQaLocalState(),
        query: captureQueryBudgetState()
      };
      restoreQaLocalState(previousQa);
      restoreQueryBudgetState(previousQuery);
      restoreFunnelProcessState(previousFunnel);
    }
  }

  function clearHandler(id: HandlerId) {
    locals[id] = emptyHandlerLocal();
    flushFunnelProcessCache();
    resetCatalogueSnapshotCache();
  }

  return { asHandler, clearHandler, runtimes, store };
}

export function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return (response?.result?.structuredContent ?? response?.result ?? {}) as Record<string, unknown>;
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
  const frozen = executed.frozenPlan;
  const root =
    frozen && typeof frozen === "object" && !Array.isArray(frozen)
      ? (frozen as Record<string, unknown>)
      : {};
  const contribution =
    root.contribution && typeof root.contribution === "object" && !Array.isArray(root.contribution)
      ? (root.contribution as Record<string, unknown>)
      : root;
  return {
    acquisitionMinor: contribution.acquisitionMinor ?? null,
    checkoutExpiresAt: executed.checkoutExpiresAt ?? null
  };
}
