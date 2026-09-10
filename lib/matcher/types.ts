import type { ProductAdministration } from "@/lib/product-administration";

export type MatcherUnit = "CFU" | "IU" | "g" | "mcg" | "mg" | "ml" | "serving";

export type DoseDimension = "cfu" | "iu" | "mass_ng" | "serving_milli";

export type ScaledAmount = Readonly<{
  dim: DoseDimension;
  subjectId: string;
  units: bigint;
}>;

export type DoseError = Readonly<{
  fieldPath?: string;
  message: string;
  reason: "overflow" | "unsupported_unit";
}>;

export type LifeStage =
  | "adult"
  | "breastfeeding"
  | "child"
  | "pregnant"
  | "trying_to_conceive";

export type MatcherSex = "female" | "male";

export type OptimizationMode =
  | "balanced"
  | "best_coverage"
  | "fewest_pills"
  | "lowest_cost";

export type PreferenceImportance = "flexible" | "normal" | "strong";
export type PreferenceImportanceMap = Readonly<Partial<Record<"maxDailyPills" | "maxProductCount" | "maxPriceMinor", PreferenceImportance>>>;

export type SelectorMode = "agentic" | "web_single";

export type DietaryPreference = "any" | "plant_based" | "vegan";

export type OmegaPreference = "algae_only" | "any" | "fish_allowed";

export type TargetImportance = "conditional" | "core" | "optional" | "required";

export type CanonicalTarget = Readonly<{
  basis?: "total_daily" | "supplemental";
  acceptableMaximum?: number;
  acceptableMinimum?: number;
  importance: TargetImportance;
  name: string;
  prerequisite?: Readonly<{
    nextAction?: string;
    reasonCode?: string;
    status: "satisfied" | "unknown" | "unsatisfied";
  }>;
  requested: ScaledAmount;
  requestedAmount: number;
  requestedUnit: MatcherUnit;
  subjectId: string;
}>;

export type CanonicalCurrent = Readonly<{
  certainty?: "known" | "estimated" | "unknown";
  daily: ScaledAmount;
  dailyAmount: number;
  minimumDailyAmount?: number;
  maximumDailyAmount?: number;
  daysRemaining?: number;
  name: string;
  productId?: string;
  sourceId: string;
  subjectId: string;
  unit: MatcherUnit;
}>;

export type SafetyLimitLifeStage =
  | "adolescent_14_18"
  | "adult"
  | "breastfeeding"
  | "child_1_3"
  | "child_4_8"
  | "child_9_13"
  | "pregnant";

export type SafetySourceScope = "supplemental" | "total";

export const SAFETY_LIMIT_LIFE_STAGES = [
  "child_1_3",
  "child_4_8",
  "child_9_13",
  "adolescent_14_18",
  "adult",
  "pregnant",
  "breastfeeding"
] as const satisfies readonly SafetyLimitLifeStage[];

export const SAFETY_SOURCE_SCOPES = [
  "supplemental",
  "total"
] as const satisfies readonly SafetySourceScope[];

export const MATCHER_SOURCE_SCOPE: SafetySourceScope = "supplemental";

export type SafetyCeiling = Readonly<{
  authorityUrl?: string | null;
  referenceConfidence?: "high" | "moderate" | "low";
  basisRationale?: string | null;
  bandId?: string;
  bandVersion?: number;
  lifeStage?: SafetyLimitLifeStage;
  maxAmount: number;
  maxUnit: MatcherUnit;
  name: string;
  sourceScope?: SafetySourceScope;
  subjectId: string;
}>;

