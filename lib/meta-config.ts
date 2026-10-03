import { resolveMattanutraRuntimeEnv, getPrimaryFacebookPixelId } from "@/lib/facebook-pixel";
import type { MetaPublicConfig } from "@/lib/meta-event-policy";

export function metaConfig() {
  const declared = process.env.MATTANUTRA_ENV?.trim().toLowerCase();
  const environment = declared === "dev" || declared === "uat" || declared === "prd" ? declared : resolveMattanutraRuntimeEnv();
  const suffix = environment.toUpperCase();
  const pixelId = process.env[`FACEBOOK_PIXEL_ID_${suffix}`]?.trim() || process.env.FACEBOOK_PIXEL_ID?.trim() || getPrimaryFacebookPixelId();
  const token = process.env[`FACEBOOK_CAPI_ACCESS_TOKEN_${suffix}`]?.trim() || process.env.FACEBOOK_CAPI_ACCESS_TOKEN?.trim() || "";
  const enabled = process.env.META_TRACKING_ENABLED === "true" && /^\d{5,20}$/.test(pixelId) && !!token;
  return { environment, pixelId, token, enabled, testEventCode: process.env[`FACEBOOK_CAPI_TEST_EVENT_CODE_${suffix}`]?.trim() || "", graphVersion: "v26.0" };
}

export function metaPublicConfig(): MetaPublicConfig {
  const { environment, pixelId, enabled } = metaConfig();
  return { environment, pixelId, enabled };
}
