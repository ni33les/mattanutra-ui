import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  PLATFORM_CATALOGUE_ALIGNMENT_TABLES,
  PLATFORM_CATALOGUE_REQUIRED_NON_EMPTY_TABLES,
  PRD_CATALOGUE_ROLLOUT_PROTECTED_ALLOWLIST,
  RETAIL_CATALOGUE_TABLES,
  RETAIL_STOCK_LIVE_COLUMNS,
  catalogueRowsHash
} from "@/lib/catalogue-alignment";

describe("catalogue alignment rollout tooling", () => {
  it("scopes exact platform alignment to supplement/product/food catalogue data", () => {
    const tableNames = PLATFORM_CATALOGUE_ALIGNMENT_TABLES.map((table) => table.name);

    for (const required of [
      "supplements",
      "supplement_aliases",
      "supplement_country_availability",
      "products",
      "product_brands",
      "product_facts",
      "product_identifiers",
      "foods",
      "food_nutrient_profiles",
      "food_translations"
    ]) {
      assert.ok(tableNames.includes(required), `${required} is aligned`);
    }

    for (const preserved of [
      "finance_accounts",
      "finance_transactions",
      "payments",
      "retail_customer_orders",
      "retail_order_settlements",
      "people",
      "organisations",
      "blog_posts",
      "testimonials"
    ]) {
      assert.equal(tableNames.includes(preserved), false, `${preserved} is not mirrored`);
    }

    assert.deepEqual([...PLATFORM_CATALOGUE_REQUIRED_NON_EMPTY_TABLES], [
      "supplements",
      "products",
      "foods"
    ]);
  });

  it("keeps retail mirror to catalogue tables and preserves live stock quantities", () => {
    assert.deepEqual([...RETAIL_CATALOGUE_TABLES], [
      "retail_sellable_products",
      "retail_product_stock"
    ]);
    assert.deepEqual([...RETAIL_STOCK_LIVE_COLUMNS], ["stock_quantity"]);
    assert.deepEqual([...PRD_CATALOGUE_ROLLOUT_PROTECTED_ALLOWLIST], [
      "product_recommendation_decisions",
      "product_recommendation_items",
      "retail_sellable_products",
      "retail_product_stock"
    ]);
  });

  it("uses stable row hashing for parity reports", () => {
    assert.equal(
      catalogueRowsHash([
        { b: 2, a: 1 },
        { c: ["x", "y"] }
      ]),
      catalogueRowsHash([
        { c: ["x", "y"] },
        { a: 1, b: 2 }
      ])
    );
  });

  it("wires guarded scripts without rebuild/reset rollout paths", async () => {
    const [
      packageJson,
      platformScript,
      retailScript,
      parityScript,
      retailSnapshot
    ] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/catalogue-align-from-snapshot.ts", "utf8"),
      readFile("scripts/retail-catalogue-align-from-snapshot.ts", "utf8"),
      readFile("scripts/catalogue-parity-report.ts", "utf8"),
      readFile("scripts/retail-snapshot.ts", "utf8")
    ]);

    assert.match(packageJson, /"catalogue:align"/);
    assert.match(packageJson, /"retail:catalogue-align"/);
    assert.match(packageJson, /"catalogue:parity"/);

    for (const source of [platformScript, retailScript]) {
      assert.match(source, /assertPrdRuntimeEnvironment/);
      assert.match(source, /assertPrdDatabaseTarget/);
      assert.match(source, /assertPrdPreserveConfirmation/);
      assert.match(source, /captureProtectedDataSnapshot/);
      assert.doesNotMatch(source, /prd:rebuild/);
      assert.doesNotMatch(source, /catalogue:reload/);
      assert.doesNotMatch(source, /reset-dev-db/);
    }

    assert.match(platformScript, /MATTANUTRA_CONFIRM_PRD_CATALOGUE_ALIGN/);
    assert.match(platformScript, /PRODUCT_STALE_BLOCKER_TABLES/);
    assert.match(platformScript, /product_recommendation_items_no_update_delete/);
    assert.match(retailScript, /MATTANUTRA_CONFIRM_PRD_RETAIL_CATALOGUE_ALIGN/);
    assert.match(retailScript, /RETAIL_STOCK_LIVE_COLUMNS/);
    assert.match(parityScript, /normalizedRetailRows/);
    assert.match(retailSnapshot, /organisations/);
    assert.match(retailSnapshot, /include-deleted/);
  });
});
