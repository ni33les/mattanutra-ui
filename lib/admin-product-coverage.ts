import { getSql } from "@/lib/db";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  getProductRecommendationCandidates,
  getRetailerAwareProductRecommendationCandidateSets
} from "@/lib/admin-product-search";
import {
  exclusionReason,
  factComparableAmount,
  safePercent
} from "@/lib/product-recommendation-metrics";
import {
  recommendProductStackFullBeam,
  type ProductCandidate,
  type ProductCandidateFact,
  type ProductClientSex,
  type ProductRecommendationNeed
} from "@/lib/product-recommendations";

export type SupplementCoverageState =
  | "covered"
  | "dirty"
  | "missing"
  | "pending_review";

export type AdminSupplementCoverageProductRow = Readonly<{
  brandName: string | null;
  canonicalFactCount: number;
  cheapestPriceAmount: number | null;
  currency: string;
  doseLabel: string | null;
  eligible: boolean;
  id: string;
  imageUrl: string | null;
  productAudience: ProductCandidate["productAudience"] | null;
  productKind: ProductCandidate["productKind"] | null;
  retailAvailable: boolean;
  status: ProductCandidate["status"];
  title: string;
  validationSummary: string | null;
  why: string;
}>;

export type AdminSupplementCoverageRow = Readonly<{
  category: string | null;
  cheapestEligiblePriceAmount: number | null;
  currency: string;
  dirtyProductCount: number;
  eligibleProductCount: number;
  pendingReviewProductCount: number;
  products: AdminSupplementCoverageProductRow[];
  retailAvailableProductCount: number;
  state: SupplementCoverageState;
  supplementId: string;
  supplementName: string;
  totalCoveringProductCount: number;
}>;

export type AdminProductCoverageData = Readonly<{
  countryCode: string;
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminSupplementCoverageRow[];
  summary: {
    activeSupplements: number;
    coveredSupplements: number;
    dirtySupplements: number;
    missingSupplements: number;
    pendingReviewSupplements: number;
    totalEligibleProducts: number;
  };
}>;

export type SyntheticPlanArchetype = Readonly<{
  clientSex: ProductClientSex | null;
  id: string;
  name: string;
  needCount: number;
}>;

export type AdminPlanCoverageSimulationData = Readonly<{
  countryCode: string;
  databaseAvailable: boolean;
  generatedAt: string;
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
  unmetSupplements: ReadonlyArray<Readonly<{
    count: number;
    name: string;
    percent: number;
  }>>;
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

type SupplementRow = Readonly<{
  category: string | null;
  id: string;
  name: string;
  normalized_name: string;
}>;

type CoverageSupplementInput = Readonly<{
  category: string | null;
  id: string;
  name: string;
  normalizedName: string;
  targetComparableAmount: number | null;
}>;

const DEFAULT_SIMULATION_SAMPLE_SIZE = 64;
const DEFAULT_SIMULATION_SEED = "mattanutra-product-coverage-v1";
const SIMULATION_ARCHETYPES: readonly SyntheticPlanArchetype[] = [
  { clientSex: null, id: "general-wellness", name: "General wellness", needCount: 4 },
  { clientSex: null, id: "active-recovery", name: "Active recovery", needCount: 5 },
  { clientSex: null, id: "stress-sleep", name: "Stress and sleep", needCount: 4 },
  { clientSex: null, id: "healthy-ageing", name: "Healthy ageing", needCount: 6 },
  { clientSex: "female", id: "female-support", name: "Female support", needCount: 5 },
  { clientSex: "male", id: "male-support", name: "Male support", needCount: 5 }
];

function emptyProductCoverageData(countryCode = defaultProductCountryCode): AdminProductCoverageData {
  return {
    countryCode,
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      activeSupplements: 0,
      coveredSupplements: 0,
      dirtySupplements: 0,
      missingSupplements: 0,
      pendingReviewSupplements: 0,
      totalEligibleProducts: 0
    }
  };
}

export function emptyAdminProductCoverageData(
  countryCode = defaultProductCountryCode
) {
  return emptyProductCoverageData(countryCode);
}

