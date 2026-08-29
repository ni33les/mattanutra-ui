import {
  beginDeterministicIdsForTests,
  endDeterministicIdsForTests,
  issueCapability,
  nextTestUuid,
  type CapabilityScope
} from "../../lib/agentic/capabilities.ts";
import { loadAgenticConfig, type AgenticConfig } from "../../lib/agentic/config.ts";
import { FIXTURE_PRODUCTS } from "../../lib/agentic/catalogue/fixtures.ts";
import { ACTIVE_RETAILER_ID, ACTIVE_RETAILER_NAME } from "../../lib/agentic/catalogue/market.ts";
import { createMockPaymentAdapter } from "../../lib/agentic/commerce/payment.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import type {
  BasketItem,
  PlanResult,
  SafetyGuidance,
  StackOption
} from "../../lib/agentic/plan/types.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../../lib/agentic/runtime.ts";
import { createMemoryStore } from "../../lib/agentic/store/memory.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./gold-catalogue.ts";

export const COM_FIXED_NOW = "2026-08-29T00:00:00.000Z";
export const COM_EXPIRED_NOW = "2026-08-29T00:16:00.000Z";
export const COM_PACK_VERSION = "commercial-1.0" as const;

export const COM_OPT_A = "opt_com_plan_a";
export const COM_OPT_B_LOW = "opt_com_b_low";
export const COM_OPT_B_MID = "opt_com_b_mid";
export const COM_OPT_B_HIGH = "opt_com_b_high";
export const COM_SAFETY_ID = "sg_com_apixaban";
export const COM_SNAPSHOT_ID = "snap_com_v1";
export const COM_CATALOGUE_VERSION = "dev-3.0.0";

export const COM_PRD_D3 = FIXTURE_PRODUCTS[0]!;
export const COM_PRD_O3 = FIXTURE_PRODUCTS[1]!;
export const COM_PRD_MG = FIXTURE_PRODUCTS[3]!;
export const COM_PRD_B12 = FIXTURE_PRODUCTS[4]!;

export const COM_CASE_IDS = [
  "COM-01",
  "COM-02",
  "COM-03",
  "COM-04",
  "COM-05",
  "COM-06",
  "COM-07",
  "COM-08",
  "COM-09",
  "COM-10",
  "COM-11",
  "COM-12",
  "COM-13",
  "COM-14",
  "COM-15",
  "COM-16",
  "COM-17",
  "COM-18",
  "COM-19",
  "COM-20",
  "COM-21",
  "COM-22",
  "COM-23",
  "COM-24",
  "COM-25",
  "COM-26",
  "COM-27",
  "COM-28",
  "COM-29",
  "COM-30",
  "COM-31",
  "COM-32",
  "COM-33",
  "COM-34",
  "COM-35",
  "COM-36",
  "COM-37",
  "COM-38",
  "COM-39",
  "COM-40",
  "COM-41",
  "COM-42",
  "COM-43",
  "COM-44",
  "COM-45",
  "COM-46",
  "COM-47",
  "COM-48",
  "COM-49",
  "COM-50"
] as const;

export type ComCaseId = (typeof COM_CASE_IDS)[number];

export const COM_LEAK_NEEDLES = [
  "Failed validating",
  "On instance",
  "Schema:",
  "$defs",
  "oneOf",
  "stack trace",
  "sk_live",
  "pk_live",
  "whsec_",
  "operator does not exist",
  "at Object."
] as const;

const GUIDANCE_RULES_VERSION = "3.0.0";

export function comConfig(): AgenticConfig {
  return {
    ...loadAgenticConfig(),
    checkoutTtlMs: 15 * 60 * 1000,
    continuation: "polling_only",
    environment: "dev",
    internalQaHarness: true,
    paymentProvider: "mock",
    thailandRetailerAdapter: "mock_thailand"
  };
}

export function comScope(): CapabilityScope {
  return {
    environment: "dev",
    principalScope: "com-tester",
    tenantScope: "mattanutra"
  };
}

export function beginComRun() {
  if (!process.env.NODE_TEST_CONTEXT) {
    process.env.NODE_TEST_CONTEXT = "com-pack";
  }
  beginDeterministicIdsForTests();
  installGoldCatalogue();
}

export function endComRun() {
  setAgenticRuntimeForTests(null);
  uninstallGoldCatalogue();
  endDeterministicIdsForTests();
}

