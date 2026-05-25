import { getSql } from "@/lib/db";
import { defaultProductCountryCode } from "@/lib/product-countries";
import { toJsonValue } from "@/lib/assessment-store";
import {
  normalizeProductKey,
  normalizeProductFactName,
  productFactAliasKeys,
  normalizeProductFactKey,
  productKeysMatch
} from "@/lib/product-recommendations";
import type { ProductConfidence } from "@/lib/product-recommendations";
import type { ProductAudience } from "@/lib/product-recommendations";
import { validateProduct } from "@/lib/product-validation";
import { numberOrNull, isoOrNull, cleanNullableText, normalizedUrl } from "./admin-product-helpers.ts";
import { preferredProductTitle, clearProductRecommendationCandidateCache, createAdminProduct } from "./admin-products.ts";
import { productAudienceFromSnapshot, isUuidValue } from "./admin-product-helpers.ts";
// Local copy of the fact input shape for this module's input types and helpers.
// (Will be centralized in admin-product-types.ts in a later cleanup pass.)
export type ProductImportFactInput = Readonly<{
  amount?: number | null;
  confidence?: ProductConfidence;
  itemType?: "food" | "nutrient" | "supplement";
  name: string;
  servingLabel?: string | null;
  sourceText?: string | null;
  sourceUrl?: string | null;
  supplementId?: string | null;
  unit?: string | null;
}>;

// This module will eventually own all import run, staging, review, and approval logic.

export type StageProductImportInput = Readonly<{
  actor?: string | null;
  brandName: string;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  duplicateProductIds?: readonly string[];
  fdaApprovalNumber?: string | null;
  imageUrls?: readonly string[];
  importRunId?: string | null;
  parsedFacts?: readonly ProductImportFactInput[];
  parseConfidence?: ProductConfidence;
  productTitle: string;
  rawSnapshot?: Record<string, unknown> | null;
  source?: string | null;
  sourceUrl: string;
  titleEn?: string | null;
  titleTh?: string | null;
}>;

export type StartProductImportRunInput = Readonly<{
  autoApprove?: boolean;
  brandName: string;
  source?: string | null;
  totalProducts?: number;
}>;

export type FinishProductImportRunInput = Readonly<{
  approvedCount?: number;
  failedCount?: number;
  importRunId: string;
  notes?: string | null;
  stagedCount?: number;
  status: "completed" | "failed";
}>;

export type ResolveProductImportReviewInput = Readonly<{
  action: "approve" | "duplicate" | "ignore";
  actor?: string | null;
  availableCountryCodes?: readonly string[];
  brandName?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  descriptionTh?: string | null;
  fdaApprovalNumber?: string | null;
  imageUrl?: string | null;
  manufacturerCountryCodes?: readonly string[];
  mergeProductId?: string | null;
  parsedFacts?: readonly ProductImportFactInput[];
  productAudience?: ProductAudience;
  productUrl?: string | null;
  reviewerNote?: string | null;
  returnRow?: boolean;
  taskId: string;
  title?: string | null;
  titleEn?: string | null;
  titleTh?: string | null;
}>;

export function normalizedFactsForStorage(
  facts: readonly ProductImportFactInput[] | undefined
) {
  return (facts ?? [])
    .map((fact) => {
      const name = normalizeProductFactName(fact.name.trim()) || fact.name.trim();

      if (!name) {
        return null;
      }

      return {
        amount: numberOrNull(fact.amount),
        confidence: fact.confidence ?? "moderate",
        itemType: fact.itemType ?? "supplement",
        name,
        servingLabel: cleanNullableText(fact.servingLabel, 200),
        sourceText: cleanNullableText(fact.sourceText, 1000),
        sourceUrl: cleanNullableText(fact.sourceUrl, 2000),
        supplementId: isUuidValue(fact.supplementId) ? fact.supplementId : null,
        unit: cleanNullableText(fact.unit, 40)
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
}

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

  return input.importRunId;
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
    status: "completed" | "failed" | "running";
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

  return rows.map((row) => ({
    approvedCount: Math.max(0, Math.round(numberOrNull(row.approved_count) ?? 0)),
    brandName: row.brand_name,
    completedAt: isoOrNull(row.completed_at),
    failedCount: Math.max(0, Math.round(numberOrNull(row.failed_count) ?? 0)),
    id: row.id,
    notes: row.notes,
    requestedAutoApprove: row.requested_auto_approve,
    source: row.source,
    stagedCount: Math.max(0, Math.round(numberOrNull(row.staged_count) ?? 0)),
    startedAt: isoOrNull(row.started_at) ?? new Date().toISOString(),
    status: row.status,
    totalProducts: Math.max(0, Math.round(numberOrNull(row.total_products) ?? 0))
  }));
}



export async function supplementIdsForFacts(
  sql: NonNullable<ReturnType<typeof getSql>>,
  facts: readonly ProductImportFactInput[]
) {
  const factAliases = facts.map((fact) => ({
    aliases: productFactAliasKeys(fact.name),
    key: normalizeProductFactKey(fact.name)
  }));
  const normalizedNames = [...new Set(factAliases.flatMap((fact) => fact.aliases))];

  if (normalizedNames.length < 1) {
    return new Map<string, { id: string; name: string }>();
  }

  const rows = await sql<Array<{
    id: string;
    name: string;
    normalized_alias: string;
  }>>`
    select supplements.id::text, supplements.name, supplement_aliases.normalized_alias
    from public.supplement_aliases
    join public.supplements
      on supplements.id = supplement_aliases.supplement_id
    where supplement_aliases.normalized_alias = any(${normalizedNames}::text[])
       or supplements.normalized_name = any(${normalizedNames}::text[])
  `;
  const byKey = new Map<string, { id: string; name: string }>();

  for (const fact of factAliases) {
    const match = rows.find((row) =>
      fact.aliases.some((alias) =>
        row.normalized_alias === alias || productKeysMatch(alias, row.normalized_alias)
      )
    );

    if (match) {
      byKey.set(fact.key, { id: match.id, name: match.name });
    }
  }

  return byKey;
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
  const productTitle = preferredProductTitle({
    title: rawProductTitle,
    titleEn
  });
  const descriptionEn = cleanNullableText(input.descriptionEn, 4000);
  const descriptionTh = cleanNullableText(input.descriptionTh, 4000);
  const description = cleanNullableText(
    input.description ?? descriptionEn ?? descriptionTh,
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
        ...(description ? { description } : {}),
        ...(descriptionEn ? { descriptionEn } : {}),
        ...(descriptionTh ? { descriptionTh } : {})
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
        ...(description ? { description } : {}),
        ...(descriptionEn ? { descriptionEn } : {}),
        ...(descriptionTh ? { descriptionTh } : {})
      },
      title: productTitle,
      titleEn,
      titleTh
    });
    draftProductId = draftProduct.id;
  }

  await sql`
    update public.product_imports
    set
      product_id = ${draftProductId}::uuid,
      updated_at = now()
    where id = ${importId}::uuid
  `;

  return importId;
}

// resolveProductImportReview is now re-exported from the barrel (admin-products.ts)
