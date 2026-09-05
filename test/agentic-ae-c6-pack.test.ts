import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginDeterministicIdsForTests,
  endDeterministicIdsForTests
} from "../lib/agentic/capabilities.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { DEFAULT_SHIPPING_MINOR } from "../lib/agentic/money.ts";
import { createCountingMatchPort } from "../lib/agentic/plan/match-port.ts";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  PlanLeftover,
  StackOption
} from "../lib/agentic/plan/types.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type IsolatedInfoCatalog
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import {
  matcherSafetyCeilings,
  resetMatcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";

const FIXED_NOW = "2026-08-28T00:00:00.000Z";
const CASE_IDS = [
  "AX6-01",
  "AX6-02",
  "AX6-03",
  "AX6-04",
  "AX6-05",
  "AX6-06"
] as const;

const SUP_C = "sup_ae_vitamin_c";
const SUP_D3 = "sup_ae_vitamin_d3";
const SUP_MAG = "sup_ae_magnesium";
const SUP_OMEGA = "sup_ae_omega3";
const SUP_B12 = "sup_ae_vitamin_b12";
const PRD_C = "prd_ae_c500";
const PRD_MAG = "prd_ae_natmag";
const PRD_D3 = "prd_ae_d3";
const PRD_OMEGA = "prd_ae_omega";
const PRD_B12 = "prd_ae_b12_100";
const OPT_SINGLE = "opt_ae_single";
const OPT_A = "opt_ae_a";
const OPT_B = "opt_ae_b";
const OPT_C = "opt_ae_c";
const OPT_MAG = "opt_ae_mag";
const OPT_OMEGA = "opt_ae_omega";
const OPT_B12 = "opt_ae_b12";
const MAG_BAND_ID = "band_ae_magnesium_ul";

const D3_GAP: PlanLeftover = {
  amount: 800,
  name: "Vitamin D3",
  reason: "dose_gap",
  severity: "low",
  supplementId: SUP_D3,
  unit: "IU"
};
const D3_WEAKER: PlanLeftover = {
  name: "Vitamin D3",
  note: "cheaper SKU covers less",
  reason: "weaker_sku",
  severity: "low",
  supplementId: SUP_D3,
  unit: "IU"
};
const B12_GAP: PlanLeftover = {
  amount: 250,
  name: "Vitamin B12",
  reason: "dose_gap",
  severity: "medium",
  supplementId: SUP_B12,
  unit: "mcg"
};
const B12_WEAKER: PlanLeftover = {
  name: "Vitamin B12",
  note: "weaker SKU",
  reason: "weaker_sku",
  severity: "low",
  supplementId: SUP_B12,
  unit: "mcg"
};

const ISOLATED_INFO: IsolatedInfoCatalog = {
  conditionCodes: ["ckd", "chronic_kidney_disease"],
  medicationCodes: ["apixaban", "eliquis"],
  supportedCountries: [
    { countryCode: "TH", countryName: "Thailand", currency: "THB" }
  ]
};

const BANNED_DIAGNOSTIC_KEYS = new Set([
  "ackMs",
  "availabilityAsOf",
  "catalogId",
  "catalogueMs",
  "factLedger",
  "factLedgerHash",
  "lossCertificates",
  "matchMs",
  "matcherTelemetry",
  "rejected",
  "searchDeadlineMs",
  "searchMs",
  "serializeMs",
  "targetClassifications",
  "targetFrontiers",
  "targetSetHash"
]);

const PROCESSING_KEYS = new Set([
  "locale",
  "nextActions",
  "ok",
  "planHandle",
  "pollAfterSeconds",
  "revision",
  "status",
  "summary",
  "summaryKey"
]);

const COMPLETED_KEYS = new Set([
  "acknowledgementStatus",
  "acknowledgedUnassessedConditionCodes",
  "acknowledgedUnassessedMedicationCodes",
  "assessedConditionCodes",
  "assessedMedicationCodes",
  "basket",
  "conditionCodes",
  "coverage",
  "estimatedOrderTotalMinor",
  "guidanceIds",
  "leftovers",
  "locale",
  "medicationCodes",
  "nextActions",
  "ok",
  "optionId",
  "options",
  "planHandle",
  "questions",
  "reason",
  "reasonCode",
  "reasonKey",
  "revision",
  "safetyGuidance",
  "safetyScope",
  "shippingMinor",
  "stackSummary",
  "status",
  "summary",
  "summaryKey",
  "tradeOffs",
  "unassessedConditionCodes",
  "unassessedMedicationCodes"
]);

const DOSE_GAP_KEYS = new Set([
  "deliveredAmount",
  "name",
  "reason",
  "remainingGap",
  "requestedAmount",
  "supplementId",
  "unit"
]);

const REQUIRED_READY_KEYS = [
  "ok",
  "status",
  "summary",
  "summaryKey",
  "locale",
  "planHandle",
  "revision",
  "nextActions",
  "basket",
  "coverage",
  "stackSummary",
  "shippingMinor",
  "estimatedOrderTotalMinor",
  "optionId",
  "options"
] as const;

const BANNED_TH_TRADEOFF =
  /selected option|\bsatang\b|\bcoverage\b|\bpills\b|\bproducts\b/i;

export type AeC6CaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AeC6PackReport = Readonly<{
  cases: readonly AeC6CaseResult[];
  packVersion: "agentic-experience-6.0";
  passedCases: number;
  totalCases: 6;
}>;

function sortedKeys(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]])
  );
}

