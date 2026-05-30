import { getSql } from "@/lib/db";
import { toJsonValue } from "@/lib/assessment-store";
import {
  normalizeProductFactKey,
  normalizeProductKey
} from "@/lib/product-recommendations";
import { validateProduct } from "@/lib/product-validation";
import { defaultProductCountryCode } from "@/lib/product-countries";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";
import {
  type FinishProductImportRunInput,
  type ProductImportFactInput,
  type ProductImportRunRow,
  type ProductTranslationInput,
  type RemoveProductOfferInput,
  type ResolveProductImportReviewInput,
  type StageProductImportInput,
  type StartProductImportRunInput,
  type UpsertProductOfferInput
} from "./admin-product-types.ts";
import {
  isoOrNull,
  numberOrNull,
  cleanNullableText,
  normalizedUrl,
  productAudienceFromSnapshot,
  preferredProductTitle,
  isUuidValue
} from "./admin-product-helpers.ts";
import {
  replaceBrandCountryCodes,
  reconcileProductsForBrandCountryCodes
} from "./admin-product-countries.ts";
import {
  normalizedFactsForStorage,
  supplementIdsForFacts
} from "./admin-product-facts.ts";
import { clearProductRecommendationCandidateCache } from "./admin-product-search.ts";

// Re-exports needed by the new module structure (temporary during stabilization)
export { defaultProductCountryCode } from "@/lib/product-countries";
export {
  isUuidValue,
  preferredProductTitle
} from "./admin-product-helpers.ts";
export {
  emptyAdminProductsData,
  isProductAudience,
  isProductAvailabilityStatus,
  isProductLabelStatus,
  isProductPlatform,
  isProductStatus
} from "./admin-product-types.ts";
export type {
  AdminProductFact,
  AdminProductOffer,
  AdminProductRow,
  AdminProductsData,
  AdminProductTranslation,
  AdminProductTranslationStatus,
  CreateAdminProductInput,
  FactDbPayload,
  FinishProductImportRunInput,
  ProductAffiliateStatus,
  ProductDbRow,
  ProductFactSupplementStatus,
  ProductImportFactInput,
  ProductImportRunRow,
  ProductLabelStatus,
  ProductTranslationInput,
  ProductValidationCacheStatus,
  RemoveProductOfferInput,
  ResolveProductImportReviewInput,
  StageProductImportInput,
  StartProductImportRunInput,
  UpdateAdminProductInput,
  UpsertProductOfferInput
} from "./admin-product-types.ts";
export { createAdminProduct, updateAdminProduct } from "./admin-product-writes.ts";
import {
  loadAdminProductRow,
  loadAdminProductRowsForBrand
} from "./admin-product-read-model.ts";

import { createAdminProduct } from "./admin-product-writes.ts"; // for internal calls in update/resolve etc. (re-export below makes it public via barrel)

export {
  revalidateProductsForSupplement,
  checkProductValidationConsistency,
  repairProductValidationConsistency,
  runProductValidationCheck,
  increaseProductFactSafetyLimit
} from "./admin-product-writes.ts";

export { loadProductRows, loadAdminProductRow, loadAdminProductRowsForBrand, getAdminProductsData } from "./admin-product-read-model.ts";
export {
  getProductRecommendationCandidates
} from "./admin-product-search.ts";
export { clearProductRecommendationCandidateCache };
export {
  normalizedFactsForStorage,
  supplementIdsForFacts
} from "./admin-product-facts.ts";

