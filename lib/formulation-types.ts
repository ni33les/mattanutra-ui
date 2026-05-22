export type FormulationStatus = "covered" | "add" | "review";
export type FormulationSafetyAction =
  | "dose_reduced"
  | "human_review"
  | "unknown_supplement";
export type FormulationSafetyVisibility = "hidden" | "visible";
export type FoodGuidanceSafetyAction =
  | "allergen_blocked"
  | "avoidance_blocked"
  | "condition_review"
  | "human_review"
  | "unknown_food";

export type LocalizedText =
  | string
  | {
      en: string;
      th: string;
    };

export type FormulationCaution = {
  body: LocalizedText;
  id: string;
  relatedAnswerKeys?: string[];
  severity: "caution" | "info" | "review";
  title?: LocalizedText;
};

export type FormulationIngredient = {
  benefitTags?: string[];
  category: string;
  cautions?: FormulationCaution[];
  dailyDose: LocalizedText;
  effectivenessRank: number;
  id: string;
  rationale: LocalizedText;
  safety?: {
    action: FormulationSafetyAction;
    message: LocalizedText;
    originalDailyDose?: LocalizedText;
    reviewId?: string;
    reviewTaskId?: string;
    visibility: FormulationSafetyVisibility;
  };
  status: FormulationStatus;
  supplement: LocalizedText;
};

export type FoodGuidanceItem = {
  benefitTags?: string[];
  category: string;
  effectivenessRank: number;
  food: LocalizedText;
  frequency: LocalizedText;
  id: string;
  nutrientFacts?: {
    amountPer100g: number;
    amountPerServing: number;
    category: string;
    confidence: "high" | "low" | "moderate" | null;
    label: string;
    nutrientId: string;
    servingGrams: number;
    source: string | null;
    unit: string;
  }[];
  nutrientTags?: string[];
  rationale: LocalizedText;
  safety?: {
    action: FoodGuidanceSafetyAction;
    message: LocalizedText;
    reviewId?: string;
    reviewTaskId?: string;
    visibility: FormulationSafetyVisibility;
  };
  serving: LocalizedText;
  status: FormulationStatus;
};

export type RecommendedProduct = {
  affiliate?: boolean;
  covers: string[];
  description: string;
  id: string;
  imageUrl?: string | null;
  marketplace: "Imported product" | "Lazada Thailand" | "Shopee Thailand";
  name: string;
  price?: {
    amount: number;
    currency: string;
  } | null;
  priority: number;
  productCoveragePercent?: number;
  productId?: string;
  rank?: number;
  recommendationRunId?: string;
  servingMultiplier?: number;
  stackContributionPercent?: number;
  stackCoveragePercent?: number;
  tag: string;
  url: string;
};

export type MarketingPoint = {
  body: LocalizedText;
  id: string;
  title: LocalizedText;
};

export type PlanChatMessage = {
  body: string;
  createdAt: string;
  id: string;
  metadata?: Record<string, unknown>;
  replyToMessageId?: string | null;
  role: "assistant" | "user";
  status: "failed" | "queued" | "ready";
  taskId?: string | null;
};

export type PlanGuidanceAdjustment = {
  action: "remove";
  createdAt?: string;
  id?: string;
  itemId?: string | null;
  itemName: string;
  itemType: "food" | "supplement";
  reason?: string | null;
  sourceMessageId?: string | null;
  sourceTaskId?: string | null;
  status?: "active" | "revoked";
};

export type PlanFeedbackType =
  | "budget"
  | "capsule_limit"
  | "constraint"
  | "cuisine"
  | "dislike"
  | "preference"
  | "removal"
  | "routine"
  | "safety_disclosure"
  | "other";

export type PlanFeedbackItem = {
  body: string;
  createdAt?: string;
  feedbackType: PlanFeedbackType;
  id?: string;
  itemId?: string | null;
  itemName?: string | null;
  itemType?: "condition" | "food" | "other" | "plan" | "supplement" | null;
  metadata?: Record<string, unknown>;
  sourceMessageId?: string | null;
  sourceTaskId?: string | null;
  status?: "active" | "revoked";
  urgency?: "normal" | "safety";
};

export type NutritionReportSection = {
  body: LocalizedText;
  id: string;
  title: LocalizedText;
};

export type NutritionReport = {
  dailyFocus: NutritionReportSection[];
  generatedAt?: string;
  nextSteps: NutritionReportSection[];
  planId?: string;
  safetyNotes: LocalizedText[];
  summary: LocalizedText;
  synergies: NutritionReportSection[];
  title: LocalizedText;
  version?: number;
};

export type ProductRecommendationStatus = "failed" | "partial" | "pending" | "ready";
export type ProductStackPreference = "balanced" | "compact" | "max_coverage";

export type ProductNeedCoverage = {
  bestRejectedProductId: string | null;
  bestRejectedReason: string | null;
  coveragePercent: number;
  displayName: string;
  id: string;
  itemType: "food" | "supplement";
};

export type ProductRecommendationSummary = {
  generatedAt?: string;
  matchedCount: number;
  needCoverage?: ProductNeedCoverage[];
  needsCount: number;
  notes?: string;
  runId?: string;
  stackCoveragePercent: number;
  stackPreference?: ProductStackPreference;
  status: ProductRecommendationStatus;
};

export type ProductRecommendationOption = {
  id: ProductStackPreference;
  maxProducts?: number | null;
  productRecommendations: ProductRecommendationSummary;
  recommendations: RecommendedProduct[];
};

export type AssessmentSummary = {
  constraints: string[];
  goals: string[];
  plan: string;
  profile: string;
  region: string;
};

export type FormulationBlueprint = {
  cautions?: FormulationCaution[];
  marketingPoints?: MarketingPoint[];
  safetySummary?: {
    adjustedCount: number;
    hiddenCount: number;
    removedCount: number;
    reviewCount: number;
  };
  supplementBreakdown: FormulationIngredient[];
};

export type FoodGuidanceBlueprint = {
  foodGuidance: FoodGuidanceItem[];
  foodSafetySummary?: {
    adjustedCount: number;
    hiddenCount: number;
    removedCount: number;
    reviewCount: number;
  };
};

export type NutritionSectionStatus = "failed" | "pending" | "ready";

export type FormulationResult = FormulationBlueprint & FoodGuidanceBlueprint & {
  access?: "full" | "preview";
  assessmentSummary: AssessmentSummary;
  generatedAt: string;
  lockedFoodCount?: number;
  lockedSupplementCount?: number;
  nutritionReport?: NutritionReport | null;
  planId: string;
  previewLimit?: number;
  productRecommendationOptions?: ProductRecommendationOption[];
  productRecommendations?: ProductRecommendationSummary;
  recommendations: RecommendedProduct[];
  schemaVersion: 1;
  sectionStatuses?: {
    foods: NutritionSectionStatus;
    report?: NutritionSectionStatus;
    supplements: NutritionSectionStatus;
  };
  totalFoodCount?: number;
  totalSupplementCount?: number;
};
