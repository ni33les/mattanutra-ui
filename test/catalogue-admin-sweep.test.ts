import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("catalogue admin sweep audit", () => {
  it("provides a read-only product and supplement catalogue audit report", async () => {
    const [packageJson, script] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/audit-product-admin-sweep.ts", "utf8")
    ]);

    assert.match(packageJson, /catalogue:admin-sweep/);
    assert.match(script, /approved_but_not_matchable/);
    assert.match(script, /approved_unapproved_brand/);
    assert.match(script, /approved_missing_image/);
    assert.match(script, /approved_validation_not_pass/);
    assert.match(script, /eligible_products/);
    assert.match(script, /product_brand_countries/);
    assert.match(script, /product_identifiers_type_check/);
    assert.match(script, /product_identifiers_upc_check/);
    assert.match(script, /active_upc_identifiers/);
    assert.match(script, /product_facts\.supplement_id is null/);
    assert.match(script, /supplement_aliases\.normalized_alias = product_facts\.normalized_name/);
    assert.match(script, /unlinkedSupplementFacts/);
    assert.match(script, /approvedButNotMatchable/);
    assert.doesNotMatch(script, /\bupdate\s+public\./i);
    assert.doesNotMatch(script, /\binsert\s+into\s+public\./i);
    assert.doesNotMatch(script, /\bdelete\s+from\s+public\./i);
  });
});
