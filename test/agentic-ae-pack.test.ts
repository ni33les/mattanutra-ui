import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginDeterministicIdsForTests,
  endDeterministicIdsForTests
} from "../lib/agentic/capabilities.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { agenticMessage, negotiateLocale } from "../lib/agentic/i18n.ts";
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
  "AE-01",
  "AE-02",
  "AE-03",
  "AE-04",
  "AE-05",
  "AE-06",
  "AE-07",
  "AE-08",
  "AE-09",
  "AE-10",
  "AE-11",
  "AE-12",
  "AE-13",
  "AE-14",
  "AE-15",
  "AE-16",
  "AE-17",
  "AE-18",
  "AE-19"
] as const;

const SUP_C = "sup_ae_vitamin_c";
const SUP_D3 = "sup_ae_vitamin_d3";
const SUP_OMEGA = "sup_ae_omega3";
const PRD_C = "prd_ae_c500";
const PRD_C2 = "prd_ae_c_multi";
const PRD_D3_A = "prd_ae_d3_600";
const PRD_D3_B = "prd_ae_d3_1200";
const PRD_OMEGA = "prd_ae_omega";
const OPT_SINGLE = "opt_ae_single";
const OPT_MULTI_A = "opt_ae_multi_a";
const OPT_MULTI_B = "opt_ae_multi_b";
const OPT_D3 = "opt_ae_d3";
const OPT_OMEGA = "opt_ae_omega";
const OPT_LOW = "opt_ae_lowpills";

const ISOLATED_INFO: IsolatedInfoCatalog = {
  conditionCodes: ["ckd", "chronic_kidney_disease"],
  medicationCodes: ["apixaban", "eliquis"],
  supportedCountries: [
    { countryCode: "TH", countryName: "Thailand", currency: "THB" }
  ]
};

const BANNED_COPY =
  /\bclient\b|\bexecute\b|\bfreeze\b|\bmatcher\b|\boptionId\b|\bplanHandle\b|\brevision\b|\btelemetry\b/i;
const BANNED_DESCRIPTION =
  /D\d{1,2}-\d{2}|\bPASS\b|\bFAIL\b|official[- ]pack|4242|400000000000|decline_insufficient|scenario=refund|\/api\/mcp\/checkout|Stripe test/i;
const MATCHER_DIAGNOSTIC =
  /matcherTelemetry|factLedger|targetFrontiers|targetClassifications|availabilityAsOf|searchDeadline|catalogueMs|searchMs|serializeMs|matchMs|ackMs/;

export type AeCaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AePackReport = Readonly<{
  cases: readonly AeCaseResult[];
  contractVersion: "agentic-experience-1.0";
  passedCases: number;
  totalCases: 19;
}>;

function sortedKeys(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]])
  );
}

function pass(id: string, evidence: Record<string, unknown>): AeCaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: string, evidence: Record<string, unknown>): AeCaseResult {
  return { evidence: sortedKeys(evidence), id, result: "FAIL" };
}

function jsonSize(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function structured(response: unknown): Record<string, unknown> {
  const root = asRecord(response);
  const result = asRecord(root.result);
  return asRecord(result.structuredContent);
}

function reasonFor(locale: string, ids: readonly string[]) {
  const negotiated = negotiateLocale(locale);
  return {
    code: "covers_target" as const,
    message: agenticMessage(negotiated, "plan.selection.covers_target"),
    messageKey: "plan.selection.covers_target",
    requestedSupplementIds: [...ids]
  };
}

function basketItem(
  input: Readonly<{
    dailyPills: number;
    daysOfSupply: number;
    locale: string;
    lineTotalMinor: number;
    productId: string;
    productName: string;
    supplementIds: readonly string[];
  }>
): BasketItem {
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
    incidentalNutrientNames: [],
    incidentalNutrients: [],
    incompleteCommercialFacts: false,
    lineTotalMinor: input.lineTotalMinor,
    pillsPerServing: input.dailyPills,
    productId: input.productId,
    productName: input.productName,
    quantity: 1,
    requestedNutrientNames: [],
    retailerSku: `sku_${input.productId}`,
    selectionReason: reasonFor(input.locale, input.supplementIds),
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
  locale: string
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
    reason: agenticMessage(negotiateLocale(locale), "plan.option.fewest_pills"),
    snapshotId: "snap_ae",
    totalPriceMinor: basket.reduce((sum, item) => sum + item.lineTotalMinor, 0)
  };
}

