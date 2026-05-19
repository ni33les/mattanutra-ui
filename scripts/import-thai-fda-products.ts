import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSql } from "@/lib/db";
import { stageProductImport } from "@/lib/admin-products";

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

async function applyProducts(products: readonly NormalizedFdaProduct[]) {
  let importedOrUpdated = 0;

  for (const product of products) {
    await stageProductImport({
      actor: "thai_fda_importer",
      brandName: product.holderName || "Unknown FDA holder",
      fdaApprovalNumber: product.licenseNumber ?? product.newCode ?? product.fdaId,
      parsedFacts: [],
      parseConfidence: "low",
      productTitle: product.title,
      rawSnapshot: {
        category: product.category,
        licenseNumber: product.licenseNumber,
        marketAuthorizationType: product.marketAuthorizationType,
        newCode: product.newCode,
        productNameEnglish: product.productNameEnglish,
        productNameThai: product.productNameThai,
        sourceTerm: product.sourceTerm,
        statusText: product.statusText
      },
      source: "thai_fda",
      sourceUrl: product.productUrl
    });
    importedOrUpdated += 1;
  }

  const sql = getSql();

  await sql?.end({ timeout: 5 });

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
