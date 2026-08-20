import { resolveCapability } from "@/lib/agentic/capabilities";
import { mockEventForScenario, type PaymentEventScenario } from "@/lib/agentic/commerce/payment";
import { applyVerifiedPaymentEvent } from "@/lib/agentic/commerce/state";
import { processOmsOutbox, advanceFulfilment } from "@/lib/agentic/retail/mock-thailand";
import { nowIso, type AgenticRuntime } from "@/lib/agentic/runtime";
import {
  getCatalogueSnapshot,
  replaceCatalogueSnapshot
} from "@/lib/agentic/catalogue/snapshot";
import { isQaErrorResult, qaError, type QaErrorResult } from "@/lib/agentic/qa/errors";
import type { OrderRecord } from "@/lib/agentic/store/types";

export const PAYMENT_SCENARIOS = [
  "payment.success",
  "payment.decline_insufficient_funds",
  "payment.processing",
  "payment.complete_processing_success",
  "payment.provider_unavailable",
  "payment.recover_after_provider_unavailable",
  "payment.amount_mismatch",
  "payment.currency_mismatch",
  "payment.invalid_signature",
  "payment.wrong_environment",
  "payment.duplicate_success_event",
  "payment.out_of_order_success_then_processing",
  "payment.three_ds_required",
  "payment.three_ds_success",
  "payment.three_ds_failure",
  "payment.three_ds_cancel",
  "payment.expire_checkout",
  "payment.full_refund",
  "payment.partial_refund"
] as const;

export const OMS_SCENARIOS = [
  "oms.accept",
  "oms.timeout_then_accept",
  "oms.duplicate_acknowledgement",
  "oms.reject_retryable",
  "oms.reject_terminal",
  "oms.worker_restart_before_ack",
  "oms.fulfilment_processing",
  "oms.fulfilment_shipped",
  "oms.fulfilment_delivered",
  "oms.fulfilment_cancelled"
] as const;

export const CATALOGUE_SCENARIOS = [
  "catalogue.product_backorder",
  "catalogue.product_out_of_stock",
  "catalogue.product_unavailable",
  "catalogue.product_discontinued",
  "catalogue.invalid_retailer_sku",
  "catalogue.missing_price",
  "catalogue.invalid_serving_basis",
  "catalogue.invalid_contribution_unit",
  "catalogue.other_market_only"
] as const;

export const PROOF_SUITES = [
  "security.multi_principal_isolation",
  "security.capability_types",
  "security.environment_isolation",
  "security.rbac_matrix",
  "security.privacy_scan",
  "catalogue.determinism",
  "workers.restart_recovery",
  "performance.representative_load",
  "polling.rate_enforcement",
  "telemetry.alerts",
  "pack.v3"
] as const;

const PAYMENT_EVENT: Record<string, PaymentEventScenario> = {
  "payment.success": "success",
  "payment.decline_insufficient_funds": "decline_insufficient_funds",
  "payment.processing": "processing_then_success",
  "payment.complete_processing_success": "success",
  "payment.provider_unavailable": "provider_unavailable",
  "payment.recover_after_provider_unavailable": "success",
  "payment.amount_mismatch": "amount_mismatch",
  "payment.currency_mismatch": "currency_mismatch",
  "payment.duplicate_success_event": "duplicate_success",
  "payment.three_ds_required": "three_ds_required",
  "payment.three_ds_success": "three_ds_succeeded",
  "payment.three_ds_failure": "three_ds_failed",
  "payment.three_ds_cancel": "three_ds_cancelled",
  "payment.expire_checkout": "expire",
  "payment.full_refund": "refund",
  "payment.partial_refund": "partial_refund"
};

export function isRegisteredScenario(name: string) {
  return (
    (PAYMENT_SCENARIOS as readonly string[]).includes(name) ||
    (OMS_SCENARIOS as readonly string[]).includes(name) ||
    (CATALOGUE_SCENARIOS as readonly string[]).includes(name)
  );
}

export function isRegisteredProof(name: string) {
  return (PROOF_SUITES as readonly string[]).includes(name);
}

export async function resolveOrderFromHandle(input: Readonly<{
  handle: string;
  now: string;
  runtime: AgenticRuntime;
}>): Promise<OrderRecord | QaErrorResult> {
  const capability = await resolveCapability({
    action: "order.read",
    config: input.runtime.config,
    handle: input.handle,
    now: input.now,
    resourceType: "order",
    scope: input.runtime.scope,
    store: input.runtime.store
  });

  if (!capability) {
    return qaError({ message: "Not found.", reasonCode: "not_found" });
  }

  const order = await input.runtime.store.getOrder(capability.resourceId);

  if (!order) {
    return qaError({ message: "Not found.", reasonCode: "not_found" });
  }

  return order;
}

async function drivePaymentEvent(input: Readonly<{
  now: string;
  order: OrderRecord;
  runtime: AgenticRuntime;
  scenario: PaymentEventScenario;
  submitOms?: boolean;
  uniqueSuffix?: string;
}>) {
  if (!input.order.providerSessionId) {
    return qaError({
      message: "The scenario cannot run from the current authoritative state.",
      reasonCode: "scenario_precondition_failed"
    });
  }

  const event = mockEventForScenario({
    amountMinor: input.order.totalPriceMinor,
    currency: input.order.currency,
    orderId: input.order.id,
    providerSessionId: input.order.providerSessionId,
    scenario: input.scenario
  });

  const applied = await applyVerifiedPaymentEvent({
    event: input.uniqueSuffix
      ? { ...event, providerEventId: `${event.providerEventId}_${input.uniqueSuffix}` }
      : event,
    now: input.now,
    store: input.runtime.store
  });

  if (input.submitOms) {
    await processOmsOutbox({ now: input.now, store: input.runtime.store });
  }

  return applied?.order ?? input.order;
}

