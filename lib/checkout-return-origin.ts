import { siteBaseUrl } from "@/lib/site-url";
import type { Locale } from "@/lib/i18n";
import { paymentReturnPath } from "@/lib/payment-paths";

/** Keep host-only checkout cookies on return without trusting arbitrary Host/Origin values. */
export function checkoutReturnOrigin(request?: Request, configuredSiteUrl = siteBaseUrl()) {
  const configuredOrigin = new URL(configuredSiteUrl).origin;
  const allowed = new Set([configuredOrigin]);
  const environment = (process.env.MATTANUTRA_ENV || process.env.NEXT_PUBLIC_MATTANUTRA_ENV)?.trim().toLowerCase();
  const productionOrigins = ["https://mattanutra.com", "https://www.mattanutra.com"];
  if (productionOrigins.includes(configuredOrigin)
    && (!environment || ["prd", "prod", "production"].includes(environment))) {
    for (const origin of productionOrigins) allowed.add(origin);
  }
  if (!request) return configuredOrigin;

  // Browser checkout POSTs supply Origin even behind an internal reverse proxy.
  // If absent, the public request URL can be used only when it is allowlisted.
  const origin = request.headers.get("origin");
  if (origin) return allowed.has(origin) ? origin : configuredOrigin;
  const requestOrigin = new URL(request.url).origin;
  return allowed.has(requestOrigin) ? requestOrigin : configuredOrigin;
}

/** Persist this server-created value when inserting a payment, before provider I/O. */
export function newPlanCheckoutReturnUrl(locale: Locale, request?: Request) {
  return `${checkoutReturnOrigin(request)}${paymentReturnPath(locale)}?session_id={CHECKOUT_SESSION_ID}`;
}

/** A replay must keep the original Stripe parameters, including legacy attempts. */
export function planCheckoutReturnUrl(locale: Locale, storedReturnUrl: unknown, configuredSiteUrl = siteBaseUrl()) {
  if (typeof storedReturnUrl === "string" && storedReturnUrl) return storedReturnUrl;
  // Older rows may have reached Stripe before the response was saved locally.
  // Preserve their historical configured-host URL rather than the retry's host.
  return `${configuredSiteUrl}${paymentReturnPath(locale)}?session_id={CHECKOUT_SESSION_ID}`;
}
