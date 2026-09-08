import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAgenticRuntime } from "../../lib/agentic/runtime.ts";
import { createMemoryStore } from "../../lib/agentic/store/memory.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { loadFrozenAnnaInput, reconstructAnnaSnapshot } from "../../lib/matcher/experiments/frozen-corpus.ts";
import { replaceCatalogueSnapshot, resetCatalogueSnapshotCache } from "../../lib/agentic/catalogue/snapshot.ts";
import { resetMatchPlanCache } from "../../lib/agentic/plan/matching.ts";
import { resetCataloguePins } from "../../lib/agentic/catalogue/pin.ts";
import { resetInfoCache } from "../../lib/agentic/info.ts";
import { resetQaPersistForTests } from "../../lib/agentic/qa/persist.ts";
import { resetServiceClock } from "../../lib/agentic/qa/service-clock.ts";
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";
import type { PlanRequest } from "../../lib/agentic/plan/types.ts";
import type { AgenticStore } from "../../lib/agentic/store/types.ts";

export const AX_CLOCK = "2026-09-07T00:00:00Z";
export const profiles = JSON.parse(readFileSync(new URL("../fixtures/ax-refinement/six-profiles.json", import.meta.url), "utf8")) as { id: string; request: PlanRequest }[];
export function profile(id: string): PlanRequest {
  const row = profiles.find(item => item.id === id); assert.ok(row, `Missing profile ${id}`);
  return structuredClone(row.request);
}
export async function installRealCatalogue(environment: "dev" | "uat" = "uat") {
  resetQaPersistForTests(); resetServiceClock(); resetMatchPlanCache(); resetCataloguePins(); resetInfoCache();
  const frozen = reconstructAnnaSnapshot(await loadFrozenAnnaInput(environment));
  replaceCatalogueSnapshot(frozen.snapshot);
  setMatcherSafetyCeilings(frozen.ceilings, { runtimeRevision: frozen.snapshot.runtimeRevision!, fingerprint: String(frozen.provenance.reconstructedReferenceFingerprint) });
  return frozen;
}
export function uninstallRealCatalogue() {
  replaceCatalogueSnapshot(null); resetCatalogueSnapshotCache(); resetMatcherSafetyCeilings(); resetCataloguePins(); resetInfoCache(); resetQaPersistForTests();
}
export function runtime(principal: string, store: AgenticStore = createMemoryStore()) {
  return createAgenticRuntime({ store, now: AX_CLOCK, scope: { environment: "dev", tenantScope: "mattanutra", principalScope: `ax-refinement:${principal}` } });
}
export async function rpc(instance: ReturnType<typeof runtime>, tool: string, args: Record<string, unknown>) {
  const response = await handleJsonRpc(instance, { id: 1, method: "tools/call", params: { name: tool, arguments: args } });
  assert.ok(response?.result?.structuredContent, JSON.stringify(response));
  return response.result.structuredContent as Record<string, any>;
}
export function barrier() {
  let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
