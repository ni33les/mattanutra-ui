import { NextResponse } from "next/server";
import {
  writeBpmEvent,
  type BpmEventType,
  type BpmSeverity
} from "@/lib/bpm";
import { mirrorBpmEventToFacebookCapi } from "@/lib/facebook-capi";
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

  const properties = record(body.properties);
  const attribution = record(body.attribution);
  const planId = text(body.planId);
  const email = text(body.email);
  const valueAmount = number(body.valueAmount);
  const valueCurrency = text(body.valueCurrency);

  const eventId = await writeBpmEvent({
    actorType: "visitor",
    attribution,
    email,
    eventName,
    eventStatus: text(body.eventStatus),
    eventType: eventType(body.eventType),
    exampleRequestId: text(body.exampleRequestId),
    healthScore: number(body.healthScore),
    locale: isLocale(body.locale) ? body.locale : undefined,
    lowestDomain: text(body.lowestDomain),
    metrics: record(body.metrics),
    planId,
    properties,
    ray: text(body.ray),
    request,
    scoreBand: text(body.scoreBand),
    selectedPlan: text(body.selectedPlan),
    severity: text(body.severity) as BpmSeverity | undefined,
    valueAmount,
    valueCurrency
  });

  // Server-side Meta CAPI mirror (deduped with browser via facebookEventId).
  // Never block the BPM response on Meta.
  const facebookEventId =
    text(properties.facebookEventId) || text(body.facebookEventId);
  const eventSourceUrl =
    text(properties.sourceUrl) ||
    text(attribution.sourceUrl) ||
    request.headers.get("referer");

  void mirrorBpmEventToFacebookCapi({
    email,
    eventName,
    eventSourceUrl,
    facebookEventId,
    planId,
    phone: text(properties.phone) || text(body.phone),
    properties,
    request,
    valueAmount,
    valueCurrency
  }).catch(() => {
    // CAPI must never affect tracking or UX.
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
