import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { catalog, product, request } from "./flexible-v5-fixtures.ts";
import { matchingExplanationFor } from "../../lib/agentic/value/matching-explanation.ts";
import { operationalDecision } from "../../lib/agentic/value/operational-decision.ts";
import { canonicalizeCurrents } from "../../lib/matcher/canonicalizer.ts";

describe("Anna trace-backed matching explanations", () => {
  it("ANNA-TRACE-01: listings and unique products are distinguished and true product exclusions explain the empty result", () => {
    const p = product("same", { a: 100 });
    const result = match(request({ excludeProductIds: ["same"] }), catalog([p, { ...p, sellerId: "other" }]));
    const trace = result.matchingDiagnostics!;
    assert.equal(trace.catalogueListings, 2); assert.equal(trace.catalogueProducts, 1);
    assert.equal(trace.eligibleListings, 0); assert.equal(trace.eligibleProducts, 0);
    assert.equal(trace.reasonCode, "no_eligible_products");
    assert.deepEqual(trace.rejectionCounts, [{ reason: "excluded", count: 2 }]);
    const explanation = matchingExplanationFor({ diagnostics: trace, empty: true, hasUnmetTargets: true, hasPurchaseOptions: false });
    assert.deepEqual(explanation?.recoveryActions, ["refine_request"]);
    assert.equal(operationalDecision({ status: "no_purchase", canRefine: true }).nextAction, "change_request");
  });
  it("ANNA-TRACE-02: a dose-fit-preferred empty basket distinguishes evaluated purchase choices from failed matching", () => {
    const result = match(request(), catalog([product("large", { a: 300 })]));
    assert.equal(result.selected?.productCount, 0);
    assert.ok(result.matchingDiagnostics!.evaluatedNonemptyBaskets > 0);
    assert.equal(result.matchingDiagnostics!.reasonCode, "empty_closest_fit");
    assert.ok(result.alternatives.some(option => option.purchaseEligible));
    for (const locale of ["en", "th", "zh-CN"]) {
      const explanation = matchingExplanationFor({ diagnostics: result.matchingDiagnostics, empty: true, hasUnmetTargets: true, hasPurchaseOptions: true, locale });
      assert.deepEqual(explanation?.recoveryActions, ["review_options"]);
      assert.ok(explanation!.message.length > 30);
    }
  });
  it("ANNA-TRACE-03: numeric zero preferences never appear as rejection causes", () => {
    const result = match(request({ maxProductCount: 0, maxDailyPills: 0, maxPriceMinor: 0 }), catalog([product("exact", { a: 100 })]));
    assert.deepEqual(result.selected?.productIds, ["exact"]);
    assert.deepEqual(result.matchingDiagnostics!.rejectionCounts, []);
    assert.equal(result.matchingDiagnostics!.reasonCode, "purchase_options_available");
  });
  it("ANNA-TRACE-04: historical missing trace does not pretend the unknown cause is medical approval", () => {
    const explanation = matchingExplanationFor({ empty: true, hasUnmetTargets: true, hasPurchaseOptions: false });
    assert.equal(explanation?.reasonCode, "explanation_unavailable");
    assert.deepEqual(explanation?.recoveryActions, ["refine_request"]);
  });
  it("ANNA-TRACE-05: known current coverage cannot erase an unresolved requested nutrient", () => {
    const currentSupplements = canonicalizeCurrents([{ subjectId: "a", name: "A", dailyAmount: 100, unit: "mg", sourceId: "known-a" }]);
    assert.ok(!("error" in currentSupplements));
    const complete = match(request({ currentSupplements }), catalog([]));
    assert.equal(complete.matchingDiagnostics?.reasonCode, "targets_already_covered");
    const unresolved = match(request({ currentSupplements,
      leftovers: [{ name: "Unresolved nutrient", amount: 10, unit: "mg", reason: "not_in_catalogue", severity: "medium" }]
    }), catalog([]));
    assert.equal(unresolved.matchingDiagnostics?.reasonCode, "catalogue_empty");
  });
});
