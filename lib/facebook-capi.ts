/**
 * Meta Conversions API (server-side) via Graph API fetch — no SDK dependency.
 *
 * Env (server-only):
 *   FACEBOOK_CAPI_ACCESS_TOKEN — required to send
 *   FACEBOOK_PIXEL_ID — optional; falls back to NEXT_PUBLIC_FACEBOOK_PIXEL_ID / default
 *   FACEBOOK_CAPI_TEST_EVENT_CODE — optional Test Events code
 */

import { createHash, randomUUID } from "node:crypto";
import {
  DEFAULT_FACEBOOK_PIXEL_ID,
  facebookEventForInternal
} from "@/lib/facebook-pixel";

const GRAPH_VERSION = "v21.0";

export type FacebookCapiUserData = Readonly<{
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  email?: string | null;
  externalId?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  phone?: string | null;
}>;

export type FacebookCapiEventInput = Readonly<{
  actionSource?: "website" | "email" | "app" | "phone_call" | "chat" | "other";
  customData?: Record<string, unknown>;
  eventId?: string | null;
  eventName: string;
  eventSourceUrl?: string | null;
  eventTime?: number;
  userData?: FacebookCapiUserData;
}>;

function configuredPixelId() {
  return (
    process.env.FACEBOOK_PIXEL_ID?.trim() ||
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ||
    DEFAULT_FACEBOOK_PIXEL_ID
  );
}

function configuredAccessToken() {
  return process.env.FACEBOOK_CAPI_ACCESS_TOKEN?.trim() || "";
}

function configuredTestEventCode() {
  return process.env.FACEBOOK_CAPI_TEST_EVENT_CODE?.trim() || "";
}

export function facebookCapiEnabled() {
  return Boolean(configuredAccessToken() && configuredPixelId());
}

