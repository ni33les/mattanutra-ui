import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildAdminCataloguePotentialTraceChunk,
  buildSimulationNextMoveRows,
  buildReviewPriorityProductRows,
  classifySupplementCoverage,
  emptyAdminPlanCoverageSimulationData,
  emptyAdminProductCoverageData,
  normalizeSimulationSampleSize,
  productCoversSupplementForMatching,
  runAdminCatalogueOptimization,
  runAdminCatalogueOptimizationCooperatively,
  runAdminCatalogueOptimizationFast,
  runAdminCataloguePotentialOptimizationFromTraces,
  runAdminCataloguePotentialOptimizationFast,
  runAdminPlanCoverageSimulation,
  sanitizeDemandProfilesForSimulationSupplements,
  simulationCustomerArchetypesFromInsights,
  simulationCustomerProfilesFromInsights
} from "../lib/admin-product-coverage.ts";
import {
  filterProductNeedsBySupplementAvailability,
  productHasCountryBlockedSupplement,
  supplementAvailabilityLookupFromRows
} from "../lib/supplement-country-availability.ts";
import type {
  AdminPlanCoverageDemandProfile,
  AdminSimulationReviewProductRow
} from "../lib/admin-product-coverage.ts";
import type {
  AdminCustomerInsightsData,
  CustomerInsightProfile
} from "../lib/admin-customer-insights.ts";
import type { ProductCandidate } from "../lib/product-recommendations.ts";

const supplementId = "11111111-1111-4111-8111-111111111111";
const apigeninSupplementId = "aaaaaaaa-1111-4111-8111-111111111111";
const ashwagandhaSupplementId = "99999999-9999-4999-8999-999999999999";
const rhodiolaSupplementId = "77777777-7777-4777-8777-777777777777";
const magnesiumSupplementId = "33333333-3333-4333-8333-333333333333";
const zincSupplementId = "55555555-5555-4555-8555-555555555555";

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

