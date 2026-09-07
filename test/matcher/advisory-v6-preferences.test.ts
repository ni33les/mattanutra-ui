import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalizeTargets } from "../../lib/matcher/canonicalizer.ts";
import { match } from "../../lib/matcher/index.ts";
import { finiteCatalogueOracle } from "../../lib/matcher/qa/oracle.ts";
import { compareBaskets } from "../../lib/matcher/selector.ts";
import { validateProductDoseProposals } from "../../lib/matcher/serving-grid.ts";
import { catalog, product, request } from "./flexible-v5-fixtures.ts";

test("ADV6-CORE-01 numeric preferences never remove the closest fit or purchase alternatives", () => {
  const products = [product("exact", { a: 100 }, 1000), product("cheap", { a: 80 }, 100)];
  const unconstrained = match(request(), catalog(products));
  for (const preferences of [{ maxProductCount: 0 }, { maxDailyPills: 0 }, { maxPriceMinor: 0 },
    { maxProductCount: 0, maxDailyPills: 0, maxPriceMinor: 0 }]) {
    const result = match(request(preferences), catalog(products));
    assert.deepEqual(result.selected?.variantIds, unconstrained.selected?.variantIds);
    assert.deepEqual(result.alternatives.map(row => row.variantIds), unconstrained.alternatives.map(row => row.variantIds));
    assert.equal(result.selected?.doseFit?.total, 0);
    assert.equal(result.selected?.purchaseEligible, true);
    assert.equal(result.rejected.some(row => ["max_products", "max_pills", "budget"].includes(row.reason)), false);
    assert.equal(result.lossCertificates?.some(row => row.rejection_class === "hard_constraint"), false);
  }
});

test("ADV6-CORE-02 retained products are not reserved against an advisory product count", () => {
  const products = [product("a", { a: 100 }), product("b", { b: 100 }), product("c", { c: 100 })];
  const targets = canonicalizeTargets({ targets: ["a", "b", "c"].map(id => ({ name: id.toUpperCase(), subjectId: id, amount: 100, unit: "mg" as const })) }).targets;
  const result = match(request({ targets, retainProductIds: ["a", "b", "c"], maxProductCount: 1, maxDailyPills: 1, maxPriceMinor: 1 }), catalog(products));
  assert.deepEqual(result.selected?.productIds, ["a", "b", "c"]);
  assert.equal(result.selected?.doseFit?.total, 0);
});

test("ADV6-CORE-03 fixed physical proposals may exceed every numeric preference", () => {
  const products = [product("required", { a: 25 })];
  const input = request({ maxProductCount: 0, maxDailyPills: 1, maxPriceMinor: 1, productDoses: [{ productId: "required", servingsPerDay: 4 }] });
  assert.deepEqual(validateProductDoseProposals(input, catalog(products)), []);
  const result = match(input, catalog(products));
  assert.equal(result.selected?.variantDoses?.[0]?.dailyUnits, 4);
  assert.equal(result.selected?.doseFit?.total, 0);
  assert.ok(validateProductDoseProposals({ ...input, productDoses: [{ productId: "required", servingsPerDay: 0.5 }] }, catalog(products)).some(row => row.field.endsWith("servingsPerDay")));
  assert.ok(validateProductDoseProposals({ ...input, excludeProductIds: ["required"] }, catalog(products)).some(row => row.field.endsWith("productId")));
});

