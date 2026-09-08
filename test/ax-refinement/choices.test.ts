import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCompactDecision } from "../../lib/agentic/value/compact-decision.ts";
import { publicPlanFields, publicOption } from "../../lib/agentic/public-mapper.ts";
import { choice, coverage } from "./choice-fixtures.ts";

test("AXR-ALT-01 highlights an existing positive-coverage option without changing supplied baskets or their ordering", () => {
  const selected = choice("selected", [0], 0, 0, 0), alternatives = [choice("zero", [0]), choice("partial", [50]), choice("full", [100])];
  const original = structuredClone(alternatives);
  const compact = buildCompactDecision({ status: "no_purchase", selected, alternatives });
  assert.equal(compact.highlightedAlternativeOptionId, "full");
  assert.deepEqual(alternatives, original);
  assert.equal(compact.operationalDecision.nextAction, "review_options");
});

test("AXR-ALT-03 selectable zero-coverage choices say they do not cover requested targets", () => {
  const option = choice("zero", [0]);
  const output = publicOption(option, null, "en");
  assert.equal(output.purchaseEligible, true);
  assert.match(output.reason, /does not cover the requested targets/i);
});

test("AXR-ALT-02 exact highlight priorities respect full targets, coverage, known pills, products, known goods price and stable vector", () => {
  const selected = choice("selected", [0], 0, 0, 0);
  const pairs = [
    [choice("fuller", [100, 1]), choice("partial", [99, 99]), "fuller"],
    [choice("higher", [100, 60]), choice("lower", [100, 20]), "higher"],
    [choice("unknown", [100], null), choice("known", [100], 9), "known"],
    [choice("more", [100], 2), choice("less", [100], 1), "less"],
    [choice("two", [100], 1, 100, 2), choice("one", [100], 2), "one"],
    [choice("cost-unknown", [100], 1, null), choice("cost-known", [100], 1, 1000), "cost-known"],
    [choice("expensive", [100], 1, 53500), choice("cheaper", [100], 1, 31700), "cheaper"],
    [choice("z", [100]), choice("a", [100]), "a"]
  ] as const;
  for (const [left, right, expected] of pairs) {
    // Basket daily pills, rather than the display aggregate, determine comparability.
    if (left.optionId === "two") left.basket.forEach(item => Object.assign(item, { dailyPills: 1 }));
    for (const alternatives of [[left, right], [right, left]]) assert.equal(buildCompactDecision({ status: "no_purchase", selected, alternatives }).highlightedAlternativeOptionId, expected);
  }
});

test("AXR-ALT-03 selected duplicates, ineligible options and zero coverage cannot become highlights", () => {
  const selected = choice("selected", [50]);
  const duplicate = { ...structuredClone(selected), optionId: "another-id" };
  const compact = buildCompactDecision({ status: "ready", selected, alternatives: [duplicate, choice("zero", [0]), { ...choice("ineligible", [100]), purchaseEligible: false }] });
  assert.equal(compact.highlightedAlternativeOptionId, null);
});

for (const locale of ["en", "th", "zh-CN"] as const) test(`AXR-NOP-01 ${locale} continued intake completes naturally with optional purchases preserved`, () => {
  const selected = { ...choice("empty", [100], 0, 0, 0), coverage: [coverage(100, "d3", 100)] }, optional = choice("optional", [100]);
  const result = { status: "no_purchase" as const, selected, alternatives: [optional], basket: [], coverage: selected.coverage,
    questions: [], safetyGuidance: [], changeSummary: [], unmetRequirements: [], summary: "No new purchase needed.",
    requestSnapshot: { locale, targets: [{ name: "d3", amount: 100, unit: "mg" }], currentSupplements: [{ name: "d3", dailyAmount: 100, daysRemaining: 90 }], requirements: {} },
    horizon: { complete: true, durationUnknown: false, nextReplenishmentDay: 90, orders: [], purchaseRequiredNow: false, reasonCode: "current_inventory_covers_now", snapshotId: "fixture" } };
  const output = publicPlanFields(result);
  assert.equal(output.status, "no_purchase"); assert.equal(output.purchaseRequiredNow, false);
  assert.equal(output.operationalDecision.nextAction, "replenish_later"); assert.equal(output.operationalDecision.purchaseEligible, false);
  assert.equal(output.compactDecision!.highlightedAlternativeOptionId, null);
  assert.equal(output.options!.find(row => row.optionId === "optional")!.purchaseEligible, true);
  assert.deepEqual(output.compactDecision!.operationalDecision, output.operationalDecision);
});

test("AXR-NOP-02 unknown replenishment finishes without a buying prompt; unresolved gaps retain review", () => {
  const empty = choice("empty", [100], 0, 0, 0), alternatives = [choice("purchase", [100])];
  const result = buildCompactDecision({ status: "no_purchase", selected: { ...empty, coverage: [coverage(100, "a", 100)] }, alternatives,
    horizon: { purchaseRequiredNow: false, durationUnknown: true, nextReplenishmentDay: null } });
  assert.equal(result.operationalDecision.nextAction, "no_purchase"); assert.equal(result.highlightedAlternativeOptionId, null);
  const unresolved = buildCompactDecision({ status: "no_purchase", selected: choice("empty", [0], 0, 0, 0), alternatives });
  assert.equal(unresolved.operationalDecision.nextAction, "review_options"); assert.equal(unresolved.highlightedAlternativeOptionId, "purchase");
});
