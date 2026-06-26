import {
  emptyAdminProductListData,
  emptyAdminProductsData,
  type AdminProductDetailData,
  type AdminProductListData,
  type AdminProductListQuery,
  type AdminProductListRow,
  type AdminProductMergeOption,
  type AdminProductsData,
  type AdminProductRow,
  type AdminProductTranslation
} from "./admin-product-types.ts";
import { detailRowFromDb, rowFromDb } from "./admin-product-mappers.ts";
import {
  arrayPayload,
  isUuidValue,
  isoOrNull,
  numberOrNull,
  productCountryCodesFromDb
} from "./admin-product-helpers.ts";
import { getSql } from "@/lib/db";
import type { ProductDbRow } from "./admin-product-types.ts";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import {
  normalizeCurrencyCode,
  normalizeProductCountryCode,
  type ProductCountryPricing
} from "@/lib/product-countries";
import {
  effectiveRegulatoryApprovalsForCountry,
  productRegulatoryApprovalsFromPayload
} from "@/lib/product-regulatory-approvals";

// Read model helpers and queries extracted as part of Sprint 2 refactor.

type LoadProductRowsOptions = Readonly<{
  brandId?: string | null;
}>;

export async function loadProductRows(
  productId?: string | null,
  options: LoadProductRowsOptions = {}
) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const brandId = isUuidValue(options.brandId) ? options.brandId : null;

  return sql<ProductDbRow[]>`
    select
      products.id::text,
      products.platform,
      products.region,
      products.title,
      products.brand_name,
      products.image_url,
      products.product_url,
      products.source_url,
      products.source_snapshot,
      products.description,
      products.category,
      coalesce(to_jsonb(products) ->> 'product_audience', 'both') as product_audience,
      coalesce(
        to_jsonb(products) ->> 'product_form',
        products.source_snapshot ->> 'productForm',
        products.source_snapshot ->> 'product_form'
      ) as product_form,
      products.product_kind,
      products.status,
	      products.label_status,
	      coalesce(product_country_rows.country_codes, array[upper(coalesce(nullif(products.region, ''), 'TH'))]) as available_country_codes,
	      coalesce(product_country_rows.country_pricing, '[]'::jsonb) as country_pricing,
	      coalesce(products.availability_status, 'unknown') as availability_status,
      products.currency,
      products.current_version,
      products.product_data_expires_at,
      products.validation_status,
      products.validation_summary,
      products.validation_reasons,
      products.validation_checked_at,
      products.updated_at,
      import_review.id::text as import_id,
      import_review.status as import_status,
      import_review.image_urls as import_image_urls,
      import_review.review_task_id::text as import_review_task_id,
      import_review.duplicate_product_ids::text[] as import_duplicate_product_ids,
	      product_brands.id::text as brand_id,
	      product_brands.status as brand_status,
	      coalesce(brand_country_rows.country_codes, array[upper(coalesce(nullif(product_brands.country_code, ''), 'TH'))]) as manufacturer_country_codes,
      coalesce(fact_rows.facts, '[]'::jsonb) as facts,
      coalesce(product_translation_rows.translations, '{}'::jsonb) as translations,
      coalesce(product_identifier_rows.identifiers, '[]'::jsonb) as identifiers,
      coalesce(product_identifier_candidate_rows.identifier_candidates, '[]'::jsonb) as identifier_candidates,
      coalesce(product_regulatory_rows.regulatory_approvals, '[]'::jsonb) as regulatory_approvals,
      coalesce(shop_availability_rows.shop_availability, '[]'::jsonb) as shop_availability,
      coalesce(history.chosen_count, 0) as history_chosen_count,
      history.last_recommended_at as history_last_recommended_at,
      history.average_product_coverage_percent,
      history.average_stack_coverage_percent
    from public.products
	    left join public.product_brands
	      on product_brands.id = products.brand_id
	    left join lateral (
	      select
	        array_agg(product_countries.country_code order by product_countries.country_code) as country_codes,
	        jsonb_agg(
	          jsonb_build_object(
	            'countryCode', product_countries.country_code,
		            'currency', product_countries.currency,
		            'priceUpdatedAt', coalesce(product_countries.price_updated_at, product_countries.updated_at),
		            'rrpPriceAmount', product_countries.rrp_price_amount
	          )
	          order by product_countries.country_code
	        ) as country_pricing
	      from public.product_countries
	      where product_countries.product_id = products.id
	    ) product_country_rows on true
	    left join lateral (
	      select array_agg(product_brand_countries.country_code order by product_brand_countries.country_code) as country_codes
	      from public.product_brand_countries
	      where product_brand_countries.brand_id = product_brands.id
	    ) brand_country_rows on true
    left join lateral (
      select
        product_imports.id,
        product_imports.status,
        product_imports.image_urls,
        product_imports.review_task_id,
        product_imports.duplicate_product_ids
      from public.product_imports
      where product_imports.product_id = products.id
        and product_imports.status = 'pending_review'
      order by product_imports.updated_at desc
      limit 1
    ) import_review on true
    left join lateral (
      select coalesce(
        jsonb_object_agg(
          product_translations.locale,
          jsonb_build_object(
            'locale', product_translations.locale,
            'title', product_translations.title,
            'description', product_translations.description,
            'status', product_translations.status,
            'updatedAt', product_translations.updated_at
          )
          order by product_translations.locale
        ),
        '{}'::jsonb
      ) as translations
      from public.product_translations
      where product_translations.product_id = products.id
    ) product_translation_rows on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_identifiers.id,
            'type', product_identifiers.identifier_type,
            'value', product_identifiers.identifier_value,
            'normalizedValue', product_identifiers.normalized_value,
            'source', product_identifiers.source,
            'confidence', product_identifiers.confidence,
            'evidenceUrl', product_identifiers.evidence_url,
            'status', product_identifiers.status,
            'updatedAt', product_identifiers.updated_at
          )
          order by product_identifiers.identifier_type, product_identifiers.source, product_identifiers.updated_at desc
        ),
        '[]'::jsonb
      ) as identifiers
      from public.product_identifiers
      where product_identifiers.product_id = products.id
        and product_identifiers.status = 'active'
    ) product_identifier_rows on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_identifier_candidates.id,
            'type', product_identifier_candidates.identifier_type,
            'value', product_identifier_candidates.identifier_value,
            'normalizedValue', product_identifier_candidates.normalized_value,
            'source', product_identifier_candidates.source,
            'confidence', product_identifier_candidates.confidence,
            'evidenceUrl', product_identifier_candidates.evidence_url,
            'status', product_identifier_candidates.status,
            'conflictProductIds', product_identifier_candidates.conflict_product_ids,
            'updatedAt', product_identifier_candidates.updated_at
          )
          order by product_identifier_candidates.status, product_identifier_candidates.updated_at desc
        ),
        '[]'::jsonb
      ) as identifier_candidates
      from public.product_identifier_candidates
      where product_identifier_candidates.product_id = products.id
        and product_identifier_candidates.status in ('pending', 'conflict', 'approved')
    ) product_identifier_candidate_rows on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_regulatory_approvals.id,
            'productId', product_regulatory_approvals.product_id,
            'scopeType', product_regulatory_approvals.scope_type,
            'scopeCode', product_regulatory_approvals.scope_code,
            'agencyCode', product_regulatory_approvals.agency_code,
            'agencyName', product_regulatory_approvals.agency_name,
            'approvalType', product_regulatory_approvals.approval_type,
            'approvalNumber', product_regulatory_approvals.approval_number,
            'status', product_regulatory_approvals.status,
            'source', product_regulatory_approvals.source,
            'evidenceUrl', product_regulatory_approvals.evidence_url,
            'metadata', product_regulatory_approvals.metadata,
            'createdAt', product_regulatory_approvals.created_at,
            'updatedAt', product_regulatory_approvals.updated_at
          )
          order by
            product_regulatory_approvals.scope_type,
            product_regulatory_approvals.scope_code,
            product_regulatory_approvals.agency_code,
            product_regulatory_approvals.updated_at desc
        ),
        '[]'::jsonb
      ) as regulatory_approvals
      from public.product_regulatory_approvals
      where product_regulatory_approvals.product_id = products.id
    ) product_regulatory_rows on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_facts.id,
            'itemType', product_facts.item_type,
            'supplementId', coalesce(product_facts.supplement_id, supplement_match_rows.supplement_id),
            'foodId', product_facts.food_id,
            'nutrientId', product_facts.nutrient_id,
            'name', product_facts.name,
            'normalizedName', product_facts.normalized_name,
            'aliases', coalesce(supplement_alias_rows.aliases, '[]'::jsonb),
            'amount', product_facts.amount,
            'unit', product_facts.unit,
            'servingLabel', product_facts.serving_label,
            'confidence', product_facts.confidence,
            'source', product_facts.source,
            'sourceUrl', product_facts.source_url,
            'sourceText', product_facts.source_text,
            'supplementAudience',
              case
                when coalesce(
                  to_jsonb(supplements) ->> 'audience',
                  supplements.source_payload ->> 'audience',
                  supplements.source_payload ->> 'productAudience'
                ) in ('both', 'female', 'male')
                  then coalesce(
                    to_jsonb(supplements) ->> 'audience',
                    supplements.source_payload ->> 'audience',
                    supplements.source_payload ->> 'productAudience'
                  )
                when lower(coalesce(supplements.primary_use_case, '')) ~ '(male vitality|male fertility|prostate|testosterone|dht)'
                  or lower(coalesce(supplements.name, '')) ~ '(saw palmetto|tongkat)'
                  then 'male'
                when lower(coalesce(supplements.category, '')) like '%gender%'
                  and (
                    lower(coalesce(supplements.primary_use_case, '')) ~ '(female|pms|cycle|estrogen|menopause)'
                    or lower(coalesce(supplements.name, '')) ~ '(vitex|chasteberry|evening primrose)'
                  )
                  then 'female'
                else 'both'
              end,
            'supplementStatus', supplements.list_status,
            'maxAmount', supplement_safety_limits.max_amount,
            'maxUnit', supplement_safety_limits.max_unit,
            'safetyFlags', coalesce(supplement_safety_limits.safety_flags, '{}'::text[])
          )
          order by product_facts.created_at asc
        ),
        '[]'::jsonb
      ) as facts
      from public.product_facts
      left join lateral (
        select matched_supplements.supplement_id
        from (
          select supplements.id as supplement_id, count(*) over () as match_count
          from public.supplements
          left join public.supplement_aliases
            on supplement_aliases.supplement_id = supplements.id
          where product_facts.supplement_id is null
            and product_facts.item_type = 'supplement'
            and product_facts.normalized_name is not null
            and product_facts.normalized_name <> ''
            and coalesce(supplements.list_status, 'active') <> 'ignored'
            and (
              supplements.normalized_name = product_facts.normalized_name
              or supplement_aliases.normalized_alias = product_facts.normalized_name
            )
          group by supplements.id
        ) matched_supplements
        where matched_supplements.match_count = 1
        limit 1
      ) supplement_match_rows on true
      left join public.supplements
        on supplements.id = coalesce(product_facts.supplement_id, supplement_match_rows.supplement_id)
      left join lateral (
        select jsonb_agg(supplement_aliases.normalized_alias order by supplement_aliases.normalized_alias) as aliases
        from public.supplement_aliases
        where supplement_aliases.supplement_id = coalesce(product_facts.supplement_id, supplement_match_rows.supplement_id)
      ) supplement_alias_rows on true
      left join lateral (
        select max_amount, max_unit, safety_flags
        from public.supplement_safety_limits
        where supplement_safety_limits.supplement_id = coalesce(product_facts.supplement_id, supplement_match_rows.supplement_id)
        order by version desc
        limit 1
      ) supplement_safety_limits on true
      where product_facts.product_id = products.id
    ) fact_rows on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'backorderPolicy', coalesce(retail_sellable_products.backorder_policy, 'allow'),
            'currency', coalesce(retail_sellable_products.currency, organisations.currency, products.currency),
            'leadTimeDays', retail_sellable_products.lead_time_days,
            'organisationId', organisations.id::text,
            'organisationName', organisations.name,
            'retailPriceAmount', retail_sellable_products.rrp_price_amount,
            'status', retail_sellable_products.status,
            'stockQuantity', coalesce(retail_stock.stock_quantity, 0),
            'wholesalePriceAmount', retail_sellable_products.wholesale_price_amount
          )
          order by organisations.name
        ),
        '[]'::jsonb
      ) as shop_availability
      from public.retail_sellable_products
      join public.organisations
        on organisations.id = retail_sellable_products.organisation_id
      left join lateral (
        select coalesce(sum(retail_product_stock.stock_quantity), 0)::int as stock_quantity
        from public.retail_product_stock
        where retail_product_stock.organisation_id = retail_sellable_products.organisation_id
          and retail_product_stock.product_id = retail_sellable_products.product_id
          and retail_product_stock.status <> 'deleted'
      ) retail_stock on true
      where retail_sellable_products.product_id = products.id
        and retail_sellable_products.status <> 'deleted'
    ) shop_availability_rows on true
    left join lateral (
      select
        count(*)::int as chosen_count,
        max(product_recommendation_items.created_at) as last_recommended_at,
        avg(product_recommendation_items.product_coverage_percent) as average_product_coverage_percent,
        avg(product_recommendation_runs.stack_coverage_percent) as average_stack_coverage_percent
      from public.product_recommendation_items
      join public.product_recommendation_runs
        on product_recommendation_runs.id = product_recommendation_items.run_id
      where product_recommendation_items.product_id = products.id
    ) history on true
    where (${productId ?? null}::uuid is null or products.id = ${productId ?? null}::uuid)
      and (${brandId}::uuid is null or products.brand_id = ${brandId}::uuid)
    order by products.updated_at desc, products.title asc
  `;
}


