import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { getSql } from "@/lib/db";
import type { ProductRecommendationRefreshReason } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";
import {
  loadMasterSupplementAvailabilityInsights,
  type MasterSupplementAvailabilityInsight
} from "@/lib/admin-recommendation-insights";
import {
  productRecommendationRefreshReason
} from "@/lib/product-recommendation-freshness";

export const LOW_COVERAGE_THRESHOLD_PERCENT = 75;

export type CoverageFreshnessState = "fresh" | "missing" | "stale";

export type MasterListOpportunityType =
  | "approved_not_sellable"
  | "country_restriction"
  | "inactive_retail_listing"
  | "near_miss"
  | "rejected_candidate"
  | "stock_or_backorder"
  | "validation_issue";

export type CoverageDistributionBucket = Readonly<{
  count: number;
  id: string;
  label: string;
  max: number;
  min: number;
}>;

export type CoverageImprovementProductRef = Readonly<{
  productId: string | null;
  retailerName: string | null;
  title: string;
}>;

export type CoverageImprovementPlan = Readonly<{
  contactEmail: string | null;
  countryCode: string;
  coveragePercent: number;
  firstName: string | null;
  freshnessState: CoverageFreshnessState;
  generatedAt: string | null;
  lastActivityAt: string;
  locale: Locale | string;
  orderNumber: string | null;
  orderStatus: string | null;
  planId: string;
  refreshReason: ProductRecommendationRefreshReason | null;
  selectedPlan: string | null;
  selectedProducts: CoverageImprovementProductRef[];
  stackCoveragePercent: number;
  supplementProductCoveragePercent: number;
  totalCoveragePercent: number;
  unmatchedSupplements: string[];
}>;

export type LeastMatchedSupplementInsight = Readonly<{
  affectedPlanCount: number;
  blockerMix: Array<{
    count: number;
    reason: string;
  }>;
  country: string;
  demandPlanCount: number;
  gapScore: number;
  id: string;
  lastSeenAt: string | null;
  lowCoveragePlanCount: number;
  matchRatePercent: number;
  matchedPlanCount: number;
  name: string;
  nearMissProductTitles: string[];
  unmatchedPlanCount: number;
}>;

export type MasterListOpportunity = Readonly<{
  action: string;
  affectedPlanCount: number;
  averageCoveragePercent: number | null;
  blockerReason: string | null;
  opportunityType: MasterListOpportunityType;
  productId: string;
  productTitle: string;
  recommendationCount: number;
  retailerCount: number;
  supplementSignals: string[];
}>;

export type AdminCoverageImprovementInsightsData = Readonly<{
  coverageDistribution: CoverageDistributionBucket[];
  databaseAvailable: boolean;
  filters: {
    countries: string[];
    freshnessStates: CoverageFreshnessState[];
    locales: string[];
    planTypes: string[];
    retailers: string[];
    supplements: string[];
  };
  generatedAt: string;
  leastMatchedSupplements: LeastMatchedSupplementInsight[];
  lowCoveragePlans: CoverageImprovementPlan[];
  masterListOpportunities: MasterListOpportunity[];
  plans: CoverageImprovementPlan[];
  range: AdminDashboardRange;
  summary: {
    affectedCustomers: number;
    averageCoveragePercent: number;
    belowThresholdPlans: number;
    leastMatchedSupplements: number;
    masterListOpportunities: number;
    medianCoveragePercent: number;
    missingRecommendationRuns: number;
    staleRecommendationRuns: number;
    supplementAvailabilityGaps: number;
    totalPlans: number;
  };
  supplementAvailability: MasterSupplementAvailabilityInsight[];
  thresholdPercent: number;
}>;

type SchemaAvailability = Readonly<{
  assessments: boolean;
  formulations: boolean;
  organisations: boolean;
  productCountries: boolean;
  productDecisions: boolean;
  productFacts: boolean;
  productItems: boolean;
  productRuns: boolean;
  products: boolean;
  retailCheckoutPayments: boolean;
  retailCustomerOrders: boolean;
  retailOrderAllocations: boolean;
  retailProductStock: boolean;
  retailSellableProducts: boolean;
  supplementSelections: boolean;
  supplements: boolean;
}>;

type PlanCoverageRow = Readonly<{
  captured_at: Date | string | null;
  contact_email: string | null;
  country_code: string | null;
  diagnostics: unknown;
  first_name: string | null;
  formulation_generated_at: Date | string | null;
  generated_at: Date | string | null;
  last_activity_at: Date | string | null;
  locale: string;
  plan_id: string;
  product_count: number | string | null;
  run_id: string | null;
  selected_plan: string | null;
  selected_products: unknown;
  stack_coverage_percent: number | string | null;
  supplement_product_coverage_percent: number | string | null;
  total_coverage_percent: number | string | null;
}>;

