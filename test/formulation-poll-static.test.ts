import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("reveal preserves completed results during version polling", () => {
  it("keeps initial results visible and delegates cancellable refresh to the shared polling hook", async () => {
    const source = await readFile(
      "components/formulation-results.tsx",
      "utf8"
    );

    const polling = await readFile("components/nutrition-flow/use-formulation-polling.ts", "utf8");
    assert.match(source, /useFormulationPolling\([\s\S]*effectivePlanId, locale, initialResult/);
    assert.match(polling, /useState\(initialResult\)/);
    assert.match(polling, /snapshot\.resultVersion !== version\.current/);
    assert.match(polling, /formulationStatus === "ready"/);
    assert.match(polling, /controller\.abort\(\)/);
    assert.match(source, /data-testid="formulation-retry"/);
    assert.doesNotMatch(source, /nutritionPending|orderedIngredients\.length === 0/);
    assert.doesNotMatch(source, /MAX_PRODUCT_MATCHING_POLLS/);
    assert.doesNotMatch(source, /PENDING_PRODUCT_MATCHING_POLL_INTERVAL_MS/);
    assert.doesNotMatch(source, /PENDING_SECTION_POLL_INTERVAL_MS/);
    assert.doesNotMatch(
      source,
      /if \(resultHasPendingSections\(payload\) \|\| shouldPollProductMatching\)/
    );
  });
});
