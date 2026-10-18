import { DEFAULT_FACEBOOK_PIXEL_ID, resolveMattanutraRuntimeEnv } from "@/lib/facebook-pixel";
import type { MetaPublicConfig } from "@/lib/meta-event-policy";

export function metaConfig() {
  const declared = process.env.MATTANUTRA_ENV?.trim().toLowerCase();
  const environment = declared === "dev" || declared === "uat" || declared === "prd" ? declared : resolveMattanutraRuntimeEnv();
  const suffix = environment.toUpperCase();
  // The server environment is authoritative even when a stale public build says UAT.
  const publicPixelFallback = [process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID,
    ...(process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_IDS || "").split(",")]
    .map(id => id?.trim()).find(id => id && /^\d{5,20}$/.test(id)) || DEFAULT_FACEBOOK_PIXEL_ID;
  const pixelId = process.env[`FACEBOOK_PIXEL_ID_${suffix}`]?.trim()
    || (environment === "prd" ? process.env.FACEBOOK_PIXEL_ID?.trim() || publicPixelFallback : "");
  const token = process.env[`FACEBOOK_CAPI_ACCESS_TOKEN_${suffix}`]?.trim()
    || (environment === "prd" ? process.env.FACEBOOK_CAPI_ACCESS_TOKEN?.trim() || "" : "");
  // Event-name prefixes and Test Events codes do not isolate datasets. Non-PRD
  // must explicitly configure a separate dataset, even if legacy sharing is on.
  const productionPixelIds = new Set([
    DEFAULT_FACEBOOK_PIXEL_ID,
    process.env.FACEBOOK_PIXEL_ID_PRD,
    process.env.FACEBOOK_PIXEL_ID,
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID,
    process.env.NEXT_PUBLIC_META_PIXEL_ID,
    ...(process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_IDS || "").split(",")
  ].map(id => id?.trim()).filter(Boolean));
  const isolated = environment === "prd" || !productionPixelIds.has(pixelId);
  const enabled = process.env.META_TRACKING_ENABLED === "true" && /^\d{5,20}$/.test(pixelId) && !!token && isolated;
  return { environment, pixelId, token, enabled, testEventCode: process.env[`FACEBOOK_CAPI_TEST_EVENT_CODE_${suffix}`]?.trim() || "", graphVersion: "v26.0" };
}

export function metaPublicConfig(): MetaPublicConfig {
  const { environment, pixelId, enabled } = metaConfig();
  return { environment, pixelId, enabled };
}
