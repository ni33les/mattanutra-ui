/**
 * Public-web caching policy for locale routes.
 *
 * Marketing surfaces (home, library, terms, privacy) may use ISR / default
 * cache headers. Personal, session, admin, and checkout funnels must stay
 * no-store + typically force-dynamic on the route itself.
 */

/** ISR window for public marketing pages that read CMS/DB content. */
export const marketingPageRevalidateSeconds = 300;

/**
 * First path segment under `/:locale/...` that must never be CDN/browser cached
 * at the HTTP-header layer (admin, funnels, personal pages).
 */
export const noStoreLocaleRootSegments = [
  "admin",
  "assessment",
  "basket",
  "nutrition",
  "order"
] as const;

export type NoStoreLocaleRootSegment =
  (typeof noStoreLocaleRootSegments)[number];

export function isNoStoreLocaleRootSegment(
  segment: string | undefined
): segment is NoStoreLocaleRootSegment {
  return (
    typeof segment === "string" &&
    (noStoreLocaleRootSegments as readonly string[]).includes(segment)
  );
}

/**
 * True when a locale-prefixed pathname should receive no-store response headers.
 * Examples: `/en/admin`, `/th/nutrition/quiz`, `/zh-CN/basket/checkout`
 * False for: `/en`, `/en/library`, `/th/terms`, `/zh-CN/privacy`
 */
export function localePathRequiresNoStore(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length < 2) {
    return false;
  }

  return isNoStoreLocaleRootSegment(segments[1]);
}

/**
 * robots.txt disallow rules. Allows indexable marketing shells under nutrition
 * (quiz / healthscore / reveal) while blocking admin, APIs, and private funnels.
 */
export function robotsDisallowPaths(): string[] {
  return [
    "/admin",
    "/admin/",
    "/api/",
    "/*/admin",
    "/*/admin/",
    "/*/assessment",
    "/*/assessment/",
    "/*/basket/",
    "/*/nutrition/payment/",
    "/*/nutrition/refine",
    "/*/nutrition/refine/",
    "/*/order/"
  ];
}
