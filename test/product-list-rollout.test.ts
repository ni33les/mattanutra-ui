import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  assertProductListRolloutDatabaseTarget,
  parseProductListRolloutCsv,
  productListRolloutCounts,
  productListRolloutRetailPolicy
} from "@/lib/product-list-rollout";

describe("product list rollout", () => {
  it("parses the supplied 84-column product export and applies the DHC retail rule", async () => {
    const csv = await readFile("/root/files/new-prodcuts.csv", "utf8");
    const parsed = parseProductListRolloutCsv(csv);
    const counts = productListRolloutCounts(parsed.rows);

    assert.equal(parsed.invalidRows.length, 0);
    assert.deepEqual(counts, {
      dhcRows: 329,
      existingRows: 590,
      newRows: 35,
      nonDhcRows: 296,
      rows: 625
    });
    assert.equal(parsed.rows.filter((row) => row.selectedRetail).length, 296);
    assert.equal(parsed.rows.filter((row) => row.isDhc && row.selectedRetail).length, 0);
    assert.equal(parsed.rows.filter((row) => !row.isDhc && row.rrpAmount === null).length, 0);
  });

  it("generates stable UUIDs for MN-ADD rows across parses", () => {
    const csv = [
      "product_id,brand_name,title,product_url,source_url,delight_rrp_price_amount,currency,record_source",
      "MN-ADD-001,NOW Foods,NOW Foods Resveratrol,https://example.com/a,https://example.com/a,959,THB,new_addition"
    ].join("\n");
    const first = parseProductListRolloutCsv(csv).rows[0];
    const second = parseProductListRolloutCsv(csv).rows[0];

    assert.ok(first);
    assert.ok(second);
    assert.match(first.canonicalProductId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(first.canonicalProductId, second.canonicalProductId);
  });

  it("approves non-DHC retail rows and keeps DHC master-only", () => {
    const parsed = parseProductListRolloutCsv([
      "product_id,brand_name,title,product_url,source_url,delight_rrp_price_amount,currency,product_status",
      "00000000-0000-4000-8000-000000000001,DHC,DHC C,https://example.com/dhc,https://example.com/dhc,100,THB,ignored",
      "MN-ADD-002,NOW Foods,NOW Plant,https://example.com/now,https://example.com/now,200,THB,pending_review"
    ].join("\n"));
    const [dhc, now] = parsed.rows;

    assert.ok(dhc);
    assert.ok(now);
    assert.deepEqual(productListRolloutRetailPolicy(dhc), {
      disableRetailSellables: true,
      selectedRetail: false,
      targetStatus: "ignored"
    });
    assert.deepEqual(productListRolloutRetailPolicy(now), {
      disableRetailSellables: false,
      selectedRetail: true,
      targetStatus: "approved"
    });
  });

  it("refuses PRD/defaultdb and mismatched targets", () => {
    assert.throws(
      () =>
        assertProductListRolloutDatabaseTarget(
          "postgresql://user:pass@example.com/defaultdb",
          "dev"
        ),
      /Refusing/
    );
    assert.throws(
      () =>
        assertProductListRolloutDatabaseTarget(
          "postgresql://user:pass@example.com/mattanutra-prd",
          "uat"
        ),
      /Refusing/
    );
    assert.throws(
      () =>
        assertProductListRolloutDatabaseTarget(
          "postgresql://user:pass@example.com/mn-dev",
          "uat"
        ),
      /Expected UAT/
    );
    assert.doesNotThrow(() =>
      assertProductListRolloutDatabaseTarget(
        "postgresql://user:pass@example.com/mn-uat",
        "uat"
      )
    );
  });

  it("wires a dry-run first CLI and avoids stock quantity updates", async () => {
    const [packageJson, scriptSource, librarySource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/product-list-rollout.ts", "utf8"),
      readFile("lib/product-list-rollout.ts", "utf8")
    ]);

    assert.match(packageJson, /product-list:rollout/);
    assert.match(scriptSource, /hasArg\("apply"\)/);
    assert.match(scriptSource, /deriveUatDbUrl/);
    assert.match(librarySource, /product_list_rollout_2026_06/);
    assert.match(librarySource, /mirrorImageToFirstParty/);
    assert.match(librarySource, /stock_quantity,\s*\n\s*lead_time_days/);
    assert.doesNotMatch(librarySource, /stock_quantity\s*=\s*excluded\.stock_quantity/);
    assert.doesNotMatch(librarySource, /delete\s+from\s+public\.retail_sellable_products/i);
  });
});
