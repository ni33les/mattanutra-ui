import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { profile, runtime, rpc, installRealCatalogue, uninstallRealCatalogue, barrier } from "./helpers.ts";
import { setMatcherGateForTests, setMatcherEnteredForTests, resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { advanceServiceClock } from "../../lib/agentic/qa/service-clock.ts";

afterEach(() => { setMatcherGateForTests(null); setMatcherEnteredForTests(null); resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });

test("AXR-REL-02 a held real matcher hands off at its existing return budget without publishing a basket", { timeout: 30000 }, async () => {
  await installRealCatalogue();
  const instance = runtime("handoff"), held = barrier(), entered = barrier();
  setMatcherGateForTests(held.promise); setMatcherEnteredForTests(entered.release);
  let response: Record<string, any> | undefined;
  const pending = rpc(instance, "plan", { operation: "create", idempotencyKey: "ax-refinement-held-a2", request: profile("A2") }).then(value => { response = value; return value; });
  try {
    await Promise.race([entered.promise, pending.then(result => { throw new Error(`Returned before barrier: ${JSON.stringify(result)}`); })]);
    advanceServiceClock(3000);
    await nextTurn(); await nextTurn();
    assert.ok(response, "The 3-second handoff must return while matching remains held");
    assert.equal(response.status, "processing");
    assert.equal(response.ok, true);
    assert.equal(response.operationalDecision.nextAction, "poll_plan");
    assert.ok(response.planHandle && response.pollAfterSeconds > 0);
    assert.equal(response.basket, undefined);
  } finally {
    held.release(); await pending;
  }
});
