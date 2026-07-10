import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getLandingPageCopy } from "../components/landing-page-copy.ts";
import {
  defaultLocale,
  indexableLocales,
  isLocale,
  publicLocales,
  resolveLocalizedText,
  siteLocaleRegistry
} from "../lib/i18n.ts";
import {
  defineLocaleBundle,
  getNamespace,
  resolveLocaleCopy
} from "../lib/i18n-messages.ts";
import {
  getSeoRouteCopy,
  indexableSeoRouteKeys,
  localizedAlternates,
  localizedMetadata,
  localizedPath,
  localizedRouteMetadata,
  localizedSeoStaticSitemapEntries,
  seoRouteKeys
} from "../lib/seo.ts";

const schema = readFileSync(new URL("../db-schema.sql", import.meta.url), "utf8");
const homePage = readFileSync(
  new URL("../app/[locale]/page.tsx", import.meta.url),
  "utf8"
);
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const bpmTracker = readFileSync(
  new URL("../components/bpm-tracker.tsx", import.meta.url),
  "utf8"
);
const adminFilters = readFileSync(
  new URL("../lib/admin-dashboard-filters.ts", import.meta.url),
  "utf8"
);
const localeSchemaScript = readFileSync(
  new URL("../scripts/apply-locale-schema.ts", import.meta.url),
  "utf8"
);
const localizationAuditScript = readFileSync(
  new URL("../scripts/audit-localization.ts", import.meta.url),
  "utf8"
);
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");

function expectedAbsoluteUrl(path: string) {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.MATTANUTRA_PUBLIC_SITE_URL ||
    "https://www.mattanutra.com"
  ).replace(/\/+$/, "");

  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

