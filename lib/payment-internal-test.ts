import type Stripe from "stripe";

/** Stored JSON uses booleans; Stripe metadata represents the same flag as a string. */
export function isInternalTestMetadata(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = (value as Record<string, unknown>).internal_test;
  return marker === true || marker === "true" || marker === 1 || marker === "1";
}

/** Only copy the explicit test marker from trusted provider evidence. Never clear a saved marker. */
export function stripeInternalTestMetadata(session: Pick<Stripe.Checkout.Session, "metadata" | "payment_intent">): { internal_test?: true } {
  const intent = session.payment_intent;
  return isInternalTestMetadata(session.metadata) || (intent && typeof intent === "object" && isInternalTestMetadata(intent.metadata))
    ? { internal_test: true }
    : {};
}
