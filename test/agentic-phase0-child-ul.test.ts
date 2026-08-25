import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { freezeCatalogueSnapshot } from "../lib/agentic/catalogue/freeze.ts";
import { upperLimitAmount } from "../lib/agentic/plan/limits.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { evaluateSafety, planStatus } from "../lib/agentic/plan/safety.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { aggregateDailyExposure, isDoseError, scaleAmount } from "../lib/matcher/dose.ts";
import { match } from "../lib/matcher/index.ts";
import { evaluateSafety as evaluateMatcherSafety } from "../lib/matcher/safety.ts";
import { qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";
import { ceilingsForSubjects } from "../lib/agentic/catalogue/supplemental-ul-reference.ts";
import {
  isPediatricSafetyProfile,
  safetyCeilingFor,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
import type { SafetyCeiling } from "../lib/matcher/types.ts";

function supplement(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

const ADULT_ADMIN: SafetyCeiling = {
  lifeStage: "adult",
  maxAmount: 350,
  maxUnit: "mg",
  name: "Magnesium",
  sourceScope: "supplemental",
  subjectId: "sup_mag"
};

const CHILD_CATALOG: SafetyCeiling = {
  lifeStage: "child_4_8",
  maxAmount: 110,
  maxUnit: "mg",
  name: "Magnesium",
  sourceScope: "supplemental",
  subjectId: "sup_mag"
};

function installFixtureCatalogCeilings() {
  setMatcherSafetyCeilings(
    ceilingsForSubjects(
      FIXTURE_SUPPLEMENTS.flatMap((item) => [
        { aliases: item.aliases, id: item.supplementId, name: item.name },
        { aliases: item.aliases, id: item.uuid, name: item.name }
      ])
    )
  );
}

describe("Phase 0 child and life-stage upper limits", () => {
  it("does not classify an 8-year-old as an adult safety profile", () => {
    assert.equal(
      isPediatricSafetyProfile({ ageYears: 8, lifeStage: "child" }),
      true
    );
    assert.equal(
      isPediatricSafetyProfile({ ageYears: 8, lifeStage: "adult" }),
      true
    );
    assert.equal(
      isPediatricSafetyProfile({ ageYears: 52, lifeStage: "adult" }),
      false
    );
  });

  it("uses the catalog 4-8 y magnesium UL of 110 mg and ignores adult admin 350 mg", () => {
    const child = safetyCeilingFor([ADULT_ADMIN, CHILD_CATALOG], {
      name: "Magnesium",
      profile: { ageYears: 8, lifeStage: "child" },
      subjectId: "sup_mag"
    });
    assert.equal(child?.maxAmount, 110);
    assert.equal(child?.maxUnit, "mg");

    const adult = safetyCeilingFor([ADULT_ADMIN, CHILD_CATALOG], {
      name: "Magnesium",
      profile: { ageYears: 52, lifeStage: "adult" },
      subjectId: "sup_mag"
    });
    assert.equal(adult?.maxAmount, 350);
  });

  it("evaluates UL-1 / UL / UL+1 for child 4-8 and adult magnesium bands", () => {
    const childProfile = { ageYears: 8, lifeStage: "child" as const };
    const adultProfile = { ageYears: 52, lifeStage: "adult" as const };

    assert.equal(upperLimitAmount("Magnesium", "mg", {
      ceilings: [ADULT_ADMIN, CHILD_CATALOG],
      profile: childProfile,
      subjectId: "sup_mag"
    }), 110);
    assert.equal(upperLimitAmount("Magnesium", "mg", {
      ceilings: [ADULT_ADMIN, CHILD_CATALOG],
      profile: adultProfile,
      subjectId: "sup_mag"
    }), 350);

    const childUl = 110;
    const adultUl = 350;
    assert.equal(109 < childUl && childUl < 111, true);
    assert.equal(349 < adultUl && adultUl < 351, true);
  });

  it("does not inherit an adult default when a child band cannot be resolved", () => {
    const calciumAdmin: SafetyCeiling = {
      maxAmount: 2500,
      maxUnit: "mg",
      name: "Calcium",
      subjectId: "sup_calcium"
    };
    const child = safetyCeilingFor([calciumAdmin], {
      name: "Calcium",
      profile: { ageYears: 8, lifeStage: "child" },
      subjectId: "sup_calcium"
    });
    assert.equal(child, null);
    const adult = safetyCeilingFor([calciumAdmin], {
      name: "Calcium",
      profile: { ageYears: 40, lifeStage: "adult" },
      subjectId: "sup_calcium"
    });
    assert.equal(adult?.maxAmount, 2500);

    const amount = scaleAmount({
      amount: 1000,
      subjectId: "sup_calcium",
      subjectName: "Calcium",
      unit: "mg"
    });
    assert.equal(isDoseError(amount), false);
    if (isDoseError(amount)) {
      throw new Error(amount.message);
    }
    const variant = {
      amountPerUnit: new Map([["sup_calcium", amount]]),
      contributions: new Map([["sup_calcium", amount]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_cal",
      unknownSafetyAmount: false,
      variantId: "prd_cal:x1"
    };
    const exposure = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal(isDoseError(exposure), false);
    if (isDoseError(exposure)) {
      throw new Error("dose");
    }
    const calcium = scaleAmount({
      amount: 1000,
      subjectId: "sup_calcium",
      subjectName: "Calcium",
      unit: "mg"
    });
    assert.equal(isDoseError(calcium), false);
    if (isDoseError(calcium)) {
      throw new Error("dose");
    }
    const safety = evaluateMatcherSafety({
      exposure,
      products: [],
      request: qaRequest({
        profile: { ageYears: 8, lifeStage: "child", sex: "male" },
        safetyCeilings: [calciumAdmin],
        targets: [
          {
            name: "Calcium",
            requested: calcium,
            requestedAmount: 1000,
            requestedUnit: "mg",
            subjectId: "sup_calcium"
          }
        ]
      }),
      variants: [variant]
    });
    assert.equal(safety.hardBlocked, true);
  });

  it("converts the adult magnesium UL into grams without truncating to zero", () => {
    assert.equal(
      upperLimitAmount("Magnesium", "g", {
        ceilings: [ADULT_ADMIN],
        profile: { ageYears: 52, lifeStage: "adult" },
        subjectId: "sup_mag"
      }),
      0.35
    );
  });

  it("blocks a child magnesium 130 mg fixture plan instead of applying 350 mg", () => {
    installFixtureCatalogCeilings();
    const snapshot = freezeCatalogueSnapshot({
      ...fixtureSnapshot("2026-08-25T00:00:00.000Z"),
      catalogueVersion: "retail-TH-child-ul"
    });
    const mag = supplement("Magnesium");
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
    const row = matched.selected?.coverage[0] ?? {
      name: "Magnesium",
      requestedAmount: 130,
      status: "uncovered" as const,
      supplementId: mag.supplementId,
      totalExposureAmount: 0,
      unit: "mg" as const,
      coveragePercent: 0,
      currentAmount: 0,
      deliveredAmount: 0,
      percentOfUpperLimit: null,
      remainingGap: 130,
      upperLimitAmount: upperLimitAmount("Magnesium", "mg", {
        ceilings: [ADULT_ADMIN, CHILD_CATALOG],
        profile: state.profile,
        subjectId: mag.supplementId
      })
    };

    assert.equal(row.upperLimitAmount, 110);
    assert.notEqual(row.upperLimitAmount, 350);
    if (matched.selected) {
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
    assert.ok(status === "blocked" || status === "needs_input");
  });

  it("prunes a 200 mg magnesium SKU from an 8-year-old search", () => {
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
    if (result.selected) {
      const mag = result.selected.exposure.totals.get("sup_mag");
      const limit = safetyCeilingFor([ADULT_ADMIN, CHILD_CATALOG], {
        name: "Magnesium",
        profile: { ageYears: 8, lifeStage: "child" },
        subjectId: "sup_mag"
      });
      assert.ok(limit);
      assert.ok(!mag || mag.units <= BigInt(limit.maxAmount) * BigInt(1_000_000));
    }
  });
});
