import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { toJsonValue } from "@/lib/assessment-store";
import { isUuidValue, normalizedUrl } from "@/lib/admin-product-helpers";
import { normalizeCurrencyCode, normalizeProductCountryCode } from "@/lib/product-countries";
import {
  normalizeProductFactKey,
  normalizeProductKey,
  type ProductAudience,
  type ProductAvailabilityStatus,
  type ProductConfidence,
  type ProductKind,
  type ProductPlatform,
  type ProductStatus
} from "@/lib/product-recommendations";

export const V9_PRODUCT_MASTER_SCHEMA = "mattanutra-product-export-v1";
const V9_INTERNAL_URL_PREFIX = "manual://v9-master-list/";
const SCR_PRODUCT_ID_PATTERN = /^SCR-[0-9]{4}$/;
type V9CountryCode = Exclude<ReturnType<typeof normalizeProductCountryCode>, null>;

export const V9_RESET_TABLES = [
  "ai_response_cache",
  "assessment_resume_drafts",
  "assessment_versions",
  "assessments",
  "bpm",
  "communication_messages",
  "communication_channels",
  "communication_identities",
  "customer_line_connect_tokens",
  "line_connect_tokens",
  "organisation_communication_identities",
  "organisation_notification_preferences",
  "finance_transactions",
  "finance_fx_rates",
  "formulations",
  "nutrition_plan_versions",
  "nutrition_reports",
  "payment_versions",
  "payments",
  "panya_daily_usage",
  "plan_chat_messages",
  "plan_communication_identities",
  "plan_feedback",
  "plan_guidance_adjustments",
  "product_admin_audit",
  "product_brand_countries",
  "product_brands",
  "product_countries",
  "product_regulatory_approvals",
  "product_facts",
  "product_import_runs",
  "product_imports",
  "product_import_translations",
  "product_recommendation_items",
  "product_recommendation_decisions",
  "product_recommendation_runs",
  "improvement_external_product_candidate_cache",
  "product_versions",
  "products",
  "product_identifiers",
  "product_identifier_candidates",
  "product_translations",
  "retail_sellable_products",
  "retail_product_stock",
  "retail_product_cost_observations",
  "retail_product_stock_snapshots",
  "retail_stock_lots",
  "retail_stock_movements",
  "retail_stock_reorder_advice",
  "retail_shopping_lists",
  "retail_shopping_list_lines",
  "retail_customer_orders",
  "retail_customer_order_lines",
  "retail_order_settlements",
  "retail_order_allocations",
  "retail_carrier_accounts",
  "retail_order_shipments",
  "retail_order_shipment_events",
  "recommendations",
  "safety_reviews",
  "stripe_webhook_events",
  "supplement_recommendation_selections",
  "task_approvals",
  "task_comments",
  "task_dependencies",
  "task_events",
  "task_reservations",
  "tasks",
  "worker_sessions"
] as const;

type Db = postgres.Sql | postgres.TransactionSql;

type V9ProductRecord = Record<string, unknown>;

export type V9ProductMasterPayload = Readonly<{
  generatedAt: string | null;
  productCount: number;
  products: V9ProductRecord[];
  schema: typeof V9_PRODUCT_MASTER_SCHEMA;
  scope: string;
  summary: unknown;
}>;

export type V9ProductMasterReplaceResult = Readonly<{
  activeTenantCount: number;
  backupSchema: string;
  importedProducts: number;
  retailProductsPerTenant: number;
  retailSellablesSeeded: number;
  retailStockSeeded: number;
  skippedIgnoredProducts: number;
  tableCountsBeforeReset: Record<string, number>;
}>;

export type V9ImportedProductSeed = Readonly<{
  price: { amount: number; currency: string } | null;
  productId: string;
  status: ProductStatus;
}>;

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function statusValue(value: unknown): ProductStatus {
  return value === "approved" || value === "ignored" || value === "pending_review"
    ? value
    : "pending_review";
}

