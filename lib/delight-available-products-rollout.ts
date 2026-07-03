import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { toJsonValue } from "@/lib/assessment-store";
import { isUuidValue } from "@/lib/admin-product-helpers";
import { refreshAndPersistProductValidations } from "@/lib/admin-product-writes";
import { getRetailerAwareProductRecommendationCandidateSets } from "@/lib/admin-product-search";
import { closeSqlPool, getSql } from "@/lib/db";
import { normalizeProductKey } from "@/lib/product-recommendations";
import {
  assertProductListRolloutDatabaseTarget,
  type ProductListRolloutEnvironment
} from "@/lib/product-list-rollout";
import {
  assertPrdApplyConfirmation,
  assertPrdDatabaseTarget,
  assertPrdPreserveConfirmation,
  assertPrdRuntimeEnvironment
} from "@/lib/prd-rollout-safety";

export type DelightAvailableProductsRolloutEnvironment =
  | ProductListRolloutEnvironment
  | "prd";

export type DelightAvailableProductBlocker =
  | "country_blocked_supplement"
  | "missing_brand"
  | "missing_matchable_fact"
  | "missing_th_price"
  | "product_unavailable"
  | "unapproved_product"
  | "validation_not_pass";

export type DelightAvailableProductCandidate = Readonly<{
  availabilityStatus: string | null;
  brandId: string | null;
  brandName: string | null;
  brandStatus: string | null;
  currency: string | null;
  delightSellableStatus: string | null;
  hasBrandThailand: boolean;
  matchableFactCount: number;
  productId: string;
  productStatus: string;
  rrpPriceAmount: number | null;
  title: string;
  validationStatus: string | null;
  blockedSupplementCount: number;
}>;

export type DelightAvailableProductDecision = Readonly<{
  blockers: DelightAvailableProductBlocker[];
  candidate: DelightAvailableProductCandidate;
  selected: boolean;
  willRepairBrand: boolean;
  willRepairBrandCountry: boolean;
}>;

export type DelightAvailableProductsRolloutSummary = Readonly<{
  applied: boolean;
  blocked: number;
  blockerCounts: Record<DelightAvailableProductBlocker, number>;
  copied: number;
  dryRun: boolean;
  environment: DelightAvailableProductsRolloutEnvironment;
  generatedAt: string;
  reportDirectory: string;
  repairedBrandCountries: number;
  repairedBrands: number;
  selected: number;
  stockRowsInserted: number;
  totalProductsReviewed: number;
  validationMatchedCopiedCount: number;
}>;

export type RunDelightAvailableProductsRolloutInput = Readonly<{
  apply?: boolean;
  dbUrl?: string | null;
  environment: DelightAvailableProductsRolloutEnvironment;
  outputDir?: string | null;
}>;

type Db = NonNullable<ReturnType<typeof getSql>>;

const ROLLOUT_SOURCE = "delight_available_product_rollout";
const DELIGHT_ORG_SLUG = "delight-pharmacy";
const DEFAULT_LEAD_TIME_DAYS = 5;
const EMPTY_BLOCKER_COUNTS: Record<DelightAvailableProductBlocker, number> = {
  country_blocked_supplement: 0,
  missing_brand: 0,
  missing_matchable_fact: 0,
  missing_th_price: 0,
  product_unavailable: 0,
  unapproved_product: 0,
  validation_not_pass: 0
};

