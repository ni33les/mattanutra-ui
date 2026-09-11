import assert from "node:assert/strict";
import { it } from "node:test";
import { catalogueSnapshotId } from "../lib/agentic/catalogue/freeze.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import type { CanonicalPlanState } from "../lib/agentic/plan/types.ts";
import { sampleValueSnapshot } from "./agentic/value/sample-catalogue.ts";

const original = sampleValueSnapshot();
const magnesium = original.products.find(product => product.candidate.title === "Magnesium Glycinate")!;
const snapshot = { ...original, products: [magnesium] };
const state: CanonicalPlanState = {
  acceptedGaps: [], conditionCodes: [], currency: "THB", currentSupplements: [], destinationCountry: "TH",
  leftovers: [], locale: "en", medicationCodes: [], optimization: "balanced", pinnedCandidateKey: null,
  profile: { ageYears: 35, lifeStage: "adult" }, requirements: {}, safetyAcknowledgement: null,
  targets: [{ name: "Magnesium", supplementId: magnesium.contributionSupplementIds[0]!, amount: 150, unit: "mg" }]
};

for (const [name, changed] of [
  ["commercial completeness", { ...magnesium, incompleteCommercialFacts: true }],
  ["orderability", { ...magnesium, orderable: false }],
  ["approval", { ...magnesium, candidate: { ...magnesium.candidate, status: "draft" as const } }],
  ["destination", { ...magnesium, candidate: { ...magnesium.candidate, availableCountryCodes: ["US"] } }]
] as const) it(`catalogue identity prevents cached purchase choices after ${name} changes`, () => {
  assert.ok(magnesium);
  assert.equal(matchPlan({ state, snapshot }).selected?.basket[0]?.productId, magnesium.productId);
  const revised = { ...snapshot, products: [changed] };
  assert.notEqual(catalogueSnapshotId(revised), catalogueSnapshotId(snapshot));
  const result = matchPlan({ state, snapshot: revised });
  assert.ok(!result.selected?.basket.some(item => item.productId === magnesium.productId));
  assert.ok(!result.alternatives.some(option => option.basket.some(item => item.productId === magnesium.productId)));
});

it("catalogue identity includes names, source requirements and nutrient resolution metadata", () => {
  const identity = catalogueSnapshotId(snapshot);
  for (const changed of [
    { ...snapshot, products: [{ ...magnesium, candidate: { ...magnesium.candidate, title: "Changed product description" } }] },
    { ...snapshot, products: [{ ...magnesium, dietarySource: "plant" as const }] },
    { ...snapshot, supplements: snapshot.supplements.map(item => ({ ...item, aliases: [...item.aliases, "New supported alias"] })) }
  ]) assert.notEqual(catalogueSnapshotId(changed), identity);
  assert.equal(catalogueSnapshotId({ ...original, products: [...original.products].reverse(), supplements: [...original.supplements].reverse() }), catalogueSnapshotId(original));
});

it("an unchanged catalogue observation keeps matching identity while retaining its freshness timestamp", () => {
  const refreshed = { ...snapshot, availabilityAsOf: "2026-09-08T12:00:00.000Z" };
  assert.notEqual(refreshed.availabilityAsOf, snapshot.availabilityAsOf);
  assert.equal(catalogueSnapshotId(refreshed), catalogueSnapshotId(snapshot));
  const fresh = matchPlan({ state, snapshot: refreshed }), previous = matchPlan({ state, snapshot });
  assert.equal(fresh.selected?.basket[0]?.availabilityAsOf, refreshed.availabilityAsOf);
  assert.equal(previous.selected?.basket[0]?.availabilityAsOf, snapshot.availabilityAsOf);
  // Observation timestamps are intentionally current; all matching facts and
  // commercial values must remain identical for unchanged catalogue content.
  const withoutObservationClock = (value: unknown): unknown => Array.isArray(value) ? value.map(withoutObservationClock)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "availabilityAsOf").map(([key, item]) => [key, withoutObservationClock(item)])) : value;
  assert.deepEqual(withoutObservationClock(fresh), withoutObservationClock(previous));
});