export function summaryFromRows(rows: AdminProductRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.status === "ignored") {
        summary.ignored += 1;
      } else if (row.status === "pending_review") {
        summary.pendingReview += 1;
      } else if (row.status === "approved") {
        summary.approved += 1;
      }

      if (row.facts.length < 1 || row.labelStatus !== "parsed") {
        summary.missingFacts += 1;
      }

      if (row.validationLabel === "Missing Image") {
        summary.missingImage += 1;
      }

      if (row.validationLabel === "Dirty Data") {
        summary.dirtyData += 1;
      }

      return summary;
    },
    {
      dirtyData: 0,
      ignored: 0,
      missingFacts: 0,
      missingImage: 0,
      pendingReview: 0,
      total: 0,
      approved: 0
    }
  );
}

type ProductListDbRow = Readonly<{
  available_country_codes: string[] | null;
  brand_name: string | null;
  country_pricing: unknown;
  description: string | null;
  display_description: string | null;
  display_title: string | null;
  facts: unknown;
  has_regulatory_approval: boolean;
  history_average_product_coverage_percent: string | number | null;
  history_chosen_count: string | number | null;
  id: string;
  image_url: string | null;
  import_review_task_id: string | null;
  label_status: AdminProductListRow["labelStatus"];
  platform: AdminProductListRow["platform"];
  product_audience: AdminProductListRow["productAudience"] | null;
  product_kind: AdminProductListRow["productKind"];
  product_url: string;
  regulatory_approvals: unknown;
  region: string;
  search_text: string;
  status: AdminProductListRow["status"];
  summary_total: string | number;
  summary_approved: string | number;
  summary_dirty_data: string | number;
  summary_ignored: string | number;
  summary_missing_facts: string | number;
  summary_missing_image: string | number;
  summary_pending_review: string | number;
  summary_regulatory_approved: string | number;
  title: string;
  total_rows: string | number;
  translations: unknown;
  updated_at: Date | string;
  validation_label: string;
}>;

