// Admin Product Write / Mutation Services
//
// Extracted as part of the Sprint 2 god-module split of lib/admin-products.ts.
// Owns all create/update/revalidate paths and their supporting mutation helpers
// so the core catalogue write model is isolated from read-model, import, country,
// and offer concerns.
//
// Public surface re-exported via the barrel (lib/admin-products.ts) for
// zero consumer breakage.

import { getSql } from "@/lib/db";
import { toJsonValue } from "@/lib/assessment-store";
import { clearProductRecommendationCandidateCache } from "./admin-product-search.ts";
import {
  loadAdminProductRow,
  loadProductRows
} from "./admin-product-read-model.ts";
import { rowFromDb } from "./admin-product-mappers.ts";
import {
  isUuidValue,
  cleanNullableText,
  numberOrNull,
  preferredProductTitle
} from "./admin-product-helpers.ts";
import type {
  AdminProductRow,
  CreateAdminProductInput,
  ProductDbRow,
  ProductImportFactInput,
  ProductLabelStatus,
  UpdateAdminProductInput
} from "./admin-product-types.ts";

import type { ProductStatus } from "@/lib/product-recommendations";
import type { ValidationResult } from "@/lib/product-validation";
import {
  normalizeProductKey,
  normalizeProductFactKey
} from "@/lib/product-recommendations";
import { validationCacheMismatchReasons, productFactObservableIssueMessages } from "@/lib/product-validation";
import { appendSupplementSafetyLimitVersion } from "@/lib/supplement-safety-limit-versions";
import { normalizeSupplementSafetyFlags } from "@/lib/supplement-safety-flags";
import { defaultProductCountryCode, normalizeProductCountryCodes } from "@/lib/product-countries";
import {
  doseAmountInLimitUnit,
  doseExceedsLimit,
  normalizeDoseUnit,
  parseDoseLimit
} from "@/lib/dose-conversion";
// Use Web Crypto API (available in Node runtime for Next.js server code)
const randomUUID = () => globalThis.crypto.randomUUID();

import {
  normalizedFactsForStorage,
  supplementIdsForFacts
} from "./admin-product-facts.ts";
import {
  replaceBrandCountryCodes,
  ensureBrandCountryCodes
} from "./admin-product-countries.ts";
import {
  normalizeSubmittedProductCountryCodes,
  assertProductCountriesAllowedByBrand,
  normalizedUrl,
  productAudienceFromSnapshot
} from "./admin-product-helpers.ts";
import {
  replaceProductCountryCodes,
  loadProductCountryCodes,
  loadBrandCountryCodes,
  reconcileProductsForBrandCountryCodes
} from "./admin-product-countries.ts";
import type { ProductCountryCode } from "./admin-product-types.ts";
import { sameProductCountryCodes } from "./admin-product-helpers.ts";

// ---------------------------------------------------------------------------
// Internal write helpers (moved from the god file)
// ---------------------------------------------------------------------------

async function replaceProductFacts(
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

function normalizedTranslationEntries(input: Readonly<{
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  descriptionZhCn?: string | null;
  title?: string | null;
  titleEn?: string | null;
  titleTh?: string | null;
  titleZhCn?: string | null;
  translations?: CreateAdminProductInput["translations"] | UpdateAdminProductInput["translations"];
}>) {
  const translations = new Map<string, {
    description: string | null;
    status: "complete" | "draft" | "missing";
    title: string | null;
  }>();

  for (const [locale, value] of Object.entries(input.translations ?? {})) {
    if (!/^[a-z]{2}(?:-[A-Z0-9]{2,8})?$/.test(locale)) {
      continue;
    }

    const title = cleanNullableText(value.title, 500);
    const description = cleanNullableText(value.description, 4000);
    const status = value.status === "complete" || value.status === "missing"
      ? value.status
      : title && description
        ? "complete"
        : title || description
          ? "draft"
          : "missing";

    translations.set(locale, {
      description,
      status,
      title
    });
  }

  const legacy: Array<[string, string | null | undefined, string | null | undefined]> = [
    ["en", input.titleEn ?? input.title, input.descriptionEn ?? input.description],
    ["th", input.titleTh, input.descriptionTh],
    ["zh-CN", input.titleZhCn, input.descriptionZhCn]
  ];

  for (const [locale, legacyTitle, legacyDescription] of legacy) {
    if (translations.has(locale)) {
      continue;
    }

    const title = cleanNullableText(legacyTitle, 500);
    const description = cleanNullableText(legacyDescription, 4000);

    if (!title && !description) {
      continue;
    }

    translations.set(locale, {
      description,
      status: title && description ? "complete" : "draft",
      title
    });
  }

  return [...translations].map(([locale, value]) => ({
    locale,
    ...value
  }));
}

async function replaceProductTranslations(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string,
  input: Readonly<{
    description?: string | null;
    descriptionEn?: string | null;
    descriptionTh?: string | null;
    descriptionZhCn?: string | null;
    source?: string | null;
    title?: string | null;
    titleEn?: string | null;
    titleTh?: string | null;
    titleZhCn?: string | null;
    translations?: CreateAdminProductInput["translations"] | UpdateAdminProductInput["translations"];
  }>
) {
  const translations = normalizedTranslationEntries(input);

  if (translations.length < 1) {
    return;
  }

  await sql`
    with translation_rows as (
      select *
      from jsonb_to_recordset(${sql.json(toJsonValue(translations))}::jsonb) as translation(
        locale text,
        title text,
        description text,
        status text
      )
    )
    insert into public.product_translations (
      product_id,
      locale,
      title,
      description,
      status,
      source,
      updated_at,
      created_at
    )
    select
      ${productId}::uuid,
      translation_rows.locale,
      translation_rows.title,
      translation_rows.description,
      translation_rows.status,
      ${input.source ?? "admin"},
      now(),
      now()
    from translation_rows
    on conflict (product_id, locale) do update set
      title = coalesce(excluded.title, product_translations.title),
      description = coalesce(excluded.description, product_translations.description),
      status = excluded.status,
      source = excluded.source,
      updated_at = excluded.updated_at
  `;
}

async function recordProductVersion(
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
          'facts', coalesce(fact_rows.facts, '[]'::jsonb),
          'translations', coalesce(translation_rows.translations, '{}'::jsonb)
        ),
        '{}'::jsonb,
        now()
      from next_product
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
        where product_translations.product_id = next_product.id
      ) translation_rows on true
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

