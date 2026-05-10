import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import { isLocale } from "@/lib/i18n";

export type BpmEventType =
  | "affiliate"
  | "chat"
  | "content"
  | "email"
  | "error"
  | "formulation"
  | "funnel"
  | "payment"
  | "plan"
  | "reassessment"
  | "safety"
  | "system"
  | "traffic";

export type BpmSeverity = "critical" | "high" | "low" | "medium";

export type BpmActorType = "admin" | "openclaw" | "system" | "visitor" | "worker";

type BpmAttributionInput = Readonly<{
  adId?: unknown;
  affiliateClickId?: unknown;
  affiliateId?: unknown;
  affiliateRef?: unknown;
  affiliateSubId?: unknown;
  browser?: unknown;
  campaignId?: unknown;
  campaignName?: unknown;
  clickId?: unknown;
  countryCode?: unknown;
  deviceType?: unknown;
  landingPage?: unknown;
  os?: unknown;
  path?: unknown;
  promoCode?: unknown;
  referrer?: unknown;
  route?: unknown;
  sourceChannel?: unknown;
  sourceDetail?: unknown;
  sourceUrl?: unknown;
  trafficSource?: unknown;
  userAgent?: unknown;
  utmCampaign?: unknown;
  utmContent?: unknown;
  utmMedium?: unknown;
  utmSource?: unknown;
  utmTerm?: unknown;
}>;

export type BpmEventInput = Readonly<{
  actorType?: BpmActorType;
  attribution?: BpmAttributionInput;
  cronId?: string | null;
  durationMs?: number | null;
  email?: string | null;
  emittedBy?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  eventName: string;
  eventStatus?: string;
  eventType?: BpmEventType;
  exampleRequestId?: string | null;
  healthScore?: number | null;
  httpStatus?: number | null;
  locale?: unknown;
  lowestDomain?: string | null;
  metrics?: Record<string, unknown>;
  planId?: string | null;
  properties?: Record<string, unknown>;
  ray?: string | null;
  request?: Request;
  safetyFlags?: unknown[];
  scoreBand?: string | null;
  selectedPlan?: "precision" | "pro" | string | null;
  severity?: BpmSeverity;
  valueAmount?: number | null;
  valueCurrency?: string | null;
}>;

type BpmBodyContext = Readonly<{
  attribution?: BpmAttributionInput;
  ray?: unknown;
}>;

const EVENT_TYPES = new Set<BpmEventType>([
  "affiliate",
  "chat",
  "content",
  "email",
  "error",
  "formulation",
  "funnel",
  "payment",
  "plan",
  "reassessment",
  "safety",
  "system",
  "traffic"
]);

const SEVERITIES = new Set<BpmSeverity>(["critical", "high", "low", "medium"]);

const ACTOR_TYPES = new Set<BpmActorType>([
  "admin",
  "openclaw",
  "system",
  "visitor",
  "worker"
]);

function text(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 1000) : null;
}

function normalizedLocale(value: unknown) {
  return isLocale(value) ? value : null;
}

function normalizedSelectedPlan(value: unknown) {
  return value === "precision" || value === "pro" ? value : null;
}

function normalizedEventType(value: unknown) {
  return typeof value === "string" && EVENT_TYPES.has(value as BpmEventType)
    ? (value as BpmEventType)
    : "funnel";
}

function normalizedSeverity(value: unknown) {
  return typeof value === "string" && SEVERITIES.has(value as BpmSeverity)
    ? (value as BpmSeverity)
    : "low";
}

function normalizedActorType(value: unknown) {
  return typeof value === "string" && ACTOR_TYPES.has(value as BpmActorType)
    ? (value as BpmActorType)
    : "visitor";
}

function normalizedUuid(value: unknown) {
  return typeof value === "string" && isUuid(value) ? value : null;
}

function normalizedRay(value: unknown) {
  return normalizedUuid(value) ?? randomUUID();
}

function normalizedInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
}

