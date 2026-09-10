import { orderForRead } from "@/lib/agentic/presentation/order-read";
import type { AgenticConfig } from "@/lib/agentic/config";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { orderPollView } from "@/lib/agentic/commerce/state";
import type { AgenticStore } from "@/lib/agentic/store/types";

/** Ordinary read: payment and fulfilment observations, without frozen item trees. */
export async function orderTool(input: Readonly<{
  config: AgenticConfig; locale?: string; now: string; orderHandle: string;
  scope: CapabilityScope; store: AgenticStore;
}>) {
  const capability = await resolveCapability({ action: "order.read", config: input.config, handle: input.orderHandle,
    now: input.now, resourceType: "order", scope: input.scope, store: input.store });
  const state = capability ? await input.store.getOrderReadState(capability.resourceId) : null;
  const order = orderForRead(state?.order ?? null, input.now);
  const locale = negotiateLocale(input.locale);
  const view = orderPollView({ checkoutUrl: order?.checkoutUrl ?? null, found: Boolean(order), includeFrozen: false,
    fulfilmentEvents: state?.fulfilmentEvents ?? [], localeMessage: key => agenticMessage(locale, key), order });
  if (view.ok !== true || !order) return view;
  return { ok: true as const, orderHandle: input.orderHandle, orderReference: view.orderReference,
    orderStatus: view.orderStatus, paymentStatus: view.paymentStatus, fulfilment: view.fulfilment,
    summary: view.message, nextAction: view.nextAction, pollAfterSeconds: view.pollAfterSeconds,
    checkoutUrl: view.checkoutUrl, checkoutExpiresAt: view.checkoutExpiresAt, receipt: view.receipt,
    currency: order.currency, totalPriceMinor: order.totalPriceMinor };
}
