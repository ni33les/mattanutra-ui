import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  PRODUCT_CATALOGUE_CSV_HEADERS,
  parseProductCatalogueCsv,
  platformProductCatalogueJsonProductFromRow,
} from "@/lib/product-catalogue-csv";
import type { AdminProductRow } from "@/lib/admin-products";

function deepKeys(value: unknown, keys = new Set<string>()) {
  if (!value || typeof value !== "object") {
    return keys;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepKeys(item, keys);
    }

    return keys;
  }

  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    deepKeys(child, keys);
  }

  return keys;
}

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

  it("exports platform products as focused admin JSON without retail, price, or runtime metadata", () => {
    const exported = platformProductCatalogueJsonProductFromRow({
      availabilityStatus: "in_stock",
      availableCountryCodes: ["TH"],
      brandId: "brand-1",
      brandName: "Brand A",
      brandStatus: "approved",
      category: "Supplement",
      countryPricing: [
        {
          countryCode: "TH",
          currency: "THB",
          priceUpdatedAt: "2026-01-01T00:00:00.000Z",
          rrpPriceAmount: 990,
        },
      ],
      currency: "THB",
      description: "Canonical description",
      displayDescription: "Canonical description",
      displayTitle: "Product A",
      facts: [
        {
          aliasKeys: ["vitamin_c"],
          amount: 500,
          confidence: "high",
          id: "fact-1",
          itemType: "supplement",
          maxAmount: null,
          maxUnit: null,
          name: "Vitamin C",
          normalizedName: "vitamin c",
          safetyFlags: [],
          servingLabel: "per tablet",
          source: "label",
          sourceText: "Vitamin C 500 mg",
          sourceUrl: "https://example.com/label",
          supplementStatus: "active",
          unit: "mg",
        },
      ],
      id: "00000000-0000-4000-8000-000000000001",
      imageUrl: "https://cdn.mattanutra.com/products/product-a.webp",
      importReviewTaskId: null,
      importStatus: null,
      identifierCandidates: [],
      identifiers: [],
      labelStatus: "parsed",
      manufacturerCountryCodes: ["TH"],
      platform: "manual",
      productAudience: "both",
      productImportDuplicateProductIds: [],
      productImportId: null,
      productKind: "supplement",
      productUrl: "https://example.com/product-a",
      recommendationHistory: {
        averageProductCoveragePercent: null,
        averageStackCoveragePercent: null,
        chosenCount: 0,
        lastRecommendedAt: null,
      },
      region: "TH",
      regulatoryApprovals: [],
      shopAvailability: [
        {
          backorderPolicy: "allow",
          currency: "THB",
          leadTimeDays: 2,
          organisationId: "org-1",
          organisationName: "Retail Shop",
          retailPriceAmount: 1200,
          status: "active",
          stockQuantity: 4,
          wholesalePriceAmount: 800,
        },
      ],
      sourceEvidence: {
        importId: null,
        importReviewTaskId: null,
        importStatus: null,
        sourceUrl: "https://example.com/source",
      },
      status: "approved",
      title: "Product A",
      translations: {
        th: {
          description: "Translated Thai description",
          locale: "th",
          status: "complete",
          title: "Translated Thai title",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
      validation: { status: "pass" },
      validationCacheStatus: "fresh",
      validationCacheStaleReasons: [],
      validationLabel: "Approved",
    } as unknown as AdminProductRow);

    assert.equal(
      exported.canonicalImageUrl,
      "https://cdn.mattanutra.com/products/product-a.webp",
    );
    assert.equal(exported.ingredients[0]?.name, "Vitamin C");
    assert.equal(exported.translations.th?.title, "Translated Thai title");
    assert.deepEqual(Object.keys(exported.titles).sort(), [
      "canonical",
      "display",
    ]);
    assert.deepEqual(Object.keys(exported.descriptions).sort(), [
      "canonical",
      "display",
    ]);
    assert.doesNotMatch(
      [...deepKeys(exported)].sort().join("\n"),
      /backorder|descriptionEn|descriptionTh|identifierCandidates|importReview|price|recommendationHistory|retail|rrp|sourceEvidence|stock|titleEn|titleTh|validation|wholesale/i,
    );
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
    assert.match(productView, /exportJson/);
    assert.doesNotMatch(productView, /\/api\/admin\/products\/catalogue\/import/);
    assert.doesNotMatch(productView, /importProductCsv/);
    assert.match(
      retailView,
      /\/api\/admin\/products\/catalogue\/export\?scope=retail/,
    );
    assert.match(retailView, /importRetailProductCatalogueFile/);
    assert.match(exportRoute, /buildPlatformProductCatalogueJson/);
    assert.match(exportRoute, /platform-product-catalogue\.json/);
    assert.match(exportRoute, /application\/json/);
    assert.match(exportRoute, /buildProductCatalogueCsv/);
    assert.match(importRoute, /applyProductCatalogueCsvImport/);
    assert.match(service, /createAdminProduct/);
    assert.match(service, /updateAdminProduct/);
    assert.match(service, /PLATFORM_IMPORT_RETAIL_ONLY_COLUMNS/);
    assert.match(
      service,
      /Platform catalogue import cannot include retail-only columns/,
    );
    assert.match(service, /countrySettingsFromRow/);
    assert.doesNotMatch(service, /function countryPricingFromRow/);
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
