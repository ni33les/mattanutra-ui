import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseCheckoutAddress } from "../lib/agentic/checkout-address.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import { DEFAULT_SHIPPING_MINOR, DEFAULT_TAX_MINOR } from "../lib/agentic/money.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";
import { redactedOrderCounts } from "../lib/agentic/qa/counts.ts";
import { advanceFulfilment, applyFulfilmentEvent } from "../lib/agentic/retail/mock-thailand.ts";
import type { AgenticRuntime } from "../lib/agentic/runtime.ts";
import type { OrderRecord } from "../lib/agentic/store/types.ts";
import {
  COM_CASE_IDS,
  COM_EXPIRED_NOW,
  COM_FIXED_NOW,
  COM_LEAK_NEEDLES,
  COM_OPT_A,
  COM_OPT_B_LOW,
  COM_PACK_VERSION,
  COM_PRD_B12,
  COM_PRD_D3,
  COM_PRD_MG,
  COM_SAFETY_ID,
  advancePlanRevision,
  beginComRun,
  comCall,
  comListTools,
  createComRuntime,
  endComRun,
  errorOf,
  frozenOf,
  key,
  leakHits,
  planAResult,
  planBResult,
  seedBlocked,
  seedNeedsInput,
  seedPlanA,
  seedPlanB,
  seedSuperseded,
  selectedOptionOf,
  withNow,
  type ComCaseId,
  type SeededPlan
} from "./helpers/com-fixtures.ts";

export type ComCaseResult = Readonly<{
  evidence: Record<string, unknown>;
  id: ComCaseId;
  result: "FAIL" | "PASS";
}>;

export type ComPackReport = Readonly<{
  cases: readonly ComCaseResult[];
  packVersion: typeof COM_PACK_VERSION;
  passedCases: number;
  totalCases: 50;
}>;

function sortedKeys(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((keyName) => [keyName, value[keyName]])
  );
}

function pass(id: ComCaseId, evidence: Record<string, unknown>): ComCaseResult {
  return { evidence: sortedKeys(evidence), id, result: "PASS" };
}

function fail(id: ComCaseId, evidence: Record<string, unknown>): ComCaseResult {
  return { evidence: sortedKeys(evidence), id, result: "FAIL" };
}

function verdict(id: ComCaseId, ok: boolean, evidence: Record<string, unknown>) {
  return ok ? pass(id, evidence) : fail(id, evidence);
}

function moneyFromFrozen(frozen: unknown) {
  const record = frozenOf(frozen);
  const items = Array.isArray(record.items) ? record.items : [];
  const lineTotalMinor = items.reduce((sum, item) => {
    const row = frozenOf(item);
    return sum + (typeof row.lineTotalMinor === "number" ? row.lineTotalMinor : 0);
  }, 0);
  return {
    currency: record.currency ?? null,
    lineTotalMinor,
    productIds: items.map((item) => String(frozenOf(item).productId ?? "")),
    quantities: items.map((item) => Number(frozenOf(item).quantity) || 0),
    shippingMinor: record.shippingMinor ?? null,
    subtotalMinor: record.subtotalMinor ?? null,
    taxMinor: record.taxMinor ?? null,
    totalPriceMinor: record.totalPriceMinor ?? null
  };
}

function arithmeticHolds(frozen: unknown) {
  const money = moneyFromFrozen(frozen);
  return (
    money.currency === "THB" &&
    money.lineTotalMinor === money.subtotalMinor &&
    typeof money.subtotalMinor === "number" &&
    typeof money.shippingMinor === "number" &&
    typeof money.taxMinor === "number" &&
    money.subtotalMinor + money.shippingMinor + money.taxMinor === money.totalPriceMinor
  );
}

function recoveryAction(error: Record<string, unknown>) {
  if (typeof error.nextAction === "string") {
    return error.nextAction;
  }
  const actions = error.nextActions;
  if (Array.isArray(actions) && typeof actions[0] === "string") {
    return actions[0];
  }
  return null;
}

async function orderRecord(
  runtime: AgenticRuntime,
  orderHandle: string
): Promise<OrderRecord | null> {
  const capability = await resolveCapability({
    action: "order.read",
    config: runtime.config,
    handle: orderHandle,
    now: runtime.now ?? COM_FIXED_NOW,
    resourceType: "order",
    scope: runtime.scope,
    store: runtime.store
  });
  return capability ? runtime.store.getOrder(capability.resourceId) : null;
}

async function executeReady(
  runtime: AgenticRuntime,
  seeded: SeededPlan,
  idempotencyKey: string
) {
  return comCall(runtime, "execute", {
    expectedRevision: seeded.revision,
    idempotencyKey,
    planHandle: seeded.planHandle
  });
}

async function pay(
  runtime: AgenticRuntime,
  orderHandle: string,
  scenario:
    | "success"
    | "decline_insufficient_funds"
    | "duplicate_success"
    | "amount_mismatch"
    | "currency_mismatch"
    | "processing_then_success"
    | "provider_unavailable"
    | "three_ds_required"
    | "three_ds_cancelled"
    | "three_ds_failed"
    | "three_ds_succeeded"
    | "expire"
    | "refund"
    | "partial_refund"
) {
  return simulatePayment({
    config: runtime.config,
    now: runtime.now ?? COM_FIXED_NOW,
    orderHandle,
    scenario,
    scope: runtime.scope,
    store: runtime.store
  });
}

const checkoutPanelSource = readFileSync(
  new URL("../components/retail-checkout/product-basket-checkout-panel.tsx", import.meta.url),
  "utf8"
);

function frozenProductNames(execute: Record<string, unknown>, order: Record<string, unknown>) {
  const frozen = frozenOf(execute.frozenPlan ?? order.frozenOrder);
  const items = Array.isArray(frozen.items) ? frozen.items : [];
  return items.map((item) => String(frozenOf(item).productName ?? frozenOf(item).title ?? ""));
}

async function withCase<T>(work: (runtime: AgenticRuntime) => Promise<T>): Promise<T> {
  beginComRun();
  try {
    return await work(createComRuntime());
  } finally {
    endComRun();
  }
}

async function com01() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("01-exec"));
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const checkout = stored
      ? await runtime.store.getCheckoutByOrderId(stored.id)
      : null;
    const ok =
      executed.ok === true &&
      executed.orderStatus === "open" &&
      executed.paymentStatus === "unpaid" &&
      executed.stateVersion === 1 &&
      stored?.orderStatus === "open" &&
      stored.paymentStatus === "unpaid" &&
      stored.stateVersion === 1 &&
      Boolean(checkout) &&
      Boolean(executed.checkoutUrl);
    return verdict("COM-01", ok, {
      checkoutPresent: Boolean(checkout),
      orderStatus: executed.orderStatus ?? null,
      paymentStatus: executed.paymentStatus ?? null,
      planFixture: "A",
      planRevision: seeded.revision,
      reason: errorOf(executed).reasonCode ?? null,
      selectedOptionId: selectedOptionOf(executed.frozenPlan),
      stateVersion: executed.stateVersion ?? null
    });
  });
}

