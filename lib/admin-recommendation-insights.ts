import type postgres from "postgres";
import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { getSql } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import {
  searchMarketplaceProducts,
  type MarketplaceSearchDiagnostic,
  type ProductSnapshot
} from "@/lib/product-adapters";

type InsightsDb = postgres.Sql | postgres.TransactionSql;

export type InsightBucketRow = Readonly<{
  count: number;
  label: string;
  parentLabel?: string | null;
}>;

export type AdminSupplementSelectionStats = Readonly<{
  addCount: number;
  chosenPlanCount: number;
  coveredCount: number;
  lastSelectedAt: string | null;
  reviewCount: number;
  safetyHiddenCount: number;
  topDoses: InsightBucketRow[];
  unmatchedCount: number;
}>;

export type AdminProductDecisionStats = Readonly<{
  averageProductCoveragePercent: number | null;
  averageStackContributionPercent: number | null;
  chosenPlanCount: number;
  lastChosenAt: string | null;
  nearMissCount: number;
  rejectedCount: number;
  topRejectionReasons: InsightBucketRow[];
  topServingMultipliers: InsightBucketRow[];
}>;

export type ImprovementListStatus =
  | "active"
  | "banned"
  | "blocked"
  | "ignored"
  | "inactive"
  | "missing"
  | "review_required"
  | "unknown";

export type SupplementDemandInsight = Readonly<{
  addCount: number;
  category: string | null;
  coveredCount: number;
  hiddenCount: number;
  id: string;
  lastRecommendedAt: string | null;
  listStatus: ImprovementListStatus;
  name: string;
  recommendationCount: number;
  rationale: string;
  reviewCount: number;
}>;

export type ProductOpportunityType =
  | "approved_master_not_retail"
  | "country_restriction"
  | "external_candidate"
  | "inactive_retail_listing"
  | "rejected_or_near_miss"
  | "stock_or_backorder"
  | "validation_issue";

export type SupplementAvailabilityState =
  | "covered"
  | "missing_master_product"
  | "missing_retail_product"
  | "weak_master_product"
  | "weak_retail_product";

export type MasterSupplementAvailabilityInsight = Readonly<{
  action: string;
  activeRetailerCount: number;
  affectedPlanCount: number;
  availableRetailerCount: number;
  availabilityState: SupplementAvailabilityState;
  backorderRetailerCount: number;
  category: string | null;
  latestRecommendedAt: string | null;
  lowCoveragePlanCount: number;
  masterProductCount: number;
  masterProductsWithDoseCount: number;
  rationale: string;
  recommendedSearchQuery: string;
  retailProductCount: number;
  supplementId: string;
  supplementName: string;
  topDoseLabels: string[];
}>;

export type ProductOpportunityInsight = Readonly<{
  action: string;
  averageCoveragePercent: number | null;
  blockerReason: string | null;
  opportunityLabel: string;
  opportunityType: ProductOpportunityType;
  planCount: number;
  productId: string;
  recommendationCount: number;
  retailerCount: number;
  rationale: string;
  supplementSignals: string[];
  topDoseLabels: string[];
  title: string;
}>;

export type ExternalProductCandidate = Readonly<{
  brandName: string | null;
  confidence: "cached" | "generated" | "unavailable";
  diagnostics: MarketplaceSearchDiagnostic[];
  evidenceRequired: string[];
  externalProductId: string | null;
  affectedPlanCount: number;
  blockerSolved: string;
  imageUrl: string | null;
  matchedGapId: string;
  matchedDoseLabel: string | null;
  matchedGapName: string;
  platform: string | null;
  priceAmount: number | null;
  productUrl: string | null;
  query: string;
  rationale: string;
  searchStatus: "cached" | "error" | "generated" | "unavailable";
  title: string | null;
}>;

export type PlanCoverageComparison = Readonly<{
  contactEmail: string | null;
  currentCoveragePercent: number;
  currentProducts: string[];
  firstName: string | null;
  lastGeneratedAt: string | null;
  optimumCoveragePercent: number;
  optimumDeltaPercent: number;
  optimumProducts: Array<{
    blockerReason: string | null;
    coveragePercent: number | null;
    outcome: string;
    title: string;
  }>;
  planId: string;
  selectedPlan: string | null;
  unmatchedSupplements: string[];
}>;

export type FoodOpportunityInsight = Readonly<{
  blockedPlanCount: number;
  foodId: string;
  foodName: string;
  gapSignals: string[];
  listStatus: ImprovementListStatus;
  missingProfile: boolean;
  planCount: number;
  recommendationCount: number;
}>;

export type UnknownFoodInsight = Readonly<{
  count: number;
  lastSeenAt: string | null;
  name: string;
  reviewStatus: string;
}>;

export type AdminSupplementImprovementInsightsData = Readonly<{
  databaseAvailable: boolean;
  distribution: SupplementDemandInsight[];
  filters: {
    categories: string[];
    listStatuses: ImprovementListStatus[];
  };
  generatedAt: string;
  missingOrBlocked: SupplementDemandInsight[];
  range: AdminDashboardRange;
  summary: {
    activeSupplementsRecommended: number;
    blockedOrHiddenRecommendations: number;
    missingSupplements: number;
    totalRecommendations: number;
    uniqueSupplements: number;
  };
}>;

export type AdminProductImprovementInsightsData = Readonly<{
  databaseAvailable: boolean;
  externalCandidates: ExternalProductCandidate[];
  generatedAt: string;
  masterListOpportunities: ProductOpportunityInsight[];
  planComparisons: PlanCoverageComparison[];
  range: AdminDashboardRange;
  reviewOpportunities: ProductOpportunityInsight[];
  summary: {
    externalCandidateCount: number;
    lowCoveragePlans: number;
    masterListOpportunityCount: number;
    optimumAverageDeltaPercent: number;
    retailBlockerCount: number;
    weakSupplementCount: number;
  };
  supplementAvailability: MasterSupplementAvailabilityInsight[];
}>;

export type AdminFoodImprovementInsightsData = Readonly<{
  databaseAvailable: boolean;
  foodOpportunities: FoodOpportunityInsight[];
  generatedAt: string;
  range: AdminDashboardRange;
  summary: {
    blockedFoodRecommendations: number;
    foodsRecommended: number;
    missingNutrientProfiles: number;
    unknownFoods: number;
    uniqueFoods: number;
  };
  unknownFoods: UnknownFoodInsight[];
}>;

type SchemaAvailability = Readonly<{
  assessments: boolean;
  externalCandidateCache: boolean;
  foodGuidance: boolean;
  foodNutrientProfiles: boolean;
  foods: boolean;
  productCountries: boolean;
  productDecisions: boolean;
  productFacts: boolean;
  productRuns: boolean;
  products: boolean;
  retailOrderAllocations: boolean;
  retailProductStock: boolean;
  retailSellableProducts: boolean;
  supplementSelections: boolean;
  supplements: boolean;
  tasks: boolean;
}>;

const emptySupplementSummary = {
  activeSupplementsRecommended: 0,
  blockedOrHiddenRecommendations: 0,
  missingSupplements: 0,
  totalRecommendations: 0,
  uniqueSupplements: 0
};

const emptyProductSummary = {
  externalCandidateCount: 0,
  lowCoveragePlans: 0,
  masterListOpportunityCount: 0,
  optimumAverageDeltaPercent: 0,
  retailBlockerCount: 0,
  weakSupplementCount: 0
};

const emptyFoodSummary = {
  blockedFoodRecommendations: 0,
  foodsRecommended: 0,
  missingNutrientProfiles: 0,
  unknownFoods: 0,
  uniqueFoods: 0
};

export function emptyAdminSupplementImprovementInsightsData(
  range: AdminDashboardRange,
  databaseAvailable = false
): AdminSupplementImprovementInsightsData {
  return {
    databaseAvailable,
    distribution: [],
    filters: {
      categories: [],
      listStatuses: []
    },
    generatedAt: new Date().toISOString(),
    missingOrBlocked: [],
    range,
    summary: emptySupplementSummary
  };
}

export function emptyAdminProductImprovementInsightsData(
  range: AdminDashboardRange,
  databaseAvailable = false
): AdminProductImprovementInsightsData {
  return {
    databaseAvailable,
    externalCandidates: [],
    generatedAt: new Date().toISOString(),
    masterListOpportunities: [],
    planComparisons: [],
    range,
    reviewOpportunities: [],
    summary: emptyProductSummary,
    supplementAvailability: []
  };
}

export function emptyAdminFoodImprovementInsightsData(
  range: AdminDashboardRange,
  databaseAvailable = false
): AdminFoodImprovementInsightsData {
  return {
    databaseAvailable,
    foodOpportunities: [],
    generatedAt: new Date().toISOString(),
    range,
    summary: emptyFoodSummary,
    unknownFoods: []
  };
}