export type CanonicalRequest = Readonly<{
  acceptedGapSubjectIds: readonly string[];
  allowedForms: readonly string[] | null;
  conditionCodes: readonly string[];
  currency: string;
  currentSupplements: readonly CanonicalCurrent[];
  destinationCountry: string;
  dietaryPreference: DietaryPreference;
  excludeSubjectIds: readonly string[];
  /** Explicit product exclusions are distinct from nutrient exclusions. */
  excludeProductIds?: readonly string[];
  productDoses?: readonly Readonly<{ productId: string; servingsPerDay: number }>[];
  searchEffort?: "standard" | "expanded";
  /** Quantified food intake is used only for total-source reference limits. */
  dietaryIntake?: readonly CanonicalCurrent[];
  unknownIntakeSubjectIds?: readonly string[];
  estimatedIntakeSubjectIds?: readonly string[];
  /** False means the adapter's placeholder must not become a known demographic fact. */
  profileKnown?: Readonly<{ ageYears?: boolean; lifeStage?: boolean; sex?: boolean }>;
  leftovers: readonly MatcherLeftover[];
  maxDailyPills: number | null;
  maxPriceMinor: number | null;
  maxProductCount: number | null;
  medicationCodes: readonly string[];
  omega3SourcePreference: OmegaPreference;
  optimization: OptimizationMode;
  preferenceImportance?: PreferenceImportanceMap;
  /** Web budgets are monthly; MCP's compatible price preference is first-order goods. */
  pricePreferenceBasis?: "first_order" | "monthly_30_days";
  profile: Readonly<{
    ageYears: number;
    lifeStage: LifeStage;
    sex?: MatcherSex;
  }>;
  retainProductIds: readonly string[];
  retainSubjectIds: readonly string[];
  safetyCeilings?: readonly SafetyCeiling[];
  selectorMode: SelectorMode;
  targets: readonly CanonicalTarget[];
}>;

export type MatcherLeftover = Readonly<{
  amount?: number;
  name: string;
  note?: string;
  reason:
    | "dose_gap"
    | "not_in_catalogue"
    | "uncovered"
    | "unsupported_unit_conversion"
    | "weaker_sku";
  severity: "high" | "low" | "medium";
  subjectId?: string;
  unit?: MatcherUnit;
}>;

export type MatcherContribution = Readonly<{
  mappingStatus?: "verified" | "unverified" | "conflicting";
  confidence?: "high" | "moderate" | "low";
  source?: string | null;
  sourceUrl?: string | null;
  sourceText?: string | null;
  amount: number;
  name: string;
  subjectId: string | null;
  unit: string | null;
}>;

export type MatcherProduct = Readonly<{
  administration?: ProductAdministration | null;
  availableCountryCodes: readonly string[] | null;
  contributionSubjectIds: readonly string[];
  currency: string;
  dailyPillsPerServing: number;
  pillCountKnown?: boolean;
  dietarySource: "algae" | "any" | "fish" | "plant";
  form: string;
  imageUrl: string | null;
  incompleteCommercialFacts: boolean;
  labelledContributions: readonly MatcherContribution[];
  omegaSource: "algae" | "fish" | "none";
  orderable: boolean;
  prenatalOrFertility: boolean;
  productAudience: "both" | "female" | "male";
  productId: string;
  retailerSku: string;
  sellerId: string;
  sellerName: string;
  source: "fixture" | "retail";
  status: "approved" | "deleted" | "ignored" | "pending_review";
  stockStatus: "backorder" | "in_stock" | "unavailable";
  title: string;
  unknownSafetyAmount: boolean;
  unitPriceMinor: number;
}>;

export type CatalogSnapshot = Readonly<{
  availabilityAsOf: string;
  catalogueVersion: string;
  products: readonly MatcherProduct[];
}>;

export type SafetyAction = "acknowledge" | "block" | "inform";

export type SafetyFinding = Readonly<{
  action: SafetyAction;
  code: string;
  contributors: readonly string[];
  exposureUnits: bigint | null;
  family: string;
  guidanceId: string;
  nutrientName: string | null;
  ruleId: string;
  subjectId: string | null;
  thresholdUnits: bigint | null;
  unit: string | null;
  severity?: "high" | "info";
  comparator?: "gt" | "gte" | null;
  sourceScope?: SafetySourceScope | null;
  authorityUrl?: string | null;
  uncertainty?: readonly string[];
}>;

