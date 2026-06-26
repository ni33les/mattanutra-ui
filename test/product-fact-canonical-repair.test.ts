import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("product fact canonical repair", () => {
  it("uses unambiguous supplement aliases to repair missing fact supplement ids", async () => {
    const readModel = await readFile("lib/admin-product-read-model.ts", "utf8");
    const repairScript = await readFile(
      "scripts/repair-product-fact-canonical-matches.ts",
      "utf8"
    );

    assert.match(
      readModel,
      /coalesce\(product_facts\.supplement_id, supplement_match_rows\.supplement_id\)/
    );
    assert.match(readModel, /supplement_aliases\.normalized_alias = product_facts\.normalized_name/);
    assert.match(readModel, /matched_supplements\.match_count = 1/);
    assert.match(repairScript, /product_facts\.supplement_id is null/);
    assert.match(repairScript, /supplements\.normalized_name = product_facts\.normalized_name/);
    assert.match(repairScript, /supplement_aliases\.normalized_alias = product_facts\.normalized_name/);
    assert.match(repairScript, /where match_count = 1/);
    assert.match(repairScript, /refreshAndPersistProductValidations\(sql, productIds\)/);
  });
});
