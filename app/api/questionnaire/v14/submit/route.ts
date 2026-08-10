import { NextResponse } from "next/server";
import {
  captureV14Email,
  submitV14Questionnaire,
  type V14SubmitPayload
} from "@/lib/questionnaire/v14/adapter";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "") ||
    "https";

  return `${protocol}://${host}`;
}

/**
 * MN_CONFIG.endpoint target for v14 HTML.
 * Accepts full submission or delayed email_capture.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.assessmentPost);
  if (limited) {
    return limited;
  }

  let body: V14SubmitPayload = {};
  try {
    body = (await request.json()) as V14SubmitPayload;
  } catch {
    body = {};
  }

  // Delayed-result / mid-flow email capture
  if (
    body.e === "email_capture" ||
    (typeof body.email === "string" &&
      body.email.includes("@") &&
      (!body.answers || Object.keys(body.answers).length < 1))
  ) {
    const result = await captureV14Email(body, { request });
    return NextResponse.json(result.body, {
      headers: { "Cache-Control": "no-store" },
      status: result.status
    });
  }

  const result = await submitV14Questionnaire(body, {
    origin: requestOrigin(request),
    request
  });

  return NextResponse.json(result.body, {
    headers: { "Cache-Control": "no-store" },
    status: result.status
  });
}
