import {
  factComparableAmount,
  safePercent
} from "@/lib/product-recommendation-metrics";
import {
  comparableDoseAmount,
  parseDose
} from "@/lib/dose-conversion";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  recommendProductStackFullBeam,
  productNeedCoverageSummary,
  type ProductCandidate,
  type ProductClientSex,
  type ProductRecommendationNeed
} from "@/lib/product-recommendations";

export type SyntheticPlanArchetype = Readonly<{
  age: number | null;
  clientSex: ProductClientSex | null;
  customerCount: number | null;
  description: string;
  goals: readonly string[];
  id: string;
  medications: readonly string[];
  name: string;
  needCount: number;
  preferredSupplementNames: readonly string[];
  source: "customer_archetype" | "customer_profile" | "synthetic";
}>;

export type AdminPlanCoverageDemandProfile = Readonly<{
  answers: Record<string, unknown>;
  archetypeId: string;
  archetypeName: string;
  clientSex: ProductClientSex | null;
  generatedAt: string;
  id: string;
  needs: ProductRecommendationNeed[];
  sampleIndex: number;
  supplementNames: readonly string[];
}>;

export type AdminPlanCoverageSimulationSupplement = Readonly<{
  category: string | null;
  id: string;
  name: string;
  normalizedName: string;
  targetComparableAmount: number | null;
}>;

export type AdminPlanCoverageSimulationInput = Readonly<{
  archetypes: readonly SyntheticPlanArchetype[];
  candidates: readonly ProductCandidate[];
  countryCode: string;
  demandProfiles: readonly AdminPlanCoverageDemandProfile[];
  seed: string;
  supplementGovernanceHash: string;
  supplements: readonly AdminPlanCoverageSimulationSupplement[];
}>;

export type AdminSimulationProductUsefulnessRow = Readonly<{
  averageProductCoveragePercent: number;
  averageStackContributionPercent: number;
  brandName: string | null;
  chosenCount: number;
  expectedPriceAmount: number | null;
  id: string;
  rank: number;
  title: string;
}>;

export type AdminSimulationReviewProductRow = Readonly<{
  blockedReason: string;
  brandName: string | null;
  brandStatus: ProductCandidate["brandStatus"] | null;
  coveredSupplementNames: readonly string[];
  currency: string;
  expectedPriceAmount: number | null;
  gapSupplementCount: number;
  id: string;
  matchableSupplementCount: number;
  productStatus: ProductCandidate["status"];
  rank: number;
  reviewScore: number;
  title: string;
}>;

type AdminSimulationNextMoveBase = Readonly<{
  actionType: "review_blocked_product" | "source_missing_supplement";
  nextMoveScore: number;
  rank: number;
  unmetDemandCount: number;
  unmetDemandPercent: number;
  unmetSupplementNames: readonly string[];
}>;

export type AdminSimulationProductNextMoveRow =
  AdminSimulationReviewProductRow &
    AdminSimulationNextMoveBase &
    Readonly<{
      actionType: "review_blocked_product";
      kind: "review_product";
      targetDoseText: null;
    }>;

export type AdminSimulationSourcingNextMoveRow =
  AdminSimulationNextMoveBase &
    Readonly<{
      actionType: "source_missing_supplement";
      brandName: null;
      brandStatus: null;
      blockedReason: string;
      coveredSupplementNames: readonly string[];
      currency: string;
      expectedPriceAmount: null;
      gapSupplementCount: number;
      id: string;
      kind: "source_supplement";
      matchableSupplementCount: number;
      productStatus: "pending_review";
      reviewScore: number;
      sourceSupplementName: string;
      targetDoseText: string | null;
      title: string;
    }>;

export type AdminSimulationNextMoveRow =
  | AdminSimulationProductNextMoveRow
  | AdminSimulationSourcingNextMoveRow;

export type AdminPlanCoverageUnmetDemandState =
  | "available_unselected"
  | "blocked_only"
  | "catalogue_gap"
  | "underdosed";

export type AdminPlanCoverageSimulationUnmetDemandBucket = Readonly<{
  blockedProductCount: number;
  count: number;
  eligibleProductCount: number;
  name: string;
  state: AdminPlanCoverageUnmetDemandState;
  supplementId: string | null;
  supplementKey: string;
  targetDoseText: string | null;
}>;

export type AdminPlanCoverageSimulationUnmetDemandRow =
  AdminPlanCoverageSimulationUnmetDemandBucket &
    Readonly<{
      percent: number;
    }>;

export type AdminPlanCoverageConvergenceStatus =
  | "changing"
  | "complete"
  | "insufficient_samples"
  | "stable";

export type AdminPlanCoverageSimulationSummary = Readonly<{
  averageCoveragePercent: number;
  currency: string;
  expectedCostAmount: number | null;
  medianCoveragePercent: number;
  p10CoveragePercent: number;
  percentAbove50: number;
  percentAbove75: number;
  percentAbove90: number;
}>;

export type AdminPlanCoverageConvergenceDeltas = Readonly<{
  averageCoveragePercent: number | null;
  expectedCostPercent: number | null;
  medianCoveragePercent: number | null;
  p10CoveragePercent: number | null;
  percentAbove75: number | null;
}>;

export type AdminPlanCoverageSimulationCheckpoint = Readonly<{
  sampleSize: number;
  summary: AdminPlanCoverageSimulationSummary;
  topProductIds: readonly string[];
}>;

export type AdminPlanCoverageSimulationConvergence = Readonly<{
  deltas: AdminPlanCoverageConvergenceDeltas;
  lastMeaningfulChangeSample: number | null;
  samplesSinceMeaningfulChange: number;
  stable: boolean;
  status: AdminPlanCoverageConvergenceStatus;
  topProductOverlapPercent: number | null;
  windowSize: number;
}>;

export type AdminPlanCoverageSimulationTraceProduct = Readonly<{
  brandStatus?: ProductCandidate["brandStatus"] | null;
  brandName: string | null;
  coveredNeedNames: readonly string[];
  costAmount: number | null;
  id: string;
  productStatus?: ProductCandidate["status"] | null;
  productCoveragePercent: number;
  stackContributionPercent: number;
  title: string;
}>;

export type AdminPlanCoverageSimulationSampleTrace = Readonly<{
  archetypeId: string;
  archetypeName: string;
  baselineCostAmount: number | null;
  baselineCoveragePercent: number;
  clientSex: ProductClientSex | null;
  needs: readonly ProductRecommendationNeed[];
  profileId: string | null;
  sampleIndex: number;
  selectedProductIds: readonly string[];
  selectedProducts: readonly AdminPlanCoverageSimulationTraceProduct[];
  unmetNeedIds: readonly string[];
  unmetNeedNames: readonly string[];
}>;

export type AdminCatalogueOptimizationObjective =
  "coverage_floor_min_products_min_cost";

export type AdminCatalogueOptimizationMutationMode = "none";

export type AdminCatalogueOptimizationSummary = Readonly<{
  averageCoveragePercent: number;
  expectedCostAmount: number | null;
  p10CoveragePercent: number;
  percentAbove75: number;
  productCount: number;
}>;

export type AdminCatalogueOptimizationFrontierPoint =
  AdminCatalogueOptimizationSummary &
    Readonly<{
      productIds: readonly string[];
      recommended: boolean;
      retainedAbove75Percent: number;
      retainedAverageCoveragePercent: number;
      retainedP10CoveragePercent: number;
      withinCoverageFloor: boolean;
    }>;

export type AdminCatalogueOptimizationProductRow = Readonly<{
  averageStackContributionPercent: number;
  brandStatus?: ProductCandidate["brandStatus"] | null;
  brandName: string | null;
  chosenCount: number;
  expectedPriceAmount: number | null;
  id: string;
  productStatus?: ProductCandidate["status"] | null;
  protectedPlanCount: number;
  protectedSupplementNames: readonly string[];
  rank: number;
  readiness?: "current" | "needs_review";
  readinessLabel?: string;
  title: string;
}>;

export type AdminCatalogueOptimizationActionType =
  | "carry"
  | "consider_retiring"
  | "review_first"
  | "source_missing";

export type AdminCatalogueOptimizationActionRow = Readonly<{
  actionType: AdminCatalogueOptimizationActionType;
  affectedPlanCount: number;
  affectedPlanPercent: number;
  brandName: string | null;
  coverageImpactPercent: number;
  expectedPriceAmount: number | null;
  id: string;
  productId: string | null;
  rank: number;
  reason: string;
  statusLabel: string;
  supplementId: string | null;
  title: string;
}>;

export type AdminCatalogueOptimizationData = Readonly<{
  actionRows: readonly AdminCatalogueOptimizationActionRow[];
  baseline: AdminCatalogueOptimizationSummary;
  carryProducts: readonly AdminCatalogueOptimizationProductRow[];
  coverageLossTolerancePercent: number;
  frontier: readonly AdminCatalogueOptimizationFrontierPoint[];
  generatedAt: string;
  mutationMode: AdminCatalogueOptimizationMutationMode;
  objective: AdminCatalogueOptimizationObjective;
  optimized: AdminCatalogueOptimizationSummary;
  potential: AdminCataloguePotentialOptimizationData | null;
  productReductionCount: number;
  productReductionPercent: number;
  sampleSize: number;
  status: "not_ready" | "ready";
}>;

export type AdminCataloguePotentialOptimizationData = Readonly<{
  baseline: AdminCatalogueOptimizationSummary;
  carryProducts: readonly AdminCatalogueOptimizationProductRow[];
  candidateCount: number;
  frontier: readonly AdminCatalogueOptimizationFrontierPoint[];
  generatedAt: string;
  needsReviewCount: number;
  optimized: AdminCatalogueOptimizationSummary;
  productReductionCount: number;
  productReductionPercent: number;
  sampleSize: number;
  status: "not_ready" | "ready";
}>;

export type AdminCataloguePotentialTraceChunkRequest = Readonly<{
  accessToken?: string | null;
  cacheKey?: string | null;
  chunkSize?: number | null;
  countryCode?: string | null;
  simulationData: AdminPlanCoverageSimulationData;
  startIndex?: number | null;
}>;

export type AdminCataloguePotentialTraceChunkResponse = Readonly<{
  candidateCount: number;
  candidateHash: string;
  chunkSize: number;
  chunkStartIndex: number;
  sampleTraces: readonly AdminPlanCoverageSimulationSampleTrace[];
  totalSamples: number;
}>;

export type AdminCataloguePotentialFinalizeRequest = Readonly<{
  accessToken?: string | null;
  cacheKey?: string | null;
  candidateCount: number;
  candidateHash: string;
  countryCode?: string | null;
  sampleTraces: readonly AdminPlanCoverageSimulationSampleTrace[];
  simulationData: AdminPlanCoverageSimulationData;
}>;

export type AdminCatalogueOptimizationProgressStage =
  | "actions"
  | "done"
  | "pruning"
  | "scoring"
  | "validating";

export type AdminCatalogueOptimizationProgress = Readonly<{
  current: number;
  label: string;
  stage: AdminCatalogueOptimizationProgressStage;
  total: number;
}>;

export type AdminPlanCoverageSimulationData = Readonly<{
  convergence: AdminPlanCoverageSimulationConvergence;
  countryCode: string;
  databaseAvailable: boolean;
  generatedAt: string;
  input: AdminPlanCoverageSimulationInput;
  realCustomerArchetypes: readonly SyntheticPlanArchetype[];
  realCustomerProfileCount: number;
  realCustomerProfiles: readonly SyntheticPlanArchetype[];
  sampleSize: number;
  sampleTraces: readonly AdminPlanCoverageSimulationSampleTrace[];
  seed: string;
  summary: AdminPlanCoverageSimulationSummary;
  archetypes: readonly SyntheticPlanArchetype[];
  compactCatalog: readonly AdminSimulationProductUsefulnessRow[];
  mostUsefulProducts: readonly AdminSimulationProductUsefulnessRow[];
  reviewPriorityProducts: readonly AdminSimulationReviewProductRow[];
  unmetSupplements: readonly AdminPlanCoverageSimulationUnmetDemandRow[];
}>;

export type AdminPlanCoverageSimulationProductStats = {
  brandName: string | null;
  coverageTotal: number;
  priceTotal: number;
  pricedCount: number;
  stackContributionTotal: number;
  title: string;
  chosenCount: number;
};

export type AdminPlanCoverageSimulationRunner = {
  convergenceCheckpoints: AdminPlanCoverageSimulationCheckpoint[];
  costValues: number[];
  coverageValues: number[];
  generatedAt: string;
  input: AdminPlanCoverageSimulationInput;
  productStats: Map<string, AdminPlanCoverageSimulationProductStats>;
  randomState: number;
  reviewPriorityProducts: readonly AdminSimulationReviewProductRow[];
  sampleSize: number;
  sampleTraces: AdminPlanCoverageSimulationSampleTrace[];
  unmetCounts: Map<string, AdminPlanCoverageSimulationUnmetDemandBucket>;
};

export const ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES = 256;
export const ADMIN_PLAN_COVERAGE_CONVERGENCE_CHECKPOINT_INTERVAL = 8;
export const ADMIN_PLAN_COVERAGE_CONVERGENCE_MIN_SAMPLES = 64;
export const ADMIN_PLAN_COVERAGE_CONVERGENCE_WINDOW_SIZE = 32;
export const DEFAULT_SIMULATION_SAMPLE_SIZE = 64;
export const DEFAULT_SIMULATION_SEED = "mattanutra-product-coverage-v1";

export const SIMULATION_ARCHETYPES: readonly SyntheticPlanArchetype[] = [
  {
    age: 33,
    clientSex: null,
    customerCount: null,
    description: "Mainstream office worker who wants more steady energy and fewer afternoon crashes.",
    goals: ["Energy", "Focus", "Stress"],
    id: "busy-office-professional",
    medications: [],
    name: "Busy office professional",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 29,
    clientSex: null,
    customerCount: null,
    description: "Active gym-going adult who trains several times a week and wants recovery support.",
    goals: ["Fitness", "Recovery", "Energy"],
    id: "active-gym-goer",
    medications: [],
    name: "Active gym-goer",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 39,
    clientSex: null,
    customerCount: null,
    description: "Sleep-limited parent or caregiver balancing work, family, stress, and inconsistent meals.",
    goals: ["Sleep", "Stress", "Energy"],
    id: "sleep-deprived-parent",
    medications: [],
    name: "Sleep-deprived parent",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 41,
    clientSex: null,
    customerCount: null,
    description: "Stressed founder or manager with long workdays, decision fatigue, and patchy recovery.",
    goals: ["Stress", "Sleep", "Focus"],
    id: "stressed-founder-manager",
    medications: [],
    name: "Stressed founder / manager",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 62,
    clientSex: null,
    customerCount: null,
    description: "Older adult focused on maintaining mobility, vision, heart health, and independence.",
    goals: ["Longevity", "Heart", "Joints", "Vision"],
    id: "healthy-ageing",
    medications: [],
    name: "Healthy ageing planner",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 45,
    clientSex: "female",
    customerCount: null,
    description: "Female customer in perimenopause or hormone transition focused on sleep, mood, bone, and skin.",
    goals: ["Hormones", "Sleep", "Bone", "Skin"],
    id: "perimenopause-wellness-seeker",
    medications: [],
    name: "Perimenopause wellness seeker",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 47,
    clientSex: "male",
    customerCount: null,
    description: "Male customer focused on heart health, energy, performance, and keeping a simple routine.",
    goals: ["Heart", "Energy", "Performance"],
    id: "male-performance-maintainer",
    medications: [],
    name: "Male performance maintainer",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 36,
    clientSex: null,
    customerCount: null,
    description: "Health-conscious person with a plant-forward diet who wants nutrient gap coverage.",
    goals: ["Daily coverage", "Energy", "Immunity"],
    id: "plant-forward-wellness-seeker",
    medications: [],
    name: "Plant-forward wellness seeker",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 44,
    clientSex: null,
    customerCount: null,
    description: "Frequent traveller with irregular sleep, meals, sun exposure, and stress.",
    goals: ["Immunity", "Energy", "Sleep", "Stress"],
    id: "frequent-traveller",
    medications: [],
    name: "Frequent traveller",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  },
  {
    age: 31,
    clientSex: null,
    customerCount: null,
    description: "New supplement user who wants a simple, affordable foundation without too many pills.",
    goals: ["Daily coverage", "Energy", "Immunity"],
    id: "budget-conscious-starter",
    medications: [],
    name: "Budget-conscious starter",
    needCount: 8,
    preferredSupplementNames: [],
    source: "synthetic"
  }
];

