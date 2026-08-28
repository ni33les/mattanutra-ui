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
  "AX4-01",
  "AX4-02",
  "AX4-03",
  "AX4-04",
  "AX4-05",
  "AX4-06",
  "AX4-07",
  "AX4-08",
  "AX4-09"
] as const;

const SUP_C = "sup_ae_vitamin_c";
const SUP_D3 = "sup_ae_vitamin_d3";
const SUP_OMEGA = "sup_ae_omega3";
const SUP_MAG = "sup_ae_magnesium";
const PRD_C = "prd_ae_c500";
const PRD_EPA = "prd_ae_epa";
const PRD_MAG = "prd_ae_natmag";
const PRD_D3_A = "prd_ae_d3_600";
const PRD_D3_B = "prd_ae_d3_1200";
const PRD_COV = "prd_ae_cov";
const PRD_COST = "prd_ae_cost";
const PRD_PILLS = "prd_ae_pills";
const PRD_BAL_A = "prd_ae_bal_a";
const PRD_BAL_B = "prd_ae_bal_b";
const OPT_SINGLE = "opt_ae_single";
const OPT_EPA = "opt_ae_epa";
const OPT_MAG = "opt_ae_mag";
const OPT_D3 = "opt_ae_d3";
const OPT_COV = "opt_ae_cov";
const OPT_COST = "opt_ae_cost";
const OPT_PILLS = "opt_ae_pills";
const OPT_BAL_A = "opt_ae_bal_a";
const OPT_BAL_B = "opt_ae_bal_b";
const MAG_BAND_ID = "band_ae_magnesium_ul";

const ISOLATED_INFO: IsolatedInfoCatalog = {
  conditionCodes: ["ckd", "chronic_kidney_disease"],
  medicationCodes: ["apixaban", "eliquis"],
  supportedCountries: [
    { countryCode: "TH", countryName: "Thailand", currency: "THB" }
  ]
};

const OPTION_REASON = {
  balanced: {
    en: "Balanced stack",
    th: "สมดุลทั้งค่าใช้จ่ายและเม็ด"
  },
  fewest_pills: {
    en: "Fewer daily pills",
    th: "เม็ดต่อวันน้อยกว่า"
  },
  highest_coverage: {
    en: "Higher coverage",
    th: "ครอบคลุมมากกว่า"
  },
  lowest_cost: {
    en: "Lower cost",
    th: "ค่าใช้จ่ายต่ำกว่า"
  }
} as const;

const TRADEOFF_COPY = {
  selected: {
    key: "plan.tradeoff.selected",
    th: "ตัวเลือกที่เลือก"
  }
} as const;

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
  "matcherVersion",
  "rejected",
  "searchDeadlineMs",
  "searchMs",
  "serializeMs",
  "targetClassifications",
  "targetFrontiers",
  "targetSetHash"
]);

const BANNED_TRADEOFF =
  /selected stack|satang|\bcoverage\b|\bpills\b|\bproducts\b/i;
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
const OPTION_CODES = new Set([
  "balanced",
  "fewest_pills",
  "highest_coverage",
  "lowest_cost"
]);
const INFO_ALLOWED = new Set([
  "ok",
  "serviceName",
  "contractVersion",
  "supportedCountries",
  "supportedLocales",
  "medicationCodes",
  "conditionCodes",
  "userAccountRequired",
  "continuation",
  "pollAfterSeconds",
  "supportAvailable"
]);

export type AeC4CaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AeC4PackReport = Readonly<{
  cases: readonly AeC4CaseResult[];
  packVersion: "agentic-experience-4.0";
  passedCases: number;
  totalCases: 9;
}>;

function sortedKeys(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]])
  );
}

