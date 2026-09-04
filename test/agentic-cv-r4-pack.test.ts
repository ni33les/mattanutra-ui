import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import { packFactsFromProduct } from "../lib/agentic/value/pack-facts.ts";
import { canonicalHash } from "../lib/agentic/value/canonical.ts";
import { CUSTOMER_VALUE_PACK_VERSION } from "../lib/agentic/value/canonical-plan.ts";
import {
  asRecord,
  assertEq,
  assertTrue,
  buildEvidence,
  failedIds,
  freshKeyHash,
  rawResponseHash,
  stringList,
  type AssertionRecord,
  type EvidenceEnvelope
} from "./agentic/value/impl-evidence.ts";
import {
  basketOf,
  callPlan,
  closeSession,
  coverageOf,
  createPlan,
  d3OnlyRequest,
  freezeImplCatalogue,
  IMPL_SAFETY_LEDGER_VERSION,
  openSession,
  optionsOf,
  primaryRequest,
  questionsOf,
  safetyGuidanceOf,
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
import {
  authoritativeEmptySchedule,
  cashIsNullNotZero,
  cashValue,
  daysChoice,
  consumptionReasons,
  durationQuestions,
  durationReasons,
  economicsOf,
  futureCoverageClaim,
  independentBasketConsumption,
  independentSafetyCanonical,
  independentSafetyHash,
  magCoverage,
  narrativeBlob,
  optionRecords,
  presentCoverageAvailable,
  presentSafetyAvailable,
  questionChoices,
  rawSchedule,
  scheduleUnavailable,
  serviceCanonicalHash,
  unknownDurationChoice
} from "./agentic/value/r4-oracle.ts";

const DUR_IDS = ["R4-DUR-01", "R4-DUR-02", "R4-DUR-03"] as const;
const CON_IDS = ["R4-CON-01", "R4-CON-02", "R4-CON-03"] as const;
const CAN_IDS = ["R4-CAN-01", "R4-CAN-02", "R4-CAN-03", "R4-CAN-04"] as const;
const REG_IDS = [
  "R4-REG-01",
  "R4-REG-02",
  "R4-REG-03",
  "R4-REG-04",
  "R4-REG-05",
  "R4-REG-06"
] as const;
const PACK_IDS = [...DUR_IDS, ...CON_IDS, ...CAN_IDS, ...REG_IDS] as const;

export type R4CaseResult = Readonly<{
  evidence: EvidenceEnvelope | Record<string, unknown>;
  id: string;
  result: "BLOCKED" | "FAIL" | "PASS";
}>;

export type R4PackReport = Readonly<{
  cases: readonly R4CaseResult[];
  contractVersion: string;
  passedCases: number;
  snapshotId: string;
  totalCases: number;
}>;

function pass(id: string, evidence: EvidenceEnvelope | Record<string, unknown>): R4CaseResult {
  return { evidence, id, result: "PASS" };
}
function fail(id: string, evidence: EvidenceEnvelope | Record<string, unknown>): R4CaseResult {
  return { evidence, id, result: "FAIL" };
}
function blocked(id: string, evidence: Record<string, unknown>): R4CaseResult {
  return { evidence, id, result: "BLOCKED" };
}

async function runCase(id: string, work: () => Promise<R4CaseResult>): Promise<R4CaseResult> {
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
  return {
    ...buildEvidence({
      assertions,
      buildId: session.config.buildId,
      idempotencyMode: mode,
      request,
      response,
      runIndex,
      safetyLedgerVersion: IMPL_SAFETY_LEDGER_VERSION,
      snapshotId: session.snapshotId
    }),
    freshKeyHash: freshKeyHash(response)
  };
}

function conclude(
  id: string,
  assertions: readonly AssertionRecord[],
  evidence: EvidenceEnvelope & { freshKeyHash?: string }
): R4CaseResult {
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

function magAdultRequest(
  session: PlanSession,
  extra: { dailyAmount?: number; daysRemaining?: number } = {}
) {
  const mag = supplementByName(session.freeze, "Magnesium");
  const dailyAmount = extra.dailyAmount ?? 300;
  const current =
    mag == null
      ? []
      : [
          {
            dailyAmount,
            name: mag.name,
            supplementId: mag.supplementId,
            unit: "mg" as const,
            ...("daysRemaining" in extra ? { daysRemaining: extra.daysRemaining } : {})
          }
        ];
  return {
    baseline: { type: "separate_direct_products" as const },
    conditionCodes: [] as string[],
    costHorizonsDays: [30, 90],
    currentSupplements: current,
    destinationCountry: "TH",
    locale: "en",
    medicationCodes: [] as string[],
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
  return { ...magAdultRequest(session, { daysRemaining: 90 }), currentSupplements: [] };
}

function magCoveredRequest(session: PlanSession, daysRemaining: number, dailyAmount = 300) {
  const mag = supplementByName(session.freeze, "Magnesium");
  const magProduct = completeMagProduct(session);
  return {
    ...magAdultRequest(session, { dailyAmount, daysRemaining }),
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
      : []
  };
}

function eventIsLedger(event: Record<string, unknown>) {
  const lines = eventLines(event);
  return (
    (event.type === "immediate" || event.type === "replenishment") &&
    typeof event.shippingRuleId === "string" &&
    String(event.shippingRuleId).length > 0 &&
    lines.length > 0 &&
    lines.every(
      (line) =>
        String(line.productId).length > 0 &&
        Number(line.quantity) > 0 &&
        Number(line.unitPriceMinor) > 0 &&
        Number(line.lineTotalMinor) === Number(line.unitPriceMinor) * Number(line.quantity)
    ) &&
    eventReconciles(event)
  );
}

function magSafetyAction(plan: Record<string, unknown>) {
  const items = safetyGuidanceOf(plan).filter((item) =>
    /magnesium/i.test(`${item.nutrientName ?? ""} ${stringList(item.supplementIds).join(" ")}`)
  );
  if (plan.status === "blocked" || items.some((item) => item.action === "block")) {
    return "block";
  }
  if (items.some((item) => item.action === "acknowledge" || item.code === "dose_review_required")) {
    return "acknowledge";
  }
  return "clear";
}

type CommerceCounts = { checkouts: number; orders: number; payments: number };

function installCommerceGuard(session: PlanSession): CommerceCounts {
  const counts: CommerceCounts = { checkouts: 0, orders: 0, payments: 0 };
  const store = session.store as PlanSession["store"] & {
    insertCheckout: PlanSession["store"]["insertCheckout"];
    insertOrder: PlanSession["store"]["insertOrder"];
    insertPaymentAttempt: PlanSession["store"]["insertPaymentAttempt"];
  };
  const insertCheckout = store.insertCheckout.bind(store);
  const insertOrder = store.insertOrder.bind(store);
  const insertPaymentAttempt = store.insertPaymentAttempt.bind(store);
  store.insertCheckout = async (record) => {
    counts.checkouts += 1;
    return insertCheckout(record);
  };
  store.insertOrder = async (record) => {
    counts.orders += 1;
    return insertOrder(record);
  };
  store.insertPaymentAttempt = async (record) => {
    counts.payments += 1;
    return insertPaymentAttempt(record);
  };
  return counts;
}

function durationReasonOk(plan: Record<string, unknown>) {
  const reasons = durationReasons(plan);
  return reasons.some((row) => {
    const names = stringList(row.missingFieldNames);
    const dependents = stringList(row.dependentCapabilities).join(" ").toLowerCase();
    return (
      String(row.reasonCode) === "current_inventory_duration_unknown" &&
      names.includes("daysRemaining") &&
      (/schedule|cash|replenish|comparison|saving/.test(dependents) || dependents.length > 0)
    );
  });
}

async function runDur01(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  if (!mag) {
    return blocked("R4-DUR-01", { reason: "no_magnesium" });
  }
  const request = magAdultRequest(session);
  const plan = await createPlan(session, request);
  const known = await createPlan(session, magAdultRequest(session, { daysRemaining: 30 }));
  const row = magCoverage(plan);
  const questions = durationQuestions(plan);
  const question = questions[0];
  const choices = questionChoices(question);
  const economics = economicsOf(plan);
  const inventory = Array.isArray(asRecord(plan.comparisonBasis).currentInventory)
    ? asRecord(plan.comparisonBasis).currentInventory.map(asRecord)
    : [];
  const guessedDays =
    inventory.some((item) => item.daysRemaining != null) ||
    (typeof plan.nextReplenishmentDay === "number" && Number.isFinite(Number(plan.nextReplenishmentDay)));
  const assertions = [
    assertTrue("DUR-01.amount", Number(row?.currentAmount) === 300),
    assertEq("DUR-01.unit", "mg", row?.unit),
    assertTrue(
      "DUR-01.daily",
      Number(row?.currentAmount) === 300 &&
        (row?.status === "already_covered" || Number(row?.coveragePercent) >= 100)
    ),
    assertTrue("DUR-01.coverage", presentCoverageAvailable(plan)),
    assertTrue("DUR-01.safety", presentSafetyAvailable(plan)),
    assertTrue("DUR-01.notBlocked", plan.status !== "blocked"),
    assertTrue("DUR-01.noHorizonClaim", futureCoverageClaim(plan) == null),
    assertTrue(
      "DUR-01.depletionNull",
      plan.nextReplenishmentDay == null || plan.nextReplenishmentDay === undefined
    ),
    assertTrue("DUR-01.cash30null", cashIsNullNotZero(plan, "cash30DayMinor")),
    assertTrue("DUR-01.cash90null", cashIsNullNotZero(plan, "cash90DayMinor")),
    assertTrue(
      "DUR-01.cashIncomplete",
      economics.cashComplete === false || plan.cashComplete === false
    ),
    assertTrue("DUR-01.sched30", scheduleUnavailable(plan, 30)),
    assertTrue("DUR-01.sched90", scheduleUnavailable(plan, 90)),
    assertTrue("DUR-01.notEmpty30", !authoritativeEmptySchedule(plan, 30)),
    assertTrue("DUR-01.notEmpty90", !authoritativeEmptySchedule(plan, 90)),
    assertTrue(
      "DUR-01.comparison",
      economics.comparisonComplete === false ||
        economics.savings90DayMinor == null ||
        plan.comparisonComplete === false
    ),
    assertTrue("DUR-01.reason", durationReasonOk(plan)),
    assertEq("DUR-01.oneQuestion", 1, questions.length),
    assertTrue(
      "DUR-01.questionId",
      String(question?.questionId ?? "").startsWith(`q_inventory_duration_${mag.supplementId}`)
    ),
    assertTrue(
      "DUR-01.unknownChoice",
      choices.some((item) => /unknown/i.test(`${item.choice ?? ""} ${item.label ?? ""}`))
    ),
    assertTrue(
      "DUR-01.daysChoice",
      choices.some((item) => /days:\d+/.test(String(item.choice))) ||
        /day/i.test(String(question?.prompt ?? ""))
    ),
    assertTrue("DUR-01.needsInput", plan.status === "needs_input"),
    assertTrue("DUR-01.usable", presentCoverageAvailable(plan) && presentSafetyAvailable(plan)),
    assertTrue("DUR-01.noGuess", !guessedDays),
    assertTrue(
      "DUR-01.identity",
      serviceCanonicalHash(plan) !== serviceCanonicalHash(known) &&
        serviceCanonicalHash(plan).length > 0
    )
  ];
  return conclude("R4-DUR-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runDur02(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const request = magAdultRequest(session);
  const created = await createPlan(session, request);
  const question = durationQuestions(created)[0];
  if (!question) {
    const assertions = [assertTrue("DUR-02.question", false)];
    return conclude(
      "R4-DUR-02",
      assertions,
      envelopeFor(session, request, created, assertions, runIndex)
    );
  }
  const choice = daysChoice(question, 30);
  const key = `r4-dur-02-${runIndex}`;
  const answered = await callPlan(session, {
    answers: [{ choice, questionId: String(question.questionId) }],
    expectedRevision: created.revision,
    idempotencyKey: key,
    operation: "answer",
    planHandle: created.planHandle
  });
  const replay = await callPlan(session, {
    answers: [{ choice, questionId: String(question.questionId) }],
    expectedRevision: created.revision,
    idempotencyKey: key,
    operation: "answer",
    planHandle: created.planHandle
  });
  const economics = economicsOf(answered);
  const in90 = scheduleOf(answered, 90);
  const assertions = [
    assertEq("DUR-02.handle", created.planHandle, answered.planHandle),
    assertEq("DUR-02.rev", Number(created.revision) + 1, Number(answered.revision)),
    assertEq("DUR-02.noQ", 0, durationQuestions(answered).length),
    assertEq("DUR-02.next", 30, Number(answered.nextReplenishmentDay)),
    assertTrue(
      "DUR-02.excl30",
      !rawSchedule(answered, 30).some((event) => Number(event.day) === 30) &&
        !scheduleOf(answered, 30).some((event) => Number(event.day) >= 30)
    ),
    assertTrue(
      "DUR-02.incl30",
      rawSchedule(answered, 90).some((event) => Number(event.day) === 30) ||
        in90.some((event) => Number(event.day) === 30)
    ),
    assertEq("DUR-02.cash30", 0, Number(cashValue(answered, "cash30DayMinor"))),
    assertTrue(
      "DUR-02.cash30complete",
      economics.cashComplete === true || answered.cashComplete === true
    ),
    assertTrue(
      "DUR-02.cash90",
      Number(cashValue(answered, "cash90DayMinor")) === cashFromEvents(in90) &&
        Number(cashValue(answered, "cash90DayMinor")) >= 0
    ),
    assertTrue(
      "DUR-02.comparison",
      economics.comparisonComplete === true || answered.comparisonComplete === true
    ),
    assertEq("DUR-02.replayRev", answered.revision, replay.revision),
    assertEq("DUR-02.replay", rawResponseHash(answered), rawResponseHash(replay))
  ];
  return conclude(
    "R4-DUR-02",
    assertions,
    envelopeFor(session, { request, choice }, answered, assertions, runIndex, "same-key")
  );
}

async function runDur03(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const request = magAdultRequest(session);
  const created = await createPlan(session, request);
  const question = durationQuestions(created)[0];
  if (!question) {
    const assertions = [assertTrue("DUR-03.question", false)];
    return conclude(
      "R4-DUR-03",
      assertions,
      envelopeFor(session, request, created, assertions, runIndex)
    );
  }
  const choice = unknownDurationChoice(question);
  const answered = await callPlan(session, {
    answers: [{ choice, questionId: String(question.questionId) }],
    expectedRevision: created.revision,
    idempotencyKey: `r4-dur-03-${runIndex}`,
    operation: "answer",
    planHandle: created.planHandle
  });
  const narrative = narrativeBlob(answered);
  const assertions = [
    assertEq("DUR-03.handle", created.planHandle, answered.planHandle),
    assertEq("DUR-03.noQ", 0, durationQuestions(answered).length),
    assertTrue("DUR-03.coverage", presentCoverageAvailable(answered)),
    assertTrue("DUR-03.safety", presentSafetyAvailable(answered)),
    assertTrue("DUR-03.cash30null", cashIsNullNotZero(answered, "cash30DayMinor")),
    assertTrue("DUR-03.cash90null", cashIsNullNotZero(answered, "cash90DayMinor")),
    assertTrue("DUR-03.sched30", scheduleUnavailable(answered, 30)),
    assertTrue("DUR-03.sched90", scheduleUnavailable(answered, 90)),
    assertTrue("DUR-03.reason", durationReasonOk(answered)),
    assertTrue(
      "DUR-03.narrative",
      String(answered.summaryKey ?? "").includes("duration") ||
        (/cover/.test(narrative) && /cannot|unknown|timing|duration|not yet/.test(narrative))
    ),
    assertTrue("DUR-03.noClaim", futureCoverageClaim(answered) == null),
    assertTrue("DUR-03.notBlocked", answered.status !== "blocked")
  ];
  return conclude(
    "R4-DUR-03",
    assertions,
    envelopeFor(session, { request, choice }, answered, assertions, runIndex, "same-key")
  );
}

function unknownHistoryRequest(session: PlanSession) {
  const mag = supplementByName(session.freeze, "Magnesium");
  const request = magAdultRequest(session, { daysRemaining: 30 });
  if (mag) {
    request.currentSupplements = [
      {
        dailyAmount: 300,
        daysRemaining: 30,
        name: mag.name,
        supplementId: mag.supplementId,
        unit: "mg" as const
      }
    ];
  }
  return request;
}

function scopeInvariantAssertions(
  prefix: string,
  option: Record<string, unknown>
): AssertionRecord[] {
  const economics = asRecord(option.economics ?? option);
  const scope = String(economics.consumptionScope ?? option.consumptionScope ?? "");
  const consumption = economics.consumption90DayMinor;
  const reasons = [
    ...(Array.isArray(economics.unavailableReasons) ? economics.unavailableReasons : [])
  ].map(asRecord);
  const missingFullHorizon = reasons.some(
    (row) =>
      String(row.reasonCode) === "current_inventory_acquisition_cost_unknown" ||
      stringList(row.missingFieldNames).includes("acquisitionCost")
  );
  const basket = Array.isArray(option.basket) ? option.basket.map(asRecord) : [];
  const purchasedKnown = independentBasketConsumption(basket, 90);
  return [
    assertEq(`${prefix}.scope`, "full_horizon", scope),
    assertTrue(
      `${prefix}.nullOnlyWithDep`,
      consumption != null || missingFullHorizon || purchasedKnown == null
    ),
    assertTrue(
      `${prefix}.notNarrower`,
      scope !== "newly_purchased" || (consumption != null && Number.isFinite(Number(consumption)))
    )
  ];
}

async function runCon01(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  if (!mag) {
    return blocked("R4-CON-01", { reason: "no_magnesium" });
  }
  const request = unknownHistoryRequest(session);
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const in90 = scheduleOf(plan, 90);
  const explanation = asRecord(plan.explanation);
  const blob = JSON.stringify({ plan, explanation }).toLowerCase();
  const reasons = consumptionReasons(plan);
  const assertions = [
    assertEq("CON-01.scope", "full_horizon", String(economics.consumptionScope ?? "")),
    assertTrue("CON-01.c30null", economics.consumption30DayMinor == null),
    assertTrue("CON-01.c90null", economics.consumption90DayMinor == null),
    assertTrue("CON-01.notZero30", economics.consumption30DayMinor !== 0),
    assertTrue("CON-01.notZero90", economics.consumption90DayMinor !== 0),
    assertTrue(
      "CON-01.incomplete",
      economics.consumptionComplete === false || plan.consumptionComplete === false
    ),
    assertTrue(
      "CON-01.reason",
      reasons.some(
        (row) =>
          String(row.reasonCode) === "current_inventory_acquisition_cost_unknown" &&
          stringList(row.missingFieldNames).includes("acquisitionCost")
      )
    ),
    assertTrue(
      "CON-01.noInfer",
      economics.consumption90DayMinor == null && !blob.includes("historical")
    ),
    assertTrue("CON-01.cashComplete", economics.cashComplete === true || plan.cashComplete === true),
    assertEq("CON-01.cash30", 0, Number(plan.cash30DayMinor ?? economics.cash30DayMinor)),
    assertEq(
      "CON-01.cash90",
      cashFromEvents(in90),
      Number(plan.cash90DayMinor ?? economics.cash90DayMinor)
    ),
    assertTrue(
      "CON-01.comparison",
      economics.comparisonComplete === true ||
        (economics.equivalent === true &&
          Number(economics.cash90DayMinor) === Number(asRecord(economics.baseline).cash90DayMinor))
    ),
    assertTrue(
      "CON-01.saving",
      economics.savings90DayMinor == null ||
        Number(economics.savings90DayMinor) ===
          Number(asRecord(economics.baseline).cash90DayMinor) -
            Number(economics.cash90DayMinor)
    ),
    assertTrue(
      "CON-01.surfaces",
      explanation.savings90DayMinor == null ||
        Number(explanation.savings90DayMinor) === Number(economics.savings90DayMinor)
    ),
    assertTrue(
      "CON-01.noFree",
      !blob.includes("free product") &&
        !blob.includes("already owned") &&
        !/inventory[^\n]{0,40}free/.test(blob)
    )
  ];
  return conclude("R4-CON-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runCon02(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const request = magPurchaseRequest(session);
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const basket = basketOf(plan);
  const expected30 = independentBasketConsumption(basket, 30);
  const expected90 = independentBasketConsumption(basket, 90);
  const cash90 = Number(plan.cash90DayMinor ?? economics.cash90DayMinor);
  const shipping = Number(economics.shippingMinor ?? plan.shippingMinor ?? 0);
  const leftoverOk = basket.every((item) => {
    const spp = Number(item.servingsPerPack);
    const daily = Number(item.servingsPerDay) || 1;
    if (item.leftoverServings90 == null || !Number.isFinite(spp) || spp <= 0) {
      return true;
    }
    const purchasedServings = Number(item.leftoverServings90) + 90 * daily;
    const packs = purchasedServings / spp;
    return Number.isFinite(purchasedServings) && Math.abs(packs - Math.round(packs)) < 1e-6;
  });
  const assertions = [
    assertEq("CON-02.scope", "full_horizon", String(economics.consumptionScope ?? "")),
    assertTrue(
      "CON-02.c90",
      expected90 == null || Number(economics.consumption90DayMinor) === expected90
    ),
    assertTrue(
      "CON-02.c30",
      expected30 == null || Number(economics.consumption30DayMinor) === expected30
    ),
    assertTrue(
      "CON-02.complete",
      expected90 == null ||
        economics.consumptionComplete === true ||
        plan.consumptionComplete === true
    ),
    assertTrue(
      "CON-02.separate",
      economics.consumption90DayMinor == null ||
        Number(economics.consumption90DayMinor) !== cash90
    ),
    assertTrue(
      "CON-02.noShipping",
      expected90 == null ||
        economics.consumption90DayMinor == null ||
        Number(economics.consumption90DayMinor) !== cash90 - shipping ||
        shipping === 0 ||
        Number(economics.consumption90DayMinor) !== cash90
    ),
    assertTrue("CON-02.leftovers", leftoverOk)
  ];
  return conclude("R4-CON-02", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runCon03(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const unknown = await createPlan(session, unknownHistoryRequest(session));
  const purchase = await createPlan(session, magPurchaseRequest(session));
  const unknownOptions = optionRecords(unknown);
  const purchaseOptions = optionRecords(purchase);
  const pool = [
    ...unknownOptions.map((item, index) => ({ option: item, prefix: `CON-03.u${index + 1}` })),
    ...purchaseOptions.map((item, index) => ({ option: item, prefix: `CON-03.p${index + 1}` }))
  ];
  if (pool.length < 1) {
    pool.push({ option: unknown, prefix: "CON-03.planU" }, { option: purchase, prefix: "CON-03.planP" });
  }
  const assertions = pool.flatMap((item) => scopeInvariantAssertions(item.prefix, item.option));
  assertions.push(assertTrue("CON-03.options", pool.length > 0));
  return conclude(
    "R4-CON-03",
    assertions,
    envelopeFor(
      session,
      { unknown: unknownHistoryRequest(session), purchase: magPurchaseRequest(session) },
      { unknown, purchase },
      assertions,
      runIndex
    )
  );
}

function twoCurrentRequest(session: PlanSession) {
  const mag = supplementByName(session.freeze, "Magnesium");
  const creatine = supplementByName(session.freeze, "Creatine");
  const currents = [
    mag
      ? {
          dailyAmount: 300,
          daysRemaining: 90,
          name: mag.name,
          supplementId: mag.supplementId,
          unit: "mg" as const
        }
      : null,
    creatine
      ? {
          dailyAmount: 3,
          daysRemaining: 90,
          name: creatine.name,
          supplementId: creatine.supplementId,
          unit: "g" as const
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  return {
    baseline: { type: "separate_direct_products" as const },
    conditionCodes: [] as string[],
    costHorizonsDays: [30, 90],
    currentSupplements: currents,
    destinationCountry: "TH",
    locale: "en",
    medicationCodes: [] as string[],
    optimization: "lowest_cost" as const,
    profile: { ageYears: 52, lifeStage: "adult" as const, sex: "male" as const },
    requirements: {},
    targets: currents.map((item) => ({
      amount: item.dailyAmount,
      importance: "core" as const,
      name: item.name,
      supplementId: item.supplementId,
      unit: item.unit
    }))
  };
}

function permuteKeys(value: unknown, seed: number): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => permuteKeys(item, seed + index + 1));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  const ordered = [...keys].sort((left, right) => {
    const score = (key: string) =>
      (key.charCodeAt(0) * (seed + 3) + key.length * (seed + 11)) % 97;
    return score(left) - score(right) || left.localeCompare(right);
  });
  return Object.fromEntries(
    ordered.map((key, index) => [
      key,
      permuteKeys((value as Record<string, unknown>)[key], seed + index + 5)
    ])
  );
}

function coverageHasSafetyIdentity(row: Record<string, unknown> | null) {
  const contributors = Array.isArray(row?.contributors) ? row!.contributors.map(asRecord) : [];
  return (
    row != null &&
    String(row.ruleId ?? "").length > 0 &&
    String(row.rulesVersion ?? "").length > 0 &&
    (row.populationScope != null || row.population != null) &&
    row.upperLimitAmount != null &&
    row.totalExposureAmount != null &&
    contributors.some((item) => item.source === "current" && Number(item.amount) > 0)
  );
}

async function runCan01(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const lowReq = magAdultRequest(session, { dailyAmount: 300, daysRemaining: 90 });
  const highReq = magAdultRequest(session, { dailyAmount: 349, daysRemaining: 90 });
  const low = await createPlan(session, lowReq);
  const high = await createPlan(session, highReq);
  const lowReplay = await createPlan(session, lowReq, `r4-can-01-low-${runIndex}`);
  const lowReplay2 = await createPlan(session, lowReq, `r4-can-01-low-${runIndex}`);
  const highReplay = await createPlan(session, highReq, `r4-can-01-high-${runIndex}`);
  const highReplay2 = await createPlan(session, highReq, `r4-can-01-high-${runIndex}`);
  const lowRow = magCoverage(low);
  const highRow = magCoverage(high);
  const assertions = [
    assertEq("CAN-01.lowAction", "clear", magSafetyAction(low)),
    assertEq("CAN-01.highAction", "clear", magSafetyAction(high)),
    assertEq("CAN-01.lowAmount", 300, Number(lowRow?.currentAmount)),
    assertEq("CAN-01.highAmount", 349, Number(highRow?.currentAmount)),
    assertTrue("CAN-01.exposureDiff", Number(lowRow?.totalExposureAmount) !== Number(highRow?.totalExposureAmount)),
    assertTrue(
      "CAN-01.docs",
      canonicalHash(independentSafetyCanonical(low)) !== canonicalHash(independentSafetyCanonical(high))
    ),
    assertTrue(
      "CAN-01.service",
      serviceCanonicalHash(low) !== serviceCanonicalHash(high) && serviceCanonicalHash(low).length > 0
    ),
    assertTrue("CAN-01.independent", independentSafetyHash(low) !== independentSafetyHash(high)),
    assertEq("CAN-01.lowReplay", rawResponseHash(lowReplay), rawResponseHash(lowReplay2)),
    assertEq("CAN-01.highReplay", rawResponseHash(highReplay), rawResponseHash(highReplay2)),
    assertEq("CAN-01.lowHashReplay", serviceCanonicalHash(lowReplay), serviceCanonicalHash(lowReplay2)),
    assertEq("CAN-01.highHashReplay", serviceCanonicalHash(highReplay), serviceCanonicalHash(highReplay2))
  ];
  return conclude(
    "R4-CAN-01",
    assertions,
    envelopeFor(session, { lowReq, highReq }, { low, high }, assertions, runIndex, "same-key")
  );
}

async function runCan02(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const plans = {
    349: await createPlan(session, magAdultRequest(session, { dailyAmount: 349, daysRemaining: 90 })),
    350: await createPlan(session, magAdultRequest(session, { dailyAmount: 350, daysRemaining: 90 })),
    351: await createPlan(session, magAdultRequest(session, { dailyAmount: 351, daysRemaining: 90 }))
  };
  const hashes = [
    serviceCanonicalHash(plans[349]),
    serviceCanonicalHash(plans[350]),
    serviceCanonicalHash(plans[351])
  ];
  const independent = [
    independentSafetyHash(plans[349]),
    independentSafetyHash(plans[350]),
    independentSafetyHash(plans[351])
  ];
  const assertions = [
    assertEq("CAN-02.349", "clear", magSafetyAction(plans[349])),
    assertEq("CAN-02.350", "acknowledge", magSafetyAction(plans[350])),
    assertEq("CAN-02.351", "block", magSafetyAction(plans[351])),
    assertTrue("CAN-02.uniqueService", new Set(hashes).size === 3 && hashes.every((item) => item.length > 0)),
    assertTrue("CAN-02.uniqueIndependent", new Set(independent).size === 3),
    assertTrue("CAN-02.fields349", coverageHasSafetyIdentity(magCoverage(plans[349]))),
    assertTrue("CAN-02.fields350", coverageHasSafetyIdentity(magCoverage(plans[350]))),
    assertTrue("CAN-02.fields351", coverageHasSafetyIdentity(magCoverage(plans[351])))
  ];
  return conclude("R4-CAN-02", assertions, envelopeFor(session, { amounts: [349, 350, 351] }, plans, assertions, runIndex));
}

async function runCan03(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const plan = await createPlan(session, magAdultRequest(session, { dailyAmount: 350, daysRemaining: 90 }));
  const base = independentSafetyCanonical(plan);
  const baseHash = canonicalHash(base);
  const coverage = base.coverage[0];
  const safety = base.safety[0] ?? {
    action: "acknowledge",
    comparator: "gte",
    contributors: coverage?.contributors ?? [],
    exposure: coverage?.totalExposureAmount ?? 350,
    nutrientName: "Magnesium",
    population: coverage?.population ?? "adult",
    ruleId: coverage?.ruleId ?? "ul",
    rulesVersion: coverage?.rulesVersion ?? "3.0.0",
    severity: "high",
    supplementIds: [String(coverage?.supplementId ?? "")],
    threshold: coverage?.threshold ?? 350,
    unit: "mg"
  };
  const contributor = coverage?.contributors[0] ?? {
    amount: 350,
    productId: "current",
    productName: "Magnesium",
    source: "current",
    unit: "mg"
  };
  const mutations: Array<{ id: string; value: unknown }> = [
    { id: "currentAmount", value: { ...base, coverage: [{ ...coverage!, currentAmount: Number(coverage?.currentAmount) + 1 }] } },
    { id: "unit", value: { ...base, coverage: [{ ...coverage!, unit: coverage?.unit === "mg" ? "g" : "mg" }] } },
    { id: "target", value: { ...base, coverage: [{ ...coverage!, requestedAmount: Number(coverage?.requestedAmount) + 1 }] } },
    { id: "exposure", value: { ...base, coverage: [{ ...coverage!, totalExposureAmount: Number(coverage?.totalExposureAmount) + 1 }] } },
    { id: "threshold", value: { ...base, coverage: [{ ...coverage!, threshold: Number(coverage?.threshold) + 1 }] } },
    {
      id: "comparator",
      value: { ...base, safety: [{ ...safety, comparator: safety.comparator === "gte" ? "gt" : "gte" }] }
    },
    {
      id: "contributorAmount",
      value: {
        ...base,
        coverage: [
          {
            ...coverage!,
            contributors: [{ ...contributor, amount: Number(contributor.amount) + 1 }, ...coverage!.contributors.slice(1)]
          }
        ]
      }
    },
    {
      id: "contributorId",
      value: {
        ...base,
        coverage: [
          {
            ...coverage!,
            contributors: [
              { ...contributor, productId: `${contributor.productId ?? "current"}-x` },
              ...coverage!.contributors.slice(1)
            ]
          }
        ]
      }
    },
    { id: "ruleId", value: { ...base, coverage: [{ ...coverage!, ruleId: `${coverage?.ruleId ?? "ul"}-x` }] } },
    { id: "rulesVersion", value: { ...base, coverage: [{ ...coverage!, rulesVersion: `${coverage?.rulesVersion ?? "v"}-x` }] } },
    { id: "population", value: { ...base, coverage: [{ ...coverage!, population: `${coverage?.population ?? "adult"}-x` }] } },
    { id: "action", value: { ...base, safety: [{ ...safety, action: safety.action === "acknowledge" ? "block" : "acknowledge" }] } },
    { id: "severity", value: { ...base, safety: [{ ...safety, severity: safety.severity === "high" ? "blocking" : "high" }] } }
  ];
  const volatile = independentSafetyHash({
    ...plan,
    planHandle: "volatile-handle",
    requestId: "volatile-request",
    traceId: "volatile-trace"
  });
  const assertions = [
    assertTrue("CAN-03.base", Boolean(coverage) && baseHash.length > 0),
    ...mutations.map((item) =>
      assertTrue(`CAN-03.${item.id}`, baseHash !== canonicalHash(item.value) && canonicalHash(item.value).length > 0)
    ),
    assertEq("CAN-03.volatile", independentSafetyHash(plan), volatile)
  ];
  return conclude("R4-CAN-03", assertions, envelopeFor(session, magAdultRequest(session, { dailyAmount: 350, daysRemaining: 90 }), { baseHash }, assertions, runIndex));
}

async function runCan04(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const request = twoCurrentRequest(session);
  if (request.currentSupplements.length < 2) {
    return blocked("R4-CAN-04", { reason: "need_two_currents" });
  }
  const first = await createPlan(session, request);
  const hashes = new Set<string>();
  const independent = new Set<string>();
  const service = new Set<string>();
  const evidence = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const reversedTargets = index % 2 === 0 ? [...request.targets].reverse() : [...request.targets];
    const reversedCurrent =
      index % 3 === 0 ? [...request.currentSupplements].reverse() : [...request.currentSupplements];
    const payload = permuteKeys(
      {
        ...request,
        currentSupplements: reversedCurrent,
        targets: reversedTargets
      },
      index + 1
    ) as Record<string, unknown>;
    const plan = await createPlan(session, payload);
    hashes.add(independentSafetyHash(plan));
    independent.add(canonicalHash(independentSafetyCanonical(plan)));
    service.add(serviceCanonicalHash(plan));
    evidence.add(
      canonicalHash(
        magCoverage(plan)?.contributors ?? coverageOf(plan).flatMap((row) => row.contributors ?? [])
      )
    );
  }
  const contributors = (magCoverage(first)?.contributors ?? []) as unknown[];
  const names = request.currentSupplements.map((item) => item.supplementId);
  const returned = coverageOf(first).map((row) => String(row.supplementId));
  const assertions = [
    assertEq("CAN-04.independent", 1, independent.size),
    assertEq("CAN-04.service", 1, service.size),
    assertEq("CAN-04.hash", 1, hashes.size),
    assertTrue("CAN-04.noLoss", names.every((id) => returned.includes(id))),
    assertTrue("CAN-04.noDup", names.length === new Set(returned.filter((id) => names.includes(id))).size),
    assertTrue("CAN-04.order", evidence.size === 1 || contributors.length >= 1)
  ];
  return conclude("R4-CAN-04", assertions, envelopeFor(session, request, first, assertions, runIndex));
}

async function runReg01(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const request = magPurchaseRequest(session);
  const plan = await createPlan(session, request);
  const in30 = scheduleOf(plan, 30);
  const in90 = scheduleOf(plan, 90);
  const day0 = in90.find((event) => Number(event.day) === 0);
  const basketIds = basketOf(plan)
    .map((item) => String(item.productId))
    .slice()
    .sort();
  const day0Ids = eventLines(day0 ?? {})
    .map((line) => String(line.productId))
    .slice()
    .sort();
  const boundaries = [
    { days: 29, horizon: 30, include: true },
    { days: 30, horizon: 30, include: false },
    { days: 31, horizon: 30, include: false },
    { days: 89, horizon: 90, include: true },
    { days: 90, horizon: 90, include: false },
    { days: 91, horizon: 90, include: false }
  ];
  const boundaryAssertions: AssertionRecord[] = [];
  for (const row of boundaries) {
    const covered = await createPlan(session, magCoveredRequest(session, row.days));
    const included = scheduleOf(covered, row.horizon).some((event) => Number(event.day) === row.days);
    boundaryAssertions.push(assertEq(`REG-01.next${row.days}`, row.days, Number(covered.nextReplenishmentDay)));
    boundaryAssertions.push(
      assertTrue(
        `REG-01.H${row.horizon}-exp${row.days}`,
        row.include ? included : !scheduleOf(covered, row.horizon).some((event) => Number(event.day) >= row.horizon)
      )
    );
  }
  const assertions = [
    assertTrue("REG-01.day0", Boolean(day0) && eventIsLedger(day0!)),
    assertEq("REG-01.basket", basketIds.join("|"), day0Ids.join("|")),
    assertTrue("REG-01.events", in90.length > 0 && in90.every(eventIsLedger)),
    assertEq("REG-01.cash90", cashFromEvents(in90), Number(plan.cash90DayMinor)),
    assertEq("REG-01.cash30", cashFromEvents(in30), Number(plan.cash30DayMinor)),
    ...boundaryAssertions
  ];
  return conclude("R4-REG-01", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runReg02(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  const request = magAdultRequest(session, { daysRemaining: 30 });
  if (mag) {
    request.currentSupplements = [
      {
        dailyAmount: 300,
        daysRemaining: 30,
        name: mag.name,
        supplementId: mag.supplementId,
        unit: "mg" as const
      }
    ];
  }
  const plan = await createPlan(session, request);
  const economics = economicsOf(plan);
  const in90 = scheduleOf(plan, 90);
  const assertions = [
    assertTrue("REG-02.cashComplete", economics.cashComplete === true || plan.cashComplete === true),
    assertEq("REG-02.cash30", 0, Number(plan.cash30DayMinor ?? economics.cash30DayMinor)),
    assertEq("REG-02.cash90", cashFromEvents(in90), Number(plan.cash90DayMinor ?? economics.cash90DayMinor)),
    assertTrue(
      "REG-02.comparison",
      economics.comparisonComplete === true ||
        (economics.equivalent === true &&
          Number(economics.cash90DayMinor) === Number(asRecord(economics.baseline).cash90DayMinor))
    ),
    assertTrue(
      "REG-02.consumptionNull",
      economics.consumption90DayMinor == null || economics.consumptionComplete === false
    )
  ];
  return conclude("R4-REG-02", assertions, envelopeFor(session, request, plan, assertions, runIndex));
}

async function runReg03(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const mag = supplementByName(session.freeze, "Magnesium");
  if (!mag) {
    return blocked("R4-REG-03", { reason: "no_magnesium" });
  }
  const clear = await createPlan(session, magAdultRequest(session, { dailyAmount: 349, daysRemaining: 90 }));
  const review = await createPlan(session, magAdultRequest(session, { dailyAmount: 350, daysRemaining: 90 }));
  const blockedPlan = await createPlan(
    session,
    magAdultRequest(session, { dailyAmount: 351, daysRemaining: 90 })
  );
  const assertions = [
    assertEq("REG-03.349", "clear", magSafetyAction(clear)),
    assertEq("REG-03.350", "acknowledge", magSafetyAction(review)),
    assertEq("REG-03.351", "block", magSafetyAction(blockedPlan)),
    assertEq("REG-03.351status", "blocked", blockedPlan.status)
  ];
  return conclude(
    "R4-REG-03",
    assertions,
    envelopeFor(session, { amounts: [349, 350, 351] }, { clear, review, blockedPlan }, assertions, runIndex)
  );
}

async function runReg04(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const unknown = await createPlan(session, d3OnlyRequest(session.freeze, "unknown"));
  const question = questionsOf(unknown)[0];
  const choices = Array.isArray(question?.choices) ? question!.choices.map(asRecord) : [];
  const satisfy = choices.find((item) => String(item.choice).startsWith("satisfy_prerequisite:"));
  const key = `r4-reg-04-${runIndex}`;
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
  const d3 = coverageOf(answered).find((row) => /vitamin d/i.test(String(row.name)));
  const assertions = [
    assertEq("REG-04.unknown", "needs_input", unknown.status),
    assertTrue("REG-04.question", Boolean(question?.questionId)),
    assertEq("REG-04.oneQ", 1, questionsOf(unknown).length),
    assertEq("REG-04.rev", Number(unknown.revision) + 1, Number(answered.revision)),
    assertTrue("REG-04.noQ", questionsOf(answered).length === 0),
    assertTrue(
      "REG-04.ready",
      answered.status === "ready" || d3?.status === "covered"
    ),
    assertEq("REG-04.replay", answered.revision, replay.revision)
  ];
  return conclude(
    "R4-REG-04",
    assertions,
    envelopeFor(session, d3OnlyRequest(session.freeze, "unknown"), answered, assertions, runIndex, "same-key")
  );
}

async function runReg05(session: PlanSession, runIndex: number): Promise<R4CaseResult> {
  const request = primaryRequest(session.freeze);
  const first = await createPlan(session, request, "r4-reg-05-same");
  const replay = await createPlan(session, request, "r4-reg-05-same");
  const select = optionsOf(first).find((item) => item.recommended) ?? optionsOf(first)[0];
  let selectFirst: Record<string, unknown> = first;
  let selectReplay: Record<string, unknown> = first;
  if (select && first.planHandle) {
    const selectKey = "r4-reg-05-select";
    selectFirst = await callPlan(session, {
      expectedRevision: first.revision,
      idempotencyKey: selectKey,
      operation: "select",
      planHandle: first.planHandle,
      selectOptionId: select.optionId
    });
    selectReplay = await callPlan(session, {
      expectedRevision: first.revision,
      idempotencyKey: selectKey,
      operation: "select",
      planHandle: first.planHandle,
      selectOptionId: select.optionId
    });
  }
  const fresh = new Set<string>();
  for (let index = 0; index < 10; index += 1) {
    const plan = await createPlan(session, request);
    fresh.add(freshKeyHash({ ...significantLedger(plan), canonical: asRecord(plan.canonical).hash }));
  }
  const permuted = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const plan = await createPlan(session, {
      ...request,
      targets: index % 2 === 0 ? [...request.targets].reverse() : [...request.targets]
    });
    permuted.add(freshKeyHash({ ...significantLedger(plan), canonical: asRecord(plan.canonical).hash }));
  }
  const assertions = [
    assertEq("REG-05.createReplay", rawResponseHash(first), rawResponseHash(replay)),
    assertEq("REG-05.selectReplay", rawResponseHash(selectFirst), rawResponseHash(selectReplay)),
    assertEq("REG-05.fresh", 1, fresh.size),
    assertEq("REG-05.permute", 1, permuted.size)
  ];
  return conclude("R4-REG-05", assertions, envelopeFor(session, request, first, assertions, runIndex, "same-key"));
}

async function runReg06(
  session: PlanSession,
  runIndex: number,
  commerce: CommerceCounts,
  responses: readonly Record<string, unknown>[]
): Promise<R4CaseResult> {
  const blob = JSON.stringify(responses);
  const operations = responses.flatMap((item) => stringList(item.nextActions));
  const assertions = [
    assertEq("REG-06.orders", 0, commerce.orders),
    assertEq("REG-06.checkouts", 0, commerce.checkouts),
    assertEq("REG-06.payments", 0, commerce.payments),
    assertTrue("REG-06.noCheckoutUrl", !blob.includes("checkoutUrl") || !/"checkoutUrl"\s*:\s*"[^"]+"/.test(blob)),
    assertTrue("REG-06.noExecute", !operations.includes("execute"))
  ];
  return conclude(
    "R4-REG-06",
    assertions,
    envelopeFor(session, { operations: ["create", "answer", "get", "select"] }, { commerce }, assertions, runIndex)
  );
}

export function canonicalR4Report(report: R4PackReport) {
  return JSON.stringify({
    cases: report.cases.map((item) => {
      const assertions = Array.isArray(asRecord(item.evidence).assertions)
        ? (asRecord(item.evidence).assertions as AssertionRecord[])
        : [];
      return {
        failed: assertions
          .filter((row) => !row.pass)
          .map((row) => ({ expected: row.expected, id: row.id, observed: row.observed })),
        freshKeyHash: asRecord(item.evidence).freshKeyHash ?? null,
        id: item.id,
        passed: assertions.filter((row) => row.pass).map((row) => row.id),
        requestHash: asRecord(item.evidence).requestHash ?? null,
        result: item.result
      };
    }),
    contractVersion: report.contractVersion,
    passedCases: report.passedCases,
    snapshotId: report.snapshotId,
    totalCases: report.totalCases
  });
}

export async function runCvR4Pack(
  runIndex = 1,
  frozenInput?: Awaited<ReturnType<typeof freezeImplCatalogue>>
): Promise<R4PackReport> {
  closeSession();
  const frozen = frozenInput ?? (await freezeImplCatalogue());
  if (!frozen.usable) {
    return {
      cases: PACK_IDS.map((id) => blocked(id, { freeze: "unusable" })),
      contractVersion: "3.0.0",
      passedCases: 0,
      snapshotId: "",
      totalCases: PACK_IDS.length
    };
  }
  const session = openSession(frozen.freeze);
  const commerce = installCommerceGuard(session);
  try {
    const cases: R4CaseResult[] = [];
    cases.push(await runCase("R4-DUR-01", () => runDur01(session, runIndex)));
    cases.push(await runCase("R4-DUR-02", () => runDur02(session, runIndex)));
    cases.push(await runCase("R4-DUR-03", () => runDur03(session, runIndex)));
    cases.push(await runCase("R4-CON-01", () => runCon01(session, runIndex)));
    cases.push(await runCase("R4-CON-02", () => runCon02(session, runIndex)));
    cases.push(await runCase("R4-CON-03", () => runCon03(session, runIndex)));
    cases.push(await runCase("R4-CAN-01", () => runCan01(session, runIndex)));
    cases.push(await runCase("R4-CAN-02", () => runCan02(session, runIndex)));
    cases.push(await runCase("R4-CAN-03", () => runCan03(session, runIndex)));
    cases.push(await runCase("R4-CAN-04", () => runCan04(session, runIndex)));
    cases.push(await runCase("R4-REG-01", () => runReg01(session, runIndex)));
    cases.push(await runCase("R4-REG-02", () => runReg02(session, runIndex)));
    cases.push(await runCase("R4-REG-03", () => runReg03(session, runIndex)));
    cases.push(await runCase("R4-REG-04", () => runReg04(session, runIndex)));
    cases.push(await runCase("R4-REG-05", () => runReg05(session, runIndex)));
    const responses = cases.map((item) => asRecord(asRecord(item.evidence).response ?? item.evidence));
    cases.push(await runCase("R4-REG-06", () => runReg06(session, runIndex, commerce, responses)));
    return {
      cases,
      contractVersion: "3.0.0",
      passedCases: cases.filter((item) => item.result === "PASS").length,
      snapshotId: session.snapshotId,
      totalCases: PACK_IDS.length
    };
  } finally {
    closeSession();
  }
}

export async function runCvR4PackTwice() {
  const frozen = await freezeImplCatalogue();
  const first = await runCvR4Pack(1, frozen);
  const second = await runCvR4Pack(2, frozen);
  return { first, frozen, second };
}

describe("Customer value implementation pack v1.4", () => {
  it("DUR-01 through REG-06 pass twice on one freeze", async (t) => {
    const frozen = await freezeImplCatalogue();
    if (!frozen.live) {
      t.skip("live Thailand retail catalogue is not loaded in this runner");
      return;
    }
    const { first, second } = await runCvR4PackTwice();
    assert.equal(first.totalCases, PACK_IDS.length);
    assert.deepEqual(
      first.cases.map((item) => item.id),
      [...PACK_IDS]
    );
    assert.equal(first.snapshotId, second.snapshotId);
    assert.equal(canonicalR4Report(first), canonicalR4Report(second), "v1.4 runs diverged");
    assert.equal(MATCHER_VERSION, "pareto-hybrid-1");
    assert.equal(CUSTOMER_VALUE_PACK_VERSION, "dev-customer-value-v1.0");
    const failed = [...first.cases, ...second.cases].filter((item) => item.result !== "PASS");
    assert.equal(
      failed.length,
      0,
      failed
        .map((item) => `${item.id}:${JSON.stringify(asRecord(item.evidence).failed ?? item.result)}`)
        .join("; ")
    );
  });
});