function platformValue(value: unknown): ProductPlatform {
  return value === "lazada" ||
    value === "manual" ||
    value === "shopee" ||
    value === "wholesale_pharmacy_import"
    ? value
    : "manual";
}

function productKindValue(value: unknown): ProductKind {
  return value === "food" || value === "multi" || value === "other" || value === "supplement"
    ? value
    : "supplement";
}

function productAudienceValue(value: unknown): ProductAudience {
  return value === "female" || value === "male" ? value : "both";
}

function availabilityValue(value: unknown): ProductAvailabilityStatus {
  return value === "in_stock" ||
    value === "out_of_stock" ||
    value === "unavailable" ||
    value === "unknown"
    ? value
    : "unknown";
}

function confidenceValue(value: unknown): ProductConfidence {
  return value === "high" || value === "low" ? value : "moderate";
}

function itemTypeValue(value: unknown): "food" | "nutrient" | "supplement" {
  return value === "food" || value === "nutrient" ? value : "supplement";
}

function maybeUuid(value: unknown) {
  const text = cleanText(value, 80);

  return text && isUuidValue(text) ? text : null;
}

export function deterministicV9ProductUuid(masterListId: string) {
  const bytes = createHash("sha256")
    .update(`mattanutra:v9-master-product:${masterListId}`)
    .digest();
  const hex = Buffer.from(bytes.subarray(0, 16)).toString("hex").split("");

  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "8", 16) & 0x3) | 0x8).toString(16);

  return [
    hex.slice(0, 8).join(""),
    hex.slice(8, 12).join(""),
    hex.slice(12, 16).join(""),
    hex.slice(16, 20).join(""),
    hex.slice(20, 32).join("")
  ].join("-");
}

export function storageProductIdForV9Id(masterListId: string) {
  return isUuidValue(masterListId)
    ? masterListId
    : deterministicV9ProductUuid(masterListId);
}

