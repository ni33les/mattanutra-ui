import { closestDoseOption } from "./matcher/flexible-v5-fixtures.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-26T00:00:00.000Z",
    catalogueVersion: "phase1-material",
    products
  };
}

describe("Phase 1 material contribution", () => {
  it("keeps only dedicated vitamin C when collagens also label C", () => {
    const dedicated = qaProduct({
      facts: [{ amount: 500, key: "c" }],
      id: "G-C-500",
      priceThb: 100,
      title: "Vitamin C 500"
    });
    const extras = [1, 2, 3, 4, 5].map((index) =>
      qaProduct({
        facts: [
          { amount: 5, key: "collagen" },
          { amount: 40, key: "c" }
        ],
        id: `G-COLLAGEN-C-${index}`,
        priceThb: 40,
        title: `Collagen Joint ${index}`
      })
    );
    const result = match(
      qaRequest({
        optimization: "balanced",
        targets: [qaTarget("c", 500)]
      }),
      catalog([dedicated, ...extras])
    );
    assert.deepEqual(result.selected?.productIds, ["G-C-500"]);
  });

  it("retains dedicated D3 beside the lower-price equal-pill practical recommendation", () => {
    const result = match(
      qaRequest({
        optimization: "balanced",
        targets: [qaTarget("d3", 2000)]
      }),
      catalog([
        qaProduct({
          facts: [
            { amount: 2000, key: "d3" },
            { amount: 500, key: "c" }
          ],
          id: "G-BETA-GLUCAN",
          priceThb: 80,
          title: "Beta Glucan"
        }),
        qaProduct({
          facts: [{ amount: 2000, key: "d3" }],
          id: "G-D3-2000",
          priceThb: 160,
          title: "Vitamin D3 2000 IU"
        })
      ])
    );
    assert.deepEqual(closestDoseOption(result).productIds, ["G-D3-2000"]);
    assert.deepEqual(result.selected?.productIds, ["G-BETA-GLUCAN"]);
    assert.ok([result.selected, ...result.alternatives].some(option => option?.productIds.join() === "G-BETA-GLUCAN" && option.priceMinor === 8000));
    assert.equal(result.selected?.doseFit?.total, 0);
  });

  it("keeps official combo plus the cheaper algae pack", () => {
    const result = match(qaRequest({ optimization: "fewest_pills" }), QA_GOLD_CATALOG);
    const exact = closestDoseOption(result);
    assert.deepEqual(exact?.productIds, ["G-BASE-COMBO", "G-O3-ALGAE-500"]);
    assert.equal(exact?.priceMinor, 61000);
    assert.equal(exact?.doseFit?.total, 0);
    assert.equal(exact?.coveredCount, 5);
  });
});
