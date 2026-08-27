import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import nextEnv from "@next/env";
import { AGENTIC_POLL_AFTER_SECONDS } from "../lib/agentic/config.ts";
import { freezeCatalogueSnapshot } from "../lib/agentic/catalogue/freeze.ts";
import { loadLiveRetailSnapshot } from "../lib/agentic/catalogue/live.ts";
import { refreshAdminSafetyCeilings } from "../lib/agentic/catalogue/load-safety-ceilings.ts";
import type { CatalogueSnapshot } from "../lib/agentic/catalogue/types.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { evaluateSafety } from "../lib/agentic/plan/safety.ts";
import { PLAN_MATCH_RETURN_BUDGET_MS } from "../lib/agentic/plan/service.ts";
import type {
  CanonicalPlanState,
  CoverageContributor,
  SafetyGuidance,
  StackOption
} from "../lib/agentic/plan/types.ts";
import {
  catalogBandRuleId,
  matcherSafetyCeilings,
  safetyCeilingFor,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
import type { SafetyCeiling } from "../lib/matcher/types.ts";

const D3_ID = "sup_927083fbb90a5a24b4c55067b06ead5f";
const OMEGA_ID = "sup_9da42d1d24f556d2bd625ea45adfcc4b";
const MAG_ID = "sup_199df5c489215c37b85b6bcb14b443fa";
const B12_ID = "sup_7ddcc4f2708f590599a402d80e935adf";
const C_ID = "sup_a34da45efcf05dbd8a0e7d4f9fc7b71c";

export type DetPackCatalog = Readonly<{
  ceilings: readonly SafetyCeiling[];
  snapshot: CatalogueSnapshot;
}>;

export type DetPackReport = Readonly<{
  catalog: Readonly<{
    catalogueVersion: string;
    productCount: number;
    supplementCount: number;
  }>;
  cases: readonly unknown[];
  efficiency: Readonly<{
    agenticUsesWeb400: boolean;
    budgetMs: number;
    fixtureInBasket: boolean;
    liveMissIsEmptyRetail: boolean;
    packTimeToReady400: number;
    pollAfterSeconds: number;
    rematchOnAnswers: boolean;
  }>;
  scores: Readonly<{
    efficiency: number;
    matching: number;
    safety: number;
  }>;
}>;

function packTimeToReady(matchMs: number, budgetMs: number, pollAfterSeconds: number) {
  if (matchMs <= budgetMs) {
    return matchMs;
  }

  return budgetMs + pollAfterSeconds * 1000;
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortedJson((value as Record<string, unknown>)[key])])
    );
  }

  return value;
}

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
    targets: [],
    ...overrides
  };
}

function officialTargets(): CanonicalPlanState["targets"] {
  return [
    { amount: 2000, name: "Vitamin D3", supplementId: D3_ID, unit: "IU" },
    { amount: 1000, name: "Omega-3", supplementId: OMEGA_ID, unit: "mg" },
    { amount: 200, name: "Magnesium", supplementId: MAG_ID, unit: "mg" },
    { amount: 250, name: "Vitamin B12", supplementId: B12_ID, unit: "mcg" },
    { amount: 500, name: "Vitamin C", supplementId: C_ID, unit: "mg" }
  ];
}

function emptyCatalog(snapshot: CatalogueSnapshot) {
  return (
    snapshot.products.length === 0 ||
    /unavailable$|loading$/.test(snapshot.catalogueVersion)
  );
}