async function com02() {
  return withCase(async (runtime) => {
    const needs = await seedNeedsInput(runtime);
    const blocked = await seedBlocked(runtime);
    const needsExec = await executeReady(runtime, needs, key("02-needs"));
    const blockedExec = await executeReady(runtime, blocked, key("02-block"));
    const needsOrder = await runtime.store.getActiveOrderForPlanRevision(needs.planId, 1);
    const blockedOrder = await runtime.store.getActiveOrderForPlanRevision(blocked.planId, 1);
    const ok =
      errorOf(needsExec).reasonCode === "plan_not_ready" &&
      errorOf(blockedExec).reasonCode === "plan_not_ready" &&
      needsOrder == null &&
      blockedOrder == null;
    return verdict("COM-02", ok, {
      blockedReason: errorOf(blockedExec).reasonCode ?? null,
      needsReason: errorOf(needsExec).reasonCode ?? null,
      storesEmpty: needsOrder == null && blockedOrder == null
    });
  });
}

async function com03() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const first = await executeReady(runtime, seeded, key("03-replay"));
    const second = await executeReady(runtime, seeded, key("03-replay"));
    const ok =
      first.ok === true &&
      second.ok === true &&
      first.orderHandle === second.orderHandle &&
      first.orderReference === second.orderReference &&
      first.checkoutUrl === second.checkoutUrl &&
      first.checkoutExpiresAt === second.checkoutExpiresAt &&
      first.stateVersion === second.stateVersion &&
      JSON.stringify(first.frozenPlan) === JSON.stringify(second.frozenPlan);
    return verdict("COM-03", ok, {
      sameCheckout: first.checkoutUrl === second.checkoutUrl,
      sameExpiry: first.checkoutExpiresAt === second.checkoutExpiresAt,
      sameHandle: first.orderHandle === second.orderHandle,
      sameReference: first.orderReference === second.orderReference
    });
  });
}

async function com04() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const first = await executeReady(runtime, seeded, key("04-a"));
    const second = await executeReady(runtime, seeded, key("04-b"));
    const firstOrder = await orderRecord(runtime, String(first.orderHandle ?? ""));
    const secondOrder = await orderRecord(runtime, String(second.orderHandle ?? ""));
    const concurrentPlan = await seedPlanA(runtime);
    const concurrent = await Promise.all([
      executeReady(runtime, concurrentPlan, key("04-c1")),
      executeReady(runtime, concurrentPlan, key("04-c2"))
    ]);
    const recovered =
      second.ok === true &&
      first.orderHandle === second.orderHandle &&
      first.orderReference === second.orderReference &&
      Boolean(second.checkoutUrl);
    const alreadyExecuted = errorOf(second).reasonCode === "already_executed";
    const falseConflict = errorOf(second).reasonCode === "revision_conflict";
    const concurrentOk =
      concurrent[0]?.ok === true &&
      concurrent[1]?.ok === true &&
      concurrent[0]?.orderHandle === concurrent[1]?.orderHandle;
    const ok =
      first.ok === true &&
      (recovered || alreadyExecuted) &&
      !falseConflict &&
      firstOrder?.id === secondOrder?.id &&
      concurrentOk;
    return verdict("COM-04", ok, {
      concurrentOk,
      firstOk: first.ok === true,
      recovered,
      secondReason: errorOf(second).reasonCode ?? null,
      sameHandle: first.orderHandle === second.orderHandle,
      sameOrderId: firstOrder?.id === secondOrder?.id
    });
  });
}

async function com05() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const first = await executeReady(runtime, seeded, key("05-same"));
    const conflict = await comCall(runtime, "execute", {
      expectedRevision: 2,
      idempotencyKey: key("05-same"),
      planHandle: seeded.planHandle
    });
    const stored = await orderRecord(runtime, String(first.orderHandle ?? ""));
    const ok =
      first.ok === true &&
      errorOf(conflict).reasonCode === "idempotency_conflict" &&
      stored?.planRevision === 1 &&
      stored.orderStatus === "open";
    return verdict("COM-05", ok, {
      originalRevision: stored?.planRevision ?? null,
      originalStatus: stored?.orderStatus ?? null,
      reason: errorOf(conflict).reasonCode ?? null
    });
  });
}

async function com06() {
  return withCase(async (runtime) => {
    const seeded = await seedSuperseded(runtime);
    const stale = await comCall(runtime, "execute", {
      expectedRevision: 1,
      idempotencyKey: key("06-stale"),
      planHandle: seeded.planHandle
    });
    const error = errorOf(stale);
    const order = await runtime.store.getActiveOrderForPlanRevision(seeded.planId, 1);
    const current = await runtime.store.getActiveOrderForPlanRevision(seeded.planId, 2);
    const ok =
      error.reasonCode === "revision_conflict" &&
      error.fieldPath === "expectedRevision" &&
      (error.requestedRevision === 1 || error.requestedRevision == null) &&
      error.currentRevision === 2 &&
      error.retryable === true &&
      recoveryAction(error) === "reload_plan" &&
      order == null &&
      current == null;
    return verdict("COM-06", ok, {
      currentRevision: error.currentRevision ?? null,
      fieldPath: error.fieldPath ?? null,
      nextAction: recoveryAction(error),
      reason: error.reasonCode ?? null,
      requestedRevision: error.requestedRevision ?? null,
      retryable: error.retryable ?? null,
      storesEmpty: order == null && current == null
    });
  });
}

async function com07() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("07-arith"));
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      executed.ok === true &&
      arithmeticHolds(executed.frozenPlan) &&
      arithmeticHolds(order.frozenOrder);
    return verdict("COM-07", ok, {
      executeMoney: moneyFromFrozen(executed.frozenPlan),
      orderMoney: moneyFromFrozen(order.frozenOrder),
      shippingMinor: DEFAULT_SHIPPING_MINOR,
      taxMinor: DEFAULT_TAX_MINOR
    });
  });
}

async function com08() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanB(runtime);
    const executed = await executeReady(runtime, seeded, key("08-opt"));
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const executeOption = selectedOptionOf(executed.frozenPlan);
    const orderOption = selectedOptionOf(order.frozenOrder);
    const money = moneyFromFrozen(executed.frozenPlan);
    const ok =
      executed.ok === true &&
      executeOption === COM_OPT_B_LOW &&
      orderOption === COM_OPT_B_LOW &&
      money.productIds.includes(COM_PRD_B12.productId) &&
      money.productIds.includes(COM_PRD_MG.productId) &&
      arithmeticHolds(executed.frozenPlan);
    return verdict("COM-08", ok, {
      executeOption,
      orderOption,
      productIds: money.productIds,
      selectedExpected: COM_OPT_B_LOW,
      totalPriceMinor: money.totalPriceMinor
    });
  });
}

async function com09() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("09-immut"));
    const before = JSON.stringify(executed.frozenPlan);
    await advancePlanRevision(runtime, seeded.planId, 2, planBResult());
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const ok =
      executed.ok === true &&
      JSON.stringify(order.frozenOrder ?? executed.frozenPlan) &&
      stored?.planRevision === 1 &&
      JSON.stringify(stored.frozenPlan) === before;
    return verdict("COM-09", ok, {
      frozenUnchanged: JSON.stringify(stored?.frozenPlan) === before,
      planRevision: stored?.planRevision ?? null,
      selectedOptionId: selectedOptionOf(stored?.frozenPlan)
    });
  });
}

