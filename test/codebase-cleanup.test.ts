import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CATALOGUE_SNAPSHOT_TABLES,
  catalogueSnapshotTableNames
} from "../lib/catalogue-snapshot-tables.ts";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { scripts?: Record<string, string> };
const assessment = readFileSync(
  new URL("../docs/codebase-cleanup-assessment.md", import.meta.url),
  "utf8"
);
const snapshotScript = readFileSync(
  new URL("../scripts/catalogue-snapshot.ts", import.meta.url),
  "utf8"
);
const reloadScript = readFileSync(
  new URL("../scripts/catalogue-reload.ts", import.meta.url),
  "utf8"
);
const resetCleanScript = readFileSync(
  new URL("../scripts/reset-dev-db-clean.mjs", import.meta.url),
  "utf8"
);
const auditScript = readFileSync(
  new URL("../scripts/audit-codebase.ts", import.meta.url),
  "utf8"
);

describe("codebase cleanup guardrails", () => {
  it("defines the cleanup scripts promised by the assessment", () => {
    for (const script of [
      "audit:codebase",
      "catalogue:reload",
      "catalogue:snapshot",
      "db:reset:dev:clean",
      "versions:core:apply",
      "versions:core:check"
    ]) {
      assert.ok(packageJson.scripts?.[script], `${script} must be defined`);
    }
  });

  it("snapshots every product and supplement catalogue table needed for reload", () => {
    const names = catalogueSnapshotTableNames();

    for (const table of [
      "product_admin_audit",
      "product_brand_countries",
      "product_brands",
      "product_countries",
      "product_facts",
      "product_import_runs",
      "product_imports",
      "product_offers",
      "product_versions",
      "products",
      "supplement_admin_audit",
      "supplement_aliases",
      "supplement_safety_limits",
      "supplement_versions",
      "supplements"
    ]) {
      assert.ok(names.includes(table), `${table} must be in snapshot scope`);
    }

    assert.ok(
      CATALOGUE_SNAPSHOT_TABLES.some((table) => !table.requiredForReload),
      "snapshot should distinguish reload-critical tables from useful audit tables"
    );
  });

  it("requires a curated snapshot before a clean dev reset", () => {
    assert.match(resetCleanScript, /MATTANUTRA_CATALOGUE_SNAPSHOT/);
    assert.match(resetCleanScript, /catalogue-reload\.ts/);
    assert.match(resetCleanScript, /--confirm-catalogue-reload/);
  });

  it("writes both portable and database catalogue backups", () => {
    assert.match(snapshotScript, /writeFile\(outputPath/);
    assert.match(snapshotScript, /create schema if not exists/);
    assert.match(snapshotScript, /create table [\s\S]+ as select \* from public/);
  });

  it("keeps reload guarded to dev-like database targets", () => {
    assert.match(reloadScript, /confirm-catalogue-reload/);
    assert.match(reloadScript, /NODE_ENV/);
    assert.match(reloadScript, /production/);
    assert.match(reloadScript, /product_imports/);
    assert.match(reloadScript, /review_task_id: null/);
  });

  it("keeps an honest DB-up assessment artifact", () => {
    for (const section of [
      "Live DB Inventory",
      "Foreign-Key Shape",
      "Current Source-of-Truth Policy",
      "Code Inventory",
      "Cleanup Decisions By Domain",
      "Reloadable Catalogue Snapshot"
    ]) {
      assert.match(assessment, new RegExp(`## ${section}`));
    }
  });

  it("provides a repeatable audit command for future reassessments", () => {
    assert.match(auditScript, /tableCounts/);
    assert.match(auditScript, /codeInventory/);
    assert.match(auditScript, /Direct SQL Write Hotspots/);
  });
});
