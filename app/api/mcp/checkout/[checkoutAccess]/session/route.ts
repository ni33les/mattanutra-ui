import { NextResponse } from "next/server";
import { getLiveAgenticRuntime } from "@/lib/agentic/live-runtime";
import { nowIso } from "@/lib/agentic/runtime";
import { hashCapability } from "@/lib/agentic/capabilities";
import { parseCheckoutAddress } from "@/lib/agentic/checkout-address";
import { createAgenticStripeCheckoutSession } from "@/lib/agentic/commerce/stripe-adapter";
import { enforceRateLimit } from "@/lib/rate-limit";
import { asMinor } from "@/lib/agentic/money";
import { stripePublishableKey } from "@/lib/stripe-payments";
import { isLocale } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = Readonly<{
  params: Promise<{ checkoutAccess: string }>;
}>;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request, { params }: RouteProps) {
  const limited = enforceRateLimit(request, {
    limit: 10,
    name: "mcp-checkout-session",
    windowMs: 60_000
  });

  if (limited) {
    return limited;
  }

  const { checkoutAccess } = await params;
  const runtime = getLiveAgenticRuntime(request);

  if (runtime.config.paymentProvider !== "stripe_test") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  let body: Record<string, unknown> = {};

  try {
    body = record(await request.json());
  } catch {
    body = {};
  }

  if (typeof body.scenario === "string" && body.scenario.trim() !== "") {
    return NextResponse.json(
      { message: "Stripe Test Mode does not accept mock payment scenarios." },
      { status: 400 }
    );
  }

  const checkout = await runtime.store.getCheckoutByAccessHash(
    hashCapability(runtime.config.capabilitySecret, checkoutAccess)
  );

  if (!checkout) {
    return NextResponse.json({ message: "Checkout not found." }, { status: 404 });
  }

  const order = await runtime.store.getOrder(checkout.orderId);

  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  if (order.orderStatus === "cancelled") {
    return NextResponse.json({ message: "Checkout cancelled." }, { status: 409 });
  }

  if (checkout.expiresAt <= nowIso() || order.orderStatus === "expired") {
    return NextResponse.json({ message: "Checkout expired." }, { status: 409 });
  }

  if (order.paymentStatus === "paid") {
    return NextResponse.json({ message: "Payment is already confirmed." }, { status: 409 });
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

  await runtime.store.updateCheckout({
    ...checkout,
    encryptedAddress: JSON.stringify({
      address: parsed.address,
      agentAuthorized: true
    })
  });

  const locale = isLocale(body.locale) ? body.locale : "en";
  const session = await createAgenticStripeCheckoutSession({
    checkoutAccess,
    customerEmail: parsed.address.customerEmail,
    customerName: parsed.address.customerName,
    locale,
    orderId: order.id,
    runtime,
    totalPriceMinor: asMinor(order.totalPriceMinor)
  });

  return NextResponse.json(
    {
      clientSecret: session.clientSecret,
      ok: true,
      publishableKey: stripePublishableKey(),
      sessionId: session.sessionId
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
