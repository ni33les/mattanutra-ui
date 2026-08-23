import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { createCustomerLineConnectToken } from "@/lib/communications";
import { buildLineOfficialAccountMessageUrl } from "@/lib/chat-links";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";

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
  const startedAt = Date.now();
  const limited = enforceRateLimit(
    request,
    publicRateLimits.assessmentPlanMutation
  );

  if (limited) {
    return limited;
  }

  const { planId } = await params;

  if (!isUuid(planId)) {
    return noStoreJson({ message: "Plan not found" }, 404);
  }

  const body = objectValue(await request.json().catch(() => ({})));

  try {
    const sqlStartedAt = Date.now();
    const token = await createCustomerLineConnectToken({
      planId,
      retailCustomerOrderId: text(body.retailCustomerOrderId),
      source: text(body.source) || "customer_line_cta"
    });
    const sqlMs = Date.now() - sqlStartedAt;
    const command = `MN ${token.code}`;

    console.info("[line-connect:post]", {
      planId,
      sqlMs,
      totalMs: Date.now() - startedAt
    });

    return noStoreJson({
      code: token.code,
      command,
      expiresAt: token.expiresAt,
      lineUrl: buildLineOfficialAccountMessageUrl(command),
      retailCustomerOrderId: token.retailCustomerOrderId
    });
  } catch (error) {
    console.warn("[line-connect:post] failed", {
      planId,
      totalMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "unknown"
    });

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
