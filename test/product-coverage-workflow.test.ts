import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildSimulationNextMoveRows,
  buildReviewPriorityProductRows,
  classifySupplementCoverage,
  emptyAdminPlanCoverageSimulationData,
  emptyAdminProductCoverageData,
  normalizeSimulationSampleSize,
  productCoversSupplementForMatching,
  runAdminPlanCoverageSimulation,
  simulationCustomerArchetypesFromInsights,
  simulationCustomerProfilesFromInsights
} from "../lib/admin-product-coverage.ts";
import type { AdminPlanCoverageDemandProfile } from "../lib/admin-product-coverage.ts";
import type {
  AdminCustomerInsightsData,
  CustomerInsightProfile
} from "../lib/admin-customer-insights.ts";
import type { ProductCandidate } from "../lib/product-recommendations.ts";

const supplementId = "11111111-1111-4111-8111-111111111111";
const magnesiumSupplementId = "33333333-3333-4333-8333-333333333333";

function product(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    automatedSafetyPassed: true,
    availabilityStatus: "in_stock",
    brandName: "Example",
    brandStatus: "approved",
    currency: "THB",
    facts: [
      {
        amount: 100,
        comparableAmount: 100000,
        confidence: "high",
        itemType: "supplement",
        name: "CoQ10",
        normalizedName: "coq10",
        supplementId,
        unit: "mg"
      }
    ],
    id: "22222222-2222-4222-8222-222222222222",
    imageUrl: "https://assets.mattanutra.com/product.webp",
    labelStatus: "parsed",
    platform: "manual",
    priceAmount: 120,
    productAudience: "both",
    productKind: "supplement",
    productUrl: "manual://product",
    region: "TH",
    status: "approved",
    title: "Example CoQ10",
    validation: {
      checkedAt: "2026-06-01T00:00:00.000Z",
      matchableFactCount: 1,
      reasons: [],
      status: "pass",
      summary: "1 matchable canonical fact."
    },
    ...overrides
  };
}

function customerProfile(
  overrides: Partial<CustomerInsightProfile> = {}
): CustomerInsightProfile {
  return {
    archetypeId: "precision:36-45:female:pre-menopause:energy",
    archetypeLabel: "40-ish pre-menopause woman focused on Energy",
    campaign: null,
    capturedAt: "2026-06-01T00:00:00.000Z",
    constraints: ["Metformin"],
    contactEmail: "hidden@example.com",
    demographics: {
      ageBand: "36-45",
      ageLabel: "40-ish",
      lifeStage: "pre-menopause",
      reproductiveStatus: null,
      sex: "female",
      sexLabel: "woman"
    },
    entitlement: "right_amount_formula",
    entitlementLabel: "Right Amount Formula",
    firstName: "Ada",
    funnelStage: "paid",
    goals: ["Energy"],
    healthScore: {
      band: "ok",
      focusAreas: ["Energy"],
      score: 74
    },
    identifiable: true,
    lastActivityAt: "2026-06-02T00:00:00.000Z",
    lastEvent: null,
    locale: "en",
    orderNumber: null,
    orderStatus: null,
    panya: {
      channelAddress: null,
      channelType: null,
      escalationCount: 0,
      failedCount: 0,
      inboundCount: 0,
      lastMessageAt: null,
      latestSnippets: [],
      messageCount: 0,
      outboundCount: 0
    },
    planId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    primarySegmentId: "paid",
    productInterests: [],
    profile: "Tired founder looking for steady energy.",
    purchaseReadinessScore: 80,
    region: "TH",
    segmentIds: ["paid"],
    segmentReasons: ["Paid customer"],
    selectedPlan: "precision",
    source: null,
    status: "complete",
    supplementInterests: ["CoQ10", "Magnesium"],
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides
  };
}

function customerInsightsData(
  customers: readonly CustomerInsightProfile[]
): AdminCustomerInsightsData {
  return {
    aiStatus: "disabled",
    archetypes: [],
    customers: [...customers],
    databaseAvailable: true,
    generatedAt: "2026-06-02T00:00:00.000Z",
    range: "month",
    segments: [],
    summary: {
      activeSegments: 0,
      identifiableCustomers: customers.length,
      orderLinkedCustomers: 0,
      paidCustomers: customers.length,
      panyaEngagedCustomers: 0,
      totalCustomers: customers.length
    }
  };
}

