import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  V9_PRODUCT_MASTER_SCHEMA,
  V9_RESET_TABLES,
  deterministicV9ProductUuid,
  storageProductIdForV9Id,
  validateV9ProductMasterPayload,
} from "@/lib/v9-product-master";

const UUID_PRODUCT_ID = "00000000-0000-4000-8000-000000000001";

function productFixture(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    brand: { name: "Brand A", status: "approved" },
    countries: [{ countryCode: "TH", currency: "THB" }],
    identifiers: id.startsWith("SCR-")
      ? [{ type: "mattanutra_sku", value: id }]
      : [{ type: "ean13", value: "8851234567890" }],
    ingredients: [{ name: "Vitamin C", amount: 500, unit: "mg" }],
    platform: id.startsWith("SCR-") ? "wholesale_pharmacy_import" : "manual",
    price: { amount: 1200, currency: "THB" },
    productAudience: "both",
    productKind: "supplement",
    productUrl: id.startsWith("SCR-") ? null : "https://example.com/product-a",
    region: "TH",
    regulatoryApprovals: [],
    status: "approved",
    titles: { canonical: "Product A" },
    translations: {
      en: { status: "complete", title: "Product A" },
      th: { status: "missing", title: null },
    },
    ...overrides,
  };
}

describe("v9 product master reset helpers", () => {
  it("validates v9 payloads and preserves UUID/SCR id semantics", () => {
    const payload = validateV9ProductMasterPayload({
      generatedAt: "2026-06-23T09:10:00.000Z",
      productCount: 2,
      products: [
        productFixture(UUID_PRODUCT_ID),
        productFixture("SCR-0001", {
          price: { amount: 782, currency: "THB" },
          productUrl: null,
          sourceUrl: null,
          status: "ignored",
        }),
      ],
      schema: V9_PRODUCT_MASTER_SCHEMA,
      scope: "FULL master (platform + additions) - full REPLACE of dashboard product list",
      summary: { total: 2 },
    });

    assert.equal(payload.productCount, 2);
    assert.equal(storageProductIdForV9Id(UUID_PRODUCT_ID), UUID_PRODUCT_ID);
    assert.match(storageProductIdForV9Id("SCR-0001"), /^[0-9a-f-]{36}$/);
    assert.equal(
      deterministicV9ProductUuid("SCR-0001"),
      deterministicV9ProductUuid("SCR-0001"),
    );
    assert.notEqual(storageProductIdForV9Id("SCR-0001"), "SCR-0001");
  });

  it("rejects malformed or partial v9 payloads", () => {
    assert.throws(
      () =>
        validateV9ProductMasterPayload({
          productCount: 1,
          products: [],
          schema: V9_PRODUCT_MASTER_SCHEMA,
        }),
      /productCount must match products\.length/,
    );
    assert.throws(
      () =>
        validateV9ProductMasterPayload({
          productCount: 1,
          products: [
            productFixture("SCR-ABC1", {
              price: { amount: 1200, currency: "THB" },
            }),
          ],
          schema: V9_PRODUCT_MASTER_SCHEMA,
        }),
      /invalid v9 id/,
    );
  });

  it("has static guardrails for DEV-only destructive reset and v9 platform support", async () => {
    const [dbSchema, productTypes, taskApplier, resetScript, packageJson] =
      await Promise.all([
        readFile("db-schema.sql", "utf8"),
        readFile("lib/product-recommendation-types.ts", "utf8"),
        readFile("lib/task-result-applier.ts", "utf8"),
        readFile("scripts/replace-dev-products-with-v9-master.ts", "utf8"),
        readFile("package.json", "utf8"),
      ]);

    assert.match(dbSchema, /wholesale_pharmacy_import/);
    assert.match(productTypes, /wholesale_pharmacy_import/);
    assert.match(taskApplier, /wholesale_pharmacy_import/);
    assert.match(resetScript, /MATTANUTRA_ENV=dev/);
    assert.match(resetScript, /--confirm-dev-reset-products/);
    assert.match(resetScript, /Refusing v9 product reset: DB_URL target looks like UAT\/PRD\/production/);
    assert.match(resetScript, /replaceDevProductsWithV9Master/);
    assert.match(packageJson, /products:v9:replace-dev/);
    assert.ok(V9_RESET_TABLES.includes("products"));
    assert.ok(V9_RESET_TABLES.includes("product_translations"));
    assert.ok(V9_RESET_TABLES.includes("retail_sellable_products"));
    assert.ok(V9_RESET_TABLES.includes("retail_product_stock"));
    assert.ok(V9_RESET_TABLES.includes("recommendations"));
    assert.ok(V9_RESET_TABLES.includes("tasks"));
  });
});
