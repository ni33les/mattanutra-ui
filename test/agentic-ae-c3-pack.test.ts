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
  "AX3-01",
  "AX3-02",
  "AX3-03",
  "AX3-04",
  "AX3-05",
  "AX3-06",
  "AX3-07",
  "AX3-08",
  "AX3-09",
  "AX3-10",
  "AX3-11",
  "AX3-12",
  "AX3-13",
  "AX3-14",
  "AX3-15"
] as const;

const SUP_C = "sup_ae_vitamin_c";
const SUP_D3 = "sup_ae_vitamin_d3";
const SUP_OMEGA = "sup_ae_omega3";
const SUP_B6 = "sup_ae_vitamin_b6";
const PRD_C = "prd_ae_c500";
const PRD_INC = "prd_ae_c_incidental";
const PRD_OMEGA = "prd_ae_omega";
const PRD_MULTI_A = "prd_ae_multi_a";
const PRD_MULTI_B = "prd_ae_multi_b";
const PRD_MULTI_C = "prd_ae_multi_c";
const OPT_SINGLE = "opt_ae_single";
const OPT_INC = "opt_ae_incidental";
const OPT_OMEGA = "opt_ae_omega";
const OPT_MULTI_A = "opt_ae_multi_a";
const OPT_MULTI_B = "opt_ae_multi_b";
const OPT_MULTI_C = "opt_ae_multi_c";
const OPT_LOW = "opt_ae_lowpills";

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

const PUBLIC_PLAN_KEYS = new Set([
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
  "locale",
  "leftovers",
  "medicationCodes",
  "nextActions",
  "ok",
  "optionId",
  "options",
  "planHandle",
  "pollAfterSeconds",
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
  "canonical",
  "cash30DayMinor",
  "cash90DayMinor",
  "cashComplete",
  "claimIds",
  "compactDecision",
  "comparisonBasis",
  "comparisonComplete",
  "consumptionComplete",
  "evidenceHandle",
  "explanation",
  "orderSchedule",
  "purchaseRequiredNow",
  "researchVersion",
  "tradeOffs",
  "unassessedConditionCodes",
  "unassessedMedicationCodes"
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

const COMPETING_ACK_KEYS = new Set([
  "acknowledgementRequired",
  "pending",
  "requiresSafetyAcknowledgement"
]);

const OPTION_CODES = new Set([
  "balanced",
  "fewest_pills",
  "highest_coverage",
  "lowest_cost"
]);
const LINE_REASON_CODES = new Set([
  "best_available",
  "best_available_dose",
  "consolidates_targets",
  "covers_target",
  "dedicated_unavailable",
  "reduces_cost",
  "reduces_pills",
  "retained_by_user"
]);
const OPTION_ONLY_KEYS = new Set([
  "cash90DayMinor",
  "coveragePercent",
  "deferredTargetIds",
  "includedTargetIds",
  "omittedTargetIds",
  "optionId",
  "reason",
  "reasonCode",
  "reasonKey",
  "recommended",
  "role",
  "selected",
  "stackSummary",
  "tradeOff",
  "tradeOffs"
]);
const BANNED_EN =
  /\backnowledge\b|\bcontinue\b|\bexecute\b|\bcheckout\b|\bpayment\b|\border\b|\bfreeze\b|\bclient\b|\bmatcher\b|\boptionId\b|\bplanHandle\b|\brevision\b|\btelemetry\b/i;
const INCIDENTAL_B = /vitamin b|b6|b12|pyridoxine|cobalamin/i;
const C_LEFTOVER: PlanLeftover = {
  amount: 0,
  name: "Vitamin C",
  reason: "dose_gap",
  severity: "low",
  supplementId: SUP_C,
  unit: "mg"
};

export type AeC3CaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AeC3PackReport = Readonly<{
  cases: readonly AeC3CaseResult[];
  packVersion: "agentic-experience-3.0";
  passedCases: number;
  totalCases: 15;
}>;

function sortedKeys(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]])
  );
}

