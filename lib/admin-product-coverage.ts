import { getSql } from "@/lib/db";
import {
  getAdminCustomerInsightsData,
  type AdminCustomerInsightsData,
  type CustomerInsightProfile
} from "@/lib/admin-customer-insights";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
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
  factComparableAmount
} from "@/lib/product-recommendation-metrics";
import {
  type ProductCandidate,
  type ProductCandidateFact
} from "@/lib/product-recommendations";
import {
  emptyAdminPlanCoverageSimulationData,
  productPrice,
  targetComparableAmountBySupplement,
  type AdminPlanCoverageSimulationData,
  type AdminPlanCoverageSimulationSupplement,
  type AdminSimulationReviewProductRow,
  type SyntheticPlanArchetype
} from "@/lib/admin-product-coverage-simulation";

export {
  ADMIN_PLAN_COVERAGE_SIMULATION_MAX_SAMPLES,
  DEFAULT_SIMULATION_SAMPLE_SIZE,
  DEFAULT_SIMULATION_SEED,
  SIMULATION_ARCHETYPES,
  adminPlanCoverageSimulationDataFromRunner,
  buildSimulationNextMoveRows,
  buildAdminCataloguePotentialTraceChunk,
  createAdminPlanCoverageSimulationRunner,
  emptyAdminPlanCoverageSimulationData,
  normalizeDemandProfiles,
  normalizeSyntheticPlanArchetypes,
  normalizeSimulationSampleSize,
  adminCataloguePotentialCandidates,
  runAdminPlanCoverageSimulation,
  runAdminCatalogueOptimization,
  runAdminCatalogueOptimizationCooperatively,
  runAdminCatalogueOptimizationFast,
  runAdminCataloguePotentialOptimizationFromTraces,
  runAdminCataloguePotentialOptimizationFast,
  runNextAdminPlanCoverageSimulationSample,
  sanitizeDemandProfilesForSimulationSupplements
} from "@/lib/admin-product-coverage-simulation";
export type {
  AdminCatalogueOptimizationActionRow,
  AdminCatalogueOptimizationData,
  AdminCatalogueOptimizationFrontierPoint,
  AdminCatalogueOptimizationProductRow,
  AdminCatalogueOptimizationProgress,
  AdminCatalogueOptimizationSummary,
  AdminCataloguePotentialFinalizeRequest,
  AdminCataloguePotentialOptimizationData,
  AdminCataloguePotentialTraceChunkRequest,
  AdminCataloguePotentialTraceChunkResponse,
  AdminPlanCoverageDemandProfile,
  AdminPlanCoverageSimulationCheckpoint,
  AdminPlanCoverageSimulationConvergence,
  AdminPlanCoverageSimulationData,
  AdminPlanCoverageSimulationInput,
  AdminPlanCoverageSimulationProductStats,
  AdminPlanCoverageSimulationRunner,
  AdminPlanCoverageSimulationSampleTrace,
  AdminPlanCoverageSimulationSupplement,
  AdminPlanCoverageSimulationUnmetDemandBucket,
  AdminPlanCoverageSimulationUnmetDemandRow,
  AdminPlanCoverageUnmetDemandState,
  AdminSimulationNextMoveRow,
  AdminSimulationReviewProductRow,
  AdminSimulationProductUsefulnessRow,
  SyntheticPlanArchetype
} from "@/lib/admin-product-coverage-simulation";

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

type SupplementRow = Readonly<{
  category: string | null;
  id: string;
  name: string;
  normalized_name: string;
}>;

type CoverageSupplementInput = AdminPlanCoverageSimulationSupplement;

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

function normalizeCoverageCountryCode(value: string | null | undefined) {
  return normalizeProductCountryCode(value ?? defaultProductCountryCode) ??
    defaultProductCountryCode;
}

function positiveNumberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

