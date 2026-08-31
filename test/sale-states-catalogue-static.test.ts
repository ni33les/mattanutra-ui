import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const live = readFileSync(
  new URL("../lib/agentic/catalogue/live.ts", import.meta.url),
  "utf8"
);
const search = readFileSync(
  new URL("../lib/admin-product-search.ts", import.meta.url),
  "utf8"
);

describe("live catalogue sale states", () => {
  it("loads only approved products with a selected listing", () => {
    assert.match(live, /products\.status = 'approved'/);
    assert.match(live, /sellable\.status = 'active'/);
  });

  it("does not keep validation or brand as live matching ANDs", () => {
    assert.doesNotMatch(
      live,
      /coalesce\(products\.validation_status, 'pass'\) = 'pass'/
    );
    assert.doesNotMatch(
      live,
      /product_brands\.status = 'approved'/
    );
    assert.doesNotMatch(
      search,
      /and \(products\.brand_id is null or product_brands\.status = 'approved'\)/
    );
    assert.doesNotMatch(
      search,
      /coalesce\(products\.validation_status, 'pass'\) = 'pass'/
    );
  });
});
