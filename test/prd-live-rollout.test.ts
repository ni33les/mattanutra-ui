import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  compareProtectedDataSnapshots,
  type ProtectedDataSnapshot
} from "@/lib/prd-protected-data";
import {
  findNaturalKeyConflictsInRows,
  PRD_LIVE_CATALOGUE_TABLE_POLICIES
} from "@/lib/prd-live-catalogue-sync";

function protectedSnapshot(
  overrides: Partial<ProtectedDataSnapshot["tables"][string]> = {}
): ProtectedDataSnapshot {
  return {
    capturedAt: "2026-07-03T00:00:00.000Z",
    tables: {
      payments: {
        checksum: "abc",
        exists: true,
        rowCount: 2,
        sums: { amount: "1000" },
        ...overrides
      }
    }
  };
}

describe("live-safe PRD rollout tooling", () => {
  it("detects protected runtime row and financial total loss", () => {
    const rowLoss = compareProtectedDataSnapshots(
      protectedSnapshot(),
      protectedSnapshot({ rowCount: 1, sums: { amount: "1000" } })
    );

    assert.equal(rowLoss.ok, false);
    assert.deepEqual(rowLoss.issues.map((issue) => issue.issue), [
      "row_count_decreased"
    ]);

    const sumLoss = compareProtectedDataSnapshots(
      protectedSnapshot(),
      protectedSnapshot({ rowCount: 2, sums: { amount: "999" } })
    );

    assert.equal(sumLoss.ok, false);
    assert.deepEqual(sumLoss.issues.map((issue) => issue.issue), ["sum_decreased"]);
  });

  it("blocks natural-key conflicts where PRD and UAT disagree on stable IDs", () => {
    const conflicts = findNaturalKeyConflictsInRows(
      {
        idColumn: "id",
        keyColumns: ["normalized_url"],
        table: "products"
      },
      [
        {
          id: "uat-product-id",
          normalized_url: "https://example.com/product"
        }
      ],
      [
        {
          id: "prd-product-id",
          normalized_url: "https://example.com/product"
        }
      ]
    );

    assert.deepEqual(conflicts, [
      {
        key: "https://example.com/product",
        keyColumns: ["normalized_url"],
        sourceId: "uat-product-id",
        table: "products",
        targetId: "prd-product-id"
      }
    ]);
  });

  it("keeps parent catalogue rows preserve-only and scopes child replacement", () => {
    assert.equal(PRD_LIVE_CATALOGUE_TABLE_POLICIES.products?.mode, "preserve_parent");
    assert.equal(PRD_LIVE_CATALOGUE_TABLE_POLICIES.supplements?.mode, "preserve_parent");
    assert.equal(PRD_LIVE_CATALOGUE_TABLE_POLICIES.finance_accounts?.mode, "preserve_parent");
    assert.equal(PRD_LIVE_CATALOGUE_TABLE_POLICIES.product_facts?.mode, "replace_scoped_child");
    assert.equal(
      PRD_LIVE_CATALOGUE_TABLE_POLICIES.supplement_country_availability?.mode,
      "replace_scoped_child"
    );
    assert.equal(
      PRD_LIVE_CATALOGUE_TABLE_POLICIES.supplement_safety_limits?.conflictColumns.join("|"),
      "supplement_id|version"
    );
    assert.equal(
      PRD_LIVE_CATALOGUE_TABLE_POLICIES.supplement_safety_limits?.mode,
      "append_only"
    );
  });

  it("wires guarded PRD scripts and includes supplement country availability in snapshots", async () => {
    const [
      packageJson,
      deployPrd,
      deployUat,
      syncPrd,
      syncLibrary,
      seedWorkerCredential,
      safety,
      protectedData,
      snapshotTables,
      delightScript,
      delightLibrary
    ] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/deploy-prd.mjs", "utf8"),
      readFile("scripts/deploy-uat.mjs", "utf8"),
      readFile("scripts/catalogue-sync-prd.ts", "utf8"),
      readFile("lib/prd-live-catalogue-sync.ts", "utf8"),
      readFile("scripts/seed-worker-credential.ts", "utf8"),
      readFile("lib/prd-rollout-safety.ts", "utf8"),
      readFile("scripts/prd-protected-data.ts", "utf8"),
      readFile("lib/catalogue-snapshot-tables.ts", "utf8"),
      readFile("scripts/delight-copy-available-products.ts", "utf8"),
      readFile("lib/delight-available-products-rollout.ts", "utf8")
    ]);

    assert.match(packageJson, /"deploy:prd"/);
    assert.match(packageJson, /"catalogue:sync-prd"/);
    assert.match(packageJson, /"prd:protected-data"/);
    assert.match(snapshotTables, /supplement_country_availability/);

    assert.match(deployPrd, /MATTANUTRA_CONFIRM_PRD_LIVE_ROLLOUT/);
    assert.match(deployPrd, /PRD_EXPECT_COMMIT: commit/);
    assert.match(deployPrd, /PRD_SMOKE_REQUIRE_FRESH_WORKERS/);
    assert.match(deployPrd, /products:v9:schema:apply/);
    assert.match(deployPrd, /DB_SCHEMA_URL: connection/);
    assert.match(deployPrd, /PRD_DB_SCHEMA_URL: connection/);
    assert.match(deployUat, /DB_SCHEMA_URL: connection/);
    assert.match(deployUat, /products:v9:schema:apply/);
    assert.match(syncPrd, /assertPrdPreserveConfirmation/);
    assert.match(syncLibrary, /input\.mode === "append_only"/);
    assert.match(syncLibrary, /"do nothing"/);
    assert.match(seedWorkerCredential, /assertPrdRuntimeEnvironment/);
    assert.match(seedWorkerCredential, /assertPrdDatabaseTarget/);
    assert.match(seedWorkerCredential, /MATTANUTRA_CONFIRM_PRD_WORKER_CREDENTIAL/);
    assert.match(seedWorkerCredential, /runtimeWorkerProfileForMode/);
    assert.match(seedWorkerCredential, /metadata->>'envKey'/);
    assert.match(safety, /MATTANUTRA_CONFIRM_PRD_LIVE_ROLLOUT/);

    for (const source of [deployPrd, syncPrd]) {
      assert.doesNotMatch(source, /prd:rebuild/);
      assert.doesNotMatch(source, /catalogue:reload/);
      assert.doesNotMatch(source, /reset-dev-db/);
      assert.doesNotMatch(source, /truncate\s+table/i);
    }

    for (const parentTable of [
      "products",
      "supplements",
      "product_brands",
      "finance_accounts",
      "foods",
      "site_locales"
    ]) {
      assert.doesNotMatch(syncPrd, new RegExp(`delete\\s+from\\s+public\\.${parentTable}`, "i"));
    }

    assert.match(syncPrd, /MATTANUTRA_CONFIRM_PRD_CATALOGUE_SYNC/);
    assert.match(protectedData, /compareProtectedDataSnapshots/);
    assert.doesNotMatch(seedWorkerCredential, /retail_sellable_products/);
    assert.doesNotMatch(seedWorkerCredential, /retail_product_stock/);
    assert.doesNotMatch(seedWorkerCredential, /panya_config_versions/);
    assert.match(delightScript, /normalized === "prd"/);
    assert.match(delightScript, /PRD_DB_URL/);
    assert.match(delightLibrary, /MATTANUTRA_CONFIRM_PRD_DELIGHT_COPY/);
    assert.match(delightLibrary, /copy-delight/);
    assert.match(delightLibrary, /const DELIGHT_ORG_SLUG = "delight-pharmacy"/);
    assert.doesNotMatch(delightLibrary, /stock_quantity\s*=\s*excluded\.stock_quantity/);
  });
});
