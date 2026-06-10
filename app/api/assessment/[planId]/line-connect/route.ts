import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { createCustomerLineConnectToken } from "@/lib/communications";
import { buildChatChannels } from "@/lib/chat-links";

export const runtime = "nodejs";

type LineConnectRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store"
    },
    status
  });
}

export async function POST(
  request: Request,
  { params }: LineConnectRouteProps
) {
  const { planId } = await params;

  if (!isUuid(planId)) {
    return noStoreJson({ message: "Plan not found" }, 404);
  }

  const body = objectValue(await request.json().catch(() => ({})));

  try {
    const token = await createCustomerLineConnectToken({
      planId,
      retailCustomerOrderId: text(body.retailCustomerOrderId),
      source: text(body.source) || "customer_line_cta"
    });
    const lineChannel = buildChatChannels(planId).find(
      (channel) => channel.id === "line"
    );

    return noStoreJson({
      code: token.code,
      command: `MN PLAN ${token.code}`,
      expiresAt: token.expiresAt,
      lineUrl: lineChannel?.url ?? "https://line.me/R/ti/p/@344enooi",
      retailCustomerOrderId: token.retailCustomerOrderId
    });
  } catch (error) {
    return noStoreJson(
      {
        message:
          error instanceof Error
            ? error.message
            : "Could not create LINE connection code"
      },
      400
    );
  }
}