function pass(id: string, evidence: Record<string, unknown>): AeC6CaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: string, evidence: Record<string, unknown>): AeC6CaseResult {
  return { evidence: sortedKeys(evidence), id, result: "FAIL" };
}

function jsonSize(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function structured(response: unknown): Record<string, unknown> {
  const root = asRecord(response);
  return asRecord(asRecord(root.result).structuredContent);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function keyHits(
  value: unknown,
  banned: ReadonlySet<string>,
  path = ""
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      keyHits(item, banned, `${path}[${index}]`)
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const next = path ? `${path}.${key}` : key;
    return banned.has(key) ? [next] : keyHits(child, banned, next);
  });
}

function extraCompletedKeys(value: Record<string, unknown>) {
  return Object.keys(value)
    .filter((key) => !COMPLETED_KEYS.has(key))
    .sort();
}

function extraProcessingKeys(value: Record<string, unknown>) {
  return Object.keys(value)
    .filter((key) => !PROCESSING_KEYS.has(key))
    .sort();
}

function leftoversOf(value: Record<string, unknown>) {
  return Array.isArray(value.leftovers) ? value.leftovers.map(asRecord) : [];
}

function leftoverExtraKeys(plan: Record<string, unknown>) {
  return leftoversOf(plan).flatMap((item) =>
    Object.keys(item)
      .filter((key) => !DOSE_GAP_KEYS.has(key))
      .sort()
  );
}

function basketItem(
  input: Readonly<{
    dailyPills: number;
    lineTotalMinor: number;
    productId: string;
    productName: string;
    requestedNames?: readonly string[];
    supplementIds: readonly string[];
  }>
): BasketItem {
  const requestedNames = [...(input.requestedNames ?? ["Vitamin C"])];
  return {
    availabilityAsOf: FIXED_NOW,
    contributionSupplementIds: [...input.supplementIds],
    currency: "THB",
    dailyPills: input.dailyPills,
    daysOfSupply: 30,
    deliveryWindow: null,
    fixture: false,
    form: "capsule",
    imageUrl: null,
    incidentalNutrientNames: [],
    incidentalNutrients: [],
    incompleteCommercialFacts: false,
    lineTotalMinor: input.lineTotalMinor,
    pillsPerServing: input.dailyPills,
    productId: input.productId,
    productName: input.productName,
    quantity: 1,
    requestedNutrientNames: requestedNames,
    retailerSku: `sku_${input.productId}`,
    selectionReason: {
      code: "covers_target",
      message: "This product covers a requested nutrient.",
      messageKey: "plan.selection.covers_target",
      requestedNames,
      requestedSupplementIds: [...input.supplementIds]
    },
    sellerId: "seller_ae",
    sellerName: "AE Seller",
    servingsPerDay: 1,
    source: "retail",
    stockStatus: "in_stock",
    unitPriceMinor: input.lineTotalMinor
  };
}

function coverage(input: CoverageRow): CoverageRow {
  return input;
}

function stackOption(
  optionId: string,
  basket: readonly BasketItem[],
  rows: readonly CoverageRow[],
  coveragePercent: number
): StackOption {
  return {
    basket: [...basket],
    coverage: [...rows],
    coveragePercent,
    dailyPills: basket.reduce((sum, item) => sum + item.dailyPills, 0),
    matcherVersion: "ae-port",
    optionId,
    reason: "fewest_pills",
    snapshotId: "snap_ae",
    totalPriceMinor: basket.reduce((sum, item) => sum + item.lineTotalMinor, 0)
  };
}

function fillerItems(
  count: number,
  pills: readonly number[],
  totalMinor: number,
  prefix: string
): BasketItem[] {
  const items: BasketItem[] = [];
  let remaining = totalMinor;
  for (let index = 0; index < count; index += 1) {
    const last = index === count - 1;
    const lineTotalMinor = last ? remaining : Math.floor(totalMinor / count);
    remaining -= lineTotalMinor;
    items.push(
      basketItem({
        dailyPills: pills[index] ?? 1,
        lineTotalMinor,
        productId: `${prefix}_${index + 1}`,
        productName: `Stack part ${index + 1}`,
        requestedNames: ["Vitamin C"],
        supplementIds: [SUP_C]
      })
    );
  }
  return items;
}

