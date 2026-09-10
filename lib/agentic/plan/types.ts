import type { IntakeObservation } from "@/lib/agentic/contract/schemas";
export type { IntakeObservation } from "@/lib/agentic/contract/schemas";
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

export type TargetImportance = "conditional" | "core" | "optional" | "required";

export type TargetPrerequisiteStatus = "satisfied" | "unknown" | "unsatisfied";

export type TargetAcceptableRange = Readonly<{
  maximum: number;
  minimum: number;
  unit: CatalogueUnit;
}>;

export type TargetPrerequisite = Readonly<{
  nextAction?: string;
  reasonCode?: string;
  status: TargetPrerequisiteStatus;
}>;

export type PlanTarget = Readonly<{
  basis?: "total_daily" | "supplemental";
  acceptableRange?: TargetAcceptableRange;
  amount: number;
  importance?: TargetImportance;
  name: string;
  prerequisite?: TargetPrerequisite;
  requestedName?: string;
  supplementId: string;
  unit: CatalogueUnit;
}>;

export type CurrentSupplement = Readonly<{
  dailyAmount: number;
  daysRemaining?: number;
  durationUnknown?: boolean;
  name: string;
  productId?: string;
  supplementId: string;
  unit: CatalogueUnit;
}>;

export type PlanRequirements = Readonly<{
  preferenceImportance?: import("@/lib/matcher/types").PreferenceImportanceMap;
  allowedForms?: readonly string[];
  dietaryPreference?: "any" | "plant_based" | "vegan";
  excludeSupplementIds?: readonly string[];
  excludeProductIds?: readonly string[];
  maxDailyPills?: number | null;
  maxPriceMinor?: number | null;
  maxProductCount?: number | null;
  productDoses?: readonly Readonly<{ productId: string; servingsPerDay: number }>[];
  omega3SourcePreference?: "algae_only" | "any" | "fish_allowed";
  retainProductIds?: readonly string[];
  retainSupplementIds?: readonly string[];
}>;

export type PlanProfile = Readonly<{
  ageYears: number;
  goals?: readonly string[];
  lifeStage: LifeStage;
  sex?: "female" | "male";
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
  basis?: "total_daily" | "supplemental";
  acceptableRange?: TargetAcceptableRange;
  amount: number;
  importance?: TargetImportance;
  name: string;
  prerequisite?: TargetPrerequisite;
  supplementId?: string;
  unit: CatalogueUnit;
}>;

export type PlanRequestCurrent = Readonly<{
  dailyAmount: number;
  daysRemaining?: number;
  name: string;
  productId?: string;
  supplementId?: string;
  unit: CatalogueUnit;
}>;

export type PlanBaseline = Readonly<{
  items?: readonly Readonly<{
    dailyServings?: number;
    daysRemaining?: number;
    productId: string;
    quantity: number;
  }>[];
  type: "current_basket" | "separate_direct_products";
}>;

export type PlanRequest = Readonly<{
  answers?: readonly PlanAnswer[];
  baseline?: PlanBaseline;
  conditionCodes?: readonly string[];
  costHorizonsDays?: readonly number[];
  currentSupplements?: readonly PlanRequestCurrent[];
  intake?: readonly IntakeObservation[];
  destinationCountry: string;
  locale: string;
  medicationCodes?: readonly string[];
  optimization: OptimizationMode;
  profile: Partial<PlanProfile>;
  requirements: PlanRequirements;
  safetyAcknowledgement?: SafetyAcknowledgement;
  targets: readonly PlanRequestTarget[];
}>;

export type PlanRequestPatch = Partial<Omit<PlanRequest, "profile" | "requirements" | "baseline">> & Readonly<{ profile?: Partial<PlanProfile>; requirements?: Partial<PlanRequirements>; baseline?: Partial<PlanBaseline> }>;

export type AcceptedGap = Readonly<{
  revision: number;
  supplementId: string;
}>;