export async function recommendationInsightsSchemaAvailable(
  sql = getSql()
): Promise<SchemaAvailability> {
  if (!sql) {
    return {
      assessments: false,
      externalCandidateCache: false,
      foodGuidance: false,
      foodNutrientProfiles: false,
      foods: false,
      productCountries: false,
      productDecisions: false,
      productFacts: false,
      productRuns: false,
      products: false,
      retailOrderAllocations: false,
      retailProductStock: false,
      retailSellableProducts: false,
      supplementSelections: false,
      supplements: false,
      tasks: false
    };
  }

  const rows = await sql<Array<{
    assessments: string | null;
    external_candidate_cache: string | null;
    food_guidance: string | null;
    food_nutrient_profiles: string | null;
    foods: string | null;
    product_countries: string | null;
    product_decisions: string | null;
    product_facts: string | null;
    product_runs: string | null;
    products: string | null;
    retail_order_allocations: string | null;
    retail_product_stock: string | null;
    retail_sellable_products: string | null;
    supplement_selections: string | null;
    supplements: string | null;
    tasks: string | null;
  }>>`
    select
      to_regclass('public.assessments')::text as assessments,
      to_regclass('public.improvement_external_product_candidate_cache')::text as external_candidate_cache,
      to_regclass('public.food_guidance')::text as food_guidance,
      to_regclass('public.food_nutrient_profiles')::text as food_nutrient_profiles,
      to_regclass('public.foods')::text as foods,
      to_regclass('public.product_countries')::text as product_countries,
      to_regclass('public.product_recommendation_decisions')::text as product_decisions,
      to_regclass('public.product_facts')::text as product_facts,
      to_regclass('public.product_recommendation_runs')::text as product_runs,
      to_regclass('public.products')::text as products,
      to_regclass('public.retail_order_allocations')::text as retail_order_allocations,
      to_regclass('public.retail_product_stock')::text as retail_product_stock,
      to_regclass('public.retail_sellable_products')::text as retail_sellable_products,
      to_regclass('public.supplement_recommendation_selections')::text as supplement_selections,
      to_regclass('public.supplements')::text as supplements,
      to_regclass('public.tasks')::text as tasks
  `;
  const row = rows[0];

  return {
    assessments: Boolean(row?.assessments),
    externalCandidateCache: Boolean(row?.external_candidate_cache),
    foodGuidance: Boolean(row?.food_guidance),
    foodNutrientProfiles: Boolean(row?.food_nutrient_profiles),
    foods: Boolean(row?.foods),
    productCountries: Boolean(row?.product_countries),
    productDecisions: Boolean(row?.product_decisions),
    productFacts: Boolean(row?.product_facts),
    productRuns: Boolean(row?.product_runs),
    products: Boolean(row?.products),
    retailOrderAllocations: Boolean(row?.retail_order_allocations),
    retailProductStock: Boolean(row?.retail_product_stock),
    retailSellableProducts: Boolean(row?.retail_sellable_products),
    supplementSelections: Boolean(row?.supplement_selections),
    supplements: Boolean(row?.supplements),
    tasks: Boolean(row?.tasks)
  };
}

function rangeStartParam(range: AdminDashboardRange) {
  return adminDashboardRangeStart(range);
}

function isoOrNull(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
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

function boundedPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueStrings(values: readonly (string | null | undefined)[], limit = 8) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = value?.trim();
    const key = text?.toLowerCase();

    if (!text || !key || seen.has(key)) {
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

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .trim();
}

function doseLabel(row: {
  dose_amount: number | string | null;
  dose_unit: string | null;
  daily_dose_text: string | null;
}) {
  const amount = optionalNumber(row.dose_amount);

  if (amount !== null && row.dose_unit) {
    return `${amount} ${row.dose_unit}`;
  }

  return row.daily_dose_text || "Unparsed";
}

function displayDoseLabels(labels: readonly string[]) {
  return labels.filter((label) => label !== "Unparsed").slice(0, 2);
}

function primaryDoseLabel(labels: readonly string[]) {
  return displayDoseLabels(labels)[0] ?? null;
}

function gapWithDose(name: string, doseLabels: readonly string[]) {
  const dose = primaryDoseLabel(doseLabels);

  return dose ? `${name} at ${dose}` : name;
}

function asProductSnapshots(value: unknown): ProductSnapshot[] {
  return Array.isArray(value)
    ? value.filter((item): item is ProductSnapshot =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as ProductSnapshot).title === "string" &&
        typeof (item as ProductSnapshot).productUrl === "string"
      )
    : [];
}

function asMarketplaceDiagnostics(value: unknown): MarketplaceSearchDiagnostic[] {
  return Array.isArray(value)
    ? value.filter((item): item is MarketplaceSearchDiagnostic =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as MarketplaceSearchDiagnostic).platform === "string"
      )
    : [];
}

function statusFromSupplementRow(row: {
  is_active: boolean | null;
  list_status: string | null;
  safety_action: string | null;
  safety_visibility: string | null;
  source_status: string | null;
  supplement_id: string | null;
  supplement_exists: boolean | null;
}): ImprovementListStatus {
  if (!row.supplement_id || row.supplement_exists === false || row.safety_action === "unknown_supplement") {
    return "missing";
  }

  if (row.safety_visibility === "hidden") {
    return "banned";
  }

  if (row.list_status === "ignored") {
    return "ignored";
  }

  if (row.list_status === "inactive") {
    return "inactive";
  }

  if (row.is_active === false || row.list_status === "blocked") {
    return "blocked";
  }

  if (row.source_status && row.source_status !== "core") {
    return "review_required";
  }

  return "active";
}

function supplementDemandRationale(row: {
  add_count: number | string;
  hidden_count: number | string;
  is_active: boolean | null;
  list_status: string | null;
  review_count: number | string;
  safety_action: string | null;
  safety_visibility: string | null;
  source_status: string | null;
  supplement_id: string | null;
  supplement_exists: boolean | null;
}) {
  if (!row.supplement_id || row.supplement_exists === false || row.safety_action === "unknown_supplement") {
    return "AI recommended this supplement, but it is not yet a clean active item in the managed supplement list.";
  }

  if (row.safety_visibility === "hidden" || numberValue(row.hidden_count) > 0) {
    return "This recommendation is hidden by safety policy or customer-specific safety handling.";
  }

  if (row.list_status === "ignored") {
    return "This supplement has been deliberately ignored in the managed list, so it is not treated as an outside-master-list action.";
  }

  if (row.list_status === "inactive") {
    return "The supplement exists, but the managed list marks it inactive.";
  }

  if (row.is_active === false || row.list_status === "blocked") {
    return "The supplement exists, but it is blocked or inactive and should not be used until reviewed.";
  }

  if (row.source_status && row.source_status !== "core") {
    return "The supplement is in the list as a proposed addition, but it still needs source and safety review.";
  }

  if (numberValue(row.review_count) > 0) {
    return "AI recommended it with review status, so an admin should confirm suitability before treating it as cleanly usable.";
  }

  if (numberValue(row.add_count) > 0) {
    return "AI recommended adding this supplement for at least one plan, but it is not yet fully resolved as covered.";
  }

  return "This supplement is not cleanly usable for at least one current recommendation.";
}

function productOpportunityAction(type: ProductOpportunityType) {
  if (type === "approved_master_not_retail") {
    return "Retailers should add this approved master product.";
  }

  if (type === "inactive_retail_listing") {
    return "Reactivate or clean up the retailer listing.";
  }

  if (type === "stock_or_backorder") {
    return "Restock or enable a clear backorder policy.";
  }

  if (type === "country_restriction") {
    return "Add country pricing/availability for Thailand.";
  }

  if (type === "validation_issue") {
    return "Review product validation before matching.";
  }

  return "Review why the matcher rejected or nearly selected this product.";
}

function productOpportunityLabel(type: ProductOpportunityType) {
  if (type === "approved_master_not_retail") {
    return "Retailer add";
  }

  if (type === "inactive_retail_listing") {
    return "Reactivate listing";
  }

  if (type === "stock_or_backorder") {
    return "Restock/backorder";
  }

  if (type === "country_restriction") {
    return "Thailand availability";
  }

  if (type === "validation_issue") {
    return "Master validation";
  }

  return "Matcher review";
}

function actionableProductOpportunity(type: ProductOpportunityType) {
  return (
    type === "approved_master_not_retail" ||
    type === "inactive_retail_listing" ||
    type === "stock_or_backorder"
  );
}

function productOpportunitySupplementContext(
  signals: readonly string[],
  byName: ReadonlyMap<string, MasterSupplementAvailabilityInsight>
) {
  for (const signal of signals) {
    const context = byName.get(normalizeSearchText(signal));

    if (context) {
      return context;
    }
  }

  return null;
}

