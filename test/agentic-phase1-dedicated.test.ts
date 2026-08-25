import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../lib/matcher/index.ts";
import { qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-25T00:00:00.000Z",
    catalogueVersion: "phase1-dedicated",
    products
  };
}

describe("Phase 1 dedicated D3 and B12 preference", () => {
  it("selects a dedicated D3 SKU over a beta-glucan incidental D3 carrier", () => {
    const dedicated = qaProduct({
      facts: [{ amount: 2000, key: "d3" }],
      id: "G-D3-2000",
      priceThb: 160,
      title: "Vitamin D3 2000 IU"
    });
    const carrier = qaProduct({
      facts: [
        { amount: 2000, key: "d3" },
        { amount: 500, key: "c" }
      ],
      id: "G-BETA-GLUCAN",
      pills: 1,
      priceThb: 80,
      title: "Beta Glucan"
    });
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("d3", 2000)]
      }),
      catalog([carrier, dedicated])
    );
    assert.deepEqual(result.selected?.productIds, ["G-D3-2000"]);
  });

  it("does not drop a covering dedicated B12 SKU for a weak incidental multi", () => {
    const dedicated = qaProduct({
      facts: [{ amount: 250, key: "b12" }],
      id: "G-B12-250",
      priceThb: 90,
      title: "Vitamin B12 250 mcg"
    });
    const multi = qaProduct({
      facts: [
        { amount: 2000, key: "d3" },
        { amount: 57, key: "b12" },
        { amount: 200, key: "mag" }
      ],
      id: "G-MULTI-50PLUS",
      pills: 1,
      priceThb: 50,
      title: "Multivitamins for 50+"
    });
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [
          qaTarget("d3", 2000),
          qaTarget("omega", 1000),
          qaTarget("mag", 200),
          qaTarget("b12", 250),
          qaTarget("c", 500)
        ]
      }),
      catalog([
        multi,
        dedicated,
        qaProduct({
          facts: [{ amount: 2000, key: "d3" }],
          id: "G-D3-2000",
          priceThb: 160,
          title: "Vitamin D3 2000 IU"
        }),
        qaProduct({
          dietary: "fish",
          facts: [{ amount: 1000, key: "omega" }],
          form: "softgel",
          id: "G-O3-FISH-1000",
          omega: "fish",
          pills: 2,
          priceThb: 300,
          title: "G-O3-FISH-1000 Fish Oil"
        }),
        qaProduct({
          facts: [{ amount: 200, key: "mag" }],
          form: "capsule",
          id: "G-MAG-200",
          priceThb: 120,
          title: "Magnesium 200"
        }),
        qaProduct({
          facts: [{ amount: 500, key: "c" }],
          id: "G-C-500",
          priceThb: 100,
          title: "Vitamin C 500"
        })
      ])
    );
    assert.equal(result.selected?.productIds.includes("G-B12-250"), true);
    const units = result.selected?.coverageBySubject.get("sup_b12") ?? 0;
    assert.equal(units >= 9000, true);
  });
});
