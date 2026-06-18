import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  DELIGHT_BRAND_SOURCE_POLICIES,
  detectDelightBrand,
  fallbackCandidateForSheetRow,
  matchDelightSheetRowsToProducts,
  parseDelightProductRowsFromGrid
} from "@/lib/delight-manufacturer-coverage";

describe("Delight manufacturer coverage import", () => {
  it("parses Delight workbook rows as SKU-level pricing input", () => {
    const rows = parseDelightProductRowsFromGrid([
      ["Product Name", "Unit", "Register No.", "Cost", "Selling Price"],
      ["BLACKMORES BIO C 1000 150 TABS", "150 tablets", "10-3-00000-0-0001", "410.5", "690"],
      ["MAXXLIFE ZINC AMINO ACID CHELATE", "30 capsules", "", "120", "290"]
    ]);

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      brandName: "Blackmores",
      costAmount: 410.5,
      productName: "BLACKMORES BIO C 1000 150 TABS",
      registerNumber: "10-3-00000-0-0001",
      rowNumber: 2,
      sellingPriceAmount: 690,
      unit: "150 tablets"
    });
    assert.equal(rows[1]?.brandName, "Maxxlife");
  });

  it("detects all Delight sheet brand families used by the import registry", () => {
    const examples = [
      ["VISTRA COLLAGEN", "Vistra"],
      ["MEGA NAT C", "Mega We Care"],
      ["SWISSE ULTIBOOST", "Swisse"],
      ["NUVITRA LUTEIN", "Nuvitra"],
      ["EVEREST HEALTH+ D3", "Everest Health+"],
      ["C-FORCE VITAMIN C", "C-Force"],
      ["SUPHAP OSOD HERBAL", "Suphap Osod"]
    ] as const;

    for (const [name, brand] of examples) {
      assert.equal(detectDelightBrand(name), brand);
    }

    const registeredBrands = new Set(DELIGHT_BRAND_SOURCE_POLICIES.map((policy) => policy.brandName));

    for (const [, brand] of examples) {
      assert.ok(registeredBrands.has(brand), `${brand} has source policy`);
    }
  });

  it("keeps weak-source sheet products as low-evidence fallback candidates", () => {
    const candidate = fallbackCandidateForSheetRow({
      brandName: "Nuvitra",
      costAmount: 100,
      productName: "NUVITRA TEST 30 CAPS",
      registerNumber: "10-1-12345-5-0001",
      rowNumber: 7,
      sellingPriceAmount: 250,
      unit: "30 capsules"
    });

    assert.equal(candidate.source, "delight_sheet_fallback");
    assert.equal(candidate.evidenceQuality, "fallback");
    assert.equal(candidate.fdaApprovalNumber, "10-1-12345-5-0001");
    assert.deepEqual(candidate.parsedFacts, []);
    assert.match(candidate.sourceUrl, /internal\/delight-product-sheet\/row-7/);
    assert.match(String(candidate.rawSnapshot.fdaEvidenceUrl), /check-product-serial/);
    assert.equal(candidate.rawSnapshot.parser, "delight_sheet_row_v1");
  });

  it("matches sheet rows by Thai FDA registration before fuzzy title", () => {
    const [match] = matchDelightSheetRowsToProducts([
      {
        brandName: "Caltrate",
        costAmount: 220,
        productName: "CALTRATE PLUS MINERALS 60 TABS",
        registerNumber: "10-3-12345-5-0001",
        rowNumber: 2,
        sellingPriceAmount: 490,
        unit: "60 tablets"
      }
    ], [
      {
        brandName: "Caltrate",
        fdaApprovalNumber: null,
        id: "product-1",
        imageUrl: null,
        normalizedBrandName: "caltrate",
        normalizedTitle: "caltrate_600_d3_plus_minerals",
        productUrl: "https://www.caltrate.com/calcium-supplement-products/600d3-plus-minerals/",
        regulatoryApprovalNumbers: ["10 3 12345 5 0001"],
        sourceUrl: "https://www.caltrate.com/calcium-supplement-products/600d3-plus-minerals/",
        status: "approved",
        title: "Caltrate 600+D3 Plus Minerals"
      }
    ]);

    assert.equal(match?.matchKind, "exact_register");
    assert.equal(match?.productId, "product-1");
  });

  it("uses title closeness to choose between pack variants sharing a register number", () => {
    const matches = matchDelightSheetRowsToProducts([
      {
        brandName: "Banner",
        costAmount: 172,
        productName: "BANNER SOY PROTEIN + LECITHIN 30'S",
        registerNumber: "13-1-00449-5-0222",
        rowNumber: 3,
        sellingPriceAmount: 235,
        unit: "Bottle"
      },
      {
        brandName: "Banner",
        costAmount: 295,
        productName: "BANNER SOY PROTEIN + LECITHIN 60'S",
        registerNumber: "13-1-00449-5-0222",
        rowNumber: 4,
        sellingPriceAmount: 422,
        unit: "Bottle"
      }
    ], [
      {
        brandName: "Banner",
        fdaApprovalNumber: "13-1-00449-5-0222",
        id: "banner-30",
        imageUrl: null,
        normalizedBrandName: "banner",
        normalizedTitle: "banner_soy_protein_lecithin_30_s",
        productUrl: "https://mattanutra.com/internal/delight-product-sheet/row-3-banner-soy-protein-lecithin-30-s",
        regulatoryApprovalNumbers: [],
        sourceUrl: null,
        status: "pending_review",
        title: "BANNER SOY PROTEIN + LECITHIN 30'S"
      },
      {
        brandName: "Banner",
        fdaApprovalNumber: "13-1-00449-5-0222",
        id: "banner-60",
        imageUrl: null,
        normalizedBrandName: "banner",
        normalizedTitle: "banner_soy_protein_lecithin_60_s",
        productUrl: "https://mattanutra.com/internal/delight-product-sheet/row-4-banner-soy-protein-lecithin-60-s",
        regulatoryApprovalNumbers: [],
        sourceUrl: null,
        status: "pending_review",
        title: "BANNER SOY PROTEIN + LECITHIN 60'S"
      }
    ]);

    assert.equal(matches[0]?.productId, "banner-30");
    assert.equal(matches[1]?.productId, "banner-60");
  });

  it("wires a dedicated CLI and safety flags", async () => {
    const [packageJson, scriptSource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/import-delight-manufacturer-coverage.ts", "utf8")
    ]);

    assert.match(packageJson, /import:delight-manufacturer-coverage/);
    assert.match(scriptSource, /hasArg\("apply-master"\)/);
    assert.match(scriptSource, /hasArg\("apply-delight"\)/);
    assert.match(scriptSource, /--sheet=/);
  });
});
