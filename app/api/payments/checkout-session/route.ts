import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { queuePlatformAdminCommunication } from "@/lib/communications";
import { isLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";
import {
  createStripeCheckoutSession,
  normalizePaymentPlan,
  normalizePaymentSourceSurface
} from "@/lib/stripe-payments";

export const runtime = "nodejs";

const log = createLogger("api.payments.checkout-session");

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.checkoutSession);

  if (limited) {
    return limited;
  }

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
    log.warn("Invalid Stripe checkout session request", {
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
    log.info("Stripe checkout session requested", {
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
    log.error("Unable to create Stripe checkout session", { error });
    try {
      await queuePlatformAdminCommunication({
        eventKey: "platform_checkout_failed",
        metadata: {
          errorMessage:
            error instanceof Error ? error.message : "Unable to create checkout session",
          hasPlanId: Boolean(planId),
          locale,
          selectedPlan,
          source: "plan_checkout_session_api",
          sourceSurface: normalizePaymentSourceSurface(body.sourceSurface)
        },
        resourceId: isUuid(planId) ? planId : null,
        resourceType: isUuid(planId) ? "assessment_plan" : "checkout_session_request"
      });
    } catch (notificationError) {
      log.warn("Unable to queue platform checkout failure notification", {
        error: notificationError
      });
    }

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