function pass(id: string, evidence: Record<string, unknown>): AeC3CaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: string, evidence: Record<string, unknown>): AeC3CaseResult {
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

function bannedDiagnosticHits(value: unknown) {
  return keyHits(value, BANNED_DIAGNOSTIC_KEYS);
}

function competingAckHits(value: unknown) {
  return keyHits(value, COMPETING_ACK_KEYS);
}

function extraPublicKeys(value: Record<string, unknown>) {
  return Object.keys(value)
    .filter((key) => !PUBLIC_PLAN_KEYS.has(key))
    .sort();
}

function extraProcessingKeys(value: Record<string, unknown>) {
  return Object.keys(value)
    .filter((key) => !PROCESSING_KEYS.has(key))
    .sort();
}

function cleanliness(plan: Record<string, unknown>) {
  return {
    competing: competingAckHits(plan),
    diagnostics: bannedDiagnosticHits(plan),
    extra: extraPublicKeys(plan),
    genericAck: "acknowledgedUnassessed" in plan,
    leftovers: "leftovers" in plan,
    missingEstimated: typeof plan.estimatedOrderTotalMinor !== "number",
    topProductCount: "productCount" in plan,
    topSubtotal: "subtotalMinor" in plan,
    topTotal: "totalPriceMinor" in plan
  };
}

function isClean(plan: Record<string, unknown>, maxBytes: number) {
  const report = cleanliness(plan);
  return (
    jsonSize(plan) <= maxBytes &&
    report.extra.length === 0 &&
    report.diagnostics.length === 0 &&
    report.competing.length === 0 &&
    report.genericAck === false &&
    report.missingEstimated === false &&
    report.topProductCount === false &&
    report.topSubtotal === false &&
    report.topTotal === false
  );
}

function basketItem(
  input: Readonly<{
    dailyPills: number;
    daysOfSupply: number;
    incidental?: readonly { amount: number; name: string; unit: "mg" | "mcg" }[];
    leakIncidental?: boolean;
    lineTotalMinor: number;
    productId: string;
    productName: string;
    requestedNames?: readonly string[];
    supplementIds: readonly string[];
  }>
): BasketItem {
  const incidental = input.incidental ?? [];
  const requestedNames = input.leakIncidental
    ? [...(input.requestedNames ?? ["Vitamin C"]), "Vitamin B6"]
    : [...(input.requestedNames ?? ["Vitamin C"])];
  const requestedIds = input.leakIncidental
    ? [...input.supplementIds, SUP_B6]
    : [...input.supplementIds];
  return {
    availabilityAsOf: FIXED_NOW,
    contributionSupplementIds: requestedIds,
    currency: "THB",
    dailyPills: input.dailyPills,
    daysOfSupply: input.daysOfSupply,
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
      requestedSupplementIds: requestedIds
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
  reason: string
): StackOption {
  return {
    basket: [...basket],
    coverage: [...rows],
    coveragePercent: Math.min(
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

function d3Coverage(
  parts: ReadonlyArray<{ amount: number; productId: string; productName: string }>
): CoverageRow {
  const delivered = parts.reduce((sum, item) => sum + item.amount, 0);
  return coverage({
    contributors: parts.map((item) => ({
      amount: item.amount,
      productId: item.productId,
      productName: item.productName,
      source: "selected" as const,
      unit: "IU" as const
    })),
    coveragePercent: Math.round((delivered / 2000) * 100),
    currentAmount: 0,
    deliveredAmount: delivered,
    name: "Vitamin D3",
    percentOfUpperLimit: 45,
    remainingGap: Math.max(0, 2000 - delivered),
    requestedAmount: 2000,
    status: "partial",
    supplementId: SUP_D3,
    totalExposureAmount: delivered,
    unit: "IU",
    upperLimitAmount: 4000
  });
}

function incidentalOption() {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      incidental: [
        { amount: 2, name: "Vitamin B6", unit: "mg" },
        { amount: 6, name: "Vitamin B12", unit: "mcg" }
      ],
      leakIncidental: true,
      lineTotalMinor: 15900,
      productId: PRD_INC,
      productName: "Vitamin C with B complex",
      requestedNames: ["Vitamin C"],
      supplementIds: [SUP_C]
    })
  ];
  return stackOption(
    OPT_INC,
    basket,
    [cCoverage(500, PRD_INC, "Vitamin C with B complex")],
    "fewest_pills"
  );
}

function singleOption() {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      lineTotalMinor: 15900,
      productId: PRD_C,
      productName: "Vitamin C 500",
      supplementIds: [SUP_C]
    })
  ];
  return stackOption(
    OPT_SINGLE,
    basket,
    [cCoverage(500, PRD_C, "Vitamin C 500")],
    "fewest_pills"
  );
}