// ---------------------------------------------------------------------------
// Revalidation & consistency helpers (write side)
// These were moved from the god module as part of completing the Sprint 2 split.
// ---------------------------------------------------------------------------

export async function refreshAndPersistProductValidation(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string
) {
  const rows = await loadProductRows(productId);
  const sourceRow = rows?.[0];

  if (!sourceRow) {
    throw new Error("Product not found for validation check");
  }

  const row = rowFromDb(sourceRow);
  const validation = row.validation;
  const safeListStatus =
    row.status === "approved" && validation.status !== "pass"
      ? "pending_review"
      : row.status;
  const safeLabelStatus =
    validation.status === "pass" && row.facts.length > 0
      ? "parsed"
      : validation.reasons.includes("no_dosed_facts")
      ? row.facts.length > 0
        ? "failed"
        : "missing"
      : row.labelStatus;
  const validationPayload = toJsonValue(validation);

  await sql`
    update public.products
    set
      status = ${safeListStatus},
      label_status = ${safeLabelStatus},
      source_snapshot = source_snapshot || jsonb_build_object(
        'validation',
        ${sql.json(validationPayload)}::jsonb
      ),
      updated_at = now()
    where id = ${productId}::uuid
  `;

  try {
    await sql`
      update public.products
      set
        validation_status = ${validation.status},
        validation_reasons = ${validation.reasons}::text[],
        validation_summary = ${validation.summary},
        validation_checked_at = ${validation.checkedAt}::timestamptz,
        updated_at = now()
      where id = ${productId}::uuid
    `;
  } catch (error) {
    const code = error && typeof error === "object"
      ? (error as { code?: string }).code
      : null;

    if (code !== "42703") {
      throw error;
    }
  }

  return {
    labelStatus: safeLabelStatus,
    status: safeListStatus,
    validation
  };
}

export async function productIdsUsingSupplement(
  sql: NonNullable<ReturnType<typeof getSql>>,
  supplementId: string
) {
  if (!isUuidValue(supplementId)) {
    return [];
  }

  const rows = await sql<Array<{ product_id: string }>>`
    select distinct product_facts.product_id::text
    from public.product_facts
    where product_facts.supplement_id = ${supplementId}::uuid
    order by product_facts.product_id::text
  `;

  return rows.map((row) => row.product_id);
}

export async function refreshAndPersistProductValidations(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productIds: readonly string[]
) {
  const uniqueProductIds = [...new Set(productIds.filter(isUuidValue))];
  const refreshed: Array<{
    labelStatus: ProductLabelStatus;
    productId: string;
    status: ProductStatus;
    validation: ValidationResult;
  }> = [];

  for (const productId of uniqueProductIds) {
    const result = await refreshAndPersistProductValidation(sql, productId);

    refreshed.push({
      productId,
      ...result
    });
  }

  if (refreshed.length > 0) {
    clearProductRecommendationCandidateCache();
  }

  return refreshed;
}

function persistedValidationForRow(row: ProductDbRow) {
  return {
    checkedAt: row.validation_checked_at
      ? new Date(row.validation_checked_at).toISOString()
      : null,
    reasons: row.validation_reasons ?? [],
    status: row.validation_status,
    summary: row.validation_summary
  };
}