type SupplementDemandRow = Readonly<{
  demand_count: number | string;
  id: string;
  label: string | null;
  last_seen_at: Date | string | null;
  plan_ids: string[] | null;
}>;

type OrderInsight = Readonly<{
  orderNumber: string | null;
  orderStatus: string | null;
  updatedAt: string | null;
}>;

type FreshnessClock = Readonly<{
  productCatalogueUpdatedAt: string | null;
  retailCatalogueUpdatedAt: string | null;
  stockOrAllocationUpdatedAt: string | null;
}>;

type NeedSignal = Readonly<{
  bestRejectedReason: string | null;
  displayName: string;
  id: string;
}>;

const emptySummary = {
  affectedCustomers: 0,
  averageCoveragePercent: 0,
  belowThresholdPlans: 0,
  leastMatchedSupplements: 0,
  masterListOpportunities: 0,
  medianCoveragePercent: 0,
  missingRecommendationRuns: 0,
  staleRecommendationRuns: 0,
  supplementAvailabilityGaps: 0,
  totalPlans: 0
};

export function emptyAdminCoverageImprovementInsightsData(
  range: AdminDashboardRange,
  databaseAvailable = false
): AdminCoverageImprovementInsightsData {
  return {
    coverageDistribution: coverageDistribution([]),
    databaseAvailable,
    filters: {
      countries: [],
      freshnessStates: [],
      locales: [],
      planTypes: [],
      retailers: [],
      supplements: []
    },
    generatedAt: new Date().toISOString(),
    leastMatchedSupplements: [],
    lowCoveragePlans: [],
    masterListOpportunities: [],
    plans: [],
    range,
    summary: emptySummary,
    supplementAvailability: [],
    thresholdPercent: LOW_COVERAGE_THRESHOLD_PERCENT
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function maxIso(...values: Array<string | null | undefined>) {
  const dates = values
    .flatMap((value) => {
      const ms = value ? new Date(value).getTime() : NaN;

      return Number.isFinite(ms) ? [{ ms, value: new Date(ms).toISOString() }] : [];
    })
    .sort((first, second) => second.ms - first.ms);

  return dates[0]?.value ?? null;
}

function normalizedKey(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .trim();
}

function uniqueStrings(values: readonly string[], limit = 20) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = value.trim();
    const key = normalizedKey(text);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(text);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function boundedPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function averageCoveragePercent(values: readonly number[]) {
  if (values.length < 1) {
    return 0;
  }

  return boundedPercent(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
}

export function medianCoveragePercent(values: readonly number[]) {
  if (values.length < 1) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return boundedPercent(sorted[middle] ?? 0);
  }

  return boundedPercent(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

export function coverageDistribution(
  plans: readonly Pick<CoverageImprovementPlan, "coveragePercent">[]
): CoverageDistributionBucket[] {
  const buckets = [
    { id: "0-24", label: "0-24%", min: 0, max: 24 },
    { id: "25-49", label: "25-49%", min: 25, max: 49 },
    { id: "50-74", label: "50-74%", min: 50, max: 74 },
    { id: "75-89", label: "75-89%", min: 75, max: 89 },
    { id: "90-100", label: "90-100%", min: 90, max: 100 }
  ];

  return buckets.map((bucket) => ({
    ...bucket,
    count: plans.filter(
      (plan) =>
        plan.coveragePercent >= bucket.min && plan.coveragePercent <= bucket.max
    ).length
  }));
}

function extractNeedSignals(value: unknown, key: "matchedNeeds" | "unmatchedNeeds") {
  return asArray(asRecord(value)[key]).flatMap((item): NeedSignal[] => {
    const record = asRecord(item);
    const displayName =
      cleanText(record.displayName) ??
      cleanText(record.name) ??
      cleanText(record.label) ??
      cleanText(record.id);

    if (!displayName) {
      return [];
    }

    return [
      {
        bestRejectedReason:
          cleanText(record.bestRejectedReason) ??
          cleanText(record.reason) ??
          cleanText(record.status),
        displayName,
        id: cleanText(record.id) ?? normalizedKey(displayName)
      }
    ];
  });
}

function selectedProductsFromPayload(value: unknown): CoverageImprovementProductRef[] {
  return asArray(value).flatMap((item): CoverageImprovementProductRef[] => {
    const record = asRecord(item);
    const title = cleanText(record.title);

    return title
      ? [
          {
            productId: cleanText(record.productId),
            retailerName: cleanText(record.retailerName),
            title
          }
        ]
      : [];
  });
}

async function coverageInsightsSchemaAvailable(
  sql: NonNullable<ReturnType<typeof getSql>>
): Promise<SchemaAvailability> {
  const rows = await sql<Array<{
    assessments: boolean;
    formulations: boolean;
    organisations: boolean;
    product_countries: boolean;
    product_decisions: boolean;
    product_facts: boolean;
    product_items: boolean;
    product_runs: boolean;
    products: boolean;
    retail_checkout_payments: boolean;
    retail_customer_orders: boolean;
    retail_order_allocations: boolean;
    retail_product_stock: boolean;
    retail_sellable_products: boolean;
    supplement_selections: boolean;
    supplements: boolean;
  }>>`
    select
      to_regclass('public.assessments') is not null as assessments,
      to_regclass('public.formulations') is not null as formulations,
      to_regclass('public.organisations') is not null as organisations,
      to_regclass('public.product_countries') is not null as product_countries,
      to_regclass('public.product_recommendation_decisions') is not null as product_decisions,
      to_regclass('public.product_facts') is not null as product_facts,
      to_regclass('public.product_recommendation_items') is not null as product_items,
      to_regclass('public.product_recommendation_runs') is not null as product_runs,
      to_regclass('public.products') is not null as products,
      to_regclass('public.retail_checkout_payments') is not null as retail_checkout_payments,
      to_regclass('public.retail_customer_orders') is not null as retail_customer_orders,
      to_regclass('public.retail_order_allocations') is not null as retail_order_allocations,
      to_regclass('public.retail_product_stock') is not null as retail_product_stock,
      to_regclass('public.retail_sellable_products') is not null as retail_sellable_products,
      to_regclass('public.supplement_recommendation_selections') is not null as supplement_selections,
      to_regclass('public.supplements') is not null as supplements
  `;
  const row = rows[0];

  return {
    assessments: row?.assessments === true,
    formulations: row?.formulations === true,
    organisations: row?.organisations === true,
    productCountries: row?.product_countries === true,
    productDecisions: row?.product_decisions === true,
    productFacts: row?.product_facts === true,
    productItems: row?.product_items === true,
    productRuns: row?.product_runs === true,
    products: row?.products === true,
    retailCheckoutPayments: row?.retail_checkout_payments === true,
    retailCustomerOrders: row?.retail_customer_orders === true,
    retailOrderAllocations: row?.retail_order_allocations === true,
    retailProductStock: row?.retail_product_stock === true,
    retailSellableProducts: row?.retail_sellable_products === true,
    supplementSelections: row?.supplement_selections === true,
    supplements: row?.supplements === true
  };
}

async function loadFreshnessClock(
  sql: NonNullable<ReturnType<typeof getSql>>,
  availability: SchemaAvailability
): Promise<FreshnessClock> {
  const [productRows, countryRows, sellableRows, stockRows, allocationRows] =
    await Promise.all([
      availability.products
        ? sql<Array<{ updated_at: Date | string | null }>>`
            select max(updated_at) as updated_at
            from public.products
          `
        : Promise.resolve([]),
      availability.productCountries
        ? sql<Array<{ updated_at: Date | string | null }>>`
            select max(updated_at) as updated_at
            from public.product_countries
          `
        : Promise.resolve([]),
      availability.retailSellableProducts && availability.organisations
        ? sql<Array<{ updated_at: Date | string | null }>>`
            select max(greatest(
              retail_sellable_products.updated_at,
              organisations.updated_at
            )) as updated_at
            from public.retail_sellable_products
            join public.organisations
              on organisations.id = retail_sellable_products.organisation_id
            where retail_sellable_products.status <> 'deleted'
              and organisations.organisation_type = 'tenant'
              and organisations.status = 'active'
          `
        : Promise.resolve([]),
      availability.retailProductStock
        ? sql<Array<{ updated_at: Date | string | null }>>`
            select max(updated_at) as updated_at
            from public.retail_product_stock
            where status <> 'deleted'
          `
        : Promise.resolve([]),
      availability.retailOrderAllocations
        ? sql<Array<{ updated_at: Date | string | null }>>`
            select max(updated_at) as updated_at
            from public.retail_order_allocations
            where status in ('active', 'picked')
          `
        : Promise.resolve([])
    ]);

  return {
    productCatalogueUpdatedAt: maxIso(
      isoOrNull(productRows[0]?.updated_at),
      isoOrNull(countryRows[0]?.updated_at)
    ),
    retailCatalogueUpdatedAt: isoOrNull(sellableRows[0]?.updated_at),
    stockOrAllocationUpdatedAt: maxIso(
      isoOrNull(stockRows[0]?.updated_at),
      isoOrNull(allocationRows[0]?.updated_at)
    )
  };
}

async function loadPlanCoverageRows(
  sql: NonNullable<ReturnType<typeof getSql>>,
  range: AdminDashboardRange
) {
  const start = adminDashboardRangeStart(range);

  return sql<PlanCoverageRow[]>`
    with latest_runs as (
      select distinct on (product_recommendation_runs.plan_id)
        product_recommendation_runs.id,
        product_recommendation_runs.plan_id,
        product_recommendation_runs.stack_coverage_percent,
        product_recommendation_runs.supplement_product_coverage_percent,
        product_recommendation_runs.total_coverage_percent,
        product_recommendation_runs.market_region,
        product_recommendation_runs.diagnostics,
        product_recommendation_runs.generated_at
      from public.product_recommendation_runs
      where product_recommendation_runs.plan_id is not null
        and product_recommendation_runs.status in ('completed', 'partial')
      order by
        product_recommendation_runs.plan_id,
        case coalesce(product_recommendation_runs.diagnostics ->> 'stackPreference', 'balanced')
          when 'balanced' then 0
          when 'compact' then 1
          else 2
        end,
        product_recommendation_runs.generated_at desc,
        product_recommendation_runs.created_at desc
    )
    select
      assessments.plan_id::text,
      assessments.first_name,
      assessments.contact_email,
      assessments.locale,
      assessments.selected_plan::text,
      assessments.captured_at,
      greatest(
        assessments.updated_at,
        coalesce(latest_runs.generated_at, assessments.updated_at),
        coalesce(formulation_state.formulation_generated_at, assessments.updated_at)
      ) as last_activity_at,
      latest_runs.id::text as run_id,
      latest_runs.generated_at,
      coalesce(latest_runs.market_region, assessments.answers ->> 'country', 'TH') as country_code,
      latest_runs.stack_coverage_percent,
      latest_runs.supplement_product_coverage_percent,
      latest_runs.total_coverage_percent,
      coalesce(latest_runs.diagnostics, '{}'::jsonb) as diagnostics,
      formulation_state.formulation_generated_at,
      coalesce(selected_products.product_count, 0) as product_count,
      coalesce(selected_products.products, '[]'::jsonb) as selected_products
    from public.assessments
    left join latest_runs
      on latest_runs.plan_id = assessments.plan_id
    left join lateral (
      select max(generated_at) as formulation_generated_at
      from public.formulations
      where formulations.plan_id = assessments.plan_id
    ) formulation_state on true
    left join lateral (
      select
        count(product_recommendation_items.id)::int as product_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'productId', product_recommendation_items.product_id::text,
              'retailerName', organisations.name,
              'title', products.title
            )
            order by product_recommendation_items.rank
          ) filter (where product_recommendation_items.id is not null),
          '[]'::jsonb
        ) as products
      from public.product_recommendation_items
      join public.products
        on products.id = product_recommendation_items.product_id
      left join public.organisations
        on organisations.id = product_recommendation_items.selected_retailer_organisation_id
      where latest_runs.id is not null
        and product_recommendation_items.run_id = latest_runs.id
    ) selected_products on true
    where assessments.selected_plan is not null
      and (${start}::timestamptz is null or assessments.captured_at >= ${start})
    order by
      coalesce(latest_runs.total_coverage_percent, latest_runs.supplement_product_coverage_percent, 0) asc,
      assessments.captured_at desc
    limit 1000
  `;
}

async function loadSupplementDemandRows(
  sql: NonNullable<ReturnType<typeof getSql>>,
  range: AdminDashboardRange,
  availability: SchemaAvailability
) {
  if (!availability.supplementSelections) {
    return [];
  }

  const start = adminDashboardRangeStart(range);

  return sql<SupplementDemandRow[]>`
    select
      coalesce(
        supplement_recommendation_selections.supplement_id::text,
        'unmatched:' || lower(regexp_replace(supplement_recommendation_selections.supplement_name_text, '[^[:alnum:]]+', '-', 'g'))
      ) as id,
      max(supplement_recommendation_selections.supplement_name_text) as label,
      count(distinct supplement_recommendation_selections.plan_id)::int as demand_count,
      max(supplement_recommendation_selections.generated_at) as last_seen_at,
      array_agg(distinct supplement_recommendation_selections.plan_id::text) as plan_ids
    from public.supplement_recommendation_selections
    join public.assessments
      on assessments.plan_id = supplement_recommendation_selections.plan_id
    where supplement_recommendation_selections.is_current = true
      and coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
    group by id
    order by demand_count desc, label asc
    limit 300
  `;
}

async function loadOrderInsights(
  sql: NonNullable<ReturnType<typeof getSql>>,
  availability: SchemaAvailability,
  planIds: readonly string[]
) {
  if (
    !availability.retailCheckoutPayments ||
    !availability.retailCustomerOrders ||
    planIds.length < 1
  ) {
    return new Map<string, OrderInsight>();
  }

  const rows = await sql<Array<{
    order_number: string | null;
    order_status: string | null;
    plan_id: string;
    updated_at: Date | string | null;
  }>>`
    select distinct on (retail_checkout_payments.plan_id)
      retail_checkout_payments.plan_id::text,
      retail_customer_orders.order_number,
      coalesce(retail_customer_orders.status, retail_checkout_payments.status) as order_status,
      coalesce(retail_customer_orders.updated_at, retail_checkout_payments.updated_at) as updated_at
    from public.retail_checkout_payments
    left join public.retail_customer_orders
      on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
    where retail_checkout_payments.plan_id = any(${[...planIds]}::uuid[])
    order by retail_checkout_payments.plan_id, retail_checkout_payments.created_at desc
  `;

  return new Map(
    rows.map((row) => [
      row.plan_id,
      {
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        updatedAt: isoOrNull(row.updated_at)
      }
    ])
  );
}

function buildPlanProfiles(
  rows: readonly PlanCoverageRow[],
  orders: ReadonlyMap<string, OrderInsight>,
  freshnessClock: FreshnessClock
) {
  return rows.map((row): CoverageImprovementPlan => {
    const generatedAt = isoOrNull(row.generated_at);
    const formulationGeneratedAt = isoOrNull(row.formulation_generated_at);
    const refreshReason = productRecommendationRefreshReason({
      formulationGeneratedAt,
      generatedAt,
      productCatalogueUpdatedAt: freshnessClock.productCatalogueUpdatedAt,
      retailCatalogueUpdatedAt: freshnessClock.retailCatalogueUpdatedAt,
      stockOrAllocationUpdatedAt: freshnessClock.stockOrAllocationUpdatedAt
    });
    const selectedProducts = selectedProductsFromPayload(row.selected_products);
    const diagnostics = row.diagnostics;
    const unmatchedSupplements = uniqueStrings(
      extractNeedSignals(diagnostics, "unmatchedNeeds").map(
        (need) => need.displayName
      ),
      12
    );
    const order = orders.get(row.plan_id);
    const supplementCoverage = numberValue(row.supplement_product_coverage_percent);
    const stackCoverage = numberValue(row.stack_coverage_percent);
    const totalCoverage = numberValue(row.total_coverage_percent);
    const coverage = totalCoverage || supplementCoverage || stackCoverage;

    return {
      contactEmail: row.contact_email,
      countryCode: cleanText(row.country_code)?.toUpperCase() ?? "TH",
      coveragePercent: boundedPercent(coverage),
      firstName: row.first_name,
      freshnessState: generatedAt ? refreshReason ? "stale" : "fresh" : "missing",
      generatedAt,
      lastActivityAt:
        isoOrNull(row.last_activity_at) ??
        isoOrNull(row.captured_at) ??
        new Date().toISOString(),
      locale: row.locale,
      orderNumber: order?.orderNumber ?? null,
      orderStatus: order?.orderStatus ?? null,
      planId: row.plan_id,
      refreshReason,
      selectedPlan: row.selected_plan,
      selectedProducts,
      stackCoveragePercent: boundedPercent(stackCoverage),
      supplementProductCoveragePercent: boundedPercent(supplementCoverage),
      totalCoveragePercent: boundedPercent(totalCoverage),
      unmatchedSupplements
    };
  });
}

type SupplementAccumulator = {
  affectedPlans: Set<string>;
  blockerCounts: Map<string, number>;
  countryCounts: Map<string, number>;
  demandPlans: Set<string>;
  lastSeenAt: string | null;
  lowCoveragePlans: Set<string>;
  matchedPlans: Set<string>;
  name: string;
  nearMissProductTitles: Set<string>;
  unmatchedPlans: Set<string>;
};

function supplementAccumulator(name: string): SupplementAccumulator {
  return {
    affectedPlans: new Set(),
    blockerCounts: new Map(),
    countryCounts: new Map(),
    demandPlans: new Set(),
    lastSeenAt: null,
    lowCoveragePlans: new Set(),
    matchedPlans: new Set(),
    name,
    nearMissProductTitles: new Set(),
    unmatchedPlans: new Set()
  };
}

function addCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function mostFrequent(map: ReadonlyMap<string, number>, fallback: string) {
  return [...map.entries()].sort(
    (first, second) => second[1] - first[1] || first[0].localeCompare(second[0])
  )[0]?.[0] ?? fallback;
}

function blockerMix(map: ReadonlyMap<string, number>) {
  return [...map.entries()]
    .map(([reason, count]) => ({ count, reason }))
    .sort(
      (first, second) =>
        second.count - first.count || first.reason.localeCompare(second.reason)
    )
    .slice(0, 5);
}

export function buildLeastMatchedSupplements(
  plans: readonly CoverageImprovementPlan[],
  planDiagnostics: ReadonlyMap<string, unknown>,
  demandRows: readonly SupplementDemandRow[],
  opportunities: readonly Pick<MasterListOpportunity, "productTitle" | "supplementSignals">[]
): LeastMatchedSupplementInsight[] {
  const byKey = new Map<string, SupplementAccumulator>();
  const opportunityTitlesByNeed = new Map<string, Set<string>>();

  for (const opportunity of opportunities) {
    for (const signal of opportunity.supplementSignals) {
      const key = normalizedKey(signal);
      const titles = opportunityTitlesByNeed.get(key) ?? new Set<string>();

      titles.add(opportunity.productTitle);
      opportunityTitlesByNeed.set(key, titles);
    }
  }

  for (const row of demandRows) {
    const name = cleanText(row.label) ?? row.id;
    const key = normalizedKey(name) || normalizedKey(row.id);
    const acc = byKey.get(key) ?? supplementAccumulator(name);

    for (const planId of row.plan_ids ?? []) {
      acc.demandPlans.add(planId);
    }

    acc.lastSeenAt = maxIso(acc.lastSeenAt, isoOrNull(row.last_seen_at));
    byKey.set(key, acc);
  }

  for (const plan of plans) {
    const diagnostics = planDiagnostics.get(plan.planId);
    const matched = extractNeedSignals(diagnostics, "matchedNeeds");
    const unmatched = extractNeedSignals(diagnostics, "unmatchedNeeds");

    for (const need of matched) {
      const key = normalizedKey(need.displayName) || normalizedKey(need.id);
      const acc = byKey.get(key) ?? supplementAccumulator(need.displayName);

      acc.demandPlans.add(plan.planId);
      acc.matchedPlans.add(plan.planId);
      addCount(acc.countryCounts, plan.countryCode);
      byKey.set(key, acc);
    }

    for (const need of unmatched) {
      const key = normalizedKey(need.displayName) || normalizedKey(need.id);
      const acc = byKey.get(key) ?? supplementAccumulator(need.displayName);

      acc.affectedPlans.add(plan.planId);
      acc.demandPlans.add(plan.planId);
      acc.unmatchedPlans.add(plan.planId);
      addCount(acc.countryCounts, plan.countryCode);
      addCount(
        acc.blockerCounts,
        need.bestRejectedReason ?? "No suitable retail product"
      );

      if (plan.coveragePercent < LOW_COVERAGE_THRESHOLD_PERCENT) {
        acc.lowCoveragePlans.add(plan.planId);
      }

      const titles = opportunityTitlesByNeed.get(key);

      if (titles) {
        titles.forEach((title) => acc.nearMissProductTitles.add(title));
      }

      byKey.set(key, acc);
    }
  }

  return [...byKey.entries()]
    .map(([id, acc]) => {
      const demandPlanCount = acc.demandPlans.size;
      const matchedPlanCount = acc.matchedPlans.size;
      const unmatchedPlanCount = acc.unmatchedPlans.size;
      const affectedPlanCount = Math.max(unmatchedPlanCount, acc.affectedPlans.size);
      const denominator = Math.max(1, demandPlanCount || matchedPlanCount + unmatchedPlanCount);
      const matchRatePercent = boundedPercent((matchedPlanCount / denominator) * 100);
      const gapScore = Math.round(
        affectedPlanCount * (100 - matchRatePercent) + acc.lowCoveragePlans.size * 10
      );

      return {
        affectedPlanCount,
        blockerMix: blockerMix(acc.blockerCounts),
        country: mostFrequent(acc.countryCounts, "TH"),
        demandPlanCount: Math.max(demandPlanCount, matchedPlanCount + unmatchedPlanCount),
        gapScore,
        id,
        lastSeenAt: acc.lastSeenAt,
        lowCoveragePlanCount: acc.lowCoveragePlans.size,
        matchRatePercent,
        matchedPlanCount,
        name: acc.name,
        nearMissProductTitles: [...acc.nearMissProductTitles].slice(0, 6),
        unmatchedPlanCount
      };
    })
    .filter((row) => row.demandPlanCount > 0 && row.matchRatePercent < 100)
    .sort(
      (first, second) =>
        second.gapScore - first.gapScore ||
        first.matchRatePercent - second.matchRatePercent ||
        second.demandPlanCount - first.demandPlanCount ||
        first.name.localeCompare(second.name)
    )
    .slice(0, 50);
}

function opportunityAction(type: MasterListOpportunityType) {
  if (type === "approved_not_sellable") {
    return "Add an active retail sellable row for the best Thai retailer.";
  }

  if (type === "inactive_retail_listing") {
    return "Reactivate or replace the retailer listing.";
  }

  if (type === "stock_or_backorder") {
    return "Check stock, allocation, and backorder policy.";
  }

  if (type === "country_restriction") {
    return "Confirm Thailand availability and regulatory evidence.";
  }

  if (type === "validation_issue") {
    return "Review master product validation before retail use.";
  }

  if (type === "near_miss") {
    return "Review dose/coverage fit and consider adding as an alternative.";
  }

  return "Review rejection reasons and source a better product.";
}

export function classifyMasterListOpportunity(input: Readonly<{
  allowsBackorder: boolean;
  hasActiveSellable: boolean;
  hasAvailableStock: boolean;
  hasCountryRow: boolean;
  hasSellable: boolean;
  nearMissCount: number;
  productStatus: string | null;
  validationStatus: string | null;
}>): MasterListOpportunityType {
  if (input.productStatus !== "approved" || input.validationStatus !== "pass") {
    return "validation_issue";
  }

  if (!input.hasCountryRow) {
    return "country_restriction";
  }

  if (!input.hasSellable) {
    return "approved_not_sellable";
  }

  if (!input.hasActiveSellable) {
    return "inactive_retail_listing";
  }

  if (!input.hasAvailableStock && !input.allowsBackorder) {
    return "stock_or_backorder";
  }

  return input.nearMissCount > 0 ? "near_miss" : "rejected_candidate";
}

async function loadMasterListOpportunities(
  sql: NonNullable<ReturnType<typeof getSql>>,
  range: AdminDashboardRange,
  availability: SchemaAvailability
): Promise<MasterListOpportunity[]> {
  if (
    !availability.productDecisions ||
    !availability.products ||
    !availability.productCountries ||
    !availability.retailOrderAllocations ||
    !availability.retailSellableProducts ||
    !availability.retailProductStock
  ) {
    return [];
  }

  const start = adminDashboardRangeStart(range);
  const rows = await sql<Array<{
    affected_plan_count: number | string;
    allows_backorder: boolean | null;
    average_coverage_percent: number | string | null;
    blocker_reason: string | null;
    country_row_count: number | string | null;
    has_active_sellable: boolean | null;
    has_available_stock: boolean | null;
    has_sellable: boolean | null;
    near_miss_count: number | string;
    product_id: string;
    product_status: string | null;
    product_title: string;
    recommendation_count: number | string;
    rejected_count: number | string;
    retailer_count: number | string;
    supplement_signals: string[] | null;
    validation_status: string | null;
  }>>`
    select
      product_recommendation_decisions.product_id::text,
      max(coalesce(products.title, product_recommendation_decisions.product_title)) as product_title,
      max(products.status) as product_status,
      max(products.validation_status) as validation_status,
      count(distinct product_recommendation_decisions.plan_id)::int as affected_plan_count,
      count(*)::int as recommendation_count,
      count(*) filter (where product_recommendation_decisions.outcome = 'near_miss')::int as near_miss_count,
      count(*) filter (where product_recommendation_decisions.outcome = 'rejected')::int as rejected_count,
      avg(product_recommendation_decisions.product_coverage_percent) as average_coverage_percent,
      mode() within group (order by product_recommendation_decisions.reason) as blocker_reason,
      count(distinct retail_sellable_products.organisation_id)::int as retailer_count,
      bool_or(retail_sellable_products.id is not null) as has_sellable,
      bool_or(retail_sellable_products.status = 'active') as has_active_sellable,
      bool_or(
        retail_sellable_products.status = 'active'
        and coalesce(retail_product_stock.stock_quantity, 0) > coalesce(allocation_state.allocated_quantity, 0)
      ) as has_available_stock,
      bool_or(retail_sellable_products.status = 'active' and retail_sellable_products.backorder_policy = 'allow') as allows_backorder,
      count(distinct product_countries.country_code)::int as country_row_count,
      array_remove(array_agg(distinct covered_need.value ->> 'displayName'), null) as supplement_signals
    from public.product_recommendation_decisions
    join public.products
      on products.id = product_recommendation_decisions.product_id
    left join public.product_countries
      on product_countries.product_id = products.id
      and product_countries.country_code = 'TH'
    left join public.retail_sellable_products
      on retail_sellable_products.product_id = products.id
      and retail_sellable_products.status <> 'deleted'
    left join public.retail_product_stock
      on retail_product_stock.product_id = products.id
      and retail_product_stock.organisation_id = retail_sellable_products.organisation_id
      and retail_product_stock.status <> 'deleted'
    left join lateral (
      select coalesce(sum(retail_order_allocations.quantity_allocated), 0)::int as allocated_quantity
      from public.retail_order_allocations
      where retail_order_allocations.product_id = products.id
        and retail_order_allocations.organisation_id = retail_sellable_products.organisation_id
        and retail_order_allocations.status in ('active', 'picked')
    ) allocation_state on true
    left join lateral jsonb_array_elements(product_recommendation_decisions.covered_needs) as covered_need(value)
      on true
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    where product_recommendation_decisions.is_current = true
      and product_recommendation_decisions.outcome in ('near_miss', 'rejected')
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
    group by product_recommendation_decisions.product_id
    order by affected_plan_count desc, recommendation_count desc
    limit 100
  `;

  return rows.map((row) => {
    const opportunityType = classifyMasterListOpportunity({
      allowsBackorder: row.allows_backorder === true,
      hasActiveSellable: row.has_active_sellable === true,
      hasAvailableStock: row.has_available_stock === true,
      hasCountryRow: numberValue(row.country_row_count) > 0,
      hasSellable: row.has_sellable === true,
      nearMissCount: numberValue(row.near_miss_count),
      productStatus: row.product_status,
      validationStatus: row.validation_status
    });

    return {
      action: opportunityAction(opportunityType),
      affectedPlanCount: numberValue(row.affected_plan_count),
      averageCoveragePercent: optionalNumber(row.average_coverage_percent),
      blockerReason: row.blocker_reason,
      opportunityType,
      productId: row.product_id,
      productTitle: row.product_title,
      recommendationCount: numberValue(row.recommendation_count),
      retailerCount: numberValue(row.retailer_count),
      supplementSignals: uniqueStrings(row.supplement_signals ?? [], 6)
    };
  });
}

function buildFilters(
  plans: readonly CoverageImprovementPlan[],
  supplements: readonly LeastMatchedSupplementInsight[]
) {
  return {
    countries: uniqueStrings(plans.map((plan) => plan.countryCode)).sort(),
    freshnessStates: [...new Set(plans.map((plan) => plan.freshnessState))].sort(),
    locales: uniqueStrings(plans.map((plan) => String(plan.locale))).sort(),
    planTypes: uniqueStrings(
      plans.flatMap((plan) => plan.selectedPlan ? [plan.selectedPlan] : [])
    ).sort(),
    retailers: uniqueStrings(
      plans.flatMap((plan) =>
        plan.selectedProducts.flatMap((product) =>
          product.retailerName ? [product.retailerName] : []
        )
      )
    ).sort(),
    supplements: supplements.map((supplement) => supplement.name).slice(0, 80)
  };
}

export async function getAdminCoverageImprovementInsightsData(
  range: AdminDashboardRange
): Promise<AdminCoverageImprovementInsightsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminCoverageImprovementInsightsData(range);
  }

  try {
    const availability = await coverageInsightsSchemaAvailable(sql);
    const databaseAvailable =
      availability.assessments &&
      availability.formulations &&
      availability.organisations &&
      availability.productItems &&
      availability.productRuns &&
      availability.products;

    if (!databaseAvailable) {
      return emptyAdminCoverageImprovementInsightsData(range, false);
    }

    const [freshnessClock, planRows, demandRows, opportunities, supplementAvailability] =
      await Promise.all([
        loadFreshnessClock(sql, availability),
        loadPlanCoverageRows(sql, range),
        loadSupplementDemandRows(sql, range, availability),
        loadMasterListOpportunities(sql, range, availability),
        availability.productFacts &&
          availability.productCountries &&
          availability.productRuns &&
          availability.products &&
          availability.retailOrderAllocations &&
          availability.retailProductStock &&
          availability.retailSellableProducts &&
          availability.supplementSelections &&
          availability.supplements
          ? loadMasterSupplementAvailabilityInsights(sql, adminDashboardRangeStart(range))
          : Promise.resolve([])
      ]);
    const orders = await loadOrderInsights(
      sql,
      availability,
      planRows.map((row) => row.plan_id)
    );
    const plans = buildPlanProfiles(planRows, orders, freshnessClock);
    const planDiagnostics = new Map(
      planRows.map((row) => [row.plan_id, row.diagnostics] as const)
    );
    const leastMatchedSupplements = buildLeastMatchedSupplements(
      plans,
      planDiagnostics,
      demandRows,
      opportunities
    );
    const lowCoveragePlans = plans
      .filter((plan) => plan.coveragePercent < LOW_COVERAGE_THRESHOLD_PERCENT)
      .sort(
        (first, second) =>
          first.coveragePercent - second.coveragePercent ||
          second.lastActivityAt.localeCompare(first.lastActivityAt)
      );
    const coverageValues = plans.map((plan) => plan.coveragePercent);

    return {
      coverageDistribution: coverageDistribution(plans),
      databaseAvailable,
      filters: buildFilters(plans, leastMatchedSupplements),
      generatedAt: new Date().toISOString(),
      leastMatchedSupplements,
      lowCoveragePlans,
      masterListOpportunities: opportunities,
      plans,
      range,
      summary: {
        affectedCustomers: new Set(lowCoveragePlans.map((plan) => plan.contactEmail ?? plan.planId)).size,
        averageCoveragePercent: averageCoveragePercent(coverageValues),
        belowThresholdPlans: lowCoveragePlans.length,
        leastMatchedSupplements: leastMatchedSupplements.length,
        masterListOpportunities: opportunities.length,
        medianCoveragePercent: medianCoveragePercent(coverageValues),
        missingRecommendationRuns: plans.filter(
          (plan) => plan.freshnessState === "missing"
        ).length,
        staleRecommendationRuns: plans.filter(
          (plan) => plan.freshnessState === "stale"
        ).length,
        supplementAvailabilityGaps: supplementAvailability.filter(
          (row) => row.availabilityState !== "covered"
        ).length,
        totalPlans: plans.length
      },
      supplementAvailability,
      thresholdPercent: LOW_COVERAGE_THRESHOLD_PERCENT
    };
  } catch (error) {
    console.error("Failed to load coverage improvement insights", error);

    return emptyAdminCoverageImprovementInsightsData(range);
  }
}
