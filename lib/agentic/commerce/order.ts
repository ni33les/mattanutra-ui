import type { AgenticConfig } from "@/lib/agentic/config";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { orderPollView } from "@/lib/agentic/commerce/state";
import { lookupRetailOrderForAgentic } from "@/lib/agentic/commerce/retail-join";
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
  const retail = order ? await lookupRetailOrderForAgentic(order.id) : null;

  return orderPollView({
    checkoutUrl: order?.checkoutUrl ?? null,
    found: Boolean(order),
    localeMessage: (key) => agenticMessage(locale, key),
    order,
    retail: retail
      ? {
          orderId: retail.orderId,
          orderNumber: retail.orderNumber,
          orderStatus: retail.orderStatus,
          trackingUrl: `/${locale}/order/track/${encodeURIComponent(retail.orderNumber)}`
        }
      : null
  });
}
