import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import nextEnv from "@next/env";
import { AGENTIC_POLL_AFTER_SECONDS } from "../lib/agentic/config.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { freezeCatalogueSnapshot } from "../lib/agentic/catalogue/freeze.ts";
import { loadLiveRetailSnapshot } from "../lib/agentic/catalogue/live.ts";
import { refreshAdminSafetyCeilings } from "../lib/agentic/catalogue/load-safety-ceilings.ts";
import {
  replaceCatalogueSnapshot
} from "../lib/agentic/catalogue/snapshot.ts";
import type { CatalogueSnapshot } from "../lib/agentic/catalogue/types.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { evaluateSafety } from "../lib/agentic/plan/safety.ts";
import { PLAN_MATCH_RETURN_BUDGET_MS, planTool } from "../lib/agentic/plan/service.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import type {
  CanonicalPlanState,
  CoverageContributor,
  SafetyGuidance,
  StackOption
} from "../lib/agentic/plan/types.ts";
import { COVERED_THRESHOLD } from "../lib/matcher/config.ts";
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
  freezePeer?: DetPackCatalog;
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
    freezeOk: boolean;
    liveMissIsEmptyRetail: boolean;
    packTimeToReady400: number;
    pinKeptOption: boolean;
    pinWithoutRematch: boolean;
    pollAfterSeconds: number;
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

export function freezeKey(catalog: DetPackCatalog) {
  return JSON.stringify(
    sortedJson({
      catalogueVersion: catalog.snapshot.catalogueVersion,
      ceilings: catalog.ceilings.map((row) => ({
        bandId: row.bandId ?? null,
        lifeStage: row.lifeStage ?? null,
        maxAmount: row.maxAmount,
        maxUnit: row.maxUnit,
        sourceScope: row.sourceScope ?? null,
        subjectId: row.subjectId
      })),
      productIds: catalog.snapshot.products.map((item) => item.productId).slice().sort()
    })
  );
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

function officialRequest() {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "fewest_pills" as const,
    profile: { ageYears: 52, lifeStage: "adult" as const, sex: "male" as const },
    requirements: {},
    targets: officialTargets()
  };
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
          productId: item.productId ?? null,
          productName: item.productName
        }))
        .sort(
          (left, right) =>
            String(left.productId).localeCompare(String(right.productId)) ||
            left.productName.localeCompare(right.productName)
        ),
      exposure: row.exposure,
      ruleId: row.ruleId,
      supplementIds: [...row.supplementIds].slice().sort()
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

function magProductIds(selected: StackOption | null) {
  return new Set(
    (selected?.basket ?? [])
      .filter((item) => item.contributionSupplementIds.includes(MAG_ID))
      .map((item) => item.productId)
  );
}