type CandidateRow = Readonly<{
  availability_status: string | null;
  blocked_supplement_count: number | string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_status: string | null;
  currency: string | null;
  delight_sellable_status: string | null;
  has_brand_thailand: boolean | null;
  matchable_fact_count: number | string | null;
  product_id: string;
  product_status: string;
  rrp_price_amount: number | string | null;
  title: string;
  validation_status: string | null;
}>;

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvLine(values: readonly unknown[]) {
  return values.map(csvCell).join(",");
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positivePrice(value: unknown) {
  const parsed = numberOrNull(value);

  return parsed !== null && parsed > 0 ? parsed : null;
}

function intCount(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function cleanCurrency(value: unknown) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";

  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function candidateFromRow(row: CandidateRow): DelightAvailableProductCandidate {
  return {
    availabilityStatus: row.availability_status,
    blockedSupplementCount: intCount(row.blocked_supplement_count),
    brandId: row.brand_id,
    brandName: row.brand_name,
    brandStatus: row.brand_status,
    currency: cleanCurrency(row.currency),
    delightSellableStatus: row.delight_sellable_status,
    hasBrandThailand: Boolean(row.has_brand_thailand),
    matchableFactCount: intCount(row.matchable_fact_count),
    productId: row.product_id,
    productStatus: row.product_status,
    rrpPriceAmount: positivePrice(row.rrp_price_amount),
    title: row.title,
    validationStatus: row.validation_status
  };
}

export function decideDelightAvailableProduct(
  candidate: DelightAvailableProductCandidate
): DelightAvailableProductDecision {
  const blockers: DelightAvailableProductBlocker[] = [];

  if (candidate.productStatus !== "approved") {
    blockers.push("unapproved_product");
  }

  if (candidate.availabilityStatus === "unavailable") {
    blockers.push("product_unavailable");
  }

  if (candidate.rrpPriceAmount === null || !candidate.currency) {
    blockers.push("missing_th_price");
  }

  if (!candidate.brandName && !candidate.brandId) {
    blockers.push("missing_brand");
  }

  if (candidate.validationStatus !== "pass") {
    blockers.push("validation_not_pass");
  }

  if (candidate.matchableFactCount < 1) {
    blockers.push("missing_matchable_fact");
  }

  if (candidate.blockedSupplementCount > 0) {
    blockers.push("country_blocked_supplement");
  }

  const willRepairBrand = Boolean(
    candidate.brandName && candidate.brandStatus !== "approved"
  );
  const willRepairBrandCountry = Boolean(
    candidate.brandName && !candidate.hasBrandThailand
  );

  return {
    blockers,
    candidate,
    selected: blockers.length < 1,
    willRepairBrand,
    willRepairBrandCountry
  };
}

function addBlockerCounts(
  counts: Record<DelightAvailableProductBlocker, number>,
  blockers: readonly DelightAvailableProductBlocker[]
) {
  for (const blocker of blockers) {
    counts[blocker] += 1;
  }
}

function defaultOutputDir(environment: DelightAvailableProductsRolloutEnvironment) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return path.join("reports", "delight-available-products", `${environment}-${stamp}`);
}

export function assertDelightAvailableProductsRolloutTarget(input: Readonly<{
  apply: boolean;
  dbUrl?: string | null;
  environment: DelightAvailableProductsRolloutEnvironment;
}>) {
  if (input.environment !== "prd") {
    assertProductListRolloutDatabaseTarget(input.dbUrl ?? undefined, input.environment);
    return;
  }

  assertPrdRuntimeEnvironment();
  assertPrdDatabaseTarget(input.dbUrl, "PRD_DB_URL/DB_URL");

  if (input.apply) {
    assertPrdPreserveConfirmation();
    assertPrdApplyConfirmation({
      envName: "MATTANUTRA_CONFIRM_PRD_DELIGHT_COPY",
      expected: "copy-delight",
      label: "PRD Delight available product copy"
    });
  }
}

async function writeReportFile(filePath: string, contents: string) {
  const tmp = `${filePath}.tmp`;

  await writeFile(tmp, contents, "utf8");
  await rename(tmp, filePath);
}

async function writeCsvReport(
  filePath: string,
  header: readonly unknown[],
  rows: readonly (readonly unknown[])[]
) {
  await writeReportFile(
    filePath,
    [csvLine(header), ...rows.map(csvLine)].join("\n") + "\n"
  );
}

async function delightOrganisationId(sql: Db) {
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where slug = ${DELIGHT_ORG_SLUG}
      and organisation_type = 'tenant'
      and status = 'active'
    limit 1
  `;
  const id = rows[0]?.id;

  if (!id) {
    throw new Error("Active delight-pharmacy organisation was not found");
  }

  return id;
}

async function loadCandidateRows(sql: Db): Promise<DelightAvailableProductCandidate[]> {
  const rows = await sql<CandidateRow[]>`
    select
      products.id::text as product_id,
      products.title,
      products.status as product_status,
      products.availability_status,
      products.brand_id::text,
      products.brand_name,
      product_brands.status as brand_status,
      products.validation_status,
      product_countries.rrp_price_amount,
      product_countries.currency,
      exists (
        select 1
        from public.product_brand_countries product_brand_countries
        where product_brand_countries.brand_id = product_brands.id
          and product_brand_countries.country_code = 'TH'
      ) as has_brand_thailand,
      coalesce(facts.matchable_fact_count, 0)::int as matchable_fact_count,
      coalesce(facts.blocked_supplement_count, 0)::int as blocked_supplement_count,
      delight_sellable.status as delight_sellable_status
    from public.products products
    left join public.product_brands product_brands
      on product_brands.id = products.brand_id
    left join public.product_countries product_countries
      on product_countries.product_id = products.id
      and product_countries.country_code = 'TH'
    left join public.organisations delight
      on delight.slug = ${DELIGHT_ORG_SLUG}
    left join public.retail_sellable_products delight_sellable
      on delight_sellable.organisation_id = delight.id
      and delight_sellable.product_id = products.id
    left join lateral (
      select
        count(*) filter (
          where product_facts.supplement_id is not null
            and product_facts.amount is not null
            and product_facts.unit is not null
            and coalesce(product_facts.item_type, 'supplement') = 'supplement'
        )::int as matchable_fact_count,
        count(*) filter (
          where country_availability.status = 'blocked'
            or source_country_availability.status = 'blocked'
        )::int as blocked_supplement_count
      from public.product_facts product_facts
      left join public.supplement_country_availability country_availability
        on country_availability.supplement_id = product_facts.supplement_id
        and country_availability.country_code = 'TH'
      left join public.supplements supplements
        on supplements.id = product_facts.supplement_id
      left join lateral (
        select rule.status
        from jsonb_to_recordset(
          case
            when jsonb_typeof(supplements.source_payload -> 'countryAvailability') = 'array'
              then supplements.source_payload -> 'countryAvailability'
            else '[]'::jsonb
          end
        ) as rule("countryCode" text, country_code text, status text)
        where coalesce(rule."countryCode", rule.country_code) = 'TH'
          and rule.status in ('allowed', 'blocked')
        limit 1
      ) source_country_availability on true
      where product_facts.product_id = products.id
    ) facts on true
    where products.status <> 'deleted'
    order by products.title, products.id
  `;

  return rows.map(candidateFromRow);
}

async function repairBrandsForCandidates(
  sql: Db,
  decisions: readonly DelightAvailableProductDecision[]
) {
  const repairable = decisions.filter((decision) =>
    decision.selected &&
    decision.candidate.brandName &&
    (decision.willRepairBrand || decision.willRepairBrandCountry || !decision.candidate.brandId)
  );
  let repairedBrands = 0;
  let repairedBrandCountries = 0;

  for (const decision of repairable) {
    const brandName = decision.candidate.brandName!;
    const normalizedName = normalizeProductKey(brandName);
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
        ${brandName},
        ${normalizedName},
        'approved',
        'TH',
        now(),
        now()
      )
      on conflict (normalized_name) do update set
        name = excluded.name,
        status = 'approved',
        country_code = 'TH',
        updated_at = now()
      returning id::text
    `;
    const brandId = rows[0]?.id;

    if (!brandId) {
      continue;
    }

    if (decision.willRepairBrand || !decision.candidate.brandId) {
      repairedBrands += 1;
    }

    if (!decision.candidate.brandId) {
      await sql`
        update public.products
        set
          brand_id = ${brandId}::uuid,
          normalized_brand_name = ${normalizedName},
          updated_at = now()
        where id = ${decision.candidate.productId}::uuid
          and brand_id is null
      `;
    }

    const countryRows = await sql<Array<{ inserted: boolean }>>`
      insert into public.product_brand_countries (
        brand_id,
        country_code,
        created_at,
        updated_at
      )
      values (${brandId}::uuid, 'TH', now(), now())
      on conflict (brand_id, country_code) do update set
        updated_at = excluded.updated_at
      returning (xmax = 0) as inserted
    `;

    if (countryRows[0]?.inserted || decision.willRepairBrandCountry) {
      repairedBrandCountries += 1;
    }
  }

  return { repairedBrandCountries, repairedBrands };
}

