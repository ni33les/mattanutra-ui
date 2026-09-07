import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intakeCertaintyFor } from "../lib/agentic/plan/intake-certainty.ts";
import { coverageFor } from "../lib/agentic/plan/matching.ts";
import type { CanonicalPlanState } from "../lib/agentic/plan/types.ts";
import { matcherSafetyCeilings, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";

const subjectId = "sup_magnesium_provenance";
const state: CanonicalPlanState = {
  acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [], destinationCountry: "TH",
  leftovers: [], locale: "en", medicationCodes: [], optimization: "lowest_cost", pinnedOptionId: null,
  profile: { ageYears: 35, lifeStage: "adult" }, profileKnown: { ageYears: true, lifeStage: true, sex: false },
  requirements: {}, safetyAcknowledgement: null,
  targets: [{ name: "Magnesium", supplementId: subjectId, amount: 300, unit: "mg", basis: "total_daily" }]
};
const request = { destinationCountry: "TH", locale: "en", optimization: "lowest_cost" as const,
  profile: { ageYears: 35, lifeStage: "adult" as const }, requirements: {}, targets: state.targets,
  currentSupplements: [] };
const knownDiet = { source: "diet" as const, certainty: "known" as const, amount: 0, unit: "mg" as const, supplementId: subjectId };

describe("intake provenance survives matching", () => {
  it("omitted or empty observations never establish zero dietary intake", () => {
    assert.equal(intakeCertaintyFor(state, subjectId), "unknown");
    assert.equal(intakeCertaintyFor({ ...state, intake: [], originalRequest: request }, subjectId), "unknown");
    assert.equal(coverageFor(state, null)[0]?.totalExposureComplete, false);
  });
  it("explicit measured zero and explicitly no continued supplements establish known intake", () => {
    const complete = { ...state, intake: [knownDiet], originalRequest: request };
    assert.equal(intakeCertaintyFor(complete, subjectId), "known");
    assert.equal(coverageFor(complete, null)[0]?.totalExposureComplete, true);
    assert.equal(intakeCertaintyFor({ ...complete, originalRequest: undefined }, subjectId), "unknown");
  });
  it("estimates remain estimates and unrelated nutrient observations do not establish exposure", () => {
    assert.equal(intakeCertaintyFor({ ...state, originalRequest: request,
      intake: [{ ...knownDiet, certainty: "estimated", minimum: 100, maximum: 200 }] }, subjectId), "estimated");
    assert.equal(intakeCertaintyFor({ ...state, originalRequest: request,
      intake: [{ ...knownDiet, supplementId: "sup_other" }] }, subjectId), "unknown");
  });
  it("unquantified or unresolved continued intake preserves uncertainty", () => {
    const complete = { ...state, originalRequest: request, intake: [knownDiet] };
    assert.equal(intakeCertaintyFor({ ...complete, intake: [knownDiet,
      { source: "current_supplement", certainty: "unknown", description: "A daily multivitamin" }] }, subjectId), "unknown");
    assert.equal(intakeCertaintyFor({ ...complete, leftovers: [{ source: "current_supplement",
      name: "Unresolved blend", reason: "not_in_catalogue", severity: "high" }] }, subjectId), "unknown");
  });
  it("supplemental limits exclude measured food intake and require known population", () => {
    const previous = matcherSafetyCeilings();
    try {
      setMatcherSafetyCeilings([{ subjectId, name: "Magnesium", maxAmount: 350, maxUnit: "mg",
        lifeStage: "adult", sourceScope: "supplemental", bandId: "adult-magnesium-supplemental" }]);
      const complete: CanonicalPlanState = { ...state, originalRequest: request,
        intake: [{ ...knownDiet, amount: 1000 }], currentSupplements: [{ name: "Magnesium", supplementId: subjectId, dailyAmount: 175, unit: "mg" }] };
      const row = coverageFor(complete, null)[0]!;
      assert.equal(row.currentAmount, 1175);
      assert.equal(row.totalExposureAmount, 1175);
      assert.equal(row.percentOfUpperLimit, 50);
      assert.equal(row.sourceScope, "supplemental");
      const supplemental = coverageFor({ ...complete, targets: complete.targets.map(target => ({ ...target, basis: "supplemental" as const })) }, null)[0]!;
      assert.equal(supplemental.currentAmount, 175);
      assert.equal(supplemental.totalExposureAmount, 1175);
      assert.equal(supplemental.percentOfUpperLimit, 50);
      const unknown = coverageFor({ ...complete, profileKnown: { ageYears: false, lifeStage: false, sex: false } }, null)[0]!;
      assert.equal(unknown.upperLimitAmount, null);
      assert.equal(unknown.percentOfUpperLimit, null);
    } finally { setMatcherSafetyCeilings(previous); }
  });
});
