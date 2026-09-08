import assert from "node:assert/strict";
import { test } from "node:test";
import { internalFixture, storedFixture } from "./helpers.ts";
import { readPlanStatus } from "../../lib/agentic/presentation/plan-read.ts";
import { publicPlanFields } from "../../lib/agentic/public-mapper.ts";

test("test_ready_status_and_conversation_share_primary_next_action", async () => {
  const result = internalFixture();
  const { app, handle } = await storedFixture(result);
  const status = await readPlanStatus(app, handle); assert.ok(status.ok);
  const conversationDecision = publicPlanFields(result);
  assert.equal(conversationDecision.operationalDecision.purchaseEligible, true);
  assert.equal(conversationDecision.nextActions[0], "confirm_with_user");
  assert.equal(status.nextActions[0], conversationDecision.nextActions[0]);
  assert.ok(!("options" in status), "Status remains a lightweight read");
});

test("conversation pack preserves no-purchase and pending primary actions", async () => {
  const original = internalFixture();
  for (const state of [
    { ...original, status: "processing" as const },
    { ...original, status: "no_purchase" as const, selected: null, basket: [], alternatives: [], coverage: [] },
    { ...original, status: "ready" as const, selected: null, basket: [], coverage: [] },
    { ...original, status: "needs_input" as const, selected: null, basket: [], questions: [] }
  ]) {
    const { app, handle } = await storedFixture(state);
    const status = await readPlanStatus(app, handle); assert.ok(status.ok);
    const expected = publicPlanFields(state);
    assert.equal(status.status, expected.status);
    assert.equal(status.nextActions[0], expected.nextActions[0]);
    assert.notEqual(status.nextActions[0], "confirm_with_user");
  }
});
