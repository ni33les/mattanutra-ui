import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { publicCoveragePercent } from "../../lib/matcher/explainer.ts";
import {
  QA_GOLD_CATALOG,
  QA_GOLD_VERSION,
  qaGoldIds,
  qaRequest,
  qaTarget,
  resolveQaSubject
} from "../../lib/matcher/qa/index.ts";

function ids(result: ReturnType<typeof match>) {
  return result.selected?.productIds ?? [];
}

describe("QA-GOLD-v1 catalogue", () => {
  it("loads the versioned SKU table including trap, oos, foreign, prenatal and K2", () => {
    assert.equal(QA_GOLD_CATALOG.catalogueVersion, QA_GOLD_VERSION);
    const set = new Set(qaGoldIds());
    for (const id of [
      "G-BASE-COMBO",
      "G-O3-FISH-1000",
      "G-HIGH-TRAP",
      "G-OOS-D3-2000",
      "G-FOREIGN-D3",
      "G-PRECARE",
      "G-K2-MK7-100",
      "G-C-500",
      "G-INCIDENTAL-C"
    ]) {
      assert.equal(set.has(id), true, id);
    }
  });

  it("M-01 fewest_pills golden is G-BASE-COMBO + G-O3-FISH-1000", () => {
    const result = match(qaRequest({ optimization: "fewest_pills" }), QA_GOLD_CATALOG);
    assert.deepEqual(ids(result), ["G-BASE-COMBO", "G-O3-FISH-1000"]);
    assert.equal(result.selected?.dailyPills, 4);
    assert.equal(result.selected?.productCount, 2);
    assert.equal(publicCoveragePercent(result.selected), 100);
    assert.equal(result.selected?.incidentalCount, 0);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
  });

  it("M-02 lowest_cost does not select G-HIGH-TRAP", () => {
    const result = match(qaRequest({ optimization: "lowest_cost" }), QA_GOLD_CATALOG);
    assert.ok(result.selected);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    assert.equal(publicCoveragePercent(result.selected) >= 90, true);
  });

  it("M-03 best_coverage prefers exact 100% over the trap", () => {
    const result = match(qaRequest({ optimization: "best_coverage" }), QA_GOLD_CATALOG);
    assert.equal(publicCoveragePercent(result.selected), 100);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
  });

  it("M-04 balanced is deterministic across repeats", () => {
    const request = qaRequest({ optimization: "balanced" });
    const first = ids(match(request, QA_GOLD_CATALOG));
    const second = ids(match(request, QA_GOLD_CATALOG));
    assert.deepEqual(second, first);
    assert.ok(first.length > 0);
  });

  it("M-05 maxProductCount=2 and maxDailyPills=4 keeps the golden combo", () => {
    const result = match(
      qaRequest({
        maxDailyPills: 4,
        maxProductCount: 2,
        optimization: "fewest_pills"
      }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(result), ["G-BASE-COMBO", "G-O3-FISH-1000"]);
  });

  it("M-06 maxProductCount=1 does not invent omega coverage", () => {
    const result = match(qaRequest({ maxProductCount: 1 }), QA_GOLD_CATALOG);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    assert.ok(result.selected == null || result.selected.productCount <= 1);
    assert.ok(
      result.leftovers.some((item) => item.reason === "uncovered" || item.reason === "dose_gap") ||
        publicCoveragePercent(result.selected) < 100
    );
  });

  it("M-07 budget below the cheapest complete stack never selects the trap", () => {
    const result = match(qaRequest({ maxPriceMinor: 64_900 }), QA_GOLD_CATALOG);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
  });

  it("M-08 tablets only excludes softgel and capsule SKUs", () => {
    const result = match(qaRequest({ allowedForms: ["tablet"] }), QA_GOLD_CATALOG);
    assert.equal(ids(result).some((id) => /FISH|ALGAE|COMBO|MAG/i.test(id)), false);
    assert.ok(result.rejected.some((item) => item.reason === "form"));
  });

  it("M-09 powder only does not select pill products", () => {
    const result = match(qaRequest({ allowedForms: ["powder"] }), QA_GOLD_CATALOG);
    for (const id of ids(result)) {
      assert.match(id, /CREATINE|COLLAGEN/);
    }
    assert.ok(result.leftovers.some((item) => item.reason === "uncovered"));
  });

  it("M-10 excluding the combo SKU from the catalogue keeps it out of the basket", () => {
    const catalog = {
      ...QA_GOLD_CATALOG,
      products: QA_GOLD_CATALOG.products.filter((item) => item.productId !== "G-BASE-COMBO")
    };
    const result = match(qaRequest(), catalog);
    assert.equal(ids(result).includes("G-BASE-COMBO"), false);
  });

  it("M-12 a fully covered current target does not buy another D3", () => {
    const result = match(
      qaRequest({
        currentSupplements: [
          {
            daily: qaTarget("d3", 2000).requested,
            dailyAmount: 2000,
            name: "Vitamin D3",
            sourceId: "current-d3",
            subjectId: "sup_d3",
            unit: "IU"
          }
        ],
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 2000)]
      }),
      QA_GOLD_CATALOG
    );
    assert.equal(ids(result).some((id) => /D3|COMBO|TRAP|PRECARE/i.test(id)), false);
    assert.equal(publicCoveragePercent(result.selected), 100);
  });

  it("M-13 remaining 1000 IU of D3 selects G-D3-1000", () => {
    const result = match(
      qaRequest({
        currentSupplements: [
          {
            daily: qaTarget("d3", 1000).requested,
            dailyAmount: 1000,
            name: "Vitamin D3",
            sourceId: "current-d3",
            subjectId: "sup_d3",
            unit: "IU"
          }
        ],
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 2000)]
      }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(result), ["G-D3-1000"]);
    assert.equal(publicCoveragePercent(result.selected), 100);
  });

  it("M-14 D3 aliases resolve to one subject", () => {
    assert.equal(resolveQaSubject("Vitamin D")?.id, "sup_d3");
    assert.equal(resolveQaSubject("Cholecalciferol")?.id, "sup_d3");
    assert.equal(resolveQaSubject("D3")?.id, "sup_d3");
  });

  it("M-15 D3 50 mcg is equivalent to 2000 IU", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 50, "mcg")]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(ids(result).includes("G-D3-2000") || ids(result).includes("G-BASE-COMBO"));
    assert.equal(publicCoveragePercent(result.selected), 100);
  });

  it("M-16 magnesium 0.2 g matches the 200 mg product", () => {
    const mg = match(
      qaRequest({ optimization: "lowest_cost", targets: [qaTarget("mag", 200)] }),
      QA_GOLD_CATALOG
    );
    const grams = match(
      qaRequest({ optimization: "lowest_cost", targets: [qaTarget("mag", 0.2, "g")] }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(grams), ids(mg));
    assert.equal(publicCoveragePercent(grams.selected), 100);
  });

  it("M-17 target order does not change the selected option", () => {
    const forward = match(qaRequest(), QA_GOLD_CATALOG);
    const reverse = match(
      qaRequest({ targets: [...qaRequest().targets].reverse() }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(reverse), ids(forward));
  });

  it("M-18 repeated runs are identical", () => {
    const request = qaRequest();
    const first = match(request, QA_GOLD_CATALOG);
    const snapshot = JSON.stringify({
      ids: ids(first),
      leftovers: first.leftovers
    });
    for (let index = 0; index < 20; index += 1) {
      const next = match(request, QA_GOLD_CATALOG);
      assert.equal(
        JSON.stringify({ ids: ids(next), leftovers: next.leftovers }),
        snapshot
      );
    }
  });

  it("M-19 K2 and MK-7 both resolve to G-K2-MK7-100", () => {
    const k2 = match(
      qaRequest({ targets: [qaTarget("k2", 100, "mcg", "Vitamin K2")] }),
      QA_GOLD_CATALOG
    );
    const mk7 = match(
      qaRequest({ targets: [qaTarget("k2", 100, "mcg", "MK-7")] }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(k2), ["G-K2-MK7-100"]);
    assert.deepEqual(ids(mk7), ["G-K2-MK7-100"]);
    assert.equal(resolveQaSubject("Menaquinone-7")?.id, "sup_k2");
  });

  it("M-20 prefers G-C-500 over incidental collagen+C", () => {
    const result = match(
      qaRequest({ optimization: "lowest_cost", targets: [qaTarget("c", 500)] }),
      QA_GOLD_CATALOG
    );
    assert.deepEqual(ids(result), ["G-C-500"]);
  });
});
