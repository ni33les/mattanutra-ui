import type postgres from "postgres";
import type {
  ProductRecommendationRefreshReason,
  ProductStackPreference
} from "@/lib/formulation-types";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";

export const PRODUCT_RECOMMENDATION_FRESHNESS_MS = 24 * 60 * 60 * 1000;

type ProductRecommendationFreshnessDb = postgres.Sql | postgres.TransactionSql;

export type ProductRecommendationFreshnessSnapshot = Readonly<{
  countryCode: string;
  formulationGeneratedAt: string | null;
  formulationVersion: number;
  generatedAt: string | null;
  productCatalogCount: number;
  productCatalogueUpdatedAt: string | null;
  reason: ProductRecommendationRefreshReason | null;
  reportVersion: number;
  retailCatalogueRevision: unknown;
  retailCatalogueUpdatedAt: string | null;
  runId: string | null;
  safetyReviewState: unknown;
  stackPreference: ProductStackPreference;
  status: string | null;
  stockOrAllocationUpdatedAt: string | null;
  supplementGovernanceUpdatedAt: string | null;
}>;

function payloadRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function dateMs(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isFinite(ms) ? ms : null;
}

function isAfterRun(value: string | Date | null | undefined, runMs: number) {
  const ms = dateMs(value);

  return ms !== null && ms > runMs;
}

export function productRecommendationRefreshReason(input: Readonly<{
  formulationGeneratedAt?: string | Date | null;
  generatedAt?: string | Date | null;
  now?: Date;
  productCatalogueUpdatedAt?: string | Date | null;
  retailCatalogueUpdatedAt?: string | Date | null;
  stockOrAllocationUpdatedAt?: string | Date | null;
  supplementGovernanceUpdatedAt?: string | Date | null;
}>): ProductRecommendationRefreshReason | null {
  const generatedMs = dateMs(input.generatedAt);

  if (generatedMs === null) {
    return "missing_run";
  }

  if (isAfterRun(input.formulationGeneratedAt, generatedMs)) {
    return "formulation_changed";
  }

  if (isAfterRun(input.productCatalogueUpdatedAt, generatedMs)) {
    return "product_catalogue_changed";
  }

  if (isAfterRun(input.supplementGovernanceUpdatedAt, generatedMs)) {
    return "supplement_governance_changed";
  }

  if (isAfterRun(input.retailCatalogueUpdatedAt, generatedMs)) {
    return "retail_catalogue_changed";
  }

  if (isAfterRun(input.stockOrAllocationUpdatedAt, generatedMs)) {
    return "stock_or_allocation_changed";
  }

  const nowMs = (input.now ?? new Date()).getTime();

  if (nowMs - generatedMs >= PRODUCT_RECOMMENDATION_FRESHNESS_MS) {
    return "ttl_expired";
  }

  return null;
}

function countryCodeFromAnswers(value: unknown) {
  const record = payloadRecord(value);

  return normalizeProductCountryCode(record.country) ?? defaultProductCountryCode;
}

