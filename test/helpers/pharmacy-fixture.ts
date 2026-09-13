import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSql } from "../../lib/db.ts";
import { captureAssessment } from "../../lib/assessment-capture.ts";
import { warmLiveRetailSnapshot } from "../../lib/agentic/catalogue/live.ts";
import { valueCatalogueFingerprint } from "../../lib/agentic/value/fingerprint.ts";
import { loadGenerationInput, FUNNEL_GENERATOR_VERSION } from "../../lib/assessment-revisions.ts";
import { insertFormulationVersion } from "../../lib/plan-version-writes.ts";
import { buildProductNeeds } from "../../lib/product-recommendation-needs.ts";
import { recommendWithMatcher } from "../../lib/matcher/adapters/web.ts";
import { toJsonValue } from "../../lib/assessment-store.ts";
import { fixtureDatabaseUrl } from "./fixture-teardown.ts";
import type { Locale } from "../../lib/i18n.ts";
import type { FormulationBlueprint } from "../../lib/formulation-types.ts";

export async function seedPharmacyFixture(locale: Locale = "en", ready = true) {
  fixtureDatabaseUrl();
  const sql = getSql()!;
  const [pharmacy] = await sql`select id::text, slug from public.organisations where slug='matcher-v5-isolated-fixture-retailer'`;
  assert.ok(pharmacy, "Controlled public matcher fixtures must be prepared first");
  const captured = await captureAssessment({ answers: { firstName: "Pharmacy Fixture", sex: "male", age: "36-45", goals: ["energy"] },
    pharmacyId: pharmacy.slug, locale, sessionId: randomUUID() }, { idempotencyKey: randomUUID() });
  if (!ready) return { planId: captured.planId, pharmacyId: pharmacy.id, slug: pharmacy.slug, revision: captured.revision, productIds: [] as string[], locale };
  const snapshot = await warmLiveRetailSnapshot("TH");
  const product = snapshot.products.find(p => p.sellerId === pharmacy.id && p.candidate.title.includes("Vitamin D3 1000"));
  assert.ok(product, "Frozen D3 product must be orderable");
  const candidate = { ...product.candidate, priceAmount: 17, unitPriceAmount: 17 };
  assert.equal(candidate.retailRrpPriceAmount, 17, "Do not alter historical fixture prices");
  const formula: FormulationBlueprint = { supplementBreakdown: [{ id: "vitamin_d3", supplement: { en: "Vitamin D3", th: "วิตามินดี 3", "zh-CN": "维生素 D3" },
    category: "foundation", dailyDose: "1000 IU/day", effectivenessRank: 1, rationale: "Explicit isolated fixture", status: "add" }] };
  const needs = buildProductNeeds({ formulation: formula, foodGuidance: null });
  const match = recommendWithMatcher({ candidates: [candidate], needs, countryCode: "TH", clientContext: { ageYears: 40, lifestage: "adult" },
    stackPreference: "balanced", catalogueFingerprint: valueCatalogueFingerprint(snapshot) });
  assert.equal(match.recommendations.length, 1);
  const generation = (await loadGenerationInput(sql, captured.planId, locale))!;
  await insertFormulationVersion(sql, { planId: captured.planId, generation, modelVersion: "pharmacy-isolated-fixture", formulation: formula });
  await sql`update public.tasks set status='completed' where plan_id=${captured.planId}::uuid and task_type in ('generate_supplement_guidance','generate_product_recommendations')`;
  const run = randomUUID();
  const retailer = { organisationId: pharmacy.id, organisationName: "Synthetic Matcher Acceptance Retailer", currency: "THB", subtotalAmount: 17 };
  await sql`insert into public.product_recommendation_runs (id,plan_id,assessment_revision,generation_locale,generator_version,selection_revision,catalogue_revision,catalogue_fingerprint,search_effort,
    stack_coverage_percent,supplement_product_coverage_percent,total_coverage_percent,client_needs,diagnostics)
    values (${run}::uuid,${captured.planId}::uuid,${captured.revision},${locale},${FUNNEL_GENERATOR_VERSION},0,${snapshot.runtimeRevision},${match.diagnostics.catalogueFingerprint},'standard',
      ${match.stackCoveragePercent},${match.supplementProductCoveragePercent},${match.totalPlanCoveragePercent},${sql.json(toJsonValue(needs))},
      ${sql.json(toJsonValue({ ...match.diagnostics, selectedRetailer: retailer, retailerOptions: [retailer] }))})`;
  for (const item of match.recommendations) await sql`insert into public.product_recommendation_items
    (run_id,product_id,rank,score,product_coverage_percent,stack_contribution_percent,serving_multiplier,covered_needs,why,url_used,price_amount,currency,selected_retailer_organisation_id,retail_sellable_product_id,availability_status,unit_price_amount,image_url)
    values (${run}::uuid,${item.product.id}::uuid,${item.rank},${item.score},${item.productCoveragePercent},${item.stackContributionPercent},${item.servingMultiplier},
      ${sql.json(toJsonValue(item.coveredNeeds))},${item.why},${item.url},17,'THB',${pharmacy.id}::uuid,${item.retailSellableProductId ?? null}::uuid,'available_now',17,${item.product.imageUrl ?? null})`;
  return { planId: captured.planId, pharmacyId: pharmacy.id, slug: pharmacy.slug, revision: captured.revision, productIds: [candidate.id], locale };
}
