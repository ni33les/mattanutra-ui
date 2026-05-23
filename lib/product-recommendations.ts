import {
  comparableDoseAmount,
  normalizeDoseUnit,
  parseDose,
  parseDoseLimit,
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
  maxAmount?: number | null;
  maxUnit?: string | null;
  name: string;
  normalizedName: string;
  nutrientId?: string | null;
  servingLabel?: string | null;
  safetyFlags?: readonly string[];
  supplementAudience?: ProductAudience | null;
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
  availableCountryCodes?: readonly string[];
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

export type ProductRecommendationAlgorithmVersion =
  | "v2-exact-shortlist"
  | "v2-full-beam";
export type ProductStackPreference = "balanced" | "compact";

export type ProductRecommendationDiagnostics = Readonly<{
  algorithmVersion?: ProductRecommendationAlgorithmVersion;
  blockedProducts: ProductRecommendationExclusion[];
  coverage: {
    foodCoveragePercent: number;
    supplementProductCoveragePercent: number;
    totalPlanCoveragePercent: number;
  };
  factIssues: ProductRecommendationExclusion[];
  matchedNeeds: ProductRecommendationNeedDiagnostic[];
  marketRegion?: string;
  nearMisses: Array<Readonly<{
    coveragePercent: number;
    productId: string;
    reason: string;
    title: string;
  }>>;
  productsConsidered: number;
  stackPreference?: ProductStackPreference;
  trace?: ProductRecommendationTrace;
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
  servingMultiplier: number;
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

export type ProductRecommendationClientContext = Readonly<{
  budgetAmount?: number | null;
  budgetPreference?: string | null;
  conditions?: readonly string[];
  currentSupplements?: string | null;
  guidanceAdjustmentCount?: number;
  lifestage?: string | null;
  medicationTypes?: readonly string[];
  medications?: string | null;
  pillLimit?: string | null;
  planFeedbackTypes?: readonly string[];
  preferredForm?: string | null;
}>;

export type ProductRecommendationInput = Readonly<{
  budgetAmount?: number | null;
  candidates: ProductCandidate[];
  clientContext?: ProductRecommendationClientContext | null;
  clientSex?: ProductClientSex | null;
  countryCode?: string | null;
  maxProducts?: number;
  needs: ProductRecommendationNeed[];
  stackPreference?: ProductStackPreference | null;
  targetProducts?: number;
}>;

export type ProductRecommendationTrace = Readonly<{
  alternativeStacks: Array<Readonly<{
    productIds: string[];
    productTitles: string[];
    score: number;
    supplementProductCoveragePercent: number;
    totalPlanCoveragePercent: number;
  }>>;
  candidatePoolSize?: number;
  componentScores: Record<string, number>;
  contextSignals: Record<string, unknown>;
  evaluatedStackCount?: number;
  excludedPredicates: ProductRecommendationExclusion[];
  maxProducts?: number;
  searchMode?: "full-beam" | "shortlist";
  shortfalls: Array<Readonly<{
    coveragePercent: number;
    displayName: string;
    id: string;
    shortfallPercent: number;
  }>>;
  shortlistSize: number;
  stackPreference?: ProductStackPreference;
  targetProducts?: number;
  timingMs?: Record<string, number>;
  utilityScore: number;
  weightDeltas: Record<string, number>;
  weights: Record<string, number>;
}>;

type CoverageResult = Readonly<{
  coverageByNeed: Map<string, number>;
  coveredNeeds: ProductRecommendationNeed[];
  percent: number;
}>;

const DEFAULT_MAX_COUNT = 6;
const TARGET_DOSE_SWEET_SPOT_MIN = 0.7;
const TARGET_DOSE_SWEET_SPOT_MAX = 1.3;
const TARGET_DOSE_SOFT_MAX = 1.5;
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

function supplementProductNeeds(
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

function factAudienceMismatchReason(
  fact: ProductCandidateFact,
  clientSex?: ProductClientSex | null
) {
  const audience = fact.supplementAudience ?? "both";

  if (!clientSex || audience === "both" || audience === clientSex) {
    return null;
  }

  return audience === "female"
    ? "Supplement is for women only"
    : "Supplement is for men only";
}

function factAllowedForClient(
  fact: ProductCandidateFact,
  clientSex?: ProductClientSex | null
) {
  return !factAudienceMismatchReason(fact, clientSex);
}

function productFactAudienceMismatchReason(
  product: ProductCandidate,
  needs: readonly ProductRecommendationNeed[],
  clientSex?: ProductClientSex | null
) {
  if (!clientSex) {
    return null;
  }

  const mismatched = product.facts.find(
    (fact) =>
      factAudienceMismatchReason(fact, clientSex) &&
      needs.some((need) => matchesNeed(fact, need))
  );

  return mismatched ? factAudienceMismatchReason(mismatched, clientSex) : null;
}

function exclusionReason(product: ProductCandidate) {
  if (product.brandStatus === "ignored") {
    return "Brand is ignored";
  }

  if (product.status === "ignored") {
    return "Product is ignored";
  }

  if (product.labelStatus !== "parsed" || product.facts.length < 1) {
    return "Product label facts are missing";
  }

  if (product.validation && product.validation.status !== "pass") {
    return `Product validation needs review: ${product.validation.summary}`;
  }

  if (
    product.status !== "approved" ||
    product.brandStatus !== "approved"
  ) {
    return "Product is not approved yet";
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

function stackCoveragePercent(
  coverage: Map<string, number>,
  needs: readonly ProductRecommendationNeed[]
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
  bestRejectedByNeed: ReadonlyMap<string, ProductRecommendationExclusion>,
  availableCoverageByNeed: ReadonlyMap<string, number> = new Map()
) {
  return needs.map((need) => {
    const bestRejected = bestRejectedByNeed.get(need.id);
    const coveragePercent = safePercent((coverage.get(need.id) ?? 0) * 100);

    return {
      bestRejectedProductId: bestRejected?.productId ?? null,
      bestRejectedReason: bestRejected?.reason ??
        (coveragePercent <= 0
          ? (availableCoverageByNeed.get(need.id) ?? 0) > 0
            ? "Available in the catalogue but not selected by this stack preference"
            : "No approved product in the catalogue covers this need"
          : null),
      coveragePercent,
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

function bestAvailableCoverageByNeed(entries: readonly V2ProductEntry[]) {
  const coverageByNeed = new Map<string, number>();

  for (const entry of entries) {
    for (const need of entry.coverage.coveredNeeds) {
      coverageByNeed.set(
        need.id,
        Math.max(
          coverageByNeed.get(need.id) ?? 0,
          entry.coverage.coverageByNeed.get(need.id) ?? 0
        )
      );
    }
  }

  return coverageByNeed;
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
  stackContributionPercent: number,
  servingMultiplier = 1
) {
  const names = coveredNeeds.slice(0, 3).map((need) => need.displayName);
  const servingPrefix = servingMultiplier > 1
    ? `Use ${servingMultiplier} servings; `
    : "";
  const prefix = `${servingPrefix}Strong match`;
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

type V2Weights = Readonly<{
  confidence: number;
  cost: number;
  coverage: number;
  dose: number;
  extras: number;
  simplicity: number;
}>;

type V2NeedMetrics = Readonly<{
  comparableAmount: number | null;
  confidence: number;
  coverage: number;
  factsUsed: number;
  limitComparableAmount: number | null;
  matchScore: number;
  rawRatio: number | null;
}>;

type V2ProductEntry = Readonly<{
  confidence: number;
  coverage: CoverageResult;
  extrasCount: number;
  metricsByNeed: Map<string, V2NeedMetrics>;
  product: ProductCandidate;
  servingMultiplier: number;
}>;

type V2StackScore = Readonly<{
  achievedCoverage: Map<string, number>;
  comparableByNeed: Map<string, number>;
  componentScores: Record<string, number>;
  entries: V2ProductEntry[];
  matchedNeedCount: number;
  matchedNeedWeight: number;
  overagePenalty: number;
  rawRatioByNeed: Map<string, number>;
  safetyContextPenalty: number;
  score: number;
  servingCount: number;
  supplementProductCoveragePercent: number;
  totalPlanCoveragePercent: number;
}>;

type V2BeamState = Readonly<{
  comparableCounts: number[];
  comparableSums: number[];
  componentScores: Record<string, number>;
  confidenceCoverageSums: number[];
  coverageProductCounts: number[];
  coverageSums: number[];
  entries: V2ProductEntry[];
  extrasCount: number;
  indices: number[];
  limitMins: Array<number | null>;
  matchedNeedCount: number;
  matchedNeedWeight: number;
  overagePenalty: number;
  priceCount: number;
  priceSum: number;
  rawRatioCounts: number[];
  rawRatioSums: number[];
  safetyContextPenalty: number;
  safetyMask: number;
  score: number;
  servingCount: number;
  supplementProductCoveragePercent: number;
  totalPlanCoveragePercent: number;
}>;

type V2SafetyContext = Readonly<{
  bloodThinner: boolean;
  hasConditionContext: boolean;
  hasMedicationContext: boolean;
  pregnant: boolean;
}>;

const V2_ALGORITHM_VERSION = "v2-exact-shortlist" as const;
const V2_FULL_BEAM_ALGORITHM_VERSION = "v2-full-beam" as const;
export const ACTIVE_PRODUCT_RECOMMENDATION_ALGORITHM_VERSION =
  V2_FULL_BEAM_ALGORITHM_VERSION;
export const ACTIVE_PRODUCT_RECOMMENDATION_IMPLEMENTATION_VERSION =
  "stack-preference-2";
const V2_FULL_BEAM_WIDTH = 32;
const V2_SHORTLIST_LIMIT = 32;
const V2_PER_NEED_SHORTLIST = 4;
const V2_TOP_OVERALL_SHORTLIST = 16;
const V2_TOP_BROAD_SHORTLIST = 8;
const V2_TOP_AFFILIATE_SHORTLIST = 8;
const V2_MAX_SERVING_MULTIPLIER = 3;
const V2_SCORE_EPSILON = 0.000001;
const V2_DIVERSITY_SCORE_EPSILON = 0.005;
const V2_MATERIAL_COVERAGE_DELTA_PERCENT = 3;
const V2_BALANCED_MATERIAL_COVERAGE_DELTA_PERCENT = 15;
const V2_COMPACT_MIN_COVERAGE_RATIO = 0.65;
const V2_COMPACT_CRITICAL_WEIGHT_FLOOR = 9;
const V2_COMPACT_CRITICAL_NEED_LOSS_TOLERANCE = 0.35;
const V2_EXTRA_SERVING_SIMPLICITY_PENALTY = 0.02;
const V2_DUPLICATE_NEED_PRODUCT_PENALTY_WEIGHT = 0.24;
const V2_USEFUL_EXTRAS_LIMIT = 8;
const V2_EXCESSIVE_EXTRAS_PENALTY_WEIGHT = 0.4;
const V2_EXCESSIVE_EXTRAS_PENALTY_RANGE = 24;
const SAFETY_FLAG_PREGNANCY_CAUTION = 1;
const SAFETY_FLAG_MEDICATION_INTERACTION = 2;
const SAFETY_FLAG_BLEEDING_RISK = 4;
const SAFETY_FLAG_CONDITION_CAUTION = 8;
const V2_BASE_WEIGHTS: V2Weights = {
  confidence: 0.05,
  cost: 0.1,
  coverage: 0.45,
  dose: 0.2,
  extras: 0.05,
  simplicity: 0.15
};

export type ProductStackVariantConfig = Readonly<{
  maxProducts: number;
  stackPreference: ProductStackPreference;
  targetProducts: number;
}>;

export const PRODUCT_STACK_VARIANT_CONFIGS: readonly ProductStackVariantConfig[] = [
  {
    maxProducts: 3,
    stackPreference: "compact",
    targetProducts: 3
  },
  {
    maxProducts: 6,
    stackPreference: "balanced",
    targetProducts: 3
  }
];

export function normalizeProductStackPreference(
  value: unknown
): ProductStackPreference {
  return value === "compact" || value === "balanced"
    ? value
    : "balanced";
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function usefulExtrasScore(extrasCount: number) {
  return clamp01(Math.min(extrasCount, V2_USEFUL_EXTRAS_LIMIT) / V2_USEFUL_EXTRAS_LIMIT);
}

function excessiveExtrasPenalty(extrasCount: number) {
  return clamp01(
    Math.max(0, extrasCount - V2_USEFUL_EXTRAS_LIMIT) /
      V2_EXCESSIVE_EXTRAS_PENALTY_RANGE
  );
}

function roundScore(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(6));
}

function normalizedNeedWeightTotal(needs: readonly ProductRecommendationNeed[]) {
  return needs.reduce((total, need) => total + Math.max(0, need.weight), 0);
}

function contextArray(value: readonly string[] | undefined) {
  return (value ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function budgetAmountFromContext(
  input: ProductRecommendationInput
) {
  if (typeof input.budgetAmount === "number" && input.budgetAmount > 0) {
    return input.budgetAmount;
  }

  if (
    typeof input.clientContext?.budgetAmount === "number" &&
    input.clientContext.budgetAmount > 0
  ) {
    return input.clientContext.budgetAmount;
  }

  switch (input.clientContext?.budgetPreference) {
    case "low":
      return 1000;
    case "mid":
      return 2500;
    case "good":
      return 5000;
    default:
      return null;
  }
}

function normalizedV2Weights(
  context: ProductRecommendationClientContext | null | undefined
) {
  const rawWeights = { ...V2_BASE_WEIGHTS };
  const deltas: Record<string, number> = {};
  const addDelta = (key: keyof V2Weights, delta: number) => {
    rawWeights[key] += delta;
    deltas[key] = roundScore((deltas[key] ?? 0) + delta);
  };
  const feedbackTypes = new Set(contextArray(context?.planFeedbackTypes));
  const medicationTypes = contextArray(context?.medicationTypes);
  const conditions = contextArray(context?.conditions).filter((item) => item !== "none");
  const hasMedicationContext =
    context?.medications === "yes" || medicationTypes.length > 0;
  const hasSafetyContext =
    hasMedicationContext ||
    conditions.length > 0 ||
    context?.lifestage === "pregnant" ||
    feedbackTypes.has("safety_disclosure");

  if (context?.budgetPreference === "low") {
    addDelta("cost", 0.12);
    addDelta("simplicity", 0.03);
    addDelta("coverage", -0.06);
    addDelta("extras", -0.03);
  } else if (context?.budgetPreference === "mid") {
    addDelta("cost", 0.06);
    addDelta("coverage", -0.03);
  } else if (context?.budgetPreference === "high") {
    addDelta("coverage", 0.03);
    addDelta("cost", -0.03);
  }

  if (context?.pillLimit === "1-3") {
    addDelta("simplicity", 0.12);
    addDelta("coverage", -0.05);
    addDelta("dose", -0.02);
    addDelta("extras", -0.03);
  } else if (context?.pillLimit === "4-6") {
    addDelta("simplicity", 0.06);
    addDelta("coverage", -0.03);
  } else if (context?.pillLimit === "unlimited") {
    addDelta("coverage", 0.03);
    addDelta("simplicity", -0.03);
  }

  if (feedbackTypes.has("budget")) {
    addDelta("cost", 0.05);
  }

  if (feedbackTypes.has("capsule_limit")) {
    addDelta("simplicity", 0.08);
    addDelta("coverage", -0.03);
  }

  if (hasSafetyContext) {
    addDelta("dose", 0.05);
    addDelta("confidence", 0.05);
    addDelta("extras", -0.04);
    addDelta("coverage", -0.03);
  }

  for (const key of Object.keys(rawWeights) as Array<keyof V2Weights>) {
    rawWeights[key] = clamp(rawWeights[key], 0.05, 0.6);
  }

  const total = Object.values(rawWeights).reduce((sum, value) => sum + value, 0);
  const weights = Object.fromEntries(
    (Object.entries(rawWeights) as Array<[keyof V2Weights, number]>)
      .map(([key, value]) => [key, roundScore(value / total)])
  ) as unknown as V2Weights;

  return { deltas, weights };
}

function v2ContextSignals(input: ProductRecommendationInput) {
  const context = input.clientContext;

  return {
    budgetAmount: budgetAmountFromContext(input),
    budgetPreference: context?.budgetPreference ?? null,
    clientSex: input.clientSex ?? null,
    conditions: contextArray(context?.conditions),
    currentSupplements: context?.currentSupplements ?? null,
    guidanceAdjustmentCount: context?.guidanceAdjustmentCount ?? 0,
    lifestage: context?.lifestage ?? null,
    medicationTypes: contextArray(context?.medicationTypes),
    medications: context?.medications ?? null,
    pillLimit: context?.pillLimit ?? null,
    planFeedbackTypes: contextArray(context?.planFeedbackTypes),
    preferredForm: context?.preferredForm ?? null
  };
}

function factNeedMatchScore(
  fact: ProductCandidateFact,
  need: ProductRecommendationNeed
) {
  if (fact.itemType !== need.itemType && fact.itemType !== "nutrient") {
    return 0;
  }

  if (fact.itemType === "supplement" && fact.supplementId === need.sourceId) {
    return 1;
  }

  if (fact.itemType === "food" && fact.foodId === need.sourceId) {
    return 1;
  }

  const factName = fact.name || fact.normalizedName;
  const needName = need.displayName || need.normalizedName;
  const factDirectKey = normalizeProductFactKey(factName);
  const needDirectKey = normalizeProductFactKey(needName);

  if (
    factDirectKey &&
    (factDirectKey === need.normalizedName || factDirectKey === needDirectKey)
  ) {
    return 1;
  }

  const factAliases = matchKeyAliases(factName, fact.aliasKeys);
  const needAliases = matchKeyAliases(needName, need.aliasKeys);

  if ([...factAliases].some((alias) => needAliases.has(alias))) {
    return 0.9;
  }

  if (
    [...factAliases].some((leftKey) =>
      [...needAliases].some((rightKey) => fuzzyTokensMatch(leftKey, rightKey))
    )
  ) {
    return 0.7;
  }

  return 0;
}

function doseBandScore(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
    return 0.8;
  }

  if (ratio < TARGET_DOSE_SWEET_SPOT_MIN) {
    return 0.4;
  }

  if (ratio <= TARGET_DOSE_SWEET_SPOT_MAX) {
    return 1;
  }

  if (ratio <= TARGET_DOSE_SOFT_MAX) {
    return 0.8;
  }

  return 0;
}

function comparableLimitAmount(
  fact: ProductCandidateFact,
  need: ProductRecommendationNeed
) {
  return comparableLimitAmountForName(fact, need.normalizedName);
}

function comparableLimitAmountForName(
  fact: ProductCandidateFact,
  normalizedName: string
) {
  const maxAmount = positiveNumber(fact.maxAmount);
  const maxUnit = fact.maxUnit ?? null;
  const limitDose = parseDoseLimit(maxAmount, maxUnit);

  if (!limitDose) {
    return null;
  }

  const comparableLimit = comparableDoseAmount(limitDose, normalizedName);

  if (comparableLimit !== null) {
    return comparableLimit;
  }

  const factUnit = normalizeDoseUnit(fact.unit ?? "");
  const limitUnit = normalizeDoseUnit(maxUnit ?? "");

  return factUnit && limitUnit && factUnit === limitUnit
    ? maxAmount
    : null;
}

function factNeedMetric(
  fact: ProductCandidateFact,
  need: ProductRecommendationNeed,
  servingMultiplier = 1
): V2NeedMetrics | null {
  if (
    productFactLooksLikeConcentration(fact.name) ||
    productFactLooksLikeConcentration(fact.normalizedName)
  ) {
    return null;
  }

  const matchScore = factNeedMatchScore(fact, need);

  if (matchScore <= 0) {
    return null;
  }

  const confidence = confidenceMultiplier(fact.confidence);
  const baseComparableAmount = factComparableAmount(fact);
  const comparableAmount =
    baseComparableAmount !== null
      ? baseComparableAmount * Math.max(1, servingMultiplier)
      : null;
  const limitComparableAmount = comparableLimitAmount(fact, need);

  if (
    comparableAmount !== null &&
    need.targetComparableAmount !== null &&
    need.targetComparableAmount > 0
  ) {
    const rawRatio = comparableAmount / need.targetComparableAmount;
    const overageMultiplier = rawRatio > TARGET_DOSE_SOFT_MAX ? 0.6 : 1;
    const coverage = clamp01(
      Math.min(1, rawRatio) *
      matchScore *
      confidence *
      overageMultiplier
    );

    return {
      comparableAmount,
      confidence,
      coverage,
      factsUsed: 1,
      limitComparableAmount,
      matchScore,
      rawRatio,
      // Keep dose band in the metric through confidence/coverage users.
      // The stack scorer recomputes precision from the summed raw ratio.
    };
  }

  return {
    comparableAmount,
    confidence,
    coverage: 0.75 * matchScore * confidence,
    factsUsed: 1,
    limitComparableAmount,
    matchScore,
    rawRatio: null
  };
}

function combineNeedMetrics(metrics: V2NeedMetrics[]): V2NeedMetrics | null {
  if (metrics.length < 1) {
    return null;
  }

  const comparableAmounts = metrics
    .map((metric) => metric.comparableAmount)
    .filter((value): value is number => typeof value === "number");
  const rawRatios = metrics
    .map((metric) => metric.rawRatio)
    .filter((value): value is number => typeof value === "number");
  const limits = metrics
    .map((metric) => metric.limitComparableAmount)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const coverage = clamp01(
    metrics.reduce((total, metric) => total + metric.coverage, 0)
  );
  const confidence = metrics.reduce(
    (total, metric) => total + metric.confidence * metric.coverage,
    0
  ) / Math.max(coverage, 0.0001);
  const matchScore = metrics.reduce(
    (total, metric) => total + metric.matchScore * metric.coverage,
    0
  ) / Math.max(coverage, 0.0001);

  return {
    comparableAmount:
      comparableAmounts.length > 0
        ? comparableAmounts.reduce((total, value) => total + value, 0)
        : null,
    confidence: clamp01(confidence),
    coverage,
    factsUsed: metrics.reduce((total, metric) => total + metric.factsUsed, 0),
    limitComparableAmount: limits.length > 0 ? Math.min(...limits) : null,
    matchScore: clamp01(matchScore),
    rawRatio:
      rawRatios.length > 0
        ? rawRatios.reduce((total, value) => total + value, 0)
        : null
  };
}

function productCoverageV2(
  product: ProductCandidate,
  needs: ProductRecommendationNeed[],
  clientSex?: ProductClientSex | null,
  servingMultiplier = 1
): V2ProductEntry {
  const metricsByNeed = new Map<string, V2NeedMetrics>();
  const coverageByNeed = new Map<string, number>();
  const coveredNeeds: ProductRecommendationNeed[] = [];
  const facts = product.facts.filter((fact) => factAllowedForClient(fact, clientSex));
  const neededNames = new Set(
    needs.flatMap((need) =>
      [...matchKeyAliases(need.displayName || need.normalizedName, need.aliasKeys)]
    )
  );

  for (const need of needs) {
    const metrics = facts
      .map((fact) => factNeedMetric(fact, need, servingMultiplier))
      .filter((metric): metric is V2NeedMetrics => Boolean(metric));
    const combined = combineNeedMetrics(metrics);

    if (combined && combined.coverage > 0) {
      metricsByNeed.set(need.id, combined);
      coverageByNeed.set(need.id, combined.coverage);
      coveredNeeds.push(need);
    }
  }

  const totalWeight = normalizedNeedWeightTotal(needs);
  const weightedCoverage = coveredNeeds.reduce(
    (total, need) => total + need.weight * (coverageByNeed.get(need.id) ?? 0),
    0
  );
  const extrasCount = facts.filter((fact) =>
    ![...matchKeyAliases(fact.name || fact.normalizedName, fact.aliasKeys)]
      .some((alias) => neededNames.has(alias))
  ).length;
  const confidenceNumerator = [...metricsByNeed.values()].reduce(
    (total, metric) => total + metric.confidence * metric.coverage,
    0
  );
  const confidenceDenominator = [...metricsByNeed.values()].reduce(
    (total, metric) => total + metric.coverage,
    0
  );

  return {
    confidence: confidenceDenominator > 0
      ? clamp01(confidenceNumerator / confidenceDenominator)
      : 0,
    coverage: {
      coverageByNeed,
      coveredNeeds,
      percent: totalWeight > 0 ? (weightedCoverage / totalWeight) * 100 : 0
    },
    extrasCount,
    metricsByNeed,
    product,
    servingMultiplier
  };
}

function productServingMultiplierAllowed(
  product: ProductCandidate,
  servingMultiplier: number
) {
  if (servingMultiplier <= 1) {
    return true;
  }

  for (const fact of product.facts) {
    const comparableAmount = factComparableAmount(fact);
    const limitComparableAmount = comparableLimitAmountForName(
      fact,
      fact.normalizedName || normalizeProductFactKey(fact.name)
    );

    if (comparableAmount !== null && limitComparableAmount === null) {
      return false;
    }

    if (
      comparableAmount !== null &&
      limitComparableAmount !== null &&
      comparableAmount * servingMultiplier > limitComparableAmount + V2_SCORE_EPSILON
    ) {
      return false;
    }
  }

  return true;
}

function productServingMultipliers(product: ProductCandidate) {
  return Array.from({ length: V2_MAX_SERVING_MULTIPLIER }, (_, index) => index + 1)
    .filter((servingMultiplier) =>
      productServingMultiplierAllowed(product, servingMultiplier)
    );
}

function compareProductEntries(
  first: V2ProductEntry,
  second: V2ProductEntry
) {
  const coverageDelta = second.coverage.percent - first.coverage.percent;

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  const firstAffiliate = first.product.activeAffiliateUrl ? 1 : 0;
  const secondAffiliate = second.product.activeAffiliateUrl ? 1 : 0;

  if (firstAffiliate !== secondAffiliate) {
    return secondAffiliate - firstAffiliate;
  }

  const priceDelta =
    (first.product.priceAmount ?? Number.MAX_SAFE_INTEGER) -
    (second.product.priceAmount ?? Number.MAX_SAFE_INTEGER);

  if (priceDelta !== 0) {
    return priceDelta;
  }

  if (first.servingMultiplier !== second.servingMultiplier) {
    return first.servingMultiplier - second.servingMultiplier;
  }

  const titleDelta = first.product.title.localeCompare(second.product.title);

  return titleDelta || first.product.id.localeCompare(second.product.id);
}

function productVariantTitleKey(product: ProductCandidate) {
  let key = normalizeProductKey(product.title);

  key = key
    .replace(/_(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)_packs?$/g, "")
    .replace(/_packs?_of_(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/g, "")
    .replace(/_(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)_bottles?$/g, "")
    .replace(/_bundle$/g, "")
    .replace(/_set$/g, "");

  return key || normalizeProductKey(product.title);
}

function productFactSignature(product: ProductCandidate) {
  return product.facts
    .filter((fact) => fact.itemType === "supplement" || fact.itemType === "nutrient")
    .map((fact) => [
      fact.supplementId ?? "",
      fact.normalizedName || normalizeProductFactKey(fact.name),
      String(fact.amount ?? ""),
      normalizeDoseUnit(fact.unit ?? "") ?? fact.unit ?? ""
    ].join(":"))
    .sort()
    .join("|");
}

function productVariantKey(product: ProductCandidate) {
  return [
    normalizeProductKey(product.brandName ?? ""),
    productVariantTitleKey(product),
    productFactSignature(product)
  ].join("|");
}

function shortlistEntries(
  entries: readonly V2ProductEntry[],
  needs: readonly ProductRecommendationNeed[]
) {
  const selected = new Map<string, { entry: V2ProductEntry; priority: number }>();
  const addEntry = (entry: V2ProductEntry, priority: number) => {
    const current = selected.get(entry.product.id);

    if (
      !current ||
      priority < current.priority ||
      (
        priority === current.priority &&
        compareProductEntries(entry, current.entry) < 0
      )
    ) {
      selected.set(entry.product.id, { entry, priority });
    }
  };
  const needsByPriority = [...needs]
    .sort((first, second) => second.weight - first.weight);

  for (const [needIndex, need] of needsByPriority.entries()) {
    [...entries]
      .filter((entry) => (entry.coverage.coverageByNeed.get(need.id) ?? 0) > 0)
      .sort((first, second) => {
        const needDelta =
          (second.coverage.coverageByNeed.get(need.id) ?? 0) -
          (first.coverage.coverageByNeed.get(need.id) ?? 0);

        return Math.abs(needDelta) > V2_SCORE_EPSILON
          ? needDelta
          : compareProductEntries(first, second);
      })
      .slice(0, V2_PER_NEED_SHORTLIST)
      .forEach((entry) => addEntry(entry, needIndex));
  }

  [...entries]
    .sort(compareProductEntries)
    .slice(0, V2_TOP_OVERALL_SHORTLIST)
    .forEach((entry, index) => addEntry(entry, 100 + index));

  [...entries]
    .filter((entry) =>
      entry.product.productKind === "multi" ||
      entry.product.facts.length >= 6 ||
      entry.coverage.coveredNeeds.length >= 3
    )
    .sort(compareProductEntries)
    .slice(0, V2_TOP_BROAD_SHORTLIST)
    .forEach((entry, index) => addEntry(entry, 200 + index));

  [...entries]
    .filter((entry) => Boolean(entry.product.activeAffiliateUrl))
    .sort(compareProductEntries)
    .slice(0, V2_TOP_AFFILIATE_SHORTLIST)
    .forEach((entry, index) => addEntry(entry, 300 + index));

  return [...selected.values()]
    .sort((first, second) =>
      first.priority - second.priority ||
      compareProductEntries(first.entry, second.entry)
    )
    .map((item) => item.entry)
    .slice(0, V2_SHORTLIST_LIMIT);
}

function productSafetyMask(entry: V2ProductEntry) {
  let mask = 0;

  for (const fact of entry.product.facts) {
    for (const flag of fact.safetyFlags ?? []) {
      switch (flag) {
        case "pregnancy_caution":
          mask |= SAFETY_FLAG_PREGNANCY_CAUTION;
          break;
        case "medication_interaction":
          mask |= SAFETY_FLAG_MEDICATION_INTERACTION;
          break;
        case "bleeding_risk":
          mask |= SAFETY_FLAG_BLEEDING_RISK;
          break;
        case "condition_caution":
          mask |= SAFETY_FLAG_CONDITION_CAUTION;
          break;
        default:
          break;
      }
    }
  }

  return mask;
}

function safetyContextFromClientContext(
  context: ProductRecommendationClientContext | null | undefined
): V2SafetyContext {
  const medicationTypes = new Set(contextArray(context?.medicationTypes));
  const conditions = contextArray(context?.conditions).filter((item) => item !== "none");

  return {
    bloodThinner: medicationTypes.has("blood-thinner"),
    hasConditionContext: conditions.length > 0,
    hasMedicationContext: context?.medications === "yes" || medicationTypes.size > 0,
    pregnant: context?.lifestage === "pregnant"
  };
}

function safetyContextPenaltyForMask(
  safetyMask: number,
  context: V2SafetyContext
) {
  let penalty = 0;

  if (context.pregnant && safetyMask & SAFETY_FLAG_PREGNANCY_CAUTION) {
    penalty += 1;
  }

  if (
    context.hasMedicationContext &&
    safetyMask & SAFETY_FLAG_MEDICATION_INTERACTION
  ) {
    penalty += 0.8;
  }

  if (
    context.bloodThinner &&
    (
      safetyMask & SAFETY_FLAG_BLEEDING_RISK ||
      safetyMask & SAFETY_FLAG_MEDICATION_INTERACTION
    )
  ) {
    penalty += 1;
  }

  if (context.hasConditionContext && safetyMask & SAFETY_FLAG_CONDITION_CAUTION) {
    penalty += 0.5;
  }

  return clamp01(penalty);
}

function totalStackPrice(entries: readonly V2ProductEntry[]) {
  const prices = entries
    .map((entry) => entry.product.priceAmount)
    .filter((value): value is number => typeof value === "number" && value > 0);

  return prices.length > 0
    ? prices.reduce((total, value) => total + value, 0)
    : null;
}

function stackContributionMaps(
  entries: readonly V2ProductEntry[],
  needs: readonly ProductRecommendationNeed[]
) {
  const achievedCoverage = new Map<string, number>();
  const comparableByNeed = new Map<string, number>();
  const rawRatioByNeed = new Map<string, number>();
  const limitsByNeed = new Map<string, number>();

  for (const need of needs) {
    let coverageSum = 0;
    let comparableSum = 0;
    let comparableSeen = false;
    let rawRatioSum = 0;
    let rawRatioSeen = false;
    let limit: number | null = null;

    for (const entry of entries) {
      const metrics = entry.metricsByNeed.get(need.id);

      if (!metrics) {
        continue;
      }

      coverageSum += metrics.coverage;

      if (metrics.comparableAmount !== null) {
        comparableSeen = true;
        comparableSum += metrics.comparableAmount;
      }

      if (metrics.rawRatio !== null) {
        rawRatioSeen = true;
        rawRatioSum += metrics.rawRatio;
      }

      if (metrics.limitComparableAmount !== null) {
        limit =
          limit === null
            ? metrics.limitComparableAmount
            : Math.min(limit, metrics.limitComparableAmount);
      }
    }

    achievedCoverage.set(need.id, clamp01(coverageSum));

    if (comparableSeen) {
      comparableByNeed.set(need.id, comparableSum);
    }

    if (rawRatioSeen) {
      rawRatioByNeed.set(need.id, rawRatioSum);
    }

    if (limit !== null) {
      limitsByNeed.set(need.id, limit);
    }
  }

  return {
    achievedCoverage,
    comparableByNeed,
    limitsByNeed,
    rawRatioByNeed
  };
}

function stackCoverageForNeeds(
  entries: readonly V2ProductEntry[],
  needs: readonly ProductRecommendationNeed[]
) {
  return stackContributionMaps(entries, needs).achievedCoverage;
}

function stackFingerprint(stack: V2StackScore) {
  return stack.entries
    .map((entry) => `${entry.product.id}:${entry.servingMultiplier}`)
    .sort()
    .join("|");
}

function stackCoverageFingerprint(
  stack: V2StackScore,
  needs: readonly ProductRecommendationNeed[]
) {
  return needs
    .map((need) => {
      const achieved = stack.achievedCoverage.get(need.id) ?? 0;

      return `${need.id}:${Math.round(achieved * 1000)}`;
    })
    .join("|");
}

function uniqueStackScores(scores: readonly V2StackScore[]) {
  const seen = new Set<string>();
  const unique: V2StackScore[] = [];

  for (const score of scores) {
    const key = stackFingerprint(score);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(score);
  }

  return unique;
}

function compareStackScores(first: V2StackScore, second: V2StackScore) {
  const coverageDelta =
    second.supplementProductCoveragePercent - first.supplementProductCoveragePercent;

  if (Math.abs(coverageDelta) >= V2_MATERIAL_COVERAGE_DELTA_PERCENT) {
    return coverageDelta;
  }

  const matchedWeightDelta = second.matchedNeedWeight - first.matchedNeedWeight;

  if (Math.abs(matchedWeightDelta) > V2_SCORE_EPSILON) {
    return matchedWeightDelta;
  }

  const matchedCountDelta = second.matchedNeedCount - first.matchedNeedCount;

  if (matchedCountDelta !== 0) {
    return matchedCountDelta;
  }

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  const scoreDelta = second.score - first.score;

  if (Math.abs(scoreDelta) > V2_DIVERSITY_SCORE_EPSILON) {
    return scoreDelta;
  }

  const firstAffiliate = first.entries.some((entry) => entry.product.activeAffiliateUrl) ? 1 : 0;
  const secondAffiliate = second.entries.some((entry) => entry.product.activeAffiliateUrl) ? 1 : 0;

  if (firstAffiliate !== secondAffiliate) {
    return secondAffiliate - firstAffiliate;
  }

  if (first.entries.length !== second.entries.length) {
    return first.entries.length - second.entries.length;
  }

  const firstPrice = totalStackPrice(first.entries) ?? Number.MAX_SAFE_INTEGER;
  const secondPrice = totalStackPrice(second.entries) ?? Number.MAX_SAFE_INTEGER;

  if (firstPrice !== secondPrice) {
    return firstPrice - secondPrice;
  }

  return first.entries.map((entry) => entry.product.id).join("|")
    .localeCompare(second.entries.map((entry) => entry.product.id).join("|"));
}

function compareBalancedStackScores(first: V2StackScore, second: V2StackScore) {
  const coverageDelta =
    second.supplementProductCoveragePercent - first.supplementProductCoveragePercent;

  if (Math.abs(coverageDelta) >= V2_BALANCED_MATERIAL_COVERAGE_DELTA_PERCENT) {
    return coverageDelta;
  }

  const matchedWeightDelta = second.matchedNeedWeight - first.matchedNeedWeight;

  if (Math.abs(matchedWeightDelta) > V2_SCORE_EPSILON) {
    return matchedWeightDelta;
  }

  const matchedCountDelta = second.matchedNeedCount - first.matchedNeedCount;

  if (matchedCountDelta !== 0) {
    return matchedCountDelta;
  }

  const scoreDelta = second.score - first.score;

  if (Math.abs(scoreDelta) > V2_DIVERSITY_SCORE_EPSILON) {
    return scoreDelta;
  }

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  return compareStackScores(first, second);
}

function compareCoverageStackScores(
  first: V2StackScore,
  second: V2StackScore
) {
  const coverageDelta =
    second.supplementProductCoveragePercent - first.supplementProductCoveragePercent;

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  return compareStackScores(first, second);
}

function preservesCriticalNeedsForCompactMode(
  candidate: V2StackScore,
  bestCoverageStack: V2StackScore,
  needs: readonly ProductRecommendationNeed[]
) {
  const maxWeight = Math.max(0, ...needs.map((need) => need.weight));
  const criticalWeight = Math.max(
    V2_COMPACT_CRITICAL_WEIGHT_FLOOR,
    maxWeight * 0.9
  );

  return needs
    .filter((need) => need.weight >= criticalWeight)
    .every((need) => {
      const bestCoverage = bestCoverageStack.achievedCoverage.get(need.id) ?? 0;

      if (bestCoverage <= V2_SCORE_EPSILON) {
        return true;
      }

      const candidateCoverage = candidate.achievedCoverage.get(need.id) ?? 0;

      return (
        bestCoverage - candidateCoverage <=
        V2_COMPACT_CRITICAL_NEED_LOSS_TOLERANCE
      );
    });
}

function compareCompactStackScores(
  first: V2StackScore,
  second: V2StackScore
) {
  if (first.entries.length !== second.entries.length) {
    return first.entries.length - second.entries.length;
  }

  if (first.servingCount !== second.servingCount) {
    return first.servingCount - second.servingCount;
  }

  return compareStackScores(first, second);
}

function selectStackForPreference(
  scores: readonly V2StackScore[],
  needs: readonly ProductRecommendationNeed[],
  stackPreference: ProductStackPreference
) {
  const uniqueScores = uniqueStackScores(scores);

  if (uniqueScores.length < 1) {
    return null;
  }

  if (stackPreference !== "compact") {
    return [...uniqueScores].sort(compareBalancedStackScores)[0] ?? null;
  }

  const bestCoverageStack =
    [...uniqueScores].sort(compareCoverageStackScores)[0] ?? uniqueScores[0]!;
  const minimumCoverage =
    bestCoverageStack.supplementProductCoveragePercent *
    V2_COMPACT_MIN_COVERAGE_RATIO;
  const compactCandidates = uniqueScores.filter(
    (score) =>
      score.supplementProductCoveragePercent >= minimumCoverage &&
      preservesCriticalNeedsForCompactMode(score, bestCoverageStack, needs)
  );

  return [...(compactCandidates.length > 0 ? compactCandidates : uniqueScores)]
    .sort(compareCompactStackScores)[0] ?? null;
}

function distinctAlternativeStacks(
  scores: readonly V2StackScore[],
  bestStack: V2StackScore | null,
  needs: readonly ProductRecommendationNeed[],
  limit = 3
) {
  const bestKey = bestStack ? stackFingerprint(bestStack) : null;
  const selected: V2StackScore[] = [];
  const selectedKeys = new Set<string>();
  const selectedCoverageKeys = new Set<string>();
  const addStack = (stack: V2StackScore, requireCoverageDifference: boolean) => {
    if (selected.length >= limit) {
      return;
    }

    const key = stackFingerprint(stack);

    if (key === bestKey || selectedKeys.has(key)) {
      return;
    }

    const coverageKey = stackCoverageFingerprint(stack, needs);

    if (
      requireCoverageDifference &&
      (
        (bestStack && coverageKey === stackCoverageFingerprint(bestStack, needs)) ||
        selectedCoverageKeys.has(coverageKey)
      )
    ) {
      return;
    }

    selectedKeys.add(key);
    selectedCoverageKeys.add(coverageKey);
    selected.push(stack);
  };
  const uniqueScores = uniqueStackScores(scores).sort(compareStackScores);

  for (const stack of uniqueScores) {
    addStack(stack, true);
  }

  for (const stack of uniqueScores) {
    addStack(stack, false);
  }

  return selected;
}

function compareBeamStates(first: V2BeamState, second: V2BeamState) {
  const coverageDelta =
    second.supplementProductCoveragePercent - first.supplementProductCoveragePercent;

  if (Math.abs(coverageDelta) >= V2_MATERIAL_COVERAGE_DELTA_PERCENT) {
    return coverageDelta;
  }

  const matchedWeightDelta = second.matchedNeedWeight - first.matchedNeedWeight;

  if (Math.abs(matchedWeightDelta) > V2_SCORE_EPSILON) {
    return matchedWeightDelta;
  }

  const matchedCountDelta = second.matchedNeedCount - first.matchedNeedCount;

  if (matchedCountDelta !== 0) {
    return matchedCountDelta;
  }

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  const scoreDelta = second.score - first.score;

  if (Math.abs(scoreDelta) > V2_DIVERSITY_SCORE_EPSILON) {
    return scoreDelta;
  }

  const firstAffiliate = first.entries.some((entry) => entry.product.activeAffiliateUrl) ? 1 : 0;
  const secondAffiliate = second.entries.some((entry) => entry.product.activeAffiliateUrl) ? 1 : 0;

  if (firstAffiliate !== secondAffiliate) {
    return secondAffiliate - firstAffiliate;
  }

  if (first.entries.length !== second.entries.length) {
    return first.entries.length - second.entries.length;
  }

  const firstPrice = first.priceCount > 0 ? first.priceSum : Number.MAX_SAFE_INTEGER;
  const secondPrice = second.priceCount > 0 ? second.priceSum : Number.MAX_SAFE_INTEGER;

  if (firstPrice !== secondPrice) {
    return firstPrice - secondPrice;
  }

  return first.entries.map((entry) => entry.product.id).join("|")
    .localeCompare(second.entries.map((entry) => entry.product.id).join("|"));
}

function beamStateKey(indices: readonly number[]) {
  return indices.join("|");
}

function selectDiverseBeamStates(
  states: readonly V2BeamState[],
  beamWidth: number,
  scoringNeeds: readonly ProductRecommendationNeed[]
) {
  const sorted = [...states].sort(compareBeamStates);
  const selected: V2BeamState[] = [];
  const selectedKeys = new Set<string>();
  const addState = (state: V2BeamState | undefined) => {
    if (!state || selected.length >= beamWidth) {
      return;
    }

    const key = beamStateKey(state.indices);

    if (selectedKeys.has(key)) {
      return;
    }

    selectedKeys.add(key);
    selected.push(state);
  };
  const utilitySlots = Math.max(
    Math.ceil(beamWidth / 2),
    beamWidth - scoringNeeds.length
  );

  for (const state of sorted.slice(0, utilitySlots)) {
    addState(state);
  }

  for (const [needIndex] of scoringNeeds.entries()) {
    const needLeader = sorted
      .filter((state) => (state.coverageSums[needIndex] ?? 0) > 0)
      .sort((first, second) =>
        clamp01(second.coverageSums[needIndex] ?? 0) -
          clamp01(first.coverageSums[needIndex] ?? 0) ||
        compareBeamStates(first, second)
      )[0];

    addState(needLeader);
  }

  for (const state of sorted) {
    addState(state);
  }

  return selected;
}

function selectFinalBeamStates(
  states: readonly V2BeamState[],
  statesBySize: ReadonlyMap<number, readonly V2BeamState[]>,
  keepTop: number,
  scoringNeeds: readonly ProductRecommendationNeed[]
) {
  const selected: V2BeamState[] = [];
  const selectedKeys = new Set<string>();
  const addState = (state: V2BeamState | undefined) => {
    if (!state || selected.length >= keepTop) {
      return;
    }

    const key = beamStateKey(state.indices);

    if (selectedKeys.has(key)) {
      return;
    }

    selectedKeys.add(key);
    selected.push(state);
  };
  const sizeLeaders = [...statesBySize.entries()]
    .sort(([firstSize], [secondSize]) => firstSize - secondSize)
    .flatMap(([, sizeStates]) =>
      [...sizeStates].sort(compareBeamStates).slice(0, 4)
    );
  const utilityLeaders = selectDiverseBeamStates(
    states,
    keepTop,
    scoringNeeds
  );
  const sortedStates = [...states].sort(compareBeamStates);

  for (const state of sizeLeaders) {
    addState(state);
  }

  for (const state of utilityLeaders) {
    addState(state);
  }

  for (const state of sortedStates) {
    addState(state);
  }

  return selected.sort(compareBeamStates);
}

function beamStateToStackScore(
  state: V2BeamState,
  scoringNeeds: readonly ProductRecommendationNeed[]
): V2StackScore {
  const achievedCoverage = new Map<string, number>();
  const comparableByNeed = new Map<string, number>();
  const rawRatioByNeed = new Map<string, number>();

  for (const [needIndex, need] of scoringNeeds.entries()) {
    achievedCoverage.set(need.id, clamp01(state.coverageSums[needIndex] ?? 0));

    if ((state.comparableCounts[needIndex] ?? 0) > 0) {
      comparableByNeed.set(need.id, state.comparableSums[needIndex] ?? 0);
    }

    if ((state.rawRatioCounts[needIndex] ?? 0) > 0) {
      rawRatioByNeed.set(need.id, state.rawRatioSums[needIndex] ?? 0);
    }
  }

  return {
    achievedCoverage,
    comparableByNeed,
    componentScores: state.componentScores,
    entries: [...state.entries],
    matchedNeedCount: state.matchedNeedCount,
    matchedNeedWeight: state.matchedNeedWeight,
    overagePenalty: state.overagePenalty,
    rawRatioByNeed,
    safetyContextPenalty: state.safetyContextPenalty,
    score: state.score,
    servingCount: state.servingCount,
    supplementProductCoveragePercent: state.supplementProductCoveragePercent,
    totalPlanCoveragePercent: state.totalPlanCoveragePercent
  };
}

function beamSearchStackScores(
  entries: readonly V2ProductEntry[],
  input: ProductRecommendationInput,
  scoringNeeds: readonly ProductRecommendationNeed[],
  allNeeds: readonly ProductRecommendationNeed[],
  weights: V2Weights,
  maxProducts: number,
  beamWidth = V2_FULL_BEAM_WIDTH,
  keepTop = 4
) {
  const orderedEntries = [...entries].sort(compareProductEntries);
  const metricsMatrix = orderedEntries.map((entry) =>
    scoringNeeds.map((need) => entry.metricsByNeed.get(need.id) ?? null)
  );
  const entrySafetyMasks = orderedEntries.map(productSafetyMask);
  const safetyContext = safetyContextFromClientContext(input.clientContext);
  const totalWeight = normalizedNeedWeightTotal(scoringNeeds);
  const productNeeds = supplementProductNeeds(allNeeds);
  const productNeedsWeight = normalizedNeedWeightTotal(productNeeds);
  const allNeedsWeight = normalizedNeedWeightTotal(allNeeds);
  const budgetAmount = budgetAmountFromContext(input);
  const seen = new Set<string>();
  const topStates: V2BeamState[] = [];
  const topStatesBySize = new Map<number, V2BeamState[]>();
  let evaluatedStackCount = 0;
  const topStateLimit = Math.max(keepTop, beamWidth);
  const keepState = (state: V2BeamState) => {
    topStates.push(state);
    topStates.sort(compareBeamStates);

    if (topStates.length > topStateLimit) {
      topStates.length = topStateLimit;
    }

    const size = state.entries.length;
    const sizeStates = topStatesBySize.get(size) ?? [];
    sizeStates.push(state);
    sizeStates.sort(compareBeamStates);

    if (sizeStates.length > Math.max(8, Math.ceil(beamWidth / 2))) {
      sizeStates.length = Math.max(8, Math.ceil(beamWidth / 2));
    }

    topStatesBySize.set(size, sizeStates);
  };
  const buildState = (
    previous: V2BeamState | null,
    entryIndex: number
  ): V2BeamState | null => {
    const entry = orderedEntries[entryIndex]!;

    if (previous?.entries.some((item) => item.product.id === entry.product.id)) {
      return null;
    }

    if (
      previous?.entries.some((item) =>
        productVariantKey(item.product) === productVariantKey(entry.product)
      )
    ) {
      return null;
    }

    if (previous) {
      const coveredNeedIndexes = metricsMatrix[entryIndex]!
        .map((metric, needIndex) =>
          metric && metric.coverage > V2_SCORE_EPSILON ? needIndex : null
        )
        .filter((needIndex): needIndex is number => needIndex !== null);

      if (
        coveredNeedIndexes.length > 0 &&
        coveredNeedIndexes.every((needIndex) =>
          (previous.coverageProductCounts[needIndex] ?? 0) > 0
        )
      ) {
        return null;
      }

      if (
        coveredNeedIndexes.length > 0 &&
        coveredNeedIndexes.every((needIndex) =>
          (previous.coverageSums[needIndex] ?? 0) > V2_SCORE_EPSILON
        ) &&
        coveredNeedIndexes.every((needIndex) =>
          (previous.coverageSums[needIndex] ?? 0) >= TARGET_DOSE_SWEET_SPOT_MIN ||
          (metricsMatrix[entryIndex]![needIndex]?.coverage ?? 0) >=
            TARGET_DOSE_SWEET_SPOT_MIN
        )
      ) {
        return null;
      }
    }

    const nextIndices = previous
      ? [...previous.indices, entryIndex].sort((first, second) => first - second)
      : [entryIndex];
    const key = beamStateKey(nextIndices);

    if (seen.has(key)) {
      return null;
    }

    seen.add(key);
    evaluatedStackCount += 1;

    const coverageSums = previous
      ? [...previous.coverageSums]
      : scoringNeeds.map(() => 0);
    const coverageProductCounts = previous
      ? [...previous.coverageProductCounts]
      : scoringNeeds.map(() => 0);
    const comparableSums = previous
      ? [...previous.comparableSums]
      : scoringNeeds.map(() => 0);
    const comparableCounts = previous
      ? [...previous.comparableCounts]
      : scoringNeeds.map(() => 0);
    const rawRatioSums = previous
      ? [...previous.rawRatioSums]
      : scoringNeeds.map(() => 0);
    const rawRatioCounts = previous
      ? [...previous.rawRatioCounts]
      : scoringNeeds.map(() => 0);
    const confidenceCoverageSums = previous
      ? [...previous.confidenceCoverageSums]
      : scoringNeeds.map(() => 0);
    const limitMins = previous
      ? [...previous.limitMins]
      : scoringNeeds.map((): number | null => null);
    let extrasCount = previous?.extrasCount ?? 0;
    let priceCount = previous?.priceCount ?? 0;
    let priceSum = previous?.priceSum ?? 0;
    let servingCount = previous?.servingCount ?? 0;
    const safetyMask = (previous?.safetyMask ?? 0) | (entrySafetyMasks[entryIndex] ?? 0);

    extrasCount += entry.extrasCount;
    servingCount += entry.servingMultiplier;

    if (typeof entry.product.priceAmount === "number" && entry.product.priceAmount > 0) {
      priceCount += 1;
      priceSum += entry.product.priceAmount;
    }

    for (const [needIndex, metric] of metricsMatrix[entryIndex]!.entries()) {
      if (!metric) {
        continue;
      }

      coverageSums[needIndex] += metric.coverage;
      if (metric.coverage > V2_SCORE_EPSILON) {
        coverageProductCounts[needIndex] += 1;
      }
      confidenceCoverageSums[needIndex] += metric.confidence * metric.coverage;

      if (metric.comparableAmount !== null) {
        comparableCounts[needIndex] += 1;
        comparableSums[needIndex] += metric.comparableAmount;
      }

      if (metric.rawRatio !== null) {
        rawRatioCounts[needIndex] += 1;
        rawRatioSums[needIndex] += metric.rawRatio;
      }

      if (metric.limitComparableAmount !== null) {
        const currentLimit = limitMins[needIndex];
        limitMins[needIndex] = currentLimit === null
          ? metric.limitComparableAmount
          : Math.min(currentLimit, metric.limitComparableAmount);
      }
    }

    const selectedEntries = nextIndices.map((index) => orderedEntries[index]!);
    let coverageNumerator = 0;
    let doseNumerator = 0;
    let doseDenominator = 0;
    let confidenceNumerator = 0;
    let confidenceDenominator = 0;
    let overlapNumerator = 0;
    let overageNumerator = 0;
    let duplicateNeedProductNumerator = 0;
    let matchedNeedCount = 0;
    let matchedNeedWeight = 0;

    for (const [needIndex, need] of scoringNeeds.entries()) {
      const limit = limitMins[needIndex];
      const comparableSeen = (comparableCounts[needIndex] ?? 0) > 0;
      const comparableAmount = comparableSums[needIndex] ?? 0;

      if (limit !== null && comparableSeen && comparableAmount > limit) {
        return null;
      }

      const coverageSum = coverageSums[needIndex] ?? 0;
      const achieved = clamp01(coverageSum);
      const rawRatio = (rawRatioCounts[needIndex] ?? 0) > 0
        ? rawRatioSums[needIndex] ?? 0
        : null;

      coverageNumerator += achieved * need.weight;

      if (achieved > 0) {
        matchedNeedCount += 1;
        matchedNeedWeight += need.weight;

        const doseBand = doseBandScore(rawRatio);
        const confidence = coverageSum > 0
          ? (confidenceCoverageSums[needIndex] ?? 0) / coverageSum
          : 0;

        doseNumerator += need.weight * achieved * doseBand;
        doseDenominator += need.weight * achieved;
        confidenceNumerator += need.weight * achieved * confidence;
        confidenceDenominator += need.weight * achieved;
      }

      overlapNumerator += Math.max(0, coverageSum - achieved) * need.weight;

      if (rawRatio !== null && rawRatio > TARGET_DOSE_SOFT_MAX) {
        overageNumerator += Math.min(1, rawRatio - TARGET_DOSE_SOFT_MAX) * need.weight;
      }

      const coverageProductCount = coverageProductCounts[needIndex] ?? 0;
      if (coverageProductCount > 1) {
        duplicateNeedProductNumerator += (coverageProductCount - 1) * need.weight;
      }
    }

    const coverage = totalWeight > 0 ? coverageNumerator / totalWeight : 0;
    const dosePrecision = doseDenominator > 0 ? doseNumerator / doseDenominator : 0;
    const confidence = confidenceDenominator > 0
      ? confidenceNumerator / confidenceDenominator
      : 0;
    const extraServings = Math.max(0, servingCount - selectedEntries.length);
    const simplicity = clamp01(
      1 -
        0.12 * Math.max(0, selectedEntries.length - 3) -
        V2_EXTRA_SERVING_SIMPLICITY_PENALTY * extraServings
    );
    const price = priceCount > 0 ? priceSum : null;
    const affordability =
      budgetAmount && price
        ? clamp01(1 - Math.max(0, price - budgetAmount) / budgetAmount)
        : 0.5;
    const costEfficiency = clamp01(coverage * 0.7 + affordability * 0.3);
    const extras = usefulExtrasScore(extrasCount);
    const overlapPenalty = totalWeight > 0 ? overlapNumerator / totalWeight : 0;
    const overagePenalty = totalWeight > 0 ? overageNumerator / totalWeight : 0;
    const extraFactPenalty = excessiveExtrasPenalty(extrasCount);
    const duplicateNeedProductPenalty = totalWeight > 0
      ? duplicateNeedProductNumerator / totalWeight
      : 0;
    const safetyContextPenalty = safetyContextPenaltyForMask(
      safetyMask,
      safetyContext
    );
    const penalty = clamp01(
      0.3 * overlapPenalty +
      V2_DUPLICATE_NEED_PRODUCT_PENALTY_WEIGHT * duplicateNeedProductPenalty +
      0.4 * overagePenalty +
      V2_EXCESSIVE_EXTRAS_PENALTY_WEIGHT * extraFactPenalty +
      safetyContextPenalty
    );
    const componentScores = {
      confidence: roundScore(confidence),
      cost: roundScore(costEfficiency),
      coverage: roundScore(coverage),
      dose: roundScore(dosePrecision),
      duplicateNeedProductPenalty: roundScore(duplicateNeedProductPenalty),
      extraFactPenalty: roundScore(extraFactPenalty),
      extras: roundScore(extras),
      overagePenalty: roundScore(overagePenalty),
      penalty: roundScore(penalty),
      safetyContextPenalty: roundScore(safetyContextPenalty),
      simplicity: roundScore(simplicity)
    };
    const score =
      weights.coverage * coverage +
      weights.dose * dosePrecision +
      weights.simplicity * simplicity +
      weights.cost * costEfficiency +
      weights.extras * extras +
      weights.confidence * confidence -
      penalty;
    const supplementProductCoveragePercent = safePercent(
      productNeedsWeight > 0 ? (coverageNumerator / productNeedsWeight) * 100 : 0
    );
    const totalPlanCoveragePercent = safePercent(
      allNeedsWeight > 0 ? (coverageNumerator / allNeedsWeight) * 100 : 0
    );

    return {
      comparableCounts,
      comparableSums,
      componentScores,
      confidenceCoverageSums,
      coverageProductCounts,
      coverageSums,
      entries: selectedEntries,
      extrasCount,
      indices: nextIndices,
      limitMins,
      matchedNeedCount,
      matchedNeedWeight,
      overagePenalty,
      priceCount,
      priceSum,
      rawRatioCounts,
      rawRatioSums,
      safetyContextPenalty,
      safetyMask,
      score,
      servingCount,
      supplementProductCoveragePercent,
      totalPlanCoveragePercent
    };
  };
  const seedStates = orderedEntries
    .map((_, index) => buildState(null, index))
    .filter((state): state is V2BeamState => Boolean(state));
  let beam = selectDiverseBeamStates(seedStates, beamWidth, scoringNeeds);

  for (const state of seedStates) {
    keepState(state);
  }

  for (let depth = 2; depth <= maxProducts && beam.length > 0; depth += 1) {
    const nextBeam: V2BeamState[] = [];

    for (const state of beam) {
      const selectedIndices = new Set(state.indices);

      for (let entryIndex = 0; entryIndex < orderedEntries.length; entryIndex += 1) {
        if (selectedIndices.has(entryIndex)) {
          continue;
        }

        const nextState = buildState(state, entryIndex);

        if (nextState) {
          nextBeam.push(nextState);
          keepState(nextState);
        }
      }
    }

    beam = selectDiverseBeamStates(nextBeam, beamWidth, scoringNeeds);
  }

  const mergedStates = [
    ...topStates,
    ...[...topStatesBySize.values()].flat()
  ];

  return {
    evaluatedStackCount,
    scores: selectFinalBeamStates(
      mergedStates,
      topStatesBySize,
      keepTop,
      scoringNeeds
    )
      .map((state) => beamStateToStackScore(state, scoringNeeds))
  };
}

function enumerateStackScores(
  entries: readonly V2ProductEntry[],
  input: ProductRecommendationInput,
  scoringNeeds: readonly ProductRecommendationNeed[],
  allNeeds: readonly ProductRecommendationNeed[],
  weights: V2Weights,
  maxProducts: number,
  keepTop = 4
) {
  const scores: V2StackScore[] = [];
  const stack: V2ProductEntry[] = [];
  const metricsMatrix = entries.map((entry) =>
    scoringNeeds.map((need) => entry.metricsByNeed.get(need.id) ?? null)
  );
  const entrySafetyMasks = entries.map(productSafetyMask);
  const safetyContext = safetyContextFromClientContext(input.clientContext);
  const coverageSums = scoringNeeds.map(() => 0);
  const comparableSums = scoringNeeds.map(() => 0);
  const comparableCounts = scoringNeeds.map(() => 0);
  const rawRatioSums = scoringNeeds.map(() => 0);
  const rawRatioCounts = scoringNeeds.map(() => 0);
  const confidenceCoverageSums = scoringNeeds.map(() => 0);
  const limitStacks = scoringNeeds.map((): number[] => []);
  let extrasCount = 0;
  let priceCount = 0;
  let priceSum = 0;
  let safetyMask = 0;
  let servingCount = 0;
  const previousSafetyMasks: number[] = [];
  let evaluatedStackCount = 0;
  const keepScore = (score: V2StackScore) => {
    evaluatedStackCount += 1;
    scores.push(score);
    scores.sort(compareStackScores);

    if (Number.isFinite(keepTop) && scores.length > keepTop) {
      scores.length = keepTop;
    }
  };
  const currentScore = (): V2StackScore | null => {
    const achievedCoverage = new Map<string, number>();
    const comparableByNeed = new Map<string, number>();
    const rawRatioByNeed = new Map<string, number>();
    const totalWeight = normalizedNeedWeightTotal(scoringNeeds);
    let coverageNumerator = 0;
    let doseNumerator = 0;
    let doseDenominator = 0;
    let confidenceNumerator = 0;
    let confidenceDenominator = 0;
    let overlapNumerator = 0;
    let overageNumerator = 0;
    let duplicateNeedProductNumerator = 0;
    let matchedNeedCount = 0;
    let matchedNeedWeight = 0;

    for (const [needIndex, need] of scoringNeeds.entries()) {
      const coverageSum = coverageSums[needIndex] ?? 0;
      const achieved = clamp01(coverageSum);
      const comparableSeen = (comparableCounts[needIndex] ?? 0) > 0;
      const comparableAmount = comparableSums[needIndex] ?? 0;
      const rawRatioSeen = (rawRatioCounts[needIndex] ?? 0) > 0;
      const rawRatio = rawRatioSeen ? rawRatioSums[needIndex] ?? 0 : null;
      const limits = limitStacks[needIndex] ?? [];
      const limit = limits.length > 0 ? Math.min(...limits) : null;

      if (limit && comparableSeen && comparableAmount > limit) {
        return null;
      }

      achievedCoverage.set(need.id, achieved);
      coverageNumerator += achieved * need.weight;

      if (comparableSeen) {
        comparableByNeed.set(need.id, comparableAmount);
      }

      if (rawRatioSeen && rawRatio !== null) {
        rawRatioByNeed.set(need.id, rawRatio);
      }

      if (achieved > 0) {
        matchedNeedCount += 1;
        matchedNeedWeight += need.weight;

        const doseBand = doseBandScore(rawRatio);
        const confidence = coverageSum > 0
          ? (confidenceCoverageSums[needIndex] ?? 0) / coverageSum
          : 0;

        doseNumerator += need.weight * achieved * doseBand;
        doseDenominator += need.weight * achieved;
        confidenceNumerator += need.weight * achieved * confidence;
        confidenceDenominator += need.weight * achieved;
      }

      overlapNumerator += Math.max(0, coverageSum - achieved) * need.weight;

      if (rawRatio !== null && rawRatio > TARGET_DOSE_SOFT_MAX) {
        overageNumerator += Math.min(1, rawRatio - TARGET_DOSE_SOFT_MAX) * need.weight;
      }

      const coverageProductCount = stack.reduce((count, stackEntry) => {
        const metric = stackEntry.metricsByNeed.get(need.id) ?? null;

        return metric && metric.coverage > V2_SCORE_EPSILON ? count + 1 : count;
      }, 0);

      if (coverageProductCount > 1) {
        duplicateNeedProductNumerator += (coverageProductCount - 1) * need.weight;
      }
    }

    const coverage = totalWeight > 0 ? coverageNumerator / totalWeight : 0;
    const dosePrecision = doseDenominator > 0 ? doseNumerator / doseDenominator : 0;
    const confidence = confidenceDenominator > 0
      ? confidenceNumerator / confidenceDenominator
      : 0;
    const extraServings = Math.max(0, servingCount - stack.length);
    const simplicity = clamp01(
      1 -
        0.12 * Math.max(0, stack.length - 3) -
        V2_EXTRA_SERVING_SIMPLICITY_PENALTY * extraServings
    );
    const budgetAmount = budgetAmountFromContext(input);
    const price = priceCount > 0 ? priceSum : null;
    const affordability =
      budgetAmount && price
        ? clamp01(1 - Math.max(0, price - budgetAmount) / budgetAmount)
        : 0.5;
    const costEfficiency = clamp01(coverage * 0.7 + affordability * 0.3);
    const extras = usefulExtrasScore(extrasCount);
    const overlapPenalty = totalWeight > 0 ? overlapNumerator / totalWeight : 0;
    const overagePenalty = totalWeight > 0 ? overageNumerator / totalWeight : 0;
    const extraFactPenalty = excessiveExtrasPenalty(extrasCount);
    const duplicateNeedProductPenalty = totalWeight > 0
      ? duplicateNeedProductNumerator / totalWeight
      : 0;
    const safetyContextPenalty = safetyContextPenaltyForMask(
      safetyMask,
      safetyContext
    );
    const penalty = clamp01(
      0.3 * overlapPenalty +
      V2_DUPLICATE_NEED_PRODUCT_PENALTY_WEIGHT * duplicateNeedProductPenalty +
      0.4 * overagePenalty +
      V2_EXCESSIVE_EXTRAS_PENALTY_WEIGHT * extraFactPenalty +
      safetyContextPenalty
    );
    const componentScores = {
      confidence: roundScore(confidence),
      cost: roundScore(costEfficiency),
      coverage: roundScore(coverage),
      dose: roundScore(dosePrecision),
      duplicateNeedProductPenalty: roundScore(duplicateNeedProductPenalty),
      extraFactPenalty: roundScore(extraFactPenalty),
      extras: roundScore(extras),
      overagePenalty: roundScore(overagePenalty),
      penalty: roundScore(penalty),
      safetyContextPenalty: roundScore(safetyContextPenalty),
      simplicity: roundScore(simplicity)
    };
    const score =
      weights.coverage * coverage +
      weights.dose * dosePrecision +
      weights.simplicity * simplicity +
      weights.cost * costEfficiency +
      weights.extras * extras +
      weights.confidence * confidence -
      penalty;
    const productNeeds = supplementProductNeeds(allNeeds);

    return {
      achievedCoverage,
      comparableByNeed,
      componentScores,
      entries: [...stack],
      matchedNeedCount,
      matchedNeedWeight,
      overagePenalty,
      rawRatioByNeed,
      safetyContextPenalty,
      score,
      servingCount,
      supplementProductCoveragePercent: safePercent(
        stackCoveragePercent(achievedCoverage, productNeeds)
      ),
      totalPlanCoveragePercent: safePercent(
        stackCoveragePercent(achievedCoverage, allNeeds)
      )
    };
  };
  const pushEntry = (entryIndex: number) => {
    const entry = entries[entryIndex]!;

    stack.push(entry);
    extrasCount += entry.extrasCount;
    servingCount += entry.servingMultiplier;

    if (typeof entry.product.priceAmount === "number" && entry.product.priceAmount > 0) {
      priceCount += 1;
      priceSum += entry.product.priceAmount;
    }

    previousSafetyMasks.push(safetyMask);
    safetyMask |= entrySafetyMasks[entryIndex] ?? 0;

    for (const [needIndex, metric] of metricsMatrix[entryIndex]!.entries()) {
      if (!metric) {
        continue;
      }

      coverageSums[needIndex] += metric.coverage;
      confidenceCoverageSums[needIndex] += metric.confidence * metric.coverage;

      if (metric.comparableAmount !== null) {
        comparableCounts[needIndex] += 1;
        comparableSums[needIndex] += metric.comparableAmount;
      }

      if (metric.rawRatio !== null) {
        rawRatioCounts[needIndex] += 1;
        rawRatioSums[needIndex] += metric.rawRatio;
      }

      if (metric.limitComparableAmount !== null) {
        limitStacks[needIndex]!.push(metric.limitComparableAmount);
      }
    }
  };
  const popEntry = (entryIndex: number) => {
    const entry = entries[entryIndex]!;

    stack.pop();
    extrasCount -= entry.extrasCount;
    servingCount -= entry.servingMultiplier;

    if (typeof entry.product.priceAmount === "number" && entry.product.priceAmount > 0) {
      priceCount -= 1;
      priceSum -= entry.product.priceAmount;
    }

    safetyMask = previousSafetyMasks.pop() ?? 0;

    for (const [needIndex, metric] of metricsMatrix[entryIndex]!.entries()) {
      if (!metric) {
        continue;
      }

      coverageSums[needIndex] -= metric.coverage;
      confidenceCoverageSums[needIndex] -= metric.confidence * metric.coverage;

      if (metric.comparableAmount !== null) {
        comparableCounts[needIndex] -= 1;
        comparableSums[needIndex] -= metric.comparableAmount;
      }

      if (metric.rawRatio !== null) {
        rawRatioCounts[needIndex] -= 1;
        rawRatioSums[needIndex] -= metric.rawRatio;
      }

      if (metric.limitComparableAmount !== null) {
        limitStacks[needIndex]!.pop();
      }
    }
  };
  const visit = (startIndex: number) => {
    if (stack.length > 0) {
      const score = currentScore();

      if (score) {
        keepScore(score);
      }
    }

    if (stack.length >= maxProducts) {
      return;
    }

    for (let index = startIndex; index < entries.length; index += 1) {
      if (stack.some((entry) => entry.product.id === entries[index]!.product.id)) {
        continue;
      }

      if (
        stack.some((entry) =>
          productVariantKey(entry.product) === productVariantKey(entries[index]!.product)
        )
      ) {
        continue;
      }

      const coveredNeedIndexes = metricsMatrix[index]!
        .map((metric, needIndex) =>
          metric && metric.coverage > V2_SCORE_EPSILON ? needIndex : null
        )
        .filter((needIndex): needIndex is number => needIndex !== null);

      if (
        coveredNeedIndexes.length > 0 &&
        coveredNeedIndexes.every((needIndex) =>
          stack.some((stackEntry) =>
            (stackEntry.metricsByNeed.get(scoringNeeds[needIndex]!.id)?.coverage ?? 0) >
            V2_SCORE_EPSILON
          )
        )
      ) {
        continue;
      }

      if (
        coveredNeedIndexes.length > 0 &&
        coveredNeedIndexes.every((needIndex) =>
          (coverageSums[needIndex] ?? 0) > V2_SCORE_EPSILON
        ) &&
        coveredNeedIndexes.every((needIndex) =>
          (coverageSums[needIndex] ?? 0) >= TARGET_DOSE_SWEET_SPOT_MIN ||
          (metricsMatrix[index]![needIndex]?.coverage ?? 0) >=
            TARGET_DOSE_SWEET_SPOT_MIN
        )
      ) {
        continue;
      }

      pushEntry(index);
      visit(index + 1);
      popEntry(index);
    }
  };

  visit(0);
  return {
    evaluatedStackCount,
    scores: scores.sort(compareStackScores)
  };
}

function contributionPercentForProduct(
  entry: V2ProductEntry,
  stackEntries: readonly V2ProductEntry[],
  needs: readonly ProductRecommendationNeed[]
) {
  const totalWeight = normalizedNeedWeightTotal(needs);

  if (totalWeight <= 0) {
    return 0;
  }

  let weightedContribution = 0;

  for (const need of needs) {
    const totalCoverage = stackEntries.reduce(
      (total, stackEntry) =>
        total + (stackEntry.metricsByNeed.get(need.id)?.coverage ?? 0),
      0
    );
    const ownCoverage = entry.metricsByNeed.get(need.id)?.coverage ?? 0;

    if (totalCoverage > 0 && ownCoverage > 0) {
      weightedContribution +=
        (ownCoverage / totalCoverage) * Math.min(1, totalCoverage) * need.weight;
    }
  }

  return (weightedContribution / totalWeight) * 100;
}

function recommendationsFromV2Stack(
  stack: V2StackScore,
  scoringNeeds: readonly ProductRecommendationNeed[]
) {
  return stack.entries
    .map((entry) => {
      const contribution = contributionPercentForProduct(
        entry,
        stack.entries,
        scoringNeeds
      );

      return {
        contribution,
        entry
      };
    })
    .sort((first, second) =>
      second.contribution - first.contribution ||
      second.entry.coverage.percent - first.entry.coverage.percent ||
      first.entry.product.title.localeCompare(second.entry.product.title) ||
      first.entry.product.id.localeCompare(second.entry.product.id)
    )
    .map(({ contribution, entry }, index) => {
      const coveredNeeds = scoringNeeds.filter((need) =>
        (entry.coverage.coverageByNeed.get(need.id) ?? 0) > 0
      );

      return {
        affiliate: Boolean(entry.product.activeAffiliateUrl),
        offerId: entry.product.activeOfferId ?? null,
        coveredNeeds,
        product: entry.product,
        productCoveragePercent: visibleCoveragePercent(
          entry.coverage.percent,
          coveredNeeds.length > 0
        ),
        rank: index + 1,
        score: roundScore(contribution),
        servingMultiplier: entry.servingMultiplier,
        stackContributionPercent: visibleCoveragePercent(contribution, contribution > 0),
        unknownAtRecommendation: false,
        url: entry.product.activeAffiliateUrl || entry.product.productUrl,
        why: whyProductMatches(
          entry.product,
          coveredNeeds,
          contribution,
          entry.servingMultiplier
        )
      } satisfies ProductRecommendationSelection;
    });
}

function v2Shortfalls(
  needs: readonly ProductRecommendationNeed[],
  coverage: ReadonlyMap<string, number>
) {
  return needs.map((need) => {
    const coveragePercent = safePercent((coverage.get(need.id) ?? 0) * 100);

    return {
      coveragePercent,
      displayName: need.displayName,
      id: need.id,
      shortfallPercent: safePercent(100 - coveragePercent)
    };
  });
}

function recommendProductStackExact(
  input: ProductRecommendationInput,
  options: Readonly<{
    algorithmVersion: ProductRecommendationAlgorithmVersion;
    searchMode: "full-beam" | "shortlist";
  }>
) {
  const stackPreference = normalizeProductStackPreference(input.stackPreference);
  const maxProducts = Math.min(
    DEFAULT_MAX_COUNT,
    Math.max(1, input.maxProducts ?? DEFAULT_MAX_COUNT)
  );
  const scoringNeeds = supplementProductNeeds(input.needs);
  const exclusions: ProductRecommendationExclusion[] = [];
  const bestRejectedByNeed = new Map<string, ProductRecommendationExclusion>();
  const bestRejectedCoverageByNeed = new Map<string, number>();
  const { deltas, weights } = normalizedV2Weights(input.clientContext);
  const entries = input.candidates
    .flatMap((product) => {
      const baseEntry = productCoverageV2(product, scoringNeeds, input.clientSex);
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

        for (const need of baseEntry.coverage.coveredNeeds) {
          const current = bestRejectedCoverageByNeed.get(need.id) ?? 0;
          const next = baseEntry.coverage.coverageByNeed.get(need.id) ?? 0;

          if (next > current) {
            bestRejectedCoverageByNeed.set(need.id, next);
            bestRejectedByNeed.set(need.id, exclusion);
          }
        }

        return [];
      }

      const productEntries = productServingMultipliers(product)
        .map((servingMultiplier) =>
          productCoverageV2(product, scoringNeeds, input.clientSex, servingMultiplier)
        )
        .filter((entry) => entry.coverage.percent > 0);

      if (productEntries.length <= 0) {
        exclusions.push({
          productId: product.id,
          reason:
            productFactAudienceMismatchReason(
              product,
              scoringNeeds,
              input.clientSex
            ) ?? "Product does not cover current client needs",
          title: product.title
        });
        return [];
      }

      return productEntries;
    })
    .filter((entry): entry is V2ProductEntry => Boolean(entry));
  const candidatePool = options.searchMode === "shortlist"
    ? shortlistEntries(entries, scoringNeeds)
    : entries;
  const stackSearch = options.searchMode === "full-beam"
    ? beamSearchStackScores(
        candidatePool,
        input,
        scoringNeeds,
        scoringNeeds,
        weights,
        maxProducts,
        V2_FULL_BEAM_WIDTH,
        stackPreference === "compact" ? 128 : 32
      )
    : enumerateStackScores(
        candidatePool,
        input,
        scoringNeeds,
        scoringNeeds,
        weights,
        maxProducts
      );
  const stackScores = stackSearch.scores;
  const bestStack = selectStackForPreference(
    stackScores,
    scoringNeeds,
    stackPreference
  );
  const finalCoverage = bestStack
    ? stackCoverageForNeeds(bestStack.entries, scoringNeeds)
    : new Map<string, number>();
  const productNeedsCoverage = bestStack
    ? stackCoverageForNeeds(bestStack.entries, scoringNeeds)
    : new Map<string, number>();
  const supplementProductCoveragePercent = safePercent(
    stackCoveragePercent(productNeedsCoverage, scoringNeeds)
  );
  const foodCoveragePercent = 0;
  const totalPlanCoveragePercent = safePercent(
    stackCoveragePercent(finalCoverage, scoringNeeds)
  );
  const needDiagnostics = diagnosticNeeds(
    scoringNeeds,
    finalCoverage,
    bestRejectedByNeed,
    bestAvailableCoverageByNeed(entries)
  );
  const selectedIds = new Set(
    bestStack?.entries.map((entry) => entry.product.id) ?? []
  );
  const nearMisses = entries
    .filter((entry) => !selectedIds.has(entry.product.id))
    .map((entry) => ({
      coveragePercent: safePercent(entry.coverage.percent),
      productId: entry.product.id,
      reason:
        options.searchMode === "shortlist" &&
        !candidatePool.some((item) => item.product.id === entry.product.id)
          ? "Outside deterministic shortlist"
          : "Lower utility than selected stack",
      title: entry.product.title
    }))
    .filter((item) => item.coveragePercent > 0)
    .sort((first, second) =>
      second.coveragePercent - first.coveragePercent ||
      first.title.localeCompare(second.title) ||
      first.productId.localeCompare(second.productId)
    )
    .slice(0, 12);
  const trace: ProductRecommendationTrace = {
    alternativeStacks: distinctAlternativeStacks(
      stackScores,
      bestStack,
      scoringNeeds
    )
      .map((stack) => ({
        productIds: stack.entries.map((entry) => entry.product.id),
        productTitles: stack.entries.map((entry) => entry.product.title),
        score: roundScore(stack.score),
        supplementProductCoveragePercent: stack.supplementProductCoveragePercent,
        totalPlanCoveragePercent: stack.totalPlanCoveragePercent
      })),
    candidatePoolSize: entries.length,
    componentScores: bestStack?.componentScores ?? {},
    contextSignals: v2ContextSignals(input),
    evaluatedStackCount: stackSearch.evaluatedStackCount,
    excludedPredicates: exclusions.filter(
      (item) => item.reason !== "Product does not cover current client needs"
    ),
    maxProducts,
    searchMode: options.searchMode,
    shortfalls: v2Shortfalls(scoringNeeds, finalCoverage),
    shortlistSize: candidatePool.length,
    stackPreference,
    targetProducts: input.targetProducts ?? undefined,
    utilityScore: roundScore(bestStack?.score ?? 0),
    weightDeltas: deltas,
    weights
  };

  return {
    clientNeeds: scoringNeeds,
    diagnostics: {
      algorithmVersion: options.algorithmVersion,
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
      marketRegion: input.countryCode ?? undefined,
      nearMisses,
      productsConsidered: input.candidates.length,
      stackPreference,
      trace,
      unmatchedNeeds: needDiagnostics.filter((item) => item.coveragePercent <= 0)
    },
    exclusions,
    recommendations: bestStack
      ? recommendationsFromV2Stack(bestStack, scoringNeeds)
      : [],
    foodCoveragePercent,
    stackCoveragePercent: supplementProductCoveragePercent,
    supplementProductCoveragePercent,
    totalPlanCoveragePercent
  } satisfies ProductRecommendationResult;
}

export function recommendProductStackV2(input: ProductRecommendationInput) {
  return recommendProductStackExact(input, {
    algorithmVersion: V2_ALGORITHM_VERSION,
    searchMode: "shortlist"
  });
}

export function recommendProductStackFullBeam(input: ProductRecommendationInput) {
  return recommendProductStackExact(input, {
    algorithmVersion: V2_FULL_BEAM_ALGORITHM_VERSION,
    searchMode: "full-beam"
  });
}

export function recommendProductStack(input: ProductRecommendationInput) {
  return recommendProductStackFullBeam(input);
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
    servingMultiplier: selection.servingMultiplier > 1
      ? selection.servingMultiplier
      : undefined,
    stackContributionPercent: selection.stackContributionPercent,
    stackCoveragePercent,
    tag: selection.affiliate ? "Best match + affiliate" : "Best match",
    url: selection.url
  } satisfies RecommendedProduct;
}