export type ProductValidationConsistencyRow = Readonly<{
  factIssues: Array<{
    factId: string;
    factName: string;
    issues: string[];
    supplementId: string | null;
  }>;
  mismatchReasons: string[];
  persisted: ReturnType<typeof persistedValidationForRow>;
  productId: string;
  recomputed: ValidationResult;
  status: ProductStatus;
  title: string;
}>;

export async function revalidateProductsForSupplement(input: Readonly<{
  actor?: string | null;
  supplementId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const productIds = await productIdsUsingSupplement(sql, input.supplementId);
  const refreshed = await refreshAndPersistProductValidations(sql, productIds);

  if (refreshed.length > 0) {
    await sql`
      insert into public.product_admin_audit (
        actor,
        action,
        after_payload
      )
      values (
        ${input.actor ?? "admin_dashboard"},
        'product_validation_revalidated_for_supplement',
        ${sql.json(toJsonValue({
          productIds,
          revalidatedCount: refreshed.length,
          supplementId: input.supplementId
        }))}::jsonb
      )
    `;
  }

  return {
    productIds,
    revalidatedCount: refreshed.length,
    refreshed,
    supplementId: input.supplementId
  };
}

export async function checkProductValidationConsistency(input: Readonly<{
  limit?: number | null;
  productId?: string | null;
}> = {}) {
  const rows = await loadProductRows(input.productId ?? null);

  if (!rows) {
    throw new Error("Database is not configured");
  }

  const limit = Math.max(1, Math.min(5000, Math.round(input.limit ?? 1000)));
  const checkedRows = rows.slice(0, limit);
  const mismatches: ProductValidationConsistencyRow[] = [];

  for (const row of checkedRows) {
    const adminRow = rowFromDb(row);
    const persisted = persistedValidationForRow(row);
    const mismatchReasons = validationCacheMismatchReasons(
      persisted,
      adminRow.validation
    );

    if (mismatchReasons.length < 1) {
      continue;
    }

    mismatches.push({
      factIssues: adminRow.facts
        .map((fact) => ({
          factId: fact.id,
          factName: fact.name,
          issues: productFactObservableIssueMessages(fact),
          supplementId: fact.supplementId ?? null
        }))
        .filter((fact) => fact.issues.length > 0),
      mismatchReasons,
      persisted,
      productId: adminRow.id,
      recomputed: adminRow.validation,
      status: adminRow.status,
      title: adminRow.title
    });
  }

  return {
    checkedCount: checkedRows.length,
    generatedAt: new Date().toISOString(),
    limit,
    staleCount: mismatches.length,
    staleRows: mismatches
  };
}

export async function repairProductValidationConsistency(input: Readonly<{
  actor?: string | null;
  limit?: number | null;
  productId?: string | null;
}> = {}) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const report = await checkProductValidationConsistency(input);
  const refreshed = await refreshAndPersistProductValidations(
    sql,
    report.staleRows.map((row) => row.productId)
  );

  if (refreshed.length > 0) {
    await sql`
      insert into public.product_admin_audit (
        actor,
        action,
        after_payload
      )
      values (
        ${input.actor ?? "admin_dashboard"},
        'product_validation_cache_repaired',
        ${sql.json(toJsonValue({
          productIds: refreshed.map((row) => row.productId),
          repairedCount: refreshed.length
        }))}::jsonb
      )
    `;
  }

  return {
    ...report,
    repairedCount: refreshed.length,
    repairedProductIds: refreshed.map((row) => row.productId)
  };
}

