import { hashCapability } from "@/lib/agentic/capabilities";
import { loadAgenticCheckoutProducts } from "@/lib/agentic/commerce/checkout-products";
import { lookupRetailOrderForAgentic } from "@/lib/agentic/commerce/retail-join";
import type { PaymentProviderMode } from "@/lib/agentic/config";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import {
  DEFAULT_SHIPPING_MINOR,
  DEFAULT_TAX_MINOR,
  asMinor,
  asMinorOr
} from "@/lib/agentic/money";
import { isUuid, parsePublicId } from "@/lib/agentic/contract/ids";
import type { Locale } from "@/lib/i18n";
import type { ProductBasketProduct, ProductBasketQuotePreview } from "@/components/retail-checkout/product-basket-types";
import type { RetailCheckoutFrozenLine } from "@/lib/retail-product-checkout";

export type AgenticCheckoutItem = Readonly<{
  dailyPills: number;
  form: string;
  lineTotalMinor: number;
  productName: string;
  quantity: number;
}>;

export type AgenticBasketCheckout = Readonly<{
  agenticOrderId: string;
  currency: string;
  destinationCountry: string;
  expired: boolean;
  frozenLines: readonly RetailCheckoutFrozenLine[];
  items: readonly AgenticCheckoutItem[];
  orderReference: string;
  paid: boolean;
  paymentProvider: PaymentProviderMode;
  planId: string;
  quotePreview: ProductBasketQuotePreview;
  refundable: boolean;
  selectedItemIds: readonly string[];
  selectedProducts: readonly ProductBasketProduct[];
  selectedRetailerOrganisationId: string | null;
  shippingAmount: number;
  shippingMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalPriceMinor: number;
  trackingPath: string | null;
}>;

function productUuid(productId: string) {
  return parsePublicId(productId, "prd_") ?? (isUuid(productId) ? productId : null);
}

function majorFromMinor(minor: unknown) {
  return asMinorOr(minor, 0) / 100;
}

export async function loadAgenticBasketCheckout(input: Readonly<{
  checkoutAccess: string;
  locale: Locale;
}>): Promise<AgenticBasketCheckout | null> {
  if (!input.checkoutAccess || input.checkoutAccess.length < 32) {
    return null;
  }

  const runtime = getLiveAgenticRuntime();
  const checkout = await runtime.store.getCheckoutByAccessHash(
    hashCapability(runtime.config.capabilitySecret, input.checkoutAccess)
  );

  if (!checkout) {
    return null;
  }

  const order = await runtime.store.getOrder(checkout.orderId);
  const items = await runtime.store.getOrderItems(checkout.orderId);

  if (!order || items.length < 1 || !isUuid(order.planId)) {
    return null;
  }

  const frozen =
    order.frozenPlan && typeof order.frozenPlan === "object"
      ? (order.frozenPlan as Record<string, unknown>)
      : {};
  const shippingMinor = asMinorOr(
    checkout.shippingMinor ?? frozen.shippingMinor,
    DEFAULT_SHIPPING_MINOR
  );
  const taxMinor = asMinorOr(checkout.taxMinor ?? frozen.taxMinor, DEFAULT_TAX_MINOR);
  const subtotalMinor = asMinorOr(
    frozen.subtotalMinor,
    asMinor(order.totalPriceMinor)
  );
  const totalPriceMinor = asMinorOr(
    frozen.totalPriceMinor,
    asMinor(order.totalPriceMinor)
  );
  const shippingAmount = majorFromMinor(shippingMinor);
  const subtotalAmount = majorFromMinor(subtotalMinor);
  const totalAmount = majorFromMinor(totalPriceMinor);
  const products = await loadAgenticCheckoutProducts(items, input.locale);
  const selectedProducts = products.map((product) => ({
    currency: order.currency,
    id: product.id,
    imageUrl: product.imageUrl,
    name: product.name,
    unitPriceAmount: majorFromMinor(product.unitPriceMinor)
  }));
  const selectedItemIds = selectedProducts
    .map((product) => productUuid(product.id) ?? product.id)
    .filter(Boolean);
  const frozenLines: RetailCheckoutFrozenLine[] = items.map((item, index) => {
    const product = selectedProducts[index];
    return {
      productId: product?.id ?? productUuid(item.productId) ?? item.productId,
      productName: product?.name || item.productName,
      quantity: item.quantity,
      retailerSku: item.retailerSku,
      unitPriceAmount:
        product?.unitPriceAmount ?? majorFromMinor(item.unitPriceMinor)
    };
  });
  const paid = order.paymentStatus === "paid";
  const expired =
    checkout.expiresAt <= new Date().toISOString() || order.orderStatus === "expired";
  const retail = paid ? await lookupRetailOrderForAgentic(order.id) : null;
  const retailerOrganisationId =
    items[0]?.sellerId && isUuid(items[0].sellerId) ? items[0].sellerId : null;

  return {
    agenticOrderId: order.id,
    currency: order.currency,
    destinationCountry: order.destinationCountry || "TH",
    expired,
    frozenLines,
    items: items.map((item) => ({
      dailyPills: item.dailyPills,
      form: item.form,
      lineTotalMinor: item.lineTotalMinor,
      productName: item.productName,
      quantity: item.quantity
    })),
    orderReference: order.reference,
    paid,
    paymentProvider: runtime.config.paymentProvider,
    planId: order.planId,
    quotePreview: {
      canCheckout: !paid && !expired && order.orderStatus === "open",
      currency: order.currency,
      etaDate: null,
      lines: frozenLines.map((line) => ({
        availabilityStatus: "available",
        currency: order.currency,
        etaDate: null,
        payable: true,
        productId: line.productId,
        quantityRequested: line.quantity,
        reason: "",
        selectedRetailerName: items[0]?.sellerName ?? null,
        unitPriceAmount: line.unitPriceAmount
      })),
      selectedRetailer: retailerOrganisationId
        ? {
            organisationId: retailerOrganisationId,
            organisationName: items[0]?.sellerName ?? "Pharmacy"
          }
        : null,
      shippingAmount,
      shippingSource: "mcp",
      subtotalAmount,
      totalAmount: totalAmount || subtotalAmount + shippingAmount,
      unavailableLines: []
    },
    refundable:
      paid ||
      order.paymentStatus === "refunded" ||
      order.paymentStatus === "partially_refunded",
    selectedItemIds,
    selectedProducts,
    selectedRetailerOrganisationId: retailerOrganisationId,
    shippingAmount,
    shippingMinor,
    subtotalMinor,
    taxMinor,
    totalPriceMinor,
    trackingPath: retail
      ? `/${input.locale}/order/track/${encodeURIComponent(retail.orderNumber)}`
      : paid
        ? `/${input.locale}/order/track/${encodeURIComponent(order.reference)}`
        : null
  };
}
