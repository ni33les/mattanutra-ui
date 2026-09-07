import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { finiteCatalogueOracle } from "../../lib/matcher/qa/oracle.ts";

const product = (id: string, a: number, priceMinor = 100) => ({ productId: id, sellerId: "seller", priceMinor, pillsPerServing: 1,
  doses: [1], contributions: { a } });

it("V5-ORACLE-01 derives exact independent proportional under/over and twice-limit penalties", () => {
  const result = finiteCatalogueOracle({ targets: [{ subjectId: "a", amount: 100 }], limits: [{ subjectId: "a", amount: 100, scope: "supplemental" }],
    products: [product("under", 80), product("over", 120)], maxProductCount: 1 });
  const under = result.baskets.find(row => row.productIds[0] === "under")!;
  const over = result.baskets.find(row => row.productIds[0] === "over")!;
  assert.deepEqual(under.loss.exact, { numerator: "1", denominator: "5" });
  assert.deepEqual(over.loss.exact, { numerator: "3", denominator: "5" });
  assert.equal(over.loss.over, under.loss.under);
  assert.equal(over.loss.weightedLimit, 0.4);
  assert.equal(over.purchaseEligible, true);
});

it("V5-ORACLE-02 refuses oversized enumeration instead of claiming an exhaustive truncated result", () => {
  assert.throws(() => finiteCatalogueOracle({ targets: [{ subjectId: "a", amount: 100 }], products: Array.from({ length: 20 }, (_, i) => product(`p${i}`, 1)) }), /exhaustive.*limit/i);
  assert.throws(() => finiteCatalogueOracle({ targets: [], products: [product("missing-grid", 100)].map(row => ({ ...row, doses: [] })) }), /dose grid/i);
});

it("V5-ORACLE-03 enumerates physical fractions, four units, eight products and exact purchase prices", () => {
  const result = finiteCatalogueOracle({ targets: Array.from({ length: 8 }, (_, i) => ({ subjectId: `n${i}`, amount: 100 })),
    products: Array.from({ length: 8 }, (_, i) => ({ ...product(`p${i}`, 0, 100 + i), contributions: { [`n${i}`]: i === 0 ? 25 : i === 1 ? 200 : 100 }, doses: [i === 0 ? 4 : i === 1 ? 0.5 : 1] })), maxProductCount: null });
  assert.equal(result.selected?.loss.total, 0);
  assert.equal(result.selected?.productIds.length, 8);
  assert.equal(result.selected?.priceMinor, 828);
  assert.equal(result.selected?.dailyPills, 10.5);
});

it("V5-ORACLE-04 exposes baseline, partial, costly and above-limit purchase choices with no coverage inflation", () => {
  const result = finiteCatalogueOracle({ targets: [{ subjectId: "a", amount: 100 }, { subjectId: "missing", amount: 100 }],
    products: [product("cheap", 99.9, 100), product("exact", 100, 1000), product("excess", 300, 100)], maxProductCount: 1 });
  assert.equal(result.selected?.productIds[0], "exact");
  assert.ok(result.baskets.some(row => row.productIds[0] === "cheap"));
  assert.ok(result.baskets.some(row => row.productIds[0] === "excess" && row.purchaseEligible));
  assert.ok(result.baskets.some(row => row.productIds.length === 0 && !row.purchaseEligible));
  assert.equal(result.selected?.fullyCoveredFraction, 0.5);
  assert.equal(result.baskets.find(row => row.productIds[0] === "excess")?.fullyCoveredFraction, 0.5);
});

it("V5-ORACLE-05 handles current intake, known unrequested-dose increases and uncertain intervals", () => {
  const result = finiteCatalogueOracle({ targets: [{ subjectId: "a", amount: 200 }], current: [{ subjectId: "a", amount: 100 }, { subjectId: "b", amount: 20 }],
    products: [{ ...product("p", 50), contributions: { a: 50, b: 10 } }] });
  const basket = result.baskets.find(row => row.productIds[0] === "p")!;
  assert.equal(basket.coverage[0].gap, 50);
  assert.equal(basket.coverage[0].coverage, 0.75);
  assert.equal(basket.loss.total, 0.75);
  const uncertain = finiteCatalogueOracle({ targets: [{ subjectId: "a", amount: 100 }],
    current: [{ subjectId: "a", amount: 50, minimum: 30, maximum: 70, certainty: "estimated" }], products: [product("p", 50)] });
  assert.equal(uncertain.selected?.loss.total, 0.2);
  assert.equal(uncertain.selected?.coverage[0].certainty, "estimated");
});

