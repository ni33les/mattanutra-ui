import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  PRODUCT_CATALOGUE_CSV_HEADERS,
  parseProductCatalogueCsv,
} from "@/lib/product-catalogue-csv";

describe("product catalogue CSV", () => {
  it("uses one round-trip sheet for product identity, regulation, stock, and backorders", () => {
    assert.deepEqual(PRODUCT_CATALOGUE_CSV_HEADERS.slice(0, 6), [
      "SKU",
      "Brand",
      "Name",
      "English Name",
      "Thai Name",
      "Product URL",
    ]);
    assert.ok(PRODUCT_CATALOGUE_CSV_HEADERS.includes("FDA Approval"));
    assert.ok(PRODUCT_CATALOGUE_CSV_HEADERS.includes("Regulatory Approvals"));
    assert.ok(PRODUCT_CATALOGUE_CSV_HEADERS.includes("Manufacturer SKU"));
    assert.ok(PRODUCT_CATALOGUE_CSV_HEADERS.includes("Barcode"));
    assert.ok(PRODUCT_CATALOGUE_CSV_HEADERS.includes("Quantity in Stock"));
    assert.ok(PRODUCT_CATALOGUE_CSV_HEADERS.includes("Backorder Demand"));
    assert.ok(PRODUCT_CATALOGUE_CSV_HEADERS.includes("Backorder Policy"));
  });

  it("parses exported column aliases used by operators", () => {
    const rows = parseProductCatalogueCsv(
      [
        "Internal SKU,Manufacturer,Name,FDA Approval,Manufacturer SKU,Barcode,Quantity in Stock",
        "00000000-0000-4000-8000-000000000001,Brand A,Product A,TH-123,MSKU-1,1234567890128,4",
      ].join("\n"),
    );

    assert.equal(rows.length, 1);
    assert.equal(
      rows[0]?.columns.internal_sku,
      "00000000-0000-4000-8000-000000000001",
    );
    assert.equal(rows[0]?.columns.manufacturer, "Brand A");
    assert.equal(rows[0]?.columns.fda_approval, "TH-123");
    assert.equal(rows[0]?.columns.manufacturer_sku, "MSKU-1");
    assert.equal(rows[0]?.columns.quantity_in_stock, "4");
  });

  it("wires product and retail admin import/export controls", async () => {
    const [productView, retailView, exportRoute, importRoute, service] =
      await Promise.all([
        readFile("components/admin/product-view.tsx", "utf8"),
        readFile("components/admin/retail-stock-view.tsx", "utf8"),
        readFile("app/api/admin/products/catalogue/export/route.ts", "utf8"),
        readFile("app/api/admin/products/catalogue/import/route.ts", "utf8"),
        readFile("lib/product-catalogue-csv.ts", "utf8"),
      ]);

    assert.match(
      productView,
      /\/api\/admin\/products\/catalogue\/export\?scope=platform/,
    );
    assert.match(productView, /\/api\/admin\/products\/catalogue\/import/);
    assert.match(
      retailView,
      /\/api\/admin\/products\/catalogue\/export\?scope=retail/,
    );
    assert.match(retailView, /importRetailProductCatalogueFile/);
    assert.match(exportRoute, /buildProductCatalogueCsv/);
    assert.match(importRoute, /applyProductCatalogueCsvImport/);
    assert.match(service, /createAdminProduct/);
    assert.match(service, /updateAdminProduct/);
    assert.match(service, /"internal sku"/);
    assert.match(service, /byFingerprint/);
    assert.match(service, /productRowFingerprint/);
    assert.match(service, /registerProductMatch\(matches/);
    assert.match(service, /New products require Brand\/Manufacturer and Name/);
    assert.match(
      service,
      /Internal SKU must be a valid existing product UUID or be blank for a new product/,
    );
    assert.match(service, /catch \(error\)/);
    assert.match(service, /retail_stock_movements/);
    assert.match(service, /Backorder Demand/);
  });
});
