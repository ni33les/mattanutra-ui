import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSql } from "@/lib/db";

type FdaSearchRow = Readonly<{
  Addr?: unknown;
  IDA?: unknown;
  Newcode?: unknown;
  STATUS_ID?: unknown;
  URLs_NEW?: unknown;
  catalogue_no?: unknown;
  cncnm?: unknown;
  division_code?: unknown;
  engcntnm?: unknown;
  frgn_addr?: unknown;
  frgn_name?: unknown;
  lcnno?: unknown;
  licen?: unknown;
  productha?: unknown;
  produceng?: unknown;
  thanm?: unknown;
  typeallow?: unknown;
  typepro?: unknown;
}>;

type NormalizedFdaProduct = Readonly<{
  address: string | null;
  category: string | null;
  fdaId: string | null;
  holderName: string | null;
  licenseNumber: string | null;
  marketAuthorizationType: string | null;
  newCode: string | null;
  productNameEnglish: string | null;
  productNameThai: string | null;
  productUrl: string;
  raw: FdaSearchRow;
  sourceTerm: string;
  statusId: string | null;
  statusText: string | null;
  title: string;
}>;

type ImportSummary = {
  applied: boolean;
  fetched: number;
  importedOrUpdated: number;
  sample: NormalizedFdaProduct[];
  terms: string[];
  unique: number;
  wroteFile: string | null;
};

const FDA_SEARCH_ENDPOINT =
  "https://porta.fda.moph.go.th/FDA_SEARCH_CENTER_BACKEND/SEACH_ALL/GET_SEARCH";
const FDA_DETAIL_BASE =
  "https://profile.fda.moph.go.th/fda_serach_mode_main/page4/";

const DEFAULT_TERMS = [
  "วิตามิน",
  "วิตามินรวม",
  "ผลิตภัณฑ์เสริมอาหาร",
  "อาหารเสริม",
  "แร่ธาตุ",
  "ซิงค์",
  "แมกนีเซียม",
  "วิตามินซี",
  "วิตามินดี",
  "โอเมก้า",
  "คอลลาเจน",
  "โปรไบโอติก",
  "multivitamin",
  "vitamin supplement",
  "mineral supplement",
  "omega supplement",
  "collagen supplement",
  "probiotic supplement"
];

function argValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));

  return match ? match.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function cleanText(value: unknown, max = 1000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();

  return normalized ? normalized.slice(0, max) : null;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9ก-๙]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";

    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function titleFromNames(thai: string | null, english: string | null) {
  if (english && thai && english.toLowerCase() !== thai.toLowerCase()) {
    return `${english} / ${thai}`;
  }

  return english ?? thai ?? "Thai FDA registered product";
}

function detailUrl(row: FdaSearchRow) {
  const url = cleanText(row.URLs_NEW, 2000);

  if (url?.startsWith("https://")) {
    return url;
  }

  const newCode = cleanText(row.Newcode, 300);

  if (newCode) {
    return `${FDA_DETAIL_BASE}?NEWCODE=${encodeURIComponent(newCode)}`;
  }

  return "https://porta.fda.moph.go.th/fda_search_center_new/";
}

function normalizeRow(row: FdaSearchRow, sourceTerm: string): NormalizedFdaProduct {
  const productNameThai = cleanText(row.productha, 1200);
  const productNameEnglish = cleanText(row.produceng, 1200);
  const title = titleFromNames(productNameThai, productNameEnglish);

  return {
    address: cleanText(row.Addr, 1200),
    category: cleanText(row.typepro, 300),
    fdaId: cleanText(row.IDA, 120),
    holderName: cleanText(row.thanm, 300) ?? cleanText(row.licen, 300),
    licenseNumber: cleanText(row.lcnno, 120),
    marketAuthorizationType: cleanText(row.typeallow, 120),
    newCode: cleanText(row.Newcode, 300),
    productNameEnglish,
    productNameThai,
    productUrl: detailUrl(row),
    raw: row,
    sourceTerm,
    statusId: cleanText(row.STATUS_ID, 80),
    statusText: cleanText(row.cncnm, 500),
    title
  };
}

function dedupeKey(product: NormalizedFdaProduct) {
  return (
    product.newCode ??
    product.licenseNumber ??
    `${normalizeKey(product.title)}:${normalizeKey(product.holderName ?? "")}`
  );
}

