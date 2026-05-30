import {
  emptyAdminProductsData,
  type AdminProductsData,
  type AdminProductRow
} from "./admin-product-types.ts";
import { rowFromDb } from "./admin-product-mappers.ts";
import { isUuidValue } from "./admin-product-helpers.ts";
import { getSql } from "@/lib/db";
import type { ProductDbRow } from "./admin-product-types.ts";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import { getProductDecisionStatsByProduct } from "@/lib/admin-recommendation-insights";

// Read model helpers and queries extracted as part of Sprint 2 refactor.

export async function loadProductRows(productId?: string | null) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  return sql<ProductDbRow[]>`
    select
      products.id::text,
      products.platform,
      products.region,
      products.title,
      products.title_en,
      products.title_th,
      products.brand_name,
      products.image_url,
      products.product_url,
      products.source_url,
      products.source_snapshot,
      products.description,
      coalesce(to_jsonb(products) ->> 'description_en', products.source_snapshot ->> 'descriptionEn') as description_en,
      coalesce(to_jsonb(products) ->> 'description_th', products.source_snapshot ->> 'descriptionTh') as description_th,
      products.category,
      products.fda_approval_number,
      coalesce(to_jsonb(products) ->> 'product_audience', 'both') as product_audience,
      products.product_kind,
      products.status,
	      products.label_status,
	      coalesce(product_country_rows.country_codes, array[upper(coalesce(nullif(products.region, ''), 'TH'))]) as available_country_codes,
	      coalesce(active_offer.availability_status, 'unknown') as availability_status,
      case
        when active_offer.link_type = 'affiliate' then 'active'
        else 'none'
      end as affiliate_status,
      active_offer.price_amount,
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
      import_review.review_task_id::text as import_review_task_id,
      import_review.duplicate_product_ids::text[] as import_duplicate_product_ids,
	      product_brands.id::text as brand_id,
	      product_brands.status as brand_status,
	      coalesce(brand_country_rows.country_codes, array[upper(coalesce(nullif(product_brands.country_code, ''), 'TH'))]) as manufacturer_country_codes,
	      active_offer.id::text as active_offer_id,
      active_offer.availability_status as active_offer_availability_status,
      active_offer.currency as active_offer_currency,
      active_offer.link_type as active_affiliate_type,
      active_offer.price_amount as active_offer_price_amount,
      active_offer.url as active_affiliate_url,
      active_offer.commission_rate as active_affiliate_commission_rate,
      active_offer.admin_priority as active_affiliate_priority,
      coalesce(fact_rows.facts, '[]'::jsonb) as facts,
      coalesce(offer_rows.offers, '[]'::jsonb) as offers,
      coalesce(product_translation_rows.translations, '{}'::jsonb) as translations,
      coalesce(history.chosen_count, 0) as history_chosen_count,
      history.last_recommended_at as history_last_recommended_at,
      history.average_product_coverage_percent,
      history.average_stack_coverage_percent
    from public.products
	    left join public.product_brands
	      on product_brands.id = products.brand_id
	    left join lateral (
	      select array_agg(product_countries.country_code order by product_countries.country_code) as country_codes
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
        product_imports.review_task_id,
        product_imports.duplicate_product_ids
      from public.product_imports
      where product_imports.product_id = products.id
        and product_imports.status = 'pending_review'
      order by product_imports.updated_at desc
      limit 1
    ) import_review on true
    left join lateral (
      select
        id,
        url,
        link_type,
        commission_rate,
        admin_priority,
        price_amount,
        currency,
        availability_status
      from public.product_offers
      where product_offers.product_id = products.id
        and product_offers.status = 'active'
        and product_offers.availability_status not in ('out_of_stock', 'unavailable')
      order by
        case when product_offers.link_type = 'affiliate' then 0 else 1 end,
        product_offers.commission_rate desc nulls last,
        product_offers.admin_priority desc,
        product_offers.updated_at desc
      limit 1
    ) active_offer on true
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
            'id', product_facts.id,
            'itemType', product_facts.item_type,
            'supplementId', product_facts.supplement_id,
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
      left join public.supplements
        on supplements.id = product_facts.supplement_id
      left join lateral (
        select jsonb_agg(supplement_aliases.normalized_alias order by supplement_aliases.normalized_alias) as aliases
        from public.supplement_aliases
        where supplement_aliases.supplement_id = product_facts.supplement_id
      ) supplement_alias_rows on true
      left join lateral (
        select max_amount, max_unit, safety_flags
        from public.supplement_safety_limits
        where supplement_safety_limits.supplement_id = product_facts.supplement_id
        order by version desc
        limit 1
      ) supplement_safety_limits on true
      where product_facts.product_id = products.id
    ) fact_rows on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', product_offers.id,
            'availabilityStatus', product_offers.availability_status,
            'commissionRate', product_offers.commission_rate,
            'currency', product_offers.currency,
            'linkType', product_offers.link_type,
            'network', product_offers.network,
            'platform', product_offers.platform,
            'priceAmount', product_offers.price_amount,
            'priority', product_offers.admin_priority,
            'status', product_offers.status,
            'url', product_offers.url
          )
          order by
            case when product_offers.status = 'active' then 0 else 1 end,
            case when product_offers.link_type = 'affiliate' then 0 else 1 end,
            product_offers.commission_rate desc nulls last,
            product_offers.admin_priority desc,
            product_offers.updated_at desc
        ),
        '[]'::jsonb
      ) as offers
      from public.product_offers
      where product_offers.product_id = products.id
    ) offer_rows on true
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

      if (row.affiliateStatus === "active") {
        summary.activeAffiliate += 1;
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
      activeAffiliate: 0,
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


export async function loadAdminProductRow(productId: string) {
  const rows = await loadProductRows(productId);
  return rows?.[0] ? rowFromDb(rows[0]) : null;
}

export async function loadAdminProductRowsForBrand(brandId: string) {
  if (!isUuidValue(brandId)) {
    return [];
  }

  const rows = await loadProductRows();

  return rows
    ? rows.map((row) => rowFromDb(row)).filter((row) => row.brandId === brandId)
    : [];
}

export async function getAdminProductsData(
  range: AdminDashboardRange = "all"
): Promise<AdminProductsData> {
  try {
    const rows = await loadProductRows();

    if (!rows) {
      return emptyAdminProductsData();
    }

    const decisionStats = await getProductDecisionStatsByProduct(range);
    const mappedRows = rows.map((row) =>
      rowFromDb(row, decisionStats.get(row.id))
    );

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