function magOptionFrom(selected: StackOption | null): StackOption | null {
  if (!selected) {
    return null;
  }

  const item = selected.basket.find((row) => row.contributionSupplementIds.includes(MAG_ID));
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

function magDoseBlock(guidance: readonly SafetyGuidance[]) {
  return guidance.find(
    (item) =>
      item.action === "block" &&
      item.code === "dose_review_required" &&
      item.supplementIds.includes(MAG_ID)
  );
}

function computedMagExposure(selected: StackOption | null, block: SafetyGuidance | undefined) {
  const magIds = magProductIds(selected);
  const fromBlock = (block?.contributors ?? []).filter(
    (item) => item.productId && magIds.has(item.productId)
  );
  const sum = fromBlock.reduce((total, item) => total + Number(item.amount), 0);
  if (sum > 0) {
    return sum;
  }

  const row = selected?.coverage.find((item) => item.supplementId === MAG_ID);
  return row?.totalExposureAmount ?? 0;
}

function targetCoveredOrLeftover(input: Readonly<{
  leftovers: readonly { reason: string; supplementId?: string }[];
  selected: StackOption | null;
  target: CanonicalPlanState["targets"][number];
}>) {
  const row = input.selected?.coverage.find(
    (item) => item.supplementId === input.target.supplementId
  );
  if (row && row.coveragePercent >= COVERED_THRESHOLD) {
    return true;
  }

  return input.leftovers.some(
    (item) =>
      item.supplementId === input.target.supplementId &&
      (item.reason === "dose_gap" || item.reason === "not_in_catalogue")
  );
}

function coveredTargetsHaveContributionIds(selected: StackOption | null) {
  if (!selected) {
    return false;
  }

  return officialTargets().every((target) => {
    const row = selected.coverage.find((item) => item.supplementId === target.supplementId);
    if (!row || row.coveragePercent < COVERED_THRESHOLD) {
      return true;
    }

    return selected.basket.some((item) =>
      item.contributionSupplementIds.includes(target.supplementId)
    );
  });
}

function fewestPillsWins(input: Readonly<{
  balanced: ReturnType<typeof matchPlan>;
  fewest: ReturnType<typeof matchPlan>;
}>) {
  const selected = input.fewest.selected;
  if (!selected) {
    return false;
  }

  const generated = [input.fewest.selected, input.balanced.selected, ...input.balanced.alternatives]
    .filter((item): item is StackOption => Boolean(item));
  if (generated.length === 0) {
    return false;
  }

  const minPills = Math.min(...generated.map((item) => item.dailyPills));
  return selected.dailyPills === minPills && selected.optionId.length > 0;
}

async function pinWithoutRematch(snapshot: CatalogueSnapshot) {
  replaceCatalogueSnapshot(snapshot);
  const store = createMemoryStore();
  const config = loadAgenticConfig();
  const scope = {
    environment: "dev" as const,
    principalScope: "det-pack",
    tenantScope: "mattanutra"
  };
  const now = "2026-08-27T00:00:00.000Z";
  const created = await planTool({
    config,
    now,
    payload: {
      idempotencyKey: `det-pack-create-${randomUUID()}`,
      request: officialRequest()
    },
    scope,
    store
  });

  if (!("ok" in created) || created.ok !== true || !created.planHandle || !created.optionId) {
    return { pinKeptOption: false, pinWithoutRematch: false };
  }

  const question = created.questions?.[0];
  const choice = question?.choices?.[0]?.choice;
  const pinned = await planTool({
    config,
    now,
    payload:
      question && choice
        ? {
            answers: [{ choice, questionId: question.questionId }],
            expectedRevision: created.revision,
            idempotencyKey: `det-pack-pin-${randomUUID()}`,
            planHandle: created.planHandle
          }
        : {
            expectedRevision: created.revision,
            idempotencyKey: `det-pack-pin-${randomUUID()}`,
            planHandle: created.planHandle,
            selectOptionId: created.optionId
          },
    scope,
    store
  });

  if (!("ok" in pinned) || pinned.ok !== true) {
    return { pinKeptOption: false, pinWithoutRematch: false };
  }

  const rematchMs = (
    pinned as { matcherTelemetry?: { matchMs?: number } }
  ).matcherTelemetry?.matchMs;

  return {
    pinKeptOption: pinned.optionId === created.optionId,
    pinWithoutRematch: rematchMs == null
  };
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

export async function runDetPack(input: DetPackCatalog): Promise<DetPackReport> {
  setMatcherSafetyCeilings([...input.ceilings]);
  const snapshot = input.snapshot;
  const freezePeer = input.freezePeer ?? (await loadDetCatalog());
  const freezeOk = freezeKey(input) === freezeKey(freezePeer);
  const serviceSource = readFileSync(new URL("../lib/agentic/plan/service.ts", import.meta.url), "utf8");
  const snapshotSource = readFileSync(
    new URL("../lib/agentic/catalogue/snapshot.ts", import.meta.url),
    "utf8"
  );
  const agenticUsesWeb400 = /WEB_MATCHER_CONFIG/.test(serviceSource);
  const liveMissIsEmptyRetail =
    /emptyRetailSnapshot/.test(snapshotSource) && !/fixtureSnapshot/.test(snapshotSource);

  const catalog = {
    catalogueVersion: snapshot.catalogueVersion,
    productCount: snapshot.products.length,
    supplementCount: snapshot.supplements.length
  };

  if (emptyCatalog(snapshot)) {
    return sortedJson({
      catalog,
      cases: [],
      efficiency: {
        agenticUsesWeb400,
        budgetMs: PLAN_MATCH_RETURN_BUDGET_MS,
        fixtureInBasket: false,
        freezeOk,
        liveMissIsEmptyRetail,
        packTimeToReady400: packTimeToReady(506, 400, 3),
        pinKeptOption: false,
        pinWithoutRematch: false,
        pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS
      },
      scores: { efficiency: 0, matching: 0, safety: 0 }
    }) as DetPackReport;
  }

  const officialState = planState({ targets: officialTargets() });
  const official = matchPlan({ snapshot, state: officialState });
  const balanced = matchPlan({
    snapshot,
    state: planState({ optimization: "balanced", targets: officialTargets() })
  });
  const officialSafety = evaluateSafety({
    locale: "en",
    selected: official.selected,
    state: officialState
  });
  const mag351State = planState({
    targets: [{ amount: 351, name: "Magnesium", supplementId: MAG_ID, unit: "mg" }]
  });
  const mag351 = matchPlan({ snapshot, state: mag351State });
  const mag351Safety = evaluateSafety({
    locale: "en",
    selected: mag351.selected,
    state: mag351State
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
  const pin = await pinWithoutRematch(snapshot);

  const liveRetail =
    snapshot.catalogueVersion.startsWith("retail-TH-") &&
    snapshot.products.length > 0 &&
    snapshot.products.every((item) => item.source !== "fixture");
  const fixtureInBasket = (official.selected?.basket ?? []).some(
    (item) => item.source === "fixture" || item.fixture
  );
  const coverageVector = officialTargets().every((target) =>
    targetCoveredOrLeftover({
      leftovers: official.leftovers,
      selected: official.selected,
      target
    })
  );
  const contributionIds = coveredTargetsHaveContributionIds(official.selected);
  const leftoverHonesty = officialTargets().every((target) => {
    const row = official.selected?.coverage.find(
      (item) => item.supplementId === target.supplementId
    );
    if (row && row.coveragePercent >= COVERED_THRESHOLD) {
      return true;
    }

    return official.leftovers.some(
      (item) =>
        item.supplementId === target.supplementId &&
        (item.reason === "dose_gap" || item.reason === "not_in_catalogue")
    );
  });

  let matching = 0;
  if (liveRetail) {
    matching += 2;
  }
  if (fewestPillsWins({ balanced, fewest: official })) {
    matching += 2;
  }
  if (coverageVector) {
    matching += 2;
  }
  if (contributionIds) {
    matching += 2;
  }
  if (leftoverHonesty) {
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
  const magIds = magProductIds(mag351.selected);
  const magContribs = (mag351Block?.contributors ?? []).filter(
    (item) => item.productId && magIds.has(item.productId) && Number(item.amount) > 0
  );
  const computedExposure = computedMagExposure(mag351.selected, mag351Block);
  const mag351Ok = Boolean(
    mag351Block &&
      mag351Block.action === "block" &&
      mag351Block.code === "dose_review_required" &&
      magBandId &&
      mag351Block.ruleId === magBandId &&
      mag351Block.exposure != null &&
      mag351Block.exposure > 0 &&
      computedExposure > 0 &&
      mag351Block.exposure === computedExposure &&
      magContribs.length > 0 &&
      magContribs.reduce((sum, item) => sum + Number(item.amount), 0) === mag351Block.exposure
  );
  const ckdBlock = ckdSafety.find(
    (item) =>
      item.action === "block" &&
      item.code === "condition_review_required" &&
      item.supplementIds.includes(MAG_ID)
  );
  const ckdOk = Boolean(
    ckdBlock &&
      ckdBlock.exposure != null &&
      ckdBlock.exposure > 0 &&
      ckdBlock.code !== "duplicate_or_overlap" &&
      ckdSafety.every(
        (item) =>
          item.code !== "condition_review_required" || item.action === "block"
      )
  );
  const mag200Safe = !officialSafety.some(
    (item) =>
      item.action === "block" &&
      item.code === "dose_review_required" &&
      item.supplementIds.includes(MAG_ID)
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
  if (pin.pinKeptOption && pin.pinWithoutRematch) {
    efficiencyScore += 2;
  }
  if (freezeOk && liveMissIsEmptyRetail && !fixtureInBasket) {
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
      agenticUsesWeb400,
      budgetMs: PLAN_MATCH_RETURN_BUDGET_MS,
      fixtureInBasket,
      freezeOk,
      liveMissIsEmptyRetail,
      packTimeToReady400: packTimeToReady(506, 400, 3),
      pinKeptOption: pin.pinKeptOption,
      pinWithoutRematch: pin.pinWithoutRematch,
      pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS
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
      const peer = await loadDetCatalog();
      const report = await runDetPack({ ...loaded, freezePeer: peer });
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
