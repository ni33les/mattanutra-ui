import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";

export type PaymentSourceSurface = "healthscore" | "landing";

export function paymentReturnPath(locale: Locale, sessionId?: string) {
  const params = new URLSearchParams();

  if (sessionId) {
    params.set("session_id", sessionId);
  }

  return `/${locale}/nutrition/payment/return${params.size ? `?${params}` : ""}`;
}

export function paymentCheckoutPath(
  locale: Locale,
  input: Readonly<{
    plan: AssessmentPlan;
    planId?: string | null;
    sourceSurface?: PaymentSourceSurface;
  }>
) {
  const params = new URLSearchParams({
    plan: input.plan,
    source: input.sourceSurface ?? "landing"
  });

  if (input.planId) {
    params.set("planId", input.planId);
  }

  return `/${locale}/nutrition/payment/checkout?${params}`;
}