export async function runProductValidationCheck(input: Readonly<{
  actor?: string | null;
  productId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const validation = await refreshAndPersistProductValidation(sql, input.productId);

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      after_payload
    )
    values (
      ${input.productId}::uuid,
      ${input.actor ?? "admin_dashboard"},
      'product_validation_checked',
      ${sql.json(toJsonValue(validation.validation))}::jsonb
    )
  `;

  const rows = await loadProductRows(input.productId);
  const row = rows?.[0] ? rowFromDb(rows[0]) : null;

  if (!row) {
    throw new Error("Product not found after validation check");
  }

  return row;
}

// increaseProductFactSafetyLimit - moved from god module

function roundedDoseAmount(value: number) {
  return Math.ceil(value * 1_000_000) / 1_000_000;
}

export async function increaseProductFactSafetyLimit(input: Readonly<{
  actor?: string | null;
  factId: string;
  productId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!isUuidValue(input.productId) || !isUuidValue(input.factId)) {
    throw new Error("Product fact was not found");
  }

  const rows = await sql<Array<{
    amount: string | number | null;
    confidence: "high" | "low" | "moderate" | null;
    fact_name: string;
    max_amount: string | number | null;
    max_unit: string | null;
    normalized_name: string;
    safety_flags: string[] | null;
    safety_notes: string | null;
    supplement_id: string | null;
    supplement_name: string | null;
    unit: string | null;
  }>>`
    select
      product_facts.name as fact_name,
      product_facts.normalized_name,
      product_facts.amount,
      product_facts.unit,
      product_facts.supplement_id::text,
      supplements.name as supplement_name,
      limits.max_amount,
      limits.max_unit,
      limits.confidence,
      limits.safety_flags,
      limits.safety_notes
    from public.product_facts
    left join public.supplements
      on supplements.id = product_facts.supplement_id
    left join lateral (
      select *
      from public.supplement_safety_limits
      where supplement_safety_limits.supplement_id = product_facts.supplement_id
      order by version desc
      limit 1
    ) limits on true
    where product_facts.id = ${input.factId}::uuid
      and product_facts.product_id = ${input.productId}::uuid
    limit 1
  `;
  const fact = rows[0];

  if (!fact || !isUuidValue(fact.supplement_id)) {
    throw new Error("Safety limit can only be changed for a canonical supplement fact");
  }

  const amount = numberOrNull(fact.amount);
  const doseUnit = fact.unit ? normalizeDoseUnit(fact.unit) : null;
  const supplementKey = fact.normalized_name || fact.fact_name;

  if (amount === null || amount <= 0 || !doseUnit) {
    throw new Error("Fact has no comparable dose for a safety limit update");
  }

  const currentLimit = parseDoseLimit(numberOrNull(fact.max_amount), fact.max_unit);
  const factDose = {
    amount,
    originalText: `${amount} ${fact.unit ?? doseUnit}`,
    unit: doseUnit
  };

  if (currentLimit) {
    const exceedsLimit = doseExceedsLimit(factDose, currentLimit, supplementKey);

    if (exceedsLimit === null) {
      throw new Error(
        "Safety limit unit cannot be compared with this product fact unit; update this supplement from the Supplements screen"
      );
    }

    if (!exceedsLimit) {
      throw new Error("The configured safety limit already covers this dose");
    }
  }

  const maxUnit = fact.max_unit?.trim() || `${doseUnit}/day`;
  const nextMaxAmount = currentLimit
    ? doseAmountInLimitUnit(factDose, currentLimit, supplementKey)
    : amount;

  if (nextMaxAmount === null) {
    throw new Error(
      "Safety limit unit cannot be converted without changing the configured unit"
    );
  }

  const nextMaxAmountRounded = roundedDoseAmount(nextMaxAmount);
  const beforePayload = {
    factId: input.factId,
    factName: fact.fact_name,
    maxAmount: numberOrNull(fact.max_amount),
    maxUnit: fact.max_unit,
    productId: input.productId,
    supplementId: fact.supplement_id,
    supplementName: fact.supplement_name
  };
  const safetyNotes = [
    fact.safety_notes?.trim() || null,
    `Raised from product review to cover ${amount} ${fact.unit ?? doseUnit} in ${fact.fact_name}.`
  ]
    .filter(Boolean)
    .join(" ");

  const version = await appendSupplementSafetyLimitVersion(sql, {
    confidence: fact.confidence ?? "moderate",
    maxAmount: nextMaxAmountRounded,
    maxUnit,
    safetyFlags: normalizeSupplementSafetyFlags(fact.safety_flags ?? []),
    safetyNotes,
    supplementId: fact.supplement_id
  });

  await sql`
    insert into public.supplement_admin_audit (
      id,
      supplement_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${randomUUID()}::uuid,
      ${fact.supplement_id}::uuid,
      'safety_limit_increased_from_product',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue(beforePayload))}::jsonb,
      ${sql.json(toJsonValue({
        ...beforePayload,
        factAmount: amount,
        factUnit: fact.unit ?? doseUnit,
        maxAmount: nextMaxAmountRounded,
        maxUnit,
        version
      }))}::jsonb
    )
  `;

  const revalidation = await refreshAndPersistProductValidations(
    sql,
    await productIdsUsingSupplement(sql, fact.supplement_id)
  );
  const validation = revalidation.find((row) => row.productId === input.productId) ??
    await refreshAndPersistProductValidation(sql, input.productId);
  const productVersion = await recordProductVersion(sql, {
    actor: input.actor,
    changeNote: "product_safety_limit_increased",
    productId: input.productId
  });

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      after_payload
    )
    values (
      ${input.productId}::uuid,
      ${input.actor ?? "admin_dashboard"},
      'product_safety_limit_increased',
      ${sql.json(toJsonValue({
        factId: input.factId,
        factAmount: amount,
        factUnit: fact.unit ?? doseUnit,
        maxAmount: nextMaxAmountRounded,
        maxUnit,
        productVersion,
        revalidatedProductCount: revalidation.length,
        supplementId: fact.supplement_id,
        validation: validation.validation,
        version
      }))}::jsonb
    )
  `;

  const row = await loadAdminProductRow(input.productId);

  if (!row) {
    throw new Error("Product not found after safety limit update");
  }

  const revalidatedRows = (
    await Promise.all(
      revalidation.map((item) => loadAdminProductRow(item.productId))
    )
  ).filter((item): item is AdminProductRow => Boolean(item));

  clearProductRecommendationCandidateCache();

  return {
    revalidatedProductIds: revalidation.map((item) => item.productId),
    revalidatedRows,
    row
  };
}


