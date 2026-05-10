import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import {
  normalizeCommunicationChannelType,
  upsertCommunicationChannel
} from "@/lib/communications";
import { getSql } from "@/lib/db";
import { validateLeadEmail } from "@/lib/email-validation";

export const runtime = "nodejs";

type CommunicationChannelRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

const CUSTOMER_CHANNEL_TYPES = new Set([
  "email",
  "line",
  "telegram",
  "whatsapp"
]);

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store"
    },
    status
  });
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function channelPreferenceRank(channelType: string) {
  return channelType === "email" ? 80 : 10;
}

function validateAddress(channelType: string, address: string) {
  if (channelType === "email") {
    const email = validateLeadEmail(address);

    return email.ok ? email.email : null;
  }

  if (address.length < 2 || address.length > 128) {
    return null;
  }

  return address;
}

export async function POST(
  request: Request,
  { params }: CommunicationChannelRouteProps
) {
  const { planId } = await params;

  if (!isUuid(planId)) {
    return noStoreJson({ message: "Plan not found" }, 404);
  }

  const body = objectValue(await request.json().catch(() => ({})));
  const channelType = normalizeCommunicationChannelType(body.channelType);
  const rawAddress = textValue(body.address);

  if (!channelType || !CUSTOMER_CHANNEL_TYPES.has(channelType)) {
    return noStoreJson({ message: "Choose a supported channel" }, 400);
  }

  const address = validateAddress(channelType, rawAddress);

  if (!address) {
    return noStoreJson({ message: "Enter a valid contact detail" }, 400);
  }

  const sql = getSql();

  if (!sql) {
    return noStoreJson({ message: "Service unavailable" }, 503);
  }

  const assessment = await sql<{ plan_id: string }[]>`
    select plan_id::text
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;

  if (!assessment[0]) {
    return noStoreJson({ message: "Plan not found" }, 404);
  }

  try {
    const channel = await upsertCommunicationChannel({
      address,
      actorType: "human",
      channelType,
      displayName:
        channelType === "email"
          ? "Email"
          : channelType.charAt(0).toUpperCase() + channelType.slice(1),
      metadata: {
        source: "customer_safety_review_capture"
      },
      planId,
      preferenceRank: channelPreferenceRank(channelType),
      status: "active"
    });

    await writeBpmEvent({
      actorType: "visitor",
      eventName: "communication_channel_captured",
      eventStatus: "succeeded",
      eventType: channelType === "email" ? "email" : "chat",
      planId,
      properties: {
        channelId: channel.id,
        channelType,
        source: "safety_review_panel"
      }
    });

    return noStoreJson({
      channel: {
        channelType: channel.channelType,
        id: channel.id,
        status: channel.status
      }
    });
  } catch (error) {
    await writeBpmEvent({
      actorType: "visitor",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Communication channel capture failed",
      eventName: "communication_channel_capture_failed",
      eventStatus: "failed",
      eventType: "error",
      planId,
      properties: {
        channelType,
        source: "safety_review_panel"
      },
      severity: "medium"
    });

    return noStoreJson({ message: "Could not save contact details" }, 400);
  }
}
