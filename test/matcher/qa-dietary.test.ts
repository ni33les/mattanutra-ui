import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { publicCoveragePercent } from "../../lib/matcher/explainer.ts";
import {
  QA_GOLD_CATALOG,
  qaRequest,
  qaTarget
} from "../../lib/matcher/qa/index.ts";

function ids(result: ReturnType<typeof match>) {
  return result.selected?.productIds ?? [];
}

describe("QA-GOLD dietary, source and demographic stacks", () => {
  it("E-01 vegan algae-only omega selects G-O3-ALGAE-500", () => {
    const result = match(
      qaRequest({
        dietaryPreference: "vegan",
        omega3SourcePreference: "algae_only",
        targets: [qaTarget("omega", 500, "mg", "Omega-3")]
      }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(result), ["G-O3-ALGAE-500"]);
    assert.equal(ids(result).includes("G-O3-FISH-1000"), false);
  });

  it("E-02 algae-named target does not select fish oil", () => {
    const result = match(
      qaRequest({
        targets: [qaTarget("omega", 500, "mg", "Algae omega-3")]
      }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(result), ["G-O3-ALGAE-500"]);
    assert.ok(result.rejected.some((item) => item.reason === "wrong_source"));
  });

  it("E-03 vegan collagen does not return animal collagen", () => {
    const result = match(
      qaRequest({
        dietaryPreference: "vegan",
        targets: [qaTarget("collagen", 5)]
      }),
      QA_GOLD_CATALOG
    );
    assert.equal(ids(result).includes("G-COLLAGEN-5G"), false);
    assert.ok(result.rejected.some((item) => item.reason === "vegan"));
    assert.ok(result.leftovers.some((item) => item.reason === "uncovered"));
  });

  it("E-04 vegan creatine is G-CREATINE-5G with zero pills", () => {
    const result = match(
      qaRequest({
        dietaryPreference: "vegan",
        targets: [qaTarget("creatine", 5)]
      }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(result), ["G-CREATINE-5G"]);
    assert.equal(result.selected?.dailyPills, 0);
  });

  it("E-05 male adult D3 excludes G-PRECARE", () => {
    const result = match(
      qaRequest({ targets: [qaTarget("d3", 2000)] }),
      QA_GOLD_CATALOG
    );
    assert.equal(ids(result).includes("G-PRECARE"), false);
    assert.ok(result.rejected.some((item) => item.reason === "life_stage"));
  });

  it("E-06 pregnant profile can select G-PRECARE", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
        targets: [
          qaTarget("folate", 400),
          qaTarget("iron", 18),
          qaTarget("iodine", 150),
          qaTarget("d3", 600)
        ]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(ids(result).includes("G-PRECARE"));
  });

  it("E-09 capsule plus algae-only does not relax either constraint", () => {
    const result = match(
      qaRequest({
        allowedForms: ["capsule"],
        omega3SourcePreference: "algae_only",
        targets: [qaTarget("omega", 500, "mg", "Algae omega-3"), qaTarget("mag", 200)]
      }),
      QA_GOLD_CATALOG
    );
    assert.equal(ids(result).includes("G-O3-FISH-1000"), false);
    assert.equal(ids(result).includes("G-O3-ALGAE-500"), false);
    assert.ok(ids(result).includes("G-MAG-200") || ids(result).includes("G-MAG-100"));
  });

  it("E-10 foreign USD SKU is excluded from a TH basket", () => {
    const result = match(
      qaRequest({ targets: [qaTarget("d3", 2000)] }),
      QA_GOLD_CATALOG
    );
    assert.equal(ids(result).includes("G-FOREIGN-D3"), false);
    assert.ok(result.rejected.some((item) => item.reason === "foreign_retailer"));
  });

  it("A-01 plant sterols are covered by G-STEROLS-2000", () => {
    const result = match(
      qaRequest({ targets: [qaTarget("sterols", 2000)] }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(result), ["G-STEROLS-2000"]);
    assert.equal(result.selected?.dailyPills, 0);
    assert.equal(publicCoveragePercent(result.selected), 100);
  });

  it("A-06 never selects the out-of-stock exact D3", () => {
    const catalog = {
      ...QA_GOLD_CATALOG,
      products: QA_GOLD_CATALOG.products.filter((item) =>
        ["G-OOS-D3-2000", "G-FOREIGN-D3"].includes(item.productId)
      )
    };
    const result = match(qaRequest({ targets: [qaTarget("d3", 2000)] }), catalog);
    assert.equal(ids(result).includes("G-OOS-D3-2000"), false);
    assert.ok(result.rejected.some((item) => item.reason === "oos"));
    assert.ok(result.leftovers.some((item) => item.reason === "uncovered"));
  });
});
