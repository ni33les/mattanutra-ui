import {
  comparableDoseAmount,
  normalizeDoseUnit,
  parseDose,
  type ParsedDose
} from "@/lib/dose-conversion";
import type {
  FoodGuidanceBlueprint,
  FoodGuidanceItem,
  FormulationBlueprint,
  FormulationIngredient,
  LocalizedText,
  RecommendedProduct
} from "@/lib/formulation-types";
import type { ValidationResult } from "@/lib/product-validation";

export type ProductStatus =
  | "approved"
  | "ignored"
  | "pending_review";

export type ProductPlatform = "lazada" | "manual" | "shopee";
export type ProductKind = "food" | "multi" | "other" | "supplement";
export type ProductAudience = "both" | "female" | "male";
export type ProductClientSex = "female" | "male";
export type ProductAvailabilityStatus =
  | "in_stock"
  | "out_of_stock"
  | "unavailable"
  | "unknown";
export type ProductConfidence = "high" | "low" | "moderate";

export type ProductRecommendationNeed = Readonly<{
  aliasKeys?: readonly string[];
  category: string;
  displayName: string;
  id: string;
  itemType: "food" | "nutrient" | "supplement";
  normalizedName: string;
  sourceId: string;
  targetComparableAmount: number | null;
  targetDose: ParsedDose | null;
  targetText: string | null;
  weight: number;
}>;

export type ProductCandidateFact = Readonly<{
  aliasKeys?: readonly string[];
  amount: number | null;
  comparableAmount: number | null;
  confidence: ProductConfidence;
  foodId?: string | null;
  itemType: "food" | "nutrient" | "supplement";
  name: string;
  normalizedName: string;
  nutrientId?: string | null;
  servingLabel?: string | null;
  supplementId?: string | null;
  unit: string | null;
}>;

export type ProductCandidate = Readonly<{
  activeOfferId?: string | null;
  activeAffiliateUrl?: string | null;
  activeAffiliateCommissionRate?: number | null;
  activeAffiliatePriority?: number | null;
  activeAffiliateType?: "affiliate" | "direct" | null;
  affiliateStatus: "active" | "flagged_stale" | "none";
  automatedSafetyPassed: boolean;
  availabilityStatus: ProductAvailabilityStatus;
  brandName?: string | null;
  brandStatus?: ProductStatus | null;
  currency: string;
  facts: ProductCandidateFact[];
  id: string;
  imageUrl?: string | null;
  labelStatus: "failed" | "missing" | "parsed" | "stale";
  status: ProductStatus;
  platform: ProductPlatform;
  productAudience?: ProductAudience | null;
  productKind?: ProductKind | null;
  validation?: ValidationResult | null;
  priceAmount?: number | null;
  productDataExpiresAt?: string | null;
  productUrl: string;
  region: string;
  title: string;
}>;

export type ProductRecommendationExclusion = Readonly<{
  productId: string;
  reason: string;
  title: string;
}>;

export type ProductRecommendationNeedDiagnostic = Readonly<{
  bestRejectedProductId: string | null;
  bestRejectedReason: string | null;
  displayName: string;
  id: string;
  itemType: ProductRecommendationNeed["itemType"];
  coveragePercent: number;
}>;

export type ProductRecommendationDiagnostics = Readonly<{
  blockedProducts: ProductRecommendationExclusion[];
  coverage: {
    foodCoveragePercent: number;
    supplementProductCoveragePercent: number;
    totalPlanCoveragePercent: number;
  };
  factIssues: ProductRecommendationExclusion[];
  matchedNeeds: ProductRecommendationNeedDiagnostic[];
  nearMisses: Array<Readonly<{
    coveragePercent: number;
    productId: string;
    reason: string;
    title: string;
  }>>;
  productsConsidered: number;
  unmatchedNeeds: ProductRecommendationNeedDiagnostic[];
}>;

export type ProductRecommendationSelection = Readonly<{
  affiliate: boolean;
  offerId: string | null;
  coveredNeeds: ProductRecommendationNeed[];
  product: ProductCandidate;
  productCoveragePercent: number;
  rank: number;
  score: number;
  stackContributionPercent: number;
  url: string;
  unknownAtRecommendation: boolean;
  why: string;
}>;