async function com10() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanB(runtime);
    const executed = await executeReady(runtime, seeded, key("10-safe"));
    const frozen = frozenOf(executed.frozenPlan);
    const ids = Array.isArray(frozen.safetyGuidanceIds)
      ? frozen.safetyGuidanceIds.map(String)
      : [];
    const ok = executed.ok === true && ids.includes(COM_SAFETY_ID);
    return verdict("COM-10", ok, {
      safetyGuidanceIds: ids,
      selectedOptionId: selectedOptionOf(frozen)
    });
  });
}

async function com11() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const first = await executeReady(runtime, seeded, key("11-r1"));
    await advancePlanRevision(runtime, seeded.planId, 2, planBResult());
    const second = await comCall(runtime, "execute", {
      expectedRevision: 2,
      idempotencyKey: key("11-r2"),
      planHandle: seeded.planHandle
    });
    const firstStored = await orderRecord(runtime, String(first.orderHandle ?? ""));
    const secondStored = await orderRecord(runtime, String(second.orderHandle ?? ""));
    const ok =
      first.ok === true &&
      second.ok === true &&
      first.orderHandle !== second.orderHandle &&
      firstStored?.id !== secondStored?.id &&
      firstStored?.planRevision === 1 &&
      secondStored?.planRevision === 2 &&
      JSON.stringify(firstStored?.frozenPlan) !== JSON.stringify(secondStored?.frozenPlan);
    return verdict("COM-11", ok, {
      distinctHandles: first.orderHandle !== second.orderHandle,
      firstRevision: firstStored?.planRevision ?? null,
      secondRevision: secondStored?.planRevision ?? null
    });
  });
}

async function com12() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("12-init"));
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const ok =
      executed.ok === true &&
      order.orderStatus === "open" &&
      order.paymentStatus === "unpaid" &&
      order.stateVersion === 1 &&
      order.latestPaymentAttempt == null &&
      order.retryable === true &&
      frozenOf(order.fulfilment).status === "not_started" &&
      stored?.fulfilmentStatus === "not_started";
    return verdict("COM-12", ok, {
      fulfilment: frozenOf(order.fulfilment).status ?? null,
      latestPaymentAttempt: order.latestPaymentAttempt ?? null,
      orderStatus: order.orderStatus ?? null,
      paymentStatus: order.paymentStatus ?? null,
      retryable: order.retryable ?? null,
      stateVersion: order.stateVersion ?? null
    });
  });
}

async function com13() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("13-dec"));
    await pay(runtime, String(executed.orderHandle), "decline_insufficient_funds");
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const counts = stored ? await redactedOrderCounts({ orderId: stored.id, runtime }) : null;
    const ok =
      order.ok === true &&
      order.orderHandle === undefined &&
      order.orderStatus === "open" &&
      order.paymentStatus === "unpaid" &&
      order.stateVersion === 1 &&
      order.latestPaymentAttempt === "declined" &&
      order.retryable === true &&
      counts?.paymentDeclinedCount === 1 &&
      counts.omsSubmitCount === 0 &&
      stored?.id === (await orderRecord(runtime, String(executed.orderHandle)))?.id;
    return verdict("COM-13", ok, {
      latestPaymentAttempt: order.latestPaymentAttempt ?? null,
      latestPaymentReason: order.latestPaymentReason ?? null,
      omsSubmitCount: counts?.omsSubmitCount ?? null,
      orderStatus: order.orderStatus ?? null,
      paymentDeclinedCount: counts?.paymentDeclinedCount ?? null,
      paymentStatus: order.paymentStatus ?? null,
      sameCheckout: order.checkoutUrl === executed.checkoutUrl,
      stateVersion: order.stateVersion ?? null
    });
  });
}

async function com14() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("14-retry"));
    await pay(runtime, String(executed.orderHandle), "decline_insufficient_funds");
    await pay(runtime, String(executed.orderHandle), "success");
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const counts = stored ? await redactedOrderCounts({ orderId: stored.id, runtime }) : null;
    const ok =
      order.orderStatus === "completed" &&
      order.paymentStatus === "paid" &&
      order.stateVersion === 2 &&
      order.latestPaymentAttempt === "succeeded" &&
      order.retryable === false &&
      counts?.paymentConfirmedCount === 1 &&
      stored?.id === (await orderRecord(runtime, String(executed.orderHandle)))?.id;
    return verdict("COM-14", ok, {
      latestPaymentAttempt: order.latestPaymentAttempt ?? null,
      orderReference: order.orderReference ?? null,
      orderStatus: order.orderStatus ?? null,
      paymentConfirmedCount: counts?.paymentConfirmedCount ?? null,
      paymentStatus: order.paymentStatus ?? null,
      sameHandle: true,
      stateVersion: order.stateVersion ?? null
    });
  });
}

async function com15() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("15-direct"));
    await pay(runtime, String(executed.orderHandle), "success");
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const counts = stored ? await redactedOrderCounts({ orderId: stored.id, runtime }) : null;
    const ok =
      order.orderStatus === "completed" &&
      order.paymentStatus === "paid" &&
      order.stateVersion === 2 &&
      counts?.paymentConfirmedCount === 1 &&
      Boolean(order.receipt) &&
      (counts?.omsSubmitCount === 1 || counts?.omsChildOrderCount === 1);
    return verdict("COM-15", ok, {
      omsChildOrderCount: counts?.omsChildOrderCount ?? null,
      omsSubmitCount: counts?.omsSubmitCount ?? null,
      paymentConfirmedCount: counts?.paymentConfirmedCount ?? null,
      paymentStatus: order.paymentStatus ?? null,
      receipt: Boolean(order.receipt),
      stateVersion: order.stateVersion ?? null
    });
  });
}

async function com16() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("16-dup"));
    await pay(runtime, String(executed.orderHandle), "decline_insufficient_funds");
    const afterDecline = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    await pay(runtime, String(executed.orderHandle), "decline_insufficient_funds");
    const declineDup = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    await pay(runtime, String(executed.orderHandle), "success");
    await pay(runtime, String(executed.orderHandle), "duplicate_success");
    const afterSuccess = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const counts = stored ? await redactedOrderCounts({ orderId: stored.id, runtime }) : null;
    const ok =
      JSON.stringify(afterDecline) === JSON.stringify(declineDup) &&
      afterSuccess.paymentStatus === "paid" &&
      afterSuccess.stateVersion === 2 &&
      counts?.paymentConfirmedCount === 1;
    return verdict("COM-16", ok, {
      declineStable: JSON.stringify(afterDecline) === JSON.stringify(declineDup),
      paymentConfirmedCount: counts?.paymentConfirmedCount ?? null,
      paymentStatus: afterSuccess.paymentStatus ?? null,
      stateVersion: afterSuccess.stateVersion ?? null
    });
  });
}

async function com17() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("17-late"));
    await pay(runtime, String(executed.orderHandle), "success");
    await pay(runtime, String(executed.orderHandle), "decline_insufficient_funds");
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      order.paymentStatus === "paid" &&
      order.orderStatus === "completed" &&
      order.stateVersion === 2 &&
      order.latestPaymentAttempt !== "declined";
    return verdict("COM-17", ok, {
      latestPaymentAttempt: order.latestPaymentAttempt ?? null,
      orderStatus: order.orderStatus ?? null,
      paymentStatus: order.paymentStatus ?? null,
      stateVersion: order.stateVersion ?? null
    });
  });
}

