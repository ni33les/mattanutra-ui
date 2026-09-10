import assert from "node:assert/strict";
import { test } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { canonicalizeTargets } from "../../lib/matcher/canonicalizer.ts";
import { request, product, catalog, closestDoseOption } from "../matcher/flexible-v5-fixtures.ts";
import { finiteCatalogueOracle } from "../../lib/matcher/qa/oracle.ts";

function inputs() {
  const target = canonicalizeTargets({ targets: [{ subjectId: "d3", name: "Vitamin D3", amount: 2000, unit: "IU" }] }).targets;
  const make = (id: string, amount: number, price: number) => product(id, {}, price, {
    pillCountKnown: true, contributionSubjectIds: ["d3"],
    administration: { route: "oral", physicalUnit: "tablet", unitsPerServing: 1, doseIncrement: 1,
      packQuantity: 60, provenance: { status: "verified", sourceUrl: "https://example.org/controlled-label", sourceText: "One tablet is one serving", verifiedAt: "2026-09-08T00:00:00Z" } },
    labelledContributions: [{ subjectId: "d3", name: "Vitamin D3", amount, unit: "IU" }]
  });
  return { target, make, req: request({ targets: target, optimization: "lowest_cost", maxDailyPills: 1, maxProductCount: 0, maxPriceMinor: 0 }) };
}

test("M721-ROUTINE-01 equal-dose dedicated D3 beats ten incidental tablets while cheaper purchase stays available", () => {
  const { req, make } = inputs();
  const dedicated = make("dedicated-d3", 1000, 1000), incidental = make("incidental-d3", 200, 100);
  const result = match(req, catalog([incidental, dedicated]));
  assert.equal(result.selected?.doseFit?.total, 0);
  assert.deepEqual(result.selected?.productIds, ["dedicated-d3"]);
  assert.equal(result.selected.dailyPills, 2);
  const cheaper = result.alternatives.find(row => row.roles?.includes("lower_cost"));
  assert.deepEqual(cheaper?.productIds, ["incidental-d3"]); assert.equal(cheaper?.dailyPills, 1);
  const proposed = match({ ...req, productDoses: [{ productId: "incidental-d3", servingsPerDay: 10 }] }, catalog([incidental, dedicated]));
  assert.equal(proposed.selected?.dailyPills, 10); assert.equal(proposed.selected?.doseFit?.total, 0); assert.equal(proposed.selected?.purchaseEligible, true);
  assert.equal(cheaper?.purchaseEligible, true); assert.equal(cheaper?.safety.requiresAck, false);
  assert.ok(result.searchSummary!.expansionAttempts <= 8000);
  const reordered = match(req, catalog([dedicated, incidental]));
  assert.deepEqual([reordered.selected?.variantIds, ...reordered.alternatives.map(row => row.variantIds)], [result.selected.variantIds, ...result.alternatives.map(row => row.variantIds)]);
});

test("M721-ROUTINE-03 independent enumeration ranks equal-dose routines before cost without changing arithmetic", () => {
  const result = finiteCatalogueOracle({ targets: [{ subjectId: "d3", amount: 2000, basis: "supplemental" }],
    current: [], dietary: [], optimization: "lowest_cost", products: [
      { productId: "dedicated", sellerId: "one", priceMinor: 1000, pillsPerServing: 1, pillCountKnown: true, doses: [1, 2], contributions: { d3: 1000 } },
      { productId: "incidental", sellerId: "one", priceMinor: 100, pillsPerServing: 1, pillCountKnown: true, doses: [1, 10], contributions: { d3: 200 } }
    ] });
  assert.deepEqual(result.selected?.productIds, ["dedicated"]);
  assert.equal(result.selected?.loss.total, 0);
  assert.equal(result.selected?.dailyPills, 2);
  assert.ok(result.baskets.some(row => row.productIds.length === 1 && row.productIds[0] === "incidental" && row.dailyPills === 10 && row.loss.total === 0));
});

test("M721-ROUTINE-02 unknown pills cannot win as zero, and better dose fit still wins over convenience", () => {
  const { req, make } = inputs();
  const unknown = { ...make("unknown", 2000, 10), administration: null, pillCountKnown: false, dailyPillsPerServing: 0 };
  const exact = make("exact", 200, 100);
  const first = match(req, catalog([unknown, exact]));
  assert.deepEqual(closestDoseOption(first)?.productIds, ["exact"]);
  assert.equal(first.selected?.pillCountKnown, false); assert.equal(first.selected?.overallScore?.components.uncertainty, 0.25);
  assert.ok(first.selected?.overallScore?.missingComponents.includes("dailyPills"));
  assert.ok([first.selected!, ...first.alternatives].some(row => row.productIds.includes("unknown") && row.pillCountKnown === false));
  const partial = make("partial", 1900, 1000);
  const second = match(req, catalog([exact, partial]));
  assert.deepEqual(closestDoseOption(second)?.productIds, ["exact"]);
  assert.deepEqual(second.selected?.productIds, ["partial"]);
  assert.ok([second.selected!, ...second.alternatives].some(row => row.productIds.includes("partial")), "A useful easier partial routine must survive option reduction");
});
