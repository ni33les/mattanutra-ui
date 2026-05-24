import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { isLocale } from "@/lib/i18n";
import {
  createStripeCheckoutSession,
  normalizePaymentPlan,
  normalizePaymentSourceSurface
} from "@/lib/stripe-payments";

export const runtime = "nodejs";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};

  try {
    body = record(await request.json());
  } catch {
    body = {};
  }

  const locale = isLocale(body.locale) ? body.locale : null;
  const selectedPlan = normalizePaymentPlan(body.plan);
  const planId = text(body.planId);

  if (!locale || !selectedPlan || (planId && !isUuid(planId))) {
    console.warn("Invalid Stripe checkout session request", {
      hasLocale: Boolean(locale),
      hasPlan: Boolean(selectedPlan),
      hasValidPlanId: !planId || isUuid(planId)
    });

    return NextResponse.json(
      { message: "Invalid checkout request" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    console.info("Stripe checkout session requested", {
      hasPlanId: Boolean(planId),
      locale,
      selectedPlan,
      sourceSurface: normalizePaymentSourceSurface(body.sourceSurface)
    });

    const session = await createStripeCheckoutSession({
      locale,
      planId: planId || null,
      request,
      selectedPlan,
      sourceSurface: normalizePaymentSourceSurface(body.sourceSurface)
    });

    return NextResponse.json(session, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Unable to create Stripe checkout session", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create checkout session"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
