import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  defaultLocale,
  indexableLocales,
  isLocale,
  publicLocales,
  resolveLocalizedText
} from "../lib/i18n.ts";
import { localizedAlternates, localizedMetadata, localizedPath } from "../lib/seo.ts";

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

  it("builds localized canonical and alternates only for indexable pages", () => {
    const alternates = localizedAlternates({ path: "/terms" });

    assert.equal(alternates.languages["en"], "https://www.mattanutra.com/en/terms");
    assert.equal(alternates.languages["th"], "https://www.mattanutra.com/th/terms");
    assert.equal(alternates.languages["zh-CN"], "https://www.mattanutra.com/zh-CN/terms");
    assert.equal(alternates.languages["x-default"], "https://www.mattanutra.com/en/terms");
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
    assert.match(localeSchemaScript, /'zh-CN', '中文', '简体中文'/);
    assert.match(localeSchemaScript, /public\.product_translations/);
    assert.match(localeSchemaScript, /public\.product_import_translations/);
    assert.match(localeSchemaScript, /public\.supplement_translations/);
    assert.doesNotMatch(localeSchemaScript, /title_zh/);
    assert.doesNotMatch(localeSchemaScript, /description_zh/);
  });

  it("keeps homepage build-time rendering off the remote database", () => {
    assert.match(homePage, /NEXT_PHASE === "phase-production-build"/);
    assert.match(homePage, /blogPosts=\{\[\]\}/);
    assert.match(homePage, /testimonials=\{\[\]\}/);
    assert.ok(
      homePage.indexOf("isProductionBuildPhase()") <
        homePage.indexOf("checkDatabaseConnection()"),
      "production build guard must run before homepage DB checks"
    );
  });
});