async function com18() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("18-3ds"));
    await pay(runtime, String(executed.orderHandle), "three_ds_required");
    const processing = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const failedPlan = await seedPlanA(runtime);
    const failedExec = await executeReady(runtime, failedPlan, key("18-fail"));
    await pay(runtime, String(failedExec.orderHandle), "three_ds_failed");
    const failed = await comCall(runtime, "order", { orderHandle: failedExec.orderHandle });
    const delayedPlan = await seedPlanA(runtime);
    const delayedExec = await executeReady(runtime, delayedPlan, key("18-delay"));
    await pay(runtime, String(delayedExec.orderHandle), "processing_then_success");
    const delayed = await comCall(runtime, "order", { orderHandle: delayedExec.orderHandle });
    const ok =
      processing.paymentStatus === "processing" &&
      processing.orderStatus === "open" &&
      processing.ok === true &&
      failed.paymentStatus === "unpaid" &&
      failed.orderStatus !== "completed" &&
      delayed.paymentStatus === "paid" &&
      delayed.orderStatus === "completed";
    return verdict("COM-18", ok, {
      delayedStatus: delayed.paymentStatus ?? null,
      failedStatus: failed.paymentStatus ?? null,
      processingStatus: processing.paymentStatus ?? null
    });
  });
}

async function com19() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("19-poll"));
    const first = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const second = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      first.ok === true &&
      second.ok === true &&
      first.stateVersion === second.stateVersion &&
      first.orderStatus === second.orderStatus &&
      first.paymentStatus === second.paymentStatus &&
      JSON.stringify(first.frozenOrder) === JSON.stringify(second.frozenOrder);
    return verdict("COM-19", ok, {
      firstVersion: first.stateVersion ?? null,
      secondVersion: second.stateVersion ?? null,
      stable: JSON.stringify(first) === JSON.stringify(second)
    });
  });
}

async function com20() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("20-done"));
    await pay(runtime, String(executed.orderHandle), "success");
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const receipt = frozenOf(order.receipt);
    const ok =
      order.paymentStatus === "paid" &&
      order.orderStatus === "completed" &&
      receipt.currency === "THB" &&
      typeof receipt.totalPriceMinor === "number" &&
      order.retryable === false &&
      order.nextAction === "none" &&
      frozenOf(order.fulfilment).status != null;
    return verdict("COM-20", ok, {
      fulfilment: frozenOf(order.fulfilment).status ?? null,
      nextAction: order.nextAction ?? null,
      receipt,
      retryable: order.retryable ?? null
    });
  });
}

async function com21() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("21-exp"));
    const later = withNow(runtime, COM_EXPIRED_NOW);
    const first = await comCall(later, "order", { orderHandle: executed.orderHandle });
    const second = await comCall(later, "order", { orderHandle: executed.orderHandle });
    await pay(later, String(executed.orderHandle), "success");
    const afterPay = await comCall(later, "order", { orderHandle: executed.orderHandle });
    const ok =
      first.orderStatus === "expired" &&
      first.paymentStatus === "unpaid" &&
      first.stateVersion === 2 &&
      first.retryable === false &&
      second.orderStatus === "expired" &&
      second.stateVersion === first.stateVersion &&
      afterPay.orderStatus === "expired" &&
      afterPay.paymentStatus !== "paid";
    return verdict("COM-21", ok, {
      afterPayStatus: afterPay.orderStatus ?? null,
      afterPayPayment: afterPay.paymentStatus ?? null,
      firstStatus: first.orderStatus ?? null,
      firstVersion: first.stateVersion ?? null,
      retryable: first.retryable ?? null,
      secondVersion: second.stateVersion ?? null
    });
  });
}

async function com22() {
  return withCase(async (runtime) => {
    const unpaidPlan = await seedPlanA(runtime);
    const unpaidExec = await executeReady(runtime, unpaidPlan, key("22-unpaid"));
    const expiredRuntime = withNow(runtime, COM_EXPIRED_NOW);
    await comCall(expiredRuntime, "order", { orderHandle: unpaidExec.orderHandle });
    const unpaidOrder = await comCall(expiredRuntime, "order", {
      orderHandle: unpaidExec.orderHandle
    });
    const paidPlan = await seedPlanA(runtime);
    const paidExec = await executeReady(runtime, paidPlan, key("22-paid"));
    await pay(runtime, String(paidExec.orderHandle), "success");
    await pay(runtime, String(paidExec.orderHandle), "refund");
    const refunded = await comCall(runtime, "order", { orderHandle: paidExec.orderHandle });
    const unpaidStored = await orderRecord(expiredRuntime, String(unpaidExec.orderHandle ?? ""));
    const paidStored = await orderRecord(runtime, String(paidExec.orderHandle ?? ""));
    const unpaidCounts = unpaidStored
      ? await redactedOrderCounts({ orderId: unpaidStored.id, runtime: expiredRuntime })
      : null;
    const paidCounts = paidStored
      ? await redactedOrderCounts({ orderId: paidStored.id, runtime })
      : null;
    const unpaidHasNoRefund =
      unpaidOrder.paymentStatus === "unpaid" &&
      unpaidOrder.orderStatus === "expired" &&
      unpaidCounts?.paymentConfirmedCount === 0;
    const paidCancelled =
      refunded.paymentStatus === "refunded" ||
      refunded.orderStatus === "cancelled";
    const ok = unpaidHasNoRefund && paidCancelled && paidCounts?.paymentConfirmedCount === 1;
    return verdict("COM-22", ok, {
      paidPaymentStatus: refunded.paymentStatus ?? null,
      unpaidPaymentStatus: unpaidOrder.paymentStatus ?? null,
      unpaidStatus: unpaidOrder.orderStatus ?? null
    });
  });
}

async function com23() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("23-nf"));
    const unknown = await comCall(runtime, "order", {
      orderHandle: "cap_unknown_handle_32chars_min_xx"
    });
    const tampered = await comCall(runtime, "order", {
      orderHandle: `${String(executed.orderHandle).slice(0, -1)}Z`
    });
    const foreign = await comCall(runtime, "execute", {
      expectedRevision: 1,
      idempotencyKey: key("23-foreign"),
      planHandle: String(executed.orderHandle)
    });
    const reasons = [
      errorOf(unknown).reasonCode,
      errorOf(tampered).reasonCode,
      errorOf(foreign).reasonCode
    ];
    const ok = reasons.every((reason) => reason === "not_found");
    return verdict("COM-23", ok, {
      foreign: errorOf(foreign).reasonCode ?? null,
      tampered: errorOf(tampered).reasonCode ?? null,
      unknown: errorOf(unknown).reasonCode ?? null
    });
  });
}

async function com24() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("24-exec"));
    const opened = await comCall(runtime, "support", {
      idempotencyKey: key("24-open"),
      message: "Please confirm delivery window.",
      orderHandle: executed.orderHandle
    });
    const replay = await comCall(runtime, "support", {
      idempotencyKey: key("24-open"),
      message: "Please confirm delivery window.",
      orderHandle: executed.orderHandle
    });
    const changed = await comCall(runtime, "support", {
      idempotencyKey: key("24-open"),
      message: "Changed support text.",
      orderHandle: executed.orderHandle
    });
    const ok =
      opened.ok === true &&
      typeof opened.supportHandle === "string" &&
      replay.ok === true &&
      replay.supportHandle === opened.supportHandle &&
      replay.messageId === opened.messageId &&
      errorOf(changed).reasonCode === "idempotency_conflict";
    return verdict("COM-24", ok, {
      changedReason: errorOf(changed).reasonCode ?? null,
      sameHandle: replay.supportHandle === opened.supportHandle,
      supportHandle: opened.supportHandle ?? null
    });
  });
}