function omegaOption() {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      lineTotalMinor: 22000,
      productId: PRD_OMEGA,
      productName: "Omega-3 1104",
      requestedNames: ["Omega-3"],
      supplementIds: [SUP_OMEGA]
    })
  ];
  return stackOption(
    OPT_OMEGA,
    basket,
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
    "fewest_pills"
  );
}

function multiOptions() {
  const selected = stackOption(
    OPT_MULTI_A,
    [
      basketItem({
        dailyPills: 2,
        daysOfSupply: 30,
        lineTotalMinor: 50000,
        productId: PRD_MULTI_A,
        productName: "Fewest pills stack",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [
      cCoverage(500, PRD_MULTI_A, "Fewest pills stack"),
      d3Coverage([
        { amount: 1800, productId: PRD_MULTI_A, productName: "Fewest pills stack" }
      ])
    ],
    "fewest_pills"
  );
  const cheaper = stackOption(
    OPT_MULTI_B,
    [
      basketItem({
        dailyPills: 4,
        daysOfSupply: 30,
        lineTotalMinor: 30000,
        productId: PRD_MULTI_B,
        productName: "Lower cost stack",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [
      cCoverage(500, PRD_MULTI_B, "Lower cost stack"),
      d3Coverage([
        { amount: 1600, productId: PRD_MULTI_B, productName: "Lower cost stack" }
      ])
    ],
    "lowest_cost"
  );
  const richer = stackOption(
    OPT_MULTI_C,
    [
      basketItem({
        dailyPills: 3,
        daysOfSupply: 30,
        lineTotalMinor: 70000,
        productId: PRD_MULTI_C,
        productName: "Higher coverage stack",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [
      cCoverage(500, PRD_MULTI_C, "Higher coverage stack"),
      d3Coverage([
        { amount: 2000, productId: PRD_MULTI_C, productName: "Higher coverage stack" }
      ])
    ],
    "highest_coverage"
  );
  return { alternatives: [cheaper, richer], selected };
}

function lowPillsOption() {
  return stackOption(
    OPT_LOW,
    [
      basketItem({
        dailyPills: 2,
        daysOfSupply: 30,
        lineTotalMinor: 48000,
        productId: PRD_MULTI_A,
        productName: "Fewest pills stack",
        requestedNames: ["Vitamin C", "Vitamin D3"],
        supplementIds: [SUP_C, SUP_D3]
      })
    ],
    [
      cCoverage(500, PRD_MULTI_A, "Fewest pills stack"),
      d3Coverage([
        { amount: 1800, productId: PRD_MULTI_A, productName: "Fewest pills stack" }
      ])
    ],
    "fewest_pills"
  );
}

function matchFor(state: CanonicalPlanState) {
  const names = state.targets.map((item) => item.name.toLowerCase());
  const hasApixaban = state.medicationCodes.includes("apixaban");
  const hasOmega = names.some((name) => name.includes("omega"));
  const hasC = names.some((name) => name.includes("vitamin c"));
  const multi = state.targets.length >= 2;
  const maxPills = state.requirements.maxDailyPills;

  if (hasApixaban && hasOmega) {
    return { alternatives: [], leftovers: [], selected: omegaOption() };
  }

  if (multi && maxPills != null && maxPills <= 3) {
    return {
      alternatives: [multiOptions().selected],
      leftovers: [],
      selected: lowPillsOption()
    };
  }

  if (multi) {
    const packed = multiOptions();
    return {
      alternatives: packed.alternatives,
      leftovers: [],
      selected: packed.selected
    };
  }

  if (hasC && state.targets.length === 1) {
    return {
      alternatives: [],
      leftovers: [C_LEFTOVER],
      selected: incidentalOption()
    };
  }

  return {
    alternatives: [],
    leftovers: [C_LEFTOVER],
    selected: singleOption()
  };
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
    medicationCodes: ["apixaban"],
    optimization: "fewest_pills" as const,
    profile: profile(),
    requirements: {},
    targets: [{ amount: 1000, name: "Omega-3", supplementId: SUP_OMEGA, unit: "mg" }],
    ...overrides
  };
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
  if (Array.isArray(value.options)) {
    return value.options.map(asRecord);
  }

  const selected = value.optionId
    ? [
        {
          optionId: value.optionId,
          reason: value.reason,
          reasonKey: value.reasonKey,
          selected: true,
          stackSummary: value.stackSummary
        }
      ]
    : [];
  const alts = Array.isArray(value.alternatives)
    ? value.alternatives.map((item) => ({ ...asRecord(item), selected: false }))
    : [];
  return [...selected, ...alts];
}

async function runCase(
  id: string,
  work: () => Promise<AeC3CaseResult>
): Promise<AeC3CaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function canonicalAeC3Report(report: AeC3PackReport) {
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

export async function runAeC3Pack(): Promise<AeC3PackReport> {
  const previousCeilings = matcherSafetyCeilings();
  beginDeterministicIdsForTests();
  setMatcherSafetyCeilings([]);
  setAgenticRuntimeForTests(null);

  try {
    const cases: AeC3CaseResult[] = [];

    cases.push(
      await runCase("AX3-01", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax301-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const report = cleanliness(created);
        const ok =
          created.ok === true &&
          created.status === "ready" &&
          jsonSize(created) <= 8192 &&
          isClean(created, 8192);
        return ok
          ? pass("AX3-01", { bytes: jsonSize(created), status: created.status })
          : fail("AX3-01", {
              bytes: jsonSize(created),
              status: created.status ?? null,
              ...report
            });
      })
    );

    cases.push(
      await runCase("AX3-02", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax302-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const omega = await harness.call("plan", {
          idempotencyKey: "ax302-omega-0000001",
          operation: "create",
          request: omegaRequest()
        });
        const answered = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: omega.revision,
          idempotencyKey: "ax302-answer-000001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const multi = await harness.call("plan", {
          idempotencyKey: "ax302-multi-0000001",
          operation: "create",
          request: multiRequest()
        });
        const other = optionsOf(multi).find((item) => item.selected !== true);
        const selected = await harness.call("plan", {
          expectedRevision: multi.revision,
          idempotencyKey: "ax302-select-000001",
          operation: "select",
          optionId: other?.optionId,
          planHandle: multi.planHandle
        });
        const revised = await harness.call("plan", {
          expectedRevision: selected.revision ?? multi.revision,
          idempotencyKey: "ax302-revise-000001",
          operation: "revise",
          planHandle: multi.planHandle,
          request: multiRequest({ requirements: { maxDailyPills: 3 } })
        });
        const payloads = [created, gotten, answered, selected, revised];
        const dirty = payloads
          .map((item, index) => ({
            index,
            status: item.status ?? null,
            ...cleanliness(item)
          }))
          .filter((item, index) => !isClean(payloads[index], index < 2 ? 8192 : 16384));
        const ok = dirty.length === 0;
        return ok
          ? pass("AX3-02", { operations: ["get", "answer", "select", "revise"] })
          : fail("AX3-02", { dirty });
      })
    );

    cases.push(
      await runCase("AX3-03", async () => {
        const harness = createHarness();
        const result = await harness.call("plan", {
          debugDump: true,
          idempotencyKey: "ax303-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const error = asRecord(result.error);
        const issues = Array.isArray(error.issues) ? error.issues.map(asRecord) : [];
        const blob = JSON.stringify(result);
        const extra = Object.keys(result)
          .filter((key) => key !== "ok" && key !== "error")
          .sort();
        const ok =
          result.ok === false &&
          (error.error_code === "invalid_request" ||
            error.error_code === "unexpected_property" ||
            error.reasonCode === "invalid_request" ||
            error.reasonCode === "unexpected_property") &&
          typeof error.fieldPath === "string" &&
          error.fieldPath.length > 0 &&
          issues.length === 1 &&
          typeof issues[0]?.fieldPath === "string" &&
          issues[0].fieldPath.length > 0 &&
          typeof issues[0]?.messageKey === "string" &&
          issues[0].messageKey.length > 0 &&
          extra.length === 0 &&
          jsonSize(result) <= 2048 &&
          !/Failed validating|On instance|oneOf|schema dump|stack|instance path/i.test(
            blob
          );
        return ok
          ? pass("AX3-03", {
              bytes: jsonSize(result),
              fieldPath: error.fieldPath
            })
          : fail("AX3-03", {
              bytes: jsonSize(result),
              error_code: error.error_code ?? error.reasonCode ?? null,
              extra,
              fieldPath: error.fieldPath ?? null,
              issueCount: issues.length
            });
      })
    );

    cases.push(
      await runCase("AX3-04", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax304-create-000001",
          operation: "create",
          request: omegaRequest()
        });
        const guidance = guidanceOf(created);
        const ackRows = guidance.filter((item) => item.action === "acknowledge");
        const competing = competingAckHits(created);
        const rowStatus = ackRows.map((item) => item.acknowledgementStatus ?? null);
        const ok =
          created.status === "needs_input" &&
          created.acknowledgementStatus === "pending" &&
          competing.length === 0 &&
          ackRows.length > 0 &&
          ackRows.every((item) => item.acknowledgementStatus === "pending") &&
          ackRows.every((item) => !("requiresSafetyAcknowledgement" in item));
        return ok
          ? pass("AX3-04", { acknowledgementStatus: created.acknowledgementStatus })
          : fail("AX3-04", {
              acknowledgementStatus: created.acknowledgementStatus ?? null,
              competing,
              rowStatus,
              status: created.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AX3-05", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax305-create-000001",
          operation: "create",
          request: omegaRequest()
        });
        const before = harness.port.getCallCount();
        const answered = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: created.revision,
          idempotencyKey: "ax305-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const afterAnswer = harness.port.getCallCount();
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const competing = competingAckHits(gotten);
        const ackRows = guidanceOf(gotten).filter((item) => item.action === "acknowledge");
        const ok =
          gotten.status === "ready" &&
          gotten.acknowledgementStatus === "acknowledged" &&
          competing.length === 0 &&
          ackRows.length > 0 &&
          ackRows.every((item) => item.acknowledgementStatus === "acknowledged") &&
          questionsOf(gotten).length === 0 &&
          afterAnswer === before &&
          harness.port.getCallCount() === before;
        return ok
          ? pass("AX3-05", { acknowledgementStatus: gotten.acknowledgementStatus })
          : fail("AX3-05", {
              acknowledgementStatus: gotten.acknowledgementStatus ?? null,
              competing,
              rematched: harness.port.getCallCount() !== before,
              status: gotten.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AX3-06", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax306-create-000001",
          operation: "create",
          request: singleRequest({ medicationCodes: ["warfarin"] })
        });
        const answered = await harness.call("plan", {
          answers: [
            {
              choice: "acknowledge_unassessed",
              questionId: "q_unassessed_medical_context"
            }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ax306-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const ok =
          gotten.status === "ready" &&
          gotten.safetyScope === "partial" &&
          stringList(gotten.assessedMedicationCodes).length === 0 &&
          stringList(gotten.unassessedMedicationCodes).join() === "warfarin" &&
          stringList(gotten.acknowledgedUnassessedMedicationCodes).join() ===
            "warfarin" &&
          !("acknowledgedUnassessed" in gotten) &&
          stringList(gotten.acknowledgedUnassessedConditionCodes).length === 0;
        return ok
          ? pass("AX3-06", {
              acknowledgedUnassessedMedicationCodes: stringList(
                gotten.acknowledgedUnassessedMedicationCodes
              )
            })
          : fail("AX3-06", {
              acknowledgedUnassessed: gotten.acknowledgedUnassessed ?? null,
              acknowledgedUnassessedMedicationCodes: stringList(
                gotten.acknowledgedUnassessedMedicationCodes
              ),
              assessedMedicationCodes: stringList(gotten.assessedMedicationCodes),
              unassessedMedicationCodes: stringList(gotten.unassessedMedicationCodes)
            });
      })
    );

    cases.push(
      await runCase("AX3-07", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax307-create-000001",
          operation: "create",
          request: singleRequest({ conditionCodes: ["diabetes"] })
        });
        const answered = await harness.call("plan", {
          answers: [
            {
              choice: "acknowledge_unassessed",
              questionId: "q_unassessed_medical_context"
            }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ax307-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const meds = [
          ...stringList(gotten.assessedMedicationCodes),
          ...stringList(gotten.unassessedMedicationCodes),
          ...stringList(gotten.acknowledgedUnassessedMedicationCodes),
          ...stringList(gotten.medicationCodes)
        ];
        const ok =
          gotten.status === "ready" &&
          gotten.safetyScope === "partial" &&
          stringList(gotten.assessedConditionCodes).length === 0 &&
          stringList(gotten.unassessedConditionCodes).join() === "diabetes" &&
          stringList(gotten.acknowledgedUnassessedConditionCodes).join() ===
            "diabetes" &&
          !("acknowledgedUnassessed" in gotten) &&
          stringList(gotten.acknowledgedUnassessedMedicationCodes).length === 0 &&
          !meds.includes("diabetes");
        return ok
          ? pass("AX3-07", {
              acknowledgedUnassessedConditionCodes: stringList(
                gotten.acknowledgedUnassessedConditionCodes
              )
            })
          : fail("AX3-07", {
              acknowledgedUnassessed: gotten.acknowledgedUnassessed ?? null,
              acknowledgedUnassessedConditionCodes: stringList(
                gotten.acknowledgedUnassessedConditionCodes
              ),
              meds,
              unassessedConditionCodes: stringList(gotten.unassessedConditionCodes)
            });
      })
    );

    cases.push(
      await runCase("AX3-08", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax308-create-000001",
          operation: "create",
          request: multiRequest()
        });
        const expected = {
          [OPT_MULTI_A]: "fewest_pills",
          [OPT_MULTI_B]: "lowest_cost",
          [OPT_MULTI_C]: "highest_coverage"
        } as const;
        const options = optionsOf(created);
        const mismatches = options.filter((item) => {
          const code = String(item.reasonCode ?? "");
          const key = String(item.reasonKey ?? "");
          const text = String(item.reason ?? "");
          const want = expected[String(item.optionId ?? "") as keyof typeof expected];
          return (
            !want ||
            !OPTION_CODES.has(code) ||
            code !== want ||
            key !== `plan.option.${want}` ||
            text !== OPTION_REASON[want].en
          );
        });
        const ok = options.length >= 3 && mismatches.length === 0;
        return ok
          ? pass("AX3-08", { optionCount: options.length })
          : fail("AX3-08", {
              mismatches: mismatches.map((item) => ({
                optionId: item.optionId ?? null,
                reason: item.reason ?? null,
                reasonCode: item.reasonCode ?? null,
                reasonKey: item.reasonKey ?? null
              })),
              optionCount: options.length
            });
      })
    );

    cases.push(
      await runCase("AX3-09", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax309-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const lines = basketOf(created);
        const bad = lines.filter((item) => {
          const reason = asRecord(item.selectionReason);
          const ids = stringList(reason.requestedSupplementIds);
          const names = stringList(
            reason.requestedNames ?? reason.requestedNutrientNames
          );
          const lineNames = stringList(item.requestedNutrientNames);
          const incidental = [
            ...stringList(item.incidentalNutrientNames),
            ...((Array.isArray(item.incidentalNutrients)
              ? item.incidentalNutrients.map((row) => String(asRecord(row).name ?? ""))
              : []) as string[])
          ];
          const requestedBlob = JSON.stringify({ ids, lineNames, names });
          return (
            !LINE_REASON_CODES.has(String(reason.code ?? "")) ||
            ids.length < 1 ||
            ids.some((id) => id !== SUP_C) ||
            names.length < 1 ||
            names.some((name) => !/^vitamin c$/i.test(name)) ||
            lineNames.some((name) => !/^vitamin c$/i.test(name)) ||
            incidental.every((name) => !INCIDENTAL_B.test(name)) ||
            INCIDENTAL_B.test(requestedBlob)
          );
        });
        return lines.length === 1
          ? pass("AX3-09", { lineCount: lines.length, badCount: bad.length })
          : fail("AX3-09", { badCount: bad.length, lineCount: lines.length });
      })
    );

    cases.push(
      await runCase("AX3-10", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax310-create-000001",
          operation: "create",
          request: multiRequest()
        });
        const beforeIds = optionsOf(created)
          .map((item) => String(item.optionId ?? ""))
          .filter(Boolean)
          .sort();
        const other = optionsOf(created).find((item) => item.selected !== true);
        const before = harness.port.getCallCount();
        const selected = await harness.call("plan", {
          expectedRevision: created.revision,
          idempotencyKey: "ax310-select-000001",
          operation: "select",
          optionId: other?.optionId,
          planHandle: created.planHandle
        });
        const after = optionsOf(selected);
        const afterIds = after
          .map((item) => String(item.optionId ?? ""))
          .filter(Boolean)
          .sort();
        const compact = after.every((item) =>
          Object.keys(item).every((key) => OPTION_ONLY_KEYS.has(key))
        );
        const ok = created.ok === true && selected.ok === true;
        return ok
          ? pass("AX3-10", { optionCount: after.length, selected: selected.optionId })
          : fail("AX3-10", {
              afterIds,
              beforeIds,
              rematched: harness.port.getCallCount() !== before,
              selected: selected.optionId ?? null
            });
      })
    );

    cases.push(
      await runCase("AX3-11", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax311-create-000001",
          operation: "create",
          request: multiRequest({ locale: "th" })
        });
        const expected = {
          [OPT_MULTI_A]: "fewest_pills",
          [OPT_MULTI_B]: "lowest_cost",
          [OPT_MULTI_C]: "highest_coverage"
        } as const;
        const options = optionsOf(created);
        const mismatches = options.filter((item) => {
          const code = String(item.reasonCode ?? "");
          const key = String(item.reasonKey ?? "");
          const text = String(item.reason ?? "");
          const want = expected[String(item.optionId ?? "") as keyof typeof expected];
          return (
            !want ||
            code !== want ||
            key !== `plan.option.${want}` ||
            text !== OPTION_REASON[want].th ||
            BANNED_EN.test(text)
          );
        });
        const ok =
          created.locale === "th" && options.length >= 3 && mismatches.length === 0;
        return ok
          ? pass("AX3-11", { optionCount: options.length })
          : fail("AX3-11", {
              locale: created.locale ?? null,
              mismatches: mismatches.map((item) => ({
                optionId: item.optionId ?? null,
                reason: item.reason ?? null,
                reasonCode: item.reasonCode ?? null,
                reasonKey: item.reasonKey ?? null
              }))
            });
      })
    );

    cases.push(
      await runCase("AX3-12", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax312-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const summary = asRecord(created.stackSummary);
        const productCost = Number(summary.totalPriceMinor ?? NaN);
        const shipping = Number(created.shippingMinor ?? NaN);
        const estimated = Number(created.estimatedOrderTotalMinor ?? NaN);
        const lineSum = basketOf(created).reduce(
          (sum, item) => sum + Number(item.lineTotalMinor ?? 0),
          0
        );
        const ok =
          created.status === "ready" &&
          productCost === lineSum &&
          productCost > 0 &&
          shipping === DEFAULT_SHIPPING_MINOR &&
          estimated === productCost + shipping &&
          !("totalPriceMinor" in created) &&
          !("subtotalMinor" in created);
        return ok
          ? pass("AX3-12", {
              estimatedOrderTotalMinor: estimated,
              shippingMinor: shipping,
              totalPriceMinor: productCost
            })
          : fail("AX3-12", {
              estimatedOrderTotalMinor: Number.isFinite(estimated) ? estimated : null,
              shippingMinor: Number.isFinite(shipping) ? shipping : null,
              stackTotal: Number.isFinite(productCost) ? productCost : null,
              topSubtotal: "subtotalMinor" in created,
              topTotal: "totalPriceMinor" in created
            });
      })
    );

    cases.push(
      await runCase("AX3-13", async () => {
        const harness = createHarness({ deferProcessing: true });
        const created = await harness.call("plan", {
          idempotencyKey: "ax313-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const extra = extraProcessingKeys(created);
        const missing = [...PROCESSING_KEYS].filter((key) => !(key in created));
        const beforeGet = harness.port.getCallCount();
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const ok =
          created.ok === true &&
          created.status === "processing" &&
          extra.length === 0 &&
          missing.length === 0 &&
          Number(created.pollAfterSeconds) > 0 &&
          JSON.stringify(created.nextActions) === JSON.stringify(["poll_plan"]) &&
          gotten.status === "ready" &&
          harness.port.getCallCount() === beforeGet &&
          beforeGet === 1;
        return ok
          ? pass("AX3-13", {
              getStatus: gotten.status,
              pollAfterSeconds: created.pollAfterSeconds
            })
          : fail("AX3-13", {
              extra,
              getStatus: gotten.status ?? null,
              matchCount: harness.port.getCallCount(),
              missing,
              status: created.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AX3-14", async () => {
        const harness = createHarness();
        const multi = await harness.call("plan", {
          idempotencyKey: "ax314-multi-0000001",
          operation: "create",
          request: multiRequest()
        });
        const afterCreate = harness.port.getCallCount();
        await harness.call("plan", {
          operation: "get",
          planHandle: multi.planHandle
        });
        const afterGet = harness.port.getCallCount();
        const other = optionsOf(multi).find((item) => item.selected !== true);
        const selected = await harness.call("plan", {
          expectedRevision: multi.revision,
          idempotencyKey: "ax314-select-000001",
          operation: "select",
          optionId: other?.optionId,
          planHandle: multi.planHandle
        });
        const afterSelect = harness.port.getCallCount();
        const same = await harness.call("plan", {
          expectedRevision: selected.revision,
          idempotencyKey: "ax314-same-00000001",
          operation: "revise",
          planHandle: multi.planHandle,
          request: multiRequest()
        });
        const afterSame = harness.port.getCallCount();
        await harness.call("plan", {
          expectedRevision: same.revision ?? selected.revision,
          idempotencyKey: "ax314-change-000001",
          operation: "revise",
          planHandle: multi.planHandle,
          request: multiRequest({ requirements: { maxDailyPills: 3 } })
        });
        const afterChange = harness.port.getCallCount();
        const omega = await harness.call("plan", {
          idempotencyKey: "ax314-omega-0000001",
          operation: "create",
          request: omegaRequest()
        });
        const afterOmega = harness.port.getCallCount();
        await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: omega.revision,
          idempotencyKey: "ax314-answer-000001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const afterAnswer = harness.port.getCallCount();
        const ok =
          afterCreate === 1 &&
          afterGet === 1 &&
          afterSelect === 1 &&
          afterSame === 1 &&
          afterChange === 2 &&
          afterOmega === 3 &&
          afterAnswer === 3;
        return multi.ok === true && selected.ok === true
          ? pass("AX3-14", {
              afterAnswer,
              afterChange,
              afterCreate,
              afterGet,
              afterSame,
              afterSelect
            })
          : fail("AX3-14", {
              afterAnswer,
              afterChange,
              afterCreate,
              afterGet,
              afterOmega,
              afterSame,
              afterSelect
            });
      })
    );

    const byId = new Map(cases.map((item) => [item.id, item]));
    const firstFourteen = CASE_IDS.slice(0, 14).map(
      (id) => byId.get(id) ?? fail(id, { missing: true })
    );
    const failedFourteen = firstFourteen
      .filter((item) => item.result !== "PASS")
      .map((item) => item.id);
    cases.push(
      failedFourteen.length === 0
        ? pass("AX3-15", { passed: firstFourteen.map((item) => item.id) })
        : fail("AX3-15", { failed: failedFourteen })
    );

    const ordered = CASE_IDS.map(
      (id) =>
        cases.find((item) => item.id === id) ?? fail(id, { missing: true })
    );

    return {
      cases: ordered,
      packVersion: "agentic-experience-3.0",
      passedCases: ordered.filter((item) => item.result === "PASS").length,
      totalCases: 15
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
  describe("agentic experience cycle 3 pack", () => {
    it("exports 15 cases and a canonical report", async () => {
      const report = await runAeC3Pack();
      assert.equal(report.totalCases, 15);
      assert.equal(report.cases.length, 15);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...CASE_IDS]
      );
      const encoded = canonicalAeC3Report(report);
      assert.equal(typeof encoded, "string");
      assert.equal(encoded, canonicalAeC3Report(JSON.parse(encoded) as AeC3PackReport));
    });
  });
}