export function createComRuntime(now = COM_FIXED_NOW): AgenticRuntime {
  const config = comConfig();
  const runtime = createAgenticRuntime({
    config,
    now,
    payment: createMockPaymentAdapter(),
    scope: comScope(),
    store: createMemoryStore()
  });
  setAgenticRuntimeForTests(runtime);
  return runtime;
}

export function withNow(runtime: AgenticRuntime, now: string): AgenticRuntime {
  const next = createAgenticRuntime({
    config: runtime.config,
    now,
    payment: runtime.payment,
    scope: runtime.scope,
    store: runtime.store
  });
  setAgenticRuntimeForTests(next);
  return next;
}

export async function comCall(
  runtime: AgenticRuntime,
  name: string,
  args: unknown
): Promise<Record<string, unknown>> {
  const response = await handleJsonRpc(runtime, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: args, name }
  });
  const result = response?.result;
  if (!result || typeof result !== "object") {
    return { ok: false, error: { reasonCode: "not_found", message: "empty_rpc" } };
  }
  const structured = (result as { structuredContent?: unknown }).structuredContent;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    return structured as Record<string, unknown>;
  }
  return { ok: false, error: { reasonCode: "not_found", message: "empty_structured" } };
}

export async function comListTools(runtime: AgenticRuntime) {
  const response = await handleJsonRpc(runtime, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/list"
  });
  return ((response?.result?.tools as Array<Record<string, unknown>> | undefined) ?? []).map(
    (tool) => ({
      inputSchema: tool.inputSchema,
      name: tool.name
    })
  );
}

function basketFromProduct(
  product: (typeof FIXTURE_PRODUCTS)[number],
  quantity = 1
): BasketItem {
  const lineTotalMinor = product.unitPriceMinor * quantity;
  return {
    availabilityAsOf: COM_FIXED_NOW,
    contributionSupplementIds: [...product.contributionSupplementIds],
    currency: "THB",
    dailyPills: product.dailyPills,
    daysOfSupply: 30,
    deliveryWindow: "3-5 days",
    fixture: true,
    form: product.form,
    imageUrl: null,
    incidentalNutrientNames: [],
    incidentalNutrients: [],
    incompleteCommercialFacts: false,
    lineTotalMinor,
    pillsPerServing: 1,
    productId: product.productId,
    productName: product.candidate.title,
    quantity,
    requestedNutrientNames: [product.candidate.facts[0]?.name ?? product.candidate.title],
    retailerSku: product.retailerSku,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    servingsPerDay: 1,
    source: "fixture",
    stockStatus: "in_stock",
    unitPriceMinor: product.unitPriceMinor
  };
}

function optionFromBasket(
  optionId: string,
  items: readonly BasketItem[],
  reason: string
): StackOption {
  const totalPriceMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const dailyPills = items.reduce((sum, item) => sum + item.dailyPills * item.quantity, 0);
  return {
    basket: items,
    coverage: [],
    coveragePercent: 100,
    dailyPills,
    matcherVersion: "pareto-hybrid-1",
    optionId,
    reason,
    snapshotId: COM_SNAPSHOT_ID,
    totalPriceMinor
  };
}

function safetyGuidance(action: SafetyGuidance["action"]): SafetyGuidance {
  return {
    action,
    code: "medication_interaction",
    contributors: [],
    exposure: null,
    guidanceId: COM_SAFETY_ID,
    message: "Apixaban interaction acknowledged.",
    messageKey: "plan.safety.medication_interaction",
    nutrientName: null,
    productIds: [COM_PRD_B12.productId],
    ruleId: "rule_com_apixaban",
    rulesVersion: GUIDANCE_RULES_VERSION,
    severity: action === "block" ? "blocking" : "high",
    sourceScope: "supplemental",
    supplementIds: [...COM_PRD_B12.contributionSupplementIds],
    threshold: null,
    unit: null
  };
}

