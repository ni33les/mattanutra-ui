import type { Locale } from "@/lib/i18n";
import { nutritionProgressPath, nutritionQuizPath } from "@/lib/nutrition-paths";
import { paymentReturnPath } from "@/lib/payment-paths";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only a response for this payment may advance checkout. Never trust the Stripe callback alone. */
export function confirmedPaymentDestination(value: unknown, paymentId: string, locale: Locale): string | null {
  if (!value || typeof value !== "object" || !uuid.test(paymentId)) return null;
  const payment = value as Record<string, unknown>;
  if (payment.id !== paymentId) return null;
  const paid = payment.status === "paid" || payment.status === "bound"
    || (typeof payment.paidAt === "string" && Number.isFinite(Date.parse(payment.paidAt)));
  if (!paid) return null;

  // The existing return page also recovers pending/failed fulfillment before opening the plan.
  if (typeof payment.stripeCheckoutSessionId === "string"
    && /^(?:cs_(?:test|live)_|mock_cs_)[A-Za-z0-9_-]{1,240}$/.test(payment.stripeCheckoutSessionId)) {
    return paymentReturnPath(locale, payment.stripeCheckoutSessionId);
  }
  if (typeof payment.planId === "string" && uuid.test(payment.planId)) return nutritionProgressPath(locale, payment.planId);
  return nutritionQuizPath(locale, undefined, { payment: paymentId });
}