function productOpportunityActionWithContext(
  row: ProductOpportunityInsight,
  context: MasterSupplementAvailabilityInsight | null
) {
  const signal = row.supplementSignals[0] ?? "the supplement gap";
  const target = gapWithDose(signal, context?.topDoseLabels ?? row.topDoseLabels);

  if (row.opportunityType === "approved_master_not_retail") {
    return `Retailers should add ${row.title} to cover ${target}.`;
  }

  if (row.opportunityType === "inactive_retail_listing") {
    return `Reactivate ${row.title} so it can cover ${target}.`;
  }

  if (row.opportunityType === "stock_or_backorder") {
    return `Restock or allow clear backorder for ${row.title} to cover ${target}.`;
  }

  return productOpportunityAction(row.opportunityType);
}

function productOpportunityRationale(
  row: ProductOpportunityInsight,
  context: MasterSupplementAvailabilityInsight | null
) {
  const signal = row.supplementSignals[0] ?? "unknown supplement";
  const target = gapWithDose(signal, context?.topDoseLabels ?? row.topDoseLabels);
  const demand = context?.affectedPlanCount
    ? `${context.affectedPlanCount} plans recently needed ${target}`
    : `${row.planCount} plans surfaced ${target}`;
  const fit = row.averageCoveragePercent !== null
    ? `average product fit was ${Math.round(row.averageCoveragePercent)}%`
    : "fit score was not captured";

  return `${demand}; ${fit}. ${row.blockerReason ?? productOpportunityAction(row.opportunityType)}`;
}

function enrichProductOpportunity(
  row: ProductOpportunityInsight,
  supplementContextByName: ReadonlyMap<string, MasterSupplementAvailabilityInsight>
): ProductOpportunityInsight {
  const context = productOpportunitySupplementContext(
    row.supplementSignals,
    supplementContextByName
  );
  const topDoseLabels = context?.topDoseLabels ?? row.topDoseLabels;
  const hydrated = { ...row, topDoseLabels };

  return {
    ...hydrated,
    action: productOpportunityActionWithContext(hydrated, context),
    opportunityLabel: productOpportunityLabel(row.opportunityType),
    rationale: productOpportunityRationale(hydrated, context)
  };
}

export function classifySupplementAvailability(input: Readonly<{
  activeRetailerCount: number;
  availableRetailerCount: number;
  masterProductCount: number;
  masterProductsWithDoseCount: number;
  retailProductCount: number;
}>): SupplementAvailabilityState {
  if (input.masterProductCount < 1) {
    return "missing_master_product";
  }

  if (input.masterProductCount < 2 || input.masterProductsWithDoseCount < 1) {
    return "weak_master_product";
  }

  if (input.retailProductCount < 1 || input.activeRetailerCount < 1) {
    return "missing_retail_product";
  }

  if (input.activeRetailerCount < 2 || input.availableRetailerCount < 2) {
    return "weak_retail_product";
  }

  return "covered";
}

function supplementAvailabilityAction(input: Readonly<{
  availabilityState: SupplementAvailabilityState;
  supplementName: string;
  topDoseLabels: readonly string[];
}>) {
  const target = gapWithDose(input.supplementName, input.topDoseLabels);

  if (
    input.availabilityState === "missing_master_product" ||
    input.availabilityState === "weak_master_product"
  ) {
    return `Find or import a master-list product for ${target}.`;
  }

  if (input.availabilityState === "missing_retail_product") {
    return `Retailers should add an approved master product covering ${target}.`;
  }

  if (input.availabilityState === "weak_retail_product") {
    return `Add another retailer or restock products covering ${target}.`;
  }

  return `Coverage for ${target} is resilient enough for now.`;
}

function supplementAvailabilityRationale(input: Readonly<{
  activeRetailerCount: number;
  affectedPlanCount: number;
  availabilityState: SupplementAvailabilityState;
  availableRetailerCount: number;
  backorderRetailerCount: number;
  lowCoveragePlanCount: number;
  masterProductCount: number;
  masterProductsWithDoseCount: number;
  retailProductCount: number;
}>) {
  if (input.availabilityState === "missing_master_product") {
    return `${input.affectedPlanCount} plans recommended this supplement, but no approved Thailand master product has a linked supplement fact.`;
  }

  if (input.availabilityState === "weak_master_product") {
    return `${input.masterProductCount} master product(s) cover this supplement and ${input.masterProductsWithDoseCount} have usable dose facts, so master coverage is fragile.`;
  }

  if (input.availabilityState === "missing_retail_product") {
    return `${input.masterProductCount} master product(s) exist, but none are currently sellable through active Thailand retailers.`;
  }

  if (input.availabilityState === "weak_retail_product") {
    return `${input.retailProductCount} retail product(s) are sellable across ${input.activeRetailerCount} retailer(s); ${input.availableRetailerCount} retailer(s) have stock now and ${input.backorderRetailerCount} rely on backorder.`;
  }

  return `${input.masterProductCount} master products and ${input.activeRetailerCount} active retailers cover this supplement.`;
}

export function supplementAvailabilitySearchPhrase(
  insight: Pick<MasterSupplementAvailabilityInsight, "supplementName" | "topDoseLabels">
) {
  return [
    "Thailand",
    insight.supplementName,
    primaryDoseLabel(insight.topDoseLabels),
    "supplement product"
  ].filter(Boolean).join(" ");
}

function classifyProductOpportunity(row: {
  active_retailer_count: number | string;
  country_count: number | string;
  inactive_retailer_count: number | string;
  product_status: string | null;
  stock_available_count: number | string;
  validation_status: string | null;
}): ProductOpportunityType {
  if (row.product_status !== "approved" || row.validation_status !== "pass") {
    return "validation_issue";
  }

  if (numberValue(row.country_count) < 1) {
    return "country_restriction";
  }

  if (numberValue(row.active_retailer_count) < 1 && numberValue(row.inactive_retailer_count) > 0) {
    return "inactive_retail_listing";
  }

  if (numberValue(row.active_retailer_count) < 1) {
    return "approved_master_not_retail";
  }

  if (numberValue(row.stock_available_count) < 1) {
    return "stock_or_backorder";
  }

  return "rejected_or_near_miss";
}

export async function getSupplementSelectionStatsBySupplement(
  range: AdminDashboardRange
) {
  const sql = getSql();

  if (!sql) {
    return new Map<string, AdminSupplementSelectionStats>();
  }

  const availability = await recommendationInsightsSchemaAvailable(sql);

  if (!availability.supplementSelections) {
    return new Map<string, AdminSupplementSelectionStats>();
  }

  const start = rangeStartParam(range);
  const rows = await sql<Array<{
    add_count: number | string;
    chosen_plan_count: number | string;
    covered_count: number | string;
    last_selected_at: Date | string | null;
    review_count: number | string;
    safety_hidden_count: number | string;
    supplement_id: string;
    unmatched_count: number | string;
  }>>`
    select
      supplement_recommendation_selections.supplement_id::text,
      count(distinct supplement_recommendation_selections.plan_id) filter (
        where coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
      ) as chosen_plan_count,
      count(*) filter (where supplement_recommendation_selections.status = 'add') as add_count,
      count(*) filter (where supplement_recommendation_selections.status = 'review') as review_count,
      count(*) filter (where supplement_recommendation_selections.status = 'covered') as covered_count,
      count(*) filter (where supplement_recommendation_selections.safety_visibility = 'hidden') as safety_hidden_count,
      count(*) filter (where supplement_recommendation_selections.supplement_id is null) as unmatched_count,
      max(supplement_recommendation_selections.generated_at) filter (
        where coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
      ) as last_selected_at
    from public.supplement_recommendation_selections
    join public.assessments
      on assessments.plan_id = supplement_recommendation_selections.plan_id
    where supplement_recommendation_selections.is_current = true
      and supplement_recommendation_selections.supplement_id is not null
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
    group by supplement_recommendation_selections.supplement_id
  `;
  const doseRows = await sql<Array<{
    count: number | string;
    daily_dose_text: string | null;
    dose_amount: number | string | null;
    dose_unit: string | null;
    supplement_id: string;
  }>>`
    select
      supplement_recommendation_selections.supplement_id::text,
      supplement_recommendation_selections.dose_amount,
      supplement_recommendation_selections.dose_unit,
      supplement_recommendation_selections.daily_dose_text,
      count(distinct supplement_recommendation_selections.plan_id) as count
    from public.supplement_recommendation_selections
    join public.assessments
      on assessments.plan_id = supplement_recommendation_selections.plan_id
    where supplement_recommendation_selections.is_current = true
      and supplement_recommendation_selections.supplement_id is not null
      and coalesce(supplement_recommendation_selections.safety_visibility, 'visible') <> 'hidden'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
    group by
      supplement_recommendation_selections.supplement_id,
      supplement_recommendation_selections.dose_amount,
      supplement_recommendation_selections.dose_unit,
      supplement_recommendation_selections.daily_dose_text
    order by count desc
  `;
  const dosesBySupplement = new Map<string, InsightBucketRow[]>();

  for (const row of doseRows) {
    const list = dosesBySupplement.get(row.supplement_id) ?? [];

    if (list.length < 3) {
      list.push({
        count: numberValue(row.count),
        label: doseLabel(row)
      });
      dosesBySupplement.set(row.supplement_id, list);
    }
  }

  return new Map(
    rows.map((row) => [
      row.supplement_id,
      {
        addCount: numberValue(row.add_count),
        chosenPlanCount: numberValue(row.chosen_plan_count),
        coveredCount: numberValue(row.covered_count),
        lastSelectedAt: isoOrNull(row.last_selected_at),
        reviewCount: numberValue(row.review_count),
        safetyHiddenCount: numberValue(row.safety_hidden_count),
        topDoses: dosesBySupplement.get(row.supplement_id) ?? [],
        unmatchedCount: numberValue(row.unmatched_count)
      }
    ])
  );
}