type ProductListStatsDbRow = Readonly<{
  total_rows: string | number;
  summary_total: string | number;
  summary_approved: string | number;
  summary_dirty_data: string | number;
  summary_ignored: string | number;
  summary_missing_facts: string | number;
  summary_missing_image: string | number;
  summary_pending_review: string | number;
  summary_regulatory_approved: string | number;
}>;

function cleanListText(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function productListSearchTerms(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeProductListQuery(
  query: AdminProductListQuery
): Required<Pick<AdminProductListQuery, "limit" | "page">> & {
  brand: string;
  metric: string;
  search: string;
} {
  const page = Math.max(1, Math.floor(Number(query.page ?? 1)) || 1);
  const limit = Math.min(
    96,
    Math.max(12, Math.floor(Number(query.limit ?? 48)) || 48)
  );

  return {
    brand: cleanListText(query.brand, 300).toLowerCase(),
    limit,
    metric: cleanListText(query.metric, 80),
    page,
    search: cleanListText(query.search, 300)
  };
}

function listCountryPricingFromPayload(
  payload: unknown,
  regulatoryApprovals: AdminProductListRow["regulatoryApprovals"],
  fallbackCurrency = "THB"
): ProductCountryPricing[] {
  return arrayPayload(payload)
    .map((item): ProductCountryPricing | null => {
      const record = item && typeof item === "object"
        ? item as Record<string, unknown>
        : {};
      const countryCode = normalizeProductCountryCode(record.countryCode);

      return countryCode
        ? {
            countryCode,
            currency: normalizeCurrencyCode(record.currency, fallbackCurrency),
            effectiveRegulatoryApprovals: effectiveRegulatoryApprovalsForCountry(
              regulatoryApprovals,
              countryCode
            ),
            priceUpdatedAt: isoOrNull(record.priceUpdatedAt),
            rrpPriceAmount: numberOrNull(record.rrpPriceAmount)
          }
        : null;
    })
    .filter((item): item is ProductCountryPricing => Boolean(item));
}

function productListRowFromDb(row: ProductListDbRow): AdminProductListRow {
  const regulatoryApprovals = productRegulatoryApprovalsFromPayload(
    row.regulatory_approvals
  );

  return {
    availableCountryCodes: productCountryCodesFromDb(
      row.available_country_codes,
      [row.region]
    ),
    brandName: row.brand_name,
    countryPricing: listCountryPricingFromPayload(
      row.country_pricing,
      regulatoryApprovals
    ),
    description: row.description,
    displayDescription: row.display_description ?? row.description,
    displayTitle: row.display_title ?? row.title,
    facts: arrayPayload(row.facts)
      .map((item): AdminProductListRow["facts"][number] | null => {
        const record = item && typeof item === "object"
          ? item as Record<string, unknown>
          : {};
        const id = typeof record.id === "string" ? record.id : "";
        const name = typeof record.name === "string" ? record.name : "";

        return id && name
          ? {
              amount: numberOrNull(record.amount),
              id,
              name,
              unit: typeof record.unit === "string" ? record.unit : null
            }
          : null;
      })
      .filter((item): item is AdminProductListRow["facts"][number] => Boolean(item)),
    id: row.id,
    imageUrl: row.image_url,
    importReviewTaskId: row.import_review_task_id,
    labelStatus: row.label_status,
    platform: row.platform,
    productAudience: row.product_audience ?? "both",
    productKind: row.product_kind ?? "supplement",
    productUrl: row.product_url,
    recommendationHistory: {
      averageProductCoveragePercent: numberOrNull(
        row.history_average_product_coverage_percent
      ),
      chosenCount: Math.max(
        0,
        Math.round(numberOrNull(row.history_chosen_count) ?? 0)
      )
    },
    region: row.region,
    regulatoryApprovals,
    searchText: row.search_text,
    status: row.status,
    title: row.title,
    translations: mergeTranslationsFromDb(row.translations),
    validationLabel: row.validation_label
  };
}

type ProductListManufacturerRow = Readonly<{
  key: string;
  label: string;
  total: string | number;
}>;

export async function getAdminProductListData(
  query: AdminProductListQuery = {}
): Promise<AdminProductListData> {
  const sql = getSql();
  const normalized = normalizeProductListQuery(query);

  if (!sql) {
    return emptyAdminProductListData(normalized);
  }

  const searchTerms = productListSearchTerms(normalized.search);
  const hasSearch = searchTerms.length > 0;
  const offset = (normalized.page - 1) * normalized.limit;

  try {
    const rows = await sql<ProductListDbRow[]>`
      with product_list_base as (
        select
          products.id::text,
          products.title,
          products.brand_name,
          products.image_url,
          products.product_url,
          products.description,
          products.region,
          products.status,
          products.label_status,
          products.platform,
          coalesce(to_jsonb(products) ->> 'product_audience', 'both') as product_audience,
          products.product_kind,
          products.updated_at,
          import_review.review_task_id::text as import_review_task_id,
          coalesce(product_country_rows.country_codes, array[upper(coalesce(nullif(products.region, ''), 'TH'))]) as available_country_codes,
          coalesce(product_country_rows.country_pricing, '[]'::jsonb) as country_pricing,
          coalesce(fact_rows.facts, '[]'::jsonb) as facts,
          coalesce(product_translation_rows.translations, '{}'::jsonb) as translations,
          coalesce(product_regulatory_rows.regulatory_approvals, '[]'::jsonb) as regulatory_approvals,
          coalesce(history.chosen_count, 0) as history_chosen_count,
          history.average_product_coverage_percent as history_average_product_coverage_percent,
          coalesce(product_translation_rows.display_title, products.title) as display_title,
          coalesce(product_translation_rows.display_description, products.description) as display_description,
          product_regulatory_rows.has_regulatory_approval,
          case
            when products.image_url is null or btrim(products.image_url) = '' then 'Missing Image'
            when products.label_status <> 'parsed'
              or coalesce(products.validation_reasons, '{}'::text[]) && array['no_dosed_facts', 'no_canonical_match']::text[] then 'Missing Facts'
            when coalesce(products.validation_reasons, '{}'::text[]) && array['dirty_name', 'concentration_only', 'source_conflict']::text[] then 'Dirty Data'
            when products.validation_status = 'pass' then 'Approved'
            else 'Needs Review'
          end as validation_label,
          case
            when import_review.id is not null then 'pending_review'
            when products.status = 'approved' and coalesce(products.validation_status, 'failed') <> 'pass' then 'pending_review'
            when products.status = 'approved' then 'approved'
            when products.status = 'ignored' then 'ignored'
            else 'pending_review'
          end as business_state,
          coalesce(nullif(lower(trim(products.brand_name)), ''), '__unknown_manufacturer__') as manufacturer_key,
          coalesce(nullif(products.brand_name, ''), 'Unknown manufacturer') as manufacturer_label,
          lower(concat_ws(
            ' ',
            products.title,
            products.brand_name,
            products.category,
            products.status,
            products.label_status,
            products.product_kind,
            products.platform,
            products.region,
            coalesce(product_translation_rows.search_text, ''),
            coalesce(fact_rows.search_text, ''),
            coalesce(identifier_rows.search_text, ''),
            coalesce(product_regulatory_rows.search_text, '')
          )) as search_text
        from public.products
        left join lateral (
          select
            array_agg(product_countries.country_code order by product_countries.country_code) as country_codes,
            jsonb_agg(
              jsonb_build_object(
                'countryCode', product_countries.country_code,
                'currency', product_countries.currency,
                'priceUpdatedAt', coalesce(product_countries.price_updated_at, product_countries.updated_at),
                'rrpPriceAmount', product_countries.rrp_price_amount
              )
              order by product_countries.country_code
            ) as country_pricing
          from public.product_countries
          where product_countries.product_id = products.id
        ) product_country_rows on true
        left join lateral (
          select
            product_imports.id,
            product_imports.review_task_id
          from public.product_imports
          where product_imports.product_id = products.id
            and product_imports.status = 'pending_review'
          order by product_imports.updated_at desc
          limit 1
        ) import_review on true
        left join lateral (
          select
            coalesce(
              jsonb_object_agg(
                product_translations.locale,
                jsonb_build_object(
                  'locale', product_translations.locale,
                  'title', product_translations.title,
                  'description', product_translations.description,
                  'status', product_translations.status,
                  'updatedAt', product_translations.updated_at
                )
                order by product_translations.locale
              ),
              '{}'::jsonb
            ) as translations,
            max(product_translations.title) filter (where product_translations.locale = 'en') as display_title,
            max(product_translations.description) filter (where product_translations.locale = 'en') as display_description,
            string_agg(concat_ws(' ', product_translations.locale, product_translations.title, product_translations.description), ' ') as search_text
          from public.product_translations
          where product_translations.product_id = products.id
        ) product_translation_rows on true
        left join lateral (
          select
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', product_facts.id,
                  'name', product_facts.name,
                  'amount', product_facts.amount,
                  'unit', product_facts.unit
                )
                order by product_facts.created_at asc
              ) filter (where fact_rank <= 6),
              '[]'::jsonb
            ) as facts,
            string_agg(product_facts.name, ' ') as search_text
          from (
            select
              product_facts.*,
              row_number() over (partition by product_facts.product_id order by product_facts.created_at asc) as fact_rank
            from public.product_facts
            where product_facts.product_id = products.id
          ) product_facts
        ) fact_rows on true
        left join lateral (
          select string_agg(concat_ws(' ', product_identifiers.identifier_type, product_identifiers.identifier_value, product_identifiers.normalized_value), ' ') as search_text
          from public.product_identifiers
          where product_identifiers.product_id = products.id
            and product_identifiers.status = 'active'
        ) identifier_rows on true
        left join lateral (
          select
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', product_regulatory_approvals.id,
                  'productId', product_regulatory_approvals.product_id,
                  'scopeType', product_regulatory_approvals.scope_type,
                  'scopeCode', product_regulatory_approvals.scope_code,
                  'agencyCode', product_regulatory_approvals.agency_code,
                  'agencyName', product_regulatory_approvals.agency_name,
                  'approvalType', product_regulatory_approvals.approval_type,
                  'approvalNumber', product_regulatory_approvals.approval_number,
                  'status', product_regulatory_approvals.status,
                  'source', product_regulatory_approvals.source,
                  'evidenceUrl', product_regulatory_approvals.evidence_url,
                  'metadata', product_regulatory_approvals.metadata,
                  'createdAt', product_regulatory_approvals.created_at,
                  'updatedAt', product_regulatory_approvals.updated_at
                )
                order by product_regulatory_approvals.scope_type, product_regulatory_approvals.scope_code
              ),
              '[]'::jsonb
            ) as regulatory_approvals,
            bool_or(product_regulatory_approvals.status in ('verified', 'sourced')) as has_regulatory_approval,
            string_agg(concat_ws(' ', product_regulatory_approvals.agency_code, product_regulatory_approvals.agency_name, product_regulatory_approvals.approval_number), ' ') as search_text
          from public.product_regulatory_approvals
          where product_regulatory_approvals.product_id = products.id
        ) product_regulatory_rows on true
        left join lateral (
          select
            count(*)::int as chosen_count,
            avg(product_recommendation_items.product_coverage_percent) as average_product_coverage_percent
          from public.product_recommendation_items
          where product_recommendation_items.product_id = products.id
        ) history on true
      ),
      filtered_products as (
        select *
        from product_list_base
        where (
          not ${hasSearch}::boolean
          or not exists (
            select 1
            from unnest(${searchTerms}::text[]) as term(value)
            where position(term.value in product_list_base.search_text) = 0
          )
        )
          and (${normalized.brand} = '' or manufacturer_key = ${normalized.brand})
          and (
            ${normalized.metric} = ''
            or ${normalized.metric} = 'productsTotal'
            or (${normalized.metric} = 'productsApproved' and business_state = 'approved')
            or (${normalized.metric} = 'productsPendingReview' and business_state = 'pending_review')
            or (${normalized.metric} = 'productsIgnored' and business_state = 'ignored')
            or (${normalized.metric} = 'productsMissingFacts' and validation_label = 'Missing Facts')
            or (${normalized.metric} = 'productsMissingImages' and validation_label = 'Missing Image')
            or (${normalized.metric} = 'productsRegulatoryApproved' and has_regulatory_approval)
          )
      ),
      product_summary as (
        select
          count(*) as summary_total,
          count(*) filter (where business_state = 'approved') as summary_approved,
          count(*) filter (where business_state = 'pending_review') as summary_pending_review,
          count(*) filter (where business_state = 'ignored') as summary_ignored,
          count(*) filter (where validation_label = 'Missing Facts') as summary_missing_facts,
          count(*) filter (where validation_label = 'Missing Image') as summary_missing_image,
          count(*) filter (where validation_label = 'Dirty Data') as summary_dirty_data,
          count(*) filter (where has_regulatory_approval) as summary_regulatory_approved
        from product_list_base
      ),
      filtered_count as (
        select count(*) as total_rows
        from filtered_products
      )
      select
        filtered_products.*,
        filtered_count.total_rows,
        product_summary.summary_total,
        product_summary.summary_approved,
        product_summary.summary_pending_review,
        product_summary.summary_ignored,
        product_summary.summary_missing_facts,
        product_summary.summary_missing_image,
        product_summary.summary_dirty_data,
        product_summary.summary_regulatory_approved
      from filtered_products
      cross join filtered_count
      cross join product_summary
      order by updated_at desc, title asc
      limit ${normalized.limit}
      offset ${offset}
    `;
    const manufacturerRows = await sql<ProductListManufacturerRow[]>`
      select
        coalesce(nullif(lower(trim(products.brand_name)), ''), '__unknown_manufacturer__') as key,
        coalesce(nullif(products.brand_name, ''), 'Unknown manufacturer') as label,
        count(*) as total
      from public.products
      group by key, label
      order by total desc, label asc
      limit 200
    `;
    let stats: ProductListDbRow | ProductListStatsDbRow | undefined = rows[0];

    if (!stats) {
      const statsRows = await sql<ProductListStatsDbRow[]>`
        with product_list_stats_base as (
          select
            case
              when products.image_url is null or btrim(products.image_url) = '' then 'Missing Image'
              when products.label_status <> 'parsed'
                or coalesce(products.validation_reasons, '{}'::text[]) && array['no_dosed_facts', 'no_canonical_match']::text[] then 'Missing Facts'
              when coalesce(products.validation_reasons, '{}'::text[]) && array['dirty_name', 'concentration_only', 'source_conflict']::text[] then 'Dirty Data'
              when products.validation_status = 'pass' then 'Approved'
              else 'Needs Review'
            end as validation_label,
            case
              when import_review.id is not null then 'pending_review'
              when products.status = 'approved' and coalesce(products.validation_status, 'failed') <> 'pass' then 'pending_review'
              when products.status = 'approved' then 'approved'
              when products.status = 'ignored' then 'ignored'
              else 'pending_review'
            end as business_state,
            coalesce(nullif(lower(trim(products.brand_name)), ''), '__unknown_manufacturer__') as manufacturer_key,
            product_regulatory_rows.has_regulatory_approval,
            lower(concat_ws(
              ' ',
              products.title,
              products.brand_name,
              products.category,
              products.status,
              products.label_status,
              products.product_kind,
              products.platform,
              products.region,
              coalesce(product_translation_rows.search_text, ''),
              coalesce(fact_rows.search_text, ''),
              coalesce(identifier_rows.search_text, ''),
              coalesce(product_regulatory_rows.search_text, '')
            )) as search_text
          from public.products
          left join lateral (
            select product_imports.id
            from public.product_imports
            where product_imports.product_id = products.id
              and product_imports.status = 'pending_review'
            order by product_imports.updated_at desc
            limit 1
          ) import_review on true
          left join lateral (
            select string_agg(concat_ws(' ', product_translations.locale, product_translations.title, product_translations.description), ' ') as search_text
            from public.product_translations
            where product_translations.product_id = products.id
          ) product_translation_rows on true
          left join lateral (
            select string_agg(product_facts.name, ' ') as search_text
            from public.product_facts
            where product_facts.product_id = products.id
          ) fact_rows on true
          left join lateral (
            select string_agg(concat_ws(' ', product_identifiers.identifier_type, product_identifiers.identifier_value, product_identifiers.normalized_value), ' ') as search_text
            from public.product_identifiers
            where product_identifiers.product_id = products.id
              and product_identifiers.status = 'active'
          ) identifier_rows on true
          left join lateral (
            select
              bool_or(product_regulatory_approvals.status in ('verified', 'sourced')) as has_regulatory_approval,
              string_agg(concat_ws(' ', product_regulatory_approvals.agency_code, product_regulatory_approvals.agency_name, product_regulatory_approvals.approval_number), ' ') as search_text
            from public.product_regulatory_approvals
            where product_regulatory_approvals.product_id = products.id
          ) product_regulatory_rows on true
        ),
        filtered_products as (
          select *
          from product_list_stats_base
          where (
            not ${hasSearch}::boolean
            or not exists (
              select 1
              from unnest(${searchTerms}::text[]) as term(value)
              where position(term.value in product_list_stats_base.search_text) = 0
            )
          )
            and (${normalized.brand} = '' or manufacturer_key = ${normalized.brand})
            and (
              ${normalized.metric} = ''
              or ${normalized.metric} = 'productsTotal'
              or (${normalized.metric} = 'productsApproved' and business_state = 'approved')
              or (${normalized.metric} = 'productsPendingReview' and business_state = 'pending_review')
              or (${normalized.metric} = 'productsIgnored' and business_state = 'ignored')
              or (${normalized.metric} = 'productsMissingFacts' and validation_label = 'Missing Facts')
              or (${normalized.metric} = 'productsMissingImages' and validation_label = 'Missing Image')
              or (${normalized.metric} = 'productsRegulatoryApproved' and has_regulatory_approval)
            )
        ),
        product_summary as (
          select
            count(*) as summary_total,
            count(*) filter (where business_state = 'approved') as summary_approved,
            count(*) filter (where business_state = 'pending_review') as summary_pending_review,
            count(*) filter (where business_state = 'ignored') as summary_ignored,
            count(*) filter (where validation_label = 'Missing Facts') as summary_missing_facts,
            count(*) filter (where validation_label = 'Missing Image') as summary_missing_image,
            count(*) filter (where validation_label = 'Dirty Data') as summary_dirty_data,
            count(*) filter (where has_regulatory_approval) as summary_regulatory_approved
          from product_list_stats_base
        ),
        filtered_count as (
          select count(*) as total_rows
          from filtered_products
        )
        select
          filtered_count.total_rows,
          product_summary.summary_total,
          product_summary.summary_approved,
          product_summary.summary_pending_review,
          product_summary.summary_ignored,
          product_summary.summary_missing_facts,
          product_summary.summary_missing_image,
          product_summary.summary_dirty_data,
          product_summary.summary_regulatory_approved
        from filtered_count
        cross join product_summary
      `;

      stats = statsRows[0];
    }

    const totalRows = numberOrNull(stats?.total_rows) ?? 0;
    const pageSize = normalized.limit;

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      manufacturerOptions: manufacturerRows.map((row) => ({
        key: row.key,
        label: row.label,
        total: numberOrNull(row.total) ?? 0
      })),
      page: normalized.page,
      pageSize,
      query: {
        brand: normalized.brand,
        metric: normalized.metric,
        search: normalized.search
      },
      rows: rows.map(productListRowFromDb),
      summary: {
        approved: numberOrNull(stats?.summary_approved) ?? 0,
        dirtyData: numberOrNull(stats?.summary_dirty_data) ?? 0,
        ignored: numberOrNull(stats?.summary_ignored) ?? 0,
        missingFacts: numberOrNull(stats?.summary_missing_facts) ?? 0,
        missingImage: numberOrNull(stats?.summary_missing_image) ?? 0,
        pendingReview: numberOrNull(stats?.summary_pending_review) ?? 0,
        regulatoryApproved: numberOrNull(stats?.summary_regulatory_approved) ?? 0,
        total: numberOrNull(stats?.summary_total) ?? 0
      },
      totalPages: Math.ceil(totalRows / pageSize),
      totalRows
    };
  } catch (error) {
    console.error("Unable to load product list", error);
    return emptyAdminProductListData(normalized);
  }
}


export async function loadAdminProductRow(productId: string) {
  const rows = await loadProductRows(productId);
  return rows?.[0] ? rowFromDb(rows[0]) : null;
}

export async function loadAdminProductRowsForBrand(brandId: string) {
  if (!isUuidValue(brandId)) {
    return [];
  }

  const rows = await loadProductRows(null, { brandId });

  return rows ? rows.map((row) => rowFromDb(row)) : [];
}

type ProductMergeOptionDbRow = Readonly<{
  brand_name: string | null;
  description: string | null;
  id: string;
  title: string;
  translations: unknown;
}>;

function mergeTranslationsFromDb(rawTranslations: unknown) {
  const translations: Record<string, AdminProductTranslation> = {};
  const raw = rawTranslations && typeof rawTranslations === "object"
    ? rawTranslations as Record<string, unknown>
    : {};

  for (const [locale, value] of Object.entries(raw)) {
    const record = value && typeof value === "object"
      ? value as Record<string, unknown>
      : {};
    const status: AdminProductTranslation["status"] =
      record.status === "complete" || record.status === "missing"
        ? record.status
        : "draft";
    const title = typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : null;
    const description =
      typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : null;

    translations[locale] = {
      description,
      locale,
      status,
      title,
      updatedAt: typeof record.updatedAt === "string"
        ? record.updatedAt
        : null
    };
  }

  return translations;
}

function mergeOptionFromDb(
  row: ProductMergeOptionDbRow
): AdminProductMergeOption {
  return {
    brandName: row.brand_name,
    description: row.description,
    id: row.id,
    title: row.title,
    translations: mergeTranslationsFromDb(row.translations)
  };
}

async function loadAdminProductMergeOptions(input: Readonly<{
  duplicateProductIds: readonly string[];
  productId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuidValue(input.productId)) {
    return [];
  }

  const duplicateProductIds = [
    ...new Set(
      input.duplicateProductIds
        .filter(isUuidValue)
        .filter((id) => id !== input.productId)
    )
  ];

  const useDuplicateIds = duplicateProductIds.length > 0;
  const limit = useDuplicateIds ? duplicateProductIds.length : 80;
  const rows = await sql<ProductMergeOptionDbRow[]>`
    select
      products.id::text,
      products.title,
      products.brand_name,
      products.description,
      coalesce(product_translation_rows.translations, '{}'::jsonb) as translations
    from public.products
    left join lateral (
      select coalesce(
        jsonb_object_agg(
          product_translations.locale,
          jsonb_build_object(
            'locale', product_translations.locale,
            'title', product_translations.title,
            'description', product_translations.description,
            'status', product_translations.status,
            'updatedAt', product_translations.updated_at
          )
          order by product_translations.locale
        ),
        '{}'::jsonb
      ) as translations
      from public.product_translations
      where product_translations.product_id = products.id
    ) product_translation_rows on true
    where (
      ${useDuplicateIds}::boolean
      and products.id = any(${duplicateProductIds}::uuid[])
    ) or (
      not ${useDuplicateIds}::boolean
      and products.id <> ${input.productId}::uuid
    )
    order by
      case
        when ${useDuplicateIds}::boolean
          then array_position(${duplicateProductIds}::uuid[], products.id)
        else null
      end asc nulls last,
      products.updated_at desc,
      products.title asc
    limit ${limit}
  `;

  return rows.map(mergeOptionFromDb);
}

export async function getAdminProductDetailData(
  productId: string,
  _range: AdminDashboardRange = "all"
): Promise<AdminProductDetailData | null> {
  if (!isUuidValue(productId)) {
    return null;
  }

  try {
    const rows = await loadProductRows(productId);
    const sourceRow = rows?.[0];

    if (!sourceRow) {
      return null;
    }

    const row = detailRowFromDb(sourceRow);
    const mergeOptions = await loadAdminProductMergeOptions({
      duplicateProductIds: row.productImportDuplicateProductIds,
      productId: row.id
    });

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      mergeOptions,
      row
    };
  } catch (error) {
    console.error("Unable to load product detail", error);
    return null;
  }
}

export async function getAdminProductsData(
  _range: AdminDashboardRange = "all"
): Promise<AdminProductsData> {
  try {
    const rows = await loadProductRows();

    if (!rows) {
      return emptyAdminProductsData();
    }

    const mappedRows = rows.map((row) => rowFromDb(row));

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      platforms: [...new Set(mappedRows.map((row) => row.platform))].sort(),
      rows: mappedRows,
      summary: summaryFromRows(mappedRows)
    };
  } catch (error) {
    console.error("Unable to load products", error);
    return emptyAdminProductsData();
  }
}