export async function startProductImportRun(input: StartProductImportRunInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const brandName = input.brandName.trim();

  if (!brandName) {
    throw new Error("Product import run requires a brand");
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_import_runs (
      brand_name,
      normalized_brand_name,
      source,
      requested_auto_approve,
      total_products,
      created_at,
      updated_at
    )
    values (
      ${brandName},
      ${normalizeProductKey(brandName)},
      ${cleanNullableText(input.source, 200) ?? "manufacturer_scrape"},
      ${Boolean(input.autoApprove)},
      ${Math.max(0, Math.round(input.totalProducts ?? 0))},
      now(),
      now()
    )
    returning id::text
  `;

  const id = rows[0]?.id;

  if (!id) {
    throw new Error("Product import run was not created");
  }

  return id;
}

export async function finishProductImportRun(input: FinishProductImportRunInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await sql`
    update public.product_import_runs
    set
      status = ${input.status},
      staged_count = ${Math.max(0, Math.round(input.stagedCount ?? 0))},
      approved_count = ${Math.max(0, Math.round(input.approvedCount ?? 0))},
      failed_count = ${Math.max(0, Math.round(input.failedCount ?? 0))},
      notes = ${cleanNullableText(input.notes, 2000)},
      completed_at = now(),
      updated_at = now()
    where id = ${input.importRunId}::uuid
  `;
}

export async function getProductImportRuns(input: Readonly<{
  limit?: number;
}> = {}) {
  const sql = getSql();

  if (!sql) {
    return [];
  }

  const limit = Math.min(100, Math.max(1, Math.round(input.limit ?? 50)));
  const rows = await sql<Array<{
    approved_count: string | number;
    brand_name: string;
    completed_at: Date | string | null;
    failed_count: string | number;
    id: string;
    notes: string | null;
    requested_auto_approve: boolean;
    source: string;
    staged_count: string | number;
    started_at: Date | string;
    status: ProductImportRunRow["status"];
    total_products: string | number;
  }>>`
    select
      id::text,
      brand_name,
      source,
      status,
      requested_auto_approve,
      total_products,
      staged_count,
      approved_count,
      failed_count,
      notes,
      started_at,
      completed_at
    from public.product_import_runs
    order by started_at desc
    limit ${limit}
  `;

  return rows.map((row): ProductImportRunRow => ({
    approvedCount: Math.max(0, Math.round(numberOrNull(row.approved_count) ?? 0)),
    brandName: row.brand_name,
    completedAt: isoOrNull(row.completed_at),
    failedCount: Math.max(0, Math.round(numberOrNull(row.failed_count) ?? 0)),
    id: row.id,
    notes: row.notes,
    requestedAutoApprove: row.requested_auto_approve,
    source: row.source,
    stagedCount: Math.max(0, Math.round(numberOrNull(row.staged_count) ?? 0)),
    startedAt: new Date(row.started_at).toISOString(),
    status: row.status,
    totalProducts: Math.max(0, Math.round(numberOrNull(row.total_products) ?? 0))
  }));
}

function normalizedProductTranslations(
  translations: Record<string, ProductTranslationInput> | undefined,
  legacy: Readonly<{
    descriptionEn?: string | null;
    descriptionTh?: string | null;
    descriptionZhCn?: string | null;
    titleEn?: string | null;
    titleTh?: string | null;
    titleZhCn?: string | null;
  }>
) {
  const next = new Map<string, ProductTranslationInput>();

  for (const [locale, translation] of Object.entries(translations ?? {})) {
    const title = cleanNullableText(translation.title, 500);
    const description = cleanNullableText(translation.description, 4000);
    const status = translation.status === "complete" || translation.status === "missing"
      ? translation.status
      : title || description
        ? "draft"
        : "missing";

    next.set(locale, { description, status, title });
  }

  const legacyRows = [
    ["en", legacy.titleEn, legacy.descriptionEn],
    ["th", legacy.titleTh, legacy.descriptionTh],
    ["zh-CN", legacy.titleZhCn, legacy.descriptionZhCn]
  ] as const;

  for (const [locale, title, description] of legacyRows) {
    if (next.has(locale)) {
      continue;
    }

    const cleanTitle = cleanNullableText(title, 500);
    const cleanDescription = cleanNullableText(description, 4000);

    if (cleanTitle || cleanDescription) {
      next.set(locale, {
        description: cleanDescription,
        status: cleanTitle && cleanDescription ? "complete" : "draft",
        title: cleanTitle
      });
    }
  }

  return next;
}

async function upsertProductImportTranslations(
  sql: NonNullable<ReturnType<typeof getSql>>,
  importId: string,
  translations: Record<string, ProductTranslationInput> | undefined,
  legacy: Readonly<{
    descriptionEn?: string | null;
    descriptionTh?: string | null;
    descriptionZhCn?: string | null;
    titleEn?: string | null;
    titleTh?: string | null;
    titleZhCn?: string | null;
  }>,
  source: string
) {
  const rows = [...normalizedProductTranslations(translations, legacy)]
    .map(([locale, translation]) => ({
      description: cleanNullableText(translation.description, 4000),
      locale,
      status: translation.status ?? "draft",
      title: cleanNullableText(translation.title, 500)
    }))
    .filter((row) => row.title || row.description);

  if (!rows.length) {
    return;
  }

  await sql`
    insert into public.product_import_translations (
      import_id,
      locale,
      title,
      description,
      status,
      source,
      metadata
    )
    select
      ${importId}::uuid,
      translation.locale,
      translation.title,
      translation.description,
      translation.status,
      ${source},
      '{}'::jsonb
    from jsonb_to_recordset(${sql.json(toJsonValue(rows))}::jsonb) as translation(
      locale text,
      title text,
      description text,
      status text
    )
    on conflict (import_id, locale) do update set
      title = coalesce(excluded.title, public.product_import_translations.title),
      description = coalesce(excluded.description, public.product_import_translations.description),
      status = excluded.status,
      source = excluded.source,
      updated_at = now()
  `;
}

export async function replaceProductFacts(
  sql: NonNullable<ReturnType<typeof getSql>>,
  input: Readonly<{
    actor?: string | null;
    changeReason?: string | null;
    deleteSources?: readonly string[];
    facts: readonly ProductImportFactInput[];
    productId: string;
    source: string;
    supplementMatchesByFactName: ReadonlyMap<string, { id: string; name: string }>;
  }>
) {
  const explicitSupplementIds = [...new Set(input.facts.flatMap((fact) =>
    isUuidValue(fact.supplementId) ? [fact.supplementId] : []
  ))];
  let existingSupplementIds = new Set<string>();

  if (explicitSupplementIds.length > 0) {
    const existingSupplementRows = await sql<Array<{ id: string }>>`
        select id::text
        from public.supplements
        where id = any(${explicitSupplementIds}::uuid[])
      `;
    existingSupplementIds = new Set(existingSupplementRows.map((row) => row.id));
  }
  const facts = input.facts
    .map((fact) => {
      const factName = fact.name.trim();

      if (!factName) {
        return null;
      }
      const supplementMatch =
        input.supplementMatchesByFactName.get(normalizeProductFactKey(factName));
      const canonicalName = supplementMatch?.name ?? factName;
      const explicitSupplementId =
        isUuidValue(fact.supplementId) && existingSupplementIds.has(fact.supplementId)
          ? fact.supplementId
          : null;
      const supplementId = explicitSupplementId ?? supplementMatch?.id ?? null;

      if (!supplementId) {
        return null;
      }

      return {
        amount: numberOrNull(fact.amount),
        confidence: fact.confidence ?? "moderate",
        item_type: fact.itemType ?? "supplement",
        name: canonicalName,
        normalized_name: normalizeProductFactKey(canonicalName),
        serving_label: cleanNullableText(fact.servingLabel, 200),
        source: input.source,
        source_text: cleanNullableText(fact.sourceText, 1000),
        source_url: cleanNullableText(fact.sourceUrl, 2000),
        supplement_id: supplementId,
        unit: cleanNullableText(fact.unit, 40)
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  const sourceFilter = input.deleteSources
    ? input.deleteSources.length > 0
      ? sql`and source = any(${input.deleteSources}::text[])`
      : sql``
    : sql`and false`;
  await sql`
    with deleted as (
      delete from public.product_facts
      where product_id = ${input.productId}::uuid
        ${sourceFilter}
    ),
    input_facts as (
      select *
      from jsonb_to_recordset(${sql.json(toJsonValue(facts))}::jsonb) as fact(
        amount numeric,
        confidence text,
        item_type text,
        name text,
        normalized_name text,
        serving_label text,
        source text,
        source_text text,
        source_url text,
        supplement_id uuid,
        unit text
      )
    )
    insert into public.product_facts (
      product_id,
      item_type,
      supplement_id,
      name,
      normalized_name,
      amount,
      unit,
      serving_label,
      confidence,
      source,
      source_url,
      source_text,
      created_at,
      updated_at
    )
    select
      ${input.productId}::uuid,
      input_facts.item_type,
      input_facts.supplement_id,
      input_facts.name,
      input_facts.normalized_name,
      input_facts.amount,
      input_facts.unit,
      input_facts.serving_label,
      input_facts.confidence,
      input_facts.source,
      input_facts.source_url,
      input_facts.source_text,
      now(),
      now()
    from input_facts
  `;
}

export async function recordProductVersion(
  sql: NonNullable<ReturnType<typeof getSql>>,
  input: Readonly<{
    actor?: string | null;
    changeNote: string;
    productId: string;
  }>
) {
  const rows = await sql<Array<{ version: number }>>`
    with next_product as (
      update public.products
      set
        current_version = coalesce(current_version, 0) + 1,
        updated_at = now()
      where id = ${input.productId}::uuid
      returning *
    ),
    inserted_version as (
      insert into public.product_versions (
        product_id,
        version,
        actor,
        change_note,
        reason,
        source,
        title,
        title_en,
        title_th,
        brand_name,
        normalized_brand_name,
        image_url,
        product_url,
        normalized_url,
        description,
        description_en,
        description_th,
        fda_approval_number,
        product_kind,
        product_audience,
        status,
        label_status,
        availability_status,
        affiliate_status,
        price_amount,
        currency,
        validation_status,
        validation_reasons,
        validation_summary,
        validation_checked_at,
        facts_snapshot,
        source_snapshot,
        snapshot,
        metadata,
        created_at
      )
      select
        next_product.id,
        next_product.current_version,
        ${input.actor ?? "admin_dashboard"},
        ${input.changeNote},
        ${input.changeNote},
        'admin_products',
        next_product.title,
        next_product.title_en,
        next_product.title_th,
        next_product.brand_name,
        next_product.normalized_brand_name,
        next_product.image_url,
        next_product.product_url,
        next_product.normalized_url,
        next_product.description,
        next_product.description_en,
        next_product.description_th,
        next_product.fda_approval_number,
        next_product.product_kind,
        coalesce(to_jsonb(next_product) ->> 'product_audience', 'both'),
        next_product.status,
        next_product.label_status,
        next_product.availability_status,
        next_product.affiliate_status,
        next_product.price_amount,
        next_product.currency,
        next_product.validation_status,
        next_product.validation_reasons,
        next_product.validation_summary,
        next_product.validation_checked_at,
        coalesce(fact_rows.facts, '[]'::jsonb),
        next_product.source_snapshot,
        jsonb_build_object(
          'product', to_jsonb(next_product),
          'facts', coalesce(fact_rows.facts, '[]'::jsonb)
        ),
        '{}'::jsonb,
        now()
      from next_product
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
              'amount', product_facts.amount,
              'unit', product_facts.unit,
              'servingLabel', product_facts.serving_label,
              'confidence', product_facts.confidence,
              'source', product_facts.source,
              'sourceUrl', product_facts.source_url,
              'sourceText', product_facts.source_text
            )
            order by product_facts.created_at asc
          ),
          '[]'::jsonb
        ) as facts
        from public.product_facts
        where product_facts.product_id = next_product.id
      ) fact_rows on true
      returning version
    )
    select version
    from inserted_version
  `;
  const version = rows[0]?.version;

  if (!version) {
    throw new Error("Product version was not recorded");
  }

  return version;
}

export async function validateProductImportForApproval(input: Readonly<{
  facts: readonly ProductImportFactInput[];
  imageUrl?: string | null;
  labelStatus?: string | null;
  productUrl?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  titleEn?: string | null;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const facts = normalizedFactsForStorage(input.facts);
  const supplementMatchesByFactName = await supplementIdsForFacts(sql, facts);
  const supplementIds = [...new Set(facts.flatMap((fact) => {
    const explicitSupplementId = isUuidValue(fact.supplementId)
      ? fact.supplementId
      : null;
    const matchedSupplementId =
      supplementMatchesByFactName.get(normalizeProductFactKey(fact.name))?.id ??
      null;

    return explicitSupplementId ?? matchedSupplementId
      ? [explicitSupplementId ?? matchedSupplementId!]
      : [];
  }))];
  const supplementRows = supplementIds.length > 0
    ? await sql<Array<{
      id: string;
      list_status: string | null;
      max_amount: string | number | null;
      max_unit: string | null;
    }>>`
      select
        supplements.id::text,
        supplements.list_status,
        supplement_safety_limits.max_amount,
        supplement_safety_limits.max_unit
      from public.supplements
      left join lateral (
        select max_amount, max_unit
        from public.supplement_safety_limits
        where supplement_safety_limits.supplement_id = supplements.id
        order by version desc
        limit 1
      ) supplement_safety_limits on true
      where supplements.id = any(${supplementIds}::uuid[])
    `
    : [];
  const supplementsById = new Map(supplementRows.map((row) => [row.id, row]));
  const validationFacts = facts.map((fact) => {
    const supplementMatch =
      supplementMatchesByFactName.get(normalizeProductFactKey(fact.name));
    const explicitSupplementId = isUuidValue(fact.supplementId)
      ? fact.supplementId
      : null;
    const supplementId = explicitSupplementId ?? supplementMatch?.id ?? null;
    const supplementRow = supplementId ? supplementsById.get(supplementId) : null;

    return {
      amount: fact.amount,
      confidence: fact.confidence,
      itemType: fact.itemType,
      maxAmount: supplementRow?.max_amount ?? null,
      maxUnit: supplementRow?.max_unit ?? null,
      name: supplementMatch?.name ?? fact.name,
      sourceText: fact.sourceText,
      supplementId,
      supplementStatus: supplementRow?.list_status ?? null,
      unit: fact.unit
    };
  });

  return validateProduct({
    facts: validationFacts,
    imageUrl: input.imageUrl,
    labelStatus: input.labelStatus,
    productUrl: input.productUrl,
    sourceUrl: input.sourceUrl,
    title: input.titleEn ?? input.title
  });
}

export async function deletePendingManufacturerImportProduct(productId: string) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!isUuidValue(productId)) {
    return false;
  }

  const rows = await sql<Array<{ id: string }>>`
    update public.products
    set
      status = 'ignored',
      availability_status = 'unavailable',
      admin_notes = concat_ws(
        E'\n',
        nullif(admin_notes, ''),
        'Ignored instead of deleting pending manufacturer import.'
      ),
      updated_at = now()
    where id = ${productId}::uuid
      and status = 'pending_review'
      and source = 'manufacturer_import'
    returning id::text
  `;

  if (rows[0]) {
    clearProductRecommendationCandidateCache();
  }

  return Boolean(rows[0]);
}

export async function stageProductImport(input: StageProductImportInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const brandName = input.brandName.trim();
  const rawProductTitle = input.productTitle.trim();
  const sourceUrl = input.sourceUrl.trim();
  const titleEn = cleanNullableText(input.titleEn, 500);
  const titleTh = cleanNullableText(input.titleTh, 500);
  const titleZhCn = cleanNullableText(input.titleZhCn, 500);
  const productTitle = preferredProductTitle({
    title: rawProductTitle,
    titleEn
  });
  const descriptionEn = cleanNullableText(input.descriptionEn, 4000);
  const descriptionTh = cleanNullableText(input.descriptionTh, 4000);
  const descriptionZhCn = cleanNullableText(input.descriptionZhCn, 4000);
  const description = cleanNullableText(
    input.description ?? descriptionEn ?? descriptionTh ?? descriptionZhCn,
    4000
  );
  const normalizedBrandName = normalizeProductKey(brandName);
  const normalizedProductTitle = normalizeProductKey(productTitle);
  const parsedFacts = normalizedFactsForStorage(input.parsedFacts);
  const imageUrls = [...new Set((input.imageUrls ?? [])
    .map((url) => url.trim())
    .filter(Boolean))].slice(0, 12);

  if (!brandName || !productTitle || !sourceUrl) {
    throw new Error("Product import requires brand, product title, and source URL");
  }

  const duplicateRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.products
    where normalized_url = ${normalizedUrl(sourceUrl)}
      or (
        normalized_title = ${normalizedProductTitle}
        and coalesce(normalized_brand_name, '') = ${normalizedBrandName}
      )
    order by updated_at desc
    limit 8
  `;
  const duplicateProductIds = [
    ...new Set([
      ...duplicateRows.map((row) => row.id),
      ...(input.duplicateProductIds ?? []).filter(isUuidValue)
    ])
  ];
  const importRows = await sql<Array<{ id: string }>>`
    insert into public.product_imports (
      import_run_id,
      brand_name,
      normalized_brand_name,
      product_title,
      normalized_product_title,
      source_url,
      source,
      image_urls,
      fda_approval_number,
      parsed_facts,
      raw_snapshot,
      duplicate_product_ids,
      parse_confidence,
      status,
      created_at,
      updated_at
    )
    values (
      ${isUuidValue(input.importRunId) ? input.importRunId : null}::uuid,
      ${brandName},
      ${normalizedBrandName},
      ${productTitle},
      ${normalizedProductTitle},
      ${sourceUrl},
      ${cleanNullableText(input.source, 200) ?? "manufacturer_scrape"},
      ${imageUrls}::text[],
      ${cleanNullableText(input.fdaApprovalNumber, 100)},
      ${sql.json(toJsonValue(parsedFacts))}::jsonb,
      ${sql.json(toJsonValue({
        ...(input.rawSnapshot ?? {}),
        ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
        ...(titleEn ? { titleEn } : {}),
        ...(titleTh ? { titleTh } : {}),
        ...(titleZhCn ? { titleZhCn } : {}),
        ...(description ? { description } : {}),
        ...(descriptionEn ? { descriptionEn } : {}),
        ...(descriptionTh ? { descriptionTh } : {}),
        ...(descriptionZhCn ? { descriptionZhCn } : {})
      }))}::jsonb,
      ${duplicateProductIds}::uuid[],
      ${input.parseConfidence ?? "moderate"},
      'pending_review',
      now(),
      now()
    )
    on conflict (normalized_brand_name, normalized_product_title, source_url)
    do update set
      import_run_id = coalesce(excluded.import_run_id, public.product_imports.import_run_id),
      image_urls = excluded.image_urls,
      fda_approval_number = coalesce(excluded.fda_approval_number, public.product_imports.fda_approval_number),
      parsed_facts = excluded.parsed_facts,
      raw_snapshot = public.product_imports.raw_snapshot || excluded.raw_snapshot,
      duplicate_product_ids = excluded.duplicate_product_ids,
      parse_confidence = excluded.parse_confidence,
      status = case
        when public.product_imports.status in ('approved', 'ignored', 'duplicate')
          then public.product_imports.status
        else 'pending_review'
      end,
      updated_at = now()
    returning id::text
  `;
  const importId = importRows[0]?.id;

  if (!importId) {
    throw new Error("Product import was not staged");
  }

  let draftProductId = duplicateProductIds[0] ?? null;

  if (!draftProductId) {
    const draftProduct = await createAdminProduct({
      actor: input.actor ?? "manufacturer_scraper",
      availabilityStatus: "unknown",
      availableCountryCodes: [defaultProductCountryCode],
      brandStatus: "pending_review",
      brandName,
      description,
      descriptionEn,
      descriptionTh,
      descriptionZhCn,
      facts: parsedFacts,
      fdaApprovalNumber: cleanNullableText(input.fdaApprovalNumber, 100),
      imageUrl: imageUrls[0] ?? null,
      labelStatus: parsedFacts.length > 0 ? "parsed" : "missing",
      manufacturerCountryCodes: [defaultProductCountryCode],
      status: "pending_review",
      platform: "manual",
      productAudience: productAudienceFromSnapshot(input.rawSnapshot),
      productKind: parsedFacts.length >= 6 ? "multi" : "supplement",
      productUrl: sourceUrl,
      region: "TH",
      replaceFacts: true,
      source: "manufacturer_import",
      sourceSnapshot: {
        ...(input.rawSnapshot ?? {}),
        ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
        ...(titleEn ? { titleEn } : {}),
        ...(titleTh ? { titleTh } : {}),
        ...(titleZhCn ? { titleZhCn } : {}),
        ...(description ? { description } : {}),
        ...(descriptionEn ? { descriptionEn } : {}),
        ...(descriptionTh ? { descriptionTh } : {}),
        ...(descriptionZhCn ? { descriptionZhCn } : {}),
        productImportId: importId
      },
      sourceUrl,
      title: productTitle,
      titleEn,
      titleTh,
      titleZhCn,
      translations: Object.fromEntries(normalizedProductTranslations(input.translations, {
        descriptionEn,
        descriptionTh,
        descriptionZhCn,
        titleEn,
        titleTh,
        titleZhCn
      }))
    });
    draftProductId = draftProduct.id;
  }

  await upsertProductImportTranslations(sql, importId, input.translations, {
    descriptionEn,
    descriptionTh,
    descriptionZhCn,
    titleEn,
    titleTh,
    titleZhCn
  }, input.actor ?? "manufacturer_scraper");

  if (
    description ||
    descriptionEn ||
    descriptionTh ||
    descriptionZhCn ||
    titleEn ||
    titleTh ||
    titleZhCn
  ) {
    try {
      await sql`
        update public.product_imports
        set
          description = ${description},
          description_en = coalesce(${descriptionEn}, description_en),
          description_th = coalesce(${descriptionTh}, description_th),
          title_en = coalesce(${titleEn}, title_en),
          title_th = coalesce(${titleTh}, title_th),
          updated_at = now()
        where id = ${importId}::uuid
      `;
    } catch (error) {
      const code = error && typeof error === "object"
        ? (error as { code?: string }).code
        : null;

      if (code !== "42703") {
        throw error;
      }
    }
  }

  const { task } = await createTask({
    actorType: "human",
    businessValue: input.parseConfidence === "low" ? 420 : 300,
    context: {
      source: "manufacturer_product_import",
      taskType: "review_product_import"
    },
    groupLabel: "Review Product",
    idempotencyKey: `review-product-import:${importId}`,
    idempotencyScope: "active",
    idempotencyScopeKey: `review-product-import:${importId}`,
    initialComment: {
      authorName: input.actor ?? "Manufacturer scraper",
      authorType: "deterministic",
      body: `${productTitle} was imported from a manufacturer source and needs human review before it can be recommended.`,
      commentType: "instruction",
      metadata: {
        duplicateProductIds,
        ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
        importId,
        parseConfidence: input.parseConfidence ?? "moderate",
        sourceUrl
      },
      visibility: "admin"
    },
    maxAttempts: 1,
    payload: {
      actionOptions: [
        "approve_product",
        "edit_then_approve",
        "mark_duplicate",
        "ignore_import"
      ],
      brandName,
      duplicateProductIds,
      fdaApprovalNumber: cleanNullableText(input.fdaApprovalNumber, 100),
      description,
      descriptionEn,
      descriptionTh,
      translations: input.translations,
      imageUrls,
      itemType: "product",
      parsedFacts,
      productImportId: importId,
      productName: productTitle,
      ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
      productTitleEn: titleEn,
      productTitleTh: titleTh,
      reviewKind: "product_import",
      sourceUrl
    },
    reasoningEffort: "none",
    requiredCapabilities: [
      AGENT_CAPABILITIES.humanReview,
      AGENT_CAPABILITIES.productReview,
      AGENT_CAPABILITIES.safetyReview
    ],
    retryPolicy: false,
    taskType: "review_product_import",
    title: `Review Product ${productTitle}`
  });

  await sql`
    update public.product_imports
    set
      product_id = coalesce(product_id, ${isUuidValue(draftProductId) ? draftProductId : null}::uuid),
      review_task_id = ${task.id}::uuid,
      updated_at = now()
    where id = ${importId}::uuid
  `;

  await sql`
    insert into public.product_admin_audit (
      action,
      actor,
      after_payload
    )
    values (
      'product_import_staged',
      ${input.actor ?? "manufacturer_scraper"},
      ${sql.json(toJsonValue({
        brandName,
        importId,
        importRunId: input.importRunId ?? null,
        ...(rawProductTitle !== productTitle ? { originalProductTitle: rawProductTitle } : {}),
        productTitle,
        productId: draftProductId,
        reviewTaskId: task.id,
        sourceUrl
      }))}::jsonb
    )
  `;

  return {
    importId,
    importRunId: input.importRunId ?? null,
    productId: draftProductId,
    reviewTaskId: task.id
  };
}

