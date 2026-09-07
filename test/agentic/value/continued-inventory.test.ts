import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHorizonPlan } from "../../../lib/agentic/value/inventory-ledger.ts";
import { buildEconomics } from "../../../lib/agentic/value/economics.ts";
import type { BasketItem, CanonicalPlanState, CurrentSupplement } from "../../../lib/agentic/plan/types.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./sample-catalogue.ts";

const snapshot = sampleValueSnapshot();
const mag = snapshot.supplements[1]!;
const d3 = snapshot.supplements[2]!;
const product = snapshot.products[1]!;
function current(extra: Partial<CurrentSupplement> = {}): CurrentSupplement {
  return { dailyAmount: 300, daysRemaining: 30, name: mag.name, productId: product.productId, supplementId: mag.supplementId, unit: "mg", ...extra };
}
function state(rows: readonly CurrentSupplement[] = [], extra: Partial<CanonicalPlanState> = {}): CanonicalPlanState {
  return { acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: rows, destinationCountry: "TH", leftovers: [], locale: "en",
    medicationCodes: [], optimization: "lowest_cost", pinnedOptionId: null, profile: { ageYears: 35, lifeStage: "adult", sex: "female" },
    requirements: {}, safetyAcknowledgement: null, targets: [{ amount: 400, name: mag.name, supplementId: mag.supplementId, unit: "mg" }], ...extra };
}
function basket(index = 0): BasketItem {
  const p = snapshot.products[index]!;
  return { availabilityAsOf: snapshot.availabilityAsOf, contributionSupplementIds: p.contributionSupplementIds, currency: "THB", dailyPills: p.dailyPills,
    deliveryWindow: "3-5 days", fixture: false, form: p.form, incompleteCommercialFacts: false, lineTotalMinor: p.unitPriceMinor, pillsPerServing: p.dailyPills,
    productId: p.productId, productName: p.candidate.title, quantity: 1, retailerSku: p.retailerSku, sellerId: p.sellerId, sellerName: p.sellerName,
    servingsPerDay: 1, servingsPerPack: 90, source: p.source, stockStatus: "in_stock", unitPriceMinor: p.unitPriceMinor };
}

