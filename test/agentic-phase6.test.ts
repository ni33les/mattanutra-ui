import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS, fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { freezeCatalogueSnapshot } from "../lib/agentic/catalogue/freeze.ts";
import { matchPlan, matcherTelemetryFor } from "../lib/agentic/plan/matching.ts";
import { aug25PlanState } from "../lib/agentic/plan/mode-d.ts";
import { MATCHER_VERSION } from "../lib/matcher/config.ts";
import {
  PUBLIC_NUTRIENT_NAME_LIMIT,
  publicPlanFields
} from "../lib/agentic/public-mapper.ts";
import type { CatalogueProduct } from "../lib/agentic/catalogue/types.ts";
import type { ProductCandidateFact } from "../lib/product-recommendation-types.ts";

function supplement(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

function frozen(products?: readonly CatalogueProduct[]) {
  const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
  return freezeCatalogueSnapshot({
    ...live,
    catalogueVersion: "retail-TH-phase6",
    ...(products ? { products } : {})
  });
}

function fact(
  name: string,
  amount: number,
  unit: string,
  normalizedName: string
): ProductCandidateFact {
  return {
    amount,
    comparableAmount: amount,
    confidence: "high",
    itemType: "supplement",
    name,
    normalizedName,
    unit
  };
}

function withFacts(
  product: CatalogueProduct,
  extra: readonly ProductCandidateFact[],
  contributionIds: readonly string[] = product.contributionSupplementIds
): CatalogueProduct {
  return {
    ...product,
    contributionSupplementIds: [...contributionIds],
    candidate: {
      ...product.candidate,
      facts: [...product.candidate.facts, ...extra]
    }
  };
}

function publicEncoded(input: {
  leftovers: ReturnType<typeof matchPlan>["leftovers"];
  rejected: ReturnType<typeof matchPlan>["rejected"];
  selected: ReturnType<typeof matchPlan>["selected"];
  snapshot: ReturnType<typeof frozen>;
  state: ReturnType<typeof aug25PlanState>;
  unmetRequirements: ReturnType<typeof matchPlan>["unmetRequirements"];
}) {
  const telemetry = matcherTelemetryFor({
    leftovers: input.leftovers,
    rejected: input.rejected,
    selected: input.selected,
    snapshot: input.snapshot,
    state: input.state
  });

  return {
    payload: publicPlanFields({
      alternatives: [],
      basket: input.selected?.basket ?? [],
      changeSummary: [],
      coverage: input.selected?.coverage ?? [],
      leftovers: input.leftovers,
      matcherTelemetry: telemetry,
      questions: [],
      safetyGuidance: [],
      selected: input.selected,
      status: "needs_input",
      summary: "phase-6",
      unmetRequirements: input.unmetRequirements
    }),
    telemetry
  };
}

describe("Phase 6 bounded evidence fields", () => {
  it("records current, remaining gap, delivered, total exposure and %UL on 25 Aug coverage", () => {
    const snapshot = frozen();
    const state = aug25PlanState();
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);

    const table = matched.selected.coverage.map((row) => ({
      current: row.currentAmount,
      delivered: row.deliveredAmount,
      name: row.name,
      percentOfUpperLimit: row.percentOfUpperLimit,
      remainingGap: row.remainingGap,
      requested: row.requestedAmount,
      status: row.status,
      totalExposure: row.totalExposureAmount
    }));

    assert.equal(table.length, 5);
    for (const row of table) {
      assert.equal(row.current, 0);
      assert.equal(row.remainingGap, row.requested);
      assert.equal(typeof row.delivered, "number");
      assert.equal(row.totalExposure, row.current + row.delivered);
      assert.ok(["covered", "over_target", "partial", "uncovered", "upper_limit_risk"].includes(row.status));
    }

    const d3 = table.find((row) => row.name === "Vitamin D3");
    assert.ok(d3);
    assert.equal(d3.requested, 2000);
    assert.equal(d3.remainingGap, 2000);
  });

  it("nets remaining gap from current intake without rewriting requested", () => {
    const snapshot = frozen();
    const d3 = supplement("Vitamin D3");
    const state = aug25PlanState({
      currentSupplements: [
        {
          dailyAmount: 1000,
          name: "Vitamin D3",
          supplementId: d3.supplementId,
          unit: "IU"
        }
      ],
      targets: [
        {
          amount: 2000,
          name: "Vitamin D3",
          supplementId: d3.supplementId,
          unit: "IU"
        }
      ]
    });
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);
    const row = matched.selected.coverage[0];
    assert.ok(row);
    assert.equal(row.requestedAmount, 2000);
    assert.equal(row.currentAmount, 1000);
    assert.equal(row.remainingGap, 1000);
    assert.equal(row.totalExposureAmount, row.currentAmount + row.deliveredAmount);
  });

  it("stamps servings/day, pill burden, and incidental vs requested nutrients on basket lines", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const collagen = live.products.find((item) => /collagen/i.test(item.candidate.title));
    assert.ok(collagen);
    const combo = withFacts(
      {
        ...collagen,
        productId: "prd_incidental_c_phase6",
        retailerSku: "TH-COL-C"
      },
      [fact("Vitamin C", 500, "mg", "vitamin_c")],
      [...collagen.contributionSupplementIds, supplement("Vitamin C").supplementId]
    );
    const snapshot = frozen([combo]);
    const state = aug25PlanState({
      targets: [
        {
          amount: 500,
          name: "Vitamin C",
          supplementId: supplement("Vitamin C").supplementId,
          unit: "mg"
        }
      ]
    });
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);
    const line = matched.selected.basket[0];
    assert.ok(line);
    assert.equal(line.servingsPerDay, line.quantity);
    assert.ok(line.servingsPerDay >= 1);
    assert.equal(typeof line.pillsPerServing, "number");
    assert.equal(typeof line.dailyPills, "number");
    assert.equal(line.requestedNutrientNames.includes("Vitamin C"), true);
    assert.equal(line.incidentalNutrientNames.includes("Collagen"), true);
    assert.equal(line.requestedNutrientNames.includes("Collagen"), false);
    assert.equal(line.incidentalNutrientNames.includes("Vitamin C"), false);
  });

  it("stamps matcher version, snapshot id and optimisation reason on the selected option", () => {
    const snapshot = frozen();
    const state = aug25PlanState({ optimization: "fewest_pills" });
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);
    assert.equal(matched.selected.matcherVersion, MATCHER_VERSION);
    assert.equal(matched.selected.snapshotId.startsWith("snap_"), true);
    assert.ok(matched.selected.reason.trim().length > 0);
    assert.equal(/beam|snapshot|catalogueVersion/i.test(matched.selected.reason), false);

    const telemetry = matcherTelemetryFor({
      leftovers: matched.leftovers,
      rejected: matched.rejected,
      selected: matched.selected,
      snapshot,
      state
    });
    assert.equal(telemetry.matcherVersion, MATCHER_VERSION);
    assert.equal(telemetry.snapshotId, matched.selected.snapshotId);
  });

  it("exposes bounded evidence on the public payload without leaking snapshot internals", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const d3 = live.products.find((item) => item.candidate.title === "Vitamin D3 2000 IU");
    assert.ok(d3);
    const noisy = withFacts(
      d3,
      Array.from({ length: 20 }, (_, index) =>
        fact(`Noise ${index + 1}`, 1, "mg", `noise_${index + 1}`)
      )
    );
    const snapshot = frozen([noisy]);
    const state = aug25PlanState({
      targets: [aug25PlanState().targets[0]!]
    });
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);
    const { payload, telemetry } = publicEncoded({
      leftovers: matched.leftovers,
      rejected: matched.rejected,
      selected: matched.selected,
      snapshot,
      state,
      unmetRequirements: matched.unmetRequirements
    });
    const coverage = payload.coverage as Array<Record<string, unknown>>;
    const basket = payload.basket as Array<Record<string, unknown>>;
    assert.ok(coverage[0]);
    assert.equal(typeof coverage[0].remainingGap, "number");
    assert.equal(typeof coverage[0].currentAmount, "number");
    assert.equal(typeof coverage[0].deliveredAmount, "number");
    assert.equal(typeof coverage[0].totalExposureAmount, "number");
    assert.ok(basket[0]);
    assert.equal(typeof basket[0].servingsPerDay, "number");
    assert.equal(typeof basket[0].pillsPerServing, "number");
    assert.ok(Array.isArray(basket[0].requestedNutrientNames));
    assert.ok(Array.isArray(basket[0].incidentalNutrientNames));
    assert.equal(
      (basket[0].incidentalNutrientNames as string[]).length <= PUBLIC_NUTRIENT_NAME_LIMIT,
      true
    );
    assert.equal(payload.matcherVersion, MATCHER_VERSION);
    assert.equal(payload.catalogId, telemetry.snapshotId);
    assert.equal(
      (payload.matcherTelemetry as { matcherVersion?: string; catalogId?: string }).matcherVersion,
      MATCHER_VERSION
    );
    assert.equal(
      (payload.matcherTelemetry as { catalogId?: string }).catalogId,
      telemetry.snapshotId
    );
    assert.ok(String(payload.reason ?? "").length > 0);
    const encoded = JSON.stringify(payload);
    assert.equal(encoded.includes("rejectedAll"), false);
    assert.equal(encoded.toLowerCase().includes("snapshot"), false);
    assert.equal("snapshotId" in payload, false);
    assert.equal(
      JSON.stringify(payload.matcherTelemetry ?? {}).includes("snapshotId"),
      false
    );
  });
});
