import type { LocaleCode } from "@/lib/i18n";

export type LocalizedHealthScoreText =
  | string
  | Readonly<Record<LocaleCode, string>>;

export type HealthScoreDomainId =
  | "activity"
  | "biomarkers"
  | "habits"
  | "nutrition"
  | "sleep"
  | "stress";

export type PillarName =
  | "Activity & Fitness"
  | "Health Habits"
  | "Nutrition & Diet"
  | "Sleep & Recovery"
  | "Stress & Balance";

export type HealthScoreDomain = Readonly<{
  description: string;
  id: HealthScoreDomainId;
  label: string;
  score: number;
}>;

export type HealthScoreMover = Readonly<{
  impact: string;
  label: string;
}>;

export type HealthScorePaywallFeature = Readonly<{
  description: LocalizedHealthScoreText;
  name: LocalizedHealthScoreText;
}>;

export type HealthScoreAdvice = Readonly<{
  paywallEyebrow?: LocalizedHealthScoreText;
  paywallFeatures?: HealthScorePaywallFeature[];
  paywallSubtitle?: LocalizedHealthScoreText;
  paywallTitle?: LocalizedHealthScoreText;
  overview: LocalizedHealthScoreText;
  focusArea?: LocalizedHealthScoreText;
  howToImprove?: LocalizedHealthScoreText;
}>;

export type HealthScoreFinding = Readonly<{
  body: string;
  code: string;
  headline: string;
  icon: string;
}>;

export type HealthScoreGapCard = Readonly<{
  body: string;
  headline: string;
  tag: string;
  value: string;
}>;

export type HealthScoreMethodCard = Readonly<{
  body: string;
  title: string;
}>;

export type HealthScorePageAiCard = Readonly<{
  body: LocalizedHealthScoreText;
  headline?: LocalizedHealthScoreText;
  title?: LocalizedHealthScoreText;
}>;

export type HealthScorePageAiCopy = Readonly<{
  bandLine?: LocalizedHealthScoreText;
  gapTrio?: HealthScorePageAiCard[];
  heroBody?: LocalizedHealthScoreText;
  heroTitle?: LocalizedHealthScoreText;
  findings?: HealthScorePageAiCard[];
  findingsHeadline?: LocalizedHealthScoreText;
  findingsSub?: LocalizedHealthScoreText;
  highestLeverageBody?: LocalizedHealthScoreText;
  methodCards?: HealthScorePageAiCard[];
  methodHeadline?: LocalizedHealthScoreText;
  overview?: LocalizedHealthScoreText;
  paywallFeatures?: HealthScorePaywallFeature[];
  paywallSubtitle?: LocalizedHealthScoreText;
  paywallTitle?: LocalizedHealthScoreText;
  pillarHeadline?: LocalizedHealthScoreText;
  relativityHeadline?: LocalizedHealthScoreText;
  relativitySub?: LocalizedHealthScoreText;
  strengthNote?: LocalizedHealthScoreText;
  subtractionBody?: LocalizedHealthScoreText;
}>;

export type HealthScoreSubtractionMode = "nutrients" | "products";

export type HealthScoreSubtraction = Readonly<{
  chosen: number;
  evaluated: number;
  mode: HealthScoreSubtractionMode;
  setAside: number;
}>;

export type HealthScorePillarContent = Readonly<{
  goalLinked: boolean;
  id: HealthScoreDomainId;
  label: string;
  tag: string | null;
  value: number;
}>;

export type HealthScorePageContent = Readonly<{
  aiCopy?: HealthScorePageAiCopy;
  copySeeds: Readonly<{
    bandLine: string;
    findings: HealthScoreFinding[];
    findingsHeadline: string;
    findingsMode: "caught" | "strengths";
    findingsSub: string;
    gapTrio: HealthScoreGapCard[];
    goalMirror: string;
    heroBody: string;
    highestLeverage: null | Readonly<{
      pillar: string;
      text: string;
      value: number;
    }>;
    methodCards: HealthScoreMethodCard[];
    methodHeadline: string;
    pillarHeadline: string;
    relativity: Readonly<{
      gap?: number;
      headline: string;
      mode: "gap" | "rank";
      spectrumMedian: number;
      spectrumYou: number;
      sub: string;
    }>;
    strengthNote: string | null;
    subtraction: HealthScoreSubtraction & Readonly<{
      body: string;
      labelChosen: string;
      labelEvaluated: string;
      labelSetAside: string;
    }>;
  }>;
  locked: Readonly<{
    band: string;
    flagCodes: string[];
    median: number;
    nutrientsChosen: number;
    nutrientsEvaluated: number;
    percentile: number;
    pillars: HealthScorePillarContent[];
    score: number;
    subtraction: HealthScoreSubtraction;
  }>;
  meta: Readonly<{
    engineScore: number;
    findingCount: number;
    relativityMode: "gap" | "rank";
    subtractionKey: string;
  }>;
}>;

export type HealthScoreResult = Readonly<{
  advice?: HealthScoreAdvice;
  band: string;
  domains: HealthScoreDomain[];
  flagCodes?: string[];
  headline: string;
  movers: HealthScoreMover[];
  pageContent?: HealthScorePageContent;
  raw?: number;
  score: number;
  selfReport?: number;
  summary: string;
  symptomMultiplier?: number;
  verification?: number;
  version?: "healthscore:v4" | string;
}>;
