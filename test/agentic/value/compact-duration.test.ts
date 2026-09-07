import assert from "node:assert/strict";
import { it } from "node:test";
import { agenticMessage } from "../../../lib/agentic/i18n.ts";
import { buildCompactDecision, type CompactPlanView } from "../../../lib/agentic/value/compact-decision.ts";
import type { OperationalDecision } from "../../../lib/agentic/value/operational-decision.ts";

const review: OperationalDecision = { status: "no_purchase", nextAction: "review_options", purchaseEligible: false };

function currentStock(locale: string, durationUnknown: boolean): CompactPlanView {
  return {
    status: "no_purchase", selected: null,
    coverage: [{ name: "Magnesium", requestedAmount: 300, currentAmount: 300, deliveredAmount: 0,
      remainingGap: 0, unit: "mg", status: "already_covered" }],
    horizon: { durationUnknown, purchaseRequiredNow: false, nextReplenishmentDay: durationUnknown ? null : 30 },
    requestSnapshot: { locale, currentSupplements: [{ name: "Magnesium", dailyAmount: 300, unit: "mg",
      ...(durationUnknown ? {} : { daysRemaining: 30 }) }], targets: [{ name: "Magnesium", amount: 300, unit: "mg" }] }
  };
}

for (const locale of ["en", "th", "zh-CN"] as const) {
  it(`V5-DURATION-01 ${locale}: reviewing purchasable alternatives retains unknown stock duration in concise advice`, () => {
    const decision = buildCompactDecision(currentStock(locale, true), review);
    assert.ok(decision.why.includes(agenticMessage(locale, "plan.summary.review_options")));
    assert.ok(decision.why.includes(agenticMessage(locale, "plan.compact.why.duration_unknown")),
      "The concise explanation must disclose why future depletion and cash remain unknown");
    assert.deepEqual(decision.operationalDecision, review);
    assert.equal(decision.nextAction, agenticMessage(locale, "plan.next_action.review_options"));
    assert.equal(decision.when, decision.nextAction);
    assert.equal(decision.status, "no_purchase");
    assert.deepEqual(decision.cost, { cash30DayMinor: null, cash90DayMinor: null, firstOrderMinor: null, currency: "THB" });
    assert.ok(decision.what.includes(agenticMessage(locale, "plan.compact.what.dose", {
      name: "Magnesium", amount: 300, current: 300, delivered: 0, total: 300, gap: 0, unit: "mg"
    })));
  });
}

it("V5-DURATION-02 known current-stock duration does not receive unknown-duration advice", () => {
  const decision = buildCompactDecision(currentStock("en", false), review);
  assert.equal(decision.why, agenticMessage("en", "plan.summary.review_options"));
  assert.deepEqual(decision.operationalDecision, review);
});
