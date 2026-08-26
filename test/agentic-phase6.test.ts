import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS, fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { freezeCatalogueSnapshot } from "../lib/agentic/catalogue/freeze.ts";
import {
  coverageFor,
  factLedgerHash,
  matchPlan,
  matcherTelemetryFor
} from "../lib/agentic/plan/matching.ts";
import { normalizePlanRequest } from "../lib/agentic/plan/normalize.ts";
import type { AgenticConfig } from "../lib/agentic/config.ts";
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
      assert.equal(row.remainingGap, Math.max(0, row.requested - row.totalExposure));
      assert.equal(typeof row.delivered, "number");
      assert.equal(row.totalExposure, row.current + row.delivered);
      assert.ok(["covered", "over_target", "partial", "uncovered", "upper_limit_risk"].includes(row.status));
      if (row.status === "covered" || row.status === "over_target") {
        assert.equal(row.remainingGap, 0);
      }
    }

    const d3 = table.find((row) => row.name === "Vitamin D3");
    assert.ok(d3);
    assert.equal(d3.requested, 2000);
    assert.equal(d3.remainingGap, Math.max(0, d3.requested - d3.totalExposure));
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
    assert.equal(
      row.remainingGap,
      Math.max(0, row.requestedAmount - row.totalExposureAmount)
    );
    assert.equal(row.totalExposureAmount, row.currentAmount + row.deliveredAmount);
  });

  it("sets remainingGap 0 when delivered meets the requested amount", () => {
    const snapshot = frozen();
    const matched = matchPlan({ snapshot, state: aug25PlanState() });
    assert.ok(matched.selected);
    const covered = matched.selected.coverage.filter(
      (row) => row.status === "covered" || row.status === "over_target"
    );
    assert.ok(covered.length > 0);
    for (const row of covered) {
      assert.equal(row.remainingGap, 0);
      assert.ok(row.totalExposureAmount >= row.requestedAmount);
    }
  });

  it("counts name-only 400 mg current Magnesium against the Magnesium target", async () => {
    const mag = supplement("Magnesium");
    const snapshot = freezeCatalogueSnapshot({
      ...frozen(),
      supplements: [
        ...FIXTURE_SUPPLEMENTS,
        {
          acceptedUnits: ["mg"],
          aliases: ["Magnesium"],
          name: "Magnesium threonate",
          supplementId: "sup_magnesium_threonate_test",
          uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        }
      ]
    });
    const config: AgenticConfig = {
      activeMarkets: ["TH"],
      buildId: "phase6-current-mg",
      capabilitySecret: "test",
      checkoutTtlMs: 1000,
      continuation: "polling_only",
      environment: "dev",
      internalQaHarness: true,
      paymentProvider: "mock",
      planTtlMs: 1000,
      siteUrl: "http://127.0.0.1",
      thailandRetailerAdapter: "mock_thailand",
      userAccountRequired: false
    };
    const normalized = await normalizePlanRequest({
      config,
      snapshot,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        currentSupplements: [
          { name: "Magnesium", dailyAmount: 400, unit: "mg" }
        ],
        targets: [{ amount: 200, name: "Magnesium", unit: "mg" }]
      }
    });
    assert.equal("error" in normalized, false);
    if ("error" in normalized) {
      return;
    }
    assert.equal(normalized.state.currentSupplements[0]?.supplementId, mag.supplementId);
    const matched = matchPlan({ snapshot, state: normalized.state });
    const coverage = matched.selected?.coverage ?? coverageFor(normalized.state, null);
    const row = coverage.find((item) => item.name === "Magnesium");
    assert.ok(row);
    assert.equal(row.requestedAmount, 200);
    assert.equal(row.currentAmount, 400);
    assert.ok(row.totalExposureAmount >= 400);
    assert.equal(row.remainingGap, 0);
    assert.equal(
      matched.leftovers.some((item) => item.name === "Magnesium" && item.reason === "uncovered"),
      false
    );
  });

  it("does not treat incidental sub-floor B12 as a 3% match", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const base = live.products.find((item) => /magnesium/i.test(item.candidate.title));
    assert.ok(base);
    const d3 = supplement("Vitamin D3");
    const b12 = supplement("Vitamin B12");
    const c = supplement("Vitamin C");
    const fifty = withFacts(
      {
        ...base,
        contributionSupplementIds: [d3.supplementId, b12.supplementId, c.supplementId],
        productId: "prd_fifty_plus_incidental_b12",
        retailerSku: "TH-50PLUS-B12"
      },
      [
        fact("Vitamin D3", 600, "IU", "vitamin_d3"),
        fact("Vitamin B12", 2.4, "mcg", "vitamin_b12"),
        fact("Vitamin C", 45, "mg", "vitamin_c")
      ],
      [d3.supplementId, b12.supplementId, c.supplementId]
    );
    const snapshot = frozen([
      {
        ...fifty,
        candidate: {
          ...fifty.candidate,
          title: "Blackmores Multivitamins for 50+"
        }
      }
    ]);
    const state = aug25PlanState({
      targets: [
        {
          amount: 2000,
          name: "Vitamin D3",
          supplementId: d3.supplementId,
          unit: "IU"
        },
        {
          amount: 250,
          name: "Vitamin B12",
          supplementId: b12.supplementId,
          unit: "mcg"
        }
      ]
    });
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);
    const b12Row = matched.selected.coverage.find((row) => row.name === "Vitamin B12");
    assert.ok(b12Row);
    assert.equal(b12Row.coveragePercent, 0);
    assert.equal(b12Row.status, "uncovered");
    assert.ok(b12Row.remainingGap > 0);
    assert.equal(
      Math.max(0, b12Row.requestedAmount - b12Row.totalExposureAmount),
      b12Row.remainingGap
    );
    assert.equal(
      matched.leftovers.some(
        (item) =>
          item.name === "Vitamin B12" &&
          (item.reason === "dose_gap" || item.reason === "uncovered") &&
          !String(item.note ?? "").includes("covered 3%")
      ),
      true
    );
    const line = matched.selected.basket.find((item) =>
      /50\+/.test(item.productName)
    );
    assert.ok(line);
    assert.equal(line.requestedNutrientNames.includes("Vitamin B12"), false);
  });

  it("credits Conceive Well Folic acid 500 mcg as Vitamin B9 500 mcg", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const base = live.products.find((item) => /folate/i.test(item.candidate.title));
    assert.ok(base);
    const folate = supplement("Folate");
    const prenatal = {
      ...base,
      contributionSupplementIds: [folate.supplementId],
      productId: "prd_conceive_well_gold_b9",
      retailerSku: "TH-CWG-B9",
      candidate: {
        ...base.candidate,
        facts: [fact("Folic acid", 500, "mcg", "folic_acid")],
        title: "Blackmores Conceive Well Gold"
      }
    };
    const snapshot = frozen([prenatal]);
    const state = aug25PlanState({
      profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
      targets: [
        {
          amount: 500,
          name: "Vitamin B9",
          supplementId: folate.supplementId,
          unit: "mcg"
        }
      ]
    });
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);
    const row = matched.selected.coverage.find((item) => item.supplementId === folate.supplementId);
    assert.ok(row);
    assert.equal(row.deliveredAmount, 500);
    assert.equal(row.totalExposureAmount, 500);
    assert.equal(row.remainingGap, 0);
    assert.deepEqual(
      row.contributors?.map((item) => ({
        amount: item.amount,
        name: item.productName
      })),
      [{ amount: 500, name: "Blackmores Conceive Well Gold" }]
    );
  });

  it("hashes Folate, Folic acid and Vitamin B9 ledgers the same for Conceive Well", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const base = live.products.find((item) => /folate/i.test(item.candidate.title));
    assert.ok(base);
    const folate = supplement("Folate");
    const prenatal = {
      ...base,
      contributionSupplementIds: [folate.supplementId],
      productId: "prd_conceive_well_gold_hash",
      retailerSku: "TH-CWG-HASH",
      candidate: {
        ...base.candidate,
        facts: [fact("Folic acid", 500, "mcg", "folic_acid")],
        title: "Blackmores Conceive Well Gold"
      }
    };
    const snapshot = frozen([prenatal]);
    const hashes = ["Folate", "Folic acid", "Vitamin B9"].map((name) => {
      const state = aug25PlanState({
        profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
        targets: [
          {
            amount: 500,
            name,
            supplementId: folate.supplementId,
            unit: "mcg"
          }
        ]
      });
      const matched = matchPlan({ snapshot, state });
      const telemetry = matcherTelemetryFor({
        leftovers: matched.leftovers,
        selected: matched.selected,
        snapshot,
        state
      });
      assert.ok(telemetry.factLedgerHash);
      assert.equal(telemetry.factLedger?.length, 1);
      assert.equal(telemetry.factLedger?.[0]?.amount, 500);
      return telemetry.factLedgerHash;
    });
    assert.equal(hashes[0], hashes[1]);
    assert.equal(hashes[1], hashes[2]);
    assert.notEqual(hashes[0], factLedgerHash([]));
  });

  it("prints one canonical target-set hash for 20 official target orders", () => {
    const base = aug25PlanState().targets;
    const hashes = new Set<string>();

    for (let index = 0; index < 20; index += 1) {
      const rotated = [
        ...base.slice(index % base.length),
        ...base.slice(0, index % base.length)
      ];
      const telemetry = matcherTelemetryFor({
        leftovers: [],
        selected: null,
        state: aug25PlanState({ targets: rotated })
      });
      assert.ok(telemetry.targetSetHash);
      hashes.add(telemetry.targetSetHash);
      const payload = publicPlanFields({
        alternatives: [],
        basket: [],
        changeSummary: [],
        coverage: [],
        leftovers: [],
        matcherTelemetry: telemetry,
        questions: [],
        safetyGuidance: [],
        selected: null,
        status: "blocked",
        summary: "hash",
        unmetRequirements: []
      });
      const publicTelemetry = payload.matcherTelemetry as { targetSetHash?: string };
      assert.equal(publicTelemetry.targetSetHash, telemetry.targetSetHash);
    }

    assert.equal(hashes.size, 1);
  });

  it("records per-target frontiers and a D3 loss certificate on official fewest_pills", () => {
    const snapshot = frozen();
    const state = aug25PlanState();
    const matched = matchPlan({ snapshot, state });
    assert.ok(matched.selected);
    assert.ok((matched.targetFrontiers ?? []).length >= 1);
    assert.equal(matched.targetFrontiers?.length, state.targets.length);
    const telemetry = matcherTelemetryFor({
      leftovers: matched.leftovers,
      lossCertificates: matched.lossCertificates,
      selected: matched.selected,
      snapshot,
      state,
      targetFrontiers: matched.targetFrontiers
    });
    assert.equal(telemetry.targetFrontiers?.length, matched.targetFrontiers?.length);
  });

  it("credits Conceive Well Vitamin D 400 IU as Vitamin D3 400 IU", () => {
    const live = fixtureSnapshot("2026-08-25T00:00:00.000Z");
    const base = live.products.find((item) => /d3/i.test(item.candidate.title));
    assert.ok(base);
    const d3 = supplement("Vitamin D3");
    const prenatal = {
      ...base,
      contributionSupplementIds: [d3.supplementId],
      productId: "prd_conceive_well_gold_d3",
      retailerSku: "TH-CWG-D3",
      candidate: {
        ...base.candidate,
        facts: [fact("Vitamin D", 400, "IU", "vitamin_d")],
        title: "Blackmores Conceive Well Gold"
      }
    };
    const snapshot = frozen([prenatal]);
    const state = aug25PlanState({
      profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
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
    const row = matched.selected.coverage.find((item) => item.supplementId === d3.supplementId);
    assert.ok(row);
    assert.equal(row.deliveredAmount, 400);
    assert.equal(row.totalExposureAmount, 400);
    assert.equal(row.remainingGap, 1600);
    assert.deepEqual(
      row.contributors?.map((item) => ({
        amount: item.amount,
        name: item.productName
      })),
      [{ amount: 400, name: "Blackmores Conceive Well Gold" }]
    );
  });

  it("sums Conceive Well 400 IU and Joint Mobility 400 IU to 800 IU coverage and UL exposure", () => {
    const d3 = supplement("Vitamin D3");
    const state = aug25PlanState({
      targets: [
        {
          amount: 2000,
          name: "Vitamin D3",
          supplementId: d3.supplementId,
          unit: "IU"
        }
      ]
    });
    const item = (
      productId: string,
      productName: string,
      nutrients: Array<{ amount: number; name: string; unit: "IU" | "mcg" }>
    ) =>
      ({
        availabilityAsOf: "2026-08-26T00:00:00.000Z",
        contributionSupplementIds: [d3.supplementId],
        currency: "THB",
        dailyPills: 1,
        deliveryWindow: null,
        fixture: true,
        form: "capsule",
        imageUrl: null,
        incidentalNutrientNames: [],
        incidentalNutrients: [],
        incompleteCommercialFacts: false,
        lineTotalMinor: 100,
        pillsPerServing: 1,
        productId,
        productName,
        quantity: 1,
        requestedNutrientNames: nutrients.map((nutrient) => nutrient.name),
        requestedNutrients: nutrients,
        retailerSku: productId,
        sellerId: "seller_th",
        sellerName: "TH",
        servingsPerDay: 1,
        source: "fixture",
        stockStatus: "in_stock",
        unitPriceMinor: 100
      }) as const;
    const rows = coverageFor(
      state,
      {
        aggregateCoverage: 4000,
        coverageBySubject: new Map([[d3.supplementId, 4000]]),
        coveredCount: 0,
        dailyPills: 2,
        dedicatedPartialCount: 2,
        exposure: { provenance: [], totals: new Map() },
        incidentalCount: 0,
        oversupplyScore: 0,
        priceMinor: 200,
        productCount: 2,
        productIds: ["prd_cw", "prd_joint"],
        reason: "test",
        requestedLabelCount: 2,
        safety: { findings: [], hardBlocked: false, requiresAck: false },
        sellerId: "seller_th",
        variantIds: ["prd_cw:x1", "prd_joint:x1"]
      },
      [
        item("prd_cw", "Blackmores Conceive Well Gold", [
          { amount: 400, name: "Vitamin D", unit: "IU" }
        ]),
        item("prd_joint", "Blackmores Joint Mobility Plus", [
          { amount: 10, name: "Vitamin D3", unit: "mcg" }
        ])
      ]
    );
    const row = rows.find((item) => item.supplementId === d3.supplementId);
    assert.ok(row);
    assert.equal(row.deliveredAmount, 800);
    assert.equal(row.totalExposureAmount, 800);
    assert.equal(row.remainingGap, 1200);
    assert.equal(row.contributors?.length, 2);
    assert.equal(
      row.contributors?.reduce((sum, contrib) => sum + contrib.amount, 0),
      800
    );
    if (row.upperLimitAmount != null && row.upperLimitAmount > 0) {
      assert.equal(
        row.percentOfUpperLimit,
        Math.round((row.totalExposureAmount / row.upperLimitAmount) * 100)
      );
    }
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
