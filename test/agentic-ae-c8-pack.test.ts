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
  PlanLeftover,
  StackOption
} from "../lib/agentic/plan/types.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type IsolatedInfoCatalog
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";

const FIXED_NOW = "2026-08-29T00:00:00.000Z";
const CASE_IDS = [
  "AX8-01",
  "AX8-02",
  "AX8-03",
  "AX8-04",
  "AX8-05",
  "AX8-06",
  "AX8-07"
] as const;

const SUP_B1 = "sup_ae_vitamin_b1";
const SUP_B6 = "sup_ae_vitamin_b6";
const SUP_B12 = "sup_ae_vitamin_b12";
const SUP_D3 = "sup_ae_vitamin_d3";
const SUP_MAG = "sup_ae_magnesium";
const SUP_C = "sup_ae_vitamin_c";
const SUP_OMEGA = "sup_ae_omega3";
const SUP_IRON = "sup_ae_iron";
const SUP_A = "sup_ae_vitamin_a";
const SUP_K2 = "sup_ae_vitamin_k2";
const SUP_MN = "sup_ae_manganese";
const SUP_PRO = "sup_ae_probiotics";
const PRD_FOCUS = "prd_ae_b_complex";
const PRD_A = "prd_ae_d3_only";
const PRD_B = "prd_ae_mag_c";
const PRD_C = "prd_ae_omega_incidental";
const PRD_KEEP = "prd_ae_keep";
const OPT_FOCUS = "opt_ae_focus";
const OPT_MULTI = "opt_ae_multi";
const OPT_BROAD = "opt_ae_broad";
const OPT_SHAPE = "opt_ae_shape";
const KEY = "ax8-valid-key-01xx";
const SUP_BY_NAME: Record<string, string> = {
  Iron: SUP_IRON,
  Manganese: SUP_MN,
  "Omega-3": SUP_OMEGA,
  Probiotics: SUP_PRO,
  Magnesium: SUP_MAG,
  "Vitamin A": SUP_A,
  "Vitamin B1": SUP_B1,
  "Vitamin B12": SUP_B12,
  "Vitamin B6": SUP_B6,
  "Vitamin C": SUP_C,
  "Vitamin D3": SUP_D3,
  "Vitamin K2": SUP_K2
};

const ISOLATED_INFO: IsolatedInfoCatalog = {
  conditionCodes: ["ckd", "chronic_kidney_disease"],
  medicationCodes: ["apixaban", "eliquis"],
  supportedCountries: [
    { countryCode: "TH", countryName: "Thailand", currency: "THB" }
  ]
};

export type AeC8CaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: string;
  result: "FAIL" | "PASS";
}>;