/** Normalise email for Meta hashing: trim + lowercase. */
export function normaliseEmailForFacebook(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Normalise phone for Meta: digits only, Thai leading 0 → 66.
 * e.g. 0812345678 → 66812345678, +66 81 234 5678 → 66812345678
 */
export function normalisePhoneForFacebook(phone: string) {
  let digits = phone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) {
    digits = `66${digits.slice(1)}`;
  }

  if (digits.startsWith("660") && digits.length >= 11) {
    digits = `66${digits.slice(3)}`;
  }

  return digits;
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashEmailForFacebook(email: string | null | undefined) {
  if (!email?.trim()) {
    return null;
  }

  return sha256Hex(normaliseEmailForFacebook(email));
}

export function hashPhoneForFacebook(phone: string | null | undefined) {
  if (!phone?.trim()) {
    return null;
  }

  const normalised = normalisePhoneForFacebook(phone);

  if (!normalised) {
    return null;
  }

  return sha256Hex(normalised);
}

function buildUserData(userData: FacebookCapiUserData | undefined) {
  if (!userData) {
    return {};
  }

  const payload: Record<string, string | string[]> = {};
  const em = hashEmailForFacebook(userData.email ?? null);
  const ph = hashPhoneForFacebook(userData.phone ?? null);
  const externalId = userData.externalId?.trim();

  if (em) {
    payload.em = [em];
  }
  if (ph) {
    payload.ph = [ph];
  }
  if (externalId) {
    payload.external_id = [sha256Hex(externalId)];
  }
  if (userData.clientIpAddress?.trim()) {
    payload.client_ip_address = userData.clientIpAddress.trim();
  }
  if (userData.clientUserAgent?.trim()) {
    payload.client_user_agent = userData.clientUserAgent.trim();
  }
  if (userData.fbp?.trim()) {
    payload.fbp = userData.fbp.trim();
  }
  if (userData.fbc?.trim()) {
    payload.fbc = userData.fbc.trim();
  }

  return payload;
}

function cookieValue(request: Request | null | undefined, name: string) {
  if (!request) {
    return null;
  }

  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }

  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function facebookUserDataFromRequest(
  request: Request | null | undefined,
  input: Readonly<{
    email?: string | null;
    externalId?: string | null;
    phone?: string | null;
  }> = {}
): FacebookCapiUserData {
  const forwarded = request?.headers.get("x-forwarded-for");
  const clientIp =
    forwarded?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip")?.trim() ||
    null;

  return {
    clientIpAddress: clientIp,
    clientUserAgent: request?.headers.get("user-agent") ?? null,
    email: input.email ?? null,
    externalId: input.externalId ?? null,
    fbc: cookieValue(request, "_fbc"),
    fbp: cookieValue(request, "_fbp"),
    phone: input.phone ?? null
  };
}

/**
 * Send one or more events to Meta CAPI. Never throws; returns false on skip/error.
 */
export async function sendFacebookCapiEvents(
  events: readonly FacebookCapiEventInput[],
  options?: Readonly<{
    fetchImpl?: typeof fetch;
    pixelId?: string;
    testEventCode?: string;
    token?: string;
  }>
) {
  const token = options?.token ?? configuredAccessToken();
  const pixelId = options?.pixelId ?? configuredPixelId();
  const testEventCode =
    options?.testEventCode !== undefined
      ? options.testEventCode
      : configuredTestEventCode() || undefined;

  if (!token || !pixelId || events.length < 1) {
    return { ok: false as const, reason: "not_configured" as const };
  }

  const data = events.map((event) => {
    const eventId = event.eventId?.trim() || randomUUID();
    const body: Record<string, unknown> = {
      action_source: event.actionSource ?? "website",
      event_id: eventId,
      event_name: event.eventName,
      event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
      user_data: buildUserData(event.userData)
    };

    if (event.eventSourceUrl?.trim()) {
      body.event_source_url = event.eventSourceUrl.trim();
    }

    if (event.customData && Object.keys(event.customData).length > 0) {
      body.custom_data = event.customData;
    }

    return body;
  });

  const payload: Record<string, unknown> = {
    data,
    access_token: token
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`;
  const fetchImpl = options?.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(url, {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        "Facebook CAPI request failed",
        response.status,
        text.slice(0, 300)
      );
      return { ok: false as const, reason: "http_error" as const };
    }

    return { ok: true as const };
  } catch (error) {
    console.warn("Facebook CAPI request error", error);
    return { ok: false as const, reason: "network_error" as const };
  }
}

/**
 * Mirror a BPM funnel event to CAPI when mapping exists and CAPI is configured.
 */
export async function mirrorBpmEventToFacebookCapi(input: Readonly<{
  email?: string | null;
  eventName: string;
  eventSourceUrl?: string | null;
  facebookEventId?: string | null;
  planId?: string | null;
  phone?: string | null;
  properties?: Record<string, unknown> | null;
  request?: Request | null;
  valueAmount?: number | null;
  valueCurrency?: string | null;
}>) {
  if (!facebookCapiEnabled()) {
    return { ok: false as const, reason: "not_configured" as const };
  }

  const mapped = facebookEventForInternal(input.eventName);

  if (!mapped || mapped.event === "PageView") {
    return { ok: false as const, reason: "unmapped" as const };
  }

  const customData: Record<string, unknown> = {
    content_name: input.eventName
  };

  if (input.planId) {
    customData.plan_id = input.planId;
  }

  if (
    typeof input.valueAmount === "number" &&
    Number.isFinite(input.valueAmount)
  ) {
    customData.value = input.valueAmount;
  }

  if (input.valueCurrency?.trim()) {
    customData.currency = input.valueCurrency.trim().toUpperCase();
  }

  const props = input.properties ?? {};
  if (typeof props.content_category === "string") {
    customData.content_category = props.content_category;
  }

  return sendFacebookCapiEvents([
    {
      actionSource: "website",
      customData,
      eventId: input.facebookEventId ?? undefined,
      eventName: mapped.event,
      eventSourceUrl: input.eventSourceUrl,
      userData: facebookUserDataFromRequest(input.request, {
        email: input.email,
        externalId: input.planId,
        phone: input.phone
      })
    }
  ]);
}
