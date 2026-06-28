import {
  factComparableAmount,
  safePercent
} from "@/lib/product-recommendation-metrics";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  recommendProductStackFullBeam,
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

export type AdminPlanCoverageSimulationData = Readonly<{
  countryCode: string;
  databaseAvailable: boolean;
  generatedAt: string;
  input: AdminPlanCoverageSimulationInput;
  realCustomerArchetypes: readonly SyntheticPlanArchetype[];
  realCustomerProfileCount: number;
  realCustomerProfiles: readonly SyntheticPlanArchetype[];
  sampleSize: number;
  seed: string;
  summary: {
    averageCoveragePercent: number;
    medianCoveragePercent: number;
    p10CoveragePercent: number;
    percentAbove50: number;
    percentAbove75: number;
    percentAbove90: number;
    expectedCostAmount: number | null;
    currency: string;
  };
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
  costValues: number[];
  coverageValues: number[];
  generatedAt: string;
  input: AdminPlanCoverageSimulationInput;
  productStats: Map<string, AdminPlanCoverageSimulationProductStats>;
  randomState: number;
  reviewPriorityProducts: readonly AdminSimulationReviewProductRow[];
  sampleSize: number;
  unmetCounts: Map<string, AdminPlanCoverageSimulationUnmetDemandBucket>;
};

export const ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES = 256;
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

function normalizeDemandNeed(value: unknown): ProductRecommendationNeed | null {
  const record = recordFromUnknown(value);
  const displayName = textOrEmpty(record.displayName);
  const normalizedName = textOrEmpty(record.normalizedName);
  const sourceId = textOrEmpty(record.sourceId) || textOrEmpty(record.id);
  const id = textOrEmpty(record.id) || `demand:${normalizedName}`;

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
    targetComparableAmount: positiveNumberOrNull(record.targetComparableAmount),
    targetDose:
      record.targetDose && typeof record.targetDose === "object"
        ? record.targetDose as ProductRecommendationNeed["targetDose"]
        : null,
    targetText: textOrEmpty(record.targetText) || null,
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
  supplements?: readonly AdminPlanCoverageSimulationSupplement[] | null;
}> = {}): AdminPlanCoverageSimulationData {
  const simulationInput = normalizeSimulationInput(input);
  const realCustomerProfiles = normalizeSyntheticPlanArchetypes(
    input.realCustomerProfiles ?? []
  ).filter((archetype) => archetype.source === "customer_profile");

  return {
    archetypes: simulationInput.archetypes,
    compactCatalog: [],
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

export function createAdminPlanCoverageSimulationRunner(input: Readonly<{
  archetypes?: readonly SyntheticPlanArchetype[] | null;
  candidates: readonly ProductCandidate[];
  countryCode?: string | null;
  demandProfiles?: readonly AdminPlanCoverageDemandProfile[] | null;
  reviewPriorityProducts?: readonly AdminSimulationReviewProductRow[] | null;
  seed?: string | null;
  supplements: readonly AdminPlanCoverageSimulationSupplement[];
}>): AdminPlanCoverageSimulationRunner {
  const simulationInput = normalizeSimulationInput(input);

  return {
    costValues: [],
    coverageValues: [],
    generatedAt: new Date().toISOString(),
    input: simulationInput,
    productStats: new Map(),
    randomState: initialRandomState(simulationInput.seed),
    reviewPriorityProducts: input.reviewPriorityProducts ?? [],
    sampleSize: 0,
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
    seed: runner.input.seed,
    summary: {
      averageCoveragePercent: safePercent(average(runner.coverageValues)),
      currency:
        runner.input.candidates.find((candidate) => candidate.currency)
          ?.currency ?? "THB",
      expectedCostAmount:
        runner.costValues.some((value) => value > 0)
          ? Math.round(average(runner.costValues))
          : null,
      medianCoveragePercent: safePercent(median(runner.coverageValues)),
      p10CoveragePercent: safePercent(percentile(runner.coverageValues, 10)),
      percentAbove50: safePercent(
        (runner.coverageValues.filter((value) => value >= 50).length /
          Math.max(1, runner.sampleSize)) * 100
      ),
      percentAbove75: safePercent(
        (runner.coverageValues.filter((value) => value >= 75).length /
          Math.max(1, runner.sampleSize)) * 100
      ),
      percentAbove90: safePercent(
        (runner.coverageValues.filter((value) => value >= 90).length /
          Math.max(1, runner.sampleSize)) * 100
      )
    },
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
  const result = recommendProductStackFullBeam({
    candidates: [...runner.input.candidates],
    clientSex: demandProfile?.clientSex ?? archetype.clientSex,
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

  runner.sampleSize += 1;
  runner.coverageValues.push(coverage);
  runner.costValues.push(selectedCost);

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
  supplements: readonly AdminPlanCoverageSimulationSupplement[];
}>): AdminPlanCoverageSimulationData {
  const runner = createAdminPlanCoverageSimulationRunner(input);
  const sampleSize = normalizeSimulationSampleSize(input.sampleSize);

  while (runner.sampleSize < sampleSize) {
    runNextAdminPlanCoverageSimulationSample(runner);
  }

  return adminPlanCoverageSimulationDataFromRunner(runner);
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
