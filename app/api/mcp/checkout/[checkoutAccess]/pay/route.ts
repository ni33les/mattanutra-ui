import { NextResponse } from "next/server";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import { nowIso } from "@/lib/agentic/runtime";
import { hashCapability } from "@/lib/agentic/capabilities";
import { parseCheckoutAddress } from "@/lib/agentic/checkout-address";
import { mockEventForScenario } from "@/lib/agentic/commerce/payment";
import { applyVerifiedPaymentEvent } from "@/lib/agentic/commerce/state";
import { processOmsOutbox } from "@/lib/agentic/retail/mock-thailand";
import { isPaymentScenario, scenarioSubmitsOms } from "@/lib/agentic/qa/simulate";
import { joinMcpPaidOrderToRetail } from "@/lib/agentic/commerce/retail-join";
import { resolveAgenticPaidTrackingPath } from "@/lib/agentic/commerce/checkout-return";
import { createAgenticStripeCheckoutSession } from "@/lib/agentic/commerce/stripe-adapter";
import { enforceRateLimit } from "@/lib/rate-limit";
import { asMinor } from "@/lib/agentic/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = Readonly<{
  params: Promise<{ checkoutAccess: string }>;
}>;

export async function POST(request: Request, { params }: RouteProps) {
  const limited = enforceRateLimit(request, {
    limit: 10,
    name: "mcp-checkout-pay",
    windowMs: 60_000
  });

  if (limited) {
    return limited;
  }

  const { checkoutAccess } = await params;
  const runtime = getLiveAgenticRuntime(request);

  if (
    runtime.config.paymentProvider !== "mock" &&
    runtime.config.paymentProvider !== "stripe_test"
  ) {
    return NextResponse.json({ message: "Checkout pay is unavailable." }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const formPosted = contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
  let body: Record<string, unknown> = {};
  let returnTo = "";

  if (formPosted) {
    const form = await request.formData();
    returnTo = String(form.get("returnTo") ?? "");
    const postedScenario = form.get("scenario");
    body = {
      address: {
        addressLine1: String(form.get("addressLine1") ?? ""),
        addressLine2: String(form.get("addressLine2") ?? ""),
        city: String(form.get("city") ?? ""),
        country: String(form.get("country") ?? ""),
        customerEmail: String(form.get("customerEmail") ?? ""),
        customerName: String(form.get("customerName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        postalCode: String(form.get("postalCode") ?? ""),
        province: String(form.get("province") ?? "")
      },
      agentAuthorized:
        form.get("agentAuthorized") === "true" || form.get("agentAuthorized") === "on",
      ...(typeof postedScenario === "string" && postedScenario.trim() !== ""
        ? { scenario: postedScenario.trim() }
        : {})
    };
  } else {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const checkout = await runtime.store.getCheckoutByAccessHash(
    hashCapability(runtime.config.capabilitySecret, checkoutAccess)
  );

  if (!checkout) {
    return NextResponse.json({ message: "Checkout not found." }, { status: 404 });
  }

  const order = await runtime.store.getOrder(checkout.orderId);

  if (!order?.providerSessionId) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  const postedScenarioValue =
    typeof (body as { scenario?: unknown }).scenario === "string"
      ? String((body as { scenario?: unknown }).scenario).trim()
      : "";
  const requestedScenarioEarly = postedScenarioValue || "success";
  const refundScenario =
    requestedScenarioEarly === "refund" || requestedScenarioEarly === "partial_refund";

  if (order.orderStatus === "cancelled") {
    return NextResponse.json({ message: "Checkout cancelled." }, { status: 409 });
  }

  if (
    !refundScenario &&
    (checkout.expiresAt <= nowIso() || order.orderStatus === "expired")
  ) {
    return NextResponse.json({ message: "Checkout expired." }, { status: 409 });
  }

  if (refundScenario && order.paymentStatus !== "paid" && order.paymentStatus !== "refunded") {
    return NextResponse.json(
      { message: "Refund fixtures require a paid checkout." },
      { status: 409 }
    );
  }

  if (body.agentAuthorized !== true) {
    return NextResponse.json(
      { message: "AI-agent authorization is required." },
      { status: 400 }
    );
  }

  const parsed = parseCheckoutAddress(body.address, order.destinationCountry);

  if ("error" in parsed) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const now = nowIso();
  await runtime.store.updateCheckout({
    ...checkout,
    encryptedAddress: JSON.stringify({
      address: parsed.address,
      agentAuthorized: true
    })
  });

  if (runtime.config.paymentProvider === "stripe_test") {
    if (postedScenarioValue) {
      return NextResponse.json(
        { message: "Stripe Test Mode does not accept mock payment scenarios." },
        { status: 400 }
      );
    }

    const session = await createAgenticStripeCheckoutSession({
      checkoutAccess,
      customerEmail: parsed.address.customerEmail,
      customerName: parsed.address.customerName,
      locale: "en",
      orderId: order.id,
      runtime,
      totalPriceMinor: asMinor(order.totalPriceMinor)
    });

    return NextResponse.json(
      { clientSecret: session.clientSecret, ok: true, sessionId: session.sessionId },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const requestedScenario = body.scenario ?? "success";
  if (!isPaymentScenario(requestedScenario)) {
    return NextResponse.json({ message: "Unknown test scenario." }, { status: 400 });
  }

  const event = mockEventForScenario({
    amountMinor: asMinor(order.totalPriceMinor),
    currency: order.currency,
    orderId: order.id,
    providerSessionId: order.providerSessionId,
    scenario: requestedScenario
  });

  await applyVerifiedPaymentEvent({
    event,
    now,
    store: runtime.store
  });

  if (requestedScenario === "processing_then_success") {
    await applyVerifiedPaymentEvent({
      event: {
        ...event,
        providerEventId: `${event.providerEventId}_success`,
        status: "succeeded"
      },
      now,
      store: runtime.store
    });
  }

  const paidForRetail = await runtime.store.getOrder(order.id);

  if (paidForRetail?.paymentStatus === "paid") {
    await joinMcpPaidOrderToRetail({
      now,
      order: paidForRetail,
      request,
      store: runtime.store
    });
  }

  if (scenarioSubmitsOms(requestedScenario)) {
    await processOmsOutbox({ now, store: runtime.store });
  }

  const paid = await runtime.store.getOrder(order.id);
  const result = {
    latestPaymentAttempt: paid?.latestPaymentAttempt ?? null,
    latestPaymentReason: paid?.latestPaymentReason ?? null,
    ok: true as const,
    orderReference: paid?.reference,
    orderStatus: paid?.orderStatus,
    paymentStatus: paid?.paymentStatus,
    stateVersion: paid?.stateVersion
  };

  if (formPosted) {
    if (paid?.paymentStatus === "paid") {
      const localeMatch = returnTo.match(/\/(en|th|zh-CN)\//);
      const tracking = await resolveAgenticPaidTrackingPath({
        checkoutAccess,
        locale: localeMatch?.[1] ?? "en",
        runtime
      });

      if (tracking) {
        return NextResponse.redirect(new URL(tracking, runtime.config.siteUrl), 303);
      }
    }

    const target = new URL(
      returnTo.startsWith("/") ? returnTo : `/en/mcp/checkout/${checkoutAccess}`,
      runtime.config.siteUrl
    );
    target.searchParams.set("paymentStatus", String(result.paymentStatus ?? ""));
    target.searchParams.set("attempt", String(result.latestPaymentAttempt ?? ""));
    target.searchParams.set("reason", String(result.latestPaymentReason ?? ""));
    target.searchParams.set("stateVersion", String(result.stateVersion ?? ""));
    return NextResponse.redirect(target, 303);
  }

  return NextResponse.json(result);
}
