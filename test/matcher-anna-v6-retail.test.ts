import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { matchPlan, toCanonicalRequest } from "../lib/agentic/plan/matching.ts";
import { normalizePlanRequest } from "../lib/agentic/plan/normalize.ts";
import { matcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import { publicOption } from "../lib/agentic/public-mapper.ts";
import type { CatalogueSnapshot } from "../lib/agentic/catalogue/types.ts";
import type { SafetyCeiling } from "../lib/matcher/types.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/anna-v6/dev-baseline.json", import.meta.url), "utf8")) as {
  catalogueId: string; catalogue: CatalogueSnapshot; ceilings: SafetyCeiling[];
  request: { requirements: { maxProductCount: number; maxDailyPills: number }; optimization: string; targets: { name: string; amount: number; unit: string }[] };
};

test("ANNA6-RETAIL-01 original request and objective-only revision retain productive purchase choices", async () => {
  assert.equal(fixture.catalogueId, "snap_00e8f4311baa16a3");
  assert.equal(fixture.catalogue.products.length, 154);
  assert.equal(new Set(fixture.catalogue.products.map(product => product.productId)).size, 79);
  assert.deepEqual(fixture.request.requirements, { maxProductCount: 2, maxDailyPills: 2 });
  const before = matcherSafetyCeilings();
  setMatcherSafetyCeilings(fixture.ceilings);
  try {
    for (const optimization of ["lowest_cost", "best_coverage"]) {
      // Exactly the reported create/revise payload. No inflated targets, removed
      // health context, invented food amounts, or relaxed eligibility categories.
      const normalized = await normalizePlanRequest({ request: { ...fixture.request, optimization }, snapshot: fixture.catalogue, config: loadAgenticConfig() });
      assert.ok(!("error" in normalized));
      assert.equal(normalized.state.targets.length, 4);
      assert.deepEqual(normalized.state.medicationCodes, ["paracetamol"]);
      assert.deepEqual(normalized.state.conditionCodes, ["perimenopause", "high_cholesterol"]);
      assert.deepEqual(normalized.state.currentSupplements, []);
      const request = toCanonicalRequest(normalized.state);
      assert.ok(!("error" in request));
      assert.ok(request.targets.every(target => target.basis === "total_daily"));
      assert.equal(request.dietaryIntake?.length ?? 0, 0);
      const result = matchPlan({ snapshot: fixture.catalogue, state: normalized.state });
      const options = [result.selected, ...result.alternatives].filter(option => option != null);
      assert.ok(options.some(option => option.purchaseEligible && option.basket.length > 0));
      assert.ok(result.selected!.basket.length > 0);
      assert.ok(result.selected!.doseFit!.total < 4, "bounded observed dose fit improves on the original empty loss of four; no global optimum claim");
      assert.deepEqual(result.unmetRequirements, []);
      assert.ok(result.matchingDiagnostics!.eligibleListings > 2);
      assert.ok(result.matchingDiagnostics!.supportedDoseVariants > 0);
      assert.ok(result.matchingDiagnostics!.evaluatedNonemptyBaskets > 0);
      assert.equal(result.matchingDiagnostics!.reasonCode, "purchase_options_available");
      assert.ok(result.searchSummary!.expansionAttempts > 0 && result.searchSummary!.expansionAttempts <= 8000);
      for (const option of options) {
        const published = publicOption(option, result.selected);
        assert.equal(published.coverage.length, 4);
        assert.ok((published.advice ?? []).every(advice => advice.action === "review" && advice.acknowledgementStatus === "not_required"));
        const expectedPrice = option.basket.reduce((sum, item) => {
          const listing = fixture.catalogue.products.find(product => product.productId === item.productId && product.sellerId === item.sellerId);
          assert.ok(listing, "every line belongs to the frozen seller catalogue");
          return sum + listing.unitPriceMinor;
        }, 0);
        assert.equal(option.totalPriceMinor, expectedPrice);
        if (published.basket.some(item => item.dailyPills == null)) assert.equal(published.stackSummary.totalDailyPills, null);
      }
    }
  } finally { setMatcherSafetyCeilings(before); }
});