export type ProductRecommendationResult = Readonly<{
  clientNeeds: ProductRecommendationNeed[];
  diagnostics: ProductRecommendationDiagnostics;
  exclusions: ProductRecommendationExclusion[];
  recommendations: ProductRecommendationSelection[];
  supplementProductCoveragePercent: number;
  foodCoveragePercent: number;
  totalPlanCoveragePercent: number;
  stackCoveragePercent: number;
}>;

type CoverageResult = Readonly<{
  coverageByNeed: Map<string, number>;
  coveredNeeds: ProductRecommendationNeed[];
  percent: number;
}>;

const DEFAULT_TARGET_COUNT = 3;
const DEFAULT_MAX_COUNT = 6;
const MIN_USEFUL_MARGINAL_COVERAGE = 0.02;
const STOP_AFTER_TARGET_MARGINAL_COVERAGE = 0.08;
const TARGET_DOSE_SWEET_SPOT_MIN = 0.7;
const TARGET_DOSE_SWEET_SPOT_MAX = 1.3;
const TARGET_DOSE_SOFT_MAX = 1.5;
const AFFILIATE_SIMILARITY_PERCENT = 3;
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
const PRODUCT_FACT_DOSE_UNIT_PATTERN = "(?:mcg|µg|ug|mg|g|iu)";
const PRODUCT_FACT_PER_UNIT_PATTERN =
  "(?:mcg|µg|ug|mg|g|kg|ml|l)";
const PRODUCT_FACT_CONCENTRATION_PATTERN = new RegExp(
  `\\b\\d+(?:[,.]\\d+)?\\s*${PRODUCT_FACT_DOSE_UNIT_PATTERN}\\s*(?:\\/|\\bper\\b|\\s+)\\s*${PRODUCT_FACT_PER_UNIT_PATTERN}\\b`,
  "i"
);
const PRODUCT_FACT_CONCENTRATION_REPLACE_PATTERN = new RegExp(
  PRODUCT_FACT_CONCENTRATION_PATTERN.source,
  "gi"
);
const PRODUCT_FACT_DOSE_PATTERN = new RegExp(
  `\\b\\d+(?:[,.]\\d+)?\\s*${PRODUCT_FACT_DOSE_UNIT_PATTERN}\\b`,
  "gi"
);
const PRODUCT_FACT_PERCENT_PATTERN = /\b\d+(?:[,.]\d+)?\s*%/g;
const PRODUCT_FACT_PERCENT_PARENS_PATTERN = /\([^)]*\b\d+(?:[,.]\d+)?\s*%[^)]*\)/g;
const MATCH_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["vitamin_a", "retinol", "retinyl_palmitate", "retinyl_acetate"],
  ["beta_carotene", "provitamin_a"],
  ["vitamin_b1", "thiamine", "thiamin", "thiamine_nitrate", "thiamine_hydrochloride"],
  ["vitamin_b2", "riboflavin"],
  ["vitamin_b3", "niacin", "niacinamide", "nicotinamide", "nicotinic_acid"],
  ["vitamin_b5", "pantothenic_acid", "calcium_pantothenate"],
  ["vitamin_b6", "pyridoxine", "pyridoxine_hcl", "pyridoxine_hydrochloride"],
  ["vitamin_b7", "biotin"],
  ["vitamin_b9", "folate", "folic_acid", "methylfolate", "l_5_mthf"],
  ["vitamin_b12", "b12", "cobalamin", "cyanocobalamin", "methylcobalamin"],
  ["vitamin_c", "ascorbic_acid", "calcium_ascorbate", "sodium_ascorbate"],
  ["vitamin_d", "vitamin_d3", "cholecalciferol"],
  ["vitamin_e", "tocopherol", "alpha_tocopherol", "tocopheryl_acetate", "tocopheryl_succinate"],
  ["vitamin_k", "vitamin_k1", "phytonadione", "phylloquinone"],
  ["vitamin_k2", "menaquinone", "mk_7", "mk7"],
  ["coq10", "coenzyme_q10", "ubiquinone", "ubiquinol"],
  ["pea", "palmidrol", "palmitoylethanolamide"],
  ["ashwagandha", "ashwaganda", "withania_somnifera", "ashwagandha_root_extract"],
  ["curcumin", "curacumin", "curcuminoids", "turmeric_extract", "curcuma_longa"],
  ["multi_strain_probiotics", "probiotics", "probiotic", "probiotic_blend"],
  [
    "omega_3",
    "omega_3_fatty_acids",
    "fish_oil",
    "epa",
    "dha",
    "eicosapentaenoic_acid",
    "docosahexaenoic_acid"
  ],
  ["theanine", "l_theanine", "alpha_wave_l_theanine"],
  ["l_glutamine", "glutamine"],
  ["magnesium", "magnesium_citrate", "magnesium_glycinate", "magnesium_bisglycinate", "magnesium_glyconate", "magnesium_oxide", "magnesium_threonate"],
  ["iron", "ferrous_fumarate", "ferrous_sulfate", "ferrous_bisglycinate"],
  ["zinc", "zinc_amino_acid_chelate", "zinc_citrate", "zinc_gluconate", "zinc_oxide", "zinc_sulfate"],
  ["selenium", "selenomethionine", "sodium_selenite"],
  ["iodine", "iodide", "potassium_iodide"],
  ["copper", "copper_gluconate", "copper_sulfate"],
  ["chromium", "chromium_picolinate"],
  ["manganese", "manganese_sulfate"],
  ["calcium", "calcium_carbonate", "calcium_citrate"]
];
const MATCH_KEY_ALIASES: Record<string, readonly string[]> =
  Object.fromEntries(
    MATCH_ALIAS_GROUPS.flatMap((group) => {
      const aliases = [...new Set(group.map((alias) => normalizeProductKey(alias)))];

      return aliases.map((alias) => [alias, aliases] as const);
    })
  );
