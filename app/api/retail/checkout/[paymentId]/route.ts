import { NextResponse } from "next/server";
import { markRetailCheckoutOpened } from "@/lib/retail-product-checkout";

export const runtime = "nodejs";

type RetailCheckoutPaymentRouteProps = Readonly<{
  params: Promise<{ paymentId: string }>;
}>;

export async function POST(
  _request: Request,
  { params }: RetailCheckoutPaymentRouteProps
) {
  const { paymentId } = await params;
  const payment = await markRetailCheckoutOpened(paymentId);

  if (!payment) {
    return NextResponse.json(
      { message: "Payment not found" },
      { headers: { "Cache-Control": "no-store" }, status: 404 }
    );
  }

  return NextResponse.json(payment, {
    headers: { "Cache-Control": "no-store" }
  });
}
