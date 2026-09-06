import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { ensureCatalogueSnapshot, ensureQaCatalogueSnapshot, replaceCatalogueSnapshot } from "../lib/agentic/catalogue/snapshot.ts";
import { flushMatchingCatalogueCaches } from "../lib/agentic/catalogue/flush.ts";
import { persistCataloguePin, resetCataloguePins, restoreCataloguePin } from "../lib/agentic/catalogue/pin.ts";
import { catalogueSnapshotId } from "../lib/agentic/catalogue/freeze.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { normalizePlanRequest, planRematchFingerprint } from "../lib/agentic/plan/normalize.ts";
import { createAgenticRuntime, type AgenticRuntime } from "../lib/agentic/runtime.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { resetPlanCreateInflightForTests, setPlanClaimLatchForTests, setMatcherGateForTests, setMatcherEnteredForTests } from "../lib/agentic/plan/service.ts";
import { resetExecuteLockState } from "../lib/agentic/commerce/execute.ts";
import { runObservedRequest, recordRequestStage, listRequestTraces, resetRequestTraces, REQUEST_TRACE_LIMIT } from "../lib/agentic/qa/request-trace.ts";
import { resetServiceClock, advanceServiceClock } from "../lib/agentic/qa/service-clock.ts";
import { resetResourcePermits, setPermitCapacity, queuedPermitOrder, snapshotResourcePermits } from "../lib/agentic/qa/resource-permits.ts";
import { withRequestLifetime } from "../lib/request-lifetime.ts";
import { feedbackTool } from "../lib/agentic/feedback.ts";

const request = {
  destinationCountry: "TH", locale: "en", optimization: "balanced",
  profile: { ageYears: 38, lifeStage: "adult", sex: "male" }, requirements: {},
  targets: [{ name: "Vitamin D3", amount: 1000, unit: "IU" }]
};

beforeEach(() => {
  installGoldCatalogue(); resetPlanCreateInflightForTests(); resetExecuteLockState();
  resetResourcePermits(); resetServiceClock(); resetRequestTraces();
});
afterEach(() => { uninstallGoldCatalogue(); resetCataloguePins(); setMatcherGateForTests(null); setMatcherEnteredForTests(null); });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
let rpcId = 0;
async function call(runtime: AgenticRuntime, args: Record<string, unknown>) {
  const response = await handleJsonRpc(runtime, { id: ++rpcId, method: "tools/call", params: { name: "plan", arguments: args } });
  return response!.result!.structuredContent as Record<string, any>;
}

describe("MCP reliability: catalogue persistence and cache isolation", () => {
  it("keeps a QA publication frozen while refreshing live customer snapshots", async () => {
    const qa = await ensureQaCatalogueSnapshot("dev");
    flushMatchingCatalogueCaches();
    replaceCatalogueSnapshot({ ...fixtureSnapshot(), catalogueVersion: "retail-TH-updated" });
    const live = await ensureCatalogueSnapshot("dev", "TH");
    assert.equal(live.catalogueVersion, "retail-TH-updated");
    assert.equal((await ensureQaCatalogueSnapshot("dev")).catalogueVersion, qa.catalogueVersion);
  });

  it("does not reuse the Thailand catalogue for another destination", async () => {
    const th = await ensureCatalogueSnapshot("dev", "TH");
    const sg = await ensureCatalogueSnapshot("dev", "SG");
    assert.ok(th.products.length > 0);
    assert.equal(sg.products.length, 0);
    assert.match(sg.catalogueVersion, /^retail-SG-/);
  });

  it("recovers an exact pinned snapshot from the store after a process-cache reset", async () => {
    const store = createMemoryStore();
    const snapshot = fixtureSnapshot();
    await persistCataloguePin(snapshot, "test", store);
    resetCataloguePins();
    assert.deepEqual(await restoreCataloguePin(catalogueSnapshotId(snapshot), "test", store), snapshot);
    assert.equal(await restoreCataloguePin("snap_missing", "test", store), null);
  });

  it("invalidates matching when either retention requirement changes", async () => {
    const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), request, snapshot: fixtureSnapshot() });
    assert.ok("state" in normalized);
    for (const requirements of [{ retainProductIds: ["prd_keep"] }, { retainSupplementIds: ["sup_keep"] }]) {
      assert.notEqual(planRematchFingerprint(normalized.state), planRematchFingerprint({
        ...normalized.state, requirements: { ...normalized.state.requirements, ...requirements }
      }));
    }
  });
});