async function completeProductImportTask(
  sql: NonNullable<ReturnType<typeof getSql>>,
  input: Readonly<{
    action: string;
    actor?: string | null;
    importId: string;
    taskId: string;
    payload?: Record<string, unknown>;
  }>
) {
  const payload = toJsonValue({
    action: input.action,
    importId: input.importId,
    ...(input.payload ?? {})
  });

  await sql`
    update public.tasks
    set
      status = 'completed',
      completed_at = now(),
      lease_until = null,
      reserved_by_agent_id = null,
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${sql.json(payload)}::jsonb,
      updated_at = now()
    where id = ${input.taskId}::uuid
      and task_type = 'review_product_import'
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
  `;

  await sql`
    insert into public.task_comments (
      id,
      task_id,
      author_type,
      author_name,
      visibility,
      comment_type,
      body,
      metadata,
      created_at
    )
    values (
      gen_random_uuid(),
      ${input.taskId}::uuid,
      'human',
      ${input.actor ?? "admin_dashboard"},
      'admin',
      'decision',
      ${`Product import review completed: ${input.action}.`},
      ${sql.json(payload)},
      now()
    )
  `;

  await sql`
    insert into public.task_events (
      id,
      task_id,
      event_type,
      event_status,
      severity,
      event_payload,
      occurred_at,
      created_at
    )
    values (
      gen_random_uuid(),
      ${input.taskId}::uuid,
      'product_import_review_completed',
      'succeeded',
      'medium',
      ${sql.json(payload)},
      now(),
      now()
    )
  `;
}