export async function createAdminProduct(input: CreateAdminProductInput) {

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rawTitle = input.title.trim();
  const titleEn = cleanNullableText(input.titleEn, 500);
  const titleTh = cleanNullableText(input.titleTh, 500);
  const titleZhCn = cleanNullableText(input.titleZhCn, 500);
  const title = preferredProductTitle({ title: rawTitle, titleEn });
  const productUrl = input.productUrl.trim();
  const descriptionEn = cleanNullableText(input.descriptionEn, 4000);
  const descriptionTh = cleanNullableText(input.descriptionTh, 4000);
  const descriptionZhCn = cleanNullableText(input.descriptionZhCn, 4000);
  const description = cleanNullableText(
    input.description ?? descriptionEn ?? descriptionTh ?? descriptionZhCn,
    4000
  );
  const sourceSnapshot = {
    ...(input.sourceSnapshot ?? {}),
    ...(rawTitle !== title ? { originalProductTitle: rawTitle } : {}),
    ...(titleEn ? { titleEn } : {}),
    ...(titleTh ? { titleTh } : {}),
    ...(titleZhCn ? { titleZhCn } : {}),
    ...(descriptionEn ? { descriptionEn } : {}),
    ...(descriptionTh ? { descriptionTh } : {}),
    ...(descriptionZhCn ? { descriptionZhCn } : {}),
    ...(input.translations ? { translations: input.translations } : {})
  };

  if (!title || !productUrl) {
    throw new Error("Product title and URL are required");
  }

	  const facts = input.facts ?? [];
	  const supplementMatchesByFactName = await supplementIdsForFacts(sql, facts);
	  const brandName = cleanNullableText(input.brandName, 200);
	  const normalizedBrandName = brandName ? normalizeProductKey(brandName) : null;
	  const regionCountryCodes = normalizeProductCountryCodes(
	    [input.region],
	    [defaultProductCountryCode]
	  );
	  let brandRows: Array<{ id: string }> = [];

  if (normalizedBrandName && brandName) {
    brandRows = await sql<Array<{ id: string }>>`
        insert into public.product_brands (
          name,
          normalized_name,
          status,
          created_at,
          updated_at
        )
        values (
          ${brandName},
          ${normalizedBrandName},
          ${input.brandStatus ?? "pending_review"},
          now(),
          now()
        )
        on conflict (normalized_name) do update set
          status = case
            when public.product_brands.status = 'ignored' then public.product_brands.status
            when ${input.brandStatus ?? null} = 'approved' then 'approved'
            when public.product_brands.status = 'approved' then public.product_brands.status
            when ${input.brandStatus ?? null}::text is null then public.product_brands.status
            else ${input.brandStatus ?? null}
          end,
          updated_at = now()
        returning id::text
      `;
	  }
	  const brandId = brandRows[0]?.id ?? null;
	  const manufacturerCountryCodes = brandId
	    ? input.manufacturerCountryCodes !== undefined
	      ? await replaceBrandCountryCodes(sql, brandId, input.manufacturerCountryCodes)
	      : await ensureBrandCountryCodes(sql, brandId, regionCountryCodes)
	    : [];
	  const productCountryCodes = input.availableCountryCodes !== undefined
	    ? normalizeSubmittedProductCountryCodes(
	        input.availableCountryCodes,
	        "Product countries"
	      )
	    : normalizeProductCountryCodes(
	        [],
	        brandId ? manufacturerCountryCodes : regionCountryCodes
	      );

	  if (brandId) {
	    assertProductCountriesAllowedByBrand(
	      productCountryCodes,
	      manufacturerCountryCodes,
	      brandName
	    );
	  }
	  const productRows = await sql<Array<{ id: string }>>`
    insert into public.products (
      platform,
      region,
      external_product_id,
      title,
      normalized_title,
      brand_id,
      brand_name,
      normalized_brand_name,
      image_url,
      product_url,
      normalized_url,
      description,
      fda_approval_number,
      source_url,
      source_snapshot,
      product_kind,
      product_audience,
      status,
      label_status,
      availability_status,
      affiliate_status,
      price_amount,
      currency,
      source,
      created_at,
      updated_at
    )
    values (
      ${input.platform},
      ${input.region?.trim() || "TH"},
      ${cleanNullableText(input.externalProductId, 300)},
      ${title},
      ${normalizeProductKey(title)},
	      ${brandId}::uuid,
      ${brandName},
      ${normalizedBrandName},
      ${cleanNullableText(input.imageUrl)},
      ${productUrl},
      ${normalizedUrl(productUrl)},
      ${description},
      ${cleanNullableText(input.fdaApprovalNumber, 100)},
      ${cleanNullableText(input.sourceUrl) ?? productUrl},
      ${sql.json(toJsonValue(sourceSnapshot))}::jsonb,
      ${input.productKind ?? "supplement"},
      ${input.productAudience ?? productAudienceFromSnapshot(sourceSnapshot)},
      ${input.status ?? "pending_review"},
      ${input.labelStatus ?? (input.facts?.length ? "parsed" : "missing")},
      'unknown',
      'none',
      null,
      ${input.currency?.trim() || "THB"},
      ${input.source ?? "admin"},
      now(),
      now()
    )
    on conflict (normalized_url) do update set
      title = excluded.title,
      normalized_title = excluded.normalized_title,
      external_product_id = coalesce(excluded.external_product_id, products.external_product_id),
      brand_id = excluded.brand_id,
      brand_name = excluded.brand_name,
      normalized_brand_name = excluded.normalized_brand_name,
      image_url = coalesce(excluded.image_url, products.image_url),
      description = coalesce(excluded.description, products.description),
      fda_approval_number = coalesce(excluded.fda_approval_number, products.fda_approval_number),
      source_url = coalesce(excluded.source_url, products.source_url),
      source_snapshot = products.source_snapshot || excluded.source_snapshot,
      product_kind = excluded.product_kind,
      product_audience = excluded.product_audience,
      status = excluded.status,
      label_status = excluded.label_status,
      availability_status = 'unknown',
      affiliate_status = 'none',
      price_amount = null,
      currency = excluded.currency,
      updated_at = now()
    returning id::text
  `;
  const productId = productRows[0]?.id;

	  if (!productId) {
	    throw new Error("Product was not created");
	  }

	  await replaceProductCountryCodes(sql, productId, productCountryCodes);

  await replaceProductTranslations(sql, productId, {
    description,
    descriptionEn,
    descriptionTh,
    descriptionZhCn,
    source: input.source ?? "admin",
    title,
    titleEn,
    titleTh,
    titleZhCn,
    translations: input.translations
  });

  if (input.replaceFacts || facts.length > 0) {
    const factSource = input.source?.trim() || "admin";

    await replaceProductFacts(sql, {
      ...(input.replaceFacts
        ? { deleteSources: [...new Set([factSource, "admin"])] }
        : {}),
      actor: input.actor,
      changeReason: "product_create_facts",
      facts,
      productId,
      source: factSource,
      supplementMatchesByFactName
    });
  }

  if (input.affiliateUrl) {
    await sql`
      insert into public.product_offers (
        product_id,
        url,
        link_type,
        status,
        created_at,
        updated_at
      )
      values (
        ${productId}::uuid,
        ${input.affiliateUrl.trim()},
        'affiliate',
        'active',
        now(),
        now()
      )
    `;
  }

  const validation = await refreshAndPersistProductValidation(sql, productId);
  const version = await recordProductVersion(sql, {
    actor: input.actor,
    changeNote: "product_saved",
    productId
  });

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      after_payload
    )
    values (
      ${productId}::uuid,
      ${input.actor ?? "admin_dashboard"},
      'product_created',
	      ${sql.json({
	        availableCountryCodes: productCountryCodes,
	        manufacturerCountryCodes,
	        platform: input.platform,
        productUrl,
        validation: validation.validation,
        title,
        version
      })}::jsonb
    )
  `;

  const row = await loadAdminProductRow(productId);

  if (!row) {
    throw new Error("Product not found after creation");
  }

  clearProductRecommendationCandidateCache();

  return row;
}


export async function updateAdminProduct(input: UpdateAdminProductInput) {

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const beforeRows = await sql<Array<{
    before_payload: unknown;
    brand_id: string | null;
    brand_name: string | null;
    region: string;
  }>>`
    select
      to_jsonb(products.*) as before_payload,
      products.brand_id::text,
      products.brand_name,
      products.region
    from public.products
    where id = ${input.id}::uuid
    limit 1
  `;

  if (!beforeRows[0]) {
    throw new Error("Product not found");
  }
  const title = input.title === undefined ? undefined : cleanNullableText(input.title, 500);
  const titleEn = input.titleEn === undefined ? undefined : cleanNullableText(input.titleEn, 500);
  const titleTh = input.titleTh === undefined ? undefined : cleanNullableText(input.titleTh, 500);
  const titleZhCn = input.titleZhCn === undefined ? undefined : cleanNullableText(input.titleZhCn, 500);
  const brandName = input.brandName === undefined
    ? undefined
    : cleanNullableText(input.brandName, 200);
  const normalizedBrandName = brandName === undefined
    ? undefined
    : brandName
      ? normalizeProductKey(brandName)
      : null;
  const imageUrl = input.imageUrl === undefined
    ? undefined
    : cleanNullableText(input.imageUrl, 2000);
  const productUrl = input.productUrl === undefined
    ? undefined
    : cleanNullableText(input.productUrl, 2000);

  if (input.title !== undefined && !title) {
    throw new Error("Product title is required");
  }

  if (input.productUrl !== undefined && !productUrl) {
    throw new Error("Product URL is required");
  }

  const descriptionEn = cleanNullableText(input.descriptionEn, 4000);
  const descriptionTh = cleanNullableText(input.descriptionTh, 4000);
  const descriptionZhCn = cleanNullableText(input.descriptionZhCn, 4000);
  const localizedSnapshot = {
    ...(input.sourceSnapshotPatch ?? {}),
    ...(input.titleEn !== undefined ? { titleEn } : {}),
    ...(input.titleTh !== undefined ? { titleTh } : {}),
    ...(input.titleZhCn !== undefined ? { titleZhCn } : {}),
    ...(input.descriptionEn !== undefined ? { descriptionEn } : {}),
    ...(input.descriptionTh !== undefined ? { descriptionTh } : {}),
    ...(input.descriptionZhCn !== undefined ? { descriptionZhCn } : {}),
    ...(input.translations !== undefined ? { translations: input.translations } : {})
  };
  let brandRows: Array<{ id: string }> = [];

  if (normalizedBrandName && brandName) {
    brandRows = await sql<Array<{ id: string }>>`
        insert into public.product_brands (
          name,
          normalized_name,
          status,
          created_at,
          updated_at
        )
        values (
          ${brandName},
          ${normalizedBrandName},
          'pending_review',
          now(),
          now()
        )
        on conflict (normalized_name) do update set
          name = excluded.name,
          updated_at = now()
        returning id::text
      `;
  }
	  const brandId = normalizedBrandName === undefined
	    ? undefined
	    : normalizedBrandName
	      ? brandRows[0]?.id ?? null
	      : null;
	  const effectiveBrandId = brandId === undefined ? beforeRows[0].brand_id : brandId;
	  const effectiveBrandName = brandName === undefined
	    ? beforeRows[0].brand_name
	    : brandName;
	  const existingProductCountryCodes = await loadProductCountryCodes(
	    sql,
	    input.id,
	    [beforeRows[0].region]
	  );
	  const existingManufacturerCountryCodes = effectiveBrandId
	    ? await loadBrandCountryCodes(
	        sql,
	        effectiveBrandId,
	        existingProductCountryCodes
	      )
	    : [];
	  let manufacturerCountryCodes: ProductCountryCode[] = [];

	  if (effectiveBrandId) {
	    manufacturerCountryCodes = input.manufacturerCountryCodes !== undefined
	      ? await replaceBrandCountryCodes(
	          sql,
	          effectiveBrandId,
	          input.manufacturerCountryCodes
	        )
	      : await ensureBrandCountryCodes(
	          sql,
	          effectiveBrandId,
	          existingProductCountryCodes
	        );
	  }
	  const manufacturerCountriesChanged = Boolean(
	    effectiveBrandId &&
	    input.manufacturerCountryCodes !== undefined &&
	    !sameProductCountryCodes(
	      existingManufacturerCountryCodes,
	      manufacturerCountryCodes
	    )
	  );
	  const requestedProductCountryCodes = input.availableCountryCodes !== undefined
	    ? normalizeSubmittedProductCountryCodes(
	        input.availableCountryCodes,
	        "Product countries"
	      )
	    : existingProductCountryCodes;
	  const productCountryCodes = manufacturerCountriesChanged
	    ? manufacturerCountryCodes
	    : requestedProductCountryCodes;

	  if (effectiveBrandId) {
	    assertProductCountriesAllowedByBrand(
	      productCountryCodes,
	      manufacturerCountryCodes,
	      effectiveBrandName
	    );
	  }
  const titleParam = title ?? null;
  const brandNameParam = brandName ?? null;
  const normalizedBrandNameParam = normalizedBrandName ?? null;
  const brandIdParam = brandId ?? null;
  const imageUrlParam = imageUrl ?? null;
  const productUrlParam = productUrl ?? null;
  const normalizedProductUrlParam = productUrl ? normalizedUrl(productUrl) : null;

  const rows = await sql`
    update public.products set
      title = case
        when ${input.title === undefined} then title
        else ${titleParam}
      end,
      normalized_title = case
        when ${input.title === undefined} then normalized_title
        else ${normalizeProductKey(titleParam ?? "")}
      end,
      brand_id = case
        when ${input.brandName === undefined} then brand_id
        else ${brandIdParam}::uuid
      end,
      brand_name = case
        when ${input.brandName === undefined} then brand_name
        else ${brandNameParam}
      end,
      normalized_brand_name = case
        when ${input.brandName === undefined} then normalized_brand_name
        else ${normalizedBrandNameParam}
      end,
      image_url = case
        when ${input.imageUrl === undefined} then image_url
        else ${imageUrlParam}
      end,
      product_url = case
        when ${input.productUrl === undefined} then product_url
        else ${productUrlParam}
      end,
      normalized_url = case
        when ${input.productUrl === undefined} then normalized_url
        else ${normalizedProductUrlParam}
      end,
      status = coalesce(${input.status ?? null}, status),
      label_status = coalesce(${input.labelStatus ?? null}, label_status),
      description = case
        when ${input.description === undefined} then description
        else ${cleanNullableText(input.description, 4000)}
      end,
      source_snapshot = source_snapshot || ${sql.json(toJsonValue(localizedSnapshot))}::jsonb,
      fda_approval_number = case
        when ${input.fdaApprovalNumber === undefined} then fda_approval_number
        else ${input.fdaApprovalNumber ?? null}
      end,
      product_kind = coalesce(${input.productKind ?? null}, product_kind),
      product_audience = coalesce(${input.productAudience ?? null}, product_audience),
      admin_notes = coalesce(${input.adminNotes ?? null}, admin_notes),
      updated_at = now()
    where id = ${input.id}::uuid
    returning id::text
  `;

	  if (input.facts !== undefined) {
	    const facts = normalizedFactsForStorage(input.facts);
	    const supplementMatchesByFactName = await supplementIdsForFacts(sql, facts);

    await replaceProductFacts(sql, {
      actor: input.actor,
      changeReason: input.changeNote?.trim() || "product_admin_save_facts",
      deleteSources: [],
      facts,
      productId: input.id,
      source: input.factsSource?.trim() || "admin",
	      supplementMatchesByFactName
	    });
	  }

	  if (input.availableCountryCodes !== undefined) {
	    await replaceProductCountryCodes(sql, input.id, productCountryCodes);
	  }

  if (
    input.translations !== undefined ||
    input.titleEn !== undefined ||
    input.titleTh !== undefined ||
    input.titleZhCn !== undefined ||
    input.descriptionEn !== undefined ||
    input.descriptionTh !== undefined ||
    input.descriptionZhCn !== undefined ||
    input.title !== undefined ||
    input.description !== undefined
  ) {
    await replaceProductTranslations(sql, input.id, {
      description: input.description,
      descriptionEn,
      descriptionTh,
      descriptionZhCn,
      source: "admin",
      title,
      titleEn,
      titleTh,
      titleZhCn,
      translations: input.translations
    });
  }

	  if (manufacturerCountriesChanged && effectiveBrandId) {
	    await reconcileProductsForBrandCountryCodes(
	      sql,
	      effectiveBrandId,
	      manufacturerCountryCodes
	    );
	  }

  const validation = await refreshAndPersistProductValidation(sql, input.id);

  if (input.status === "approved" && validation.validation.status !== "pass") {
    throw new Error(
      `Product validation blocks approval: ${validation.validation.summary}`
    );
  }

  const version = await recordProductVersion(sql, {
    actor: input.actor,
    changeNote: input.changeNote?.trim() || "product_admin_save",
    productId: input.id
  });

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      before_payload,
      after_payload
    )
    values (
      ${input.id}::uuid,
      ${input.actor ?? "admin_dashboard"},
      'product_updated',
      ${sql.json(toJsonValue(beforeRows[0].before_payload ?? {}))}::jsonb,
	      ${sql.json({
	        availableCountryCodes: input.availableCountryCodes === undefined
	          ? undefined
	          : productCountryCodes,
	        brandName: input.brandName,
	        changeNote: input.changeNote,
        description: input.description,
        descriptionEn: input.descriptionEn,
        descriptionTh: input.descriptionTh,
        descriptionZhCn: input.descriptionZhCn,
        facts: input.facts,
	        factsSource: input.factsSource,
	        fdaApprovalNumber: input.fdaApprovalNumber,
	        imageUrl: input.imageUrl,
	        labelStatus: input.labelStatus,
	        manufacturerCountryCodes: input.manufacturerCountryCodes === undefined
	          ? undefined
	          : manufacturerCountryCodes,
	        manufacturerCountriesChanged,
	        status: input.status,
        validation: validation.validation,
        productAudience: input.productAudience,
        productKind: input.productKind,
        productUrl: input.productUrl,
        sourceSnapshotPatch: toJsonValue(input.sourceSnapshotPatch ?? null),
        title: input.title,
        titleEn: input.titleEn,
        titleTh: input.titleTh,
        titleZhCn: input.titleZhCn,
        translations: input.translations,
        version
      })}::jsonb
    )
  `;

  if (!rows[0]) {
    throw new Error("Product not found");
  }

  const row = await loadAdminProductRow(input.id);

  if (!row) {
    throw new Error("Product not found after update");
  }

  clearProductRecommendationCandidateCache();

  return row;
}
export {};