function termsFromArgs() {
  const raw = argValue("terms");

  if (!raw) {
    return DEFAULT_TERMS;
  }

  const terms = raw
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 3);

  return terms.length ? terms : DEFAULT_TERMS;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchThaiFda(term: string) {
  const model = {
    SEARCH_VALUE: term,
    RADIO_TYPE: "สืบค้นแยกรายผลิตภัณฑ์",
    RADIO_TYPE_ETC_FOOD: "Y",
    RADIO_TYPE_ETC_DRUG: null,
    RADIO_TYPE_ETC_HERB: null,
    RADIO_TYPE_ETC_TXC: null,
    RADIO_TYPE_ETC_CMT: null,
    RADIO_TYPE_ETC_NCT: null,
    RADIO_TYPE_ETC_MDC: null,
    RADIO_TYPE_ETC_ADVER: null,
    RADIO_TYPE_LOCATION: null
  };
  const form = new FormData();
  form.set("MODEL", JSON.stringify(model));
  form.set("search_input", term);

  const response = await fetch(FDA_SEARCH_ENDPOINT, {
    body: form,
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Thai FDA search failed for "${term}" with ${response.status}`);
  }

  const payload = await response.json();

  return Array.isArray(payload)
    ? payload.map((row) => normalizeRow(row as FdaSearchRow, term))
    : [];
}

async function collectProducts(
  terms: readonly string[],
  limit: number,
  delayMs: number
) {
  const rows: NormalizedFdaProduct[] = [];
  const unique = new Map<string, NormalizedFdaProduct>();

  for (const term of terms) {
    const products = await searchThaiFda(term);
    rows.push(...products);

    for (const product of products) {
      if (!unique.has(dedupeKey(product))) {
        unique.set(dedupeKey(product), product);
      }

      if (unique.size >= limit) {
        return {
          fetched: rows.length,
          products: [...unique.values()].slice(0, limit)
        };
      }
    }

    await sleep(delayMs);
  }

  return {
    fetched: rows.length,
    products: [...unique.values()].slice(0, limit)
  };
}

async function writeOutput(
  outputPath: string | null,
  products: readonly NormalizedFdaProduct[]
) {
  if (!outputPath) {
    return null;
  }

  const absolute = path.resolve(process.cwd(), outputPath);
  const temporary = `${absolute}.tmp`;

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await rename(temporary, absolute);

  return absolute;
}

async function upsertBrand(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandName: string | null
) {
  if (!brandName) {
    return null;
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.product_brands (
      name,
      normalized_name,
      list_status,
      created_at,
      updated_at
    )
    values (
      ${brandName},
      ${normalizeKey(brandName)},
      'unknown',
      now(),
      now()
    )
    on conflict (normalized_name) do update set
      name = excluded.name,
      updated_at = now()
    returning id::text
  `;

  return rows[0]?.id ?? null;
}

async function upsertProduct(
  sql: NonNullable<ReturnType<typeof getSql>>,
  product: NormalizedFdaProduct
) {
  const brandId = await upsertBrand(sql, product.holderName);
  const normalized = normalizedUrl(product.productUrl);
  const adminNotes = [
    "Imported from Thai FDA public product search.",
    product.licenseNumber ? `License: ${product.licenseNumber}.` : null,
    product.newCode ? `Newcode: ${product.newCode}.` : null,
    product.statusText ? `FDA status: ${product.statusText}.` : null,
    product.marketAuthorizationType
      ? `Authorization type: ${product.marketAuthorizationType}.`
      : null
  ].filter(Boolean).join(" ");

  const rows = await sql<Array<{ id: string; inserted: boolean }>>`
    insert into public.marketplace_products (
      platform,
      region,
      marketplace_product_id,
      title,
      normalized_title,
      brand_id,
      brand_name,
      normalized_brand_name,
      product_url,
      normalized_url,
      description,
      category,
      list_status,
      label_status,
      availability_status,
      affiliate_status,
      currency,
      source,
      admin_notes,
      created_at,
      updated_at
    )
    values (
      'manual',
      'TH',
      ${product.newCode ?? product.licenseNumber ?? product.fdaId},
      ${product.title},
      ${normalizeKey(product.title)},
      ${brandId}::uuid,
      ${product.holderName},
      ${product.holderName ? normalizeKey(product.holderName) : null},
      ${product.productUrl},
      ${normalized},
      ${product.productNameThai && product.productNameEnglish
        ? `${product.productNameThai}\n${product.productNameEnglish}`
        : product.productNameThai ?? product.productNameEnglish},
      ${product.category},
      'unknown',
      'missing',
      'unknown',
      'none',
      'THB',
      'thai_fda',
      ${adminNotes},
      now(),
      now()
    )
    on conflict (normalized_url) do update set
      marketplace_product_id = coalesce(excluded.marketplace_product_id, marketplace_products.marketplace_product_id),
      title = excluded.title,
      normalized_title = excluded.normalized_title,
      brand_id = excluded.brand_id,
      brand_name = excluded.brand_name,
      normalized_brand_name = excluded.normalized_brand_name,
      description = coalesce(excluded.description, marketplace_products.description),
      category = coalesce(excluded.category, marketplace_products.category),
      source = case
        when marketplace_products.source = 'admin' then marketplace_products.source
        else excluded.source
      end,
      admin_notes = excluded.admin_notes,
      updated_at = now()
    returning id::text, (xmax = 0) as inserted
  `;
  const row = rows[0];

  if (!row) {
    throw new Error(`Thai FDA product import failed for ${product.title}`);
  }

  await sql`
    insert into public.product_admin_audit (
      product_id,
      actor,
      action,
      after_payload
    )
    values (
      ${row.id}::uuid,
      'thai_fda_importer',
      ${row.inserted ? "thai_fda_product_imported" : "thai_fda_product_refreshed"},
      ${sql.json({
        category: product.category,
        licenseNumber: product.licenseNumber,
        newCode: product.newCode,
        productUrl: product.productUrl,
        sourceTerm: product.sourceTerm,
        statusText: product.statusText,
        title: product.title
      })}::jsonb
    )
  `;

  return row.id;
}

async function applyProducts(products: readonly NormalizedFdaProduct[]) {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_CONNECTION is required when --apply is used");
  }

  let importedOrUpdated = 0;

  for (const product of products) {
    await upsertProduct(sql, product);
    importedOrUpdated += 1;
  }

  await sql.end({ timeout: 5 });

  return importedOrUpdated;
}

async function main() {
  const apply = hasArg("apply");
  const delayMs = positiveInt(argValue("delay-ms"), 350);
  const limit = positiveInt(argValue("limit"), apply ? 500 : 50);
  const outputPath = argValue("out");
  const terms = termsFromArgs();
  const { fetched, products } = await collectProducts(terms, limit, delayMs);
  const wroteFile = await writeOutput(outputPath, products);
  const importedOrUpdated = apply ? await applyProducts(products) : 0;
  const summary: ImportSummary = {
    applied: apply,
    fetched,
    importedOrUpdated,
    sample: products.slice(0, 5),
    terms,
    unique: products.length,
    wroteFile
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