test("ADV6-CORE-04 unknown pill counts permit matching and cannot masquerade as zero-pill simplicity", () => {
  const products = [product("unknown", { a: 100 }, 100, { source: "retail", pillCountKnown: false, dailyPillsPerServing: 0 }),
    product("two", { a: 100 }, 100, { pillCountKnown: true, dailyPillsPerServing: 2 }),
    product("three", { a: 100 }, 100, { pillCountKnown: true, dailyPillsPerServing: 3 })];
  const unknownOnly = match(request({ maxDailyPills: 1 }), catalog([products[0]]));
  assert.deepEqual(unknownOnly.selected?.productIds, ["unknown"]);
  const input = request({ maxDailyPills: 1, optimization: "fewest_pills" });
  const options = products.map(p => match(input, catalog([p])).selected!);
  assert.ok(options.every(Boolean));
  assert.ok(compareBaskets(options[1], options[2], input) < 0);
  assert.ok(compareBaskets(options[2], options[0], input) < 0);
  assert.ok(compareBaskets(options[1], options[0], input) < 0);
  for (const order of [products, [...products].reverse(), [products[1], products[0], products[2]]]) {
    const result = match(input, catalog(order));
    assert.deepEqual(result.selected?.productIds, ["two"]);
    assert.ok(result.selected?.roles?.includes("simpler"));
  }
});

test("ADV6-CORE-05 categorical exclusions and dietary requirements remain firm", () => {
  const result = match(request({ maxPriceMinor: 0, excludeProductIds: ["excluded"], dietaryPreference: "vegan" }),
    catalog([product("excluded", { a: 100 }), product("fish", { a: 100 }, 100, { omegaSource: "fish", dietarySource: "fish" }), product("plant", { a: 100 }, 100, { dietarySource: "plant" })]));
  assert.deepEqual(result.selected?.productIds, ["plant"]);
  assert.ok(result.rejected.some(row => row.productId === "excluded" && row.reason === "excluded"));
  assert.ok(result.rejected.some(row => row.productId === "fish"));
});

test("ADV6-ORACLE-01 independent enumeration treats numeric preferences as advisory", () => {
  const fixture = { targets: [{ subjectId: "a", amount: 100 }, { subjectId: "b", amount: 100 }],
    products: ["a", "b"].map(id => ({ productId: id, sellerId: "one", priceMinor: 100, pillsPerServing: 1, doses: [1], contributions: { [id]: 100 } })) };
  const baseline = finiteCatalogueOracle(fixture);
  const preferred = finiteCatalogueOracle({ ...fixture, maxProductCount: 0, maxDailyPills: 0, maxPriceMinor: 0 });
  assert.deepEqual(preferred, baseline);
  assert.equal(preferred.selected?.loss.total, 0);
  assert.deepEqual(preferred.selected?.productIds, ["a", "b"]);
});

test("ADV6-ORACLE-02 independent pill ranking never treats missing counts as zero", () => {
  const products = [
    { productId: "unknown", sellerId: "one", priceMinor: 100, pillsPerServing: 0, pillCountKnown: false, doses: [1], contributions: { a: 100 } },
    { productId: "known", sellerId: "one", priceMinor: 100, pillsPerServing: 2, pillCountKnown: true, doses: [1], contributions: { a: 100 } }
  ];
  for (const order of [products, [...products].reverse()]) {
    const result = finiteCatalogueOracle({ targets: [{ subjectId: "a", amount: 100 }], products: order, optimization: "fewest_pills", maxDailyPills: 1 });
    assert.deepEqual(result.selected?.productIds, ["known"]);
    assert.equal(result.selected?.pillCountKnown, true);
    assert.equal(result.baskets.find(row => row.productIds.length === 1 && row.productIds[0] === "unknown")?.pillCountKnown, false);
  }
});

test("ADV6-SEARCH-01 missing pill facts cannot prune a known burden at the same dose", async () => {
  const { seedState } = await import("../../lib/matcher/search.ts");
  const { dominatesAtLayer } = await import("../../lib/matcher/dominance.ts");
  const input = request();
  const base = { ...seedState(input), nextGroupIndex: 1, count: 1, delivered: new Map([["a", input.targets[0].requested.units]]), exposure: new Map([["a", input.targets[0].requested.units]]) };
  const known = { ...base, pills: 2, pillCountKnown: true, price: 100 };
  const unknown = { ...base, pills: 0, pillCountKnown: false, price: 100 };
  assert.equal(dominatesAtLayer(unknown, known, input), false);
  assert.equal(dominatesAtLayer(known, unknown, input), false);
  assert.equal(dominatesAtLayer({ ...known, price: 50 }, known, input), true);
});
