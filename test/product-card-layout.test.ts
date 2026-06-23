import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("product admin card layout", () => {
  it("keeps brand, markets, regulatory approval, and source in distinct card areas", async () => {
    const view = await readFile("components/admin/product-view-ui.tsx", "utf8");
    const detailView = await readFile("components/admin/product-view.tsx", "utf8");
    const productCard = view.slice(
      view.indexOf("export function ProductCard"),
      view.indexOf("export function ProductFactsEditor"),
    );

    assert.match(
      view,
      /row\.brandName\?\.trim\(\) \|\| viewLabels\.notAvailable/,
    );
    assert.match(view, /viewLabels\.markets/);
    assert.match(view, /row\.availableCountryCodes\.map/);
    assert.match(view, /viewLabels\.rrp/);
    assert.match(view, /approvalSummary !== "-"/);
    assert.match(view, /approval\.agencyCode\.replaceAll\("_", " "\)/);
    assert.doesNotMatch(productCard, /viewLabels\.regulatoryApproval/);
    assert.match(view, /mt-3 flex flex-wrap items-center gap-x-4 gap-y-2/);
    assert.doesNotMatch(
      productCard,
      /hidden h-3 w-px bg-gray-200 sm:inline-block/,
    );
    assert.match(
      view,
      /readyCountryPrice\.rrpPriceAmount[\s\S]*readyCountryPrice\.currency/,
    );
    assert.doesNotMatch(view, /RRP \{readyCountryPrice\.rrpPriceAmount/);
    assert.doesNotMatch(
      view,
      /grid divide-y divide-gray-100 bg-white sm:grid-cols-3/,
    );
    assert.doesNotMatch(
      view,
      /overflow-hidden rounded-lg ring-1 ring-gray-200/,
    );
    assert.match(view, /border-t border-gray-100 pt-3/);
    assert.match(view, /sourceTitle/);
    assert.match(view, /decisionSummary/);
    assert.match(view, /function productImageFallbackText/);
    assert.match(view, /ProductImagePreview/);
    assert.match(view, /ProductImageFallback/);
    assert.match(view, /<ProductImagePreview row=\{row\} \/>/);
    assert.match(detailView, /ProductImagePreview/);
    assert.match(detailView, /<ProductImagePreview alt=\{localized\.title\.value\} row=\{draft\} size="lg" \/>/);
    assert.doesNotMatch(productCard, /row\.platform\.toUpperCase\(\)/);
    assert.doesNotMatch(view, /productStatusLabel\(row\.productKind, locale\)/);
    assert.match(productCard, /viewLabels\.translations/);
    assert.match(productCard, /size-1\.5 rounded-full/);
    assert.doesNotMatch(
      productCard,
      /productTranslationStatusClass\(translation\.status\)/,
    );
    assert.doesNotMatch(productCard, /\{siteLocale\.label\}\{" "\}/);
    assert.doesNotMatch(view, /viewLabels\.source\}: \$\{row\.platform\}/);
    assert.doesNotMatch(
      view,
      /viewLabels\.sourceTitle\}: \$\{localized\.title\.canonicalValue\}/,
    );
    assert.doesNotMatch(
      view,
      /row\.brandName,[\s\S]*regulatoryApprovalSummary\(row\.regulatoryApprovals\)[\s\S]*viewLabels\.markets/,
    );
  });
});
