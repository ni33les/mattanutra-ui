import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  buildProductImageHealthReport,
  productImageHealthAuditShouldFail,
  productImageHealthIssueRows,
  productImageHealthReportCsv,
  type ProductImageHealthProduct
} from "@/lib/product-image-health-audit";

function product(
  input: Partial<ProductImageHealthProduct> & Pick<ProductImageHealthProduct, "id" | "imageUrl">
): ProductImageHealthProduct {
  return {
    activeRetailerNames: input.activeRetailerNames ?? [],
    activeRetailerSlugs: input.activeRetailerSlugs ?? [],
    brandName: input.brandName ?? "Mega",
    externalProductId: input.externalProductId ?? input.id,
    id: input.id,
    imageUrl: input.imageUrl,
    status: input.status ?? "pending_review",
    title: input.title ?? `Product ${input.id}`
  };
}

describe("product image health audit", () => {
  it("classifies product image health and active retail impact", async () => {
    const fetcher: typeof fetch = async (url) => {
      const text = String(url);

      if (text.includes("broken")) {
        return new Response("", { status: 404, statusText: "Not Found" });
      }

      if (text.includes("html")) {
        return new Response("<html></html>", {
          headers: { "content-type": "text/html" },
          status: 200
        });
      }

      return new Response("x", {
        headers: { "content-type": "image/jpeg" },
        status: 206
      });
    };
    const report = await buildProductImageHealthReport({
      concurrency: 2,
      environment: "uat",
      fetcher,
      generatedAt: "2026-06-23T00:00:00.000Z",
      products: [
        product({
          activeRetailerSlugs: ["delight-pharmacy"],
          id: "p1",
          imageUrl:
            "https://mattanutra.sgp1.cdn.digitaloceanspaces.com/uat/products/a.jpg",
          status: "approved"
        }),
        product({
          activeRetailerSlugs: ["delight-pharmacy", "enchanted-pharmacy"],
          id: "p2",
          imageUrl: null
        }),
        product({
          activeRetailerSlugs: ["enchanted-pharmacy"],
          id: "p3",
          imageUrl: "https://example.com/external.jpg"
        }),
        product({
          activeRetailerSlugs: ["delight-pharmacy"],
          id: "p4",
          imageUrl: "https://example.com/broken.jpg"
        }),
        product({
          activeRetailerSlugs: ["delight-pharmacy"],
          id: "p5",
          imageUrl: "https://example.com/html"
        })
      ],
      targetRetailOrgSlugs: ["delight-pharmacy", "enchanted-pharmacy"]
    });

    assert.equal(report.counts.totalProducts, 5);
    assert.equal(report.counts.firstPartyImageUrls, 1);
    assert.equal(report.counts.externalImageUrls, 3);
    assert.equal(report.counts.healthyImageUrls, 2);
    assert.equal(report.counts.missingImageUrls, 1);
    assert.equal(report.counts.brokenImageUrls, 1);
    assert.equal(report.counts.nonImageResponses, 1);
    assert.equal(report.counts.activeRetailProducts, 5);
    assert.equal(report.counts.activeRetailMissingOrBrokenProducts, 3);
    assert.equal(report.counts.activeRetailExternalUrlProducts, 3);
    assert.equal(report.byRetailer["delight-pharmacy"].missingImageUrl, 1);
    assert.equal(report.byRetailer["delight-pharmacy"].brokenImageUrl, 1);
    assert.equal(report.byRetailer["delight-pharmacy"].nonImageResponse, 1);
    assert.equal(report.byRetailer["enchanted-pharmacy"].missingImageUrl, 1);
    assert.equal(productImageHealthAuditShouldFail(report), true);
    assert.equal(productImageHealthIssueRows(report).length, 4);
  });

  it("exports row-level CSV for report review", async () => {
    const report = await buildProductImageHealthReport({
      environment: "uat",
      fetcher: async () =>
        new Response("x", {
          headers: { "content-type": "image/png" },
          status: 200
        }),
      generatedAt: "2026-06-23T00:00:00.000Z",
      products: [
        product({
          activeRetailerNames: ["Delight Pharmacy"],
          activeRetailerSlugs: ["delight-pharmacy"],
          brandName: "Vistra",
          externalProductId: "SCR-1",
          id: "p1",
          imageUrl: "https://mattanutra.sgp1.cdn.digitaloceanspaces.com/uat/p.png",
          status: "approved",
          title: "Vistra C"
        })
      ],
      targetRetailOrgSlugs: ["delight-pharmacy"]
    });
    const csv = productImageHealthReportCsv(report);

    assert.match(csv, /"state","id","external_product_id"/);
    assert.match(csv, /"healthy","p1","SCR-1","Vistra C"/);
    assert.match(csv, /"delight-pharmacy","Delight Pharmacy"/);
  });

  it("wires a guarded CLI and package script", async () => {
    const [packageJson, scriptSource, librarySource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/audit-product-images.ts", "utf8"),
      readFile("lib/product-image-health-audit.ts", "utf8")
    ]);

    assert.match(packageJson, /products:images:audit/);
    assert.match(scriptSource, /assertProductImageRepairDatabaseTarget/);
    assert.match(scriptSource, /--no-fail|no-fail/);
    assert.match(scriptSource, /delight-pharmacy/);
    assert.match(scriptSource, /enchanted-pharmacy/);
    assert.match(librarySource, /public\.products/);
    assert.match(librarySource, /public\.retail_sellable_products/);
    assert.doesNotMatch(librarySource, /update\s+public\./i);
    assert.doesNotMatch(librarySource, /delete\s+from\s+public\./i);
  });
});
