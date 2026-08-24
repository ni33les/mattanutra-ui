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

    assert.doesNotMatch(reveal, /getStoredFormulationResult/);
    assert.doesNotMatch(reveal, /detail:\s*"page"/);
    assert.doesNotMatch(reveal, /await ensureFreshProductRecommendationsForReveal/);
    assert.match(
      reveal,
      /setTimeout\(\(\) => \{[\s\S]*ensureFreshProductRecommendationsForReveal/
    );
    assert.doesNotMatch(formulation, /jsonb_to_recordset/);
    assert.doesNotMatch(formulation, /blocked_product_facts/);
    assert.doesNotMatch(formulation, /getStoredAssessmentSnapshot/);
    assert.match(formulation, /getStoredFormulationRead\(planId,/);
  });

  it("keeps the default formulation GET as one formula read", async () => {
    const store = await readFile("lib/assessment-store.ts", "utf8");
    const formulation = await readFile(
      "app/api/assessment/[planId]/formulation/route.ts",
      "utf8"
    );
    const start = store.indexOf(
      "async function loadStoredFormulationFormulaRead"
    );
    const end = store.indexOf(
      "export async function getStoredFormulationRead"
    );
    const slim = store.slice(start, end > start ? end : store.length);

    assert.match(slim, /from assessments/);
    assert.match(slim, /left join lateral/);
    assert.doesNotMatch(slim, /information_schema/);
    assert.doesNotMatch(slim, /from tasks/);
    assert.doesNotMatch(slim, /product_recommendation_items/);
    assert.doesNotMatch(slim, /jsonb_to_recordset/);
    assert.doesNotMatch(slim, /blocked_product_facts/);
    assert.doesNotMatch(slim, /loadStoredRecommendationProductPayloads/);
    assert.doesNotMatch(slim, /reconcileResolvedSafetyReviewFlags/);
    assert.doesNotMatch(formulation, /getStoredFormulationResult\(/);
    assert.match(formulation, /includeProducts/);
    assert.match(formulation, /products"\) === "1"/);
  });

  it("loads stored products on the first reveal formulation fetch", async () => {
    const source = await readFile(
      "components/formulation-results.tsx",
      "utf8"
    );

    assert.match(source, /formulationUrl\(effectivePlanId, locale, true\)/);
    assert.match(source, /waitingForProducts/);
    assert.doesNotMatch(
      source,
      /formulationUrl\(effectivePlanId, locale, mode === "once"\)/
    );
  });

  it("does not insert an empty recommendations row with the formula", async () => {
    const applier = await readFile("lib/task-result-applier.ts", "utf8");
    const start = applier.indexOf("includeEmptyRecommendations:");
    assert.match(
      applier.slice(start, start + 80),
      /includeEmptyRecommendations:\s*false/
    );
  });
});