async function loadActiveSupplements(
  sql: NonNullable<ReturnType<typeof getSql>>,
  countryCode: string
) {
  return sql<SupplementRow[]>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      supplements.category
    from public.supplements
    left join lateral (
      select rule.status
      from jsonb_to_recordset(
        case
          when jsonb_typeof(supplements.source_payload -> 'countryAvailability') = 'array'
            then supplements.source_payload -> 'countryAvailability'
          else '[]'::jsonb
        end
      ) as rule("countryCode" text, country_code text, status text)
      where coalesce(rule."countryCode", rule.country_code) = ${countryCode}
        and rule.status in ('allowed', 'blocked')
      limit 1
    ) country_availability on true
    where (
      country_availability.status = 'allowed'
      or (
        country_availability.status is null
        and supplements.is_active = true
        and supplements.list_status = 'active'
      )
    )
    order by supplements.category asc, supplements.name asc
  `;
}

async function loadSupplementGovernanceHash(
  sql: NonNullable<ReturnType<typeof getSql>>,
  countryCode: string
) {
  const rows = await sql<Array<{ governance_hash: string | null }>>`
    select md5(coalesce(
      string_agg(
        concat_ws(
          ':',
          supplements.id::text,
          ${countryCode}::text,
          supplements.list_status,
          supplements.is_active::text,
          supplements.updated_at::text,
          coalesce(supplements.source_payload -> 'countryAvailability', '[]'::jsonb)::text
        ),
        '|'
        order by supplements.id::text
      ),
      ''
    )) as governance_hash
    from public.supplements
  `;

  return rows[0]?.governance_hash ?? "supplement-governance:empty";
}

function supplementInputs(
  rows: readonly SupplementRow[],
  candidates: readonly ProductCandidate[]
): CoverageSupplementInput[] {
  const comparableAmountBySupplement =
    targetComparableAmountBySupplement(candidates);

  return rows.map((row) => ({
    category: row.category,
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    targetComparableAmount: comparableAmountBySupplement.get(row.id) ?? 1000
  }));
}

function productPassesSimulationCandidateGate(product: ProductCandidate) {
  return product.status === "approved" &&
    product.brandStatus === "approved" &&
    product.validation?.status === "pass" &&
    product.automatedSafetyPassed;
}

const realCustomerProfileLimit = 256;
const reviewPriorityProductLimit = 250;

function uniqueList(values: readonly string[], max = 8) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = value.trim();
    const key = text.toLowerCase();

    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(text);

    if (result.length >= max) {
      break;
    }
  }

  return result;
}

function ageFromBand(ageBand: string | null): number | null {
  if (ageBand === "18-25") {
    return 22;
  }

  if (ageBand === "26-35") {
    return 31;
  }

  if (ageBand === "36-45") {
    return 41;
  }

  if (ageBand === "46-55") {
    return 51;
  }

  if (ageBand === "56-65") {
    return 61;
  }

  if (ageBand === "66+") {
    return 70;
  }

  return null;
}

function clientSexFromCustomer(customer: CustomerInsightProfile) {
  return customer.demographics.sex === "female" || customer.demographics.sex === "male"
    ? customer.demographics.sex
    : null;
}

function realCustomerNeedCount(input: Readonly<{
  goals: readonly string[];
  preferredSupplementNames: readonly string[];
}>) {
  const signalCount =
    input.preferredSupplementNames.length > 0
      ? input.preferredSupplementNames.length
      : Math.max(4, input.goals.length + 2);

  return Math.max(1, Math.min(8, signalCount));
}

function customerProfileDescription(customer: CustomerInsightProfile) {
  return [
    customer.profile,
    customer.demographics.ageLabel,
    customer.demographics.lifeStage,
    customer.entitlementLabel,
    customer.goals.length > 0 ? `Goals: ${customer.goals.slice(0, 3).join(", ")}` : null,
    customer.constraints.length > 0
      ? `Constraints: ${customer.constraints.slice(0, 3).join(", ")}`
      : null
  ]
    .filter(Boolean)
    .join(" · ");
}

export function simulationCustomerProfilesFromInsights(
  data: AdminCustomerInsightsData
) {
  return data.customers
    .slice()
    .sort((first, second) =>
      second.lastActivityAt.localeCompare(first.lastActivityAt)
    )
    .slice(0, realCustomerProfileLimit)
    .map((customer, index): SyntheticPlanArchetype => {
      const preferredSupplementNames = uniqueList(
        customer.supplementInterests,
        8
      );
      const goals = uniqueList(customer.goals, 8);

      return {
        age: ageFromBand(customer.demographics.ageBand),
        clientSex: clientSexFromCustomer(customer),
        customerCount: 1,
        description: customerProfileDescription(customer),
        goals,
        id: `real-customer-${customer.planId}`,
        medications: [],
        name: customer.firstName
          ? `${customer.firstName} · ${customer.archetypeLabel}`
          : `Customer ${index + 1} · ${customer.archetypeLabel}`,
        needCount: realCustomerNeedCount({ goals, preferredSupplementNames }),
        preferredSupplementNames,
        source: "customer_profile"
      };
    });
}

export function simulationCustomerArchetypesFromInsights(
  data: AdminCustomerInsightsData
) {
  const groups = data.customers.reduce<Map<string, CustomerInsightProfile[]>>(
    (map, customer) => {
      const group = map.get(customer.archetypeId) ?? [];

      group.push(customer);
      map.set(customer.archetypeId, group);

      return map;
    },
    new Map()
  );

  return [...groups.entries()]
    .map(([id, group]): SyntheticPlanArchetype => {
      const first = group[0];
      const goals = uniqueList(group.flatMap((customer) => customer.goals), 8);
      const preferredSupplementNames = uniqueList(
        group.flatMap((customer) => customer.supplementInterests),
        10
      );
      const femaleCount = group.filter(
        (customer) => customer.demographics.sex === "female"
      ).length;
      const maleCount = group.filter(
        (customer) => customer.demographics.sex === "male"
      ).length;
      const ages = group
        .map((customer) => ageFromBand(customer.demographics.ageBand))
        .filter((age): age is number => age !== null);
      const averageAge =
        ages.length > 0
          ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length)
          : null;

      return {
        age: averageAge,
        clientSex:
          femaleCount > maleCount ? "female" : maleCount > femaleCount ? "male" : null,
        customerCount: group.length,
        description: [
          `${group.length} real customer${group.length === 1 ? "" : "s"}`,
          first?.entitlementLabel,
          ...goals.slice(0, 3),
          ...preferredSupplementNames.slice(0, 3)
        ]
          .filter(Boolean)
          .join(" · "),
        goals,
        id: `real-archetype-${id.replace(/[^a-z0-9]+/gi, "-")}`,
        medications: [],
        name: first?.archetypeLabel ?? "Real customer archetype",
        needCount: realCustomerNeedCount({ goals, preferredSupplementNames }),
        preferredSupplementNames,
        source: "customer_archetype"
      };
    })
    .sort(
      (first, second) =>
        (second.customerCount ?? 0) - (first.customerCount ?? 0) ||
        first.name.localeCompare(second.name)
    )
    .slice(0, 48);
}

export function buildReviewPriorityProductRows(input: Readonly<{
  candidates: readonly ProductCandidate[];
  eligibleCandidates: readonly ProductCandidate[];
  supplements: readonly AdminPlanCoverageSimulationSupplement[];
}>): AdminSimulationReviewProductRow[] {
  const eligibleCountBySupplement = new Map<string, number>();

  for (const supplement of input.supplements) {
    eligibleCountBySupplement.set(
      supplement.id,
      input.eligibleCandidates.filter((product) =>
        productCoversSupplementForMatching(product, supplement.id)
      ).length
    );
  }

  return input.candidates
    .flatMap((product): AdminSimulationReviewProductRow[] => {
      const blockedReason = exclusionReason(product);

      if (!blockedReason) {
        return [];
      }

      const coveredSupplements = input.supplements.filter((supplement) =>
        productCoversSupplementForMatching(product, supplement.id)
      );

      if (coveredSupplements.length < 1) {
        return [];
      }

      const gapSupplementCount = coveredSupplements.filter((supplement) =>
        (eligibleCountBySupplement.get(supplement.id) ?? 0) < 1
      ).length;
      const scarceSupplementCount = coveredSupplements.filter((supplement) =>
        (eligibleCountBySupplement.get(supplement.id) ?? 0) === 1
      ).length;
      const reviewScore =
        gapSupplementCount * 5 +
        scarceSupplementCount * 2 +
        coveredSupplements.length;

      return [{
        blockedReason,
        brandName: product.brandName ?? null,
        brandStatus: product.brandStatus ?? null,
        coveredSupplementNames: coveredSupplements
          .map((supplement) => supplement.name)
          .sort((first, second) => first.localeCompare(second))
          .slice(0, 6),
        currency: product.currency,
        expectedPriceAmount: productPrice(product),
        gapSupplementCount,
        id: product.id,
        matchableSupplementCount: coveredSupplements.length,
        productStatus: product.status,
        rank: 0,
        reviewScore,
        title: product.title
      }];
    })
    .sort((first, second) =>
      second.reviewScore - first.reviewScore ||
      second.gapSupplementCount - first.gapSupplementCount ||
      second.matchableSupplementCount - first.matchableSupplementCount ||
      (first.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) -
        (second.expectedPriceAmount ?? Number.MAX_SAFE_INTEGER) ||
      first.title.localeCompare(second.title)
    )
    .slice(0, reviewPriorityProductLimit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
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
        loadActiveSupplements(sql, countryCode),
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

export async function getAdminPlanCoverageSimulationData(input: Readonly<{
  countryCode?: string | null;
  range?: AdminDashboardRange | null;
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

    const [
      supplementRows,
      supplementGovernanceHash,
      allCandidates,
      customerInsights
    ] = await Promise.all([
      loadActiveSupplements(sql, countryCode),
      loadSupplementGovernanceHash(sql, countryCode),
      getProductRecommendationCandidates({
        countryCode,
        includeIneligible: true
      }),
      getAdminCustomerInsightsData(input.range ?? "month", {
        enrichSegments: false
      })
    ]);
    const candidates = allCandidates.filter(productPassesSimulationCandidateGate);
    const supplements = supplementInputs(supplementRows, candidates);
    const realCustomerProfiles =
      simulationCustomerProfilesFromInsights(customerInsights);
    const realCustomerArchetypes =
      simulationCustomerArchetypesFromInsights(customerInsights);
    const reviewPriorityProducts = buildReviewPriorityProductRows({
      candidates: allCandidates,
      eligibleCandidates: candidates,
      supplements
    });

    return emptyAdminPlanCoverageSimulationData({
      candidates,
      countryCode,
      databaseAvailable: true,
      realCustomerArchetypes,
      realCustomerProfileCount: customerInsights.summary.totalCustomers,
      realCustomerProfiles,
      reviewPriorityProducts,
      seed: input.seed,
      supplementGovernanceHash,
      supplements
    });
  } catch (error) {
    console.error("Failed to load plan coverage simulation inputs", error);
    return emptyAdminPlanCoverageSimulationData({ ...input, countryCode });
  }
}
