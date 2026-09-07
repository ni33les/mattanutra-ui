import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { normalizePlanRequest } from "../lib/agentic/plan/normalize.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { publicOption } from "../lib/agentic/public-mapper.ts";
import { sampleRetailProduct, sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";

for (const confidence of ["low", "moderate"] as const) {
  test(`MCP5-EVIDENCE-${confidence}: reported label quantities cannot become verified coverage or complete exposure`, async () => {
    const snapshot = sampleValueSnapshot(), target = snapshot.supplements[1]!;
    const base = sampleRetailProduct({ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee16", title: "Reported magnesium label", name: target.name, supplementId: target.supplementId, amount: 150, unit: "mg", unitPriceMinor: 10000, form: "capsule", servingLabel: "1 capsule; 30 capsules per bottle" });
    const product = { ...base, candidate: { ...base.candidate, facts: base.candidate.facts.map(fact => ({ ...fact, confidence })) } };
    const catalogue = { ...snapshot, products: [product] };
    const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot: catalogue, request: {
      locale: "en", destinationCountry: "TH", optimization: "balanced", profile: { ageYears: 35, lifeStage: "adult" },
      requirements: { productDoses: [{ productId: product.productId, servingsPerDay: 1 }] },
      targets: [{ name: target.name, supplementId: target.supplementId, amount: 100, unit: "mg", basis: "total_daily" }],
      currentSupplements: [], intake: [{ source: "diet", certainty: "known", name: target.name, supplementId: target.supplementId, amount: 10, unit: "mg" }]
    } });
    assert.ok(!("error" in normalized));
    const result = matchPlan({ state: normalized.state, snapshot: catalogue });
    assert.ok(result.selected);
    const output = publicOption(result.selected, result.selected);
    const row = output.coverage[0];
    assert.equal(output.purchaseEligible, true);
    assert.equal(row.intakeCertainty, "known", "known customer intake remains known");
    assert.equal(row.totalExposureComplete, false, "product evidence is still uncertain");
    assert.equal(row.totalExposureAmount, null);
    assert.equal(row.coveragePercent, 10);
    assert.equal(row.remainingGap, 90);
    assert.equal(output.coverageSummary.fullyMetCount, 0);
    assert.equal(output.doseFit?.perTarget[0].certainty, "unknown");
    assert.equal(output.basket[0].labelledFacts[0].confidence, confidence);
    assert.equal(output.basket[0].labelledFacts[0].amount, 150);
    assert.equal((output.basket[0].incidentalNutrients ?? []).some(fact => fact.name === target.name), false);
    assert.ok(output.advice?.some(advice => advice.code === "unverified_product_facts"));
  });
}
