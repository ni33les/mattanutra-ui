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
  "AX6-06",
  "AX6-07"
] as const;

const SUP_C = "sup_ae_vitamin_c";
const SUP_D3 = "sup_ae_vitamin_d3";
const SUP_MAG = "sup_ae_magnesium";
const SUP_OMEGA = "sup_ae_omega3";
const SUP_GAP = "sup_ae_unobtainium";
const PRD_C = "prd_ae_c500";
const PRD_MAG = "prd_ae_natmag";
const PRD_D3 = "prd_ae_d3";
const PRD_OMEGA = "prd_ae_omega";
const OPT_SINGLE = "opt_ae_single";
const OPT_A = "opt_ae_a";
const OPT_B = "opt_ae_b";
const OPT_C = "opt_ae_c";
const OPT_MAG = "opt_ae_mag";
const OPT_OMEGA = "opt_ae_omega";
const MAG_BAND_ID = "band_ae_magnesium_ul";
const D3_GAP: PlanLeftover = {
  amount: 800,
  name: "Vitamin D3",
  reason: "dose_gap",
  severity: "low",
  supplementId: SUP_D3,
  unit: "IU"
};
const UNCOVERED: PlanLeftover = {
  name: "Unobtainium",
  reason: "uncovered",
  severity: "high",
  supplementId: SUP_GAP
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
  "matcherVersion",
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

export type AeC6CaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AeC6PackReport = Readonly<{
  cases: readonly AeC6CaseResult[];
  packVersion: "agentic-experience-6.0";
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

function matchFor(state: CanonicalPlanState) {
  const names = state.targets.map((item) => item.name.toLowerCase());
  const hasApixaban = state.medicationCodes.includes("apixaban");
  const hasOmega = names.some((name) => name.includes("omega"));
  const hasMag = names.some((name) => name.includes("magnesium"));
  const hasCkd = state.conditionCodes.includes("ckd");
  const fourTarget = state.targets.length >= 4;
  const uncovered = state.targets.some((item) => item.supplementId === SUP_GAP);

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

  if (fourTarget) {
    const packed = threeOptions();
    return {
      alternatives: packed.alternatives,
      leftovers: [D3_GAP],
      selected: packed.selected
    };
  }

  if (uncovered) {
    return { alternatives: [], leftovers: [UNCOVERED], selected: singleOption() };
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

function uncoveredRequest() {
  return singleRequest({
    targets: [
      { amount: 500, name: "Vitamin C", supplementId: SUP_C, unit: "mg" },
      { amount: 1, name: "Unobtainium", supplementId: SUP_GAP, unit: "mg" }
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

function leftoversOf(value: Record<string, unknown>) {
  return Array.isArray(value.leftovers) ? value.leftovers.map(asRecord) : [];
}

function coverageOf(value: Record<string, unknown>) {
  return Array.isArray(value.coverage) ? value.coverage.map(asRecord) : [];
}

function questionOk(question: Record<string, unknown>) {
  const choices = Array.isArray(question.choices)
    ? question.choices.map(asRecord)
    : [];
  return (
    typeof question.questionId === "string" &&
    String(question.questionId).length > 0 &&
    typeof question.prompt === "string" &&
    String(question.prompt).length > 0 &&
    typeof question.promptKey === "string" &&
    String(question.promptKey).length > 0 &&
    choices.length > 0 &&
    choices.every(
      (choice) =>
        typeof choice.choice === "string" &&
        String(choice.choice).length > 0 &&
        typeof choice.labelKey === "string" &&
        String(choice.labelKey).length > 0
    )
  );
}

function needsInputOk(plan: Record<string, unknown>) {
  const questions = questionsOf(plan);
  return (
    plan.status === "needs_input" &&
    questions.length > 0 &&
    questions.every(questionOk) &&
    new Set(questions.map((item) => String(item.questionId ?? ""))).size ===
      questions.length &&
    nextActionsOf(plan).includes("answer_questions")
  );
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
        const warfarin = await harness.call("plan", {
          idempotencyKey: "ax601-warf-00000001",
          operation: "create",
          request: singleRequest({ medicationCodes: ["warfarin"] })
        });
        const uncovered = await harness.call("plan", {
          idempotencyKey: "ax601-gap-000000001",
          operation: "create",
          request: uncoveredRequest()
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
        const acked = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: selected.revision,
          idempotencyKey: "ax601-ack-000000001",
          operation: "answer",
          planHandle: four.planHandle
        });
        const ready = await harness.call("plan", {
          idempotencyKey: "ax601-ready-0000001",
          operation: "create",
          request: singleRequest()
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
        const needs = [omega, warfarin, uncovered, selected].filter(
          (item) => item.status === "needs_input"
        );
        const needsBad = needs.filter((item) => !needsInputOk(item));
        const afterAckBad =
          acked.status === "needs_input" ? !needsInputOk(acked) : false;
        const readyOk =
          ready.status === "ready" &&
          questionsOf(ready).length === 0 &&
          nextActionsOf(ready).includes("confirm_with_user");
        const blockedOk =
          blocked.status === "blocked" &&
          questionsOf(blocked).length === 0 &&
          nextActionsOf(blocked).includes("change_request");
        const processingOk =
          processing.status === "processing" &&
          questionsOf(processing).length === 0 &&
          nextActionsOf(processing).includes("poll_plan");
        const ok =
          needs.length >= 3 &&
          needsBad.length === 0 &&
          afterAckBad === false &&
          readyOk &&
          blockedOk &&
          processingOk;
        return ok
          ? pass("AX6-01", { needs: needs.length })
          : fail("AX6-01", {
              acked: acked.status ?? null,
              ackedQuestions: questionsOf(acked).length,
              blocked: blocked.status ?? null,
              needsBad: needsBad.map((item) => ({
                questions: questionsOf(item).length,
                status: item.status ?? null
              })),
              processing: processing.status ?? null,
              ready: ready.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AX6-02", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax602-create-000001",
          operation: "create",
          request: fourRequest()
        });
        const handle = created.planHandle;
        const beforeSelect = harness.port.getCallCount();
        const selected = await harness.call("plan", {
          expectedRevision: created.revision,
          idempotencyKey: "ax602-select-000001",
          operation: "select",
          optionId: OPT_B,
          planHandle: handle
        });
        const afterSelect = harness.port.getCallCount();
        const beforeAck = harness.port.getCallCount();
        const acked = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: selected.revision,
          idempotencyKey: "ax602-ack-000000001",
          operation: "answer",
          planHandle: handle
        });
        const afterAck = harness.port.getCallCount();
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: handle
        });
        const d3 = coverageOf(acked).find((row) => /vitamin d/i.test(String(row.name ?? "")));
        const leftover = leftoversOf(acked);
        const optionIds = optionsOf(acked)
          .map((item) => String(item.optionId ?? ""))
          .sort();
        const ok =
          selected.planHandle === handle &&
          acked.planHandle === handle &&
          selected.revision === Number(created.revision) + 1 &&
          acked.revision === Number(selected.revision) + 1 &&
          afterSelect === beforeSelect &&
          afterAck === beforeAck &&
          selected.optionId === OPT_B &&
          acked.optionId === OPT_B &&
          optionIds.join() === [OPT_A, OPT_B, OPT_C].sort().join() &&
          selected.acknowledgementStatus === "pending" &&
          acked.status === "ready" &&
          acked.acknowledgementStatus === "acknowledged" &&
          questionsOf(acked).length === 0 &&
          nextActionsOf(acked).includes("confirm_with_user") &&
          !nextActionsOf(acked).includes("answer_questions") &&
          Number(d3?.coveragePercent) === 60 &&
          leftover.some(
            (item) =>
              String(item.reason ?? "") === "dose_gap" &&
              /vitamin d/i.test(String(item.name ?? ""))
          ) &&
          gotten.status === "ready" &&
          gotten.revision === acked.revision &&
          gotten.optionId === OPT_B &&
          JSON.stringify(leftoversOf(gotten)) === JSON.stringify(leftover) &&
          acked.status !== "needs_input";
        return ok
          ? pass("AX6-02", { revision: acked.revision, status: acked.status })
          : fail("AX6-02", {
              ackedQuestions: questionsOf(acked).length,
              ackedStatus: acked.status ?? null,
              d3: d3?.coveragePercent ?? null,
              leftoverReasons: leftover.map((item) => item.reason ?? null),
              optionId: acked.optionId ?? null,
              rematchAck: afterAck !== beforeAck,
              rematchSelect: afterSelect !== beforeSelect
            });
      })
    );

    cases.push(
      await runCase("AX6-03", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax603-create-000001",
          operation: "create",
          request: uncoveredRequest()
        });
        const questions = questionsOf(created);
        const gap = questions.find((item) =>
          String(item.questionId ?? "").includes("gap")
        );
        const choices = Array.isArray(gap?.choices) ? gap.choices.map(asRecord) : [];
        const accept = choices.find((item) =>
          String(item.choice ?? "").startsWith("accept_gap")
        );
        const remove = choices.find((item) =>
          /remove/i.test(String(item.choice ?? ""))
        );
        const before = harness.port.getCallCount();
        const answered = await harness.call("plan", {
          answers: [
            {
              choice: accept?.choice ?? "accept_gap:sup_ae_unobtainium",
              questionId: gap?.questionId ?? "q_gap_sup_ae_unobtainium"
            }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ax603-accept-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const evidence =
          leftoversOf(answered).length > 0 ||
          Array.isArray(answered.acceptedGaps) ||
          Array.isArray(answered.acceptedUncoveredTargets);
        const ok =
          needsInputOk(created) &&
          questions.length === 1 &&
          Boolean(gap) &&
          Boolean(accept) &&
          Boolean(remove) &&
          answered.planHandle === created.planHandle &&
          answered.revision === Number(created.revision) + 1 &&
          harness.port.getCallCount() === before &&
          answered.status === "ready" &&
          questionsOf(answered).length === 0 &&
          evidence &&
          gotten.status === "ready" &&
          gotten.revision === answered.revision &&
          questionsOf(gotten).length === 0 &&
          guidanceOf(created).every((item) => item.action !== "block");
        return ok
          ? pass("AX6-03", { questionId: gap?.questionId ?? null })
          : fail("AX6-03", {
              answered: answered.status ?? null,
              choices: choices.map((item) => item.choice ?? null),
              created: created.status ?? null,
              evidence,
              questionCount: questions.length,
              rematched: harness.port.getCallCount() !== before
            });
      })
    );

    cases.push(
      await runCase("AX6-04", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax604-create-000001",
          operation: "create",
          request: singleRequest()
        });
        const gotten = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const replay = await harness.call("plan", {
          idempotencyKey: "ax604-create-000001",
          operation: "create",
          request: singleRequest()
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
        const answered = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: selected.revision,
          idempotencyKey: "ax604-ack-000000001",
          operation: "answer",
          planHandle: four.planHandle
        });
        const revised = await harness.call("plan", {
          expectedRevision: answered.revision,
          idempotencyKey: "ax604-revise-000001",
          operation: "revise",
          planHandle: four.planHandle,
          request: fourRequest({ requirements: { maxDailyPills: 8 } })
        });
        const payloads = [
          { max: 8192, name: "create", value: created },
          { max: 8192, name: "get", value: gotten },
          { max: 8192, name: "replay", value: replay },
          { max: 16384, name: "select", value: selected },
          { max: 16384, name: "answer", value: answered },
          { max: 16384, name: "revise", value: revised }
        ];
        const dirty = payloads
          .map((item) => ({
            diagnostics: keyHits(item.value, BANNED_DIAGNOSTIC_KEYS),
            name: item.name,
            oversized: jsonSize(item.value) > item.max
          }))
          .filter((item) => item.diagnostics.length > 0 || item.oversized);
        return dirty.length === 0
          ? pass("AX6-04", { operations: payloads.map((item) => item.name) })
          : fail("AX6-04", { dirty });
      })
    );

    cases.push(
      await runCase("AX6-05", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax605-ready-0000001",
          operation: "create",
          request: singleRequest()
        });
        const malformedCreate = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const malformedRevise = await harness.call("plan", {
          expectedRevision: created.revision,
          idempotencyKey: "ax605-revise-bad-001",
          operation: "revise",
          planHandle: created.planHandle
        });
        const malformedAnswer = await harness.call("plan", {
          expectedRevision: created.revision,
          idempotencyKey: "ax605-answer-bad-001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const malformedSelect = await harness.call("plan", {
          expectedRevision: created.revision,
          idempotencyKey: "ax605-select-bad-001",
          operation: "select",
          planHandle: created.planHandle
        });
        const malformedGet = await harness.call("plan", {
          operation: "get",
          planHandle: "short"
        });
        const replay = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const rows = [
          { name: "create", paths: ["idempotencyKey", "request"], value: malformedCreate },
          { name: "revise", paths: ["request"], value: malformedRevise },
          { name: "answer", paths: ["answers"], value: malformedAnswer },
          { name: "select", paths: ["optionId"], value: malformedSelect },
          { name: "get", paths: ["planHandle"], value: malformedGet }
        ];
        const bad = rows.filter((row) => !compactErrorOk(row.value, row.paths));
        const identical = JSON.stringify(malformedCreate) === JSON.stringify(replay);
        return bad.length === 0 && identical
          ? pass("AX6-05", { operations: rows.map((item) => item.name) })
          : fail("AX6-05", {
              bad: bad.map((item) => ({
                code: asRecord(item.value.error).error_code ??
                  asRecord(item.value.error).reasonCode ??
                  null,
                name: item.name
              })),
              identical
            });
      })
    );

    cases.push(
      await runCase("AX6-06", async () => {
        const harness = createHarness();
        const ready = await harness.call("plan", {
          idempotencyKey: "ax606-ready-0000001",
          operation: "create",
          request: singleRequest()
        });
        const four = await harness.call("plan", {
          idempotencyKey: "ax606-four-00000001",
          operation: "create",
          request: fourRequest()
        });
        const selected = await harness.call("plan", {
          expectedRevision: four.revision,
          idempotencyKey: "ax606-select-000001",
          operation: "select",
          optionId: OPT_B,
          planHandle: four.planHandle
        });
        const acked = await harness.call("plan", {
          answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
          expectedRevision: selected.revision,
          idempotencyKey: "ax606-ack-000000001",
          operation: "answer",
          planHandle: four.planHandle
        });
        const uncovered = await harness.call("plan", {
          idempotencyKey: "ax606-gap-000000001",
          operation: "create",
          request: uncoveredRequest()
        });
        const warfarin = await harness.call("plan", {
          idempotencyKey: "ax606-warf-00000001",
          operation: "create",
          request: singleRequest({ medicationCodes: ["warfarin"] })
        });
        const omega = await harness.call("plan", {
          idempotencyKey: "ax606-omega-0000001",
          operation: "create",
          request: singleRequest({
            medicationCodes: ["apixaban"],
            targets: [
              { amount: 1000, name: "Omega-3", supplementId: SUP_OMEGA, unit: "mg" }
            ]
          })
        });
        const blocked = await harness.call("plan", {
          idempotencyKey: "ax606-block-0000001",
          operation: "create",
          request: singleRequest({
            targets: [{ amount: 351, name: "Magnesium", supplementId: SUP_MAG, unit: "mg" }]
          })
        });
        const missingReady = REQUIRED_READY_KEYS.filter((key) => !(key in ready));
        const leftoverVisible =
          leftoversOf(acked).some((item) => item.reason === "dose_gap") ||
          coverageOf(acked).some(
            (row) =>
              /vitamin d/i.test(String(row.name ?? "")) && Number(row.coveragePercent) === 60
          );
        const soleReason = optionsOf(ready)[0]?.reasonCode === "best_available";
        const priceOk =
          Number(asRecord(ready.stackSummary).totalPriceMinor) + DEFAULT_SHIPPING_MINOR ===
          Number(ready.estimatedOrderTotalMinor);
        const ok =
          missingReady.length === 0 &&
          leftoverVisible &&
          soleReason &&
          priceOk &&
          keyHits(ready, BANNED_DIAGNOSTIC_KEYS).length === 0 &&
          keyHits(acked, BANNED_DIAGNOSTIC_KEYS).length === 0 &&
          basketOf(ready).every((item) => asRecord(item.selectionReason).messageKey) &&
          optionsOf(selected).length === 3 &&
          optionsOf(selected).filter((item) => item.selected === true).length === 1 &&
          stringList(warfarin.unassessedMedicationCodes).includes("warfarin") &&
          omega.acknowledgementStatus === "pending" &&
          guidanceOf(blocked).some(
            (item) =>
              item.action === "block" && item.acknowledgementStatus === "not_applicable"
          ) &&
          (uncovered.status === "needs_input" ? needsInputOk(uncovered) : true);
        return ok
          ? pass("AX6-06", { leftoverVisible, soleReason })
          : fail("AX6-06", {
              leftoverVisible,
              missingReady,
              soleReason,
              uncovered: uncovered.status ?? null
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
        ? pass("AX6-07", { passed: firstSix.map((item) => item.id) })
        : fail("AX6-07", { failed: failedSix })
    );

    const ordered = CASE_IDS.map(
      (id) => cases.find((item) => item.id === id) ?? fail(id, { missing: true })
    );

    return {
      cases: ordered,
      packVersion: "agentic-experience-6.0",
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
  describe("agentic experience cycle 6 pack", () => {
    it("exports 7 cases and a canonical report", async () => {
      const report = await runAeC6Pack();
      assert.equal(report.totalCases, 7);
      assert.equal(report.cases.length, 7);
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
