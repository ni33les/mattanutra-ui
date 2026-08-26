import type { CatalogueUnit } from "@/lib/agentic/catalogue/types";

export type OptimizationMode =
  | "balanced"
  | "best_coverage"
  | "fewest_pills"
  | "lowest_cost";

export type LifeStage =
  | "adult"
  | "breastfeeding"
  | "child"
  | "pregnant"
  | "trying_to_conceive";

export type PlanTarget = Readonly<{
  amount: number;
  name: string;
  requestedName?: string;
  supplementId: string;
  unit: CatalogueUnit;
}>;

export type CurrentSupplement = Readonly<{
  dailyAmount: number;
  name: string;
  supplementId: string;
  unit: CatalogueUnit;
}>;

export type PlanRequirements = Readonly<{
  allowedForms?: readonly string[];
  dietaryPreference?: "any" | "plant_based" | "vegan";
  excludeSupplementIds?: readonly string[];
  maxDailyPills?: number;
  maxPriceMinor?: number;
  maxProductCount?: number;
  omega3SourcePreference?: "algae_only" | "any" | "fish_allowed";
  retainProductIds?: readonly string[];
  retainSupplementIds?: readonly string[];
}>;

export type PlanProfile = Readonly<{
  ageYears: number;
  goals?: readonly string[];
  lifeStage: LifeStage;
  sex: "female" | "intersex" | "male" | "unspecified";
}>;

export type SafetyAcknowledgement = Readonly<{
  confirmed: true;
  guidanceIds: readonly string[];
  revision: number;
}>;

export type PlanAnswer = Readonly<{
  choice: string;
  questionId: string;
}>;

export type PlanRequestTarget = Readonly<{
  amount: number;
  name: string;
  supplementId?: string;
  unit: CatalogueUnit;
}>;

export type PlanRequestCurrent = Readonly<{
  dailyAmount: number;
  name: string;
  supplementId?: string;
  unit: CatalogueUnit;
}>;

export type PlanRequest = Readonly<{
  answers?: readonly PlanAnswer[];
  conditionCodes?: readonly string[];
  currentSupplements?: readonly PlanRequestCurrent[];
  destinationCountry: string;
  locale: string;
  medicationCodes?: readonly string[];
  optimization: OptimizationMode;
  profile: PlanProfile;
  requirements: PlanRequirements;
  safetyAcknowledgement?: SafetyAcknowledgement;
  targets: readonly PlanRequestTarget[];
}>;

export type AcceptedGap = Readonly<{
  revision: number;
  supplementId: string;
}>;

export type PlanLeftoverReason =
  | "dose_gap"
  | "not_in_catalogue"
  | "uncovered"
  | "weaker_sku";

export type PlanLeftover = Readonly<{
  amount?: number;
  name: string;
  note?: string;
  reason: PlanLeftoverReason;
  severity: "high" | "low" | "medium";
  supplementId?: string;
  unit?: CatalogueUnit;
}>;

export type CanonicalPlanState = Readonly<{
  acceptedGaps: readonly AcceptedGap[];
  conditionCodes: readonly string[];
  currency: string;
  currentSupplements: readonly CurrentSupplement[];
  destinationCountry: string;
  leftovers: readonly PlanLeftover[];
  locale: string;
  medicationCodes: readonly string[];
  optimization: OptimizationMode;
  pinnedOptionId: string | null;
  profile: PlanProfile;
  requirements: PlanRequirements;
  safetyAcknowledgement: SafetyAcknowledgement | null;
  targets: readonly PlanTarget[];
}>;

export type RejectedCandidateReason =
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
  reason: RejectedCandidateReason;
  sellerId: string;
  title: string;
}>;

export type RejectedCandidateSummary = Readonly<{
  counts: Readonly<Record<string, number>>;
  sample: readonly RejectedCandidate[];
  total: number;
}>;

export type TargetClass =
  | "available"
  | "genuine_gap"
  | "mapping_defect"
  | "matcher_defect";

export type TargetClassification = Readonly<{
  class: TargetClass;
  coveragePercent: number;
  eligibleProductCount: number;
  mappedProductCount: number;
  name: string;
  supplementId: string;
}>;