function normalizeCoverageCountryCode(value: string | null | undefined) {
  return normalizeProductCountryCode(value ?? defaultProductCountryCode) ??
    defaultProductCountryCode;
}

export function normalizeSimulationSampleSize(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.min(
      ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES,
      Math.max(8, Math.round(parsed))
    )
    : DEFAULT_SIMULATION_SAMPLE_SIZE;
}

function textOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedSupplementKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeArchetypeList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => textOrEmpty(item))
      .filter((item) => item.length > 0)
      .slice(0, 24);
  }

  return textOrEmpty(value)
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 24);
}

function normalizeArchetypeAge(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(120, Math.round(parsed)))
    : null;
}

function normalizeArchetypeSex(value: unknown): ProductClientSex | null {
  return value === "female" || value === "male" ? value : null;
}

function normalizeArchetypeNeedCount(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(12, Math.round(parsed)))
    : 4;
}

function normalizeArchetypeCustomerCount(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function normalizeArchetypeSource(
  value: unknown
): SyntheticPlanArchetype["source"] {
  return value === "customer_archetype" || value === "customer_profile"
    ? value
    : "synthetic";
}

function normalizeArchetypeId(value: unknown, index: number) {
  const normalized = textOrEmpty(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `custom-archetype-${index + 1}`;
}

export function normalizeSyntheticPlanArchetypes(value: unknown) {
  const source = Array.isArray(value) && value.length > 0
    ? value
    : SIMULATION_ARCHETYPES;
  const seenIds = new Set<string>();

  return source.map((raw, index): SyntheticPlanArchetype => {
    const record = raw && typeof raw === "object"
      ? (raw as Partial<SyntheticPlanArchetype>)
      : {};
    const baseId = normalizeArchetypeId(record.id ?? record.name, index);
    let id = baseId;
    let suffix = 2;

    while (seenIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    seenIds.add(id);

    return {
      age: normalizeArchetypeAge(record.age),
      clientSex: normalizeArchetypeSex(record.clientSex),
      customerCount: normalizeArchetypeCustomerCount(record.customerCount),
      description: textOrEmpty(record.description),
      goals: normalizeArchetypeList(record.goals),
      id,
      medications: normalizeArchetypeList(record.medications),
      name: textOrEmpty(record.name) || `Custom archetype ${index + 1}`,
      needCount: normalizeArchetypeNeedCount(record.needCount),
      preferredSupplementNames: normalizeArchetypeList(
        record.preferredSupplementNames
      ),
      source: normalizeArchetypeSource(record.source)
    };
  });
}

function recordFromUnknown(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function targetDoseFromText(input: Readonly<{
  normalizedName: string;
  targetText: string | null;
}>) {
  const targetText = input.targetText?.trim();

  return targetText ? parseDose(targetText, input.normalizedName) : null;
}

function normalizeDemandNeed(value: unknown): ProductRecommendationNeed | null {
  const record = recordFromUnknown(value);
  const displayName = textOrEmpty(record.displayName);
  const normalizedName = textOrEmpty(record.normalizedName);
  const sourceId = textOrEmpty(record.sourceId) || textOrEmpty(record.id);
  const id = textOrEmpty(record.id) || `demand:${normalizedName}`;
  const targetText = textOrEmpty(record.targetText) || null;
  const parsedTargetDose = targetDoseFromText({ normalizedName, targetText });
  const parsedTargetComparableAmount = parsedTargetDose
    ? comparableDoseAmount(parsedTargetDose, normalizedName)
    : null;

  if (!displayName || !normalizedName || !sourceId) {
    return null;
  }

  return {
    aliasKeys: Array.isArray(record.aliasKeys)
      ? record.aliasKeys.flatMap((item) => {
          const text = textOrEmpty(item);

          return text ? [text] : [];
        })
      : undefined,
    category: textOrEmpty(record.category) || "Supplement",
    displayName,
    id,
    itemType: "supplement",
    normalizedName,
    sourceId,
    targetComparableAmount:
      parsedTargetComparableAmount ??
      positiveNumberOrNull(record.targetComparableAmount),
    targetDose: parsedTargetDose ??
      (record.targetDose && typeof record.targetDose === "object"
        ? record.targetDose as ProductRecommendationNeed["targetDose"]
        : null),
    targetText,
    weight: Math.max(1, Math.min(12, Math.round(Number(record.weight) || 1)))
  };
}

export function normalizeDemandProfiles(value: unknown) {
  const source = Array.isArray(value) ? value : [];

  return source.flatMap((raw, index): AdminPlanCoverageDemandProfile[] => {
    const record = recordFromUnknown(raw);
    const needs = Array.isArray(record.needs)
      ? record.needs.flatMap((need) => {
          const normalized = normalizeDemandNeed(need);

          return normalized ? [normalized] : [];
        })
      : [];
    const id = textOrEmpty(record.id) || `generated-demand-${index + 1}`;

    if (needs.length < 1) {
      return [];
    }

    return [{
      answers: recordFromUnknown(record.answers),
      archetypeId: textOrEmpty(record.archetypeId) || "unknown-archetype",
      archetypeName: textOrEmpty(record.archetypeName) || "Generated profile",
      clientSex: normalizeArchetypeSex(record.clientSex),
      generatedAt: textOrEmpty(record.generatedAt) || new Date().toISOString(),
      id,
      needs,
      sampleIndex: Math.max(0, Math.round(Number(record.sampleIndex) || index)),
      supplementNames:
        Array.isArray(record.supplementNames)
          ? record.supplementNames.flatMap((item) => {
              const text = textOrEmpty(item);

              return text ? [text] : [];
            })
          : needs.map((need) => need.displayName)
    }];
  });
}

export function sanitizeDemandProfilesForSimulationSupplements(
  profiles: readonly AdminPlanCoverageDemandProfile[],
  supplements: readonly AdminPlanCoverageSimulationSupplement[]
) {
  const allowedKeys = new Set(
    supplements.flatMap((supplement) => [
      supplement.id,
      supplement.normalizedName,
      normalizedSupplementKey(supplement.name)
    ])
  );

  if (allowedKeys.size < 1) {
    return [];
  }

  return profiles.flatMap((profile): AdminPlanCoverageDemandProfile[] => {
    const needs = profile.needs.filter((need) => {
      const keys = [
        need.sourceId,
        need.id.replace(/^supplement:/, ""),
        need.normalizedName,
        normalizedSupplementKey(need.displayName)
      ];

      return keys.some((key) =>
        allowedKeys.has(key) || allowedKeys.has(normalizedSupplementKey(key))
      );
    });

    if (needs.length < 1) {
      return [];
    }

    return [{
      ...profile,
      needs,
      supplementNames: needs.map((need) => need.displayName)
    }];
  });
}

function positiveNumberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function median(values: readonly number[]) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);

  if (sorted.length < 1) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle] ?? 0
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function percentile(values: readonly number[], percentileRank: number) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);

  if (sorted.length < 1) {
    return 0;
  }

  const index = Math.max(
    0,
    Math.min(
      sorted.length - 1,
      Math.floor((percentileRank / 100) * sorted.length)
    )
  );

  return sorted[index] ?? 0;
}