async function upsertDelightSellables(input: Readonly<{
  decisions: readonly DelightAvailableProductDecision[];
  organisationId: string;
  sql: Db;
}>) {
  let copied = 0;
  let stockRowsInserted = 0;

  for (const decision of input.decisions.filter((item) => item.selected)) {
    const product = decision.candidate;

    await input.sql`
      insert into public.retail_sellable_products (
        organisation_id,
        product_id,
        status,
        rrp_price_amount,
        currency,
        lead_time_days,
        backorder_policy,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${input.organisationId}::uuid,
        ${product.productId}::uuid,
        'active',
        ${product.rrpPriceAmount},
        ${product.currency ?? "THB"},
        ${DEFAULT_LEAD_TIME_DAYS},
        'allow',
        ${input.sql.json(toJsonValue({
          copiedAt: new Date().toISOString(),
          source: ROLLOUT_SOURCE
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (organisation_id, product_id) do update set
        status = 'active',
        rrp_price_amount = excluded.rrp_price_amount,
        currency = excluded.currency,
        lead_time_days = excluded.lead_time_days,
        backorder_policy = 'allow',
        metadata = public.retail_sellable_products.metadata || excluded.metadata,
        updated_at = now()
    `;
    copied += 1;

    const stockRows = await input.sql<Array<{ id: string }>>`
      insert into public.retail_product_stock (
        organisation_id,
        product_id,
        status,
        stock_quantity,
        lead_time_days,
        retail_price_amount,
        currency,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${input.organisationId}::uuid,
        ${product.productId}::uuid,
        'active',
        0,
        ${DEFAULT_LEAD_TIME_DAYS},
        ${product.rrpPriceAmount},
        ${product.currency ?? "THB"},
        ${input.sql.json(toJsonValue({
          copiedAt: new Date().toISOString(),
          source: ROLLOUT_SOURCE
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (organisation_id, product_id) do nothing
      returning id::text
    `;

    if (stockRows.length > 0) {
      stockRowsInserted += stockRows.length;
    } else {
      await input.sql`
        update public.retail_product_stock
        set
          status = 'active',
          lead_time_days = ${DEFAULT_LEAD_TIME_DAYS},
          retail_price_amount = ${product.rrpPriceAmount},
          currency = ${product.currency ?? "THB"},
          metadata = public.retail_product_stock.metadata || ${input.sql.json(toJsonValue({
            copiedAt: new Date().toISOString(),
            source: ROLLOUT_SOURCE
          }))}::jsonb,
          updated_at = now()
        where organisation_id = ${input.organisationId}::uuid
          and product_id = ${product.productId}::uuid
      `;
    }
  }

  return { copied, stockRowsInserted };
}

