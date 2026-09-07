import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import {
  matcherNeedCoveragePercent,
  matcherProductCoversNeed,
  recommendWithMatcher
} from "../lib/matcher/adapters/web.ts";
import { COVERAGE_SCALE } from "../lib/matcher/config.ts";
import { setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import type { MatcherProduct } from "../lib/matcher/types.ts";
import type {
  ProductCandidate,
  ProductRecommendationInput,
  ProductRecommendationNeed
} from "../lib/product-recommendation-types.ts";

// Restore global reference fixtures even when a behavioral assertion fails.
afterEach(() => setMatcherSafetyCeilings([]));

function need(
  overrides: Partial<ProductRecommendationNeed> &
    Pick<ProductRecommendationNeed, "id" | "displayName" | "normalizedName" | "sourceId">
): ProductRecommendationNeed {
  return {
    aliasKeys: overrides.aliasKeys ?? [overrides.normalizedName],
    category: overrides.itemType === "food" ? "Food" : "Foundation",
    displayName: overrides.displayName,
    id: overrides.id,
    itemType: overrides.itemType ?? "supplement",
    normalizedName: overrides.normalizedName,
    sourceId: overrides.sourceId,
    targetComparableAmount: overrides.targetComparableAmount ?? null,
    targetDose: overrides.targetDose ?? null,
    targetText: overrides.targetText ?? null,
    weight: overrides.weight ?? 1
  };
}

function candidate(input: Readonly<{
  automatedSafetyPassed?: boolean;
  availableCountryCodes?: string[];
  brandName?: string;
  brandStatus?: ProductCandidate["brandStatus"];
  facts: ReadonlyArray<{
    amount: number | null;
    name: string;
    normalizedName: string;
    unit: string | null;
  }>;
  id: string;
  productAudience?: "both" | "female" | "male";
  retailSellableProductId?: string | null;
  status?: ProductCandidate["status"];
  title: string;
  validationStatus?: "failed" | "pass";
}>): ProductCandidate {
  return {
    automatedSafetyPassed: input.automatedSafetyPassed ?? true,
    availabilityStatus: "in_stock",
    availableCountryCodes: input.availableCountryCodes ?? ["TH"],
    brandName: input.brandName ?? "Delight",
    brandStatus: input.brandStatus ?? "approved",
    currency: "THB",
    facts: input.facts.map((fact) => ({
      amount: fact.amount,
      comparableAmount: fact.amount,
      confidence: "high" as const,
      itemType: "supplement" as const,
      name: fact.name,
      normalizedName: fact.normalizedName,
      unit: fact.unit
    })),
    id: input.id,
    labelStatus: "parsed",
    platform: "manual",
    priceAmount: 350,
    productAudience: input.productAudience ?? "both",
    productUrl: `https://example.com/${input.id}`,
    region: "TH",
    retailAvailabilityStatus: "available_now",
    retailSellableProductId: input.retailSellableProductId ?? `sellable-${input.id}`,
    selectedRetailerName: "Delight Pharmacy",
    selectedRetailerOrganisationId: "delight",
    status: input.status ?? "approved",
    title: input.title,
    validation: {
      checkedAt: new Date(0).toISOString(),
      matchableFactCount: input.facts.length,
      reasons: [],
      status: input.validationStatus ?? "pass",
      summary: ""
    }
  };
}

function dosedNeed(
  input: Readonly<{
    amount: number;
    displayName: string;
    id: string;
    normalizedName: string;
    unit: "mcg" | "mg";
    weight?: number;
  }>
): ProductRecommendationNeed {
  return need({
    displayName: input.displayName,
    id: input.id,
    normalizedName: input.normalizedName,
    sourceId: input.normalizedName,
    targetComparableAmount: input.amount,
    targetDose: {
      amount: input.amount,
      originalText: `${input.amount} ${input.unit}/day`,
      unit: input.unit
    },
    targetText: `${input.amount} ${input.unit}/day`,
    weight: input.weight ?? 1
  });
}

function product(overrides: Partial<MatcherProduct> = {}): MatcherProduct {
  return {
    availableCountryCodes: ["TH"],
    contributionSubjectIds: [],
    currency: "THB",
    dailyPillsPerServing: 1,
    dietarySource: "any",
    form: "capsule",
    imageUrl: null,
    incompleteCommercialFacts: false,
    labelledContributions: [],
    omegaSource: "none",
    orderable: true,
    prenatalOrFertility: false,
    productAudience: "both",
    productId: "bio-mag",
    retailerSku: "bio-mag",
    sellerId: "delight",
    sellerName: "Delight Pharmacy",
    source: "retail",
    status: "approved",
    stockStatus: "in_stock",
    title: "Blackmores Bio Magnesium",
    unknownSafetyAmount: false,
    unitPriceMinor: 10000,
    ...overrides
  };
}

describe("matcher web adapter coverage mapping", () => {
  it("does not stamp the whole formula onto every SKU", async () => {
    const source = await readFile("lib/matcher/adapters/web.ts", "utf8");

    assert.doesNotMatch(source, /coveredNeeds:\s*supplementNeeds,/);
    assert.match(
      source,
      /const coveredNeeds = supplementNeeds\.filter\(\(need\) =>\s*matcherProductCoversNeed/
    );
    assert.match(source, /needDiagnosticsFromBasket/);
    assert.doesNotMatch(
      source,
      /unit:\s*fact\.comparableAmount != null \? "mcg"/
    );
    assert.doesNotMatch(source, /amount:\s*fact\.amount \?\? 0/);
    assert.match(source, /facts\.filter\(fact => fact\.amount != null\)/);
    assert.match(source, /unit:\s*fact\.unit/);
    assert.match(source, /matcherProductOwnCoveragePercent/);
    assert.match(source, /servingMultiplierFromBasket/);
    assert.doesNotMatch(source, /productCoveragePercent:\s*coverage/);
    assert.match(
      source,
      /selectorMode:\s*input\.stackPreference === "compact" \? "agentic" : "web_single"/
    );
    const candidates = await readFile("lib/matcher/candidates.ts", "utf8");
    assert.doesNotMatch(candidates, /MAX_DAILY_UNITS\s*=\s*3/);
    const config = await readFile("lib/matcher/config.ts", "utf8");
    assert.match(config, /WEB_MATCHER_CONFIG/);
    assert.match(config, /WEB_COMPACT_MATCHER_CONFIG/);
    assert.match(config, /searchDeadlineMs: 400/);
    assert.match(config, /initialBeamWidth: 48/);
    assert.match(config, /maxBeamWidth: 64/);
    assert.match(config, /sellerGroupLimit: 48/);
    const adapter = await readFile("lib/matcher/adapters/web.ts", "utf8");
    assert.match(adapter, /WEB_COMPACT_MATCHER_CONFIG/);
    assert.doesNotMatch(candidates, /wanted\.includes\(name\)/);
    assert.doesNotMatch(candidates, /name\.includes\(wanted\)/);
    assert.doesNotMatch(
      candidates,
      /return product\.labelledContributions;\s*\n\s*\}/
    );
    const live = await readFile("lib/agentic/catalogue/live.ts", "utf8");
    assert.doesNotMatch(
      live,
      /comparableAmount:\s*Number\.isFinite\(amount\) \? amount : null/
    );
    assert.match(live, /comparableAmount:\s*factComparableAmount\(fact\)/);
  });

  it("counts labelled milligrams and IU against the formula, not a fake mcg field", () => {
    const magnesium = dosedNeed({
      amount: 300,
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      unit: "mg",
      weight: 5
    });
    const vitaminD3 = dosedNeed({
      amount: 50,
      displayName: "Vitamin D3",
      id: "supplement:vitamin-d3",
      normalizedName: "vitamin_d3",
      unit: "mcg",
      weight: 7
    });
    const omega3 = dosedNeed({
      amount: 1000,
      displayName: "Omega-3",
      id: "supplement:omega-3",
      normalizedName: "omega_3",
      unit: "mg",
      weight: 6
    });
    const creatine = dosedNeed({
      amount: 3000,
      displayName: "Creatine",
      id: "supplement:creatine",
      normalizedName: "creatine",
      unit: "mg"
    });

    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 301.5,
              name: "Magnesium",
              normalizedName: "magnesium",
              unit: "mg"
            },
            {
              amount: 100,
              name: "Vitamin D3",
              normalizedName: "vitamin_d3",
              unit: "IU"
            }
          ],
          id: "mag-d3",
          title: "BLACKMORE MAGNESIUM+D3 50'S"
        }),
        candidate({
          facts: [
            {
              amount: 600,
              name: "Omega-3",
              normalizedName: "omega_3",
              unit: "mg"
            }
          ],
          id: "omega-dha",
          title: "Blackmores Omega DHA"
        })
      ],
      clientContext: null,
      clientSex: null,
      countryCode: "TH",
      maxProducts: 6,
      needs: [magnesium, vitaminD3, omega3, creatine],
      stackPreference: "balanced"
    });

    const byNeed = new Map(
      [...result.diagnostics.matchedNeeds, ...result.diagnostics.unmatchedNeeds].map(
        (item) => [item.id, item.coveragePercent]
      )
    );

    assert.ok((byNeed.get("supplement:magnesium") ?? 0) >= 90);
    assert.ok((byNeed.get("supplement:omega-3") ?? 0) >= 90);
    assert.equal(
      result.recommendations.find((row) => row.product.id === "omega-dha")
        ?.servingMultiplier,
      2
    );
    assert.ok((byNeed.get("supplement:vitamin-d3") ?? 100) < 20);
    assert.equal(byNeed.get("supplement:creatine") ?? 0, 0);
    assert.equal(
      result.recommendations.some((row) =>
        row.coveredNeeds.some((item) => item.id === "supplement:creatine")
      ),
      false
    );
  });

  it("maps coverageBySubject units into percents", () => {
    const magnesium = need({
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      sourceId: "magnesium"
    });
    const creatine = need({
      displayName: "Creatine",
      id: "supplement:creatine",
      normalizedName: "creatine",
      sourceId: "creatine"
    });
    const coverageBySubject = new Map([
      ["magnesium", COVERAGE_SCALE],
      ["creatine", 0]
    ]);

    assert.equal(matcherNeedCoveragePercent(coverageBySubject, magnesium), 100);
    assert.equal(matcherNeedCoveragePercent(coverageBySubject, creatine), 0);
    assert.equal(
      matcherNeedCoveragePercent(
        new Map([["magnesium", COVERAGE_SCALE * 0.2]]),
        magnesium
      ),
      20
    );
  });

  it("does not let Bio Magnesium cover creatine", () => {
    const magnesium = need({
      aliasKeys: ["magnesium", "magnesium_glycinate"],
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      sourceId: "magnesium"
    });
    const creatine = need({
      aliasKeys: ["creatine"],
      displayName: "Creatine",
      id: "supplement:creatine",
      normalizedName: "creatine",
      sourceId: "creatine"
    });
    const bioMag = product({
      contributionSubjectIds: ["magnesium"],
      labelledContributions: [
        {
          amount: 300,
          name: "Magnesium",
          subjectId: "magnesium",
          unit: "mg"
        }
      ]
    });

    assert.equal(matcherProductCoversNeed(bioMag, magnesium), true);
    assert.equal(matcherProductCoversNeed(bioMag, creatine), false);
  });

  it("does not count Vitamin B1 as Vitamin B12", () => {
    const vitaminB12 = dosedNeed({
      amount: 500,
      displayName: "Vitamin B12",
      id: "supplement:vitamin-b12",
      normalizedName: "vitamin_b12",
      unit: "mcg"
    });
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 7500,
              name: "Vitamin B1",
              normalizedName: "vitamin_b1",
              unit: "mcg"
            },
            {
              amount: 10,
              name: "Vitamin B12",
              normalizedName: "vitamin_b12",
              unit: "mcg"
            }
          ],
          id: "exec-b",
          title: "BLACKMORES EXEC B 30'S"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [vitaminB12],
      stackPreference: "balanced"
    });
    const b12 =
      [...result.diagnostics.matchedNeeds, ...result.diagnostics.unmatchedNeeds].find(
        (item) => item.id === "supplement:vitamin-b12"
      )?.coveragePercent ?? 0;

    assert.equal(b12, 100);
    const selected = result.recommendations[0];
    assert.ok(selected);
    assert.equal(selected.servingMultiplier, 50);
    assert.equal(selected.servingMultiplier * 10, 500,
      "Only the labelled 10 mcg of B12 per serving contributes to the 500 mcg target; the 7500 mcg B1 does not");
  });

  it("does not stamp the stack percent onto a creatine-only SKU", () => {
    const magnesium = dosedNeed({
      amount: 300,
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      unit: "mg"
    });
    const creatine = dosedNeed({
      amount: 3000,
      displayName: "Creatine",
      id: "supplement:creatine",
      normalizedName: "creatine",
      unit: "mg"
    });
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 300,
              name: "Magnesium",
              normalizedName: "magnesium",
              unit: "mg"
            }
          ],
          id: "bio-mag",
          title: "Blackmores Bio Magnesium"
        }),
        candidate({
          facts: [
            {
              amount: 3,
              name: "Creatine",
              normalizedName: "creatine",
              unit: "g"
            }
          ],
          id: "creatine-powder",
          title: "Optimum Nutrition Micronized Creatine Monohydrate Powder"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [magnesium, creatine],
      stackPreference: "balanced"
    });
    const creatineRow = result.recommendations.find(
      (row) => row.product.id === "creatine-powder"
    );

    assert.ok(creatineRow);
    assert.ok((result.stackCoveragePercent ?? 0) >= 90);
    assert.notEqual(
      creatineRow?.productCoveragePercent,
      result.stackCoveragePercent
    );
    assert.ok((creatineRow?.productCoveragePercent ?? 100) <= 60);
  });

  it("keeps Pre 9+ Care Gold off male and non-pregnant adult stacks", () => {
    const folate = dosedNeed({
      amount: 400,
      displayName: "Folate",
      id: "supplement:folate",
      normalizedName: "vitamin_b9",
      unit: "mcg"
    });
    const prenatal = candidate({
      facts: [
        {
          amount: 400,
          name: "Folic acid",
          normalizedName: "folic_acid",
          unit: "mcg"
        }
      ],
      id: "pre9",
      title: "Blackmores Pre 9+ Care Gold"
    });
    const adult = candidate({
      facts: [
        {
          amount: 400,
          name: "Folic acid",
          normalizedName: "folic_acid",
          unit: "mcg"
        }
      ],
      id: "folate-adult",
      title: "Blackmores Folate"
    });

    const male = recommendWithMatcher({
      budgetAmount: null,
      candidates: [prenatal, adult],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [folate],
      stackPreference: "balanced"
    });
    const adultFemale = recommendWithMatcher({
      budgetAmount: null,
      candidates: [prenatal, adult],
      clientContext: { lifestage: "none/none/regular" },
      clientSex: "female",
      countryCode: "TH",
      maxProducts: 6,
      needs: [folate],
      stackPreference: "balanced"
    });
    const pregnant = recommendWithMatcher({
      budgetAmount: null,
      candidates: [prenatal],
      clientContext: { lifestage: "pregnant" },
      clientSex: "female",
      countryCode: "TH",
      maxProducts: 6,
      needs: [folate],
      stackPreference: "balanced"
    });

    assert.equal(
      male.recommendations.some((row) => row.product.id === "pre9"),
      false
    );
    assert.equal(
      adultFemale.recommendations.some((row) => row.product.id === "pre9"),
      false
    );
    assert.equal(
      pregnant.recommendations.some((row) => row.product.id === "pre9"),
      true
    );
  });

  it("does not match a Singapore SKU into a Thailand basket", () => {
    const magnesium = dosedNeed({
      amount: 300,
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      unit: "mg"
    });
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          availableCountryCodes: ["SG"],
          facts: [
            {
              amount: 300,
              name: "Magnesium",
              normalizedName: "magnesium",
              unit: "mg"
            }
          ],
          id: "sg-mag",
          title: "Singapore Magnesium"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [magnesium],
      stackPreference: "balanced"
    });

    assert.equal(result.recommendations.length, 0);
    assert.equal(
      [...result.diagnostics.matchedNeeds, ...result.diagnostics.unmatchedNeeds].find(
        (item) => item.id === "supplement:magnesium"
      )?.coveragePercent ?? 0,
      0
    );
  });

  it("uses supported quantities beyond three servings to match the requested dose", () => {
    const coq10 = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 50,
              name: "CoQ10",
              normalizedName: "coq10",
              unit: "mg"
            }
          ],
          id: "coq10-50",
          title: "BLACKMORES CO-Q10 50MG 30'S"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [
        dosedNeed({
          amount: 100,
          displayName: "CoQ10",
          id: "supplement:coq10",
          normalizedName: "coq10",
          unit: "mg"
        })
      ],
      stackPreference: "balanced"
    });
    const d3 = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 5,
              name: "Vitamin D3",
              normalizedName: "vitamin_d3",
              unit: "mcg"
            }
          ],
          id: "d3-5",
          title: "Low dose D3"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [
        dosedNeed({
          amount: 50,
          displayName: "Vitamin D3",
          id: "supplement:vitamin-d3",
          normalizedName: "vitamin_d3",
          unit: "mcg"
        })
      ],
      stackPreference: "balanced"
    });
    const magnesium = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 301.5,
              name: "Magnesium",
              normalizedName: "magnesium",
              unit: "mg"
            }
          ],
          id: "mag-d3",
          title: "BLACKMORE MAGNESIUM+D3 50'S"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [
        dosedNeed({
          amount: 300,
          displayName: "Magnesium",
          id: "supplement:magnesium",
          normalizedName: "magnesium",
          unit: "mg"
        })
      ],
      stackPreference: "balanced"
    });

    assert.equal(coq10.recommendations[0]?.servingMultiplier, 2);
    assert.equal(
      [...coq10.diagnostics.matchedNeeds, ...coq10.diagnostics.unmatchedNeeds].find(
        (item) => item.id === "supplement:coq10"
      )?.coveragePercent,
      100
    );
    assert.equal(d3.recommendations[0]?.servingMultiplier, 10);
    assert.equal(
      [...d3.diagnostics.matchedNeeds, ...d3.diagnostics.unmatchedNeeds].find(
        (item) => item.id === "supplement:vitamin-d3"
      )?.coveragePercent,
      100
    );
    assert.equal(magnesium.recommendations[0]?.servingMultiplier, 1);
    assert.equal(
      magnesium.recommendations[0]?.product.id,
      "mag-d3"
    );
  });

  it("ranks proportional target and reference-limit penalties when the adult profile is known", () => {
    setMatcherSafetyCeilings([
      { maxAmount: 40, maxUnit: "mg", name: "Zinc", subjectId: "zinc" }
    ]);
    const input: ProductRecommendationInput = {
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 20,
              name: "Zinc",
              normalizedName: "zinc",
              unit: "mg"
            }
          ],
          id: "zinc-20",
          title: "Zinc 20"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [
        dosedNeed({
          amount: 60,
          displayName: "Zinc",
          id: "supplement:zinc",
          normalizedName: "zinc",
          unit: "mg"
        })
      ],
      stackPreference: "balanced"
    };
    const unknownProfile = recommendWithMatcher(input);
    const result = recommendWithMatcher({ ...input, clientContext: { ageYears: 40, lifestage: "adult", currentSupplements: "none" } });
    setMatcherSafetyCeilings([]);

    assert.equal(unknownProfile.recommendations.length, 1);
    assert.equal(unknownProfile.recommendations[0].servingMultiplier, 3);
    const unknownOption = unknownProfile.diagnostics.matching!.options[0];
    assert.equal(unknownProfile.diagnostics.matching!.operationalStatus, "ready");
    assert.equal(unknownOption.doseFit!.total, 0);
    assert.deepEqual(unknownOption.doseFit!.perLimit, []);
    assert.equal(unknownOption.doseFit!.perTarget[0].certainty, "unknown");
    assert.ok(unknownOption.advice.some(row => row.code === "incomplete_health_information"));
    assert.equal(unknownOption.coveragePercent, 100);

    assert.equal(result.recommendations.length, 1);
    assert.equal(result.recommendations[0].product.id, "zinc-20");
    assert.equal(result.recommendations[0].servingMultiplier, 2);
    assert.equal(result.diagnostics.matching!.operationalStatus, "ready");
    const score = result.diagnostics.matching!.options[0].doseFit!;
    assert.ok(Math.abs(score.total - 1 / 3) < 1e-12);
    assert.equal(score.limitWeight, 2);
    assert.equal(score.weightedLimit, 0);
    assert.ok(score.perLimit.some(row => row.exposure === 40 && row.limit === 40));
    assert.ok(result.diagnostics.matchedNeeds.some(row => row.id === "supplement:zinc" && row.coveragePercent > 60 && row.coveragePercent < 70));
    assert.deepEqual(result.diagnostics.blockedProducts, []);
    // Three servings remain eligible; their 50% limit excess costs 1,
    // which is worse than the selected one-third target shortfall.
    assert.ok(score.total < 2 * ((60 - 40) / 40));
  });


  it("keeps a lower-total-penalty cross-target match ready with explicit above-limit advice", () => {
    setMatcherSafetyCeilings([{ maxAmount: 40, maxUnit: "mg", name: "Zinc", subjectId: "zinc" }]);
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({ id: "mag-zinc", title: "Magnesium with Zinc", facts: [
          { amount: 200, name: "Magnesium", normalizedName: "magnesium", unit: "mg" },
          { amount: 30, name: "Zinc", normalizedName: "zinc", unit: "mg" }
        ] }),
        candidate({ id: "d3-zinc", title: "Vitamin D3 with Zinc", facts: [
          { amount: 50, name: "Vitamin D3", normalizedName: "vitamin_d3", unit: "mcg" },
          { amount: 20, name: "Zinc", normalizedName: "zinc", unit: "mg" }
        ] })
      ],
      clientContext: { ageYears: 40, lifestage: "adult", currentSupplements: "none" },
      clientSex: "male", countryCode: "TH", maxProducts: 6,
      needs: [
        dosedNeed({ amount: 200, displayName: "Magnesium", id: "supplement:magnesium", normalizedName: "magnesium", unit: "mg" }),
        dosedNeed({ amount: 50, displayName: "Vitamin D3", id: "supplement:vitamin-d3", normalizedName: "vitamin_d3", unit: "mcg" })
      ],
      stackPreference: "balanced"
    });
    setMatcherSafetyCeilings([]);
    assert.equal(result.diagnostics.matching!.operationalStatus, "ready");
    assert.deepEqual(result.recommendations.map(row => row.product.id).sort(), ["d3-zinc", "mag-zinc"]);
    assert.ok(result.recommendations.every(row => row.servingMultiplier === 1));
    const option = result.diagnostics.matching!.options[0];
    assert.equal(option.coveragePercent, 100);
    assert.equal(option.doseFit!.total, 0.5);
    assert.equal(option.doseFit!.weightedLimit, 0.5);
    assert.equal(option.doseFit!.under + option.doseFit!.over, 0);
    const advice = option.advice.find(row => row.code === "reference_limit_exceeded" && row.ingredient === "Zinc");
    assert.ok(advice);
    assert.equal(advice.amount, 50);
    assert.equal(advice.unit, "mg");
    assert.equal(advice.referenceLimit?.amount, 40);
    assert.ok(advice.evidence.source);
    assert.ok(advice.uncertainty.en);
    assert.deepEqual(result.diagnostics.blockedProducts, []);
  });

  it("uses a different compact search than balanced", () => {
    const folate = dosedNeed({
      amount: 400,
      displayName: "Folate",
      id: "supplement:folate",
      normalizedName: "vitamin_b9",
      unit: "mcg"
    });
    const magnesium = dosedNeed({
      amount: 300,
      displayName: "Magnesium",
      id: "supplement:magnesium",
      normalizedName: "magnesium",
      unit: "mg"
    });
    const creatine = dosedNeed({
      amount: 3000,
      displayName: "Creatine",
      id: "supplement:creatine",
      normalizedName: "creatine",
      unit: "mg"
    });
    const omega3 = dosedNeed({
      amount: 1000,
      displayName: "Omega-3",
      id: "supplement:omega-3",
      normalizedName: "omega_3",
      unit: "mg"
    });
    const coq10 = dosedNeed({
      amount: 100,
      displayName: "CoQ10",
      id: "supplement:coq10",
      normalizedName: "coq10",
      unit: "mg"
    });
    const candidates = [
      candidate({
        facts: [
          {
            amount: 400,
            name: "Folic acid",
            normalizedName: "folic_acid",
            unit: "mcg"
          },
          {
            amount: 300,
            name: "Magnesium",
            normalizedName: "magnesium",
            unit: "mg"
          }
        ],
        id: "multi",
        title: "Two-need multi"
      }),
      candidate({
        facts: [
          {
            amount: 3,
            name: "Creatine",
            normalizedName: "creatine",
            unit: "g"
          }
        ],
        id: "creatine-powder",
        title: "Creatine powder"
      }),
      candidate({
        facts: [
          {
            amount: 1000,
            name: "Omega-3",
            normalizedName: "omega_3",
            unit: "mg"
          }
        ],
        id: "omega",
        title: "Omega DHA"
      }),
      candidate({
        facts: [
          {
            amount: 100,
            name: "CoQ10",
            normalizedName: "coq10",
            unit: "mg"
          }
        ],
        id: "coq10",
        title: "CoQ10 100"
      })
    ];
    const input = {
      budgetAmount: null,
      candidates,
      clientContext: null,
      clientSex: "male" as const,
      countryCode: "TH",
      needs: [folate, magnesium, creatine, omega3, coq10]
    };
    const compact = recommendWithMatcher({
      ...input,
      maxProducts: 3,
      stackPreference: "compact"
    });
    const balanced = recommendWithMatcher({
      ...input,
      maxProducts: 6,
      stackPreference: "balanced"
    });
    const compactIds = compact.recommendations.map((row) => row.product.id).sort();
    const balancedIds = balanced.recommendations.map((row) => row.product.id).sort();

    assert.ok(compact.recommendations.length <= 3);
    assert.ok(balanced.recommendations.length > compact.recommendations.length);
    assert.notDeepEqual(compactIds, balancedIds);
  });

  it("keeps food needs out of marketing coverage", () => {
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 25,
              name: "Vitamin D3",
              normalizedName: "vitamin_d3",
              unit: "mcg"
            }
          ],
          id: "d3",
          title: "Vitamin D3"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [
        dosedNeed({
          amount: 25,
          displayName: "Vitamin D3",
          id: "supplement:vitamin-d3",
          normalizedName: "vitamin_d3",
          unit: "mcg"
        }),
        need({
          displayName: "Chia Seeds",
          id: "food:chia",
          itemType: "food",
          normalizedName: "chia_seeds",
          sourceId: "chia",
          targetComparableAmount: 1000,
          targetText: "1 tbsp/day"
        })
      ],
      stackPreference: "balanced"
    });

    assert.equal(result.stackCoveragePercent, 100);
    assert.equal(result.supplementProductCoveragePercent, 100);
    assert.equal(result.foodCoveragePercent, 0);
    assert.equal(result.totalPlanCoveragePercent, 100);
    assert.equal(
      result.diagnostics.unmatchedNeeds.some((item) => item.itemType === "supplement"),
      false
    );
  });

  it("keeps productAudience female SKUs off male stacks", () => {
    const folate = dosedNeed({
      amount: 400,
      displayName: "Folate",
      id: "supplement:folate",
      normalizedName: "folate",
      unit: "mcg"
    });
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 400,
              name: "Folate",
              normalizedName: "folate",
              unit: "mcg"
            }
          ],
          id: "women-folate",
          productAudience: "female",
          title: "Women Folate"
        }),
        candidate({
          facts: [
            {
              amount: 400,
              name: "Folate",
              normalizedName: "folate",
              unit: "mcg"
            }
          ],
          id: "general-folate",
          title: "Adult Folate"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [folate],
      stackPreference: "balanced"
    });

    assert.equal(result.recommendations[0]?.product.id, "general-folate");
    assert.equal(
      result.recommendations.some((row) => row.product.id === "women-folate"),
      false
    );
  });

  it("does not treat a null-amount labelled fact as coverage", () => {
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: null,
              name: "Taurine",
              normalizedName: "taurine",
              unit: null
            }
          ],
          id: "undosed-taurine",
          title: "Taurine"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [
        dosedNeed({
          amount: 500,
          displayName: "Taurine",
          id: "supplement:taurine",
          normalizedName: "taurine",
          unit: "mg"
        })
      ],
      stackPreference: "balanced"
    });
    const taurine = [...result.diagnostics.matchedNeeds, ...result.diagnostics.unmatchedNeeds].find(
      (item) => item.id === "supplement:taurine"
    );

    assert.equal(result.recommendations.length, 0);
    assert.equal(taurine?.coveragePercent ?? 0, 0);
  });

  it("does not stack duplicate pack variants of the same covering SKU", () => {
    const curcumin = dosedNeed({
      amount: 500,
      displayName: "Curcumin",
      id: "supplement:curcumin",
      normalizedName: "curcumin",
      unit: "mg"
    });
    const facts = [
      {
        amount: 500,
        name: "Curcumin",
        normalizedName: "curcumin",
        unit: "mg"
      }
    ] as const;
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          brandName: "DHC",
          facts,
          id: "dhc-turmeric-single",
          title: "DHC Concentrated Turmeric 30-Day Supply"
        }),
        candidate({
          brandName: "DHC",
          facts,
          id: "dhc-turmeric-two-pack",
          title: "DHC Concentrated Turmeric 30-Day Supply 2-Pack"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [curcumin],
      stackPreference: "balanced"
    });

    assert.equal(result.recommendations.length, 1);
    assert.equal(
      result.recommendations.filter((item) => /turmeric/i.test(item.product.title)).length,
      1
    );
  });

  it("includes collateral reference-limit penalties without inventing an unknown adult profile", () => {
    setMatcherSafetyCeilings([
      { maxAmount: 40, maxUnit: "mg", name: "Iron", subjectId: "iron" }
    ]);
    const input: ProductRecommendationInput = {
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 100,
              name: "Magnesium",
              normalizedName: "magnesium",
              unit: "mg"
            },
            {
              amount: 20,
              name: "Iron",
              normalizedName: "iron",
              unit: "mg"
            }
          ],
          id: "mag-iron",
          title: "Magnesium with Iron"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [
        dosedNeed({
          amount: 300,
          displayName: "Magnesium",
          id: "supplement:magnesium",
          normalizedName: "magnesium",
          unit: "mg"
        })
      ],
      stackPreference: "balanced"
    };
    const unknownProfile = recommendWithMatcher(input);
    const result = recommendWithMatcher({ ...input, clientContext: { ageYears: 40, lifestage: "adult", currentSupplements: "none" } });
    setMatcherSafetyCeilings([]);

    assert.equal(unknownProfile.recommendations.length, 1);
    assert.equal(unknownProfile.recommendations[0].servingMultiplier, 3);
    const unknownOption = unknownProfile.diagnostics.matching!.options[0];
    assert.equal(unknownProfile.diagnostics.matching!.operationalStatus, "ready");
    assert.equal(unknownOption.doseFit!.total, 0);
    assert.deepEqual(unknownOption.doseFit!.perLimit, []);
    assert.equal(unknownOption.doseFit!.perTarget[0].certainty, "unknown");
    assert.ok(unknownOption.advice.some(row => row.code === "incomplete_health_information"));
    assert.equal(unknownOption.coveragePercent, 100);

    assert.equal(result.recommendations.length, 1);
    assert.equal(result.recommendations[0].product.id, "mag-iron");
    assert.equal(result.recommendations[0].servingMultiplier, 2);
    assert.equal(result.diagnostics.matching!.operationalStatus, "ready");
    const score = result.diagnostics.matching!.options[0].doseFit!;
    assert.ok(Math.abs(score.total - 1 / 3) < 1e-12);
    assert.equal(score.limitWeight, 2);
    assert.equal(score.weightedLimit, 0);
    assert.ok(score.perLimit.some(row => row.exposure === 40 && row.limit === 40));
    assert.ok(result.diagnostics.matchedNeeds.some(row => row.id === "supplement:magnesium" && row.coveragePercent > 60 && row.coveragePercent < 70));
    assert.deepEqual(result.diagnostics.blockedProducts, []);
    // Three servings remain eligible; their 50% limit excess costs 1,
    // which is worse than the selected one-third target shortfall.
    assert.ok(score.total < 2 * ((60 - 40) / 40));
  });

  it("does not recommend a pending leftover SKU", () => {
    const vitaminD3 = dosedNeed({
      amount: 25,
      displayName: "Vitamin D3",
      id: "supplement:vitamin-d3",
      normalizedName: "vitamin_d3",
      unit: "mcg"
    });
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          facts: [
            {
              amount: 25,
              name: "Vitamin D3",
              normalizedName: "vitamin_d3",
              unit: "mcg"
            }
          ],
          id: "pending-d3",
          status: "pending_review",
          title: "Leftover pending D3"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [vitaminD3],
      stackPreference: "compact"
    });

    assert.equal(result.recommendations.length, 0);
  });

  it("may recommend an approved selected SKU whose validation or brand is not pass", () => {
    const vitaminD3 = dosedNeed({
      amount: 25,
      displayName: "Vitamin D3",
      id: "supplement:vitamin-d3",
      normalizedName: "vitamin_d3",
      unit: "mcg"
    });
    const result = recommendWithMatcher({
      budgetAmount: null,
      candidates: [
        candidate({
          automatedSafetyPassed: false,
          brandStatus: "pending_review",
          facts: [
            {
              amount: 25,
              name: "Vitamin D3",
              normalizedName: "vitamin_d3",
              unit: "mcg"
            }
          ],
          id: "approved-dirty-d3",
          status: "approved",
          title: "Approved D3 with failed validation",
          validationStatus: "failed"
        })
      ],
      clientContext: null,
      clientSex: "male",
      countryCode: "TH",
      maxProducts: 6,
      needs: [vitaminD3],
      stackPreference: "compact"
    });

    assert.equal(result.recommendations.some((row) => row.product.id === "approved-dirty-d3"), true);
  });
});