function average(values: readonly number[]) {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function normalizedSearchTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

const archetypeGoalAliases: Record<string, readonly string[]> = {
  ageing: ["age", "bone", "calcium", "coq10", "heart", "joint", "lutein", "omega", "vision"],
  anxiety: ["magnesium", "sleep", "stress"],
  bone: ["calcium", "vitamin d", "k2"],
  cholesterol: ["coq10", "heart", "omega"],
  energy: ["b12", "b vitamin", "coq10", "iron"],
  focus: ["b12", "omega"],
  heart: ["coq10", "omega"],
  immune: ["vitamin c", "vitamin d", "zinc"],
  joint: ["collagen", "glucosamine", "omega"],
  menopause: ["bone", "calcium", "vitamin d"],
  performance: ["magnesium", "protein", "recovery"],
  recovery: ["magnesium", "protein"],
  skin: ["collagen", "vitamin c"],
  sleep: ["magnesium", "melatonin"],
  stress: ["b complex", "magnesium"],
  vision: ["lutein", "zeaxanthin"]
};

function archetypeSearchTokens(archetype: SyntheticPlanArchetype) {
  const tokens = new Set<string>();
  const sourceText = [
    archetype.name,
    archetype.description,
    ...archetype.goals,
    ...archetype.medications,
    ...archetype.preferredSupplementNames
  ].join(" ");

  for (const token of normalizedSearchTokens(sourceText)) {
    tokens.add(token);

    for (const alias of archetypeGoalAliases[token] ?? []) {
      tokens.add(alias);
    }
  }

  if (archetype.age !== null && archetype.age >= 55) {
    for (const token of ["age", "ageing", "bone", "heart", "joint", "vision"]) {
      tokens.add(token);
    }
  }

  return [...tokens];
}

function supplementArchetypeScore(
  supplement: AdminPlanCoverageSimulationSupplement,
  archetype: SyntheticPlanArchetype,
  tokens: readonly string[]
) {
  const haystack = [
    supplement.category,
    supplement.name,
    supplement.normalizedName
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const preferredScore = archetype.preferredSupplementNames.reduce(
    (total, supplementName) => {
      const normalized = supplementName.toLowerCase();

      return total + (normalized && haystack.includes(normalized) ? 20 : 0);
    },
    0
  );
  const tokenScore = tokens.reduce(
    (total, token) => total + (haystack.includes(token) ? 1 : 0),
    0
  );

  return preferredScore + tokenScore;
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function initialRandomState(seed: string) {
  return hashSeed(seed) || 1;
}

function nextRunnerRandom(runner: AdminPlanCoverageSimulationRunner) {
  runner.randomState = Math.imul(
    runner.randomState ^ (runner.randomState >>> 15),
    1 | runner.randomState
  );
  runner.randomState ^=
    runner.randomState +
    Math.imul(runner.randomState ^ (runner.randomState >>> 7), 61 | runner.randomState);

  return ((runner.randomState ^ (runner.randomState >>> 14)) >>> 0) / 4294967296;
}

export function productPrice(product: ProductCandidate) {
  return positiveNumberOrNull(product.unitPriceAmount) ??
    positiveNumberOrNull(product.priceAmount);
}

function normalizeSimulationInput(input: Readonly<{
  archetypes?: readonly SyntheticPlanArchetype[] | null;
  candidates?: readonly ProductCandidate[] | null;
  countryCode?: string | null;
  demandProfiles?: readonly AdminPlanCoverageDemandProfile[] | null;
  seed?: string | null;
  supplementGovernanceHash?: string | null;
  supplements?: readonly AdminPlanCoverageSimulationSupplement[] | null;
}>): AdminPlanCoverageSimulationInput {
  const seed = input.seed?.trim() || DEFAULT_SIMULATION_SEED;
  const countryCode = normalizeCoverageCountryCode(input.countryCode);

  return {
    archetypes: normalizeSyntheticPlanArchetypes(input.archetypes),
    candidates: input.candidates ?? [],
    countryCode,
    demandProfiles: normalizeDemandProfiles(input.demandProfiles),
    seed,
    supplementGovernanceHash:
      input.supplementGovernanceHash?.trim() || "supplement-governance:unknown",
    supplements: input.supplements ?? []
  };
}

export function emptyAdminPlanCoverageSimulationData(input: Readonly<{
  archetypes?: readonly SyntheticPlanArchetype[] | null;
  candidates?: readonly ProductCandidate[] | null;
  countryCode?: string | null;
  databaseAvailable?: boolean | null;
  demandProfiles?: readonly AdminPlanCoverageDemandProfile[] | null;
  realCustomerArchetypes?: readonly SyntheticPlanArchetype[] | null;
  realCustomerProfileCount?: number | null;
  realCustomerProfiles?: readonly SyntheticPlanArchetype[] | null;
  reviewPriorityProducts?: readonly AdminSimulationReviewProductRow[] | null;
  sampleSize?: number | null;
  seed?: string | null;
  supplementGovernanceHash?: string | null;
  supplements?: readonly AdminPlanCoverageSimulationSupplement[] | null;
}> = {}): AdminPlanCoverageSimulationData {
  const simulationInput = normalizeSimulationInput(input);
  const realCustomerProfiles = normalizeSyntheticPlanArchetypes(
    input.realCustomerProfiles ?? []
  ).filter((archetype) => archetype.source === "customer_profile");

  return {
    archetypes: simulationInput.archetypes,
    compactCatalog: [],
    convergence: {
      deltas: {
        averageCoveragePercent: null,
        expectedCostPercent: null,
        medianCoveragePercent: null,
        p10CoveragePercent: null,
        percentAbove75: null
      },
      lastMeaningfulChangeSample: null,
      samplesSinceMeaningfulChange: 0,
      stable: false,
      status: "insufficient_samples",
      topProductOverlapPercent: null,
      windowSize: ADMIN_PLAN_COVERAGE_CONVERGENCE_WINDOW_SIZE
    },
    countryCode: simulationInput.countryCode,
    databaseAvailable: Boolean(input.databaseAvailable),
    generatedAt: new Date().toISOString(),
    input: simulationInput,
    mostUsefulProducts: [],
    realCustomerArchetypes: normalizeSyntheticPlanArchetypes(
      input.realCustomerArchetypes ?? []
    ).filter((archetype) => archetype.source === "customer_archetype"),
    realCustomerProfileCount: Math.max(
      realCustomerProfiles.length,
      Math.round(input.realCustomerProfileCount ?? 0)
    ),
    realCustomerProfiles,
    reviewPriorityProducts: input.reviewPriorityProducts ?? [],
    sampleSize:
      input.sampleSize === null || input.sampleSize === undefined
        ? 0
        : normalizeSimulationSampleSize(input.sampleSize),
    sampleTraces: [],
    seed: simulationInput.seed,
    summary: {
      averageCoveragePercent: 0,
      currency:
        simulationInput.candidates.find((candidate) => candidate.currency)
          ?.currency ?? "THB",
      expectedCostAmount: null,
      medianCoveragePercent: 0,
      p10CoveragePercent: 0,
      percentAbove50: 0,
      percentAbove75: 0,
      percentAbove90: 0
    },
    unmetSupplements: []
  };
}

function buildSyntheticNeeds(input: Readonly<{
  archetype: SyntheticPlanArchetype;
  randomValue: number;
  sampleIndex: number;
  supplements: readonly AdminPlanCoverageSimulationSupplement[];
}>) {
  const needs: ProductRecommendationNeed[] = [];
  const used = new Set<string>();
  const needCount = Math.min(input.archetype.needCount, input.supplements.length);
  const start = Math.floor(input.randomValue * Math.max(1, input.supplements.length));
  const tokens = archetypeSearchTokens(input.archetype);
  const supplements = [...input.supplements].sort((first, second) => {
    const scoreDelta =
      supplementArchetypeScore(second, input.archetype, tokens) -
      supplementArchetypeScore(first, input.archetype, tokens);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return first.name.localeCompare(second.name);
  });

  for (
    let index = 0;
    index < supplements.length && needs.length < needCount;
    index += 1
  ) {
    const supplement =
      supplements[(start + index * 7 + input.sampleIndex * 3) % supplements.length];

    if (!supplement || used.has(supplement.id)) {
      continue;
    }

    used.add(supplement.id);
    needs.push({
      category: supplement.category ?? "Supplement",
      displayName: supplement.name,
      id: `synthetic:${input.sampleIndex}:${supplement.id}`,
      itemType: "supplement",
      normalizedName: supplement.normalizedName,
      sourceId: supplement.id,
      targetComparableAmount: supplement.targetComparableAmount ?? 1000,
      targetDose: null,
      targetText: null,
      weight: Math.max(1, 8 - needs.length)
    });
  }

  return needs;
}

function productUsefulnessRows(
  productStats: ReadonlyMap<string, AdminPlanCoverageSimulationProductStats>,
  sampleSize: number
) {
  return [...productStats.entries()]
    .map(([id, stats]) => ({
      averageProductCoveragePercent: safePercent(
        stats.coverageTotal / Math.max(1, stats.chosenCount)
      ),
      averageStackContributionPercent: safePercent(
        stats.stackContributionTotal / Math.max(1, stats.chosenCount)
      ),
      brandName: stats.brandName,
      chosenCount: stats.chosenCount,
      expectedPriceAmount:
        stats.pricedCount > 0
          ? Math.round(stats.priceTotal / stats.pricedCount)
          : null,
      id,
      rank: 0,
      title: stats.title
    }))
    .sort((first, second) =>
      second.averageStackContributionPercent - first.averageStackContributionPercent ||
      second.chosenCount - first.chosenCount ||
      (first.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) -
        (second.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
      first.title.localeCompare(second.title)
    )
    .map((row, index) => ({
      ...row,
      chosenCount: Math.min(row.chosenCount, sampleSize),
      rank: index + 1
    }));
}

function simulationSummary(input: Readonly<{
  candidates: readonly ProductCandidate[];
  costValues: readonly number[];
  coverageValues: readonly number[];
  sampleSize: number;
}>): AdminPlanCoverageSimulationSummary {
  return {
    averageCoveragePercent: safePercent(average(input.coverageValues)),
    currency:
      input.candidates.find((candidate) => candidate.currency)?.currency ?? "THB",
    expectedCostAmount:
      input.costValues.some((value) => value > 0)
        ? Math.round(average(input.costValues))
        : null,
    medianCoveragePercent: safePercent(median(input.coverageValues)),
    p10CoveragePercent: safePercent(percentile(input.coverageValues, 10)),
    percentAbove50: safePercent(
      (input.coverageValues.filter((value) => value >= 50).length /
        Math.max(1, input.sampleSize)) * 100
    ),
    percentAbove75: safePercent(
      (input.coverageValues.filter((value) => value >= 75).length /
        Math.max(1, input.sampleSize)) * 100
    ),
    percentAbove90: safePercent(
      (input.coverageValues.filter((value) => value >= 90).length /
        Math.max(1, input.sampleSize)) * 100
    )
  };
}

function topProductIds(
  productStats: ReadonlyMap<string, AdminPlanCoverageSimulationProductStats>,
  sampleSize: number
) {
  return productUsefulnessRows(productStats, sampleSize)
    .filter((row) => row.chosenCount > 0)
    .slice(0, 10)
    .map((row) => row.id);
}

function convergenceCheckpoint(
  runner: AdminPlanCoverageSimulationRunner
): AdminPlanCoverageSimulationCheckpoint {
  return {
    sampleSize: runner.sampleSize,
    summary: simulationSummary({
      candidates: runner.input.candidates,
      costValues: runner.costValues,
      coverageValues: runner.coverageValues,
      sampleSize: runner.sampleSize
    }),
    topProductIds: topProductIds(runner.productStats, runner.sampleSize)
  };
}

function recordConvergenceCheckpointIfNeeded(
  runner: AdminPlanCoverageSimulationRunner
) {
  if (
    runner.sampleSize < 1 ||
    (runner.sampleSize % ADMIN_PLAN_COVERAGE_CONVERGENCE_CHECKPOINT_INTERVAL !== 0 &&
      runner.sampleSize < ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES)
  ) {
    return;
  }

  if (
    runner.convergenceCheckpoints.at(-1)?.sampleSize === runner.sampleSize
  ) {
    return;
  }

  runner.convergenceCheckpoints.push(convergenceCheckpoint(runner));
}

function summaryDeltas(
  current: AdminPlanCoverageSimulationSummary,
  previous: AdminPlanCoverageSimulationSummary
): AdminPlanCoverageConvergenceDeltas {
  const expectedCostPercent = (() => {
    if (current.expectedCostAmount === null && previous.expectedCostAmount === null) {
      return null;
    }

    if (current.expectedCostAmount === null || previous.expectedCostAmount === null) {
      return 100;
    }

    if (previous.expectedCostAmount === 0) {
      return current.expectedCostAmount === 0 ? 0 : 100;
    }

    return safePercent(
      (Math.abs(current.expectedCostAmount - previous.expectedCostAmount) /
        previous.expectedCostAmount) * 100
    );
  })();

  return {
    averageCoveragePercent: Math.abs(
      current.averageCoveragePercent - previous.averageCoveragePercent
    ),
    expectedCostPercent,
    medianCoveragePercent: Math.abs(
      current.medianCoveragePercent - previous.medianCoveragePercent
    ),
    p10CoveragePercent: Math.abs(
      current.p10CoveragePercent - previous.p10CoveragePercent
    ),
    percentAbove75: Math.abs(current.percentAbove75 - previous.percentAbove75)
  };
}

function topProductOverlapPercent(
  current: readonly string[],
  previous: readonly string[]
) {
  if (current.length < 1 && previous.length < 1) {
    return 100;
  }

  if (current.length < 1 || previous.length < 1) {
    return 0;
  }

  const previousIds = new Set(previous);
  const overlap = current.filter((id) => previousIds.has(id)).length;

  return safePercent((overlap / Math.max(current.length, previous.length)) * 100);
}

function checkpointBeforeOrAt(
  checkpoints: readonly AdminPlanCoverageSimulationCheckpoint[],
  sampleSize: number
) {
  return [...checkpoints]
    .reverse()
    .find((checkpoint) => checkpoint.sampleSize <= sampleSize) ?? null;
}

function convergenceWindowChanged(input: Readonly<{
  current: AdminPlanCoverageSimulationCheckpoint;
  previous: AdminPlanCoverageSimulationCheckpoint;
}>) {
  const deltas = summaryDeltas(input.current.summary, input.previous.summary);
  const overlap = topProductOverlapPercent(
    input.current.topProductIds,
    input.previous.topProductIds
  );
  const changed =
    (deltas.averageCoveragePercent ?? 0) > 1 ||
    (deltas.medianCoveragePercent ?? 0) > 1 ||
    (deltas.p10CoveragePercent ?? 0) > 1 ||
    (deltas.percentAbove75 ?? 0) > 1 ||
    (deltas.expectedCostPercent ?? 0) > 3 ||
    overlap < 80;

  return { changed, deltas, overlap };
}

function simulationConvergence(
  runner: AdminPlanCoverageSimulationRunner,
  current: AdminPlanCoverageSimulationCheckpoint
): AdminPlanCoverageSimulationConvergence {
  const emptyDeltas: AdminPlanCoverageConvergenceDeltas = {
    averageCoveragePercent: null,
    expectedCostPercent: null,
    medianCoveragePercent: null,
    p10CoveragePercent: null,
    percentAbove75: null
  };

  if (runner.sampleSize < ADMIN_PLAN_COVERAGE_CONVERGENCE_MIN_SAMPLES) {
    return {
      deltas: emptyDeltas,
      lastMeaningfulChangeSample: null,
      samplesSinceMeaningfulChange: runner.sampleSize,
      stable: false,
      status: "insufficient_samples",
      topProductOverlapPercent: null,
      windowSize: ADMIN_PLAN_COVERAGE_CONVERGENCE_WINDOW_SIZE
    };
  }

  const checkpoints = [
    ...runner.convergenceCheckpoints.filter((checkpoint) =>
      checkpoint.sampleSize !== current.sampleSize
    ),
    current
  ].sort((first, second) => first.sampleSize - second.sampleSize);
  const previous = checkpointBeforeOrAt(
    checkpoints,
    runner.sampleSize - ADMIN_PLAN_COVERAGE_CONVERGENCE_WINDOW_SIZE
  );

  if (!previous) {
    return {
      deltas: emptyDeltas,
      lastMeaningfulChangeSample: null,
      samplesSinceMeaningfulChange: runner.sampleSize,
      stable: false,
      status: "insufficient_samples",
      topProductOverlapPercent: null,
      windowSize: ADMIN_PLAN_COVERAGE_CONVERGENCE_WINDOW_SIZE
    };
  }

  const latestWindow = convergenceWindowChanged({ current, previous });
  let lastMeaningfulChangeSample: number | null = latestWindow.changed
    ? current.sampleSize
    : null;

  for (const checkpoint of checkpoints) {
    if (checkpoint.sampleSize < ADMIN_PLAN_COVERAGE_CONVERGENCE_MIN_SAMPLES) {
      continue;
    }

    const baseline = checkpointBeforeOrAt(
      checkpoints,
      checkpoint.sampleSize - ADMIN_PLAN_COVERAGE_CONVERGENCE_WINDOW_SIZE
    );

    if (!baseline) {
      continue;
    }

    if (convergenceWindowChanged({ current: checkpoint, previous: baseline }).changed) {
      lastMeaningfulChangeSample = checkpoint.sampleSize;
    }
  }

  const stable = !latestWindow.changed;

  return {
    deltas: latestWindow.deltas,
    lastMeaningfulChangeSample,
    samplesSinceMeaningfulChange:
      runner.sampleSize - (lastMeaningfulChangeSample ?? previous.sampleSize),
    stable,
    status:
      runner.sampleSize >= ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES
        ? "complete"
        : stable
          ? "stable"
          : "changing",
    topProductOverlapPercent: latestWindow.overlap,
    windowSize: ADMIN_PLAN_COVERAGE_CONVERGENCE_WINDOW_SIZE
  };
}

export function createAdminPlanCoverageSimulationRunner(input: Readonly<{
  archetypes?: readonly SyntheticPlanArchetype[] | null;
  candidates: readonly ProductCandidate[];
  countryCode?: string | null;
  demandProfiles?: readonly AdminPlanCoverageDemandProfile[] | null;
  reviewPriorityProducts?: readonly AdminSimulationReviewProductRow[] | null;
  seed?: string | null;
  supplementGovernanceHash?: string | null;
  supplements: readonly AdminPlanCoverageSimulationSupplement[];
}>): AdminPlanCoverageSimulationRunner {
  const simulationInput = normalizeSimulationInput(input);

  return {
    convergenceCheckpoints: [],
    costValues: [],
    coverageValues: [],
    generatedAt: new Date().toISOString(),
    input: simulationInput,
    productStats: new Map(),
    randomState: initialRandomState(simulationInput.seed),
    reviewPriorityProducts: input.reviewPriorityProducts ?? [],
    sampleSize: 0,
    sampleTraces: [],
    unmetCounts: new Map()
  };
}

export function adminPlanCoverageSimulationDataFromRunner(
  runner: AdminPlanCoverageSimulationRunner
): AdminPlanCoverageSimulationData {
  const mostUsefulProducts = productUsefulnessRows(
    runner.productStats,
    runner.sampleSize
  );
  const currentCheckpoint = convergenceCheckpoint(runner);
  const summary = currentCheckpoint.summary;
  const compactCatalog = mostUsefulProducts
    .filter((row) =>
      row.averageStackContributionPercent > 0 &&
      row.chosenCount / Math.max(1, runner.sampleSize) >= 0.02
    )
    .slice(0, 24)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    archetypes: runner.input.archetypes,
    compactCatalog,
    convergence: simulationConvergence(runner, currentCheckpoint),
    countryCode: runner.input.countryCode,
    databaseAvailable: true,
    generatedAt: runner.generatedAt,
    input: runner.input,
    mostUsefulProducts: mostUsefulProducts.slice(0, 24),
    realCustomerArchetypes: runner.input.archetypes.filter(
      (archetype) => archetype.source === "customer_archetype"
    ),
    realCustomerProfileCount: runner.input.archetypes.filter(
      (archetype) => archetype.source === "customer_profile"
    ).length,
    realCustomerProfiles: runner.input.archetypes.filter(
      (archetype) => archetype.source === "customer_profile"
    ),
    reviewPriorityProducts: runner.reviewPriorityProducts,
    sampleSize: runner.sampleSize,
    sampleTraces: runner.sampleTraces,
    seed: runner.input.seed,
    summary,
    unmetSupplements: [...runner.unmetCounts.values()]
      .map((bucket) => ({
        ...bucket,
        percent: safePercent((bucket.count / Math.max(1, runner.sampleSize)) * 100)
      }))
      .sort((first, second) =>
        second.count - first.count || first.name.localeCompare(second.name)
      )
      .slice(0, 24)
  };
}

function normalizedSupplementName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ");
}

function needDemandKeys(need: ProductRecommendationNeed) {
  return [
    need.sourceId,
    need.id,
    need.normalizedName,
    need.displayName
  ]
    .map((value) => normalizedSupplementName(value ?? ""))
    .filter((value) => value.length > 0);
}

function rowDemandKeys(row: AdminPlanCoverageSimulationUnmetDemandRow) {
  return [
    row.supplementId,
    row.supplementKey,
    row.name
  ]
    .map((value) => normalizedSupplementName(value ?? ""))
    .filter((value) => value.length > 0);
}

function supplementForNeed(
  input: AdminPlanCoverageSimulationInput,
  need: ProductRecommendationNeed
) {
  const keys = new Set(needDemandKeys(need));

  return input.supplements.find((supplement) =>
    keys.has(normalizedSupplementName(supplement.id)) ||
    keys.has(normalizedSupplementName(supplement.normalizedName)) ||
    keys.has(normalizedSupplementName(supplement.name))
  ) ?? null;
}

function factMatchesNeed(
  fact: ProductCandidate["facts"][number],
  need: ProductRecommendationNeed,
  supplement: AdminPlanCoverageSimulationSupplement | null
) {
  if (
    fact.supplementId &&
    (fact.supplementId === need.sourceId || fact.supplementId === supplement?.id)
  ) {
    return true;
  }

  const keys = new Set(needDemandKeys(need));

  if (supplement) {
    keys.add(normalizedSupplementName(supplement.id));
    keys.add(normalizedSupplementName(supplement.name));
    keys.add(normalizedSupplementName(supplement.normalizedName));
  }

  return keys.has(normalizedSupplementName(fact.normalizedName)) ||
    keys.has(normalizedSupplementName(fact.name));
}

function eligibleCoverageForNeed(
  input: AdminPlanCoverageSimulationInput,
  need: ProductRecommendationNeed,
  supplement: AdminPlanCoverageSimulationSupplement | null
) {
  let eligibleProductCount = 0;
  let maxTargetRatio = 0;
  const targetComparableAmount =
    positiveNumberOrNull(need.targetComparableAmount) ??
    positiveNumberOrNull(supplement?.targetComparableAmount);

  for (const product of input.candidates) {
    let productMatches = false;
    let productMaxRatio = 0;

    for (const fact of product.facts) {
      const comparableAmount = factComparableAmount(fact);

      if (
        comparableAmount === null ||
        !factMatchesNeed(fact, need, supplement)
      ) {
        continue;
      }

      productMatches = true;

      if (targetComparableAmount !== null) {
        productMaxRatio = Math.max(
          productMaxRatio,
          comparableAmount / targetComparableAmount
        );
      }
    }

    if (productMatches) {
      eligibleProductCount += 1;
      maxTargetRatio = Math.max(maxTargetRatio, productMaxRatio);
    }
  }

  return { eligibleProductCount, maxTargetRatio, targetComparableAmount };
}

function blockedProductCountForNeed(
  reviewPriorityProducts: readonly AdminSimulationReviewProductRow[],
  need: ProductRecommendationNeed,
  supplement: AdminPlanCoverageSimulationSupplement | null
) {
  const keys = new Set(needDemandKeys(need));

  if (supplement) {
    keys.add(normalizedSupplementName(supplement.id));
    keys.add(normalizedSupplementName(supplement.name));
    keys.add(normalizedSupplementName(supplement.normalizedName));
  }

  return reviewPriorityProducts.filter((product) =>
    product.coveredSupplementNames.some((name) =>
      keys.has(normalizedSupplementName(name))
    )
  ).length;
}

function unmetDemandState(input: Readonly<{
  blockedProductCount: number;
  eligibleProductCount: number;
  maxTargetRatio: number;
  targetComparableAmount: number | null;
}>): AdminPlanCoverageUnmetDemandState {
  if (input.eligibleProductCount > 0) {
    return input.targetComparableAmount !== null &&
      input.maxTargetRatio > 0 &&
      input.maxTargetRatio < 0.7
      ? "underdosed"
      : "available_unselected";
  }

  return input.blockedProductCount > 0 ? "blocked_only" : "catalogue_gap";
}

function dominantUnmetDemandState(
  first: AdminPlanCoverageUnmetDemandState,
  second: AdminPlanCoverageUnmetDemandState
) {
  const priority: Record<AdminPlanCoverageUnmetDemandState, number> = {
    catalogue_gap: 4,
    blocked_only: 3,
    underdosed: 2,
    available_unselected: 1
  };

  return priority[second] > priority[first] ? second : first;
}

function unmetDemandBucketForNeed(
  runner: AdminPlanCoverageSimulationRunner,
  need: ProductRecommendationNeed
): AdminPlanCoverageSimulationUnmetDemandBucket {
  const supplement = supplementForNeed(runner.input, need);
  const coverage = eligibleCoverageForNeed(runner.input, need, supplement);
  const blockedProductCount = blockedProductCountForNeed(
    runner.reviewPriorityProducts,
    need,
    supplement
  );
  const state = unmetDemandState({
    ...coverage,
    blockedProductCount
  });

  return {
    blockedProductCount,
    count: 1,
    eligibleProductCount: coverage.eligibleProductCount,
    name: supplement?.name ?? need.displayName,
    state,
    supplementId: supplement?.id ?? need.sourceId ?? null,
    supplementKey:
      supplement?.id ??
      normalizedSupplementName(need.sourceId || need.normalizedName || need.displayName),
    targetDoseText: need.targetText ?? null
  };
}

function recordUnmetNeed(
  runner: AdminPlanCoverageSimulationRunner,
  need: ProductRecommendationNeed
) {
  const next = unmetDemandBucketForNeed(runner, need);
  const current = runner.unmetCounts.get(next.supplementKey);

  runner.unmetCounts.set(next.supplementKey, current
    ? {
        ...current,
        blockedProductCount: Math.max(
          current.blockedProductCount,
          next.blockedProductCount
        ),
        count: current.count + 1,
        eligibleProductCount: Math.max(
          current.eligibleProductCount,
          next.eligibleProductCount
        ),
        state: dominantUnmetDemandState(current.state, next.state),
        targetDoseText: current.targetDoseText ?? next.targetDoseText
      }
    : next);
}

function doseTextBySupplement(input: AdminPlanCoverageSimulationInput) {
  const doseCountsBySupplement = new Map<string, Map<string, number>>();

  for (const profile of input.demandProfiles) {
    for (const need of profile.needs) {
      if (need.itemType !== "supplement" || !need.targetText) {
        continue;
      }

      const keys = [
        normalizedSupplementName(need.displayName),
        normalizedSupplementName(need.normalizedName),
        normalizedSupplementName(need.sourceId)
      ].filter((key) => key.length > 0);

      for (const key of new Set(keys)) {
        const counts = doseCountsBySupplement.get(key) ?? new Map<string, number>();

        counts.set(need.targetText, (counts.get(need.targetText) ?? 0) + 1);
        doseCountsBySupplement.set(key, counts);
      }
    }
  }

  return new Map(
    [...doseCountsBySupplement.entries()].map(([key, counts]) => [
      key,
      [...counts.entries()]
        .sort((first, second) =>
          second[1] - first[1] || first[0].localeCompare(second[0])
        )[0]?.[0] ?? null
    ])
  );
}

export function buildSimulationNextMoveRows(input: Readonly<{
  reviewPriorityProducts: readonly AdminSimulationReviewProductRow[];
  simulationInput?: AdminPlanCoverageSimulationInput | null;
  simulationData: AdminPlanCoverageSimulationData;
}>): AdminSimulationNextMoveRow[] {
  if (input.simulationData.sampleSize < 1) {
    return [];
  }

  const unmetByName = new Map<string, AdminPlanCoverageSimulationUnmetDemandRow>();

  for (const supplement of input.simulationData.unmetSupplements) {
    for (const key of rowDemandKeys(supplement)) {
      unmetByName.set(key, supplement);
    }
  }

  if (unmetByName.size < 1) {
    return [];
  }

  const productRows = input.reviewPriorityProducts
    .map((product): AdminSimulationNextMoveRow | null => {
      const unmetSupplements = product.coveredSupplementNames
        .map((name) => unmetByName.get(normalizedSupplementName(name)))
        .filter((supplement): supplement is AdminPlanCoverageSimulationUnmetDemandRow =>
          Boolean(supplement)
        );

      if (unmetSupplements.length < 1) {
        return null;
      }

      const unmetDemandCount = unmetSupplements.reduce(
        (total, supplement) => total + supplement.count,
        0
      );
      const nextMoveScore =
        unmetDemandCount * 10 +
        product.gapSupplementCount * 5 +
        product.matchableSupplementCount;

      return {
        ...product,
        actionType: "review_blocked_product",
        kind: "review_product",
        nextMoveScore,
        targetDoseText: null,
        unmetDemandCount,
        unmetDemandPercent: safePercent(
          (unmetDemandCount / Math.max(1, input.simulationData.sampleSize)) * 100
        ),
        unmetSupplementNames: unmetSupplements
          .map((supplement) => supplement.name)
          .sort((first, second) => first.localeCompare(second))
      };
    })
    .filter((row): row is AdminSimulationProductNextMoveRow => row !== null);
  const targetDoseBySupplement = doseTextBySupplement(
    input.simulationInput ?? input.simulationData.input
  );
  const sourceRows = [...new Map(
    [...unmetByName.values()].map((supplement) => [
      supplement.supplementKey,
      supplement
    ])
  ).entries()]
    .filter(([, supplement]) => supplement.state === "catalogue_gap")
    .map(([key, supplement]): AdminSimulationSourcingNextMoveRow => {
      const nextMoveScore = supplement.count * 10 + 5;
      const targetDoseText =
        supplement.targetDoseText ??
        rowDemandKeys(supplement)
          .map((doseKey) => targetDoseBySupplement.get(doseKey))
          .find((value): value is string => Boolean(value)) ??
        null;

      return {
        actionType: "source_missing_supplement",
        brandName: null,
        brandStatus: null,
        blockedReason: "No eligible product covers this supplement.",
        coveredSupplementNames: [supplement.name],
        currency: input.simulationData.summary.currency,
        expectedPriceAmount: null,
        gapSupplementCount: 1,
        id: `source-supplement:${key.replace(/[^a-z0-9]+/g, "-")}`,
        kind: "source_supplement",
        matchableSupplementCount: 1,
        nextMoveScore,
        productStatus: "pending_review",
        rank: 0,
        reviewScore: nextMoveScore,
        sourceSupplementName: supplement.name,
        targetDoseText,
        title: `Source ${supplement.name}`,
        unmetDemandCount: supplement.count,
        unmetDemandPercent: supplement.percent,
        unmetSupplementNames: [supplement.name]
      };
    });

  return [...productRows, ...sourceRows]
    .sort((first, second) =>
      second.nextMoveScore - first.nextMoveScore ||
      second.unmetDemandCount - first.unmetDemandCount ||
      second.gapSupplementCount - first.gapSupplementCount ||
      (first.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) -
        (second.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
      first.title.localeCompare(second.title)
    )
    .slice(0, 24)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function traceFromRecommendation(input: Readonly<{
  archetype: SyntheticPlanArchetype;
  clientSex: ProductClientSex | null;
  costAmount: number | null;
  demandProfile: AdminPlanCoverageDemandProfile | undefined;
  needs: readonly ProductRecommendationNeed[];
  result: ReturnType<typeof recommendProductStackFullBeam>;
  sampleIndex: number;
}>): AdminPlanCoverageSimulationSampleTrace {
  return {
    archetypeId: input.archetype.id,
    archetypeName: input.archetype.name,
    baselineCostAmount: input.costAmount,
    baselineCoveragePercent: safePercent(
      input.result.supplementProductCoveragePercent
    ),
    clientSex: input.clientSex,
    needs: input.needs,
    profileId: input.demandProfile?.id ?? null,
    sampleIndex: input.sampleIndex,
    selectedProductIds: input.result.recommendations.map((item) => item.product.id),
    selectedProducts: input.result.recommendations.map((item) => ({
      brandStatus: item.product.brandStatus ?? null,
      brandName: item.product.brandName ?? null,
      coveredNeedNames: item.coveredNeeds.map((need) => need.displayName),
      costAmount: productPrice(item.product),
      id: item.product.id,
      productStatus: item.product.status,
      productCoveragePercent: item.productCoveragePercent,
      stackContributionPercent: item.stackContributionPercent,
      title: item.product.title
    })),
    unmetNeedIds: input.result.diagnostics.unmatchedNeeds.map((need) => need.id),
    unmetNeedNames: input.result.diagnostics.unmatchedNeeds.map(
      (need) => need.displayName
    )
  };
}

export function runNextAdminPlanCoverageSimulationSample(
  runner: AdminPlanCoverageSimulationRunner
): AdminPlanCoverageSimulationData {
  if (runner.sampleSize >= ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES) {
    return adminPlanCoverageSimulationDataFromRunner(runner);
  }

  const sampleIndex = runner.sampleSize;
  const archetypes = runner.input.archetypes.length > 0
    ? runner.input.archetypes
    : SIMULATION_ARCHETYPES;
  const archetype = archetypes[sampleIndex % archetypes.length]!;
  const demandProfile =
    runner.input.demandProfiles[sampleIndex % runner.input.demandProfiles.length];
  const needs = demandProfile
    ? demandProfile.needs
    : buildSyntheticNeeds({
        archetype,
        randomValue: nextRunnerRandom(runner),
        sampleIndex,
        supplements: runner.input.supplements
      });
  const clientSex = demandProfile?.clientSex ?? archetype.clientSex;
  const result = recommendProductStackFullBeam({
    candidates: [...runner.input.candidates],
    clientSex,
    countryCode: runner.input.countryCode,
    maxProducts: 6,
    needs,
    stackPreference: "balanced"
  });
  const coverage = safePercent(result.supplementProductCoveragePercent);
  const selectedCost = result.recommendations.reduce(
    (total, item) => total + (productPrice(item.product) ?? 0),
    0
  );
  const selectedCostAmount = result.recommendations.length > 0 ? selectedCost : null;

  runner.sampleSize += 1;
  runner.coverageValues.push(coverage);
  runner.costValues.push(selectedCost);
  runner.sampleTraces.push(traceFromRecommendation({
    archetype,
    clientSex,
    costAmount: selectedCostAmount,
    demandProfile,
    needs,
    result,
    sampleIndex
  }));

  const needsById = new Map(needs.map((need) => [need.id, need]));

  for (const diagnostic of result.diagnostics.unmatchedNeeds) {
    const need = needsById.get(diagnostic.id) ??
      needs.find((item) =>
        item.displayName === diagnostic.displayName &&
        item.itemType === diagnostic.itemType
      );

    if (!need) {
      continue;
    }

    recordUnmetNeed(runner, need);
  }

  for (const item of result.recommendations) {
    const current = runner.productStats.get(item.product.id) ?? {
      brandName: item.product.brandName ?? null,
      chosenCount: 0,
      coverageTotal: 0,
      priceTotal: 0,
      pricedCount: 0,
      stackContributionTotal: 0,
      title: item.product.title
    };
    const price = productPrice(item.product);

    current.chosenCount += 1;
    current.coverageTotal += item.productCoveragePercent;
    current.stackContributionTotal += item.stackContributionPercent;

    if (price !== null) {
      current.priceTotal += price;
      current.pricedCount += 1;
    }

    runner.productStats.set(item.product.id, current);
  }

  recordConvergenceCheckpointIfNeeded(runner);

  return adminPlanCoverageSimulationDataFromRunner(runner);
}

export function runAdminPlanCoverageSimulation(input: Readonly<{
  archetypes?: readonly SyntheticPlanArchetype[] | null;
  candidates: readonly ProductCandidate[];
  countryCode?: string | null;
  demandProfiles?: readonly AdminPlanCoverageDemandProfile[] | null;
  reviewPriorityProducts?: readonly AdminSimulationReviewProductRow[] | null;
  sampleSize?: number | null;
  seed?: string | null;
  supplementGovernanceHash?: string | null;
  supplements: readonly AdminPlanCoverageSimulationSupplement[];
}>): AdminPlanCoverageSimulationData {
  const runner = createAdminPlanCoverageSimulationRunner(input);
  const sampleSize = normalizeSimulationSampleSize(input.sampleSize);

  while (runner.sampleSize < sampleSize) {
    runNextAdminPlanCoverageSimulationSample(runner);
  }

  return adminPlanCoverageSimulationDataFromRunner(runner);
}

const DEFAULT_CATALOGUE_OPTIMIZATION_COVERAGE_LOSS_TOLERANCE_PERCENT = 2;
const CATALOGUE_OPTIMIZATION_OBJECTIVE =
  "coverage_floor_min_products_min_cost" as const;
const CATALOGUE_OPTIMIZATION_MUTATION_MODE = "none" as const;

type CatalogueEvaluation = Readonly<{
  costValues: readonly number[];
  coverageValues: readonly number[];
  productIds: readonly string[];
  selectedProductIds: readonly string[];
  selectedProducts: ReadonlyMap<string, CatalogueSelectedProductStats>;
  summary: AdminCatalogueOptimizationSummary;
}>;

type CatalogueSelectedProductStats = {
  brandName: string | null;
  brandStatus?: ProductCandidate["brandStatus"] | null;
  chosenCount: number;
  costTotal: number;
  costCount: number;
  coverageTotal: number;
  productStatus?: ProductCandidate["status"] | null;
  protectedNeedCounts: Map<string, number>;
  stackContributionTotal: number;
  title: string;
};

type CatalogueProductProfile = Readonly<{
  brandName: string | null;
  candidate: ProductCandidate;
  expectedPriceAmount: number | null;
  potentialCoverageTotal: number;
  potentialPlanCount: number;
  protectedNeedCounts: Map<string, number>;
  selectedCount: number;
  stackContributionTotal: number;
  title: string;
}>;

function emptyCatalogueOptimizationSummary(
  productCount = 0
): AdminCatalogueOptimizationSummary {
  return {
    averageCoveragePercent: 0,
    expectedCostAmount: null,
    p10CoveragePercent: 0,
    percentAbove75: 0,
    productCount
  };
}

function catalogueSummary(input: Readonly<{
  costValues: readonly number[];
  coverageValues: readonly number[];
  productCount: number;
}>): AdminCatalogueOptimizationSummary {
  return {
    averageCoveragePercent: safePercent(average(input.coverageValues)),
    expectedCostAmount:
      input.costValues.some((value) => value > 0)
        ? Math.round(average(input.costValues))
        : null,
    p10CoveragePercent: safePercent(percentile(input.coverageValues, 10)),
    percentAbove75: safePercent(
      (input.coverageValues.filter((value) => value >= 75).length /
        Math.max(1, input.coverageValues.length)) * 100
    ),
    productCount: input.productCount
  };
}

function baselineCatalogueSummary(
  data: AdminPlanCoverageSimulationData
): AdminCatalogueOptimizationSummary {
  return {
    averageCoveragePercent: data.summary.averageCoveragePercent,
    expectedCostAmount: data.summary.expectedCostAmount,
    p10CoveragePercent: data.summary.p10CoveragePercent,
    percentAbove75: data.summary.percentAbove75,
    productCount: data.input.candidates.length
  };
}

function summaryCoverageLoss(input: Readonly<{
  baseline: AdminCatalogueOptimizationSummary;
  next: AdminCatalogueOptimizationSummary;
}>) {
  return {
    averageCoveragePercent: Math.max(
      0,
      input.baseline.averageCoveragePercent - input.next.averageCoveragePercent
    ),
    p10CoveragePercent: Math.max(
      0,
      input.baseline.p10CoveragePercent - input.next.p10CoveragePercent
    ),
    percentAbove75: Math.max(
      0,
      input.baseline.percentAbove75 - input.next.percentAbove75
    )
  };
}

function withinCatalogueCoverageFloor(input: Readonly<{
  baseline: AdminCatalogueOptimizationSummary;
  coverageLossTolerancePercent: number;
  next: AdminCatalogueOptimizationSummary;
}>) {
  const loss = summaryCoverageLoss(input);

  return (
    loss.averageCoveragePercent <= input.coverageLossTolerancePercent &&
    loss.p10CoveragePercent <= input.coverageLossTolerancePercent &&
    loss.percentAbove75 <= input.coverageLossTolerancePercent
  );
}

function retainedMetricPercent(next: number, baseline: number) {
  if (baseline <= 0) {
    return next <= 0 ? 100 : 100;
  }

  return safePercent((next / baseline) * 100);
}

function frontierPoint(input: Readonly<{
  baseline: AdminCatalogueOptimizationSummary;
  coverageLossTolerancePercent: number;
  evaluation: CatalogueEvaluation;
  recommended: boolean;
}>): AdminCatalogueOptimizationFrontierPoint {
  const summary = input.evaluation.summary;
  const withinCoverageFloor = withinCatalogueCoverageFloor({
    baseline: input.baseline,
    coverageLossTolerancePercent: input.coverageLossTolerancePercent,
    next: summary
  });

  return {
    ...summary,
    productIds: input.evaluation.productIds,
    recommended: input.recommended,
    retainedAbove75Percent: retainedMetricPercent(
      summary.percentAbove75,
      input.baseline.percentAbove75
    ),
    retainedAverageCoveragePercent: retainedMetricPercent(
      summary.averageCoveragePercent,
      input.baseline.averageCoveragePercent
    ),
    retainedP10CoveragePercent: retainedMetricPercent(
      summary.p10CoveragePercent,
      input.baseline.p10CoveragePercent
    ),
    withinCoverageFloor
  };
}

function compactNames(values: readonly string[]) {
  const names = [...new Set(values)].slice(0, 3);

  if (names.length < 1) {
    return "simulated needs";
  }

  if (names.length === 1) {
    return names[0]!;
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names[0]}, ${names[1]}, and ${names[2]}`;
}

function optimizationReviewProducts(input: Readonly<{
  includeReviewPriorityProducts?: boolean | null;
  reviewPriorityProducts?: readonly AdminSimulationReviewProductRow[] | null;
  simulationData: AdminPlanCoverageSimulationData;
}>) {
  return input.includeReviewPriorityProducts === false
    ? []
    : input.reviewPriorityProducts ?? input.simulationData.reviewPriorityProducts;
}

function addNeedCounts(
  counts: Map<string, number>,
  names: readonly string[]
) {
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
}

function sortedNeedNames(counts: ReadonlyMap<string, number>) {
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .map(([name]) => name);
}

type CatalogueOptimizationAsyncRuntime = Readonly<{
  onProgress?: (progress: AdminCatalogueOptimizationProgress) => void;
  signal?: AbortSignal;
}>;

function catalogueOptimizationAbortError() {
  const error = new Error("Catalogue optimization cancelled");

  error.name = "AbortError";

  return error;
}

function throwIfCatalogueOptimizationAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw catalogueOptimizationAbortError();
  }
}

function reportCatalogueOptimizationProgress(
  runtime: CatalogueOptimizationAsyncRuntime,
  progress: AdminCatalogueOptimizationProgress
) {
  runtime.onProgress?.({
    ...progress,
    current: Math.max(0, Math.min(progress.current, progress.total)),
    total: Math.max(1, progress.total)
  });
}

function waitForCatalogueOptimizationTurn(
  runtime: CatalogueOptimizationAsyncRuntime
) {
  throwIfCatalogueOptimizationAborted(runtime.signal);

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      runtime.signal?.removeEventListener("abort", onAbort);
      resolve();
    }, 0);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(catalogueOptimizationAbortError());
    };

    runtime.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function yieldCatalogueOptimizationProgress(
  runtime: CatalogueOptimizationAsyncRuntime,
  progress: AdminCatalogueOptimizationProgress
) {
  reportCatalogueOptimizationProgress(runtime, progress);
  await waitForCatalogueOptimizationTurn(runtime);
}

function catalogueProductProfiles(
  data: AdminPlanCoverageSimulationData
): CatalogueProductProfile[] {
  const byProduct = new Map<string, {
    protectedNeedCounts: Map<string, number>;
    selectedCount: number;
    stackContributionTotal: number;
  }>();

  for (const trace of data.sampleTraces) {
    for (const product of trace.selectedProducts) {
      const current = byProduct.get(product.id) ?? {
        protectedNeedCounts: new Map<string, number>(),
        selectedCount: 0,
        stackContributionTotal: 0
      };

      current.selectedCount += 1;
      current.stackContributionTotal += product.stackContributionPercent;
      addNeedCounts(current.protectedNeedCounts, product.coveredNeedNames);
      byProduct.set(product.id, current);
    }
  }

  return data.input.candidates.map((candidate) => {
    const selected = byProduct.get(candidate.id) ?? {
      protectedNeedCounts: new Map<string, number>(),
      selectedCount: 0,
      stackContributionTotal: 0
    };
    let potentialCoverageTotal = 0;
    let potentialPlanCount = 0;
    const protectedNeedCounts = new Map(selected.protectedNeedCounts);

    for (const trace of data.sampleTraces) {
      const coverage = productNeedCoverageSummary({
        clientSex: trace.clientSex,
        needs: trace.needs,
        product: candidate
      });

      if (coverage.coveragePercent <= 0) {
        continue;
      }

      potentialCoverageTotal += coverage.coveragePercent;
      potentialPlanCount += 1;
      addNeedCounts(protectedNeedCounts, coverage.coveredNeedNames);
    }

    return {
      brandName: candidate.brandName ?? null,
      candidate,
      expectedPriceAmount: productPrice(candidate),
      potentialCoverageTotal,
      potentialPlanCount,
      protectedNeedCounts,
      selectedCount: selected.selectedCount,
      stackContributionTotal: selected.stackContributionTotal,
      title: candidate.title
    };
  });
}

async function catalogueProductProfilesAsync(
  data: AdminPlanCoverageSimulationData,
  runtime: CatalogueOptimizationAsyncRuntime
): Promise<CatalogueProductProfile[]> {
  const byProduct = new Map<string, {
    protectedNeedCounts: Map<string, number>;
    selectedCount: number;
    stackContributionTotal: number;
  }>();

  for (const trace of data.sampleTraces) {
    for (const product of trace.selectedProducts) {
      const current = byProduct.get(product.id) ?? {
        protectedNeedCounts: new Map<string, number>(),
        selectedCount: 0,
        stackContributionTotal: 0
      };

      current.selectedCount += 1;
      current.stackContributionTotal += product.stackContributionPercent;
      addNeedCounts(current.protectedNeedCounts, product.coveredNeedNames);
      byProduct.set(product.id, current);
    }
  }

  const profiles: CatalogueProductProfile[] = [];
  const total = data.input.candidates.length;

  for (let index = 0; index < data.input.candidates.length; index += 1) {
    const candidate = data.input.candidates[index]!;
    const selected = byProduct.get(candidate.id) ?? {
      protectedNeedCounts: new Map<string, number>(),
      selectedCount: 0,
      stackContributionTotal: 0
    };
    let potentialCoverageTotal = 0;
    let potentialPlanCount = 0;
    const protectedNeedCounts = new Map(selected.protectedNeedCounts);

    for (const trace of data.sampleTraces) {
      const coverage = productNeedCoverageSummary({
        clientSex: trace.clientSex,
        needs: trace.needs,
        product: candidate
      });

      if (coverage.coveragePercent <= 0) {
        continue;
      }

      potentialCoverageTotal += coverage.coveragePercent;
      potentialPlanCount += 1;
      addNeedCounts(protectedNeedCounts, coverage.coveredNeedNames);
    }

    profiles.push({
      brandName: candidate.brandName ?? null,
      candidate,
      expectedPriceAmount: productPrice(candidate),
      potentialCoverageTotal,
      potentialPlanCount,
      protectedNeedCounts,
      selectedCount: selected.selectedCount,
      stackContributionTotal: selected.stackContributionTotal,
      title: candidate.title
    });

    if (index % 2 === 1 || index === data.input.candidates.length - 1) {
      await yieldCatalogueOptimizationProgress(runtime, {
        current: index + 1,
        label: "Scoring catalogue products",
        stage: "scoring",
        total
      });
    }
  }

  return profiles;
}

function catalogueProductScore(profile: CatalogueProductProfile) {
  const pricePenalty = profile.expectedPriceAmount === null
    ? 0
    : Math.min(20, profile.expectedPriceAmount / 1000);

  return (
    profile.selectedCount * 1000 +
    profile.stackContributionTotal * 5 +
    profile.potentialPlanCount * 50 +
    profile.potentialCoverageTotal -
    pricePenalty
  );
}

function rankedCatalogueProducts(
  profiles: readonly CatalogueProductProfile[]
) {
  return [...profiles]
    .filter((profile) =>
      profile.selectedCount > 0 ||
      profile.potentialPlanCount > 0 ||
      profile.potentialCoverageTotal > 0
    )
    .sort((first, second) =>
      catalogueProductScore(second) - catalogueProductScore(first) ||
      second.selectedCount - first.selectedCount ||
      second.potentialPlanCount - first.potentialPlanCount ||
      second.stackContributionTotal - first.stackContributionTotal ||
      (first.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) -
        (second.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
      first.title.localeCompare(second.title) ||
      first.candidate.id.localeCompare(second.candidate.id)
    );
}

function evaluateCatalogueSubset(input: Readonly<{
  data: AdminPlanCoverageSimulationData;
  productIds: readonly string[];
}>): CatalogueEvaluation {
  const productIdSet = new Set(input.productIds);
  const candidates = input.data.input.candidates.filter((candidate) =>
    productIdSet.has(candidate.id)
  );
  const costValues: number[] = [];
  const coverageValues: number[] = [];
  const selectedProductIds = new Set<string>();
  const selectedProducts = new Map<string, CatalogueSelectedProductStats>();

  for (const trace of input.data.sampleTraces) {
    const result = recommendProductStackFullBeam({
      candidates,
      clientSex: trace.clientSex,
      countryCode: input.data.countryCode,
      maxProducts: 6,
      needs: [...trace.needs],
      stackPreference: "balanced"
    });
    const selectedCost = result.recommendations.reduce(
      (total, item) => total + (productPrice(item.product) ?? 0),
      0
    );

    coverageValues.push(safePercent(result.supplementProductCoveragePercent));
    costValues.push(selectedCost);

    for (const item of result.recommendations) {
      selectedProductIds.add(item.product.id);
      const current = selectedProducts.get(item.product.id) ?? {
        brandName: item.product.brandName ?? null,
        brandStatus: item.product.brandStatus ?? null,
        chosenCount: 0,
        costTotal: 0,
        costCount: 0,
        coverageTotal: 0,
        productStatus: item.product.status,
        protectedNeedCounts: new Map<string, number>(),
        stackContributionTotal: 0,
        title: item.product.title
      };
      const price = productPrice(item.product);

      current.chosenCount += 1;
      current.coverageTotal += item.productCoveragePercent;
      current.stackContributionTotal += item.stackContributionPercent;
      addNeedCounts(
        current.protectedNeedCounts,
        item.coveredNeeds.map((need) => need.displayName)
      );

      if (price !== null) {
        current.costTotal += price;
        current.costCount += 1;
      }

      selectedProducts.set(item.product.id, current);
    }
  }

  return {
    costValues,
    coverageValues,
    productIds: input.productIds,
    selectedProductIds: [...selectedProductIds],
    selectedProducts,
    summary: catalogueSummary({
      costValues,
      coverageValues,
      productCount: input.productIds.length
    })
  };
}

async function evaluateCatalogueSubsetAsync(input: Readonly<{
  data: AdminPlanCoverageSimulationData;
  productIds: readonly string[];
  progress?: Readonly<{
    current: number;
    label: string;
    total: number;
    stage: AdminCatalogueOptimizationProgressStage;
  }>;
  runtime: CatalogueOptimizationAsyncRuntime;
}>): Promise<CatalogueEvaluation> {
  const productIdSet = new Set(input.productIds);
  const candidates = input.data.input.candidates.filter((candidate) =>
    productIdSet.has(candidate.id)
  );
  const costValues: number[] = [];
  const coverageValues: number[] = [];
  const selectedProductIds = new Set<string>();
  const selectedProducts = new Map<string, CatalogueSelectedProductStats>();
  const yieldEvery = 4;

  for (let index = 0; index < input.data.sampleTraces.length; index += 1) {
    const trace = input.data.sampleTraces[index]!;
    const result = recommendProductStackFullBeam({
      candidates,
      clientSex: trace.clientSex,
      countryCode: input.data.countryCode,
      maxProducts: 6,
      needs: [...trace.needs],
      stackPreference: "balanced"
    });
    const selectedCost = result.recommendations.reduce(
      (total, item) => total + (productPrice(item.product) ?? 0),
      0
    );

    coverageValues.push(safePercent(result.supplementProductCoveragePercent));
    costValues.push(selectedCost);

    for (const item of result.recommendations) {
      selectedProductIds.add(item.product.id);
      const current = selectedProducts.get(item.product.id) ?? {
        brandName: item.product.brandName ?? null,
        brandStatus: item.product.brandStatus ?? null,
        chosenCount: 0,
        costTotal: 0,
        costCount: 0,
        coverageTotal: 0,
        productStatus: item.product.status,
        protectedNeedCounts: new Map<string, number>(),
        stackContributionTotal: 0,
        title: item.product.title
      };
      const price = productPrice(item.product);

      current.chosenCount += 1;
      current.coverageTotal += item.productCoveragePercent;
      current.stackContributionTotal += item.stackContributionPercent;
      addNeedCounts(
        current.protectedNeedCounts,
        item.coveredNeeds.map((need) => need.displayName)
      );

      if (price !== null) {
        current.costTotal += price;
        current.costCount += 1;
      }

      selectedProducts.set(item.product.id, current);
    }

    if (
      input.progress &&
      (index % yieldEvery === yieldEvery - 1 ||
        index === input.data.sampleTraces.length - 1)
    ) {
      await yieldCatalogueOptimizationProgress(input.runtime, {
        current: input.progress.current,
        label: input.progress.label,
        stage: input.progress.stage,
        total: input.progress.total
      });
    }
  }

  return {
    costValues,
    coverageValues,
    productIds: input.productIds,
    selectedProductIds: [...selectedProductIds],
    selectedProducts,
    summary: catalogueSummary({
      costValues,
      coverageValues,
      productCount: input.productIds.length
    })
  };
}

function bestFrontierFallback(
  points: readonly AdminCatalogueOptimizationFrontierPoint[]
) {
  return [...points].sort((first, second) =>
    second.averageCoveragePercent - first.averageCoveragePercent ||
    second.p10CoveragePercent - first.p10CoveragePercent ||
    second.percentAbove75 - first.percentAbove75 ||
    first.productCount - second.productCount ||
    (first.expectedCostAmount ?? Number.MAX_SAFE_INTEGER) -
      (second.expectedCostAmount ?? Number.MAX_SAFE_INTEGER)
  )[0] ?? null;
}

function prunedCatalogueEvaluation(input: Readonly<{
  baseline: AdminCatalogueOptimizationSummary;
  coverageLossTolerancePercent: number;
  data: AdminPlanCoverageSimulationData;
  productIds: readonly string[];
  profilesById: ReadonlyMap<string, CatalogueProductProfile>;
}>): CatalogueEvaluation {
  let evaluation = evaluateCatalogueSubset({
    data: input.data,
    productIds: input.productIds
  });

  if (
    evaluation.selectedProductIds.length > 0 &&
    evaluation.selectedProductIds.length < evaluation.productIds.length
  ) {
    const selectedEvaluation = evaluateCatalogueSubset({
      data: input.data,
      productIds: evaluation.selectedProductIds
    });

    if (
      withinCatalogueCoverageFloor({
        baseline: input.baseline,
        coverageLossTolerancePercent: input.coverageLossTolerancePercent,
        next: selectedEvaluation.summary
      })
    ) {
      evaluation = selectedEvaluation;
    }
  }

  let changed = true;

  while (changed && evaluation.productIds.length > 1) {
    changed = false;
    const removalOrder = [...evaluation.productIds].sort((firstId, secondId) => {
      const first = input.profilesById.get(firstId);
      const second = input.profilesById.get(secondId);

      return (
        (first?.selectedCount ?? 0) - (second?.selectedCount ?? 0) ||
        (first?.potentialPlanCount ?? 0) - (second?.potentialPlanCount ?? 0) ||
        (second?.expectedPriceAmount ?? 0) - (first?.expectedPriceAmount ?? 0) ||
        (first?.title ?? firstId).localeCompare(second?.title ?? secondId)
      );
    });

    for (const productId of removalOrder) {
      const nextIds = evaluation.productIds.filter((id) => id !== productId);
      const nextEvaluation = evaluateCatalogueSubset({
        data: input.data,
        productIds: nextIds
      });

      if (
        withinCatalogueCoverageFloor({
          baseline: input.baseline,
          coverageLossTolerancePercent: input.coverageLossTolerancePercent,
          next: nextEvaluation.summary
        })
      ) {
        evaluation = nextEvaluation;
        changed = true;
        break;
      }
    }
  }

  return evaluation;
}

function traceCatalogueProductProfiles(
  data: AdminPlanCoverageSimulationData
): CatalogueProductProfile[] {
  const byProduct = new Map<string, {
    protectedNeedCounts: Map<string, number>;
    selectedCount: number;
    stackContributionTotal: number;
  }>();

  for (const trace of data.sampleTraces) {
    for (const product of trace.selectedProducts) {
      const current = byProduct.get(product.id) ?? {
        protectedNeedCounts: new Map<string, number>(),
        selectedCount: 0,
        stackContributionTotal: 0
      };

      current.selectedCount += 1;
      current.stackContributionTotal += product.stackContributionPercent;
      addNeedCounts(current.protectedNeedCounts, product.coveredNeedNames);
      byProduct.set(product.id, current);
    }
  }

  return data.input.candidates.map((candidate) => {
    const selected = byProduct.get(candidate.id) ?? {
      protectedNeedCounts: new Map<string, number>(),
      selectedCount: 0,
      stackContributionTotal: 0
    };

    return {
      brandName: candidate.brandName ?? null,
      candidate,
      expectedPriceAmount: productPrice(candidate),
      potentialCoverageTotal: selected.stackContributionTotal,
      potentialPlanCount: selected.selectedCount,
      protectedNeedCounts: new Map(selected.protectedNeedCounts),
      selectedCount: selected.selectedCount,
      stackContributionTotal: selected.stackContributionTotal,
      title: candidate.title
    };
  });
}

function evaluateTraceCatalogueSubset(input: Readonly<{
  data: AdminPlanCoverageSimulationData;
  productIds: readonly string[];
}>): CatalogueEvaluation {
  const productIdSet = new Set(input.productIds);
  const costValues: number[] = [];
  const coverageValues: number[] = [];
  const selectedProductIds = new Set<string>();
  const selectedProducts = new Map<string, CatalogueSelectedProductStats>();

  for (const trace of input.data.sampleTraces) {
    let retainedCoverage = 0;
    let selectedCost = 0;

    for (const product of trace.selectedProducts) {
      if (!productIdSet.has(product.id)) {
        continue;
      }

      selectedProductIds.add(product.id);
      retainedCoverage += Math.max(0, product.stackContributionPercent);
      selectedCost += product.costAmount ?? 0;

      const current = selectedProducts.get(product.id) ?? {
        brandName: product.brandName,
        brandStatus: product.brandStatus ?? null,
        chosenCount: 0,
        costTotal: 0,
        costCount: 0,
        coverageTotal: 0,
        productStatus: product.productStatus ?? null,
        protectedNeedCounts: new Map<string, number>(),
        stackContributionTotal: 0,
        title: product.title
      };

      current.chosenCount += 1;
      current.coverageTotal += product.productCoveragePercent;
      current.stackContributionTotal += product.stackContributionPercent;
      addNeedCounts(current.protectedNeedCounts, product.coveredNeedNames);

      if (product.costAmount !== null) {
        current.costTotal += product.costAmount;
        current.costCount += 1;
      }

      selectedProducts.set(product.id, current);
    }

    coverageValues.push(
      safePercent(Math.min(trace.baselineCoveragePercent, retainedCoverage))
    );
    costValues.push(selectedCost);
  }

  return {
    costValues,
    coverageValues,
    productIds: input.productIds,
    selectedProductIds: [...selectedProductIds],
    selectedProducts,
    summary: catalogueSummary({
      costValues,
      coverageValues,
      productCount: input.productIds.length
    })
  };
}

function prunedTraceCatalogueEvaluation(input: Readonly<{
  baseline: AdminCatalogueOptimizationSummary;
  coverageLossTolerancePercent: number;
  data: AdminPlanCoverageSimulationData;
  productIds: readonly string[];
  profilesById: ReadonlyMap<string, CatalogueProductProfile>;
}>): CatalogueEvaluation {
  let evaluation = evaluateTraceCatalogueSubset({
    data: input.data,
    productIds: input.productIds
  });

  if (
    evaluation.selectedProductIds.length > 0 &&
    evaluation.selectedProductIds.length < evaluation.productIds.length
  ) {
    const selectedEvaluation = evaluateTraceCatalogueSubset({
      data: input.data,
      productIds: evaluation.selectedProductIds
    });

    if (
      withinCatalogueCoverageFloor({
        baseline: input.baseline,
        coverageLossTolerancePercent: input.coverageLossTolerancePercent,
        next: selectedEvaluation.summary
      })
    ) {
      evaluation = selectedEvaluation;
    }
  }

  let changed = true;
  let checkedCount = 0;
  const maxChecks = Math.min(
    400,
    Math.max(1, evaluation.productIds.length * evaluation.productIds.length)
  );

  while (changed && evaluation.productIds.length > 1 && checkedCount < maxChecks) {
    changed = false;
    const removalOrder = [...evaluation.productIds].sort((firstId, secondId) => {
      const first = input.profilesById.get(firstId);
      const second = input.profilesById.get(secondId);

      return (
        (first?.selectedCount ?? 0) - (second?.selectedCount ?? 0) ||
        (first?.potentialPlanCount ?? 0) - (second?.potentialPlanCount ?? 0) ||
        (second?.expectedPriceAmount ?? 0) - (first?.expectedPriceAmount ?? 0) ||
        (first?.title ?? firstId).localeCompare(second?.title ?? secondId)
      );
    });

    for (const productId of removalOrder) {
      if (checkedCount >= maxChecks) {
        break;
      }

      checkedCount += 1;
      const nextIds = evaluation.productIds.filter((id) => id !== productId);
      const nextEvaluation = evaluateTraceCatalogueSubset({
        data: input.data,
        productIds: nextIds
      });

      if (
        withinCatalogueCoverageFloor({
          baseline: input.baseline,
          coverageLossTolerancePercent: input.coverageLossTolerancePercent,
          next: nextEvaluation.summary
        })
      ) {
        evaluation = nextEvaluation;
        changed = true;
        break;
      }
    }
  }

  return evaluation;
}

function potentialCatalogueCandidate(product: ProductCandidate): ProductCandidate | null {
  if (
    product.status === "ignored" ||
    product.brandStatus === "ignored" ||
    product.facts.length < 1
  ) {
    return null;
  }

  return {
    ...product,
    automatedSafetyPassed: true,
    brandStatus: "approved",
    labelStatus: "parsed",
    status: "approved",
    validation: null
  };
}

export function adminCataloguePotentialCandidates(
  products: readonly ProductCandidate[]
) {
  return products
    .map(potentialCatalogueCandidate)
    .filter((product): product is ProductCandidate => Boolean(product));
}

function potentialCatalogueTrace(input: Readonly<{
  countryCode: string;
  originalProductsById: ReadonlyMap<string, ProductCandidate>;
  potentialCandidates: readonly ProductCandidate[];
  trace: AdminPlanCoverageSimulationSampleTrace;
}>): AdminPlanCoverageSimulationSampleTrace {
  const result = recommendProductStackFullBeam({
    candidates: [...input.potentialCandidates],
    clientSex: input.trace.clientSex,
    countryCode: input.countryCode,
    maxProducts: 6,
    needs: [...input.trace.needs],
    stackPreference: "balanced"
  });
  const selectedProducts = result.recommendations.map((item) => {
    const originalProduct = input.originalProductsById.get(item.product.id) ??
      item.product;

    return {
      brandName: originalProduct.brandName ?? null,
      brandStatus: originalProduct.brandStatus ?? null,
      coveredNeedNames: item.coveredNeeds.map((need) => need.displayName),
      costAmount: productPrice(originalProduct),
      id: originalProduct.id,
      productCoveragePercent: item.productCoveragePercent,
      productStatus: originalProduct.status,
      stackContributionPercent: item.stackContributionPercent,
      title: originalProduct.title
    };
  });
  const baselineCostAmount = selectedProducts.some((product) =>
    product.costAmount !== null
  )
    ? selectedProducts.reduce(
        (total, product) => total + (product.costAmount ?? 0),
        0
      )
    : null;

  return {
    ...input.trace,
    baselineCostAmount,
    baselineCoveragePercent: safePercent(result.supplementProductCoveragePercent),
    selectedProductIds: selectedProducts.map((product) => product.id),
    selectedProducts,
    unmetNeedIds: result.diagnostics.unmatchedNeeds.map((need) => need.id),
    unmetNeedNames: result.diagnostics.unmatchedNeeds.map((need) => need.displayName)
  };
}

export function buildAdminCataloguePotentialTraceChunk(input: Readonly<{
  potentialCandidates: readonly ProductCandidate[];
  simulationData: AdminPlanCoverageSimulationData;
  startIndex?: number | null;
  chunkSize?: number | null;
}>): Omit<AdminCataloguePotentialTraceChunkResponse, "candidateHash"> {
  const originalProductsById = new Map(
    input.potentialCandidates.map((product) => [product.id, product])
  );
  const potentialCandidates = adminCataloguePotentialCandidates(
    input.potentialCandidates
  );
  const totalSamples = input.simulationData.sampleTraces.length;
  const chunkStartIndex = Math.max(
    0,
    Math.min(
      totalSamples,
      Math.floor(input.startIndex ?? 0)
    )
  );
  const chunkSize = Math.max(1, Math.floor(input.chunkSize ?? 4));
  const sampleTraces = input.simulationData.sampleTraces
    .slice(chunkStartIndex, chunkStartIndex + chunkSize)
    .map((trace) =>
      potentialCatalogueTrace({
        countryCode: input.simulationData.countryCode,
        originalProductsById,
        potentialCandidates,
        trace
      })
    );

  return {
    candidateCount: potentialCandidates.length,
    chunkSize,
    chunkStartIndex,
    sampleTraces,
    totalSamples
  };
}

function potentialCatalogueSimulationDataFromTraces(input: Readonly<{
  potentialCandidates: readonly ProductCandidate[];
  sampleTraces: readonly AdminPlanCoverageSimulationSampleTrace[];
  simulationData: AdminPlanCoverageSimulationData;
}>): AdminPlanCoverageSimulationData {
  const potentialCandidates = adminCataloguePotentialCandidates(
    input.potentialCandidates
  );
  const sampleTraces = input.sampleTraces;
  const coverageValues = sampleTraces.map((trace) =>
    trace.baselineCoveragePercent
  );
  const costValues = sampleTraces.map((trace) =>
    trace.baselineCostAmount ?? 0
  );

  return {
    ...input.simulationData,
    input: {
      ...input.simulationData.input,
      candidates: potentialCandidates
    },
    sampleSize: sampleTraces.length,
    sampleTraces,
    summary: simulationSummary({
      candidates: potentialCandidates,
      costValues,
      coverageValues,
      sampleSize: sampleTraces.length
    })
  };
}

export function runAdminCataloguePotentialOptimizationFromTraces(input: Readonly<{
  potentialCandidates: readonly ProductCandidate[];
  sampleTraces: readonly AdminPlanCoverageSimulationSampleTrace[];
  simulationData: AdminPlanCoverageSimulationData;
  coverageLossTolerancePercent?: number | null;
}>): AdminCataloguePotentialOptimizationData {
  const candidateCount = adminCataloguePotentialCandidates(
    input.potentialCandidates
  ).length;

  if (input.sampleTraces.length < 1 || candidateCount < 1) {
    return {
      baseline: emptyCatalogueOptimizationSummary(candidateCount),
      carryProducts: [],
      candidateCount,
      frontier: [],
      generatedAt: new Date().toISOString(),
      needsReviewCount: 0,
      optimized: emptyCatalogueOptimizationSummary(0),
      productReductionCount: candidateCount,
      productReductionPercent: candidateCount > 0 ? 100 : 0,
      sampleSize: input.sampleTraces.length,
      status: "not_ready"
    };
  }

  const potentialSimulationData = potentialCatalogueSimulationDataFromTraces({
    potentialCandidates: input.potentialCandidates,
    sampleTraces: input.sampleTraces,
    simulationData: input.simulationData
  });
  const optimization = runAdminCatalogueOptimizationFast({
    coverageLossTolerancePercent: input.coverageLossTolerancePercent,
    includeReviewPriorityProducts: false,
    simulationData: potentialSimulationData
  });
  const needsReviewCount = optimization.carryProducts.filter((product) =>
    product.readiness === "needs_review"
  ).length;

  return {
    baseline: optimization.baseline,
    carryProducts: optimization.carryProducts,
    candidateCount,
    frontier: optimization.frontier,
    generatedAt: optimization.generatedAt,
    needsReviewCount,
    optimized: optimization.optimized,
    productReductionCount: optimization.productReductionCount,
    productReductionPercent: optimization.productReductionPercent,
    sampleSize: optimization.sampleSize,
    status: optimization.status
  };
}

export function runAdminCataloguePotentialOptimizationFast(input: Readonly<{
  potentialCandidates: readonly ProductCandidate[];
  simulationData: AdminPlanCoverageSimulationData;
  coverageLossTolerancePercent?: number | null;
}>): AdminCataloguePotentialOptimizationData {
  const chunk = buildAdminCataloguePotentialTraceChunk({
    chunkSize: input.simulationData.sampleTraces.length,
    potentialCandidates: input.potentialCandidates,
    simulationData: input.simulationData,
    startIndex: 0
  });

  return runAdminCataloguePotentialOptimizationFromTraces({
    coverageLossTolerancePercent: input.coverageLossTolerancePercent,
    potentialCandidates: input.potentialCandidates,
    sampleTraces: chunk.sampleTraces,
    simulationData: input.simulationData
  });
}

async function prunedCatalogueEvaluationAsync(input: Readonly<{
  baseline: AdminCatalogueOptimizationSummary;
  coverageLossTolerancePercent: number;
  data: AdminPlanCoverageSimulationData;
  productIds: readonly string[];
  profilesById: ReadonlyMap<string, CatalogueProductProfile>;
  runtime: CatalogueOptimizationAsyncRuntime;
}>): Promise<CatalogueEvaluation> {
  let evaluation = await evaluateCatalogueSubsetAsync({
    data: input.data,
    productIds: input.productIds,
    progress: {
      current: 1,
      label: "Pruning redundant products",
      stage: "pruning",
      total: Math.max(1, input.productIds.length)
    },
    runtime: input.runtime
  });

  if (
    evaluation.selectedProductIds.length > 0 &&
    evaluation.selectedProductIds.length < evaluation.productIds.length
  ) {
    const selectedEvaluation = await evaluateCatalogueSubsetAsync({
      data: input.data,
      productIds: evaluation.selectedProductIds,
      progress: {
        current: 1,
        label: "Pruning unused products",
        stage: "pruning",
        total: Math.max(1, input.productIds.length)
      },
      runtime: input.runtime
    });

    if (
      withinCatalogueCoverageFloor({
        baseline: input.baseline,
        coverageLossTolerancePercent: input.coverageLossTolerancePercent,
        next: selectedEvaluation.summary
      })
    ) {
      evaluation = selectedEvaluation;
    }
  }

  let changed = true;
  let checkedCount = 0;
  const maxChecks = Math.max(1, input.productIds.length * input.productIds.length);

  while (changed && evaluation.productIds.length > 1) {
    changed = false;
    const removalOrder = [...evaluation.productIds].sort((firstId, secondId) => {
      const first = input.profilesById.get(firstId);
      const second = input.profilesById.get(secondId);

      return (
        (first?.selectedCount ?? 0) - (second?.selectedCount ?? 0) ||
        (first?.potentialPlanCount ?? 0) - (second?.potentialPlanCount ?? 0) ||
        (second?.expectedPriceAmount ?? 0) - (first?.expectedPriceAmount ?? 0) ||
        (first?.title ?? firstId).localeCompare(second?.title ?? secondId)
      );
    });

    for (const productId of removalOrder) {
      checkedCount += 1;
      const nextIds = evaluation.productIds.filter((id) => id !== productId);
      const nextEvaluation = await evaluateCatalogueSubsetAsync({
        data: input.data,
        productIds: nextIds,
        progress: {
          current: checkedCount,
          label: "Pruning redundant products",
          stage: "pruning",
          total: maxChecks
        },
        runtime: input.runtime
      });

      if (
        withinCatalogueCoverageFloor({
          baseline: input.baseline,
          coverageLossTolerancePercent: input.coverageLossTolerancePercent,
          next: nextEvaluation.summary
        })
      ) {
        evaluation = nextEvaluation;
        changed = true;
        break;
      }
    }
  }

  return evaluation;
}

function productRowsFromEvaluation(
  evaluation: CatalogueEvaluation
): AdminCatalogueOptimizationProductRow[] {
  return [...evaluation.selectedProducts.entries()]
    .map(([id, stats]) => ({
      averageStackContributionPercent: safePercent(
        stats.stackContributionTotal / Math.max(1, stats.chosenCount)
      ),
      brandName: stats.brandName,
      brandStatus: stats.brandStatus ?? null,
      chosenCount: stats.chosenCount,
      expectedPriceAmount:
        stats.costCount > 0 ? Math.round(stats.costTotal / stats.costCount) : null,
      id,
      productStatus: stats.productStatus ?? null,
      protectedPlanCount: stats.chosenCount,
      protectedSupplementNames: sortedNeedNames(stats.protectedNeedCounts).slice(0, 6),
      rank: 0,
      readiness:
        stats.productStatus === "approved" &&
        (stats.brandStatus === null || stats.brandStatus === "approved")
          ? "current" as const
          : "needs_review" as const,
      readinessLabel:
        stats.productStatus === "approved" &&
        (stats.brandStatus === null || stats.brandStatus === "approved")
          ? "Current"
          : stats.productStatus === "pending_review"
            ? "Pending review"
            : stats.brandStatus === "pending_review"
              ? "Brand pending"
              : "Needs review",
      title: stats.title
    }))
    .sort((first, second) =>
      second.chosenCount - first.chosenCount ||
      second.averageStackContributionPercent - first.averageStackContributionPercent ||
      (first.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) -
        (second.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
      first.title.localeCompare(second.title)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function reviewDemandImpact(input: Readonly<{
  product: AdminSimulationReviewProductRow;
  sampleTraces: readonly AdminPlanCoverageSimulationSampleTrace[];
}>) {
  const productKeys = new Set(
    input.product.coveredSupplementNames
      .map((name) => normalizedSupplementName(name))
      .filter((name) => name.length > 0)
  );
  const supplementCounts = new Map<string, number>();
  let affectedPlanCount = 0;

  for (const trace of input.sampleTraces) {
    const traceMatches = new Set<string>();

    for (const need of trace.needs) {
      if (!needDemandKeys(need).some((key) => productKeys.has(key))) {
        continue;
      }

      traceMatches.add(need.displayName || need.normalizedName);
    }

    if (traceMatches.size < 1) {
      continue;
    }

    affectedPlanCount += 1;

    for (const name of traceMatches) {
      supplementCounts.set(name, (supplementCounts.get(name) ?? 0) + 1);
    }
  }

  return {
    affectedPlanCount,
    supplementNames: sortedNeedNames(supplementCounts)
  };
}

function carryActionRows(input: Readonly<{
  carryProducts: readonly AdminCatalogueOptimizationProductRow[];
  sampleSize: number;
}>): AdminCatalogueOptimizationActionRow[] {
  return input.carryProducts.map((row, index) => ({
    actionType: "carry",
    affectedPlanCount: row.protectedPlanCount,
    affectedPlanPercent: safePercent(
      (row.protectedPlanCount / Math.max(1, input.sampleSize)) * 100
    ),
    brandName: row.brandName,
    coverageImpactPercent: row.averageStackContributionPercent,
    expectedPriceAmount: row.expectedPriceAmount,
    id: `carry:${row.id}`,
    productId: row.id,
    rank: index + 1,
    reason: `Carry this product; it protects ${compactNames(
      row.protectedSupplementNames
    )} coverage in ${row.protectedPlanCount} simulated ${
      row.protectedPlanCount === 1 ? "profile" : "profiles"
    }.`,
    statusLabel: "Carry",
    supplementId: null,
    title: row.title
  }));
}

function reviewActionRows(input: Readonly<{
  reviewPriorityProducts: readonly AdminSimulationReviewProductRow[];
  sampleSize: number;
  sampleTraces?: readonly AdminPlanCoverageSimulationSampleTrace[];
  unmetSupplements: readonly AdminPlanCoverageSimulationUnmetDemandRow[];
}>): AdminCatalogueOptimizationActionRow[] {
  const unmetByName = new Map<string, AdminPlanCoverageSimulationUnmetDemandRow>();

  for (const supplement of input.unmetSupplements) {
    unmetByName.set(normalizedSupplementName(supplement.name), supplement);
  }

  return input.reviewPriorityProducts.flatMap((product) => {
    const matched = product.coveredSupplementNames
      .map((name) => unmetByName.get(normalizedSupplementName(name)))
      .filter((row): row is AdminPlanCoverageSimulationUnmetDemandRow => Boolean(row));
    const demandImpact = reviewDemandImpact({
      product,
      sampleTraces: input.sampleTraces ?? []
    });

    if (matched.length < 1 && demandImpact.affectedPlanCount < 1) {
      return [];
    }

    const affectedPlanCount =
      matched.length > 0
        ? matched.reduce((total, row) => total + row.count, 0)
        : demandImpact.affectedPlanCount;
    const affectedSupplementNames =
      matched.length > 0
        ? matched.map((row) => row.name)
        : demandImpact.supplementNames;
    const affectedPlanPercent = safePercent(
      (affectedPlanCount / Math.max(1, input.sampleSize)) * 100
    );

    return [{
      actionType: "review_first" as const,
      affectedPlanCount,
      affectedPlanPercent,
      brandName: product.brandName,
      coverageImpactPercent: affectedPlanPercent,
      expectedPriceAmount: product.expectedPriceAmount,
      id: `review:${product.id}`,
      productId: product.id,
      rank: 0,
      reason:
        matched.length > 0
          ? `Review this product first; it could help unresolved ${compactNames(
              affectedSupplementNames
            )} demand across ${affectedPlanCount} simulated ${
              affectedPlanCount === 1 ? "profile" : "profiles"
            }.`
          : `Review this product; it matches ${compactNames(
              affectedSupplementNames
            )} demand in ${affectedPlanCount} simulated ${
              affectedPlanCount === 1 ? "profile" : "profiles"
            }.`,
      statusLabel: "Review first",
      supplementId: null,
      title: product.title
    }];
  });
}

function sourceActionRows(input: Readonly<{
  sampleSize: number;
  unmetSupplements: readonly AdminPlanCoverageSimulationUnmetDemandRow[];
}>): AdminCatalogueOptimizationActionRow[] {
  return input.unmetSupplements
    .filter((row) => row.state === "catalogue_gap")
    .map((row) => ({
      actionType: "source_missing" as const,
      affectedPlanCount: row.count,
      affectedPlanPercent: row.percent,
      brandName: null,
      coverageImpactPercent: row.percent,
      expectedPriceAmount: null,
      id: `source:${row.supplementKey}`,
      productId: null,
      rank: 0,
      reason: `Source a product for ${row.name}; no eligible product currently covers this true catalogue gap.`,
      statusLabel: "Source missing",
      supplementId: row.supplementId,
      title: `Source ${row.name}`
    }));
}

function retireActionRows(input: Readonly<{
  optimizedProductIds: ReadonlySet<string>;
  profiles: readonly CatalogueProductProfile[];
  sampleSize: number;
}>): AdminCatalogueOptimizationActionRow[] {
  return input.profiles
    .filter((profile) => !input.optimizedProductIds.has(profile.candidate.id))
    .sort((first, second) =>
      first.selectedCount - second.selectedCount ||
      first.potentialPlanCount - second.potentialPlanCount ||
      (second.expectedPriceAmount ?? 0) - (first.expectedPriceAmount ?? 0) ||
      first.title.localeCompare(second.title)
    )
    .slice(0, 12)
    .map((profile) => ({
      actionType: "consider_retiring" as const,
      affectedPlanCount: profile.selectedCount,
      affectedPlanPercent: safePercent(
        (profile.selectedCount / Math.max(1, input.sampleSize)) * 100
      ),
      brandName: profile.brandName,
      coverageImpactPercent: safePercent(
        profile.stackContributionTotal / Math.max(1, profile.selectedCount)
      ),
      expectedPriceAmount: profile.expectedPriceAmount,
      id: `retire:${profile.candidate.id}`,
      productId: profile.candidate.id,
      rank: 0,
      reason:
        profile.selectedCount > 0
          ? "Outside the minimum carry set; baseline usage was not required to preserve near-full coverage."
          : "No material selection in this simulation and outside the minimum carry set.",
      statusLabel: "Consider retiring",
      supplementId: null,
      title: profile.title
    }));
}

function rankedCatalogueActionRows(
  rows: readonly AdminCatalogueOptimizationActionRow[]
) {
  const actionPriority: Record<AdminCatalogueOptimizationActionType, number> = {
    carry: 1,
    review_first: 2,
    source_missing: 3,
    consider_retiring: 4
  };

  return [...rows]
    .sort((first, second) =>
      actionPriority[first.actionType] - actionPriority[second.actionType] ||
      second.affectedPlanCount - first.affectedPlanCount ||
      second.coverageImpactPercent - first.coverageImpactPercent ||
      (first.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) -
        (second.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
      first.title.localeCompare(second.title)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function runAdminCatalogueOptimizationFast(input: Readonly<{
  simulationData: AdminPlanCoverageSimulationData;
  reviewPriorityProducts?: readonly AdminSimulationReviewProductRow[] | null;
  includeReviewPriorityProducts?: boolean | null;
  coverageLossTolerancePercent?: number | null;
  objective?: AdminCatalogueOptimizationObjective | null;
  mutationMode?: AdminCatalogueOptimizationMutationMode | null;
}>): AdminCatalogueOptimizationData {
  const data = input.simulationData;
  const coverageLossTolerancePercent = positiveNumberOrNull(
    input.coverageLossTolerancePercent
  ) ?? DEFAULT_CATALOGUE_OPTIMIZATION_COVERAGE_LOSS_TOLERANCE_PERCENT;
  const objective = input.objective ?? CATALOGUE_OPTIMIZATION_OBJECTIVE;
  const mutationMode = input.mutationMode ?? CATALOGUE_OPTIMIZATION_MUTATION_MODE;
  const baseline = baselineCatalogueSummary(data);
  const generatedAt = new Date().toISOString();
  const reviewProducts = optimizationReviewProducts({
    includeReviewPriorityProducts: input.includeReviewPriorityProducts,
    reviewPriorityProducts: input.reviewPriorityProducts,
    simulationData: data
  });

  if (data.sampleTraces.length < 1 || data.sampleSize < 1) {
    return {
      actionRows: [],
      baseline,
      carryProducts: [],
      coverageLossTolerancePercent,
      frontier: [],
      generatedAt,
      mutationMode,
      objective,
      optimized: emptyCatalogueOptimizationSummary(0),
      potential: null,
      productReductionCount: 0,
      productReductionPercent: 0,
      sampleSize: data.sampleSize,
      status: "not_ready"
    };
  }

  const profiles = traceCatalogueProductProfiles(data);
  const profilesById = new Map(
    profiles.map((profile) => [profile.candidate.id, profile])
  );
  const rankedProducts = rankedCatalogueProducts(profiles);

  if (rankedProducts.length < 1) {
    const reviewRows = reviewActionRows({
      reviewPriorityProducts: reviewProducts,
      sampleSize: data.sampleSize,
      sampleTraces: data.sampleTraces,
      unmetSupplements: data.unmetSupplements
    });
    const sourceRows = sourceActionRows({
      sampleSize: data.sampleSize,
      unmetSupplements: data.unmetSupplements
    });

    return {
      actionRows: rankedCatalogueActionRows([...reviewRows, ...sourceRows]),
      baseline,
      carryProducts: [],
      coverageLossTolerancePercent,
      frontier: [],
      generatedAt,
      mutationMode,
      objective,
      optimized: emptyCatalogueOptimizationSummary(0),
      potential: null,
      productReductionCount: data.input.candidates.length,
      productReductionPercent: safePercent(
        (data.input.candidates.length / Math.max(1, data.input.candidates.length)) * 100
      ),
      sampleSize: data.sampleSize,
      status: "ready"
    };
  }

  const provisionalPoints: AdminCatalogueOptimizationFrontierPoint[] = [];
  let firstPassingEvaluation: CatalogueEvaluation | null = null;

  for (let count = 1; count <= rankedProducts.length; count += 1) {
    const productIds = rankedProducts
      .slice(0, count)
      .map((profile) => profile.candidate.id);
    const evaluation = evaluateTraceCatalogueSubset({ data, productIds });
    const point = frontierPoint({
      baseline,
      coverageLossTolerancePercent,
      evaluation,
      recommended: false
    });

    provisionalPoints.push(point);

    if (!firstPassingEvaluation && point.withinCoverageFloor) {
      firstPassingEvaluation = evaluation;
      break;
    }
  }

  const fullUsefulProductIds = rankedProducts.map((profile) => profile.candidate.id);
  const hasFullUsefulPoint = provisionalPoints.some((point) =>
    point.productIds.length === fullUsefulProductIds.length &&
    point.productIds.every((id, index) => id === fullUsefulProductIds[index])
  );

  if (!hasFullUsefulPoint) {
    provisionalPoints.push(frontierPoint({
      baseline,
      coverageLossTolerancePercent,
      evaluation: evaluateTraceCatalogueSubset({
        data,
        productIds: fullUsefulProductIds
      }),
      recommended: false
    }));
  }

  if (!firstPassingEvaluation) {
    const fallback = bestFrontierFallback(provisionalPoints);

    firstPassingEvaluation = fallback
      ? evaluateTraceCatalogueSubset({ data, productIds: fallback.productIds })
      : evaluateTraceCatalogueSubset({ data, productIds: fullUsefulProductIds });
  }

  const recommendedEvaluation = prunedTraceCatalogueEvaluation({
    baseline,
    coverageLossTolerancePercent,
    data,
    productIds: firstPassingEvaluation.productIds,
    profilesById
  });
  const recommendedPoint = frontierPoint({
    baseline,
    coverageLossTolerancePercent,
    evaluation: recommendedEvaluation,
    recommended: true
  });
  const frontier = [
    ...provisionalPoints.filter((point) =>
      point.productCount !== recommendedPoint.productCount ||
      point.productIds.join("|") !== recommendedPoint.productIds.join("|")
    ),
    recommendedPoint
  ].sort((first, second) => first.productCount - second.productCount);
  const carryProducts = productRowsFromEvaluation(recommendedEvaluation);
  const optimizedProductIds = new Set(recommendedEvaluation.productIds);
  const actionRows = rankedCatalogueActionRows([
    ...carryActionRows({ carryProducts, sampleSize: data.sampleSize }),
    ...reviewActionRows({
      reviewPriorityProducts: reviewProducts,
      sampleSize: data.sampleSize,
      sampleTraces: data.sampleTraces,
      unmetSupplements: data.unmetSupplements
    }),
    ...sourceActionRows({
      sampleSize: data.sampleSize,
      unmetSupplements: data.unmetSupplements
    }),
    ...retireActionRows({
      optimizedProductIds,
      profiles,
      sampleSize: data.sampleSize
    })
  ]);
  const productReductionCount = Math.max(
    0,
    data.input.candidates.length - recommendedEvaluation.productIds.length
  );

  return {
    actionRows,
    baseline,
    carryProducts,
    coverageLossTolerancePercent,
    frontier,
    generatedAt,
    mutationMode,
    objective,
    optimized: recommendedEvaluation.summary,
    potential: null,
    productReductionCount,
    productReductionPercent: safePercent(
      (productReductionCount / Math.max(1, data.input.candidates.length)) * 100
    ),
    sampleSize: data.sampleSize,
    status: "ready"
  };
}

export function runAdminCatalogueOptimization(input: Readonly<{
  simulationData: AdminPlanCoverageSimulationData;
  reviewPriorityProducts?: readonly AdminSimulationReviewProductRow[] | null;
  includeReviewPriorityProducts?: boolean | null;
  coverageLossTolerancePercent?: number | null;
  objective?: AdminCatalogueOptimizationObjective | null;
  mutationMode?: AdminCatalogueOptimizationMutationMode | null;
}>): AdminCatalogueOptimizationData {
  const data = input.simulationData;
  const coverageLossTolerancePercent = positiveNumberOrNull(
    input.coverageLossTolerancePercent
  ) ?? DEFAULT_CATALOGUE_OPTIMIZATION_COVERAGE_LOSS_TOLERANCE_PERCENT;
  const objective = input.objective ?? CATALOGUE_OPTIMIZATION_OBJECTIVE;
  const mutationMode = input.mutationMode ?? CATALOGUE_OPTIMIZATION_MUTATION_MODE;
  const baseline = baselineCatalogueSummary(data);
  const generatedAt = new Date().toISOString();
  const reviewProducts = optimizationReviewProducts({
    includeReviewPriorityProducts: input.includeReviewPriorityProducts,
    reviewPriorityProducts: input.reviewPriorityProducts,
    simulationData: data
  });

  if (data.sampleTraces.length < 1 || data.sampleSize < 1) {
    return {
      actionRows: [],
      baseline,
      carryProducts: [],
      coverageLossTolerancePercent,
      frontier: [],
      generatedAt,
      mutationMode,
      objective,
      optimized: emptyCatalogueOptimizationSummary(0),
      potential: null,
      productReductionCount: 0,
      productReductionPercent: 0,
      sampleSize: data.sampleSize,
      status: "not_ready"
    };
  }

  const profiles = catalogueProductProfiles(data);
  const profilesById = new Map(
    profiles.map((profile) => [profile.candidate.id, profile])
  );
  const rankedProducts = rankedCatalogueProducts(profiles);

  if (rankedProducts.length < 1) {
    const reviewRows = reviewActionRows({
      reviewPriorityProducts: reviewProducts,
      sampleSize: data.sampleSize,
      sampleTraces: data.sampleTraces,
      unmetSupplements: data.unmetSupplements
    });
    const sourceRows = sourceActionRows({
      sampleSize: data.sampleSize,
      unmetSupplements: data.unmetSupplements
    });

    return {
      actionRows: rankedCatalogueActionRows([...reviewRows, ...sourceRows]),
      baseline,
      carryProducts: [],
      coverageLossTolerancePercent,
      frontier: [],
      generatedAt,
      mutationMode,
      objective,
      optimized: emptyCatalogueOptimizationSummary(0),
      potential: null,
      productReductionCount: data.input.candidates.length,
      productReductionPercent: safePercent(
        (data.input.candidates.length / Math.max(1, data.input.candidates.length)) * 100
      ),
      sampleSize: data.sampleSize,
      status: "ready"
    };
  }

  const provisionalPoints: AdminCatalogueOptimizationFrontierPoint[] = [];
  let firstPassingEvaluation: CatalogueEvaluation | null = null;

  for (let count = 1; count <= rankedProducts.length; count += 1) {
    const productIds = rankedProducts
      .slice(0, count)
      .map((profile) => profile.candidate.id);
    const evaluation = evaluateCatalogueSubset({ data, productIds });
    const point = frontierPoint({
      baseline,
      coverageLossTolerancePercent,
      evaluation,
      recommended: false
    });

    provisionalPoints.push(point);

    if (!firstPassingEvaluation && point.withinCoverageFloor) {
      firstPassingEvaluation = evaluation;
      break;
    }
  }

  const fullUsefulProductIds = rankedProducts.map((profile) => profile.candidate.id);
  const hasFullUsefulPoint = provisionalPoints.some((point) =>
    point.productIds.length === fullUsefulProductIds.length &&
    point.productIds.every((id, index) => id === fullUsefulProductIds[index])
  );

  if (!hasFullUsefulPoint) {
    provisionalPoints.push(frontierPoint({
      baseline,
      coverageLossTolerancePercent,
      evaluation: evaluateCatalogueSubset({
        data,
        productIds: fullUsefulProductIds
      }),
      recommended: false
    }));
  }

  if (!firstPassingEvaluation) {
    const fallback = bestFrontierFallback(provisionalPoints);

    firstPassingEvaluation = fallback
      ? evaluateCatalogueSubset({ data, productIds: fallback.productIds })
      : evaluateCatalogueSubset({
          data,
          productIds: rankedProducts.map((profile) => profile.candidate.id)
        });
  }

  const recommendedEvaluation = prunedCatalogueEvaluation({
    baseline,
    coverageLossTolerancePercent,
    data,
    productIds: firstPassingEvaluation.productIds,
    profilesById
  });
  const recommendedPoint = frontierPoint({
    baseline,
    coverageLossTolerancePercent,
    evaluation: recommendedEvaluation,
    recommended: true
  });
  const frontier = [
    ...provisionalPoints.filter((point) =>
      point.productCount !== recommendedPoint.productCount ||
      point.productIds.join("|") !== recommendedPoint.productIds.join("|")
    ),
    recommendedPoint
  ].sort((first, second) => first.productCount - second.productCount);
  const carryProducts = productRowsFromEvaluation(recommendedEvaluation);
  const optimizedProductIds = new Set(recommendedEvaluation.productIds);
  const actionRows = rankedCatalogueActionRows([
    ...carryActionRows({ carryProducts, sampleSize: data.sampleSize }),
    ...reviewActionRows({
      reviewPriorityProducts: reviewProducts,
      sampleSize: data.sampleSize,
      sampleTraces: data.sampleTraces,
      unmetSupplements: data.unmetSupplements
    }),
    ...sourceActionRows({
      sampleSize: data.sampleSize,
      unmetSupplements: data.unmetSupplements
    }),
    ...retireActionRows({
      optimizedProductIds,
      profiles,
      sampleSize: data.sampleSize
    })
  ]);
  const productReductionCount = Math.max(
    0,
    data.input.candidates.length - recommendedEvaluation.productIds.length
  );

  return {
    actionRows,
    baseline,
    carryProducts,
    coverageLossTolerancePercent,
    frontier,
    generatedAt,
    mutationMode,
    objective,
    optimized: recommendedEvaluation.summary,
    potential: null,
    productReductionCount,
    productReductionPercent: safePercent(
      (productReductionCount / Math.max(1, data.input.candidates.length)) * 100
    ),
    sampleSize: data.sampleSize,
    status: "ready"
  };
}

export async function runAdminCatalogueOptimizationCooperatively(input: Readonly<{
  simulationData: AdminPlanCoverageSimulationData;
  reviewPriorityProducts?: readonly AdminSimulationReviewProductRow[] | null;
  includeReviewPriorityProducts?: boolean | null;
  coverageLossTolerancePercent?: number | null;
  objective?: AdminCatalogueOptimizationObjective | null;
  mutationMode?: AdminCatalogueOptimizationMutationMode | null;
  onProgress?: (progress: AdminCatalogueOptimizationProgress) => void;
  signal?: AbortSignal;
}>): Promise<AdminCatalogueOptimizationData> {
  const runtime: CatalogueOptimizationAsyncRuntime = {
    onProgress: input.onProgress,
    signal: input.signal
  };
  const data = input.simulationData;
  const coverageLossTolerancePercent = positiveNumberOrNull(
    input.coverageLossTolerancePercent
  ) ?? DEFAULT_CATALOGUE_OPTIMIZATION_COVERAGE_LOSS_TOLERANCE_PERCENT;
  const objective = input.objective ?? CATALOGUE_OPTIMIZATION_OBJECTIVE;
  const mutationMode = input.mutationMode ?? CATALOGUE_OPTIMIZATION_MUTATION_MODE;
  const baseline = baselineCatalogueSummary(data);
  const generatedAt = new Date().toISOString();
  const reviewProducts = optimizationReviewProducts({
    includeReviewPriorityProducts: input.includeReviewPriorityProducts,
    reviewPriorityProducts: input.reviewPriorityProducts,
    simulationData: data
  });

  throwIfCatalogueOptimizationAborted(runtime.signal);

  if (data.sampleTraces.length < 1 || data.sampleSize < 1) {
    return {
      actionRows: [],
      baseline,
      carryProducts: [],
      coverageLossTolerancePercent,
      frontier: [],
      generatedAt,
      mutationMode,
      objective,
      optimized: emptyCatalogueOptimizationSummary(0),
      potential: null,
      productReductionCount: 0,
      productReductionPercent: 0,
      sampleSize: data.sampleSize,
      status: "not_ready"
    };
  }

  await yieldCatalogueOptimizationProgress(runtime, {
    current: 0,
    label: "Scoring catalogue products",
    stage: "scoring",
    total: Math.max(1, data.input.candidates.length)
  });

  const profiles = await catalogueProductProfilesAsync(data, runtime);
  const profilesById = new Map(
    profiles.map((profile) => [profile.candidate.id, profile])
  );
  const rankedProducts = rankedCatalogueProducts(profiles);

  if (rankedProducts.length < 1) {
    await yieldCatalogueOptimizationProgress(runtime, {
      current: 1,
      label: "Building catalogue actions",
      stage: "actions",
      total: 1
    });

    const reviewRows = reviewActionRows({
      reviewPriorityProducts: reviewProducts,
      sampleSize: data.sampleSize,
      sampleTraces: data.sampleTraces,
      unmetSupplements: data.unmetSupplements
    });
    const sourceRows = sourceActionRows({
      sampleSize: data.sampleSize,
      unmetSupplements: data.unmetSupplements
    });
    const result = {
      actionRows: rankedCatalogueActionRows([...reviewRows, ...sourceRows]),
      baseline,
      carryProducts: [],
      coverageLossTolerancePercent,
      frontier: [],
      generatedAt,
      mutationMode,
      objective,
      optimized: emptyCatalogueOptimizationSummary(0),
      potential: null,
      productReductionCount: data.input.candidates.length,
      productReductionPercent: safePercent(
        (data.input.candidates.length / Math.max(1, data.input.candidates.length)) * 100
      ),
      sampleSize: data.sampleSize,
      status: "ready" as const
    };

    reportCatalogueOptimizationProgress(runtime, {
      current: 1,
      label: "Minimum catalogue ready",
      stage: "done",
      total: 1
    });

    return result;
  }

  const provisionalPoints: AdminCatalogueOptimizationFrontierPoint[] = [];
  let firstPassingEvaluation: CatalogueEvaluation | null = null;

  for (let count = 1; count <= rankedProducts.length; count += 1) {
    const productIds = rankedProducts
      .slice(0, count)
      .map((profile) => profile.candidate.id);
    const evaluation = await evaluateCatalogueSubsetAsync({
      data,
      productIds,
      progress: {
        current: count,
        label: "Validating catalogue frontier",
        stage: "validating",
        total: rankedProducts.length
      },
      runtime
    });
    const point = frontierPoint({
      baseline,
      coverageLossTolerancePercent,
      evaluation,
      recommended: false
    });

    provisionalPoints.push(point);

    if (!firstPassingEvaluation && point.withinCoverageFloor) {
      firstPassingEvaluation = evaluation;
      break;
    }
  }

  const fullUsefulProductIds = rankedProducts.map((profile) => profile.candidate.id);
  const hasFullUsefulPoint = provisionalPoints.some((point) =>
    point.productIds.length === fullUsefulProductIds.length &&
    point.productIds.every((id, index) => id === fullUsefulProductIds[index])
  );

  if (!hasFullUsefulPoint) {
    provisionalPoints.push(frontierPoint({
      baseline,
      coverageLossTolerancePercent,
      evaluation: await evaluateCatalogueSubsetAsync({
        data,
        productIds: fullUsefulProductIds,
        progress: {
          current: rankedProducts.length,
          label: "Validating full useful catalogue",
          stage: "validating",
          total: rankedProducts.length
        },
        runtime
      }),
      recommended: false
    }));
  }

  if (!firstPassingEvaluation) {
    const fallback = bestFrontierFallback(provisionalPoints);

    firstPassingEvaluation = fallback
      ? await evaluateCatalogueSubsetAsync({
          data,
          productIds: fallback.productIds,
          progress: {
            current: rankedProducts.length,
            label: "Validating best frontier fallback",
            stage: "validating",
            total: rankedProducts.length
          },
          runtime
        })
      : await evaluateCatalogueSubsetAsync({
          data,
          productIds: rankedProducts.map((profile) => profile.candidate.id),
          progress: {
            current: rankedProducts.length,
            label: "Validating full ranked catalogue",
            stage: "validating",
            total: rankedProducts.length
          },
          runtime
        });
  }

  const recommendedEvaluation = await prunedCatalogueEvaluationAsync({
    baseline,
    coverageLossTolerancePercent,
    data,
    productIds: firstPassingEvaluation.productIds,
    profilesById,
    runtime
  });
  const recommendedPoint = frontierPoint({
    baseline,
    coverageLossTolerancePercent,
    evaluation: recommendedEvaluation,
    recommended: true
  });
  const frontier = [
    ...provisionalPoints.filter((point) =>
      point.productCount !== recommendedPoint.productCount ||
      point.productIds.join("|") !== recommendedPoint.productIds.join("|")
    ),
    recommendedPoint
  ].sort((first, second) => first.productCount - second.productCount);
  const carryProducts = productRowsFromEvaluation(recommendedEvaluation);
  const optimizedProductIds = new Set(recommendedEvaluation.productIds);

  await yieldCatalogueOptimizationProgress(runtime, {
    current: 1,
    label: "Building catalogue actions",
    stage: "actions",
    total: 1
  });

  const actionRows = rankedCatalogueActionRows([
    ...carryActionRows({ carryProducts, sampleSize: data.sampleSize }),
    ...reviewActionRows({
      reviewPriorityProducts: reviewProducts,
      sampleSize: data.sampleSize,
      sampleTraces: data.sampleTraces,
      unmetSupplements: data.unmetSupplements
    }),
    ...sourceActionRows({
      sampleSize: data.sampleSize,
      unmetSupplements: data.unmetSupplements
    }),
    ...retireActionRows({
      optimizedProductIds,
      profiles,
      sampleSize: data.sampleSize
    })
  ]);
  const productReductionCount = Math.max(
    0,
    data.input.candidates.length - recommendedEvaluation.productIds.length
  );
  const result = {
    actionRows,
    baseline,
    carryProducts,
    coverageLossTolerancePercent,
    frontier,
    generatedAt,
    mutationMode,
    objective,
    optimized: recommendedEvaluation.summary,
    potential: null,
    productReductionCount,
    productReductionPercent: safePercent(
      (productReductionCount / Math.max(1, data.input.candidates.length)) * 100
    ),
    sampleSize: data.sampleSize,
    status: "ready" as const
  };

  reportCatalogueOptimizationProgress(runtime, {
    current: 1,
    label: "Minimum catalogue ready",
    stage: "done",
    total: 1
  });

  return result;
}

export function targetComparableAmountBySupplement(
  candidates: readonly ProductCandidate[]
) {
  const comparableAmountsBySupplement = new Map<string, number[]>();

  for (const product of candidates) {
    for (const fact of product.facts) {
      if (!fact.supplementId) {
        continue;
      }

      const comparableAmount = factComparableAmount(fact);

      if (comparableAmount === null) {
        continue;
      }

      const list = comparableAmountsBySupplement.get(fact.supplementId) ?? [];
      list.push(comparableAmount);
      comparableAmountsBySupplement.set(fact.supplementId, list);
    }
  }

  return new Map(
    [...comparableAmountsBySupplement.entries()].map(([supplementId, amounts]) => [
      supplementId,
      median(amounts) || 1000
    ])
  );
}
