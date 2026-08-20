import { FIXTURE_SUPPLEMENTS } from "@/lib/agentic/catalogue/fixtures";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { catalogueVersion } from "@/lib/agentic/catalogue/snapshot";
import { planTool } from "@/lib/agentic/plan/service";
import { executeTool } from "@/lib/agentic/commerce/execute";
import { simulatePayment } from "@/lib/agentic/qa/simulate";
import { isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import { nowIso, type AgenticRuntime } from "@/lib/agentic/runtime";
import { addMinor, asMinor, asMinorOr, formatMinor, TH_MOCK_TAX_MINOR } from "@/lib/agentic/money";

function supplementId(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  if (!found) {
    throw new Error(`Missing fixture supplement ${name}`);
  }
  return found.supplementId;
}

export function goldenPlanRequest() {
  return {
    currency: "THB",
    destinationCountry: "TH",
    locale: "en",
    optimization: "balanced" as const,
    profile: {
      ageYears: 38,
      lifeStage: "adult" as const,
      sexAtBirth: "male" as const
    },
    requirements: {},
    targets: [
      { amount: 2000, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "IU" as const },
      { amount: 1000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" as const },
      { amount: 300, name: "Magnesium", supplementId: supplementId("Magnesium"), unit: "mg" as const },
      { amount: 1000, name: "Vitamin B12", supplementId: supplementId("Vitamin B12"), unit: "mcg" as const },
      { amount: 1000, name: "Vitamin C", supplementId: supplementId("Vitamin C"), unit: "mg" as const }
    ]
  };
}

function scopeWithPrincipal(base: CapabilityScope, principal: string): CapabilityScope {
  return { ...base, principalScope: principal };
}

export async function orderEvidence(input: Readonly<{
  orderId: string;
  runtime: AgenticRuntime;
}>) {
  const order = await input.runtime.store.getOrder(input.orderId);
  const audits = await input.runtime.store.listPaymentAudits(input.orderId);
  const attempts = await input.runtime.store.listPaymentAttempts(input.orderId);
  const retail = await input.runtime.store.getRetailLink(input.orderId);

  return {
    fulfilmentStatus: order?.fulfilmentStatus ?? null,
    omsSubmitCount: retail ? 1 : 0,
    paymentAttemptCount: attempts.length,
    paymentConfirmedCount: audits.filter((item) => item.type === "payment_confirmed").length,
    paymentStatus: order?.paymentStatus ?? null,
    stateVersion: order?.stateVersion ?? null
  };
}

export async function isolationProof(runtime: AgenticRuntime) {
  const stamp = `${Date.now()}`;
  const aliceScope = scopeWithPrincipal(runtime.scope, `qa-alice-${stamp}`);
  const bobScope = scopeWithPrincipal(runtime.scope, `qa-bob-${stamp}`);
  const now = nowIso();
  const created = await planTool({
    config: runtime.config,
    now,
    payload: {
      idempotencyKey: `qa-iso-alice-${stamp}xxxx`,
      request: goldenPlanRequest()
    },
    scope: aliceScope,
    store: runtime.store
  });

  const checks: Array<{ name: string; passed: boolean }> = [];

  checks.push({
    name: "alice_plan_created",
    passed: !isAgenticErrorResult(created) && created.ok === true
  });

  const stolen = await planTool({
    config: runtime.config,
    now,
    payload: {
      expectedRevision: isAgenticErrorResult(created) ? 1 : created.revision,
      idempotencyKey: `qa-iso-bob-${stamp}xxxxxx`,
      planHandle: isAgenticErrorResult(created) ? "cap_missing_handle_xxxxxxxxxxxx" : created.planHandle,
      request: goldenPlanRequest()
    },
    scope: bobScope,
    store: runtime.store
  });

  checks.push({
    name: "bob_cannot_use_alice_plan_handle",
    passed: isAgenticErrorResult(stolen) && stolen.error.reasonCode === "not_found"
  });

  const passed = checks.every((item) => item.passed);

  return {
    buildId: runtime.config.buildId,
    catalogueVersion: catalogueVersion(),
    checks,
    contractVersion: AGENTIC_CONTRACT_VERSION,
    ok: true as const,
    passed
  };
}

export async function checkoutContinuityProof(runtime: AgenticRuntime) {
  const stamp = `${Date.now()}`;
  const now = nowIso();
  const created = await planTool({
    config: runtime.config,
    now,
    payload: {
      idempotencyKey: `qa-cont-plan-${stamp}xxxxx`,
      request: goldenPlanRequest()
    },
    scope: runtime.scope,
    store: runtime.store
  });

  const checks: Array<{ name: string; passed: boolean }> = [];
  checks.push({
    name: "plan_ready",
    passed: !isAgenticErrorResult(created) && created.status === "ready"
  });

  if (isAgenticErrorResult(created) || created.status !== "ready") {
    return {
      buildId: runtime.config.buildId,
      checks,
      ok: true as const,
      passed: false
    };
  }

  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: created.revision,
    idempotencyKey: `qa-cont-exec-${stamp}xxxxx`,
    now,
    payment: runtime.payment,
    planHandle: created.planHandle,
    scope: runtime.scope,
    store: runtime.store
  });

  checks.push({
    name: "execute_unpaid_v1",
    passed: !isAgenticErrorResult(executed) &&
      executed.paymentStatus === "unpaid" &&
      executed.stateVersion === 1
  });

  if (isAgenticErrorResult(executed)) {
    return { buildId: runtime.config.buildId, checks, ok: true as const, passed: false };
  }

  const capabilityForPayable = await resolveCapability({
    action: "order.read",
    config: runtime.config,
    handle: executed.orderHandle,
    now,
    resourceType: "order",
    scope: runtime.scope,
    store: runtime.store
  });
  const payableOrder = capabilityForPayable
    ? await runtime.store.getOrder(capabilityForPayable.resourceId)
    : null;
  const payableCheckout = payableOrder
    ? await runtime.store.getCheckoutByOrderId(payableOrder.id)
    : null;
  const frozen =
    payableOrder?.frozenPlan && typeof payableOrder.frozenPlan === "object"
      ? (payableOrder.frozenPlan as Record<string, unknown>)
      : {};
  const subtotalMinor = asMinor(frozen.subtotalMinor ?? 0);
  const shippingMinor = asMinorOr(payableCheckout?.shippingMinor, 0);
  const taxMinor = asMinorOr(payableCheckout?.taxMinor, TH_MOCK_TAX_MINOR);
  const payableMinor = asMinor(payableOrder?.totalPriceMinor ?? 0);
  const formatted = formatMinor(payableMinor, payableOrder?.currency ?? "THB", "en-US");

  checks.push({
    name: "payable_includes_shipping",
    passed:
      Boolean(payableOrder) &&
      subtotalMinor > 0 &&
      payableMinor === addMinor(subtotalMinor, shippingMinor, taxMinor) &&
      payableMinor === asMinor(frozen.totalPriceMinor ?? -1)
  });
  checks.push({
    name: "formatted_total_not_concat",
    passed:
      !formatted.includes("231,000,500") &&
      (subtotalMinor !== 231000 || formatted.includes("2,360.00"))
  });

  const declined = await simulatePayment({
    config: runtime.config,
    now,
    orderHandle: executed.orderHandle,
    scenario: "decline_insufficient_funds",
    scope: runtime.scope,
    store: runtime.store
  });

  checks.push({
    name: "decline_stays_v1_unpaid",
    passed:
      !isAgenticErrorResult(declined) &&
      (declined as { paymentStatus?: string; stateVersion?: number }).paymentStatus === "unpaid" &&
      (declined as { stateVersion?: number }).stateVersion === 1
  });

  const paid = await simulatePayment({
    config: runtime.config,
    now,
    orderHandle: executed.orderHandle,
    scenario: "success",
    scope: runtime.scope,
    store: runtime.store
  });

  checks.push({
    name: "success_paid_v2",
    passed:
      !isAgenticErrorResult(paid) &&
      (paid as { paymentStatus?: string }).paymentStatus === "paid" &&
      (paid as { stateVersion?: number }).stateVersion === 2
  });

  const capabilityOrder = await resolveCapability({
    action: "order.read",
    config: runtime.config,
    handle: executed.orderHandle,
    now,
    resourceType: "order",
    scope: runtime.scope,
    store: runtime.store
  });

  const evidence = capabilityOrder
    ? await orderEvidence({ orderId: capabilityOrder.resourceId, runtime })
    : null;

  checks.push({
    name: "one_payment_confirmed",
    passed: evidence?.paymentConfirmedCount === 1
  });
  checks.push({
    name: "one_oms_submit",
    passed: evidence?.omsSubmitCount === 1
  });

  const duplicate = await simulatePayment({
    config: runtime.config,
    now,
    orderHandle: executed.orderHandle,
    scenario: "duplicate_success",
    scope: runtime.scope,
    store: runtime.store
  });
  const afterDup = capabilityOrder
    ? await orderEvidence({ orderId: capabilityOrder.resourceId, runtime })
    : null;

  checks.push({
    name: "duplicate_success_no_second_confirm",
    passed:
      !isAgenticErrorResult(duplicate) &&
      afterDup?.paymentConfirmedCount === 1 &&
      afterDup.stateVersion === 2
  });

  return {
    buildId: runtime.config.buildId,
    catalogueVersion: catalogueVersion(),
    checks,
    evidence,
    ok: true as const,
    passed: checks.every((item) => item.passed)
  };
}
