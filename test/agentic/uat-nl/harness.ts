import { CURRENT_CONTRACT_SCHEMA_CHECKSUM } from "../../helpers/current-contract-lock.ts";
import { beginDeterministicIdsForTests, endDeterministicIdsForTests } from "../../../lib/agentic/capabilities.ts";
import { catalogueSnapshotId, freezeCatalogueSnapshot } from "../../../lib/agentic/catalogue/freeze.ts";
import { cachedLiveRetailSnapshot } from "../../../lib/agentic/catalogue/live.ts";
import {
  replaceCatalogueSnapshot,
  resetCatalogueSnapshotCache
} from "../../../lib/agentic/catalogue/snapshot.ts";
import type { CatalogueSnapshot } from "../../../lib/agentic/catalogue/types.ts";
import { AGENTIC_CONTRACT_VERSION, loadAgenticConfig } from "../../../lib/agentic/config.ts";
import { RESEARCH_VERSION } from "../../../lib/agentic/discovery/versions.ts";
import { AGENTIC_SCHEMA_CHECKSUM, resetInfoCache } from "../../../lib/agentic/info.ts";
import { handleJsonRpc } from "../../../lib/agentic/mcp/dispatcher.ts";
import { MATCHER_VERSION } from "../../../lib/matcher/config.ts";
import { resetMatchPlanCache } from "../../../lib/agentic/plan/matching.ts";
import {
  queryBudgetSnapshot,
  resetQueryBudget
} from "../../../lib/agentic/plan/query-budget.ts";
import { snapshotPlanInflightForTests } from "../../../lib/agentic/plan/service.ts";
import { resetFunnelLedger } from "../../../lib/agentic/funnel/ledger.ts";
import {
  persistedQueryCounts,
  resetQaPersistForTests
} from "../../../lib/agentic/qa/persist.ts";
import { resetQaSessions } from "../../../lib/agentic/qa/session.ts";
import { resetRequestTraces } from "../../../lib/agentic/qa/request-trace.ts";
import {
  resetResourcePermits,
  snapshotResourcePermits
} from "../../../lib/agentic/qa/resource-permits.ts";
import { resetServiceClock, useInjectedServiceClock as setInjectedServiceClock } from "../../../lib/agentic/qa/service-clock.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../../../lib/agentic/runtime.ts";
import { createSnapshotMemoryStore } from "../value/snapshot-store.ts";
import { createMockPaymentAdapter } from "../../../lib/agentic/commerce/payment.ts";
import { F_READY, UAT_NL_CLOCK, uatNlFreshKey } from "./manifest.ts";

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

export function beginUatNlRun() {
  process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT ?? "uat-nl";
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
  setInjectedServiceClock();
  if (frozenReal) {
    replaceCatalogueSnapshot(frozenReal);
  }
}

export function endUatNlRun() {
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

export function createUatNlRuntime(namespace = "qa-v3:uat-nl:dev") {
  if (!frozenReal) throw new Error("Call freezeRealThailandCatalogue before creating a real-catalogue runtime");
  const store = createSnapshotMemoryStore(frozenReal);
  const runtime = createAgenticRuntime({
    config: {
      ...loadAgenticConfig(),
      environment: "dev",
      internalQaHarness: true,
      paymentProvider: "mock",
      thailandRetailerAdapter: "mock_thailand"
    },
    now: UAT_NL_CLOCK,
    payment: createMockPaymentAdapter(),
    scope: {
      environment: "dev",
      principalScope: namespace,
      tenantScope: "mattanutra"
    },
    store
  });
  setAgenticRuntimeForTests(runtime);
  return { namespace, runtime, store };
}

export async function publicPlanCreate(
  runtime: AgenticRuntime,
  idempotencyKey: string,
  request: typeof F_READY = F_READY
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

export async function qaObserve(
  runtime: AgenticRuntime,
  args: Record<string, unknown>
) {
  const { handleQaJsonRpc } = await import("../../../lib/agentic/mcp/qa-dispatcher.ts");
  return structured(
    await handleQaJsonRpc(
      runtime,
      {
        id: 2,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: args, name: "observe" }
      },
      new Request("https://dev.mattanutra.com/api/mcp/qa", {
        headers: { "x-forwarded-for": "203.0.113.10" }
      })
    )
  );
}

export function burstKeys(repeat: 1 | 2) {
  return Array.from({ length: 10 }, (_, index) => uatNlFreshKey(repeat, index));
}

export async function tenBurst(
  runtime: AgenticRuntime,
  repeat: 1 | 2,
  hold: ReturnType<typeof deferred>
) {
  const keys = burstKeys(repeat);
  const pending = keys.map((key) => hold.promise.then(() => publicPlanCreate(runtime, key)));
  hold.resolve();
  return { keys, results: await Promise.all(pending) };
}

export function canonicalTuple(result: Record<string, unknown>) {
  const selected = asRecord(result.selected);
  const canonical = asRecord(result.canonical);
  return JSON.stringify({
    hash: String(canonical.hash ?? ""),
    optionId: String(selected.optionId ?? result.optionId ?? ""),
    schedule: result.orderSchedule ?? null,
    snapshotId: String(result.catalogueSnapshotId ?? result.snapshotId ?? "")
  });
}

export function reasonCodeOf(result: Record<string, unknown>) {
  const error = asRecord(result.error);
  return String(error.reasonCode ?? result.reasonCode ?? "");
}

export function counterTuple(observed: Record<string, unknown>, namespace: string) {
  const queries = asRecord(observed.queries);
  const budget = asRecord(observed.dependencyBudget);
  const persisted = persistedQueryCounts(namespace);
  const live = queryBudgetSnapshot(namespace);
  return {
    catalogueSnapshots: Number(budget.catalogueSnapshots ?? 0),
    liveSnapshot: Number(live["catalogue.snapshot.TH"] ?? 0),
    persistedSnapshot: Number(persisted["catalogue.snapshot.TH"] ?? 0),
    planMatch: Number(queries["plan.match"] ?? persisted["plan.match"] ?? 0),
    planMatchHit: Number(queries["plan.match.hit"] ?? persisted["plan.match.hit"] ?? 0),
    planMatchHits: Number(budget.planMatchHits ?? 0),
    planMatchMisses: Number(budget.planMatchMisses ?? 0),
    snapshotTH: Number(queries["catalogue.snapshot.TH"] ?? 0)
  };
}

export function orphanCensus() {
  const permits = snapshotResourcePermits();
  const inflight = snapshotPlanInflightForTests();
  return {
    admission: permits.admission,
    connection: permits.connection,
    database: permits.database,
    inflightIdempotency: inflight.idempotency,
    inflightMatches: inflight.matches,
    lock: permits.lock,
    worker: permits.worker
  };
}

export function assertSchemaLock() {
  if (AGENTIC_SCHEMA_CHECKSUM !== CURRENT_CONTRACT_SCHEMA_CHECKSUM) {
    throw new Error(`schema checksum moved: ${AGENTIC_SCHEMA_CHECKSUM}`);
  }
}
