import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import {
  matcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";
import { canonicalHash } from "../lib/agentic/value/canonical.ts";
import { CUSTOMER_VALUE_PACK_VERSION } from "../lib/agentic/value/canonical-plan.ts";
import { packFactsFromProduct } from "../lib/agentic/value/pack-facts.ts";
import {
  asRecord,
  assertEq,
  assertTrue,
  buildEvidence,
  failedIds,
  rawResponseHash,
  stringList,
  type AssertionRecord,
  type EvidenceEnvelope
} from "./agentic/value/impl-evidence.ts";
import {
  IMPL_CONTRACT_VERSION,
  IMPL_SAFETY_LEDGER_VERSION,
  basketOf,
  closeSession,
  coverageOf,
  createPlan,
  d3OnlyRequest,
  freezeImplCatalogue,
  openSession,
  optionsOf,
  primaryRequest,
  supplementByName,
  type PlanSession
} from "./agentic/value/impl-harness.ts";
import {
  cashFromEvents,
  eventLines,
  eventReconciles,
  scheduleOf,
  significantLedger
} from "./agentic/value/r3-oracle.ts";

const ORD_IDS = ["R3-ORD-01", "R3-ORD-02", "R3-ORD-03", "R3-ORD-04", "R3-ORD-05", "R3-ORD-06"] as const;
const ECO_IDS = [
  "R3-ECO-01",
  "R3-ECO-02",
  "R3-ECO-03",
  "R3-ECO-04",
  "R3-ECO-05",
  "R3-ECO-06",
  "R3-ECO-07",
  "R3-ECO-08"
] as const;
const PACK_IDS = [...ORD_IDS, ...ECO_IDS] as const;

export type R3CaseResult = Readonly<{
  evidence: EvidenceEnvelope | Record<string, unknown>;
  id: string;
  result: "BLOCKED" | "FAIL" | "PASS";
}>;

export type R3PackReport = Readonly<{
  cases: readonly R3CaseResult[];
  contractVersion: string;
  passedCases: number;
  snapshotId: string;
  totalCases: number;
}>;

function pass(id: string, evidence: EvidenceEnvelope | Record<string, unknown>): R3CaseResult {
  return { evidence, id, result: "PASS" };
}
function fail(id: string, evidence: EvidenceEnvelope | Record<string, unknown>): R3CaseResult {
  return { evidence, id, result: "FAIL" };
}
function blocked(id: string, evidence: Record<string, unknown>): R3CaseResult {
  return { evidence, id, result: "BLOCKED" };
}

async function runCase(id: string, work: () => Promise<R3CaseResult>): Promise<R3CaseResult> {
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
): R3CaseResult {
  const failed = failedIds(assertions);
  return failed.length > 0 ? fail(id, { ...evidence, failed }) : pass(id, evidence);
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

function magCoveredRequest(session: PlanSession, daysRemaining: number, dailyAmount = 300) {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = completeMagProduct(session);
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

function magPurchaseRequest(session: PlanSession) {
  return { ...magCoveredRequest(session, 90), currentSupplements: [] };
}

function economicsOf(plan: Record<string, unknown>) {
  return asRecord(optionsOf(plan).find((item) => item.recommended)?.economics ?? plan);
}

function eventIsLedger(event: Record<string, unknown>) {
  const lines = eventLines(event);
  return (
    (event.type === "immediate" || event.type === "replenishment") &&
    typeof event.shippingRuleId === "string" &&
    String(event.shippingRuleId).length > 0 &&
    typeof event.shippingRuleVersion === "string" &&
    String(event.shippingRuleVersion).length > 0 &&
    lines.length > 0 &&
    lines.every(
      (line) =>
        String(line.productId).length > 0 &&
        Number(line.quantity) > 0 &&
        Number(line.unitPriceMinor) > 0 &&
        Number(line.lineTotalMinor) === Number(line.unitPriceMinor) * Number(line.quantity)
    ) &&
    eventReconciles(event) &&
    (event.nextReplenishmentDay == null || Number.isFinite(Number(event.nextReplenishmentDay)))
  );
}

async function runOrd01(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const request = magPurchaseRequest(session);
  const plan = await createPlan(session, request);
  const in30 = scheduleOf(plan, 30);
  const in90 = scheduleOf(plan, 90);
  const day0 = in90.find((event) => Number(event.day) === 0);
  const basket = basketOf(plan);
  const day0Ids = eventLines(day0 ?? {}).map((line) => String(line.productId)).slice().sort();
  const basketIds = basket.map((item) => String(item.productId)).slice().sort();
  const assertions = [
    assertTrue("ORD-01.ready", plan.status === "ready" || Boolean(day0)),
    assertTrue("ORD-01.day0", Boolean(day0) && eventIsLedger(day0!)),
    assertEq("ORD-01.basket", basketIds.join("|"), day0Ids.join("|")),
    assertTrue("ORD-01.h30", in30.every((event) => Number(event.day) < 30)),
    assertTrue("ORD-01.h90", in90.every((event) => Number(event.day) < 90)),
    assertTrue("ORD-01.events", in90.length > 0 && in90.every(eventIsLedger)),
    assertEq("ORD-01.cash90", cashFromEvents(in90), Number(plan.cash90DayMinor)),
    assertEq("ORD-01.cash30", cashFromEvents(in30), Number(plan.cash30DayMinor))
  ];
  return conclude("R3-ORD-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runOrd02(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const request = magCoveredRequest(session, 30);
  const plan = await createPlan(session, request);
  const in30 = scheduleOf(plan, 30);
  const in90 = scheduleOf(plan, 90);
  const assertions = [
    assertEq("ORD-02.basket", 0, basketOf(plan).length),
    assertEq("ORD-02.next", 30, Number(plan.nextReplenishmentDay)),
    assertTrue("ORD-02.noDay0", !in90.some((event) => Number(event.day) === 0)),
    assertTrue("ORD-02.h30empty", !in30.some((event) => Number(event.day) >= 30)),
    assertEq("ORD-02.cash30", 0, Number(plan.cash30DayMinor ?? 0)),
    assertTrue("ORD-02.h90", in90.some((event) => Number(event.day) > 0 && Number(event.day) < 90)),
    assertTrue("ORD-02.events", in90.every(eventIsLedger)),
    assertEq("ORD-02.cash90", cashFromEvents(in90), Number(plan.cash90DayMinor)),
    assertTrue("ORD-02.later", stringList(plan.nextActions).includes("replenish_later")),
    assertTrue("ORD-02.notNow", plan.purchaseRequiredNow === false || plan.status === "no_purchase")
  ];
  return conclude("R3-ORD-02", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runOrd03(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
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
  const hashes = new Set<string>();
  for (const row of cases) {
    const plan = await createPlan(session, magCoveredRequest(session, row.days));
    responses.push({ days: row.days, horizon: row.horizon, orders: scheduleOf(plan, row.horizon) });
    hashes.add(canonicalHash(significantLedger(plan)));
    assertions.push(assertEq(`ORD-03.next${row.days}`, row.days, Number(plan.nextReplenishmentDay)));
    const included = scheduleOf(plan, row.horizon).some((event) => Number(event.day) === row.days);
    assertions.push(
      assertTrue(
        `ORD-03.H${row.horizon}-exp${row.days}`,
        row.include ? included : !scheduleOf(plan, row.horizon).some((event) => Number(event.day) >= row.horizon)
      )
    );
  }
  assertions.push(assertTrue("ORD-03.identities", hashes.size >= 4));
  return conclude("R3-ORD-03", assertions, envelopeFor(session, { cases }, responses, assertions, runIndex));
}

async function runOrd04(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const in90 = scheduleOf(plan, 90);
  if (in90.length < 2) {
    return blocked("R3-ORD-04", { reason: "need_two_events", count: in90.length });
  }
  const assertions = [
    assertTrue("ORD-04.count", in90.length >= 2),
    assertTrue("ORD-04.rule", in90.every((event) => String(event.shippingRuleId ?? "").length > 0)),
    assertTrue("ORD-04.shippingOnce", in90.every(eventReconciles)),
    assertEq("ORD-04.cash", cashFromEvents(in90), Number(plan.cash90DayMinor)),
    assertTrue(
      "ORD-04.perEvent",
      in90.every((event) => Number(event.shippingMinor) >= 0 && Number(event.totalMinor) >= Number(event.subtotalMinor))
    )
  ];
  return conclude("R3-ORD-04", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runOrd05(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const request = primaryRequest(session.freeze);
  const first = await createPlan(session, request, "r3-ord-05-same");
  const replay = await createPlan(session, request, "r3-ord-05-same");
  const fresh = new Set<string>();
  for (let index = 0; index < 10; index += 1) {
    const plan = await createPlan(session, request);
    fresh.add(canonicalHash(significantLedger(plan)));
  }
  const permuted = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const plan = await createPlan(session, {
      ...request,
      targets: index % 2 === 0 ? [...request.targets].reverse() : [...request.targets]
    });
    permuted.add(canonicalHash(significantLedger(plan)));
  }
  const day0 = scheduleOf(first, 90).filter((event) => Number(event.day) === 0);
  const assertions = [
    assertEq("ORD-05.replay", rawResponseHash(first), rawResponseHash(replay)),
    assertEq("ORD-05.fresh", 1, fresh.size),
    assertEq("ORD-05.permute", 1, permuted.size),
    assertTrue("ORD-05.sameDay", day0.length <= 1 || day0.every(eventIsLedger)),
    assertTrue("ORD-05.ledger", scheduleOf(first, 90).every((event) => event.day == null || eventIsLedger(event) || scheduleOf(first, 90).length === 0) || scheduleOf(first, 90).every(eventIsLedger) || basketOf(first).length === 0)
  ];
  return conclude("R3-ORD-05", assertions, envelopeFor(session, request, first, assertions, runIndex, "same-key"));
}

async function runEco01(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const request = magCoveredRequest(session, 30);
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const in90 = scheduleOf(plan, 90);
  const assertions = [
    assertTrue("ECO-01.cashComplete", economics.cashComplete === true || plan.cashComplete === true),
    assertEq("ECO-01.cash30", 0, Number(plan.cash30DayMinor ?? economics.cash30DayMinor)),
    assertEq("ECO-01.cash90", cashFromEvents(in90), Number(plan.cash90DayMinor ?? economics.cash90DayMinor)),
    assertTrue(
      "ECO-01.comparison",
      economics.comparisonComplete === true ||
        (economics.equivalent === true && Number(economics.cash90DayMinor) === Number(asRecord(economics.baseline).cash90DayMinor))
    ),
    assertTrue("ECO-01.noHistory", !JSON.stringify(plan).includes("historical"))
  ];
  return conclude("R3-ECO-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runEco02(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const request = magCoveredRequest(session, 90);
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const assertions = [
    assertEq("ECO-02.events", 0, scheduleOf(plan, 90).length),
    assertEq("ECO-02.cash30", 0, Number(plan.cash30DayMinor ?? economics.cash30DayMinor)),
    assertEq("ECO-02.cash90", 0, Number(plan.cash90DayMinor ?? economics.cash90DayMinor)),
    assertTrue("ECO-02.cashComplete", economics.cashComplete === true || plan.cashComplete === true),
    assertTrue("ECO-02.claim", economics.savingClaim === "none" || economics.savings90DayMinor == null)
  ];
  return conclude("R3-ECO-02", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runEco03(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  const request = magCoveredRequest(session, 30);
  request.currentSupplements = mag
    ? [
        {
          dailyAmount: 300,
          daysRemaining: 30,
          name: mag.name,
          supplementId: mag.supplementId,
          unit: "mg" as const
        }
      ]
    : [];
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const explanation = asRecord(plan.explanation);
  const assertions = [
    assertTrue(
      "ECO-03.consumptionNull",
      economics.consumption90DayMinor == null || economics.consumptionComplete === false
    ),
    assertTrue("ECO-03.notZero", economics.consumption90DayMinor !== 0),
    assertTrue(
      "ECO-03.reason",
      JSON.stringify(economics).includes("current_inventory") ||
        JSON.stringify(economics.unavailableReasons ?? economics).includes("acquisition") ||
        economics.consumptionComplete === false
    ),
    assertTrue("ECO-03.noFree", !JSON.stringify({ plan, explanation }).toLowerCase().includes("free product"))
  ];
  return conclude("R3-ECO-03", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runEco04(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const request = magCoveredRequest(session, 30);
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const assertions = [
    assertTrue("ECO-04.cashKnown", Number(plan.cash90DayMinor ?? economics.cash90DayMinor) > 0),
    assertTrue(
      "ECO-04.shippingSeparate",
      economics.consumption90DayMinor == null ||
        Number(economics.consumption90DayMinor) !== Number(economics.cash90DayMinor)
    )
  ];
  return conclude("R3-ECO-04", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runEco05(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const economics = economicsOf(plan);
  const explanation = asRecord(plan.explanation);
  const baseline = Number(asRecord(economics.baseline).cash90DayMinor);
  const optionCash = Number(economics.cash90DayMinor);
  const expected = Number.isFinite(baseline) && Number.isFinite(optionCash) ? baseline - optionCash : null;
  const assertions = [
    assertTrue("ECO-05.equivalent", economics.equivalent === true),
    assertTrue(
      "ECO-05.amount",
      expected == null ||
        economics.savings90DayMinor == null ||
        Number(economics.savings90DayMinor) === expected
    ),
    assertTrue(
      "ECO-05.surfaces",
      explanation.savings90DayMinor == null ||
        Number(explanation.savings90DayMinor) === Number(economics.savings90DayMinor)
    )
  ];
  return conclude("R3-ECO-05", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runEco06(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = completeMagProduct(session);
  const request = magCoveredRequest(session, 20, 300);
  if (mag) {
    request.currentSupplements = [
      {
        dailyAmount: 100,
        daysRemaining: 20,
        name: mag.name,
        ...(magProduct ? { productId: magProduct.productId } : {}),
        supplementId: mag.supplementId,
        unit: "mg" as const
      }
    ];
  }
  const plan = await createPlan(session, request);
  const magRow = coverageOf(plan).find((row) => /magnesium/i.test(String(row.name)));
  const assertions = [
    assertTrue("ECO-06.exposure", Number(magRow?.currentAmount ?? 0) > 0 || Number(magRow?.totalExposureAmount ?? 0) > 0),
    assertTrue("ECO-06.notDouble", Number(magRow?.totalExposureAmount ?? 0) <= 400)
  ];
  return conclude("R3-ECO-06", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runEco07(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const { replaceCatalogueSnapshot } = await import("../lib/agentic/catalogue/snapshot.ts");
  const { pinCatalogueSnapshot } = await import("../lib/agentic/catalogue/pin.ts");
  const source = completeMagProduct(session);
  if (!source) {
    return blocked("R3-ECO-07", { reason: "no_complete_mag" });
  }
  const broken = {
    ...session.freeze.snapshot,
    products: session.freeze.snapshot.products.map((item) =>
      item.productId === source.productId ? { ...item, unitPriceMinor: 0 } : item
    )
  };
  replaceCatalogueSnapshot(broken);
  pinCatalogueSnapshot(broken, IMPL_SAFETY_LEDGER_VERSION);
  const plan = await createPlan(session, magPurchaseRequest(session));
  replaceCatalogueSnapshot(session.freeze.snapshot);
  pinCatalogueSnapshot(session.freeze.snapshot, IMPL_SAFETY_LEDGER_VERSION);
  const economics = economicsOf(plan);
  const coverage = coverageOf(plan);
  const assertions = [
    assertTrue("ECO-07.coverage", coverage.length > 0),
    assertTrue("ECO-07.notBlocked", plan.status !== "blocked"),
    assertTrue(
      "ECO-07.nullNotZero",
      !basketOf(plan).some((item) => item.productId === source.productId) ||
        economics.savings90DayMinor == null ||
        economics.cashComplete === false
    )
  ];
  return conclude("R3-ECO-07", assertions, envelopeFor(session, magPurchaseRequest(session), plan, assertions, runIndex));
}

async function runEco08(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const original = matcherSafetyCeilings();
  const d3s = original.filter((item) => /vitamin d/i.test(item.name));
  if (d3s.length < 1) {
    return blocked("R3-ECO-08", { reason: "no_d3_ceiling" });
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
      assertTrue("ECO-08.notReady", plan.status !== "ready"),
      assertTrue("ECO-08.notExecute", !stringList(plan.nextActions).includes("execute"))
    ];
    return conclude("R3-ECO-08", assertions, envelopeFor(session, d3OnlyRequest(session.freeze, "satisfied"), plan, assertions, runIndex));
  } finally {
    setMatcherSafetyCeilings(original);
  }
}

async function runOrd06(session: PlanSession, runIndex: number): Promise<R3CaseResult> {
  const plan = await createPlan(session, magPurchaseRequest(session));
  const base = significantLedger(plan);
  const baseHash = canonicalHash(base);
  const serviceHash = String(asRecord(plan.canonical).hash ?? "");
  const mutations = [
    { ...base, nextReplenishmentDay: Number(base.nextReplenishmentDay ?? 0) + 1 },
    { ...base, orders: base.orders.map((event) => ({ ...event, day: Number(event.day) + 1 })) },
    { ...base, orders: base.orders.map((event) => ({ ...event, shippingMinor: Number(event.shippingMinor ?? 0) + 1 })) },
    { ...base, orders: base.orders.map((event) => ({ ...event, totalMinor: Number(event.totalMinor ?? 0) + 1 })) },
    { ...base, orders: base.orders.map((event) => ({ ...event, type: event.type === "immediate" ? "replenishment" : "immediate" })) },
    {
      ...base,
      orders: base.orders.map((event) => ({
        ...event,
        lines: event.lines.map((line) => ({ ...line, quantity: Number(line.quantity) + 1 }))
      }))
    }
  ];
  const assertions = [
    assertTrue("ORD-06.service", serviceHash.length > 0),
    ...mutations.map((item, index) => assertTrue(`ORD-06.m${index + 1}`, baseHash !== canonicalHash(item)))
  ];
  return conclude("R3-ORD-06", assertions, envelopeFor(session, magPurchaseRequest(session), { baseHash, serviceHash }, assertions, runIndex));
}

export function canonicalR3Report(report: R3PackReport) {
  return JSON.stringify({
    cases: report.cases.map((item) => ({ evidence: item.evidence, id: item.id, result: item.result })),
    contractVersion: report.contractVersion,
    passedCases: report.passedCases,
    snapshotId: report.snapshotId,
    totalCases: report.totalCases
  });
}

export async function runCvR3Pack(
  runIndex = 1,
  frozenInput?: Awaited<ReturnType<typeof freezeImplCatalogue>>
): Promise<R3PackReport> {
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
    const cases: R3CaseResult[] = [];
    cases.push(await runCase("R3-ORD-01", () => runOrd01(session, runIndex)));
    cases.push(await runCase("R3-ORD-02", () => runOrd02(session, runIndex)));
    cases.push(await runCase("R3-ORD-03", () => runOrd03(session, runIndex)));
    cases.push(await runCase("R3-ORD-04", () => runOrd04(session, runIndex)));
    cases.push(await runCase("R3-ORD-05", () => runOrd05(session, runIndex)));
    cases.push(await runCase("R3-ORD-06", () => runOrd06(session, runIndex)));
    cases.push(await runCase("R3-ECO-01", () => runEco01(session, runIndex)));
    cases.push(await runCase("R3-ECO-02", () => runEco02(session, runIndex)));
    cases.push(await runCase("R3-ECO-03", () => runEco03(session, runIndex)));
    cases.push(await runCase("R3-ECO-04", () => runEco04(session, runIndex)));
    cases.push(await runCase("R3-ECO-05", () => runEco05(session, runIndex)));
    cases.push(await runCase("R3-ECO-06", () => runEco06(session, runIndex)));
    cases.push(await runCase("R3-ECO-07", () => runEco07(session, runIndex)));
    cases.push(await runCase("R3-ECO-08", () => runEco08(session, runIndex)));
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

export async function runCvR3PackTwice() {
  const frozen = await freezeImplCatalogue();
  const first = await runCvR3Pack(1, frozen);
  const second = await runCvR3Pack(2, frozen);
  return { first, frozen, second };
}

describe("Customer value implementation pack v1.3", () => {
  it("ORD-01 through ECO-08 pass twice on one freeze", async (t) => {
    const frozen = await freezeImplCatalogue();
    if (!frozen.live) {
      t.skip("live Thailand retail catalogue is not loaded in this runner");
      return;
    }
    const { first, second } = await runCvR3PackTwice();
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
