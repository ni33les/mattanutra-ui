import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const readModel = readFileSync(
  new URL("../lib/admin-product-read-model.ts", import.meta.url),
  "utf8"
);
const helpers = readFileSync(
  new URL("../components/admin/product-view-helpers.ts", import.meta.url),
  "utf8"
);
const writes = readFileSync(
  new URL("../lib/admin-product-writes.ts", import.meta.url),
  "utf8"
);

describe("platform product list sale states", () => {
  it("counts Approved from products.status, not a validation override", () => {
    assert.match(
      readModel,
      /count\(\*\) filter \(where labelled\.status = 'approved'\) as summary_approved/
    );
    assert.doesNotMatch(
      readModel,
      /when products\.status = 'approved'\s+and coalesce\(products\.validation_status, 'failed'\) <> 'pass' then 'pending_review'/
    );
  });

  it("shows Review, Approved, and Withdrawn plus quality bars only", () => {
    assert.match(helpers, /pendingReview: "Review"/);
    assert.match(helpers, /ignored: "Withdrawn"/);
    assert.match(helpers, /statePendingReview: "Review"/);
    assert.match(helpers, /stateIgnored: "Withdrawn"/);
    assert.match(helpers, /id: "productsApproved"/);
    assert.match(helpers, /id: "productsPendingReview"/);
    assert.match(helpers, /id: "productsIgnored"/);
    assert.match(helpers, /id: "productsMissingFacts"/);
    assert.match(helpers, /id: "productsMissingImages"/);
    assert.doesNotMatch(helpers, /id: "productsSellable"/);
    assert.doesNotMatch(helpers, /id: "productsIneligible"/);
    assert.doesNotMatch(helpers, /id: "productsRegulatoryApproved"/);
  });

  it("demotes Approved to Review when validation fails on save", () => {
    assert.match(
      writes,
      /row\.status === "approved" && validation\.status !== "pass"/
    );
    assert.match(writes, /status = \$\{safeListStatus\}/);
    assert.match(
      writes,
      /Product validation blocks approval:/
    );
  });
});