export type AeC8PackReport = Readonly<{
  cases: readonly AeC8CaseResult[];
  packVersion: "agentic-experience-8.0";
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

function pass(id: string, evidence: Record<string, unknown>): AeC8CaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: string, evidence: Record<string, unknown>): AeC8CaseResult {
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

function namesOf(state: CanonicalPlanState) {
  return new Set(state.targets.map((item) => item.name));
}

function basketItem(
  input: Readonly<{
    incidental?: readonly string[];
    lineTotalMinor: number;
    productId: string;
    productName: string;
    requestedNames: readonly string[];
    supplementIds: readonly string[];
  }>
): BasketItem {
  const requestedNames = [...input.requestedNames];
  const incidental = [...(input.incidental ?? [])];
  return {
    availabilityAsOf: FIXED_NOW,
    contributionSupplementIds: [...input.supplementIds],
    currency: "THB",
    dailyPills: 1,
    daysOfSupply: 30,
    deliveryWindow: null,
    fixture: false,
    form: "capsule",
    imageUrl: null,
    incidentalNutrientNames: incidental,
    incidentalNutrients: incidental.map((name) => ({
      amount: 1,
      name,
      unit: name.includes("B12") ? "mcg" : "mg"
    })),
    incompleteCommercialFacts: false,
    lineTotalMinor: input.lineTotalMinor,
    pillsPerServing: 1,
    productId: input.productId,
    productName: input.productName,
    quantity: 1,
    requestedNutrientNames: requestedNames,
    retailerSku: `sku_${input.productId}`,
    selectionReason: {
      code: requestedNames.length >= 2 ? "consolidates_targets" : "covers_target",
      message:
        requestedNames.length >= 2
          ? `This product covers ${requestedNames.join(", ").replace(/, ([^,]*)$/, " and $1")} together.`
          : `This product covers ${requestedNames[0]}.`,
      messageKey:
        requestedNames.length >= 2
          ? "plan.selection.consolidates_targets"
          : "plan.selection.covers_target_named",
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

function coverageRow(
  input: Readonly<{
    contributors?: CoverageRow["contributors"];
    delivered: number;
    name: string;
    requested: number;
    status: CoverageRow["status"];
    supplementId: string;
    unit: CoverageRow["unit"];
  }>
): CoverageRow {
  const remaining = Math.max(0, input.requested - input.delivered);
  return {
    contributors: input.contributors ?? [],
    coveragePercent: input.requested > 0 ? Math.round((input.delivered / input.requested) * 100) : 0,
    currentAmount: 0,
    deliveredAmount: input.delivered,
    name: input.name,
    percentOfUpperLimit: null,
    remainingGap: remaining,
    requestedAmount: input.requested,
    status: input.status,
    supplementId: input.supplementId,
    totalExposureAmount: input.delivered,
    unit: input.unit,
    upperLimitAmount: null
  };
}

function leftover(
  input: Readonly<{
    amount: number;
    name: string;
    reason: PlanLeftover["reason"];
    supplementId?: string;
    unit: PlanLeftover["unit"];
  }>
): PlanLeftover {
  return {
    amount: input.amount,
    name: input.name,
    reason: input.reason,
    severity: input.reason === "dose_gap" ? "medium" : "high",
    supplementId: input.supplementId,
    unit: input.unit
  };
}

function stack(
  optionId: string,
  basket: readonly BasketItem[],
  coverage: readonly CoverageRow[]
): StackOption {
  return {
    basket: [...basket],
    coverage: [...coverage],
    coveragePercent: 80,
    dailyPills: basket.reduce((sum, item) => sum + item.dailyPills, 0),
    matcherVersion: "ae-port",
    optionId,
    reason: "fewest_pills",
    snapshotId: "snap_ae_c8",
    totalPriceMinor: basket.reduce((sum, item) => sum + item.lineTotalMinor, 0)
  };
}

function focusedOutcome() {
  const product = basketItem({
    incidental: ["Vitamin B12"],
    lineTotalMinor: 18900,
    productId: PRD_FOCUS,
    productName: "B Complex",
    requestedNames: ["Vitamin B1", "Vitamin B12", "Vitamin B6"],
    supplementIds: [SUP_B1, SUP_B12, SUP_B6]
  });
  return {
    alternatives: [],
    leftovers: [
      leftover({
        amount: 250,
        name: "Vitamin B12",
        reason: "uncovered",
        supplementId: SUP_B12,
        unit: "mcg"
      })
    ],
    selected: stack(
      OPT_FOCUS,
      [product],
      [
        coverageRow({
          contributors: [
            {
              amount: 1.5,
              productId: PRD_FOCUS,
              productName: "B Complex",
              source: "selected",
              unit: "mg"
            }
          ],
          delivered: 1.5,
          name: "Vitamin B1",
          requested: 1.2,
          status: "covered",
          supplementId: SUP_B1,
          unit: "mg"
        }),
        coverageRow({
          delivered: 0,
          name: "Vitamin B12",
          requested: 250,
          status: "uncovered",
          supplementId: SUP_B12,
          unit: "mcg"
        }),
        coverageRow({
          contributors: [
            {
              amount: 2,
              productId: PRD_FOCUS,
              productName: "B Complex",
              source: "selected",
              unit: "mg"
            }
          ],
          delivered: 2,
          name: "Vitamin B6",
          requested: 1.7,
          status: "covered",
          supplementId: SUP_B6,
          unit: "mg"
        })
      ]
    )
  };
}

function multiOutcome() {
  const a = basketItem({
    lineTotalMinor: 9900,
    productId: PRD_A,
    productName: "D3 Only",
    requestedNames: ["Vitamin D3"],
    supplementIds: [SUP_D3]
  });
  const b = basketItem({
    lineTotalMinor: 12900,
    productId: PRD_B,
    productName: "Mag C",
    requestedNames: ["Magnesium", "Vitamin C"],
    supplementIds: [SUP_MAG, SUP_C]
  });
  const c = basketItem({
    incidental: ["Vitamin B12"],
    lineTotalMinor: 15900,
    productId: PRD_C,
    productName: "Omega Incidental",
    requestedNames: ["Omega-3", "Vitamin B12"],
    supplementIds: [SUP_OMEGA, SUP_B12]
  });
  return {
    alternatives: [],
    leftovers: [
      leftover({
        amount: 250,
        name: "Vitamin B12",
        reason: "uncovered",
        supplementId: SUP_B12,
        unit: "mcg"
      })
    ],
    selected: stack(OPT_MULTI, [a, b, c], [
      coverageRow({
        contributors: [
          {
            amount: 2000,
            productId: PRD_A,
            productName: "D3 Only",
            source: "selected",
            unit: "IU"
          }
        ],
        delivered: 2000,
        name: "Vitamin D3",
        requested: 2000,
        status: "covered",
        supplementId: SUP_D3,
        unit: "IU"
      }),
      coverageRow({
        contributors: [
          {
            amount: 200,
            productId: PRD_B,
            productName: "Mag C",
            source: "selected",
            unit: "mg"
          }
        ],
        delivered: 200,
        name: "Magnesium",
        requested: 200,
        status: "covered",
        supplementId: SUP_MAG,
        unit: "mg"
      }),
      coverageRow({
        contributors: [
          {
            amount: 500,
            productId: PRD_B,
            productName: "Mag C",
            source: "selected",
            unit: "mg"
          }
        ],
        delivered: 500,
        name: "Vitamin C",
        requested: 500,
        status: "covered",
        supplementId: SUP_C,
        unit: "mg"
      }),
      coverageRow({
        contributors: [
          {
            amount: 1000,
            productId: PRD_C,
            productName: "Omega Incidental",
            source: "selected",
            unit: "mg"
          }
        ],
        delivered: 1000,
        name: "Omega-3",
        requested: 1000,
        status: "covered",
        supplementId: SUP_OMEGA,
        unit: "mg"
      }),
      coverageRow({
        delivered: 0,
        name: "Vitamin B12",
        requested: 250,
        status: "uncovered",
        supplementId: SUP_B12,
        unit: "mcg"
      })
    ])
  };
}

function keepProduct() {
  return basketItem({
    lineTotalMinor: 8900,
    productId: PRD_KEEP,
    productName: "Keep Stack",
    requestedNames: ["Vitamin C"],
    supplementIds: [SUP_C]
  });
}

function broadCoverage(): CoverageRow[] {
  return [
    coverageRow({
      contributors: [
        {
          amount: 1200,
          productId: PRD_KEEP,
          productName: "Keep Stack",
          source: "selected",
          unit: "IU"
        }
      ],
      delivered: 1200,
      name: "Vitamin D3",
      requested: 2000,
      status: "partial",
      supplementId: SUP_D3,
      unit: "IU"
    }),
    coverageRow({
      delivered: 0,
      name: "Vitamin B12",
      requested: 250,
      status: "uncovered",
      supplementId: SUP_B12,
      unit: "mcg"
    }),
    coverageRow({
      delivered: 0,
      name: "Iron",
      requested: 8,
      status: "uncovered",
      supplementId: SUP_IRON,
      unit: "mg"
    }),
    coverageRow({
      delivered: 0,
      name: "Vitamin A",
      requested: 3000,
      status: "uncovered",
      supplementId: SUP_A,
      unit: "IU"
    }),
    coverageRow({
      delivered: 0,
      name: "Vitamin K2",
      requested: 100,
      status: "uncovered",
      supplementId: SUP_K2,
      unit: "mcg"
    }),
    coverageRow({
      contributors: [
        {
          amount: 1.75,
          productId: PRD_KEEP,
          productName: "Keep Stack",
          source: "selected",
          unit: "mg"
        }
      ],
      delivered: 1.75,
      name: "Manganese",
      requested: 2.3,
      status: "partial",
      supplementId: SUP_MN,
      unit: "mg"
    }),
    coverageRow({
      contributors: [
        {
          amount: 500,
          productId: PRD_KEEP,
          productName: "Keep Stack",
          source: "selected",
          unit: "mg"
        }
      ],
      delivered: 500,
      name: "Vitamin C",
      requested: 500,
      status: "covered",
      supplementId: SUP_C,
      unit: "mg"
    })
  ];
}

function broadLeftovers(includeIron: boolean): PlanLeftover[] {
  const rows: PlanLeftover[] = [
    leftover({
      amount: 2000,
      name: "Vitamin D3",
      reason: "dose_gap",
      supplementId: SUP_D3,
      unit: "IU"
    }),
    leftover({
      amount: 250,
      name: "Vitamin B12",
      reason: "uncovered",
      supplementId: SUP_B12,
      unit: "mcg"
    }),
    leftover({
      amount: 3000,
      name: "Vitamin A",
      reason: "unsupported_unit_conversion",
      supplementId: SUP_A,
      unit: "IU"
    }),
    leftover({
      amount: 100,
      name: "Vitamin K2",
      reason: "uncovered",
      supplementId: SUP_K2,
      unit: "mcg"
    }),
    leftover({
      amount: 2.3,
      name: "Manganese",
      reason: "dose_gap",
      supplementId: SUP_MN,
      unit: "mg"
    }),
    leftover({
      amount: 10,
      name: "Probiotics",
      reason: "not_in_catalogue",
      unit: "mg"
    })
  ];
  if (includeIron) {
    rows.splice(
      2,
      0,
      leftover({
        amount: 8,
        name: "Iron",
        reason: "uncovered",
        supplementId: SUP_IRON,
        unit: "mg"
      })
    );
  }
  return rows;
}

function broadOutcome(state: CanonicalPlanState) {
  const includeIron = state.targets.some((item) => item.supplementId === SUP_IRON || item.name === "Iron");
  return {
    alternatives: [],
    leftovers: broadLeftovers(includeIron),
    selected: stack(OPT_BROAD, [keepProduct()], broadCoverage())
  };
}

function shapeOutcome() {
  return {
    alternatives: [],
    leftovers: [
      leftover({
        amount: 2000,
        name: "Vitamin D3",
        reason: "dose_gap",
        supplementId: SUP_D3,
        unit: "IU"
      }),
      leftover({
        amount: 250,
        name: "Vitamin B12",
        reason: "uncovered",
        supplementId: SUP_B12,
        unit: "mcg"
      }),
      leftover({
        amount: 3000,
        name: "Vitamin A",
        reason: "unsupported_unit_conversion",
        supplementId: SUP_A,
        unit: "IU"
      }),
      leftover({
        amount: 10,
        name: "Probiotics",
        reason: "not_in_catalogue",
        unit: "mg"
      })
    ],
    selected: stack(
      OPT_SHAPE,
      [keepProduct()],
      [
        coverageRow({
          contributors: [
            {
              amount: 1200,
              productId: PRD_KEEP,
              productName: "Keep Stack",
              source: "selected",
              unit: "IU"
            }
          ],
          delivered: 1200,
          name: "Vitamin D3",
          requested: 2000,
          status: "partial",
          supplementId: SUP_D3,
          unit: "IU"
        }),
        coverageRow({
          delivered: 0,
          name: "Vitamin B12",
          requested: 250,
          status: "uncovered",
          supplementId: SUP_B12,
          unit: "mcg"
        }),
        coverageRow({
          delivered: 0,
          name: "Vitamin A",
          requested: 3000,
          status: "uncovered",
          supplementId: SUP_A,
          unit: "IU"
        })
      ]
    )
  };
}

function matchFor(state: CanonicalPlanState) {
  const names = namesOf(state);
  if (names.has("Vitamin B1") && names.has("Vitamin B6") && names.has("Vitamin B12")) {
    return focusedOutcome();
  }
  if (
    names.has("Vitamin D3") &&
    names.has("Magnesium") &&
    names.has("Vitamin C") &&
    names.has("Omega-3") &&
    names.has("Vitamin B12") &&
    !names.has("Iron") &&
    !names.has("Probiotics")
  ) {
    return multiOutcome();
  }
  if (names.has("Probiotics") && names.has("Vitamin A") && names.has("Iron")) {
    return broadOutcome(state);
  }
  if (names.has("Vitamin D3") && names.has("Vitamin A") && names.has("Vitamin B12")) {
    return shapeOutcome();
  }
  return focusedOutcome();
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
      unit: item.unit,
      ...(SUP_BY_NAME[item.name] ? { supplementId: SUP_BY_NAME[item.name] } : {})
    })),
    ...overrides
  };
}

