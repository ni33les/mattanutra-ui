import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { evaluateSafety, planStatus } from "../lib/agentic/plan/safety.ts";
import { publicSafetyGuidance } from "../lib/agentic/public-mapper.ts";
import {
  resetMatcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
import {
  beginComRun,
  comCall,
  createComRuntime,
  endComRun,
  errorOf,
  key,
  seedBlocked
} from "./helpers/com-fixtures.ts";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  StackOption
} from "../lib/agentic/plan/types.ts";

const MAG_ID = "sup_199df5c489215c37b85b6bcb14b443fa";
const MAG_BAND_ID = "3e13d7f5-3649-4e4b-b648-70f5470c2c89";
const MAG_SKU = "prd_52b0c7fde34449a29cf6c65d8616b789";

function planState(overrides: Partial<CanonicalPlanState> = {}): CanonicalPlanState {
  return {
    acceptedGaps: [],
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    leftovers: [],
    locale: "en",
    medicationCodes: [],
    optimization: "fewest_pills",
    pinnedOptionId: null,
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    requirements: {},
    safetyAcknowledgement: null,
    targets: [
      {
        amount: 351,
        name: "Magnesium",
        supplementId: MAG_ID,
        unit: "mg"
      }
    ],
    ...overrides
  };
}

function magItem(amount: number): BasketItem {
  return {
    availabilityAsOf: "2026-08-29T00:00:00.000Z",
    contributionSupplementIds: [MAG_ID],
    currency: "THB",
    dailyPills: 1,
    deliveryWindow: null,
    fixture: false,
    form: "tablet",
    imageUrl: null,
    incidentalNutrientNames: [],
    incidentalNutrients: [],
    incompleteCommercialFacts: false,
    lineTotalMinor: 89000,
    pillsPerServing: 1,
    productId: MAG_SKU,
    productName: "Nat Mag",
    quantity: 1,
    requestedNutrientNames: ["Magnesium"],
    requestedNutrients: [{ amount, name: "Magnesium", unit: "mg" }],
    retailerSku: "Nat Mag",
    sellerId: "delight",
    sellerName: "Delight",
    servingsPerDay: 1,
    source: "retail",
    stockStatus: "in_stock",
    unitPriceMinor: 89000
  };
}

function magCoverage(input: Readonly<{
  amount: number;
  requested: number;
  limit?: number | null;
}>): CoverageRow {
  const limit = input.limit ?? null;
  return {
    contributors: [
      {
        amount: input.amount,
        productId: MAG_SKU,
        productName: "Nat Mag",
        source: "selected",
        unit: "mg"
      }
    ],
    coveragePercent: Math.min(100, Math.round((input.amount / input.requested) * 100)),
    currentAmount: 0,
    deliveredAmount: input.amount,
    name: "Magnesium",
    percentOfUpperLimit:
      limit != null && limit > 0 ? Math.round((input.amount / limit) * 100) : null,
    remainingGap: Math.max(0, input.requested - input.amount),
    requestedAmount: input.requested,
    status:
      limit != null && input.amount >= limit
        ? "upper_limit_risk"
        : input.amount >= input.requested
          ? "covered"
          : "partial",
    supplementId: MAG_ID,
    totalExposureAmount: input.amount,
    unit: "mg",
    upperLimitAmount: limit
  };
}

function magOption(coverage: CoverageRow, item: BasketItem): StackOption {
  return {
    basket: [item],
    coverage: [coverage],
    coveragePercent: coverage.coveragePercent,
    dailyPills: item.dailyPills,
    matcherVersion: "pareto-hybrid-1",
    optionId: "opt_rca_mag",
    reason: "fewest_pills",
    snapshotId: "snap_rca",
    totalPriceMinor: 89000
  };
}

function installAdultMagBand() {
  setMatcherSafetyCeilings([
    {
      bandId: MAG_BAND_ID,
      bandVersion: 1,
      lifeStage: "adult",
      maxAmount: 350,
      maxUnit: "mg",
      name: "Magnesium",
      sourceScope: "supplemental",
      subjectId: MAG_ID
    }
  ]);
}

afterEach(() => {
  resetMatcherSafetyCeilings();
});