function normalizedAmount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedHealthScore(value: unknown) {
  const score = normalizedInteger(value);

  if (score === null || score < 0 || score > 100) {
    return null;
  }

  return score;
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function requestIp(request?: Request) {
  if (!request) {
    return null;
  }

  return (
    text(request.headers.get("cf-connecting-ip")) ||
    text(request.headers.get("x-real-ip")) ||
    text(request.headers.get("x-forwarded-for")?.split(",")[0]) ||
    null
  );
}

function requestUserAgent(request?: Request) {
  return request ? text(request.headers.get("user-agent")) : null;
}

function hashValue(value: string) {
  const salt =
    process.env.BPM_HASH_SALT ||
    process.env.ADMIN_TOKEN ||
    "mattanutra-bpm-default-salt";

  return createHash("sha256")
    .update(`${salt}:${value.trim().toLowerCase()}`)
    .digest("hex");
}

function hashOptional(value: string | null) {
  return value ? hashValue(value) : null;
}

function bodyBpmContext(body: unknown): BpmBodyContext {
  const record = jsonObject(body);
  const bpm = jsonObject(record.bpm);

  return {
    attribution: jsonObject(bpm.attribution) as BpmAttributionInput,
    ray: bpm.ray
  };
}

export function bpmContextFromBody(body: unknown) {
  return bodyBpmContext(body);
}

async function insertBpmEvent(sql: postgres.Sql, input: BpmEventInput) {
  const attribution = input.attribution ?? {};
  const emailHash =
    input.email && typeof input.email === "string"
      ? hashValue(input.email)
      : null;
  const ipHash = hashOptional(requestIp(input.request));
  const id = randomUUID();

  await sql`
    insert into public.bpm (
      id,
      ray,
      plan_id,
      cron_id,
      example_request_id,
      event_name,
      event_type,
      event_status,
      severity,
      actor_type,
      emitted_by,
      locale,
      selected_plan,
      email_hash,
      ip_hash,
      user_agent,
      device_type,
      browser,
      os,
      country_code,
      path,
      route,
      referrer,
      landing_page,
      traffic_source,
      source_channel,
      source_detail,
      source_url,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      campaign_id,
      campaign_name,
      promo_code,
      affiliate_id,
      affiliate_ref,
      affiliate_sub_id,
      affiliate_click_id,
      ad_id,
      click_id,
      health_score,
      score_band,
      lowest_domain,
      value_amount,
      value_currency,
      error_code,
      error_message,
      safety_flags,
      duration_ms,
      http_status,
      properties,
      metrics,
      occurred_at,
      created_at
    )
    values (
      ${id}::uuid,
      ${normalizedRay(input.ray)}::uuid,
      ${normalizedUuid(input.planId)}::uuid,
      ${normalizedUuid(input.cronId)}::uuid,
      ${normalizedUuid(input.exampleRequestId)}::uuid,
      ${text(input.eventName) ?? "unknown"},
      ${normalizedEventType(input.eventType)},
      ${text(input.eventStatus) ?? "observed"},
      ${normalizedSeverity(input.severity)},
      ${normalizedActorType(input.actorType)},
      ${text(input.emittedBy)},
      ${normalizedLocale(input.locale)},
      ${normalizedSelectedPlan(input.selectedPlan)},
      ${emailHash},
      ${ipHash},
      ${text(attribution.userAgent) ?? requestUserAgent(input.request)},
      ${text(attribution.deviceType)},
      ${text(attribution.browser)},
      ${text(attribution.os)},
      ${text(attribution.countryCode)},
      ${text(attribution.path)},
      ${text(attribution.route)},
      ${text(attribution.referrer)},
      ${text(attribution.landingPage)},
      ${text(attribution.trafficSource)},
      ${text(attribution.sourceChannel)},
      ${text(attribution.sourceDetail)},
      ${text(attribution.sourceUrl)},
      ${text(attribution.utmSource)},
      ${text(attribution.utmMedium)},
      ${text(attribution.utmCampaign)},
      ${text(attribution.utmContent)},
      ${text(attribution.utmTerm)},
      ${text(attribution.campaignId)},
      ${text(attribution.campaignName)},
      ${text(attribution.promoCode)},
      ${text(attribution.affiliateId)},
      ${text(attribution.affiliateRef)},
      ${text(attribution.affiliateSubId)},
      ${text(attribution.affiliateClickId)},
      ${text(attribution.adId)},
      ${text(attribution.clickId)},
      ${normalizedHealthScore(input.healthScore)},
      ${text(input.scoreBand)},
      ${text(input.lowestDomain)},
      ${normalizedAmount(input.valueAmount)},
      ${text(input.valueCurrency)},
      ${text(input.errorCode)},
      ${text(input.errorMessage)},
      ${sql.json(toJsonValue(jsonArray(input.safetyFlags)))},
      ${normalizedInteger(input.durationMs)},
      ${normalizedInteger(input.httpStatus)},
      ${sql.json(toJsonValue(jsonObject(input.properties)))},
      ${sql.json(toJsonValue(jsonObject(input.metrics)))},
      now(),
      now()
    )
  `;

  return id;
}

export async function writeBpmEvent(input: BpmEventInput) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  try {
    return await insertBpmEvent(sql, input);
  } catch (error) {
    console.warn("Unable to write BPM event", {
      eventName: input.eventName,
      error
    });
    return null;
  }
}