export type PlanLeftoverReason =
  | "dose_gap"
  | "not_in_catalogue"
  | "uncovered"
  | "unsupported_unit_conversion"
  | "weaker_sku";

export type PlanLeftover = Readonly<{
  amount?: number;
  name: string;
  note?: string;
  reason: PlanLeftoverReason;
  source?: "target" | "current_supplement";
  requestIndex?: number;
  severity: "high" | "low" | "medium";
  supplementId?: string;
  unit?: CatalogueUnit;
}>;

export type CanonicalPlanState = Readonly<{
  searchEffort?: "standard" | "expanded";
  acceptedGaps: readonly AcceptedGap[];
  acknowledgedUnassessedConditionCodes?: readonly string[];
  acknowledgedUnassessedMedicationCodes?: readonly string[];
  baseline?: PlanBaseline;
  conditionCodes: readonly string[];
  currency: string;
  currentSupplements: readonly CurrentSupplement[];
  intake?: readonly IntakeObservation[];
  profileKnown?: Readonly<{ ageYears: boolean; lifeStage: boolean; sex: boolean }>;
  originalRequest?: PlanRequest;
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
  targetSetHash?: string;
  targetClassifications?: readonly TargetClassification[];
  factLedgerHash?: string;
  factLedger?: readonly FactLedgerRow[];
  lossCertificates?: readonly Readonly<{
    candidate_fact_id: string | null;
    candidate_product_id: string;
    catalogue_id: string;
    conflicting_product_ids: readonly string[];
    conflicting_rule_id: string;
    exposure_after: number | null;
    exposure_before: number | null;
    limit: number | null;
    rejection_class: string;
    target_supplement_id: string;
    unit: string | null;
  }>[];
  targetFrontiers?: readonly Readonly<{
    name: string;
    productIds: readonly string[];
    subjectId: string;
  }>[];
}>;

export type FactLedgerRow = Readonly<{
  amount: number;
  canonicalSupplementId: string;
  catalogueId: string;
  normalizationRuleId: string;
  productFactId: string;
  productId: string;
  unit: string;
}>;

export type BasketNutrient = Readonly<{
  amount: number;
  name: string;
  unit: CatalogueUnit;
}>;

export type CoverageContributor = Readonly<{
  amount: number;
  productId?: string;
  productName: string;
  source?: "current" | "selected" | "diet";
  unit: CatalogueUnit;
}>;

export type SelectionReason = Readonly<{
  code:
    | "best_available"
    | "best_available_dose"
    | "consolidates_targets"
    | "covers_target"
    | "dedicated_unavailable"
    | "reduces_cost"
    | "reduces_pills"
    | "retained_by_user";
  message: string;
  messageKey: string;
  requestedNames?: readonly string[];
  requestedSupplementIds: readonly string[];
}>;

export type PublicLabelFact = Readonly<{
  name: string; amount: number | null; unit: string | null;
  confidence: "high" | "moderate" | "low";
  mappingStatus: "verified" | "unverified" | "conflicting";
  sourceUrl: string | null; sourceText: string | null;
}>;
export type BasketItem = Readonly<{
  labelledFacts?: readonly PublicLabelFact[];
  administration?: import("@/lib/product-administration").ProductAdministration | null;
  pillCountKnown?: boolean;
  availabilityAsOf: string;
  availableServings?: number | null;
  contributionSupplementIds: readonly string[];
  currency: string;
  dailyPills: number;
  daysOfSupply?: number | null;
  deliveryWindow: string | null;
  fixture: boolean;
  form: string;
  imageUrl: string | null;
  incidentalNutrientNames: readonly string[];
  incidentalNutrients: readonly BasketNutrient[];
  incompleteCommercialFacts: boolean;
  leftoverServings30?: number | null;
  leftoverServings90?: number | null;
  lineTotalMinor: number;
  pillsPerServing: number;
  servingsPerPack?: number | null;
  productId: string;
  productName: string;
  quantity: number;
  replenishmentDay?: number | null;
  requestedNutrientNames: readonly string[];
  requestedNutrients?: readonly BasketNutrient[];
  retailerSku: string;
  selectionReason?: SelectionReason;
  sellerId: string;
  sellerName: string;
  servingsPerDay: number;
  source: "fixture" | "retail";
  stockStatus: "backorder" | "in_stock";
  unitPriceMinor: number;
}>;

