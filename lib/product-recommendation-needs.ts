import { comparableDoseAmount, parseDose } from "@/lib/dose-conversion";
import type {
  FoodGuidanceBlueprint,
  FoodGuidanceItem,
  FormulationBlueprint,
  FormulationIngredient,
  LocalizedText
} from "@/lib/formulation-types";
import { resolveLocalizedText } from "@/lib/i18n";
import { normalizeProductFactKey } from "@/lib/product-key-matching";
import type { ProductRecommendationNeed } from "@/lib/product-recommendation-types";

const GENERIC_BASE_PRODUCT_QUERIES = [
  "multivitamin",
  "multivitamin mineral",
  "วิตามินรวม",
  "อาหารเสริม วิตามินรวม"
];

const SEARCH_TOKEN_REPLACEMENTS: Record<string, string[]> = {
  ashwagandha: ["ashwagandha", "withania somnifera"],
  coq10: ["coq10", "coenzyme q10"],
  curcumin: ["curcumin", "turmeric extract", "curcuminoids"],
  l_glutamine: ["l-glutamine", "glutamine"],
  magnesium: ["magnesium", "magnesium glycinate", "แมกนีเซียม"],
  multi_strain_probiotics: ["probiotics", "probiotic blend"],
  omega_3: ["omega 3", "fish oil", "น้ำมันปลา"],
  theanine: ["l-theanine", "theanine"],
  vitamin_b12: ["vitamin b12", "b12"],
  vitamin_c: ["vitamin c", "วิตามินซี"],
  vitamin_d: ["vitamin d3", "vitamin d", "วิตามินดี"],
  vitamin_d3: ["vitamin d3", "vitamin d", "วิตามินดี"],
  zinc: ["zinc", "สังกะสี"]
};

function textValue(value: LocalizedText) {
  return resolveLocalizedText(value, "en");
}

function effectWeight(rank: number, itemType: "food" | "nutrient" | "supplement") {
  const normalizedRank = Number.isFinite(rank) && rank > 0 ? Math.round(rank) : 5;
  const base = Math.max(1, 8 - normalizedRank);

  return itemType === "food" ? base * 0.8 : base;
}

export function supplementProductNeeds(
  needs: readonly ProductRecommendationNeed[]
) {
  return needs.filter((need) => need.itemType === "supplement");
}

function visibleSafetyStatus(
  item: Pick<FormulationIngredient | FoodGuidanceItem, "safety">,
) {
  return item.safety?.visibility !== "hidden";
}

export function buildProductNeeds(input: Readonly<{
  foodGuidance: FoodGuidanceBlueprint | null;
  formulation: FormulationBlueprint | null;
}>) {
  const supplementNeeds =
    input.formulation?.supplementBreakdown
      ?.filter((item) => visibleSafetyStatus(item))
      .map((item) => {
        const displayName = textValue(item.supplement);
        const normalizedName = normalizeProductFactKey(displayName);
        const targetText = textValue(item.dailyDose);
        const targetDose = parseDose(targetText, normalizedName);

        return {
          category: item.category,
          displayName,
          id: `supplement:${item.id}`,
          itemType: "supplement" as const,
          normalizedName,
          sourceId: item.id,
          targetComparableAmount: targetDose
            ? comparableDoseAmount(targetDose, normalizedName)
            : null,
          targetDose,
          targetText,
          weight: effectWeight(item.effectivenessRank, "supplement")
        } satisfies ProductRecommendationNeed;
      }) ?? [];

  return supplementNeeds;
}

function humanSearchName(need: ProductRecommendationNeed) {
  const replacement = SEARCH_TOKEN_REPLACEMENTS[need.normalizedName];

  if (replacement) {
    return replacement;
  }

  return [
    need.displayName
      .replace(/\([^)]*\)/g, "")
      .replace(/\b\d+(\.\d+)?\s*(mcg|µg|ug|mg|g|iu)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  ].filter(Boolean);
}

export function buildProductSearchQueries(
  needs: readonly ProductRecommendationNeed[],
  limit = 16
) {
  const weightedNeeds = supplementProductNeeds(needs)
    .sort((first, second) => second.weight - first.weight);
  const queries: string[] = [...GENERIC_BASE_PRODUCT_QUERIES];

  for (const need of weightedNeeds) {
    for (const name of humanSearchName(need)) {
      queries.push(name);

      if (
        need.itemType !== "food" &&
        !/supplement|vitamin|วิตามิน|อาหารเสริม/i.test(name)
      ) {
        queries.push(`${name} supplement`);
      }
    }
  }

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))]
    .slice(0, Math.max(1, limit));
}