function cCoverage(amount: number, productId: string, productName: string): CoverageRow {
  return coverage({
    contributors: [
      { amount, productId, productName, source: "selected", unit: "mg" }
    ],
    coveragePercent: Math.round((amount / 500) * 100),
    currentAmount: 0,
    deliveredAmount: amount,
    name: "Vitamin C",
    percentOfUpperLimit: null,
    remainingGap: Math.max(0, 500 - amount),
    requestedAmount: 500,
    status: amount >= 500 ? "covered" : "partial",
    supplementId: SUP_C,
    totalExposureAmount: amount,
    unit: "mg",
    upperLimitAmount: null
  });
}

function singleOption() {
  return stackOption(
    OPT_SINGLE,
    [
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 15900,
        productId: PRD_C,
        productName: "Vitamin C 500",
        requestedNames: ["Vitamin C"],
        supplementIds: [SUP_C]
      })
    ],
    [cCoverage(500, PRD_C, "Vitamin C 500")],
    100
  );
}

function optionB() {
  const mag = basketItem({
    dailyPills: 2,
    lineTotalMinor: 120000,
    productId: PRD_MAG,
    productName: "Nat Mag",
    requestedNames: ["Magnesium"],
    supplementIds: [SUP_MAG]
  });
  const d3 = basketItem({
    dailyPills: 3,
    lineTotalMinor: 100000,
    productId: PRD_D3,
    productName: "Vitamin D3 1200",
    requestedNames: ["Vitamin D3"],
    supplementIds: [SUP_D3]
  });
  const c = basketItem({
    dailyPills: 2,
    lineTotalMinor: 72100,
    productId: PRD_C,
    productName: "Vitamin C 500",
    requestedNames: ["Vitamin C"],
    supplementIds: [SUP_C]
  });
  return stackOption(
    OPT_B,
    [mag, d3, c],
    [
      coverage({
        contributors: [
          {
            amount: 350,
            productId: PRD_MAG,
            productName: "Nat Mag",
            source: "selected",
            unit: "mg"
          }
        ],
        coveragePercent: 100,
        currentAmount: 0,
        deliveredAmount: 350,
        name: "Magnesium",
        percentOfUpperLimit: 100,
        remainingGap: 0,
        requestedAmount: 300,
        status: "covered",
        supplementId: SUP_MAG,
        totalExposureAmount: 350,
        unit: "mg",
        upperLimitAmount: 350
      }),
      coverage({
        contributors: [
          {
            amount: 1200,
            productId: PRD_D3,
            productName: "Vitamin D3 1200",
            source: "selected",
            unit: "IU"
          }
        ],
        coveragePercent: 60,
        currentAmount: 0,
        deliveredAmount: 1200,
        name: "Vitamin D3",
        percentOfUpperLimit: 30,
        remainingGap: 800,
        requestedAmount: 2000,
        status: "partial",
        supplementId: SUP_D3,
        totalExposureAmount: 1200,
        unit: "IU",
        upperLimitAmount: 4000
      }),
      cCoverage(500, PRD_C, "Vitamin C 500")
    ],
    90
  );
}

function threeOptions() {
  const selected = stackOption(
    OPT_A,
    fillerItems(4, [3, 3, 2, 2], 467300, "prd_ae_a"),
    [cCoverage(500, "prd_ae_a_1", "Stack A")],
    98
  );
  const other = stackOption(
    OPT_C,
    fillerItems(5, [2, 2, 2, 1, 1], 333000, "prd_ae_c"),
    [cCoverage(500, "prd_ae_c_1", "Stack C")],
    90
  );
  return { alternatives: [optionB(), other], selected };
}

function omegaOption() {
  return stackOption(
    OPT_OMEGA,
    [
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 22000,
        productId: PRD_OMEGA,
        productName: "Omega-3 1104",
        requestedNames: ["Omega-3"],
        supplementIds: [SUP_OMEGA]
      })
    ],
    [
      coverage({
        contributors: [
          {
            amount: 1104,
            productId: PRD_OMEGA,
            productName: "Omega-3 1104",
            source: "selected",
            unit: "mg"
          }
        ],
        coveragePercent: 100,
        currentAmount: 0,
        deliveredAmount: 1104,
        name: "Omega-3",
        percentOfUpperLimit: null,
        remainingGap: 0,
        requestedAmount: 1000,
        status: "over_target",
        supplementId: SUP_OMEGA,
        totalExposureAmount: 1104,
        unit: "mg",
        upperLimitAmount: null
      })
    ],
    100
  );
}

function magOption(amount: number, requested: number) {
  return stackOption(
    OPT_MAG,
    [
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 18900,
        productId: PRD_MAG,
        productName: "Nat Mag",
        requestedNames: ["Magnesium"],
        supplementIds: [SUP_MAG]
      })
    ],
    [
      coverage({
        contributors: [
          {
            amount,
            productId: PRD_MAG,
            productName: "Nat Mag",
            source: "selected",
            unit: "mg"
          }
        ],
        coveragePercent: Math.round((amount / requested) * 100),
        currentAmount: 0,
        deliveredAmount: amount,
        name: "Magnesium",
        percentOfUpperLimit: 100,
        remainingGap: Math.max(0, requested - amount),
        requestedAmount: requested,
        status: "upper_limit_risk",
        supplementId: SUP_MAG,
        totalExposureAmount: amount,
        unit: "mg",
        upperLimitAmount: 350
      })
    ],
    100
  );
}

