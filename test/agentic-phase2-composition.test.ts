import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileGroups } from "../lib/matcher/candidates.ts";
import { DEFAULT_MATCHER_CONFIG } from "../lib/matcher/config.ts";
import { match } from "../lib/matcher/index.ts";
import { publicCoveragePercent } from "../lib/matcher/explainer.ts";
import {
  QA_GOLD_CATALOG,
  qaProduct,
  qaRequest,
  qaTarget
} from "../lib/matcher/qa/index.ts";

function ids(result: ReturnType<typeof match>) {
  return result.selected?.productIds ?? [];
}

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-25T00:00:00.000Z",
    catalogueVersion: "phase2-composition",
    products
  };
}

const d3 = qaTarget("d3", 2000);
const omega = qaTarget("omega", 1000);
const mag = qaTarget("mag", 200);
const b12 = qaTarget("b12", 250);
const vitC = qaTarget("c", 500);

const G_D3 = qaProduct({
  facts: [{ amount: 2000, key: "d3" }],
  id: "G-D3-2000",
  priceThb: 160
});
const G_O3 = qaProduct({
  dietary: "fish",
  facts: [{ amount: 1000, key: "omega" }],
  form: "softgel",
  id: "G-O3-FISH-1000",
  omega: "fish",
  pills: 2,
  priceThb: 300
});
const G_MAG = qaProduct({
  facts: [{ amount: 200, key: "mag" }],
  id: "G-MAG-200",
  priceThb: 190
});
const G_B12 = qaProduct({
  facts: [{ amount: 250, key: "b12" }],
  id: "G-B12-250",
  priceThb: 140
});
const G_C = qaProduct({
  facts: [{ amount: 500, key: "c" }],
  id: "G-C-500",
  priceThb: 120
});
const G_TRAP = qaProduct({
  facts: [
    { amount: 5000, key: "d3" },
    { amount: 600, key: "mag" },
    { amount: 1000, key: "b12" },
    { amount: 1500, key: "c" }
  ],
  id: "G-HIGH-TRAP",
  priceThb: 50
});

describe("Phase 2 multi-target composition", () => {
  it("keeps D3+omega+magnesium when vitamin C is missing from the catalogue", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [d3, omega, mag, vitC]
      }),
      catalog([G_D3, G_O3, G_MAG])
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productCount >= 3, true);
    assert.equal(ids(result).includes("G-D3-2000"), true);
    assert.equal(ids(result).includes("G-O3-FISH-1000"), true);
    assert.equal(ids(result).includes("G-MAG-200"), true);
    assert.ok(result.leftovers.some((item) => item.name === "Vitamin C"));
  });

  it("does not collapse to zero when a UL trap is the only C/B12 SKU", () => {
    const result = match(
      qaRequest({
        optimization: "balanced",
        targets: [d3, omega, mag, b12, vitC]
      }),
      catalog([G_D3, G_O3, G_MAG, G_TRAP])
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productCount >= 1, true);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    assert.equal(ids(result).includes("G-D3-2000"), true);
    assert.equal(ids(result).includes("G-O3-FISH-1000"), true);
    assert.equal(ids(result).includes("G-MAG-200"), true);
  });

  it("keeps omega+magnesium when B12 and C are added", () => {
    const three = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [d3, omega, mag]
      }),
      catalog([G_D3, G_O3, G_MAG, G_B12, G_C])
    );
    const five = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [d3, omega, mag, b12, vitC]
      }),
      catalog([G_D3, G_O3, G_MAG, G_B12, G_C])
    );
    assert.ok(three.selected);
    assert.ok(five.selected);
    assert.equal(five.selected.productCount >= three.selected.productCount, true);
    for (const id of ["G-D3-2000", "G-O3-FISH-1000", "G-MAG-200"]) {
      assert.equal(ids(five).includes(id), true);
    }
  });

  it("does not zero omega+magnesium+B12+C when D3 is omitted", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [omega, mag, b12, vitC]
      }),
      catalog([G_D3, G_O3, G_MAG, G_B12, G_C])
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productCount >= 3, true);
    assert.equal(ids(result).includes("G-O3-FISH-1000"), true);
    assert.equal(ids(result).includes("G-MAG-200"), true);
  });

  it("keeps per-target winners when the seller group limit would otherwise keep only rare incidental SKUs", () => {
    const noise = Array.from({ length: 12 }, (_, index) =>
      qaProduct({
        facts: [{ amount: 2000, key: "d3" }],
        id: `NOISE-D3-${String(index).padStart(2, "0")}`,
        priceThb: 800 + index
      })
    );
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [d3, omega, mag, b12, vitC]
      }),
      catalog([...noise, G_O3, G_MAG, G_B12, G_C, G_D3]),
      { ...DEFAULT_MATCHER_CONFIG, sellerGroupLimit: 2 }
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productCount >= 1, true);
    assert.equal(ids(result).some((id) => /O3-FISH|MAG-200|D3-2000|B12-250|C-500/.test(id)), true);
    assert.equal(publicCoveragePercent(result.selected) > 0, true);
  });

  it("compiles mapped D3/omega/magnesium SKUs before unrelated noise", () => {
    const noise = Array.from({ length: 40 }, (_, index) =>
      qaProduct({
        facts: [{ amount: 5, key: "creatine" }],
        id: `AAA-NOISE-${String(index).padStart(2, "0")}`,
        priceThb: 10 + index
      })
    );
    const groups = compileGroups(
      qaRequest({ targets: [d3, omega, mag] }),
      catalog([...noise, G_D3, G_O3, G_MAG])
    );
    const compiled = groups.map((item) => item.productId);
    const d3At = compiled.indexOf("G-D3-2000");
    const noiseAt = compiled.findIndex((id) => id.startsWith("AAA-NOISE-"));
    assert.equal(d3At >= 0, true);
    if (noiseAt >= 0) {
      assert.equal(d3At < noiseAt, true);
    }
  });

  it("still returns a non-zero official five-target stack on QA-GOLD", () => {
    const result = match(
      qaRequest({ optimization: "fewest_pills" }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productCount >= 2, true);
    assert.equal(result.selected.productCount === 0, false);
  });
});
