import { NextResponse } from "next/server";
import { getAgenticRuntime, nowIso } from "@/lib/agentic/runtime";
import { hashCapability } from "@/lib/agentic/capabilities";
import { mockEventForScenario } from "@/lib/agentic/commerce/payment";
import { applyVerifiedPaymentEvent } from "@/lib/agentic/commerce/state";
import { processOmsOutbox } from "@/lib/agentic/retail/mock-thailand";
import { enforceRateLimit } from "@/lib/rate-limit";

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
  const runtime = getAgenticRuntime(request);

  if (runtime.config.paymentProvider !== "mock") {
    return NextResponse.json({ message: "Mock pay is DEV only." }, { status: 404 });
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

  if (checkout.expiresAt <= nowIso() || order.orderStatus === "expired") {
    return NextResponse.json({ message: "Checkout expired." }, { status: 409 });
  }

  const now = nowIso();
  await applyVerifiedPaymentEvent({
    event: mockEventForScenario({
      amountMinor: order.totalPriceMinor,
      currency: order.currency,
      orderId: order.id,
      providerSessionId: order.providerSessionId,
      scenario: "success"
    }),
    now,
    store: runtime.store
  });
  await processOmsOutbox({ now, store: runtime.store });

  const paid = await runtime.store.getOrder(order.id);

  return NextResponse.json({
    ok: true,
    orderReference: paid?.reference,
    paymentStatus: paid?.paymentStatus
  });
}