export function validateV9ProductMasterPayload(value: unknown): V9ProductMasterPayload {
  const record = objectValue(value);
  const schema = cleanText(record.schema, 100);
  const products = arrayValue(record.products).map(objectValue);
  const productCount = Number(record.productCount);

  if (schema !== V9_PRODUCT_MASTER_SCHEMA) {
    throw new Error(`Expected schema ${V9_PRODUCT_MASTER_SCHEMA}`);
  }

  if (!Number.isInteger(productCount) || productCount !== products.length) {
    throw new Error("productCount must match products.length");
  }

  const seenIds = new Set<string>();

  for (const [index, product] of products.entries()) {
    const id = cleanText(product.id, 80);
    const title = productTitle(product);
    const brand = productBrandName(product);
    const price = productPrice(product);

    if (!id || (!isUuidValue(id) && !SCR_PRODUCT_ID_PATTERN.test(id))) {
      throw new Error(`Product ${index + 1} has an invalid v9 id`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Duplicate v9 product id: ${id}`);
    }

    if (!title) {
      throw new Error(`Product ${id} is missing a canonical title`);
    }

    if (!brand) {
      throw new Error(`Product ${id} is missing a brand name`);
    }

    if (!price) {
      throw new Error(`Product ${id} is missing a valid price`);
    }

    seenIds.add(id);
  }

  return {
    generatedAt: cleanText(record.generatedAt, 80),
    productCount,
    products,
    schema: V9_PRODUCT_MASTER_SCHEMA,
    scope: cleanText(record.scope, 500) ?? "platform",
    summary: record.summary ?? null
  };
}

function productTitle(product: V9ProductRecord) {
  const titles = objectValue(product.titles);
  const translations = objectValue(product.translations);
  const en = objectValue(translations.en);

  return cleanText(titles.canonical, 500) ??
    cleanText(en.title, 500) ??
    cleanText(titles.display, 500);
}

function productDescription(product: V9ProductRecord) {
  const descriptions = objectValue(product.descriptions);
  const translations = objectValue(product.translations);
  const en = objectValue(translations.en);
  const th = objectValue(translations.th);

  return cleanText(descriptions.canonical, 4000) ??
    cleanText(en.description, 4000) ??
    cleanText(th.description, 4000) ??
    cleanText(descriptions.display, 4000);
}

function productBrandName(product: V9ProductRecord) {
  return cleanText(objectValue(product.brand).name, 200);
}

function productBrandStatus(product: V9ProductRecord): ProductStatus {
  return statusValue(objectValue(product.brand).status);
}

function productPrice(product: V9ProductRecord) {
  const price = objectValue(product.price);
  const amount = numberOrNull(price.amount);

  if (amount === null) {
    return null;
  }

  return {
    amount,
    currency: normalizeCurrencyCode(price.currency, "THB")
  };
}

function productRegion(product: V9ProductRecord) {
  return normalizeProductCountryCode(product.region) ?? "TH";
}

function productCountryRows(product: V9ProductRecord) {
  const price = productPrice(product);
  const region = productRegion(product);
  const rows = arrayValue(product.countries)
    .map(objectValue)
    .flatMap((country) => {
      const countryCode = normalizeProductCountryCode(country.countryCode);

      return countryCode
        ? [{
            countryCode,
            currency: normalizeCurrencyCode(country.currency, price?.currency ?? "THB"),
            rrpPriceAmount: price?.amount ?? null
          }]
        : [];
    });

  return rows.length > 0
    ? rows
    : [{
        countryCode: region,
        currency: price?.currency ?? "THB",
        rrpPriceAmount: price?.amount ?? null
      }];
}

function manufacturerCountryCodes(product: V9ProductRecord) {
  const codes = arrayValue(objectValue(product.brand).manufacturerCountryCodes)
    .map((code) => normalizeProductCountryCode(code))
    .filter((code): code is V9CountryCode => Boolean(code));

  return codes.length > 0 ? [...new Set(codes)] : [productRegion(product)];
}

export function internalV9ProductUrl(
  product: V9ProductRecord,
  seenUrlCounts: Map<string, number>
) {
  const id = cleanText(product.id, 80) ?? randomUUID();
  const original = cleanText(product.productUrl, 2000);

  if (!original) {
    return `${V9_INTERNAL_URL_PREFIX}${encodeURIComponent(id)}`;
  }

  const normalized = normalizedUrl(original);
  const count = seenUrlCounts.get(normalized) ?? 0;

  seenUrlCounts.set(normalized, count + 1);

  if (count === 0) {
    return original;
  }

  try {
    const url = new URL(original);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/v9-${encodeURIComponent(id)}`;
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return `${original.replace(/\s+/g, "-")}-v9-${id}`;
  }
}

export function quoteV9Identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function loadV9ReferenceIds(sql: Db, tableName: string) {
  const [table] = await sql<Array<{ exists: boolean }>>`
    select to_regclass(${`public.${tableName}`}) is not null as exists
  `;

  if (!table?.exists) {
    return new Set<string>();
  }

  const rows = await sql.unsafe<Array<{ id: string }>>(
    `select id::text from public.${quoteV9Identifier(tableName)}`
  );

  return new Set(rows.map((row) => row.id));
}

async function insertBrand(
  sql: Db,
  input: Readonly<{
    countryCodes: readonly string[];
    name: string;
    status: ProductStatus;
  }>
) {
  const normalizedName = normalizeProductKey(input.name);
  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_brands (
      name,
      normalized_name,
      status,
      country_code,
      created_at,
      updated_at
    )
    values (
      ${input.name},
      ${normalizedName},
      ${input.status},
      ${input.countryCodes[0] ?? "TH"},
      now(),
      now()
    )
    on conflict (normalized_name)
    do update set
      status = case
        when public.product_brands.status = 'approved' then 'approved'
        when excluded.status = 'approved' then 'approved'
        else excluded.status
      end,
      updated_at = now()
    returning id::text
  `;
  const brandId = rows[0]?.id ?? null;

  if (brandId) {
    for (const countryCode of input.countryCodes) {
      await sql`
        insert into public.product_brand_countries (
          brand_id,
          country_code,
          created_at,
          updated_at
        )
        values (
          ${brandId}::uuid,
          ${countryCode},
          now(),
          now()
        )
        on conflict (brand_id, country_code)
        do update set updated_at = now()
      `;
    }
  }

  return brandId;
}

function translationRows(product: V9ProductRecord) {
  return Object.entries(objectValue(product.translations)).flatMap(([locale, value]) => {
    const record = objectValue(value);
    const status = record.status === "complete" || record.status === "missing"
      ? record.status
      : "draft";

    if (!cleanText(record.title, 500) && !cleanText(record.description, 4000)) {
      return [];
    }

    return [{
      description: cleanText(record.description, 4000),
      locale,
      status,
      title: cleanText(record.title, 500)
    }];
  });
}

function identifierRows(product: V9ProductRecord) {
  return arrayValue(product.identifiers)
    .map(objectValue)
    .flatMap((identifier) => {
      const type = cleanText(identifier.type, 80);
      const value = cleanText(identifier.value, 200);

      if (!value || type !== "ean13" || !/^[0-9]{13}$/.test(value)) {
        return [];
      }

      return [{
        normalizedValue: value,
        type,
        value
      }];
    });
}

function regulatoryApprovalRows(product: V9ProductRecord) {
  return arrayValue(product.regulatoryApprovals)
    .map(objectValue)
    .flatMap((approval) => {
      const approvalNumber = cleanText(approval.approvalNumber, 200);
      const agencyName = cleanText(approval.agencyName, 200) ?? "Regulatory agency";
      const agencyCode = cleanText(approval.agencyCode, 80) ??
        agencyName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const scopeType = approval.scopeType === "region" ? "region" : "country";
      const rawScopeCode = cleanText(approval.scopeCode, 80) ?? productRegion(product);
      const scopeCode = scopeType === "country"
        ? normalizeProductCountryCode(rawScopeCode)
        : rawScopeCode.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 20);
      const status = approval.status === "sourced" ||
        approval.status === "verified" ||
        approval.status === "rejected" ||
        approval.status === "expired"
        ? approval.status
        : "verified";

      if (!approvalNumber || !agencyCode || !scopeCode) {
        return [];
      }

      return [{
        agencyCode: agencyCode.slice(0, 40),
        agencyName,
        approvalNumber,
        approvalType: "product_registration",
        evidenceUrl: cleanText(approval.evidenceUrl, 2000),
        id: maybeUuid(approval.id) ?? randomUUID(),
        metadata: objectValue(approval.metadata),
        scopeCode,
        scopeType,
        source: cleanText(approval.source, 120) ?? "v9_product_master",
        status
      }];
    });
}

function factRows(product: V9ProductRecord) {
  return arrayValue(product.ingredients)
    .map(objectValue)
    .flatMap((ingredient) => {
      const name = cleanText(ingredient.name, 300);

      if (!name) {
        return [];
      }

      return [{
        amount: numberOrNull(ingredient.amount),
        confidence: confidenceValue(ingredient.confidence),
        foodId: maybeUuid(ingredient.foodId),
        id: maybeUuid(ingredient.id),
        itemType: itemTypeValue(ingredient.itemType),
        name,
        normalizedName: cleanText(ingredient.normalizedName, 300) ??
          normalizeProductFactKey(name) ??
          name.toLowerCase(),
        nutrientId: cleanText(ingredient.nutrientId, 120),
        servingLabel: cleanText(ingredient.servingLabel, 300),
        source: cleanText(ingredient.source, 120) ?? "v9_product_master",
        sourceText: cleanText(ingredient.sourceText, 1000),
        sourceUrl: cleanText(ingredient.sourceUrl, 2000),
        supplementId: maybeUuid(ingredient.supplementId),
        unit: cleanText(ingredient.unit, 80)
      }];
    });
}

export async function insertV9ProductMasterProduct(
  sql: Db,
  input: Readonly<{
    foodIds: ReadonlySet<string>;
    master: V9ProductMasterPayload;
    nutrientIds: ReadonlySet<string>;
    product: V9ProductRecord;
    productUrl: string;
    supplementIds: ReadonlySet<string>;
  }>
) {
  const product = input.product;
  const masterListId = cleanText(product.id, 80) ?? randomUUID();
  const productId = storageProductIdForV9Id(masterListId);
  const price = productPrice(product);
  const brandName = productBrandName(product) ?? "generic";
  const brandCountryCodes = manufacturerCountryCodes(product);
  const brandId = await insertBrand(sql, {
    countryCodes: brandCountryCodes,
    name: brandName,
    status: productBrandStatus(product)
  });
  const title = productTitle(product) ?? masterListId;
  const description = productDescription(product);
  const sourceUrl = cleanText(product.sourceUrl, 2000) ??
    cleanText(product.productUrl, 2000);
  const sourceSnapshot = {
    masterListGeneratedAt: input.master.generatedAt,
    masterListId,
    masterListProduct: product,
    masterListScope: input.master.scope,
    masterListSchema: input.master.schema,
    masterListSummary: input.master.summary,
    originalProductUrl: cleanText(product.productUrl, 2000),
    source: "v9_product_master"
  };
  const labelStatus = factRows(product).length > 0 ? "parsed" : "missing";
  const validationStatus = statusValue(product.status) === "approved" ? "pass" : "needs_review";

  await sql`
    insert into public.products (
      id,
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
      category,
      source_url,
      source_snapshot,
      product_kind,
      product_audience,
      status,
      label_status,
      availability_status,
      price_amount,
      currency,
      source,
      validation_status,
      validation_reasons,
      validation_summary,
      current_version,
      created_at,
      updated_at
    )
    values (
      ${productId}::uuid,
      ${platformValue(product.platform)},
      ${productRegion(product)},
      ${isUuidValue(masterListId) ? null : masterListId},
      ${title},
      ${normalizeProductKey(title)},
      ${brandId}::uuid,
      ${brandName},
      ${normalizeProductKey(brandName)},
      ${cleanText(product.canonicalImageUrl, 2000)},
      ${input.productUrl},
      ${normalizedUrl(input.productUrl)},
      ${description},
      ${cleanText(product.category, 200)},
      ${sourceUrl},
      ${sql.json(toJsonValue(sourceSnapshot))}::jsonb,
      ${productKindValue(product.productKind)},
      ${productAudienceValue(product.productAudience)},
      ${statusValue(product.status)},
      ${labelStatus},
      ${availabilityValue(product.availabilityStatus)},
      ${price?.amount ?? null},
      ${price?.currency ?? "THB"},
      'v9_product_master',
      ${validationStatus},
      ${validationStatus === "pass" ? [] : ["v9_import_needs_review"]},
      ${validationStatus === "pass" ? "Imported from v9 master list" : "Imported from v9 master list for review"},
      1,
      now(),
      ${cleanText(product.updatedAt, 80) ? new Date(cleanText(product.updatedAt, 80)!) : new Date()}
    )
  `;

  for (const country of productCountryRows(product)) {
    await sql`
      insert into public.product_countries (
        product_id,
        country_code,
        rrp_price_amount,
        currency,
        price_updated_at,
        created_at,
        updated_at
      )
      values (
        ${productId}::uuid,
        ${country.countryCode},
        ${country.rrpPriceAmount},
        ${country.currency},
        now(),
        now(),
        now()
      )
    `;
  }

  for (const translation of translationRows(product)) {
    await sql`
      insert into public.product_translations (
        product_id,
        locale,
        title,
        description,
        status,
        source,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${productId}::uuid,
        ${translation.locale},
        ${translation.title},
        ${translation.description},
        ${translation.status},
        'v9_product_master',
        ${sql.json(toJsonValue({ masterListId }))}::jsonb,
        now(),
        now()
      )
      on conflict (product_id, locale)
      do update set
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        source = excluded.source,
        metadata = excluded.metadata,
        updated_at = now()
    `;
  }

  for (const identifier of identifierRows(product)) {
    await sql`
      insert into public.product_identifiers (
        product_id,
        identifier_type,
        identifier_value,
        normalized_value,
        source,
        confidence,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${productId}::uuid,
        ${identifier.type},
        ${identifier.value},
        ${identifier.normalizedValue},
        'v9_product_master',
        'trusted',
        ${sql.json(toJsonValue({ masterListId }))}::jsonb,
        now(),
        now()
      )
      on conflict (product_id, identifier_type, normalized_value)
      do update set
        identifier_value = excluded.identifier_value,
        source = excluded.source,
        confidence = excluded.confidence,
        metadata = excluded.metadata,
        status = 'active',
        updated_at = now()
    `;
  }

  for (const approval of regulatoryApprovalRows(product)) {
    await sql`
      insert into public.product_regulatory_approvals (
        id,
        product_id,
        scope_type,
        scope_code,
        agency_code,
        agency_name,
        approval_type,
        approval_number,
        status,
        source,
        evidence_url,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${approval.id}::uuid,
        ${productId}::uuid,
        ${approval.scopeType},
        ${approval.scopeCode},
        ${approval.agencyCode},
        ${approval.agencyName},
        ${approval.approvalType},
        ${approval.approvalNumber},
        ${approval.status},
        ${approval.source},
        ${approval.evidenceUrl},
        ${sql.json(toJsonValue({ ...approval.metadata, masterListId }))}::jsonb,
        now(),
        now()
      )
      on conflict (product_id, scope_type, scope_code, agency_code, approval_type, approval_number)
      do update set
        agency_name = excluded.agency_name,
        status = excluded.status,
        source = excluded.source,
        evidence_url = excluded.evidence_url,
        metadata = excluded.metadata,
        updated_at = now()
    `;
  }

  const facts = factRows(product);

  for (const fact of facts) {
    await sql`
      insert into public.product_facts (
        id,
        product_id,
        item_type,
        supplement_id,
        food_id,
        nutrient_id,
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
      values (
        ${fact.id ?? randomUUID()}::uuid,
        ${productId}::uuid,
        ${fact.itemType},
        ${fact.supplementId && input.supplementIds.has(fact.supplementId) ? fact.supplementId : null}::uuid,
        ${fact.foodId && input.foodIds.has(fact.foodId) ? fact.foodId : null}::uuid,
        ${fact.nutrientId && input.nutrientIds.has(fact.nutrientId) ? fact.nutrientId : null},
        ${fact.name},
        ${fact.normalizedName},
        ${fact.amount},
        ${fact.unit},
        ${fact.servingLabel},
        ${fact.confidence},
        ${fact.source},
        ${fact.sourceUrl},
        ${fact.sourceText},
        now(),
        now()
      )
    `;
  }

  await sql`
    insert into public.product_versions (
      product_id,
      version,
      actor,
      change_note,
      reason,
      source,
      title,
      brand_name,
      normalized_brand_name,
      image_url,
      product_url,
      normalized_url,
      description,
      product_kind,
      product_audience,
      status,
      label_status,
      availability_status,
      price_amount,
      currency,
      validation_status,
      validation_reasons,
      validation_summary,
      facts_snapshot,
      source_snapshot,
      snapshot,
      metadata,
      created_at
    )
    values (
      ${productId}::uuid,
      1,
      'v9_product_master',
      'v9_master_product_reset',
      'DEV v9 master product reset',
      'v9_product_master',
      ${title},
      ${brandName},
      ${normalizeProductKey(brandName)},
      ${cleanText(product.canonicalImageUrl, 2000)},
      ${input.productUrl},
      ${normalizedUrl(input.productUrl)},
      ${description},
      ${productKindValue(product.productKind)},
      ${productAudienceValue(product.productAudience)},
      ${statusValue(product.status)},
      ${labelStatus},
      ${availabilityValue(product.availabilityStatus)},
      ${price?.amount ?? null},
      ${price?.currency ?? "THB"},
      ${validationStatus},
      ${validationStatus === "pass" ? [] : ["v9_import_needs_review"]},
      ${validationStatus === "pass" ? "Imported from v9 master list" : "Imported from v9 master list for review"},
      ${sql.json(toJsonValue(facts))}::jsonb,
      ${sql.json(toJsonValue(sourceSnapshot))}::jsonb,
      ${sql.json(toJsonValue({
        masterListProduct: product,
        translations: objectValue(product.translations)
      }))}::jsonb,
      ${sql.json(toJsonValue({ masterListId }))}::jsonb,
      now()
    )
  `;

  return {
    price,
    productId,
    status: statusValue(product.status)
  };
}

export async function seedV9RetailTenants(
  sql: Db,
  products: readonly V9ImportedProductSeed[]
) {
  const tenants = await sql<Array<{ currency: string | null; id: string }>>`
    select id::text, currency
    from public.organisations
    where organisation_type = 'tenant'
      and status = 'active'
    order by lower(name)
  `;
  const sellableProducts = products.filter(
    (product) => product.status === "approved" && product.price
  );
  let retailSellablesSeeded = 0;
  let retailStockSeeded = 0;

  for (const tenant of tenants) {
    for (const product of sellableProducts) {
      const currency = normalizeCurrencyCode(product.price?.currency, tenant.currency ?? "THB");
      const amount = product.price?.amount ?? null;

      await sql`
        insert into public.retail_sellable_products (
          organisation_id,
          product_id,
          status,
          rrp_price_amount,
          wholesale_price_amount,
          currency,
          lead_time_days,
          backorder_policy,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${tenant.id}::uuid,
          ${product.productId}::uuid,
          'active',
          ${amount},
          null,
          ${currency},
          0,
          'allow',
          ${sql.json(toJsonValue({
            importedBy: "v9_product_master",
            stockQuantityResetToZero: true
          }))}::jsonb,
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          status = 'active',
          rrp_price_amount = excluded.rrp_price_amount,
          wholesale_price_amount = null,
          currency = excluded.currency,
          lead_time_days = 0,
          backorder_policy = 'allow',
          metadata = public.retail_sellable_products.metadata || excluded.metadata,
          updated_at = now()
      `;
      retailSellablesSeeded += 1;

      await sql`
        insert into public.retail_product_stock (
          organisation_id,
          product_id,
          status,
          stock_quantity,
          lead_time_days,
          wholesale_price_amount,
          retail_price_amount,
          currency,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${tenant.id}::uuid,
          ${product.productId}::uuid,
          'active',
          0,
          0,
          null,
          ${amount},
          ${currency},
          ${sql.json(toJsonValue({
            importedBy: "v9_product_master",
            stockQuantityResetToZero: true
          }))}::jsonb,
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          status = 'active',
          stock_quantity = 0,
          lead_time_days = 0,
          wholesale_price_amount = null,
          retail_price_amount = excluded.retail_price_amount,
          currency = excluded.currency,
          metadata = public.retail_product_stock.metadata || excluded.metadata,
          updated_at = now()
      `;
      retailStockSeeded += 1;
    }
  }

  return {
    activeTenantCount: tenants.length,
    retailProductsPerTenant: sellableProducts.length,
    retailSellablesSeeded,
    retailStockSeeded,
    skippedIgnoredProducts: products.length - sellableProducts.length
  };
}

export function v9MasterListProductFromSourceSnapshot(value: unknown) {
  const snapshot = objectValue(value);
  const product = objectValue(snapshot.masterListProduct);
  const schema = cleanText(snapshot.masterListSchema, 100);

  return schema === V9_PRODUCT_MASTER_SCHEMA && cleanText(product.id, 80)
    ? product
    : null;
}

export function v9MasterListMetadataFromSourceSnapshot(value: unknown) {
  const snapshot = objectValue(value);

  return cleanText(snapshot.masterListSchema, 100) === V9_PRODUCT_MASTER_SCHEMA
    ? {
        generatedAt: cleanText(snapshot.masterListGeneratedAt, 80),
        scope: cleanText(snapshot.masterListScope, 500),
        summary: snapshot.masterListSummary ?? null
      }
    : null;
}
