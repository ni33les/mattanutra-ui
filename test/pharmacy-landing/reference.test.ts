import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const reference = JSON.parse(readFileSync("test/pharmacy-landing/reference.json", "utf8"));
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

test("PHARM-LANDING assets retain the supplied font and mascot bytes", () => {
  assert.equal(reference.sources.length, 2);
  assert.equal(reference.assets.length, 5);
  for (const asset of reference.assets) assert.equal(hash(asset.file), asset.sha256, asset.file);
  assert.deepEqual(reference.views.map((view: { locale: string; width: number }) => [view.locale, view.width]),
    [["en", 1280], ["en", 390], ["th", 1280], ["th", 390]]);
});

test("PHARM-LANDING retains the existing site header, footer and journey wrapper", () => {
  // Routing now also supports pharmacy progress; retain the standard chrome contract.
  const source = readFileSync(reference.shell.file, "utf8");
  assert.ok(source.includes('<TitleBar currentLocale={locale} currentPath={currentPath} title={dictionary.hero.eyebrow}'));
  assert.ok(source.includes('assessmentHref={pharmacyPath(locale, slug, "quiz", {source: entrySource, session: step === "landing" ? query.session : undefined})} variant={step === "quiz" ? "quiz" : "default"} />'));
  assert.ok(source.includes('{step !== "quiz" && <SiteFooter locale={locale} content={dictionary.footer} />}'));
  assert.ok(source.includes('<PharmacyLanding locale={locale} slug={pharmacy.slug} name={pharmacy.name} query={{...query, source: acquisition.source}} />'));
});
