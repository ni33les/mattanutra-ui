import type { AgenticConfig } from "@/lib/agentic/config";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { orderPollView } from "@/lib/agentic/commerce/state";
import type { AgenticStore } from "@/lib/agentic/store/types";

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

  const order = await input.store.getOrder(capability.resourceId);
  const locale = negotiateLocale(input.locale);
  const link =
    order?.paymentStatus === "paid" ||
    order?.paymentStatus === "refunded" ||
    order?.paymentStatus === "partially_refunded"
      ? await input.store.getRetailLink(order.id)
      : null;
  const orderNumber =
    link && !link.retailerReference.startsWith("th-mock-") ? link.retailerReference : null;

  return orderPollView({
    checkoutUrl: order?.checkoutUrl ?? null,
    found: Boolean(order),
    localeMessage: (key) => agenticMessage(locale, key),
    order,
    retail: orderNumber
      ? {
          orderId: order.id,
          orderNumber,
          orderStatus: order.fulfilmentStatus,
          trackingUrl: `/${locale}/order/track/${encodeURIComponent(orderNumber)}`
        }
      : null
  });
}
