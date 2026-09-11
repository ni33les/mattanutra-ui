import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFormulationSafety } from "../lib/formulation-safety.ts";
import { applyFoodGuidanceSafety } from "../lib/food-guidance-safety.ts";
import { toAssessmentAnswers } from "../lib/questionnaire/normalize.ts";
import { assessmentFieldKnown } from "../lib/assessment-input-provenance.ts";
import { buildInitialAnswers } from "../components/assessment-flow-state.ts";
import { computeHealthScore } from "../lib/health-score.ts";
import { nutritionJourneyStatusFromCounts } from "../lib/nutrition-journey-status.ts";
import { normalizedProductExclusions, requireCurrentProductSelection } from "../lib/assessment-product-preferences.ts";
import { FUNNEL_GENERATOR_VERSION, generationTaskId } from "../lib/assessment-revisions.ts";
import { productRecommendationClientContextFromPlan } from "../lib/task-work-items.ts";

function catalogueSql(table: string, rows: unknown[]) {
  const sql = (async (parts: TemplateStringsArray) => {
    assert.ok(parts.join(" ").includes(`from public.${table}`), "advisory generation must not create a mandatory review task");
    return rows;
  }) as unknown as Parameters<typeof applyFormulationSafety>[0];
  Object.assign(sql, { json: (value: unknown) => value });
  return sql;
}
const planId = "55555555-5555-4555-8555-555555555555";
const taskId = "66666666-6666-4666-8666-666666666666";
const base = { locale: "en" as const, plan: "precision" as const, planId, taskId, afterCommit: () => undefined };
const ingredient = { category: "Core", dailyDose: "1000 mg/day", effectivenessRank: 1, id: "omega_3", rationale: "Requested support", status: "review" as const, supplement: "Omega-3" };

