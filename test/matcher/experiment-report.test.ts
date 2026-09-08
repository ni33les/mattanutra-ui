import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateMetrics, compareMetrics, factualChanges, renderComparisonReport, scoreBreakdown, type CandidateMetrics, type ComparisonReport } from "../../lib/matcher/experiments/report.ts";
import { compileGroups } from "../../lib/matcher/candidates.ts";
import { seedState, tryAddVariant } from "../../lib/matcher/search.ts";
import { scoreExposure } from "../../lib/matcher/experiments/score.ts";
import { resolveProfile } from "../../lib/matcher/experiments/profiles.ts";
import { catalog, product, request } from "./flexible-v5-fixtures.ts";

function metrics(vector: Record<string, string | null>, signature = "fixed") {
  return { signature, sellerId: "seller", productIds: ["product"], variantDoses: [], productCount: 1, dailyPills: 1,
    priceMinor: 100, baselineDoseLoss: 1, maxProportionalDeviation: 1, currency: "THB", purchaseEligible: true, coverage: [], targetDeviations: [], continuedDoseDeviations: [],
    references: [], preferences: [], safety: [], uncertaintyNotes: [], neutralVector: vector } satisfies CandidateMetrics;
}

test("EXP-REPORT-01 neutral comparisons use dimensions, never totals from different scoring profiles", () => {
  const base = metrics({ gap: "1/3", price: "100" });
  assert.equal(compareMetrics(base, metrics({ gap: "1/3", price: "100" })), "unchanged");
  assert.equal(compareMetrics(base, metrics({ gap: "1/4", price: "100" })), "improved");
  assert.equal(compareMetrics(base, metrics({ gap: "1/2", price: "100" })), "worsened");
  assert.equal(compareMetrics(base, metrics({ gap: "1/4", price: "101" })), "tradeoff");
  assert.equal(compareMetrics(base, metrics({ gap: null, price: "100" })), "incomparable");
  assert.equal(compareMetrics(base, metrics({ other: "0", price: "100" })), "incomparable");
  assert.equal(compareMetrics(null, base), "incomparable");
  assert.equal(compareMetrics(metrics({ price: "9007199254740993" }), metrics({ price: "9007199254740992" })), "improved");
});

test("EXP-REPORT-02 winner projection preserves dose, quoted price, unknown pills and advisory references", () => {
  const input = request({ maxDailyPills: 0, safetyCeilings: [{ subjectId: "a", name: "A", maxAmount: 50, maxUnit: "mg", sourceScope: "total", referenceConfidence: "low", basisRationale: "Unverified internal threshold" }] });
  const groups = compileGroups(input, catalog([product("one", { a: 100 }, 1234, { pillCountKnown: false, dailyPillsPerServing: 0 })]));
  const group = groups[0]!;
  const variant = group.variants.find(row => row.dailyUnits === 1)!;
  const state = tryAddVariant(seedState(input), variant, group, input)!;
  assert.ok(state);
  const candidate = { signature: "seller|one", sellerId: group.sellerId, state, groups,
    score: scoreExposure(resolveProfile("baseline"), input, state.exposure, { productCount: state.count, dailyPills: null, priceMinor: state.price, currency: input.currency }) };
  const result = candidateMetrics(candidate, input)!;
  assert.equal(result.priceMinor, 1234); assert.equal(result.dailyPills, null);
  assert.equal(result.variantDoses[0]?.dailyUnits, 1);
  assert.equal(result.preferences.find(row => row.kind === "daily_pills")?.status, "unknown");
  assert.ok(result.references.some(row => row.referenceConfidence === "low" && row.basisRationale === "Unverified internal threshold"));
  assert.ok(result.safety.every(row => row.action === "review"));
  assert.equal(result.purchaseEligible, true);
});

