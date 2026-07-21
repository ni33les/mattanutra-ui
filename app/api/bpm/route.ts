import { NextResponse } from "next/server";
import {
  writeBpmEvent,
  type BpmEventType,
  type BpmSeverity
} from "@/lib/bpm";
import { isLocale } from "@/lib/i18n";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";

export const runtime = "nodejs";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function eventType(value: unknown): BpmEventType | undefined {
  return typeof value === "string" ? (value as BpmEventType) : undefined;
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.bpmPost);

  if (limited) {
    return limited;
  }

  let body: Record<string, unknown> = {};

  try {
    body = record(await request.json());
  } catch {
    body = {};
  }

  const eventName = text(body.eventName);

  if (!eventName) {
    return NextResponse.json(
      { message: "eventName is required" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  const eventId = await writeBpmEvent({
    actorType: "visitor",
    attribution: record(body.attribution),
    email: text(body.email),
    eventName,
    eventStatus: text(body.eventStatus),
    eventType: eventType(body.eventType),
    exampleRequestId: text(body.exampleRequestId),
    healthScore: number(body.healthScore),
    locale: isLocale(body.locale) ? body.locale : undefined,
    lowestDomain: text(body.lowestDomain),
    metrics: record(body.metrics),
    planId: text(body.planId),
    properties: record(body.properties),
    ray: text(body.ray),
    request,
    scoreBand: text(body.scoreBand),
    selectedPlan: text(body.selectedPlan),
    severity: text(body.severity) as BpmSeverity | undefined,
    valueAmount: number(body.valueAmount),
    valueCurrency: text(body.valueCurrency)
  });

  return NextResponse.json(
    { eventId, ok: true },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