async function auditRollout(input: Readonly<{
  copied: number;
  organisationId: string;
  productIds: readonly string[];
  sql: Db;
}>) {
  if (input.productIds.length < 1) {
    return;
  }

  await input.sql`
    insert into public.product_admin_audit (
      action,
      actor,
      after_payload
    )
    values (
      'delight_available_products_copied',
      ${ROLLOUT_SOURCE},
      ${input.sql.json(toJsonValue({
        copied: input.copied,
        organisationId: input.organisationId,
        productIds: input.productIds,
        source: ROLLOUT_SOURCE
      }))}::jsonb
    )
  `;
}

async function validationMatchedCopiedCount(input: Readonly<{
  organisationId: string;
  productIds: readonly string[];
  sql: Db;
}>) {
  if (input.productIds.length < 1) {
    return 0;
  }

  const copied = new Set(input.productIds);
  const candidateSets = await getRetailerAwareProductRecommendationCandidateSets({
    countryCode: "TH",
    includeIneligible: false,
    sql: input.sql
  });
  const delightSet = candidateSets.find(
    (set) => set.organisationId === input.organisationId
  );

  return delightSet?.candidates.filter((candidate) => copied.has(candidate.id)).length ?? 0;
}

async function writeReports(input: Readonly<{
  decisions: readonly DelightAvailableProductDecision[];
  outputDir: string;
  summary: DelightAvailableProductsRolloutSummary;
}>) {
  await mkdir(input.outputDir, { recursive: true });
  await writeReportFile(
    path.join(input.outputDir, "summary.json"),
    `${JSON.stringify(input.summary, null, 2)}\n`
  );
  await writeCsvReport(
    path.join(input.outputDir, "selected_products.csv"),
    [
      "product_id",
      "title",
      "brand_name",
      "rrp_price_amount",
      "currency",
      "delight_sellable_status",
      "will_repair_brand",
      "will_repair_brand_country"
    ],
    input.decisions
      .filter((decision) => decision.selected)
      .map((decision) => [
        decision.candidate.productId,
        decision.candidate.title,
        decision.candidate.brandName,
        decision.candidate.rrpPriceAmount,
        decision.candidate.currency,
        decision.candidate.delightSellableStatus,
        decision.willRepairBrand,
        decision.willRepairBrandCountry
      ])
  );
  await writeCsvReport(
    path.join(input.outputDir, "blocked_products.csv"),
    [
      "product_id",
      "title",
      "brand_name",
      "product_status",
      "availability_status",
      "validation_status",
      "matchable_fact_count",
      "blocked_supplement_count",
      "rrp_price_amount",
      "currency",
      "blockers"
    ],
    input.decisions
      .filter((decision) => !decision.selected)
      .map((decision) => [
        decision.candidate.productId,
        decision.candidate.title,
        decision.candidate.brandName,
        decision.candidate.productStatus,
        decision.candidate.availabilityStatus,
        decision.candidate.validationStatus,
        decision.candidate.matchableFactCount,
        decision.candidate.blockedSupplementCount,
        decision.candidate.rrpPriceAmount,
        decision.candidate.currency,
        decision.blockers.join("|")
      ])
  );
}