function supplementNeed(input: Readonly<{
  category?: string;
  displayName: string;
  id: string;
  targetComparableAmount: number;
  targetText: string;
  weight?: number;
}>) {
  return {
    category: input.category ?? "Supplement",
    displayName: input.displayName,
    id: `supplement:${input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    itemType: "supplement" as const,
    normalizedName: input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    sourceId: input.id,
    targetComparableAmount: input.targetComparableAmount,
    targetDose: null,
    targetText: input.targetText,
    weight: input.weight ?? 8
  };
}

function fact(input: Readonly<{
  amount: number;
  name: string;
  supplementId: string;
  unit?: string;
}>) {
  return {
    amount: input.amount,
    comparableAmount: input.amount * 1000,
    confidence: "high" as const,
    itemType: "supplement" as const,
    name: input.name,
    normalizedName: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    supplementId: input.supplementId,
    unit: input.unit ?? "mg"
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

  it("reports simulator convergence after the balanced sample window", () => {
    const input = {
      candidates: [product()],
      countryCode: "TH",
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
    const early = runAdminPlanCoverageSimulation({ ...input, sampleSize: 32 });
    const stable = runAdminPlanCoverageSimulation({ ...input, sampleSize: 64 });
    const complete = runAdminPlanCoverageSimulation({ ...input, sampleSize: 256 });

    assert.equal(early.convergence.status, "insufficient_samples");
    assert.equal(stable.convergence.status, "stable");
    assert.equal(stable.convergence.stable, true);
    assert.equal(stable.convergence.windowSize, 32);
    assert.equal(stable.convergence.topProductOverlapPercent, 100);
    assert.equal(complete.convergence.status, "complete");
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

  it("repairs cached demand numeric targets from readable dose text", () => {
    const apigeninProduct = product({
      facts: [
        {
          amount: 50,
          comparableAmount: 50000,
          confidence: "high",
          itemType: "supplement",
          name: "Apigenin",
          normalizedName: "apigenin",
          supplementId: apigeninSupplementId,
          unit: "mg"
        }
      ],
      id: "aaaaaaaa-2222-4222-8222-222222222222",
      title: "Example Apigenin"
    });
    const result = runAdminPlanCoverageSimulation({
      candidates: [apigeninProduct],
      countryCode: "TH",
      demandProfiles: [
        demandProfile({
          needs: [
            {
              category: "Advanced Longevity",
              displayName: "Apigenin",
              id: "supplement:apigenin",
              itemType: "supplement",
              normalizedName: "apigenin",
              sourceId: apigeninSupplementId,
              targetComparableAmount: 500000,
              targetDose: null,
              targetText: "50 mg/day",
              weight: 8
            }
          ],
          supplementNames: ["Apigenin"]
        })
      ],
      sampleSize: 8,
      seed: "fixed",
      supplements: [
        {
          category: "Advanced Longevity",
          id: apigeninSupplementId,
          name: "Apigenin",
          normalizedName: "apigenin",
          targetComparableAmount: 50000
        }
      ]
    });

    assert.equal(result.summary.averageCoveragePercent, 100);
    assert.equal(result.mostUsefulProducts[0]?.id, apigeninProduct.id);
    assert.equal(result.input.demandProfiles[0]?.needs[0]?.targetComparableAmount, 50000);
    assert.equal(result.unmetSupplements.length, 0);
  });

  it("optimizes to the smallest catalogue that preserves baseline coverage", async () => {
    const coq10Need = supplementNeed({
      displayName: "CoQ10",
      id: supplementId,
      targetComparableAmount: 100000,
      targetText: "100 mg/day"
    });
    const magnesiumNeed = supplementNeed({
      displayName: "Magnesium",
      id: magnesiumSupplementId,
      targetComparableAmount: 200000,
      targetText: "200 mg/day"
    });
    const zincNeed = supplementNeed({
      displayName: "Zinc",
      id: zincSupplementId,
      targetComparableAmount: 15000,
      targetText: "15 mg/day"
    });
    const broadMulti = product({
      facts: [
        fact({ amount: 100, name: "CoQ10", supplementId }),
        fact({ amount: 200, name: "Magnesium", supplementId: magnesiumSupplementId }),
        fact({ amount: 15, name: "Zinc", supplementId: zincSupplementId })
      ],
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      priceAmount: 220,
      productKind: "multi",
      title: "Broad Daily Multi"
    });
    const coq10Single = product({
      facts: [fact({ amount: 100, name: "CoQ10", supplementId })],
      id: "bbbbbbbb-3333-4333-8333-333333333333",
      priceAmount: 120,
      title: "CoQ10 Single"
    });
    const magnesiumSingle = product({
      facts: [fact({ amount: 200, name: "Magnesium", supplementId: magnesiumSupplementId })],
      id: "bbbbbbbb-4444-4444-8444-444444444444",
      priceAmount: 120,
      title: "Magnesium Single"
    });
    const zincSingle = product({
      facts: [fact({ amount: 15, name: "Zinc", supplementId: zincSupplementId })],
      id: "bbbbbbbb-5555-4555-8555-555555555555",
      priceAmount: 120,
      title: "Zinc Single"
    });
    const simulationData = runAdminPlanCoverageSimulation({
      candidates: [broadMulti, coq10Single, magnesiumSingle, zincSingle],
      countryCode: "TH",
      demandProfiles: [
        demandProfile({
          needs: [coq10Need, magnesiumNeed, zincNeed],
          supplementNames: ["CoQ10", "Magnesium", "Zinc"]
        })
      ],
      sampleSize: 8,
      seed: "fixed",
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
        },
        {
          category: "Minerals",
          id: zincSupplementId,
          name: "Zinc",
          normalizedName: "zinc",
          targetComparableAmount: 15000
        }
      ]
    });
    const optimization = runAdminCatalogueOptimization({ simulationData });

    assert.equal(optimization.status, "ready");
    assert.equal(optimization.optimized.productCount, 1);
    assert.equal(optimization.carryProducts[0]?.id, broadMulti.id);
    assert.equal(optimization.productReductionCount, 3);
    assert.equal(
      optimization.frontier.find((point) => point.recommended)?.productCount,
      1
    );
    assert.equal(
      optimization.actionRows.some((row) =>
        row.actionType === "consider_retiring" && row.productId === coq10Single.id
      ),
      true
    );

    const fastOptimization = runAdminCatalogueOptimizationFast({ simulationData });

    assert.equal(fastOptimization.status, "ready");
    assert.equal(fastOptimization.optimized.productCount, 1);
    assert.equal(fastOptimization.carryProducts[0]?.id, broadMulti.id);
    assert.equal(fastOptimization.productReductionCount, 3);

    const progressStages: string[] = [];
    const cooperativeOptimization = await runAdminCatalogueOptimizationCooperatively({
      onProgress: (progress) => {
        progressStages.push(progress.stage);
      },
      simulationData
    });

    assert.equal(cooperativeOptimization.status, "ready");
    assert.equal(cooperativeOptimization.optimized.productCount, 1);
    assert.equal(cooperativeOptimization.carryProducts[0]?.id, broadMulti.id);
    assert.equal(progressStages.includes("scoring"), true);
    assert.equal(progressStages.includes("validating"), true);
    assert.equal(progressStages.includes("done"), true);
  });

  it("keeps critical single products and uses price as an optimizer tie-breaker", () => {
    const coq10Need = supplementNeed({
      displayName: "CoQ10",
      id: supplementId,
      targetComparableAmount: 100000,
      targetText: "100 mg/day"
    });
    const zincNeed = supplementNeed({
      displayName: "Zinc",
      id: zincSupplementId,
      targetComparableAmount: 15000,
      targetText: "15 mg/day"
    });
    const expensiveCoq10 = product({
      facts: [fact({ amount: 100, name: "CoQ10", supplementId })],
      id: "cccccccc-1111-4111-8111-111111111111",
      priceAmount: 500,
      title: "Expensive CoQ10"
    });
    const valueCoq10 = product({
      facts: [fact({ amount: 100, name: "CoQ10", supplementId })],
      id: "cccccccc-2222-4222-8222-222222222222",
      priceAmount: 200,
      title: "Value CoQ10"
    });
    const zincCritical = product({
      facts: [fact({ amount: 15, name: "Zinc", supplementId: zincSupplementId })],
      id: "cccccccc-3333-4333-8333-333333333333",
      priceAmount: 150,
      title: "Critical Zinc"
    });
    const simulationData = runAdminPlanCoverageSimulation({
      candidates: [expensiveCoq10, valueCoq10, zincCritical],
      countryCode: "TH",
      demandProfiles: [
        demandProfile({
          needs: [coq10Need, zincNeed],
          supplementNames: ["CoQ10", "Zinc"]
        })
      ],
      sampleSize: 8,
      seed: "fixed",
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
          id: zincSupplementId,
          name: "Zinc",
          normalizedName: "zinc",
          targetComparableAmount: 15000
        }
      ]
    });
    const optimization = runAdminCatalogueOptimization({ simulationData });
    const carryIds = new Set(optimization.carryProducts.map((row) => row.id));

    assert.equal(carryIds.has(valueCoq10.id), true);
    assert.equal(carryIds.has(zincCritical.id), true);
    assert.equal(carryIds.has(expensiveCoq10.id), false);
    assert.equal(optimization.optimized.productCount, 2);
  });

  it("builds a potential optimum basket from pending review products", () => {
    const coq10Need = supplementNeed({
      displayName: "CoQ10",
      id: supplementId,
      targetComparableAmount: 100000,
      targetText: "100 mg/day"
    });
    const zincNeed = supplementNeed({
      displayName: "Zinc",
      id: zincSupplementId,
      targetComparableAmount: 15000,
      targetText: "15 mg/day"
    });
    const approvedCoq10 = product({
      facts: [fact({ amount: 100, name: "CoQ10", supplementId })],
      id: "eeeeeeee-1111-4111-8111-111111111111",
      title: "Approved CoQ10"
    });
    const approvedZinc = product({
      facts: [fact({ amount: 15, name: "Zinc", supplementId: zincSupplementId })],
      id: "eeeeeeee-2222-4222-8222-222222222222",
      title: "Approved Zinc"
    });
    const pendingMulti = product({
      facts: [
        fact({ amount: 100, name: "CoQ10", supplementId }),
        fact({ amount: 15, name: "Zinc", supplementId: zincSupplementId })
      ],
      id: "eeeeeeee-3333-4333-8333-333333333333",
      status: "pending_review",
      title: "Pending CoQ10 Zinc"
    });
    const simulationData = runAdminPlanCoverageSimulation({
      candidates: [approvedCoq10, approvedZinc],
      countryCode: "TH",
      demandProfiles: [
        demandProfile({
          needs: [coq10Need, zincNeed],
          supplementNames: ["CoQ10", "Zinc"]
        })
      ],
      sampleSize: 8,
      seed: "fixed",
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
          id: zincSupplementId,
          name: "Zinc",
          normalizedName: "zinc",
          targetComparableAmount: 15000
        }
      ]
    });
    const potential = runAdminCataloguePotentialOptimizationFast({
      coverageLossTolerancePercent: 0,
      potentialCandidates: [approvedCoq10, approvedZinc, pendingMulti],
      simulationData
    });

    assert.equal(potential.status, "ready");
    assert.equal(potential.optimized.productCount, 1);
    assert.equal(potential.carryProducts[0]?.id, pendingMulti.id);
    assert.equal(potential.carryProducts[0]?.readiness, "needs_review");
    assert.equal(potential.carryProducts[0]?.readinessLabel, "Pending review");

    const chunk = buildAdminCataloguePotentialTraceChunk({
      chunkSize: 4,
      potentialCandidates: [approvedCoq10, approvedZinc, pendingMulti],
      simulationData,
      startIndex: 0
    });
    const resumedPotential = runAdminCataloguePotentialOptimizationFromTraces({
      coverageLossTolerancePercent: 0,
      potentialCandidates: [approvedCoq10, approvedZinc, pendingMulti],
      sampleTraces: chunk.sampleTraces,
      simulationData
    });

    assert.equal(chunk.chunkStartIndex, 0);
    assert.equal(chunk.chunkSize, 4);
    assert.equal(chunk.totalSamples, simulationData.sampleTraces.length);
    assert.equal(
      chunk.sampleTraces.length,
      Math.min(4, simulationData.sampleTraces.length)
    );
    assert.equal(resumedPotential.status, "ready");
    assert.equal(resumedPotential.carryProducts[0]?.readiness, "needs_review");
  });

  it("keeps optimizer actions advisory for review and source moves", () => {
    const magnesiumNeed = supplementNeed({
      displayName: "Magnesium",
      id: magnesiumSupplementId,
      targetComparableAmount: 200000,
      targetText: "200 mg/day"
    });
    const zincNeed = supplementNeed({
      displayName: "Zinc",
      id: zincSupplementId,
      targetComparableAmount: 15000,
      targetText: "15 mg/day"
    });
    const simulationData = runAdminPlanCoverageSimulation({
      candidates: [],
      countryCode: "TH",
      demandProfiles: [
        demandProfile({
          needs: [magnesiumNeed, zincNeed],
          supplementNames: ["Magnesium", "Zinc"]
        })
      ],
      sampleSize: 8,
      seed: "fixed",
      supplements: [
        {
          category: "Minerals",
          id: magnesiumSupplementId,
          name: "Magnesium",
          normalizedName: "magnesium",
          targetComparableAmount: 200000
        },
        {
          category: "Minerals",
          id: zincSupplementId,
          name: "Zinc",
          normalizedName: "zinc",
          targetComparableAmount: 15000
        }
      ]
    });
    const reviewPriorityProducts: AdminSimulationReviewProductRow[] = [
      {
        blockedReason: "Product is not approved yet",
        brandName: "Example",
        brandStatus: "approved",
        coveredSupplementNames: ["Magnesium"],
        currency: "THB",
        expectedPriceAmount: 150,
        gapSupplementCount: 1,
        id: "dddddddd-1111-4111-8111-111111111111",
        matchableSupplementCount: 1,
        productStatus: "pending_review" as const,
        rank: 1,
        reviewScore: 10,
        title: "Pending Magnesium"
      }
    ];
    const optimization = runAdminCatalogueOptimization({
      reviewPriorityProducts,
      simulationData
    });
    const approvedOnlyOptimization = runAdminCatalogueOptimization({
      includeReviewPriorityProducts: false,
      reviewPriorityProducts,
      simulationData
    });

    assert.equal(
      optimization.actionRows.some((row) =>
        row.actionType === "review_first" && row.productId === "dddddddd-1111-4111-8111-111111111111"
      ),
      true
    );
    assert.equal(
      optimization.actionRows.some((row) =>
        row.actionType === "source_missing" && row.supplementId === zincSupplementId
      ),
      true
    );
    assert.equal(
      approvedOnlyOptimization.actionRows.some((row) =>
        row.actionType === "review_first"
      ),
      false
    );
    assert.equal(optimization.carryProducts.length, 0);
  });

  it("sanitizes generated demand profiles against current country supplement governance", () => {
    const coq10Need = demandProfile().needs[0]!;
    const ashwagandhaNeed = {
      ...coq10Need,
      displayName: "Ashwagandha",
      id: "supplement:ashwagandha",
      normalizedName: "ashwagandha",
      sourceId: ashwagandhaSupplementId
    };
    const profiles = sanitizeDemandProfilesForSimulationSupplements(
      [
        demandProfile({
          id: "mixed-profile",
          needs: [coq10Need, ashwagandhaNeed],
          supplementNames: ["CoQ10", "Ashwagandha"]
        }),
        demandProfile({
          id: "blocked-only-profile",
          needs: [ashwagandhaNeed],
          supplementNames: ["Ashwagandha"]
        })
      ],
      [
        {
          category: "Antioxidants",
          id: supplementId,
          name: "CoQ10",
          normalizedName: "coq10",
          targetComparableAmount: 100000
        }
      ]
    );

    assert.equal(profiles.length, 1);
    assert.equal(profiles[0]?.id, "mixed-profile");
    assert.deepEqual(
      profiles[0]?.needs.map((need) => need.displayName),
      ["CoQ10"]
    );
    assert.deepEqual(profiles[0]?.supplementNames, ["CoQ10"]);
  });

  it("filters blocked country supplements from product needs while keeping allowed country overrides", () => {
    const coq10Need = demandProfile().needs[0]!;
    const ashwagandhaNeed = {
      ...coq10Need,
      displayName: "Ashwaganda root",
      id: "supplement:ashwagandha",
      normalizedName: "ashwaganda",
      sourceId: ashwagandhaSupplementId
    };
    const foodNeed = {
      ...coq10Need,
      displayName: "Leafy greens",
      id: "food:leafy-greens",
      itemType: "food" as const,
      normalizedName: "leafy_greens",
      sourceId: "food-leafy-greens"
    };
    const thLookup = supplementAvailabilityLookupFromRows([
      {
        aliases: [],
        country_code: null,
        explicit_status: null,
        global_active: true,
        global_list_status: "active",
        name: "CoQ10",
        normalized_name: "coq10",
        reason: null,
        source: null,
        status: "allowed",
        supplement_id: supplementId,
        updated_at: "2026-06-01T00:00:00.000Z"
      },
      {
        aliases: ["ashwaganda"],
        country_code: "TH",
        explicit_status: "blocked",
        global_active: true,
        global_list_status: "active",
        name: "Ashwagandha",
        normalized_name: "ashwagandha",
        reason: "Blocked in Thailand",
        source: "test",
        status: "blocked",
        supplement_id: ashwagandhaSupplementId,
        updated_at: "2026-06-01T00:00:00.000Z"
      }
    ], "TH");
    const gbLookup = supplementAvailabilityLookupFromRows([
      {
        aliases: ["ashwaganda"],
        country_code: "GB",
        explicit_status: "allowed",
        global_active: false,
        global_list_status: "blocked",
        name: "Ashwagandha",
        normalized_name: "ashwagandha",
        reason: "Allowed in the UK",
        source: "test",
        status: "allowed",
        supplement_id: ashwagandhaSupplementId,
        updated_at: "2026-06-01T00:00:00.000Z"
      }
    ], "UK");

    assert.deepEqual(
      filterProductNeedsBySupplementAvailability(
        [coq10Need, ashwagandhaNeed, foodNeed],
        thLookup
      ).map((need) => need.displayName),
      ["CoQ10", "Leafy greens"]
    );
    assert.deepEqual(
      filterProductNeedsBySupplementAvailability([ashwagandhaNeed], gbLookup)
        .map((need) => need.displayName),
      ["Ashwaganda root"]
    );
    assert.equal(
      productHasCountryBlockedSupplement(
        product({
          facts: [
            {
              amount: 300,
              comparableAmount: 300000,
              confidence: "high",
              itemType: "supplement",
              name: "Ashwaganda root",
              normalizedName: "ashwaganda",
              supplementId: ashwagandhaSupplementId,
              unit: "mg"
            }
          ],
          id: "88888888-8888-4888-8888-888888888888",
          title: "Approved Ashwagandha"
        }),
        thLookup
      ),
      true
    );
    assert.equal(gbLookup.countryCode, "GB");
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
    assert.equal(result.unmetSupplements[0]?.state, "catalogue_gap");
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
    const zincNeed = {
      category: "Minerals",
      displayName: "Zinc",
      id: "supplement:zinc",
      itemType: "supplement" as const,
      normalizedName: "zinc",
      sourceId: zincSupplementId,
      targetComparableAmount: 15000,
      targetDose: null,
      targetText: "15 mg/day",
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
            magnesiumNeed,
            zincNeed
          ],
          supplementNames: ["CoQ10", "Magnesium", "Zinc"]
        })
      ],
      reviewPriorityProducts: reviewRows,
      sampleSize: 8,
      seed: "fixed",
      supplements: []
    });
    const nextMoves = buildSimulationNextMoveRows({
      reviewPriorityProducts: reviewRows,
      simulationInput: simulationData.input,
      simulationData
    });
    const sourceMove = nextMoves.find((row) => row.kind === "source_supplement");

    assert.equal(nextMoves[0]?.id, blockedProduct.id);
    assert.equal(nextMoves[0]?.kind, "review_product");
    assert.equal(nextMoves[0]?.actionType, "review_blocked_product");
    assert.equal(nextMoves[0]?.unmetSupplementNames[0], "Magnesium");
    assert.equal(nextMoves[0]?.unmetDemandCount, 8);
    assert.equal(
      simulationData.unmetSupplements.find((row) => row.name === "Magnesium")?.state,
      "blocked_only"
    );
    assert.equal(sourceMove?.sourceSupplementName, "Zinc");
    assert.equal(sourceMove?.actionType, "source_missing_supplement");
    assert.equal(sourceMove?.targetDoseText, "15 mg/day");
    assert.equal(sourceMove?.unmetDemandCount, 8);
  });

  it("does not create sourcing moves for covered but unselected demand", () => {
    const simulationData = {
      ...emptyAdminPlanCoverageSimulationData({
        candidates: [
          product({
            facts: [
              {
                amount: 200,
                comparableAmount: 200000,
                confidence: "high",
                itemType: "supplement",
                name: "Rhodiola",
                normalizedName: "rhodiola",
                supplementId: rhodiolaSupplementId,
                unit: "mg"
              }
            ],
            id: "66666666-6666-4666-8666-666666666666",
            title: "Example Rhodiola"
          })
        ],
        countryCode: "TH",
        databaseAvailable: true,
        sampleSize: 8,
        supplements: [
          {
            category: "Adaptogens",
            id: rhodiolaSupplementId,
            name: "Rhodiola",
            normalizedName: "rhodiola",
            targetComparableAmount: 200000
          }
        ]
      }),
      unmetSupplements: [
        {
          blockedProductCount: 0,
          count: 8,
          eligibleProductCount: 1,
          name: "Rhodiola",
          percent: 100,
          state: "available_unselected" as const,
          supplementId: rhodiolaSupplementId,
          supplementKey: rhodiolaSupplementId,
          targetDoseText: "200 mg/day"
        }
      ]
    };
    const nextMoves = buildSimulationNextMoveRows({
      reviewPriorityProducts: [],
      simulationInput: simulationData.input,
      simulationData
    });

    assert.equal(
      nextMoves.some((row) =>
        row.kind === "source_supplement" &&
        row.sourceSupplementName === "Rhodiola"
      ),
      false
    );
  });

  it("creates source moves only for true catalogue gaps", () => {
    const simulationData = {
      ...emptyAdminPlanCoverageSimulationData({
        countryCode: "TH",
        databaseAvailable: true,
        sampleSize: 8,
        supplements: []
      }),
      unmetSupplements: [
        {
          blockedProductCount: 0,
          count: 8,
          eligibleProductCount: 0,
          name: "Zinc",
          percent: 100,
          state: "catalogue_gap" as const,
          supplementId: zincSupplementId,
          supplementKey: zincSupplementId,
          targetDoseText: "15 mg/day"
        }
      ]
    };
    const nextMoves = buildSimulationNextMoveRows({
      reviewPriorityProducts: [],
      simulationInput: simulationData.input,
      simulationData
    });

    assert.equal(nextMoves[0]?.kind, "source_supplement");
    assert.equal(nextMoves[0]?.actionType, "source_missing_supplement");
    assert.equal(nextMoves[0]?.sourceSupplementName, "Zinc");
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
    const catalogueOptimizationRoute = readFileSync(
      "app/api/admin/product-coverage/catalogue-optimization/route.ts",
      "utf8"
    );
    const cataloguePotentialTraceRoute = readFileSync(
      "app/api/admin/product-coverage/catalogue-optimization/potential-traces/route.ts",
      "utf8"
    );
    const cataloguePotentialFinalizeRoute = readFileSync(
      "app/api/admin/product-coverage/catalogue-optimization/potential-finalize/route.ts",
      "utf8"
    );
    const catalogueOptimizationJobRoute = readFileSync(
      "app/api/admin/product-coverage/catalogue-optimization/jobs/route.ts",
      "utf8"
    );
    const catalogueOptimizationJobs = readFileSync(
      "lib/admin-catalogue-optimization-jobs.ts",
      "utf8"
    );
    const taskExecution = readFileSync("lib/task-execution.ts", "utf8");
    const demandProfileRoute = readFileSync(
      "app/api/admin/product-coverage/demand-profile/route.ts",
      "utf8"
    );
    const demandGeneration = readFileSync(
      "lib/admin-plan-demand-generation.ts",
      "utf8"
    );
    const assessmentStore = readFileSync("lib/assessment-store.ts", "utf8");
    const candidateSearch = readFileSync("lib/admin-product-search.ts", "utf8");
    const freshness = readFileSync(
      "lib/product-recommendation-freshness.ts",
      "utf8"
    );
    const schema = readFileSync("db-schema.sql", "utf8");
    const taskWorkItems = readFileSync("lib/task-work-items.ts", "utf8");
    const resetScript = readFileSync(
      "scripts/products-master-pending-review.ts",
      "utf8"
    );
    const packageJson = readFileSync("package.json", "utf8");

    assert.match(dashboardContent, /"product-coverage"/);
    assert.match(dashboardContent, /"product-optimisation"/);
    assert.match(dashboardContent, /"plan-coverage-simulator"/);
    assert.match(dashboardContent, /Supplement Coverage/);
    assert.match(dashboardContent, /Product Optimisation/);
    assert.doesNotMatch(dashboardContent, /Product Coverage/);
    assert.doesNotMatch(dashboardContent, /"product-insights"/);
    assert.doesNotMatch(dashboardContent, /"supplement-insights"/);
    assert.doesNotMatch(dashboardContent, /"coverage-improvement-insights"/);
    assert.match(dashboard, /AdminProductCoverageView/);
    assert.match(dashboard, /AdminPlanCoverageSimulatorView/);
    assert.match(dashboard, /AdminProductOptimisationView/);
    assert.match(dashboard, /Shows every active supplement/);
    assert.match(dashboard, /Run synthetic customer plans/);
    assert.match(dashboard, /Run the product basket optimiser/);
    assert.match(page, /getAdminProductCoverageData/);
    assert.match(page, /getAdminPlanCoverageSimulationData/);
    assert.match(page, /retiredInsightsReplacementView/);
    assert.match(page, /product-insights/);
    assert.match(readModel, /targetComparableAmountBySupplement/);
    assert.match(readModel, /buildReviewPriorityProductRows/);
    assert.match(readModel, /supplementGovernanceHash/);
    assert.match(readModel, /source_payload -> 'countryAvailability'/);
    assert.match(readModel, /\$\{countryCode\}::text/);
    assert.match(simulationModel, /buildSimulationNextMoveRows/);
    assert.match(simulationModel, /sanitizeDemandProfilesForSimulationSupplements/);
    assert.match(simulationInputRoute, /getAdminPlanCoverageSimulationData/);
    assert.match(simulationInputRoute, /adminViewAllowed/);
    assert.match(simulationInputRoute, /"Cache-Control": "no-store"/);
    assert.match(demandProfileRoute, /generateAdminPlanCoverageDemandProfile/);
    assert.match(demandProfileRoute, /adminViewAllowed/);
    assert.match(demandGeneration, /analyzeFormulationWithGrok/);
    assert.match(demandGeneration, /buildProductNeeds/);
    assert.match(demandGeneration, /filterProductNeedsBySupplementAvailability/);
    assert.match(demandGeneration, /source_payload -> 'countryAvailability'/);
    assert.match(taskWorkItems, /filterProductNeedsBySupplementAvailabilityForCountry/);
    assert.match(candidateSearch, /productHasCountryBlockedSupplement/);
    assert.match(candidateSearch, /getSupplementEffectiveAvailability/);
    assert.match(assessmentStore, /blocked_country/);
    assert.match(assessmentStore, /source_payload -> 'countryAvailability'/);
    assert.match(freshness, /supplement_governance_changed/);
    assert.match(freshness, /supplementGovernanceUpdatedAt/);
    assert.match(schema, /CREATE TABLE public\.supplement_country_availability/);
    assert.match(schema, /status = ANY \(ARRAY\['allowed'::text, 'blocked'::text\]\)/);
    assert.match(simulationModel, /recommendProductStackFullBeam/);
    assert.match(simulationModel, /demandProfiles/);
    assert.match(view, /SIMULATOR_STORAGE_KEY/);
    assert.match(view, /admin-plan-coverage-simulator:v4/);
    assert.match(view, /SIMULATOR_DEMAND_STORAGE_KEY/);
    assert.match(view, /supplementGovernanceHash: data\.input\.supplementGovernanceHash/);
    assert.doesNotMatch(view, /demandProfiles: data\.input\.demandProfiles\.map/);
    assert.match(view, /sanitizeDemandProfilesForSimulationSupplements/);
    assert.match(view, /type SavedDemandProfilesEntry/);
    assert.match(view, /savedDemandProfileEntriesFromStorage/);
    assert.match(view, /version: 3\s*\n\s*}\s+satisfies SavedDemandProfilesState/);
    assert.match(view, /function loadSavedDemandProfiles\(expectedDemandKey\?: string\)/);
    assert.match(view, /entry\.demandKey === expectedDemandKey/);
    assert.match(view, /saveDemandProfiles\(demandKey, savedProfiles\)/);
    assert.match(view, /saveSimulationState\(simulationInputKey\(nextData\), runner\)/);
    assert.doesNotMatch(view, /saveSimulationState\(inputKey, runner\)/);
    assert.match(view, /existingEntry\.profiles\.length > currentProfiles\.length/);
    assert.match(view, /setHydrated\(\(current\) => current && sameSelectedCountry\)/);
    assert.doesNotMatch(view, /parsed\.demandKey !== expectedDemandKey/);
    assert.doesNotMatch(view, /useState<\s*AdminPlanCoverageDemandProfile\[\]\s*>\(\s*loadSavedDemandProfiles\s*\)/);
    assert.match(view, /function savedDemandProfiles/);
    assert.match(view, /clearSavedDemandProfiles\(\)/);
    assert.match(view, /\/api\/admin\/product-coverage\/simulation-input/);
    assert.match(view, /cache: "no-store"/);
    assert.match(view, /inputStatus !== "ready"/);
    assert.match(view, /SIMULATOR_INPUT_TIMEOUT_MS/);
    assert.match(view, /new AbortController\(\)/);
    assert.match(view, /signal: controller\.signal/);
    assert.match(view, /inputStatusRef\.current === "loading"/);
    assert.match(view, /retrySimulatorInput/);
    assert.match(view, />\s*Retry\s*</);
    assert.match(view, /version: 5/);
    assert.match(view, /sampleTraces/);
    assert.doesNotMatch(view, /loadSavedSimulationDisplayData/);
    assert.doesNotMatch(view, /cachedSimulationData \?\? initialSimulationData/);
    assert.match(view, /productResultRows/);
    assert.match(view, /visibleProductResultRows/);
    assert.match(view, /Best performing products/);
    assert.match(view, /No products have been selected by the simulation yet/);
    assert.match(view, /Run the simulation to see product usefulness/);
    assert.match(view, /row\.chosenCount > 0/);
    assert.doesNotMatch(view, /savedSimulationReplayTarget/);
    assert.doesNotMatch(view, /replayCachedDemandProfiles/);
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
    assert.match(view, /Reviewing this product could cover/);
    assert.match(view, /source_supplement/);
    assert.match(view, /productCountryOptions/);
    assert.match(view, /changeSimulatorCountry/);
    assert.match(view, /updateSimulatorCountryUrl/);
    assert.match(view, /popstate/);
    assert.match(view, /Product performance/);
    assert.match(view, /Optimum product basket/);
    assert.match(view, /AdminProductOptimisationView/);
    assert.match(view, /mode="optimisation"/);
    assert.match(view, /productOptimisationMode \? \(/);
    assert.doesNotMatch(view, /catalogueOptimizationHref/);
    assert.match(view, /catalogueOptimizationJobHref/);
    assert.match(view, /\/api\/admin\/product-coverage\/catalogue-optimization\/jobs/);
    assert.match(view, /Starting shared optimum basket job/);
    assert.match(view, /Preparing potential catalogue/);
    assert.match(view, /Evaluating potential basket/);
    assert.match(view, /shared background job/);
    assert.match(view, /profiles completed by shared job/);
    assert.match(view, /Waiting for Analytics worker/);
    assert.match(view, /Restart queued job/);
    assert.match(view, /Shared job progress found/);
    assert.match(view, /Reset/);
    assert.match(view, /Recalculate/);
    assert.match(view, /forceRestart: true/);
    assert.match(view, /dateTimeText/);
    assert.match(view, /Generated/);
    assert.match(view, /sample count is/);
    assert.match(view, /catalogueOptimizationResetKey/);
    assert.match(view, /durationText/);
    assert.match(view, /Optimum basket request failed/);
    assert.doesNotMatch(view, /Minimum catalogue request failed/);
    assert.match(view, /SIMULATOR_OPTIMIZATION_STORAGE_KEY/);
    assert.match(view, /saveCatalogueOptimization/);
    assert.match(view, /loadSavedCatalogueOptimization/);
    assert.match(view, /requestCatalogueOptimizationJob/);
    assert.match(view, /applyCatalogueOptimizationJob/);
    assert.match(view, /catalogueOptimizationJobCachedProgress/);
    assert.match(view, /cacheKey: requestKey/);
    assert.match(view, /existing\.sampleSize > runner\.sampleSize/);
    assert.match(view, /Include pending-review products/);
    assert.match(view, /Shows the best possible basket if pending products were approved/);
    assert.match(view, /includeReviewPriorityProductsInCatalogueOptimization/);
    assert.match(view, /catalogueReviewProductsKey/);
    assert.match(view, /includePendingReviewProducts/);
    assert.match(catalogueOptimizationRoute, /startAdminCatalogueOptimizationJob/);
    assert.match(catalogueOptimizationRoute, /status: 202/);
    assert.doesNotMatch(catalogueOptimizationRoute, /runAdminCatalogueOptimizationFast/);
    assert.doesNotMatch(catalogueOptimizationRoute, /runAdminCataloguePotentialOptimizationFast/);
    assert.doesNotMatch(catalogueOptimizationRoute, /getProductRecommendationCandidates/);
    assert.match(catalogueOptimizationJobRoute, /startAdminCatalogueOptimizationJob/);
    assert.match(catalogueOptimizationJobRoute, /forceRestart/);
    assert.match(catalogueOptimizationJobRoute, /getAdminCatalogueOptimizationJob/);
    assert.match(catalogueOptimizationJobRoute, /cancelAdminCatalogueOptimizationJob/);
    assert.match(catalogueOptimizationJobs, /public\.tasks/);
    assert.match(catalogueOptimizationJobs, /admin_catalogue_optimization_job/);
    assert.match(catalogueOptimizationJobs, /idempotency_scope_key/);
    assert.match(catalogueOptimizationJobs, /where not exists \(/);
    assert.match(
      catalogueOptimizationJobs,
      /on conflict \(idempotency_scope_key, idempotency_key\)[\s\S]*do nothing/
    );
    assert.match(catalogueOptimizationJobs, /result_payload/);
    assert.match(catalogueOptimizationJobs, /restartRequested/);
    assert.match(catalogueOptimizationJobs, /existingStatus === "completed"/);
    assert.match(catalogueOptimizationJobs, /existingStatus === "queued"/);
    assert.match(catalogueOptimizationJobs, /staleActiveJob/);
    assert.match(catalogueOptimizationJobs, /isExpiredDate\(existing\?\.lease_until\)/);
    assert.match(catalogueOptimizationJobs, /attempts = 0/);
    assert.match(catalogueOptimizationJobs, /notifyTaskQueueChanged/);
    assert.match(catalogueOptimizationJobs, /analytics_catalogue_optimization|requiredCapabilitiesForWorkTaskType/);
    assert.doesNotMatch(catalogueOptimizationJobs, /kickAdminCatalogueOptimizationJob/);
    assert.doesNotMatch(catalogueOptimizationJobs, /setTimeout/);
    assert.doesNotMatch(catalogueOptimizationJobs, /runAdminCatalogueOptimizationJob/);
    assert.doesNotMatch(catalogueOptimizationJobs, /create table/i);
    assert.doesNotMatch(packageJson, /catalogue-optimization-jobs:schema:apply/);
    assert.match(packageJson, /worker:analytics/);
    assert.doesNotMatch(schema, /CREATE TABLE public\.admin_catalogue_optimization_jobs/);
    assert.match(cataloguePotentialTraceRoute, /Analytics worker job/);
    assert.match(cataloguePotentialTraceRoute, /status: 410/);
    assert.doesNotMatch(cataloguePotentialTraceRoute, /buildAdminCataloguePotentialTraceChunk/);
    assert.doesNotMatch(cataloguePotentialTraceRoute, /getProductRecommendationCandidates/);
    assert.match(cataloguePotentialFinalizeRoute, /Analytics worker job/);
    assert.match(cataloguePotentialFinalizeRoute, /status: 410/);
    assert.doesNotMatch(cataloguePotentialFinalizeRoute, /runAdminCataloguePotentialOptimizationFromTraces/);
    assert.match(taskExecution, /admin_catalogue_optimization_job/);
    assert.match(taskExecution, /buildAdminCataloguePotentialTraceChunk/);
    assert.match(taskExecution, /runAdminCataloguePotentialOptimizationFromTraces/);
    assert.doesNotMatch(view, /runAdminCatalogueOptimizationCooperatively/);
    assert.match(view, /Basket products/);
    assert.match(view, /No basket products were identified/);
    assert.doesNotMatch(
      view,
      /!includeReviewPriorityProductsInCatalogueOptimization \|\|\s*\n\s*currentCatalogueOptimizationStatus !== "processing"/
    );
    assert.doesNotMatch(
      view,
      /!includeReviewPriorityProductsInCatalogueOptimization \|\|\s*\n\s*running/
    );
    assert.match(view, /Remove recommendations/);
    assert.match(view, /currentCatalogueOptimizationBlocked/);
    assert.match(view, /catalogueOptimizationJob\.leaseUntil/);
    assert.match(view, /Restart blocked job/);
    assert.match(view, /actionType === "consider_retiring"/);
    assert.match(view, /Average stack coverage contribution/);
    assert.match(view, /Chosen rate/);
    assert.match(view, /productScatterRows/);
    assert.match(view, /chosenRatePercent/);
    assert.match(view, /priceBand/);
    assert.match(view, /convergenceProgressText/);
    assert.match(view, /convergenceDeltaSummaryText/);
    assert.match(view, /\["average", deltas\.averageCoveragePercent\]/);
    assert.match(view, /\["cost", deltas\.expectedCostPercent\]/);
    assert.doesNotMatch(view, /changed average coverage by/);
    assert.match(view, /Useful runs/);
    assert.match(view, /version: 5/);
    assert.match(simulationModel, /AdminPlanCoverageSimulationConvergence/);
    assert.match(simulationModel, /AdminCatalogueOptimizationData/);
    assert.match(simulationModel, /AdminCataloguePotentialOptimizationData/);
    assert.match(simulationModel, /AdminCataloguePotentialTraceChunkResponse/);
    assert.match(simulationModel, /buildAdminCataloguePotentialTraceChunk/);
    assert.match(simulationModel, /runAdminCataloguePotentialOptimizationFromTraces/);
    assert.match(simulationModel, /runAdminCatalogueOptimization/);
    assert.match(simulationModel, /runAdminCatalogueOptimizationFast/);
    assert.match(simulationModel, /runAdminCataloguePotentialOptimizationFast/);
    assert.match(simulationModel, /productNeedCoverageSummary/);
    assert.match(simulationModel, /ADMIN_PLAN_COVERAGE_CONVERGENCE_WINDOW_SIZE = 32/);
    assert.match(simulationModel, /ADMIN_PLAN_COVERAGE_CONVERGENCE_MIN_SAMPLES = 64/);
    assert.match(simulationModel, /topProductOverlapPercent/);
    assert.match(simulationModel, /recordConvergenceCheckpointIfNeeded/);
    assert.match(view, /Unmet plan demand/);
    assert.match(view, /Catalogue gaps/);
    assert.match(view, /Eligible products exist, but were not selected/);
    assert.doesNotMatch(view, /Most unmet supplements/);
    assert.match(view, /Optimum dose/);
    assert.match(view, /simulationInput: activeInputData\.input/);
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
