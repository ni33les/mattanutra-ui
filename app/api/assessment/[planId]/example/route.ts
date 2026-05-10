import { NextResponse } from "next/server";
import {
  getStoredAssessmentSnapshot,
  isUuid
} from "@/lib/assessment-store";
import { validateLeadEmail } from "@/lib/email-validation";
import { bpmContextFromBody, writeBpmEvent } from "@/lib/bpm";
import {
  getExampleBriefStatus,
  kickCronWorker,
  kickTaskWorker,
  requestExampleBrief,
  scheduleReassessmentAction
} from "@/lib/task-worker";

export const runtime = "nodejs";

type ExampleRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalExampleRateLimit = globalThis as typeof globalThis & {
  mattanutraExampleRateLimits?: Map<string, RateLimitBucket>;
};

function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function rateLimitAllows(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const buckets =
    globalExampleRateLimit.mattanutraExampleRateLimits ??
    new Map<string, RateLimitBucket>();
  globalExampleRateLimit.mattanutraExampleRateLimits = buckets;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export async function GET(request: Request, { params }: ExampleRouteProps) {
  const { planId } = await params;
  const requestId =
    new URL(request.url).searchParams.get("requestId") ??
    new URL(request.url).searchParams.get("request") ??
    "";

  if (!isUuid(planId) || !isUuid(requestId)) {
    return NextResponse.json(
      { message: "Example request not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const status = await getExampleBriefStatus({ planId, requestId });

  if (!status) {
    return NextResponse.json(
      { message: "Example request not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  if (status.status !== "ready" && status.status !== "failed") {
    void kickTaskWorker();
  }

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: Request, { params }: ExampleRouteProps) {
  const { planId } = await params;
  let body: {
    bpm?: unknown;
    email?: unknown;
    includeReassessment?: unknown;
    locale?: unknown;
  } = {};

  try {
    body = (await request.json()) as {
      email?: unknown;
      includeReassessment?: unknown;
      locale?: unknown;
    };
  } catch {
    body = {};
  }
  const bpm = bpmContextFromBody(body);

  if (!isUuid(planId)) {
    return NextResponse.json(
      { message: "Assessment plan not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const clientIp = getClientIp(request);

  if (!rateLimitAllows(`example:raw-ip:${clientIp}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json(
      { message: "Too many example requests. Please try again later." },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 429
      }
    );
  }

  const emailValidation = validateLeadEmail(body.email);

  if (!emailValidation.ok) {
    await writeBpmEvent({
      actorType: "visitor",
      attribution: bpm.attribution,
      eventName: "free_email_invalid",
      eventType: "email",
      locale: body.locale,
      planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      severity: "low"
    });

    return NextResponse.json(
      { message: "Valid email address is required" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  if (
    !rateLimitAllows(`example:valid-ip:${clientIp}`, 8, 10 * 60 * 1000) ||
    !rateLimitAllows(`example:plan:${planId}`, 3, 60 * 60 * 1000)
  ) {
    return NextResponse.json(
      { message: "Too many example requests. Please try again later." },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 429
      }
    );
  }

  const snapshot = await getStoredAssessmentSnapshot(planId);

  if (!snapshot) {
    return NextResponse.json(
      { message: "Assessment plan not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  try {
    const result = await requestExampleBrief({
      email: emailValidation.email,
      locale: body.locale,
      planId
    });

    if (!result) {
      throw new Error("Unable to queue example formulation");
    }

    if (body.includeReassessment !== false) {
      await scheduleReassessmentAction({
        email: emailValidation.email,
        locale: body.locale,
        planId
      });
      void kickCronWorker();
      await writeBpmEvent({
        actorType: "visitor",
        attribution: bpm.attribution,
        email: emailValidation.email,
        eventName: "reassessment_opted_in",
        eventType: "reassessment",
        locale: body.locale,
        planId,
        ray: typeof bpm.ray === "string" ? bpm.ray : null
      });
    }

    void kickTaskWorker();
    await writeBpmEvent({
      actorType: "visitor",
      attribution: bpm.attribution,
      email: emailValidation.email,
      eventName: "free_email_requested",
      eventType: "email",
      exampleRequestId: result.requestId,
      locale: body.locale,
      planId,
      properties: {
        includeReassessment: body.includeReassessment !== false
      },
      ray: typeof bpm.ray === "string" ? bpm.ray : null
    });

    return NextResponse.json(
      {
        planId,
        requestId: result.requestId,
        status: "example_requested"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to request example formulation", error);
    await writeBpmEvent({
      actorType: "system",
      attribution: bpm.attribution,
      email: emailValidation.email,
      errorCode: "example_request_failed",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Unable to request example formulation",
      eventName: "free_email_request_error",
      eventType: "error",
      locale: body.locale,
      planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      severity: "medium"
    });

    return NextResponse.json(
      { message: "Unable to request example formulation" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