function demandProfile(
  overrides: Partial<AdminPlanCoverageDemandProfile> = {}
): AdminPlanCoverageDemandProfile {
  return {
    answers: {
      age: "36-45",
      country: "TH",
      disclosure: true,
      goals: ["energy"],
      sex: "female"
    },
    archetypeId: "busy-office-professional",
    archetypeName: "Busy office professional",
    clientSex: "female",
    generatedAt: "2026-06-02T00:00:00.000Z",
    id: "ai-demand-1-busy-office-professional",
    needs: [
      {
        category: "Antioxidants",
        displayName: "CoQ10",
        id: "supplement:coq10",
        itemType: "supplement",
        normalizedName: "coq10",
        sourceId: supplementId,
        targetComparableAmount: 100000,
        targetDose: null,
        targetText: "100 mg/day",
        weight: 8
      }
    ],
    sampleIndex: 0,
    supplementNames: ["CoQ10"],
    ...overrides
  };
}

describe("product coverage workflow", () => {
  it("classifies supplement coverage from eligible, pending, dirty and missing states", () => {
    assert.equal(
      classifySupplementCoverage({
        dirtyProductCount: 3,
        eligibleProductCount: 1,
        pendingReviewProductCount: 0
      }),
      "covered"
    );
    assert.equal(
      classifySupplementCoverage({
        dirtyProductCount: 1,
        eligibleProductCount: 0,
        pendingReviewProductCount: 2
      }),
      "pending_review"
    );
    assert.equal(
      classifySupplementCoverage({
        dirtyProductCount: 1,
        eligibleProductCount: 0,
        pendingReviewProductCount: 0
      }),
      "dirty"
    );
    assert.equal(
      classifySupplementCoverage({
        dirtyProductCount: 0,
        eligibleProductCount: 0,
        pendingReviewProductCount: 0
      }),
      "missing"
    );
  });

  it("requires a linked supplement fact with usable dose for matching coverage", () => {
    assert.equal(productCoversSupplementForMatching(product(), supplementId), true);
    assert.equal(
      productCoversSupplementForMatching(
        product({
          facts: [
            {
              amount: null,
              comparableAmount: null,
              confidence: "moderate",
              itemType: "supplement",
              name: "CoQ10",
              normalizedName: "coq10",
              supplementId,
              unit: null
            }
          ]
        }),
        supplementId
      ),
      false
    );
  });

  it("runs deterministic synthetic simulations without persistence dependencies", () => {
    const input = {
      candidates: [product()],
      countryCode: "TH",
      sampleSize: 8,
      seed: "fixed",
      supplements: [
        {
          category: "Antioxidants",
          id: supplementId,
          name: "CoQ10",
          normalizedName: "coq10",
          targetComparableAmount: 100000
        }
      ]
    };
    const first = runAdminPlanCoverageSimulation(input);
    const second = runAdminPlanCoverageSimulation(input);

    assert.deepEqual(first.summary, second.summary);
    assert.deepEqual(first.mostUsefulProducts, second.mostUsefulProducts);
    assert.equal(first.databaseAvailable, true);
    assert.equal(first.mostUsefulProducts[0]?.id, product().id);
  });

  it("uses generated demand profiles as simulator needs", () => {
    const result = runAdminPlanCoverageSimulation({
      candidates: [product()],
      countryCode: "TH",
      demandProfiles: [demandProfile()],
      sampleSize: 8,
      seed: "fixed",
      supplements: []
    });

    assert.equal(result.mostUsefulProducts[0]?.id, product().id);
    assert.equal(result.unmetSupplements.length, 0);
  });

  it("runs simulations with no approved product candidates", () => {
    const result = runAdminPlanCoverageSimulation({
      candidates: [],
      countryCode: "TH",
      demandProfiles: [demandProfile()],
      sampleSize: 8,
      seed: "fixed",
      supplements: []
    });

    assert.equal(result.sampleSize, 8);
    assert.equal(result.summary.averageCoveragePercent, 0);
    assert.equal(result.mostUsefulProducts.length, 0);
    assert.equal(result.unmetSupplements[0]?.name, "CoQ10");
    assert.equal(result.unmetSupplements[0]?.count, 8);
  });

  it("ranks blocked products by review opportunity without adding them to simulation", () => {
    const blockedProduct = product({
      facts: [
        ...product().facts,
        {
          amount: 200,
          comparableAmount: 200000,
          confidence: "high",
          itemType: "supplement",
          name: "Magnesium",
          normalizedName: "magnesium",
          supplementId: magnesiumSupplementId,
          unit: "mg"
        }
      ],
      id: "44444444-4444-4444-8444-444444444444",
      status: "pending_review",
      title: "Pending CoQ10 Magnesium"
    });
    const rows = buildReviewPriorityProductRows({
      candidates: [product(), blockedProduct],
      eligibleCandidates: [product()],
      supplements: [
        {
          category: "Antioxidants",
          id: supplementId,
          name: "CoQ10",
          normalizedName: "coq10",
          targetComparableAmount: 100000
        },
        {
          category: "Minerals",
          id: magnesiumSupplementId,
          name: "Magnesium",
          normalizedName: "magnesium",
          targetComparableAmount: 200000
        }
      ]
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, blockedProduct.id);
    assert.equal(rows[0]?.blockedReason, "Product is not approved yet");
    assert.equal(rows[0]?.gapSupplementCount, 1);
    assert.equal(rows[0]?.matchableSupplementCount, 2);
  });

  it("ranks next moves from simulation unmet demand", () => {
    const magnesiumNeed = {
      category: "Minerals",
      displayName: "Magnesium",
      id: "supplement:magnesium",
      itemType: "supplement" as const,
      normalizedName: "magnesium",
      sourceId: magnesiumSupplementId,
      targetComparableAmount: 200000,
      targetDose: null,
      targetText: "200 mg/day",
      weight: 8
    };
    const blockedProduct = product({
      facts: [
        ...product().facts,
        {
          amount: 200,
          comparableAmount: 200000,
          confidence: "high",
          itemType: "supplement",
          name: "Magnesium",
          normalizedName: "magnesium",
          supplementId: magnesiumSupplementId,
          unit: "mg"
        }
      ],
      id: "44444444-4444-4444-8444-444444444444",
      status: "pending_review",
      title: "Pending CoQ10 Magnesium"
    });
    const reviewRows = buildReviewPriorityProductRows({
      candidates: [product(), blockedProduct],
      eligibleCandidates: [product()],
      supplements: [
        {
          category: "Antioxidants",
          id: supplementId,
          name: "CoQ10",
          normalizedName: "coq10",
          targetComparableAmount: 100000
        },
        {
          category: "Minerals",
          id: magnesiumSupplementId,
          name: "Magnesium",
          normalizedName: "magnesium",
          targetComparableAmount: 200000
        }
      ]
    });
    const simulationData = runAdminPlanCoverageSimulation({
      candidates: [product()],
      countryCode: "TH",
      demandProfiles: [
        demandProfile({
          needs: [
            ...demandProfile().needs,
            magnesiumNeed
          ],
          supplementNames: ["CoQ10", "Magnesium"]
        })
      ],
      sampleSize: 8,
      seed: "fixed",
      supplements: []
    });
    const nextMoves = buildSimulationNextMoveRows({
      reviewPriorityProducts: reviewRows,
      simulationData
    });

    assert.equal(nextMoves[0]?.id, blockedProduct.id);
    assert.equal(nextMoves[0]?.unmetSupplementNames[0], "Magnesium");
    assert.equal(nextMoves[0]?.unmetDemandCount, 8);
  });

  it("converts Customer Intelligence users into simulator profiles", () => {
    const data = customerInsightsData([customerProfile()]);
    const profiles = simulationCustomerProfilesFromInsights(data);
    const archetypes = simulationCustomerArchetypesFromInsights(data);

    assert.equal(profiles[0]?.source, "customer_profile");
    assert.equal(profiles[0]?.age, 41);
    assert.equal(profiles[0]?.clientSex, "female");
    assert.equal(profiles[0]?.name, "Ada · 40-ish pre-menopause woman focused on Energy");
    assert.deepEqual(profiles[0]?.goals, ["Energy"]);
    assert.deepEqual(profiles[0]?.preferredSupplementNames, ["CoQ10", "Magnesium"]);
    assert.equal(profiles[0]?.medications.length, 0);
    assert.equal(archetypes[0]?.source, "customer_archetype");
    assert.equal(archetypes[0]?.customerCount, 1);
    assert.deepEqual(archetypes[0]?.preferredSupplementNames, ["CoQ10", "Magnesium"]);
  });

  it("keeps empty data safe and clamps sample sizes", () => {
    assert.equal(emptyAdminProductCoverageData("TH").databaseAvailable, false);
    assert.equal(emptyAdminPlanCoverageSimulationData({ sampleSize: 999 }).sampleSize, 256);
    assert.equal(normalizeSimulationSampleSize(1), 8);
  });

  it("wires dashboard views, read models, and reset guardrails", () => {
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");
    const readModel = readFileSync("lib/admin-product-coverage.ts", "utf8");
    const simulationModel = readFileSync(
      "lib/admin-product-coverage-simulation.ts",
      "utf8"
    );
    const view = readFileSync(
      "components/admin/product-coverage-view.tsx",
      "utf8"
    );
    const simulationInputRoute = readFileSync(
      "app/api/admin/product-coverage/simulation-input/route.ts",
      "utf8"
    );
    const demandProfileRoute = readFileSync(
      "app/api/admin/product-coverage/demand-profile/route.ts",
      "utf8"
    );
    const demandGeneration = readFileSync(
      "lib/admin-plan-demand-generation.ts",
      "utf8"
    );
    const resetScript = readFileSync(
      "scripts/products-master-pending-review.ts",
      "utf8"
    );
    const packageJson = readFileSync("package.json", "utf8");

    assert.match(dashboardContent, /"product-coverage"/);
    assert.match(dashboardContent, /"plan-coverage-simulator"/);
    assert.match(dashboardContent, /Supplement Coverage/);
    assert.doesNotMatch(dashboardContent, /Product Coverage/);
    assert.doesNotMatch(dashboardContent, /"product-insights"/);
    assert.doesNotMatch(dashboardContent, /"supplement-insights"/);
    assert.doesNotMatch(dashboardContent, /"coverage-improvement-insights"/);
    assert.match(dashboard, /AdminProductCoverageView/);
    assert.match(dashboard, /AdminPlanCoverageSimulatorView/);
    assert.match(dashboard, /Shows every active supplement/);
    assert.match(dashboard, /Run synthetic customer plans/);
    assert.match(page, /getAdminProductCoverageData/);
    assert.doesNotMatch(page, /getAdminPlanCoverageSimulationData/);
    assert.match(page, /retiredInsightsReplacementView/);
    assert.match(page, /product-insights/);
    assert.match(readModel, /targetComparableAmountBySupplement/);
    assert.match(readModel, /buildReviewPriorityProductRows/);
    assert.match(simulationModel, /buildSimulationNextMoveRows/);
    assert.match(simulationInputRoute, /getAdminPlanCoverageSimulationData/);
    assert.match(simulationInputRoute, /adminViewAllowed/);
    assert.match(simulationInputRoute, /"Cache-Control": "no-store"/);
    assert.match(demandProfileRoute, /generateAdminPlanCoverageDemandProfile/);
    assert.match(demandProfileRoute, /adminViewAllowed/);
    assert.match(demandGeneration, /analyzeFormulationWithGrok/);
    assert.match(demandGeneration, /buildProductNeeds/);
    assert.match(simulationModel, /recommendProductStackFullBeam/);
    assert.match(simulationModel, /demandProfiles/);
    assert.match(view, /SIMULATOR_STORAGE_KEY/);
    assert.match(view, /SIMULATOR_DEMAND_STORAGE_KEY/);
    assert.match(view, /version: 2\s*\n\s*}\s+satisfies SavedDemandProfilesState/);
    assert.match(view, /function loadSavedDemandProfiles\(\)/);
    assert.doesNotMatch(view, /parsed\.demandKey !== demandKey/);
    assert.match(view, /useState<\s*AdminPlanCoverageDemandProfile\[\]\s*>\(\s*loadSavedDemandProfiles\s*\)/);
    assert.match(view, /function savedDemandProfiles/);
    assert.match(view, /clearSavedDemandProfiles\(\)/);
    assert.match(view, /\/api\/admin\/product-coverage\/simulation-input/);
    assert.match(view, /cache: "no-store"/);
    assert.match(view, /inputStatus !== "ready"/);
    assert.match(view, /displayData: simulationDisplaySnapshotFromRunner/);
    assert.match(view, /loadSavedSimulationDisplayData/);
    assert.match(view, /cachedSimulationData \?\? initialSimulationData/);
    assert.match(view, /productResultRows/);
    assert.match(view, /visibleProductResultRows/);
    assert.match(view, /Eligible product results/);
    assert.match(view, /savedSimulationReplayTarget/);
    assert.match(view, /replayCachedDemandProfiles/);
    assert.match(view, /window\.addEventListener\("focus"/);
    assert.match(view, /window\.addEventListener\("pageshow"/);
    assert.match(view, /visibilitychange/);
    assert.match(view, /eligible products/);
    assert.match(view, /\/api\/admin\/product-coverage\/demand-profile/);
    assert.doesNotMatch(view, /Simulation assumptions/);
    assert.match(view, /SimulationProgressPanel/);
    assert.match(view, /Generating questionnaire/);
    assert.match(view, /Running simulation/);
    assert.match(view, /SimulatorActionBar/);
    assert.doesNotMatch(view, /input\.candidates\.length > 0/);
    assert.match(view, /value="results"/);
    assert.match(view, /value="profiles"/);
    assert.match(view, /value="all"/);
    assert.match(view, /currency \{simulationData\.summary\.currency\}/);
    assert.match(view, /amountText\(row\.expectedPriceAmount\)/);
    assert.doesNotMatch(view, /moneyText\(row\.expectedPriceAmount/);
    assert.doesNotMatch(view, /AI-generated plan demand/);
    assert.match(view, /Best next moves/);
    assert.match(view, /Clear list/);
    assert.match(view, /nextMoveReasonText/);
    assert.match(view, /Adding this covers/);
    assert.doesNotMatch(view, /row\.blockedReason/);
    assert.match(view, /simulator-clear-target/);
    assert.match(view, /ChevronDownIcon/);
    assert.match(view, /buildSimulationNextMoveRows/);
    assert.match(view, /runNextAdminPlanCoverageSimulationSample/);
    assert.match(view, /Clear/);
    assert.match(view, /Real archetypes are read-only/);
    assert.doesNotMatch(view, /PencilSquareIcon/);
    assert.doesNotMatch(view, /Actual users/);
    assert.doesNotMatch(view, /Open simulator/);
    assert.doesNotMatch(view, /Generate profiles/);
    assert.doesNotMatch(view, />\s*Age\s*</);
    assert.doesNotMatch(view, /Inputs ready/);
    assert.doesNotMatch(view, /sampleSizes/);
    assert.match(demandGeneration, /age is not supplied as an archetype setting/);
    assert.match(demandGeneration, /archetypeForQuestionnairePrompt/);
    assert.doesNotMatch(demandGeneration, /archetype: input\.archetype/);
    assert.doesNotMatch(readModel, /insert into public\.product_recommendation_runs/i);
    assert.doesNotMatch(readModel, /insert into public\.tasks/i);
    assert.doesNotMatch(simulationModel, /insert into public\.product_recommendation_runs/i);
    assert.doesNotMatch(simulationModel, /insert into public\.tasks/i);
    assert.doesNotMatch(demandProfileRoute, /persistAssessmentSubmission|writeBpmEvent|createTask|insert into/i);
    assert.doesNotMatch(demandGeneration, /persistAssessmentSubmission|writeBpmEvent|createTask|insert into public\.(assessments|tasks|bpm)/i);
    assert.match(resetScript, /Only DEV and UAT/);
    assert.match(resetScript, /target looks like production/);
    assert.match(resetScript, /--confirm-master-pending-review/);
    assert.match(packageJson, /products:master:pending-review/);
  });
});
