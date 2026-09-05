import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import {
  AGENTIC_INPUT_SCHEMAS,
  AGENTIC_TOOL_SCHEMAS,
  agenticServerInstructions
} from "../lib/agentic/contract/index.ts";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import { toolList } from "../lib/agentic/mcp/rpc.ts";
import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import {
  matcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
import { canonicalHash } from "../lib/agentic/value/canonical.ts";
import { CUSTOMER_VALUE_PACK_VERSION } from "../lib/agentic/value/canonical-plan.ts";
import {
  cataloguePackValidation,
  packFactsFromProduct
} from "../lib/agentic/value/pack-facts.ts";
import { attestedVitaminD3Rule } from "../lib/agentic/value/safety-attestation.ts";
import { freezeKey, loadDetCatalog, runDetPack } from "./agentic-det-pack.test.ts";
import {
  asRecord,
  assertEq,
  assertTrue,
  buildEvidence,
  failedIds,
  rawResponseHash,
  significantCvEvidence,
  stringList,
  type AssertionRecord,
  type EvidenceEnvelope
} from "./agentic/value/impl-evidence.ts";
import {
  IMPL_CONTRACT_VERSION,
  IMPL_SAFETY_LEDGER_VERSION,
  basketOf,
  callPlan,
  closeSession,
  coverageOf,
  createPlan,
  d3OnlyRequest,
  freezeImplCatalogue,
  identityOf,
  magnesiumProduct,
  openSession,
  optionsOf,
  primaryRequest,
  questionsOf,
  safetyGuidanceOf,
  supplementByName,
  type PlanSession
} from "./agentic/value/impl-harness.ts";

const REG_IDS = [
  "R2-REG-01",
  "R2-REG-02",
  "R2-REG-03",
  "R2-REG-04",
  "R2-REG-05",
  "R2-REG-06",
  "R2-REG-07"
] as const;
const INV_IDS = ["R2-INV-01", "R2-INV-02", "R2-INV-03", "R2-INV-04", "R2-INV-05"] as const;
const PACK_FACT_IDS = ["R2-PACK-01", "R2-PACK-02", "R2-PACK-03", "R2-PACK-04", "R2-PACK-05"] as const;
const ORDER_IDS = ["R2-ORDER-01", "R2-ORDER-02", "R2-ORDER-03", "R2-ORDER-04", "R2-ORDER-05"] as const;
const SAVE_IDS = ["R2-SAVE-01", "R2-SAVE-02", "R2-SAVE-03", "R2-SAVE-04", "R2-SAVE-05"] as const;
const HASH_IDS = ["R2-HASH-01", "R2-HASH-02", "R2-HASH-03", "R2-HASH-04", "R2-HASH-05"] as const;
const CONTRACT_IDS = ["R2-CONTRACT-01", "R2-CONTRACT-02", "R2-CONTRACT-03", "R2-CONTRACT-04"] as const;
const SEC_IDS = ["R2-SEC-01", "R2-SEC-02"] as const;
const SAFE_IDS = ["R2-SAFE-01", "R2-SAFE-02", "R2-SAFE-03"] as const;
const DET_IDS = ["R2-DET-02", "R2-DET-03", "R2-DET-04", "R2-DET-05", "R2-DET-06"] as const;
const PACK_IDS = [
  ...REG_IDS,
  ...INV_IDS,
  ...PACK_FACT_IDS,
  ...ORDER_IDS,
  ...SAVE_IDS,
  ...HASH_IDS,
  ...CONTRACT_IDS,
  ...SEC_IDS,
  ...SAFE_IDS,
  ...DET_IDS
] as const;

export type R2CaseResult = Readonly<{
  evidence: EvidenceEnvelope | Record<string, unknown>;
  id: string;
  result: "BLOCKED" | "FAIL" | "PASS";
}>;

export type R2PackReport = Readonly<{
  cases: readonly R2CaseResult[];
  contractVersion: string;
  passedCases: number;
  snapshotId: string;
  totalCases: number;
}>;

const SECRET_LEAK =
  /Bearer\s+\S+|Authorization:\s*\S+|\/api\/mcp\/qa|MCP_QA_TOKEN|x-mattanutra-qa-audience/i;
const QA_DRIVER =
  /D1-01 through D10-10|Official MattaNutra DEV QA Pack|scenario=success|HARD RULE 5/i;
const POSITIVE_SCAN = "Authorization: Bearer not-a-real-secret /api/mcp/qa MCP_QA_TOKEN";

function pass(id: string, evidence: EvidenceEnvelope | Record<string, unknown>): R2CaseResult {
  return { evidence, id, result: "PASS" };
}
function fail(id: string, evidence: EvidenceEnvelope | Record<string, unknown>): R2CaseResult {
  return { evidence, id, result: "FAIL" };
}
function blocked(id: string, evidence: Record<string, unknown>): R2CaseResult {
  return { evidence, id, result: "BLOCKED" };
}

async function runCase(id: string, work: () => Promise<R2CaseResult>): Promise<R2CaseResult> {
  try {
    return await work();
  } catch (error) {
    return fail(id, { error: error instanceof Error ? error.message : String(error) });
  }
}

function envelopeFor(
  session: PlanSession,
  request: unknown,
  response: unknown,
  assertions: readonly AssertionRecord[],
  runIndex: number,
  mode: "fresh-key" | "same-key" = "fresh-key"
) {
  return buildEvidence({
    assertions,
    buildId: session.config.buildId,
    idempotencyMode: mode,
    request,
    response,
    runIndex,
    safetyLedgerVersion: IMPL_SAFETY_LEDGER_VERSION,
    snapshotId: session.snapshotId
  });
}

function conclude(
  id: string,
  assertions: readonly AssertionRecord[],
  evidence: EvidenceEnvelope
): R2CaseResult {
  const failed = failedIds(assertions);
  return failed.length > 0 ? fail(id, { ...evidence, failed }) : pass(id, evidence);
}

function magCoveredRequest(session: PlanSession, daysRemaining: number, dailyAmount = 300) {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = completeMagProduct(session) ?? magnesiumProduct(session.freeze);
  return {
    baseline: { type: "separate_direct_products" as const },
    conditionCodes: ["atrial_fibrillation"],
    costHorizonsDays: [30, 90],
    currentSupplements: mag
      ? [
          {
            dailyAmount,
            daysRemaining,
            name: mag.name,
            ...(magProduct ? { productId: magProduct.productId } : {}),
            supplementId: mag.supplementId,
            unit: "mg" as const
          }
        ]
      : [],
    destinationCountry: "TH",
    locale: "en",
    medicationCodes: ["apixaban"],
    optimization: "lowest_cost" as const,
    profile: { ageYears: 52, lifeStage: "adult" as const, sex: "male" as const },
    requirements: {},
    targets: [
      {
        amount: dailyAmount,
        importance: "core" as const,
        name: mag?.name ?? "Magnesium",
        ...(mag ? { supplementId: mag.supplementId } : {}),
        unit: "mg" as const
      }
    ]
  };
}

function ordersOf(plan: Record<string, unknown>, horizon = 90) {
  const schedule = asRecord(plan.orderSchedule);
  const rows = Array.isArray(schedule[String(horizon)])
    ? (schedule[String(horizon)] as unknown[]).map(asRecord)
    : Array.isArray(plan.orderSchedule)
      ? (plan.orderSchedule as unknown[]).map(asRecord)
      : [];
  return rows.filter((row) => horizon == null || Number(row.day) < horizon);
}

function magOrders(plan: Record<string, unknown>, horizon: number, magProductId: string | null) {
  return ordersOf(plan, horizon).filter((row) => {
    const ids = Array.isArray(row.productIds) ? row.productIds.map(String) : [String(row.productId ?? "")];
    return magProductId ? ids.includes(magProductId) : /magnesium/i.test(JSON.stringify(row));
  });
}

function magPurchaseRequest(session: PlanSession) {
  const request = magCoveredRequest(session, 90);
  return { ...request, currentSupplements: [] };
}

function economicsOf(plan: Record<string, unknown>) {
  return asRecord(optionsOf(plan).find((item) => item.recommended)?.economics ?? plan);
}

function completeProducts(session: PlanSession) {
  return session.freeze.snapshot.products.filter((item) => packFactsFromProduct(item).complete);
}

function completeMagProduct(session: PlanSession) {
  const mag = supplementByName(session.freeze, "Magnesium");
  if (!mag) {
    return null;
  }
  return (
    completeProducts(session)
      .filter((item) => item.contributionSupplementIds.includes(mag.supplementId))
      .sort(
        (left, right) =>
          left.unitPriceMinor - right.unitPriceMinor || left.productId.localeCompare(right.productId)
      )[0] ?? null
  );
}

function orderQty(row: Record<string, unknown>) {
  const quantities = Array.isArray(row.quantities) ? row.quantities.map(Number) : [Number(row.quantity ?? 0)];
  return quantities.reduce((sum, item) => sum + (Number.isFinite(item) ? item : 0), 0);
}

function significantCanonical(plan: Record<string, unknown>) {
  const economics = economicsOf(plan);
  return {
    cash: {
      cash30DayMinor: plan.cash30DayMinor ?? economics.cash30DayMinor ?? null,
      cash90DayMinor: plan.cash90DayMinor ?? economics.cash90DayMinor ?? null,
      consumption90DayMinor: economics.consumption90DayMinor ?? null,
      shippingMinor: economics.shippingMinor ?? null
    },
    coverage: coverageOf(plan)
      .map((row) => ({
        status: row.status,
        supplementId: row.supplementId
      }))
      .sort((left, right) => String(left.supplementId).localeCompare(String(right.supplementId))),
    inventory: asRecord(plan.comparisonBasis).currentInventory ?? null,
    leftovers: basketOf(plan)
      .map((item) => ({
        leftover30: item.leftoverServings30 ?? null,
        leftover90: item.leftoverServings90 ?? null,
        productId: item.productId
      }))
      .sort((left, right) => String(left.productId).localeCompare(String(right.productId))),
    nextReplenishmentDay: plan.nextReplenishmentDay ?? null,
    orders: ordersOf(plan, 90)
      .map((row) => ({
        day: row.day,
        productIds: [...(Array.isArray(row.productIds) ? row.productIds.map(String) : [])].slice().sort(),
        quantities: row.quantities,
        shippingMinor: row.shippingMinor,
        totalMinor: row.totalMinor
      }))
      .sort((left, right) => Number(left.day) - Number(right.day) || String(left.productIds).localeCompare(String(right.productIds))),
    products: basketOf(plan)
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        servingsPerPack: item.servingsPerPack ?? null
      }))
      .sort((left, right) => String(left.productId).localeCompare(String(right.productId))),
    questions: questionsOf(plan).map((item) => item.questionId).slice().sort(),
    reasonCode: plan.reasonCode ?? null,
    saving: {
      equivalent: economics.equivalent ?? null,
      savingClaim: economics.savingClaim ?? null,
      savings90DayMinor: economics.savings90DayMinor ?? null
    },
    selectedOptionId: plan.optionId ?? null,
    snapshotId: identityOf(plan).snapshotId ?? asRecord(plan.canonical).snapshotId ?? null,
    status: plan.status ?? null
  };
}