async function com25() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("25-exec"));
    const opened = await comCall(runtime, "support", {
      idempotencyKey: key("25-open"),
      message: "Need a reply.",
      orderHandle: executed.orderHandle
    });
    const reply = await comCall(runtime, "support", {
      idempotencyKey: key("25-reply"),
      message: "Follow-up on the same case.",
      orderHandle: executed.orderHandle,
      supportHandle: opened.supportHandle
    });
    const isolation = await comCall(runtime, "support", {
      idempotencyKey: key("25-iso"),
      message: "Wrong order.",
      orderHandle: "cap_wrong_order_handle_32chars_xx"
    });
    const ok =
      opened.ok === true &&
      reply.ok === true &&
      reply.supportHandle === opened.supportHandle &&
      errorOf(isolation).reasonCode === "not_found";
    return verdict("COM-25", ok, {
      isolation: errorOf(isolation).reasonCode ?? null,
      replyHandle: reply.supportHandle ?? null,
      sameCase: reply.supportHandle === opened.supportHandle
    });
  });
}

async function com26() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("26-exec"));
    const denied = await comCall(runtime, "feedback", {
      consentConfirmed: false,
      expectedRevision: 1,
      idempotencyKey: key("26-deny"),
      planHandle: seeded.planHandle,
      rating: 5
    });
    const accepted = await comCall(runtime, "feedback", {
      consentConfirmed: true,
      expectedRevision: 1,
      idempotencyKey: key("26-ok"),
      planHandle: seeded.planHandle,
      rating: 5,
      summary: "Helpful plan."
    });
    const replay = await comCall(runtime, "feedback", {
      consentConfirmed: true,
      expectedRevision: 1,
      idempotencyKey: key("26-ok"),
      planHandle: seeded.planHandle,
      rating: 5,
      summary: "Helpful plan."
    });
    const changed = await comCall(runtime, "feedback", {
      consentConfirmed: true,
      expectedRevision: 1,
      idempotencyKey: key("26-ok"),
      planHandle: seeded.planHandle,
      rating: 1,
      summary: "Changed payload."
    });
    const after = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      (errorOf(denied).reasonCode === "consent_required" ||
        errorOf(denied).reasonCode === "invalid_request") &&
      accepted.ok === true &&
      replay.ok === true &&
      errorOf(changed).reasonCode === "idempotency_conflict" &&
      after.orderStatus === "open" &&
      after.paymentStatus === "unpaid";
    return verdict("COM-26", ok, {
      accepted: accepted.ok === true,
      changedReason: errorOf(changed).reasonCode ?? null,
      deniedReason: errorOf(denied).reasonCode ?? null,
      orderUnchanged: after.orderStatus === "open"
    });
  });
}

function compactInvalid(value: Record<string, unknown>) {
  const error = errorOf(value);
  const issues = Array.isArray(error.issues) ? error.issues : [];
  const compact =
    error.reasonCode === "invalid_request" &&
    typeof error.fieldPath === "string" &&
    error.retryable === false &&
    leakHits(value).length === 0;
  return {
    compact,
    fieldPath: error.fieldPath ?? null,
    issueCount: issues.length,
    leaks: leakHits(value),
    reason: error.reasonCode ?? null
  };
}

async function com27() {
  return withCase(async (runtime) => {
    const execute = await comCall(runtime, "execute", {
      expectedRevision: "nope",
      idempotencyKey: "short",
      planHandle: "x"
    });
    const order = await comCall(runtime, "order", { orderHandle: "x" });
    const support = await comCall(runtime, "support", {
      idempotencyKey: "short",
      message: "",
      orderHandle: "x"
    });
    const feedback = await comCall(runtime, "feedback", {
      consentConfirmed: "yes",
      expectedRevision: 0,
      idempotencyKey: "short",
      planHandle: "x",
      rating: 9
    });
    const checks = [execute, order, support, feedback].map(compactInvalid);
    const ok = checks.every((item) => item.compact);
    return verdict("COM-27", ok, {
      execute: checks[0],
      feedback: checks[3],
      order: checks[1],
      support: checks[2]
    });
  });
}

async function com28() {
  return withCase(async (runtime) => {
    const tools = await comListTools(runtime);
    const advertised = JSON.stringify(tools);
    const advertisedLeaks = COM_LEAK_NEEDLES.filter((needle) => advertised.includes(needle));
    const commercial = tools.filter((tool) =>
      ["execute", "order", "support", "feedback"].includes(String(tool.name))
    );
    const shallowAdvertised = commercial.every((tool) => {
      const schema = frozenOf(tool.inputSchema);
      return schema.additionalProperties === true && !("oneOf" in schema) && !("$defs" in schema);
    });
    const qaListed = tools.some((tool) =>
      ["simulate", "evidence", "packProof", "isolationProof"].includes(String(tool.name))
    );
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("28-exec"));
    const malformed = await comCall(runtime, "execute", { idempotencyKey: "short" });
    const unknown = await comCall(runtime, "order", {
      orderHandle: "cap_unknown_handle_32chars_min_xx"
    });
    const blobs = [tools, executed, malformed, unknown];
    const leaks = blobs.flatMap((blob) => leakHits(blob));
    const publicNames = tools.map((tool) => tool.name).sort();
    const ok =
      !qaListed &&
      shallowAdvertised &&
      advertisedLeaks.length === 0 &&
      leaks.length === 0 &&
      JSON.stringify(publicNames) ===
        JSON.stringify(["execute", "feedback", "info", "order", "plan", "support"]);
    return verdict("COM-28", ok, {
      advertisedLeaks,
      leaks,
      publicNames,
      qaListed,
      shallowAdvertised
    });
  });
}

async function com29() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanB(runtime);
    const executed = await executeReady(runtime, seeded, key("29-ui"));
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const names = frozenProductNames(executed, order);
    const money = moneyFromFrozen(executed.frozenPlan);
    const frozen = frozenOf(executed.frozenPlan);
    const ok =
      String(executed.checkoutUrl).includes("/basket/checkout?mode=agentic") &&
      String(executed.orderReference ?? "").length > 0 &&
      money.currency === "THB" &&
      names.includes(COM_PRD_B12.candidate.title) &&
      names.includes(COM_PRD_MG.candidate.title) &&
      String(frozen.countryCode ?? frozen.destinationCountry ?? "TH").includes("TH") &&
      checkoutPanelSource.includes('name="country"') &&
      checkoutPanelSource.includes("name={config.field}") &&
      checkoutPanelSource.includes('name="agentAuthorized"') &&
      checkoutPanelSource.includes("checkout.shipping") === false &&
      /shipping/i.test(checkoutPanelSource) &&
      /tax/i.test(checkoutPanelSource) &&
      /total/i.test(checkoutPanelSource) &&
      /mock|test mode|non-live|DEV/i.test(checkoutPanelSource) &&
      checkoutPanelSource.includes("decline_insufficient_funds");
    return verdict("COM-29", ok, {
      hasCountry: checkoutPanelSource.includes('name="country"'),
      hasMockIdentity: /mock|test mode|non-live|DEV/i.test(checkoutPanelSource),
      hasReference: Boolean(executed.orderReference),
      productIds: money.productIds,
      productNames: names,
      totalPriceMinor: money.totalPriceMinor
    });
  });
}