function requestSnapshot(selectedOptionId: string | null) {
  return {
    acceptedGaps: [],
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    leftovers: [],
    locale: "en",
    medicationCodes: selectedOptionId === COM_OPT_B_LOW ? ["apixaban"] : [],
    optimization: "lowest_cost" as const,
    pinnedOptionId: selectedOptionId,
    profile: {
      ageYears: 38,
      lifeStage: "adult" as const,
      sex: "male" as const
    },
    requirements: {},
    safetyAcknowledgement:
      selectedOptionId === COM_OPT_B_LOW
        ? {
            confirmed: true as const,
            guidanceIds: [COM_SAFETY_ID],
            revision: 1
          }
        : null,
    targets: [
      {
        amount: 1000,
        name: "Vitamin D3",
        supplementId: COM_PRD_D3.contributionSupplementIds[0] ?? "sup_d3",
        unit: "IU" as const
      }
    ]
  };
}

function planResult(input: Readonly<{
  alternatives?: readonly StackOption[];
  questions?: PlanResult["questions"];
  safetyGuidance?: readonly SafetyGuidance[];
  selected: StackOption | null;
  status: PlanResult["status"];
}>): PlanResult {
  const selectedOptionId = input.selected?.optionId ?? null;
  return {
    alternatives: input.alternatives ?? [],
    appliedRequirements: [],
    assumptions: [],
    availabilityAsOf: COM_FIXED_NOW,
    basket: input.selected?.basket ?? [],
    catalogueVersion: COM_CATALOGUE_VERSION,
    changeSummary: [],
    coverage: input.selected?.coverage ?? [],
    guidanceRulesVersion: GUIDANCE_RULES_VERSION,
    leftovers: [],
    matcherTelemetry: {
      constraints: {
        conditionCodes: [],
        medicationCodes: [],
        ...requestSnapshot(selectedOptionId).requirements
      },
      coveragePercent: input.selected?.coveragePercent ?? null,
      leftovers: [],
      matcherVersion: "pareto-hybrid-1",
      productIds: (input.selected?.basket ?? []).map((item) => item.productId),
      productSkus: (input.selected?.basket ?? []).map((item) => item.retailerSku),
      requestedDoses: [],
      requestedNames: [],
      selectedOptionId,
      snapshotId: COM_SNAPSHOT_ID
    },
    optimizationEvidence: {
      mode: "lowest_cost",
      tieBreak: ["lowest_cost", "fewest_pills"]
    },
    questions: input.questions ?? [],
    requestSnapshot: requestSnapshot(selectedOptionId),
    safetyGuidance: input.safetyGuidance ?? [],
    selected: input.selected,
    status: input.status,
    summary: "Commercial fixture plan.",
    unmetRequirements: []
  };
}

export function planAResult(): PlanResult {
  const selected = optionFromBasket(
    COM_OPT_A,
    [basketFromProduct(COM_PRD_D3)],
    "Single ready option"
  );
  return planResult({ alternatives: [], selected, status: "ready" });
}

export function planBResult(): PlanResult {
  const low = optionFromBasket(
    COM_OPT_B_LOW,
    [basketFromProduct(COM_PRD_B12), basketFromProduct(COM_PRD_MG)],
    "Lower-cost selected option"
  );
  const mid = optionFromBasket(
    COM_OPT_B_MID,
    [basketFromProduct(COM_PRD_D3), basketFromProduct(COM_PRD_MG)],
    "Mid-cost alternative"
  );
  const high = optionFromBasket(
    COM_OPT_B_HIGH,
    [basketFromProduct(COM_PRD_O3), basketFromProduct(COM_PRD_MG)],
    "Higher-cost alternative"
  );
  return planResult({
    alternatives: [mid, high],
    safetyGuidance: [safetyGuidance("acknowledge")],
    selected: low,
    status: "ready"
  });
}

export function needsInputResult(): PlanResult {
  return planResult({
    questions: [
      {
        choices: [
          {
            choice: "acknowledge_safety",
            effect: "acknowledge",
            label: "Acknowledge"
          }
        ],
        prompt: "Safety acknowledgement required.",
        promptKey: "plan.question.safety",
        questionId: "q_safety_ack"
      }
    ],
    selected: null,
    status: "needs_input"
  });
}

export function blockedResult(): PlanResult {
  return planResult({
    safetyGuidance: [safetyGuidance("block")],
    selected: null,
    status: "blocked"
  });
}

export type SeededPlan = Readonly<{
  planHandle: string;
  planId: string;
  result: PlanResult;
  revision: number;
  selectedOptionId: string | null;
}>;

