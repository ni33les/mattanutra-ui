import { type ProductImportFactInput } from "@/lib/admin-products";
import { normalizeProductFactName } from "@/lib/product-recommendations";

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unitFromText(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");

  if (/billion\s*cfu/.test(normalized)) {
    return "billion CFU";
  }

  if (/\bcfu\b/.test(normalized)) {
    return "CFU";
  }

  if (/micrograms?|mcg|µg|ug/.test(normalized)) {
    return "mcg";
  }

  if (/i\.?\s*u\.?|iu/.test(normalized)) {
    return "IU";
  }

  if (/mg/.test(normalized)) {
    return "mg";
  }

  if (/\bg\b/.test(normalized)) {
    return "g";
  }

  return null;
}

function numberFromText(value: string) {
  const parsed = Number(value.replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeSwisseFactName(value: string) {
  const cleaned = cleanText(value)
    .replace(/^[-*•]\s*/, "")
    .replace(/^(?:key\s+ingredients?|active\s+ingredients?|ingredients?)\s+/i, "")
    .replace(/^each\s+(?:soft\s+)?(?:capsule|tablet|serving)\s+contains\s+/i, "")
    .replace(/^contains\s+/i, "")
    .replace(/\s*[-–]\s*natural$/i, "")
    .replace(/\bdocosahexaenoicacid\b/gi, "Docosahexaenoic acid DHA")
    .replace(/\beicosapentaenoic\s+acid\s*\(?EPA\)?/gi, "Eicosapentaenoic acid EPA")
    .replace(/\bdocosahexaenoic\s+acid\s*\(?DHA\)?/gi, "Docosahexaenoic acid DHA")
    .trim();

  if (/\bfish\s*oil\b/i.test(cleaned)) {
    return "Fish Oil";
  }

  if (/\bepa\b|eicosapentaenoic/i.test(cleaned)) {
    return "EPA";
  }

  if (/\bdha\b|docosahexaenoic/i.test(cleaned)) {
    return "DHA";
  }

  if (/\bl-?\s*glutathione\b/i.test(cleaned)) {
    return "L-Glutathione";
  }

  if (/\bvitamin\s*e\b/i.test(cleaned)) {
    return "Vitamin E";
  }

  if (/\bvitamin\s*c\b/i.test(cleaned)) {
    return "Vitamin C";
  }

  if (/\blactobacillus\s+acidophilus\b/i.test(cleaned)) {
    return "Lactobacillus Acidophilus";
  }

  return normalizeProductFactName(cleaned) || cleaned;
}

function factsFromText(text: string, sourceUrl?: string | null) {
  const compact = cleanText(text)
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)(mg|mcg|ug|µg|g|iu|IU|CFU)\b/g, "$1 $2");
  const dosePattern =
    /([A-Za-z][A-Za-z0-9\s()+\-./&]{1,100}?)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(billion\s*CFU|CFU|i\.?\s*u\.?|iu|IU|micrograms?|mcg|µg|ug|mg|g)(?=$|\s|[),.:;])/gi;
  const facts: ProductImportFactInput[] = [];

  for (const match of compact.matchAll(dosePattern)) {
    const followingText = compact.slice(
      (match.index ?? 0) + match[0].length,
      (match.index ?? 0) + match[0].length + 8
    );

    if (/^\s*\//.test(followingText)) {
      continue;
    }

    const amount = numberFromText(match[2]);
    const unit = unitFromText(match[3]);
    const name = normalizeSwisseFactName(match[1]);

    if (!name || amount === null || !unit) {
      continue;
    }

    facts.push({
      amount,
      confidence: "moderate",
      itemType: "supplement",
      name,
      sourceText: cleanText(match[0]).slice(0, 500),
      sourceUrl,
      unit
    });
  }

  return facts;
}

export function parseSwisseFacts(
  text: string,
  sourceUrl?: string | null
): ProductImportFactInput[] {
  const facts = factsFromText(text, sourceUrl);
  const seen = new Map<string, ProductImportFactInput>();

  for (const fact of facts) {
    const key = `${fact.name.toLowerCase()}|${fact.amount}|${fact.unit}`;

    if (!seen.has(key)) {
      seen.set(key, fact);
    }
  }

  return [...seen.values()];
}

export function isSwisseSkincareOnlyProduct(input: Readonly<{
  productTitle: string;
  productVendor?: string | null;
  sourceText?: string | null;
}>) {
  const title = input.productTitle.toLowerCase();
  const vendor = (input.productVendor ?? "").toLowerCase();
  const text = (input.sourceText ?? "").toLowerCase();

  if (vendor.includes("swisse skincare")) {
    return true;
  }

  if (/\b(?:serum|cream|moisturi[sz]er|retinol|bha|eye\s+cream|water\s+cream|topical|skincare)\b/.test(title)) {
    return true;
  }

  return /\bhow to use\b/.test(text) &&
    /\bapply\b/.test(text) &&
    /\b(?:face|skin|eye area|morning|evening)\b/.test(text) &&
    !/\b(?:capsule|tablet|softgel|serving|take)\b/.test(text);
}