describe("locale registry and SEO helpers", () => {
  it("keeps current public locales registry driven", () => {
    assert.equal(defaultLocale, "en");
    assert.deepEqual(publicLocales, ["en", "th", "zh-CN"]);
    assert.deepEqual(indexableLocales, ["en", "th", "zh-CN"]);
    assert.equal(isLocale("en"), true);
    assert.equal(isLocale("th"), true);
    assert.equal(isLocale("zh-CN"), true);
    assert.equal(isLocale("fr"), false);
  });

  it("resolves localized text through locale fallback", () => {
    assert.equal(
      resolveLocalizedText({ en: "English", th: "Thai" }, "th"),
      "Thai"
    );
    assert.equal(resolveLocalizedText({ en: "English" }, "th"), "English");
    assert.equal(resolveLocalizedText({ ja: "Japanese" }, "th"), "Japanese");
  });

  it("resolves typed message namespaces through the locale fallback chain", () => {
    const bundle = defineLocaleBundle({
      en: {
        cta: "Start",
        nested: {
          items: ["one", "two"],
          title: "English title"
        }
      },
      th: {
        nested: {
          title: "หัวข้อ"
        }
      }
    } as const);

    assert.deepEqual(resolveLocaleCopy(bundle, "th"), {
      cta: "Start",
      nested: {
        items: ["one", "two"],
        title: "หัวข้อ"
      }
    });

    const landing = getNamespace<ReturnType<typeof getLandingPageCopy>>(
      "zh-CN",
      "customer.landing"
    );

    assert.equal(landing.hero.accent, "开始知量。");
    assert.equal(landing.journal.eyebrow, "MattaNutra 知识库");
  });

  it("builds localized canonical and alternates only for indexable pages", () => {
    const alternates = localizedAlternates({ path: "/terms" });

    assert.equal(alternates.languages["en"], expectedAbsoluteUrl("/en/terms"));
    assert.equal(alternates.languages["th"], expectedAbsoluteUrl("/th/terms"));
    assert.equal(alternates.languages["zh-CN"], expectedAbsoluteUrl("/zh-CN/terms"));
    assert.equal(alternates.languages["x-default"], expectedAbsoluteUrl("/en/terms"));
    assert.equal(localizedPath("th", "/nutrition/quiz"), "/th/nutrition/quiz");
    assert.equal(localizedPath("zh-CN", "/nutrition/quiz"), "/zh-CN/nutrition/quiz");

    const metadata = localizedMetadata({
      description: "Draft Thai page using fallback",
      indexable: false,
      locale: "th",
      path: "/draft",
      title: "Draft"
    });

    assert.deepEqual(metadata.robots, { follow: false, index: false });
    assert.equal(metadata.alternates, undefined);
  });

  it("localizes route metadata for every public SEO route", () => {
    for (const locale of publicLocales) {
      for (const routeKey of seoRouteKeys) {
        const route = getSeoRouteCopy(routeKey, locale);

        assert.ok(route.title.trim(), `${locale}.${routeKey} title`);
        assert.ok(route.description.trim(), `${locale}.${routeKey} description`);
      }
    }

    const reveal = localizedRouteMetadata({
      locale: "zh-CN",
      routeKey: "nutritionReveal"
    });

    assert.equal(reveal.title, "知量方案预览 | MattaNutra");
    assert.equal(reveal.description, "了解 MattaNutra 如何把评估转化为知量方案，整合保健品、食物、安全检查与药师可执行指导。");
    assert.equal(reveal.openGraph?.locale, "zh_CN");
    assert.equal(
      reveal.alternates?.canonical,
      expectedAbsoluteUrl("/zh-CN/nutrition/reveal")
    );
    assert.equal(
      reveal.alternates?.languages?.["zh-CN"],
      expectedAbsoluteUrl("/zh-CN/nutrition/reveal")
    );

    const privateCheckout = localizedRouteMetadata({
      indexable: false,
      locale: "zh-CN",
      routeKey: "paymentCheckout"
    });

    assert.deepEqual(privateCheckout.robots, { follow: false, index: false });
    assert.equal(privateCheckout.alternates, undefined);

    const fallbackContent = localizedRouteMetadata({
      fallbackUsed: true,
      locale: "th",
      routeKey: "nutritionQuiz"
    });

    assert.deepEqual(fallbackContent.robots, { follow: false, index: false });
  });

  it("builds a localized static sitemap from the SEO route registry only", () => {
    const urls = localizedSeoStaticSitemapEntries(
      new Date("2026-01-01T00:00:00.000Z")
    ).map((entry) => entry.url);

    assert.equal(urls.length, publicLocales.length * indexableSeoRouteKeys.length);
    assert.ok(urls.includes(expectedAbsoluteUrl("/zh-CN/nutrition/healthscore")));
    assert.ok(urls.includes(expectedAbsoluteUrl("/zh-CN/nutrition/reveal")));
    assert.ok(urls.includes(expectedAbsoluteUrl("/th/privacy")));
    assert.equal(urls.some((url) => url.includes("/admin")), false);
    assert.equal(urls.some((url) => url.includes("/basket/checkout")), false);
    assert.equal(urls.some((url) => url.includes("/nutrition/payment")), false);
    assert.equal(urls.some((url) => url.includes("/order/track")), false);
  });

  it("has locale registry and no hardcoded en/th locale checks in schema", () => {
    assert.match(schema, /CREATE TABLE public\.site_locales/);
    assert.match(schema, /CREATE TABLE public\.product_translations/);
    assert.match(schema, /CREATE TABLE public\.product_import_translations/);
    assert.match(schema, /translation_group_id uuid NOT NULL/);
    assert.match(schema, /testimonials_translation_group_locale_key/);
    assert.doesNotMatch(schema, /locale_check/);
    assert.doesNotMatch(schema, /ARRAY\['en'::text, 'th'::text\]/);
  });

  it("keeps route and filter locale handling ready for zh-CN", () => {
    assert.doesNotMatch(nextConfig, /\/:\w+\(en\|th\)/);
    assert.doesNotMatch(bpmTracker, /\(en\|th\)/);
    assert.doesNotMatch(adminFilters, /locale === "en" \|\| locale === "th"/);
    assert.match(nextConfig, /zh-CN/);
    assert.match(bpmTracker, /localeRoutePattern/);
    assert.match(adminFilters, /normalizeLocaleCode/);
  });

  it("uses scalable translation tables for Chinese product and supplement copy", () => {
    assert.match(localeSchemaScript, /siteLocaleRegistry/);
    assert.match(localeSchemaScript, /siteLocaleValuesSql/);
    assert.match(localeSchemaScript, /public\.product_translations/);
    assert.match(localeSchemaScript, /public\.product_import_translations/);
    assert.match(localeSchemaScript, /public\.supplement_translations/);
    assert.doesNotMatch(localeSchemaScript, /\('zh-CN', '中文', '简体中文'/);
    assert.doesNotMatch(localeSchemaScript, /title_zh/);
    assert.doesNotMatch(localeSchemaScript, /description_zh/);

    assert.deepEqual(
      siteLocaleRegistry.map((locale) => locale.code),
      publicLocales
    );
  });

  it("adds a read-only localization audit for code and DB coverage", () => {
    assert.match(packageJson, /"i18n:audit"/);
    assert.match(localizationAuditScript, /DOCUMENTED_LOCALE_BRANCH_ALLOWLIST/);
    assert.match(localizationAuditScript, /MACHINE_ONLY_ALLOWLIST/);
    assert.match(localizationAuditScript, /seoMetadataAudit/);
    assert.match(localizationAuditScript, /localizedSeoStaticSitemapEntries/);
    assert.match(localizationAuditScript, /public\.product_translations/);
    assert.match(localizationAuditScript, /public\.supplement_translations/);
    assert.match(localizationAuditScript, /public\.blog_posts/);
    assert.match(localizationAuditScript, /public\.testimonials/);
    assert.match(localizationAuditScript, /homepageVersion' = 'v15'/);
    assert.doesNotMatch(localizationAuditScript, /insert into public\./i);
    assert.doesNotMatch(localizationAuditScript, /update public\./i);
    assert.doesNotMatch(localizationAuditScript, /delete from public\./i);
  });

  it("keeps homepage build-time rendering off the remote database", () => {
    assert.match(homePage, /NEXT_PHASE === "phase-production-build"/);
    assert.match(homePage, /libraryArticles=\{\[\]\}/);
    assert.match(homePage, /testimonials=\{\[\]\}/);
    assert.ok(
      homePage.indexOf("isProductionBuildPhase()") <
        homePage.indexOf("checkDatabaseConnection()"),
      "production build guard must run before homepage DB checks"
    );
  });
});
