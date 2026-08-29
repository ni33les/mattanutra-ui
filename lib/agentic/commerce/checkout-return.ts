import { hashCapability } from "@/lib/agentic/capabilities";
import { lookupRetailOrderForAgentic } from "@/lib/agentic/commerce/retail-join";
import type { AgenticRuntime } from "@/lib/agentic/runtime";
import { isLocale, type Locale } from "@/lib/i18n";
import { applyPaidAgenticStripeSession } from "@/lib/agentic/commerce/stripe-adapter";

export function mcpOrderTrackSuccessPath(locale: string) {
  const safe: Locale = isLocale(locale) ? locale : "en";
  return `/${safe}/order/track`;
}

export function withFromMcp(path: string) {
  if (/[?&]from=/.test(path)) {
    return path;
  }

  return path.includes("?") ? `${path}&from=mcp` : `${path}?from=mcp`;
}

export async function resolveAgenticPaidTrackingPath(input: Readonly<{
  checkoutAccess: string;
  locale: string;
  runtime: AgenticRuntime;
  sessionId?: string;
}>): Promise<string | null> {
  const locale: Locale = isLocale(input.locale) ? input.locale : "en";
  const checkout = await input.runtime.store.getCheckoutByAccessHash(
    hashCapability(input.runtime.config.capabilitySecret, input.checkoutAccess)
  );

  if (!checkout) {
    return null;
  }

  let order = await input.runtime.store.getOrder(checkout.orderId);

  if (!order) {
    return null;
  }

  if (
    input.sessionId &&
    input.runtime.config.paymentProvider === "stripe_test" &&
    order.paymentStatus !== "paid"
  ) {
    const applied = await applyPaidAgenticStripeSession({
      order,
      runtime: input.runtime,
      sessionId: input.sessionId
    });
    order = applied ?? order;
  }

  if (order.paymentStatus !== "paid") {
    return null;
  }

  const existing = await lookupRetailOrderForAgentic(order.id);
  const trackingUrl = existing?.trackingUrl;

  if (!trackingUrl) {
    return withFromMcp(
      `/${locale}/order/track/${encodeURIComponent(order.reference)}`
    );
  }

  const path = trackingUrl.replace(/^\/en(?=\/)/, `/${locale}`);
  return withFromMcp(path.startsWith("/") ? path : `/${path}`);
}