export async function getProductDecisionStatsByProduct(
  range: AdminDashboardRange,
  options: Readonly<{ productIds?: readonly string[] }> = {}
) {
  const sql = getSql();

  if (!sql) {
    return new Map<string, AdminProductDecisionStats>();
  }

  const productIds = [...new Set((options.productIds ?? []).filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ))];
  const restrictProducts = options.productIds !== undefined;

  if (restrictProducts && productIds.length < 1) {
    return new Map<string, AdminProductDecisionStats>();
  }

  const availability = await recommendationInsightsSchemaAvailable(sql);

  if (!availability.productDecisions) {
    return new Map<string, AdminProductDecisionStats>();
  }

  const start = rangeStartParam(range);
  const rows = await sql<Array<{
    average_product_coverage_percent: number | string | null;
    average_stack_contribution_percent: number | string | null;
    chosen_plan_count: number | string;
    last_chosen_at: Date | string | null;
    near_miss_count: number | string;
    product_id: string;
    rejected_count: number | string;
  }>>`
    select
      product_recommendation_decisions.product_id::text,
      count(distinct product_recommendation_decisions.plan_id) filter (
        where product_recommendation_decisions.outcome = 'chosen'
      ) as chosen_plan_count,
      count(*) filter (where product_recommendation_decisions.outcome = 'near_miss') as near_miss_count,
      count(*) filter (where product_recommendation_decisions.outcome = 'rejected') as rejected_count,
      avg(product_recommendation_decisions.product_coverage_percent) filter (
        where product_recommendation_decisions.outcome = 'chosen'
      ) as average_product_coverage_percent,
      avg(product_recommendation_decisions.stack_contribution_percent) filter (
        where product_recommendation_decisions.outcome = 'chosen'
      ) as average_stack_contribution_percent,
      max(product_recommendation_decisions.generated_at) filter (
        where product_recommendation_decisions.outcome = 'chosen'
      ) as last_chosen_at
    from public.product_recommendation_decisions
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    where product_recommendation_decisions.is_current = true
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
      and (
        not ${restrictProducts}::boolean
        or product_recommendation_decisions.product_id = any(${productIds}::uuid[])
      )
    group by product_recommendation_decisions.product_id
  `;
  const servingRows = await sql<Array<{
    count: number | string;
    product_id: string;
    serving_multiplier: number | string;
  }>>`
    select
      product_recommendation_decisions.product_id::text,
      product_recommendation_decisions.serving_multiplier,
      count(distinct product_recommendation_decisions.plan_id) as count
    from public.product_recommendation_decisions
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    where product_recommendation_decisions.is_current = true
      and product_recommendation_decisions.outcome = 'chosen'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
      and (
        not ${restrictProducts}::boolean
        or product_recommendation_decisions.product_id = any(${productIds}::uuid[])
      )
    group by
      product_recommendation_decisions.product_id,
      product_recommendation_decisions.serving_multiplier
    order by count desc
  `;
  const rejectionRows = await sql<Array<{
    count: number | string;
    product_id: string;
    reason: string | null;
  }>>`
    select
      product_recommendation_decisions.product_id::text,
      product_recommendation_decisions.reason,
      count(*) as count
    from public.product_recommendation_decisions
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    where product_recommendation_decisions.is_current = true
      and product_recommendation_decisions.outcome = 'rejected'
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
      and (
        not ${restrictProducts}::boolean
        or product_recommendation_decisions.product_id = any(${productIds}::uuid[])
      )
    group by
      product_recommendation_decisions.product_id,
      product_recommendation_decisions.reason
    order by count desc
  `;
  const servingsByProduct = new Map<string, InsightBucketRow[]>();
  const rejectionsByProduct = new Map<string, InsightBucketRow[]>();

  for (const row of servingRows) {
    const list = servingsByProduct.get(row.product_id) ?? [];

    if (list.length < 3) {
      list.push({
        count: numberValue(row.count),
        label: `${numberValue(row.serving_multiplier)} serving${numberValue(row.serving_multiplier) === 1 ? "" : "s"}`
      });
      servingsByProduct.set(row.product_id, list);
    }
  }

  for (const row of rejectionRows) {
    const list = rejectionsByProduct.get(row.product_id) ?? [];

    if (list.length < 3) {
      list.push({
        count: numberValue(row.count),
        label: row.reason || "Rejected"
      });
      rejectionsByProduct.set(row.product_id, list);
    }
  }

  return new Map(
    rows.map((row) => [
      row.product_id,
      {
        averageProductCoveragePercent: optionalNumber(
          row.average_product_coverage_percent
        ),
        averageStackContributionPercent: optionalNumber(
          row.average_stack_contribution_percent
        ),
        chosenPlanCount: numberValue(row.chosen_plan_count),
        lastChosenAt: isoOrNull(row.last_chosen_at),
        nearMissCount: numberValue(row.near_miss_count),
        rejectedCount: numberValue(row.rejected_count),
        topRejectionReasons: rejectionsByProduct.get(row.product_id) ?? [],
        topServingMultipliers: servingsByProduct.get(row.product_id) ?? []
      }
    ])
  );
}

export async function getAdminSupplementImprovementInsightsData(
  range: AdminDashboardRange,
  locale: Locale = "en"
): Promise<AdminSupplementImprovementInsightsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminSupplementImprovementInsightsData(range);
  }

  try {
    const availability = await recommendationInsightsSchemaAvailable(sql);

    if (!availability.assessments || !availability.supplementSelections) {
      return emptyAdminSupplementImprovementInsightsData(range, true);
    }

    const start = rangeStartParam(range);
    const rows = await sql<Array<{
      add_count: number | string;
      category: string | null;
      covered_count: number | string;
      hidden_count: number | string;
      id: string;
      is_active: boolean | null;
      last_recommended_at: Date | string | null;
      list_status: string | null;
      name: string;
      recommendation_count: number | string;
      review_count: number | string;
      safety_action: string | null;
      safety_visibility: string | null;
      source_status: string | null;
      supplement_exists: boolean | null;
      supplement_id: string | null;
    }>>`
      select
        coalesce(
          supplement_recommendation_selections.supplement_id::text,
          'missing:' || lower(regexp_replace(supplement_recommendation_selections.supplement_name_text, '[^[:alnum:]]+', '_', 'g'))
        ) as id,
        max(supplement_recommendation_selections.supplement_id::text) as supplement_id,
        bool_or(supplements.id is not null) as supplement_exists,
        coalesce(
          max(supplement_translations.name),
          max(supplements.name),
          max(supplement_recommendation_selections.supplement_name_text)
        ) as name,
        coalesce(max(supplements.category), max(supplement_recommendation_selections.category)) as category,
        max(supplements.source_status) as source_status,
        max(supplements.list_status) as list_status,
        bool_or(supplements.is_active) as is_active,
        max(supplement_recommendation_selections.safety_action) as safety_action,
        max(supplement_recommendation_selections.safety_visibility) as safety_visibility,
        count(distinct supplement_recommendation_selections.plan_id) as recommendation_count,
        count(*) filter (where supplement_recommendation_selections.status = 'add') as add_count,
        count(*) filter (where supplement_recommendation_selections.status = 'covered') as covered_count,
        count(*) filter (where supplement_recommendation_selections.status = 'review') as review_count,
        count(*) filter (where supplement_recommendation_selections.safety_visibility = 'hidden') as hidden_count,
        max(supplement_recommendation_selections.generated_at) as last_recommended_at
      from public.supplement_recommendation_selections
      join public.assessments
        on assessments.plan_id = supplement_recommendation_selections.plan_id
      left join public.supplements
        on supplements.id = supplement_recommendation_selections.supplement_id
      left join public.supplement_translations
        on supplement_translations.supplement_id = supplements.id
       and supplement_translations.locale = ${locale}
      where supplement_recommendation_selections.is_current = true
        and assessments.selected_plan is not null
        and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
      group by 1
      order by recommendation_count desc, name asc
      limit 80
    `;
    const distribution = rows.map((row) => ({
      addCount: numberValue(row.add_count),
      category: row.category,
      coveredCount: numberValue(row.covered_count),
      hiddenCount: numberValue(row.hidden_count),
      id: row.id,
      lastRecommendedAt: isoOrNull(row.last_recommended_at),
      listStatus: statusFromSupplementRow(row),
      name: row.name,
      recommendationCount: numberValue(row.recommendation_count),
      rationale: supplementDemandRationale(row),
      reviewCount: numberValue(row.review_count)
    }));
    const missingOrBlocked = distribution
      .filter((row) => row.listStatus !== "active" && row.listStatus !== "missing")
      .sort(
        (first, second) =>
          second.recommendationCount - first.recommendationCount ||
          first.name.localeCompare(second.name)
      )
      .slice(0, 40);
    const totalRecommendations = distribution.reduce(
      (sum, row) => sum + row.recommendationCount,
      0
    );

    return {
      databaseAvailable: true,
      distribution,
      filters: {
        categories: uniqueStrings(distribution.map((row) => row.category), 40),
        listStatuses: [...new Set(distribution.map((row) => row.listStatus))]
      },
      generatedAt: new Date().toISOString(),
      missingOrBlocked,
      range,
      summary: {
        activeSupplementsRecommended: distribution.filter(
          (row) => row.listStatus === "active"
        ).length,
        blockedOrHiddenRecommendations: distribution
          .filter((row) => row.listStatus === "blocked" || row.listStatus === "banned")
          .reduce((sum, row) => sum + row.recommendationCount, 0),
        missingSupplements: distribution.filter((row) => row.listStatus === "missing").length,
        totalRecommendations,
        uniqueSupplements: distribution.length
      }
    };
  } catch (error) {
    console.error("Unable to load supplement improvement insights", error);
    return emptyAdminSupplementImprovementInsightsData(range);
  }
}

