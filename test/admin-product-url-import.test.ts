import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  extractProductUrlPageDraft,
  jsonLdProductRecordsFromHtml,
  normalizedProductImportUrl
} from "@/lib/admin-product-url-import";

describe("admin product URL import", () => {
  it("extracts product metadata from JSON-LD and page tags", () => {
    const html = `
      <html>
        <head>
          <title>Fallback Product Title</title>
          <meta property="og:image" content="/fallback-product.jpg" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Blackmores Test Multi",
              "description": "A useful test supplement.",
              "brand": { "name": "Blackmores" },
              "image": [
                "https://cdn.example.com/test-multi.webp"
              ],
              "offers": {
                "@type": "Offer",
                "price": "399.00",
                "priceCurrency": "THB"
              },
              "gtin12": "036000291452"
            }
          </script>
        </head>
        <body>
          <h1>Blackmores Test Multi</h1>
          <p>Contains zinc 15 mg and vitamin C 500 mg per tablet.</p>
        </body>
      </html>
    `;
    const draft = extractProductUrlPageDraft({
      html,
      productUrl: "https://example.com/products/test-multi#reviews"
    });

    assert.equal(jsonLdProductRecordsFromHtml(html).length, 1);
    assert.equal(draft.title, "Blackmores Test Multi");
    assert.equal(draft.brandName, "Blackmores");
    assert.equal(draft.description, "A useful test supplement.");
    assert.deepEqual(draft.imageUrls, [
      "https://cdn.example.com/test-multi.webp",
      "https://example.com/fallback-product.jpg"
    ]);
    assert.deepEqual(draft.price, {
      amount: 399,
      currency: "THB"
    });
    assert.match(draft.pageText ?? "", /zinc 15 mg/);
  });

  it("normalizes product URLs before fetching", () => {
    assert.equal(
      normalizedProductImportUrl("https://example.com/product?a=1#reviews"),
      "https://example.com/product?a=1"
    );
    assert.throws(
      () => normalizedProductImportUrl("ftp://example.com/product"),
      /http or https/
    );
  });

  it("wires the product list add button to the URL import API", async () => {
    const view = await readFile("components/admin/product-view.tsx", "utf8");
    const labels = await readFile(
      "components/admin/product-view-helpers.ts",
      "utf8"
    );
    const route = await readFile(
      "app/api/admin/products/from-url/route.ts",
      "utf8"
    );
    const service = await readFile("lib/admin-product-url-import.ts", "utf8");

    assert.match(view, /viewLabels\.addProduct/);
    assert.match(view, /setAddProductOpen\(true\)/);
    assert.match(view, /\/api\/admin\/products\/from-url/);
    assert.match(view, /productDetailHref\(productId\)/);
    assert.match(labels, /addProductFromUrl/);
    assert.match(labels, /creatingProduct/);
    assert.doesNotMatch(labels, /addProductFromUrlHint/);
    assert.match(route, /adminDashboardOrClawRequestAllowed/);
    assert.match(route, /createAdminProductFromUrl/);
    assert.match(service, /enrichDraftProductCatalogueWithAi/);
    assert.match(service, /status: "pending_review"/);
    assert.match(service, /brandStatus: "pending_review"/);
    assert.match(service, /source: "admin_url_ai_import"/);
    assert.match(service, /imageUrls: draft\.imageUrls/);
    assert.match(service, /translationsForTitle/);
  });
});