const FOCUS_TARGETS = [
  { amount: 1.2, name: "Vitamin B1", unit: "mg" },
  { amount: 250, name: "Vitamin B12", unit: "mcg" },
  { amount: 1.7, name: "Vitamin B6", unit: "mg" }
] as const;

const MULTI_TARGETS = [
  { amount: 2000, name: "Vitamin D3", unit: "IU" },
  { amount: 200, name: "Magnesium", unit: "mg" },
  { amount: 500, name: "Vitamin C", unit: "mg" },
  { amount: 1000, name: "Omega-3", unit: "mg" },
  { amount: 250, name: "Vitamin B12", unit: "mcg" }
] as const;

const BROAD_TARGETS = [
  { amount: 2000, name: "Vitamin D3", unit: "IU" },
  { amount: 250, name: "Vitamin B12", unit: "mcg" },
  { amount: 8, name: "Iron", unit: "mg" },
  { amount: 3000, name: "Vitamin A", unit: "IU" },
  { amount: 100, name: "Vitamin K2", unit: "mcg" },
  { amount: 2.3, name: "Manganese", unit: "mg" },
  { amount: 10, name: "Probiotics", unit: "mg" },
  { amount: 500, name: "Vitamin C", unit: "mg" }
] as const;

const SHAPE_TARGETS = [
  { amount: 2000, name: "Vitamin D3", unit: "IU" },
  { amount: 250, name: "Vitamin B12", unit: "mcg" },
  { amount: 3000, name: "Vitamin A", unit: "IU" },
  { amount: 10, name: "Probiotics", unit: "mg" }
] as const;

