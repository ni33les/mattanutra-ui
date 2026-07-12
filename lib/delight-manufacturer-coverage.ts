import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { toJsonValue } from "@/lib/assessment-store";
import { closeSqlPool, getSql } from "@/lib/db";
import {
  finishProductImportRun,
  stageProductImport,
  startProductImportRun,
  type ProductImportFactInput
} from "@/lib/admin-products";
import { normalizeProductKey } from "@/lib/product-recommendations";
import { fdaApprovalNumberFromText } from "@/lib/product-fda-sourcing";
import {
  delay,
  fetchHtml,
  normalizedUrlWithoutHash,
  productUrlsFromListingHtml
} from "../scripts/manufacturer-scrape-core.ts";
import {
  cleanHtmlText,
  descriptionFromHtml,
  imageUrlsFromHtml,
  jsonLdProductRecordsFromHtml,
  productJsonLdImagesFromHtml,
  textFromHtml,
  titleFromHtml
} from "../scripts/manufacturer-scrape-html.ts";
import {
  fdaNumberFromText,
  parsedFactsFromHtml
} from "../scripts/manufacturer-scrape-facts.ts";

const execFileAsync = promisify(execFile);

export const DELIGHT_PRODUCT_SHEET_NAME = "Product";
export const DEFAULT_DELIGHT_ORGANISATION_NAME = "Delight Pharmacy";

type SourceKind = "manufacturer" | "brand" | "regulatory" | "trusted_retailer";
type SourceCoverage = "existing_supported" | "official_catalogue" | "official_products" | "fallback_only";

export type DelightSheetProductRow = Readonly<{
  brandName: string;
  costAmount: number | null;
  productName: string;
  registerNumber: string | null;
  rowNumber: number;
  sellingPriceAmount: number | null;
  unit: string | null;
}>;

export type DelightManufacturerSource = Readonly<{
  kind: "catalogue" | "product";
  locale?: string;
  maxPages?: number;
  sourceKind: SourceKind;
  url: string;
  urlPattern?: RegExp;
}>;

export type DelightBrandSourcePolicy = Readonly<{
  brandName: string;
  coverage: SourceCoverage;
  notes: string;
  sources: readonly DelightManufacturerSource[];
}>;

export type DelightImportedProductCandidate = Readonly<{
  brandName: string;
  description: string | null;
  evidenceQuality: "official" | "fallback";
  fdaApprovalNumber: string | null;
  imageUrls: readonly string[];
  parsedFacts: readonly ProductImportFactInput[];
  productTitle: string;
  rawSnapshot: Record<string, unknown>;
  source: string;
  sourceUrl: string;
  translations: Record<string, {
    description?: string | null;
    status?: "complete" | "draft" | "missing";
    title?: string | null;
  }>;
}>;

export type DelightExistingProduct = Readonly<{
  brandName: string | null;
  fdaApprovalNumber: string | null;
  id: string;
  imageUrl: string | null;
  normalizedBrandName: string | null;
  normalizedTitle: string;
  productUrl: string;
  regulatoryApprovalNumbers: readonly string[];
  sourceUrl: string | null;
  status: string;
  title: string;
}>;

export type DelightCoverageMatch = Readonly<{
  confidence: number;
  matchKind: "exact_register" | "exact_title" | "token_match" | "ambiguous" | "missing";
  productId: string | null;
  productTitle: string | null;
  row: DelightSheetProductRow;
  sourceUrl: string | null;
}>;

export type DelightCoverageReport = Readonly<{
  appliedDelight: boolean;
  appliedMaster: boolean;
  candidates: {
    fallbackSheet: number;
    officialCatalogue: number;
    skippedExisting: number;
    staged: number;
  };
  generatedAt: string;
  matches: {
    ambiguous: number;
    matched: number;
    missing: number;
    rows: DelightCoverageMatch[];
  };
  plannedMasterCoverage: {
    ambiguous: number;
    matched: number;
    missing: number;
    rows: DelightCoverageMatch[];
  };
  retail: {
    disabled: number;
    matchedForUpdate: number;
    updated: number;
  };
  sheet: {
    brandCounts: Record<string, number>;
    rows: number;
  };
  sources: {
    brandCounts: Record<string, number>;
    failures: Array<{ brandName: string; message: string; url: string }>;
  };
  unmatchedSheetProducts: string[];
}>;

const SOURCE_BRANDS = [
  "ALINAMIN",
  "BANNER",
  "BEROCCA",
  "BIOLIV",
  "BLACKMORES",
  "C FORCE",
  "C-FORCE",
  "CALTRATE",
  "CDR",
  "CENTRUM",
  "DHC",
  "EVEREST HEALTH+",
  "FIT",
  "FLORACTO",
  "HAEMOVIT",
  "KAL",
  "LUTEINA",
  "MAXXLIFE",
  "MEGA WE CARE",
  "MEGA",
  "NEOCA",
  "NUVITRA",
  "OBIMIN",
  "PATAR",
  "PURE MED",
  "SUPHAP OSOD",
  "SURBEX",
  "SWISSE",
  "VIOTRUM",
  "VISTRA"
] as const;

