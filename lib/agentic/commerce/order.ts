import type { AgenticConfig } from "@/lib/agentic/config";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { expireCheckoutIfDue, orderPollView } from "@/lib/agentic/commerce/state";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { getRetailOrderByAgenticOrderId } from "@/lib/retail-product-checkout";

export async function orderTool(input: Readonly<{
  config: AgenticConfig;
  locale?: string;
  now: string;
  orderHandle: string;
  scope: CapabilityScope;
  store: AgenticStore;
}>) {
  const capability = await resolveCapability({
    action: "order.read",
    config: input.config,
    handle: input.orderHandle,
    now: input.now,
    resourceType: "order",
    scope: input.scope,
    store: input.store
  });

  if (!capability) {
    return orderPollView({
      checkoutUrl: null,
      found: false,
      localeMessage: (key) => agenticMessage(negotiateLocale(input.locale), key),
      order: null
    });
  }

  const loaded = await input.store.getOrder(capability.resourceId);
  const order = await expireCheckoutIfDue({
    now: input.now,
    order: loaded,
    store: input.store
  });
  const locale = negotiateLocale(input.locale);
  const settlement =
    order &&
    (order.paymentStatus === "paid" ||
      order.paymentStatus === "refunded" ||
      order.paymentStatus === "partially_refunded")
      ? await getRetailOrderByAgenticOrderId(order.id)
      : null;
  const fulfilmentEvents = order
    ? await input.store.listFulfilmentEvents(order.id)
    : [];

  return orderPollView({
    checkoutUrl: order?.checkoutUrl ?? null,
    found: Boolean(order),
    fulfilmentEvents,
    localeMessage: (key) => agenticMessage(locale, key),
    order,
    retail: order && settlement
      ? {
          contributionMargin: settlement.contributionMargin ?? null,
          orderId: settlement.orderId,
          orderNumber: settlement.orderNumber,
          orderStatus: settlement.orderStatus,
          trackingUrl: `/${locale}/order/track/${encodeURIComponent(settlement.orderNumber)}`
        }
      : null
  });
}
