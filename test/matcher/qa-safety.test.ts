import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateDailyExposure, isDoseError, scaleAmount } from "../../lib/matcher/dose.ts";
import { match } from "../../lib/matcher/index.ts";
import { evaluateSafety } from "../../lib/matcher/safety.ts";
import {
  QA_GOLD_CATALOG,
  QA_UNSAFE_ONLY,
  qaCatalogSafetyCeilings,
  qaRequest,
  qaTarget
} from "../../lib/matcher/qa/index.ts";
import { qaProduct } from "../../lib/matcher/qa/product.ts";
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

  it("S-03 G-HIGH-TRAP stays eligible and loses on dose fit", () => {
    const result = match(qaRequest({ optimization: "lowest_cost" }), QA_GOLD_CATALOG);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    assert.equal(result.rejected.some((item) => item.productId === "G-HIGH-TRAP"), false);
  });

  it("S-10 CKD plus magnesium gives actionable advice without blocking", () => {
    const result = match(
      qaRequest({
        conditionCodes: ["ckd"],
        targets: [qaTarget("mag", 200)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected.safety.hardBlocked, false);
    assert.ok(result.selected.safety.findings.some((row) => row.code === "condition_review_required" && row.severity === "high"));
  });

  it("S-07 apixaban plus omega-3 gives serious advice without mandatory acknowledgement", () => {
    const result = match(
      qaRequest({
        medicationCodes: ["apixaban"],
        targets: [qaTarget("omega", 1000)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected?.safety.hardBlocked, false);
    assert.equal(result.selected?.safety.requiresAck, false);
    assert.ok(
      result.selected?.safety.findings.some(
        (item) => item.code === "medication_interaction"
      )
    );
  });

  it("S-13 zinc UL+1 gives dose advice", () => {
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
      assert.fail("Unexpected fixture precondition failure");
    }
    const safety = evaluateSafety({
      exposure,
      products: [],
      request: qaRequest({ targets: [qaTarget("zinc", 15)] }),
      variants: [variant]
    });
    assert.equal(safety.hardBlocked, false);
    assert.ok(safety.findings.some((row) => row.code === "dose_review_required" && row.severity === "high" && row.action === "inform"));
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

  it("S-20 unknown ingredient amount remains visible as uncertainty", () => {
    const result = match(qaRequest({ targets: [qaTarget("d3", 2000)] }), {
      ...QA_GOLD_CATALOG,
      products: QA_GOLD_CATALOG.products.map((item) =>
        item.productId === "G-D3-2000"
          ? { ...item, unknownSafetyAmount: true }
          : item
      )
    });
    assert.equal(ids(result).includes("G-D3-2000"), true);
    assert.equal(result.rejected.some((item) => item.productId === "G-D3-2000"), false);
    assert.ok(result.selected?.safety.findings.some((row) => row.uncertainty?.includes("unknown_product_amount")));
  });

  it("prefers a lower-penalty stack when labelled zinc would exceed the adult UL", () => {
    const catalog = {
      ...QA_GOLD_CATALOG,
      products: [
        ...QA_GOLD_CATALOG.products,
        qaProduct({
          facts: [
            { amount: 200, key: "mag" },
            { amount: 30, key: "zinc" }
          ],
          id: "MULTI-ZN-30",
          priceThb: 180
        }),
        qaProduct({
          facts: [
            { amount: 2000, key: "d3" },
            { amount: 20, key: "zinc" }
          ],
          id: "D3-ZN-20",
          priceThb: 170
        })
      ]
    };
    const result = match(
      qaRequest({
        maxProductCount: 2,
        targets: [qaTarget("mag", 200), qaTarget("d3", 2000)]
      }),
      catalog
    );
    const selected = ids(result);
    assert.equal(
      selected.includes("MULTI-ZN-30") && selected.includes("D3-ZN-20"),
      false
    );
  });

  it("uses the pregnant zinc UL, not the adult UL, for a pregnant profile", () => {
    const zincCeilings = qaCatalogSafetyCeilings().map((ceiling) =>
      ceiling.subjectId === "sup_zinc" && ceiling.lifeStage === "pregnant"
        ? { ...ceiling, maxAmount: 25 }
        : ceiling
    );
    const catalog = {
      ...QA_GOLD_CATALOG,
      products: [
        qaProduct({
          facts: [
            { amount: 200, key: "mag" },
            { amount: 15, key: "zinc" }
          ],
          id: "MULTI-ZN-15",
          priceThb: 180
        }),
        qaProduct({
          facts: [
            { amount: 2000, key: "d3" },
            { amount: 15, key: "zinc" }
          ],
          id: "D3-ZN-15",
          priceThb: 170
        })
      ]
    };
    const result = match(
      qaRequest({
        maxProductCount: 2,
        profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
        safetyCeilings: zincCeilings,
        targets: [qaTarget("mag", 200), qaTarget("d3", 2000)]
      }),
      catalog
    );
    const selected = ids(result);
    assert.equal(
      selected.includes("MULTI-ZN-15") && selected.includes("D3-ZN-15"),
      true
    );
    const zinc = result.selected?.doseFit?.perLimit.find((row) => row.subjectId === "sup_zinc");
    assert.equal(zinc?.limit, 25);
    assert.equal(zinc?.exposure, 30);
    assert.equal(zinc?.excess, 0.2);
    assert.ok(result.selected?.safety.findings.some((row) => row.subjectId === "sup_zinc" && row.code === "dose_review_required"));
  });

  it("reports unknown reference when zinc has no UL for this life stage", () => {
    const withoutPregnantZinc = qaCatalogSafetyCeilings().filter(
      (ceiling) =>
        !(ceiling.subjectId === "sup_zinc" && ceiling.lifeStage === "pregnant")
    );
    const catalog = {
      ...QA_GOLD_CATALOG,
      products: [
        qaProduct({
          facts: [
            { amount: 200, key: "mag" },
            { amount: 10, key: "zinc" }
          ],
          id: "MULTI-ZN-10",
          priceThb: 180
        })
      ]
    };
    const result = match(
      qaRequest({
        profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
        safetyCeilings: withoutPregnantZinc,
        targets: [qaTarget("mag", 200)]
      }),
      catalog
    );
    assert.equal(ids(result).includes("MULTI-ZN-10"), true);
    assert.ok(result.selected?.safety.findings.some((row) => row.uncertainty?.includes("no_applicable_reference:sup_zinc")));
  });

  it("UNSAFE-ONLY produces a valid no-new-products option if its penalty is worse", () => {
    const result = match(qaRequest({ optimization: "lowest_cost" }), QA_UNSAFE_ONLY);
    assert.deepEqual(result.selected?.productIds, []);
  });
});