function b12Option() {
  return stackOption(
    OPT_B12,
    [
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 12900,
        productId: PRD_B12,
        productName: "Vitamin B12 100",
        requestedNames: ["Vitamin B12"],
        supplementIds: [SUP_B12]
      })
    ],
    [
      coverage({
        contributors: [
          {
            amount: 100,
            productId: PRD_B12,
            productName: "Vitamin B12 100",
            source: "selected",
            unit: "mcg"
          }
        ],
        coveragePercent: 40,
        currentAmount: 0,
        deliveredAmount: 100,
        name: "Vitamin B12",
        percentOfUpperLimit: null,
        remainingGap: 150,
        requestedAmount: 250,
        status: "partial",
        supplementId: SUP_B12,
        totalExposureAmount: 100,
        unit: "mcg",
        upperLimitAmount: null
      })
    ],
    40
  );
}

function matchFor(state: CanonicalPlanState) {
  const names = state.targets.map((item) => item.name.toLowerCase());
  const hasApixaban = state.medicationCodes.includes("apixaban");
  const hasOmega = names.some((name) => name.includes("omega"));
  const hasMag = names.some((name) => name.includes("magnesium"));
  const hasCkd = state.conditionCodes.includes("ckd");
  const hasB12 = names.some((name) => name.includes("b12") || name.includes("b 12"));
  const fourTarget = state.targets.length >= 4;

  if (hasApixaban && hasOmega) {
    return { alternatives: [], leftovers: [], selected: omegaOption() };
  }

  if (hasCkd || (hasMag && state.targets.length === 1)) {
    const requested = state.targets[0]?.amount ?? 351;
    return {
      alternatives: [],
      leftovers: [],
      selected: magOption(requested > 350 ? 350 : requested, requested)
    };
  }

  if (hasB12) {
    return {
      alternatives: [],
      leftovers: [B12_GAP, B12_WEAKER],
      selected: b12Option()
    };
  }

  if (fourTarget) {
    const packed = threeOptions();
    return {
      alternatives: packed.alternatives,
      leftovers: [D3_GAP, D3_WEAKER],
      selected: packed.selected
    };
  }

  return { alternatives: [], leftovers: [], selected: singleOption() };
}

function profile() {
  return { ageYears: 52, lifeStage: "adult" as const, sex: "male" as const };
}

function singleRequest(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "balanced" as const,
    profile: profile(),
    requirements: {},
    targets: [{ amount: 500, name: "Vitamin C", supplementId: SUP_C, unit: "mg" }],
    ...overrides
  };
}

function fourRequest(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "balanced" as const,
    profile: profile(),
    requirements: {},
    targets: [
      { amount: 500, name: "Vitamin C", supplementId: SUP_C, unit: "mg" },
      { amount: 2000, name: "Vitamin D3", supplementId: SUP_D3, unit: "IU" },
      { amount: 300, name: "Magnesium", supplementId: SUP_MAG, unit: "mg" },
      { amount: 1000, name: "Omega-3", supplementId: SUP_OMEGA, unit: "mg" }
    ],
    ...overrides
  };
}

function b12Request() {
  return singleRequest({
    targets: [
      { amount: 250, name: "Vitamin B12", supplementId: SUP_B12, unit: "mcg" }
    ]
  });
}

function installMagBand() {
  setMatcherSafetyCeilings([
    {
      bandId: MAG_BAND_ID,
      bandVersion: 1,
      lifeStage: "adult",
      maxAmount: 350,
      maxUnit: "mg",
      name: "Magnesium",
      sourceScope: "supplemental",
      subjectId: SUP_MAG
    }
  ]);
}

type Harness = Readonly<{
  call: (name: string, args: unknown) => Promise<Record<string, unknown>>;
  port: ReturnType<typeof createCountingMatchPort>;
}>;

function createHarness(input?: Readonly<{ deferProcessing?: boolean }>): Harness {
  const port = createCountingMatchPort(matchFor);
  const runtime = createAgenticRuntime({
    config: loadAgenticConfig(),
    deferProcessing: input?.deferProcessing,
    isolatedInfo: ISOLATED_INFO,
    matchPort: port,
    now: FIXED_NOW,
    store: createMemoryStore()
  });

  return {
    port,
    async call(name, args) {
      const response = await handleJsonRpc(runtime, {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: args, name }
      });
      return structured(response);
    }
  };
}

function nextActionsOf(value: Record<string, unknown>) {
  return stringList(value.nextActions);
}