describe("web compilation cache isolation", () => {
  it("recompiles eligibility when a shared catalogue is used with a different profile", () => {
    setMatcherSafetyCeilings([]);
    const candidates = [candidate({id: "female-only-d3", title: "Vitamin D3 1000 IU", productAudience: "female", facts: [{amount: 1000, name: "Vitamin D3", normalizedName: "vitamin_d3", unit: "IU"}]})];
    const needs = [dosedNeed({amount: 25, displayName: "Vitamin D3", id: "d3", normalizedName: "vitamin_d3", unit: "mcg"})];
    const input = {candidates, needs, countryCode: "TH", maxProducts: 3, stackPreference: "balanced" as const};
    assert.equal(recommendWithMatcher({...input, clientSex: "female"}).recommendations.length, 1);
    const reused = recommendWithMatcher({...input, clientSex: "male"});
    const fresh = recommendWithMatcher({...input, candidates: [...candidates], clientSex: "male"});
    assert.deepEqual(reused.recommendations, fresh.recommendations);
    assert.equal(reused.recommendations.length, 0);
  });

  it("matches fresh compilation when dose and stack preference change", () => {
    setMatcherSafetyCeilings([]);
    const candidates = [candidate({id: "d3", title: "Vitamin D3 1000 IU", facts: [{amount: 1000, name: "Vitamin D3", normalizedName: "vitamin_d3", unit: "IU"}]})];
    for (const stackPreference of ["compact", "balanced"] as const) {
      for (const amount of [25, 50, 10]) {
        const input = {candidates, countryCode: "TH", maxProducts: 3, stackPreference, needs: [dosedNeed({amount, displayName: "Vitamin D3", id: "d3", normalizedName: "vitamin_d3", unit: "mcg"})]};
        const reused = recommendWithMatcher(input);
        const fresh = recommendWithMatcher({...input, candidates: [...candidates]});
        assert.deepEqual(reused.recommendations, fresh.recommendations);
      }
    }
  });
});