const MATCH_TOKEN_STOP_WORDS = new Set([
  "acid",
  "active",
  "amino",
  "chelate",
  "compound",
  "dietary",
  "extract",
  "hcl",
  "hydrochloride",
  "mineral",
  "minerals",
  "nitrate",
  "oxide",
  "plus",
  "supplement",
  "supplements",
  "tablet",
  "tablets",
  "vitamin",
  "vitamins"
]);

export function normalizeProductKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function factTextForParsing(value: string) {
  return value.replace(/_/g, " ");
}

export function productFactLooksLikeConcentration(value: string | null | undefined) {
  return Boolean(
    value &&
      PRODUCT_FACT_CONCENTRATION_PATTERN.test(factTextForParsing(value))
  );
}

export function normalizeProductFactName(value: string) {
  return factTextForParsing(value)
    .replace(/\([^)]*\)/g, (match) =>
      productFactLooksLikeConcentration(match) ? " " : match
    )
    .replace(PRODUCT_FACT_PERCENT_PARENS_PATTERN, " ")
    .replace(PRODUCT_FACT_CONCENTRATION_REPLACE_PATTERN, " ")
    .replace(PRODUCT_FACT_DOSE_PATTERN, " ")
    .replace(PRODUCT_FACT_PERCENT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:()[\]-]+$/g, "")
    .trim();
}

export function normalizeProductFactKey(value: string) {
  return normalizeProductKey(normalizeProductFactName(value) || value);
}

export function productFactAliasKeys(
  value: string,
  extraAliases: readonly string[] = []
) {
  const normalized = normalizeProductFactKey(value);
  const inferredAliases: string[] = [];

  if (/(^|_)l?_?theanine($|_)/.test(normalized)) {
    inferredAliases.push("theanine", "l_theanine");
  }

  if (
    /(^|_)dha($|_)/.test(normalized) ||
    normalized.includes("docosahexaenoic_acid")
  ) {
    inferredAliases.push("omega_3", "dha", "docosahexaenoic_acid");
  }

  if (
    /(^|_)epa($|_)/.test(normalized) ||
    normalized.includes("eicosapentaenoic_acid")
  ) {
    inferredAliases.push("omega_3", "epa", "eicosapentaenoic_acid");
  }

  const seed = [
    normalized,
    ...inferredAliases,
    ...extraAliases.map((alias) => normalizeProductFactKey(alias))
  ].filter(Boolean);
  const aliases = seed.flatMap((key) => MATCH_KEY_ALIASES[key] ?? [key]);

  return [...new Set(aliases.map((alias) => normalizeProductFactKey(alias)).filter(Boolean))];
}

function matchKeyAliases(
  value: string,
  extraAliases: readonly string[] = []
) {
  return new Set(productFactAliasKeys(value, extraAliases));
}

function keyTokens(key: string) {
  return normalizeProductFactKey(key)
    .split("_")
    .filter((token) => token.length > 1 && !MATCH_TOKEN_STOP_WORDS.has(token));
}