export async function loadMasterSupplementAvailabilityInsights(
  sql: InsightsDb,
  start: Date | null,
  _locale: Locale = "en"
): Promise<MasterSupplementAvailabilityInsight[]> {
  const rows = await sql<Array<{
    active_retailer_count: number | string;
    affected_plan_count: number | string | null;
    available_retailer_count: number | string;
    backorder_retailer_count: number | string;
    category: string | null;
    latest_recommended_at: Date | string | null;
    low_coverage_plan_count: number | string | null;
    master_product_count: number | string;
    master_products_with_dose_count: number | string;
    retail_product_count: number | string;
    supplement_id: string;
    supplement_name: string;
  }>>`
    with latest_runs as (
      select distinct on (product_recommendation_runs.plan_id)
        product_recommendation_runs.plan_id,
        product_recommendation_runs.supplement_product_coverage_percent
      from public.product_recommendation_runs
      where product_recommendation_runs.status in ('completed', 'partial')
      order by product_recommendation_runs.plan_id, product_recommendation_runs.generated_at desc
    )
    select
      supplements.id::text as supplement_id,
      supplements.name as supplement_name,
      supplements.category,
      coalesce(demand_state.affected_plan_count, 0)::int as affected_plan_count,
      coalesce(demand_state.low_coverage_plan_count, 0)::int as low_coverage_plan_count,
      demand_state.latest_recommended_at,
      count(distinct products.id) filter (
        where products.status = 'approved'
          and products.validation_status = 'pass'
          and product_countries.product_id is not null
      )::int as master_product_count,
      count(distinct products.id) filter (
        where products.status = 'approved'
          and products.validation_status = 'pass'
          and product_countries.product_id is not null
          and product_facts.amount is not null
          and nullif(product_facts.unit, '') is not null
      )::int as master_products_with_dose_count,
      count(distinct retail_sellable_products.id) filter (
        where products.status = 'approved'
          and products.validation_status = 'pass'
          and product_countries.product_id is not null
          and organisations.id is not null
          and retail_sellable_products.status = 'active'
          and retail_sellable_products.rrp_price_amount is not null
          and (
            coalesce(retail_product_stock.stock_quantity, 0) > coalesce(allocation_state.allocated_quantity, 0)
            or retail_sellable_products.backorder_policy = 'allow'
          )
      )::int as retail_product_count,
      count(distinct organisations.id) filter (
        where products.status = 'approved'
          and products.validation_status = 'pass'
          and product_countries.product_id is not null
          and retail_sellable_products.status = 'active'
          and retail_sellable_products.rrp_price_amount is not null
      )::int as active_retailer_count,
      count(distinct organisations.id) filter (
        where products.status = 'approved'
          and products.validation_status = 'pass'
          and product_countries.product_id is not null
          and retail_sellable_products.status = 'active'
          and retail_sellable_products.rrp_price_amount is not null
          and coalesce(retail_product_stock.stock_quantity, 0) > coalesce(allocation_state.allocated_quantity, 0)
      )::int as available_retailer_count,
      count(distinct organisations.id) filter (
        where products.status = 'approved'
          and products.validation_status = 'pass'
          and product_countries.product_id is not null
          and retail_sellable_products.status = 'active'
          and retail_sellable_products.rrp_price_amount is not null
          and coalesce(retail_product_stock.stock_quantity, 0) <= coalesce(allocation_state.allocated_quantity, 0)
          and retail_sellable_products.backorder_policy = 'allow'
      )::int as backorder_retailer_count
    from public.supplements
    left join public.product_facts
      on product_facts.supplement_id = supplements.id
      and product_facts.item_type = 'supplement'
    left join public.products
      on products.id = product_facts.product_id
    left join public.product_countries
      on product_countries.product_id = products.id
      and product_countries.country_code = 'TH'
    left join public.retail_sellable_products
      on retail_sellable_products.product_id = products.id
      and retail_sellable_products.status <> 'deleted'
    left join public.organisations
      on organisations.id = retail_sellable_products.organisation_id
      and organisations.organisation_type = 'tenant'
      and organisations.status = 'active'
      and organisations.country_code = 'TH'
    left join public.retail_product_stock
      on retail_product_stock.product_id = products.id
      and retail_product_stock.organisation_id = organisations.id
      and retail_product_stock.status <> 'deleted'
    left join lateral (
      select coalesce(sum(retail_order_allocations.quantity_allocated), 0)::int as allocated_quantity
      from public.retail_order_allocations
      where retail_order_allocations.product_id = products.id
        and retail_order_allocations.organisation_id = organisations.id
        and retail_order_allocations.status in ('active', 'picked')
    ) allocation_state on true
    left join lateral (
      select
        count(distinct supplement_recommendation_selections.plan_id)::int as affected_plan_count,
        count(distinct supplement_recommendation_selections.plan_id) filter (
          where coalesce(latest_runs.supplement_product_coverage_percent, 0) < 75
        )::int as low_coverage_plan_count,
        max(supplement_recommendation_selections.generated_at) as latest_recommended_at
      from public.supplement_recommendation_selections
      left join latest_runs
        on latest_runs.plan_id = supplement_recommendation_selections.plan_id
      where supplement_recommendation_selections.supplement_id = supplements.id
        and supplement_recommendation_selections.is_current = true
        and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
    ) demand_state on true
    where supplements.is_active = true
      and supplements.list_status = 'active'
    group by supplements.id, supplements.name, supplements.category, demand_state.affected_plan_count, demand_state.low_coverage_plan_count, demand_state.latest_recommended_at
  `;
  const doseRows = await sql<Array<{
    count: number | string;
    daily_dose_text: string | null;
    dose_amount: number | string | null;
    dose_unit: string | null;
    supplement_id: string;
  }>>`
    select
      supplement_recommendation_selections.supplement_id::text,
      supplement_recommendation_selections.dose_amount,
      supplement_recommendation_selections.dose_unit,
      supplement_recommendation_selections.daily_dose_text,
      count(distinct supplement_recommendation_selections.plan_id)::int as count
    from public.supplement_recommendation_selections
    join public.supplements
      on supplements.id = supplement_recommendation_selections.supplement_id
    where supplement_recommendation_selections.is_current = true
      and supplement_recommendation_selections.supplement_id is not null
      and supplements.is_active = true
      and supplements.list_status = 'active'
      and (${start}::timestamptz is null or supplement_recommendation_selections.generated_at >= ${start})
    group by
      supplement_recommendation_selections.supplement_id,
      supplement_recommendation_selections.dose_amount,
      supplement_recommendation_selections.dose_unit,
      supplement_recommendation_selections.daily_dose_text
    order by count desc
  `;
  const dosesBySupplement = new Map<string, string[]>();

  for (const row of doseRows) {
    const label = doseLabel(row);
    const list = dosesBySupplement.get(row.supplement_id) ?? [];

    if (!list.includes(label)) {
      list.push(label);
    }

    dosesBySupplement.set(row.supplement_id, list.slice(0, 3));
  }

  return rows.map((row) => {
    const counts = {
      activeRetailerCount: numberValue(row.active_retailer_count),
      availableRetailerCount: numberValue(row.available_retailer_count),
      masterProductCount: numberValue(row.master_product_count),
      masterProductsWithDoseCount: numberValue(row.master_products_with_dose_count),
      retailProductCount: numberValue(row.retail_product_count)
    };
    const availabilityState = classifySupplementAvailability(counts);
    const topDoseLabels = dosesBySupplement.get(row.supplement_id) ?? [];
    const insight = {
      action: "",
      activeRetailerCount: counts.activeRetailerCount,
      affectedPlanCount: numberValue(row.affected_plan_count),
      availableRetailerCount: counts.availableRetailerCount,
      availabilityState,
      backorderRetailerCount: numberValue(row.backorder_retailer_count),
      category: row.category,
      latestRecommendedAt: isoOrNull(row.latest_recommended_at),
      lowCoveragePlanCount: numberValue(row.low_coverage_plan_count),
      masterProductCount: counts.masterProductCount,
      masterProductsWithDoseCount: counts.masterProductsWithDoseCount,
      rationale: "",
      recommendedSearchQuery: "",
      retailProductCount: counts.retailProductCount,
      supplementId: row.supplement_id,
      supplementName: row.supplement_name,
      topDoseLabels
    } satisfies MasterSupplementAvailabilityInsight;

    return {
      ...insight,
      action: supplementAvailabilityAction(insight),
      rationale: supplementAvailabilityRationale(insight),
      recommendedSearchQuery: supplementAvailabilitySearchPhrase(insight)
    };
  }).sort(
    (first, second) =>
      Number(first.availabilityState === "covered") - Number(second.availabilityState === "covered") ||
      second.lowCoveragePlanCount - first.lowCoveragePlanCount ||
      second.affectedPlanCount - first.affectedPlanCount ||
      first.masterProductCount - second.masterProductCount ||
      first.activeRetailerCount - second.activeRetailerCount ||
      first.supplementName.localeCompare(second.supplementName)
  );
}