it("V5-ORACLE-06 preserves deterministic ordering and never imports production matcher decisions", () => {
  const fixture = { targets: [{ subjectId: "a", amount: 100 }], products: [product("a", 50, 100), product("b", 50, 100)] };
  assert.deepEqual(finiteCatalogueOracle(fixture), finiteCatalogueOracle({ ...fixture, products: [...fixture.products].reverse() }));
  const source = readFileSync("lib/matcher/qa/oracle.ts", "utf8");
  assert.doesNotMatch(source, /import\s+(?!type\b)[\s\S]*?from\s+["'][^"']*(?:candidates|selector|search|dose-fit|dominance|eligibility|config)["']/);
});

it("V5-ORACLE-07 checks production feasibility and independent loss after sparse-catalogue removals", async () => {
  const { match } = await import("../../lib/matcher/index.ts");
  const { qaProduct, qaRequest, qaTarget } = await import("../../lib/matcher/qa/index.ts");
  const products = [
    qaProduct({ id: "pair-a", facts: [{ key: "mag", amount: 70 }, { key: "c", amount: 20 }], priceThb: 7 }),
    qaProduct({ id: "pair-b", facts: [{ key: "mag", amount: 30 }, { key: "c", amount: 60 }], priceThb: 11 }),
    qaProduct({ id: "exact", facts: [{ key: "mag", amount: 100 }, { key: "c", amount: 100 }], priceThb: 55 })
  ];
  const grids = [[...products], products.slice(0, 2), [products[0]!], []];
  for (const optimization of ["lowest_cost", "fewest_pills", "best_coverage", "balanced"] as const) for (const catalogue of grids) {
    const fixture = { optimization, maxDailyPills: 3, targets: [{ subjectId: "sup_mag", amount: 100 }, { subjectId: "sup_c", amount: 100 }],
      limits: [{ subjectId: "sup_mag", amount: 100, scope: "supplemental" as const }, { subjectId: "sup_c", amount: 100, scope: "supplemental" as const }],
      products: catalogue.map(row => ({ productId: row.productId, sellerId: row.sellerId, priceMinor: row.unitPriceMinor,
        pillsPerServing: row.dailyPillsPerServing, doses: [1, 2, 3], contributions: Object.fromEntries(row.labelledContributions.map(fact => [fact.subjectId!, fact.amount])) })) };
    const reference = finiteCatalogueOracle(fixture);
    const request = qaRequest({ optimization, maxDailyPills: 3, targets: [qaTarget("mag", 100), qaTarget("c", 100)],
      safetyCeilings: [{ subjectId: "sup_mag", name: "Magnesium", maxAmount: 100, maxUnit: "mg" }, { subjectId: "sup_c", name: "Vitamin C", maxAmount: 100, maxUnit: "mg" }] });
    const result = match(request, { availabilityAsOf: "2026-01-01T00:00:00Z", catalogueVersion: "finite-oracle-removal-v1", products: catalogue });
    assert.ok(result.selected);
    const actual = reference.baskets.find(row => JSON.stringify(row.variantIds) === JSON.stringify([...result.selected!.variantIds].sort()));
    assert.ok(actual, "the production basket must be independently feasible");
    assert.equal(actual.loss.total, reference.selected!.loss.total);
    assert.equal(result.selected.doseFit!.total, actual.loss.total);
    assert.equal(result.selected.priceMinor, actual.priceMinor);
    assert.equal(result.selected.dailyPills, actual.dailyPills);
    assert.deepEqual(finiteCatalogueOracle({ ...fixture, products: [...fixture.products].reverse() }), reference);
  }
});