function questionsOf(value: Record<string, unknown>) {
  return Array.isArray(value.questions) ? value.questions.map(asRecord) : [];
}

function basketOf(value: Record<string, unknown>) {
  return Array.isArray(value.basket) ? value.basket.map(asRecord) : [];
}

function guidanceOf(value: Record<string, unknown>) {
  return Array.isArray(value.safetyGuidance) ? value.safetyGuidance.map(asRecord) : [];
}

function optionsOf(value: Record<string, unknown>) {
  return Array.isArray(value.options) ? value.options.map(asRecord) : [];
}

function coverageOf(value: Record<string, unknown>) {
  return Array.isArray(value.coverage) ? value.coverage.map(asRecord) : [];
}

function planClean(plan: Record<string, unknown>, maxBytes: number) {
  const processing = plan.status === "processing";
  const extra = processing ? extraProcessingKeys(plan) : extraCompletedKeys(plan);
  const diagnostics = keyHits(plan, BANNED_DIAGNOSTIC_KEYS);
  const leftoverExtra = leftoverExtraKeys(plan);
  const leftoverReasons = leftoversOf(plan).map((item) => String(item.reason ?? ""));
  const leftoverInternal = leftoverReasons.filter(
    (reason) =>
      reason === "weaker_sku" || reason === "dominance" || reason === "rejected"
  );
  const fixtureHits = keyHits(plan, new Set(["fixture"]));
  return {
    diagnostics,
    extra,
    fixtureHits,
    leftoverExtra,
    leftoverInternal,
    oversized: jsonSize(plan) > maxBytes,
    ok:
      extra.length === 0 &&
      diagnostics.length === 0 &&
      leftoverExtra.length === 0 &&
      leftoverInternal.length === 0 &&
      fixtureHits.length === 0 &&
      jsonSize(plan) <= maxBytes
  };
}

function compactErrorOk(result: Record<string, unknown>, requiredPaths: readonly string[]) {
  const error = asRecord(result.error);
  const issues = Array.isArray(error.issues) ? error.issues.map(asRecord) : [];
  const paths = issues.map((item) => String(item.fieldPath ?? ""));
  const blob = JSON.stringify(result);
  return (
    result.ok === false &&
    (error.error_code === "invalid_request" || error.reasonCode === "invalid_request") &&
    requiredPaths.every((need) =>
      paths.some((path) => path === need || path.endsWith(`.${need}`) || path.includes(need))
    ) &&
    issues.every(
      (issue) =>
        typeof issue.fieldPath === "string" &&
        issue.fieldPath.length > 0 &&
        typeof issue.messageKey === "string" &&
        issue.messageKey.length > 0
    ) &&
    jsonSize(result) <= 2048 &&
    !/Failed validating|On instance|oneOf|\$defs|Schema:|schema dump|stack|instance path/i.test(
      blob
    )
  );
}

function doseGapOk(
  leftover: Record<string, unknown>,
  coverage: Record<string, unknown> | undefined,
  expected: Readonly<{
    deliveredAmount: number;
    remainingGap: number;
    requestedAmount: number;
    unit: string;
  }>
) {
  const leftoverKeys = Object.keys(leftover).sort();
  return (
    leftover.reason === "dose_gap" &&
    leftover.unit === expected.unit &&
    leftover.requestedAmount === expected.requestedAmount &&
    leftover.deliveredAmount === expected.deliveredAmount &&
    leftover.remainingGap === expected.remainingGap &&
    Number(leftover.requestedAmount) - Number(leftover.deliveredAmount) ===
      Number(leftover.remainingGap) &&
    leftover.amount == null &&
    leftoverKeys.every((key) => DOSE_GAP_KEYS.has(key)) &&
    coverage != null &&
    coverage.requestedAmount === leftover.requestedAmount &&
    coverage.deliveredAmount === leftover.deliveredAmount &&
    coverage.remainingGap === leftover.remainingGap
  );
}

async function runCase(
  id: string,
  work: () => Promise<AeC6CaseResult>
): Promise<AeC6CaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function canonicalAeC6Report(report: AeC6PackReport) {
  return JSON.stringify({
    cases: report.cases.map((item) => ({
      evidence: sortedKeys(item.evidence),
      id: item.id,
      result: item.result
    })),
    packVersion: report.packVersion,
    passedCases: report.passedCases,
    totalCases: report.totalCases
  });
}

