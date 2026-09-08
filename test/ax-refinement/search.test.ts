import assert from "node:assert/strict";
import { test } from "node:test";
import { createSearchCursor, advanceSearchCursor, searchCursorResult, encodeSearchCursor, decodeSearchCursor, extendSearchCursor } from "../../lib/matcher/search-cursor.ts";
import { compileGroups } from "../../lib/matcher/candidates.ts";
import { canonicalizeTargets } from "../../lib/matcher/canonicalizer.ts";
import { DEFAULT_MATCHER_CONFIG } from "../../lib/matcher/config.ts";
import { match } from "../../lib/matcher/index.ts";
import { scoreState, selectOptions } from "../../lib/matcher/selector.ts";
import { product, request, catalog } from "../matcher/flexible-v5-fixtures.ts";

function fixture() {
  const targets = canonicalizeTargets({ targets: ["a", "b"].map(subjectId => ({ subjectId, name: subjectId.toUpperCase(), amount: 100, unit: "mg" as const })) }).targets;
  const r = request({ targets });
  const products = [product("00-low", { a: 10, b: 1 }), ...Array.from({ length: 30 }, (_, i) => product(`d${String(i).padStart(2, "0")}`, { a: 50 + i, b: 1 })), product("zz-complement", { a: 90, b: 99 })];
  return { r, c: catalog(products) };
}
function finish(cursor: ReturnType<typeof createSearchCursor>, r: ReturnType<typeof request>, chunk = 97) {
  let rounds = 0;
  while (!cursor.done) {
    const before = cursor.expansionAttempts;
    advanceSearchCursor(cursor, r, chunk);
    assert.ok(cursor.expansionAttempts - before <= chunk);
    assert.ok(++rounds <= cursor.expansionBudget + 1, "Cursor must make bounded progress");
    cursor = decodeSearchCursor(encodeSearchCursor(cursor), cursor.identity);
  }
  return cursor;
}
function best(cursor: ReturnType<typeof createSearchCursor>, r: ReturnType<typeof request>) {
  const result = searchCursorResult(cursor, r);
  const baskets = result.complete.map(state => scoreState({ groups: result.groups, state, sellerId: "seller", request: r })).filter(row => row !== null);
  return selectOptions({ baskets, request: r }).selected;
}

test("AXR-SRCH-01 checkpoint round trips preserve every completed expansion and final candidate order", () => {
  const { r, c } = fixture(); const groups = compileGroups(r, c);
  const full = finish(createSearchCursor(groups, r, DEFAULT_MATCHER_CONFIG), r, 8000);
  const resumed = finish(createSearchCursor(groups, r, DEFAULT_MATCHER_CONFIG), r, 113);
  assert.deepEqual(searchCursorResult(resumed, r), searchCursorResult(full, r));
  assert.deepEqual(best(resumed, r), best(full, r));
  assert.throws(() => decodeSearchCursor(encodeSearchCursor(full), "different-input"), /identity/);
});

test("AXR-SRCH-02 preserve the independently exact 32-product complement across sparse supply and ordering", () => {
  const { r, c } = fixture();
  const full = finish(createSearchCursor(compileGroups(r, c), r, DEFAULT_MATCHER_CONFIG), r);
  const chosen = best(full, r); assert.ok(chosen);
  assert.deepEqual(chosen.productIds, ["00-low", "zz-complement"]);
  assert.equal(chosen.doseFit?.total, Math.abs(1 - (10 + 90) / 100) + Math.abs(1 - (1 + 99) / 100));
  const reversed = finish(createSearchCursor(compileGroups(r, { ...c, products: [...c.products].reverse() }), r, DEFAULT_MATCHER_CONFIG), r);
  assert.deepEqual(best(reversed, r), chosen);
});

test("AXR-SRCH-03 equal-dose retailer choices keep complete eligible offers and the lower quote", () => {
  const r = request();
  const c = catalog([product("exact", { a: 100 }, 53500, { sellerId: "expensive" }), product("exact", { a: 100 }, 31700, { sellerId: "cheaper" })]);
  const chosen = match(r, c).selected; assert.ok(chosen);
  assert.equal(chosen.sellerId, "cheaper"); assert.equal(chosen.priceMinor, 31700); assert.equal(chosen.doseFit?.total, 0);
  const unavailable = match(r, { ...c, products: c.products.map(row => row.sellerId === "cheaper" ? { ...row, orderable: false } : row) }).selected;
  assert.equal(unavailable?.sellerId, "expensive"); assert.equal(unavailable?.priceMinor, 53500);
});

test("AXR-SRCH-04 expansion resumes the existing cursor and retains the standard incumbent", () => {
  const { r, c } = fixture();
  const standard = finish(createSearchCursor(compileGroups(r, c), r, DEFAULT_MATCHER_CONFIG), r);
  const previousAttempts = standard.expansionAttempts, incumbent = best(standard, r); assert.ok(incumbent);
  extendSearchCursor(standard, 64000);
  assert.equal(standard.expansionAttempts, previousAttempts);
  const expanded = finish(standard, r, 511);
  assert.ok(expanded.expansionAttempts <= 64000);
  assert.ok(best(expanded, r)!.doseFit!.total <= incumbent.doseFit!.total);
  assert.throws(() => extendSearchCursor(expanded, 7999), /budget/);
});

test("AXR-SRCH-05 tiny budgets count unsuccessful work and report incomplete rather than exact", () => {
  const { r, c } = fixture();
  const cursor = finish(createSearchCursor(compileGroups(r, c), r, { ...DEFAULT_MATCHER_CONFIG, expansionBudget: 17 }), r, 3);
  assert.equal(cursor.expansionAttempts, 17);
  assert.equal(searchCursorResult(cursor, r).trimmed, true);
  assert.equal(searchCursorResult(cursor, r).mode, "bounded");
});

test("AXR-SRCH-06 exclusions, advisory zero preferences and fixed supported quantities survive resumption", () => {
  const r = request({ excludeProductIds: ["excluded"], productDoses: [{ productId: "required", servingsPerDay: 4 }], maxDailyPills: 0, maxPriceMinor: 0, maxProductCount: 0 });
  const c = catalog([product("required", { a: 25 }), product("excluded", { a: 100 })]);
  const result = best(finish(createSearchCursor(compileGroups(r, c), r, DEFAULT_MATCHER_CONFIG), r, 1), r);
  assert.ok(result); assert.deepEqual(result.productIds, ["required"]); assert.equal(result.dailyPills, 4);
  assert.equal(result.purchaseEligible, true); assert.equal(result.doseFit?.total, 0);
});