describe("web advisory behavior v4", () => {
  it("keeps the requested dose visible with both medication and limit advice", async () => {
    const result = await applyFormulationSafety(catalogueSql("supplements", [{ id: planId, name: "Omega-3", normalized_name: "omega_3", aliases: [], is_active: true, list_status: "active", max_amount: 500, max_unit: "mg/day", safety_flags: ["bleeding_risk"], safety_notes: "Catalogue interaction evidence", confidence: "moderate" }]), {
      ...base, answers: { meds: "yes", medTypes: ["bloodthinner"] }, formulation: { supplementBreakdown: [ingredient] }
    });
    assert.equal(result.supplementBreakdown.length, 1);
    const item = result.supplementBreakdown[0]!;
    assert.equal(item.dailyDose, "1000 mg/day");
    assert.equal(item.status, "add");
    assert.equal(item.safety?.visibility, "visible");
    assert.equal(item.safety?.action, "advisory");
    assert.deepEqual(item.safety?.advice?.map(row => row.code), ["client_medication_context", "reference_limit_exceeded"]);
    assert.equal(item.safety?.advice?.[1]?.referenceLimit?.amount, 500);
    assert.equal(item.safety?.advice?.[1]?.evidence.source, "Catalogue interaction evidence");
    assert.match(JSON.stringify(item.safety?.message), /1000.*500/);
    assert.ok(JSON.stringify(item.safety?.message).includes("zh-CN"));
    assert.equal(result.safetySummary.adjustedCount, 0);
    assert.equal(result.safetySummary.hiddenCount, 0);
  });

  it("keeps unknown ingredients visible with explicit uncertainty", async () => {
    const result = await applyFormulationSafety(catalogueSql("supplements", []), { ...base, formulation: { supplementBreakdown: [ingredient] } });
    assert.equal(result.supplementBreakdown[0]?.safety?.advice?.[0]?.code, "unknown_supplement");
    assert.equal(result.supplementBreakdown[0]?.safety?.visibility, "visible");
    assert.equal(result.supplementBreakdown[0]?.dailyDose, ingredient.dailyDose);
  });

  it("does not hide food because an acknowledgement is absent or a condition applies", async () => {
    const result = await applyFoodGuidanceSafety(catalogueSql("foods", [{ id: planId, name: "Spinach", normalized_name: "spinach", aliases: [], is_active: true, list_status: "whitelisted", condition_flags: ["kidney"], allergen_flags: [], nutrient_profile: [], nutrient_tags: [], benefit_tags: [], default_serving: null, safety_notes: "Kidney context", confidence: "moderate" }]), {
      ...base, answers: { kidney: "reduced", disclosure: false }, foodGuidance: { foodGuidance: [{ category: "Vegetables", effectivenessRank: 1, food: "Spinach", frequency: "Weekly", id: "spinach", rationale: "Variety", serving: "One portion", status: "add" }] }
    });
    assert.equal(result.foodGuidance.length, 1);
    assert.equal(result.foodGuidance[0]?.safety?.visibility, "visible");
    assert.equal(result.foodGuidance[0]?.safety?.advice?.[0]?.code, "food_health_context");
    assert.equal(result.foodSafetySummary.hiddenCount, 0);
  });

  it("captures known fields before defaults without changing HealthScore numeric results", () => {
    const raw = { age: "35", sex: "female", consentSafety: true };
    const normalized = toAssessmentAnswers(raw);
    assert.equal(assessmentFieldKnown(normalized, "age"), true);
    assert.equal(assessmentFieldKnown(normalized, "meds"), false);
    assert.equal(assessmentFieldKnown(normalized, "kidney"), false);
    assert.equal(normalized.disclosure, true, "privacy permission remains intact");
    const context = productRecommendationClientContextFromPlan(normalized, [], []);
    assert.equal(context.currentSupplements, null, "a default no-supplements value is not known zero intake");
    assert.equal(context.medications, null, "privacy permission does not assert medication disclosure");
    assert.equal(context.profileKnown?.lifeStage, false, "adult age alone does not assert pregnancy status");
    const plain = buildInitialAnswers(normalized);
    assert.deepEqual(computeHealthScore(normalized, "en"), computeHealthScore(plain, "en"));
  });

  it("does not reinterpret legacy questionnaire defaults as known disclosure", () => {
    const legacy = buildInitialAnswers({});
    const score = computeHealthScore(legacy, "en");
    const context = productRecommendationClientContextFromPlan(legacy, [], []);
    assert.deepEqual(context.profileKnown, { ageYears: false, lifeStage: false, sex: false });
    assert.equal(context.ageYears, null);
    assert.equal(context.currentSupplements, null);
    assert.equal(context.medications, null);
    assert.deepEqual(context.unknownHealthFields, ["meds", "kidney", "liver", "surgery"]);
    assert.deepEqual(computeHealthScore(legacy, "en"), score);
  });

  it("treats a completed empty formulation as terminal without inventing a purchase", () => {
    assert.equal(nutritionJourneyStatusFromCounts({ hasPaidPlan: true, formulationComplete: true, visibleSupplementCount: 0, productCount: 0, productSectionStatus: "ready" }), "formulation_ready");
    assert.equal(nutritionJourneyStatusFromCounts({ hasPaidPlan: true, formulationComplete: false, visibleSupplementCount: 0 }), "formulation_pending");
  });

  it("rejects stale selection revisions and excluded products while permitting current clinical-advisory baskets", () => {
    const selection = { assessmentRevision: 3, selectionRevision: 2, runSelectionRevision: 2, runId: "run", candidateKey: "option", availableCandidateKeys: ["option"], selectedIds: [planId], allowedIds: [planId], excludedIds: [] };
    assert.doesNotThrow(() => requireCurrentProductSelection(selection));
    assert.throws(() => requireCurrentProductSelection({ ...selection, expectedAssessmentRevision: 2 }), /changed/);
    assert.throws(() => requireCurrentProductSelection({ ...selection, runSelectionRevision: 1 }), /changed/);
    assert.throws(() => requireCurrentProductSelection({ ...selection, excludedIds: [planId] }), /Replan/);
    assert.throws(() => requireCurrentProductSelection({ ...selection, candidateKey: "old-option" }), /changed/);
    assert.throws(() => requireCurrentProductSelection({ ...selection, allowedIds: [planId, taskId] }), /Replan/, "removing part of an option requires replanning");
    assert.deepEqual(normalizedProductExclusions([planId, planId]), [planId]);
    assert.deepEqual(normalizedProductExclusions([]), []);
    assert.throws(() => normalizedProductExclusions(Array(101).fill(planId)), /100/);
  });

  it("gives generation tasks stable IDs distinct from historical versions, locales and edited inputs", () => {
    const generation = { revision: 1, inputHash: "inputs", answers: {}, locale: "en" as const, generatorVersion: FUNNEL_GENERATOR_VERSION };
    const id = generationTaskId(taskId, generation);
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(id, generationTaskId(taskId, generation));
    assert.notEqual(id, generationTaskId(taskId, { ...generation, generatorVersion: "web-funnel-v1" }));
    assert.notEqual(id, generationTaskId(taskId, { ...generation, locale: "th" }));
    assert.notEqual(id, generationTaskId(taskId, { ...generation, revision: 2 }));
    assert.notEqual(id, generationTaskId(taskId, { ...generation, inputHash: "edited" }));
  });
});
