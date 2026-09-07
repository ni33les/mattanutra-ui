import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalogueRecordFingerprint, verifyCatalogueCorrection, type CatalogueCorrectionManifest } from "../lib/catalogue-corrections.ts";
import { parseProductAdministration } from "../lib/product-administration.ts";
const directory = new URL("../data/corrections/anna-v6-2026-09-07/", import.meta.url);
function read(name: string) { return JSON.parse(readFileSync(new URL(name, directory), "utf8")); }

test("ANNA-DATA-01 both environments review all 79 sellable identities without upgrading nutrient confidence", () => {
  for (const environment of ["dev", "uat"]) {
    const review = read(`${environment}-product-review.json`);
    assert.equal(review.environment, environment);
    assert.equal(review.products.length, 79);
    assert.equal(new Set(review.products.map((item: { productId: string }) => item.productId)).size, 79);
    const manifest = read(`${environment}-catalogue.json`) as CatalogueCorrectionManifest;
    assert.ok(manifest.corrections.length > 0);
    for (const item of review.products) {
      assert.ok(item.outcome && item.rationale && item.sources.length, `review evidence missing for ${item.productId}`);
      assert.equal(catalogueRecordFingerprint(item.before), item.beforeFingerprint);
    }
    for (const correction of manifest.corrections) {
      verifyCatalogueCorrection(correction);
      assert.ok(correction.correctionId.includes(`-${environment}-`));
      assert.ok(review.products.some((item: { productId: string }) => item.productId === (correction.before.product_id ?? correction.entityId)));
      assert.equal(correction.after.confidence, correction.before.confidence);
      if (correction.entityTable === "products") {
        const administration = parseProductAdministration(correction.after.administration);
        assert.ok(administration);
        assert.equal(administration.provenance.status, (correction.after.administration as { provenance: { status: string } }).provenance.status);
      }
    }
  }
});

test("ANNA-DATA-02 CALPLEX has a source-verified tablet basis while its pack quantity stays unknown", () => {
  for (const environment of ["dev", "uat"]) {
    const manifest = read(`${environment}-catalogue.json`) as CatalogueCorrectionManifest;
    const correction = manifest.corrections.find(item => item.entityId === "f0ac13e7-57b3-4fdb-b6f7-206ad8b6f0ef");
    assert.ok(correction);
    const administration = parseProductAdministration(correction.after.administration)!;
    assert.equal(administration.route, "oral"); assert.equal(administration.physicalUnit, "tablet");
    assert.equal(administration.unitsPerServing, 1); assert.equal(administration.doseIncrement, 1);
    assert.equal(administration.packQuantity, null);
    assert.equal(administration.provenance.status, "verified");
    assert.match(administration.provenance.sourceUrl!, /^https:\/\/www.vistra.co.th\//);
  }
});

test("ANNA-DATA-03 adult D3 corrects DEV and preserves UAT's 100 mcg amount with atomic scope retirement", () => {
  for (const environment of ["dev", "uat"]) {
    const manifest = read(`${environment}-references.json`);
    assert.equal(manifest.environment, environment); assert.equal(manifest.reviewedHeadCount, 18);
    assert.equal(manifest.corrections.length, 6);
    const d3 = manifest.corrections.find((item: { supplementId: string }) => item.supplementId === "927083fb-b90a-5a24-b4c5-5067b06ead5f");
    assert.ok(d3); assert.match(d3.expectedHeadsFingerprint, /^[a-f0-9]{64}$/);
    const active = d3.changes.find((item: { lifeStage: string; sourceScope: string }) => item.lifeStage === "adult" && item.sourceScope === "total");
    const retired = d3.changes.find((item: { lifeStage: string; sourceScope: string }) => item.lifeStage === "adult" && item.sourceScope === "supplemental");
    assert.equal(active.maxAmount, 100); assert.equal(active.maxUnit, "mcg/day"); assert.equal(retired.maxAmount, null);
    assert.equal(d3.evidence.originalAdultAmount, environment === "dev" ? 1000 : 100);
    for (const correction of manifest.corrections) {
      assert.equal(correction.environment, environment);
      assert.ok(correction.changes.every((item: { sourceUrl: string; basisRationale: string }) => item.sourceUrl.startsWith("https://") && item.basisRationale.length > 20));
    }
  }
});

test("ANNA-DATA-04 an environment-specific manifest cannot write the other environment or an arbitrary local database", async () => {
  const { validateCatalogueCorrectionTarget } = await import("../lib/catalogue-corrections.ts");
  const manifest = { version: 1 as const, environment: "uat" as const, corrections: [] };
  assert.doesNotThrow(() => validateCatalogueCorrectionTarget(manifest, "uat", "postgresql://example.test/mn-uat"));
  assert.throws(() => validateCatalogueCorrectionTarget(manifest, "dev", "postgresql://example.test/mn-dev"), /matching reviewed/);
  assert.throws(() => validateCatalogueCorrectionTarget(manifest, "uat", "postgresql://example.test/mn-dev"), /does not match/);
  assert.throws(() => validateCatalogueCorrectionTarget(manifest, "dev", "postgresql://127.0.0.1/live"), /matching reviewed/);
  assert.doesNotThrow(() => validateCatalogueCorrectionTarget(manifest, "dev", "postgresql://127.0.0.1:55436/mattanutra_lock_review_anna"));
});