export async function driveScenario(input: Readonly<{
  orderHandle?: string;
  parameters?: Record<string, unknown>;
  runtime: AgenticRuntime;
  scenario: string;
}>): Promise<{ order: OrderRecord | null } | QaErrorResult> {
  const now = nowIso();
  const runtime = input.runtime;

  if (input.scenario === "payment.invalid_signature" || input.scenario === "payment.wrong_environment") {
    if (!input.orderHandle) {
      return qaError({ fieldPath: "resource.handle", message: "Not found.", reasonCode: "not_found" });
    }

    const order = await resolveOrderFromHandle({ handle: input.orderHandle, now, runtime });

    if (isQaErrorResult(order)) {
      return order;
    }

    return { order };
  }

  if (input.scenario.startsWith("payment.")) {
    if (!input.orderHandle) {
      return qaError({ fieldPath: "resource.handle", message: "Not found.", reasonCode: "not_found" });
    }

    const resolved = await resolveOrderFromHandle({ handle: input.orderHandle, now, runtime });

    if (isQaErrorResult(resolved)) {
      return resolved;
    }

    const order = resolved as OrderRecord;

    if (input.scenario === "payment.out_of_order_success_then_processing") {
      await drivePaymentEvent({ now, order, runtime, scenario: "success", submitOms: true });
      const after = await runtime.store.getOrder(order.id);
      if (after) {
        await applyVerifiedPaymentEvent({
          event: mockEventForScenario({
            amountMinor: after.totalPriceMinor,
            currency: after.currency,
            orderId: after.id,
            providerSessionId: after.providerSessionId ?? "",
            scenario: "processing_then_success"
          }),
          now,
          store: runtime.store
        });
      }
      return { order: (await runtime.store.getOrder(order.id)) ?? after };
    }

    const mapped = PAYMENT_EVENT[input.scenario];

    if (!mapped) {
      return qaError({
        fieldPath: "scenario",
        message: "Unknown scenario.",
        reasonCode: "unsupported_scenario"
      });
    }

    const submitOms =
      mapped === "success" ||
      mapped === "three_ds_succeeded" ||
      mapped === "duplicate_success";
    const next = await drivePaymentEvent({ now, order, runtime, scenario: mapped, submitOms });

    if (isQaErrorResult(next)) {
      return next;
    }

    return { order: next };
  }

  if (input.scenario.startsWith("oms.")) {
    if (!input.orderHandle) {
      return qaError({ fieldPath: "resource.handle", message: "Not found.", reasonCode: "not_found" });
    }

    const resolved = await resolveOrderFromHandle({ handle: input.orderHandle, now, runtime });

    if (isQaErrorResult(resolved)) {
      return resolved;
    }

    const order = resolved as OrderRecord;

    if (
      input.scenario === "oms.accept" ||
      input.scenario === "oms.timeout_then_accept" ||
      input.scenario === "oms.duplicate_acknowledgement" ||
      input.scenario === "oms.worker_restart_before_ack"
    ) {
      await processOmsOutbox({ now, store: runtime.store });
      return { order: (await runtime.store.getOrder(order.id)) ?? order };
    }

    if (input.scenario === "oms.reject_retryable" || input.scenario === "oms.reject_terminal") {
      await processOmsOutbox({ now, store: runtime.store });
      return { order: (await runtime.store.getOrder(order.id)) ?? order };
    }

    const status =
      input.scenario === "oms.fulfilment_processing"
        ? "processing"
        : input.scenario === "oms.fulfilment_shipped"
          ? "shipped"
          : input.scenario === "oms.fulfilment_delivered"
            ? "delivered"
            : "cancelled";
    await advanceFulfilment({ now, orderId: order.id, status, store: runtime.store });
    return { order: (await runtime.store.getOrder(order.id)) ?? order };
  }

  if (input.scenario.startsWith("catalogue.")) {
    const snapshot = getCatalogueSnapshot();
    const overlay = {
      ...snapshot,
      products: snapshot.products.map((product, index) => {
        if (index !== 0) {
          return product;
        }

        if (input.scenario === "catalogue.product_backorder") {
          return { ...product, stockStatus: "backorder" as const, orderable: true };
        }

        if (
          input.scenario === "catalogue.product_out_of_stock" ||
          input.scenario === "catalogue.product_unavailable" ||
          input.scenario === "catalogue.product_discontinued"
        ) {
          return { ...product, stockStatus: "unavailable" as const, orderable: false };
        }

        if (input.scenario === "catalogue.other_market_only") {
          return {
            ...product,
            candidate: {
              ...product.candidate,
              availableCountryCodes: ["SG"]
            },
            orderable: false
          };
        }

        if (
          input.scenario === "catalogue.invalid_retailer_sku" ||
          input.scenario === "catalogue.missing_price" ||
          input.scenario === "catalogue.invalid_serving_basis" ||
          input.scenario === "catalogue.invalid_contribution_unit"
        ) {
          return { ...product, incompleteCommercialFacts: true, orderable: false };
        }

        return product;
      })
    };
    replaceCatalogueSnapshot(overlay);
    return { order: null };
  }

  return qaError({
    fieldPath: "scenario",
    message: "Unknown scenario.",
    reasonCode: "unsupported_scenario"
  });
}
