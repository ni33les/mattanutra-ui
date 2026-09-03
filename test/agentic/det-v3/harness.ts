import { createHash } from "node:crypto";
import {
  beginDeterministicIdsForTests,
  endDeterministicIdsForTests
} from "../../../lib/agentic/capabilities.ts";
import { loadAgenticConfig } from "../../../lib/agentic/config.ts";
import { handleJsonRpc } from "../../../lib/agentic/mcp/dispatcher.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../../../lib/agentic/runtime.ts";
import { createMemoryStore } from "../../../lib/agentic/store/memory.ts";
import { createMockPaymentAdapter } from "../../../lib/agentic/commerce/payment.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "../../helpers/gold-catalogue.ts";
import { flushFunnelProcessCache, resetFunnelLedger } from "../../../lib/agentic/funnel/ledger.ts";
import { resetCatalogueSnapshotCache } from "../../../lib/agentic/catalogue/snapshot.ts";
import { resetQaPersistForTests } from "../../../lib/agentic/qa/persist.ts";
import { resetQaSessions } from "../../../lib/agentic/qa/session.ts";
import { resetQueryBudget } from "../../../lib/agentic/plan/query-budget.ts";
import { resetInfoCache } from "../../../lib/agentic/info.ts";
import { DET_V3_BUILD_ID, DET_V3_CLOCK } from "./manifest.ts";

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

export function firstDivergence(left: unknown, right: unknown, path = "$"): string | null {
  if (canonicalJson(left) === canonicalJson(right)) {
    return null;
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const keys = new Set([
      ...Object.keys(left as object),
      ...Object.keys(right as object)
    ]);
    for (const key of [...keys].sort()) {
      const hit = firstDivergence(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`
      );
      if (hit) {
        return hit;
      }
    }
  }
  return path;
}

export function namespace(runId: string, testId: string) {
  return `${runId}/${testId}`;
}

export function beginDetRun(runId: string) {
  process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT ?? "det-v3";
  beginDeterministicIdsForTests();
  installGoldCatalogue();
  resetFunnelLedger();
  resetQaSessions();
  resetQaPersistForTests();
  resetQueryBudget();
  resetInfoCache();
  return runId;
}

export function simulateInstanceRestart() {
  resetQaSessions();
  resetCatalogueSnapshotCache();
  flushFunnelProcessCache();
  resetQueryBudget();
}

export function endDetRun() {
  setAgenticRuntimeForTests(null);
  uninstallGoldCatalogue();
  endDeterministicIdsForTests();
  resetFunnelLedger();
  resetQaSessions();
  resetQaPersistForTests();
  resetQueryBudget();
  resetInfoCache();
}

export function createDetRuntime(input?: Readonly<{ now?: string; principal?: string }>) {
  const config = {
    ...loadAgenticConfig(),
    buildId: DET_V3_BUILD_ID,
    environment: "dev" as const,
    internalQaHarness: true,
    paymentProvider: "mock" as const,
    thailandRetailerAdapter: "mock_thailand" as const
  };
  const runtime = createAgenticRuntime({
    config,
    now: input?.now ?? DET_V3_CLOCK,
    payment: createMockPaymentAdapter(),
    scope: {
      environment: "dev",
      principalScope: input?.principal ?? "det-v3",
      tenantScope: "mattanutra"
    },
    store: createMemoryStore()
  });
  setAgenticRuntimeForTests(runtime);
  return runtime;
}

export async function detCall(
  runtime: AgenticRuntime,
  name: string,
  args: unknown
) {
  const response = await handleJsonRpc(runtime, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: args, name }
  });
  return (response?.result?.structuredContent ?? response?.result ?? {}) as Record<string, unknown>;
}

export async function detListTools(runtime: AgenticRuntime, locale?: string) {
  const response = await handleJsonRpc(runtime, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/list",
    params: locale ? { locale } : {}
  });
  return ((response?.result?.tools as Array<{ description: string; name: string }>) ?? []);
}

export function stepClock(from: string, steps: number) {
  return new Date(Date.parse(from) + steps * 10 * 60 * 1000).toISOString();
}

export async function runTwice<T>(work: (runId: string) => Promise<T>): Promise<T> {
  const first = await work("run-a");
  const second = await work("run-b");
  if (canonicalJson(first) !== canonicalJson(second)) {
    throw new Error(
      `DET_V3_DIVERGENCE ${firstDivergence(first, second) ?? "unknown"}`
    );
  }
  return first;
}