const BRAND_ALIASES = new Map<string, string>([
  ["MEGA", "Mega We Care"],
  ["MEGA WE CARE", "Mega We Care"],
  ["BLACKMORES", "Blackmores"],
  ["VISTRA", "Vistra"],
  ["SWISSE", "Swisse"],
  ["DHC", "DHC"],
  ["CENTRUM", "Centrum"],
  ["NUVITRA", "Nuvitra"],
  ["MAXXLIFE", "Maxxlife"],
  ["CALTRATE", "Caltrate"],
  ["EVEREST HEALTH+", "Everest Health+"],
  ["FIT", "Fit"],
  ["PURE MED", "Pure Med"],
  ["BANNER", "Banner"],
  ["BEROCCA", "Berocca"],
  ["HAEMOVIT", "Haemovit"],
  ["ALINAMIN", "Alinamin"],
  ["BIOLIV", "Bioliv"],
  ["C FORCE", "C-Force"],
  ["C-FORCE", "C-Force"],
  ["CDR", "CDR"],
  ["FLORACTO", "Floracto"],
  ["KAL", "KAL"],
  ["LUTEINA", "Luteina"],
  ["NEOCA", "Neoca"],
  ["OBIMIN", "Obimin"],
  ["PATAR", "Patar"],
  ["SUPHAP OSOD", "Suphap Osod"],
  ["SURBEX", "Surbex"],
  ["VIOTRUM", "Viotrum"]
]);

