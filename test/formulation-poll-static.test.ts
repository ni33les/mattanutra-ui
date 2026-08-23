import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("reveal does not poll formulation when last-known is on the page", () => {
  it("skips mount fetch when SSR already has a formula", async () => {
    const source = await readFile(
      "components/formulation-results.tsx",
      "utf8"
    );

    assert.match(source, /function hasRenderableFormula/);
    assert.match(
      source,
      /if \(!hasRenderableFormula\(initialResult\)\) \{\s*void fetchFormulation\("until-formula"\)/
    );
    assert.match(source, /else if \(productPollingPreference\) \{\s*void fetchFormulation\("once"\)/);
    assert.doesNotMatch(source, /MAX_PRODUCT_MATCHING_POLLS/);
    assert.doesNotMatch(source, /PENDING_PRODUCT_MATCHING_POLL_INTERVAL_MS/);
    assert.doesNotMatch(source, /PENDING_SECTION_POLL_INTERVAL_MS/);
    assert.doesNotMatch(
      source,
      /if \(resultHasPendingSections\(payload\) \|\| shouldPollProductMatching\)/
    );
  });
});