describe("RCA safety-parity — Magnesium catalogue bands", () => {
  it("RCA-02: UAT deploy applies the same safety-limit-bands schema as DEV", () => {
    const dev = readFileSync(new URL("../scripts/deploy-dev.mjs", import.meta.url), "utf8");
    const uat = readFileSync(new URL("../scripts/deploy-uat.mjs", import.meta.url), "utf8");
    const prd = readFileSync(new URL("../scripts/deploy-prd.mjs", import.meta.url), "utf8");
    assert.match(dev, /supplements:safety-limit-bands:schema:apply/);
    assert.match(uat, /supplements:safety-limit-bands:schema:apply/);
    assert.match(prd, /supplements:safety-limit-bands:schema:apply/);
    assert.match(
      readFileSync(
        new URL("../lib/agentic/catalogue/load-safety-ceilings.ts", import.meta.url),
        "utf8"
      ),
      /supplement_safety_limit_bands/
    );
  });

  it("RCA-07: Magnesium 351 mg with the adult 350 mg band is blocked", () => {
    installAdultMagBand();
    const item = magItem(350);
    const coverage = magCoverage({ amount: 350, requested: 351, limit: 350 });
    const selected = magOption(coverage, item);
    const state = planState();
    const guidance = evaluateSafety({ locale: "en", selected, state });
    const block = guidance.find((row) => row.code === "dose_review_required");
    assert.ok(block);
    assert.equal(block.action, "block");
    assert.equal(block.ruleId, MAG_BAND_ID);
    assert.equal(block.threshold, 350);
    assert.equal(block.exposure, 350);
    assert.equal(
      planStatus({
        guidance,
        questions: [],
        selected,
        state,
        unmetRequirements: []
      }),
      "blocked"
    );
    const published = publicSafetyGuidance(block);
    assert.equal(published.acknowledgementStatus, "not_applicable");
    assert.equal(coverage.status, "upper_limit_risk");
    assert.equal(coverage.upperLimitAmount, 350);
    assert.equal(coverage.percentOfUpperLimit, 100);
  });

  it("RCA-08: execute fails closed on a blocked plan", async () => {
    beginComRun();
    try {
      const runtime = createComRuntime();
      const seeded = await seedBlocked(runtime);
      const executed = await comCall(runtime, "execute", {
        expectedRevision: seeded.revision,
        idempotencyKey: key("rca-08-exec"),
        planHandle: seeded.planHandle
      });
      const err = errorOf(executed);
      assert.equal(err.reasonCode, "plan_not_ready");
    } finally {
      endComRun();
    }
  });

  it("RCA-09: Magnesium 200 mg without CKD stays ready", () => {
    installAdultMagBand();
    const item = magItem(200);
    const coverage = magCoverage({ amount: 200, requested: 200, limit: 350 });
    const selected = magOption(coverage, item);
    const state = planState({
      targets: [{ amount: 200, name: "Magnesium", supplementId: MAG_ID, unit: "mg" }]
    });
    const guidance = evaluateSafety({ locale: "en", selected, state });
    assert.equal(
      guidance.some((row) => row.code === "dose_review_required" && row.action === "block"),
      false
    );
    assert.equal(
      planStatus({
        guidance,
        questions: [],
        selected,
        state,
        unmetRequirements: []
      }),
      "ready"
    );
    assert.equal(coverage.status, "covered");
  });

  it("RCA-10: CKD plus Magnesium is blocked by the condition rule", () => {
    installAdultMagBand();
    const item = magItem(200);
    const coverage = magCoverage({ amount: 200, requested: 200, limit: 350 });
    const selected = magOption(coverage, item);
    const state = planState({
      conditionCodes: ["ckd"],
      targets: [{ amount: 200, name: "Magnesium", supplementId: MAG_ID, unit: "mg" }]
    });
    const guidance = evaluateSafety({ locale: "en", selected, state });
    const block = guidance.find(
      (row) => row.action === "block" && row.code === "condition_review_required"
    );
    assert.ok(block);
    assert.equal(Number(block.exposure) > 0, true);
    assert.equal(
      planStatus({
        guidance,
        questions: [],
        selected,
        state,
        unmetRequirements: []
      }),
      "blocked"
    );
  });
});