export async function loadProductRecommendationFreshnessSnapshot(
  sql: ProductRecommendationFreshnessDb,
  input: Readonly<{
    algorithmVersion: string;
    planId: string;
    stackPreference: ProductStackPreference;
    now?: Date;
  }>
): Promise<ProductRecommendationFreshnessSnapshot | null> {
  const assessmentRows = await sql<Array<{ answers: unknown }>>`
    select answers
    from public.assessments
    where plan_id = ${input.planId}::uuid
    limit 1
  `;
  const assessment = assessmentRows[0];

  if (!assessment) {
    return null;
  }

  const countryCode = countryCodeFromAnswers(assessment.answers);
  const rows = await sql<Array<{
    formulation_generated_at: string | null;
    formulation_version: number | string | null;
    generated_at: string | null;
    product_catalog_count: number | string | null;
    product_catalogue_updated_at: string | null;
    report_version: number | string | null;
    retail_catalogue_revision: unknown;
    retail_catalogue_updated_at: string | null;
    run_id: string | null;
    safety_review_state: unknown;
    status: string | null;
    stock_or_allocation_updated_at: string | null;
    supplement_governance_updated_at: string | null;
  }>>`
    select
      latest_run.id::text as run_id,
      latest_run.status,
      latest_run.generated_at::text,
      coalesce(formulation_state.formulation_version, 0)::int as formulation_version,
      formulation_state.formulation_generated_at::text,
      coalesce(report_state.report_version, 0)::int as report_version,
      coalesce(product_state.product_catalog_count, 0)::int as product_catalog_count,
      product_state.product_catalogue_updated_at::text,
      coalesce(retail_state.retail_catalogue_revision, '{"sellableCount":0,"stockCount":0}'::jsonb) as retail_catalogue_revision,
      retail_state.retail_catalogue_updated_at::text,
      retail_state.stock_or_allocation_updated_at::text,
      coalesce(safety_state.safety_review_state, '[]'::jsonb) as safety_review_state,
      supplement_governance_state.updated_at::text as supplement_governance_updated_at
    from (select 1) seed
    left join lateral (
      select
        max(version) as formulation_version,
        max(generated_at) as formulation_generated_at
      from public.formulations
      where plan_id = ${input.planId}::uuid
        and (
          model_version is null
          or model_version not like '%:example'
        )
    ) formulation_state on true
    left join lateral (
      select max(version) as report_version
      from public.nutrition_reports
      where plan_id = ${input.planId}::uuid
    ) report_state on true
    left join lateral (
      select
        count(*)::int as product_catalog_count,
        max(greatest(
          products.updated_at,
          coalesce(country_updates.updated_at, products.updated_at)
        )) as product_catalogue_updated_at
      from public.products
      left join lateral (
        select max(product_countries.updated_at) as updated_at
        from public.product_countries
        where product_countries.product_id = products.id
          and product_countries.country_code = ${countryCode}
      ) country_updates on true
      where products.status = 'approved'
        and products.availability_status <> 'unavailable'
    ) product_state on true
    left join lateral (
      select
        jsonb_build_object(
          'allocationUpdatedAt', max(retail_order_allocations.updated_at),
          'sellableCount', count(distinct retail_sellable_products.id),
          'stockCount', count(distinct retail_product_stock.id),
          'updatedAt', max(greatest(
            retail_sellable_products.updated_at,
            coalesce(retail_product_stock.updated_at, retail_sellable_products.updated_at),
            coalesce(retail_order_allocations.updated_at, retail_sellable_products.updated_at),
            coalesce(product_countries.updated_at, retail_sellable_products.updated_at),
            organisations.updated_at,
            coalesce(platform_organisation.updated_at, organisations.updated_at)
          ))
        ) as retail_catalogue_revision,
        max(greatest(
          retail_sellable_products.updated_at,
          coalesce(product_countries.updated_at, retail_sellable_products.updated_at),
          organisations.updated_at,
          coalesce(platform_organisation.updated_at, organisations.updated_at)
        )) as retail_catalogue_updated_at,
        max(greatest(
          coalesce(retail_product_stock.updated_at, retail_sellable_products.updated_at),
          coalesce(retail_order_allocations.updated_at, retail_sellable_products.updated_at)
        )) as stock_or_allocation_updated_at
      from public.retail_sellable_products
      join public.organisations
        on organisations.id = retail_sellable_products.organisation_id
        and organisations.organisation_type = 'tenant'
        and organisations.status = 'active'
        and organisations.country_code = ${countryCode}
      left join public.retail_product_stock
        on retail_product_stock.organisation_id = retail_sellable_products.organisation_id
        and retail_product_stock.product_id = retail_sellable_products.product_id
        and retail_product_stock.status <> 'deleted'
      left join public.retail_order_allocations
        on retail_order_allocations.organisation_id = retail_sellable_products.organisation_id
        and retail_order_allocations.product_id = retail_sellable_products.product_id
        and retail_order_allocations.status in ('active', 'picked')
      left join public.product_countries
        on product_countries.product_id = retail_sellable_products.product_id
        and product_countries.country_code = ${countryCode}
      left join public.organisations platform_organisation
        on lower(platform_organisation.slug) = 'mattanutra'
        and platform_organisation.organisation_type = 'platform'
      where retail_sellable_products.status <> 'deleted'
    ) retail_state on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'closedAt', closed_at,
          'id', id,
          'reviewedAt', reviewed_at,
          'status', status,
          'updatedAt', updated_at
        )
        order by id
      ) as safety_review_state
      from public.safety_reviews
      where plan_id = ${input.planId}::uuid
        and status in ('accepted', 'closed', 'rejected')
    ) safety_state on true
    left join lateral (
      select max(supplements.updated_at) as updated_at
      from public.supplements
    ) supplement_governance_state on true
    left join lateral (
      select id, status, generated_at
      from public.product_recommendation_runs
      where plan_id = ${input.planId}::uuid
        and status in ('completed', 'partial')
        and coalesce(diagnostics ->> 'stackPreference', 'balanced') = ${input.stackPreference}
        and coalesce(diagnostics ->> 'algorithmVersion', '') = ${input.algorithmVersion}
      order by generated_at desc
      limit 1
    ) latest_run on true
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  const snapshot = {
    countryCode,
    formulationGeneratedAt: row.formulation_generated_at,
    formulationVersion: Number(row.formulation_version) || 0,
    generatedAt: row.generated_at,
    productCatalogCount: Number(row.product_catalog_count) || 0,
    productCatalogueUpdatedAt: row.product_catalogue_updated_at,
    reportVersion: Number(row.report_version) || 0,
    retailCatalogueRevision: row.retail_catalogue_revision,
    retailCatalogueUpdatedAt: row.retail_catalogue_updated_at,
    runId: row.run_id,
    safetyReviewState: row.safety_review_state,
    stackPreference: input.stackPreference,
    status: row.status,
    stockOrAllocationUpdatedAt: row.stock_or_allocation_updated_at,
    supplementGovernanceUpdatedAt: row.supplement_governance_updated_at
  } satisfies Omit<ProductRecommendationFreshnessSnapshot, "reason">;

  return {
    ...snapshot,
    reason: productRecommendationRefreshReason({
      formulationGeneratedAt: snapshot.formulationGeneratedAt,
      generatedAt: snapshot.generatedAt,
      now: input.now,
      productCatalogueUpdatedAt: snapshot.productCatalogueUpdatedAt,
      retailCatalogueUpdatedAt: snapshot.retailCatalogueUpdatedAt,
      stockOrAllocationUpdatedAt: snapshot.stockOrAllocationUpdatedAt,
      supplementGovernanceUpdatedAt: snapshot.supplementGovernanceUpdatedAt
    })
  };
}
