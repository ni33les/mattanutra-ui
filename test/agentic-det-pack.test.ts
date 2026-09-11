import { capturedMatcherCatalogue } from './helpers/captured-matcher-catalogue.ts';
import { canonicalHash } from "../lib/agentic/value/canonical.ts";
import { runWithMatcherSafetySnapshot } from "../lib/matcher/safety-ceilings-server.ts";
import { captureMatcherSafetySnapshot } from "../lib/matcher/safety-ceilings.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AGENTIC_POLL_AFTER_SECONDS } from "../lib/agentic/config.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { catalogueSnapshotId } from "../lib/agentic/catalogue/freeze.ts";
import {
  replaceCatalogueSnapshot
} from "../lib/agentic/catalogue/snapshot.ts";
import type { CatalogueSnapshot } from "../lib/agentic/catalogue/types.ts";
import { completedPlanTool as planTool } from "./helpers/completed-mcp-client.ts";
import { matchPlan, evaluateSafety } from "./helpers/recording-mcp-dispatcher.ts";
import { PLAN_MATCH_RETURN_BUDGET_MS } from "../lib/agentic/plan/service.ts";
import { captureMcpTranscript, type RecordedMcpTranscript } from "./helpers/mcp-evidence.ts";
import { normalizePublishedClientResult } from "../scripts/published-client-semantics.mjs";
import { createSnapshotMemoryStore } from "./agentic/value/snapshot-store.ts";
import type {
  CanonicalPlanState,
  CoverageContributor,
  SafetyGuidance,
  StackOption
} from "../lib/agentic/plan/types.ts";
import { COVERED_THRESHOLD } from "../lib/matcher/config.ts";
import {
  catalogBandRuleId,
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
  references?: ReturnType<typeof captureMatcherSafetySnapshot>;
  freezePeer?: DetPackCatalog;
  snapshot: CatalogueSnapshot;
}>;

