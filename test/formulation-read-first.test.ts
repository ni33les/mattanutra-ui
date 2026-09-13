import assert from "node:assert/strict";
import { beforeEach, it, mock } from "node:test";

let states: unknown[] = [], refs: { current: unknown }[] = [], stateIndex = 0, refIndex = 0;
let effect: () => () => void, calls: { url: string; method: string }[] = [];
let readFails = false;
mock.module("react", { namedExports: {
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: typeof effect) => { effect = fn; },
  useState: (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
  },
  useRef: (initial: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial })
} });
mock.module("../lib/funnel-polling.ts", { namedExports: {
  assessmentPollKey: () => "historical-plan:en",
  fetchFunnelJson: async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    if (url.includes("/formulation?")) {
      if (readFails) throw new Error("temporary read failure");
      return { status: 200, data: { supplementBreakdown: [], resultVersion: "saved-result" } };
    }
    return { status: 200, data: { formulationStatus: "ready", readyForReveal: true, refreshPending: false, resultVersion: "saved-result" } };
  },
  pollFunnelStatus: async (options: { read: (s: AbortSignal) => Promise<unknown>; onValue: (v: unknown) => Promise<void>; ready: (v: unknown) => boolean; signal: AbortSignal }) => {
    const value = await options.read(options.signal);
    await options.onValue(value);
    return { status: options.ready(value) ? "ready" : "failed" };
  }
} });
const { useFormulationPolling } = await import("../components/nutrition-flow/use-formulation-polling.ts");
const settle = () => new Promise(resolve => setImmediate(resolve));
function RenderHarness(done: () => void) {
  stateIndex = refIndex = 0;
  return useFormulationPolling("historical-plan", "en", null, null, done);
}
beforeEach(() => { states = []; refs = []; calls = []; readFails = false; });

it("opening a completed reveal reads its saved result without requesting regeneration", async () => {
  let completed = 0;
  RenderHarness(() => { completed++; });
  const cleanup = effect(); await settle(); cleanup();
  assert.equal(completed, 1);
  assert.ok(calls.some(call => call.url.includes("/formulation?")));
  assert.ok(calls.every(call => call.method === "GET"));
});

it("a failed reveal read remains read-only until the customer explicitly retries", async () => {
  readFails = true;
  const hook = RenderHarness(() => {});
  const cleanup = effect(); await settle(); cleanup();
  assert.ok(calls.every(call => call.method === "GET"));
  assert.equal(RenderHarness(() => {}).failed, true);
  hook.retry(); readFails = false;
  let completed = 0; RenderHarness(() => { completed++; });
  const retryCleanup = effect(); await settle(); retryCleanup();
  assert.equal(completed, 1);
  assert.deepEqual(calls.filter(call => call.method === "POST").map(call => call.url),
    ["/api/assessment/historical-plan/formulation/refresh"]);
});

it("an accepted empty formulation completes without a regeneration loop", async () => {
  RenderHarness(() => {});
  const cleanup = effect(); await settle(); cleanup();
  const hook = RenderHarness(() => {});
  assert.equal(hook.loadState, "ready");
  assert.deepEqual(hook.result?.supplementBreakdown, []);
  assert.equal(calls.filter(call => call.method === "POST").length, 0);
});

it("a frozen pharmacy receipt does not load a newer formula or start recovery", async () => {
  stateIndex = refIndex = 0;
  const hook = useFormulationPolling("historical-plan", "en", null, null, () => {}, false);
  assert.equal(effect(), undefined);
  await settle();
  assert.deepEqual(calls, []);
  assert.equal(hook.failed, false);
});
