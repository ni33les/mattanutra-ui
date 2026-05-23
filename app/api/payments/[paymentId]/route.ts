import { NextResponse } from "next/server";
import {
  getPayment,
  markPaymentCancelled,
  markPaymentCheckoutOpened
} from "@/lib/stripe-payments";

export const runtime = "nodejs";

type PaymentRouteProps = Readonly<{
  params: Promise<{
    paymentId: string;
  }>;
}>;

export async function GET(
  _request: Request,
  { params }: PaymentRouteProps
) {
  const { paymentId } = await params;
  const payment = await getPayment(paymentId);

  if (!payment) {
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

  return NextResponse.json(payment, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(
  request: Request,
  { params }: PaymentRouteProps
) {
  const { paymentId } = await params;
  const payment = await markPaymentCheckoutOpened({ paymentId, request });

  if (!payment) {
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

  return NextResponse.json(payment, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function DELETE(
  request: Request,
  { params }: PaymentRouteProps
) {
  const { paymentId } = await params;
  const payment = await markPaymentCancelled({ paymentId, request });

  if (!payment) {
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

  return NextResponse.json(payment, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