function editDistanceWithinOne(left: string, right: string) {
  if (left === right) {
    return true;
  }

  if (left.length < 5 || right.length < 5) {
    return false;
  }

  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let edits = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;

    if (edits > 1) {
      return false;
    }

    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + (left.length - leftIndex) + (right.length - rightIndex) <= 1;
}

function fuzzyTokensMatch(left: string, right: string) {
  const leftTokens = keyTokens(left);
  const rightTokens = keyTokens(right);

  if (leftTokens.length < 1 || rightTokens.length < 1) {
    return false;
  }

  const shorter = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer = leftTokens.length <= rightTokens.length ? rightTokens : leftTokens;
  const matched = shorter.filter((token) =>
    longer.some((candidate) => editDistanceWithinOne(token, candidate))
  ).length;

  return matched === shorter.length && matched / longer.length >= 0.6;
}

export function productKeysMatch(
  left: string,
  right: string,
  leftAliases: readonly string[] = [],
  rightAliases: readonly string[] = []
) {
  const leftKeys = matchKeyAliases(left, leftAliases);
  const rightKeys = matchKeyAliases(right, rightAliases);

  if ([...leftKeys].some((alias) => rightKeys.has(alias))) {
    return true;
  }

  return [...leftKeys].some((leftKey) =>
    [...rightKeys].some((rightKey) => fuzzyTokensMatch(leftKey, rightKey))
  );
}

function textValue(value: LocalizedText) {
  return typeof value === "string" ? value : value.en || value.th;
}

function safePercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function visibleCoveragePercent(value: number, hasCoverage: boolean) {
  const percent = safePercent(value);

  return hasCoverage && value > 0 && percent === 0 ? 1 : percent;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function doseFromAmount(
  amount: number | null,
  unit: string | null
): ParsedDose | null {
  if (amount === null || amount <= 0 || !unit) {
    return null;
  }

  const normalizedUnit = normalizeDoseUnit(unit);

  return normalizedUnit
    ? {
        amount,
        originalText: `${amount} ${normalizedUnit}`,
        unit: normalizedUnit
      }
    : null;
}

function effectWeight(rank: number, itemType: "food" | "nutrient" | "supplement") {
  const normalizedRank = Number.isFinite(rank) && rank > 0 ? Math.round(rank) : 5;
  const base = Math.max(1, 8 - normalizedRank);

  return itemType === "food" ? base * 0.8 : base;
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
      .filter((item) => item.status === "add" || item.status === "review")
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
  const foodNeeds =
    input.foodGuidance?.foodGuidance
      ?.filter((item) => visibleSafetyStatus(item))
      .filter((item) => item.status === "add" || item.status === "review")
      .map((item) => {
        const displayName = textValue(item.food);

        return {
          category: item.category,
          displayName,
          id: `food:${item.id}`,
          itemType: "food" as const,
          normalizedName: normalizeProductFactKey(displayName),
          sourceId: item.id,
          targetComparableAmount: null,
          targetDose: null,
          targetText: textValue(item.serving),
          weight: effectWeight(item.effectivenessRank, "food")
        } satisfies ProductRecommendationNeed;
      }) ?? [];

  return [...supplementNeeds, ...foodNeeds];
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

export function buildMarketplaceSearchQueries(
  needs: readonly ProductRecommendationNeed[],
  limit = 16
) {
  const weightedNeeds = [...needs]
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

function factComparableAmount(fact: ProductCandidateFact) {
  if (
    productFactLooksLikeConcentration(fact.name) ||
    productFactLooksLikeConcentration(fact.normalizedName)
  ) {
    return null;
  }

  if (typeof fact.comparableAmount === "number" && fact.comparableAmount > 0) {
    return fact.comparableAmount;
  }

  const dose = doseFromAmount(positiveNumber(fact.amount), fact.unit);

  return dose ? comparableDoseAmount(dose, normalizeProductFactKey(fact.name)) : null;
}

function confidenceMultiplier(confidence: ProductConfidence) {
  if (confidence === "high") {
    return 1;
  }

  return confidence === "moderate" ? 0.85 : 0.65;
}

function matchesNeed(fact: ProductCandidateFact, need: ProductRecommendationNeed) {
  if (fact.itemType !== need.itemType && fact.itemType !== "nutrient") {
    return false;
  }

  if (fact.itemType === "supplement" && fact.supplementId === need.sourceId) {
    return true;
  }

  if (fact.itemType === "food" && fact.foodId === need.sourceId) {
    return true;
  }

  return productKeysMatch(
    fact.name || fact.normalizedName,
    need.displayName || need.normalizedName,
    fact.aliasKeys,
    need.aliasKeys
  );
}

function factNeedCoverage(fact: ProductCandidateFact, need: ProductRecommendationNeed) {
  if (!matchesNeed(fact, need)) {
    return 0;
  }

  const confidence = confidenceMultiplier(fact.confidence);
  const factAmount = factComparableAmount(fact);

  if (
    factAmount !== null &&
    need.targetComparableAmount !== null &&
    need.targetComparableAmount > 0
  ) {
    const ratio = factAmount / need.targetComparableAmount;

    if (ratio <= 0) {
      return 0;
    }

    if (ratio < TARGET_DOSE_SWEET_SPOT_MIN) {
      return ratio * 0.85 * confidence;
    }

    if (ratio <= TARGET_DOSE_SWEET_SPOT_MAX) {
      return Math.min(1, ratio) * confidence;
    }

    if (ratio <= TARGET_DOSE_SOFT_MAX) {
      return Math.max(0.75, 1 - (ratio - TARGET_DOSE_SWEET_SPOT_MAX) * 0.75) *
        confidence;
    }

    return Math.max(0.25, 1 - (ratio - TARGET_DOSE_SOFT_MAX) * 0.5) *
      confidence;
  }

  return 0.8 * confidence;
}

function productCoverage(product: ProductCandidate, needs: ProductRecommendationNeed[]) {
  const coverageByNeed = new Map<string, number>();
  const coveredNeeds: ProductRecommendationNeed[] = [];
  const totalWeight = needs.reduce((total, need) => total + need.weight, 0);

  for (const need of needs) {
    const coverage = Math.max(
      0,
      ...product.facts.map((fact) => factNeedCoverage(fact, need))
    );

    if (coverage > 0) {
      coverageByNeed.set(need.id, Math.min(1, coverage));
      coveredNeeds.push(need);
    }
  }

  const weightedCoverage = coveredNeeds.reduce(
    (total, need) => total + need.weight * (coverageByNeed.get(need.id) ?? 0),
    0
  );

  return {
    coverageByNeed,
    coveredNeeds,
    percent: totalWeight > 0 ? (weightedCoverage / totalWeight) * 100 : 0
  } satisfies CoverageResult;
}

function exclusionReason(product: ProductCandidate) {
  if (product.brandStatus === "ignored") {
    return "Brand is ignored";
  }

  if (product.status === "ignored") {
    return "Product is ignored";
  }

  if (
    product.status !== "approved" ||
    product.brandStatus !== "approved"
  ) {
    return "Product is not approved yet";
  }

  if (product.labelStatus !== "parsed" || product.facts.length < 1) {
    return "Product label facts are missing";
  }

  if (product.validation && product.validation.status !== "pass") {
    return `Product validation needs review: ${product.validation.summary}`;
  }

  if (
    product.productDataExpiresAt &&
    new Date(product.productDataExpiresAt).getTime() < Date.now()
  ) {
    return "Product cache expired";
  }

  if (!product.automatedSafetyPassed) {
    return "Product failed automated safety checks";
  }

  return null;
}

function productAudienceMismatchReason(
  product: ProductCandidate,
  clientSex?: ProductClientSex | null
) {
  const audience = product.productAudience ?? "both";

  if (!clientSex || audience === "both" || audience === clientSex) {
    return null;
  }

  return audience === "female"
    ? "Product is for women only"
    : "Product is for men only";
}

function productPenalty(product: ProductCandidate, budgetAmount?: number | null) {
  let penalty = 0;

  if (product.labelStatus === "stale") {
    penalty += 4;
  }

  if (budgetAmount && product.priceAmount && product.priceAmount > budgetAmount) {
    penalty += Math.min(15, ((product.priceAmount - budgetAmount) / budgetAmount) * 10);
  }

  return penalty;
}

function extraIngredientPenalty(
  product: ProductCandidate,
  needs: ProductRecommendationNeed[]
) {
  const neededNames = new Set(
    needs.flatMap((need) =>
      [...matchKeyAliases(need.displayName || need.normalizedName, need.aliasKeys)]
    )
  );
  const extras = product.facts.filter(
    (fact) => ![...matchKeyAliases(fact.name || fact.normalizedName, fact.aliasKeys)]
      .some((alias) => neededNames.has(alias))
  );

  if (extras.length < 1) {
    return 0;
  }

  const lowConfidenceExtras = extras.filter((fact) => fact.confidence === "low");

  return Math.min(8, extras.length * 0.2 + lowConfidenceExtras.length * 0.35);
}

function broadBaseBonus(
  product: ProductCandidate,
  coverage: CoverageResult,
  selectedCount: number
) {
  if (selectedCount > 0) {
    return 0;
  }

  const productKind = product.productKind ?? "supplement";
  const broadFactCount = product.facts.length;

  if (productKind === "multi" || broadFactCount >= 6) {
    return Math.min(8, coverage.coveredNeeds.length * 1.2 + broadFactCount * 0.1);
  }

  return 0;
}

function affiliateTieScore(product: ProductCandidate) {
  if (!product.activeAffiliateUrl) {
    return 0;
  }

  const commissionRate = product.activeAffiliateCommissionRate ?? 0;
  const priority = product.activeAffiliatePriority ?? 0;
  const affiliateTypeBonus = product.activeAffiliateType === "affiliate" ? 10 : 1;

  return affiliateTypeBonus + commissionRate * 100 + priority;
}

function productsAreNutritionallySimilar(
  first: Readonly<{ marginal: number; score: number }>,
  second: Readonly<{ marginal: number; score: number }>
) {
  return Math.abs(first.marginal - second.marginal) <= AFFILIATE_SIMILARITY_PERCENT &&
    Math.abs(first.score - second.score) <= AFFILIATE_SIMILARITY_PERCENT;
}

function marginalCoveragePercent(
  coverage: CoverageResult,
  existingCoverage: Map<string, number>,
  needs: ProductRecommendationNeed[]
) {
  const totalWeight = needs.reduce((total, need) => total + need.weight, 0);
  const weightedMarginal = needs.reduce((total, need) => {
    const current = existingCoverage.get(need.id) ?? 0;
    const next = coverage.coverageByNeed.get(need.id) ?? 0;

    return total + Math.max(0, next - current) * need.weight;
  }, 0);

  return totalWeight > 0 ? (weightedMarginal / totalWeight) * 100 : 0;
}

function applyCoverage(
  target: Map<string, number>,
  coverage: CoverageResult
) {
  for (const [needId, nextCoverage] of coverage.coverageByNeed.entries()) {
    target.set(needId, Math.max(target.get(needId) ?? 0, nextCoverage));
  }
}

function coversCurrentlyUnmatchedNeed(
  coverage: CoverageResult,
  existingCoverage: Map<string, number>
) {
  return [...coverage.coverageByNeed.entries()].some(
    ([needId, nextCoverage]) =>
      nextCoverage > 0 && (existingCoverage.get(needId) ?? 0) <= 0
  );
}

function stackCoveragePercent(
  coverage: Map<string, number>,
  needs: ProductRecommendationNeed[]
) {
  const totalWeight = needs.reduce((total, need) => total + need.weight, 0);
  const weightedCoverage = needs.reduce(
    (total, need) => total + (coverage.get(need.id) ?? 0) * need.weight,
    0
  );

  return totalWeight > 0 ? (weightedCoverage / totalWeight) * 100 : 0;
}

function diagnosticNeeds(
  needs: ProductRecommendationNeed[],
  coverage: Map<string, number>,
  bestRejectedByNeed: ReadonlyMap<string, ProductRecommendationExclusion>
) {
  return needs.map((need) => {
    const bestRejected = bestRejectedByNeed.get(need.id);

    return {
      bestRejectedProductId: bestRejected?.productId ?? null,
      bestRejectedReason: bestRejected?.reason ?? null,
      coveragePercent: safePercent((coverage.get(need.id) ?? 0) * 100),
      displayName: need.displayName,
      id: need.id,
      itemType: need.itemType
    } satisfies ProductRecommendationNeedDiagnostic;
  });
}

function factIssueExclusions(exclusions: ProductRecommendationExclusion[]) {
  return exclusions.filter((item) =>
    /validation|label|fact|safety|cache|approved|unavailable|blocked/i.test(item.reason)
  );
}

function marketplaceName(platform: ProductPlatform): RecommendedProduct["marketplace"] {
  if (platform === "lazada") {
    return "Lazada Thailand";
  }

  return platform === "shopee" ? "Shopee Thailand" : "Imported product";
}

function whyProductMatches(
  product: ProductCandidate,
  coveredNeeds: ProductRecommendationNeed[],
  stackContributionPercent: number
) {
  const names = coveredNeeds.slice(0, 3).map((need) => need.displayName);
  const prefix = "Strong match";
  const contribution = safePercent(stackContributionPercent);

  if (names.length < 1) {
    return contribution > 0
      ? `${prefix}; adds ${contribution}% to this stack.`
      : `${prefix}; fills an otherwise uncovered need.`;
  }

  return contribution > 0
    ? `${prefix} for ${names.join(", ")}; adds ${contribution}% to this stack.`
    : `${prefix} for ${names.join(", ")}; fills an otherwise uncovered need.`;
}

export function recommendProductStack(input: Readonly<{
  budgetAmount?: number | null;
  candidates: ProductCandidate[];
  clientSex?: ProductClientSex | null;
  maxProducts?: number;
  needs: ProductRecommendationNeed[];
  targetProducts?: number;
}>) {
  const targetCount = input.targetProducts ?? DEFAULT_TARGET_COUNT;
  const maxProducts = Math.min(
    DEFAULT_MAX_COUNT,
    Math.max(1, input.maxProducts ?? DEFAULT_MAX_COUNT)
  );
  const productNeeds = input.needs.filter((need) => need.itemType !== "food");
  const scoringNeeds = productNeeds.length > 0 ? productNeeds : input.needs;
  const exclusions: ProductRecommendationExclusion[] = [];
  const bestRejectedByNeed = new Map<string, ProductRecommendationExclusion>();
  const bestRejectedCoverageByNeed = new Map<string, number>();
  const scored = input.candidates
    .map((product) => {
      const coverage = productCoverage(product, scoringNeeds);
      const reason =
        exclusionReason(product) ??
        productAudienceMismatchReason(product, input.clientSex);

      if (reason) {
        const exclusion = {
          productId: product.id,
          reason,
          title: product.title
        };

        exclusions.push(exclusion);

        for (const need of coverage.coveredNeeds) {
          const current = bestRejectedCoverageByNeed.get(need.id) ?? 0;
          const next = coverage.coverageByNeed.get(need.id) ?? 0;

          if (next > current) {
            bestRejectedCoverageByNeed.set(need.id, next);
            bestRejectedByNeed.set(need.id, exclusion);
          }
        }

        return null;
      }

      const penalty = productPenalty(product, input.budgetAmount);

      if (coverage.percent <= 0) {
        const exclusion = {
          productId: product.id,
          reason: "Product does not cover current client needs",
          title: product.title
        };

        exclusions.push(exclusion);
        return null;
      }

      return {
        coverage,
        penalty,
        product
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const selected: ProductRecommendationSelection[] = [];
  const selectedProductIds = new Set<string>();
  const stackCoverage = new Map<string, number>();

  while (selected.length < maxProducts) {
    const ranked = scored
      .filter((item) => !selectedProductIds.has(item.product.id))
      .map((item) => {
        const marginal = marginalCoveragePercent(
          item.coverage,
          stackCoverage,
          scoringNeeds
        );
        const affiliateBonus = item.product.activeAffiliateUrl ? 0.05 : 0;
        const looseFitPenalty = extraIngredientPenalty(item.product, scoringNeeds);
        const baseBonus = broadBaseBonus(item.product, item.coverage, selected.length);

        return {
          ...item,
          affiliateBonus,
          baseBonus,
          looseFitPenalty,
          marginal,
          score:
            marginal * 2 +
            item.coverage.percent * 0.3 -
            item.penalty +
            baseBonus -
            looseFitPenalty +
            affiliateBonus
        };
      })
      .filter((item) =>
        item.marginal / 100 >= MIN_USEFUL_MARGINAL_COVERAGE ||
        coversCurrentlyUnmatchedNeed(item.coverage, stackCoverage)
      )
      .sort((first, second) => {
        const scoreDelta = second.score - first.score;

        if (
          Math.abs(scoreDelta) > 0.5 &&
          !productsAreNutritionallySimilar(first, second)
        ) {
          return scoreDelta;
        }

        if (first.product.activeAffiliateUrl !== second.product.activeAffiliateUrl) {
          return first.product.activeAffiliateUrl ? -1 : 1;
        }

        const affiliateDelta =
          affiliateTieScore(second.product) - affiliateTieScore(first.product);

        if (affiliateDelta !== 0) {
          return affiliateDelta;
        }

        return (first.product.priceAmount ?? Number.MAX_SAFE_INTEGER) -
          (second.product.priceAmount ?? Number.MAX_SAFE_INTEGER);
      });
    const eligibleRanked =
      selected.length >= targetCount
        ? ranked.filter((item) =>
            item.marginal / 100 >= STOP_AFTER_TARGET_MARGINAL_COVERAGE ||
            coversCurrentlyUnmatchedNeed(item.coverage, stackCoverage)
          )
        : ranked;
    const best = eligibleRanked[0];

    if (!best) {
      break;
    }

    selectedProductIds.add(best.product.id);
    applyCoverage(stackCoverage, best.coverage);
    selected.push({
      affiliate: Boolean(best.product.activeAffiliateUrl),
      offerId: best.product.activeOfferId ?? null,
      coveredNeeds: best.coverage.coveredNeeds,
      product: best.product,
      productCoveragePercent: visibleCoveragePercent(
        best.coverage.percent,
        best.coverage.coveredNeeds.length > 0
      ),
      rank: selected.length + 1,
      score: Number(best.score.toFixed(4)),
      stackContributionPercent: visibleCoveragePercent(best.marginal, best.marginal > 0),
      unknownAtRecommendation: false,
      url: best.product.activeAffiliateUrl || best.product.productUrl,
      why: whyProductMatches(
        best.product,
        best.coverage.coveredNeeds,
        best.marginal
      )
    });
  }

  const supplementProductCoveragePercent = safePercent(
    stackCoveragePercent(stackCoverage, productNeeds)
  );
  const foodCoveragePercent = safePercent(
    stackCoveragePercent(
      stackCoverage,
      input.needs.filter((need) => need.itemType === "food")
    )
  );
  const totalPlanCoveragePercent = safePercent(
    stackCoveragePercent(stackCoverage, input.needs)
  );
  const needDiagnostics = diagnosticNeeds(input.needs, stackCoverage, bestRejectedByNeed);
  const selectedIds = new Set(selected.map((item) => item.product.id));
  const nearMisses = scored
    .filter((item) => !selectedIds.has(item.product.id))
    .map((item) => ({
      coveragePercent: safePercent(item.coverage.percent),
      productId: item.product.id,
      reason: "Lower marginal fit than selected products",
      title: item.product.title
    }))
    .filter((item) => item.coveragePercent > 0)
    .sort((first, second) => second.coveragePercent - first.coveragePercent)
    .slice(0, 12);

  return {
    clientNeeds: input.needs,
    diagnostics: {
      blockedProducts: exclusions.filter(
        (item) => item.reason !== "Product does not cover current client needs"
      ),
      coverage: {
        foodCoveragePercent,
        supplementProductCoveragePercent,
        totalPlanCoveragePercent
      },
      factIssues: factIssueExclusions(exclusions),
      matchedNeeds: needDiagnostics.filter((item) => item.coveragePercent > 0),
      nearMisses,
      productsConsidered: input.candidates.length,
      unmatchedNeeds: needDiagnostics.filter((item) => item.coveragePercent <= 0)
    },
    exclusions,
    recommendations: selected,
    foodCoveragePercent,
    stackCoveragePercent: supplementProductCoveragePercent,
    supplementProductCoveragePercent,
    totalPlanCoveragePercent
  } satisfies ProductRecommendationResult;
}

export function toRecommendedProduct(
  selection: ProductRecommendationSelection,
  stackCoveragePercent: number,
  recommendationRunId?: string
) {
  return {
    affiliate: selection.affiliate,
    covers: selection.coveredNeeds.map((need) => need.sourceId),
    description: selection.why,
    id: selection.product.id,
    imageUrl: selection.product.imageUrl ?? null,
    marketplace: marketplaceName(selection.product.platform),
    name: selection.product.title,
    price:
      selection.product.priceAmount && selection.product.priceAmount > 0
        ? {
            amount: selection.product.priceAmount,
            currency: selection.product.currency || "THB"
          }
        : null,
    priority: selection.rank,
    productCoveragePercent: selection.productCoveragePercent,
    productId: selection.product.id,
    rank: selection.rank,
    recommendationRunId,
    stackContributionPercent: selection.stackContributionPercent,
    stackCoveragePercent,
    tag: selection.affiliate ? "Best match + affiliate" : "Best match",
    url: selection.url
  } satisfies RecommendedProduct;
}
