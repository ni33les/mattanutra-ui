import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  consumeCustomerLineConnectCode,
  consumeOrganisationLineConnectCode,
  recordInboundLineCommunication
} from "@/lib/communications";
import { getSql } from "@/lib/db";
import { formatOutboundLineMessage } from "@/lib/line-message-format";
import {
  archivePanyaWelcomeMessage,
  checkAndRecordPanyaUserMessage,
  preparePanyaWelcomeMessage,
  queuePanyaQuotaLimitReply,
  schedulePanyaCheckInForPlan
} from "@/lib/panya";
import { appendPlanChatMessage } from "@/lib/plan-concierge";
import { enqueuePanyaCustomerChatReplyTask } from "@/lib/task-worker";
import { t } from "@/lib/i18n-messages";

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

type LineConnectCommand = Readonly<{
  code: string;
  scope: "admin" | "customer" | "either";
}>;

type ReplyLocale = "en" | "th" | "zh-CN";

function lineConnectCommandFromMessage(message: string): LineConnectCommand | null {
  const match = /^MN(?:\s+(CONNECT|PLAN))?\s+([A-Z0-9]{6,16})$/i.exec(
    message.trim()
  );

  if (!match?.[2]) {
    return null;
  }

  const scope =
    match[1]?.toUpperCase() === "CONNECT"
      ? "admin"
      : match[1]?.toUpperCase() === "PLAN"
        ? "customer"
        : "either";

  return {
    code: match[2].toUpperCase(),
    scope
  };
}

function replyLocale(value: string | null | undefined): ReplyLocale {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "th") {
    return "th";
  }

  if (normalized === "zh-cn" || normalized === "zh") {
    return "zh-CN";
  }

  return "en";
}

function adminConnectedReply(localeValue: string | null | undefined) {
  const locale = replyLocale(localeValue);

  return t(locale, "outbound.lineWebhook.adminConnected");
}

function invalidLineConnectReply(scope: LineConnectCommand["scope"]) {
  if (scope === "admin") {
    return t("en", "outbound.lineWebhook.invalidAdmin");
  }

  if (scope === "customer") {
    return t("en", "outbound.lineWebhook.invalidCustomer");
  }

  return t("en", "outbound.lineWebhook.invalidEither");
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

    const connectCommand = lineConnectCommandFromMessage(message);

    if (connectCommand) {
      const adminConnected =
        connectCommand.scope !== "customer"
          ? await consumeOrganisationLineConnectCode({
              code: connectCommand.code,
              providerEventId,
              rawEvent: event,
              recipientId,
              sourceType
            })
          : null;

      if (adminConnected) {
        const replySent = await replyToLine({
          replyToken,
          text: adminConnectedReply(adminConnected.locale)
        });

        results.push({
          connected: true,
          connectionScope: "admin",
          organisationId: adminConnected.organisationId,
          replySent
        });
        continue;
      }

      const customerConnected =
        connectCommand.scope !== "admin"
          ? await consumeCustomerLineConnectCode({
              code: connectCommand.code,
              providerEventId,
              rawEvent: event,
              recipientId,
              sourceType
            })
          : null;

      if (customerConnected) {
        await schedulePanyaCheckInForPlan({
          planId: customerConnected.planId,
          source: "customer_line_connected"
        });

        const welcome = await preparePanyaWelcomeMessage({
          locale: customerConnected.locale,
          planId: customerConnected.planId,
          selectedPlan: customerConnected.selectedPlan
        });
        const replySent = await replyToLine({
          replyToken,
          text: welcome.body
        });
        const archivedWelcome = await archivePanyaWelcomeMessage({
          identityId: customerConnected.channel.identityId,
          message: welcome,
          replySent
        });

        results.push({
          connected: true,
          connectionScope: "customer",
          panyaWelcomeArchived: Boolean(archivedWelcome),
          panyaWelcomeGenerated: welcome.generatedBy === "ai",
          planId: customerConnected.planId,
          replySent
        });
        continue;
      }

      const replySent = await replyToLine({
        replyToken,
        text: invalidLineConnectReply(connectCommand.scope)
      });

      results.push({
        connected: false,
        connectionScope: connectCommand.scope,
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
        const quota = await checkAndRecordPanyaUserMessage({
          channelId: inbound.channelId,
          communicationMessageId: inbound.id,
          identityId: inbound.identityId,
          planId: inbound.planId,
          source: "line"
        });

        if (quota && !quota.allowed) {
          await queuePanyaQuotaLimitReply({
            createdByMessageId: inbound.id,
            planId: inbound.planId,
            quota
          });

          results.push({
            captured: true,
            messageId: inbound.id,
            panyaQuotaBlocked: true,
            planId: inbound.planId
          });
          continue;
        }

        const chatMessage = await appendPlanChatMessage(sql, {
          allowUnpaidSupport: true,
          body: message,
          channel: "line",
          enforcePlanChatLimit: false,
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
