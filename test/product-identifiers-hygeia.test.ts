import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  ean13ChecksumValid,
  extractTrustedIdentifierEvidence,
  normalizeIdentifierValue,
  productIdentifiersFromBody
} from "@/lib/product-identifiers";
import { parseHygeiaCsv } from "@/lib/hygeia-product-files";

describe("product identifiers and Hygeia files", () => {
  it("validates and normalizes EAN-13 identifiers", () => {
    assert.equal(normalizeIdentifierValue("ean13", "4006 3813 3393 1"), "4006381333931");
    assert.equal(ean13ChecksumValid("4006381333931"), true);
    assert.equal(normalizeIdentifierValue("ean13", "4006381333932"), null);
    assert.deepEqual(productIdentifiersFromBody([
      {
        source: "admin",
        type: "ean13",
        value: "4006381333931"
      },
      {
        source: "admin",
        type: "ean13",
        value: "not-a-barcode"
      },
      {
        source: "admin",
        type: "internal_sku",
        value: "MN-OLD"
      }
    ]), [
      {
        confidence: "medium",
        evidenceUrl: null,
        source: "admin",
        type: "ean13",
        value: "4006381333931"
      }
    ]);
  });

  it("extracts trusted manufacturer identifier evidence from structured data", () => {
    const evidence = extractTrustedIdentifierEvidence({
      evidenceUrl: "https://manufacturer.example/product",
      html: `
        <script type="application/ld+json">
          {"@type":"Product","name":"Example","gtin13":"4006381333931","sku":"MN-ABC"}
        </script>
      `
    }) as Array<{ autoApprove?: boolean; source: string; type: string; value: string }>;

    assert.ok(evidence.some((item) =>
      item.type === "ean13" &&
      item.value === "4006381333931" &&
      item.autoApprove === true &&
      item.source === "manufacturer_structured_data"
    ));
    assert.ok(evidence.some((item) =>
      item.type === "manufacturer_sku" &&
      item.value === "MN-ABC"
    ));
  });

  it("parses Hygeia CSV rows without retaining unmatched raw row payloads", () => {
    const rows = parseHygeiaCsv(
      [
        "Internal SKU,Manufacturer SKU,EAN13 Barcode,Thai Product Title,Stock Quantity,Wholesale Price,Retail Price",
        "00000000-0000-0000-0000-000000000001,MN-ABC,4006381333931,\"สินค้า, ทดสอบ\",7,120.50,180"
      ].join("\n")
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.rowNumber, 2);
    assert.equal(rows[0]?.columns.internal_sku, "00000000-0000-0000-0000-000000000001");
    assert.equal(rows[0]?.columns.manufacturer_sku, "MN-ABC");
    assert.equal(rows[0]?.columns.ean13_barcode, "4006381333931");
    assert.equal(rows[0]?.columns.thai_product_title, "สินค้า, ทดสอบ");
  });

  it("keeps identifier and Hygeia schema in authoritative schema/apply scripts", async () => {
    const schema = await readFile("db-schema.sql", "utf8");
    const apply = await readFile("scripts/apply-product-identifier-schema.ts", "utf8");

    for (const source of [schema, apply]) {
      assert.match(source, /product_identifiers/);
      assert.match(source, /product_identifier_candidates/);
      assert.match(source, /retail_product_cost_observations/);
      assert.match(source, /product_identifiers_active_type_value_key/);
      assert.doesNotMatch(source, /identifier_type in \([^)]*internal_sku/);
      assert.doesNotMatch(source, /ARRAY\[[^\]]*internal_sku[^\]]*\]/);
    }

    assert.match(apply, /where identifier_type = 'internal_sku'/);
  });

  it("keeps Hygeia import as preview-first and matched-row only", async () => {
    const route = await readFile("app/api/admin/products/hygeia/import/route.ts", "utf8");
    const service = await readFile("lib/hygeia-product-files.ts", "utf8");

    assert.match(route, /body\.apply === true[\s\S]*applyHygeiaImport/);
    assert.match(route, /previewHygeiaImport/);
    assert.match(service, /unmatchedCount \+= 1/);
    assert.match(service, /matchedRows\.push/);
    assert.match(service, /\"Internal SKU\"/);
    assert.match(service, /\"Manufacturer SKU\"/);
    assert.doesNotMatch(service, /\"MattaNutra Product ID\"/);
    assert.match(service, /row\.product_id,\s*row\.manufacturer_sku,\s*row\.ean13/);
    assert.match(service, /buildRetailHygeiaStockExportCsv/);
    assert.match(service, /public\.retail_sellable_products/);
    assert.doesNotMatch(service, /type: "internal_sku"/);
    assert.doesNotMatch(service, /internalSku/);
    assert.doesNotMatch(service, /unmatchedRows/);
  });
});
