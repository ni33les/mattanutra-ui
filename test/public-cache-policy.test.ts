import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  localePathRequiresNoStore,
  marketingPageRevalidateSeconds,
  noStoreLocaleRootSegments,
  robotsDisallowPaths
} from "../lib/public-cache-policy.ts";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const layoutSource = source("../app/[locale]/layout.tsx");
const nextConfig = source("../next.config.ts");
const proxySource = source("../proxy.ts");
const robotsSource = source("../app/robots.ts");
const revealPage = source("../app/[locale]/nutrition/reveal/page.tsx");
const quizPage = source("../app/[locale]/nutrition/quiz/page.tsx");
const basketCheckout = source("../app/[locale]/basket/checkout/page.tsx");
const adminLayout = source("../app/admin/layout.tsx");

describe("public cache and crawl policy", () => {
  it("keeps a short marketing ISR window aligned with marketing pages", () => {
    assert.equal(marketingPageRevalidateSeconds, 300);

    const homepage = source("../app/[locale]/page.tsx");
    const libraryIndex = source("../app/[locale]/library/page.tsx");
    const libraryArticle = source("../app/[locale]/library/[slug]/page.tsx");

    assert.match(homepage, /export const revalidate = 300/);
    assert.match(libraryIndex, /export const revalidate = 300/);
    assert.match(libraryArticle, /export const revalidate = 300/);
  });

  it("treats only personal/admin funnel roots as no-store under locale paths", () => {
    assert.deepEqual([...noStoreLocaleRootSegments], [
      "admin",
      "assessment",
      "basket",
      "nutrition",
      "order"
    ]);

    assert.equal(localePathRequiresNoStore("/en"), false);
    assert.equal(localePathRequiresNoStore("/en/library"), false);
    assert.equal(localePathRequiresNoStore("/th/library/some-slug"), false);
    assert.equal(localePathRequiresNoStore("/zh-CN/terms"), false);
    assert.equal(localePathRequiresNoStore("/en/privacy"), false);
    assert.equal(localePathRequiresNoStore("/en/blog/legacy"), false);

    assert.equal(localePathRequiresNoStore("/en/admin"), true);
    assert.equal(localePathRequiresNoStore("/en/admin/dashboard"), true);
    assert.equal(localePathRequiresNoStore("/th/assessment/results"), true);
    assert.equal(localePathRequiresNoStore("/zh-CN/basket/checkout"), true);
    assert.equal(localePathRequiresNoStore("/en/nutrition/quiz"), true);
    assert.equal(localePathRequiresNoStore("/en/nutrition/reveal"), true);
    assert.equal(localePathRequiresNoStore("/en/order/track/abc"), true);
  });

  it("disallows admin, api, and private funnels in robots.txt rules", () => {
    const disallow = robotsDisallowPaths();

    assert.ok(disallow.includes("/admin"));
    assert.ok(disallow.includes("/api/"));
    assert.ok(disallow.includes("/*/admin/"));
    assert.ok(disallow.includes("/*/assessment/"));
    assert.ok(disallow.includes("/*/basket/"));
    assert.ok(disallow.includes("/*/nutrition/payment/"));
    assert.ok(disallow.includes("/*/nutrition/refine/"));
    assert.ok(disallow.includes("/*/order/"));

    // Indexable marketing shells under nutrition remain crawlable.
    assert.equal(
      disallow.some((path) => path.includes("/nutrition/quiz")),
      false
    );
    assert.equal(
      disallow.some((path) => path.includes("/nutrition/healthscore")),
      false
    );
    assert.equal(
      disallow.some((path) => path.includes("/nutrition/reveal")),
      false
    );
    assert.equal(
      disallow.some((path) => path.includes("/library")),
      false
    );
  });

  it("wires policy into layout, next.config, proxy, and robots", () => {
    assert.doesNotMatch(layoutSource, /export const dynamic = "force-dynamic"/);
    assert.match(nextConfig, /noStoreLocaleRootSegments/);
    assert.match(nextConfig, /localeNoStoreHeaderSources/);
    assert.doesNotMatch(
      nextConfig,
      /source:\s*`\/:locale\(\$\{publicLocaleRoutePattern\}\)\/:path\*`/
    );
    assert.match(proxySource, /localePathRequiresNoStore/);
    assert.match(robotsSource, /robotsDisallowPaths/);
  });

  it("keeps personal funnels force-dynamic", () => {
    assert.match(revealPage, /export const dynamic = "force-dynamic"/);
    assert.match(revealPage, /export const fetchCache = "force-no-store"/);
    assert.match(revealPage, /export const revalidate = 0/);
    assert.match(quizPage, /export const dynamic = "force-dynamic"/);
    assert.match(basketCheckout, /export const dynamic = "force-dynamic"/);
    assert.match(adminLayout, /export const dynamic = "force-dynamic"/);
  });
});