export async function getAdminProductImprovementInsightsData(
  range: AdminDashboardRange,
  locale: Locale = "en"
): Promise<AdminProductImprovementInsightsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminProductImprovementInsightsData(range);
  }

  try {
    const availability = await recommendationInsightsSchemaAvailable(sql);

    if (
      !availability.assessments ||
      !availability.productCountries ||
      !availability.productDecisions ||
      !availability.productFacts ||
      !availability.productRuns ||
      !availability.products ||
      !availability.retailOrderAllocations ||
      !availability.retailProductStock ||
      !availability.retailSellableProducts ||
      !availability.supplementSelections ||
      !availability.supplements
    ) {
      return emptyAdminProductImprovementInsightsData(range, true);
    }

    const start = rangeStartParam(range);
    const [rawOpportunities, planComparisons, supplementAvailability] = await Promise.all([
      loadMasterListOpportunities(sql, range, locale, start),
      loadPlanCoverageComparisons(sql, start),
      loadMasterSupplementAvailabilityInsights(sql, start, locale)
    ]);
    const doseContextByName = new Map(
      supplementAvailability.map((insight) => [
        normalizeSearchText(insight.supplementName),
        insight
      ])
    );
    const opportunities = rawOpportunities
      .map((row) => enrichProductOpportunity(row, doseContextByName))
      .filter((row) => actionableProductOpportunity(row.opportunityType));
    const reviewOpportunities = rawOpportunities
      .map((row) => enrichProductOpportunity(row, doseContextByName))
      .filter((row) => !actionableProductOpportunity(row.opportunityType));
    const externalCandidates = await loadExternalProductCandidates(
      sql,
      availability,
      supplementAvailability.filter((row) => row.availabilityState !== "covered")
    );
    const deltas = planComparisons.map((row) => row.optimumDeltaPercent);
    const averageDelta = deltas.length > 0
      ? boundedPercent(deltas.reduce((sum, value) => sum + value, 0) / deltas.length)
      : 0;

    return {
      databaseAvailable: true,
      externalCandidates,
      generatedAt: new Date().toISOString(),
      masterListOpportunities: opportunities,
      planComparisons,
      range,
      reviewOpportunities,
      summary: {
        externalCandidateCount: externalCandidates.filter((row) => row.title).length,
        lowCoveragePlans: planComparisons.filter(
          (row) => row.currentCoveragePercent < 75
        ).length,
        masterListOpportunityCount: opportunities.length,
        optimumAverageDeltaPercent: averageDelta,
        retailBlockerCount: opportunities.filter(
          (row) =>
            row.opportunityType === "approved_master_not_retail" ||
            row.opportunityType === "inactive_retail_listing" ||
            row.opportunityType === "stock_or_backorder"
        ).length,
        weakSupplementCount: supplementAvailability.filter(
          (row) => row.availabilityState !== "covered"
        ).length
      },
      supplementAvailability
    };
  } catch (error) {
    console.error("Unable to load product improvement insights", error);
    return emptyAdminProductImprovementInsightsData(range);
  }
}

async function loadMasterListOpportunities(
  sql: InsightsDb,
  range: AdminDashboardRange,
  locale: Locale,
  start: Date | null
) {
  const rows = await sql<Array<{
    active_retailer_count: number | string;
    average_coverage_percent: number | string | null;
    country_count: number | string;
    inactive_retailer_count: number | string;
    plan_count: number | string;
    product_id: string;
    product_status: string | null;
    recommendation_count: number | string;
    rejection_reason: string | null;
    signals: string[] | null;
    stock_available_count: number | string;
    title: string;
    validation_status: string | null;
  }>>`
    select
      product_recommendation_decisions.product_id::text,
      coalesce(max(product_translations.title), max(products.title), max(product_recommendation_decisions.product_title)) as title,
      max(products.status) as product_status,
      max(products.validation_status) as validation_status,
      count(distinct product_recommendation_decisions.plan_id) as plan_count,
      count(*) as recommendation_count,
      avg(product_recommendation_decisions.product_coverage_percent) as average_coverage_percent,
      max(product_recommendation_decisions.reason) filter (where product_recommendation_decisions.reason is not null) as rejection_reason,
      count(distinct product_countries.country_code) filter (where product_countries.country_code = 'TH') as country_count,
      count(distinct sellable.organisation_id) filter (where sellable.status = 'active') as active_retailer_count,
      count(distinct sellable.organisation_id) filter (where sellable.status <> 'active') as inactive_retailer_count,
      count(distinct stock.organisation_id) filter (
        where stock.status = 'active'
          and stock.stock_quantity > 0
      ) as stock_available_count,
      array_remove(array_agg(distinct need.value ->> 'displayName'), null) as signals
    from public.product_recommendation_decisions
    join public.assessments
      on assessments.plan_id = product_recommendation_decisions.plan_id
    join public.products
      on products.id = product_recommendation_decisions.product_id
    left join public.product_translations
      on product_translations.product_id = products.id
     and product_translations.locale = ${locale}
    left join public.product_countries
      on product_countries.product_id = products.id
    left join public.retail_sellable_products sellable
      on sellable.product_id = products.id
    left join public.retail_product_stock stock
      on stock.product_id = products.id
    left join lateral jsonb_array_elements(product_recommendation_decisions.covered_needs) as need(value) on true
    where product_recommendation_decisions.is_current = true
      and product_recommendation_decisions.outcome in ('near_miss', 'rejected')
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or product_recommendation_decisions.generated_at >= ${start})
    group by product_recommendation_decisions.product_id
    order by plan_count desc, recommendation_count desc, title asc
    limit ${range === "all" ? 80 : 60}
  `;

  return rows.map((row) => {
    const opportunityType = classifyProductOpportunity(row);

    return {
      action: productOpportunityAction(opportunityType),
      averageCoveragePercent: optionalNumber(row.average_coverage_percent),
      blockerReason: row.rejection_reason,
      opportunityLabel: productOpportunityLabel(opportunityType),
      opportunityType,
      planCount: numberValue(row.plan_count),
      productId: row.product_id,
      recommendationCount: numberValue(row.recommendation_count),
      retailerCount: numberValue(row.active_retailer_count),
      rationale: productOpportunityAction(opportunityType),
      supplementSignals: uniqueStrings(row.signals ?? [], 6),
      topDoseLabels: [],
      title: row.title
    } satisfies ProductOpportunityInsight;
  });
}

