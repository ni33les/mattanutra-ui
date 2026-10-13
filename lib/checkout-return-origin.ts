import { siteBaseUrl } from "@/lib/site-url";

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
