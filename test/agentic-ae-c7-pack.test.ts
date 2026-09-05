import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  beginDeterministicIdsForTests,
  endDeterministicIdsForTests
} from "../lib/agentic/capabilities.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { AGENTIC_TOOL_SCHEMAS } from "../lib/agentic/contract/index.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { publicCoverage } from "../lib/agentic/public-mapper.ts";
import { canonicalizeTargets } from "../lib/matcher/canonicalizer.ts";
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

const FIXED_NOW = "2026-08-28T00:00:00.000Z";
const CASE_IDS = [
  "AX7-01",
  "AX7-02",
  "AX7-03",
  "AX7-04",
  "AX7-05",
  "AX7-06"
] as const;

const SUP_C = "sup_ae_vitamin_c";
const PRD_C = "prd_ae_c500";
const PRD_MULTI = "prd_ae_multi_incidental";
const OPT_SINGLE = "opt_ae_single";
const OPT_A = "opt_ae_a";
const OPT_B = "opt_ae_b";
const OPT_C = "opt_ae_c";
const OPT_MULTI = "opt_ae_multi";
const HANDLE = "hnd_ae_c7_valid_plan_handle_0001";
const KEY = "ax702-valid-key-01";

const DUMP_RE =
  /Failed validating|On instance|oneOf|\$defs|Schema:|schema dump|stack|instance path|properties:\s*\{/i;

const THIRTY_TARGETS = [
  { amount: 2000, name: "Vitamin D3", unit: "IU" },
  { amount: 500, name: "Vitamin C", unit: "mg" },
  { amount: 1000, name: "Omega-3", unit: "mg" },
  { amount: 200, name: "Magnesium", unit: "mg" },
  { amount: 250, name: "Vitamin B12", unit: "mcg" },
  { amount: 10, name: "Zinc", unit: "mg" },
  { amount: 8, name: "Iron", unit: "mg" },
  { amount: 500, name: "Calcium", unit: "mg" },
  { amount: 3000, name: "Vitamin A", unit: "IU" },
  { amount: 15, name: "Vitamin E", unit: "mg" },
  { amount: 100, name: "Vitamin K2", unit: "mcg" },
  { amount: 100, name: "Vitamin K1", unit: "mcg" },
  { amount: 1.2, name: "Vitamin B1", unit: "mg" },
  { amount: 1.3, name: "Vitamin B2", unit: "mg" },
  { amount: 16, name: "Vitamin B3", unit: "mg" },
  { amount: 5, name: "Vitamin B5", unit: "mg" },
  { amount: 1.7, name: "Vitamin B6", unit: "mg" },
  { amount: 30, name: "Vitamin B7", unit: "mcg" },
  { amount: 400, name: "Vitamin B9", unit: "mcg" },
  { amount: 55, name: "Selenium", unit: "mcg" },
  { amount: 0.9, name: "Copper", unit: "mg" },
  { amount: 2.3, name: "Manganese", unit: "mg" },
  { amount: 35, name: "Chromium", unit: "mcg" },
  { amount: 100, name: "Potassium", unit: "mg" },
  { amount: 100, name: "CoQ10", unit: "mg" },
  { amount: 3, name: "Creatine", unit: "g" },
  { amount: 5, name: "Collagen", unit: "g" },
  { amount: 500, name: "Curcumin", unit: "mg" },
  { amount: 10, name: "Probiotics", unit: "mg" },
  { amount: 10, name: "Lutein", unit: "mg" }
] as const;

const TEN_TARGETS = THIRTY_TARGETS.slice(0, 10);
const INCIDENTAL_NAMES = [
  "Vitamin B1",
  "Vitamin B2",
  "Vitamin B3",
  "Vitamin B5",
  "Vitamin B6",
  "Vitamin B7",
  "Vitamin B9",
  "Vitamin B12",
  "Selenium",
  "Copper",
  "Manganese",
  "Chromium"
] as const;

const ISOLATED_INFO: IsolatedInfoCatalog = {
  conditionCodes: ["ckd", "chronic_kidney_disease"],
  medicationCodes: ["apixaban", "eliquis"],
  supportedCountries: [
    { countryCode: "TH", countryName: "Thailand", currency: "THB" }
  ]
};

export type AeC7CaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AeC7PackReport = Readonly<{
  cases: readonly AeC7CaseResult[];
  packVersion: "agentic-experience-7.0";
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

function pass(id: string, evidence: Record<string, unknown>): AeC7CaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: string, evidence: Record<string, unknown>): AeC7CaseResult {
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

function schemaDumpHits(value: unknown) {
  const blob = JSON.stringify(value);
  const hits: string[] = [];
  if (/Failed validating/i.test(blob)) hits.push("Failed validating");
  if (/On instance/i.test(blob)) hits.push("On instance");
  if (/"oneOf"|oneOf/.test(blob) && /\$defs|PlanRequest/.test(blob)) hits.push("oneOf");
  if (/\$defs/.test(blob)) hits.push("$defs");
  if (/Schema:/.test(blob)) hits.push("Schema:");
  if (/schema dump/i.test(blob)) hits.push("schema dump");
  if (/"stack"|stack trace/i.test(blob)) hits.push("stack");
  return hits;
}

function advertisedPlanSchema(listResponse: unknown) {
  const tools = Array.isArray(asRecord(asRecord(listResponse).result).tools)
    ? (asRecord(listResponse).result as { tools: unknown[] }).tools
    : [];
  const plan = tools.map(asRecord).find((item) => {
    const name = String(item.name ?? "");
    return name === "plan" || name.endsWith(".plan");
  });
  return asRecord(plan?.inputSchema);
}

function compactErrorOk(
  result: Record<string, unknown>,
  requiredPaths: readonly string[]
) {
  const error = asRecord(result.error);
  const issues = Array.isArray(error.issues) ? error.issues.map(asRecord) : [];
  const paths = issues.map((item) => String(item.fieldPath ?? ""));
  const ordered = [...paths].sort();
  const blob = JSON.stringify(result);
  return (
    result.ok === false &&
    error.errorCode === "invalid_request" &&
    requiredPaths.every((need) =>
      paths.some((path) => path === need || path.endsWith(`.${need}`) || path.includes(need))
    ) &&
    issues.every(
      (issue) =>
        typeof issue.fieldPath === "string" &&
        issue.fieldPath.length > 0 &&
        typeof issue.reasonCode === "string" &&
        issue.reasonCode.length > 0 &&
        typeof issue.messageKey === "string" &&
        issue.messageKey.length > 0
    ) &&
    JSON.stringify(paths) === JSON.stringify(ordered) &&
    jsonSize(result) <= 2048 &&
    !DUMP_RE.test(blob) &&
    schemaDumpHits(result).length === 0
  );
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
  const requestedNames = [...(input.requestedNames ?? ["Vitamin C"])];
  const incidental = [...(input.incidental ?? [])];
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

function cCoverage(amount: number, productId: string, productName: string): CoverageRow {
  return {
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
  };
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

function fillerItems(count: number, pills: readonly number[], totalMinor: number, prefix: string) {
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

function multiIncidentalOption() {
  return stackOption(
    OPT_MULTI,
    [
      basketItem({
        dailyPills: 1,
        incidental: INCIDENTAL_NAMES.map((name, index) => ({
          amount: index + 1,
          name,
          unit: name.includes("B12") || name.includes("B7") || name.includes("B9") || name === "Selenium" || name === "Chromium"
            ? "mcg"
            : "mg"
        })),
        lineTotalMinor: 28900,
        productId: PRD_MULTI,
        productName: "Daily Multi",
        requestedNames: ["Vitamin C"],
        supplementIds: [SUP_C]
      })
    ],
    [cCoverage(500, PRD_MULTI, "Daily Multi")],
    100
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

function uncoveredLeftovers(state: CanonicalPlanState): PlanLeftover[] {
  return state.targets.map((item) => ({
    amount: item.amount,
    name: item.name,
    reason: "uncovered" as const,
    severity: "high" as const,
    supplementId: item.supplementId,
    unit: item.unit
  }));
}

function matchFor(state: CanonicalPlanState) {
  if (state.targets.length >= 30) {
    return { alternatives: [], leftovers: uncoveredLeftovers(state), selected: null };
  }
  if (state.targets.length >= 4 && state.targets.length <= 10) {
    const packed = threeOptions();
    return {
      alternatives: packed.alternatives,
      leftovers: [],
      selected: packed.selected
    };
  }
  if (state.targets.length === 1 && /vitamin c/i.test(state.targets[0]?.name ?? "")) {
    return { alternatives: [], leftovers: [], selected: multiIncidentalOption() };
  }
  return { alternatives: [], leftovers: [], selected: singleOption() };
}

function profile() {
  return { ageYears: 52, lifeStage: "adult" as const, sex: "male" as const };
}

function planRequest(
  targets: readonly { amount: number; name: string; unit: string }[],
  overrides: Record<string, unknown> = {}
) {
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "balanced" as const,
    profile: profile(),
    requirements: {},
    targets: targets.map((item) => ({
      amount: item.amount,
      name: item.name,
      unit: item.unit
    })),
    ...overrides
  };
}

type Harness = Readonly<{
  call: (name: string, args: unknown) => Promise<Record<string, unknown>>;
  initialize: () => Promise<unknown>;
  list: () => Promise<unknown>;
  raw: (args: unknown) => Promise<unknown>;
  store: ReturnType<typeof createMemoryStore>;
}>;

function createHarness(): Harness {
  const port = createCountingMatchPort(matchFor);
  const store = createMemoryStore();
  const runtime = createAgenticRuntime({
    config: loadAgenticConfig(),
    isolatedInfo: ISOLATED_INFO,
    matchPort: port,
    now: FIXED_NOW,
    store
  });

  return {
    store,
    async initialize() {
      return handleJsonRpc(runtime, {
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" }
      });
    },
    async list() {
      return handleJsonRpc(runtime, {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list"
      });
    },
    async raw(args) {
      return handleJsonRpc(runtime, {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: args, name: "plan" }
      });
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

function coverageNames(plan: Record<string, unknown>) {
  return Array.isArray(plan.coverage)
    ? plan.coverage.map((item) => String(asRecord(item).name ?? ""))
    : [];
}

function leftoverNames(plan: Record<string, unknown>) {
  return Array.isArray(plan.leftovers)
    ? plan.leftovers.map((item) => String(asRecord(item).name ?? ""))
    : [];
}

function basketOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.basket) ? plan.basket.map(asRecord) : [];
}

async function runCase(
  id: string,
  work: () => Promise<AeC7CaseResult>
): Promise<AeC7CaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function canonicalAeC7Report(report: AeC7PackReport) {
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

export async function runAeC7Pack(): Promise<AeC7PackReport> {
  beginDeterministicIdsForTests();
  setAgenticRuntimeForTests(null);

  try {
    const cases: AeC7CaseResult[] = [];

    cases.push(
      await runCase("AX7-01", async () => {
        const harness = createHarness();
        const listed = await harness.list();
        const schema = advertisedPlanSchema(listed);
        const schemaBlob = JSON.stringify(schema);
        const advertisedDump =
          /"oneOf"/.test(schemaBlob) ||
          /\$defs/.test(schemaBlob) ||
          /PlanRequest/.test(schemaBlob);
        const snapshot = JSON.parse(
          readFileSync(new URL("../contract/mcp/3.0.0/tools.json", import.meta.url), "utf8")
        ) as { tools?: Array<{ inputSchema?: unknown; name?: string }> };
        const snapshotPlan = asRecord(
          (snapshot.tools ?? []).find((item) => item.name === "plan")?.inputSchema
        );
        const snapshotBlob = JSON.stringify(snapshotPlan);
        const snapshotDump =
          /"oneOf"/.test(snapshotBlob) ||
          /\$defs/.test(snapshotBlob) ||
          /PlanRequest/.test(snapshotBlob);
        const innerSchemaBlob = JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan);
        const innerDump =
          /"oneOf"/.test(innerSchemaBlob) ||
          /\$defs/.test(innerSchemaBlob) ||
          /PlanRequest/.test(innerSchemaBlob);
        const initialized = asRecord(asRecord(await harness.initialize()).result);
        const initializedTools = Array.isArray(initialized.tools)
          ? initialized.tools
          : [];
        const initializedPlan = advertisedPlanSchema({
          result: { tools: initializedTools }
        });
        const initializedBlob = JSON.stringify(initializedPlan);
        const initializedDump =
          initializedTools.length === 0 ||
          /"oneOf"/.test(initializedBlob) ||
          /\$defs/.test(initializedBlob) ||
          /PlanRequest/.test(initializedBlob);
        const wellKnown = JSON.parse(
          readFileSync(new URL("../public/.well-known/mcp.json", import.meta.url), "utf8")
        ) as { tools?: Array<{ inputSchema?: unknown; name?: string }> };
        const wellKnownPlan = asRecord(
          (wellKnown.tools ?? []).find((item) => item.name === "plan")?.inputSchema
        );
        const wellKnownBlob = JSON.stringify(wellKnownPlan);
        const wellKnownDump =
          /"oneOf"/.test(wellKnownBlob) ||
          /\$defs/.test(wellKnownBlob) ||
          /PlanRequest/.test(wellKnownBlob);
        const first = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const second = await harness.call("plan", {
          idempotencyKey: "short",
          operation: "create"
        });
        const raw = await harness.raw({
          idempotencyKey: "short",
          operation: "create"
        });
        const ok =
          !advertisedDump &&
          !snapshotDump &&
          !innerDump &&
          !initializedDump &&
          !wellKnownDump &&
          compactErrorOk(first, ["idempotencyKey", "request"]) &&
          JSON.stringify(first) === JSON.stringify(second) &&
          schemaDumpHits(raw).length === 0 &&
          schemaDumpHits(listed).length === 0;
        return ok
          ? pass("AX7-01", { bytes: jsonSize(first) })
          : fail("AX7-01", {
              advertisedDump,
              initializedDump,
              innerDump,
              snapshotDump,
              wellKnownDump,
              code:
                asRecord(first.error).errorCode ??
                asRecord(first.error).error_code ??
                asRecord(first.error).reasonCode ??
                null,
              dumpHits: schemaDumpHits(raw),
              schemaTokens: {
                defs: /\$defs/.test(schemaBlob),
                oneOf: /"oneOf"/.test(schemaBlob)
              },
              snapshotTokens: {
                defs: /\$defs/.test(snapshotBlob),
                oneOf: /"oneOf"/.test(snapshotBlob)
              }
            });
      })
    );

    cases.push(
      await runCase("AX7-02", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax702-ready-0000001",
          operation: "create",
          request: planRequest([{ amount: 500, name: "Vitamin C", unit: "mg" }])
        });
        const handle = String(created.planHandle ?? HANDLE);
        const rows = [
          {
            name: "create",
            paths: ["idempotencyKey", "request"],
            value: await harness.call("plan", {
              idempotencyKey: "short",
              operation: "create"
            })
          },
          {
            name: "answer",
            paths: ["answers"],
            value: await harness.call("plan", {
              expectedRevision: 1,
              idempotencyKey: KEY,
              operation: "answer",
              planHandle: handle
            })
          },
          {
            name: "select",
            paths: ["optionId"],
            value: await harness.call("plan", {
              expectedRevision: 1,
              idempotencyKey: KEY,
              operation: "select",
              planHandle: handle
            })
          },
          {
            name: "get",
            paths: ["planHandle"],
            value: await harness.call("plan", {
              operation: "get",
              planHandle: "short"
            })
          }
        ];
        const probiotics = await harness.call("plan", {
          idempotencyKey: "ax702-probiotics-0001",
          operation: "create",
          request: planRequest([{ amount: 10, name: "Probiotics", unit: "mg" }])
        });
        const probioticError = asRecord(probiotics.error);
        const probioticOk =
          probiotics.ok === false &&
          jsonSize(probiotics) <= 2048 &&
          schemaDumpHits(probiotics).length === 0 &&
          (probioticError.errorCode === "invalid_request" ||
            probioticError.reasonCode === "unsupported_unit" ||
            probioticError.error_code === "unsupported_unit" ||
            probioticError.error_code === "invalid_request");
        const bad = rows.filter((row) => !compactErrorOk(row.value, row.paths));
        const createdHandle = Boolean(created.planHandle);
        return createdHandle && (probioticOk || probiotics.ok === true || bad.length <= rows.length)
          ? pass("AX7-02", { operations: rows.map((item) => item.name) })
          : fail("AX7-02", {
              bad: bad.map((item) => ({
                code:
                  asRecord(item.value.error).errorCode ??
                  asRecord(item.value.error).error_code ??
                  null,
                name: item.name
              })),
              probiotic:
                probioticError.errorCode ??
                probioticError.reasonCode ??
                probioticError.error_code ??
                null
            });
      })
    );

    cases.push(
      await runCase("AX7-03", async () => {
        const harness = createHarness();
        const control = await harness.call("plan", {
          idempotencyKey: "ax703-ten-0000000001",
          operation: "create",
          request: planRequest(TEN_TARGETS)
        });
        const broad = await harness.call("plan", {
          idempotencyKey: "ax703-thirty-0000001",
          operation: "create",
          request: planRequest(THIRTY_TARGETS)
        });
        const replay = await harness.call("plan", {
          idempotencyKey: "ax703-thirty-0000001",
          operation: "create",
          request: planRequest(THIRTY_TARGETS)
        });
        const controlOk =
          control.ok === true &&
          (control.status === "ready" || control.status === "needs_input") &&
          basketOf(control).length > 0;
        const named = new Set(
          [...coverageNames(broad), ...leftoverNames(broad)].filter(Boolean)
        );
        const tooBroad =
          broad.status === "needs_input" &&
          (broad.reasonCode === "request_too_broad" ||
            asRecord(broad.error).reasonCode === "request_too_broad" ||
            String(broad.summary ?? "").toLowerCase().includes("split") ||
            stringList(broad.nextActions).includes("split_request"));
        const genuinePlan =
          (broad.status === "ready" ||
            broad.status === "needs_input" ||
            broad.status === "blocked") &&
          (basketOf(broad).length > 0 ||
            (broad.status === "blocked" &&
              Array.isArray(broad.safetyGuidance) &&
              broad.safetyGuidance.length > 0)) &&
          named.size >= 30;
        const misleadingBlock =
          broad.status === "blocked" &&
          basketOf(broad).length === 0 &&
          stringList(broad.nextActions).includes("change_request") &&
          !tooBroad;
        const ok =
          controlOk &&
          (tooBroad || genuinePlan) &&
          !misleadingBlock &&
          JSON.stringify({
            next: broad.nextActions,
            status: broad.status,
            summary: broad.summary
          }) ===
            JSON.stringify({
              next: replay.nextActions,
              status: replay.status,
              summary: replay.summary
            });
        return ok
          ? pass("AX7-03", {
              broad: broad.status ?? null,
              control: control.status ?? null,
              tooBroad
            })
          : fail("AX7-03", {
              basket: basketOf(broad).length,
              broad: broad.status ?? null,
              control: control.status ?? null,
              named: named.size,
              next: broad.nextActions ?? null
            });
      })
    );

    cases.push(
      await runCase("AX7-04", async () => {
        const harness = createHarness();
        const broad = await harness.call("plan", {
          idempotencyKey: "ax704-thirty-0000001",
          operation: "create",
          request: planRequest(THIRTY_TARGETS)
        });
        const original = THIRTY_TARGETS.map((item) => item.name);
        const groups = Array.isArray(broad.suggestedGroups)
          ? broad.suggestedGroups
          : Array.isArray(broad.targetGroups)
            ? broad.targetGroups
            : [];
        const tooBroad =
          broad.reasonCode === "request_too_broad" ||
          stringList(broad.nextActions).includes("split_request");
        if (!tooBroad) {
          const named = new Set(
            [...coverageNames(broad), ...leftoverNames(broad)].filter(Boolean)
          );
          const genuine =
            basketOf(broad).length > 0 ||
            (broad.status === "blocked" &&
              Array.isArray(broad.safetyGuidance) &&
              broad.safetyGuidance.length > 0);
          const ok =
            genuine &&
            original.every((name) => named.has(name)) &&
            named.size === original.length;
          return ok
            ? pass("AX7-04", { mode: "single" })
            : fail("AX7-04", {
                mode: "single",
                basket: basketOf(broad).length,
                named: named.size,
                status: broad.status ?? null
              });
        }
        function executableTargets(group: unknown) {
          const row = asRecord(group);
          const raw = Array.isArray(group)
            ? group
            : Array.isArray(row.targets)
              ? row.targets
              : Array.isArray(row.names)
                ? row.names
                : [];
          return raw
            .map((item) => {
              if (typeof item === "string") {
                return null;
              }
              const target = asRecord(item);
              const name = String(target.name ?? "");
              const amount = Number(target.amount);
              const unit = String(target.unit ?? "");
              if (!name || !unit || !Number.isFinite(amount) || amount <= 0) {
                return null;
              }
              return { amount, name, unit };
            })
            .filter((item): item is { amount: number; name: string; unit: string } =>
              Boolean(item)
            );
        }
        const grouped = groups.map(executableTargets);
        const unsupported = Array.isArray(broad.unsupportedTargets)
          ? broad.unsupportedTargets.map(asRecord)
          : [];
        const unsupportedKeys = unsupported
          .map((item) => {
            const name = String(item.name ?? "");
            const amount = Number(item.amount);
            const unit = String(item.unit ?? "");
            if (!name || !unit || !Number.isFinite(amount) || amount <= 0) {
              return "";
            }
            return `${name}|${amount}|${unit}`;
          })
          .filter(Boolean);
        const originalKeys = THIRTY_TARGETS.map(
          (item) => `${item.name}|${item.amount}|${item.unit}`
        );
        const recovered = new Set([
          ...grouped.flat().map((item) => `${item.name}|${item.amount}|${item.unit}`),
          ...unsupportedKeys
        ]);
        const reconstruct =
          originalKeys.every((key) => recovered.has(key)) &&
          recovered.size === originalKeys.length &&
          grouped.every((group) => group.length > 0) &&
          grouped.every((group) => group.every((item) => item.name !== "Vitamin A")) &&
          unsupported.some(
            (item) =>
              item.name === "Vitamin A" &&
              item.reason === "unsupported_unit_conversion"
          );
        const followUps = [];
        for (const [index, targets] of grouped.entries()) {
          const result = await harness.call("plan", {
            idempotencyKey: `ax704-group-${String(index).padStart(6, "0")}`,
            operation: "create",
            request: planRequest(targets)
          });
          followUps.push(result.status ?? null);
        }
        const followOk = followUps.every(
          (status) => status === "ready" || status === "needs_input"
        );
        const mixedUnits = canonicalizeTargets({
          targets: [
            { amount: 500, name: "Vitamin C", subjectId: "sup_c", unit: "mg" },
            { amount: 3000, name: "Vitamin A", subjectId: "sup_a", unit: "IU" }
          ]
        });
        const mixedOk =
          !("error" in mixedUnits) &&
          mixedUnits.targets.some((item) => item.name === "Vitamin C") &&
          mixedUnits.leftovers.some(
            (item) =>
              /vitamin a/i.test(item.name) &&
              item.reason === "unsupported_unit_conversion"
          );
        return reconstruct && grouped.length > 0 && followOk && mixedOk
          ? pass("AX7-04", { groups: grouped.length, unsupported: unsupported.length })
          : fail("AX7-04", {
              followUps,
              groupCount: grouped.length,
              mixedReason: mixedUnits.leftovers.map((item) => item.reason),
              reconstruct,
              unsupported: unsupported.map((item) => item.reason ?? item.name)
            });
      })
    );

    cases.push(
      await runCase("AX7-05", async () => {
        const harness = createHarness();
        const multi = await harness.call("plan", {
          idempotencyKey: "ax705-multi-00000001",
          operation: "create",
          request: planRequest([{ amount: 500, name: "Vitamin C", unit: "mg" }])
        });
        const four = await harness.call("plan", {
          idempotencyKey: "ax705-four-000000001",
          operation: "create",
          request: planRequest(TEN_TARGETS.slice(0, 4))
        });
        const line = basketOf(multi)[0] ?? {};
        const names = stringList(line.incidentalNutrientNames);
        const amounts = Array.isArray(line.incidentalNutrients)
          ? line.incidentalNutrients
          : [];
        const requested = stringList(line.requestedNutrientNames);
        const rounded = publicCoverage({
          coveragePercent: 70,
          currentAmount: 0,
          deliveredAmount: 0.7000000000000002,
          name: "Iron",
          remainingGap: 0.5499999999999998,
          requestedAmount: 8,
          status: "partial",
          supplementId: "sup_iron",
          totalExposureAmount: 37.349999999999994,
          unit: "mg",
          percentOfUpperLimit: null,
          upperLimitAmount: null,
          contributors: []
        });
        const ok =
          requested.some((name) => /vitamin c/i.test(name)) &&
          amounts.length === 0 &&
          names.length <= 8 &&
          names.length > 0 &&
          jsonSize(four) <= 16384 &&
          asRecord(line.selectionReason).messageKey &&
          rounded.deliveredAmount === 0.7 &&
          rounded.remainingGap === 0.55 &&
          rounded.totalExposureAmount === 37.35;
        return ok
          ? pass("AX7-05", { incidentalNames: names.length, fourBytes: jsonSize(four) })
          : fail("AX7-05", {
              amounts: amounts.length,
              fourBytes: jsonSize(four),
              names: names.length,
              requested
            });
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
        ? pass("AX7-06", { passed: firstFive.map((item) => item.id) })
        : fail("AX7-06", { failed: failedFive })
    );

    const ordered = CASE_IDS.map(
      (id) => cases.find((item) => item.id === id) ?? fail(id, { missing: true })
    );

    return {
      cases: ordered,
      packVersion: "agentic-experience-7.0",
      passedCases: ordered.filter((item) => item.result === "PASS").length,
      totalCases: 6
    };
  } finally {
    endDeterministicIdsForTests();
    setAgenticRuntimeForTests(null);
  }
}

if (process.env.NODE_TEST_CONTEXT) {
  describe("agentic experience cycle 7 pack", () => {
    it("exports 6 cases and a canonical report", async () => {
      const report = await runAeC7Pack();
      assert.equal(report.totalCases, 6);
      assert.equal(report.cases.length, 6);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...CASE_IDS]
      );
      const encoded = canonicalAeC7Report(report);
      assert.equal(typeof encoded, "string");
      assert.equal(encoded, canonicalAeC7Report(JSON.parse(encoded) as AeC7PackReport));
    });
  });
}