export type MatcherTelemetry = Readonly<{
  ackMs?: number;
  availabilityAsOf?: string;
  catalogueMs?: number;
  constraints: PlanRequirements &
    Readonly<{
      conditionCodes: readonly string[];
      medicationCodes: readonly string[];
    }>;
  coveragePercent: number | null;
  leftovers: readonly PlanLeftover[];
  matchMs?: number;
  matcherVersion: string;
  productIds: readonly string[];
  productSkus: readonly string[];
  rejected?: RejectedCandidateSummary;
  rejectedAll?: readonly RejectedCandidate[];
  requestedDoses: readonly Readonly<{
    amount: number;
    name: string;
    unit: CatalogueUnit;
  }>[];
  requestedNames: readonly string[];
  searchDeadlineMs?: number;
  searchMs?: number;
  selectedOptionId: string | null;
  serializeMs?: number;
  snapshotId?: string;
  targetClassifications?: readonly TargetClassification[];
}>;

export type BasketNutrient = Readonly<{
  amount: number;
  name: string;
  unit: CatalogueUnit;
}>;

export type CoverageContributor = Readonly<{
  amount: number;
  productId: string;
  productName: string;
  unit: CatalogueUnit;
}>;

export type BasketItem = Readonly<{
  availabilityAsOf: string;
  contributionSupplementIds: readonly string[];
  currency: string;
  dailyPills: number;
  deliveryWindow: string | null;
  fixture: boolean;
  form: string;
  imageUrl: string | null;
  incidentalNutrientNames: readonly string[];
  incidentalNutrients: readonly BasketNutrient[];
  incompleteCommercialFacts: boolean;
  lineTotalMinor: number;
  pillsPerServing: number;
  productId: string;
  productName: string;
  quantity: number;
  requestedNutrientNames: readonly string[];
  requestedNutrients?: readonly BasketNutrient[];
  retailerSku: string;
  sellerId: string;
  sellerName: string;
  servingsPerDay: number;
  source: "fixture" | "retail";
  stockStatus: "backorder" | "in_stock";
  unitPriceMinor: number;
}>;

export type CoverageRow = Readonly<{
  contributors?: readonly CoverageContributor[];
  coveragePercent: number;
  currentAmount: number;
  deliveredAmount: number;
  name: string;
  percentOfUpperLimit: number | null;
  remainingGap: number;
  requestedAmount: number;
  status: "covered" | "over_target" | "partial" | "uncovered" | "upper_limit_risk";
  supplementId: string;
  totalExposureAmount: number;
  unit: CatalogueUnit;
  upperLimitAmount: number | null;
}>;

export type SafetyGuidance = Readonly<{
  action: "acknowledge" | "block" | "review";
  code:
    | "audience_mismatch"
    | "condition_review_required"
    | "dose_review_required"
    | "duplicate_or_overlap"
    | "medication_interaction"
    | "pediatric_review_required";
  exposure: number | null;
  guidanceId: string;
  message: string;
  messageKey: string;
  nutrientName: string | null;
  productIds: readonly string[];
  ruleId: string;
  rulesVersion: string;
  severity: "blocking" | "high" | "info";
  sourceScope: "supplemental" | "total" | null;
  supplementIds: readonly string[];
  threshold: number | null;
  unit: string | null;
}>;

export type PlanQuestion = Readonly<{
  choices: readonly Readonly<{
    choice: string;
    effect: string;
    label: string;
  }>[];
  prompt: string;
  promptKey: string;
  questionId: string;
}>;

export type StackOption = Readonly<{
  basket: readonly BasketItem[];
  coverage: readonly CoverageRow[];
  coveragePercent: number;
  dailyPills: number;
  matcherVersion: string;
  optionId: string;
  reason: string;
  snapshotId: string;
  totalPriceMinor: number;
}>;

export type PlanResult = Readonly<{
  alternatives: readonly StackOption[];
  appliedRequirements: readonly string[];
  assumptions: readonly string[];
  availabilityAsOf: string;
  basket: readonly BasketItem[];
  catalogueVersion: string;
  changeSummary: readonly string[];
  coverage: readonly CoverageRow[];
  guidanceRulesVersion: string;
  leftovers: readonly PlanLeftover[];
  matcherTelemetry: MatcherTelemetry;
  optimizationEvidence: Readonly<{
    mode: OptimizationMode;
    tieBreak: readonly string[];
  }>;
  questions: readonly PlanQuestion[];
  requestSnapshot: CanonicalPlanState;
  safetyGuidance: readonly SafetyGuidance[];
  selected: StackOption | null;
  status: "blocked" | "needs_input" | "processing" | "ready";
  summary: string;
  unmetRequirements: readonly string[];
}>;
