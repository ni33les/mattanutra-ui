export type FormulationStatus = "covered" | "add" | "review";
export type FormulationSafetyAction =
  | "dose_reduced"
  | "human_review"
  | "unknown_supplement";
export type FormulationSafetyVisibility = "hidden" | "visible";

export type LocalizedText =
  | string
  | {
      en: string;
      th: string;
    };

export type FormulationIngredient = {
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

export type AssessmentSummary = {
  constraints: string[];
  goals: string[];
  plan: string;
  profile: string;
  region: string;
};

export type FormulationBlueprint = {
  safetySummary?: {
    adjustedCount: number;
    hiddenCount: number;
    removedCount: number;
    reviewCount: number;
  };
  supplementBreakdown: FormulationIngredient[];
};

export type FormulationResult = FormulationBlueprint & {
  assessmentSummary: AssessmentSummary;
  generatedAt: string;
  planId: string;
  recommendations: RecommendedProduct[];
  schemaVersion: 1;
};