describe("MCP reliability: atomic plan and checkout commands", () => {
  it("keeps the previous revision readable after an invalid edit", async () => {
    const runtime = createAgenticRuntime();
    const created = await call(runtime, { operation: "create", idempotencyKey: "review-invalid-create", request });
    assert.equal(created.status, "ready");
    const invalid = await call(runtime, { operation: "revise", idempotencyKey: "review-invalid-revise", planHandle: created.planHandle,
      expectedRevision: created.revision, request: { ...request, targets: [{ name: "Magnesium", amount: 100, unit: "IU" }] } });
    assert.equal(invalid.error.reasonCode, "unsupported_unit");
    const read = await call(runtime, { operation: "get", planHandle: created.planHandle });
    assert.equal(read.ok, true);
    assert.equal(read.revision, created.revision);
    assert.equal(read.status, "ready");
  });

  it("can edit a stored plan after losing all process-local pins", async () => {
    const runtime = createAgenticRuntime();
    const created = await call(runtime, { operation: "create", idempotencyKey: "review-restart-create", request });
    resetCataloguePins();
    const revised = await call(runtime, { operation: "revise", idempotencyKey: "review-restart-revise", planHandle: created.planHandle,
      expectedRevision: created.revision, request: { ...request, targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU" }] } });
    assert.equal(revised.ok, true, JSON.stringify(revised));
    assert.equal(revised.revision, 2);
  });

  it("rejects different concurrent payloads with the same idempotency key", async () => {
    const runtime = createAgenticRuntime();
    const gate = deferred(), entered = deferred();
    const key = "review-payload-conflict";
    setPlanClaimLatchForTests(key, gate.promise, entered.resolve);
    const first = call(runtime, { operation: "create", idempotencyKey: key, request });
    await entered.promise;
    const second = await call(runtime, { operation: "create", idempotencyKey: key, request: { ...request, targets: [{ name: "Magnesium", amount: 100, unit: "mg" }] } });
    gate.resolve();
    setPlanClaimLatchForTests(key, null);
    assert.equal((await first).ok, true);
    assert.equal(second.error.reasonCode, "idempotency_conflict");
  });

  it("publishes only one of two concurrent edits to the same revision", async () => {
    const runtime = createAgenticRuntime();
    const created = await call(runtime, { operation: "create", idempotencyKey: "review-race-create", request });
    const gate = deferred(), entered = deferred();
    let count = 0;
    setMatcherGateForTests(gate.promise);
    setMatcherEnteredForTests(() => { if (++count === 2) entered.resolve(); });
    const edit = (amount: number) => call(runtime, { operation: "revise", idempotencyKey: "review-race-edit-" + amount,
      planHandle: created.planHandle, expectedRevision: 1, request: { ...request, targets: [{ name: "Vitamin D3", amount, unit: "IU" }] } });
    const pending = [edit(1500), edit(2000)];
    await entered.promise;
    const reading = await call(runtime, { operation: "get", planHandle: created.planHandle });
    assert.equal(reading.revision, 1);
    gate.resolve();
    const results = await Promise.all(pending);
    assert.equal(results.filter(r => r.ok).length, 1, JSON.stringify(results));
    assert.equal(results.find(r => !r.ok)?.error.reasonCode, "stale_revision");
  });

  it("reuses one order across independent executor instances", async () => {
    const runtime = createAgenticRuntime();
    let orders = 0;
    const insert = runtime.store.insertOrder;
    runtime.store.insertOrder = async order => { orders++; await insert(order); };
    const plan = await call(runtime, { operation: "create", idempotencyKey: "review-orders-create", request });
    const [a, b] = await Promise.all([1, 2].map(n => import(new URL("../lib/agentic/commerce/execute.ts?replica=" + n, import.meta.url).href)));
    const input = { ...runtime, now: new Date().toISOString(), planHandle: plan.planHandle, expectedRevision: plan.revision };
    const results = await Promise.all([
      a.executeTool({ ...input, idempotencyKey: "review-orders-first" }),
      b.executeTool({ ...input, idempotencyKey: "review-orders-second" })
    ]);
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, true);
    assert.equal(results[0].orderHandle, results[1].orderHandle);
    assert.equal(orders, 1);
  });

  it("rolls back feedback if its idempotency record cannot commit", async () => {
    const runtime = createAgenticRuntime();
    const plan = await call(runtime, { operation: "create", idempotencyKey: "review-feedback-create", request });
    const ids: string[] = [];
    const insertFeedback = runtime.store.insertFeedback;
    const insertIdempotency = runtime.store.insertIdempotency;
    runtime.store.insertFeedback = async row => { ids.push(row.id); await insertFeedback(row); };
    runtime.store.insertIdempotency = async () => { throw new Error("test_commit_failure"); };
    const input = { ...runtime, now: new Date().toISOString(), planHandle: plan.planHandle, expectedRevision: plan.revision,
      consentConfirmed: true, rating: 4, summary: "Helpful options", idempotencyKey: "review-feedback-submit" };
    await assert.rejects(feedbackTool(input), /test_commit_failure/);
    assert.equal(await runtime.store.getFeedback(ids[0]), null);
    runtime.store.insertIdempotency = insertIdempotency;
    const results = await Promise.all([feedbackTool(input), feedbackTool(input)]);
    assert.equal(results.every(r => r.ok), true);
    assert.equal((await Promise.all(ids.map(id => runtime.store.getFeedback(id)))).filter(Boolean).length, 1);
  });
});

describe("MCP reliability: bounded request lifetimes", () => {
  it("expires a queued request without starting it or leaving a waiter", async () => {
    setPermitCapacity("admission", 0);
    let started = false;
    const pending = runObservedRequest("review-queued", async () => { started = true; return { ok: true }; });
    advanceServiceClock(60_001);
    const result = await pending;
    assert.ok("error" in result);
    assert.equal(result.error.reasonCode, "SERVICE_DEADLINE_EXCEEDED");
    assert.equal(started, false);
    assert.deepEqual(queuedPermitOrder(), []);
    assert.equal(Object.values(snapshotResourcePermits()).every(n => n === 0), true);
    setPermitCapacity("admission", 32);
    assert.equal(started, false);
  });

  it("cancels admission when the HTTP request aborts", async () => {
    setPermitCapacity("admission", 0);
    const controller = new AbortController();
    let started = false;
    const pending = withRequestLifetime({ signal: controller.signal }, () =>
      runObservedRequest("review-http-abort", async () => { started = true; return { ok: true }; }));
    controller.abort();
    assert.equal((await pending).ok, false);
    assert.equal(started, false);
    assert.deepEqual(queuedPermitOrder(), []);
  });

  it("bounds diagnostic retention after requests finish", async () => {
    for (let i = 0; i < REQUEST_TRACE_LIMIT + 10; i++) {
      const id = "review-retention-" + i;
      await runObservedRequest(id, () => recordRequestStage(id, "ingress_accepted"));
    }
    assert.ok(listRequestTraces().length <= REQUEST_TRACE_LIMIT);
  });
});
