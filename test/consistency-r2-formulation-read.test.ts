import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("consistency r2 formulation read", () => {
  it("keeps getStoredFormulationResult free of unbounded product laterals", async () => {
    const store = await readFile("lib/assessment-store.ts", "utf8");
    const start = store.indexOf("export async function getStoredFormulationResult");
    const helper = store.indexOf(
      "async function loadStoredRecommendationProductPayloads"
    );
    const end = store.indexOf("export async function", start + 1);
    const reader = store.slice(start, end > start ? end : store.length);
    const followUp = store.slice(helper, start);

    assert.match(store, /loadStoredRecommendationProductPayloads/);
    assert.match(followUp, /i\.run_id = any\(/);
    assert.doesNotMatch(reader, /jsonb_agg\s*\(/);
    assert.doesNotMatch(reader, /jsonb_to_recordset/);
    assert.doesNotMatch(reader, /blocked_product_facts/);
    assert.doesNotMatch(reader, /not exists\s*\(/i);
    assert.doesNotMatch(reader, /from public\.product_facts/);
    assert.doesNotMatch(reader, /count\(\*\)::int as approved_product_count/);
    assert.doesNotMatch(reader, /count\(\*\)::int as active_supplement_count/);
    assert.doesNotMatch(followUp, /jsonb_to_recordset/);
    assert.doesNotMatch(followUp, /blocked_product_facts/);
    assert.doesNotMatch(followUp, /not exists\s*\(/i);
  });

  it("does not hold reveal HTML on freshness or the full product join", async () => {
    const reveal = await readFile(
      "app/[locale]/nutrition/reveal/page.tsx",
      "utf8"
    );
    const formulation = await readFile(
      "app/api/assessment/[planId]/formulation/route.ts",
      "utf8"
    );

    assert.match(reveal, /detail:\s*"page"/);
    assert.doesNotMatch(reveal, /await ensureFreshProductRecommendationsForReveal/);
    assert.match(
      reveal,
      /setTimeout\(\(\) => \{[\s\S]*ensureFreshProductRecommendationsForReveal/
    );
    assert.doesNotMatch(formulation, /jsonb_to_recordset/);
    assert.doesNotMatch(formulation, /blocked_product_facts/);
    assert.match(formulation, /getStoredFormulationResult\(planId,/);
  });
});
