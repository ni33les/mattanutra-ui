import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginDeterministicIdsForTests,
  endDeterministicIdsForTests
} from "../lib/agentic/capabilities.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
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
  "AX2-01",
  "AX2-02",
  "AX2-03",
  "AX2-04",
  "AX2-05",
  "AX2-06",
  "AX2-07",
  "AX2-08",
  "AX2-09",
  "AX2-10",
  "AX2-11",
  "AX2-12",
  "AX2-13"
] as const;

const SUP_C = "sup_ae_vitamin_c";
const SUP_D3 = "sup_ae_vitamin_d3";
const SUP_OMEGA = "sup_ae_omega3";
const SUP_B6 = "sup_ae_vitamin_b6";
const SUP_B12 = "sup_ae_vitamin_b12";
const PRD_C = "prd_ae_c500";
const PRD_INC = "prd_ae_c_incidental";
const PRD_D3_A = "prd_ae_d3_600";
const PRD_D3_B = "prd_ae_d3_1200";
const PRD_OMEGA = "prd_ae_omega";
const PRD_MULTI_A = "prd_ae_multi_a";
const PRD_MULTI_B = "prd_ae_multi_b";
const PRD_MULTI_C = "prd_ae_multi_c";
const OPT_SINGLE = "opt_ae_single";
const OPT_MULTI_A = "opt_ae_multi_a";
const OPT_MULTI_B = "opt_ae_multi_b";
const OPT_MULTI_C = "opt_ae_multi_c";
const OPT_D3 = "opt_ae_d3";
const OPT_OMEGA = "opt_ae_omega";
const OPT_INC = "opt_ae_incidental";
const OPT_TWO_INFO = "opt_ae_two_info";

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

const THAI_COPY = {
  choice: "ยืนยันข้อมูลความปลอดภัย",
  optionReason: "ตัวเลือกที่ใช้ได้ดีที่สุด",
  productReason: "สินค้านี้ให้ Omega-3 1104 mg ต่อวัน",
  question: "ตรวจทานข้อมูลความปลอดภัยแล้วยืนยันกับผู้ใช้ก่อน",
  safety: "โอเมกา 3 จากสินค้าที่เลือกมีปฏิกิริยากับยาที่แจ้งไว้",
  summary: "สูตรพร้อมแล้ว โปรดยืนยันกับผู้ใช้ก่อน"
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
  "rejected",
  "searchDeadlineMs",
  "searchMs",
  "serializeMs",
  "targetClassifications",
  "targetFrontiers",
  "targetSetHash"
]);

const ACK_STATUS = new Set(["acknowledged", "not_required", "pending"]);
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
const BANNED_TH = /ชำระเงิน|คำสั่งซื้อ/;
const BANNED_INFO_MSG = /acknowledge|continue|confirm to proceed|execute/i;
const INCIDENTAL_B = /vitamin b|b6|b12|pyridoxine|cobalamin/i;

export type AeC2CaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AeC2PackReport = Readonly<{
  cases: readonly AeC2CaseResult[];
  packVersion: "agentic-experience-2.0";
  passedCases: number;
  totalCases: 13;
}>;

function sortedKeys(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]])
  );
}

function pass(id: string, evidence: Record<string, unknown>): AeC2CaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: string, evidence: Record<string, unknown>): AeC2CaseResult {
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

function bannedDiagnosticHits(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      bannedDiagnosticHits(item, `${path}[${index}]`)
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const next = path ? `${path}.${key}` : key;
    return BANNED_DIAGNOSTIC_KEYS.has(key)
      ? [next]
      : bannedDiagnosticHits(child, next);
  });
}

function basketItem(
  input: Readonly<{
    dailyPills: number;
    daysOfSupply: number;
    incidental?: readonly { amount: number; name: string; unit: "mg" | "mcg" }[];
    lineTotalMinor: number;
    locale: string;
    productId: string;
    productName: string;
    requestedNames?: readonly string[];
    supplementIds: readonly string[];
  }>
): BasketItem {
  const incidental = input.incidental ?? [];
  return {
    availabilityAsOf: FIXED_NOW,
    contributionSupplementIds: [...input.supplementIds],
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
    requestedNutrientNames: [...(input.requestedNames ?? ["Vitamin C"])],
    retailerSku: `sku_${input.productId}`,
    selectionReason: {
      code: "covers_target",
      message:
        input.locale === "th"
          ? THAI_COPY.productReason
          : "This product covers a requested nutrient.",
      messageKey: "plan.selection.covers_target",
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
    status: delivered >= 1800 ? "partial" : "partial",
    supplementId: SUP_D3,
    totalExposureAmount: delivered,
    unit: "IU",
    upperLimitAmount: 4000
  });
}

