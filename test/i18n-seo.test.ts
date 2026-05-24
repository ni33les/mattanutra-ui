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

describe("locale registry and SEO helpers", () => {
  it("keeps current public locales registry driven", () => {
    assert.equal(defaultLocale, "en");
    assert.deepEqual(publicLocales, ["en", "th"]);
    assert.deepEqual(indexableLocales, ["en", "th"]);
    assert.equal(isLocale("en"), true);
    assert.equal(isLocale("th"), true);
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
    assert.equal(alternates.languages["x-default"], "https://www.mattanutra.com/en/terms");
    assert.equal(localizedPath("th", "/nutrition/quiz"), "/th/nutrition/quiz");

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
    assert.doesNotMatch(schema, /locale_check/);
    assert.doesNotMatch(schema, /ARRAY\['en'::text, 'th'::text\]/);
  });
});
