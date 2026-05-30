import type { ParsedDose } from "@/lib/dose-conversion";
import type { ValidationResult } from "@/lib/product-validation";

export type ProductStatus =
  | "approved"
  | "ignored"
  | "pending_review";

export type ProductPlatform = "lazada" | "manual" | "shopee";
export type ProductKind = "food" | "multi" | "other" | "supplement";
export type ProductAudience = "both" | "female" | "male";
export type ProductClientSex = "female" | "male";
export type ProductAvailabilityStatus =
  | "in_stock"
  | "out_of_stock"
  | "unavailable"
  | "unknown";
export type ProductConfidence = "high" | "low" | "moderate";

export type ProductRecommendationNeed = Readonly<{
  aliasKeys?: readonly string[];
  category: string;
  displayName: string;
  id: string;
  itemType: "food" | "nutrient" | "supplement";
  normalizedName: string;
  sourceId: string;
  targetComparableAmount: number | null;
  targetDose: ParsedDose | null;
  targetText: string | null;
  weight: number;
}>;

export type ProductCandidateFact = Readonly<{
  aliasKeys?: readonly string[];
  amount: number | null;
  comparableAmount: number | null;
  confidence: ProductConfidence;
  foodId?: string | null;
  itemType: "food" | "nutrient" | "supplement";
  maxAmount?: number | null;
  maxUnit?: string | null;
  name: string;
  normalizedName: string;
  nutrientId?: string | null;
  servingLabel?: string | null;
  safetyFlags?: readonly string[];
  supplementAudience?: ProductAudience | null;
  supplementId?: string | null;
  unit: string | null;
}>;

export type ProductCandidate = Readonly<{
  activeOfferId?: string | null;
  activeAffiliateUrl?: string | null;
  activeAffiliateCommissionRate?: number | null;
  activeAffiliatePriority?: number | null;
  activeAffiliateType?: "affiliate" | "direct" | null;
  affiliateStatus: "active" | "flagged_stale" | "none";
  automatedSafetyPassed: boolean;
  availabilityStatus: ProductAvailabilityStatus;
  availableCountryCodes?: readonly string[];
  brandName?: string | null;
  brandStatus?: ProductStatus | null;
  currency: string;
  facts: ProductCandidateFact[];
  id: string;
  imageUrl?: string | null;
  labelStatus: "failed" | "missing" | "parsed" | "stale";
  status: ProductStatus;
  platform: ProductPlatform;
  productAudience?: ProductAudience | null;
  productKind?: ProductKind | null;
  validation?: ValidationResult | null;
  priceAmount?: number | null;
  productDataExpiresAt?: string | null;
  productUrl: string;
  region: string;
  title: string;
  translations?: Record<string, {
    description?: string | null;
    status?: string | null;
    title?: string | null;
  }>;
}>;

export type ProductRecommendationExclusion = Readonly<{
  productId: string;
  reason: string;
  title: string;
}>;

export type ProductRecommendationNeedDiagnostic = Readonly<{
  bestRejectedProductId: string | null;
  bestRejectedReason: string | null;
  displayName: string;
  id: string;
  itemType: ProductRecommendationNeed["itemType"];
  coveragePercent: number;
}>;

export type ProductRecommendationAlgorithmVersion =
  | "v2-exact-shortlist"
  | "v2-full-beam";
export type ProductStackPreference = "balanced" | "compact";

export type ProductRecommendationDiagnostics = Readonly<{
  algorithmVersion?: ProductRecommendationAlgorithmVersion;
  blockedProducts: ProductRecommendationExclusion[];
  coverage: {
    foodCoveragePercent: number;
    supplementProductCoveragePercent: number;
    totalPlanCoveragePercent: number;
  };
  factIssues: ProductRecommendationExclusion[];
  matchedNeeds: ProductRecommendationNeedDiagnostic[];
  marketRegion?: string;
  nearMisses: Array<Readonly<{
    coveragePercent: number;
    productId: string;
    reason: string;
    title: string;
  }>>;
  productsConsidered: number;
  stackPreference?: ProductStackPreference;
  trace?: ProductRecommendationTrace;
  unmatchedNeeds: ProductRecommendationNeedDiagnostic[];
}>;

export type ProductRecommendationSelection = Readonly<{
  affiliate: boolean;
  offerId: string | null;
  coveredNeeds: ProductRecommendationNeed[];
  product: ProductCandidate;
  productCoveragePercent: number;
  rank: number;
  score: number;
  servingMultiplier: number;
  stackContributionPercent: number;
  url: string;
  unknownAtRecommendation: boolean;
  why: string;
}>;

export type ProductRecommendationResult = Readonly<{
  clientNeeds: ProductRecommendationNeed[];
  diagnostics: ProductRecommendationDiagnostics;
  exclusions: ProductRecommendationExclusion[];
  recommendations: ProductRecommendationSelection[];
  supplementProductCoveragePercent: number;
  foodCoveragePercent: number;
  totalPlanCoveragePercent: number;
  stackCoveragePercent: number;
}>;

export type ProductRecommendationClientContext = Readonly<{
  budgetAmount?: number | null;
  budgetPreference?: string | null;
  conditions?: readonly string[];
  currentSupplements?: string | null;
  guidanceAdjustmentCount?: number;
  lifestage?: string | null;
  medicationTypes?: readonly string[];
  medications?: string | null;
  pillLimit?: string | null;
  planFeedbackTypes?: readonly string[];
  preferredForm?: string | null;
}>;

export type ProductRecommendationInput = Readonly<{
  budgetAmount?: number | null;
  candidates: ProductCandidate[];
  clientContext?: ProductRecommendationClientContext | null;
  clientSex?: ProductClientSex | null;
  countryCode?: string | null;
  maxProducts?: number;
  needs: ProductRecommendationNeed[];
  stackPreference?: ProductStackPreference | null;
  targetProducts?: number;
}>;

export type ProductRecommendationTrace = Readonly<{
  alternativeStacks: Array<Readonly<{
    productIds: string[];
    productTitles: string[];
    score: number;
    supplementProductCoveragePercent: number;
    totalPlanCoveragePercent: number;
  }>>;
  candidatePoolSize?: number;
  componentScores: Record<string, number>;
  contextSignals: Record<string, unknown>;
  evaluatedStackCount?: number;
  excludedPredicates: ProductRecommendationExclusion[];
  maxProducts?: number;
  searchMode?: "full-beam" | "shortlist";
  shortfalls: Array<Readonly<{
    coveragePercent: number;
    displayName: string;
    id: string;
    shortfallPercent: number;
  }>>;
  shortlistSize: number;
  stackPreference?: ProductStackPreference;
  targetProducts?: number;
  timingMs?: Record<string, number>;
  utilityScore: number;
  weightDeltas: Record<string, number>;
  weights: Record<string, number>;
}>;