function pass(id: string, evidence: Record<string, unknown>): AeC4CaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: string, evidence: Record<string, unknown>): AeC4CaseResult {
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

function basketItem(
  input: Readonly<{
    dailyPills: number;
    daysOfSupply?: number;
    incidental?: readonly { amount: number; name: string; unit: "mg" | "mcg" }[];
    lineTotalMinor: number;
    productId: string;
    productName: string;
    requestedNames?: readonly string[];
    supplementIds: readonly string[];
  }>
): BasketItem {
  const incidental = input.incidental ?? [];
  const requestedNames = [...(input.requestedNames ?? ["Vitamin C"])];
  return {
    availabilityAsOf: FIXED_NOW,
    contributionSupplementIds: [...input.supplementIds],
    currency: "THB",
    dailyPills: input.dailyPills,
    daysOfSupply: input.daysOfSupply ?? 30,
    deliveryWindow: null,
    fixture: false,
    form: "capsule",
    imageUrl: null,
    incidentalNutrientNames: incidental.map((item) => item.name),
    incidentalNutrients: incidental,
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
  reason: string,
  coveragePercent?: number
): StackOption {
  return {
    basket: [...basket],
    coverage: [...rows],
    coveragePercent:
      coveragePercent ??
      Math.min(
        100,
        rows.reduce((sum, row) => sum + row.coveragePercent, 0) / Math.max(rows.length, 1)
      ),
    dailyPills: basket.reduce((sum, item) => sum + item.dailyPills, 0),
    matcherVersion: "ae-port",
    optionId,
    reason,
    snapshotId: "snap_ae",
    totalPriceMinor: basket.reduce((sum, item) => sum + item.lineTotalMinor, 0)
  };
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
        supplementIds: [SUP_C]
      })
    ],
    [cCoverage(500, PRD_C, "Vitamin C 500")],
    "fewest_pills"
  );
}