function singleOption(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      lineTotalMinor: 15900,
      locale,
      productId: PRD_C,
      productName: "Vitamin C 500",
      supplementIds: [SUP_C]
    })
  ];
  return stackOption(
    OPT_SINGLE,
    basket,
    [cCoverage(500, PRD_C, "Vitamin C 500")],
    OPTION_REASON.fewest_pills[locale === "th" ? "th" : "en"]
  );
}

function incidentalOption(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      incidental: [
        { amount: 2, name: "Vitamin B6", unit: "mg" },
        { amount: 6, name: "Vitamin B12", unit: "mcg" }
      ],
      lineTotalMinor: 18900,
      locale,
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
    OPTION_REASON.fewest_pills[locale === "th" ? "th" : "en"]
  );
}

function d3Option(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      lineTotalMinor: 9000,
      locale,
      productId: PRD_D3_A,
      productName: "Vitamin D3 600",
      requestedNames: ["Vitamin D3"],
      supplementIds: [SUP_D3]
    }),
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      lineTotalMinor: 11000,
      locale,
      productId: PRD_D3_B,
      productName: "Vitamin D3 1200",
      requestedNames: ["Vitamin D3"],
      supplementIds: [SUP_D3]
    })
  ];
  return stackOption(
    OPT_D3,
    basket,
    [
      d3Coverage([
        { amount: 600, productId: PRD_D3_A, productName: "Vitamin D3 600" },
        { amount: 1200, productId: PRD_D3_B, productName: "Vitamin D3 1200" }
      ])
    ],
    OPTION_REASON.fewest_pills[locale === "th" ? "th" : "en"]
  );
}

function omegaOption(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      lineTotalMinor: 22000,
      locale,
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
    OPTION_REASON.fewest_pills[locale === "th" ? "th" : "en"]
  );
}

function twoInfoOption(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      lineTotalMinor: 14000,
      locale,
      productId: PRD_D3_A,
      productName: "C+D3 A",
      requestedNames: ["Vitamin C", "Vitamin D3"],
      supplementIds: [SUP_C, SUP_D3]
    }),
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      lineTotalMinor: 16000,
      locale,
      productId: PRD_D3_B,
      productName: "C+D3 B",
      requestedNames: ["Vitamin C", "Vitamin D3"],
      supplementIds: [SUP_C, SUP_D3]
    })
  ];
  return stackOption(
    OPT_TWO_INFO,
    basket,
    [
      coverage({
        contributors: [
          {
            amount: 200,
            productId: PRD_D3_A,
            productName: "C+D3 A",
            source: "selected",
            unit: "mg"
          },
          {
            amount: 300,
            productId: PRD_D3_B,
            productName: "C+D3 B",
            source: "selected",
            unit: "mg"
          }
        ],
        coveragePercent: 100,
        currentAmount: 0,
        deliveredAmount: 500,
        name: "Vitamin C",
        percentOfUpperLimit: null,
        remainingGap: 0,
        requestedAmount: 500,
        status: "covered",
        supplementId: SUP_C,
        totalExposureAmount: 500,
        unit: "mg",
        upperLimitAmount: null
      }),
      d3Coverage([
        { amount: 600, productId: PRD_D3_A, productName: "C+D3 A" },
        { amount: 1200, productId: PRD_D3_B, productName: "C+D3 B" }
      ])
    ],
    OPTION_REASON.fewest_pills[locale === "th" ? "th" : "en"]
  );
}