function singleOption(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      locale,
      lineTotalMinor: 15900,
      productId: PRD_C,
      productName: "Vitamin C 500",
      supplementIds: [SUP_C]
    })
  ];
  return stackOption(
    OPT_SINGLE,
    basket,
    [
      coverage({
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
        upperLimitAmount: null,
        contributors: [
          {
            amount: 500,
            productId: PRD_C,
            productName: "Vitamin C 500",
            source: "selected",
            unit: "mg"
          }
        ]
      })
    ],
    locale
  );
}

function multiOptionA(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 2,
      daysOfSupply: 30,
      locale,
      lineTotalMinor: 40000,
      productId: PRD_C,
      productName: "Vitamin C 500",
      supplementIds: [SUP_C]
    }),
    basketItem({
      dailyPills: 2,
      daysOfSupply: 60,
      locale,
      lineTotalMinor: 20000,
      productId: PRD_C2,
      productName: "Vitamin D3 1000",
      supplementIds: [SUP_D3]
    })
  ];
  return stackOption(
    OPT_MULTI_A,
    basket,
    [
      coverage({
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
        upperLimitAmount: null,
        contributors: [
          {
            amount: 500,
            productId: PRD_C,
            productName: "Vitamin C 500",
            source: "selected",
            unit: "mg"
          }
        ]
      }),
      coverage({
        coveragePercent: 100,
        currentAmount: 0,
        deliveredAmount: 2000,
        name: "Vitamin D3",
        percentOfUpperLimit: null,
        remainingGap: 0,
        requestedAmount: 2000,
        status: "covered",
        supplementId: SUP_D3,
        totalExposureAmount: 2000,
        unit: "IU",
        upperLimitAmount: null,
        contributors: [
          {
            amount: 2000,
            productId: PRD_C2,
            productName: "Vitamin D3 1000",
            source: "selected",
            unit: "IU"
          }
        ]
      })
    ],
    locale
  );
}

function multiOptionB(locale: string) {
  const selected = multiOptionA(locale);
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      locale,
      lineTotalMinor: 28000,
      productId: PRD_C2,
      productName: "Combo C+D3",
      supplementIds: [SUP_C, SUP_D3]
    }),
    basketItem({
      dailyPills: 1,
      daysOfSupply: 45,
      locale,
      lineTotalMinor: 12000,
      productId: PRD_D3_A,
      productName: "Vitamin D3 600",
      supplementIds: [SUP_D3]
    })
  ];
  return {
    ...stackOption(OPT_MULTI_B, basket, selected.coverage, locale),
    reason: agenticMessage(negotiateLocale(locale), "plan.selection.reduces_pills")
  };
}

function lowPillsOption(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      locale,
      lineTotalMinor: 25000,
      productId: PRD_C2,
      productName: "Combo C+D3 low pills",
      supplementIds: [SUP_C, SUP_D3]
    })
  ];
  return stackOption(OPT_LOW, basket, multiOptionA(locale).coverage, locale);
}

function d3Option(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      locale,
      lineTotalMinor: 9000,
      productId: PRD_D3_A,
      productName: "Vitamin D3 600",
      supplementIds: [SUP_D3]
    }),
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      locale,
      lineTotalMinor: 11000,
      productId: PRD_D3_B,
      productName: "Vitamin D3 1200",
      supplementIds: [SUP_D3]
    })
  ];
  return stackOption(
    OPT_D3,
    basket,
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
    locale
  );
}