export const DELIGHT_BRAND_SOURCE_POLICIES: readonly DelightBrandSourcePolicy[] = [
  {
    brandName: "Blackmores",
    coverage: "existing_supported",
    notes: "Covered by the existing first-class Blackmores manufacturer importer.",
    sources: [{ kind: "catalogue", sourceKind: "manufacturer", url: "https://www.blackmores.co.th/en/products/supplement" }]
  },
  {
    brandName: "Mega We Care",
    coverage: "existing_supported",
    notes: "Covered by the existing Mega We Care WordPress/API manufacturer importer.",
    sources: [{ kind: "catalogue", sourceKind: "manufacturer", url: "https://www.megawecare.co.th/en/product-category/supplement/" }]
  },
  {
    brandName: "Swisse",
    coverage: "existing_supported",
    notes: "Covered by the existing Swisse Thailand quality importer.",
    sources: [{ kind: "catalogue", sourceKind: "manufacturer", url: "https://swisse.co.th/collections/all" }]
  },
  {
    brandName: "Vistra",
    coverage: "existing_supported",
    notes: "Covered by the existing Vistra Thailand quality importer.",
    sources: [{ kind: "catalogue", sourceKind: "manufacturer", url: "https://www.vistra.co.th/product-category/heath-wellness_th/" }]
  },
  {
    brandName: "DHC",
    coverage: "existing_supported",
    notes: "Covered by the existing DHC supplement catalogue importer.",
    sources: [{ kind: "catalogue", sourceKind: "manufacturer", url: "https://www.dhc.co.jp/health/health/" }]
  },
  {
    brandName: "Centrum",
    coverage: "official_catalogue",
    notes: "Official Centrum product catalogue.",
    sources: [{ kind: "catalogue", sourceKind: "manufacturer", url: "https://www.centrum.com/products/", urlPattern: /\/products\/[^/?#]+\/[^/?#]+\/?$/i }]
  },
  {
    brandName: "Maxxlife",
    coverage: "official_catalogue",
    notes: "Official Maxxlife Thailand product catalogue.",
    sources: [{ kind: "catalogue", maxPages: 8, sourceKind: "manufacturer", url: "https://maxxlifethailand.com/all-product/", urlPattern: /\/product\//i }]
  },
  {
    brandName: "Caltrate",
    coverage: "official_catalogue",
    notes: "Official Caltrate product catalogue.",
    sources: [{ kind: "catalogue", sourceKind: "manufacturer", url: "https://www.caltrate.com/calcium-supplement-products/", urlPattern: /\/calcium-supplement-products\/[^/?#]+\/?$/i }]
  },
  {
    brandName: "Berocca",
    coverage: "official_products",
    notes: "Official Berocca Thailand and regional product pages.",
    sources: [
      { kind: "product", locale: "th", sourceKind: "manufacturer", url: "https://www.berocca.co.th/" },
      { kind: "catalogue", locale: "en", sourceKind: "manufacturer", url: "https://www.berocca.com.ph/products", urlPattern: /\/products\/[^/?#]+\/?$/i }
    ]
  },
  {
    brandName: "CDR",
    coverage: "official_products",
    notes: "Official CDR Indonesia pages used as brand/manufacturer evidence where Thailand pages are unavailable.",
    sources: [
      { kind: "product", sourceKind: "manufacturer", url: "https://www.cdr.co.id/produk/cdr" },
      { kind: "product", sourceKind: "manufacturer", url: "https://www.cdr.co.id/produk/cdr-fortos" }
    ]
  },
  {
    brandName: "Alinamin",
    coverage: "official_products",
    notes: "Official Alinamin product pages.",
    sources: [
      { kind: "catalogue", sourceKind: "manufacturer", url: "https://alinamin-pharma.co.jp/en/products/", urlPattern: /\/products\/.+/i },
      { kind: "product", sourceKind: "manufacturer", url: "https://alinamin-kenko.jp/en/products/vitamin/al_ex.html" }
    ]
  },
  {
    brandName: "Haemovit",
    coverage: "official_products",
    notes: "Official HealthAid Haemovit product page.",
    sources: [{ kind: "product", sourceKind: "manufacturer", url: "https://www.healthaid.co.uk/products/haemovit-tablets" }]
  },
  {
    brandName: "Obimin",
    coverage: "official_products",
    notes: "Official Unilab Obimin page/PDF where available.",
    sources: [
      { kind: "product", sourceKind: "manufacturer", url: "https://www.unilab.com.ph/obimin-plus/product-feature" },
      { kind: "product", sourceKind: "manufacturer", url: "https://unitedpharma.com.vn/wp-content/uploads/2019/12/Obimin.pdf" }
    ]
  },
  {
    brandName: "Surbex",
    coverage: "official_products",
    notes: "Thai FDA label evidence used because a stable manufacturer catalogue is not public.",
    sources: [{ kind: "product", sourceKind: "regulatory", url: "https://ndi.fda.moph.go.th/uploads/drug_detail_corporation/doc/word/1256/4b67accd86fdb0eb7a486839bcf394aa-a2.pdf" }]
  },
  {
    brandName: "Nuvitra",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Everest Health+",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Fit",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Pure Med",
    coverage: "fallback_only",
    notes: "No reliable official Thailand product catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Banner",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Bioliv",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "C-Force",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Floracto",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "KAL",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Luteina",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Neoca",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Patar",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Suphap Osod",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  },
  {
    brandName: "Viotrum",
    coverage: "fallback_only",
    notes: "No reliable official manufacturer catalogue identified; sheet/FDA evidence only.",
    sources: []
  }
];

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).replace(/\s+/g, " ").trim();

  return text ? text.slice(0, max) : null;
}

function numericAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = cleanText(value, 100)?.replace(/,/g, "") ?? "";
  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : null;
}

function xmlDecode(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function xmlAttr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}=(["'])(.*?)\\1`, "i"));

  return match ? xmlDecode(match[2] ?? "") : null;
}

async function unzipText(filePath: string, entryName: string) {
  const { stdout } = await execFileAsync(
    "unzip",
    ["-p", filePath, entryName],
    { maxBuffer: 16_000_000 }
  );

  return stdout;
}

async function optionalUnzipText(filePath: string, entryName: string) {
  try {
    return await unzipText(filePath, entryName);
  } catch {
    return null;
  }
}

function parseSharedStrings(xml: string | null) {
  if (!xml) {
    return [];
  }

  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) =>
    [...(match[1] ?? "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
      .map((part) => xmlDecode(part[1] ?? ""))
      .join("")
  );
}

function columnIndexFromCellRef(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let column = 0;

  for (const letter of letters) {
    column = column * 26 + letter.charCodeAt(0) - 64;
  }

  return column - 1;
}

function parseCellValue(cellTag: string, cellXml: string, sharedStrings: readonly string[]) {
  const type = xmlAttr(cellTag, "t");

  if (type === "inlineStr") {
    const text = [...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
      .map((match) => xmlDecode(match[1] ?? ""))
      .join("");

    return text.trim();
  }

  const raw = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
  const value = xmlDecode(raw).trim();

  if (type === "s") {
    return sharedStrings[Number(value)] ?? "";
  }

  return value;
}

function parseWorksheetGrid(xml: string, sharedStrings: readonly string[]) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)].map((rowMatch) => {
    const cells: string[] = [];

    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/(<c\b[^>]*>)([\s\S]*?)<\/c>/gi)) {
      const cellTag = cellMatch[1] ?? "";
      const ref = xmlAttr(cellTag, "r") ?? "";
      const column = columnIndexFromCellRef(ref);

      if (column >= 0) {
        cells[column] = parseCellValue(cellTag, cellMatch[2] ?? "", sharedStrings);
      }
    }

    return cells;
  });
}

function sheetRelationshipTargets(relsXml: string | null) {
  const targets = new Map<string, string>();

  for (const match of (relsXml ?? "").matchAll(/<Relationship\b[^>]*>/gi)) {
    const tag = match[0];
    const id = xmlAttr(tag, "Id");
    const target = xmlAttr(tag, "Target");

    if (id && target) {
      targets.set(id, target.startsWith("xl/") ? target : `xl/${target.replace(/^\/+/, "")}`);
    }
  }

  return targets;
}

function workbookSheetEntry(workbookXml: string, relsXml: string | null, sheetName: string) {
  const relationships = sheetRelationshipTargets(relsXml);

  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/gi)) {
    const tag = match[0];
    const name = xmlAttr(tag, "name");
    const relationshipId = xmlAttr(tag, "r:id");

    if (name === sheetName && relationshipId) {
      return relationships.get(relationshipId) ?? null;
    }
  }

  return "xl/worksheets/sheet1.xml";
}

export function detectDelightBrand(productName: string) {
  const normalized = productName
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = [...SOURCE_BRANDS].sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    const pattern = new RegExp(`^${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|\\s|[-+])`, "i");

    if (pattern.test(normalized)) {
      return BRAND_ALIASES.get(candidate) ?? candidate;
    }
  }

  return cleanText(productName.split(/\s+/)[0], 120) ?? "Unknown";
}

function headerKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function parseDelightProductRowsFromGrid(grid: readonly (readonly string[])[]) {
  const [headerRow, ...bodyRows] = grid;
  const headers = new Map(
    (headerRow ?? []).map((value, index) => [headerKey(String(value ?? "")), index])
  );
  const indexOf = (...names: string[]) => {
    for (const name of names) {
      const index = headers.get(headerKey(name));

      if (index !== undefined) {
        return index;
      }
    }

    return -1;
  };
  const productNameIndex = indexOf("Product Name", "Name");
  const unitIndex = indexOf("Unit");
  const registerIndex = indexOf("Register No.", "Register No", "FDA Approval");
  const costIndex = indexOf("Cost", "Wholesale Price");
  const sellingPriceIndex = indexOf("Selling Price", "RRP", "Retail Price");

  if (productNameIndex < 0) {
    throw new Error("Delight product sheet is missing Product Name");
  }

  return bodyRows.flatMap((row, index): DelightSheetProductRow[] => {
    const productName = cleanText(row[productNameIndex], 500);

    if (!productName) {
      return [];
    }

    return [{
      brandName: detectDelightBrand(productName),
      costAmount: costIndex >= 0 ? numericAmount(row[costIndex]) : null,
      productName,
      registerNumber: registerIndex >= 0 ? cleanText(row[registerIndex], 120) : null,
      rowNumber: index + 2,
      sellingPriceAmount: sellingPriceIndex >= 0 ? numericAmount(row[sellingPriceIndex]) : null,
      unit: unitIndex >= 0 ? cleanText(row[unitIndex], 200) : null
    }];
  });
}

export async function parseDelightProductWorkbook(filePath: string) {
  const workbookXml = await unzipText(filePath, "xl/workbook.xml");
  const relsXml = await optionalUnzipText(filePath, "xl/_rels/workbook.xml.rels");
  const sheetEntry = workbookSheetEntry(workbookXml, relsXml, DELIGHT_PRODUCT_SHEET_NAME);

  if (!sheetEntry) {
    throw new Error(`Workbook is missing ${DELIGHT_PRODUCT_SHEET_NAME} sheet`);
  }

  const [sharedStringsXml, worksheetXml] = await Promise.all([
    optionalUnzipText(filePath, "xl/sharedStrings.xml"),
    unzipText(filePath, sheetEntry)
  ]);

  return parseDelightProductRowsFromGrid(
    parseWorksheetGrid(worksheetXml, parseSharedStrings(sharedStringsXml))
  );
}

function sourcePolicyForBrand(brandName: string) {
  const normalized = normalizeProductKey(brandName);

  return DELIGHT_BRAND_SOURCE_POLICIES.find((policy) =>
    normalizeProductKey(policy.brandName) === normalized
  ) ?? null;
}

function sourceUrlsForPagedCatalogue(source: DelightManufacturerSource) {
  if (source.kind !== "catalogue" || !source.maxPages || source.maxPages <= 1) {
    return [source.url];
  }

  const urls = [source.url];
  const parsed = new URL(source.url);

  for (let page = 2; page <= source.maxPages; page += 1) {
    if (parsed.pathname.endsWith("/")) {
      urls.push(new URL(`page/${page}/`, parsed).toString());
    } else {
      const next = new URL(parsed);
      next.searchParams.set("page", String(page));
      urls.push(next.toString());
    }
  }

  return urls;
}

function anchorUrlsFromHtml(html: string, sourceUrl: string, pattern?: RegExp) {
  const baseUrl = new URL(sourceUrl);
  const host = baseUrl.hostname.replace(/^www\./i, "");
  const urls: string[] = [];

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(xmlDecode(match[1] ?? ""), baseUrl);
      const normalizedHost = url.hostname.replace(/^www\./i, "");

      if (normalizedHost !== host) {
        continue;
      }

      const normalized = normalizedUrlWithoutHash(url.toString(), baseUrl);
      const path = new URL(normalized).pathname;

      if (
        /\/(?:cart|basket|checkout|account|login|privacy|terms|contact|blog|article|tag|category)\b/i.test(path) ||
        /\.(?:jpg|jpeg|png|webp|gif|pdf)$/i.test(path)
      ) {
        continue;
      }

      if (pattern ? pattern.test(path) : /\/(?:product|products|produk|goods)\//i.test(path)) {
        urls.push(normalized);
      }
    } catch {
      // Ignore malformed links.
    }
  }

  return urls;
}