export async function resolveProductImportReview(
  input: ResolveProductImportReviewInput
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const importRows = await sql<Array<{
    brand_name: string;
    description: string | null;
    description_en: string | null;
    description_th: string | null;
    description_zh_cn: string | null;
    duplicate_product_ids: string[];
    fda_approval_number: string | null;
    id: string;
    image_urls: string[];
    parsed_facts: ProductImportFactInput[];
    product_id: string | null;
    product_title: string;
    title_en: string | null;
    title_th: string | null;
    title_zh_cn: string | null;
    raw_snapshot: Record<string, unknown>;
    source_url: string;
  }>>`
    select
      id::text,
      brand_name,
      coalesce(to_jsonb(product_imports) ->> 'description', raw_snapshot ->> 'description') as description,
      coalesce(to_jsonb(product_imports) ->> 'description_en', raw_snapshot ->> 'descriptionEn') as description_en,
      coalesce(to_jsonb(product_imports) ->> 'description_th', raw_snapshot ->> 'descriptionTh') as description_th,
      coalesce(raw_snapshot ->> 'descriptionZhCn', raw_snapshot -> 'translations' -> 'zh-CN' ->> 'description') as description_zh_cn,
      product_title,
      coalesce(to_jsonb(product_imports) ->> 'title_en', raw_snapshot ->> 'titleEn') as title_en,
      coalesce(to_jsonb(product_imports) ->> 'title_th', raw_snapshot ->> 'titleTh') as title_th,
      coalesce(raw_snapshot ->> 'titleZhCn', raw_snapshot -> 'translations' -> 'zh-CN' ->> 'title') as title_zh_cn,
      source_url,
      image_urls,
      fda_approval_number,
      parsed_facts,
      product_id::text,
      raw_snapshot,
      duplicate_product_ids::text[]
    from public.product_imports
    where review_task_id = ${input.taskId}::uuid
      and status = 'pending_review'
    limit 1
  `;
  const productImport = importRows[0];

  if (!productImport) {
    throw new Error("Product import review task not found");
  }

  const nowStatus = input.action === "ignore"
      ? "ignored"
      : input.action === "duplicate"
        ? "duplicate"
        : "approved";
  const draftProductId = productImport.product_id;
  let productId = input.mergeProductId ?? draftProductId ?? null;
  const reviewFacts = input.parsedFacts
    ? normalizedFactsForStorage(input.parsedFacts)
    : productImport.parsed_facts;
  const reviewDescription =
    input.description === undefined
      ? productImport.description
      : cleanNullableText(input.description, 4000);
  const reviewDescriptionEn =
    input.descriptionEn === undefined
      ? productImport.description_en
      : cleanNullableText(input.descriptionEn, 4000);
  const reviewDescriptionTh =
    input.descriptionTh === undefined
      ? productImport.description_th
      : cleanNullableText(input.descriptionTh, 4000);
  const reviewDescriptionZhCn =
    input.descriptionZhCn === undefined
      ? productImport.description_zh_cn
      : cleanNullableText(input.descriptionZhCn, 4000);
  const reviewBrandName = cleanNullableText(input.brandName, 200) ??
    productImport.brand_name;
  const reviewTitle = cleanNullableText(input.title, 500) ??
    productImport.product_title;
  const reviewTitleEn = input.titleEn === undefined
    ? productImport.title_en
    : cleanNullableText(input.titleEn, 500);
  const reviewTitleTh = input.titleTh === undefined
    ? productImport.title_th
    : cleanNullableText(input.titleTh, 500);
  const reviewTitleZhCn = input.titleZhCn === undefined
    ? productImport.title_zh_cn
    : cleanNullableText(input.titleZhCn, 500);
  const reviewFdaApprovalNumber = input.fdaApprovalNumber === undefined
    ? productImport.fda_approval_number
    : cleanNullableText(input.fdaApprovalNumber, 100);
  const reviewImageUrl = cleanNullableText(input.imageUrl) ??
    productImport.image_urls[0] ??
    null;
  const reviewProductUrl = cleanNullableText(input.productUrl) ??
    productImport.source_url;

  if (input.action === "approve") {
    const row = await createAdminProduct({
      actor: input.actor ?? "admin_dashboard",
      availabilityStatus: "in_stock",
      availableCountryCodes: input.availableCountryCodes,
      brandStatus: "approved",
      brandName: reviewBrandName,
      description: reviewDescription,
      descriptionEn: reviewDescriptionEn,
      descriptionTh: reviewDescriptionTh,
      descriptionZhCn: reviewDescriptionZhCn,
      facts: reviewFacts,
      fdaApprovalNumber: reviewFdaApprovalNumber,
      imageUrl: reviewImageUrl,
      labelStatus: reviewFacts.length > 0 ? "parsed" : "missing",
      manufacturerCountryCodes: input.manufacturerCountryCodes,
      status: "approved",
      platform: "manual",
      productAudience: input.productAudience ?? productAudienceFromSnapshot(productImport.raw_snapshot),
      productKind: reviewFacts.length >= 6 ? "multi" : "supplement",
      productUrl: reviewProductUrl,
      region: "TH",
      replaceFacts: true,
      source: "manufacturer_import",
      sourceSnapshot: {
        ...productImport.raw_snapshot,
        ...(reviewDescription ? { description: reviewDescription } : {}),
        ...(reviewDescriptionEn ? { descriptionEn: reviewDescriptionEn } : {}),
        ...(reviewDescriptionTh ? { descriptionTh: reviewDescriptionTh } : {}),
        ...(reviewDescriptionZhCn ? { descriptionZhCn: reviewDescriptionZhCn } : {})
      },
      sourceUrl: productImport.source_url,
      title: reviewTitle,
      titleEn: reviewTitleEn,
      titleTh: reviewTitleTh,
      titleZhCn: reviewTitleZhCn,
      translations: Object.fromEntries(normalizedProductTranslations(input.translations, {
        descriptionEn: reviewDescriptionEn,
        descriptionTh: reviewDescriptionTh,
        descriptionZhCn: reviewDescriptionZhCn,
        titleEn: reviewTitleEn,
        titleTh: reviewTitleTh,
        titleZhCn: reviewTitleZhCn
      }))
    });
    productId = row.id;

    if (input.action === "approve" && row.validation.status !== "pass") {
      throw new Error(`Product still needs review: ${row.validation.summary}`);
    }
  }

  if (input.action === "duplicate") {
    if (!isUuidValue(productId)) {
      throw new Error("Mark duplicate requires an existing product");
    }

    const existing = await sql<Array<{ id: string }>>`
      select id::text
      from public.products
      where id = ${productId}::uuid
      limit 1
    `;

    if (!existing[0]) {
      throw new Error("Duplicate product was not found");
    }
  }

  if (
    (input.action === "ignore" || input.action === "duplicate") &&
    isUuidValue(draftProductId) &&
    (input.action === "ignore" || draftProductId !== productId)
  ) {
    await sql`
      update public.products
      set
        status = 'ignored',
        updated_at = now()
      where id = ${draftProductId}::uuid
        and status in ('pending_review', 'ignored')
        and (
          (source_snapshot ->> 'productImportId') = ${productImport.id}
          or (
            status = 'pending_review'
            and (source_snapshot ->> 'productImportId') is null
          )
        )
    `;
  }

  await sql`
    update public.product_imports
    set
      status = ${nowStatus},
      parsed_facts = ${sql.json(toJsonValue(reviewFacts))}::jsonb,
      product_id = ${isUuidValue(productId) ? productId : null}::uuid,
      reviewer_note = ${cleanNullableText(input.reviewerNote, 2000)},
      reviewed_by = ${input.actor ?? "admin_dashboard"},
      reviewed_at = now(),
      updated_at = now()
    where id = ${productImport.id}::uuid
  `;

  await upsertProductImportTranslations(sql, productImport.id, input.translations, {
    descriptionEn: reviewDescriptionEn,
    descriptionTh: reviewDescriptionTh,
    descriptionZhCn: reviewDescriptionZhCn,
    titleEn: reviewTitleEn,
    titleTh: reviewTitleTh,
    titleZhCn: reviewTitleZhCn
  }, input.actor ?? "admin_dashboard");

  await completeProductImportTask(sql, {
    action: input.action,
    actor: input.actor,
    importId: productImport.id,
    payload: {
      productId,
      reviewerNote: input.reviewerNote ?? null
    },
    taskId: input.taskId
  });

  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${isUuidValue(productId) ? productId : null}::uuid,
      'product_import_reviewed',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({
        action: input.action,
        importId: productImport.id,
        productId,
        reviewerNote: input.reviewerNote ?? null
      }))}::jsonb
    )
  `;

  const row = input.returnRow === false || !productId
    ? null
    : await loadAdminProductRow(productId);

  clearProductRecommendationCandidateCache();

  return {
    productId,
    removedTaskIds: [input.taskId],
    row
  };
}

export async function upsertProductOffer(
  input: UpsertProductOfferInput
) {
  const sql = getSql();
  const productId = isUuidValue(input.productId) ? input.productId : null;
  const url = input.url.trim();

  if (!sql || !productId) {
    throw new Error("Product link requires a valid product");
  }

  if (!url) {
    throw new Error("Product link URL is required");
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_offers (
      product_id,
      network,
      url,
      link_type,
      platform,
      commission_rate,
      admin_priority,
      price_amount,
      currency,
      availability_status,
      tracking_id,
      status,
      created_at,
      updated_at
    )
    values (
      ${productId}::uuid,
      ${cleanNullableText(input.network, 100)},
      ${url},
      ${input.linkType ?? "affiliate"},
      ${cleanNullableText(input.platform, 100)},
      ${input.commissionRate ?? null},
      ${Math.round(input.priority ?? 0)},
      ${input.priceAmount ?? null},
      ${cleanNullableText(input.currency, 20) ?? "THB"},
      ${input.availabilityStatus ?? "unknown"},
      ${cleanNullableText(input.trackingId, 500)},
      ${input.status ?? "active"},
      now(),
      now()
    )
    on conflict (product_id, url)
    do update set
      network = excluded.network,
      link_type = excluded.link_type,
      platform = excluded.platform,
      commission_rate = excluded.commission_rate,
      admin_priority = excluded.admin_priority,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      availability_status = excluded.availability_status,
      tracking_id = excluded.tracking_id,
      status = excluded.status,
      updated_at = now()
    returning id::text
  `;
  const offerId = rows[0]?.id;

  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${productId}::uuid,
      'product_offer_upserted',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({
        commissionRate: input.commissionRate ?? null,
        offerId,
        linkType: input.linkType ?? "affiliate",
        platform: input.platform ?? null,
        priority: input.priority ?? 0,
        url
      }))}::jsonb
    )
  `;

  clearProductRecommendationCandidateCache();

  return loadAdminProductRow(productId);
}

export async function removeProductOffer(
  input: RemoveProductOfferInput
) {
  const sql = getSql();
  const productId = isUuidValue(input.productId) ? input.productId : null;
  const offerId = isUuidValue(input.offerId) ? input.offerId : null;

  if (!sql || !productId || !offerId) {
    throw new Error("Product link removal requires valid ids");
  }

  await sql`
    update public.product_offers
    set
      status = 'inactive',
      updated_at = now()
    where id = ${offerId}::uuid
      and product_id = ${productId}::uuid
  `;

  await sql`
    insert into public.product_admin_audit (
      product_id,
      action,
      actor,
      after_payload
    )
    values (
      ${productId}::uuid,
      'product_offer_removed',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({ offerId }))}::jsonb
    )
  `;

  clearProductRecommendationCandidateCache();

	  return loadAdminProductRow(productId);
	}
	
export async function updateProductBrandCountries(input: Readonly<{
  actor?: string | null;
  brandId: string;
  countryCodes: readonly string[];
}>) {
  const sql = getSql();
  const brandId = isUuidValue(input.brandId) ? input.brandId : null;

  if (!sql || !brandId) {
    throw new Error("Manufacturer country update requires a valid brand id");
  }

  const beforeRows = await sql<Array<{
    before_payload: unknown;
    name: string;
  }>>`
    select to_jsonb(product_brands.*) as before_payload, name
    from public.product_brands
    where id = ${brandId}::uuid
    limit 1
  `;

  if (!beforeRows[0]) {
    throw new Error("Manufacturer not found");
  }

  const countryCodes = await replaceBrandCountryCodes(
    sql,
    brandId,
    input.countryCodes
  );

  await sql`
    update public.product_brands
    set
      country_code = ${countryCodes[0] ?? defaultProductCountryCode},
      updated_at = now()
    where id = ${brandId}::uuid
  `;

  await reconcileProductsForBrandCountryCodes(sql, brandId, countryCodes);

  await sql`
    insert into public.product_admin_audit (
      brand_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${brandId}::uuid,
      'product_brand_countries_updated',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue(beforeRows[0].before_payload ?? {}))}::jsonb,
      ${sql.json(toJsonValue({ countryCodes }))}::jsonb
    )
  `;

  clearProductRecommendationCandidateCache();

  const productRows = await loadAdminProductRowsForBrand(brandId);

  return {
    brandId,
    countryCodes,
    name: beforeRows[0].name,
    productRows
  };
}
