import assert from "node:assert/strict";
import { test } from "node:test";
import { starterProductIds, readStoredWebBasketSelection } from "../lib/web-basket-selection.ts";
import { canonicalizeTargets } from "../lib/matcher/canonicalizer.ts";
import { freezeSelectionCoverage } from "../lib/matcher/freeze-selection-coverage.ts";
import type { ProductRecommendationNeed } from "../lib/product-recommendation-types.ts";
import { product, request } from "./matcher/flexible-v5-fixtures.ts";

function fixture() {
  const targets = canonicalizeTargets({ targets: [
    { subjectId: "a", name: "A", amount: 100, unit: "mg" },
    { subjectId: "b", name: "B", amount: 100, unit: "mg" },
    { subjectId: "c", name: "C", amount: 100, unit: "mg" }
  ] }).targets;
  const needs = ["a", "b", "c"].map(id => ({ id, sourceId: id, normalizedName: id, displayName: id,
    itemType: "supplement", category: "Foundation", weight: 1, targetDose: null, targetComparableAmount: 100, targetText: "100 mg" } satisfies ProductRecommendationNeed));
  // The first two products overlap; the third complements either one better.
  const products = [product("first", { a: 100, b: 100 }), product("overlap", { a: 90, b: 100 }), product("complement", { c: 60 })];
  const ids = products.map(row => row.productId);
  const snapshot = freezeSelectionCoverage({ request: request({ targets }), needs, products,
    basket: { productIds: ids, variantDoses: ids.map(productId => ({ productId, dailyUnits: 1, dailyPills: 1 })) } });
  assert.ok(snapshot);
  return { ids, snapshot };
}

test("starter pair maximises combined frozen coverage rather than choosing overlapping top singles", () => {
  const { ids, snapshot } = fixture();
  const before = JSON.stringify(snapshot);
  assert.deepEqual(starterProductIds(ids, snapshot), ["first", "complement"]);
  assert.equal(JSON.stringify(snapshot), before, "saved doses and evidence are unchanged");
});

test("starter ties preserve recommendation order, with all available items when fewer than three exist", () => {
  const { ids, snapshot } = fixture();
  const equal = { ...snapshot, products: snapshot.products.map(row => ({ ...row, contributions: [] })) };
  assert.deepEqual(starterProductIds([ids[1], ids[2], ids[0]], equal), [ids[1], ids[2]]);
  for (const count of [0, 1, 2]) assert.deepEqual(starterProductIds(ids.slice(0, count), snapshot), ids.slice(0, count));
});

test("legacy, malformed and incompatible snapshots use the existing first two products", () => {
  const { ids, snapshot } = fixture();
  assert.deepEqual(starterProductIds(ids), ids.slice(0, 2));
  assert.deepEqual(starterProductIds([...ids, "foreign"], snapshot), ids.slice(0, 2));
  const broken = { ...snapshot, products: snapshot.products.map(row => ({ ...row,
    contributions: row.contributions.map(amount => ({ ...amount, units: "bad" })) })) };
  assert.deepEqual(starterProductIds(ids, broken), ids.slice(0, 2));
});

test("stored basket accepts custom and explicitly empty selections but rejects foreign or corrupt IDs", () => {
  const encode = (ids: unknown) => JSON.stringify({ version: 1, ids });
  assert.deepEqual(readStoredWebBasketSelection(encode(["c", "a"]), ["a", "b", "c"]), ["c", "a"]);
  assert.deepEqual(readStoredWebBasketSelection(encode([]), ["a", "b"]), []);
  for (const raw of [null, "broken", encode(["foreign"]), encode(["a", "a"]), encode([3]), encode("a"), '{"version":2,"ids":[]}']) {
    assert.equal(readStoredWebBasketSelection(raw, ["a", "b"]), null);
  }
});
