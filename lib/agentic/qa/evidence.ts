import { AGENTIC_CONTRACT_VERSION, AGENTIC_MIGRATION_VERSION, GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { AGENTIC_SCHEMA_CHECKSUM } from "@/lib/agentic/info";
import { catalogueVersion } from "@/lib/agentic/catalogue/snapshot";
import { orderEvidence } from "@/lib/agentic/qa/proofs";
import type { AgenticRuntime } from "@/lib/agentic/runtime";
import type { OrderRecord } from "@/lib/agentic/store/types";
import { checksumPayload, type QaAssertion } from "@/lib/agentic/qa/run-store";

function frozenDigest(order: OrderRecord | null) {
  if (!order || !order.frozenPlan || typeof order.frozenPlan !== "object") {
    return null;
  }

  const frozen = order.frozenPlan as Record<string, unknown>;
  return {
    currency: order.currency,
    items: frozen.items ?? frozen.productCount ?? null,
    subtotalMinor: frozen.subtotalMinor ?? null,
    totalPriceMinor: order.totalPriceMinor
  };
}

export async function buildEvidenceBundle(input: Readonly<{
  after: OrderRecord | null;
  assertions: readonly QaAssertion[];
  before: OrderRecord | null;
  now: string;
  resourceFingerprint: string;
  runtime: AgenticRuntime;
  scenario: string;
  orderId: string | null;
}>) {
  const counters = input.orderId
    ? await orderEvidence({ orderId: input.orderId, runtime: input.runtime })
    : {
        fulfilmentStatus: null,
        omsSubmitCount: 0,
        paymentAttemptCount: 0,
        paymentConfirmedCount: 0,
        paymentStatus: null,
        stateVersion: null
      };

  const audits = input.orderId
    ? await input.runtime.store.listPaymentAudits(input.orderId)
    : [];
  const attempts = input.orderId
    ? await input.runtime.store.listPaymentAttempts(input.orderId)
    : [];

  const payload = {
    after: input.after
      ? {
          currency: input.after.currency,
          fulfilmentStatus: input.after.fulfilmentStatus,
          latestPaymentAttempt: input.after.latestPaymentAttempt,
          latestPaymentReason: input.after.latestPaymentReason,
          orderStatus: input.after.orderStatus,
          paymentStatus: input.after.paymentStatus,
          stateVersion: input.after.stateVersion,
          totalPriceMinor: input.after.totalPriceMinor
        }
      : null,
    assertions: input.assertions,
    before: input.before
      ? {
          currency: input.before.currency,
          fulfilmentStatus: input.before.fulfilmentStatus,
          latestPaymentAttempt: input.before.latestPaymentAttempt,
          latestPaymentReason: input.before.latestPaymentReason,
          orderStatus: input.before.orderStatus,
          paymentStatus: input.before.paymentStatus,
          stateVersion: input.before.stateVersion,
          totalPriceMinor: input.before.totalPriceMinor
        }
      : null,
    buildId: input.runtime.config.buildId,
    catalogueVersion: catalogueVersion(),
    contractVersion: AGENTIC_CONTRACT_VERSION,
    createdAt: input.now,
    frozenDigest: frozenDigest(input.after ?? input.before),
    guidanceRulesVersion: GUIDANCE_RULES_VERSION,
    migrationVersion: AGENTIC_MIGRATION_VERSION,
    resourceFingerprint: input.resourceFingerprint,
    scenario: input.scenario,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
    counters: {
      ...counters,
      paymentDeclinedCount: audits.filter((item) => item.type === "payment_declined").length,
      paymentAttemptStatuses: attempts.map((item) => item.status)
    }
  };

  return {
    checksum: checksumPayload(payload),
    payload
  };
}