export type SafetyResult = Readonly<{
  findings: readonly SafetyFinding[];
  hardBlocked: boolean;
  requiresAck: boolean;
}>;

export type DoseProvenance = Readonly<{
  amount: ScaledAmount;
  source: "current" | "selected";
  sourceId: string;
  subjectId: string;
}>;

export type Exposure = Readonly<{
  provenance: readonly DoseProvenance[];
  totals: ReadonlyMap<string, ScaledAmount>;
  unknownSubjectIds?: readonly string[];
}>;

export type DoseVariant = Readonly<{
  amountPerUnit: ReadonlyMap<string, ScaledAmount>;
  contributions: ReadonlyMap<string, ScaledAmount>;
  dailyPills: number;
  dailyUnits: number;
  dailyUnitsRatio?: Readonly<{ num: bigint; den: bigint }>;
  productId: string;
  safetyExposure?: ReadonlyMap<string, ScaledAmount>;
  unknownSafetyAmount: boolean;
  unknownSubjectIds?: readonly string[];
  variantId: string;
}>;

export type ProductGroup = Readonly<{
  product: MatcherProduct;
  productId: string;
  sellerId: string;
  variants: readonly DoseVariant[];
}>;

export type SearchState = Readonly<{
  routineServings?: readonly number[];
  servingBurden?: import("@/lib/matcher/rational").Rational;
  uncertainAdministrationCount?: number;
  monthlyPriceMinor?: number | null;
  monthlyPriceLowerBound?: number;
  count: number;
  delivered: ReadonlyMap<string, bigint>;
  exposure: ReadonlyMap<string, bigint>;
  nextGroupIndex: number;
  pills: number;
  pillCountKnown?: boolean;
  price: number;
  selectedVariantIds: readonly string[];
  selectedProductIds?: readonly string[];
  unknownProductIds?: readonly string[];
}>;

/** Dimensionless ratios: 1 means a deviation equal to the agreed daily target. */
export type DoseFitScore = Readonly<{
  version: string;
  limitWeight: 2;
  under: number;
  over: number;
  limit: number;
  weightedLimit: number;
  total: number;
  perTarget: readonly Readonly<{
    basis?: "total_daily" | "supplemental";
    subjectId: string; name: string; unit: MatcherUnit;
    target: number; exposure: number; under: number; over: number;
    acceptableMinimum?: number; acceptableMaximum?: number; withinAcceptableRange?: boolean;
    exposureMinimum?: number; exposureMaximum?: number; conservativeExposure?: number;
    certainty: "known" | "estimated" | "unknown";
  }>[];
  perContinuedDose?: readonly Readonly<{
    subjectId: string; name: string; unit: MatcherUnit;
    referenceBasis: "continued_dose"; referenceDose: number; sourceIds: readonly string[];
    exposure: number; exposureMinimum: number; exposureMaximum: number; conservativeExposure: number;
    over: number; certainty: "known" | "estimated" | "unknown";
  }>[];
  perLimit: readonly Readonly<{
    subjectId: string; name: string; unit: MatcherUnit;
    exposure: number; limit: number; excess: number;
    exposureMinimum?: number; exposureMaximum?: number; conservativeExposure?: number;
    sourceScope: SafetySourceScope; ruleId: string | null; authorityUrl: string | null;
    certainty: "known" | "estimated" | "unknown";
  }>[];
  unknownSubjectIds: readonly string[];
  estimatedSubjectIds: readonly string[];
}>;

export type ConversationalOptionRole = "best_match" | "closest_dose" | "lower_cost" | "simpler" | "fewer_concerns" | "purchase_fallback";

export type ValueOptionRole = "requested_objective" | "fewer_concerns" | "best_value" | "complete" | "minimum_core";

