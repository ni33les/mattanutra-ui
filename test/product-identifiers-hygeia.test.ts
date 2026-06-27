import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  ean13ChecksumValid,
  extractTrustedIdentifierEvidence,
  normalizeIdentifierValue,
  productIdentifiersFromBody,
  upcChecksumValid
} from "@/lib/product-identifiers";
import {
  extractTrustedFdaApprovalEvidence,
  fdaApprovalNumberFromText,
  selectThaiFdaOryorEvidence,
  thaiFdaOryorSearchTermsForProduct
} from "@/lib/product-fda-sourcing";
import { parseHygeiaCsv } from "@/lib/hygeia-product-files";

describe("product identifiers and Hygeia files", () => {
  it("validates and normalizes EAN-13 and UPC identifiers", () => {
    assert.equal(normalizeIdentifierValue("ean13", "4006 3813 3393 1"), "4006381333931");
    assert.equal(ean13ChecksumValid("4006381333931"), true);
    assert.equal(normalizeIdentifierValue("ean13", "4006381333932"), null);
    assert.equal(normalizeIdentifierValue("upc", "036000 291452"), "036000291452");
    assert.equal(upcChecksumValid("036000291452"), true);
    assert.equal(normalizeIdentifierValue("upc", "036000291453"), null);
    assert.deepEqual(productIdentifiersFromBody([
      {
        source: "admin",
        type: "ean13",
        value: "4006381333931"
      },
      {
        source: "admin",
        type: "upc",
        value: "036000291452"
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
      },
      {
        confidence: "medium",
        evidenceUrl: null,
        source: "admin",
        type: "upc",
        value: "036000291452"
      }
    ]);
  });

  it("extracts trusted manufacturer identifier evidence from structured data", () => {
    const evidence = extractTrustedIdentifierEvidence({
      evidenceUrl: "https://manufacturer.example/product",
      html: `
        <script type="application/ld+json">
          {"@type":"Product","name":"Example","gtin13":"4006381333931","gtin12":"036000291452","sku":"MN-ABC"}
        </script>
      `
    }) as Array<{
      autoApprove?: boolean;
      confidence?: string;
      source: string;
      type: string;
      value: string;
    }>;

    assert.ok(evidence.some((item) =>
      item.type === "ean13" &&
      item.value === "4006381333931" &&
      item.autoApprove === true &&
      item.source === "manufacturer_structured_data"
    ));
    assert.ok(evidence.some((item) =>
      item.type === "upc" &&
      item.value === "036000291452" &&
      item.autoApprove === true &&
      item.source === "manufacturer_structured_data"
    ));
    assert.ok(evidence.some((item) =>
      item.type === "manufacturer_sku" &&
      item.value === "MN-ABC" &&
      item.autoApprove === true &&
      item.confidence === "trusted" &&
      item.source === "manufacturer_structured_data"
    ));
  });

  it("extracts Thai FDA approval numbers from manufacturer evidence", () => {
    assert.equal(
      fdaApprovalNumberFromText("ชื่อผลิตภัณฑ์ เลขอ.ย. : 11-1-32732-1-0167 เลขที่ ฆอ : 2254/2564"),
      "11-1-32732-1-0167"
    );

    const evidence = extractTrustedFdaApprovalEvidence({
      evidenceUrl: "https://manufacturer.example/product",
      snapshot: {
        extractedText: "Product Description เลขอ.ย. : 11-1-32732-1-0167"
      }
    });

    assert.deepEqual(evidence, [{
      evidenceUrl: "https://manufacturer.example/product",
      source: "manufacturer_snapshot",
      value: "11-1-32732-1-0167"
    }]);
  });

  it("builds bounded Thai FDA Oryor API search terms from missing product identifiers", () => {
    assert.deepEqual(
      thaiFdaOryorSearchTermsForProduct({
        brand_name: "Blackmores",
        ean13_identifiers: [],
        id: "product-1",
        manufacturer_sku_identifiers: [],
        product_url: "https://example.test/product",
        source_snapshot: {},
        source_url: null,
        title: "Blackmores Bio C 1000 150 Tablets",
        translated_titles: ["BLACKMORES BIO C 1000"],
        upc_identifiers: []
      }),
      [
        "Blackmores Bio C 1000",
        "Bio C 1000"
      ]
    );
  });

  it("includes active EAN, UPC and manufacturer SKU terms before product-name FDA searches", () => {
    assert.deepEqual(
      thaiFdaOryorSearchTermsForProduct({
        brand_name: "Blackmores",
        ean13_identifiers: ["9300807325698"],
        id: "product-1",
        manufacturer_sku_identifiers: ["BIO-C-1000"],
        product_url: "https://example.test/product",
        source_snapshot: {},
        source_url: null,
        title: "Blackmores Bio C 1000 150 Tablets",
        translated_titles: ["BLACKMORES BIO C 1000"],
        upc_identifiers: ["036000291452"]
      }),
      [
        "9300807325698",
        "036000291452",
        "BIO-C-1000",
        "Blackmores Bio C 1000"
      ]
    );
  });

  it("selects a clear current Oryor API product match and keeps variants ambiguous", () => {
    const row = {
      brand_name: "Vistra",
      ean13_identifiers: [],
      id: "product-2",
      manufacturer_sku_identifiers: [],
      product_url: "https://example.test/vistra",
      source_snapshot: {},
      source_url: null,
      title: "VISTRA GLUTA COMPLEX 600",
      translated_titles: [],
      upc_identifiers: []
    };

    assert.deepEqual(
      selectThaiFdaOryorEvidence(row, [
        {
          cncnm: "สถานะผลิตภัณฑ์(ยกเลิกเนื่องจากย้ายใบอนุญาต)",
          lcnno: "10-1-12650-1-0046",
          produceng:
            "VISTRA GLUTA COMPLEX 600 POMEGRANATE AND LIME FLAVOUR (DIETARY SUPPLEMENT PRODUCT)"
        },
        {
          cncnm: "สถานะผลิตภัณฑ์(คงอยู่)\\ สถานะสถานที่ (คงอยู่)",
          lcnno: "13-1-00449-1-0104",
          produceng:
            "VISTRA GLUTA COMPLEX 600 (L-GLUTATHIONE, L-CYSTEINE, ALPHA LIPOIC ACID)(DIETARY SUPPLEMENT PRODUCT)"
        }
      ])?.value,
      "13-1-00449-1-0104"
    );

    assert.equal(
      selectThaiFdaOryorEvidence(row, [
        {
          cncnm: "สถานะผลิตภัณฑ์(คงอยู่)\\ สถานะสถานที่ (คงอยู่)",
          lcnno: "13-1-00449-1-0104",
          produceng:
            "VISTRA GLUTA COMPLEX 600 (L-GLUTATHIONE)(DIETARY SUPPLEMENT PRODUCT)"
        },
        {
          cncnm: "สถานะผลิตภัณฑ์(คงอยู่)\\ สถานะสถานที่ (คงอยู่)",
          lcnno: "13-1-00449-1-0138",
          produceng:
            "VISTRA GLUTA COMPLEX 600 PLUS LYCOPENE (DIETARY SUPPLEMENT PRODUCT)"
        }
      ]),
      null
    );
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

  it("keeps bulk identifier sourcing focused on missing active EAN/UPC/SKU values", async () => {
    const service = await readFile("lib/product-identifiers.ts", "utf8");

    assert.match(service, /sourceableProductIdentifierTypes = \["ean13", "upc", "manufacturer_sku"\]/);
    assert.match(service, /active_identifier_types/);
    assert.match(service, /missingIdentifierTypes/);
    assert.match(service, /snapshotEvidence/);
    assert.match(service, /missingAfterSnapshot/);
    assert.match(service, /\.filter\(\(item\) => missingIdentifierTypes\.has\(item\.type\)\)/);
    assert.match(service, /\.filter\(\(item\) => missingAfterSnapshot\.has\(item\.type\)\)/);
    assert.match(service, /not exists \(\s*select 1\s*from public\.product_identifiers/);
    assert.match(service, /product_identifiers\.status = 'active'/);
  });

  it("keeps FDA sourcing separate and focused on missing Thailand approval rows", async () => {
    const route = await readFile("app/api/admin/products/fda/source/route.ts", "utf8");
    const identifierRoute = await readFile("app/api/admin/products/identifiers/source/route.ts", "utf8");
    const service = await readFile("lib/product-fda-sourcing.ts", "utf8");
    const productView = await readFile("components/admin/product-view.tsx", "utf8");

    assert.match(route, /sourceProductFdaApprovalNumbers/);
    assert.match(route, /createTask/);
    assert.match(route, /source_product_fda_approvals/);
    assert.match(identifierRoute, /createTask/);
    assert.match(identifierRoute, /source_product_identifiers/);
    assert.match(service, /product_regulatory_approvals/);
    assert.match(service, /agency_code = 'TH_FDA'/);
    assert.match(service, /apiMatches/);
    assert.match(service, /productSerial\/search\?keyword/);
    assert.match(service, /selectThaiFdaOryorEvidence/);
    assert.match(service, /thai_fda_oryor_api/);
    assert.match(service, /upsertProductRegulatoryApproval/);
    assert.doesNotMatch(service, /fda_approval_number\s*=/);
    assert.doesNotMatch(service, /products\.fda_approval_number/);
    assert.doesNotMatch(productView, /productSourceFeedbackKey/);
    assert.doesNotMatch(productView, /sourceProductFdaNumbersFromEvidence/);
    assert.doesNotMatch(productView, /sourceProductIdentifiersFromEvidence/);
    assert.doesNotMatch(route, /sourceProductIdentifiers/);
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