async function seedPlan(
  runtime: AgenticRuntime,
  input: Readonly<{
    currentRevision?: number;
    result: PlanResult;
    revision: number;
    status?: PlanResult["status"];
  }>
): Promise<SeededPlan> {
  const planId = nextTestUuid();
  const revision = input.revision;
  const currentRevision = input.currentRevision ?? revision;
  const now = runtime.now ?? COM_FIXED_NOW;
  await runtime.store.insertPlan({
    createdAt: now,
    currentRevision,
    environment: "dev",
    id: planId,
    principalScope: runtime.scope.principalScope,
    tenantScope: runtime.scope.tenantScope,
    updatedAt: now
  });
  await runtime.store.insertPlanRevision({
    availabilityAsOf: COM_FIXED_NOW,
    catalogueVersion: COM_CATALOGUE_VERSION,
    createdAt: now,
    guidanceRulesVersion: GUIDANCE_RULES_VERSION,
    planId,
    requestSnapshot: input.result.requestSnapshot,
    result: input.result,
    revision,
    status: input.status ?? input.result.status
  });
  const issued = await issueCapability({
    allowedActions: ["plan.read", "plan.revise", "plan.execute", "feedback.write"],
    config: runtime.config,
    now,
    resourceId: planId,
    resourceType: "plan",
    scope: runtime.scope,
    store: runtime.store
  });
  return {
    planHandle: issued.handle,
    planId,
    result: input.result,
    revision,
    selectedOptionId: input.result.selected?.optionId ?? null
  };
}

export async function seedPlanA(runtime: AgenticRuntime) {
  return seedPlan(runtime, { result: planAResult(), revision: 1 });
}

export async function seedPlanB(runtime: AgenticRuntime) {
  return seedPlan(runtime, { result: planBResult(), revision: 1 });
}

export async function seedNeedsInput(runtime: AgenticRuntime) {
  return seedPlan(runtime, { result: needsInputResult(), revision: 1, status: "needs_input" });
}

export async function seedBlocked(runtime: AgenticRuntime) {
  return seedPlan(runtime, { result: blockedResult(), revision: 1, status: "blocked" });
}

export async function seedSuperseded(runtime: AgenticRuntime) {
  const stale = planAResult();
  const current = planAResult();
  const seeded = await seedPlan(runtime, {
    currentRevision: 2,
    result: stale,
    revision: 1
  });
  await runtime.store.insertPlanRevision({
    availabilityAsOf: COM_FIXED_NOW,
    catalogueVersion: COM_CATALOGUE_VERSION,
    createdAt: runtime.now ?? COM_FIXED_NOW,
    guidanceRulesVersion: GUIDANCE_RULES_VERSION,
    planId: seeded.planId,
    requestSnapshot: current.requestSnapshot,
    result: current,
    revision: 2,
    status: "ready"
  });
  return { ...seeded, currentRevision: 2 };
}

export async function advancePlanRevision(
  runtime: AgenticRuntime,
  planId: string,
  nextRevision: number,
  result: PlanResult
) {
  const plan = await runtime.store.getPlan(planId);
  if (!plan) {
    throw new Error("plan_missing");
  }
  const now = runtime.now ?? COM_FIXED_NOW;
  await runtime.store.insertPlanRevision({
    availabilityAsOf: COM_FIXED_NOW,
    catalogueVersion: COM_CATALOGUE_VERSION,
    createdAt: now,
    guidanceRulesVersion: GUIDANCE_RULES_VERSION,
    planId,
    requestSnapshot: result.requestSnapshot,
    result,
    revision: nextRevision,
    status: result.status
  });
  await runtime.store.updatePlan({
    ...plan,
    currentRevision: nextRevision,
    updatedAt: now
  });
}

export function key(label: string) {
  return `com-key-${label}`.padEnd(16, "x");
}

export function errorOf(value: Record<string, unknown>) {
  const error = value.error;
  return error && typeof error === "object" && !Array.isArray(error)
    ? (error as Record<string, unknown>)
    : {};
}

export function frozenOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function selectedOptionOf(frozen: unknown): string | null {
  const record = frozenOf(frozen);
  const value = record.selectedOptionId ?? record.selected_option_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function leakHits(value: unknown) {
  const text = JSON.stringify(value);
  return COM_LEAK_NEEDLES.filter((needle) => text.includes(needle));
}

export const COM_MARKET = {
  countryCode: "TH",
  currency: "THB",
  retailerId: ACTIVE_RETAILER_ID,
  retailerName: ACTIVE_RETAILER_NAME
} as const;
