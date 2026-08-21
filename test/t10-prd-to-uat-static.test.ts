import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  T10_CATALOGUE_GROUPS,
  T10_PRD_RETAIL_SOURCE,
  derivePrdCatalogueSourceUrl,
  deriveUatCatalogueTargetUrl,
  isPrdCatalogueDatabase,
  isUatCatalogueDatabase
} from "@/lib/catalogue-env-urls";

describe("T10 PRD to UAT catalogue sync", () => {
  it("reuses the existing four catalogue groups and does not invent tables", () => {
    assert.deepEqual(Object.keys(T10_CATALOGUE_GROUPS), [
      "food",
      "supplement",
      "platform-product",
      "retail-product"
    ]);
    assert.ok(T10_CATALOGUE_GROUPS.food.includes("foods"));
    assert.ok(T10_CATALOGUE_GROUPS.supplement.includes("supplements"));
    assert.ok(T10_CATALOGUE_GROUPS["platform-product"].includes("products"));
    assert.deepEqual([...T10_CATALOGUE_GROUPS["retail-product"]], [
      "retail_sellable_products",
      "retail_product_stock"
    ]);
    assert.deepEqual([...T10_PRD_RETAIL_SOURCE.organisationSlugs], ["delight-pharmacy"]);
    assert.equal(T10_PRD_RETAIL_SOURCE.productStatus, "approved");
    assert.match(T10_PRD_RETAIL_SOURCE.query, /status = 'approved'/);
    assert.doesNotMatch(T10_PRD_RETAIL_SOURCE.query, /enchanted-pharmacy/);
  });

  it("derives the existing PRD pool and UAT target from mn-dev", () => {
    const source = "postgres://mn:x@db.example:25061/mn-dev?sslmode=require";
    const prd = derivePrdCatalogueSourceUrl(source) ?? "";
    const uat = deriveUatCatalogueTargetUrl(source) ?? "";

    assert.match(prd, /\/mn-pool-prd/);
    assert.match(uat, /\/mn-uat/);
    assert.equal(isPrdCatalogueDatabase(prd), true);
    assert.equal(isUatCatalogueDatabase(uat), true);
    assert.equal(isUatCatalogueDatabase(prd), false);
    assert.equal(isPrdCatalogueDatabase(uat), false);
  });

  it("wires the job through existing snapshot/align rails with UAT confirmation", async () => {
    const [job, platformAlign, retailAlign, packageJson] = await Promise.all([
      readFile("scripts/t10-prd-to-uat-catalogues.ts", "utf8"),
      readFile("scripts/catalogue-align-from-snapshot.ts", "utf8"),
      readFile("scripts/retail-catalogue-align-from-snapshot.ts", "utf8"),
      readFile("package.json", "utf8")
    ]);

    assert.match(packageJson, /"catalogue:t10-prd-to-uat"/);
    assert.match(job, /scripts\/catalogue-snapshot.ts/);
    assert.match(job, /scripts\/retail-snapshot.ts/);
    assert.match(job, /scripts\/catalogue-align-from-snapshot.ts/);
    assert.match(job, /scripts\/retail-catalogue-align-from-snapshot.ts/);
    assert.match(job, /MATTANUTRA_CONFIRM_UAT_CATALOGUE_SYNC/);
    assert.match(job, /prd-to-uat/);
    assert.match(job, /--no-db-backup/);
    assert.match(job, /--retain-blocked-stale-products/);
    assert.match(job, /--snapshot-orgs-only/);
    assert.match(job, /written: sumForTables/);
    assert.match(job, /retained: retainedProductIds.length/);
    assert.match(job, /cannotBeSoldOnDelight/);
    assert.match(job, /T10_PRD_RETAIL_SOURCE/);
    assert.match(job, /enchanted-pharmacy is a UAT-only tenant/);
    assert.doesNotMatch(job, /from "@\/lib\/matcher/);
    assert.doesNotMatch(job, /create table/);
    assert.match(platformAlign, /MATTANUTRA_CONFIRM_UAT_CATALOGUE_ALIGN/);
    assert.match(platformAlign, /target-env=uat/);
    assert.match(platformAlign, /retain-blocked-stale-products/);
    assert.match(platformAlign, /spec.idColumn === "product_id"/);
    assert.match(retailAlign, /MATTANUTRA_CONFIRM_UAT_RETAIL_CATALOGUE_ALIGN/);
    assert.match(retailAlign, /on conflict \(organisation_id, product_id\)/);
    assert.match(retailAlign, /snapshot-orgs-only/);
    assert.match(platformAlign, /on conflict \(\$\{sql\.unsafe\(conflictSql\)\}\) /);
  });
});