type Harness = Readonly<{
  call: (name: string, args: unknown) => Promise<Record<string, unknown>>;
  matchCount: () => number;
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
    matchCount: () => port.getCallCount(),
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

function basketOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.basket) ? plan.basket.map(asRecord) : [];
}

function questionsOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.questions) ? plan.questions.map(asRecord) : [];
}

function leftoversOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.leftovers) ? plan.leftovers.map(asRecord) : [];
}

function coverageOf(plan: Record<string, unknown>) {
  return Array.isArray(plan.coverage) ? plan.coverage.map(asRecord) : [];
}

function reviewTargets(plan: Record<string, unknown>) {
  const review = asRecord(plan.gapReview);
  if (Array.isArray(review.targets)) {
    return review.targets.map(asRecord);
  }
  const first = questionsOf(plan)[0];
  if (Array.isArray(first?.targets)) {
    return first.targets.map(asRecord);
  }
  return [];
}

function explanationClaimsB12(line: Record<string, unknown>) {
  const reason = asRecord(line.selectionReason);
  const blob = JSON.stringify({
    message: reason.message,
    names: reason.requestedNames,
    nutrients: line.requestedNutrientNames,
    details: line.requestedNutrients,
    ids: reason.requestedSupplementIds
  });
  return /vitamin b12/i.test(blob) || String(blob).includes(SUP_B12);
}

