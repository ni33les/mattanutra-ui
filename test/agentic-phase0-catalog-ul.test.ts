import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { freezeCatalogueSnapshot } from "../lib/agentic/catalogue/freeze.ts";
import {
  ceilingsForSubjects,
  findReferenceNutrient,
  SUPPLEMENTAL_UL_REFERENCE
} from "../lib/agentic/catalogue/supplemental-ul-reference.ts";
import { upperLimitAmount } from "../lib/agentic/plan/limits.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { evaluateSafety, planStatus } from "../lib/agentic/plan/safety.ts";
import {
  catalogLifeStageFor,
  catalogSubjectHasCeiling,
  resetMatcherSafetyCeilings,
  safetyCeilingFor,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
import type { SafetyCeiling } from "../lib/matcher/types.ts";
import { match } from "../lib/matcher/index.ts";
import { qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function catalogCeilings(): SafetyCeiling[] {
  return ceilingsForSubjects(
    FIXTURE_SUPPLEMENTS.flatMap((item) => [
      { aliases: item.aliases, id: item.supplementId, name: item.name },
      { aliases: item.aliases, id: item.uuid, name: item.name }
    ])
  );
}

function installCatalogCeilings() {
  setMatcherSafetyCeilings(catalogCeilings());
}

const ADULT_MG: SafetyCeiling = {
  lifeStage: "adult",
  maxAmount: 350,
  maxUnit: "mg",
  name: "Magnesium",
  sourceScope: "supplemental",
  subjectId: "sup_mag"
};

const CHILD_MG: SafetyCeiling = {
  lifeStage: "child_4_8",
  maxAmount: 110,
  maxUnit: "mg",
  name: "Magnesium",
  sourceScope: "supplemental",
  subjectId: "sup_mag"
};

describe("Phase 0 catalog-sourced upper limits", () => {
  it("loads catalog safety band ids and versions onto matcher ceilings", () => {
    const source = readFileSync("lib/agentic/catalogue/load-safety-ceilings.ts", "utf8");
    assert.match(source, /bands\.id::text as band_id/);
    assert.match(source, /bands\.version as band_version/);
    assert.match(source, /bandId:/);
    assert.match(source, /bandVersion/);
    assert.doesNotMatch(source, /maxAmount:\s*350/);
  });

  it("does not encode NIH milligram constants in the matcher selector", () => {
    const source = readFileSync("lib/matcher/safety-ceilings.ts", "utf8");
    assert.doesNotMatch(source, /nihBandFor/);
    assert.doesNotMatch(source, /magnesiumUlMg/);
    assert.doesNotMatch(source, /fallbackSafetyCeiling/);
    assert.doesNotMatch(source, /maxAmount:\s*350/);
    assert.doesNotMatch(source, /maxAmount:\s*110/);
    assert.doesNotMatch(source, /maxAmount:\s*45/);
    assert.doesNotMatch(source, /return 350/);
    assert.doesNotMatch(source, /return 110/);
    assert.doesNotMatch(source, /supplemental-ul-reference/);
    assert.match(source, /catalogLifeStageFor/);
  });

  it("pins magnesium and iron catalog bands to the NIH ODS reference table", () => {
    const magnesium = findReferenceNutrient("Magnesium");
    const iron = findReferenceNutrient("Iron");
    assert.ok(magnesium);
    assert.ok(iron);
    assert.equal(magnesium.sourceScope, "supplemental");
    assert.equal(
      magnesium.bands.find((band) => band.lifeStage === "adult")?.maxAmount,
      350
    );
    assert.equal(
      magnesium.bands.find((band) => band.lifeStage === "child_4_8")?.maxAmount,
      110
    );
    assert.equal(
      iron.bands.find((band) => band.lifeStage === "adult")?.maxAmount,
      45
    );
    assert.equal(
      iron.bands.find((band) => band.lifeStage === "pregnant")?.maxAmount,
      45
    );
    assert.match(SUPPLEMENTAL_UL_REFERENCE.authority, /NIH/);
    assert.match(magnesium.authorityUrl, /Magnesium-HealthProfessional/);
    assert.match(iron.authorityUrl, /Iron-HealthProfessional/);
  });

  it("selects catalog adult 350 mg and child_4_8 110 mg instead of inheriting adult", () => {
    const ceilings = [ADULT_MG, CHILD_MG];
    assert.equal(catalogLifeStageFor({ ageYears: 52, lifeStage: "adult" }), "adult");
    assert.equal(catalogLifeStageFor({ ageYears: 8, lifeStage: "child" }), "child_4_8");

    const adult = safetyCeilingFor(ceilings, {
      name: "Magnesium",
      profile: { ageYears: 52, lifeStage: "adult" },
      subjectId: "sup_mag"
    });
    const child = safetyCeilingFor(ceilings, {
      name: "Magnesium",
      profile: { ageYears: 8, lifeStage: "child" },
      subjectId: "sup_mag"
    });
    assert.equal(adult?.maxAmount, 350);
    assert.equal(child?.maxAmount, 110);
    assert.notEqual(child?.maxAmount, adult?.maxAmount);
  });

  it("fail-closes when the required child band is missing even if an adult row exists", () => {
    const child = safetyCeilingFor([ADULT_MG], {
      name: "Magnesium",
      profile: { ageYears: 8, lifeStage: "child" },
      subjectId: "sup_mag"
    });
    assert.equal(child, null);
    assert.equal(
      catalogSubjectHasCeiling([ADULT_MG], {
        name: "Magnesium",
        subjectId: "sup_mag"
      }),
      true
    );
  });

  it("evaluates 349 / 350 / 351 / 400 / 700 mg total magnesium against catalog 350", () => {
    installCatalogCeilings();
    const adult = { ageYears: 52, lifeStage: "adult" as const };
    const mag = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Magnesium");
    assert.ok(mag);

    const ul = upperLimitAmount("Magnesium", "mg", {
      ceilings: catalogCeilings(),
      profile: adult,
      subjectId: mag.supplementId
    });
    assert.equal(ul, 350);
    assert.equal(349 < ul!, true);
    assert.equal(350 === ul, true);
    assert.equal(351 > ul!, true);
    assert.equal(400 > ul!, true);
    assert.equal(700 > ul!, true);

    const grams = upperLimitAmount("Magnesium", "g", {
      ceilings: catalogCeilings(),
      profile: adult,
      subjectId: mag.supplementId
    });
    assert.equal(grams, 0.35);
    resetMatcherSafetyCeilings();
  });

  it("does not mark 700 mg total exposure ready after an overlap acknowledgement", () => {
    installCatalogCeilings();
    const mag = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Magnesium");
    assert.ok(mag);
    const state = aug25PlanState({
      currentSupplements: [
        {
          dailyAmount: 400,
          name: "Magnesium",
          supplementId: mag.supplementId,
          unit: "mg"
        }
      ],
      profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
      safetyAcknowledgement: {
        confirmed: true,
        guidanceIds: ["gdn:duplicate_or_overlap:overlap"],
        revision: 1
      },
      targets: [
        {
          amount: 600,
          name: "Magnesium",
          supplementId: mag.supplementId,
          unit: "mg"
        }
      ]
    });
    const selected = {
      basket: [
        {
          availabilityAsOf: "2026-08-25T00:00:00.000Z",
          contributionSupplementIds: [mag.supplementId],
          currency: "THB",
          dailyPills: 1,
          deliveryWindow: null,
          fixture: true,
          form: "capsule",
          imageUrl: null,
          incidentalNutrientNames: [],
          incidentalNutrients: [],
          incompleteCommercialFacts: false,
          lineTotalMinor: 120,
          pillsPerServing: 1,
          productId: "prd_mag",
          productName: "Magnesium 300",
          quantity: 1,
          requestedNutrientNames: ["Magnesium"],
          retailerSku: "G-MAG-300",
          sellerId: "seller",
          sellerName: "QA",
          servingsPerDay: 1,
          source: "fixture" as const,
          stockStatus: "in_stock" as const,
          unitPriceMinor: 120
        }
      ],
      coverage: [
        {
          coveragePercent: 50,
          currentAmount: 400,
          deliveredAmount: 300,
          name: "Magnesium",
          percentOfUpperLimit: 200,
          remainingGap: 200,
          requestedAmount: 600,
          status: "upper_limit_risk" as const,
          supplementId: mag.supplementId,
          totalExposureAmount: 700,
          unit: "mg" as const,
          upperLimitAmount: 350
        }
      ],
      coveragePercent: 50,
      dailyPills: 1,
      matcherVersion: "pareto-hybrid-1",
      optionId: "opt_overlap",
      reason: "test",
      snapshotId: "snap_phase0_ul",
      totalPriceMinor: 120
    };
    const guidance = evaluateSafety({
      locale: "en",
      selected,
      state
    });
    assert.equal(
      guidance.some(
        (item) => item.action === "block" && item.code === "dose_review_required"
      ),
      true
    );
    const status = planStatus({
      guidance,
      questions: [],
      selected,
      state,
      unmetRequirements: []
    });
    assert.equal(status, "blocked");
    assert.notEqual(status, "ready");
    resetMatcherSafetyCeilings();
  });

  it("keeps exact catalog UL ready after acknowledgement when no questions remain", () => {
    const selected = {
      basket: [
        {
          availabilityAsOf: "2026-08-25T00:00:00.000Z",
          contributionSupplementIds: ["sup_mag"],
          currency: "THB",
          dailyPills: 1,
          deliveryWindow: null,
          fixture: true,
          form: "capsule",
          imageUrl: null,
          incidentalNutrientNames: [],
          incidentalNutrients: [],
          incompleteCommercialFacts: false,
          lineTotalMinor: 120,
          pillsPerServing: 1,
          productId: "prd_mag",
          productName: "Magnesium 350",
          quantity: 1,
          requestedNutrientNames: ["Magnesium"],
          retailerSku: "G-MAG-350",
          sellerId: "seller",
          sellerName: "QA",
          servingsPerDay: 1,
          source: "fixture" as const,
          stockStatus: "in_stock" as const,
          unitPriceMinor: 120
        }
      ],
      coverage: [
        {
          coveragePercent: 175,
          currentAmount: 0,
          deliveredAmount: 350,
          name: "Magnesium",
          percentOfUpperLimit: 100,
          remainingGap: 0,
          requestedAmount: 200,
          status: "upper_limit_risk" as const,
          supplementId: "sup_mag",
          totalExposureAmount: 350,
          unit: "mg" as const,
          upperLimitAmount: 350
        }
      ],
      coveragePercent: 175,
      dailyPills: 1,
      matcherVersion: "pareto-hybrid-1",
      optionId: "opt_exact",
      reason: "test",
      snapshotId: "snap_phase0_ul",
      totalPriceMinor: 120
    };
    const status = planStatus({
      guidance: [],
      questions: [],
      selected,
      state: aug25PlanState({
        safetyAcknowledgement: {
          confirmed: true,
          guidanceIds: ["gdn:dose_review_required:dose"],
          revision: 1
        }
      }),
      unmetRequirements: []
    });
    assert.equal(status, "ready");
  });

  it("blocks a child 130 mg magnesium fixture plan using catalog 110 mg", () => {
    installCatalogCeilings();
    const snapshot = freezeCatalogueSnapshot({
      ...fixtureSnapshot("2026-08-25T00:00:00.000Z"),
      catalogueVersion: "retail-TH-child-ul"
    });
    const mag = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Magnesium");
    assert.ok(mag);
    const state = aug25PlanState({
      profile: { ageYears: 8, lifeStage: "child", sex: "male" },
      targets: [
        {
          amount: 130,
          name: "Magnesium",
          supplementId: mag.supplementId,
          unit: "mg"
        }
      ]
    });
    const matched = matchPlan({ snapshot, state });
    assert.equal(
      upperLimitAmount("Magnesium", "mg", {
        ceilings: catalogCeilings(),
        profile: state.profile,
        subjectId: mag.supplementId
      }),
      110
    );
    const row = matched.selected?.coverage[0];
    if (row) {
      assert.equal(row.upperLimitAmount, 110);
      assert.notEqual(row.upperLimitAmount, 350);
      assert.ok(row.totalExposureAmount <= 110);
    }
    const guidance = evaluateSafety({
      locale: "en",
      selected: matched.selected,
      state
    });
    const status = planStatus({
      guidance,
      questions: [],
      selected: matched.selected,
      state,
      unmetRequirements: matched.unmetRequirements
    });
    assert.notEqual(status, "ready");
    resetMatcherSafetyCeilings();
  });

  it("blocks a request above the catalog UL even when delivered exposure is capped", () => {
    installCatalogCeilings();
    const snapshot = freezeCatalogueSnapshot({
      ...fixtureSnapshot("2026-08-25T00:00:00.000Z"),
      catalogueVersion: "retail-TH-request-above-ul"
    });
    const mag = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Magnesium");
    const iron = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Iron");
    assert.ok(mag);
    assert.ok(iron);

    const magState = aug25PlanState({
      profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
      targets: [
        { amount: 700, name: "Magnesium", supplementId: mag.supplementId, unit: "mg" }
      ]
    });
    const magMatched = matchPlan({ snapshot, state: magState });
    const magGuidance = evaluateSafety({
      locale: "en",
      selected: magMatched.selected,
      state: magState
    });
    assert.equal(
      planStatus({
        guidance: magGuidance,
        questions: [],
        selected: magMatched.selected,
        state: magState,
        unmetRequirements: magMatched.unmetRequirements
      }),
      "blocked"
    );

    const ironState = aug25PlanState({
      profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
      targets: [
        { amount: 46, name: "Iron", supplementId: iron.supplementId, unit: "mg" }
      ]
    });
    const ironMatched = matchPlan({ snapshot, state: ironState });
    const ironGuidance = evaluateSafety({
      locale: "en",
      selected: ironMatched.selected,
      state: ironState
    });
    assert.equal(
      planStatus({
        guidance: ironGuidance,
        questions: [],
        selected: ironMatched.selected,
        state: ironState,
        unmetRequirements: ironMatched.unmetRequirements
      }),
      "blocked"
    );
    resetMatcherSafetyCeilings();
  });

  it("prunes a 200 mg magnesium SKU from an 8-year-old search against catalog 110 mg", () => {
    const mag200 = qaProduct({
      facts: [{ amount: 200, key: "mag" }],
      id: "G-MAG-200",
      priceThb: 190
    });
    const mag100 = qaProduct({
      facts: [{ amount: 100, key: "mag" }],
      id: "G-MAG-100",
      priceThb: 180
    });
    const result = match(
      qaRequest({
        profile: { ageYears: 8, lifeStage: "child", sex: "male" },
        targets: [qaTarget("mag", 130)]
      }),
      {
        availabilityAsOf: "2026-08-25T00:00:00.000Z",
        catalogueVersion: "qa-child-ul",
        products: [mag200, mag100]
      }
    );
    assert.equal(result.selected?.productIds.includes("G-MAG-200"), false);
  });
});
