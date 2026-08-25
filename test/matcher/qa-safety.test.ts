import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateDailyExposure, isDoseError, scaleAmount } from "../../lib/matcher/dose.ts";
import { match } from "../../lib/matcher/index.ts";
import { evaluateSafety } from "../../lib/matcher/safety.ts";
import {
  QA_GOLD_CATALOG,
  QA_UNSAFE_ONLY,
  qaRequest,
  qaTarget
} from "../../lib/matcher/qa/index.ts";
import type { DoseVariant } from "../../lib/matcher/types.ts";

function ids(result: ReturnType<typeof match>) {
  return result.selected?.productIds ?? [];
}

function scaled(name: string, subjectId: string, amount: number, unit: "IU" | "mg") {
  const value = scaleAmount({ amount, subjectId, subjectName: name, unit });
  assert.equal(isDoseError(value), false);
  if (isDoseError(value)) {
    throw new Error(value.message);
  }
  return value;
}

describe("QA-GOLD safety stacks", () => {
  it("S-01 magnesium UL+1 cannot be silently selected", () => {
    const result = match(
      qaRequest({
        optimization: "lowest_cost",
        targets: [qaTarget("mag", 351)]
      }),
      QA_GOLD_CATALOG
    );
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    if (result.selected) {
      const mag = result.selected.exposure.totals.get("sup_mag");
      assert.ok(!mag || mag.units <= scaled("Magnesium", "sup_mag", 350, "mg").units);
    }
  });

  it("S-02 vitamin D 4001 IU cannot pass as a silent ready stack", () => {
    const result = match(
      qaRequest({ targets: [qaTarget("d3", 4001)] }),
      QA_GOLD_CATALOG
    );
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    if (result.selected) {
      const d3 = result.selected.exposure.totals.get("sup_d3");
      assert.ok(!d3 || d3.units <= scaled("Vitamin D3", "sup_d3", 4000, "IU").units);
    }
  });

  it("S-03 G-HIGH-TRAP is excluded before optimisation", () => {
    const result = match(qaRequest({ optimization: "lowest_cost" }), QA_GOLD_CATALOG);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    assert.ok(result.rejected.some((item) => item.productId === "G-HIGH-TRAP"));
  });

  it("S-10 CKD plus magnesium hard-blocks", () => {
    const result = match(
      qaRequest({
        conditionCodes: ["ckd"],
        targets: [qaTarget("mag", 200)]
      }),
      QA_GOLD_CATALOG
    );
    assert.equal(result.selected, null);
  });

  it("S-07 apixaban plus omega-3 requires acknowledgement, not a hard block", () => {
    const result = match(
      qaRequest({
        medicationCodes: ["apixaban"],
        targets: [qaTarget("omega", 1000)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected?.safety.hardBlocked, false);
    assert.equal(result.selected?.safety.requiresAck, true);
    assert.ok(
      result.selected?.safety.findings.some(
        (item) => item.code === "medication_interaction"
      )
    );
  });

  it("S-13 zinc UL+1 is blocked", () => {
    const amount = scaled("Zinc", "sup_zinc", 41, "mg");
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_zinc", amount]]),
      contributions: new Map([["sup_zinc", amount]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_zinc",
      unknownSafetyAmount: false,
      variantId: "prd_zinc:x1"
    };
    const exposure = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal(isDoseError(exposure), false);
    if (isDoseError(exposure)) {
      return;
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request: qaRequest({ targets: [qaTarget("zinc", 15)] }),
      variants: [variant]
    });
    assert.equal(safety.hardBlocked, true);
  });

  it("S-19 vegan algae-only cannot be overridden by a cheaper fish SKU", () => {
    const result = match(
      qaRequest({
        dietaryPreference: "vegan",
        omega3SourcePreference: "algae_only",
        optimization: "lowest_cost",
        targets: [qaTarget("omega", 500)]
      }),
      QA_GOLD_CATALOG
    );
    assert.equal(ids(result).includes("G-O3-FISH-1000"), false);
    assert.ok(result.rejected.some((item) => item.reason === "wrong_source" || item.reason === "vegan"));
  });

  it("S-20 unknown ingredient amount is quarantined", () => {
    const result = match(qaRequest({ targets: [qaTarget("d3", 2000)] }), {
      ...QA_GOLD_CATALOG,
      products: QA_GOLD_CATALOG.products.map((item) =>
        item.productId === "G-D3-2000"
          ? { ...item, unknownSafetyAmount: true }
          : item
      )
    });
    assert.equal(ids(result).includes("G-D3-2000"), false);
    assert.ok(result.rejected.some((item) => item.productId === "G-D3-2000"));
  });

  it("UNSAFE-ONLY is not selected even as the only covering SKU", () => {
    const result = match(qaRequest({ optimization: "lowest_cost" }), QA_UNSAFE_ONLY);
    assert.equal(result.selected, null);
  });
});