async function com30() {
  return withCase(async (runtime) => {
    const missing = parseCheckoutAddress({ country: "TH" }, "TH");
    const badEmail = parseCheckoutAddress(
      {
        addressLine1: "123 Sukhumvit",
        city: "Bangkok",
        country: "TH",
        customerEmail: "not-an-email",
        customerName: "Nok",
        phone: "0812345678",
        postalCode: "10110",
        province: "Bangkok"
      },
      "TH"
    );
    const foreign = parseCheckoutAddress(
      {
        addressLine1: "1 Main St",
        city: "Austin",
        country: "US",
        customerEmail: "nok@example.com",
        customerName: "Nok",
        phone: "0812345678",
        postalCode: "78701",
        province: "TX"
      },
      "TH"
    );
    const missingFielded = "error" in missing && /name|phone|email|address|field/i.test(missing.error);
    const emailFielded = "error" in badEmail;
    const countryBlocked =
      "error" in foreign && !("address" in foreign && foreign.address.country === "US");
    const ok = missingFielded && emailFielded && countryBlocked;
    return verdict("COM-30", ok, {
      countryBlocked,
      emailFielded,
      foreignError: "error" in foreign ? foreign.error : null,
      missingError: "error" in missing ? missing.error : null
    });
  });
}

async function com31() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const first = await executeReady(runtime, seeded, key("31-nav"));
    const reload = await executeReady(runtime, seeded, key("31-nav"));
    await pay(runtime, String(first.orderHandle), "success");
    const paid = await comCall(runtime, "order", { orderHandle: first.orderHandle });
    const stored = await orderRecord(runtime, String(first.orderHandle ?? ""));
    const secondOrder = await runtime.store.getActiveOrderForPlanRevision(seeded.planId, 1);
    const ok =
      first.orderHandle === reload.orderHandle &&
      first.orderReference === reload.orderReference &&
      String(first.checkoutUrl).includes("/basket/checkout?mode=agentic") &&
      String(reload.checkoutUrl).includes("/basket/checkout?mode=agentic") &&
      paid.paymentStatus === "paid" &&
      paid.orderReference === first.orderReference &&
      secondOrder?.id === stored?.id;
    return verdict("COM-31", ok, {
      paidReference: paid.orderReference ?? null,
      paidStatus: paid.paymentStatus ?? null,
      sameHandle: first.orderHandle === reload.orderHandle,
      sameOrder: secondOrder?.id === stored?.id
    });
  });
}

async function paidCounts(runtime: AgenticRuntime, orderHandle: string) {
  const stored = await orderRecord(runtime, orderHandle);
  const counts = stored ? await redactedOrderCounts({ orderId: stored.id, runtime }) : null;
  const retail = stored ? await runtime.store.getRetailLink(stored.id) : null;
  return { counts, retail, stored };
}

async function com32() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("32-oms"));
    await pay(runtime, String(executed.orderHandle), "success");
    const { counts, retail, stored } = await paidCounts(runtime, String(executed.orderHandle));
    const ok =
      stored?.paymentStatus === "paid" &&
      counts?.paymentConfirmedCount === 1 &&
      Boolean(retail) &&
      (counts?.omsChildOrderCount === 1 || counts?.omsSubmitCount === 1);
    return verdict("COM-32", ok, {
      omsChildOrderCount: counts?.omsChildOrderCount ?? null,
      paymentConfirmedCount: counts?.paymentConfirmedCount ?? null,
      retailerReference: retail?.retailerReference ?? null
    });
  });
}

async function com33() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanB(runtime);
    const executed = await executeReady(runtime, seeded, key("33-payl"));
    await pay(runtime, String(executed.orderHandle), "success");
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const items = stored ? await runtime.store.getOrderItems(stored.id) : [];
    const retail = stored ? await runtime.store.getRetailLink(stored.id) : null;
    const payload = {
      currency: stored?.currency ?? null,
      productIds: items.map((item) => item.productId),
      quantities: items.map((item) => item.quantity),
      reference: stored?.reference ?? null,
      retailerSkus: items.map((item) => item.retailerSku),
      totalPriceMinor: stored?.totalPriceMinor ?? null
    };
    const prohibited = leakHits({
      ...payload,
      goals: undefined,
      medicationCodes: undefined,
      planHandle: undefined
    });
    const ok =
      Boolean(retail) &&
      payload.productIds.includes(COM_PRD_B12.productId) &&
      payload.productIds.includes(COM_PRD_MG.productId) &&
      payload.currency === "THB" &&
      prohibited.length === 0;
    return verdict("COM-33", ok, {
      payload,
      prohibited,
      retailerReference: retail?.retailerReference ?? null
    });
  });
}

async function com34() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("34-retry"));
    await pay(runtime, String(executed.orderHandle), "success");
    await pay(runtime, String(executed.orderHandle), "duplicate_success");
    const { counts, retail, stored } = await paidCounts(runtime, String(executed.orderHandle));
    const ok =
      stored?.paymentStatus === "paid" &&
      Boolean(retail) &&
      counts?.omsChildOrderCount === 1 &&
      counts.paymentConfirmedCount === 1;
    return verdict("COM-34", ok, {
      omsChildOrderCount: counts?.omsChildOrderCount ?? null,
      paymentConfirmedCount: counts?.paymentConfirmedCount ?? null,
      paymentStatus: stored?.paymentStatus ?? null,
      retailerReference: retail?.retailerReference ?? null
    });
  });
}

async function com35() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("35-pack"));
    await pay(runtime, String(executed.orderHandle), "success");
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    if (stored) {
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "processing",
        store: runtime.store
      });
    }
    const accepted = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      accepted.paymentStatus === "paid" &&
      (frozenOf(accepted.fulfilment).status === "processing" ||
        frozenOf(accepted.fulfilment).status === "accepted") &&
      accepted.orderStatus === "completed";
    return verdict("COM-35", ok, {
      fulfilment: frozenOf(accepted.fulfilment).status ?? null,
      orderStatus: accepted.orderStatus ?? null,
      paymentStatus: accepted.paymentStatus ?? null
    });
  });
}

async function com36() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("36-ship"));
    await pay(runtime, String(executed.orderHandle), "success");
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    if (stored) {
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "shipped",
        store: runtime.store
      });
    }
    const shipped = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const fulfilment = frozenOf(shipped.fulfilment);
    const tracking = Array.isArray(fulfilment.tracking) ? fulfilment.tracking : [];
    const ok =
      fulfilment.status === "shipped" &&
      tracking.length > 0 &&
      shipped.paymentStatus === "paid";
    return verdict("COM-36", ok, {
      fulfilment: fulfilment.status ?? null,
      trackingCount: tracking.length,
      paymentStatus: shipped.paymentStatus ?? null
    });
  });
}