export type CoverageRow = Readonly<{
  referenceConfidence?: "high" | "moderate" | "low";
  basisRationale?: string | null;
  excess?: number;
  withinAgreedRange?: boolean;
  basis?: "total_daily" | "supplemental";
  totalExposureComplete?: boolean;
  intakeCertainty?: "known" | "estimated" | "unknown";
  requestedTargetId?: string;
  unresolved?: boolean;
  authorityUrl?: string | null;
  claimIds?: readonly string[];
  contributors?: readonly CoverageContributor[];
  coveragePercent: number;
  currentAmount: number;
  deliveredAmount: number;
  name: string;
  percentOfUpperLimit: number | null;
  remainingGap: number;
  requestedAmount: number;
  ruleId?: string | null;
  rulesVersion?: string | null;
  populationScope?: string | null;
  safetyLedgerVersion?: string | null;
  sourceScope?: "supplemental" | "total" | null;
  importance?: TargetImportance;
  nextAction?: string;
  reasonCode?: string;
  status:
    | "already_covered"
    | "conditional_deferred"
    | "covered"
    | "gap"
    | "optional_omitted"
    | "over_target"
    | "partial"
    | "uncovered"
    | "upper_limit_risk";
  supplementId: string;
  totalExposureAmount: number;
  unit: CatalogueUnit;
  upperLimitAmount: number | null;
}>;