function truthfulThree() {
  const coverageOpt = stackOption(
    OPT_COV,
    [
      basketItem({
        dailyPills: 4,
        lineTotalMinor: 70000,
        productId: PRD_COV,
        productName: "Highest coverage stack",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [cCoverage(500, PRD_COV, "Highest coverage stack")],
    "fewest_pills",
    100
  );
  const costOpt = stackOption(
    OPT_COST,
    [
      basketItem({
        dailyPills: 3,
        lineTotalMinor: 30000,
        productId: PRD_COST,
        productName: "Lowest cost stack",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [cCoverage(500, PRD_COST, "Lowest cost stack")],
    "fewest_pills",
    70
  );
  const pillsOpt = stackOption(
    OPT_PILLS,
    [
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 50000,
        productId: PRD_PILLS,
        productName: "Fewest pills stack",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [cCoverage(500, PRD_PILLS, "Fewest pills stack")],
    "fewest_pills",
    85
  );
  return { alternatives: [coverageOpt, costOpt], selected: pillsOpt };
}

function balancedPair() {
  const selected = stackOption(
    OPT_BAL_A,
    [
      basketItem({
        dailyPills: 3,
        lineTotalMinor: 40000,
        productId: PRD_BAL_A,
        productName: "Balanced A",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [cCoverage(500, PRD_BAL_A, "Balanced A")],
    "fewest_pills",
    90
  );
  const other = stackOption(
    OPT_BAL_B,
    [
      basketItem({
        dailyPills: 3,
        lineTotalMinor: 40000,
        productId: PRD_BAL_B,
        productName: "Balanced B",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [cCoverage(500, PRD_BAL_B, "Balanced B")],
    "fewest_pills",
    90
  );
  return { alternatives: [other], selected };
}

function epaOmegaOption() {
  return stackOption(
    OPT_EPA,
    [
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 22000,
        productId: PRD_EPA,
        productName: "EPA 1104",
        requestedNames: ["EPA"],
        supplementIds: [SUP_OMEGA]
      })
    ],
    [
      coverage({
        contributors: [
          {
            amount: 1104,
            productId: PRD_EPA,
            productName: "EPA 1104",
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
    "fewest_pills"
  );
}

function omegaApixabanOption() {
  return stackOption(
    "opt_ae_omega",
    [
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 22000,
        productId: "prd_ae_omega",
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
            productId: "prd_ae_omega",
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
    "fewest_pills"
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
    "fewest_pills"
  );
}

function d3Option() {
  return stackOption(
    OPT_D3,
    [
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 9000,
        productId: PRD_D3_A,
        productName: "Vitamin D3 600",
        requestedNames: ["Vitamin D3"],
        supplementIds: [SUP_D3]
      }),
      basketItem({
        dailyPills: 1,
        lineTotalMinor: 11000,
        productId: PRD_D3_B,
        productName: "Vitamin D3 1200",
        requestedNames: ["Vitamin D3"],
        supplementIds: [SUP_D3]
      })
    ],
    [
      coverage({
        contributors: [
          {
            amount: 600,
            productId: PRD_D3_A,
            productName: "Vitamin D3 600",
            source: "selected",
            unit: "IU"
          },
          {
            amount: 1200,
            productId: PRD_D3_B,
            productName: "Vitamin D3 1200",
            source: "selected",
            unit: "IU"
          }
        ],
        coveragePercent: 90,
        currentAmount: 0,
        deliveredAmount: 1800,
        name: "Vitamin D3",
        percentOfUpperLimit: 45,
        remainingGap: 200,
        requestedAmount: 2000,
        status: "partial",
        supplementId: SUP_D3,
        totalExposureAmount: 1800,
        unit: "IU",
        upperLimitAmount: 4000
      })
    ],
    "fewest_pills"
  );
}

function matchFor(state: CanonicalPlanState) {
  const names = state.targets.map((item) => item.name.toLowerCase());
  const hasApixaban = state.medicationCodes.includes("apixaban");
  const hasOmega = names.some((name) => name.includes("omega"));
  const hasMag = names.some((name) => name.includes("magnesium"));
  const hasCkd = state.conditionCodes.includes("ckd");
  const onlyD3 =
    state.targets.length === 1 && names.some((name) => name.includes("vitamin d"));
  const multi = state.targets.length >= 2;

  if (hasApixaban && hasOmega) {
    return { alternatives: [], leftovers: [], selected: omegaApixabanOption() };
  }

  if (hasOmega && !hasApixaban) {
    return { alternatives: [], leftovers: [], selected: epaOmegaOption() };
  }

  if (hasMag) {
    const requested = state.targets[0]?.amount ?? 351;
    return {
      alternatives: [],
      leftovers: [],
      selected: magOption(requested > 350 ? 350 : requested, requested)
    };
  }

  if (hasCkd) {
    return { alternatives: [], leftovers: [], selected: magOption(200, 200) };
  }

  if (onlyD3) {
    return { alternatives: [], leftovers: [], selected: d3Option() };
  }

  if (multi && state.optimization === "balanced") {
    const packed = balancedPair();
    return {
      alternatives: packed.alternatives,
      leftovers: [],
      selected: packed.selected
    };
  }

  if (multi) {
    const packed = truthfulThree();
    return {
      alternatives: packed.alternatives,
      leftovers: [],
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
    optimization: "fewest_pills" as const,
    profile: profile(),
    requirements: {},
    targets: [{ amount: 500, name: "Vitamin C", supplementId: SUP_C, unit: "mg" }],
    ...overrides
  };
}

function multiRequest(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "fewest_pills" as const,
    profile: profile(),
    requirements: {},
    targets: [
      { amount: 500, name: "Vitamin C", supplementId: SUP_C, unit: "mg" },
      { amount: 2000, name: "Vitamin D3", supplementId: SUP_D3, unit: "IU" }
    ],
    ...overrides
  };
}

function omegaRequest(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "fewest_pills" as const,
    profile: profile(),
    requirements: {},
    targets: [{ amount: 1000, name: "Omega-3", supplementId: SUP_OMEGA, unit: "mg" }],
    ...overrides
  };
}

function magRequest(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "fewest_pills" as const,
    profile: profile(),
    requirements: {},
    targets: [{ amount: 351, name: "Magnesium", supplementId: SUP_MAG, unit: "mg" }],
    ...overrides
  };
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

async function runCase(
  id: string,
  work: () => Promise<AeC4CaseResult>
): Promise<AeC4CaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function canonicalAeC4Report(report: AeC4PackReport) {
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

function checkReasonTriple(
  option: Record<string, unknown>,
  want: keyof typeof OPTION_REASON,
  locale: "en" | "th"
) {
  return (
    option.reasonCode === want &&
    option.reasonKey === `plan.option.${want}` &&
    option.reason === OPTION_REASON[want][locale] &&
    OPTION_CODES.has(String(option.reasonCode ?? ""))
  );
}

export async function runAeC4Pack(): Promise<AeC4PackReport> {
  const previousCeilings = matcherSafetyCeilings();
  beginDeterministicIdsForTests();
  setMatcherSafetyCeilings([]);
  setAgenticRuntimeForTests(null);

  try {
    const cases: AeC4CaseResult[] = [];

    cases.push(
      await runCase("AX4-01", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax401-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const omega = await harness.call("plan", {
          idempotencyKey: "ax401-omega-0000001",
          operation: "create",
          request: {
            ...omegaRequest(),
            medicationCodes: ["apixaban"]
          }
        });
        const answered = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: omega.revision,
          idempotencyKey: "ax401-answer-000001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const multi = await harness.call("plan", {
          idempotencyKey: "ax401-multi-0000001",
          operation: "create",
          request: multiRequest()
        });
        const other = optionsOf(multi).find((item) => item.selected !== true);
        const selected = await harness.call("plan", {
          expectedRevision: multi.revision,
          idempotencyKey: "ax401-select-000001",
          operation: "select",
          optionId: other?.optionId,
          planHandle: multi.planHandle
        });
        const revised = await harness.call("plan", {
          expectedRevision: selected.revision ?? multi.revision,
          idempotencyKey: "ax401-revise-000001",
          operation: "revise",
          planHandle: multi.planHandle,
          request: multiRequest({ requirements: { maxDailyPills: 3 } })
        });
        const payloads = [
          { max: 8192, name: "create", value: created },
          { max: 8192, name: "get", value: gotten },
          { max: 8192, name: "answer", value: answered },
          { max: 16384, name: "select", value: selected },
          { max: 16384, name: "revise", value: revised }
        ];
        const dirty = payloads
          .map((item) => ({
            diagnostics: keyHits(item.value, BANNED_DIAGNOSTIC_KEYS),
            name: item.name,
            oversized: jsonSize(item.value) > item.max,
            status: item.value.status ?? null
          }))
          .filter(
            (item) =>
              item.diagnostics.length > 0 ||
              item.oversized ||
              item.status == null
          );
        return dirty.length === 0
          ? pass("AX4-01", { operations: payloads.map((item) => item.name) })
          : fail("AX4-01", { dirty });
      })
    );

    cases.push(
      await runCase("AX4-02", async () => {
        const harness = createHarness();
        const result = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const error = asRecord(result.error);
        const issues = Array.isArray(error.issues) ? error.issues.map(asRecord) : [];
        const paths = issues.map((item) => String(item.fieldPath ?? ""));
        const blob = JSON.stringify(result);
        const ok =
          result.ok === false &&
          (error.error_code === "invalid_request" || error.reasonCode === "invalid_request") &&
          paths.some((path) => path.includes("idempotencyKey")) &&
          paths.some((path) => path === "request" || path.endsWith(".request")) &&
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
          );
        return ok
          ? pass("AX4-02", { bytes: jsonSize(result), paths })
          : fail("AX4-02", {
              bytes: jsonSize(result),
              error_code: error.error_code ?? error.reasonCode ?? null,
              paths
            });
      })
    );

    cases.push(
      await runCase("AX4-03", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax403-create-000001",
          operation: "create",
          request: multiRequest()
        });
        const options = optionsOf(created);
        const byId = Object.fromEntries(
          options.map((item) => [String(item.optionId ?? ""), item])
        );
        const selected = options.find((item) => item.selected === true);
        const coverageMax = options.reduce(
          (max, item) => Math.max(max, Number(item.coveragePercent ?? 0)),
          0
        );
        const costMin = options.reduce((min, item) => {
          const cost = Number(asRecord(item.stackSummary).totalPriceMinor ?? Infinity);
          return Math.min(min, cost);
        }, Infinity);
        const pillsMin = options.reduce((min, item) => {
          const pills = Number(asRecord(item.stackSummary).totalDailyPills ?? Infinity);
          return Math.min(min, pills);
        }, Infinity);
        const mismatches = options.filter((item) => {
          const code = String(item.reasonCode ?? "");
          const coverage = Number(item.coveragePercent ?? 0);
          const cost = Number(asRecord(item.stackSummary).totalPriceMinor ?? NaN);
          const pills = Number(asRecord(item.stackSummary).totalDailyPills ?? NaN);
          if (code === "highest_coverage" && coverage !== coverageMax) {
            return true;
          }
          if (code === "lowest_cost" && cost !== costMin) {
            return true;
          }
          if (code === "fewest_pills" && pills !== pillsMin) {
            return true;
          }
          return false;
        });
        const codes = options.map((item) => String(item.reasonCode ?? ""));
        const ok =
          options.length === 3 &&
          options.filter((item) => item.selected === true).length === 1 &&
          byId[OPT_COV]?.reasonCode === "highest_coverage" &&
          byId[OPT_COST]?.reasonCode === "lowest_cost" &&
          byId[OPT_PILLS]?.reasonCode === "fewest_pills" &&
          new Set(codes).size === 3 &&
          mismatches.length === 0 &&
          selected?.reasonCode === created.reasonCode &&
          selected?.reason === created.reason &&
          selected?.reasonKey === created.reasonKey;
        return ok
          ? pass("AX4-03", { codes })
          : fail("AX4-03", {
              codes,
              mismatches: mismatches.map((item) => item.optionId ?? null),
              optionCount: options.length,
              selected: selected?.reasonCode ?? null,
              top: created.reasonCode ?? null
            });
      })
    );

    cases.push(
      await runCase("AX4-04", async () => {
        const harness = createHarness();
        const enThree = await harness.call("plan", {
          idempotencyKey: "ax404-three-en-0001",
          operation: "create",
          request: multiRequest()
        });
        const thThree = await harness.call("plan", {
          idempotencyKey: "ax404-three-th-0001",
          operation: "create",
          request: multiRequest({ locale: "th" })
        });
        const enBal = await harness.call("plan", {
          idempotencyKey: "ax404-bal-en-00001",
          operation: "create",
          request: multiRequest({ optimization: "balanced" })
        });
        const thBal = await harness.call("plan", {
          idempotencyKey: "ax404-bal-th-00001",
          operation: "create",
          request: multiRequest({ locale: "th", optimization: "balanced" })
        });
        const expectedThree = {
          [OPT_COV]: "highest_coverage",
          [OPT_COST]: "lowest_cost",
          [OPT_PILLS]: "fewest_pills"
        } as const;

        function checkThree(plan: Record<string, unknown>, locale: "en" | "th") {
          return optionsOf(plan).filter((item) => {
            const want = expectedThree[String(item.optionId ?? "") as keyof typeof expectedThree];
            return !want || !checkReasonTriple(item, want, locale);
          });
        }

        const threeBad = [
          ...checkThree(enThree, "en"),
          ...checkThree(thThree, "th")
        ];
        const balEn = optionsOf(enBal).find((item) => item.selected === true) ?? {};
        const balTh = optionsOf(thBal).find((item) => item.selected === true) ?? {};
        const balancedOk =
          checkReasonTriple(balEn, "balanced", "en") &&
          checkReasonTriple(balTh, "balanced", "th");
        const ok = threeBad.length === 0 && balancedOk;
        return ok
          ? pass("AX4-04", { balanced: "balanced" })
          : fail("AX4-04", {
              balancedEn: {
                reason: balEn.reason ?? null,
                reasonCode: balEn.reasonCode ?? null,
                reasonKey: balEn.reasonKey ?? null
              },
              threeBad: threeBad.map((item) => ({
                optionId: item.optionId ?? null,
                reason: item.reason ?? null,
                reasonCode: item.reasonCode ?? null
              }))
            });
      })
    );

    cases.push(
      await runCase("AX4-05", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax405-create-000001",
          operation: "create",
          request: omegaRequest()
        });
        const lines = basketOf(created);
        const bad = lines.filter((item) => {
          const reason = asRecord(item.selectionReason);
          const ids = stringList(reason.requestedSupplementIds);
          const names = stringList(reason.requestedNames ?? reason.requestedNutrientNames);
          const lineNames = stringList(item.requestedNutrientNames);
          return (
            ids.join() !== SUP_OMEGA ||
            names.length !== ids.length ||
            names.some((name) => !/^omega-3$/i.test(name)) ||
            lineNames.some((name) => !/^omega-3$/i.test(name)) ||
            names.length < 1 ||
            /epa/i.test(JSON.stringify({ ids, lineNames, names }))
          );
        });
        return lines.length === 1 && bad.length === 0
          ? pass("AX4-05", { lineCount: lines.length })
          : fail("AX4-05", { badCount: bad.length, lineCount: lines.length });
      })
    );

    cases.push(
      await runCase("AX4-06", async () => {
        installMagBand();
        const harness = createHarness();
        const mag = await harness.call("plan", {
          idempotencyKey: "ax406-mag-00000001",
          operation: "create",
          request: magRequest()
        });
        const ckd = await harness.call("plan", {
          idempotencyKey: "ax406-ckd-00000001",
          operation: "create",
          request: magRequest({
            conditionCodes: ["ckd"],
            targets: [{ amount: 200, name: "Magnesium", supplementId: SUP_MAG, unit: "mg" }]
          })
        });

        function checkBlock(
          plan: Record<string, unknown>,
          code: "condition_review_required" | "dose_review_required"
        ) {
          const rows = guidanceOf(plan).filter((item) => item.action === "block");
          const only = rows[0] ?? {};
          const contributors = Array.isArray(only.contributors)
            ? only.contributors.map(asRecord)
            : [];
          const exposure = Number(only.exposure);
          const contributorSum = contributors.reduce(
            (sum, item) => sum + Number(item.amount ?? 0),
            0
          );
          const ackChoices = questionsOf(plan).flatMap((question) =>
            Array.isArray(question.choices) ? question.choices.map(asRecord) : []
          );
          const next = nextActionsOf(plan);
          return (
            plan.status === "blocked" &&
            next.length === 1 &&
            next[0] === "change_request" &&
            !ackChoices.some((item) => /acknowledge/i.test(String(item.choice ?? ""))) &&
            !questionsOf(plan).some((item) => /ack/i.test(String(item.questionId ?? ""))) &&
            rows.length >= 1 &&
            only.action === "block" &&
            only.acknowledgementStatus === "not_applicable" &&
            only.acknowledgementStatus !== "pending" &&
            only.acknowledgementStatus !== "acknowledged" &&
            only.acknowledgementStatus !== "not_required" &&
            (plan.acknowledgementStatus === "not_required" ||
              !("acknowledgementStatus" in plan) ||
              plan.acknowledgementStatus !== "pending") &&
            Number.isFinite(exposure) &&
            exposure > 0 &&
            exposure === contributorSum &&
            only.code === code &&
            !next.some((item) => /execute|confirm/i.test(item))
          );
        }

        const magOk = checkBlock(mag, "dose_review_required");
        const ckdOk = checkBlock(ckd, "condition_review_required");
        setMatcherSafetyCeilings([]);
        return magOk && ckdOk
          ? pass("AX4-06", {
              ckd: ckd.status,
              mag: mag.status
            })
          : fail("AX4-06", {
              ckdAck: guidanceOf(ckd)[0]?.acknowledgementStatus ?? null,
              ckdCode: guidanceOf(ckd)[0]?.code ?? null,
              ckdStatus: ckd.status ?? null,
              magAck: guidanceOf(mag)[0]?.acknowledgementStatus ?? null,
              magCode: guidanceOf(mag)[0]?.code ?? null,
              magStatus: mag.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AX4-07", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax407-create-000001",
          operation: "create",
          request: multiRequest({ locale: "th" })
        });
        const options = optionsOf(created);
        const bad = options.filter((item) => {
          const trade = asRecord(item.tradeOffs);
          const summary = String(trade.summary ?? "");
          const key = String(trade.summaryKey ?? "");
          const selected = item.selected === true;
          return (
            typeof trade.coverageDeltaPercent !== "number" ||
            typeof trade.priceDeltaMinor !== "number" ||
            typeof trade.pillDelta !== "number" ||
            typeof trade.productCountDelta !== "number" ||
            key.length < 1 ||
            !key.startsWith("plan.tradeoff.") ||
            BANNED_TRADEOFF.test(summary) ||
            (selected && (summary !== TRADEOFF_COPY.selected.th || key !== TRADEOFF_COPY.selected.key))
          );
        });
        const ok = created.locale === "th" && options.length === 3 && bad.length === 0;
        return ok
          ? pass("AX4-07", { optionCount: options.length })
          : fail("AX4-07", {
              locale: created.locale ?? null,
              bad: bad.map((item) => ({
                optionId: item.optionId ?? null,
                summary: asRecord(item.tradeOffs).summary ?? null,
                summaryKey: asRecord(item.tradeOffs).summaryKey ?? null
              }))
            });
      })
    );

    cases.push(
      await runCase("AX4-08", async () => {
        const harness = createHarness();
        const info = await harness.call("info", {});
        const infoExtra = Object.keys(info).filter((key) => !INFO_ALLOWED.has(key));
        const ready = await harness.call("plan", {
          idempotencyKey: "ax408-ready-0000001",
          operation: "create",
          request: singleRequest()
        });
        const summary = asRecord(ready.stackSummary);
        const priceOk =
          Number(summary.totalPriceMinor) + DEFAULT_SHIPPING_MINOR ===
          Number(ready.estimatedOrderTotalMinor);
        const warfarin = await harness.call("plan", {
          idempotencyKey: "ax408-warf-00000001",
          operation: "create",
          request: singleRequest({ medicationCodes: ["warfarin"] })
        });
        const warfarinAck = await harness.call("plan", {
          answers: [
            {
              choice: "acknowledge_unassessed",
              questionId: "q_unassessed_medical_context"
            }
          ],
          expectedRevision: warfarin.revision,
          idempotencyKey: "ax408-warf-ack-00001",
          operation: "answer",
          planHandle: warfarin.planHandle
        });
        const diabetes = await harness.call("plan", {
          idempotencyKey: "ax408-diab-00000001",
          operation: "create",
          request: singleRequest({ conditionCodes: ["diabetes"] })
        });
        const diabetesAck = await harness.call("plan", {
          answers: [
            {
              choice: "acknowledge_unassessed",
              questionId: "q_unassessed_medical_context"
            }
          ],
          expectedRevision: diabetes.revision,
          idempotencyKey: "ax408-diab-ack-00001",
          operation: "answer",
          planHandle: diabetes.planHandle
        });
        const omega = await harness.call("plan", {
          idempotencyKey: "ax408-omega-0000001",
          operation: "create",
          request: { ...omegaRequest(), medicationCodes: ["apixaban"] }
        });
        const beforeOmega = harness.port.getCallCount();
        const omegaAck = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: omega.revision,
          idempotencyKey: "ax408-omega-ack-0001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const omegaDidNotRematch = harness.port.getCallCount() === beforeOmega;
        const overlap = await harness.call("plan", {
          idempotencyKey: "ax408-d3-0000000001",
          operation: "create",
          request: singleRequest({
            targets: [{ amount: 2000, name: "Vitamin D3", supplementId: SUP_D3, unit: "IU" }]
          })
        });
        const multi = await harness.call("plan", {
          idempotencyKey: "ax408-multi-0000001",
          operation: "create",
          request: multiRequest()
        });
        const beforeIds = optionsOf(multi)
          .map((item) => String(item.optionId ?? ""))
          .sort();
        const other = optionsOf(multi).find((item) => item.selected !== true);
        const selected = await harness.call("plan", {
          expectedRevision: multi.revision,
          idempotencyKey: "ax408-select-000001",
          operation: "select",
          optionId: other?.optionId,
          planHandle: multi.planHandle
        });
        const afterIds = optionsOf(selected)
          .map((item) => String(item.optionId ?? ""))
          .sort();
        const stale = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: omega.revision,
          idempotencyKey: "ax408-stale-0000001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const processingHarness = createHarness({ deferProcessing: true });
        const processing = await processingHarness.call("plan", {
          idempotencyKey: "ax408-proc-00000001",
          operation: "create",
          request: singleRequest()
        });
        const processingKeys = Object.keys(processing).filter(
          (key) => !PROCESSING_KEYS.has(key)
        );
        const gotten = await processingHarness.call("plan", {
          operation: "get",
          planHandle: processing.planHandle
        });
        const diagnostics = [
          ready,
          warfarinAck,
          diabetesAck,
          omegaAck,
          overlap,
          selected
        ].flatMap((item) => keyHits(item, BANNED_DIAGNOSTIC_KEYS));
        const ok =
          info.ok === true &&
          infoExtra.length === 0 &&
          ready.status === "ready" &&
          priceOk &&
          stringList(warfarinAck.unassessedMedicationCodes).join() === "warfarin" &&
          stringList(warfarinAck.acknowledgedUnassessedMedicationCodes).join() ===
            "warfarin" &&
          stringList(diabetesAck.unassessedConditionCodes).join() === "diabetes" &&
          stringList(diabetesAck.acknowledgedUnassessedConditionCodes).join() ===
            "diabetes" &&
          omega.acknowledgementStatus === "pending" &&
          omegaAck.acknowledgementStatus === "acknowledged" &&
          omegaDidNotRematch &&
          overlap.status === "ready" &&
          overlap.acknowledgementStatus === "not_required" &&
          beforeIds.join() === afterIds.join() &&
          selected.optionId === other?.optionId &&
          asRecord(stale.error).error_code === "stale_revision" &&
          processing.status === "processing" &&
          processingKeys.length === 0 &&
          gotten.status === "ready" &&
          diagnostics.length === 0;
        return ok
          ? pass("AX4-08", { priceOk, selected: selected.optionId })
          : fail("AX4-08", {
              diagnostics: diagnostics.slice(0, 8),
              diabetes: diabetesAck.status ?? null,
              infoExtra,
              omegaAck: omegaAck.acknowledgementStatus ?? null,
              overlap: overlap.acknowledgementStatus ?? null,
              priceOk,
              processing: processing.status ?? null,
              selectedIds: afterIds,
              stale: asRecord(stale.error).error_code ?? null,
              warfarin: warfarinAck.status ?? null
            });
      })
    );

    const byId = new Map(cases.map((item) => [item.id, item]));
    const firstEight = CASE_IDS.slice(0, 8).map(
      (id) => byId.get(id) ?? fail(id, { missing: true })
    );
    const failedEight = firstEight
      .filter((item) => item.result !== "PASS")
      .map((item) => item.id);
    cases.push(
      failedEight.length === 0
        ? pass("AX4-09", { passed: firstEight.map((item) => item.id) })
        : fail("AX4-09", { failed: failedEight })
    );

    const ordered = CASE_IDS.map(
      (id) => cases.find((item) => item.id === id) ?? fail(id, { missing: true })
    );

    return {
      cases: ordered,
      packVersion: "agentic-experience-4.0",
      passedCases: ordered.filter((item) => item.result === "PASS").length,
      totalCases: 9
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
  describe("agentic experience cycle 4 pack", () => {
    it("exports 9 cases and a canonical report", async () => {
      const report = await runAeC4Pack();
      assert.equal(report.totalCases, 9);
      assert.equal(report.cases.length, 9);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...CASE_IDS]
      );
      const encoded = canonicalAeC4Report(report);
      assert.equal(typeof encoded, "string");
      assert.equal(encoded, canonicalAeC4Report(JSON.parse(encoded) as AeC4PackReport));
    });
  });
}
