import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PANYA_CONFIG,
  panyaWelcomeFallbackReply,
  panyaWelcomeGenerationInput,
  panyaWelcomeReplyFromAiContent,
  resolvePanyaEntitlement,
  type PanyaWelcomeContext
} from "../lib/panya.ts";

function welcomeContext(
  selectedPlan: string | null = "precision"
): PanyaWelcomeContext {
  const entitlement = resolvePanyaEntitlement(selectedPlan);

  return {
    customer: {
      firstName: "Ari",
      locale: "en"
    },
    order: {
      orderNumber: "MN-1001",
      retailerName: "Chiang Mai Pharmacy",
      status: "packed",
      statusLabel: "Ready to ship",
      trackingUrl: "https://mattanutra.test/en/order/track/MN-1001"
    },
    plan: {
      entitlement,
      entitlementLabel:
        entitlement === "living_protocol"
          ? "Living Protocol"
          : entitlement === "right_amount_formula"
            ? "Right Amount Formula"
            : "Unpaid",
      formulaThemes: ["Magnesium (Minerals)", "Vitamin D3 (Vitamins)"],
      goals: ["Energy", "Sleep"],
      healthScore: {
        band: "Building",
        focusAreas: ["Sleep", "Recovery"],
        score: 72
      },
      planUrl: "https://mattanutra.test/en/nutrition/reveal?plan=plan-id",
      reassessmentUrl:
        "https://mattanutra.test/en/nutrition/quiz?plan=plan-id&reassessment=1",
      selectedPlan,
      selectedPlanLabel:
        selectedPlan === "pro"
          ? "Living Protocol"
          : selectedPlan === "precision"
            ? "Right Amount Formula"
            : "Unpaid",
      status: "ready"
    },
    planId: "00000000-0000-4000-8000-000000000001"
  };
}

describe("Nong Mata welcome helpers", () => {
  it("maps selected plans to the matching welcome brief", () => {
    assert.equal(resolvePanyaEntitlement("pro"), "living_protocol");
    assert.equal(resolvePanyaEntitlement("precision"), "right_amount_formula");
    assert.equal(resolvePanyaEntitlement(null), "unpaid");

    assert.equal(
      panyaWelcomeGenerationInput(
        DEFAULT_PANYA_CONFIG,
        welcomeContext("precision")
      ).welcomeBrief,
      DEFAULT_PANYA_CONFIG.welcomeBriefs.right_amount_formula
    );
  });

  it("passes rich but compact customer context to the AI payload", () => {
    const payload = panyaWelcomeGenerationInput(
      DEFAULT_PANYA_CONFIG,
      welcomeContext("precision")
    );

    assert.equal(payload.context.customer.firstName, "Ari");
    assert.equal(payload.context.plan.selectedPlanLabel, "Right Amount Formula");
    assert.deepEqual(payload.context.plan.formulaThemes, [
      "Magnesium (Minerals)",
      "Vitamin D3 (Vitamins)"
    ]);
    assert.equal(payload.context.plan.healthScore?.score, 72);
    assert.equal(payload.context.order?.statusLabel, "Ready to ship");
  });

  it("parses valid AI JSON and falls back when output is invalid", () => {
    assert.equal(
      panyaWelcomeReplyFromAiContent("{\"reply\":\"Welcome, Ari.\"}"),
      "Welcome, Ari."
    );
    assert.equal(panyaWelcomeReplyFromAiContent("{\"message\":\"Nope\"}"), null);
    assert.equal(panyaWelcomeReplyFromAiContent("not json"), null);

    const fallback = panyaWelcomeFallbackReply(welcomeContext("precision"));

    assert.match(fallback, /Ari/);
    assert.match(fallback, /Right Amount Formula/);
    assert.match(fallback, /https:\/\/mattanutra\.test/);
  });
});