function coverageRows(selected: StackOption | null) {
  return [...(selected?.coverage ?? [])]
    .map((row) => ({
      coveragePercent: row.coveragePercent,
      name: row.name,
      remainingGap: row.remainingGap,
      status: row.status
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function leftoverRows(leftovers: readonly { name: string; reason: string; supplementId?: string }[]) {
  return leftovers
    .map((item) => ({
      name: item.name,
      reason: item.reason,
      ...(item.supplementId ? { supplementId: item.supplementId } : {})
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.reason.localeCompare(right.reason));
}

function safetyRows(rows: readonly SafetyGuidance[]) {
  return [...rows]
    .map((row) => ({
      action: row.action,
      code: row.code,
      contributors: [...row.contributors]
        .map((item: CoverageContributor) => ({
          amount: item.amount,
          productName: item.productName
        }))
        .sort((left, right) => left.productName.localeCompare(right.productName)),
      exposure: row.exposure,
      ruleId: row.ruleId
    }))
    .sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        left.action.localeCompare(right.action) ||
        String(left.ruleId).localeCompare(String(right.ruleId))
    );
}

function caseShape(input: Readonly<{
  id: string;
  leftovers: readonly { name: string; reason: string; supplementId?: string }[];
  safety: readonly SafetyGuidance[];
  selected: StackOption | null;
}>) {
  return {
    coverage: coverageRows(input.selected),
    id: input.id,
    leftovers: leftoverRows(input.leftovers),
    names: [...(input.selected?.basket ?? []).map((item) => item.productName)].sort(),
    optionId: input.selected?.optionId ?? null,
    safety: safetyRows(input.safety),
    skus: [...(input.selected?.basket ?? []).map((item) => item.productId)].sort()
  };
}

function magOptionFrom(selected: StackOption | null): StackOption | null {
  if (!selected) {
    return null;
  }

  const item = selected.basket.find(
    (row) =>
      row.contributionSupplementIds.includes(MAG_ID) || /magnesium/i.test(row.productName)
  );
  const coverage = selected.coverage.find((row) => row.supplementId === MAG_ID);

  if (!item || !coverage) {
    return null;
  }

  return {
    ...selected,
    basket: [item],
    coverage: [coverage]
  };
}

function magContributorAmount(selected: StackOption | null) {
  const row = selected?.coverage.find((item) => item.supplementId === MAG_ID);
  if (row && row.totalExposureAmount > 0) {
    return row.totalExposureAmount;
  }

  const named = (selected?.coverage ?? [])
    .flatMap((item) => item.contributors ?? [])
    .find((item) => /magnesium/i.test(item.productName));
  return named?.amount ?? 0;
}

function magDoseBlock(guidance: readonly SafetyGuidance[]) {
  const blocks = guidance.filter(
    (item) => item.action === "block" && item.code === "dose_review_required"
  );
  return (
    blocks.find(
      (item) =>
        item.supplementIds.includes(MAG_ID) || /magnesium/i.test(item.nutrientName ?? "")
    ) ?? blocks[0]
  );
}

export async function loadDetCatalog(): Promise<DetPackCatalog> {
  nextEnv.loadEnvConfig(process.cwd());
  const snapshot = freezeCatalogueSnapshot(await loadLiveRetailSnapshot("TH"));
  await refreshAdminSafetyCeilings();
  return {
    ceilings: matcherSafetyCeilings(),
    snapshot
  };
}

export function runDetPack(input: DetPackCatalog): DetPackReport {
  setMatcherSafetyCeilings([...input.ceilings]);
  const snapshot = input.snapshot;
  const serviceSource = readFileSync(new URL("../lib/agentic/plan/service.ts", import.meta.url), "utf8");
  const snapshotSource = readFileSync(
    new URL("../lib/agentic/catalogue/snapshot.ts", import.meta.url),
    "utf8"
  );
  const agenticDir = readFileSync(new URL("../lib/agentic/plan/service.ts", import.meta.url), "utf8");
  const agenticUsesWeb400 = /WEB_MATCHER_CONFIG/.test(agenticDir);
  const rematchOnAnswers =
    !/buildPinnedResult/.test(serviceSource) || !/pinPrevious/.test(serviceSource);
  const liveMissIsEmptyRetail =
    /emptyRetailSnapshot/.test(snapshotSource) && !/fixtureSnapshot/.test(snapshotSource);

  const efficiency = {
    agenticUsesWeb400,
    budgetMs: PLAN_MATCH_RETURN_BUDGET_MS,
    fixtureInBasket: false,
    liveMissIsEmptyRetail,
    packTimeToReady400: packTimeToReady(506, 400, 3),
    pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
    rematchOnAnswers
  };

  const catalog = {
    catalogueVersion: snapshot.catalogueVersion,
    productCount: snapshot.products.length,
    supplementCount: snapshot.supplements.length
  };

  if (emptyCatalog(snapshot)) {
    return sortedJson({
      catalog,
      cases: [],
      efficiency,
      scores: { efficiency: 0, matching: 0, safety: 0 }
    }) as DetPackReport;
  }

  const official = matchPlan({
    snapshot,
    state: planState({ targets: officialTargets() })
  });
  const officialSafety = evaluateSafety({
    locale: "en",
    selected: official.selected,
    state: planState({ targets: officialTargets() })
  });
  const mag351 = matchPlan({
    snapshot,
    state: planState({
      targets: [{ amount: 351, name: "Magnesium", supplementId: MAG_ID, unit: "mg" }]
    })
  });
  const mag351Safety = evaluateSafety({
    locale: "en",
    selected: mag351.selected,
    state: planState({
      targets: [{ amount: 351, name: "Magnesium", supplementId: MAG_ID, unit: "mg" }]
    })
  });
  const ckdState = planState({
    conditionCodes: ["ckd"],
    targets: [{ amount: 200, name: "Magnesium", supplementId: MAG_ID, unit: "mg" }]
  });
  const ckdMatch = matchPlan({ snapshot, state: ckdState });
  const ckdSelected = ckdMatch.selected ?? magOptionFrom(official.selected);
  const ckdSafety = evaluateSafety({
    locale: "en",
    selected: ckdSelected,
    state: ckdState
  });

  const liveRetail =
    snapshot.catalogueVersion.startsWith("retail-TH-") &&
    snapshot.products.length > 0 &&
    snapshot.products.every((item) => item.source !== "fixture");
  const selectedOk = Boolean(official.selected?.optionId) && (official.selected?.basket.length ?? 0) > 0;
  const d3 = official.selected?.coverage.find((row) => row.supplementId === D3_ID);
  const names = (official.selected?.basket ?? []).map((item) => item.productName).join(" ");
  const pair =
    /bio calcium\+d3/i.test(names) && /joint mobility plus/i.test(names);
  const b12Gap = official.leftovers.some(
    (item) =>
      (item.supplementId === B12_ID || /b12|vitamin b12/i.test(item.name)) &&
      item.reason === "dose_gap"
  );
  const fixtureInBasket = (official.selected?.basket ?? []).some(
    (item) => item.source === "fixture" || item.fixture
  );

  let matching = 0;
  if (liveRetail) {
    matching += 2;
  }
  if (selectedOk) {
    matching += 2;
  }
  if ((d3?.coveragePercent ?? 0) >= 90) {
    matching += 2;
  }
  if (pair) {
    matching += 2;
  }
  if (b12Gap) {
    matching += 2;
  }

  const magBandId = catalogBandRuleId(
    safetyCeilingFor(input.ceilings, {
      name: "Magnesium",
      profile: { ageYears: 52, lifeStage: "adult" },
      subjectId: MAG_ID
    })
  );
  const mag351Block = magDoseBlock(mag351Safety);
  const magAmount = magContributorAmount(mag351.selected);
  const mag351Ok = Boolean(
    mag351Block &&
      mag351Block.action === "block" &&
      mag351Block.code === "dose_review_required" &&
      magBandId &&
      mag351Block.ruleId === magBandId &&
      mag351Block.exposure != null &&
      mag351Block.exposure > 0 &&
      mag351Block.exposure === magAmount &&
      mag351Block.contributors.some(
        (item) => item.productName.trim().length > 0 && Number(item.amount) > 0
      )
  );
  const ckdBlock = ckdSafety.find(
    (item) => item.action === "block" && item.code === "condition_review_required"
  );
  const ckdOk = Boolean(ckdBlock && ckdBlock.exposure != null && ckdBlock.exposure > 0);
  const mag200Safe = !officialSafety.some(
    (item) =>
      item.action === "block" &&
      item.code === "dose_review_required" &&
      (item.supplementIds.includes(MAG_ID) || /magnesium/i.test(item.nutrientName ?? ""))
  );

  let safety = 0;
  if (mag351Ok) {
    safety += 4;
  }
  if (ckdOk) {
    safety += 3;
  }
  if (mag200Safe) {
    safety += 3;
  }

  let efficiencyScore = 0;
  if (PLAN_MATCH_RETURN_BUDGET_MS !== 400 && packTimeToReady(506, 400, 3) === 3400) {
    efficiencyScore += 2;
  }
  if (
    packTimeToReady(4000, PLAN_MATCH_RETURN_BUDGET_MS, AGENTIC_POLL_AFTER_SECONDS) ===
      PLAN_MATCH_RETURN_BUDGET_MS + AGENTIC_POLL_AFTER_SECONDS * 1000 &&
    /PLAN_MATCH_RETURN_BUDGET_MS = 3_000/.test(serviceSource)
  ) {
    efficiencyScore += 2;
  }
  if (!agenticUsesWeb400 && (official.selected != null || official.leftovers.length > 0)) {
    efficiencyScore += 2;
  }
  if (!rematchOnAnswers) {
    efficiencyScore += 2;
  }
  if (liveMissIsEmptyRetail && !fixtureInBasket) {
    efficiencyScore += 2;
  }

  const report = {
    catalog,
    cases: [
      caseShape({
        id: "matching.official_5_fewest_pills",
        leftovers: official.leftovers,
        safety: officialSafety,
        selected: official.selected
      }),
      caseShape({
        id: "safety.mag_ul_and_ckd",
        leftovers: mag351.leftovers,
        safety: [...mag351Safety, ...ckdSafety],
        selected: mag351.selected ?? ckdSelected
      }),
      {
        coverage: [],
        id: "efficiency.structural",
        leftovers: [],
        names: [],
        optionId: null,
        safety: [],
        skus: []
      }
    ],
    efficiency: {
      ...efficiency,
      fixtureInBasket
    },
    scores: {
      efficiency: efficiencyScore,
      matching,
      safety
    }
  };

  return sortedJson(report) as DetPackReport;
}

const invokedAsTest = process.argv.some((arg) => arg.endsWith("agentic-det-pack.test.ts"));

if (invokedAsTest) {
  describe("deterministic matcher pack", () => {
    it("runs three properties against the live catalog", async () => {
      const loaded = await loadDetCatalog();
      const report = runDetPack(loaded);
      console.log(JSON.stringify(report.scores));
      assert.equal(typeof report.scores.matching, "number");
      assert.equal(typeof report.scores.safety, "number");
      assert.equal(typeof report.scores.efficiency, "number");
      assert.ok(report.scores.matching >= 0 && report.scores.matching <= 10);
      assert.ok(report.scores.safety >= 0 && report.scores.safety <= 10);
      assert.ok(report.scores.efficiency >= 0 && report.scores.efficiency <= 10);
      assert.equal("availabilityAsOf" in report, false);
      assert.equal("matchMs" in report, false);
    });
  });
}