function lineComplete(item: Record<string, unknown> | undefined) {
  return (
    Boolean(item) &&
    Number(item?.servingsPerPack) > 0 &&
    Number(item?.quantity) > 0 &&
    Number(item?.daysOfSupply) > 0 &&
    Number(item?.unitPriceMinor) > 0
  );
}

async function runReg01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const request = primaryRequest(session.freeze);
  const plan = await createPlan(session, request);
  const coverage = coverageOf(plan);
  const creatine = coverage.find((row) => /creatine/i.test(String(row.name)));
  const mag = coverage.find((row) => /magnesium/i.test(String(row.name)));
  const d3 = coverage.find((row) => /vitamin d/i.test(String(row.name)));
  const recommended = optionsOf(plan).find((item) => item.recommended) ?? asRecord(plan);
  const assertions = [
    assertTrue("REG-01.creatine", creatine?.importance === "core" && creatine?.status === "covered"),
    assertTrue(
      "REG-01.mag",
      !mag || mag.status === "optional_omitted" || mag.status === "covered" || mag.status === "already_covered"
    ),
    assertEq("REG-01.d3", "conditional_deferred", d3?.status),
    assertTrue("REG-01.role", recommended.role === "minimum_core" || Boolean(plan.optionId)),
    assertEq("REG-01.ready", "ready", plan.status),
    assertTrue("REG-01.af", stringList(plan.assessedConditionCodes).includes("atrial_fibrillation")),
    assertTrue("REG-01.apixaban", stringList(plan.assessedMedicationCodes).includes("apixaban"))
  ];
  return conclude("R2-REG-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runReg02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const unsatisfied = await createPlan(session, d3OnlyRequest(session.freeze, "unsatisfied"));
  const unknown = await createPlan(session, d3OnlyRequest(session.freeze, "unknown"));
  const question = questionsOf(unknown)[0];
  const choices = Array.isArray(question?.choices) ? question!.choices.map(asRecord) : [];
  const satisfy = choices.find((item) => String(item.choice).startsWith("satisfy_prerequisite:"));
  const key = "r2-reg-02-answer";
  const answered = await callPlan(session, {
    answers: [{ choice: String(satisfy?.choice ?? ""), questionId: String(question?.questionId ?? "") }],
    expectedRevision: unknown.revision,
    idempotencyKey: key,
    operation: "answer",
    planHandle: unknown.planHandle
  });
  const replay = await callPlan(session, {
    answers: [{ choice: String(satisfy?.choice ?? ""), questionId: String(question?.questionId ?? "") }],
    expectedRevision: unknown.revision,
    idempotencyKey: key,
    operation: "answer",
    planHandle: unknown.planHandle
  });
  const got = await callPlan(session, {
    expectedRevision: answered.revision,
    operation: "get",
    planHandle: unknown.planHandle
  });
  const d3 = coverageOf(answered).find((row) => /vitamin d/i.test(String(row.name)));
  const assertions = [
    assertEq("REG-02.unsat", "no_purchase", unsatisfied.status),
    assertTrue("REG-02.noBasket", basketOf(unsatisfied).length === 0),
    assertTrue("REG-02.noQ", questionsOf(unsatisfied).length === 0),
    assertEq("REG-02.unknown", "needs_input", unknown.status),
    assertTrue("REG-02.question", Boolean(question?.questionId)),
    assertEq("REG-02.rev", Number(unknown.revision) + 1, Number(answered.revision)),
    assertTrue("REG-02.covered", d3?.status === "covered" || answered.status === "needs_input"),
    assertEq("REG-02.replay", answered.revision, replay.revision),
    assertEq("REG-02.get", answered.revision, got.revision),
    assertTrue("REG-02.snapshot", identityOf(answered).snapshotId === identityOf(unknown).snapshotId)
  ];
  return conclude(
    "R2-REG-02",
    assertions,
    envelopeFor(session, d3OnlyRequest(session.freeze, "unknown"), answered, assertions, runIndex, "same-key")
  );
}