describe("continued inventory accounting", () => {
  it("does not silently replace an unspecified or unavailable continued product", () => {
    for (const productId of [undefined, "prd_missing"]) {
      const plan = buildHorizonPlan({ snapshot, state: state([current({ productId })]) });
      assert.equal(plan.complete, false);
      assert.equal(plan.orders.length, 0);
      assert.equal(plan.nextReplenishmentDay, null);
      assert.ok(plan.unavailableReasons.some(row => row.reasonCode === (productId ? "current_inventory_product_unavailable" : "current_inventory_product_unknown")));
    }
  });

  it("uses measured daily servings for replenishment, including unit conversions", () => {
    for (const row of [current(), current({ dailyAmount: 0.3, unit: "g" })]) {
      const plan = buildHorizonPlan({ snapshot, state: state([row]) });
      assert.equal(plan.complete, true);
      assert.equal(plan.orders.length, 1);
      assert.equal(plan.orders[0]?.day, 30);
      assert.deepEqual(plan.orders[0]?.quantities, [2]); // 60 days × 2 servings / 90 per pack.
      assert.equal(plan.orders[0]?.nextReplenishmentDay, 120);
      assert.equal(plan.orders[0]?.subtotalMinor, 2 * product.unitPriceMinor);
    }
  });

  it("rounds measured continued-dose pack quantities with exact rational arithmetic", () => {
    for (const [dailyAmount, labelledAmount] of [[3, 17], [0.3, 1.7]]) {
      const p = sampleRetailProduct({ amount: labelledAmount, form: "capsule", id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb21", name: mag.name,
        servingLabel: "15 capsules per bottle", supplementId: mag.supplementId, title: "Measured magnesium", unit: "mg", unitPriceMinor: 10000 });
      const snap = { ...snapshot, products: [p] };
      const plan = buildHorizonPlan({ snapshot: snap, state: state([current({ dailyAmount, productId: p.productId, daysRemaining: 5 })]) });
      assert.equal(plan.complete, true);
      assert.deepEqual(plan.orders[0]?.quantities, [1]); // 85 days × 3/17 servings/day = exactly 15 servings.
      assert.equal(plan.orders[0]?.subtotalMinor, 10000);
      assert.equal(plan.orders[0]?.nextReplenishmentDay, 90);
    }
  });

  it("includes partial continued intake alongside a newly purchased product", () => {
    const plan = buildHorizonPlan({ snapshot, items: [basket()], state: state([current({ dailyAmount: 75 })]) });
    assert.equal(plan.complete, true);
    assert.equal(plan.orders[0]?.type, "immediate");
    const refill = plan.orders.find(row => row.type === "replenishment");
    assert.deepEqual(refill?.productIds, [product.productId]);
    assert.deepEqual(refill?.quantities, [1]);
    assert.equal(refill?.nextReplenishmentDay, 210); // 90 servings at one half serving daily.
  });

  it("keeps a current quote but withholds complete future cost for partial intake with unknown duration", () => {
    const s = state([current({ dailyAmount: 75, daysRemaining: undefined })]);
    const plan = buildHorizonPlan({ snapshot, items: [basket()], state: s });
    const economics = buildEconomics({ snapshot, items: [basket()], coverage: [], state: s });
    assert.equal(plan.purchaseRequiredNow, true);
    assert.equal(plan.durationUnknown, true);
    assert.equal(plan.complete, false);
    assert.equal(economics.firstOrderSubtotalMinor, basket().lineTotalMinor);
    assert.ok(economics.cashTotalMinor > 0);
    assert.equal(economics.cash30DayMinor, null);
    assert.equal(economics.cash90DayMinor, null);
    assert.equal(economics.comparisonComplete, false);
    assert.equal(economics.savings90DayMinor, null);
    assert.equal(economics.consumptionScope, "full_horizon");
    assert.equal(economics.consumption30DayMinor, null);
    assert.equal(economics.consumption90DayMinor, null);
    assert.equal(economics.consumptionComplete, false);
    assert.ok(economics.unavailableReasons.some(row => row.reasonCode === "current_inventory_duration_unknown"));
  });

  it("groups consistent nutrient rows from one continued product into one refill", () => {
    const multi = { ...product, contributionSupplementIds: [mag.supplementId, d3.supplementId], candidate: { ...product.candidate,
      facts: [...product.candidate.facts, { ...product.candidate.facts[0]!, name: "Vitamin D3", supplementId: d3.supplementId, amount: 25, unit: "mcg" }] } };
    const snap = { ...snapshot, products: snapshot.products.map(p => p.productId === product.productId ? multi : p) };
    const rows = [current(), current({ name: "Vitamin D3", supplementId: d3.supplementId, dailyAmount: 2000, unit: "IU" })];
    const plan = buildHorizonPlan({ snapshot: snap, state: state(rows) });
    assert.equal(plan.complete, true);
    assert.equal(plan.orders.length, 1);
    assert.deepEqual(plan.orders[0]?.quantities, [2]);
    assert.equal(plan.orders[0]?.lines.length, 1);
    const inconsistent = buildHorizonPlan({ snapshot: snap, state: state([rows[0]!, { ...rows[1]!, dailyAmount: 1000 }]) });
    assert.equal(inconsistent.complete, false);
    assert.equal(inconsistent.orders.length, 0);
    assert.ok(inconsistent.unavailableReasons.some(row => row.reasonCode === "current_inventory_dose_inconsistent"));
  });

  it("does not convert a different nutrient form into a known continued dose", () => {
    const p = sampleRetailProduct({ amount: 1000, form: "softgel", id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1", name: "Vitamin D2", servingLabel: "90 softgels per bottle",
      supplementId: d3.supplementId, title: "Vitamin D2", unit: "IU", unitPriceMinor: 10000 });
    const plan = buildHorizonPlan({ snapshot: { ...snapshot, products: [p] }, state: state([current({ productId: p.productId, supplementId: d3.supplementId, name: "Vitamin D3", unit: "IU", dailyAmount: 1000 })]) });
    assert.equal(plan.complete, false);
    assert.equal(plan.orders.length, 0);
    assert.ok(plan.unavailableReasons.some(row => row.reasonCode === "current_inventory_dose_unknown"));
  });

  it("marks missing pack facts and prices as unavailable instead of inventing zero future cost", () => {
    for (const p of [
      { ...product, candidate: { ...product.candidate, administration: { ...product.candidate.administration!, packQuantity: null }, facts: product.candidate.facts.map(fact => ({ ...fact, servingLabel: null })) } },
      { ...product, unitPriceMinor: 0 }
    ]) {
      const snap = { ...snapshot, products: snapshot.products.map(row => row.productId === p.productId ? p : row) };
      const economics = buildEconomics({ snapshot: snap, state: state([current()]), items: [], coverage: [] });
      assert.equal(economics.cashComplete, false);
      assert.equal(economics.cash90DayMinor, null);
      assert.equal(economics.savings90DayMinor, null);
      assert.ok(economics.unavailableReasons.some(row => /current_inventory_(pack|price)_unknown/.test(row.reasonCode)));
    }
  });

  it("does not produce two schedules for selected extra servings and the same retained stock", () => {
    const plan = buildHorizonPlan({ snapshot, items: [basket(1)], state: state([current()]) });
    assert.equal(plan.complete, false);
    assert.ok(plan.unavailableReasons.some(row => row.reasonCode === "current_inventory_selected_product_overlap"));
    assert.equal(plan.orders.filter(row => row.type === "replenishment").length, 0);
  });

  it("uses explicitly sufficient inventory duration without requiring irrelevant pack facts", () => {
    const plan = buildHorizonPlan({ snapshot, state: state([current({ productId: undefined, daysRemaining: 90 })]) });
    assert.equal(plan.complete, true);
    assert.equal(plan.orders.length, 0);
    assert.equal(plan.nextReplenishmentDay, 90);
    assert.equal(plan.purchaseRequiredNow, false);
  });

  it("keeps estimated or unknown continued intake unavailable without treating food as stock", () => {
    for (const certainty of ["estimated", "unknown"] as const) {
      const s = state([], { intake: [{ source: "current_supplement", certainty, name: mag.name, supplementId: mag.supplementId, productId: product.productId }] });
      assert.equal(buildHorizonPlan({ snapshot, state: s }).complete, false);
      assert.equal(buildEconomics({ snapshot, state: s, items: [], coverage: [] }).cash90DayMinor, null);
    }
    assert.equal(buildHorizonPlan({ snapshot, state: state([], { intake: [{ source: "diet", certainty: "unknown", name: mag.name, supplementId: mag.supplementId }] }) }).complete, true);
  });

  it("carries explicitly supplied continued-observation stock duration into the same measured schedule", () => {
    const s = state([], { intake: [{ source: "current_supplement", certainty: "known", name: mag.name,
      supplementId: mag.supplementId, productId: product.productId, amount: 300, unit: "mg", daysRemaining: 30 }] });
    const horizon = buildHorizonPlan({ snapshot, state: s });
    assert.equal(horizon.complete, true);
    assert.equal(horizon.durationUnknown, false);
    assert.equal(horizon.orders[0]?.day, 30);
    assert.deepEqual(horizon.orders[0]?.quantities, [2]);
    assert.equal(buildEconomics({ snapshot, state: s, items: [], coverage: [] }).cashComplete, true);
  });

  it("retains unresolved continued supplements as unknown inventory instead of dropping their costs", () => {
    const s = state([], { leftovers: [{ amount: 1, name: "Undocumented current blend", unit: "serving", source: "current_supplement",
      requestIndex: 2, reason: "not_in_catalogue", severity: "medium" }] });
    const horizon = buildHorizonPlan({ snapshot, state: s, items: [basket()] });
    const economics = buildEconomics({ snapshot, state: s, items: [basket()], coverage: [] });
    assert.equal(horizon.complete, false);
    assert.equal(horizon.nextReplenishmentDay, null);
    assert.deepEqual(horizon.unavailableReasons.find(row => row.reasonCode === "current_inventory_nutrient_unresolved")?.missingFieldNames, ["currentSupplements[2].name"]);
    assert.equal(economics.firstOrderSubtotalMinor, basket().lineTotalMinor);
    assert.equal(economics.cash30DayMinor, null);
    assert.equal(economics.cash90DayMinor, null);
    assert.equal(economics.consumptionScope, "full_horizon");
    assert.equal(economics.consumption30DayMinor, null);
    assert.equal(economics.consumption90DayMinor, null);
    assert.equal(economics.comparisonComplete, false);
    assert.equal(economics.savings90DayMinor, null);
    assert.equal(buildHorizonPlan({ snapshot, state: state([], { leftovers: [{ ...s.leftovers[0]!, source: "target" }] }) }).complete, true);
    assert.equal(buildHorizonPlan({ snapshot, state: state([], { leftovers: [{ ...s.leftovers[0]!, amount: 0 }] }) }).complete, true);
  });
});