async function loadPlanCoverageComparisons(sql: InsightsDb, start: Date | null) {
  const rows = await sql<Array<{
    contact_email: string | null;
    current_coverage_percent: number | string | null;
    current_products: string[] | null;
    first_name: string | null;
    generated_at: Date | string | null;
    optimum_coverage_percent: number | string | null;
    optimum_products: unknown;
    plan_id: string;
    selected_plan: string | null;
    unmatched_supplements: string[] | null;
  }>>`
    with latest_runs as (
      select distinct on (product_recommendation_runs.plan_id)
        product_recommendation_runs.id,
        product_recommendation_runs.plan_id,
        product_recommendation_runs.generated_at,
        product_recommendation_runs.supplement_product_coverage_percent
      from public.product_recommendation_runs
      join public.assessments
        on assessments.plan_id = product_recommendation_runs.plan_id
      where product_recommendation_runs.status in ('completed', 'partial')
        and assessments.selected_plan is not null
        and (${start}::timestamptz is null or product_recommendation_runs.generated_at >= ${start})
      order by product_recommendation_runs.plan_id, product_recommendation_runs.generated_at desc
    ),
    chosen as (
      select
        product_recommendation_decisions.run_id,
        array_agg(product_recommendation_decisions.product_title order by product_recommendation_decisions.rank nulls last, product_recommendation_decisions.product_title) as current_products
      from public.product_recommendation_decisions
      join latest_runs on latest_runs.id = product_recommendation_decisions.run_id
      where product_recommendation_decisions.outcome = 'chosen'
      group by product_recommendation_decisions.run_id
    ),
    optimum as (
      select
        ranked.run_id,
        max(ranked.product_coverage_percent) as optimum_coverage_percent,
        jsonb_agg(
          jsonb_build_object(
            'title', ranked.product_title,
            'outcome', ranked.outcome,
            'coveragePercent', ranked.product_coverage_percent,
            'blockerReason', ranked.reason
          )
          order by ranked.product_coverage_percent desc nulls last, ranked.outcome asc, ranked.product_title asc
        ) filter (where ranked.rank_order <= 4) as optimum_products
      from (
        select
          product_recommendation_decisions.*,
          row_number() over (
            partition by product_recommendation_decisions.run_id
            order by product_recommendation_decisions.product_coverage_percent desc nulls last, product_recommendation_decisions.score desc nulls last
          ) as rank_order
        from public.product_recommendation_decisions
        join latest_runs on latest_runs.id = product_recommendation_decisions.run_id
      ) ranked
      group by ranked.run_id
    ),
    unmatched as (
      select
        supplement_recommendation_selections.plan_id,
        array_agg(distinct supplement_recommendation_selections.supplement_name_text order by supplement_recommendation_selections.supplement_name_text) as unmatched_supplements
      from public.supplement_recommendation_selections
      where supplement_recommendation_selections.is_current = true
        and (
          supplement_recommendation_selections.supplement_id is null
          or supplement_recommendation_selections.status in ('add', 'review')
          or supplement_recommendation_selections.safety_visibility = 'hidden'
        )
      group by supplement_recommendation_selections.plan_id
    )
    select
      assessments.plan_id::text,
      assessments.first_name,
      assessments.contact_email,
      assessments.selected_plan::text,
      latest_runs.generated_at,
      latest_runs.supplement_product_coverage_percent as current_coverage_percent,
      chosen.current_products,
      optimum.optimum_coverage_percent,
      optimum.optimum_products,
      unmatched.unmatched_supplements
    from latest_runs
    join public.assessments
      on assessments.plan_id = latest_runs.plan_id
    left join chosen
      on chosen.run_id = latest_runs.id
    left join optimum
      on optimum.run_id = latest_runs.id
    left join unmatched
      on unmatched.plan_id = assessments.plan_id
    order by latest_runs.supplement_product_coverage_percent asc, latest_runs.generated_at desc
    limit 80
  `;

  return rows.map((row) => {
    const currentCoverage = boundedPercent(numberValue(row.current_coverage_percent));
    const optimumCoverage = boundedPercent(numberValue(row.optimum_coverage_percent));
    const optimumProducts = Array.isArray(row.optimum_products)
      ? row.optimum_products.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }

          const record = item as Record<string, unknown>;
          const title = typeof record.title === "string" ? record.title : null;

          return title
            ? [{
                blockerReason:
                  typeof record.blockerReason === "string"
                    ? record.blockerReason
                    : null,
                coveragePercent: optionalNumber(
                  record.coveragePercent as number | string | null | undefined
                ),
                outcome: typeof record.outcome === "string" ? record.outcome : "candidate",
                title
              }]
            : [];
        })
      : [];

    return {
      contactEmail: row.contact_email,
      currentCoveragePercent: currentCoverage,
      currentProducts: row.current_products ?? [],
      firstName: row.first_name,
      lastGeneratedAt: isoOrNull(row.generated_at),
      optimumCoveragePercent: optimumCoverage,
      optimumDeltaPercent: Math.max(0, optimumCoverage - currentCoverage),
      optimumProducts,
      planId: row.plan_id,
      selectedPlan: row.selected_plan,
      unmatchedSupplements: row.unmatched_supplements ?? []
    } satisfies PlanCoverageComparison;
  });
}

async function loadExternalProductCandidates(
  sql: InsightsDb,
  availability: SchemaAvailability,
  supplementGaps: readonly MasterSupplementAvailabilityInsight[]
) {
  if (!availability.externalCandidateCache || supplementGaps.length < 1) {
    return [];
  }

  const candidates: ExternalProductCandidate[] = [];
  const gaps = supplementGaps
    .filter((gap) => gap.availabilityState !== "covered")
    .slice(0, 8);

  for (const gap of gaps) {
    const query = externalCandidateQuery(gap);
    const cached = await loadCachedExternalCandidate(sql, query);

    if (cached) {
      candidates.push(...externalCandidateRowsFromSnapshots(
        gap,
        query,
        cached.products,
        cached.diagnostics,
        "cached"
      ));
      continue;
    }

    try {
      const search = await Promise.race([
        searchMarketplaceProducts({
          limit: 6,
          query,
          region: "TH"
        }),
        new Promise<Awaited<ReturnType<typeof searchMarketplaceProducts>>>(
          (resolve) =>
            setTimeout(
              () => resolve({ diagnostics: [], products: [] }),
              5000
            )
        )
      ]);

      await writeExternalCandidateCache(sql, query, search.products, search.diagnostics);
      candidates.push(...externalCandidateRowsFromSnapshots(
        gap,
        query,
        search.products,
        search.diagnostics,
        search.products.length > 0 ? "generated" : "unavailable"
      ));
    } catch (error) {
      console.error("Unable to refresh external product candidate cache", error);
    }
  }

  return candidates.slice(0, 24);
}

function externalCandidateQuery(
  gap: Pick<MasterSupplementAvailabilityInsight, "supplementName" | "topDoseLabels">
) {
  return supplementAvailabilitySearchPhrase(gap);
}

function unavailableExternalCandidate(
  gap: MasterSupplementAvailabilityInsight,
  diagnostics: MarketplaceSearchDiagnostic[],
  status: ExternalProductCandidate["searchStatus"] = "unavailable"
): ExternalProductCandidate {
  return {
    affectedPlanCount: gap.affectedPlanCount,
    brandName: null,
    blockerSolved: gap.availabilityState,
    confidence: "unavailable",
    diagnostics,
    evidenceRequired: ["Marketplace adapter result", "FDA registration", "Ingredient facts"],
    externalProductId: null,
    imageUrl: null,
    matchedDoseLabel: primaryDoseLabel(gap.topDoseLabels),
    matchedGapId: gap.supplementId,
    matchedGapName: gap.supplementName,
    platform: null,
    priceAmount: null,
    productUrl: null,
    query: externalCandidateQuery(gap),
    rationale: gap.rationale,
    searchStatus: status,
    title: null
  };
}

function externalCandidateRowsFromSnapshots(
  gap: MasterSupplementAvailabilityInsight,
  query: string,
  products: readonly ProductSnapshot[],
  diagnostics: readonly MarketplaceSearchDiagnostic[],
  confidence: ExternalProductCandidate["confidence"]
): ExternalProductCandidate[] {
  if (products.length < 1) {
    return [];
  }

  return products
    .filter((product) => candidateSnapshotMatchesText(product.title, gap.supplementName))
    .slice(0, 4)
    .map((product) => ({
    affectedPlanCount: gap.affectedPlanCount,
    brandName: product.brandName ?? null,
    blockerSolved: gap.availabilityState,
    confidence,
    diagnostics: [...diagnostics],
    evidenceRequired: ["FDA registration", "Ingredient facts", "Image/source review"],
    externalProductId: product.externalProductId ?? null,
    imageUrl: product.imageUrl ?? null,
    matchedDoseLabel: primaryDoseLabel(gap.topDoseLabels),
    matchedGapId: gap.supplementId,
    matchedGapName: gap.supplementName,
    platform: product.platform,
    priceAmount: product.priceAmount ?? null,
    productUrl: product.productUrl,
    query,
    rationale: `${gap.action} This marketplace product matched the ${gap.supplementName} search and needs FDA, ingredient, and dose review before it can enter the master list.`,
    searchStatus: confidence === "cached" ? "cached" : "generated",
    title: product.title
  }));
}

async function loadCachedExternalCandidate(sql: InsightsDb, query: string) {
  const rows = await sql<Array<{
    diagnostics: unknown;
    products: unknown;
  }>>`
    select diagnostics, products
    from public.improvement_external_product_candidate_cache
    where query = ${query}
      and country_code = 'TH'
      and expires_at > now()
    order by generated_at desc
    limit 1
  `;
  const row = rows[0];

  return row
    ? {
        diagnostics: asMarketplaceDiagnostics(row.diagnostics),
        products: asProductSnapshots(row.products)
      }
    : null;
}