export function emptyAdminPlanCoverageSimulationData(
  input: Readonly<{
    countryCode?: string | null;
    sampleSize?: number | null;
    seed?: string | null;
  }> = {}
): AdminPlanCoverageSimulationData {
  return {
    archetypes: SIMULATION_ARCHETYPES,
    compactCatalog: [],
    countryCode: normalizeCoverageCountryCode(input.countryCode),
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    mostUsefulProducts: [],
    sampleSize: normalizeSimulationSampleSize(input.sampleSize),
    seed: input.seed?.trim() || DEFAULT_SIMULATION_SEED,
    summary: {
      averageCoveragePercent: 0,
      currency: "THB",
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

function normalizeCoverageCountryCode(value: string | null | undefined) {
  return normalizeProductCountryCode(value ?? defaultProductCountryCode) ??
    defaultProductCountryCode;
}

export function normalizeSimulationSampleSize(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.min(256, Math.max(8, Math.round(parsed)))
    : DEFAULT_SIMULATION_SAMPLE_SIZE;
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
    Math.min(sorted.length - 1, Math.floor((percentileRank / 100) * sorted.length))
  );

  return sorted[index] ?? 0;
}

function average(values: readonly number[]) {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed: string) {
  let state = hashSeed(seed) || 1;

  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);

    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function productPrice(product: ProductCandidate) {
  return positiveNumberOrNull(product.unitPriceAmount) ??
    positiveNumberOrNull(product.priceAmount);
}

function moneyLabel(amount: number | null, currency: string) {
  return amount === null ? "No price" : `${currency} ${Math.round(amount)}`;
}

function factDoseLabel(fact: ProductCandidateFact) {
  if (typeof fact.amount !== "number" || !fact.unit) {
    return null;
  }

  const amount = Number.isInteger(fact.amount)
    ? fact.amount.toFixed(0)
    : fact.amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

  return `${amount} ${fact.unit}`;
}

function supplementFacts(product: ProductCandidate, supplementId: string) {
  return product.facts.filter((fact) =>
    fact.itemType === "supplement" && fact.supplementId === supplementId
  );
}

export function productFactCoversSupplementForMatching(
  fact: ProductCandidateFact,
  supplementId: string
) {
  return fact.itemType === "supplement" &&
    fact.supplementId === supplementId &&
    positiveNumberOrNull(fact.amount) !== null &&
    typeof fact.unit === "string" &&
    fact.unit.trim().length > 0 &&
    factComparableAmount(fact) !== null;
}

export function productCoversSupplementForMatching(
  product: ProductCandidate,
  supplementId: string
) {
  return supplementFacts(product, supplementId).some((fact) =>
    productFactCoversSupplementForMatching(fact, supplementId)
  );
}

function productCoverageBlockReason(product: ProductCandidate, supplementId: string) {
  const productReason = exclusionReason(product);

  if (productReason) {
    return productReason;
  }

  if (!productCoversSupplementForMatching(product, supplementId)) {
    return "No usable per-serving fact for this supplement";
  }

  return null;
}

function productCoverageRow(
  product: ProductCandidate,
  supplementId: string,
  retailAvailableProductIds: ReadonlySet<string>
): AdminSupplementCoverageProductRow {
  const facts = supplementFacts(product, supplementId);
  const firstDoseFact = facts.find((fact) =>
    productFactCoversSupplementForMatching(fact, supplementId)
  ) ?? facts[0];
  const blockReason = productCoverageBlockReason(product, supplementId);
  const price = productPrice(product);

  return {
    brandName: product.brandName ?? null,
    canonicalFactCount: facts.length,
    cheapestPriceAmount: price,
    currency: product.currency,
    doseLabel: firstDoseFact ? factDoseLabel(firstDoseFact) : null,
    eligible: blockReason === null,
    id: product.id,
    imageUrl: product.imageUrl ?? null,
    productAudience: product.productAudience ?? null,
    productKind: product.productKind ?? null,
    retailAvailable: retailAvailableProductIds.has(product.id),
    status: product.status,
    title: product.title,
    validationSummary: product.validation?.summary ?? null,
    why: blockReason ?? `Eligible at ${moneyLabel(price, product.currency)}`
  };
}

export function classifySupplementCoverage(input: Readonly<{
  dirtyProductCount: number;
  eligibleProductCount: number;
  pendingReviewProductCount: number;
}>) {
  if (input.eligibleProductCount > 0) {
    return "covered" as const;
  }

  if (input.pendingReviewProductCount > 0) {
    return "pending_review" as const;
  }

  return input.dirtyProductCount > 0 ? "dirty" as const : "missing" as const;
}

function buildCoverageRows(
  supplements: readonly CoverageSupplementInput[],
  candidates: readonly ProductCandidate[],
  retailAvailableProductIds: ReadonlySet<string>
) {
  return supplements.map((supplement) => {
    const products = candidates
      .filter((product) => supplementFacts(product, supplement.id).length > 0)
      .map((product) =>
        productCoverageRow(product, supplement.id, retailAvailableProductIds)
      )
      .sort((first, second) =>
        Number(second.eligible) - Number(first.eligible) ||
        Number(second.retailAvailable) - Number(first.retailAvailable) ||
        (first.cheapestPriceAmount ?? Number.MAX_SAFE_INTEGER) -
          (second.cheapestPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
        first.title.localeCompare(second.title)
      );
    const eligibleProducts = products.filter((product) => product.eligible);
    const pendingReviewProductCount = products.filter((product) =>
      product.status === "pending_review"
    ).length;
    const dirtyProductCount = products.filter((product) =>
      !product.eligible && product.status !== "pending_review"
    ).length;
    const cheapestEligiblePriceAmount =
      eligibleProducts
        .map((product) => product.cheapestPriceAmount)
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b)[0] ?? null;
    const currency =
      eligibleProducts.find((product) => product.cheapestPriceAmount !== null)
        ?.currency ??
      products.find((product) => product.cheapestPriceAmount !== null)?.currency ??
      "THB";

    return {
      category: supplement.category,
      cheapestEligiblePriceAmount,
      currency,
      dirtyProductCount,
      eligibleProductCount: eligibleProducts.length,
      pendingReviewProductCount,
      products,
      retailAvailableProductCount:
        eligibleProducts.filter((product) => product.retailAvailable).length,
      state: classifySupplementCoverage({
        dirtyProductCount,
        eligibleProductCount: eligibleProducts.length,
        pendingReviewProductCount
      }),
      supplementId: supplement.id,
      supplementName: supplement.name,
      totalCoveringProductCount: products.length
    } satisfies AdminSupplementCoverageRow;
  }).sort((first, second) =>
    first.eligibleProductCount - second.eligibleProductCount ||
    second.pendingReviewProductCount - first.pendingReviewProductCount ||
    first.supplementName.localeCompare(second.supplementName)
  );
}

async function schemaAvailable(sql: NonNullable<ReturnType<typeof getSql>>) {
  const rows = await sql<Array<{
    product_facts: string | null;
    products: string | null;
    supplements: string | null;
  }>>`
    select
      to_regclass('public.product_facts')::text as product_facts,
      to_regclass('public.products')::text as products,
      to_regclass('public.supplements')::text as supplements
  `;
  const row = rows[0];

  return Boolean(row?.product_facts && row.products && row.supplements);
}

async function loadActiveSupplements(sql: NonNullable<ReturnType<typeof getSql>>) {
  return sql<SupplementRow[]>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      supplements.category
    from public.supplements
    where supplements.is_active = true
      and supplements.list_status = 'active'
    order by supplements.category asc, supplements.name asc
  `;
}

function supplementInputs(
  rows: readonly SupplementRow[],
  candidates: readonly ProductCandidate[]
): CoverageSupplementInput[] {
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

  return rows.map((row) => ({
    category: row.category,
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    targetComparableAmount:
      median(comparableAmountsBySupplement.get(row.id) ?? []) || 1000
  }));
}

async function loadRetailAvailableProductIds(countryCode: string) {
  try {
    const sets = await getRetailerAwareProductRecommendationCandidateSets({
      countryCode,
      includeIneligible: true
    });

    return new Set(
      sets.flatMap((set) =>
        set.candidates
          .filter((product) =>
            product.retailAvailabilityStatus === "available_now" ||
            product.retailAvailabilityStatus === "backorder"
          )
          .map((product) => product.id)
      )
    );
  } catch {
    return new Set<string>();
  }
}

export async function getAdminProductCoverageData(input: Readonly<{
  countryCode?: string | null;
}> = {}): Promise<AdminProductCoverageData> {
  const countryCode = normalizeCoverageCountryCode(input.countryCode);
  const sql = getSql();

  if (!sql) {
    return emptyProductCoverageData(countryCode);
  }

  try {
    if (!(await schemaAvailable(sql))) {
      return emptyProductCoverageData(countryCode);
    }

    const [supplementRows, candidates, retailAvailableProductIds] =
      await Promise.all([
        loadActiveSupplements(sql),
        getProductRecommendationCandidates({
          countryCode,
          includeIneligible: true
        }),
        loadRetailAvailableProductIds(countryCode)
      ]);
    const supplements = supplementInputs(supplementRows, candidates);
    const rows = buildCoverageRows(
      supplements,
      candidates,
      retailAvailableProductIds
    );

    return {
      countryCode,
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows,
      summary: {
        activeSupplements: rows.length,
        coveredSupplements: rows.filter((row) => row.state === "covered").length,
        dirtySupplements: rows.filter((row) => row.state === "dirty").length,
        missingSupplements: rows.filter((row) => row.state === "missing").length,
        pendingReviewSupplements:
          rows.filter((row) => row.state === "pending_review").length,
        totalEligibleProducts:
          new Set(rows.flatMap((row) =>
            row.products.filter((product) => product.eligible).map((product) => product.id)
          )).size
      }
    };
  } catch (error) {
    console.error("Failed to load product coverage data", error);
    return emptyProductCoverageData(countryCode);
  }
}

function buildSyntheticNeeds(input: Readonly<{
  archetype: SyntheticPlanArchetype;
  random: () => number;
  sampleIndex: number;
  supplements: readonly CoverageSupplementInput[];
}>) {
  const needs: ProductRecommendationNeed[] = [];
  const used = new Set<string>();
  const needCount = Math.min(input.archetype.needCount, input.supplements.length);
  const start = Math.floor(input.random() * Math.max(1, input.supplements.length));

  for (let index = 0; index < input.supplements.length && needs.length < needCount; index += 1) {
    const supplement =
      input.supplements[(start + index * 7 + input.sampleIndex * 3) % input.supplements.length];

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
  productStats: ReadonlyMap<string, {
    brandName: string | null;
    coverageTotal: number;
    priceTotal: number;
    pricedCount: number;
    stackContributionTotal: number;
    title: string;
    chosenCount: number;
  }>,
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
        stats.pricedCount > 0 ? Math.round(stats.priceTotal / stats.pricedCount) : null,
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

export function runAdminPlanCoverageSimulation(input: Readonly<{
  candidates: readonly ProductCandidate[];
  countryCode?: string | null;
  sampleSize?: number | null;
  seed?: string | null;
  supplements: readonly CoverageSupplementInput[];
}>): AdminPlanCoverageSimulationData {
  const countryCode = normalizeCoverageCountryCode(input.countryCode);
  const sampleSize = normalizeSimulationSampleSize(input.sampleSize);
  const seed = input.seed?.trim() || DEFAULT_SIMULATION_SEED;
  const random = seededRandom(seed);
  const coverageValues: number[] = [];
  const costValues: number[] = [];
  const unmetCounts = new Map<string, number>();
  const productStats = new Map<string, {
    brandName: string | null;
    coverageTotal: number;
    priceTotal: number;
    pricedCount: number;
    stackContributionTotal: number;
    title: string;
    chosenCount: number;
  }>();

  for (let sampleIndex = 0; sampleIndex < sampleSize; sampleIndex += 1) {
    const archetype = SIMULATION_ARCHETYPES[sampleIndex % SIMULATION_ARCHETYPES.length]!;
    const needs = buildSyntheticNeeds({
      archetype,
      random,
      sampleIndex,
      supplements: input.supplements
    });
    const result = recommendProductStackFullBeam({
      candidates: [...input.candidates],
      clientSex: archetype.clientSex,
      countryCode,
      maxProducts: 6,
      needs,
      stackPreference: "balanced"
    });
    const coverage = safePercent(result.supplementProductCoveragePercent);
    const selectedCost = result.recommendations.reduce(
      (total, item) =>
        total + (productPrice(item.product) ?? 0),
      0
    );

    coverageValues.push(coverage);
    costValues.push(selectedCost);

    for (const need of result.diagnostics.unmatchedNeeds) {
      unmetCounts.set(need.displayName, (unmetCounts.get(need.displayName) ?? 0) + 1);
    }

    for (const item of result.recommendations) {
      const current = productStats.get(item.product.id) ?? {
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

      productStats.set(item.product.id, current);
    }
  }

  const mostUsefulProducts = productUsefulnessRows(productStats, sampleSize);
  const compactCatalog = mostUsefulProducts
    .filter((row) =>
      row.averageStackContributionPercent > 0 &&
      row.chosenCount / Math.max(1, sampleSize) >= 0.02
    )
    .slice(0, 24)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    archetypes: SIMULATION_ARCHETYPES,
    compactCatalog,
    countryCode,
    databaseAvailable: true,
    generatedAt: new Date().toISOString(),
    mostUsefulProducts: mostUsefulProducts.slice(0, 24),
    sampleSize,
    seed,
    summary: {
      averageCoveragePercent: safePercent(average(coverageValues)),
      currency: input.candidates.find((candidate) => candidate.currency)?.currency ?? "THB",
      expectedCostAmount:
        costValues.some((value) => value > 0) ? Math.round(average(costValues)) : null,
      medianCoveragePercent: safePercent(median(coverageValues)),
      p10CoveragePercent: safePercent(percentile(coverageValues, 10)),
      percentAbove50: safePercent(
        (coverageValues.filter((value) => value >= 50).length / Math.max(1, sampleSize)) * 100
      ),
      percentAbove75: safePercent(
        (coverageValues.filter((value) => value >= 75).length / Math.max(1, sampleSize)) * 100
      ),
      percentAbove90: safePercent(
        (coverageValues.filter((value) => value >= 90).length / Math.max(1, sampleSize)) * 100
      )
    },
    unmetSupplements: [...unmetCounts.entries()]
      .map(([name, count]) => ({
        count,
        name,
        percent: safePercent((count / Math.max(1, sampleSize)) * 100)
      }))
      .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name))
      .slice(0, 24)
  };
}

export async function getAdminPlanCoverageSimulationData(input: Readonly<{
  countryCode?: string | null;
  sampleSize?: number | null;
  seed?: string | null;
}> = {}): Promise<AdminPlanCoverageSimulationData> {
  const countryCode = normalizeCoverageCountryCode(input.countryCode);
  const sql = getSql();

  if (!sql) {
    return emptyAdminPlanCoverageSimulationData({ ...input, countryCode });
  }

  try {
    if (!(await schemaAvailable(sql))) {
      return emptyAdminPlanCoverageSimulationData({ ...input, countryCode });
    }

    const [supplementRows, candidates] = await Promise.all([
      loadActiveSupplements(sql),
      getProductRecommendationCandidates({
        countryCode,
        includeIneligible: false
      })
    ]);
    const supplements = supplementInputs(supplementRows, candidates);

    return runAdminPlanCoverageSimulation({
      candidates,
      countryCode,
      sampleSize: input.sampleSize,
      seed: input.seed,
      supplements
    });
  } catch (error) {
    console.error("Failed to run plan coverage simulation", error);
    return emptyAdminPlanCoverageSimulationData({ ...input, countryCode });
  }
}