export type CoverageSummaryRow = Readonly<{
  subjectId: string; name: string; unit: MatcherUnit; target: number; importance: TargetImportance;
  basis: "total_daily" | "supplemental"; knownCurrent: number; estimatedCurrent: number; unknown: boolean;
  newContribution: number; quantifiedTotal: number; knownTotal: number; remainingGap: number; excess: number;
  fullyMet: boolean; coveragePercent: number;
}>;

export type ScoredBasket = Readonly<{
  coverageSummary?: readonly CoverageSummaryRow[];
  aggregateCoverage: number;
  coverageBySubject: ReadonlyMap<string, number>;
  coveredCount: number;
  dailyPills: number;
  pillCountKnown?: boolean;
  dedicatedPartialCount: number;
  exposure: Exposure;
  incidentalCount: number;
  optionRole?: ValueOptionRole;
  roles?: readonly ConversationalOptionRole[];
  purchaseEligible?: boolean;
  oversupplyScore: number;
  doseFit?: DoseFitScore;
  overallScore?: import("@/lib/matcher/practical-scoring").OverallMatchingScore;
  priceMinor: number;
  productCount: number;
  productIds: readonly string[];
  recommended?: boolean;
  reason: string;
  requestedLabelCount: number;
  titleExactCount: number;
  safety: SafetyResult;
  sellerId: string;
  variantIds: readonly string[];
  variantDoses?: readonly Readonly<{ productId: string; dailyUnits: number; dailyPills: number }>[];
}>;

export type RejectionReason =
  | "budget"
  | "excluded"
  | "foreign_retailer"
  | "form"
  | "incidental_only"
  | "incomplete_facts"
  | "life_stage"
  | "max_pills"
  | "max_products"
  | "not_approved"
  | "not_orderable"
  | "oos"
  | "ul_exceeded"
  | "vegan"
  | "wrong_source";

export type RejectedCandidate = Readonly<{
  productId: string;
  reason: RejectionReason;
  sellerId: string;
  title: string;
}>;

export type RejectedSummary = Readonly<{
  counts: Readonly<Record<string, number>>;
  sample: readonly RejectedCandidate[];
  total: number;
}>;

export type LossCertificate = Readonly<{
  candidate_fact_id: string | null;
  candidate_product_id: string;
  catalogue_id: string;
  conflicting_product_ids: readonly string[];
  conflicting_rule_id: string;
  exposure_after: number | null;
  exposure_before: number | null;
  limit: number | null;
  rejection_class:
    | "approximate"
    | "dominated"
    | "hard_constraint"
    | "safety"
    | "source"
    | "unavailable";
  target_supplement_id: string;
  unit: string | null;
}>;

export type TargetFrontier = Readonly<{
  name: string;
  productIds: readonly string[];
  subjectId: string;
}>;

export type MatchResult = Readonly<{
  matchingDiagnostics?: import("@/lib/matcher/diagnostics").MatchingDiagnostics;
  searchSummary?: Readonly<{
    effort: "standard" | "expanded";
    expansionAttempts: number;
    expansionBudget: number;
    complete: boolean;
    canExpand: boolean;
  }>;
  alternatives: readonly ScoredBasket[];
  alternativeSearch?: Readonly<{
    status: "found" | "none_found" | "incomplete" | "not_needed";
    reason: string;
  }>;
  leftovers: readonly MatcherLeftover[];
  lossCertificates?: readonly LossCertificate[];
  rejected: readonly RejectedCandidate[];
  searchMode: "bounded" | "exact";
  selected: ScoredBasket | null;
  targetFrontiers?: readonly TargetFrontier[];
  trimmed: boolean;
}>;

export type MatcherConfig = Readonly<{
  exactGroupLimit: number;
  exactVariantLimit: number;
  expansionBudget: number;
  initialBeamWidth: number;
  maxBeamWidth: number;
  searchDeadlineMs: number;
  sellerGroupLimit?: number;
  skipPostMatchCompact?: boolean;
  usefulCoverageFloor: number;
  version: string;
}>;
