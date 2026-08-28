import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS, fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import {
  catalogueSnapshotId,
  freezeCatalogueSnapshot
} from "../lib/agentic/catalogue/freeze.ts";
import { classifySnapshotTargets } from "../lib/agentic/plan/classify.ts";
import { matchPlan, matcherTelemetryFor, toCanonicalRequest } from "../lib/agentic/plan/matching.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { publicPlanFields } from "../lib/agentic/public-mapper.ts";
import type { CatalogueProduct } from "../lib/agentic/catalogue/types.ts";

function sterolId() {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Plant sterols");
  assert.ok(found);
  return found.supplementId;
}

function k2Id() {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Vitamin K2");
  assert.ok(found);
  return found.supplementId;
}

describe("Mode D frozen TH snapshot", () => {
  it("freezes a read-only snapshot and stamps a stable snapshot id", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const frozen = freezeCatalogueSnapshot({
      ...live,
      catalogueVersion: `retail-TH-${live.products.length}`
    });
    assert.equal(frozen.catalogueVersion.startsWith("retail-TH-"), true);
    assert.throws(() => {
      (frozen.products as CatalogueProduct[]).push(live.products[0]!);
    });
    const first = catalogueSnapshotId(frozen);
    const second = catalogueSnapshotId(frozen);
    assert.equal(first, second);
    assert.match(first, /^snap_[0-9a-f]{16}$/);
  });

  it("records snapshot id, product ids and exposure on the 25 Aug five-target request", () => {
    const snapshot = freezeCatalogueSnapshot({
      ...fixtureSnapshot("2026-08-25T00:00:00.000Z"),
      catalogueVersion: "retail-TH-frozen-test"
    });
    const state = aug25PlanState();
    const matched = matchPlan({ snapshot, state });
    const request = toCanonicalRequest(state);
    const telemetry = matcherTelemetryFor({
      leftovers: matched.leftovers,
      rejected: matched.rejected,
      selected: matched.selected,
      snapshot,
      state
    });

    assert.equal(telemetry.snapshotId, catalogueSnapshotId(snapshot));
    assert.equal(telemetry.availabilityAsOf, "2026-08-25T00:00:00.000Z");
    assert.equal((telemetry.targetClassifications ?? []).length, 5);
    assert.ok((telemetry.productIds ?? []).length >= 1);
    assert.ok(matched.selected);
    assert.equal(
      matched.selected?.basket.some((item) => /prenatal|conceive|pre 9/i.test(item.productName)),
      false
    );

    const table = (matched.selected?.coverage ?? []).map((row) => ({
      name: row.name,
      requested: row.requestedAmount,
      delivered: row.deliveredAmount,
      totalExposure: row.totalExposureAmount,
      percentOfUpperLimit: row.percentOfUpperLimit,
      status: row.status,
      productIds: matched.selected?.basket.map((item) => item.productId)
    }));
    assert.equal(table.length, 5);
    for (const row of table) {
      assert.equal(typeof row.delivered, "number");
      assert.equal(typeof row.totalExposure, "number");
    }

    const classes = Object.fromEntries(
      (telemetry.targetClassifications ?? []).map((item) => [item.name, item.class])
    );
    assert.equal(classes["Vitamin D3"], "available");
    assert.equal(classes["Omega-3"], "available");
    assert.ok(["available", "matcher_defect", "genuine_gap"].includes(String(classes["Magnesium"])));
    assert.ok(["available", "matcher_defect", "genuine_gap"].includes(String(classes["Vitamin B12"])));
    assert.ok(["available", "matcher_defect", "genuine_gap"].includes(String(classes["Vitamin C"])));
    assert.equal("Plant sterols" in classes, false);
    assert.equal("error" in request, false);

    const publicPayload = publicPlanFields({
      alternatives: matched.alternatives,
      basket: matched.selected?.basket ?? [],
      changeSummary: [],
      coverage: matched.selected?.coverage ?? [],
      leftovers: matched.leftovers,
      matcherTelemetry: telemetry,
      questions: [],
      safetyGuidance: [],
      selected: matched.selected,
      status: "needs_input",
      summary: "mode-d",
      unmetRequirements: matched.unmetRequirements
    });
    const encoded = JSON.stringify(publicPayload);
    assert.equal("catalogueVersion" in publicPayload, false);
    assert.equal(encoded.includes("rejectedAll"), false);
    assert.equal("matcherTelemetry" in publicPayload, false);
    assert.equal("catalogId" in publicPayload, false);
    assert.equal(encoded.toLowerCase().includes("snapshot"), false);
  });

  it("classifies missing plant sterols as a genuine gap, not invented coverage", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const snapshot = freezeCatalogueSnapshot({
      ...live,
      catalogueVersion: "retail-TH-frozen-test",
      products: live.products.filter(
        (item) => !item.contributionSupplementIds.includes(sterolId())
      )
    });
    const state = aug25PlanState({
      targets: [
        {
          amount: 2000,
          name: "Plant sterols",
          supplementId: sterolId(),
          unit: "mg"
        }
      ]
    });
    const matched = matchPlan({ snapshot, state });
    const classes = classifySnapshotTargets({
      request: toCanonicalRequest(state),
      selected: matched.selected,
      snapshot,
      state
    });
    assert.equal(classes[0]?.class, "genuine_gap");
    assert.equal(classes[0]?.coveragePercent, 0);
    assert.ok(matched.leftovers.some((item) => item.reason === "uncovered"));
  });

  it("classifies an unmapped lookalike title as a mapping defect", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const donor = live.products[0]!;
    const lookalike: CatalogueProduct = {
      ...donor,
      contributionSupplementIds: [],
      candidate: {
        ...donor.candidate,
        facts: [
          {
            amount: 100,
            comparableAmount: 100,
            confidence: "high",
            itemType: "supplement",
            name: "MenaQ7 Super",
            normalizedName: "menaq7_super",
            unit: "mcg"
          }
        ],
        title: "Menaquinone-7 100 mcg"
      },
      productId: "prd_mapping_k2_lookalike",
      retailerSku: "TH-K2-LOOK"
    };
    const snapshot = freezeCatalogueSnapshot({
      ...live,
      catalogueVersion: "retail-TH-frozen-test",
      products: [lookalike]
    });
    const state = aug25PlanState({
      targets: [
        {
          amount: 100,
          name: "Vitamin K2",
          supplementId: k2Id(),
          unit: "mcg"
        }
      ]
    });
    const matched = matchPlan({ snapshot, state });
    const classes = classifySnapshotTargets({
      request: toCanonicalRequest(state),
      selected: matched.selected,
      snapshot,
      state
    });
    assert.equal(classes[0]?.class, "mapping_defect");
    assert.equal(classes[0]?.mappedProductCount, 0);
  });

  it("classifies mapped SKUs that cannot hit the coverage floor as a genuine gap", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const d3 = live.products.find((item) =>
      /vitamin d3/i.test(item.candidate.title)
    );
    assert.ok(d3);
    const broken: CatalogueProduct = {
      ...d3,
      candidate: {
        ...d3.candidate,
        facts: d3.candidate.facts.map((fact) => ({ ...fact, amount: 0, comparableAmount: 0 }))
      },
      productId: "prd_matcher_defect_d3"
    };
    const snapshot = freezeCatalogueSnapshot({
      ...live,
      catalogueVersion: "retail-TH-frozen-test",
      products: [broken]
    });
    const state = aug25PlanState({
      targets: [aug25PlanState().targets[0]!]
    });
    const matched = matchPlan({ snapshot, state });
    const classes = classifySnapshotTargets({
      request: toCanonicalRequest(state),
      selected: matched.selected,
      snapshot,
      state
    });
    assert.equal(classes[0]?.class, "genuine_gap");
    assert.ok((classes[0]?.mappedProductCount ?? 0) >= 1);
    assert.ok((classes[0]?.eligibleProductCount ?? 0) >= 1);
  });
});
