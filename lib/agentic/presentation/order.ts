import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { canonicalHash } from "@/lib/agentic/value/canonical";
import { pick } from "@/lib/agentic/presentation/plan";
import type { OrderSuccessWire, OrderConversationWire, OrderStatusWire, OrderDetailsWire } from "@/lib/agentic/contract/outputs";
import type { OrderRecord, FulfilmentEventRecord, PaymentAttemptRecord } from "@/lib/agentic/store/types";
export type OrderViewInput = Readonly<{ responseView?: "full" | "conversation" | "status" | "details"; knownResultVersion?: string; sections?: readonly ("frozen_order" | "events")[]; orderHandle: string; locale?: string }>;
export function orderResultVersion(order: OrderRecord, fulfilment: readonly FulfilmentEventRecord[], attempts: readonly PaymentAttemptRecord[], locale: string) {
  return canonicalHash({ presentation: AGENTIC_CONTRACT_VERSION, locale, order, fulfilment, attempts });
}
export function projectOrder(view: OrderSuccessWire, input: OrderViewInput, order: OrderRecord, resultVersion: string, locale: string): OrderSuccessWire | OrderConversationWire | OrderStatusWire | OrderDetailsWire {
  if (!input.responseView || input.responseView === "full") return view;
  const base = { ok: true as const, orderHandle: input.orderHandle, resultVersion, contractVersion: AGENTIC_CONTRACT_VERSION, locale };
  if (input.responseView === "details") return { ...base, responseView: "details", sections: [...input.sections!],
    ...(input.sections!.includes("frozen_order") ? { frozenOrder: view.frozenOrder } : {}),
    ...(input.sections!.includes("events") ? { events: view.events } : {}) };
  const state = pick(view, ["orderReference", "orderStatus", "paymentStatus", "fulfilment", "nextAction", "pollAfterSeconds", "terminal", "retryable", "stateVersion", "latestPaymentReason"]);
  if (input.responseView === "status") return { ...base, ...state, responseView: "status", unchanged: resultVersion === input.knownResultVersion };
  const frozen = order.frozenPlan as Partial<OrderSuccessWire["frozenOrder"]> | null;
  return { ...base, ...state, responseView: "conversation", ...pick(view, ["checkoutUrl", "checkoutExpiresAt", "message", "receipt"]),
    currency: order.currency, totalPriceMinor: order.totalPriceMinor,
    subtotalMinor: frozen?.subtotalMinor ?? null, shippingMinor: frozen?.shippingMinor ?? null, taxMinor: frozen?.taxMinor ?? null,
    availableDetails: ["frozen_order", "events"] };
}