export async function runDelightAvailableProductsRollout(
  input: RunDelightAvailableProductsRolloutInput
) {
  if (input.dbUrl) {
    process.env.DB_URL = input.dbUrl;
  }

  process.env.MATTANUTRA_ENV = input.environment;
  assertDelightAvailableProductsRolloutTarget({
    apply: Boolean(input.apply),
    dbUrl: process.env.DB_URL,
    environment: input.environment
  });

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const outputDir = input.outputDir ?? defaultOutputDir(input.environment);
  const organisationId = await delightOrganisationId(sql);
  let candidates = await loadCandidateRows(sql);
  let decisions = candidates.map(decideDelightAvailableProduct);
  let repairedBrands = 0;
  let repairedBrandCountries = 0;
  let copied = 0;
  let stockRowsInserted = 0;
  let validationMatchedCount = 0;

  if (input.apply) {
    const refreshProductIds = candidates
      .filter((candidate) =>
        candidate.productStatus === "approved" &&
        candidate.availabilityStatus !== "unavailable" &&
        candidate.rrpPriceAmount !== null &&
        isUuidValue(candidate.productId)
      )
      .map((candidate) => candidate.productId);

    await refreshAndPersistProductValidations(sql, refreshProductIds);
    candidates = await loadCandidateRows(sql);
    decisions = candidates.map(decideDelightAvailableProduct);

    const repairResult = await repairBrandsForCandidates(sql, decisions);

    repairedBrands = repairResult.repairedBrands;
    repairedBrandCountries = repairResult.repairedBrandCountries;

    candidates = await loadCandidateRows(sql);
    decisions = candidates.map(decideDelightAvailableProduct);

    const selected = decisions.filter((decision) => decision.selected);
    const upsertResult = await upsertDelightSellables({
      decisions: selected,
      organisationId,
      sql
    });

    copied = upsertResult.copied;
    stockRowsInserted = upsertResult.stockRowsInserted;
    validationMatchedCount = await validationMatchedCopiedCount({
      organisationId,
      productIds: selected.map((decision) => decision.candidate.productId),
      sql
    });
    await auditRollout({
      copied,
      organisationId,
      productIds: selected.map((decision) => decision.candidate.productId),
      sql
    });
  }

  const blockerCounts = { ...EMPTY_BLOCKER_COUNTS };

  for (const decision of decisions) {
    addBlockerCounts(blockerCounts, decision.blockers);
  }

  const summary: DelightAvailableProductsRolloutSummary = {
    applied: Boolean(input.apply),
    blocked: decisions.filter((decision) => !decision.selected).length,
    blockerCounts,
    copied,
    dryRun: !input.apply,
    environment: input.environment,
    generatedAt: new Date().toISOString(),
    reportDirectory: outputDir,
    repairedBrandCountries,
    repairedBrands,
    selected: decisions.filter((decision) => decision.selected).length,
    stockRowsInserted,
    totalProductsReviewed: decisions.length,
    validationMatchedCopiedCount: validationMatchedCount
  };

  await writeReports({ decisions, outputDir, summary });
  await closeSqlPool();

  return summary;
}