function omegaOption(locale: string) {
  const basket = [
    basketItem({
      dailyPills: 1,
      daysOfSupply: 30,
      locale,
      lineTotalMinor: 22000,
      productId: PRD_OMEGA,
      productName: "Omega-3 1104",
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
    locale
  );
}

function matchFor(state: CanonicalPlanState) {
  const locale = state.locale || "en";
  const hasApixaban = state.medicationCodes.includes("apixaban");
  const hasOmega = state.targets.some((item) => /omega/i.test(item.name));
  const onlyD3 =
    state.targets.length === 1 &&
    state.targets.some((item) => /vitamin d/i.test(item.name) && item.amount === 2000);
  const multi = state.targets.length >= 2;
  const maxPills = state.requirements.maxDailyPills;

  if (hasApixaban && hasOmega) {
    const selected = omegaOption(locale);
    return { alternatives: [], leftovers: [], selected };
  }

  if (onlyD3) {
    const selected = d3Option(locale);
    return { alternatives: [], leftovers: [], selected };
  }

  if (multi && maxPills != null && maxPills <= 3) {
    const selected = lowPillsOption(locale);
    return { alternatives: [multiOptionA(locale)], leftovers: [], selected };
  }

  if (multi) {
    const selected = multiOptionA(locale);
    return { alternatives: [multiOptionB(locale)], leftovers: [], selected };
  }

  const selected = singleOption(locale);
  return { alternatives: [], leftovers: [], selected };
}

function profile() {
  return { ageYears: 52, lifeStage: "adult" as const, sex: "male" as const };
}

function singleRequest(overrides: Record<string, unknown> = {}) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "fewest_pills",
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
    optimization: "fewest_pills",
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
    optimization: "fewest_pills",
    profile: profile(),
    requirements: {},
    targets: [{ amount: 1000, name: "Omega-3", supplementId: SUP_OMEGA, unit: "mg" }],
    ...overrides
  };
}