async function com37() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("37-ex"));
    await pay(runtime, String(executed.orderHandle), "success");
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    if (stored) {
      await applyFulfilmentEvent({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        reasonCode: "failed_delivery",
        status: "exception",
        store: runtime.store
      });
    }
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const fulfilment = frozenOf(order.fulfilment);
    const ok =
      fulfilment.status === "exception" &&
      typeof fulfilment.reasonCode === "string" &&
      order.nextAction === "contact_support" &&
      order.paymentStatus === "paid";
    return verdict("COM-37", ok, {
      fulfilment: fulfilment.status ?? null,
      messageKey: order.messageKey ?? null,
      nextAction: order.nextAction ?? null,
      reasonCode: fulfilment.reasonCode ?? null
    });
  });
}

async function com38() {
  return withCase(async (runtime) => {
    const tools = await comListTools(runtime);
    const publicNames = tools.map((tool) => String(tool.name));
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("38-poll"));
    await pay(runtime, String(executed.orderHandle), "success");
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    if (stored) {
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "shipped",
        store: runtime.store
      });
    }
    const polled = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      !publicNames.includes("simulate") &&
      frozenOf(polled.fulfilment).status === "shipped" &&
      polled.ok === true;
    return verdict("COM-38", ok, {
      fulfilment: frozenOf(polled.fulfilment).status ?? null,
      publicNames: publicNames.sort()
    });
  });
}

async function com39() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("39-ref"));
    await pay(runtime, String(executed.orderHandle), "success");
    await pay(runtime, String(executed.orderHandle), "refund");
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const receipt = frozenOf(order.receipt);
    const ok =
      (order.paymentStatus === "refunded" || order.orderStatus === "cancelled") &&
      (receipt.currency === "THB" || order.paymentStatus === "refunded") &&
      selectedOptionOf(order.frozenOrder) === selectedOptionOf(executed.frozenPlan);
    return verdict("COM-39", ok, {
      orderStatus: order.orderStatus ?? null,
      paymentStatus: order.paymentStatus ?? null,
      receipt,
      selectedOptionId: selectedOptionOf(order.frozenOrder)
    });
  });
}

async function com40() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("40-part"));
    await pay(runtime, String(executed.orderHandle), "success");
    await pay(runtime, String(executed.orderHandle), "partial_refund");
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      order.paymentStatus === "partially_refunded" &&
      order.orderStatus === "completed";
    return verdict("COM-40", ok, {
      orderStatus: order.orderStatus ?? null,
      paymentStatus: order.paymentStatus ?? null
    });
  });
}

async function com41() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("41-dupr"));
    await pay(runtime, String(executed.orderHandle), "success");
    await pay(runtime, String(executed.orderHandle), "refund");
    const first = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    await pay(runtime, String(executed.orderHandle), "refund");
    const second = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      first.paymentStatus === "refunded" &&
      second.paymentStatus === "refunded" &&
      first.stateVersion === second.stateVersion;
    return verdict("COM-41", ok, {
      firstStatus: first.paymentStatus ?? null,
      firstVersion: first.stateVersion ?? null,
      secondStatus: second.paymentStatus ?? null,
      secondVersion: second.stateVersion ?? null
    });
  });
}

async function com42() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("42-inv"));
    await pay(runtime, String(executed.orderHandle), "success");
    await pay(runtime, String(executed.orderHandle), "amount_mismatch");
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    const counts = stored ? await redactedOrderCounts({ orderId: stored.id, runtime }) : null;
    const ok =
      order.paymentStatus === "paid" &&
      order.orderStatus === "completed" &&
      (counts?.alertP0Count ?? 0) >= 1;
    return verdict("COM-42", ok, {
      alertP0Count: counts?.alertP0Count ?? null,
      orderStatus: order.orderStatus ?? null,
      paymentStatus: order.paymentStatus ?? null
    });
  });
}

async function com43() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("43-del"));
    await pay(runtime, String(executed.orderHandle), "success");
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    if (stored) {
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "delivered",
        store: runtime.store
      });
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "shipped",
        store: runtime.store
      });
    }
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok = frozenOf(order.fulfilment).status === "delivered";
    return verdict("COM-43", ok, {
      fulfilment: frozenOf(order.fulfilment).status ?? null,
      paymentStatus: order.paymentStatus ?? null
    });
  });
}

async function com44() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("44-happy"));
    await pay(runtime, String(executed.orderHandle), "success");
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    if (stored) {
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "processing",
        store: runtime.store
      });
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "shipped",
        store: runtime.store
      });
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "delivered",
        store: runtime.store
      });
    }
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const { counts, retail } = await paidCounts(runtime, String(executed.orderHandle));
    const ok =
      executed.ok === true &&
      order.paymentStatus === "paid" &&
      frozenOf(order.fulfilment).status === "delivered" &&
      counts?.paymentConfirmedCount === 1 &&
      Boolean(retail);
    return verdict("COM-44", ok, {
      fulfilment: frozenOf(order.fulfilment).status ?? null,
      omsChildOrderCount: counts?.omsChildOrderCount ?? null,
      paymentConfirmedCount: counts?.paymentConfirmedCount ?? null,
      paymentStatus: order.paymentStatus ?? null,
      selectedOptionId: selectedOptionOf(order.frozenOrder)
    });
  });
}

async function com45() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanB(runtime);
    const executed = await executeReady(runtime, seeded, key("45-retry"));
    await pay(runtime, String(executed.orderHandle), "decline_insufficient_funds");
    const declined = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    await pay(runtime, String(executed.orderHandle), "success");
    const stored = await orderRecord(runtime, String(executed.orderHandle ?? ""));
    if (stored) {
      await advanceFulfilment({
        now: COM_FIXED_NOW,
        orderId: stored.id,
        status: "delivered",
        store: runtime.store
      });
    }
    const paid = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const ok =
      declined.orderStatus === "open" &&
      paid.orderReference === executed.orderReference &&
      paid.paymentStatus === "paid" &&
      selectedOptionOf(paid.frozenOrder) === COM_OPT_B_LOW &&
      frozenOf(paid.fulfilment).status === "delivered";
    return verdict("COM-45", ok, {
      declinedStatus: declined.orderStatus ?? null,
      paidStatus: paid.paymentStatus ?? null,
      sameReference: paid.orderReference === executed.orderReference,
      selectedOptionId: selectedOptionOf(paid.frozenOrder)
    });
  });
}

async function com46() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("46-ex"));
    await pay(runtime, String(executed.orderHandle), "three_ds_failed");
    const failed = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const explicit =
      failed.retryable === true &&
      (failed.nextAction === "open_checkout" || failed.latestPaymentAttempt === "declined");
    const stuck = failed.paymentStatus === "processing" && failed.retryable === false;
    const ok = explicit && !stuck && failed.orderStatus === "open";
    return verdict("COM-46", ok, {
      latestPaymentAttempt: failed.latestPaymentAttempt ?? null,
      nextAction: failed.nextAction ?? null,
      orderStatus: failed.orderStatus ?? null,
      paymentStatus: failed.paymentStatus ?? null,
      retryable: failed.retryable ?? null
    });
  });
}

