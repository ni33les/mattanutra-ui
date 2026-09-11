import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv from "ajv";
import { AGENTIC_OUTPUT_SCHEMAS, OPTION_SCHEMA } from "../../lib/agentic/contract/outputs.ts";
import { publicFrozenOrder, publicOption, publicPlanFields, publicTradeOffs } from "../../lib/agentic/public-mapper.ts";
import type { BasketItem, StackOption } from "../../lib/agentic/plan/types.ts";

function item(id: string, pills: number, known = true): BasketItem {
  return {
    productId: id, productName: id, availabilityAsOf: "2026-09-07", currency: "THB",
    dailyPills: pills, pillsPerServing: pills, pillCountKnown: known,
    contributionSupplementIds: [], deliveryWindow: null, fixture: true, form: "",
    imageUrl: null, incidentalNutrientNames: [], incidentalNutrients: [],
    incompleteCommercialFacts: false, lineTotalMinor: 100, quantity: 1,
    requestedNutrientNames: [], retailerSku: id, sellerId: "fixture", sellerName: "Fixture",
    servingsPerDay: 1, source: "fixture", stockStatus: "in_stock", unitPriceMinor: 100
  };
}

function option(id: string, pills: number, known = true): StackOption {
  return {
    candidateKey: id, basket: [item(id, pills, known)], coverage: [], coveragePercent: 100,
    dailyPills: pills, matcherVersion: "fixture", reason: "fixture", snapshotId: "fixture",
    totalPriceMinor: 100, tradeOff: { cash90DayDeltaMinor: 0, coverageDelta: 0, dailyPillsDelta: -2 },
    economics: {
      baseline: { cash90DayMinor: 100, lines: [], type: "current_basket" },
      cashComplete: true, comparisonComplete: true, cash30DayMinor: 100, cash90DayMinor: 100,
      cashTotalMinor: 100, complete: true, consumptionComplete: true, consumptionScope: "full_horizon",
      consumption30DayMinor: 100, consumption90DayMinor: 100, unavailableReasons: [],
      deltas: { administrations: 0, coverage: 0, pills: -2, products: 0 }, equivalent: true,
      firstOrderSubtotalMinor: 100, otherCustomerCostMinor: 0, savingClaim: "none",
      savings90DayMinor: 0, savings90DayPercent: 0, shippingMinor: 0
    }
  };
}

test("v5 unknown pill counts do not become fewer-pill claims or known zero deltas", () => {
  const known = option("known", 2);
  const unknown = option("unknown", 0, false);
  for (const locale of ["en", "th", "zh-CN"]) {
    for (const [candidate, selected] of [[unknown, known], [known, unknown]] as const) {
      const published = publicTradeOffs(candidate, selected, locale);
      assert.equal(published.pillDelta, null);
      assert.equal(published.summaryKey, "plan.tradeoff.pills_unknown");
      assert.ok(published.summary.length > 0);
    }
  }
  assert.equal(publicTradeOffs(unknown, null).pillDelta, null);
  assert.equal(publicTradeOffs(option("one", 1), known).pillDelta, -1);
  assert.equal(publicTradeOffs(option("powder", 0), known).pillDelta, -2);
});

test("v5 public option masks every unknown pill comparison without changing the saved option", () => {
  const known = option("known", 2);
  const unknown = option("unknown", 0, false);
  const before = structuredClone(unknown);
  const published = publicOption(unknown, known, "en", [known, unknown]);
  assert.notEqual(published.reasonCode, "fewest_pills");
  assert.equal(published.stackSummary.totalDailyPills, null);
  assert.equal(published.basket[0]?.dailyPills, null);
  assert.equal(published.tradeOffs.pillDelta, null);
  assert.equal(published.tradeOff?.dailyPillsDelta, null);
  assert.equal(published.economics?.deltas.pills, null);
  assert.deepEqual(unknown, before);
  const validate = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true }).compile(OPTION_SCHEMA);
  assert.ok(validate(published), JSON.stringify(validate.errors));
});

test("v5 compact plan preserves explicit null pill deltas", () => {
  const known = option("known", 2);
  const unknown = option("unknown", 0, false);
  const published = publicPlanFields({ alternatives: [unknown], basket: known.basket,
    changeSummary: [], coverage: [], questions: [], safetyGuidance: [], selected: known,
    status: "ready", summary: "Ready", unmetRequirements: [] });
  const encoded = JSON.stringify(published);
  assert.ok(encoded.includes('"pillDelta":null'));
  assert.ok(encoded.includes('"dailyPillsDelta":null'));
});

test("historical options without saved economic deltas remain readable without invented comparisons", () => {
  const saved = option("historical", 2);
  const economics = { ...saved.economics } as Partial<NonNullable<StackOption["economics"]>>;
  delete economics.deltas;
  const legacy = { ...saved, economics } as StackOption;
  const before = structuredClone(legacy);
  const published = publicOption(legacy, legacy);
  assert.equal(published.economics?.cash90DayMinor, 100);
  assert.equal(published.economics?.deltas, undefined);
  assert.deepEqual(legacy, before);
  const validate = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true }).compile(OPTION_SCHEMA);
  assert.ok(validate(published), JSON.stringify(validate.errors));
});

test("v5 frozen orders preserve unknown counts and immutable commercial values on replay", () => {
  const frozen = { dailyPills: 0, items: [item("unknown", 0, false)],
    selectedCandidateKey: "frozen-option", planRevision: 7, subtotalMinor: 100, totalPriceMinor: 100 };
  const before = structuredClone(frozen);
  const published = publicFrozenOrder(frozen) as { dailyPills: number | null; items: { dailyPills: number | null; pillsPerServing: number | null }[]; totalPriceMinor: number; planRevision: number };
  assert.equal(published.dailyPills, null);
  assert.equal(published.items[0]?.dailyPills, null);
  assert.equal(published.totalPriceMinor, 100);
  assert.equal(published.planRevision, 7);
  assert.deepEqual(frozen, before);
  const publicReplay = publicFrozenOrder({ ...frozen, items: [{ ...frozen.items[0], pillCountKnown: undefined, dailyPills: null, pillsPerServing: null }] }) as typeof published;
  assert.equal(publicReplay.dailyPills, null);
  assert.equal(publicReplay.items[0]?.dailyPills, null);
  const knownLegacy = publicFrozenOrder({ ...frozen, dailyPills: 2, items: [{ ...item("known", 2), pillCountKnown: undefined }] }) as typeof published;
  assert.equal(knownLegacy.dailyPills, 2);
  assert.equal(knownLegacy.items[0]?.dailyPills, 2);
  const schema = AGENTIC_OUTPUT_SCHEMAS.execute.anyOf[0].properties.frozenPlan;
  const wire = JSON.parse(JSON.stringify(published));
  const validate = new Ajv({ strict: true, strictRequired: false, allowUnionTypes: true }).compile(schema);
  assert.ok(validate(wire), JSON.stringify(validate.errors));
});