export type SafetyGuidance = Readonly<{
  kind?: import("@/lib/agentic/value/advice-kind").AdviceKind;
  referenceConfidence?: "high" | "moderate" | "low";
  basisRationale?: string | null;
  comparator?: "gt" | "gte" | "lt" | "lte" | "eq" | null;
  authorityUrl?: string | null;
  evidence?: readonly string[];
  uncertainty?: string;
  uncertaintyCodes?: readonly string[];
  referenceBasis?: "continued_dose";
  action: "acknowledge" | "block" | "review";
  code:
    | "unverified_product_facts"
    | "incomplete_information"
    | "continued_dose_increased"
    | "audience_mismatch"
    | "condition_review_required"
    | "dose_review_required"
    | "duplicate_or_overlap"
    | "medication_interaction"
    | "pediatric_review_required";
  contributors: readonly CoverageContributor[];
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

export type GapReviewTarget = Readonly<{
  decisions: readonly string[];
  deliveredAmount: number;
  name: string;
  reason: string;
  remainingGap: number;
  requestedAmount: number;
  supplementId?: string;
  unit: string;
}>;

export type PlanQuestion = Readonly<{
  choices: readonly Readonly<{
    choice: string;
    effect: string;
    label: string;
    labelKey?: string;
  }>[];
  prompt: string;
  promptKey: string;
  questionId: string;
  targets?: readonly GapReviewTarget[];
}>;

export type ValueOptionRole = "lower_cost" | "simpler" | "purchase_fallback" | "requested_objective" | "fewer_concerns" | "best_value" | "complete" | "minimum_core";

export type BurdenLedger = Readonly<{
  administrationEvents: number;
  administrations: number;
  gummies: number;
  nonPillTotal: number;
  pills: number;
  productCount: number;
  softgels: number;
  tablets: number;
}>;

export type EconomicsBaselineLine = Readonly<{
  lineTotalMinor: number;
  productId: string;
  quantity: number;
  unitPriceMinor: number;
}>;

export type EconomicsComparisonBasis = Readonly<{
  baselineType: PlanBaseline["type"];
  catalogueSnapshotId: string;
  costHorizonsDays: readonly number[];
  currency: string;
  currentInventory: readonly Readonly<{
    daysRemaining: number | null;
    productId: string | null;
    supplementId: string;
  }>[];
  destinationCountry: string;
  orderBoundary: "order_at_H_excluded";
  rounding: "minor_unit_once";
}>;

export type EconomicsUnavailableReason = Readonly<{
  dependentCapabilities: readonly string[];
  dimension: "cash" | "comparison" | "consumption" | "schedule" | "shipping";
  missingFieldNames: readonly string[];
  reasonCode: string;
}>;

export type EconomicsLedger = Readonly<{
  baseline: Readonly<{
    cash90DayMinor: number | null;
    lines: readonly EconomicsBaselineLine[];
    type: PlanBaseline["type"];
  }>;
  cashComplete: boolean;
  comparisonBasis?: EconomicsComparisonBasis;
  comparisonComplete: boolean;
  cash30DayMinor: number | null;
  cash90DayMinor: number | null;
  cashTotalMinor: number;
  complete: boolean;
  consumptionComplete: boolean;
  consumptionScope: "full_horizon" | "newly_purchased";
  consumption30DayMinor: number | null;
  consumption90DayMinor: number | null;
  unavailableReasons: readonly EconomicsUnavailableReason[];
  deltas: Readonly<{
    administrations: number;
    coverage: number;
    pills: number;
    products: number;
  }>;
  equivalent: boolean;
  firstOrderSubtotalMinor: number;
  otherCustomerCostMinor: number;
  savingClaim: "loss" | "none" | "positive";
  savings90DayMinor: number | null;
  savings90DayPercent: number | null;
  shippingMinor: number;
}>;

export type OptionTradeOff = Readonly<{
  cash90DayDeltaMinor: number | null;
  coverageDelta: number;
  dailyPillsDelta: number;
}>;

export type RetainedCurrent = Readonly<{
  avoidedPurchase: true;
  daysRemaining?: number;
  name: string;
  productId?: string;
  supplementId: string;
}>;

export type OptionSafety = Readonly<{
  assessedConditionCodes: readonly string[];
  assessedMedicationCodes: readonly string[];
  guidance: readonly SafetyGuidance[];
}>;

export type PlanExplanation = Readonly<{
  administrations: number;
  cash30DayMinor: number | null;
  cash90DayMinor: number | null;
  conditionalDeferrals: readonly Readonly<{
    nextAction: string | null;
    reasonCode: string | null;
    status: string;
    supplementId: string;
  }>[];
  firstOrderCashMinor: number | null;
  nextAction: string;
  nextActionKey: string;
  optionalOmissions: readonly Readonly<{
    status: string;
    supplementId: string;
  }>[];
  pills: number | null;
  productCount: number;
  purchases: readonly Readonly<{
    lineTotalMinor: number;
    productId: string;
    productName: string;
    quantity: number;
  }>[];
  recommendedOptionId: string;
  retainedCurrent: readonly RetainedCurrent[];
  safetyState: string;
  savings90DayMinor: number | null;
}>;

export type HorizonOrderLine = Readonly<{
  lineTotalMinor: number;
  productId: string;
  quantity: number;
  unitPriceMinor: number;
}>;

export type HorizonOrder = Readonly<{
  day: number;
  inventoryAfter: number;
  inventoryBefore: number;
  lines: readonly HorizonOrderLine[];
  nextReplenishmentDay: number | null;
  otherCustomerCostMinor: number;
  productIds: readonly string[];
  quantities: readonly number[];
  shippingMinor: number;
  shippingRuleId: string;
  shippingRuleVersion: string;
  subtotalMinor: number;
  totalMinor: number;
  type: "immediate" | "replenishment";
}>;

export type HorizonPlan = Readonly<{
  /** Absent only on legacy persisted results. */
  complete?: boolean;
  unavailableReasons?: readonly EconomicsUnavailableReason[];
  durationUnknown?: boolean;
  nextReplenishmentDay: number | null;
  orders: readonly HorizonOrder[];
  purchaseRequiredNow: boolean;
  reasonCode:
    | "current_inventory_covers_now"
    | "current_inventory_duration_unknown"
    | "current_inventory_information_incomplete"
    | "purchase_now"
    | null;
  snapshotId: string;
}>;

export type CanonicalPlanStamp = Readonly<{
  buildId: string;
  canonicalVersion?: string;
  contractVersion: string;
  hash: string;
  matcherVersion: string;
  packVersion: string;
  snapshotId: string;
}>;

export type StackOption = Readonly<{
  overallScore?: import("@/lib/matcher/practical-scoring").OverallMatchingScore;
  doseFit?: import("@/lib/matcher/types").DoseFitScore;
  basket: readonly BasketItem[];
  burden?: BurdenLedger;
  cash90DayMinor?: number;
  coverage: readonly CoverageRow[];
  coveragePercent: number;
  dailyPills: number;
  deferredTargetIds?: readonly string[];
  economics?: EconomicsLedger;
  includedTargetIds?: readonly string[];
  matcherVersion: string;
  noDistinctAlternative?: boolean;
  omittedTargetIds?: readonly string[];
  optionId: string;
  reason: string;
  recommended?: boolean;
  retainedCurrent?: readonly RetainedCurrent[];
  role?: ValueOptionRole;
  roles?: readonly import("@/lib/matcher/types").ConversationalOptionRole[];
  purchaseEligible?: boolean;
  safety?: OptionSafety;
  snapshotId: string;
  totalPriceMinor: number;
  tradeOff?: OptionTradeOff;
}>;

export type PlanBreadth = Readonly<{
  maxTargetsPerRequest: number;
  reasonCode: "request_too_broad";
  suggestedGroups: readonly Readonly<{
    names: readonly string[];
    targets: readonly Readonly<{
      amount: number;
      name: string;
      unit: string;
    }>[];
  }>[];
  unsupportedTargets?: readonly Readonly<{
    amount: number;
    name: string;
    reason: "unsupported_unit_conversion";
    unit: string;
  }>[];
}>;

export type PlanResult = Readonly<{
  matchingDiagnostics?: import("@/lib/matcher/diagnostics").MatchingDiagnostics;
  searchSummary?: import("@/lib/matcher/types").MatchResult["searchSummary"];
  alternativeSearch?: import("@/lib/matcher/types").MatchResult["alternativeSearch"];
  contractVersion?: string;
  originalRequest?: PlanRequest;
  refreshRequired?: boolean;
  sourceContractVersion?: string;
  alternatives: readonly StackOption[];
  gapReview?: Readonly<{
    targets: readonly GapReviewTarget[];
  }>;
  appliedRequirements: readonly string[];
  assumptions: readonly string[];
  availabilityAsOf: string;
  basket: readonly BasketItem[];
  breadth?: PlanBreadth;
  catalogueVersion: string;
  changeSummary: readonly string[];
  claimIds?: readonly string[];
  coverage: readonly CoverageRow[];
  evidenceHandle?: string;
  guidanceRulesVersion: string;
  horizon?: HorizonPlan;
  leftovers: readonly PlanLeftover[];
  matcherTelemetry: MatcherTelemetry;
  optimizationEvidence: Readonly<{
    mode: OptimizationMode;
    tieBreak: readonly string[];
  }>;
  questions: readonly PlanQuestion[];
  /** Original, unnormalized input retained only while a new plan is processing. */
  pendingInput?: Readonly<{
    request: PlanRequest;
    searchEffort?: "standard" | "expanded";
    answers: readonly PlanAnswer[];
    safetyAcknowledgement: SafetyAcknowledgement | null;
  }>;
  researchVersion?: string;
  requestSnapshot: CanonicalPlanState;
  safetyGuidance: readonly SafetyGuidance[];
  selected: StackOption | null;
  status: "blocked" | "needs_input" | "no_purchase" | "processing" | "ready";
  summary: string;
  unmetRequirements: readonly string[];
}>;
