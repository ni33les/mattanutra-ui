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
  dietaryPreference?: "any" | "plant_based";
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

export type MatcherTelemetry = Readonly<{
  constraints: PlanRequirements &
    Readonly<{
      conditionCodes: readonly string[];
      medicationCodes: readonly string[];
    }>;
  coveragePercent: number | null;
  leftovers: readonly PlanLeftover[];
  productIds: readonly string[];
  productSkus: readonly string[];
  requestedDoses: readonly Readonly<{
    amount: number;
    name: string;
    unit: CatalogueUnit;
  }>[];
  requestedNames: readonly string[];
  selectedOptionId: string | null;
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
  incompleteCommercialFacts: boolean;
  lineTotalMinor: number;
  productId: string;
  productName: string;
  quantity: number;
  retailerSku: string;
  sellerId: string;
  sellerName: string;
  source: "fixture" | "retail";
  stockStatus: "backorder" | "in_stock";
  unitPriceMinor: number;
}>;

export type CoverageRow = Readonly<{
  coveragePercent: number;
  currentAmount: number;
  deliveredAmount: number;
  name: string;
  percentOfUpperLimit: number | null;
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
  productIds: readonly string[];
  rulesVersion: string;
  severity: "blocking" | "high" | "info";
  supplementIds: readonly string[];
  threshold: number | null;
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
  optionId: string;
  reason: string;
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
  status: "blocked" | "needs_input" | "ready";
  summary: string;
  unmetRequirements: readonly string[];
}>;
