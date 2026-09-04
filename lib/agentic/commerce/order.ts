import type { AgenticConfig } from "@/lib/agentic/config";
import { resolveCapability, type CapabilityScope } from "@/lib/agentic/capabilities";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { expireCheckoutIfDue, orderPollView } from "@/lib/agentic/commerce/state";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { getRetailOrderByAgenticOrderId } from "@/lib/retail-product-checkout";
import { buildOrderProjection } from "@/lib/agentic/commerce/timeline";
import { responsibilitySnapshot } from "@/lib/agentic/responsibility/matrix";
import { contributionFromFrozen } from "@/lib/agentic/funnel/events";
import {
  funnelAttribution,
  listFunnelEvents,
  loadPersistedFunnelEvents
} from "@/lib/agentic/funnel/ledger";

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
  const paymentAttempts = order
    ? await input.store.listPaymentAttempts(order.id)
    : [];
  const items = order ? await input.store.getOrderItems(order.id) : [];
  const projection = order
    ? buildOrderProjection({
        fulfilment: fulfilmentEvents,
        items,
        order,
        paymentAttempts
      })
    : null;
  if (order) {
    await loadPersistedFunnelEvents(order.planId);
  }
  const attribution = order ? funnelAttribution(order.planId) : "unattributed";
  const funnel = order ? listFunnelEvents(order.planId) : [];
  void funnel;
  const paid = Boolean(order && order.paymentStatus === "paid");
  const frozen = order
    ? contributionFromFrozen({ frozen: order.frozenPlan, paid })
    : null;
  const productCostMinor = frozen?.productCostMinor ?? items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const paymentFeeMinor = frozen?.paymentFeeMinor ?? 0;
  const shippingSubsidyMinor = frozen?.shippingSubsidyMinor ?? 0;
  const paymentMinor = frozen?.paymentMinor ?? order?.totalPriceMinor ?? 0;
  const acquisitionMinor = frozen?.acquisitionMinor ?? 0;
  const contribution = frozen?.contributionMinor ?? null;

  const view = orderPollView({
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

  if (!order || !projection || !("ok" in view) || view.ok !== true) {
    return view;
  }

  return {
    ...view,
    acquisitionMinor,
    attribution: frozen?.attribution ?? attribution,
    contributionMinor: contribution,
    events: projection.events,
    money: projection.money,
    paymentFeeMinor,
    paymentMinor,
    productCostMinor,
    responsibility: responsibilitySnapshot(locale),
    shippingSubsidyMinor,
    timeline: projection.timeline
  };
}