type Harness = Readonly<{
  call: (name: string, args: unknown) => Promise<Record<string, unknown>>;
  list: () => Promise<unknown>;
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
    async list() {
      const response = await handleJsonRpc(runtime, {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list"
      });
      return asRecord(response).result;
    },
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
  return Array.isArray(value.nextActions)
    ? value.nextActions.filter((item): item is string => typeof item === "string")
    : [];
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

function alternativesOf(value: Record<string, unknown>) {
  return Array.isArray(value.alternatives) ? value.alternatives.map(asRecord) : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function runCase(
  id: string,
  work: () => Promise<AeCaseResult>
): Promise<AeCaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function canonicalAeReport(report: AePackReport) {
  return JSON.stringify({
    cases: report.cases.map((item) => ({
      evidence: sortedKeys(item.evidence),
      id: item.id,
      result: item.result
    })),
    contractVersion: report.contractVersion,
    passedCases: report.passedCases,
    totalCases: report.totalCases
  });
}

export async function runAePack(): Promise<AePackReport> {
  const previousCeilings = matcherSafetyCeilings();
  beginDeterministicIdsForTests();
  setMatcherSafetyCeilings([]);
  const previousRuntime = null;
  setAgenticRuntimeForTests(null);

  try {
    const cases: AeCaseResult[] = [];

    cases.push(
      await runCase("AE-01", async () => {
        const harness = createHarness();
        const listed = asRecord(await harness.list());
        const tools = Array.isArray(listed.tools) ? listed.tools.map(asRecord) : [];
        const descriptions = tools.map((tool) => String(tool.description ?? ""));
        const tooLong = descriptions.filter((item) => wordCount(item) > 180);
        const banned = descriptions.filter((item) => BANNED_DESCRIPTION.test(item));
        const empty = descriptions.filter((item) => item.trim().length === 0);
        return tools.length > 0 &&
          empty.length === 0 &&
          tooLong.length === 0 &&
          banned.length === 0
          ? pass("AE-01", { toolCount: tools.length })
          : fail("AE-01", {
              banned: banned.length,
              empty: empty.length,
              tooLong: tooLong.length,
              toolCount: tools.length
            });
      })
    );

    cases.push(
      await runCase("AE-02", async () => {
        const harness = createHarness();
        const listed = asRecord(await harness.list());
        const tools = Array.isArray(listed.tools) ? listed.tools.map(asRecord) : [];
        const plan = tools.find((tool) => tool.name === "plan") ?? {};
        const schema = asRecord(plan.inputSchema);
        const properties = asRecord(schema.properties);
        const operation = asRecord(properties.operation);
        const enumOps = Array.isArray(operation.enum)
          ? operation.enum.filter((item): item is string => typeof item === "string")
          : [];
        const branches = Array.isArray(schema.oneOf) ? schema.oneOf.map(asRecord) : [];
        const branchOps = branches.map((branch) => {
          const branchProperties = asRecord(branch.properties);
          return String(asRecord(branchProperties.operation).const ?? "");
        }).filter(Boolean);
        const operations = enumOps.length > 0 ? enumOps : branchOps;
        const expected = ["create", "revise", "answer", "select", "get"];
        const ok =
          expected.every((item) => operations.includes(item)) &&
          typeof properties.idempotencyKey === "object" &&
          typeof properties.request === "object" &&
          typeof properties.planHandle === "object" &&
          typeof properties.expectedRevision === "object" &&
          typeof properties.optionId === "object" &&
          typeof properties.answers === "object" &&
          !/"\$defs"/.test(JSON.stringify(schema)) &&
          !Array.isArray(schema.oneOf);
        return ok
          ? pass("AE-02", { operations: expected })
          : fail("AE-02", { operations, requiredByOp: {} });
      })
    );

    cases.push(
      await runCase("AE-03", async () => {
        const harness = createHarness();
        const result = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "short"
        });
        const error = asRecord(result.error);
        const issues = Array.isArray(error.issues) ? error.issues.map(asRecord) : [];
        const blob = JSON.stringify(result);
        const ok =
          result.ok === false &&
          (error.error_code === "invalid_request" || error.reasonCode === "invalid_request") &&
          issues.length > 0 &&
          issues.every(
            (issue) =>
              typeof issue.fieldPath === "string" &&
              issue.fieldPath.length > 0 &&
              typeof issue.messageKey === "string" &&
              issue.messageKey.length > 0
          ) &&
          jsonSize(result) <= 2048 &&
          !/Failed validating|On instance|oneOf|schema dump/i.test(blob);
        return ok
          ? pass("AE-03", { bytes: jsonSize(result), issueCount: issues.length })
          : fail("AE-03", {
              bytes: jsonSize(result),
              error_code: error.error_code ?? null,
              issueCount: issues.length,
              ok: result.ok ?? null
            });
      })
    );

    cases.push(
      await runCase("AE-04", async () => {
        const harness = createHarness();
        const info = await harness.call("info", {});
        const countries = Array.isArray(info.supportedCountries)
          ? info.supportedCountries
          : [];
        const locales = stringList(info.supportedLocales);
        const meds = stringList(info.medicationCodes);
        const conditions = stringList(info.conditionCodes);
        const keys = Object.keys(info);
        const ok =
          info.ok === true &&
          jsonSize(info) <= 4096 &&
          countries.length > 0 &&
          locales.includes("en") &&
          info.userAccountRequired === false &&
          info.continuation === "polling_only" &&
          meds.includes("apixaban") &&
          conditions.includes("ckd") &&
          !keys.includes("recognisedNames") &&
          !keys.includes("latency") &&
          !keys.includes("schemaChecksum") &&
          !keys.includes("migrationVersion") &&
          !keys.includes("checkoutBuild");
        return ok
          ? pass("AE-04", { bytes: jsonSize(info) })
          : fail("AE-04", { bytes: jsonSize(info), keys: keys.sort() });
      })
    );

    cases.push(
      await runCase("AE-05", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae05-create-000001",
          request: singleRequest()
        });
        const blob = JSON.stringify(created);
        const ok =
          created.ok === true &&
          created.status === "ready" &&
          jsonSize(created) <= 8192 &&
          !MATCHER_DIAGNOSTIC.test(blob);
        return ok
          ? pass("AE-05", { bytes: jsonSize(created), status: created.status })
          : fail("AE-05", { bytes: jsonSize(created), status: created.status ?? null });
      })
    );

    cases.push(
      await runCase("AE-06", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae06-create-000001",
          request: singleRequest()
        });
        const blob = JSON.stringify(created);
        const next = nextActionsOf(created);
        const ok =
          created.ok === true &&
          !/checkoutUrl|paymentIntent|orderHandle|feedbackInvitation|feedback\.invitation/i.test(
            blob
          ) &&
          !next.some((item) => /feedback/i.test(item));
        return ok
          ? pass("AE-06", { nextActions: next })
          : fail("AE-06", { nextActions: next });
      })
    );

    cases.push(
      await runCase("AE-07", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae07-create-000001",
          request: singleRequest({ medicationCodes: ["warfarin"] })
        });
        const questions = questionsOf(created);
        const next = nextActionsOf(created);
        const ok =
          created.status === "needs_input" &&
          created.safetyScope === "partial" &&
          stringList(created.assessedMedicationCodes).length === 0 &&
          stringList(created.unassessedMedicationCodes).join() === "warfarin" &&
          next.some((item) => /answer/i.test(item)) &&
          !next.some((item) => /execute/i.test(item)) &&
          questions.some(
            (item) => item.promptKey === "plan.question.unassessed_medical_context"
          );
        return ok
          ? pass("AE-07", {
              safetyScope: created.safetyScope,
              unassessedMedicationCodes: stringList(created.unassessedMedicationCodes)
            })
          : fail("AE-07", {
              nextActions: next,
              safetyScope: created.safetyScope ?? null,
              status: created.status ?? null,
              unassessedMedicationCodes: stringList(created.unassessedMedicationCodes)
            });
      })
    );

    cases.push(
      await runCase("AE-08", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae08-create-000001",
          request: singleRequest({ conditionCodes: ["diabetes"] })
        });
        const questions = questionsOf(created);
        const next = nextActionsOf(created);
        const ok =
          created.status === "needs_input" &&
          created.safetyScope === "partial" &&
          stringList(created.assessedConditionCodes).length === 0 &&
          stringList(created.unassessedConditionCodes).join() === "diabetes" &&
          next.some((item) => /answer/i.test(item)) &&
          !next.some((item) => /execute/i.test(item)) &&
          questions.some(
            (item) => item.promptKey === "plan.question.unassessed_medical_context"
          );
        return ok
          ? pass("AE-08", {
              safetyScope: created.safetyScope,
              unassessedConditionCodes: stringList(created.unassessedConditionCodes)
            })
          : fail("AE-08", {
              nextActions: next,
              safetyScope: created.safetyScope ?? null,
              status: created.status ?? null,
              unassessedConditionCodes: stringList(created.unassessedConditionCodes)
            });
      })
    );

    cases.push(
      await runCase("AE-09", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae09-create-000001",
          request: omegaRequest()
        });
        const guidance = guidanceOf(created).filter(
          (item) => item.code === "medication_interaction"
        );
        const only = guidance[0] ?? {};
        const contributors = Array.isArray(only.contributors)
          ? only.contributors.map(asRecord)
          : [];
        const exposure = Number(only.exposure);
        const contributorSum = contributors.reduce(
          (sum, item) => sum + Number(item.amount ?? 0),
          0
        );
        const questions = questionsOf(created);
        const ackChoices = questions.flatMap((question) =>
          Array.isArray(question.choices) ? question.choices.map(asRecord) : []
        );
        const ok =
          created.status === "needs_input" &&
          created.safetyScope === "complete" &&
          stringList(created.assessedMedicationCodes).join() === "apixaban" &&
          stringList(created.unassessedMedicationCodes).length === 0 &&
          guidance.length === 1 &&
          only.action === "acknowledge" &&
          created.acknowledgementStatus === "pending" &&
          Number.isFinite(exposure) &&
          exposure > 0 &&
          exposure === contributorSum &&
          questions.length === 1 &&
          ackChoices.some((item) => item.choice === "acknowledge_safety");
        return ok
          ? pass("AE-09", { exposure, status: created.status })
          : fail("AE-09", {
              assessedMedicationCodes: stringList(created.assessedMedicationCodes),
              exposure: Number.isFinite(exposure) ? exposure : null,
              guidanceCount: guidance.length,
              questionCount: questions.length,
              safetyScope: created.safetyScope ?? null,
              status: created.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AE-10", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae10-create-000001",
          request: d3Request()
        });
        const guidance = guidanceOf(created);
        const blocking = guidance.filter(
          (item) =>
            item.severity === "high" ||
            item.severity === "blocking" ||
            item.action === "acknowledge" ||
            item.requiresSafetyAcknowledgement === true
        );
        const ok =
          created.status === "ready" &&
          questionsOf(created).length === 0 &&
          blocking.length === 0 &&
          nextActionsOf(created).includes("confirm_with_user");
        return ok
          ? pass("AE-10", { status: created.status })
          : fail("AE-10", {
              blocking: blocking.map((item) => item.code),
              nextActions: nextActionsOf(created),
              questionCount: questionsOf(created).length,
              status: created.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AE-11", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae11-create-000001",
          request: multiRequest()
        });
        const basket = basketOf(created);
        const summary = asRecord(created.stackSummary);
        const productCount = basket.length;
        const totalDailyPills = basket.reduce(
          (sum, item) => sum + Number(item.dailyPills ?? 0),
          0
        );
        const totalPriceMinor = basket.reduce(
          (sum, item) => sum + Number(item.lineTotalMinor ?? 0),
          0
        );
        const supplyDays = basket.reduce((min, item) => {
          const days = Number(item.daysOfSupply ?? 0);
          return days > 0 && days < min ? days : min;
        }, Number.POSITIVE_INFINITY);
        const dailyCostMinor =
          Number.isFinite(supplyDays) && supplyDays > 0
            ? Math.round(totalPriceMinor / supplyDays)
            : 0;
        const ok =
          created.ok === true &&
          created.status === "ready" &&
          productCount >= 2 &&
          summary.currency === "THB" &&
          summary.productCount === productCount &&
          summary.totalDailyPills === totalDailyPills &&
          summary.totalPriceMinor === totalPriceMinor &&
          summary.supplyDays === supplyDays &&
          summary.dailyCostMinor === dailyCostMinor;
        return ok
          ? pass("AE-11", {
              dailyCostMinor,
              productCount,
              supplyDays,
              totalDailyPills,
              totalPriceMinor
            })
          : fail("AE-11", { productCount, status: created.status ?? null, summary });
      })
    );

    cases.push(
      await runCase("AE-12", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae12-create-000001",
          request: multiRequest()
        });
        const allowed = new Set([
          "best_available",
          "best_available_dose",
          "consolidates_targets",
          "covers_target",
          "reduces_cost",
          "reduces_pills",
          "retained_by_user"
        ]);
        const lines = basketOf(created);
        const bad = lines.filter((item) => {
          const reason = asRecord(item.selectionReason);
          const ids = stringList(reason.requestedSupplementIds);
          return (
            !allowed.has(String(reason.code ?? "")) ||
            typeof reason.messageKey !== "string" ||
            !reason.messageKey ||
            typeof reason.message !== "string" ||
            String(reason.message).length > 180 ||
            ids.length < 1 ||
            ids.some((id) => !id.startsWith("sup_"))
          );
        });
        return lines.length >= 2 && bad.length === 0
          ? pass("AE-12", { lineCount: lines.length })
          : fail("AE-12", { badCount: bad.length, lineCount: lines.length });
      })
    );

    cases.push(
      await runCase("AE-13", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae13-create-000001",
          request: multiRequest()
        });
        const listed = Array.isArray(created.options)
          ? created.options.map(asRecord)
          : [
              {
                optionId: created.optionId,
                reason: created.reason,
                reasonKey: created.reasonKey,
                stackSummary: created.stackSummary
              },
              ...alternativesOf(created)
            ];
        const options = listed;
        const ids = options.map((item) => String(asRecord(item).optionId ?? ""));
        const other =
          options.find(
            (item) => item.selected === false || item.optionId !== created.optionId
          ) ?? options[1];
        const otherId = String(asRecord(other).optionId ?? "");
        const before = harness.port.getCallCount();
        const selected = await harness.call("plan", {
          expectedRevision: created.revision,
          idempotencyKey: "ae13-select-000001",
          operation: "select",
          optionId: otherId,
          planHandle: created.planHandle
        });
        const unique = new Set(ids.filter(Boolean)).size === ids.filter(Boolean).length;
        const optionOk = options.every((item) => {
          const row = asRecord(item);
          return (
            asRecord(row.stackSummary).productCount != null &&
            typeof row.reason === "string" &&
            String(row.reason).length > 0 &&
            typeof row.reasonKey === "string" &&
            String(row.reasonKey).length > 0
          );
        });
        const ok =
          options.length >= 2 &&
          unique &&
          ids.includes(String(created.optionId ?? "")) &&
          optionOk &&
          selected.planHandle === created.planHandle &&
          selected.revision === Number(created.revision) + 1 &&
          selected.optionId === otherId &&
          harness.port.getCallCount() === before;
        return ok
          ? pass("AE-13", { optionCount: options.length, selected: selected.optionId })
          : fail("AE-13", {
              optionCount: options.length,
              rematched: harness.port.getCallCount() !== before,
              selected: selected.optionId ?? null,
              status: selected.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AE-14", async () => {
        const harness = createHarness();
        const payload = {
          operation: "create",
          idempotencyKey: "ae14-create-000001",
          request: singleRequest()
        };
        const first = await harness.call("plan", payload);
        const second = await harness.call("plan", payload);
        const ok =
          JSON.stringify(first) === JSON.stringify(second) &&
          harness.port.getCallCount() === 1;
        return ok
          ? pass("AE-14", { revision: first.revision })
          : fail("AE-14", { matchCount: harness.port.getCallCount() });
      })
    );

    cases.push(
      await runCase("AE-15", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae15-create-000001",
          request: omegaRequest()
        });
        const before = harness.port.getCallCount();
        const answered = await harness.call("plan", {
          answers: [
            { choice: "acknowledge_safety", questionId: "q_safety_ack" }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ae15-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const blob = JSON.stringify(answered);
        const ok =
          answered.planHandle === created.planHandle &&
          answered.optionId === created.optionId &&
          answered.revision === Number(created.revision) + 1 &&
          answered.status === "ready" &&
          !MATCHER_DIAGNOSTIC.test(blob) &&
          harness.port.getCallCount() === before;
        return ok
          ? pass("AE-15", { revision: answered.revision, status: answered.status })
          : fail("AE-15", {
              matchCount: harness.port.getCallCount(),
              optionId: answered.optionId ?? null,
              status: answered.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AE-16", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae16-create-000001",
          request: multiRequest()
        });
        const before = harness.port.getCallCount();
        const revised = await harness.call("plan", {
          expectedRevision: created.revision,
          idempotencyKey: "ae16-revise-000001",
          operation: "revise",
          planHandle: created.planHandle,
          request: multiRequest({ requirements: { maxDailyPills: 3 } })
        });
        const pills = Number(asRecord(revised.stackSummary).totalDailyPills ?? revised.dailyPills);
        const ok =
          revised.planHandle === created.planHandle &&
          revised.revision === Number(created.revision) + 1 &&
          harness.port.getCallCount() === before + 1 &&
          pills <= 3;
        return ok
          ? pass("AE-16", { pills, revision: revised.revision })
          : fail("AE-16", {
              matchCount: harness.port.getCallCount() - before,
              pills,
              status: revised.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AE-17", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae17-create-000001",
          request: omegaRequest()
        });
        const answered = await harness.call("plan", {
          answers: [
            { choice: "acknowledge_safety", questionId: "q_safety_ack" }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ae17-answer-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const stale = await harness.call("plan", {
          answers: [
            { choice: "acknowledge_safety", questionId: "q_safety_ack" }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ae17-stale-000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const error = asRecord(stale.error);
        const beforeGet = harness.port.getCallCount();
        const current = await harness.call("plan", {
          operation: "get",
          planHandle: created.planHandle
        });
        const ok =
          stale.ok === false &&
          (error.error_code === "stale_revision" || error.reasonCode === "stale_revision") &&
          error.currentRevision === answered.revision &&
          error.retryable === true &&
          stringList(error.nextActions).includes("reload_plan") &&
          current.revision === answered.revision &&
          current.optionId === answered.optionId &&
          harness.port.getCallCount() === beforeGet;
        return ok
          ? pass("AE-17", { currentRevision: current.revision })
          : fail("AE-17", {
              currentRevision: error.currentRevision ?? null,
              error_code: error.error_code ?? error.reasonCode ?? null,
              getRevision: current.revision ?? null,
              rematched: harness.port.getCallCount() !== beforeGet
            });
      })
    );

    cases.push(
      await runCase("AE-18", async () => {
        const harness = createHarness({ deferProcessing: true });
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae18-create-000001",
          request: singleRequest()
        });
        const allowed = new Set([
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
        const keys = Object.keys(created);
        const extra = keys.filter((key) => !allowed.has(key));
        const missing = [...allowed].filter((key) => !keys.includes(key));
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
          ? pass("AE-18", { getStatus: gotten.status, pollAfterSeconds: created.pollAfterSeconds })
          : fail("AE-18", {
              extra,
              getStatus: gotten.status ?? null,
              matchCount: harness.port.getCallCount(),
              missing,
              status: created.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AE-19", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          operation: "create",
          idempotencyKey: "ae19-create-000001",
          request: omegaRequest({ locale: "th" })
        });
        const questions = questionsOf(created);
        const choices = questions.flatMap((question) =>
          Array.isArray(question.choices) ? question.choices.map(asRecord) : []
        );
        const reasons = basketOf(created).map((item) => asRecord(item.selectionReason));
        const texts = [
          { key: "summary", max: 180, text: String(created.summary ?? ""), messageKey: created.summaryKey },
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
        const banned = texts.filter((item) => BANNED_COPY.test(item.text));
        const localeOk = created.locale === "th";
        const ok =
          localeOk && tooLong.length === 0 && unkeyed.length === 0 && banned.length === 0;
        return ok
          ? pass("AE-19", { locale: created.locale, textCount: texts.length })
          : fail("AE-19", {
              banned: banned.map((item) => item.key),
              locale: created.locale ?? null,
              tooLong: tooLong.map((item) => item.key),
              unkeyed: unkeyed.map((item) => item.key)
            });
      })
    );

    const byId = new Map(cases.map((item) => [item.id, item]));
    const ordered = CASE_IDS.map(
      (id) => byId.get(id) ?? fail(id, { missing: true })
    );

    return {
      cases: ordered,
      contractVersion: "agentic-experience-1.0",
      passedCases: ordered.filter((item) => item.result === "PASS").length,
      totalCases: 19
    };
  } finally {
    endDeterministicIdsForTests();
    setMatcherSafetyCeilings(previousCeilings);
    if (previousCeilings.length === 0) {
      resetMatcherSafetyCeilings();
    }
    setAgenticRuntimeForTests(previousRuntime);
  }
}

if (process.env.NODE_TEST_CONTEXT) {
  describe("agentic experience pack", () => {
    it("reports 19/19 with a stable canonical encoding", async () => {
      const report = await runAePack();
      assert.equal(report.totalCases, 19);
      assert.equal(report.cases.length, 19);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...CASE_IDS]
      );
      assert.equal(report.passedCases, 19);
      const encoded = canonicalAeReport(report);
      assert.equal(typeof encoded, "string");
      assert.equal(encoded, canonicalAeReport(JSON.parse(encoded) as AePackReport));
    });
  });
}
