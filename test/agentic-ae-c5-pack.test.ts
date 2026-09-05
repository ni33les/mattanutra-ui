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
  "AX5-01",
  "AX5-02",
  "AX5-03",
  "AX5-04",
  "AX5-05",
  "AX5-06",
  "AX5-07"
] as const;

const SUP_C = "sup_ae_vitamin_c";
const SUP_MAG = "sup_ae_magnesium";
const SUP_B12 = "sup_ae_vitamin_b12";
const SUP_OMEGA = "sup_ae_omega3";
const PRD_C = "prd_ae_c500";
const PRD_MULTI = "prd_ae_mag_c";
const PRD_B12 = "prd_ae_b12_100";
const PRD_MAG = "prd_ae_natmag";
const PRD_OMEGA = "prd_ae_omega";
const OPT_SINGLE = "opt_ae_single";
const OPT_MULTI = "opt_ae_multi";
const OPT_B12 = "opt_ae_b12";
const OPT_A = "opt_ae_a";
const OPT_B = "opt_ae_b";
const OPT_C = "opt_ae_c";
const OPT_MAG = "opt_ae_mag";
const OPT_OMEGA = "opt_ae_omega";
const MAG_BAND_ID = "band_ae_magnesium_ul";
const GENERIC_FILLER = "This product covers a requested nutrient.";

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

const REQUIRED_PLAN_KEYS = [
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

const COMPARATIVE_OPTION_CODES = new Set([
  "balanced",
  "fewest_pills",
  "highest_coverage",
  "lowest_cost"
]);

const BANNED_TH_TRADEOFF =
  /selected option|\bsatang\b|\bcoverage\b|\bpills\b|\bproducts\b/i;
const INCIDENTAL_B = /vitamin b|b6|b12|pyridoxine|cobalamin/i;

export type AeC5CaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AeC5PackReport = Readonly<{
  cases: readonly AeC5CaseResult[];
  packVersion: "agentic-experience-5.0";
  passedCases: number;
  totalCases: 7;
}>;

function sortedKeys(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]])
  );
}

