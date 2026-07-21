import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  handleStripeWebhookPayload,
  normalizeStripeWebhookPayloadShape
} from "@/lib/stripe-payments";

export const runtime = "nodejs";

const log = createLogger("api.stripe.webhook");

type StripeWebhookRouteProps = Readonly<{
  params: Promise<{
    payloadShape: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: StripeWebhookRouteProps
) {
  const { payloadShape: rawPayloadShape } = await params;
  const payloadShape = normalizeStripeWebhookPayloadShape(rawPayloadShape);

  if (!payloadShape) {
    return NextResponse.json(
      { message: "Unknown Stripe webhook payload shape" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const result = await handleStripeWebhookPayload({
      payload,
      payloadShape,
      request,
      signature
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    log.error("Stripe webhook failed", { error, payloadShape });

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Stripe webhook failed"
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