function expectedFromCoverage(
  line: Record<string, unknown>,
  coverage: Record<string, unknown>[]
) {
  const productId = String(line.productId ?? "");
  const names: string[] = [];
  const ids: string[] = [];
  const nutrients: Array<{ amount: number; name: string; unit: string }> = [];
  for (const row of coverage) {
    const contributors = Array.isArray(row.contributors) ? row.contributors.map(asRecord) : [];
    const hit = contributors.find(
      (item) => item.productId === productId && Number(item.amount) > 0 && String(item.unit ?? "")
    );
    if (!hit) {
      continue;
    }
    const name = String(row.name ?? "");
    const supplementId = String(row.supplementId ?? "");
    names.push(name);
    if (supplementId) {
      ids.push(supplementId);
    }
    nutrients.push({
      amount: Number(hit.amount),
      name,
      unit: String(hit.unit ?? row.unit ?? "")
    });
  }
  return { ids, names, nutrients };
}

async function runCase(
  id: string,
  work: () => Promise<AeC8CaseResult>
): Promise<AeC8CaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function canonicalAeC8Report(report: AeC8PackReport) {
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

export async function runAeC8Pack(): Promise<AeC8PackReport> {
  beginDeterministicIdsForTests();
  setAgenticRuntimeForTests(null);

  try {
    const cases: AeC8CaseResult[] = [];

    cases.push(
      await runCase("AX8-01", async () => {
        const harness = createHarness();
        const plan = await harness.call("plan", {
          idempotencyKey: "ax801-focus-00000001",
          operation: "create",
          request: planRequest(FOCUS_TARGETS)
        });
        const line = basketOf(plan)[0] ?? {};
        const reason = asRecord(line.selectionReason);
        const names = stringList(reason.requestedNames);
        const nutrients = stringList(line.requestedNutrientNames);
        const details = Array.isArray(line.requestedNutrients)
          ? line.requestedNutrients.map(asRecord)
          : [];
        const b12Coverage = coverageOf(plan).find((row) => /vitamin b12/i.test(String(row.name)));
        const asksB12 = JSON.stringify(plan).includes("Vitamin B12");
        const ok =
          plan.status === "needs_input" &&
          names.length === 2 &&
          names.includes("Vitamin B1") &&
          names.includes("Vitamin B6") &&
          !names.includes("Vitamin B12") &&
          !explanationClaimsB12(line) &&
          stringList(line.incidentalNutrientNames).includes("Vitamin B12") &&
          Number(b12Coverage?.deliveredAmount) === 0 &&
          b12Coverage?.status === "uncovered" &&
          asksB12 &&
          details.every((item) => !/vitamin b12/i.test(String(item.name))) &&
          nutrients.every((name) => !/vitamin b12/i.test(name));
        return ok
          ? pass("AX8-01", { names, incidental: stringList(line.incidentalNutrientNames) })
          : fail("AX8-01", {
              claimsB12: explanationClaimsB12(line),
              names,
              nutrients,
              status: plan.status ?? null
            });
      })
    );

    cases.push(
      await runCase("AX8-02", async () => {
        const harness = createHarness();
        const plan = await harness.call("plan", {
          idempotencyKey: "ax802-multi-00000001",
          operation: "create",
          request: planRequest(MULTI_TARGETS)
        });
        const coverage = coverageOf(plan);
        const bad: string[] = [];
        for (const line of basketOf(plan)) {
          const expected = expectedFromCoverage(line, coverage);
          const reason = asRecord(line.selectionReason);
          const names = stringList(reason.requestedNames);
          const ids = stringList(reason.requestedSupplementIds);
          const nutrientNames = stringList(line.requestedNutrientNames);
          const details = Array.isArray(line.requestedNutrients)
            ? line.requestedNutrients.map(asRecord)
            : [];
          const code = String(reason.code ?? "");
          const nameSet = names.join("|");
          if (nameSet !== expected.names.join("|")) {
            bad.push(`${line.productId}:names`);
          }
          if (ids.join("|") !== expected.ids.join("|")) {
            bad.push(`${line.productId}:ids`);
          }
          if (nutrientNames.join("|") !== expected.names.join("|")) {
            bad.push(`${line.productId}:nutrientNames`);
          }
          if (details.length !== expected.nutrients.length) {
            bad.push(`${line.productId}:details`);
          }
          if (expected.names.length >= 2 && code !== "consolidates_targets") {
            bad.push(`${line.productId}:code`);
          }
          if (expected.names.length === 1 && code !== "covers_target" && code !== "best_available_dose") {
            bad.push(`${line.productId}:single`);
          }
          if (expected.names.length === 0 && (code === "covers_target" || code === "consolidates_targets")) {
            bad.push(`${line.productId}:empty`);
          }
          if (explanationClaimsB12(line)) {
            bad.push(`${line.productId}:b12`);
          }
        }
        return bad.length === 0 && basketOf(plan).length === 3
          ? pass("AX8-02", { products: basketOf(plan).map((item) => item.productId) })
          : fail("AX8-02", { bad });
      })
    );

    cases.push(
      await runCase("AX8-03", async () => {
        const harness = createHarness();
        const plan = await harness.call("plan", {
          idempotencyKey: "ax803-broad-00000001",
          operation: "create",
          request: planRequest(BROAD_TARGETS)
        });
        const qs = questionsOf(plan);
        const gapQuestions = qs.filter(
          (item) =>
            String(item.questionId ?? "").startsWith("q_gap_") ||
            String(item.questionId ?? "") === "q_unresolved_targets"
        );
        const items = reviewTargets(plan);
        const names = items.map((item) => String(item.name ?? ""));
        const expected = [
          "Vitamin D3",
          "Vitamin B12",
          "Iron",
          "Vitamin A",
          "Vitamin K2",
          "Manganese",
          "Probiotics"
        ];
        const labelled = items.every((item) => {
          const name = String(item.name ?? "");
          return (
            name.length > 0 &&
            typeof item.reason === "string" &&
            typeof item.unit === "string" &&
            Number.isFinite(Number(item.requestedAmount)) &&
            Number.isFinite(Number(item.deliveredAmount)) &&
            Number.isFinite(Number(item.remainingGap))
          );
        });
        const promptsNameTargets = JSON.stringify(qs).match(/Vitamin |Iron|Manganese|Probiotics/g);
        const ok =
          items.length === 7 &&
          gapQuestions.length <= 1 &&
          expected.every((name) => names.includes(name)) &&
          labelled &&
          (promptsNameTargets?.length ?? 0) >= 7 &&
          !/matcherTelemetry|factLedger|lossCertificates/.test(JSON.stringify(plan));
        return ok
          ? pass("AX8-03", { review: names, questions: gapQuestions.length })
          : fail("AX8-03", {
              names,
              questionCount: qs.length,
              gapQuestions: gapQuestions.map((item) => item.questionId),
              reviewCount: items.length
            });
      })
    );

    cases.push(
      await runCase("AX8-04", async () => {
        const harness = createHarness();
        const created = await harness.call("plan", {
          idempotencyKey: "ax804-broad-00000001",
          operation: "create",
          request: planRequest(BROAD_TARGETS)
        });
        const before = harness.matchCount();
        const answered = await harness.call("plan", {
          answers: [
            { choice: `accept_gap:${SUP_D3}`, questionId: "q_unresolved_targets" },
            { choice: `remove_target:${SUP_IRON}`, questionId: "q_unresolved_targets" },
            { choice: `accept_gap:${SUP_A}`, questionId: "q_unresolved_targets" }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ax804-answer-0000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const replay = await harness.call("plan", {
          answers: [
            { choice: `accept_gap:${SUP_D3}`, questionId: "q_unresolved_targets" },
            { choice: `remove_target:${SUP_IRON}`, questionId: "q_unresolved_targets" },
            { choice: `accept_gap:${SUP_A}`, questionId: "q_unresolved_targets" }
          ],
          expectedRevision: created.revision,
          idempotencyKey: "ax804-answer-0000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const stale = await harness.call("plan", {
          answers: [{ choice: `accept_gap:${SUP_B12}`, questionId: "q_unresolved_targets" }],
          expectedRevision: Number(created.revision),
          idempotencyKey: "ax804-stale-00000001",
          operation: "answer",
          planHandle: created.planHandle
        });
        const remaining = reviewTargets(answered).map((item) => String(item.name ?? ""));
        const leftoverNames = leftoversOf(answered).map((item) => String(item.name ?? ""));
        const ok =
          answered.planHandle === created.planHandle &&
          Number(answered.revision) === Number(created.revision) + 1 &&
          harness.matchCount() === before &&
          answered.optionId === created.optionId &&
          !remaining.includes("Iron") &&
          !leftoverNames.includes("Iron") &&
          !remaining.includes("Vitamin D3") &&
          leftoverNames.includes("Vitamin A") &&
          remaining.filter((name) =>
            ["Vitamin B12", "Vitamin K2", "Manganese", "Probiotics"].includes(name)
          ).length === 4 &&
          Number(replay.revision) === Number(answered.revision) &&
          (asRecord(stale.error).reasonCode === "stale_revision" ||
            asRecord(stale.error).errorCode === "stale_revision" ||
            asRecord(stale.error).reasonCode === "revision_conflict" ||
            asRecord(stale.error).errorCode === "revision_conflict");
        return ok
          ? pass("AX8-04", { revision: answered.revision, remaining })
          : fail("AX8-04", {
              matchDelta: harness.matchCount() - before,
              remaining,
              leftoverNames,
              revision: answered.revision ?? null,
              stale: asRecord(stale.error).reasonCode ?? asRecord(stale.error).errorCode ?? null
            });
      })
    );

    cases.push(
      await runCase("AX8-05", async () => {
        const harness = createHarness();
        const plan = await harness.call("plan", {
          idempotencyKey: "ax805-shape-00000001",
          operation: "create",
          request: planRequest(SHAPE_TARGETS)
        });
        const rows = leftoversOf(plan);
        const byReason = new Map(rows.map((item) => [String(item.reason), item]));
        const needed = [
          "dose_gap",
          "uncovered",
          "unsupported_unit_conversion",
          "not_in_catalogue"
        ];
        const complete = rows.every((item) => {
          const requested = Number(item.requestedAmount);
          const delivered = Number(item.deliveredAmount);
          const remaining = Number(item.remainingGap);
          return (
            typeof item.name === "string" &&
            typeof item.reason === "string" &&
            typeof item.unit === "string" &&
            Number.isFinite(requested) &&
            Number.isFinite(delivered) &&
            Number.isFinite(remaining) &&
            remaining === Math.max(requested - delivered, 0)
          );
        });
        const dose = byReason.get("dose_gap");
        const uncovered = byReason.get("uncovered");
        const conversion = byReason.get("unsupported_unit_conversion");
        const missing = byReason.get("not_in_catalogue");
        const ok =
          needed.every((reason) => byReason.has(reason)) &&
          complete &&
          Number(dose?.deliveredAmount) > 0 &&
          Number(dose?.remainingGap) > 0 &&
          Number(uncovered?.deliveredAmount) === 0 &&
          Number(conversion?.deliveredAmount) === 0 &&
          Number(missing?.deliveredAmount) === 0 &&
          !rows.some((item) => item.reason === "weaker_sku") &&
          !/000000000/.test(JSON.stringify(rows));
        return ok
          ? pass("AX8-05", { reasons: rows.map((item) => item.reason) })
          : fail("AX8-05", {
              reasons: rows.map((item) => item.reason),
              keys: rows.map((item) => Object.keys(item).sort())
            });
      })
    );

    cases.push(
      await runCase("AX8-06", async () => {
        const harness = createHarness();
        const en = await harness.call("plan", {
          idempotencyKey: "ax806-en-0000000001",
          operation: "create",
          request: planRequest(FOCUS_TARGETS)
        });
        const th = await harness.call("plan", {
          idempotencyKey: "ax806-th-0000000001",
          operation: "create",
          request: planRequest(FOCUS_TARGETS, { locale: "th" })
        });
        const broadEn = await harness.call("plan", {
          idempotencyKey: "ax806-broad-en-00001",
          operation: "create",
          request: planRequest(BROAD_TARGETS)
        });
        const broadTh = await harness.call("plan", {
          idempotencyKey: "ax806-broad-th-00001",
          operation: "create",
          request: planRequest(BROAD_TARGETS, { locale: "th" })
        });
        const enLine = asRecord(asRecord(basketOf(en)[0]).selectionReason);
        const thLine = asRecord(asRecord(basketOf(th)[0]).selectionReason);
        const thUser = JSON.stringify(
          questionsOf(broadTh).map((item) => ({
            labels: Array.isArray(item.choices)
              ? item.choices.map((choice) => asRecord(choice).label)
              : [],
            prompt: item.prompt
          }))
        );
        const ok =
          !explanationClaimsB12(basketOf(en)[0] ?? {}) &&
          !explanationClaimsB12(basketOf(th)[0] ?? {}) &&
          /Vitamin B1|B1/.test(String(enLine.message ?? "")) &&
          /Vitamin B6|B6/.test(String(enLine.message ?? "")) &&
          Boolean(enLine.messageKey) &&
          Boolean(thLine.messageKey) &&
          String(thLine.message ?? "") !== String(enLine.message ?? "") &&
          !/sup_ae_/.test(thUser) &&
          /Vitamin |Iron|Manganese|Probiotics/.test(thUser) &&
          jsonSize(en) <= 16384 &&
          jsonSize(broadEn) <= 32768 &&
          !/matcherTelemetry|factLedger/.test(JSON.stringify({ en, th, broadEn, broadTh }));
        return ok
          ? pass("AX8-06", { enKey: enLine.messageKey, thKey: thLine.messageKey })
          : fail("AX8-06", {
              enMessage: enLine.message ?? null,
              thMessage: thLine.message ?? null,
              bytes: jsonSize(broadEn)
            });
      })
    );

    const byId = new Map(cases.map((item) => [item.id, item]));
    const firstSix = CASE_IDS.slice(0, 6).map(
      (id) => byId.get(id) ?? fail(id, { missing: true })
    );
    const failedSix = firstSix.filter((item) => item.result !== "PASS").map((item) => item.id);
    cases.push(
      failedSix.length === 0
        ? pass("AX8-07", { passed: firstSix.map((item) => item.id) })
        : fail("AX8-07", { failed: failedSix })
    );

    const ordered = CASE_IDS.map(
      (id) => cases.find((item) => item.id === id) ?? fail(id, { missing: true })
    );
    return {
      cases: ordered,
      packVersion: "agentic-experience-8.0",
      passedCases: ordered.filter((item) => item.result === "PASS").length,
      totalCases: 7
    };
  } finally {
    endDeterministicIdsForTests();
    setAgenticRuntimeForTests(null);
  }
}

if (process.env.NODE_TEST_CONTEXT) {
  describe("agentic experience cycle 8 pack", () => {
    it("exports 7 cases and a canonical report", async () => {
      const report = await runAeC8Pack();
      assert.equal(report.totalCases, 7);
      assert.equal(report.cases.length, 7);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...CASE_IDS]
      );
      const encoded = canonicalAeC8Report(report);
      assert.equal(encoded, canonicalAeC8Report(JSON.parse(encoded) as AeC8PackReport));
    });
  });
}