async function discoverProductUrls(source: DelightManufacturerSource) {
  if (source.kind === "product") {
    return [source.url];
  }

  const discovered = new Set<string>();

  for (const listingUrl of sourceUrlsForPagedCatalogue(source)) {
    const html = await fetchHtml(listingUrl);
    const urls = [
      ...productUrlsFromListingHtml(html, listingUrl),
      ...anchorUrlsFromHtml(html, listingUrl, source.urlPattern)
    ];
    let added = 0;

    for (const url of urls) {
      if (!discovered.has(url)) {
        discovered.add(url);
        added += 1;
      }
    }

    if (source.maxPages && listingUrl !== source.url && added === 0) {
      break;
    }
  }

  return [...discovered];
}

function titleWithoutSiteSuffix(value: string, brandName: string) {
  const brand = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return value
    .replace(new RegExp(`\\s*[|–-]\\s*(?:${brand}|${brandName}\\s+Thailand|Official.*)$`, "i"), "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function jsonLdString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? cleanHtmlText(value) : null;
}

async function scrapeOfficialProduct(
  brandName: string,
  source: DelightManufacturerSource,
  productUrl: string
): Promise<DelightImportedProductCandidate> {
  const isPdf = /\.pdf(?:\?|$)/i.test(productUrl);
  const html = isPdf
    ? ""
    : await fetchHtml(productUrl);
  const text = isPdf
    ? ""
    : textFromHtml(html);
  const jsonLd = isPdf ? {} : jsonLdProductRecordsFromHtml(html)[0] ?? {};
  const title = titleWithoutSiteSuffix(
    jsonLdString(jsonLd, "name") ?? (isPdf ? `${brandName} regulatory evidence` : titleFromHtml(html)),
    brandName
  ) || `${brandName} product`;
  const description = jsonLdString(jsonLd, "description") ??
    (isPdf ? null : descriptionFromHtml(html, text));
  const facts = isPdf ? [] : parsedFactsFromHtml(html, text, normalizeProductKey(brandName));
  const imageUrls = isPdf
    ? []
    : [...new Set([
        ...productJsonLdImagesFromHtml(html, productUrl),
        ...imageUrlsFromHtml(html, productUrl)
      ])].slice(0, 10);
  const fdaApprovalNumber = isPdf
    ? null
    : fdaApprovalNumberFromText(text) ?? fdaNumberFromText(text);

  return {
    brandName,
    description,
    evidenceQuality: source.sourceKind === "manufacturer" || source.sourceKind === "brand"
      ? "official"
      : "fallback",
    fdaApprovalNumber,
    imageUrls,
    parsedFacts: facts,
    productTitle: title,
    rawSnapshot: {
      activeIngredientCount: facts.length,
      delightCoverageImport: true,
      evidenceQuality: source.sourceKind === "manufacturer" || source.sourceKind === "brand"
        ? "official"
        : "fallback",
      extractedText: text.slice(0, 20_000),
      htmlLength: html.length,
      locale: source.locale ?? "unknown",
      parser: isPdf ? "delight_regulatory_pdf_reference_v1" : "delight_official_product_page_v1",
      sourceKind: source.sourceKind,
      sourcePolicy: sourcePolicyForBrand(brandName)?.coverage ?? null
    },
    source: source.sourceKind === "manufacturer" || source.sourceKind === "brand"
      ? "delight_manufacturer_coverage"
      : "delight_fallback_coverage",
    sourceUrl: productUrl,
    translations: {
      ...(/[A-Za-z]/.test(title) || /[A-Za-z]/.test(description ?? "")
        ? {
            en: {
              description: /[A-Za-z]/.test(description ?? "") ? description : null,
              status: "draft" as const,
              title: /[A-Za-z]/.test(title) ? title : null
            }
          }
        : {}),
      ...(/[ก-๙]/.test(title) || /[ก-๙]/.test(description ?? "")
        ? {
            th: {
              description: /[ก-๙]/.test(description ?? "") ? description : null,
              status: "draft" as const,
              title: /[ก-๙]/.test(title) ? title : null
            }
          }
        : {})
    }
  };
}

export async function collectOfficialManufacturerCandidates(input: Readonly<{
  brandNames: readonly string[];
  delayMs?: number;
  includeExistingSupported?: boolean;
  limitPerBrand?: number;
}>) {
  const candidates: DelightImportedProductCandidate[] = [];
  const failures: Array<{ brandName: string; message: string; url: string }> = [];
  const brandCounts: Record<string, number> = {};
  const brandNames = [...new Set(input.brandNames)];

  for (const brandName of brandNames) {
    const policy = sourcePolicyForBrand(brandName);

    if (!policy || policy.coverage === "fallback_only") {
      brandCounts[brandName] = 0;
      continue;
    }

    if (policy.coverage === "existing_supported" && !input.includeExistingSupported) {
      brandCounts[brandName] = 0;
      continue;
    }

    const brandCandidates: DelightImportedProductCandidate[] = [];

    for (const source of policy.sources) {
      let urls: string[] = [];

      try {
        urls = await discoverProductUrls(source);
      } catch (error) {
        failures.push({
          brandName,
          message: error instanceof Error ? error.message : String(error),
          url: source.url
        });
        continue;
      }

      for (const url of urls.slice(0, input.limitPerBrand ?? urls.length)) {
        try {
          brandCandidates.push(await scrapeOfficialProduct(brandName, source, url));
        } catch (error) {
          failures.push({
            brandName,
            message: error instanceof Error ? error.message : String(error),
            url
          });
        }

        await delay(input.delayMs ?? 200);
      }
    }

    const unique = new Map(
      brandCandidates.map((candidate) => [
        `${normalizeProductKey(candidate.brandName)}|${normalizeProductKey(candidate.productTitle)}|${candidate.sourceUrl}`,
        candidate
      ])
    );
    const products = [...unique.values()];

    brandCounts[brandName] = products.length;
    candidates.push(...products);
  }

  return { brandCounts, candidates, failures };
}

function normalizeRegister(value: string | null | undefined) {
  return cleanText(value, 120)?.replace(/[^0-9A-Zก-๙]+/gi, "").toUpperCase() ?? null;
}

function stripBrandPrefix(value: string, brandName: string) {
  const patterns = [
    brandName,
    brandName.replace(/\s+/g, ""),
    brandName === "Mega We Care" ? "Mega" : null
  ].filter((item): item is string => Boolean(item));
  let text = value;

  for (const pattern of patterns) {
    text = text.replace(new RegExp(`^\\s*${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "");
  }

  return text;
}

function matchTokens(value: string, brandName: string) {
  const ignored = new Set([
    "and",
    "the",
    "with",
    "plus",
    "dietary",
    "supplement",
    "product",
    "capsule",
    "capsules",
    "cap",
    "caps",
    "tablet",
    "tablets",
    "tab",
    "tabs",
    "softgel",
    "softgels",
    "mg",
    "mcg",
    "iu",
    "ml"
  ]);

  return stripBrandPrefix(value, brandName)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !ignored.has(token));
}

function tokenCoverage(left: readonly string[], right: readonly string[]) {
  if (left.length < 1 || right.length < 1) {
    return 0;
  }

  const rightSet = new Set(right);
  const matched = left.filter((token) => rightSet.has(token)).length;

  return matched / left.length;
}

function productRegisterNumbers(product: DelightExistingProduct) {
  return [
    product.fdaApprovalNumber,
    ...product.regulatoryApprovalNumbers
  ]
    .map(normalizeRegister)
    .filter((value): value is string => Boolean(value));
}

function scoreProductMatch(row: DelightSheetProductRow, product: DelightExistingProduct) {
  const rowBrand = normalizeProductKey(row.brandName);
  const productBrand = normalizeProductKey(product.brandName ?? "");
  const brandMatches = rowBrand && productBrand && rowBrand === productBrand;
  const rowRegister = normalizeRegister(row.registerNumber);

  if (
    rowRegister &&
    productRegisterNumbers(product).some((value) => value === rowRegister)
  ) {
    const rowTokens = matchTokens(row.productName, row.brandName);
    const productTokens = matchTokens(product.title, row.brandName);
    const titleScore = Math.max(
      tokenCoverage(rowTokens, productTokens),
      tokenCoverage(productTokens, rowTokens)
    );

    return {
      kind: "exact_register" as const,
      score: (brandMatches ? 1 : 0.96) + Math.min(0.2, titleScore * 0.2)
    };
  }

  if (!brandMatches) {
    return { kind: "missing" as const, score: 0 };
  }

  const rowTitle = normalizeProductKey(row.productName);

  if (product.normalizedTitle === rowTitle) {
    return { kind: "exact_title" as const, score: 0.98 };
  }

  const rowTokens = matchTokens(row.productName, row.brandName);
  const productTokens = matchTokens(product.title, row.brandName);
  const coverage = tokenCoverage(rowTokens, productTokens);
  const reverseCoverage = tokenCoverage(productTokens, rowTokens);
  const score = (coverage * 0.7) + (reverseCoverage * 0.3);

  return {
    kind: "token_match" as const,
    score
  };
}

export function matchDelightSheetRowsToProducts(
  rows: readonly DelightSheetProductRow[],
  products: readonly DelightExistingProduct[]
): DelightCoverageMatch[] {
  return rows.map((row) => {
    const scored = products
      .map((product) => ({
        product,
        ...scoreProductMatch(row, product)
      }))
      .filter((item) => item.score >= 0.72)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1];

    if (!best) {
      return {
        confidence: 0,
        matchKind: "missing",
        productId: null,
        productTitle: null,
        row,
        sourceUrl: null
      };
    }

    if (second && best.score - second.score < 0.12 && best.kind !== "exact_register") {
      return {
        confidence: best.score,
        matchKind: "ambiguous",
        productId: null,
        productTitle: `${best.product.title} | ${second.product.title}`,
        row,
        sourceUrl: best.product.sourceUrl ?? best.product.productUrl
      };
    }

    return {
      confidence: best.score,
      matchKind: best.kind,
      productId: best.product.id,
      productTitle: best.product.title,
      row,
      sourceUrl: best.product.sourceUrl ?? best.product.productUrl
    };
  });
}

function candidateAsExistingProduct(candidate: DelightImportedProductCandidate): DelightExistingProduct {
  return {
    brandName: candidate.brandName,
    fdaApprovalNumber: candidate.fdaApprovalNumber,
    id: `candidate:${candidate.sourceUrl}`,
    imageUrl: candidate.imageUrls[0] ?? null,
    normalizedBrandName: normalizeProductKey(candidate.brandName),
    normalizedTitle: normalizeProductKey(candidate.productTitle),
    productUrl: candidate.sourceUrl,
    regulatoryApprovalNumbers: candidate.fdaApprovalNumber ? [candidate.fdaApprovalNumber] : [],
    sourceUrl: candidate.sourceUrl,
    status: "candidate",
    title: candidate.productTitle
  };
}

function internalSheetSourceUrl(row: DelightSheetProductRow) {
  const slug = normalizeProductKey(row.productName).replace(/_/g, "-").slice(0, 120);

  return `https://mattanutra.com/internal/delight-product-sheet/row-${row.rowNumber}-${slug}`;
}

function thaiFdaEvidenceUrl(registerNumber: string | null) {
  return registerNumber
    ? `https://prod.oryor.com/check-product-serial?serial=${encodeURIComponent(registerNumber)}`
    : null;
}

export function fallbackCandidateForSheetRow(row: DelightSheetProductRow): DelightImportedProductCandidate {
  return {
    brandName: row.brandName,
    description: null,
    evidenceQuality: "fallback",
    fdaApprovalNumber: row.registerNumber,
    imageUrls: [],
    parsedFacts: [],
    productTitle: row.productName,
    rawSnapshot: {
      delightCoverageImport: true,
      evidenceQuality: "fallback",
      fallbackReason: "sheet_row_not_found_in_master_or_official_catalogue",
      fdaEvidenceUrl: thaiFdaEvidenceUrl(row.registerNumber),
      parser: "delight_sheet_row_v1",
      sheet: {
        costAmount: row.costAmount,
        productName: row.productName,
        registerNumber: row.registerNumber,
        rowNumber: row.rowNumber,
        sellingPriceAmount: row.sellingPriceAmount,
        unit: row.unit
      },
      sourceKind: row.registerNumber ? "thai_fda_register_reference" : "delight_sheet"
    },
    source: "delight_sheet_fallback",
    sourceUrl: internalSheetSourceUrl(row),
    translations: {
      ...(/[A-Za-z]/.test(row.productName)
        ? {
            en: {
              description: null,
              status: "draft" as const,
              title: row.productName
            }
          }
        : {}),
      ...(/[ก-๙]/.test(row.productName)
        ? {
            th: {
              description: null,
              status: "draft" as const,
              title: row.productName
            }
          }
        : {})
    }
  };
}

function brandCounts(rows: readonly DelightSheetProductRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.brandName] = (counts[row.brandName] ?? 0) + 1;
    return counts;
  }, {});
}

export async function loadDelightExistingProducts() {
  const sql = getSql();

  if (!sql) {
    return [];
  }

  const rows = await sql<Array<{
    brand_name: string | null;
    fda_approval_number: string | null;
    id: string;
    image_url: string | null;
    normalized_brand_name: string | null;
    normalized_title: string;
    product_url: string;
    regulatory_approval_numbers: string[] | null;
    source_url: string | null;
    status: string;
    title: string;
  }>>`
    select
      products.id::text,
      products.title,
      products.normalized_title,
      products.brand_name,
      products.normalized_brand_name,
      products.image_url,
      products.product_url,
      products.source_url,
      products.fda_approval_number,
      products.status,
      coalesce(
        array_agg(distinct product_regulatory_approvals.approval_number)
          filter (where product_regulatory_approvals.approval_number is not null),
        array[]::text[]
      ) as regulatory_approval_numbers
    from public.products
    left join public.product_regulatory_approvals
      on product_regulatory_approvals.product_id = products.id
      and product_regulatory_approvals.status in ('sourced', 'verified')
    where products.status not in ('ignored', 'deleted')
    group by products.id
  `;

  return rows.map((row): DelightExistingProduct => ({
    brandName: row.brand_name,
    fdaApprovalNumber: row.fda_approval_number,
    id: row.id,
    imageUrl: row.image_url,
    normalizedBrandName: row.normalized_brand_name,
    normalizedTitle: row.normalized_title,
    productUrl: row.product_url,
    regulatoryApprovalNumbers: row.regulatory_approval_numbers ?? [],
    sourceUrl: row.source_url,
    status: row.status,
    title: row.title
  }));
}

function existingProductForCandidate(
  candidate: DelightImportedProductCandidate,
  existingProducts: readonly DelightExistingProduct[]
) {
  const candidateProduct = candidateAsExistingProduct(candidate);

  return existingProducts.find((product) => {
    if (
      product.sourceUrl === candidate.sourceUrl ||
      product.productUrl === candidate.sourceUrl
    ) {
      return true;
    }

    const score = scoreProductMatch({
      brandName: candidate.brandName,
      costAmount: null,
      productName: candidate.productTitle,
      registerNumber: candidate.fdaApprovalNumber,
      rowNumber: 0,
      sellingPriceAmount: null,
      unit: null
    }, product);

    return score.score >= 0.95 || (
      score.kind === "token_match" &&
      score.score >= 0.84 &&
      candidateProduct.normalizedBrandName === product.normalizedBrandName
    );
  }) ?? null;
}

async function stageCandidateProducts(input: Readonly<{
  candidates: readonly DelightImportedProductCandidate[];
  existingProducts: readonly DelightExistingProduct[];
}>) {
  const byBrand = new Map<string, DelightImportedProductCandidate[]>();
  let skippedExisting = 0;
  let staged = 0;

  for (const candidate of input.candidates) {
    if (existingProductForCandidate(candidate, input.existingProducts)) {
      skippedExisting += 1;
      continue;
    }

    const list = byBrand.get(candidate.brandName) ?? [];
    list.push(candidate);
    byBrand.set(candidate.brandName, list);
  }

  for (const [brandName, candidates] of byBrand) {
    const importRunId = await startProductImportRun({
      autoApprove: false,
      brandName,
      source: "delight_manufacturer_coverage",
      totalProducts: candidates.length
    });
    let failed = 0;

    for (const candidate of candidates) {
      try {
        await stageProductImport({
          actor: "delight_manufacturer_coverage",
          brandName: candidate.brandName,
          description: candidate.description,
          fdaApprovalNumber: candidate.fdaApprovalNumber,
          imageUrls: candidate.imageUrls,
          importRunId,
          parsedFacts: candidate.parsedFacts,
          parseConfidence: candidate.parsedFacts.length > 0 ? "moderate" : "low",
          productTitle: candidate.productTitle,
          rawSnapshot: candidate.rawSnapshot,
          source: candidate.source,
          sourceUrl: candidate.sourceUrl,
          translations: candidate.translations
        });
        staged += 1;
      } catch (error) {
        failed += 1;
        console.warn(
          `[delight:stage] ${candidate.brandName} ${candidate.productTitle} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    await finishProductImportRun({
      failedCount: failed,
      importRunId,
      notes: `Delight manufacturer coverage import staged ${candidates.length - failed} products for review.`,
      stagedCount: candidates.length - failed,
      status: "completed"
    });
  }

  return { skippedExisting, staged };
}

async function findDelightOrganisationId(name: string) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<Array<{ id: string; currency: string }>>`
    select id::text, currency
    from public.organisations
    where organisation_type = 'tenant'
      and status = 'active'
      and lower(name) = lower(${name})
    order by created_at asc
    limit 1
  `;
  const fallbackRows = rows.length > 0
    ? rows
    : await sql<Array<{ id: string; currency: string }>>`
        select id::text, currency
        from public.organisations
        where organisation_type = 'tenant'
          and status = 'active'
          and name ilike 'Delight%'
        order by created_at asc
        limit 1
      `;
  const row = fallbackRows[0];

  if (!row) {
    throw new Error(`Retail organisation was not found: ${name}`);
  }

  return row;
}

async function applyDelightSellables(input: Readonly<{
  matches: readonly DelightCoverageMatch[];
  organisationName: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const organisation = await findDelightOrganisationId(input.organisationName);
  const matchedCandidates = input.matches.filter((match) =>
    match.productId &&
    match.matchKind !== "ambiguous" &&
    match.row.sellingPriceAmount !== null
  );
  const candidateProductIds = [...new Set(matchedCandidates.map((match) => match.productId!))];
  const approvedRows = candidateProductIds.length > 0
    ? await sql<Array<{ id: string }>>`
        select id::text
        from public.products
        where id = any(${candidateProductIds}::uuid[])
          and status = 'approved'
      `
    : [];
  const approvedProductIds = new Set(approvedRows.map((row) => row.id));
  const matched = matchedCandidates.filter((match) =>
    Boolean(match.productId && approvedProductIds.has(match.productId))
  );
  const matchedProductIds = [...new Set(matched.map((match) => match.productId!))];
  let updated = 0;

  for (const match of matched) {
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
        notes,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${organisation.id}::uuid,
        ${match.productId}::uuid,
        'active',
        ${match.row.sellingPriceAmount},
        ${match.row.costAmount},
        ${organisation.currency || "THB"},
        0,
        'allow',
        'Synced from Delight product sheet.',
        ${sql.json(toJsonValue({
          delightSheetRowNumber: match.row.rowNumber,
          matchedBy: match.matchKind,
          source: "delight_manufacturer_coverage"
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (organisation_id, product_id)
      do update set
        status = 'active',
        rrp_price_amount = excluded.rrp_price_amount,
        wholesale_price_amount = excluded.wholesale_price_amount,
        currency = excluded.currency,
        lead_time_days = excluded.lead_time_days,
        backorder_policy = excluded.backorder_policy,
        notes = excluded.notes,
        metadata = public.retail_sellable_products.metadata || excluded.metadata,
        updated_at = now()
    `;

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
        notes,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${organisation.id}::uuid,
        ${match.productId}::uuid,
        'active',
        0,
        0,
        ${match.row.costAmount},
        ${match.row.sellingPriceAmount},
        ${organisation.currency || "THB"},
        'Synced from Delight product sheet.',
        ${sql.json(toJsonValue({
          delightSheetRowNumber: match.row.rowNumber,
          source: "delight_manufacturer_coverage"
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (organisation_id, product_id)
      do update set
        status = 'active',
        wholesale_price_amount = excluded.wholesale_price_amount,
        retail_price_amount = excluded.retail_price_amount,
        currency = excluded.currency,
        notes = excluded.notes,
        metadata = public.retail_product_stock.metadata || excluded.metadata,
        updated_at = now()
    `;
    updated += 1;
  }

  const disabledRows = matchedProductIds.length > 0
    ? await sql<Array<{ id: string }>>`
        update public.retail_sellable_products
        set
          status = 'disabled',
          backorder_policy = 'deny',
          metadata = metadata || ${sql.json(toJsonValue({
            disabledBy: "delight_manufacturer_coverage",
            reason: "not_present_on_latest_delight_sheet"
          }))}::jsonb,
          updated_at = now()
        where organisation_id = ${organisation.id}::uuid
          and status = 'active'
          and not (product_id = any(${matchedProductIds}::uuid[]))
        returning id::text
      `
    : [];

  return {
    disabled: disabledRows.length,
    matchedForUpdate: matched.length,
    updated
  };
}

async function writeJsonReport(outputPath: string | null, report: DelightCoverageReport) {
  if (!outputPath) {
    return null;
  }

  const absolutePath = path.resolve(outputPath);
  const temporaryPath = `${absolutePath}.tmp`;

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryPath, absolutePath);

  return absolutePath;
}

export async function runDelightManufacturerCoverageImport(input: Readonly<{
  applyDelight?: boolean;
  applyMaster?: boolean;
  delightOrganisationName?: string;
  delayMs?: number;
  includeExistingSupported?: boolean;
  limitPerBrand?: number;
  outputPath?: string | null;
  sheetPath: string;
}>) {
  const rows = await parseDelightProductWorkbook(input.sheetPath);
  const sheetBrands = Object.keys(brandCounts(rows)).sort();
  const existingProductsBefore = await loadDelightExistingProducts();
  const sourceResult = await collectOfficialManufacturerCandidates({
    brandNames: sheetBrands,
    delayMs: input.delayMs,
    includeExistingSupported: input.includeExistingSupported,
    limitPerBrand: input.limitPerBrand
  });
  const candidateProducts = sourceResult.candidates.map(candidateAsExistingProduct);
  const coverageBeforeFallback = matchDelightSheetRowsToProducts(
    rows,
    [...existingProductsBefore, ...candidateProducts]
  );
  const fallbackCandidates = coverageBeforeFallback
    .filter((match) => match.matchKind === "missing")
    .map((match) => fallbackCandidateForSheetRow(match.row));
  const allCandidates = [...sourceResult.candidates, ...fallbackCandidates];
  let staged = 0;
  let skippedExisting = 0;

  if (input.applyMaster) {
    const result = await stageCandidateProducts({
      candidates: allCandidates,
      existingProducts: existingProductsBefore
    });
    staged = result.staged;
    skippedExisting = result.skippedExisting;
  } else {
    skippedExisting = allCandidates.filter((candidate) =>
      existingProductForCandidate(candidate, existingProductsBefore)
    ).length;
  }

  const existingProductsAfter = input.applyMaster
    ? await loadDelightExistingProducts()
    : existingProductsBefore;
  const plannedMatches = matchDelightSheetRowsToProducts(
    rows,
    input.applyMaster
      ? existingProductsAfter
      : [...existingProductsBefore, ...candidateProducts, ...fallbackCandidates.map(candidateAsExistingProduct)]
  );
  const dbMatches = matchDelightSheetRowsToProducts(rows, existingProductsAfter);
  const retail = input.applyDelight
    ? await applyDelightSellables({
        matches: dbMatches,
        organisationName: input.delightOrganisationName ?? DEFAULT_DELIGHT_ORGANISATION_NAME
      })
    : { disabled: 0, matchedForUpdate: dbMatches.filter((match) => match.productId && match.matchKind !== "ambiguous").length, updated: 0 };
  const report: DelightCoverageReport = {
    appliedDelight: Boolean(input.applyDelight),
    appliedMaster: Boolean(input.applyMaster),
    candidates: {
      fallbackSheet: fallbackCandidates.length,
      officialCatalogue: sourceResult.candidates.length,
      skippedExisting,
      staged
    },
    generatedAt: new Date().toISOString(),
    matches: {
      ambiguous: dbMatches.filter((match) => match.matchKind === "ambiguous").length,
      matched: dbMatches.filter((match) => match.productId && match.matchKind !== "ambiguous").length,
      missing: dbMatches.filter((match) => match.matchKind === "missing").length,
      rows: dbMatches
    },
    plannedMasterCoverage: {
      ambiguous: plannedMatches.filter((match) => match.matchKind === "ambiguous").length,
      matched: plannedMatches.filter((match) => match.productId && match.matchKind !== "ambiguous").length,
      missing: plannedMatches.filter((match) => match.matchKind === "missing").length,
      rows: plannedMatches
    },
    retail,
    sheet: {
      brandCounts: brandCounts(rows),
      rows: rows.length
    },
    sources: {
      brandCounts: sourceResult.brandCounts,
      failures: sourceResult.failures
    },
    unmatchedSheetProducts: dbMatches
      .filter((match) => match.matchKind === "missing" || match.matchKind === "ambiguous")
      .map((match) => `${match.row.productName}${match.row.unit ? ` (${match.row.unit})` : ""}`)
  };

  await writeJsonReport(input.outputPath ?? null, report);
  await closeSqlPool();

  return report;
}

export async function readJsonReport(reportPath: string) {
  return JSON.parse(await readFile(reportPath, "utf8")) as DelightCoverageReport;
}