export type DetPackReport = Readonly<{
  mcpTranscript?: RecordedMcpTranscript;
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
      // The observation clock is not a change to the captured catalogue facts.
      catalogueId: catalogueSnapshotId({ ...catalog.snapshot, availabilityAsOf: "frozen-observation-clock" }),
      ceilings: catalog.ceilings
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
    pinnedCandidateKey: null,
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
    candidateKey: input.selected?.candidateKey ?? null,
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

function magDoseAdvice(guidance: readonly SafetyGuidance[], ruleId: string | null) {
  return guidance.find(
    (item) =>
      item.action === "review" &&
      item.code === "dose_review_required" &&
      item.ruleId === ruleId &&
      item.supplementIds.includes(MAG_ID)
  );
}

function computedMagExposure(selected: StackOption | null, advice: SafetyGuidance | undefined) {
  const magIds = magProductIds(selected);
  const contributions = (advice?.contributors ?? []).filter(
    item => item.source === "current" || (item.productId && magIds.has(item.productId))
  );
  return contributions.reduce((total, item) => total + Number(item.amount), 0);
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
      (item.reason === "dose_gap" || item.reason === "not_in_catalogue" || item.reason === "uncovered")
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

/** Independent reference for this pack's fewest-pills request with no numerical preferences.
 * Keep nutrient loss intact; all convenience terms come from the basket facts.
 */
function independentFewestPenalty(option: StackOption): number {
  if (!option.doseFit || !Number.isFinite(option.doseFit.total)) return NaN;
  let pills = 0, money = 0, servingBurden = 0, uncertain = 0;
  for (const line of option.basket) {
    const a = line.administration;
    const verified = a?.provenance.status === "verified" && Boolean(a.provenance.sourceUrl && a.provenance.sourceText);
    const basis = verified && a.route !== "unknown" && a.physicalUnit !== "unknown" && a.unitsPerServing != null && a.unitsPerServing > 0;
    uncertain += Number(!basis);
    if (basis && a.route === "oral" && ["capsule", "tablet", "softgel", "gummy"].includes(a.physicalUnit))
      pills += a.unitsPerServing! * line.servingsPerDay;
    if (![line.servingsPerDay, line.quantity, line.unitPriceMinor].every(value => Number.isFinite(value) && value >= 0)) return NaN;
    money += line.quantity * line.unitPriceMinor;
    servingBurden += Math.max(0, line.servingsPerDay - 1) ** 2;
  }
  return option.doseFit.total + 0.2 * pills / 3 + 0.1 * new Set(option.basket.map(line => line.productId)).size +
    0.05 * money / 100000 + 0.2 * servingBurden + 0.25 * uncertain;
}

export function fewestPillsWins(input: Readonly<{
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

  // Compare every explored witness under ONE profile, independently of the
  // production scorer. Raw closest-dose ranking was retired by the approved
  // practical policy; a 27-pill basket cannot win just for a smaller dose loss.
  const penalty = independentFewestPenalty(selected);
  return Number.isFinite(penalty) && selected.candidateKey.length > 0 &&
    generated.every(item => penalty <= independentFewestPenalty(item) + 1e-12);
}

export async function pinWithoutRematch(snapshot: CatalogueSnapshot, store = createSnapshotMemoryStore(snapshot)) {
  replaceCatalogueSnapshot(snapshot);
  const config = loadAgenticConfig();
  const scope = {
    environment: "dev" as const,
    principalScope: "det-pack",
    tenantScope: "mattanutra"
  };
  const now = "2026-08-27T00:00:00.000Z";
  const captured = captureMatcherSafetySnapshot();
  const references = { ...captured, identity: snapshot.runtimeRevision == null ? captured.identity : { runtimeRevision: snapshot.runtimeRevision, fingerprint: canonicalHash(captured.ceilings) } };
  const evaluate: typeof planTool = input => runWithMatcherSafetySnapshot(references, () => planTool(input));
  const created = await evaluate({
    config,
    now,
    payload: {
      idempotencyKey: `det-pack-create-${randomUUID()}`,
      request: officialRequest()
    },
    scope,
    store
  });

  if (!("ok" in created) || created.ok !== true || !created.planHandle || !created.candidateKey) {
    return { pinKeptOption: false, pinWithoutRematch: false };
  }

  const question = created.questions?.[0];
  const choice = question?.choices?.[0]?.choice;
  const pinned = await evaluate({
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
            selectCandidateKey: created.candidateKey
          },
    scope,
    store
  });

  if (!("ok" in pinned) || pinned.ok !== true || pinned.status === "processing" || !pinned.candidateKey) {
    return { pinKeptOption: false, pinWithoutRematch: false };
  }

  const rematchMs = (
    pinned as { matcherTelemetry?: { matchMs?: number } }
  ).matcherTelemetry?.matchMs;

  return {
    pinKeptOption: pinned.candidateKey === created.candidateKey,
    pinWithoutRematch: rematchMs == null
  };
}

export async function loadDetCatalog(): Promise<DetPackCatalog> {
  // This arithmetic corpus is captured evidence in both Node tests and the CLI.
  // Switching to a database catalogue changes its nutrient IDs and invalidates
  // the independent expectations instead of testing the same matcher twice.
  const { snapshot, references } = capturedMatcherCatalogue();
  setMatcherSafetyCeilings(references.ceilings, { runtimeRevision: references.runtimeRevision, fingerprint: references.fingerprint });
  return { snapshot, ceilings: references.ceilings, references: captureMatcherSafetySnapshot(snapshot.runtimeRevision) };
}

export function canonicalDetReport(report: DetPackReport) {
  return JSON.stringify({ ...report,
    ...(report.mcpTranscript ? { mcpTranscript: normalizePublishedClientResult(report.mcpTranscript, "https://fixture.example/api/mcp") } : {})
  });
}

export async function runDetPack(input: DetPackCatalog): Promise<DetPackReport> {
  const work = () => captureMcpTranscript(() => runDetPackRecorded(input));
  const { result, transcript } = await (input.references ? runWithMatcherSafetySnapshot(input.references, work) : work());
  return { ...result, mcpTranscript: transcript };
}

async function runDetPackRecorded(input: DetPackCatalog): Promise<DetPackReport> {
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
  const magReference = safetyCeilingFor(input.ceilings, {
    name: "Magnesium", profile: { ageYears: 52, lifeStage: "adult" }, subjectId: MAG_ID
  });
  const retainedMag = official.selected?.basket.find(item => item.contributionSupplementIds.includes(MAG_ID));
  // Force a verified retail contributor plus known continued intake over the
  // catalogue limit. A target above a limit alone is not evidence of exposure.
  const mag351State = planState({
    currentSupplements: [{ name: "Magnesium", supplementId: MAG_ID, dailyAmount: 351, unit: "mg" }],
    requirements: { retainProductIds: retainedMag ? [retainedMag.productId] : [], maxProductCount: 1 },
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
        (item.reason === "dose_gap" || item.reason === "not_in_catalogue" || item.reason === "uncovered")
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

  const magBandId = catalogBandRuleId(magReference);
  const mag351Advice = magDoseAdvice(mag351Safety, magBandId);
  const magIds = magProductIds(mag351.selected);
  const magContribs = (mag351Advice?.contributors ?? []).filter(
    item => item.productId && magIds.has(item.productId) && Number(item.amount) > 0
  );
  const computedExposure = computedMagExposure(mag351.selected, mag351Advice);
  const mag351Ok = Boolean(
    mag351Advice && mag351Advice.action === "review" &&
      mag351Advice.severity === "high" && magBandId &&
      mag351Advice.ruleId === magBandId && mag351Advice.threshold === magReference?.maxAmount &&
      mag351Advice.exposure != null && mag351Advice.exposure > Number(mag351Advice.threshold) &&
      mag351Advice.exposure === computedExposure && magContribs.length > 0 &&
      mag351Advice.contributors.some(item => item.source === "current" && item.amount === 351) &&
      mag351Safety.every(item => item.action !== "block" && item.action !== "acknowledge")
  );
  const ckdAdvice = ckdSafety.find(item =>
    item.action === "review" && item.code === "condition_review_required" && item.supplementIds.includes(MAG_ID));
  const ckdOk = Boolean(
    ckdMatch.selected && ckdAdvice && ckdAdvice.threshold == null && ckdAdvice.severity === "high" &&
    ckdAdvice.exposure != null && ckdAdvice.exposure > 0 &&
    ckdSafety.every(item => item.action !== "block" && item.action !== "acknowledge")
  );
  const mag200Safe = officialSafety.every(item => item.action !== "block" && item.action !== "acknowledge") &&
    officialSafety.filter(item => item.ruleId === magBandId && item.code === "dose_review_required")
      .every(item => item.exposure != null && item.threshold != null && item.exposure >= item.threshold);

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
        candidateKey: null,
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
    it("runs three properties against the captured retail catalogue", async () => {
      const loaded = await loadDetCatalog();
      const peer = await loadDetCatalog();
      const report = await runDetPack({ ...loaded, freezePeer: peer });
      console.log(JSON.stringify(report.scores));
      assert.equal(typeof report.scores.matching, "number");
      assert.equal(typeof report.scores.safety, "number");
      assert.equal(typeof report.scores.efficiency, "number");
      assert.equal(report.scores.matching, 10);
      assert.equal(report.scores.safety, 10);
      assert.ok(report.scores.efficiency >= 0 && report.scores.efficiency <= 10);
      assert.equal("availabilityAsOf" in report, false);
      assert.equal("matchMs" in report, false);
    });
  });
}