async function com47() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("47-ch"));
    const order = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const frozen = frozenOf(executed.frozenPlan ?? order.frozenOrder);
    const channel = String(
      order.channel ?? order.checkoutMode ?? frozen.channel ?? frozen.checkoutMode ?? ""
    );
    const ok =
      String(executed.checkoutUrl).includes("mode=agentic") && channel === "agentic";
    return verdict("COM-47", ok, {
      channel,
      checkoutUrl: String(executed.checkoutUrl ?? ""),
      orderChannel: order.channel ?? null,
      frozenChannel: frozen.channel ?? frozen.checkoutMode ?? null
    });
  });
}

function isBareOrderTrackUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  let pathname = value.trim();
  try {
    pathname = new URL(value).pathname;
  } catch {
    // relative path
  }

  return /^\/[A-Za-z0-9-]+\/order\/track\/?$/.test(pathname);
}

async function com48() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("48-su"));
    const executeSrc = readFileSync(
      new URL("../lib/agentic/commerce/execute.ts", import.meta.url),
      "utf8"
    );
    const successUrl =
      typeof executed.successUrl === "string" ? executed.successUrl : null;
    const omitted =
      executed.successUrl == null ||
      executed.successUrl === undefined ||
      executed.successUrl === "";
    const ok =
      executed.ok === true &&
      omitted &&
      !isBareOrderTrackUrl(successUrl) &&
      !isBareOrderTrackUrl(executed.checkoutUrl) &&
      !executeSrc.includes("${input.config.siteUrl}/en/order/track`") &&
      !executeSrc.includes("${input.config.siteUrl}/${locale}/order/track`");
    return verdict("COM-48", ok, {
      checkoutUrl: String(executed.checkoutUrl ?? ""),
      omitted,
      successUrl
    });
  });
}

async function com49() {
  return withCase(async (runtime) => {
    const seeded = await seedPlanA(runtime);
    const executed = await executeReady(runtime, seeded, key("49-tr"));
    await pay(runtime, String(executed.orderHandle), "success");
    const paid = await comCall(runtime, "order", { orderHandle: executed.orderHandle });
    const retail = frozenOf(paid.retailCustomerOrder);
    const tracking = String(retail.trackingUrl ?? "");
    const orderSrc = readFileSync(
      new URL("../lib/agentic/commerce/order.ts", import.meta.url),
      "utf8"
    );
    const checkoutSrc = readFileSync(
      new URL("../lib/retail-product-checkout.ts", import.meta.url),
      "utf8"
    );
    const specificWhenPresent =
      tracking === "" || /\/order\/track\/[^/?#]+/.test(tracking);
    const notBareWhenPresent = tracking === "" || !/\/order\/track\/?$/.test(tracking);
    const executeSrc = readFileSync(
      new URL("../lib/agentic/commerce/execute.ts", import.meta.url),
      "utf8"
    );
    const ok =
      paid.paymentStatus === "paid" &&
      !isBareOrderTrackUrl(paid.successUrl) &&
      !isBareOrderTrackUrl(executed.successUrl) &&
      !executeSrc.includes("${input.config.siteUrl}/en/order/track`") &&
      orderSrc.includes("order/track/${encodeURIComponent(settlement.orderNumber)}") &&
      checkoutSrc.includes("order/track/${encodeURIComponent(") &&
      specificWhenPresent &&
      notBareWhenPresent;
    return verdict("COM-49", ok, {
      paymentStatus: paid.paymentStatus ?? null,
      paidSuccessUrl: paid.successUrl ?? null,
      tracking: tracking || null
    });
  });
}

async function com50() {
  const tokenPage = readFileSync(
    new URL("../app/[locale]/order/track/[token]/page.tsx", import.meta.url),
    "utf8"
  );
  const helperPath = fileURLToPath(
    new URL("../lib/order-track-presentation.ts", import.meta.url)
  );
  const helperExists = existsSync(helperPath);
  const helper = helperExists ? readFileSync(helperPath, "utf8") : "";
  const gated =
    /checkoutChannel === "web"/.test(tokenPage) ||
    /channel === "web"/.test(tokenPage) ||
    tokenPage.includes("orderTrackFormulationHref");
  const ok =
    tokenPage.includes('data-testid="formulation-link"') &&
    gated &&
    tokenPage.includes("nutritionRevealPath") &&
    helperExists &&
    helper.includes('"agentic"') &&
    helper.includes('"web"') &&
    helper.includes("nutritionRevealPath");
  return verdict("COM-50", ok, {
    gated,
    helperExists,
    hasFormulationLink: tokenPage.includes('data-testid="formulation-link"'),
    hasRevealPath: tokenPage.includes("nutritionRevealPath")
  });
}

const RUNNERS: Record<ComCaseId, () => Promise<ComCaseResult>> = {
  "COM-01": com01,
  "COM-02": com02,
  "COM-03": com03,
  "COM-04": com04,
  "COM-05": com05,
  "COM-06": com06,
  "COM-07": com07,
  "COM-08": com08,
  "COM-09": com09,
  "COM-10": com10,
  "COM-11": com11,
  "COM-12": com12,
  "COM-13": com13,
  "COM-14": com14,
  "COM-15": com15,
  "COM-16": com16,
  "COM-17": com17,
  "COM-18": com18,
  "COM-19": com19,
  "COM-20": com20,
  "COM-21": com21,
  "COM-22": com22,
  "COM-23": com23,
  "COM-24": com24,
  "COM-25": com25,
  "COM-26": com26,
  "COM-27": com27,
  "COM-28": com28,
  "COM-29": com29,
  "COM-30": com30,
  "COM-31": com31,
  "COM-32": com32,
  "COM-33": com33,
  "COM-34": com34,
  "COM-35": com35,
  "COM-36": com36,
  "COM-37": com37,
  "COM-38": com38,
  "COM-39": com39,
  "COM-40": com40,
  "COM-41": com41,
  "COM-42": com42,
  "COM-43": com43,
  "COM-44": com44,
  "COM-45": com45,
  "COM-46": com46,
  "COM-47": com47,
  "COM-48": com48,
  "COM-49": com49,
  "COM-50": com50
};

export async function runComPack(): Promise<ComPackReport> {
  const cases: ComCaseResult[] = [];
  for (const id of COM_CASE_IDS) {
    cases.push(await RUNNERS[id]());
  }
  return {
    cases,
    packVersion: COM_PACK_VERSION,
    passedCases: cases.filter((item) => item.result === "PASS").length,
    totalCases: 50
  };
}

export function canonicalComReport(report: ComPackReport) {
  return `${JSON.stringify(
    {
      cases: report.cases,
      packVersion: report.packVersion,
      passedCases: report.passedCases,
      totalCases: report.totalCases
    },
    null,
    2
  )}\n`;
}

if (process.env.NODE_TEST_CONTEXT) {
  describe("commercial v1.0 pack", () => {
    it("evaluates COM-01 through COM-50", async () => {
      const report = await runComPack();
      assert.equal(report.totalCases, 50);
      assert.equal(report.cases.length, 50);
      assert.deepEqual(
        report.cases.map((item) => item.id),
        [...COM_CASE_IDS]
      );
      const defects = report.cases.filter((item) =>
        ["COM-47", "COM-48", "COM-49", "COM-50"].includes(item.id)
      );
      assert.equal(
        defects.every((item) => item.result === "PASS"),
        true,
        JSON.stringify(defects, null, 2)
      );
    });
  });
}