async function writeExternalCandidateCache(
  sql: InsightsDb,
  query: string,
  products: readonly ProductSnapshot[],
  diagnostics: readonly MarketplaceSearchDiagnostic[]
) {
  await sql`
    insert into public.improvement_external_product_candidate_cache (
      query,
      country_code,
      source,
      diagnostics,
      products,
      generated_at,
      expires_at
    )
    values (
      ${query},
      'TH',
      'marketplace_adapters',
      ${sql.json(diagnostics)}::jsonb,
      ${sql.json(products)}::jsonb,
      now(),
      now() + interval '1 day'
    )
    on conflict (query, country_code, source)
    do update set
      diagnostics = excluded.diagnostics,
      products = excluded.products,
      generated_at = excluded.generated_at,
      expires_at = excluded.expires_at,
      updated_at = now()
  `;
}

export async function getAdminFoodImprovementInsightsData(
  range: AdminDashboardRange,
  locale: Locale = "en"
): Promise<AdminFoodImprovementInsightsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminFoodImprovementInsightsData(range);
  }

  try {
    const availability = await recommendationInsightsSchemaAvailable(sql);

    if (
      !availability.assessments ||
      !availability.foodGuidance ||
      !availability.foodNutrientProfiles ||
      !availability.foods
    ) {
      return emptyAdminFoodImprovementInsightsData(range, true);
    }

    const start = rangeStartParam(range);
    const [foodOpportunities, unknownFoods] = await Promise.all([
      loadFoodOpportunities(sql, locale, start),
      availability.tasks ? loadUnknownFoods(sql, start) : Promise.resolve([])
    ]);

    return {
      databaseAvailable: true,
      foodOpportunities,
      generatedAt: new Date().toISOString(),
      range,
      summary: {
        blockedFoodRecommendations: foodOpportunities
          .filter((row) => row.listStatus !== "active")
          .reduce((sum, row) => sum + row.recommendationCount, 0),
        foodsRecommended: foodOpportunities.reduce(
          (sum, row) => sum + row.recommendationCount,
          0
        ),
        missingNutrientProfiles: foodOpportunities.filter(
          (row) => row.missingProfile
        ).length,
        unknownFoods: unknownFoods.length,
        uniqueFoods: foodOpportunities.length
      },
      unknownFoods
    };
  } catch (error) {
    console.error("Unable to load food improvement insights", error);
    return emptyAdminFoodImprovementInsightsData(range);
  }
}

async function loadFoodOpportunities(
  sql: InsightsDb,
  locale: Locale,
  start: Date | null
) {
  const rows = await sql<Array<{
    blocked_plan_count: number | string;
    food_id: string;
    food_name: string;
    gap_signals: string[] | null;
    has_profile: boolean | null;
    list_status: string | null;
    plan_count: number | string;
    recommendation_count: number | string;
  }>>`
    with direct_foods as (
      select
        food_guidance.plan_id,
        food_guidance.generated_at,
        item.value ->> 'foodId' as food_id,
        coalesce(
          item.value -> 'food' ->> ${locale},
          item.value -> 'food' ->> 'en',
          item.value ->> 'food',
          item.value ->> 'id'
        ) as food_name,
        array[]::text[] as gap_signals
      from public.food_guidance
      cross join lateral jsonb_array_elements(coalesce(food_guidance.guidance -> 'foodGuidance', '[]'::jsonb)) item(value)
      union all
      select
        food_guidance.plan_id,
        food_guidance.generated_at,
        item.value ->> 'foodId' as food_id,
        coalesce(
          item.value -> 'food' ->> ${locale},
          item.value -> 'food' ->> 'en',
          item.value ->> 'food',
          item.value ->> 'id'
        ) as food_name,
        array(
          select jsonb_array_elements_text(coalesce(item.value -> 'gapNeedIds', '[]'::jsonb))
        ) as gap_signals
      from public.food_guidance
      cross join lateral jsonb_array_elements(coalesce(food_guidance.guidance -> 'foodGapSupport' -> 'variants' -> 'balanced' -> 'items', '[]'::jsonb)) item(value)
      union all
      select
        food_guidance.plan_id,
        food_guidance.generated_at,
        item.value ->> 'foodId' as food_id,
        coalesce(
          item.value -> 'food' ->> ${locale},
          item.value -> 'food' ->> 'en',
          item.value ->> 'food',
          item.value ->> 'id'
        ) as food_name,
        array(
          select jsonb_array_elements_text(coalesce(item.value -> 'gapNeedIds', '[]'::jsonb))
        ) as gap_signals
      from public.food_guidance
      cross join lateral jsonb_array_elements(coalesce(food_guidance.guidance -> 'foodGapSupport' -> 'variants' -> 'compact' -> 'items', '[]'::jsonb)) item(value)
    )
    select
      coalesce(direct_foods.food_id, lower(regexp_replace(direct_foods.food_name, '[^[:alnum:]]+', '_', 'g'))) as food_id,
      coalesce(max(food_translations.name), max(foods.name), max(direct_foods.food_name), 'Unknown food') as food_name,
      max(foods.list_status) as list_status,
      count(distinct direct_foods.plan_id) as plan_count,
      count(*) as recommendation_count,
      count(distinct direct_foods.plan_id) filter (
        where foods.id is null
          or foods.is_active = false
          or coalesce(foods.list_status, 'review_required') <> 'whitelisted'
      ) as blocked_plan_count,
      bool_or(food_nutrient_profiles.food_id is not null) as has_profile,
      array_remove(array_agg(distinct unnest_gap.gap), null) as gap_signals
    from direct_foods
    join public.assessments
      on assessments.plan_id = direct_foods.plan_id
    left join public.foods
      on foods.normalized_name = direct_foods.food_id
      or foods.id::text = direct_foods.food_id
    left join public.food_translations
      on food_translations.food_id = foods.id
     and food_translations.locale = ${locale}
    left join public.food_nutrient_profiles
      on food_nutrient_profiles.food_id = foods.id
    left join lateral unnest(direct_foods.gap_signals) as unnest_gap(gap) on true
    where direct_foods.food_name is not null
      and assessments.selected_plan is not null
      and (${start}::timestamptz is null or direct_foods.generated_at >= ${start})
    group by 1
    order by plan_count desc, recommendation_count desc, food_name asc
    limit 80
  `;

  return rows.map((row) => ({
    blockedPlanCount: numberValue(row.blocked_plan_count),
    foodId: row.food_id,
    foodName: row.food_name,
    gapSignals: uniqueStrings(row.gap_signals ?? [], 8),
    listStatus: foodListStatus(row.list_status),
    missingProfile: row.has_profile !== true,
    planCount: numberValue(row.plan_count),
    recommendationCount: numberValue(row.recommendation_count)
  }));
}

function foodListStatus(value: string | null): ImprovementListStatus {
  if (value === "whitelisted") {
    return "active";
  }

  if (value === "blacklisted") {
    return "banned";
  }

  if (value === "inactive") {
    return "inactive";
  }

  if (value === "review_required") {
    return "review_required";
  }

  return "missing";
}

async function loadUnknownFoods(sql: InsightsDb, start: Date | null) {
  const rows = await sql<Array<{
    count: number | string;
    last_seen_at: Date | string | null;
    name: string | null;
    review_status: string | null;
  }>>`
    select
      coalesce(
        tasks.payload ->> 'foodName',
        tasks.payload ->> 'itemName',
        tasks.payload ->> 'name',
        tasks.payload -> 'food' ->> 'en',
        tasks.title
      ) as name,
      coalesce(tasks.status, 'open') as review_status,
      count(*) as count,
      max(tasks.created_at) as last_seen_at
    from public.tasks
    where tasks.task_type = 'classify_food'
      and (${start}::timestamptz is null or tasks.created_at >= ${start})
    group by 1, 2
    order by count desc, name asc
    limit 40
  `;

  return rows.flatMap((row) => {
    if (!row.name) {
      return [];
    }

    return [{
      count: numberValue(row.count),
      lastSeenAt: isoOrNull(row.last_seen_at),
      name: row.name,
      reviewStatus: row.review_status ?? "open"
    } satisfies UnknownFoodInsight];
  });
}

export function productOpportunitySearchPhrase(opportunity: ProductOpportunityInsight) {
  return externalCandidateQuery({
    supplementName: opportunity.supplementSignals[0] ?? opportunity.title,
    topDoseLabels: opportunity.topDoseLabels
  });
}

function candidateSnapshotMatchesText(title: unknown, gapName: string) {
  const normalizedTitle = normalizeSearchText(title);
  const gap = normalizeSearchText(gapName);

  return Boolean(normalizedTitle && gap && normalizedTitle.includes(gap));
}

export function candidateSnapshotMatchesGap(
  candidate: ExternalProductCandidate,
  gapName: string
) {
  return candidateSnapshotMatchesText(candidate.title, gapName);
}
