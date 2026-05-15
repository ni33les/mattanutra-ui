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

export type FormulationIngredient = {
  benefitTags?: string[];
  category: string;
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
  covers: string[];
  description: string;
  id: string;
  marketplace: "Lazada Thailand" | "Shopee Thailand";
  name: string;
  priority: number;
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
  role: "assistant" | "user";
  status: "failed" | "queued" | "ready";
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

export type AssessmentSummary = {
  constraints: string[];
  goals: string[];
  plan: string;
  profile: string;
  region: string;
};

export type FormulationBlueprint = {
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
