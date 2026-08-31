import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const stockView = readFileSync(
  new URL("../components/admin/retail-stock-view.tsx", import.meta.url),
  "utf8"
);
const dashboard = readFileSync(
  new URL("../components/admin/dashboard-content.tsx", import.meta.url),
  "utf8"
);

describe("retail stock sale eligibility filters and reorders layout", () => {
  it("exposes unselected, selected, on sale, and unavailable stock stats", () => {
    assert.match(stockView, /id: "unselected"/);
    assert.match(stockView, /id: "selected"/);
    assert.match(stockView, /id: "on_sale"/);
    assert.match(stockView, /id: "unavailable"/);
    assert.match(stockView, /stockRowIsUnselected/);
    assert.match(stockView, /stockRowIsSelected/);
    assert.match(stockView, /stockRowIsOnSale/);
    assert.match(stockView, /stockRowIsUnavailable/);
    assert.doesNotMatch(stockView, /id: "approved"/);
    assert.doesNotMatch(stockView, /eligible_for_sale/);
    assert.doesNotMatch(stockView, /ineligible_for_sale/);
    assert.doesNotMatch(stockView, /id: "in_stock"/);
    assert.doesNotMatch(stockView, /id: "low_stock"/);
    assert.doesNotMatch(stockView, /id: "out_of_stock"/);
    assert.match(dashboard, /unselected: "Unselected"/);
    assert.match(dashboard, /selectedForSale: "Selected"/);
    assert.match(dashboard, /onSale: "On sale"/);
    assert.match(dashboard, /unavailable: "Unavailable"/);
    assert.match(dashboard, /ineligibleNotApproved: "Not approved"/);
    assert.doesNotMatch(dashboard, /eligibleForSale: "Eligible for sale"/);
    assert.doesNotMatch(dashboard, /approvedProducts: "Approved products"/);
    assert.doesNotMatch(stockView, /approvedCountSuffix/);
    assert.doesNotMatch(stockView, /selected_approved/);
    assert.doesNotMatch(dashboard, /approvedCountSuffix/);
  });

  it("offers Selected and Unselected in the listing editor, not deleted", () => {
    assert.match(stockView, /\(\["active", "disabled"\] as const\)/);
    assert.doesNotMatch(
      stockView,
      /\(\["active", "disabled", "deleted"\] as const\)/
    );
  });

  it("keeps reorders backorder heading outside the data table body", () => {
    const adviceStart = stockView.indexOf('panel === "stock-advice"');
    assert.ok(adviceStart > 0);
    const slice = stockView.slice(adviceStart, adviceStart + 4500);
    assert.match(slice, /reorderBackorders/);
    assert.match(slice, /<header className="mb-4">/);
    assert.match(slice, /<thead className="bg-gray-50/);
    // Title should not be the first tbody data row pattern from the old nested layout.
    assert.doesNotMatch(
      slice,
      /<tbody[\s\S]{0,200}<tr>\s*<td className="px-3 pb-3 pt-5" colSpan=\{4\}>/
    );
  });
});
