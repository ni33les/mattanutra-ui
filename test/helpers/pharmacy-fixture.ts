import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSql, withDatabaseTransaction } from "../../lib/db.ts";
import { captureAssessment } from "../../lib/assessment-capture.ts";
import { loadLiveRetailSnapshot } from "../../lib/agentic/catalogue/live.ts";
import { valueCatalogueFingerprint } from "../../lib/agentic/value/fingerprint.ts";
import { loadGenerationInput } from "../../lib/assessment-revisions.ts";
import { insertFormulationVersion } from "../../lib/plan-version-writes.ts";
import { buildProductNeeds } from "../../lib/product-recommendation-needs.ts";
import { recommendWithMatcher } from "../../lib/matcher/adapters/web.ts";
import { getTaskBundle } from "../../lib/task-service.ts";
import { prepareTaskCompletionResult, applyTaskCompletionResult } from "../../lib/task-result-applier.ts";
import { loadAdminSafetyReferenceSnapshot } from "../../lib/agentic/catalogue/load-safety-ceilings.ts";
import { fixtureDatabaseUrl } from "./fixture-teardown.ts";
import type { Locale } from "../../lib/i18n.ts";
import type { FormulationBlueprint } from "../../lib/formulation-types.ts";

export async function seedPharmacyFixture(locale: Locale = "en", ready = true, existing?: { planId: string; revision: number }) {
  fixtureDatabaseUrl();
  const sql = getSql()!;
  const [pharmacy] = await sql`select id::text, slug from public.organisations where slug='matcher-v5-isolated-fixture-retailer'`;
  assert.ok(pharmacy, "Controlled public matcher fixtures must be prepared first");
  const captured = existing ?? await captureAssessment({ answers: { firstName: "Pharmacy Fixture", sex: "male", age: "36-45", goals: ["energy"] },
    pharmacyId: pharmacy.slug, locale, sessionId: randomUUID() }, { idempotencyKey: randomUUID() });
  if (!ready) return { planId: captured.planId, pharmacyId: pharmacy.id, slug: pharmacy.slug, revision: captured.revision, productIds: [] as string[], locale };
  const snapshot = await loadLiveRetailSnapshot("TH");
  const product = snapshot.products.find(p => p.candidate.selectedRetailerOrganisationId === pharmacy.id && p.candidate.title.includes("Vitamin D3 1000"));
  assert.ok(product, "Frozen D3 product must be orderable");
  const candidate = { ...product.candidate, priceAmount: 17, unitPriceAmount: 17 };
  assert.equal(candidate.retailRrpPriceAmount, 17, "Do not alter historical fixture prices");
  const formula: FormulationBlueprint = { supplementBreakdown: [{ id: "vitamin_d3", supplement: { en: "Vitamin D3", th: "วิตามินดี 3", "zh-CN": "维生素 D3" },
    category: "foundation", dailyDose: "1000 IU/day", effectivenessRank: 1, rationale: "Explicit isolated fixture", status: "add",
    whyThisIsForYou: "Saved personalised nutrient reasoning", decision: "Saved explanation of the chosen dose",
    cautions: [{ id: "fixture-caution", severity: "caution", body: "Saved ingredient-specific precaution" }] }] };
  const needs = buildProductNeeds({ formulation: formula, foodGuidance: null });
  const match = recommendWithMatcher({ candidates: [candidate], needs, countryCode: "TH", clientContext: { ageYears: 40, lifestage: "adult" },
    stackPreference: "balanced", catalogueFingerprint: valueCatalogueFingerprint(snapshot) });
  assert.equal(match.recommendations.length, 1);
  const generation = (await loadGenerationInput(sql, captured.planId, locale))!;
  await insertFormulationVersion(sql, { planId: captured.planId, generation, modelVersion: "pharmacy-isolated-fixture", formulation: formula });
  await sql`update public.tasks set status='completed' where plan_id=${captured.planId}::uuid and task_type in ('generate_supplement_guidance','generate_product_recommendations')`;
  const [taskRow] = await sql`select id::text from public.tasks where plan_id=${captured.planId}::uuid and task_type='generate_product_recommendations'`;
  const original = (await getTaskBundle({ taskId: taskRow.id })).task;
  const { runtimeRevision, fingerprint } = await loadAdminSafetyReferenceSnapshot(sql);
  assert.equal(runtimeRevision, snapshot.runtimeRevision);
  const safetyReferenceIdentity = { runtimeRevision, fingerprint };
  const task = { ...original, payload: { ...(original.payload as Record<string, unknown>), catalogueRevision: runtimeRevision, safetyReferenceIdentity,
    productPreferences: { revision: 0, excludedProductIds: [], searchEffort: "standard" } } };
  const resultPayload = { catalogueRevision: runtimeRevision, safetyReferenceIdentity, recommendations: match,
    recommendationVariants: [{ stackPreference: "balanced", maxProducts: null, recommendations: match }] };
  const preparedResult = await prepareTaskCompletionResult({task,resultPayload,sql});
  await withDatabaseTransaction(sql, tx => applyTaskCompletionResult({task,taskId:task.id,resultPayload,preparedResult,sql:tx,afterCommit:()=>{}}));
  return { planId: captured.planId, pharmacyId: pharmacy.id, slug: pharmacy.slug, revision: captured.revision, productIds: [candidate.id], locale };
}
