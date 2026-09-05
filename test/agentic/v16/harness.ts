import { beginDeterministicIdsForTests, endDeterministicIdsForTests } from "../../../lib/agentic/capabilities.ts";
import { catalogueSnapshotId, freezeCatalogueSnapshot } from "../../../lib/agentic/catalogue/freeze.ts";
import { cachedLiveRetailSnapshot } from "../../../lib/agentic/catalogue/live.ts";
import {
  replaceCatalogueSnapshot,
  resetCatalogueSnapshotCache
} from "../../../lib/agentic/catalogue/snapshot.ts";
import type { CatalogueSnapshot } from "../../../lib/agentic/catalogue/types.ts";
import { AGENTIC_CONTRACT_VERSION } from "../../../lib/agentic/config.ts";
import { loadAgenticConfig } from "../../../lib/agentic/config.ts";
import { RESEARCH_VERSION } from "../../../lib/agentic/discovery/versions.ts";
import { AGENTIC_SCHEMA_CHECKSUM } from "../../../lib/agentic/info.ts";
import { handleJsonRpc } from "../../../lib/agentic/mcp/dispatcher.ts";
import { MATCHER_VERSION } from "../../../lib/matcher/config.ts";
import { resetMatchPlanCache } from "../../../lib/agentic/plan/matching.ts";
import { resetQueryBudget } from "../../../lib/agentic/plan/query-budget.ts";
import { resetFunnelLedger } from "../../../lib/agentic/funnel/ledger.ts";
import { resetQaPersistForTests } from "../../../lib/agentic/qa/persist.ts";
import { resetQaSessions } from "../../../lib/agentic/qa/session.ts";
import { resetRequestTraces } from "../../../lib/agentic/qa/request-trace.ts";
import { resetResourcePermits } from "../../../lib/agentic/qa/resource-permits.ts";
import { resetServiceClock, useInjectedServiceClock } from "../../../lib/agentic/qa/service-clock.ts";
import { resetInfoCache } from "../../../lib/agentic/info.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../../../lib/agentic/runtime.ts";
import { createMemoryStore } from "../../../lib/agentic/store/memory.ts";
import { createMockPaymentAdapter } from "../../../lib/agentic/commerce/payment.ts";
import { F_READY_MAG, v16FreshKey } from "./manifest.ts";

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return asRecord(response?.result?.structuredContent ?? response?.result ?? {});
}

export type CatalogueAttestation = Readonly<{
  catalogueId: string;
  catalogueVersion: string;
  contractVersion: string;
  matcherVersion: string;
  productCount: number;
  researchVersion: string;
  schemaChecksum: string;
  snapshotId: string;
  sources: readonly string[];
}>;

let frozenReal: CatalogueSnapshot | null = null;
let frozenAttestation: CatalogueAttestation | null = null;

function attest(snapshot: CatalogueSnapshot): CatalogueAttestation {
  const sources = [...new Set(snapshot.products.map((item) => String(item.source)))];
  return {
    catalogueId: "TH",
    catalogueVersion: snapshot.catalogueVersion,
    contractVersion: AGENTIC_CONTRACT_VERSION,
    matcherVersion: MATCHER_VERSION,
    productCount: snapshot.products.length,
    researchVersion: RESEARCH_VERSION,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
    snapshotId: catalogueSnapshotId(snapshot),
    sources
  };
}

export async function freezeRealThailandCatalogue() {
  if (!frozenReal || frozenReal.products.length < 1) {
    const previous = process.env.NODE_TEST_CONTEXT;
    delete process.env.NODE_TEST_CONTEXT;
    try {
      resetCatalogueSnapshotCache();
      frozenReal = freezeCatalogueSnapshot(await cachedLiveRetailSnapshot("TH"));
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_TEST_CONTEXT;
      } else {
        process.env.NODE_TEST_CONTEXT = previous;
      }
    }
    frozenAttestation = attest(frozenReal);
  }
  replaceCatalogueSnapshot(frozenReal);
  return frozenAttestation!;
}

export function catalogueAttestation() {
  return frozenAttestation;
}

export function frozenSnapshot() {
  return frozenReal;
}

export function beginV16Run() {
  process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT ?? "v16";
  beginDeterministicIdsForTests();
  resetFunnelLedger();
  resetQaSessions();
  resetQaPersistForTests();
  resetQueryBudget();
  resetMatchPlanCache();
  resetInfoCache();
  resetRequestTraces();
  resetResourcePermits();
  resetServiceClock();
  useInjectedServiceClock();
  if (frozenReal) {
    replaceCatalogueSnapshot(frozenReal);
  }
}

export function endV16Run() {
  setAgenticRuntimeForTests(null);
  endDeterministicIdsForTests();
  resetFunnelLedger();
  resetQaSessions();
  resetQaPersistForTests();
  resetQueryBudget();
  resetMatchPlanCache();
  resetInfoCache();
  resetRequestTraces();
  resetResourcePermits();
  resetServiceClock();
}

export function createV16Runtime() {
  const store = createMemoryStore();
  const runtime = createAgenticRuntime({
    config: {
      ...loadAgenticConfig(),
      environment: "dev",
      internalQaHarness: true,
      paymentProvider: "mock",
      thailandRetailerAdapter: "mock_thailand"
    },
    now: "2026-09-02T09:00:00.000Z",
    payment: createMockPaymentAdapter(),
    scope: {
      environment: "dev",
      principalScope: "qa-v3:l2:dev",
      tenantScope: "mattanutra"
    },
    store
  });
  setAgenticRuntimeForTests(runtime);
  return { runtime, store };
}

export async function publicPlanCreate(
  runtime: AgenticRuntime,
  idempotencyKey: string,
  request: typeof F_READY_MAG = F_READY_MAG
) {
  return structured(
    await handleJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          idempotencyKey,
          operation: "create",
          request
        },
        name: "plan"
      }
    })
  );
}

export async function publicInfo(runtime: AgenticRuntime) {
  return structured(
    await handleJsonRpc(runtime, {
      id: 2,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { locale: "en" }, name: "info" }
    })
  );
}

export function burstKeys(repeat: 1 | 2) {
  return Array.from({ length: 10 }, (_, index) => v16FreshKey(repeat, index));
}

export function businessView(result: Record<string, unknown>) {
  const basket = Array.isArray(result.basket) ? result.basket : [];
  return {
    coverage: result.coverage ?? null,
    orderSchedule: result.orderSchedule ?? null,
    reasonCode: result.reasonCode ?? null,
    selectedOptionId: asRecord(result.selected).optionId ?? result.optionId ?? null,
    skuIds: basket.map((item) => String(asRecord(item).productId ?? "")),
    sources: basket.map((item) => String(asRecord(item).source ?? "")),
    status: result.status ?? null,
    totals: result.totals ?? result.price ?? null
  };
}

export { F_READY_MAG };
