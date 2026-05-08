export type FormulationStatus = "covered" | "add" | "review";

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
  supplementBreakdown: FormulationIngredient[];
};

export type FormulationResult = FormulationBlueprint & {
  assessmentSummary: AssessmentSummary;
  generatedAt: string;
  planId: string;
  recommendations: RecommendedProduct[];
  schemaVersion: 1;
};