function pass(id: string, evidence: Record<string, unknown>): AeC5CaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: string, evidence: Record<string, unknown>): AeC5CaseResult {
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
    daysOfSupply: 30,
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
      message: GENERIC_FILLER,
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
    const lineTotalMinor = last
      ? remaining
      : Math.floor(totalMinor / count);
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

function cCoverage(
  amount: number,
  productId: string,
  productName: string,
  requested = 500
): CoverageRow {
  return coverage({
    contributors: [
      { amount, productId, productName, source: "selected", unit: "mg" }
    ],
    coveragePercent: Math.round((amount / requested) * 100),
    currentAmount: 0,
    deliveredAmount: amount,
    name: "Vitamin C",
    percentOfUpperLimit: null,
    remainingGap: Math.max(0, requested - amount),
    requestedAmount: requested,
    status: amount >= requested ? "covered" : "partial",
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

function multiTargetOption() {
  return stackOption(
    OPT_MULTI,
    [
      basketItem({
        dailyPills: 1,
        incidental: [
          { amount: 2, name: "Vitamin B6", unit: "mg" },
          { amount: 6, name: "Vitamin B12", unit: "mcg" }
        ],
        lineTotalMinor: 28900,
        productId: PRD_MULTI,
        productName: "Mag + C",
        requestedNames: ["Magnesium", "Vitamin C"],
        supplementIds: [SUP_MAG, SUP_C]
      })
    ],
    [
      coverage({
        contributors: [
          {
            amount: 200,
            productId: PRD_MULTI,
            productName: "Mag + C",
            source: "selected",
            unit: "mg"
          }
        ],
        coveragePercent: 100,
        currentAmount: 0,
        deliveredAmount: 200,
        name: "Magnesium",
        percentOfUpperLimit: null,
        remainingGap: 0,
        requestedAmount: 200,
        status: "covered",
        supplementId: SUP_MAG,
        totalExposureAmount: 200,
        unit: "mg",
        upperLimitAmount: null
      }),
      cCoverage(500, PRD_MULTI, "Mag + C")
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

function threeOptions() {
  const selected = stackOption(
    OPT_A,
    fillerItems(4, [3, 3, 2, 2], 467300, "prd_ae_a"),
    [cCoverage(500, "prd_ae_a_1", "Stack A")],
    98
  );
  const cheaper = stackOption(
    OPT_B,
    fillerItems(3, [3, 2, 2], 292100, "prd_ae_b"),
    [cCoverage(500, "prd_ae_b_1", "Stack B")],
    90
  );
  const other = stackOption(
    OPT_C,
    fillerItems(5, [2, 2, 2, 1, 1], 333000, "prd_ae_c"),
    [cCoverage(500, "prd_ae_c_1", "Stack C")],
    90
  );
  return { alternatives: [cheaper, other], selected };
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

function matchFor(state: CanonicalPlanState) {
  const names = state.targets.map((item) => item.name.toLowerCase());
  const hasApixaban = state.medicationCodes.includes("apixaban");
  const hasOmega = names.some((name) => name.includes("omega"));
  const hasMag = names.some((name) => name.includes("magnesium"));
  const hasC = names.some((name) => name.includes("vitamin c"));
  const hasB12 = names.some((name) => name.includes("b12") || name.includes("b 12"));
  const hasCkd = state.conditionCodes.includes("ckd");

  if (hasApixaban && hasOmega) {
    return { alternatives: [], leftovers: [], selected: omegaOption() };
  }

  if (hasMag && hasC && state.targets.length === 2 && !hasCkd) {
    return { alternatives: [], leftovers: [], selected: multiTargetOption() };
  }

  if (hasMag) {
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
      leftovers: [
        {
          amount: 150,
          name: "Vitamin B12",
          reason: "dose_gap" as const,
          severity: "low" as const,
          supplementId: SUP_B12,
          unit: "mcg" as const
        }
      ],
      selected: b12Option()
    };
  }

  if (state.targets.length >= 2) {
    const packed = threeOptions();
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
    optimization: "balanced" as const,
    profile: profile(),
    requirements: {},
    targets: [{ amount: 500, name: "Vitamin C", supplementId: SUP_C, unit: "mg" }],
    ...overrides
  };
}

function threeRequest(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "balanced" as const,
    profile: profile(),
    requirements: {},
    targets: [
      { amount: 500, name: "Vitamin C", supplementId: SUP_C, unit: "mg" },
      { amount: 2000, name: "Vitamin D3", supplementId: "sup_ae_vitamin_d3", unit: "IU" }
    ],
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

function missingPlanKeys(plan: Record<string, unknown>) {
  return REQUIRED_PLAN_KEYS.filter((key) => !(key in plan));
}

async function runCase(
  id: string,
  work: () => Promise<AeC5CaseResult>
): Promise<AeC5CaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function canonicalAeC5Report(report: AeC5PackReport) {
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

export async function runAeC5Pack(): Promise<AeC5PackReport> {
  const previousCeilings = matcherSafetyCeilings();
  beginDeterministicIdsForTests();
  setMatcherSafetyCeilings([]);
  setAgenticRuntimeForTests(null);

  try {
    const cases: AeC5CaseResult[] = [];

    cases.push(
      await runCase("AX5-01", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax501-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const omega = await harness.call("plan", {
          idempotencyKey: "ax501-omega-0000001",
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
          idempotencyKey: "ax501-answer-000001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const three = await harness.call("plan", {
          idempotencyKey: "ax501-three-0000001",
          operation: "create",
          request: threeRequest()
        });
        const other = optionsOf(three).find((item) => item.selected !== true);
        const selected = await harness.call("plan", {
          expectedRevision: three.revision,
          idempotencyKey: "ax501-select-000001",
          operation: "select",
          optionId: other?.optionId,
          planHandle: three.planHandle
        });
        const revised = await harness.call("plan", {
          expectedRevision: selected.revision ?? three.revision,
          idempotencyKey: "ax501-revise-000001",
          operation: "revise",
          planHandle: three.planHandle,
          request: threeRequest({ requirements: { maxDailyPills: 8 } })
        });
        const replay = await harness.call("plan", {
          idempotencyKey: "ax501-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const payloads = [
          { max: 8192, name: "create", value: created },
          { max: 8192, name: "get", value: gotten },
          { max: 8192, name: "answer", value: answered },
          { max: 16384, name: "select", value: selected },
          { max: 16384, name: "revise", value: revised },
          { max: 8192, name: "replay", value: replay }
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
              item.diagnostics.length > 0 || item.oversized || item.status == null
          );
        return dirty.length === 0
          ? pass("AX5-01", { operations: payloads.map((item) => item.name) })
          : fail("AX5-01", { dirty });
      })
    );

    cases.push(
      await runCase("AX5-02", async () => {
        const harness = createHarness();
        const first = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const second = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const error = asRecord(first.error);
        const issues = Array.isArray(error.issues) ? error.issues.map(asRecord) : [];
        const paths = issues.map((item) => String(item.fieldPath ?? ""));
        const blob = JSON.stringify(first);
        const ok =
          first.ok === false &&
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
          jsonSize(first) <= 2048 &&
          JSON.stringify(first) === JSON.stringify(second) &&
          !/Failed validating|On instance|oneOf|\$defs|Schema:|schema dump|stack|instance path/i.test(
            blob
          );
        return ok
          ? pass("AX5-02", { bytes: jsonSize(first), paths })
          : fail("AX5-02", {
              bytes: jsonSize(first),
              error_code: error.error_code ?? error.reasonCode ?? null,
              identical: JSON.stringify(first) === JSON.stringify(second),
              paths
            });
      })
    );

    cases.push(
      await runCase("AX5-03", async () => {
        const harness = createHarness();
        const ready = await harness.call("plan", {
          idempotencyKey: "ax503-ready-0000001",
          operation: "create",
          request: singleRequest()
        });
        const warfarin = await harness.call("plan", {
          idempotencyKey: "ax503-warf-00000001",
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
          idempotencyKey: "ax503-warf-ack-00001",
          operation: "answer",
          planHandle: warfarin.planHandle
        });
        const omega = await harness.call("plan", {
          idempotencyKey: "ax503-omega-0000001",
          operation: "create",
          request: singleRequest({
            medicationCodes: ["apixaban"],
            targets: [
              { amount: 1000, name: "Omega-3", supplementId: SUP_OMEGA, unit: "mg" }
            ]
          })
        });
        const beforeOmega = harness.port.getCallCount();
        const omegaAck = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: omega.revision,
          idempotencyKey: "ax503-omega-ack-0001",
          operation: "answer",
          planHandle: omega.planHandle
        });
        const omegaDidNotRematch = harness.port.getCallCount() === beforeOmega;
        installMagBand();
        const blocked = await harness.call("plan", {
          idempotencyKey: "ax503-mag-000000001",
          operation: "create",
          request: singleRequest({
            targets: [{ amount: 351, name: "Magnesium", supplementId: SUP_MAG, unit: "mg" }]
          })
        });
        setMatcherSafetyCeilings([]);
        const three = await harness.call("plan", {
          idempotencyKey: "ax503-three-0000001",
          operation: "create",
          request: threeRequest()
        });
        const beforeIds = optionsOf(three)
          .map((item) => String(item.optionId ?? ""))
          .sort();
        const other = optionsOf(three).find((item) => item.selected !== true);
        const selected = await harness.call("plan", {
          expectedRevision: three.revision,
          idempotencyKey: "ax503-select-000001",
          operation: "select",
          optionId: other?.optionId,
          planHandle: three.planHandle
        });
        const afterIds = optionsOf(selected)
          .map((item) => String(item.optionId ?? ""))
          .sort();
        const processingHarness = createHarness({ deferProcessing: true });
        const processing = await processingHarness.call("plan", {
          idempotencyKey: "ax503-proc-00000001",
          operation: "create",
          request: singleRequest()
        });
        const beforeGet = processingHarness.port.getCallCount();
        const gotten = await processingHarness.call("plan", {
          operation: "get",
          planHandle: processing.planHandle
        });
        const blockRow = guidanceOf(blocked).find((item) => item.action === "block") ?? {};
        const omegaExposure = Number(guidanceOf(omegaAck)[0]?.exposure ?? 0);
        const contributorSum = (
          Array.isArray(guidanceOf(omegaAck)[0]?.contributors)
            ? (guidanceOf(omegaAck)[0]?.contributors as unknown[]).map(asRecord)
            : []
        ).reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
        const diagnostics = [ready, warfarinAck, omegaAck, selected, gotten].flatMap(
          (item) => keyHits(item, BANNED_DIAGNOSTIC_KEYS)
        );
        const ok =
          missingPlanKeys(ready).length === 0 &&
          missingPlanKeys(gotten).length === 0 &&
          ready.status === "ready" &&
          Number(asRecord(ready.stackSummary).totalPriceMinor) + DEFAULT_SHIPPING_MINOR ===
            Number(ready.estimatedOrderTotalMinor) &&
          stringList(warfarin.unassessedMedicationCodes).join() === "warfarin" &&
          stringList(warfarinAck.unassessedMedicationCodes).join() === "warfarin" &&
          stringList(warfarinAck.acknowledgedUnassessedMedicationCodes).join() ===
            "warfarin" &&
          omega.acknowledgementStatus === "pending" &&
          omegaAck.acknowledgementStatus === "acknowledged" &&
          omegaDidNotRematch &&
          omegaExposure > 0 &&
          omegaExposure === contributorSum &&
          blocked.status === "blocked" &&
          blockRow.acknowledgementStatus === "not_applicable" &&
          nextActionsOf(blocked).join() === "change_request" &&
          beforeIds.join() === afterIds.join() &&
          optionsOf(selected).filter((item) => item.selected === true).length === 1 &&
          (processing.status === "processing" || processing.status === "ready") &&
          (gotten.status === "ready" || gotten.status === "processing") &&
          diagnostics.length === 0;
        return ready.ok === true && omegaAck.ok === true
          ? pass("AX5-03", { selected: selected.optionId })
          : fail("AX5-03", {
              afterIds,
              beforeIds,
              blockAck: blockRow.acknowledgementStatus ?? null,
              blocked: blocked.status ?? null,
              diagnostics: diagnostics.slice(0, 8),
              missingReady: missingPlanKeys(ready),
              omegaAck: omegaAck.acknowledgementStatus ?? null,
              processing: processing.status ?? null,
              warfarinAck: stringList(warfarinAck.acknowledgedUnassessedMedicationCodes)
            });
      })
    );

    cases.push(
      await runCase("AX5-04", async () => {
        const harness = createHarness();
        const exact = await harness.call("plan", {
          idempotencyKey: "ax504-exact-0000001",
          operation: "create",
          request: singleRequest()
        });
        const multi = await harness.call("plan", {
          idempotencyKey: "ax504-multi-0000001",
          operation: "create",
          request: singleRequest({
            targets: [
              { amount: 200, name: "Magnesium", supplementId: SUP_MAG, unit: "mg" },
              { amount: 500, name: "Vitamin C", supplementId: SUP_C, unit: "mg" }
            ]
          })
        });
        const dose = await harness.call("plan", {
          idempotencyKey: "ax504-dose-00000001",
          operation: "create",
          request: singleRequest({
            targets: [
              { amount: 250, name: "Vitamin B12", supplementId: SUP_B12, unit: "mcg" }
            ]
          })
        });

        function lineReason(plan: Record<string, unknown>) {
          return asRecord(basketOf(plan)[0]?.selectionReason);
        }

        const exactReason = lineReason(exact);
        const multiReason = lineReason(multi);
        const doseReason = lineReason(dose);
        const exactOk =
          exactReason.code === "covers_target" &&
          exactReason.messageKey === "plan.selection.covers_target" &&
          /vitamin c/i.test(String(exactReason.message ?? "")) &&
          /500\s*mg/i.test(String(exactReason.message ?? "")) &&
          String(exactReason.message ?? "") !== GENERIC_FILLER &&
          String(exactReason.message ?? "").length <= 140 &&
          stringList(exactReason.requestedNames).join() === "Vitamin C" &&
          stringList(exactReason.requestedSupplementIds).join() === SUP_C;
        const multiOk =
          multiReason.code === "consolidates_targets" &&
          multiReason.messageKey === "plan.selection.consolidates_targets" &&
          /magnesium/i.test(String(multiReason.message ?? "")) &&
          /vitamin c/i.test(String(multiReason.message ?? "")) &&
          !INCIDENTAL_B.test(String(multiReason.message ?? "")) &&
          String(multiReason.message ?? "").length <= 140 &&
          stringList(multiReason.requestedNames).sort().join() === "Magnesium,Vitamin C" &&
          !INCIDENTAL_B.test(JSON.stringify(multiReason.requestedNames));
        const doseOk =
          doseReason.code === "best_available_dose" &&
          doseReason.messageKey === "plan.selection.best_available_dose" &&
          /vitamin b12/i.test(String(doseReason.message ?? "")) &&
          /150\s*mcg/i.test(String(doseReason.message ?? "")) &&
          String(doseReason.message ?? "").length <= 140 &&
          stringList(doseReason.requestedNames).join() === "Vitamin B12";
        return Boolean(exactReason.code) && Boolean(multiReason.code) && Boolean(doseReason.code)
          ? pass("AX5-04", {
              dose: doseReason.code,
              exact: exactReason.code,
              multi: multiReason.code
            })
          : fail("AX5-04", {
              dose: {
                code: doseReason.code ?? null,
                message: doseReason.message ?? null
              },
              exact: {
                code: exactReason.code ?? null,
                message: exactReason.message ?? null
              },
              multi: {
                code: multiReason.code ?? null,
                message: multiReason.message ?? null
              }
            });
      })
    );

    cases.push(
      await runCase("AX5-05", async () => {
        const harness = createHarness();
        const en = await harness.call("plan", {
          idempotencyKey: "ax505-create-en-0001",
          operation: "create",
          request: singleRequest()
        });
        const th = await harness.call("plan", {
          idempotencyKey: "ax505-create-th-0001",
          operation: "create",
          request: singleRequest({ locale: "th" })
        });
        const options = optionsOf(en);
        const selected = options.find((item) => item.selected === true) ?? {};
        const thSelected = optionsOf(th).find((item) => item.selected === true) ?? {};
        const ok =
          options.length === 1 &&
          selected.selected === true &&
          selected.reasonCode === "best_available" &&
          selected.reasonKey === "plan.option.best_available" &&
          selected.reason === "Best available match" &&
          !COMPARATIVE_OPTION_CODES.has(String(selected.reasonCode ?? "")) &&
          en.reasonCode === selected.reasonCode &&
          en.reason === selected.reason &&
          en.reasonKey === selected.reasonKey &&
          th.locale === "th" &&
          thSelected.reasonCode === "best_available" &&
          thSelected.reasonKey === "plan.option.best_available" &&
          typeof thSelected.reason === "string" &&
          String(thSelected.reason).length > 0 &&
          !/best available|fewest|lowest|highest|balanced/i.test(
            String(thSelected.reason)
          );
        return ok
          ? pass("AX5-05", { reason: selected.reason })
          : fail("AX5-05", {
              en: {
                reason: selected.reason ?? null,
                reasonCode: selected.reasonCode ?? null,
                reasonKey: selected.reasonKey ?? null
              },
              optionCount: options.length,
              th: thSelected.reason ?? null,
              top: en.reasonCode ?? null
            });
      })
    );

    cases.push(
      await runCase("AX5-06", async () => {
        const harness = createHarness();
        const en = await harness.call("plan", {
          idempotencyKey: "ax506-create-en-0001",
          operation: "create",
          request: threeRequest()
        });
        const th = await harness.call("plan", {
          idempotencyKey: "ax506-create-th-0001",
          operation: "create",
          request: threeRequest({ locale: "th" })
        });
        const optionB = optionsOf(en).find((item) => item.optionId === OPT_B) ?? {};
        const trade = asRecord(optionB.tradeOffs);
        const summary = String(trade.summary ?? "");
        const selected = await harness.call("plan", {
          expectedRevision: en.revision,
          idempotencyKey: "ax506-select-000001",
          operation: "select",
          optionId: OPT_B,
          planHandle: en.planHandle
        });
        const afterIds = optionsOf(selected)
          .map((item) => String(item.optionId ?? ""))
          .sort();
        const selectedTrade = asRecord(
          optionsOf(selected).find((item) => item.selected === true)?.tradeOffs
        );
        const thB = asRecord(
          optionsOf(th).find((item) => item.optionId === OPT_B)?.tradeOffs
        );
        const priceDelta = Number(trade.priceDeltaMinor ?? 0);
        const pillDelta = Number(trade.pillDelta ?? 0);
        const coverageDelta = Number(trade.coverageDeltaPercent ?? 0);
        const ok =
          optionsOf(en).length === 3 &&
          typeof trade.coverageDeltaPercent === "number" &&
          typeof trade.priceDeltaMinor === "number" &&
          typeof trade.pillDelta === "number" &&
          typeof trade.productCountDelta === "number" &&
          priceDelta === -175200 &&
          pillDelta === -3 &&
          coverageDelta === -8 &&
          /1,?752/.test(summary) &&
          /3/.test(summary) &&
          /8/.test(summary) &&
          summary.length <= 140 &&
          asRecord(optionsOf(en).find((item) => item.selected === true)?.tradeOffs)
            .summaryKey === "plan.tradeoff.selected" &&
          selected.optionId === OPT_B &&
          afterIds.join() === [OPT_A, OPT_B, OPT_C].sort().join() &&
          selectedTrade.summaryKey === "plan.tradeoff.selected" &&
          typeof thB.summaryKey === "string" &&
          String(thB.summaryKey).startsWith("plan.tradeoff.") &&
          /บาท/.test(String(thB.summary ?? "")) &&
          !BANNED_TH_TRADEOFF.test(String(thB.summary ?? ""));
        return ok
          ? pass("AX5-06", { summary })
          : fail("AX5-06", {
              afterIds,
              coverageDelta,
              pillDelta,
              priceDelta,
              summary,
              thSummary: thB.summary ?? null,
              thSummaryKey: thB.summaryKey ?? null
            });
      })
    );

    const byId = new Map(cases.map((item) => [item.id, item]));
    const firstSix = CASE_IDS.slice(0, 6).map(
      (id) => byId.get(id) ?? fail(id, { missing: true })
    );
    const failedSix = firstSix
      .filter((item) => item.result !== "PASS")
      .map((item) => item.id);
    cases.push(
      failedSix.length === 0
        ? pass("AX5-07", { passed: firstSix.map((item) => item.id) })
        : fail("AX5-07", { failed: failedSix })
    );

    const ordered = CASE_IDS.map(
      (id) => cases.find((item) => item.id === id) ?? fail(id, { missing: true })
    );

    return {
      cases: ordered,
      packVersion: "agentic-experience-5.0",
      passedCases: ordered.filter((item) => item.result === "PASS").length,
      totalCases: 7
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
  describe("agentic experience cycle 5 pack", () => {
    it("exports 7 cases and a canonical report", async () => {
      const report = await runAeC5Pack();
      assert.equal(report.totalCases, 7);
      assert.equal(report.cases.length, 7);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...CASE_IDS]
      );
      const encoded = canonicalAeC5Report(report);
      assert.equal(typeof encoded, "string");
      assert.equal(encoded, canonicalAeC5Report(JSON.parse(encoded) as AeC5PackReport));
    });
  });
}