function multiOptions(locale: string) {
  const lang = locale === "th" ? "th" : "en";
  const selected = stackOption(
    OPT_MULTI_A,
    [
      basketItem({
        dailyPills: 2,
        daysOfSupply: 30,
        lineTotalMinor: 50000,
        locale,
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
    OPTION_REASON.fewest_pills[lang]
  );
  const cheaper = stackOption(
    OPT_MULTI_B,
    [
      basketItem({
        dailyPills: 4,
        daysOfSupply: 30,
        lineTotalMinor: 30000,
        locale,
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
    OPTION_REASON.lowest_cost[lang]
  );
  const richer = stackOption(
    OPT_MULTI_C,
    [
      basketItem({
        dailyPills: 3,
        daysOfSupply: 30,
        lineTotalMinor: 70000,
        locale,
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
    OPTION_REASON.highest_coverage[lang]
  );
  return { alternatives: [cheaper, richer], selected };
}

function matchFor(state: CanonicalPlanState) {
  const locale = state.locale || "en";
  const names = state.targets.map((item) => item.name.toLowerCase());
  const hasApixaban = state.medicationCodes.includes("apixaban");
  const hasOmega = names.some((name) => name.includes("omega"));
  const hasC = names.some((name) => name.includes("vitamin c"));
  const hasD3 = names.some((name) => name.includes("vitamin d"));
  const twoInfo =
    hasC && hasD3 && state.optimization === "balanced" && !hasApixaban;
  const incidental = hasC && state.targets.length === 1;
  const onlyD3 = state.targets.length === 1 && hasD3;
  const multi = state.targets.length >= 2 && !twoInfo;

  if (hasApixaban && hasOmega) {
    return { alternatives: [], leftovers: [], selected: omegaOption(locale) };
  }

  if (onlyD3) {
    return { alternatives: [], leftovers: [], selected: d3Option(locale) };
  }

  if (twoInfo) {
    return { alternatives: [], leftovers: [], selected: twoInfoOption(locale) };
  }

  if (multi) {
    const packed = multiOptions(locale);
    return { alternatives: packed.alternatives, leftovers: [], selected: packed.selected };
  }

  if (incidental) {
    return { alternatives: [], leftovers: [], selected: incidentalOption(locale) };
  }

  return { alternatives: [], leftovers: [], selected: singleOption(locale) };
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

function d3Request() {
  return singleRequest({
    targets: [{ amount: 2000, name: "Vitamin D3", supplementId: SUP_D3, unit: "IU" }]
  });
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

function createHarness(): Harness {
  const port = createCountingMatchPort(matchFor);
  const runtime = createAgenticRuntime({
    config: loadAgenticConfig(),
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

function ackUnassessed(value: Record<string, unknown>) {
  if (Array.isArray(value.acknowledgedUnassessed)) {
    return stringList(value.acknowledgedUnassessed);
  }

  return [
    ...stringList(value.acknowledgedUnassessedMedicationCodes),
    ...stringList(value.acknowledgedUnassessedConditionCodes)
  ];
}

function pendingBoolean(value: Record<string, unknown>) {
  return (
    "requiresSafetyAcknowledgement" in value ||
    typeof value.pending === "boolean" ||
    typeof value.acknowledgementRequired === "boolean"
  );
}

async function runCase(
  id: string,
  work: () => Promise<AeC2CaseResult>
): Promise<AeC2CaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function canonicalAeC2Report(report: AeC2PackReport) {
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

export async function runAeC2Pack(): Promise<AeC2PackReport> {
  const previousCeilings = matcherSafetyCeilings();
  beginDeterministicIdsForTests();
  setMatcherSafetyCeilings([]);
  setAgenticRuntimeForTests(null);

  try {
    const cases: AeC2CaseResult[] = [];

    cases.push(
      await runCase("AX2-01", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax201-create-000001",
          operation: "create",
          request: singleRequest({ medicationCodes: ["warfarin"] })
        });
        const createdOk =
          created.status === "needs_input" &&
          created.safetyScope === "partial" &&
          stringList(created.assessedMedicationCodes).length === 0 &&
          stringList(created.unassessedMedicationCodes).join() === "warfarin" &&
          questionsOf(created).some(
            (item) => item.promptKey === "plan.question.unassessed_medical_context"
          );
        const before = harness.port.getCallCount();
        const answered = await harness.call("plan", {
          answers: [
            {
              choice: "acknowledge_unassessed",
              questionId: "q_unassessed_medical_context"
            }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ax201-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const next = nextActionsOf(gotten);
        const ok =
          createdOk &&
          gotten.status === "ready" &&
          gotten.safetyScope === "partial" &&
          stringList(gotten.assessedMedicationCodes).length === 0 &&
          stringList(gotten.unassessedMedicationCodes).join() === "warfarin" &&
          ackUnassessed(gotten).join() === "warfarin" &&
          questionsOf(gotten).length === 0 &&
          next.includes("confirm_with_user") &&
          !next.some((item) => /execute/i.test(item)) &&
          gotten.planHandle === created.planHandle &&
          gotten.optionId === created.optionId &&
          gotten.revision === Number(created.revision) + 1 &&
          harness.port.getCallCount() === before;
        return ok
          ? pass("AX2-01", {
              acknowledgedUnassessed: ackUnassessed(gotten),
              safetyScope: gotten.safetyScope
            })
          : fail("AX2-01", {
              acknowledgedUnassessed: ackUnassessed(gotten),
              assessedMedicationCodes: stringList(gotten.assessedMedicationCodes),
              createdOk,
              rematched: harness.port.getCallCount() !== before,
              safetyScope: gotten.safetyScope ?? null,
              status: gotten.status ?? null,
              unassessedMedicationCodes: stringList(gotten.unassessedMedicationCodes)
            });
      })
    );

    cases.push(
      await runCase("AX2-02", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax202-create-000001",
          operation: "create",
          request: singleRequest({ conditionCodes: ["diabetes"] })
        });
        const createdOk =
          created.status === "needs_input" &&
          created.safetyScope === "partial" &&
          stringList(created.assessedConditionCodes).length === 0 &&
          stringList(created.unassessedConditionCodes).join() === "diabetes" &&
          questionsOf(created).some(
            (item) => item.promptKey === "plan.question.unassessed_medical_context"
          );
        const before = harness.port.getCallCount();
        await harness.call("plan", {
          answers: [
            {
              choice: "acknowledge_unassessed",
              questionId: "q_unassessed_medical_context"
            }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ax202-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const next = nextActionsOf(gotten);
        const ok =
          createdOk &&
          gotten.status === "ready" &&
          gotten.safetyScope === "partial" &&
          stringList(gotten.assessedConditionCodes).length === 0 &&
          stringList(gotten.unassessedConditionCodes).join() === "diabetes" &&
          ackUnassessed(gotten).join() === "diabetes" &&
          questionsOf(gotten).length === 0 &&
          next.includes("confirm_with_user") &&
          !next.some((item) => /execute/i.test(item)) &&
          gotten.planHandle === created.planHandle &&
          gotten.optionId === created.optionId &&
          gotten.revision === Number(created.revision) + 1 &&
          harness.port.getCallCount() === before;
        return ok
          ? pass("AX2-02", {
              acknowledgedUnassessed: ackUnassessed(gotten),
              safetyScope: gotten.safetyScope
            })
          : fail("AX2-02", {
              acknowledgedUnassessed: ackUnassessed(gotten),
              assessedConditionCodes: stringList(gotten.assessedConditionCodes),
              createdOk,
              rematched: harness.port.getCallCount() !== before,
              safetyScope: gotten.safetyScope ?? null,
              status: gotten.status ?? null,
              unassessedConditionCodes: stringList(gotten.unassessedConditionCodes)
            });
      })
    );

    cases.push(
      await runCase("AX2-03", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax203-create-000001",
          operation: "create",
          request: omegaRequest()
        });
        const beforeIds = guidanceOf(created).map((item) => String(item.guidanceId ?? ""));
        const before = harness.port.getCallCount();
        const answered = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: created.revision,
          idempotencyKey: "ax203-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const messages = guidanceOf(gotten).map((item) => String(item.message ?? ""));
        const ok =
          created.acknowledgementStatus === "pending" &&
          ACK_STATUS.has(String(created.acknowledgementStatus)) &&
          gotten.status === "ready" &&
          gotten.safetyScope === "complete" &&
          stringList(gotten.assessedMedicationCodes).join() === "apixaban" &&
          gotten.acknowledgementStatus === "acknowledged" &&
          !pendingBoolean(gotten) &&
          questionsOf(gotten).length === 0 &&
          nextActionsOf(gotten).includes("confirm_with_user") &&
          guidanceOf(gotten).length === beforeIds.filter(Boolean).length &&
          beforeIds.every((id) =>
            guidanceOf(gotten).some((item) => item.guidanceId === id)
          ) &&
          messages.every((text) => !BANNED_INFO_MSG.test(text)) &&
          gotten.planHandle === created.planHandle &&
          gotten.optionId === created.optionId &&
          gotten.revision === Number(created.revision) + 1 &&
          harness.port.getCallCount() === before;
        return ok
          ? pass("AX2-03", { acknowledgementStatus: gotten.acknowledgementStatus })
          : fail("AX2-03", {
              acknowledgementStatus: gotten.acknowledgementStatus ?? null,
              createdStatus: created.acknowledgementStatus ?? null,
              pendingBoolean: pendingBoolean(gotten),
              rematched: harness.port.getCallCount() !== before,
              status: gotten.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AX2-04", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax204-create-000001",
          operation: "create",
          request: d3Request()
        });
        const guidance = guidanceOf(created);
        const informational = guidance.filter(
          (item) => item.severity === "info" || item.action === "review"
        );
        const blocking = guidance.filter(
          (item) =>
            item.severity === "high" ||
            item.severity === "blocking" ||
            item.action === "acknowledge"
        );
        const messages = guidance.map((item) => String(item.message ?? ""));
        const keys = guidance.map((item) => String(item.messageKey ?? ""));
        const ok =
          created.status === "ready" &&
          questionsOf(created).length === 0 &&
          created.acknowledgementStatus === "not_required" &&
          blocking.length === 0 &&
          informational.length > 0 &&
          nextActionsOf(created).includes("confirm_with_user") &&
          messages.every((text) => !BANNED_INFO_MSG.test(text)) &&
          keys.every(
            (key) =>
              /informational|overlap_info|info_overlap/i.test(key) &&
              !/acknowledge|ack/i.test(key)
          );
        return ok
          ? pass("AX2-04", { acknowledgementStatus: created.acknowledgementStatus })
          : fail("AX2-04", {
              acknowledgementStatus: created.acknowledgementStatus ?? null,
              keys,
              questionCount: questionsOf(created).length,
              status: created.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AX2-05", async () => {
        const harness = createHarness();
        const info = await harness.call("info", {});
        const keys = Object.keys(info);
        const countries = Array.isArray(info.supportedCountries)
          ? info.supportedCountries.map(asRecord)
          : [];
        const currencies = [
          ...new Set(
            countries
              .map((item) => String(item.currency ?? "").trim())
              .filter(Boolean)
          )
        ];
        const ok =
          info.ok === true &&
          jsonSize(info) <= 4096 &&
          countries.length > 0 &&
          currencies.length > 0 &&
          stringList(info.supportedLocales).includes("en") &&
          info.userAccountRequired === false &&
          info.continuation === "polling_only" &&
          Number(info.pollAfterSeconds) > 0 &&
          stringList(info.medicationCodes).includes("apixaban") &&
          stringList(info.conditionCodes).includes("ckd") &&
          !keys.includes("recognisedNames") &&
          !keys.includes("latency") &&
          keys.includes("schemaChecksum") &&
          String(info.schemaChecksum).length === 64 &&
          keys.includes("buildId") &&
          String(info.buildId).length === 40 &&
          !keys.includes("migrationVersion") &&
          !keys.includes("checkoutBuild") &&
          bannedDiagnosticHits(info).length === 0;
        return ok
          ? pass("AX2-05", { bytes: jsonSize(info), currencies })
          : fail("AX2-05", {
              bytes: jsonSize(info),
              currencies,
              keys: keys.sort()
            });
      })
    );

    cases.push(
      await runCase("AX2-06", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax206-create-000001",
          operation: "create",
          request: omegaRequest()
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const answered = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: created.revision,
          idempotencyKey: "ax206-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const multi = await harness.call("plan", {
          idempotencyKey: "ax206-multi-0000001",
          operation: "create",
          request: multiRequest()
        });
        const selectedAlt = optionsOf(multi).find((item) => item.selected !== true);
        const selected = await harness.call("plan", {
          expectedRevision: multi.revision,
          idempotencyKey: "ax206-select-000001",
          operation: "select",
          optionId: selectedAlt?.optionId,
          planHandle: multi.planHandle
        });
        const revised = await harness.call("plan", {
          expectedRevision: selected.revision ?? multi.revision,
          idempotencyKey: "ax206-revise-000001",
          operation: "revise",
          planHandle: multi.planHandle,
          request: multiRequest({ requirements: { maxDailyPills: 3 } })
        });
        const singleHits = [created, gotten, answered].flatMap((item) =>
          bannedDiagnosticHits(item)
        );
        const multiHits = [multi, selected, revised].flatMap((item) =>
          bannedDiagnosticHits(item)
        );
        const sizesOk =
          jsonSize(created) <= 8192 &&
          jsonSize(answered) <= 8192 &&
          jsonSize(gotten) <= 8192 &&
          jsonSize(multi) <= 16384 &&
          jsonSize(selected) <= 16384 &&
          jsonSize(revised) <= 16384;
        const ok = singleHits.length === 0 && multiHits.length === 0 && sizesOk;
        return ok
          ? pass("AX2-06", { createBytes: jsonSize(created), multiBytes: jsonSize(multi) })
          : fail("AX2-06", {
              createBytes: jsonSize(created),
              multiBytes: jsonSize(multi),
              multiHits: multiHits.slice(0, 8),
              singleHits: singleHits.slice(0, 8)
            });
      })
    );

    cases.push(
      await runCase("AX2-07", async () => {
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
          !/Failed validating|On instance|oneOf|schema dump|stack|instance path/i.test(blob);
        return ok
          ? pass("AX2-07", { bytes: jsonSize(result), paths })
          : fail("AX2-07", {
              bytes: jsonSize(result),
              error_code: error.error_code ?? error.reasonCode ?? null,
              paths
            });
      })
    );

    cases.push(
      await runCase("AX2-08", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax208-create-000001",
          operation: "create",
          request: multiRequest()
        });
        const options = Array.isArray(created.options)
          ? created.options.map(asRecord)
          : [];
        const selectedRows = options.filter((item) => item.selected === true);
        const ids = options.map((item) => String(item.optionId ?? ""));
        const compact = options.every((item) =>
          Object.keys(item).every((key) => OPTION_ONLY_KEYS.has(key))
        );
        const unselectedClean = options
          .filter((item) => item.selected !== true)
          .every(
            (item) =>
              !("basket" in item) &&
              !("coverage" in item) &&
              !("safetyGuidance" in item) &&
              !("leftovers" in item)
          );
        const other = options.find((item) => item.selected !== true);
        const before = harness.port.getCallCount();
        const selected = await harness.call("plan", {
          expectedRevision: created.revision,
          idempotencyKey: "ax208-select-000001",
          operation: "select",
          optionId: other?.optionId,
          planHandle: created.planHandle
        });
        const afterOptions = Array.isArray(selected.options)
          ? selected.options.map(asRecord)
          : [];
        const ok =
          !("alternatives" in created) &&
          options.length >= 2 &&
          options.length <= 3 &&
          new Set(ids.filter(Boolean)).size === ids.filter(Boolean).length &&
          selectedRows.length === 1 &&
          compact &&
          unselectedClean &&
          basketOf(created).length > 0 &&
          selected.planHandle === created.planHandle &&
          selected.revision === Number(created.revision) + 1 &&
          selected.optionId === other?.optionId &&
          afterOptions.filter((item) => item.selected === true).length === 1 &&
          afterOptions.some(
            (item) => item.selected === true && item.optionId === other?.optionId
          ) &&
          basketOf(selected).length > 0 &&
          harness.port.getCallCount() === before;
        return ok
          ? pass("AX2-08", { optionCount: options.length, selected: selected.optionId })
          : fail("AX2-08", {
              hasAlternatives: "alternatives" in created,
              hasOptions: Array.isArray(created.options),
              optionCount: options.length,
              rematched: harness.port.getCallCount() !== before,
              selected: selected.optionId ?? null
            });
      })
    );

    cases.push(
      await runCase("AX2-09", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax209-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const requested = new Set([SUP_C]);
        const lines = basketOf(created);
        const bad = lines.filter((item) => {
          const reason = asRecord(item.selectionReason);
          const ids = stringList(reason.requestedSupplementIds);
          const names = stringList(
            reason.requestedNames ?? reason.requestedNutrientNames
          );
          const blob = JSON.stringify(reason);
          return (
            !LINE_REASON_CODES.has(String(reason.code ?? "")) ||
            typeof reason.messageKey !== "string" ||
            !reason.messageKey ||
            typeof reason.message !== "string" ||
            String(reason.message).length > 180 ||
            ids.length < 1 ||
            ids.some((id) => !requested.has(id)) ||
            names.length < 1 ||
            names.some((name) => !/^vitamin c$/i.test(name)) ||
            INCIDENTAL_B.test(blob)
          );
        });
        return lines.length === 1 && bad.length === 0
          ? pass("AX2-09", { lineCount: lines.length })
          : fail("AX2-09", { badCount: bad.length, lineCount: lines.length });
      })
    );

    cases.push(
      await runCase("AX2-10", async () => {
        const harness = createHarness();
        const en = await harness.call("plan", {
          idempotencyKey: "ax210-create-en-0001",
          operation: "create",
          request: multiRequest()
        });
        const th = await harness.call("plan", {
          idempotencyKey: "ax210-create-th-0001",
          operation: "create",
          request: multiRequest({ locale: "th" })
        });
        const expected = {
          [OPT_MULTI_A]: "fewest_pills",
          [OPT_MULTI_B]: "lowest_cost",
          [OPT_MULTI_C]: "highest_coverage"
        } as const;

        function check(plan: Record<string, unknown>, locale: "en" | "th") {
          const options = optionsOf(plan);
          const selected = options.find((item) => item.selected === true) ?? options[0];
          const selectedPrice = Number(asRecord(selected?.stackSummary).totalPriceMinor ?? 0);
          const selectedPills = Number(asRecord(selected?.stackSummary).totalDailyPills ?? 0);
          const selectedCoverage = Number(selected?.coveragePercent ?? 0);
          const mismatches = options.filter((item) => {
            const code = String(item.reasonCode ?? "");
            const key = String(item.reasonKey ?? "");
            const text = String(item.reason ?? "");
            const want = expected[String(item.optionId ?? "") as keyof typeof expected];
            const trade = asRecord(item.tradeOffs);
            const priceDelta = Number(trade.priceDeltaMinor ?? 0);
            const pillDelta = Number(trade.pillDelta ?? 0);
            const coverageDelta = Number(trade.coverageDeltaPercent ?? 0);
            const summary = asRecord(item.stackSummary);
            const price = Number(summary.totalPriceMinor ?? 0);
            const pills = Number(summary.totalDailyPills ?? 0);
            const coveragePct = Number(item.coveragePercent ?? 0);
            const signsOk =
              item.optionId === selected?.optionId ||
              (Math.sign(priceDelta) === Math.sign(price - selectedPrice) &&
                Math.sign(pillDelta) === Math.sign(pills - selectedPills) &&
                Math.sign(coverageDelta) === Math.sign(coveragePct - selectedCoverage));
            return (
              !want ||
              !OPTION_CODES.has(code) ||
              code !== want ||
              key !== `plan.option.${want}` ||
              text !== OPTION_REASON[want][locale] ||
              !signsOk
            );
          });
          return { mismatches: mismatches.length, optionCount: options.length };
        }

        const enCheck = check(en, "en");
        const thCheck = check(th, "th");
        const ok =
          enCheck.optionCount >= 3 &&
          thCheck.optionCount >= 3 &&
          enCheck.mismatches === 0 &&
          thCheck.mismatches === 0;
        return ok
          ? pass("AX2-10", { optionCount: enCheck.optionCount })
          : fail("AX2-10", { en: enCheck, th: thCheck });
      })
    );

    cases.push(
      await runCase("AX2-11", async () => {
        async function once() {
          const harness = createHarness();
          return harness.call("plan", {
            idempotencyKey: "ax211-create-000001",
            operation: "create",
            request: multiRequest({ optimization: "balanced" })
          });
        }

        const first = await once();
        const second = await once();
        const items = guidanceOf(first);
        const ids = items.map((item) => String(item.guidanceId ?? ""));
        const listed = stringList(first.guidanceIds);
        const unique = new Set(ids.filter(Boolean));
        const ok =
          items.length === 2 &&
          unique.size === 2 &&
          ids.every((id) => id.length > 0) &&
          listed.join() === ids.join() &&
          JSON.stringify(guidanceOf(second).map((item) => item.guidanceId)) ===
            JSON.stringify(ids);
        return ok
          ? pass("AX2-11", { guidanceIds: ids })
          : fail("AX2-11", {
              first: ids,
              listed,
              second: guidanceOf(second).map((item) => item.guidanceId ?? null)
            });
      })
    );

    cases.push(
      await runCase("AX2-12", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax212-create-000001",
          operation: "create",
          request: omegaRequest({ locale: "th" })
        });
        const questions = questionsOf(created);
        const choices = questions.flatMap((question) =>
          Array.isArray(question.choices) ? question.choices.map(asRecord) : []
        );
        const reasons = basketOf(created).map((item) => asRecord(item.selectionReason));
        const optionText = String(created.reason ?? "");
        const texts = [
          { key: "summary", max: 180, text: String(created.summary ?? ""), messageKey: created.summaryKey },
          { key: "option", max: 180, text: optionText, messageKey: created.reasonKey },
          ...questions.map((question) => ({
            key: "question",
            max: 240,
            text: String(question.prompt ?? ""),
            messageKey: question.promptKey
          })),
          ...choices.map((choice) => ({
            key: "choice",
            max: 160,
            text: String(choice.label ?? ""),
            messageKey: choice.labelKey
          })),
          ...guidanceOf(created).map((item) => ({
            key: "safety",
            max: 360,
            text: String(item.message ?? ""),
            messageKey: item.messageKey
          })),
          ...reasons.map((item) => ({
            key: "selection",
            max: 180,
            text: String(item.message ?? ""),
            messageKey: item.messageKey
          }))
        ];
        const tooLong = texts.filter((item) => item.text.length > item.max);
        const unkeyed = texts.filter(
          (item) => typeof item.messageKey !== "string" || !String(item.messageKey)
        );
        const banned = texts.filter(
          (item) => BANNED_EN.test(item.text) || BANNED_TH.test(item.text)
        );
        const catalogueOk =
          created.summary === THAI_COPY.summary &&
          optionText === THAI_COPY.optionReason &&
          questions[0]?.prompt === THAI_COPY.question &&
          choices[0]?.label === THAI_COPY.choice &&
          guidanceOf(created)[0]?.message === THAI_COPY.safety &&
          reasons[0]?.message === THAI_COPY.productReason;
        const ok =
          created.locale === "th" &&
          tooLong.length === 0 &&
          unkeyed.length === 0 &&
          banned.length === 0 &&
          catalogueOk;
        return ok
          ? pass("AX2-12", { locale: created.locale })
          : fail("AX2-12", {
              banned: banned.map((item) => item.key),
              catalogueOk,
              locale: created.locale ?? null,
              tooLong: tooLong.map((item) => item.key),
              unkeyed: unkeyed.map((item) => item.key)
            });
      })
    );

    cases.push(
      await runCase("AX2-13", async () => {
        const harness = createHarness();
        const first = await harness.call("info", {});
        const second = await harness.call("info", {});
        const keys = Object.keys(first).sort();
        const allowed = [
          "ok",
          "serviceName",
          "contractVersion",
          "schemaChecksum",
          "buildId",
          "supportedCountries",
          "supportedLocales",
          "medicationCodes",
          "conditionCodes",
          "userAccountRequired",
          "continuation",
          "pollAfterSeconds",
          "supportAvailable",
          "description",
          "valuePropositionId",
          "wellnessBoundary",
          "researchVersion",
          "responsibilityVersion"
        ];
        const extra = keys.filter((key) => !allowed.includes(key));
        const missing = allowed.filter((key) => !keys.includes(key));
        const countries = Array.isArray(first.supportedCountries)
          ? first.supportedCountries.map(asRecord)
          : [];
        const currencies = countries
          .map((item) => String(item.currency ?? "").trim())
          .filter(Boolean);
        const blob = JSON.stringify(first);
        const ok =
          first.ok === true &&
          second.ok === true &&
          blob === JSON.stringify(second) &&
          jsonSize(first) <= 4096 &&
          extra.length === 0 &&
          missing.length === 0 &&
          first.serviceName === "MattaNutra" &&
          first.contractVersion === "3.0.0" &&
          first.supportAvailable === true &&
          first.userAccountRequired === false &&
          first.continuation === "polling_only" &&
          Number(first.pollAfterSeconds) > 0 &&
          countries.length > 0 &&
          currencies.length > 0 &&
          stringList(first.supportedLocales).includes("en") &&
          stringList(first.medicationCodes).includes("apixaban") &&
          stringList(first.conditionCodes).includes("ckd") &&
          !/recognisedNames|catalogueGaps|latency|migrationVersion|environment|checkoutBuild|matcherTelemetry|catalogueVersion/i.test(
            blob
          ) &&
          typeof first.buildId === "string" &&
          String(first.buildId).length === 40 &&
          typeof first.schemaChecksum === "string" &&
          String(first.schemaChecksum).length === 64 &&
          bannedDiagnosticHits(first).length === 0;
        return ok
          ? pass("AX2-13", { bytes: jsonSize(first), keys })
          : fail("AX2-13", {
              bytes: jsonSize(first),
              extra,
              identical: blob === JSON.stringify(second),
              keys,
              missing
            });
      })
    );

    const byId = new Map(cases.map((item) => [item.id, item]));
    const ordered = CASE_IDS.map(
      (id) => byId.get(id) ?? fail(id, { missing: true })
    );

    return {
      cases: ordered,
      packVersion: "agentic-experience-2.0",
      passedCases: ordered.filter((item) => item.result === "PASS").length,
      totalCases: 13
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
  describe("agentic experience cycle 2 pack", () => {
    it("exports 13 cases and a canonical report", async () => {
      const report = await runAeC2Pack();
      assert.equal(report.totalCases, 13);
      assert.equal(report.cases.length, 13);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...CASE_IDS]
      );
      const encoded = canonicalAeC2Report(report);
      assert.equal(typeof encoded, "string");
      assert.equal(encoded, canonicalAeC2Report(JSON.parse(encoded) as AeC2PackReport));
    });
  });
}
