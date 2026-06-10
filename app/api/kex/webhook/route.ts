import { NextResponse } from "next/server";
import { parseKexWebhookPayload } from "@/lib/kex-carrier-adapter";
import {
  recordKexShipmentEvent,
  verifyKexWebhookSignature
} from "@/lib/retail-carrier-shipments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get("x-kex-signature") ??
    request.headers.get("x-kerry-signature") ??
    request.headers.get("x-signature");

  if (!verifyKexWebhookSignature({ body, signature })) {
    return NextResponse.json({ message: "Invalid KEX signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(body || "{}") as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid KEX payload" }, { status: 400 });
  }

  const eventIds: string[] = [];

  for (const event of parseKexWebhookPayload(payload)) {
    const eventId = await recordKexShipmentEvent({
      ...event
    });

    if (eventId) {
      eventIds.push(eventId);
    }
  }

  return NextResponse.json({
    accepted: true,
    eventIds,
    res: {
      status: {
        status_code: "000",
        status_desc: "Successful"
      }
    }
  });
}
