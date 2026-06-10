import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  consumeCustomerLineConnectCode,
  consumeOrganisationLineConnectCode,
  recordInboundLineCommunication
} from "@/lib/communications";
import { getSql } from "@/lib/db";
import { formatOutboundLineMessage } from "@/lib/line-message-format";
import { appendPlanChatMessage } from "@/lib/plan-concierge";
import { enqueuePanyaCustomerChatReplyTask } from "@/lib/task-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function verifyLineSignature(body: string, signature: string | null) {
  const secret = process.env.LINE_CHANNEL_SECRET?.trim();

  if (!secret || !signature) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(body).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

function lineSource(event: Record<string, unknown>): {
  recipientId: string;
  sourceType: "group" | "room" | "user";
} {
  const source = objectValue(event.source);
  const type: "group" | "room" | "user" =
    source.type === "group" || source.type === "room" ? source.type : "user";
  const recipientId =
    type === "group"
      ? text(source.groupId)
      : type === "room"
        ? text(source.roomId)
        : text(source.userId);

  return {
    recipientId,
    sourceType: type
  };
}

function lineTextMessage(event: Record<string, unknown>) {
  const message = objectValue(event.message);

  return message.type === "text" ? text(message.text) : "";
}

function connectCodeFromMessage(message: string) {
  const match = /^MN\s+CONNECT\s+([A-Z0-9]{6,16})$/i.exec(message.trim());

  return match?.[1]?.toUpperCase() ?? null;
}

function customerPlanCodeFromMessage(message: string) {
  const match = /^MN\s+PLAN\s+([A-Z0-9]{6,16})$/i.exec(message.trim());

  return match?.[1]?.toUpperCase() ?? null;
}

async function replyToLine(input: Readonly<{
  replyToken: string;
  text: string;
}>) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();

  if (!accessToken || !input.replyToken) {
    return false;
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    body: JSON.stringify({
      messages: [
        {
          text: formatOutboundLineMessage(input.text).slice(0, 4900),
          type: "text"
        }
      ],
      replyToken: input.replyToken
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  return response.ok;
}

export async function POST(request: Request) {
  const body = await request.text();

  if (!verifyLineSignature(body, request.headers.get("x-line-signature"))) {
    return NextResponse.json({ message: "Invalid LINE signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(body || "{}") as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid LINE payload" }, { status: 400 });
  }
  const events = Array.isArray(payload.events) ? payload.events : [];
  const results: Array<Record<string, unknown>> = [];

  for (const rawEvent of events) {
    const event = objectValue(rawEvent);
    const message = lineTextMessage(event);
    const { recipientId, sourceType } = lineSource(event);
    const providerEventId = text(event.webhookEventId);
    const replyToken = text(event.replyToken);

    if (!message || !recipientId) {
      results.push({ ignored: true, reason: "unsupported_event" });
      continue;
    }

    const connectCode = connectCodeFromMessage(message);
    const customerPlanCode = customerPlanCodeFromMessage(message);

    if (connectCode) {
      const connected = await consumeOrganisationLineConnectCode({
        code: connectCode,
        providerEventId,
        rawEvent: event,
        recipientId,
        sourceType
      });
      const replySent = await replyToLine({
        replyToken,
        text: connected
          ? "MattaNutra notifications are now connected for this LINE chat."
          : "That MattaNutra connect code is invalid or expired. Create a new LINE connect code in Admin Communications and send MN CONNECT <code> again."
      });

      results.push({
        connected: Boolean(connected),
        organisationId: connected?.organisationId ?? null,
        replySent
      });
      continue;
    }

    if (customerPlanCode) {
      const connected = await consumeCustomerLineConnectCode({
        code: customerPlanCode,
        providerEventId,
        rawEvent: event,
        recipientId,
        sourceType
      });
      const replySent = await replyToLine({
        replyToken,
        text: connected
          ? "You are connected to Panya on LINE. Send a message here whenever you need help with your order or protocol questions."
          : "That MattaNutra plan code is invalid or expired. Open your MattaNutra page and create a fresh LINE code, then send MN PLAN <code> again."
      });

      results.push({
        connected: Boolean(connected),
        planId: connected?.planId ?? null,
        replySent
      });
      continue;
    }

    const inbound = await recordInboundLineCommunication({
      body: message,
      providerEventId,
      rawEvent: event,
      recipientId,
      replyToken,
      sourceType
    });
    let panyaTaskId: string | null = null;

    if (inbound.planId) {
      const sql = getSql();

      if (sql) {
        const chatMessage = await appendPlanChatMessage(sql, {
          allowUnpaidSupport: true,
          body: message,
          channel: "line",
          externalMessageId: inbound.id,
          identityId: inbound.identityId,
          metadata: {
            communicationMessageId: inbound.id,
            providerEventId,
            replyTokenPresent: Boolean(replyToken),
            sourceType
          },
          planId: inbound.planId,
          role: "user",
          source: "line",
          status: "queued"
        });
        panyaTaskId = await enqueuePanyaCustomerChatReplyTask({
          communicationMessageId: inbound.id,
          messageId: chatMessage.messageId,
          planId: inbound.planId
        });
      }
    }

    results.push({
      captured: true,
      messageId: inbound.id,
      panyaTaskId,
      planId: inbound.planId
    });
  }

  return NextResponse.json({ ok: true, results });
}
