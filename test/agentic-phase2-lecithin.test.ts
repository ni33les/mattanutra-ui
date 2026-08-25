import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFalseOmegaAttribution,
  shouldSkipOmegaContribution
} from "../lib/agentic/catalogue/product-fit.ts";
import { contributionFor } from "../lib/matcher/candidates.ts";
import { match } from "../lib/matcher/index.ts";
import { qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-25T00:00:00.000Z",
    catalogueVersion: "phase2-lecithin",
    products
  };
}

describe("Phase 2 lecithin is not omega-3", () => {
  it("treats lecithin, 3-6-9 and krill titles as false omega attribution", () => {
    assert.equal(isFalseOmegaAttribution({ title: "Lecithin" }), true);
    assert.equal(isFalseOmegaAttribution({ title: "Super Omega 3-6-9" }), true);
    assert.equal(isFalseOmegaAttribution({ title: "Krill Oil 1000" }), true);
    assert.equal(isFalseOmegaAttribution({ title: "Fish Oil 1000" }), false);
    assert.equal(isFalseOmegaAttribution({ title: "Algae Omega-3 500" }), false);
  });

  it("does not credit a Lecithin-titled SKU mapped to the omega subject", () => {
    const lecithin = qaProduct({
      facts: [{ amount: 1200, key: "omega", name: "Lecithin" }],
      id: "G-LECITHIN-1200",
      priceThb: 90,
      title: "Lecithin"
    });
    assert.equal(contributionFor(lecithin, "Omega-3", "sup_omega").length, 0);
    const algae = qaProduct({
      dietary: "algae",
      facts: [{ amount: 500, key: "omega" }],
      form: "softgel",
      id: "G-O3-ALGAE-500",
      omega: "algae",
      pills: 1,
      priceThb: 280,
      title: "Algae Omega-3 500"
    });
    const result = match(
      qaRequest({
        targets: [qaTarget("omega", 500)]
      }),
      catalog([lecithin, algae])
    );
    assert.equal(result.selected?.productIds.includes("G-LECITHIN-1200"), false);
    assert.equal(result.selected?.productIds.includes("G-O3-ALGAE-500"), true);
  });

  it("skips omega contribution from a lecithin candidate even when the mapped name is Omega-3", () => {
    assert.equal(
      shouldSkipOmegaContribution("Omega-3", {
        brandName: null,
        facts: [{ amount: 1200, name: "Lecithin", unit: "mg" }],
        title: "Lecithin"
      } as never),
      true
    );
  });
});
