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

export type MatcherSex = "female" | "intersex" | "male" | "unspecified";

export type OptimizationMode =
  | "balanced"
  | "best_coverage"
  | "fewest_pills"
  | "lowest_cost";

export type SelectorMode = "agentic" | "web_single";

export type DietaryPreference = "any" | "plant_based" | "vegan";

export type OmegaPreference = "algae_only" | "any" | "fish_allowed";

export type CanonicalTarget = Readonly<{
  name: string;
  requested: ScaledAmount;
  requestedAmount: number;
  requestedUnit: MatcherUnit;
  subjectId: string;
}>;

export type CanonicalCurrent = Readonly<{
  daily: ScaledAmount;
  dailyAmount: number;
  name: string;
  sourceId: string;
  subjectId: string;
  unit: MatcherUnit;
}>;

export type SafetyCeiling = Readonly<{
  maxAmount: number;
  maxUnit: MatcherUnit;
  name: string;
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
  leftovers: readonly MatcherLeftover[];
  maxDailyPills: number | null;
  maxPriceMinor: number | null;
  maxProductCount: number;
  medicationCodes: readonly string[];
  omega3SourcePreference: OmegaPreference;
  optimization: OptimizationMode;
  profile: Readonly<{
    ageYears: number;
    lifeStage: LifeStage;
    sex: MatcherSex;
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
  reason: "dose_gap" | "not_in_catalogue" | "uncovered" | "weaker_sku";
  severity: "high" | "low" | "medium";
  subjectId?: string;
  unit?: MatcherUnit;
}>;

export type MatcherContribution = Readonly<{
  amount: number;
  name: string;
  subjectId: string | null;
  unit: string | null;
}>;

export type MatcherProduct = Readonly<{
  availableCountryCodes: readonly string[] | null;
  contributionSubjectIds: readonly string[];
  currency: string;
  dailyPillsPerServing: number;
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
  ruleId: string;
  subjectId: string | null;
  thresholdUnits: bigint | null;
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
}>;

export type DoseVariant = Readonly<{
  amountPerUnit: ReadonlyMap<string, ScaledAmount>;
  contributions: ReadonlyMap<string, ScaledAmount>;
  dailyPills: number;
  dailyUnits: number;
  productId: string;
  unknownSafetyAmount: boolean;
  variantId: string;
}>;

export type ProductGroup = Readonly<{
  product: MatcherProduct;
  productId: string;
  sellerId: string;
  variants: readonly DoseVariant[];
}>;

export type SearchState = Readonly<{
  count: number;
  delivered: ReadonlyMap<string, bigint>;
  exposure: ReadonlyMap<string, bigint>;
  nextGroupIndex: number;
  pills: number;
  price: number;
  selectedVariantIds: readonly string[];
}>;

export type ScoredBasket = Readonly<{
  aggregateCoverage: number;
  coverageBySubject: ReadonlyMap<string, number>;
  coveredCount: number;
  dailyPills: number;
  exposure: Exposure;
  incidentalCount: number;
  oversupplyScore: number;
  priceMinor: number;
  productCount: number;
  productIds: readonly string[];
  reason: string;
  safety: SafetyResult;
  sellerId: string;
  variantIds: readonly string[];
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

export type MatchResult = Readonly<{
  alternatives: readonly ScoredBasket[];
  leftovers: readonly MatcherLeftover[];
  rejected: readonly RejectedCandidate[];
  searchMode: "bounded" | "exact";
  selected: ScoredBasket | null;
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
  usefulCoverageFloor: number;
  version: string;
}>;
