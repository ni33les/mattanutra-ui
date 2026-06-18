import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  assertProductImageRepairDatabaseTarget,
  candidateIsGenericOrUnsafe,
  classifyProductImageState,
  isMattaNutraCdnUrl,
  productImageCandidateScore,
  productImageRepairReportCsv,
  productImageRepairStorageKey,
  validateProductImageRepairOptions,
  type ProductImageRepairReport
} from "@/lib/product-image-repair";

describe("product image repair", () => {
  it("classifies missing, broken, healthy, and protected CDN image states", () => {
    assert.deepEqual(
      classifyProductImageState({ imageUrl: null, reachable: false }),
      { healthy: false, issue: "missing_image", reason: null }
    );
    assert.deepEqual(
      classifyProductImageState({
        imageUrl: "https://example.com/dead.jpg",
        reachable: false
      }),
      { healthy: false, issue: "broken_image", reason: null }
    );
    assert.deepEqual(
      classifyProductImageState({
        imageUrl: "https://example.com/good.jpg",
        reachable: true
      }),
      { healthy: true, issue: null, reason: null }
    );
    assert.deepEqual(
      classifyProductImageState({
        imageUrl: "https://mattanutra.sgp1.cdn.digitaloceanspaces.com/prd/products/a.jpg",
        reachable: true
      }),
      { healthy: true, issue: null, reason: "protected_good_cdn" }
    );
  });

  it("recognizes MattaNutra-owned image URLs", () => {
    assert.equal(
      isMattaNutraCdnUrl("https://mattanutra.sgp1.cdn.digitaloceanspaces.com/prd/products/x.jpg"),
      true
    );
    assert.equal(
      isMattaNutraCdnUrl("https://cdn.example.com/prd/products/x.jpg"),
      false
    );
  });

  it("scores same product evidence using title, brand, dose, and register number", () => {
    const strong = productImageCandidateScore({
      brandName: "Blackmores",
      candidateTitle: "Blackmores Bio C 1000 Daily Immune 30 tablets",
      evidenceText: "FDA 10-1-12345-5 product photo official Blackmores",
      productTitle: "BLACKMORES BIO C 1000MG DAILY IMU+ 30 TABS",
      registerNumbers: ["10-1-12345-5"]
    });
    const weak = productImageCandidateScore({
      brandName: "Blackmores",
      candidateTitle: "Blackmores Fish Oil 1000 400 capsules",
      evidenceText: "omega fish oil product",
      productTitle: "BLACKMORES BIO C 1000MG DAILY IMU+ 30 TABS",
      registerNumbers: ["10-1-12345-5"]
    });

    assert.ok(strong > 0.85, `expected strong match, got ${strong}`);
    assert.ok(weak < strong, `expected weak match below ${strong}, got ${weak}`);
  });

  it("rejects generic or non-health image candidates", () => {
    assert.equal(candidateIsGenericOrUnsafe("default-image placeholder logo"), true);
    assert.equal(candidateIsGenericOrUnsafe("cfmoto motorcycle vitamin c"), true);
    assert.equal(candidateIsGenericOrUnsafe("official vitamin c tablets product image"), false);
  });

  it("builds environment-specific Spaces keys for products", () => {
    const key = productImageRepairStorageKey({
      environment: "prd",
      extension: "webp",
      imageUrl: "https://example.com/product.webp",
      productId: "abc-123",
      title: "Mega We Care Calcium-D",
      uploadedAt: new Date("2026-06-18T00:00:00Z")
    });

    assert.match(key, /^prd\/products\/2026-06-18\/abc-123\/[a-f0-9]{12}-mega-we-care-calcium-d\.webp$/);
  });

  it("keeps apply mode behind Spaces configuration", () => {
    assert.doesNotThrow(() =>
      validateProductImageRepairOptions({ apply: false, spacesConfig: null })
    );
    assert.throws(
      () => validateProductImageRepairOptions({ apply: true, spacesConfig: null }),
      /DO_SPACES_ENDPOINT/
    );
  });

  it("refuses defaultdb and mismatched UAT/PRD database targets", () => {
    assert.throws(
      () =>
        assertProductImageRepairDatabaseTarget(
          "postgresql://user:pass@example.com/defaultdb",
          "uat"
        ),
      /defaultdb/
    );
    assert.throws(
      () =>
        assertProductImageRepairDatabaseTarget(
          "postgresql://user:pass@example.com/mattanutra-dev",
          "prd"
        ),
      /PRD database/
    );
    assert.doesNotThrow(() =>
      assertProductImageRepairDatabaseTarget(
        "postgresql://user:pass@example.com/mattanutra-prd",
        "prd"
      )
    );
  });

  it("exports resolved and unresolved rows with unresolved reasons", () => {
    const report: ProductImageRepairReport = {
      applied: false,
      before: { broken: 1, healthy: 2, missing: 1 },
      brandCounts: {},
      checked: 4,
      dryRun: true,
      environment: "uat",
      generatedAt: "2026-06-18T00:00:00.000Z",
      resolved: [{
        activeDelightSellable: true,
        brandName: "Mega We Care",
        evidenceUrl: "https://manufacturer.example/product",
        id: "p1",
        issue: "broken_image",
        newImageUrl: null,
        oldImageUrl: "https://broken.example/a.jpg",
        score: 0.91,
        source: "product_page",
        sourceTitle: "Mega product",
        storageKey: null,
        title: "Mega Product",
        updated: false
      }],
      retailerCounts: {},
      skippedHealthy: 2,
      sourceCounts: { product_page: 1 },
      updated: 0,
      unresolved: [{
        activeDelightSellable: false,
        brandName: "Unknown",
        detail: "no trusted match",
        id: "p2",
        issue: "missing_image",
        oldImageUrl: null,
        reason: "no_candidate",
        title: "Unknown Product"
      }]
    };

    const csv = productImageRepairReportCsv(report);

    assert.match(csv, /resolved_dry_run,p1/);
    assert.match(csv, /unresolved,p2/);
    assert.match(csv, /no_candidate/);
  });

  it("wires a dry-run-first CLI without product or sellable deletion", async () => {
    const [packageJson, scriptSource, librarySource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/repair-product-images.ts", "utf8"),
      readFile("lib/product-image-repair.ts", "utf8")
    ]);

    assert.match(packageJson, /products:images:repair/);
    assert.match(scriptSource, /hasArg\("apply"\)/);
    assert.match(scriptSource, /assertProductImageRepairDatabaseTarget/);
    assert.match(librarySource, /public\.products/);
    assert.match(librarySource, /public\.product_imports/);
    assert.match(librarySource, /DO_SPACES_ENDPOINT/);
    assert.match(librarySource, /productImageRepair/);
    assert.match(librarySource, /defaultdb/);
    assert.doesNotMatch(librarySource, /delete\s+from\s+public\.products/i);
    assert.doesNotMatch(librarySource, /delete\s+from\s+public\.retail_sellable_products/i);
  });
});