test("EXP-REPORT-03 score serialization preserves exact rational strings and missing components", () => {
  const input = request();
  const score = scoreExposure(resolveProfile("baseline"), input, new Map([["a", 30_000_000n]]), { productCount: 1, dailyPills: null, priceMinor: 100, baselineDoseLoss: 1, maxProportionalDeviation: 1, currency: "THB" });
  const serialized = scoreBreakdown(score);
  assert.doesNotThrow(() => JSON.stringify(serialized));
  assert.equal(typeof serialized.total, "string");
  assert.match(JSON.stringify(serialized), /7\/10/);
  assert.deepEqual(scoreBreakdown({ ...score, total: null, complete: false, missingComponents: ["dailyPills"] }).missingComponents, ["dailyPills"]);
});

test("EXP-REPORT-04 standalone report separates search and rescoring, escapes text and neutralizes CSV formulas", () => {
  const baseline = metrics({ gap: "1", price: "100" });
  const improved = metrics({ gap: "0", price: "100" }, "<script>bad()</script>");
  const report: ComparisonReport = {
    title: "<img src=x onerror=bad()>", sourceCommit: "22bce180", provenance: { scope: "offline" },
    cases: [{ id: "=HYPERLINK(\"https://bad.invalid\")", kind: "synthetic", baseline, provenance: { note: "unknown diet" },
      profiles: [{ profileId: "quadratic", profileHash: "hash", fullSearch: { metrics: improved, score: { total: "1/7" }, searchSummary: { expansionAttempts: 5, expansionBudget: 8, complete: false } },
        commonPool: { metrics: baseline, score: { total: "2/7" }, poolSize: 6 },
        sensitivity: [{ weight: "1/2", scope: "rescoring_only", metrics: baseline, score: { total: "3/7" } }] }] }],
    shortlist: [{ profileId: "quadratic", reason: "Observed gap reduction at the same price" }]
  };
  const { html, csv } = renderComparisonReport(report);
  assert.match(html, /Full search/); assert.match(html, /Common-pool rescoring/);
  assert.match(html, /rescoring_only/); assert.match(html, /incomplete/i);
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/); assert.doesNotMatch(html, /<script>bad/);
  assert.doesNotMatch(html, /https?:\/\/[^\s"']+\.(?:js|css)/);
  assert.match(csv, /'=/); assert.match(csv, /full_search/); assert.match(csv, /common_pool/); assert.match(csv, /rescoring_only/);
  assert.match(csv, /improved/); assert.match(csv, /unchanged/);
  assert.doesNotMatch(html + csv, /percent better|% improvement|new default/i);
  assert.equal(renderComparisonReport(report).html, html);
});

test("EXP-REPORT-05 unknown comparison still displays factual changes and preserves fallback/incomplete candidates", () => {
  const baseline = { ...metrics({ gap: null, price: "100" }), dailyPills: null };
  const next = { ...metrics({ gap: null, price: "120" }, "incomplete-example"), priceMinor: 120, productCount: 2 };
  const changes = factualChanges(baseline, next)!;
  assert.equal(changes.priceMinor.delta, 20);
  assert.equal(changes.productCount.delta, 1);
  assert.equal(changes.dailyPills.delta, null);
  const report: ComparisonReport = { title: "Incomplete evidence", sourceCommit: "fixed", cases: [{ id: "unknown", kind: "synthetic", baseline,
    profiles: [{ profileId: "p", profileHash: "hash", fullSearch: { metrics: null, score: null, purchaseFallback: next,
      incompleteCandidates: { count: 8, examples: [next] }, searchSummary: { expansionAttempts: 4, expansionBudget: 4, complete: false } },
      commonPool: { metrics: next, score: null, poolSize: 9, poolHash: "pool-identity", complete: false, purchaseFallback: next,
        incompleteCandidates: { count: 8, examples: [next] } } }] }] };
  const { html, csv } = renderComparisonReport(report);
  assert.match(html, /Purchase fallback/);
  assert.match(html, /8 incomplete-score candidates/);
  assert.match(html, /incomplete-example/);
  assert.match(html, /pool-identity/);
  assert.match(html, /Factual changes/);
  assert.match(csv, /purchase_fallback/);
  assert.match(csv, /incomplete_candidate/);
  assert.match(csv, /incomparable/);
  assert.equal(compareMetrics(baseline, next), "incomparable");
});