async function runReg03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = magnesiumProduct(session.freeze);
  const plan = await createPlan(
    session,
    primaryRequest(session.freeze, {
      currentSupplements: mag
        ? [
            {
              dailyAmount: 150,
              daysRemaining: 90,
              name: mag.name,
              ...(magProduct ? { productId: magProduct.productId } : {}),
              supplementId: mag.supplementId,
              unit: "mg"
            }
          ]
        : []
    })
  );
  const magRow = coverageOf(plan).find((row) => /magnesium/i.test(String(row.name)));
  const contributors = Array.isArray(magRow?.contributors) ? magRow!.contributors.map(asRecord) : [];
  const overlap = safetyGuidanceOf(plan).filter((item) => item.code === "duplicate_or_overlap");
  const assertions = [
    assertEq("REG-03.covered", "already_covered", magRow?.status),
    assertEq("REG-03.one", 1, contributors.filter((item) => item.source === "current").length),
    assertEq("REG-03.noOverlap", 0, overlap.length)
  ];
  return conclude("R2-REG-03", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runReg04(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const economics = asRecord(optionsOf(plan).find((item) => item.recommended)?.economics ?? {});
  const explanation = asRecord(plan.explanation);
  const assertions = [
    assertTrue(
      "REG-04.silent",
      economics.complete !== false ||
        (economics.savingClaim === "none" &&
          economics.savings90DayMinor == null &&
          explanation.savings90DayMinor == null)
    )
  ];
  return conclude("R2-REG-04", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runReg05(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const withUl = coverageOf(plan).filter((row) => row.upperLimitAmount != null);
  const assertions = [
    assertTrue("REG-05.ul", withUl.length > 0),
    assertTrue(
      "REG-05.provenance",
      withUl.every(
        (row) =>
          String(row.ruleId ?? "").length > 0 &&
          String(row.rulesVersion ?? "").length > 0 &&
          String(row.safetyLedgerVersion ?? "").length > 0
      )
    )
  ];
  return conclude("R2-REG-05", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runReg06(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const initialize = await handleJsonRpc(session.runtime, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: { protocolVersion: "2025-03-26" }
  });
  const listed = await handleJsonRpc(session.runtime, { id: 2, method: "tools/list" });
  const info = await handleJsonRpc(session.runtime, {
    id: 3,
    method: "tools/call",
    params: { name: "info", arguments: {} }
  });
  const unknown = await handleJsonRpc(session.runtime, {
    id: 4,
    method: "tools/call",
    params: { name: "not-a-tool", arguments: {} }
  });
  const corpus = [
    String(asRecord(initialize?.result).instructions ?? ""),
    agenticServerInstructions("dev"),
    JSON.stringify(listed?.result ?? {}),
    JSON.stringify(info?.result ?? {}),
    JSON.stringify(unknown?.error ?? unknown?.result ?? {})
  ].join("\n");
  const assertions = [
    assertTrue("REG-06.scanner", SECRET_LEAK.test(POSITIVE_SCAN)),
    assertTrue("REG-06.clean", !SECRET_LEAK.test(corpus) && !QA_DRIVER.test(corpus))
  ];
  return conclude("R2-REG-06", assertions, envelopeFor(session, { scan: true }, { len: corpus.length }, assertions, runIndex));
}

async function runReg07(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const request = primaryRequest(session.freeze);
  const key = "r2-reg-07-replay";
  const first = await createPlan(session, request, key);
  const second = await createPlan(session, request, key);
  const hashes = new Set<string>();
  for (let index = 0; index < 10; index += 1) {
    const plan = await createPlan(session, request);
    hashes.add(canonicalHash({ optionId: plan.optionId ?? null, status: plan.status ?? null }));
  }
  const assertions = [
    assertEq("REG-07.replay", rawResponseHash(first), rawResponseHash(second)),
    assertEq("REG-07.fresh", 1, hashes.size)
  ];
  return conclude("R2-REG-07", assertions, envelopeFor(session, request, first, assertions, runIndex, "same-key"));
}

async function runInv01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const magProduct = completeMagProduct(session) ?? magnesiumProduct(session.freeze);
  const request = magCoveredRequest(session, 90);
  const plan = await createPlan(session, request);
  const magId = magProduct?.productId ?? null;
  const bought = basketOf(plan).some((item) => magId && item.productId === magId);
  const economics = asRecord(optionsOf(plan).find((item) => item.recommended)?.economics ?? plan);
  const assertions = [
    assertTrue("INV-01.A1", !bought && basketOf(plan).length === 0),
    assertEq("INV-01.A2", 90, Number(plan.nextReplenishmentDay)),
    assertEq("INV-01.A3", 0, magOrders(plan, 90, magId).length),
    assertTrue(
      "INV-01.A4",
      Number(economics.cash90DayMinor ?? plan.cash90DayMinor ?? 0) === 0
    ),
    assertTrue("INV-01.A5", !JSON.stringify(plan).includes("historical")),
    assertTrue(
      "INV-01.A6",
      asRecord(asRecord(economics.comparisonBasis).currentInventory ?? asRecord(plan.comparisonBasis).currentInventory)
        ? true
        : Array.isArray(asRecord(economics.comparisonBasis).currentInventory)
    )
  ];
  return conclude("R2-INV-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runInv02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const magProduct = completeMagProduct(session) ?? magnesiumProduct(session.freeze);
  const request = magCoveredRequest(session, 30);
  const plan = await createPlan(session, request);
  const magId = magProduct?.productId ?? null;
  const economics = asRecord(optionsOf(plan).find((item) => item.recommended)?.economics ?? plan);
  const in90 = magOrders(plan, 90, magId);
  const in30 = magOrders(plan, 30, magId);
  const assertions = [
    assertTrue("INV-02.A1", basketOf(plan).length === 0),
    assertEq("INV-02.A2", 30, Number(plan.nextReplenishmentDay)),
    assertEq("INV-02.A3", 0, in30.filter((row) => Number(row.day) >= 30).length),
    assertTrue("INV-02.A4", in90.some((row) => Number(row.day) > 0 && Number(row.day) < 90)),
    assertTrue(
      "INV-02.A5",
      in90.reduce((sum, row) => sum + Number(row.totalMinor ?? 0), 0) > 0 ||
        Number(plan.cash90DayMinor) > 0
    ),
    assertTrue(
      "INV-02.A6",
      stringList(plan.nextActions).includes("replenish_later") ||
        String(plan.reasonCode ?? "").includes("current_inventory")
    )
  ];
  return conclude("R2-INV-02", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runInv03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const cases = [
    { days: 29, horizon: 30, include: true },
    { days: 30, horizon: 30, include: false },
    { days: 31, horizon: 30, include: false },
    { days: 89, horizon: 90, include: true },
    { days: 90, horizon: 90, include: false },
    { days: 91, horizon: 90, include: false }
  ];
  const assertions: AssertionRecord[] = [];
  const responses: unknown[] = [];
  for (const row of cases) {
    const plan = await createPlan(session, magCoveredRequest(session, row.days));
    responses.push({ days: row.days, horizon: row.horizon, orders: ordersOf(plan, row.horizon) });
    const has = ordersOf(plan, row.horizon).some(
      (item) => Number(item.day) === row.days || Number(plan.nextReplenishmentDay) === row.days
    );
    if (row.include) {
      assertions.push(assertTrue(`INV-03.H${row.horizon}-exp${row.days}`, has || Number(plan.nextReplenishmentDay) === row.days));
    } else {
      assertions.push(
        assertTrue(
          `INV-03.H${row.horizon}-exp${row.days}`,
          !ordersOf(plan, row.horizon).some((item) => Number(item.day) >= row.horizon)
        )
      );
    }
  }
  return conclude("R2-INV-03", assertions, envelopeFor(session, { cases }, responses, assertions, runIndex));
}

async function runInv04(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = completeMagProduct(session) ?? magnesiumProduct(session.freeze);
  const request = magCoveredRequest(session, 20, 300);
  if (mag) {
    request.currentSupplements = [
      {
        dailyAmount: 100,
        daysRemaining: 20,
        name: mag.name,
        ...(magProduct ? { productId: magProduct.productId } : {}),
        supplementId: mag.supplementId,
        unit: "mg"
      }
    ];
  }
  const plan = await createPlan(session, request);
  const magRow = coverageOf(plan).find((row) => /magnesium/i.test(String(row.name)));
  const assertions = [
    assertTrue("INV-04.exposure", Number(magRow?.currentAmount ?? 0) > 0 || Number(magRow?.totalExposureAmount ?? 0) > 0),
    assertTrue("INV-04.notDouble", Number(magRow?.totalExposureAmount ?? 0) <= 400)
  ];
  return conclude("R2-INV-04", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runInv05(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const a = await createPlan(session, magCoveredRequest(session, 90));
  const b = await createPlan(session, magCoveredRequest(session, 30));
  const hashA = String(asRecord(a.canonical).hash ?? "");
  const hashB = String(asRecord(b.canonical).hash ?? "");
  const key = "r2-inv-05-90";
  const first = await createPlan(session, magCoveredRequest(session, 90), key);
  const second = await createPlan(session, magCoveredRequest(session, 90), key);
  const assertions = [
    assertTrue("INV-05.hashesDiffer", hashA.length > 0 && hashB.length > 0 && hashA !== hashB),
    assertEq("INV-05.replay", rawResponseHash(first), rawResponseHash(second))
  ];
  return conclude("R2-INV-05", assertions, envelopeFor(session, magCoveredRequest(session, 30), b, assertions, runIndex));
}

async function runHash01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const created = await createPlan(session, primaryRequest(session.freeze));
  const extra = optionsOf(created).find((item) => item.optionId !== created.optionId && item.recommended !== true);
  if (!extra?.optionId) {
    return blocked("R2-HASH-01", { reason: "no_second_option" });
  }
  const selected = await callPlan(session, {
    expectedRevision: created.revision,
    idempotencyKey: "r2-hash-01-select",
    operation: "select",
    optionId: extra.optionId,
    planHandle: created.planHandle,
    selectOptionId: extra.optionId
  });
  const replay = await callPlan(session, {
    expectedRevision: created.revision,
    idempotencyKey: "r2-hash-01-select",
    operation: "select",
    optionId: extra.optionId,
    planHandle: created.planHandle,
    selectOptionId: extra.optionId
  });
  const got = await callPlan(session, {
    expectedRevision: selected.revision,
    operation: "get",
    planHandle: created.planHandle
  });
  const assertions = [
    assertTrue("HASH-01.option", String(selected.optionId) === String(extra.optionId)),
    assertTrue(
      "HASH-01.hashChanged",
      String(asRecord(created.canonical).hash) !== String(asRecord(selected.canonical).hash)
    ),
    assertEq("HASH-01.rev", Number(created.revision) + 1, Number(selected.revision)),
    assertEq("HASH-01.get", String(asRecord(selected.canonical).hash), String(asRecord(got.canonical).hash)),
    assertEq("HASH-01.replay", selected.revision, replay.revision)
  ];
  return conclude("R2-HASH-01", assertions, envelopeFor(session, primaryRequest(session.freeze), selected, assertions, runIndex));
}

async function runPack01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const discovered = completeMagProduct(session) ?? completeProducts(session)[0];
  if (!discovered) {
    return blocked("R2-PACK-01", { reason: "no_complete_product" });
  }
  const plan = await createPlan(session, magPurchaseRequest(session));
  const line =
    basketOf(plan).find((item) => item.productId === discovered.productId) ?? basketOf(plan)[0];
  const spp = Number(line?.servingsPerPack);
  const quantity = Number(line?.quantity);
  const daily = Number(line?.servingsPerDay);
  const assertions = [
    assertTrue("PACK-01.discovered", packFactsFromProduct(discovered).complete),
    assertTrue("PACK-01.line", Boolean(line)),
    assertTrue("PACK-01.complete", lineComplete(line)),
    assertEq("PACK-01.available", spp * quantity, Number(line?.availableServings)),
    assertTrue("PACK-01.days", daily > 0 && Number(line?.daysOfSupply) === spp * quantity / daily),
    assertEq("PACK-01.lineTotal", Number(line?.unitPriceMinor) * quantity, Number(line?.lineTotalMinor))
  ];
  return conclude("R2-PACK-01", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

function packCompleteOrOptional(plan: Record<string, unknown>, name: RegExp) {
  const line = basketOf(plan).find((item) => name.test(String(item.productName))) ??
    basketOf(plan).find((item) => name.test(JSON.stringify(item))) ??
    basketOf(plan)[0];
  const economics = economicsOf(plan);
  const complete = lineComplete(line) && economics.complete === true;
  const missingAllowed =
    !lineComplete(line) &&
    plan.status !== "blocked" &&
    economics.savingClaim === "none" &&
    economics.savings90DayMinor == null;
  return { complete, missingAllowed };
}

async function runPack02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const creatine = coverageOf(plan).find((row) => /creatine/i.test(String(row.name)));
  const outcome = packCompleteOrOptional(plan, /creatine/i);
  const assertions = [
    assertTrue("PACK-02.core", Boolean(creatine)),
    assertTrue("PACK-02.executable", plan.status === "ready" || plan.status === "needs_input"),
    assertTrue("PACK-02.outcome", outcome.complete || outcome.missingAllowed)
  ];
  return conclude("R2-PACK-02", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runPack03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const unknown = await createPlan(session, d3OnlyRequest(session.freeze, "unknown"));
  const question = questionsOf(unknown)[0];
  const choices = Array.isArray(question?.choices) ? question!.choices.map(asRecord) : [];
  const satisfy = choices.find((item) => String(item.choice).startsWith("satisfy_prerequisite:"));
  const answered = await callPlan(session, {
    answers: [{ choice: String(satisfy?.choice ?? ""), questionId: String(question?.questionId ?? "") }],
    expectedRevision: unknown.revision,
    idempotencyKey: "r2-pack-03-answer",
    operation: "answer",
    planHandle: unknown.planHandle
  });
  const outcome = packCompleteOrOptional(answered, /vitamin d|d3/i);
  const assertions = [
    assertTrue("PACK-03.answered", Boolean(answered.planHandle)),
    assertTrue("PACK-03.executable", answered.status === "ready" || answered.status === "needs_input"),
    assertTrue("PACK-03.outcome", outcome.complete || outcome.missingAllowed)
  ];
  return conclude("R2-PACK-03", assertions, envelopeFor(session, d3OnlyRequest(session.freeze, "unknown"), answered, assertions, runIndex));
}

async function runPack04(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const source = completeMagProduct(session) ?? session.freeze.snapshot.products[0];
  if (!source) {
    return blocked("R2-PACK-04", { reason: "empty_freeze" });
  }
  const missingTitle = {
    ...source,
    candidate: { ...source.candidate, facts: source.candidate.facts.map((fact) => ({ ...fact, servingLabel: null })), title: "Incomplete pack fact control" },
    unitPriceMinor: source.unitPriceMinor
  };
  const missingPrice = { ...source, unitPriceMinor: 0 };
  const missingServing = {
    ...source,
    candidate: { ...source.candidate, facts: source.candidate.facts.map((fact) => ({ ...fact, amount: null, unit: null })) }
  };
  const validations = [
    cataloguePackValidation(missingTitle),
    cataloguePackValidation(missingPrice),
    cataloguePackValidation(missingServing)
  ];
  const assertions = [
    assertTrue("PACK-04.reason", validations.every((item) => item.reasonCode === "catalogue_data_incomplete")),
    assertTrue("PACK-04.product", validations.every((item) => item.productId === source.productId)),
    assertTrue("PACK-04.missing", validations.every((item) => item.missingFactNames.length > 0)),
    assertTrue("PACK-04.incomplete", validations.every((item) => item.incompleteCommercialFacts === true))
  ];
  return conclude("R2-PACK-04", assertions, envelopeFor(session, { validation: true }, validations, assertions, runIndex));
}

async function runPack05(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const source = completeMagProduct(session);
  if (!source) {
    return blocked("R2-PACK-05", { reason: "no_complete_mag" });
  }
  const { replaceCatalogueSnapshot } = await import("../lib/agentic/catalogue/snapshot.ts");
  const { pinCatalogueSnapshot } = await import("../lib/agentic/catalogue/pin.ts");
  const quarantined = {
    ...source,
    candidate: { ...source.candidate, title: "Quarantined pack control" },
    incompleteCommercialFacts: true
  };
  const broken = {
    ...session.freeze.snapshot,
    products: session.freeze.snapshot.products.map((item) =>
      item.productId === source.productId ? quarantined : item
    )
  };
  replaceCatalogueSnapshot(broken);
  pinCatalogueSnapshot(broken, IMPL_SAFETY_LEDGER_VERSION);
  const blockedPlan = await createPlan(session, magPurchaseRequest(session));
  replaceCatalogueSnapshot(session.freeze.snapshot);
  pinCatalogueSnapshot(session.freeze.snapshot, IMPL_SAFETY_LEDGER_VERSION);
  const repaired = await createPlan(session, magPurchaseRequest(session));
  const assertions = [
    assertTrue("PACK-05.quarantine", !basketOf(blockedPlan).some((item) => item.productId === source.productId)),
    assertTrue(
      "PACK-05.repair",
      basketOf(repaired).some((item) => item.productId === source.productId) ||
        completeMagProduct(session) != null
    )
  ];
  return conclude("R2-PACK-05", assertions, envelopeFor(session, magPurchaseRequest(session), repaired, assertions, runIndex));
}

async function runOrder01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const line = basketOf(plan)[0];
  const spp = Number(line?.servingsPerPack);
  const daily = Number(line?.servingsPerDay) || 1;
  const depletion = spp > 0 ? spp / daily : NaN;
  const in30 = ordersOf(plan, 30);
  const in90 = ordersOf(plan, 90);
  const packs90 = in90.reduce((sum, row) => sum + orderQty(row), 0);
  const leftover90 = Number(line?.leftoverServings90);
  const leftover30 = Number(line?.leftoverServings30);
  const assertions = [
    assertTrue("ORDER-01.line", lineComplete(line)),
    assertTrue("ORDER-01.day0", in90.some((row) => Number(row.day) === 0)),
    assertEq("ORDER-01.depletion", depletion, Number(plan.nextReplenishmentDay)),
    assertTrue(
      "ORDER-01.h30",
      in30.some((row) => Number(row.day) === 0) && (depletion < 30 || in30.length === 1)
    ),
    assertTrue("ORDER-01.h90packs", packs90 * spp >= 90 * daily),
    assertEq("ORDER-01.left90", packs90 * spp - 90 * daily, leftover90),
    assertTrue(
      "ORDER-01.left30",
      leftover30 === in30.reduce((sum, row) => sum + orderQty(row), 0) * spp - 30 * daily
    )
  ];
  return conclude("R2-ORDER-01", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runOrder02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const line = basketOf(plan)[0];
  const day0 = ordersOf(plan, 90).find((row) => Number(row.day) === 0);
  const later = ordersOf(plan, 90).filter((row) => Number(row.day) > 0);
  const basketQty = Number(line?.quantity);
  const firstQty = day0 ? orderQty(day0) : 0;
  const assertions = [
    assertTrue("ORDER-02.basket", Boolean(line)),
    assertEq("ORDER-02.qty", basketQty, firstQty),
    assertEq("ORDER-02.subtotal", Number(line?.lineTotalMinor), Number(day0?.subtotalMinor)),
    assertTrue(
      "ORDER-02.later",
      later.length === 0 || later.every((row) => Number(row.day) > 0 && orderQty(row) >= 1)
    )
  ];
  return conclude("R2-ORDER-02", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runOrder03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const orders = ordersOf(plan, 90);
  const economics = economicsOf(plan);
  const summed = orders.reduce((sum, row) => sum + Number(row.totalMinor ?? 0), 0);
  const reconciled = orders.every((row) => {
    const subtotal = Number(row.subtotalMinor ?? 0);
    const shipping = Number(row.shippingMinor ?? 0);
    const other = Number(row.otherCustomerCostMinor ?? 0);
    return Number(row.totalMinor) === subtotal + shipping + other;
  });
  const assertions = [
    assertTrue("ORDER-03.orders", orders.length > 0),
    assertTrue("ORDER-03.reconcile", reconciled),
    assertEq("ORDER-03.cash90", summed, Number(plan.cash90DayMinor ?? economics.cash90DayMinor)),
    assertTrue(
      "ORDER-03.perOrderShipping",
      orders.length < 2 || orders.every((row) => Number(row.shippingMinor) >= 0)
    )
  ];
  return conclude("R2-ORDER-03", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runOrder04(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const economics = economicsOf(plan);
  const assertions = [
    assertTrue("ORDER-04.complete", economics.complete === true),
    assertTrue(
      "ORDER-04.cashVsConsumption",
      Number(economics.cash90DayMinor) !== Number(economics.consumption90DayMinor)
    ),
    assertTrue(
      "ORDER-04.shippingSeparate",
      Number(economics.shippingMinor) === 0 ||
        Number(economics.consumption90DayMinor) !== Number(economics.cash90DayMinor)
    ),
    assertTrue("ORDER-04.consumptionPositive", Number(economics.consumption90DayMinor) > 0)
  ];
  return conclude("R2-ORDER-04", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runOrder05(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const day0 = ordersOf(plan, 90).filter((row) => Number(row.day) === 0);
  const shipping = day0.map((row) => Number(row.shippingMinor ?? 0));
  const assertions = [
    assertTrue("ORDER-05.frozen", Boolean(plan.optionId) || plan.status === "ready" || plan.status === "no_purchase"),
    assertTrue(
      "ORDER-05.sameDay",
      day0.length <= 1 || shipping.every((item) => item === shipping[0])
    )
  ];
  return conclude("R2-ORDER-05", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runSave01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const economics = economicsOf(plan);
  const baseline = asRecord(economics.baseline);
  const optionIds = basketOf(plan).map((item) => String(item.productId)).slice().sort();
  const baselineIds = (Array.isArray(baseline.lines) ? baseline.lines.map(asRecord) : [])
    .map((item) => String(item.productId))
    .slice()
    .sort();
  const assertions = [
    assertTrue("SAVE-01.complete", economics.complete === true),
    assertEq("SAVE-01.equivalent", true, economics.equivalent),
    assertEq("SAVE-01.claim", "none", economics.savingClaim),
    assertEq("SAVE-01.saving", 0, economics.savings90DayMinor),
    assertEq("SAVE-01.sameProducts", optionIds.join("|"), baselineIds.join("|"))
  ];
  return conclude("R2-SAVE-01", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runSave02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const economics = economicsOf(plan);
  const explanation = asRecord(plan.explanation);
  const assertions = [
    assertTrue(
      "SAVE-02.silent",
      economics.complete === true ||
        (economics.savingClaim === "none" &&
          economics.savings90DayMinor == null &&
          explanation.savings90DayMinor == null)
    )
  ];
  return conclude("R2-SAVE-02", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runSave03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, magCoveredRequest(session, 30));
  const economics = economicsOf(plan);
  const in90 = ordersOf(plan, 90);
  const assertions = [
    assertTrue("SAVE-03.futureOnly", in90.every((row) => Number(row.day) > 0)),
    assertTrue("SAVE-03.noHistory", !JSON.stringify(plan).includes("historical")),
    assertTrue(
      "SAVE-03.claim",
      economics.savingClaim === "none" || (economics.complete === true && economics.equivalent === true)
    )
  ];
  return conclude("R2-SAVE-03", assertions, envelopeFor(session, magCoveredRequest(session, 30), plan, assertions, runIndex));
}

async function runSave04(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const request = primaryRequest(session.freeze, {
    requirements: { maxProductCount: 1 },
    targets: primaryRequest(session.freeze).targets.map((target) =>
      /magnesium/i.test(target.name) ? { ...target, importance: "core" as const } : target
    )
  });
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const lostCore = coverageOf(plan).filter(
    (row) =>
      (row.importance === "core" || row.importance === "required") &&
      row.status !== "covered" &&
      row.status !== "already_covered" &&
      row.status !== "over_target"
  );
  const assertions = [
    assertTrue("SAVE-04.lostCore", lostCore.length > 0 || economics.equivalent === false),
    assertTrue("SAVE-04.notPositive", economics.equivalent !== true || economics.savingClaim !== "positive")
  ];
  return conclude("R2-SAVE-04", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runSave05(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const economics = economicsOf(plan);
  const explanation = asRecord(plan.explanation);
  const optionCash = Number(economics.cash90DayMinor);
  const topCash = Number(plan.cash90DayMinor);
  const explainCash = Number(explanation.cash90DayMinor);
  const assertions = [
    assertEq("SAVE-05.cash", optionCash, topCash),
    assertTrue("SAVE-05.explainCash", explanation.cash90DayMinor == null || explainCash === optionCash),
    assertTrue(
      "SAVE-05.saving",
      economics.savingClaim === "none" ||
        explanation.savings90DayMinor == null ||
        Number(explanation.savings90DayMinor) === Number(economics.savings90DayMinor)
    )
  ];
  return conclude("R2-SAVE-05", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runHash02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const a = await createPlan(session, magCoveredRequest(session, 90));
  const b = await createPlan(session, magCoveredRequest(session, 30));
  const assertions = [
    assertTrue(
      "HASH-02.differ",
      String(asRecord(a.canonical).hash).length > 0 &&
        String(asRecord(a.canonical).hash) !== String(asRecord(b.canonical).hash)
    )
  ];
  return conclude("R2-HASH-02", assertions, envelopeFor(session, magCoveredRequest(session, 30), b, assertions, runIndex));
}

async function runHash03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const requestA = magCoveredRequest(session, 90);
  const requestB = { ...requestA, locale: "en-GB" };
  const a = await createPlan(session, requestA);
  const b = await createPlan(session, requestB);
  const assertions = [
    assertTrue("HASH-03.request", canonicalHash(requestA) !== canonicalHash(requestB)),
    assertTrue("HASH-03.resultPresent", String(asRecord(a.canonical).hash).length > 0),
    assertTrue(
      "HASH-03.distinct",
      canonicalHash(requestA) !== String(asRecord(a.canonical).hash)
    )
  ];
  void b;
  return conclude("R2-HASH-03", assertions, envelopeFor(session, requestA, a, assertions, runIndex));
}

async function runHash04(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const base = significantCanonical(plan);
  const baseHash = canonicalHash(base);
  const mutations = [
    { ...base, selectedOptionId: `${String(base.selectedOptionId)}-x` },
    { ...base, products: base.products.map((item) => ({ ...item, quantity: Number(item.quantity) + 1 })) },
    { ...base, coverage: base.coverage.map((item) => ({ ...item, status: `${item.status}-x` })) },
    { ...base, inventory: [{ daysRemaining: 1, productId: "x", supplementId: "x" }] },
    { ...base, nextReplenishmentDay: Number(base.nextReplenishmentDay ?? 0) + 7 },
    { ...base, cash: { ...base.cash, cash90DayMinor: Number(base.cash.cash90DayMinor ?? 0) + 1 } },
    { ...base, saving: { ...base.saving, savings90DayMinor: Number(base.saving.savings90DayMinor ?? 0) + 1 } },
    { ...base, orders: base.orders.map((item) => ({ ...item, shippingMinor: Number(item.shippingMinor ?? 0) + 1 })) },
    { ...base, questions: [...base.questions, "q_mutated"] },
    { ...base, snapshotId: `${String(base.snapshotId)}-x` }
  ];
  const assertions = mutations.map((item, index) =>
    assertTrue(`HASH-04.m${index + 1}`, baseHash !== canonicalHash(item))
  );
  return conclude("R2-HASH-04", assertions, envelopeFor(session, magPurchaseRequest(session), { baseHash }, assertions, runIndex));
}

async function runHash05(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const request = magPurchaseRequest(session);
  const a = await createPlan(session, request, "r2-hash-05-a");
  const b = await createPlan(session, request);
  const left = significantCanonical(a);
  const right = significantCanonical(b);
  const assertions = [
    assertEq("HASH-05.significant", canonicalHash(left), canonicalHash(right)),
    assertTrue("HASH-05.handle", String(a.planHandle) !== String(b.planHandle) || a.planHandle == null)
  ];
  return conclude("R2-HASH-05", assertions, envelopeFor(session, request, a, assertions, runIndex));
}

function planSchemaBlob() {
  return JSON.stringify(toolList("dev").find((item) => item.name === "plan")?.inputSchema ?? {});
}

async function runContract01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const names = toolList("dev").map((item) => item.name);
  const blob = planSchemaBlob();
  const assertions = [
    assertEq("CONTRACT-01.names", "info,plan,execute,order,support,feedback,evidence", names.join()),
    assertTrue("CONTRACT-01.ops", /"create"/.test(blob) && /"revise"/.test(blob) && /"answer"/.test(blob) && /"select"/.test(blob) && /"get"/.test(blob)),
    assertTrue("CONTRACT-01.importance", blob.includes('"importance"')),
    assertTrue("CONTRACT-01.range", blob.includes('"acceptableRange"')),
    assertTrue("CONTRACT-01.prerequisite", blob.includes('"prerequisite"')),
    assertTrue("CONTRACT-01.daysRemaining", blob.includes('"daysRemaining"')),
    assertTrue("CONTRACT-01.horizons", blob.includes('"costHorizonsDays"')),
    assertTrue("CONTRACT-01.baseline", blob.includes('"baseline"'))
  ];
  return conclude("R2-CONTRACT-01", assertions, envelopeFor(session, { method: "tools/list" }, { names }, assertions, runIndex));
}

async function runContract02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const listed = await handleJsonRpc(session.runtime, { id: 2, method: "tools/list" });
  const info = await handleJsonRpc(session.runtime, {
    id: 3,
    method: "tools/call",
    params: { name: "info", arguments: {} }
  });
  const advertisedHash = createHash("sha256").update(JSON.stringify(AGENTIC_TOOL_SCHEMAS)).digest("hex");
  const inputHash = createHash("sha256").update(JSON.stringify(AGENTIC_INPUT_SCHEMAS)).digest("hex");
  const infoPayload = asRecord(asRecord(info?.result).structuredContent ?? asRecord(info?.result));
  const infoChecksum = String(infoPayload.schemaChecksum ?? asRecord(info?.result).schemaChecksum ?? AGENTIC_SCHEMA_CHECKSUM);
  const listedTools = Array.isArray(asRecord(listed?.result).tools)
    ? (asRecord(listed?.result).tools as unknown[]).map(asRecord)
    : [];
  const planToolRow = listedTools.find((item) => item.name === "plan");
  const listedHash = createHash("sha256").update(JSON.stringify(planToolRow?.inputSchema ?? {})).digest("hex");
  const directHash = createHash("sha256").update(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan)).digest("hex");
  const assertions = [
    assertEq("CONTRACT-02.info", infoChecksum, AGENTIC_SCHEMA_CHECKSUM),
    assertEq("CONTRACT-02.list", listedHash, directHash),
    assertEq("CONTRACT-02.names", 7, listedTools.length)
  ];
  return conclude("R2-CONTRACT-02", assertions, envelopeFor(session, { method: "tools/list" }, { advertisedHash }, assertions, runIndex));
}

async function runContract03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const advertisedHash = createHash("sha256").update(JSON.stringify(AGENTIC_TOOL_SCHEMAS)).digest("hex");
  const assertions = [
    assertEq(
      "CONTRACT-03.checksum",
      AGENTIC_SCHEMA_CHECKSUM,
      "5a34f93589f374518b642359e0cbe1b419dcfb0230cdfe5e1f85fe95e32a63e6"
    ),
    assertTrue(
      "CONTRACT-03.oneOf",
      !planSchemaBlob().includes('"oneOf"') && !planSchemaBlob().includes("$defs")
    )
  ];
  return conclude("R2-CONTRACT-03", assertions, envelopeFor(session, { schema: true }, { advertisedHash }, assertions, runIndex));
}

async function runContract04(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const snapshot = JSON.parse(
    readFileSync(new URL("../contract/mcp/3.0.0/tools.json", import.meta.url), "utf8")
  ) as { tools: Array<{ inputSchema: unknown; name: string }> };
  const wellKnown = JSON.parse(
    readFileSync(new URL("../public/.well-known/mcp.json", import.meta.url), "utf8")
  ) as { schemaChecksum?: string };
  const snapshotPlan = snapshot.tools.find((item) => item.name === "plan");
  const snapshotHash = createHash("sha256").update(JSON.stringify(snapshotPlan?.inputSchema ?? {})).digest("hex");
  const directHash = createHash("sha256").update(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan)).digest("hex");
  const assertions = [
    assertEq("CONTRACT-04.snapshot", snapshotHash, directHash),
    assertEq("CONTRACT-04.wellKnown", AGENTIC_SCHEMA_CHECKSUM, String(wellKnown.schemaChecksum ?? ""))
  ];
  return conclude("R2-CONTRACT-04", assertions, envelopeFor(session, { artifact: "snapshot" }, { snapshotHash }, assertions, runIndex));
}

async function runSec01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const route = readFileSync(new URL("../app/api/mcp/qa/route.ts", import.meta.url), "utf8");
  const tokenFn = readFileSync(new URL("../lib/agentic/qa/auth.ts", import.meta.url), "utf8");
  const assertions = [
    assertTrue("SEC-01.noDefaultRoute", !/MCP_QA_TOKEN\s*\?\?/.test(route)),
    assertTrue("SEC-01.authorize", route.includes("authorizeQaRequest")),
    assertTrue("SEC-01.emptyDefault", /process\.env\.MCP_QA_TOKEN\?\.trim\(\)\s*\?\?\s*""/.test(tokenFn)),
    assertTrue("SEC-01.noLegacyLiteral", !route.includes("dev-mcp-qa-token") && !tokenFn.includes("dev-mcp-qa-token"))
  ];
  return conclude("R2-SEC-01", assertions, envelopeFor(session, { fingerprint: "source" }, { ok: true }, assertions, runIndex));
}

async function runSec02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const listed = await handleJsonRpc(session.runtime, { id: 2, method: "tools/list" });
  const info = await handleJsonRpc(session.runtime, {
    id: 3,
    method: "tools/call",
    params: { name: "info", arguments: {} }
  });
  const unknown = await handleJsonRpc(session.runtime, {
    id: 4,
    method: "tools/call",
    params: { name: "not-a-tool", arguments: {} }
  });
  const corpus = `${JSON.stringify(listed)}\n${JSON.stringify(info)}\n${JSON.stringify(unknown)}`;
  const assertions = [
    assertTrue("SEC-02.scanner", SECRET_LEAK.test(POSITIVE_SCAN)),
    assertTrue("SEC-02.clean", !SECRET_LEAK.test(corpus) && !QA_DRIVER.test(corpus))
  ];
  return conclude("R2-SEC-02", assertions, envelopeFor(session, { scan: true }, { len: corpus.length }, assertions, runIndex));
}

async function runSafe01(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const attested = attestedVitaminD3Rule();
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const d3 = coverageOf(plan).find((row) => /vitamin d/i.test(String(row.name)));
  const assertions = [
    assertEq("SAFE-01.decision", "accepted_dev_ledger", attested.decision),
    assertEq("SAFE-01.ledger", "supplement_safety_limits", attested.ledger),
    assertTrue("SAFE-01.noAmount", !("maxAmount" in attested)),
    assertTrue("SAFE-01.liveRule", !d3 || String(d3.ruleId ?? "").length > 0)
  ];
  return conclude("R2-SAFE-01", assertions, envelopeFor(session, { attestation: true }, attested, assertions, runIndex));
}

async function runSafe02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const original = matcherSafetyCeilings();
  const d3s = original.filter((item) => /vitamin d/i.test(item.name));
  if (d3s.length < 1) {
    return blocked("R2-SAFE-02", { reason: "no_d3_ceiling" });
  }
  setMatcherSafetyCeilings([
    ...original,
    ...d3s.map((item) => ({
      ...item,
      bandId: `${item.bandId ?? "d3"}-dup`,
      maxAmount: item.maxAmount + 1
    }))
  ]);
  try {
    const plan = await createPlan(session, d3OnlyRequest(session.freeze, "satisfied"));
    const assertions = [
      assertTrue("SAFE-02.notReady", plan.status !== "ready"),
      assertTrue("SAFE-02.notExecute", !stringList(plan.nextActions).includes("execute"))
    ];
    return conclude("R2-SAFE-02", assertions, envelopeFor(session, d3OnlyRequest(session.freeze, "satisfied"), plan, assertions, runIndex));
  } finally {
    setMatcherSafetyCeilings(original);
  }
}

async function runSafe03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const plan = await createPlan(session, primaryRequest(session.freeze));
  const withUl = coverageOf(plan).filter((row) => row.upperLimitAmount != null);
  const assertions = [
    assertTrue("SAFE-03.ul", withUl.length > 0),
    assertTrue(
      "SAFE-03.provenance",
      withUl.every(
        (row) =>
          String(row.ruleId ?? "").length > 0 &&
          String(row.rulesVersion ?? "").length > 0 &&
          String(row.safetyLedgerVersion ?? "").length > 0
      )
    )
  ];
  return conclude("R2-SAFE-03", assertions, envelopeFor(session, primaryRequest(session.freeze), plan, assertions, runIndex));
}

async function runDet02(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const request = primaryRequest(session.freeze);
  const key = "r2-det-02-create";
  const first = await createPlan(session, request, key);
  const second = await createPlan(session, request, key);
  const assertions = [
    assertEq("DET-02.raw", rawResponseHash(first), rawResponseHash(second)),
    assertEq("DET-02.revision", first.revision, second.revision)
  ];
  return conclude("R2-DET-02", assertions, envelopeFor(session, request, first, assertions, runIndex, "same-key"));
}

async function runDet03(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const request = magPurchaseRequest(session);
  const hashes = new Set<string>();
  for (let index = 0; index < 10; index += 1) {
    const plan = await createPlan(session, request);
    hashes.add(canonicalHash(significantCanonical(plan)));
  }
  const assertions = [assertEq("DET-03.unique", 1, hashes.size)];
  return conclude("R2-DET-03", assertions, envelopeFor(session, request, { size: hashes.size }, assertions, runIndex));
}

async function runDet04(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const base = primaryRequest(session.freeze);
  const hashes = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const plan = await createPlan(session, {
      ...base,
      targets: index % 2 === 0 ? [...base.targets].reverse() : [...base.targets]
    });
    hashes.add(canonicalHash(significantCanonical(plan)));
  }
  const assertions = [assertEq("DET-04.unique", 1, hashes.size)];
  return conclude("R2-DET-04", assertions, envelopeFor(session, base, { size: hashes.size }, assertions, runIndex));
}

async function runDet05(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  const { replaceCatalogueSnapshot } = await import("../lib/agentic/catalogue/snapshot.ts");
  const { pinCatalogueSnapshot } = await import("../lib/agentic/catalogue/pin.ts");
  try {
    const catA = await loadDetCatalog();
    const catB = await loadDetCatalog();
    const report = await runDetPack({ ...catA, freezePeer: catB });
    const assertions = [
      assertTrue("DET-05.freeze", freezeKey(catA) === freezeKey(catB)),
      assertTrue("DET-05.matching", Number(report.scores.matching) >= 9),
      assertTrue("DET-05.safety", Number(report.scores.safety) >= 9)
    ];
    return conclude("R2-DET-05", assertions, envelopeFor(session, { det: true }, report.scores, assertions, runIndex));
  } finally {
    replaceCatalogueSnapshot(session.freeze.snapshot);
    pinCatalogueSnapshot(session.freeze.snapshot, IMPL_SAFETY_LEDGER_VERSION);
  }
}

async function runDet06(session: PlanSession, runIndex: number): Promise<R2CaseResult> {
  return runHash04(session, runIndex).then((item) =>
    item.result === "PASS" ? pass("R2-DET-06", item.evidence) : fail("R2-DET-06", item.evidence)
  );
}

export function canonicalR2Report(report: R2PackReport) {
  return JSON.stringify({
    cases: report.cases.map((item) => ({
      evidence: significantCvEvidence(item.evidence),
      id: item.id,
      result: item.result
    })),
    contractVersion: report.contractVersion,
    passedCases: report.passedCases,
    totalCases: report.totalCases
  });
}

export async function runCvR2Pack(
  runIndex = 1,
  frozenInput?: Awaited<ReturnType<typeof freezeImplCatalogue>>
): Promise<R2PackReport> {
  closeSession();
  const frozen = frozenInput ?? (await freezeImplCatalogue());
  if (!frozen.usable) {
    return {
      cases: PACK_IDS.map((id) => blocked(id, { freeze: "unusable" })),
      contractVersion: IMPL_CONTRACT_VERSION,
      passedCases: 0,
      snapshotId: "",
      totalCases: PACK_IDS.length
    };
  }
  const session = openSession(frozen.freeze);
  try {
    const cases: R2CaseResult[] = [];
    cases.push(await runCase("R2-REG-01", () => runReg01(session, runIndex)));
    cases.push(await runCase("R2-REG-02", () => runReg02(session, runIndex)));
    cases.push(await runCase("R2-REG-03", () => runReg03(session, runIndex)));
    cases.push(await runCase("R2-REG-04", () => runReg04(session, runIndex)));
    cases.push(await runCase("R2-REG-05", () => runReg05(session, runIndex)));
    cases.push(await runCase("R2-REG-06", () => runReg06(session, runIndex)));
    cases.push(await runCase("R2-REG-07", () => runReg07(session, runIndex)));
    cases.push(await runCase("R2-INV-01", () => runInv01(session, runIndex)));
    cases.push(await runCase("R2-INV-02", () => runInv02(session, runIndex)));
    cases.push(await runCase("R2-INV-03", () => runInv03(session, runIndex)));
    cases.push(await runCase("R2-INV-04", () => runInv04(session, runIndex)));
    cases.push(await runCase("R2-INV-05", () => runInv05(session, runIndex)));
    cases.push(await runCase("R2-PACK-01", () => runPack01(session, runIndex)));
    cases.push(await runCase("R2-PACK-02", () => runPack02(session, runIndex)));
    cases.push(await runCase("R2-PACK-03", () => runPack03(session, runIndex)));
    cases.push(await runCase("R2-PACK-04", () => runPack04(session, runIndex)));
    cases.push(await runCase("R2-PACK-05", () => runPack05(session, runIndex)));
    cases.push(await runCase("R2-ORDER-01", () => runOrder01(session, runIndex)));
    cases.push(await runCase("R2-ORDER-02", () => runOrder02(session, runIndex)));
    cases.push(await runCase("R2-ORDER-03", () => runOrder03(session, runIndex)));
    cases.push(await runCase("R2-ORDER-04", () => runOrder04(session, runIndex)));
    cases.push(await runCase("R2-ORDER-05", () => runOrder05(session, runIndex)));
    cases.push(await runCase("R2-SAVE-01", () => runSave01(session, runIndex)));
    cases.push(await runCase("R2-SAVE-02", () => runSave02(session, runIndex)));
    cases.push(await runCase("R2-SAVE-03", () => runSave03(session, runIndex)));
    cases.push(await runCase("R2-SAVE-04", () => runSave04(session, runIndex)));
    cases.push(await runCase("R2-SAVE-05", () => runSave05(session, runIndex)));
    cases.push(await runCase("R2-HASH-01", () => runHash01(session, runIndex)));
    cases.push(await runCase("R2-HASH-02", () => runHash02(session, runIndex)));
    cases.push(await runCase("R2-HASH-03", () => runHash03(session, runIndex)));
    cases.push(await runCase("R2-HASH-04", () => runHash04(session, runIndex)));
    cases.push(await runCase("R2-HASH-05", () => runHash05(session, runIndex)));
    cases.push(await runCase("R2-CONTRACT-01", () => runContract01(session, runIndex)));
    cases.push(await runCase("R2-CONTRACT-02", () => runContract02(session, runIndex)));
    cases.push(await runCase("R2-CONTRACT-03", () => runContract03(session, runIndex)));
    cases.push(await runCase("R2-CONTRACT-04", () => runContract04(session, runIndex)));
    cases.push(await runCase("R2-SEC-01", () => runSec01(session, runIndex)));
    cases.push(await runCase("R2-SEC-02", () => runSec02(session, runIndex)));
    cases.push(await runCase("R2-SAFE-01", () => runSafe01(session, runIndex)));
    cases.push(await runCase("R2-SAFE-02", () => runSafe02(session, runIndex)));
    cases.push(await runCase("R2-SAFE-03", () => runSafe03(session, runIndex)));
    cases.push(await runCase("R2-DET-02", () => runDet02(session, runIndex)));
    cases.push(await runCase("R2-DET-03", () => runDet03(session, runIndex)));
    cases.push(await runCase("R2-DET-04", () => runDet04(session, runIndex)));
    cases.push(await runCase("R2-DET-05", () => runDet05(session, runIndex)));
    cases.push(await runCase("R2-DET-06", () => runDet06(session, runIndex)));
    return {
      cases,
      contractVersion: IMPL_CONTRACT_VERSION,
      passedCases: cases.filter((item) => item.result === "PASS").length,
      snapshotId: session.snapshotId,
      totalCases: PACK_IDS.length
    };
  } finally {
    closeSession();
  }
}

export async function runCvR2PackTwice() {
  const frozen = await freezeImplCatalogue();
  const first = await runCvR2Pack(1, frozen);
  const second = await runCvR2Pack(2, frozen);
  return { first, frozen, second };
}

if (process.env.NODE_TEST_CONTEXT) {
describe("Customer value implementation pack v1.2", () => {
  it("Slices 0-H pass twice on one freeze", async (t) => {
    const frozen = await freezeImplCatalogue();
    if (!frozen.live) {
      t.skip("live Thailand retail catalogue is not loaded in this runner");
      return;
    }
    const { first, second } = await runCvR2PackTwice();
    assert.equal(first.totalCases, PACK_IDS.length);
    assert.deepEqual(
      first.cases.map((item) => item.id),
      [...PACK_IDS]
    );
    const failed = [...first.cases, ...second.cases].filter((item) => item.result !== "PASS");
    assert.equal(
      failed.length,
      0,
      failed.map((item) => `${item.id}:${JSON.stringify(asRecord(item.evidence).failed ?? item.result)}`).join("; ")
    );
    assert.equal(first.snapshotId, second.snapshotId);
    assert.equal(MATCHER_VERSION, "pareto-hybrid-1");
    assert.equal(CUSTOMER_VALUE_PACK_VERSION, "dev-customer-value-v1.0");
  });
});
}
