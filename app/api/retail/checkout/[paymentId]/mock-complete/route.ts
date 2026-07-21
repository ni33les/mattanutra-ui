import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";
import { completeMockRetailCheckout } from "@/lib/retail-product-checkout";

export const runtime = "nodejs";

type RetailCheckoutMockRouteProps = Readonly<{
  params: Promise<{ paymentId: string }>;
}>;

export async function POST(
  request: Request,
  { params }: RetailCheckoutMockRouteProps
) {
  const limited = enforceRateLimit(
    request,
    publicRateLimits.mockPaymentComplete
  );

  if (limited) {
    return limited;
  }

  const { paymentId } = await params;

  try {
    const result = await completeMockRetailCheckout({ paymentId, request });

    if (!result) {
      return NextResponse.json(
        { message: "Payment not found" },
        { headers: { "Cache-Control": "no-store" }, status: 404 }
      );
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to complete mock basket payment"
      },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }
}