export async function runAeC6Pack(): Promise<AeC6PackReport> {
  const previousCeilings = matcherSafetyCeilings();
  beginDeterministicIdsForTests();
  installMagBand();
  setAgenticRuntimeForTests(null);

  try {
    const cases: AeC6CaseResult[] = [];

    cases.push(
      await runCase("AX6-01", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax601-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const replay = await harness.call("plan", {
          idempotencyKey: "ax601-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const omega = await harness.call("plan", {
          idempotencyKey: "ax601-omega-0000001",
          operation: "create",
          request: singleRequest({
            medicationCodes: ["apixaban"],
            targets: [
              { amount: 1000, name: "Omega-3", supplementId: SUP_OMEGA, unit: "mg" }
            ]
          })
        });
        const answered = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: omega.revision,
          idempotencyKey: "ax601-answer-000001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const four = await harness.call("plan", {
          idempotencyKey: "ax601-four-00000001",
          operation: "create",
          request: fourRequest()
        });
        const selected = await harness.call("plan", {
          expectedRevision: four.revision,
          idempotencyKey: "ax601-select-000001",
          operation: "select",
          optionId: OPT_B,
          planHandle: four.planHandle
        });
        const revised = await harness.call("plan", {
          expectedRevision: selected.revision,
          idempotencyKey: "ax601-revise-000001",
          operation: "revise",
          planHandle: four.planHandle,
          request: fourRequest({ requirements: { maxDailyPills: 8 } })
        });
        const blocked = await harness.call("plan", {
          idempotencyKey: "ax601-block-0000001",
          operation: "create",
          request: singleRequest({
            targets: [{ amount: 351, name: "Magnesium", supplementId: SUP_MAG, unit: "mg" }]
          })
        });
        const processingHarness = createHarness({ deferProcessing: true });
        const processing = await processingHarness.call("plan", {
          idempotencyKey: "ax601-proc-00000001",
          operation: "create",
          request: singleRequest()
        });
        const polled = await processingHarness.call("plan", {
          operation: "get",
          planHandle: processing.planHandle
        });
        const payloads = [
          { max: 8192, name: "create", value: created },
          { max: 8192, name: "get", value: gotten },
          { max: 8192, name: "replay", value: replay },
          { max: 16384, name: "answer", value: answered },
          { max: 16384, name: "select", value: selected },
          { max: 16384, name: "revise", value: revised },
          { max: 16384, name: "blocked", value: blocked },
          { max: 8192, name: "processing", value: processing },
          { max: 8192, name: "poll", value: polled }
        ];
        const dirty = payloads
          .map((item) => ({ name: item.name, ...planClean(item.value, item.max) }))
          .filter((item) => !item.ok);
        const countsOk =
          selected.planHandle === four.planHandle &&
          processingHarness.port.getCallCount() === 1;
        return dirty.length === 0 && countsOk
          ? pass("AX6-01", { operations: payloads.map((item) => item.name) })
          : fail("AX6-01", { dirty, rematch: processingHarness.port.getCallCount() });
      })
    );

    cases.push(
      await runCase("AX6-02", async () => {
        const harness = createHarness();
        const first = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const second = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const ok =
          compactErrorOk(first, ["idempotencyKey", "request"]) &&
          JSON.stringify(first) === JSON.stringify(second);
        return ok
          ? pass("AX6-02", { bytes: jsonSize(first) })
          : fail("AX6-02", {
              code:
                asRecord(first.error).error_code ??
                asRecord(first.error).reasonCode ??
                null,
              identical: JSON.stringify(first) === JSON.stringify(second)
            });
      })
    );

    cases.push(
      await runCase("AX6-03", async () => {
        const harness = createHarness();
        const ready = await harness.call("plan", {
          idempotencyKey: "ax603-ready-0000001",
          operation: "create",
          request: singleRequest()
        });
        const warfarin = await harness.call("plan", {
          idempotencyKey: "ax603-warf-00000001",
          operation: "create",
          request: singleRequest({ medicationCodes: ["warfarin"] })
        });
        const warfarinAck = await harness.call("plan", {
          answers: [
            { choice: "acknowledge_unassessed", questionId: "q_unassessed_medical_context" }
          ],
          expectedRevision: warfarin.revision,
          idempotencyKey: "ax603-warf-ack-00001",
          operation: "answer",
          planHandle: warfarin.planHandle
        });
        const omega = await harness.call("plan", {
          idempotencyKey: "ax603-omega-0000001",
          operation: "create",
          request: singleRequest({
            medicationCodes: ["apixaban"],
            targets: [
              { amount: 1000, name: "Omega-3", supplementId: SUP_OMEGA, unit: "mg" }
            ]
          })
        });
        const omegaAck = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: omega.revision,
          idempotencyKey: "ax603-omega-ack-0001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const blocked = await harness.call("plan", {
          idempotencyKey: "ax603-block-0000001",
          operation: "create",
          request: singleRequest({
            targets: [{ amount: 351, name: "Magnesium", supplementId: SUP_MAG, unit: "mg" }]
          })
        });
        const four = await harness.call("plan", {
          idempotencyKey: "ax603-four-00000001",
          operation: "create",
          request: fourRequest()
        });
        const selected = await harness.call("plan", {
          expectedRevision: four.revision,
          idempotencyKey: "ax603-select-000001",
          operation: "select",
          optionId: OPT_B,
          planHandle: four.planHandle
        });
        const processingHarness = createHarness({ deferProcessing: true });
        const processing = await processingHarness.call("plan", {
          idempotencyKey: "ax603-proc-00000001",
          operation: "create",
          request: singleRequest()
        });
        const polled = await processingHarness.call("plan", {
          operation: "get",
          planHandle: processing.planHandle
        });
        const missingReady = REQUIRED_READY_KEYS.filter((key) => !(key in ready));
        const priceOk =
          Number(asRecord(ready.stackSummary).totalPriceMinor) + DEFAULT_SHIPPING_MINOR ===
          Number(ready.estimatedOrderTotalMinor);
        const selectedIds = optionsOf(selected)
          .map((item) => String(item.optionId ?? ""))
          .sort();
        const ok =
          missingReady.length === 0 &&
          priceOk &&
          planClean(ready, 8192).ok &&
          planClean(selected, 16384).ok &&
          planClean(processing, 8192).ok &&
          planClean(polled, 8192).ok &&
          stringList(warfarin.unassessedMedicationCodes).includes("warfarin") &&
          stringList(warfarinAck.unassessedMedicationCodes).includes("warfarin") &&
          stringList(warfarinAck.acknowledgedUnassessedMedicationCodes).includes(
            "warfarin"
          ) &&
          warfarinAck.safetyScope === "partial" &&
          omega.acknowledgementStatus === "pending" &&
          omegaAck.acknowledgementStatus === "acknowledged" &&
          guidanceOf(omega).some((item) => item.exposure === 1104) &&
          guidanceOf(omegaAck).some((item) => item.exposure === 1104) &&
          guidanceOf(blocked).some(
            (item) =>
              item.action === "block" && item.acknowledgementStatus === "not_applicable"
          ) &&
          selectedIds.join() === [OPT_A, OPT_B, OPT_C].sort().join() &&
          optionsOf(selected).filter((item) => item.selected === true).length === 1 &&
          processing.status === "processing" &&
          extraProcessingKeys(processing).length === 0 &&
          polled.status === "ready" &&
          processingHarness.port.getCallCount() === 1;
        return ok
          ? pass("AX6-03", { missingReady, priceOk })
          : fail("AX6-03", {
              missingReady,
              priceOk,
              processing: processing.status ?? null,
              safetyScope: warfarinAck.safetyScope ?? null,
              selectedIds
            });
      })
    );

    cases.push(
      await runCase("AX6-04", async () => {
        const harness = createHarness();
        const b12 = await harness.call("plan", {
          idempotencyKey: "ax604-b12-000000001",
          operation: "create",
          request: b12Request()
        });
        const four = await harness.call("plan", {
          idempotencyKey: "ax604-four-00000001",
          operation: "create",
          request: fourRequest()
        });
        const selected = await harness.call("plan", {
          expectedRevision: four.revision,
          idempotencyKey: "ax604-select-000001",
          operation: "select",
          optionId: OPT_B,
          planHandle: four.planHandle
        });
        const replay = await harness.call("plan", {
          idempotencyKey: "ax604-b12-000000001",
          operation: "create",
          request: b12Request()
        });
        const b12Leftovers = leftoversOf(b12);
        const d3Leftovers = leftoversOf(selected);
        const b12Coverage = coverageOf(b12).find((row) =>
          /vitamin b12/i.test(String(row.name ?? ""))
        );
        const d3Coverage = coverageOf(selected).find((row) =>
          /vitamin d/i.test(String(row.name ?? ""))
        );
        const b12Gap = b12Leftovers.find((item) => item.reason === "dose_gap");
        const d3Gap = d3Leftovers.find((item) => item.reason === "dose_gap");
        const uniqueB12 =
          new Set(b12Leftovers.map((item) => String(item.supplementId ?? item.name))).size ===
          b12Leftovers.length;
        const uniqueD3 =
          new Set(d3Leftovers.map((item) => String(item.supplementId ?? item.name))).size ===
          d3Leftovers.length;
        const noInternal = [...b12Leftovers, ...d3Leftovers].every(
          (item) =>
            item.reason !== "weaker_sku" &&
            item.reason !== "dominance" &&
            item.reason !== "rejected"
        );
        const ok =
          b12Leftovers.length === 1 &&
          d3Leftovers.length === 1 &&
          uniqueB12 &&
          uniqueD3 &&
          noInternal &&
          Boolean(b12Gap) &&
          Boolean(d3Gap) &&
          doseGapOk(b12Gap ?? {}, b12Coverage, {
            deliveredAmount: 100,
            remainingGap: 150,
            requestedAmount: 250,
            unit: "mcg"
          }) &&
          doseGapOk(d3Gap ?? {}, d3Coverage, {
            deliveredAmount: 1200,
            remainingGap: 800,
            requestedAmount: 2000,
            unit: "IU"
          }) &&
          JSON.stringify(leftoversOf(replay)) === JSON.stringify(b12Leftovers);
        return ok
          ? pass("AX6-04", { b12: b12Gap?.remainingGap ?? null, d3: d3Gap?.remainingGap ?? null })
          : fail("AX6-04", {
              b12Reasons: b12Leftovers.map((item) => item.reason ?? null),
              b12Keys: Object.keys(b12Gap ?? {}),
              d3Reasons: d3Leftovers.map((item) => item.reason ?? null),
              d3Keys: Object.keys(d3Gap ?? {})
            });
      })
    );

    cases.push(
      await runCase("AX6-05", async () => {
        const harness = createHarness();
        const en = await harness.call("plan", {
          idempotencyKey: "ax605-create-en-0001",
          operation: "create",
          request: fourRequest()
        });
        const th = await harness.call("plan", {
          idempotencyKey: "ax605-create-th-0001",
          operation: "create",
          request: fourRequest({ locale: "th" })
        });
        const selected = await harness.call("plan", {
          expectedRevision: en.revision,
          idempotencyKey: "ax605-select-000001",
          operation: "select",
          optionId: OPT_B,
          planHandle: en.planHandle
        });
        const b = optionsOf(en).find((item) => item.optionId === OPT_B) ?? {};
        const c = optionsOf(en).find((item) => item.optionId === OPT_C) ?? {};
        const aAfter = optionsOf(selected).find((item) => item.optionId === OPT_A) ?? {};
        const cAfter = optionsOf(selected).find((item) => item.optionId === OPT_C) ?? {};
        const selectedTrade = asRecord(
          optionsOf(selected).find((item) => item.selected === true)?.tradeOffs
        );
        const bTrade = asRecord(b.tradeOffs);
        const summaries = {
          aAfter: String(asRecord(aAfter.tradeOffs).summary ?? ""),
          b: String(bTrade.summary ?? ""),
          c: String(asRecord(c.tradeOffs).summary ?? ""),
          cAfter: String(asRecord(cAfter.tradeOffs).summary ?? "")
        };
        const thB = String(
          asRecord(optionsOf(th).find((item) => item.optionId === OPT_B)?.tradeOffs).summary ??
            ""
        );
        const ok =
          summaries.b ===
            "1,752 THB less; 3 fewer daily units; 8 percentage points lower coverage" &&
          summaries.c ===
            "1,343 THB less; 2 fewer daily units; 8 percentage points lower coverage" &&
          summaries.aAfter ===
            "1,752 THB more; 3 more daily units; 8 percentage points higher coverage" &&
          summaries.cAfter === "409 THB more; 1 more daily unit" &&
          Number(bTrade.priceDeltaMinor) === -175200 &&
          Number(bTrade.pillDelta) === -3 &&
          Number(bTrade.coverageDeltaPercent) === -8 &&
          selectedTrade.summaryKey === "plan.tradeoff.selected" &&
          Object.values(summaries).every((item) => item.length <= 140) &&
          !/less complete/.test(JSON.stringify(summaries)) &&
          typeof asRecord(
            optionsOf(th).find((item) => item.optionId === OPT_B)?.tradeOffs
          ).summaryKey === "string" &&
          /บาท/.test(thB) &&
          !BANNED_TH_TRADEOFF.test(thB);
        return ok
          ? pass("AX6-05", summaries)
          : fail("AX6-05", summaries);
      })
    );

    const byId = new Map(cases.map((item) => [item.id, item]));
    const firstFive = CASE_IDS.slice(0, 5).map(
      (id) => byId.get(id) ?? fail(id, { missing: true })
    );
    const failedFive = firstFive
      .filter((item) => item.result !== "PASS")
      .map((item) => item.id);
    cases.push(
      failedFive.length === 0
        ? pass("AX6-06", { passed: firstFive.map((item) => item.id) })
        : fail("AX6-06", { failed: failedFive })
    );

    const ordered = CASE_IDS.map(
      (id) => cases.find((item) => item.id === id) ?? fail(id, { missing: true })
    );

    return {
      cases: ordered,
      packVersion: "agentic-experience-6.0",
      passedCases: ordered.filter((item) => item.result === "PASS").length,
      totalCases: 6
    };
  } finally {
    endDeterministicIdsForTests();
    setMatcherSafetyCeilings(previousCeilings);
    if (previousCeilings.length === 0) {
      resetMatcherSafetyCeilings();
    }
    setAgenticRuntimeForTests(null);
  }
}

if (process.env.NODE_TEST_CONTEXT) {
  describe("agentic experience cycle 6 pack", () => {
    it("exports 6 cases and a canonical report", async () => {
      const report = await runAeC6Pack();
      assert.equal(report.totalCases, 6);
      assert.equal(report.cases.length, 6);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...CASE_IDS]
      );
      const encoded = canonicalAeC6Report(report);
      assert.equal(typeof encoded, "string");
      assert.equal(encoded, canonicalAeC6Report(JSON.parse(encoded) as AeC6PackReport));
    });
  });
}
