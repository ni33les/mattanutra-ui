import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { isLocale } from "@/lib/i18n";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";
import { paymentCheckoutPath } from "@/lib/payment-paths";
import {
  completeMockPayment,
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

function isFormRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");

  return `${proto}://${host}`;
}

async function readFields(request: Request) {
  if (isFormRequest(request)) {
    const form = await request.formData();

    return {
      locale: form.get("locale"),
      plan: form.get("plan"),
      planId: form.get("planId"),
      sourceSurface: form.get("sourceSurface")
    };
  }

  try {
    return record(await request.json());
  } catch {
    return {};
  }
}

function redirectToCheckout(
  request: Request,
  input: Readonly<{
    locale: string;
    message: string;
    plan: string;
    planId: string;
    sourceSurface: string;
  }>
) {
  const locale = isLocale(input.locale) ? input.locale : "en";
  const selectedPlan = normalizePaymentPlan(input.plan) ?? "precision";
  const url = new URL(
    paymentCheckoutPath(locale, {
      plan: selectedPlan,
      planId: input.planId && isUuid(input.planId) ? input.planId : null,
      sourceSurface: normalizePaymentSourceSurface(input.sourceSurface)
    }),
    requestOrigin(request)
  );
  url.searchParams.set("error", input.message);

  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(
    request,
    publicRateLimits.mockPaymentComplete
  );
  const fields = await readFields(request);
  const localeValue = text(fields.locale);
  const planValue = text(fields.plan);
  const planId = text(fields.planId);
  const sourceSurface = normalizePaymentSourceSurface(fields.sourceSurface);
  const formPost = isFormRequest(request);

  if (limited) {
    if (formPost) {
      return redirectToCheckout(request, {
        locale: localeValue,
        message: "We could not open checkout at this time.",
        plan: planValue,
        planId,
        sourceSurface
      });
    }

    return limited;
  }

  const locale = isLocale(localeValue) ? localeValue : null;
  const selectedPlan = normalizePaymentPlan(planValue);

  if (!locale || !selectedPlan || (planId && !isUuid(planId))) {
    if (formPost) {
      return redirectToCheckout(request, {
        locale: localeValue,
        message: "Invalid checkout request",
        plan: planValue,
        planId,
        sourceSurface
      });
    }

    return NextResponse.json(
      { message: "Invalid checkout request" },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }

  try {
    const session = await createStripeCheckoutSession({
      locale,
      planId: planId || null,
      request,
      selectedPlan,
      sourceSurface
    });

    if (!session.mock || !session.paymentId) {
      throw new Error("Mock payment is only available in dev mock mode");
    }

    const result = await completeMockPayment({
      paymentId: session.paymentId,
      request
    });

    if (!result?.destination) {
      throw new Error("Unable to complete mock payment");
    }

    if (formPost) {
      return NextResponse.redirect(
        new URL(result.destination, requestOrigin(request)),
        303
      );
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not open checkout at this time.";

    if (formPost) {
      return redirectToCheckout(request, {
        locale,
        message,
        plan: selectedPlan,
        planId,
        sourceSurface
      });
    }

    return NextResponse.json(
      { message },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }
}
