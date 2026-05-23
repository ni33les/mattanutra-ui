import { NextResponse } from "next/server";
import { completeMockPayment } from "@/lib/stripe-payments";

export const runtime = "nodejs";

type MockPaymentRouteProps = Readonly<{
  params: Promise<{
    paymentId: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: MockPaymentRouteProps
) {
  const { paymentId } = await params;

  try {
    const result = await completeMockPayment({ paymentId, request });

    if (!result) {
      return NextResponse.json(
        { message: "Payment not found" },
        {
          headers: {
            "Cache-Control": "no-store"
          },
          status: 404
        }
      );
    }

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to complete mock payment"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }
}
