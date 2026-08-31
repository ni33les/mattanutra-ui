import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("PRD image retarget and magnesium UL repair", () => {
  it("copies UAT product objects onto the PRD prefix and rewrites URLs", () => {
    const script = readFileSync("scripts/retarget-env-product-images.ts", "utf8");
    assert.match(script, /copySharedSpacesObject/);
    assert.match(script, /retargetSharedSpacesImageUrl/);
    assert.match(script, /from \+ "\/products\/"/);
    assert.match(script, /target \+ "\/products\/"/);
    assert.match(script, /--env=prd and --from=uat/);
    assert.doesNotMatch(script, /DeleteObject/);
  });

  it("restores adult magnesium supplemental UL to 350 mg with the NIH ODS URL", () => {
    const script = readFileSync("scripts/repair-magnesium-supplemental-ul.ts", "utf8");
    assert.match(script, /350/);
    assert.match(
      script,
      /https:\/\/ods\.od\.nih\.gov\/factsheets\/Magnesium-HealthProfessional\//
    );
    assert.match(script, /source_scope/);
    assert.match(script, /mg\/day supplemental/);
  });
});
