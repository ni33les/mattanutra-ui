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

  if (locale === "th") {
    return "เชื่อมต่อ LINE แล้ว MattaNutra สามารถส่งการแจ้งเตือนงานและคำสั่งซื้อขององค์กรนี้มาที่แชทนี้ได้ ตอนนี้ระบบยังไม่เปิดใช้คำสั่งจากแชท แต่ข้อความตอบกลับจะถูกเก็บไว้เพื่อการทำงานต่อไป";
  }

  if (locale === "zh-CN") {
    return "LINE 已连接。MattaNutra 可以把该组织的运营和订单通知发送到此聊天。目前尚未启用聊天指令，但回复会被记录，供后续跟进。";
  }

  return "LINE is connected. MattaNutra can send this organisation's operational and order notifications to this chat. Chat commands are not enabled yet, but replies will be captured for follow-up.";
}

function customerConnectedReply(input: Readonly<{
  locale?: string | null;
  selectedPlan?: string | null;
}>) {
  const locale = replyLocale(input.locale);
  const isSubscription =
    input.selectedPlan?.trim().toLowerCase() === "pro" ||
    input.selectedPlan?.trim().toLowerCase() === "living_protocol";

  if (locale === "th") {
    return isSubscription
      ? "เชื่อมต่อกับ Panya แล้ว คุณสามารถถามเรื่องแผน อาหาร ผลิตภัณฑ์ คำสั่งซื้อ และการเปลี่ยนแปลงของร่างกายหรือกิจวัตรได้ Panya จะช่วยสนับสนุน Living Protocol ต่อเนื่อง และส่งต่อให้ทีมงานเมื่อจำเป็น"
      : "เชื่อมต่อกับ Panya แล้ว คุณสามารถถามเรื่องแผนโภชนาการ ผลิตภัณฑ์ คำสั่งซื้อ และขั้นตอนถัดไปได้ สำหรับแผนแบบครั้งเดียว Panya จะช่วยอธิบายและแนะนำการใช้งาน แต่การปรับโปรโตคอลต่อเนื่องจะอยู่ในบริการ Living Protocol";
  }

  if (locale === "zh-CN") {
    return isSubscription
      ? "已连接 Panya。你可以询问方案、食物、产品、订单，以及身体状态或日常习惯的变化。Panya 会持续支持 Living Protocol，并在需要时转给人工团队。"
      : "已连接 Panya。你可以询问营养方案、产品、订单和下一步。一次性方案中，Panya 可以解释和引导使用；持续方案调整属于 Living Protocol 服务。";
  }

  return isSubscription
    ? "You are connected to Panya. You can ask about your plan, food, products, orders, and changes in your body or routine. Panya can support your Living Protocol over time and bring in the team when needed."
    : "You are connected to Panya. You can ask about your nutrition plan, products, orders, and next steps. For one-off plans, Panya can explain and guide; ongoing protocol refinement is part of Living Protocol.";
}

function invalidLineConnectReply(scope: LineConnectCommand["scope"]) {
  if (scope === "admin") {
    return "That MattaNutra code is invalid or expired. Create a fresh LINE code in Admin Communications, then send MN <code> again.";
  }

  if (scope === "customer") {
    return "That MattaNutra code is invalid or expired. Open your MattaNutra page for a fresh LINE code, then send MN <code> again.";
  }

  return "That MattaNutra code is invalid or expired. Please create a fresh LINE code and send MN <code> again.";
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
        const replySent = await replyToLine({
          replyToken,
          text: customerConnectedReply({
            locale: customerConnected.locale,
            selectedPlan: customerConnected.selectedPlan
          })
        });

        results.push({
          connected: true,
          connectionScope: "customer",
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
