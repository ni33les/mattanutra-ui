import type { ProductImportFactInput } from "@/lib/admin-products";
import {
  normalizeProductFactKey,
  normalizeProductFactName
} from "@/lib/product-recommendations";
import {
  arrayValue,
  isRecord
} from "./manufacturer-scrape-core.ts";
import {
  blackmoresProductRecordFromHtml,
  cleanHtmlText
} from "./manufacturer-scrape-html.ts";

export function fdaNumberFromText(text: string) {
  const thaiAdApproval = text.match(/ฆอ\.?\s*([0-9][0-9\-/.]+\/[0-9]{4})/i)?.[1];

  if (thaiAdApproval) {
    return `ฆอ. ${thaiAdApproval}`;
  }

  return text.match(/\b(?:FDA|อย)\.?\s*(?:No\.?|เลขที่)?\s*[:：]?\s*([0-9\-\/.]{6,})/i)?.[1] ?? null;
}

function parseQuantity(value: string) {
  const match = cleanHtmlText(value).match(
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(i\.?\s*u\.?|iu|micrograms?|mcg|µg|ug|mg|g)\b/i
  );

  if (!match) {
    return null;
  }

  return {
    amount: Number(match[1].replace(/,/g, "")),
    unit: match[2]
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace("i.u.", "iu")
      .replace("i.u", "iu")
      .replace(/^micrograms?$/, "mcg")
      .replace("µg", "mcg")
      .replace("ug", "mcg")
  };
}

function numberFromIngredientAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function unitFromIngredientUnits(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return parseQuantity(`1 ${cleanHtmlText(value)}`)?.unit ?? null;
}

function blackmoresIngredientDisplayName(value: unknown) {
  const name = cleanHtmlText(String(value ?? ""));

  if (!name || /^active ingredients per/i.test(name)) {
    return null;
  }

  const equivalent = name.match(/^equivalent\s+(.+)$/i)?.[1];

  if (equivalent) {
    if (/\b(?:dry|rhizome|root|leaf|fruit|herb)\b/i.test(equivalent)) {
      return null;
    }

    return blackmoresIngredientDisplayName(equivalent);
  }

  const standardized = name.match(/^standardi[sz]ed to\s+(.+)$/i)?.[1];

  if (standardized) {
    return standardized;
  }

  if (/\b(?:palmidrol|palmitoylethanolamide|levagen|pea)\b/i.test(name)) {
    return "Palmitoylethanolamide PEA";
  }

  if (/\b(?:ascorbic acid|vitamin c)\b/i.test(name)) {
    return "Vitamin C";
  }

  if (/\b(?:colecalciferol|cholecalciferol|vitamin d3)\b/i.test(name)) {
    return "Vitamin D3";
  }

  return normalizeProductFactName(name);
}

export function blackmoresStructuredIngredientsFromHtml(html: string) {
  const record = blackmoresProductRecordFromHtml(html);
  const ingredients = arrayValue(record?.ingredients);

  return ingredients
    .map((ingredient) => isRecord(ingredient) ? ingredient : null)
    .filter((ingredient): ingredient is Record<string, unknown> => Boolean(ingredient));
}

function blackmoresStructuredIngredientPriority(rawName: string) {
  if (/^standardi[sz]ed to\b/i.test(rawName)) {
    return 0;
  }

  if (/^equivalent\b/i.test(rawName)) {
    return 1;
  }

  if (/\b(?:palmidrol|palmitoylethanolamide|levagen|pea|ascorbic acid|vitamin c|colecalciferol|cholecalciferol|vitamin d3)\b/i.test(rawName)) {
    return 2;
  }

  return 5;
}

function blackmoresStructuredSourceRowLooksRedundant(rawName: string) {
  return /\b(?:extract dry conc|phosphate|pentahydrate|carbonate|ascorbate|oxide|sulfate|sulphate|nitrate|hydrochloride|hcl)\b/i.test(rawName);
}

function shouldPreferBlackmoresFact(
  next: ProductImportFactInput & { priority: number },
  current: ProductImportFactInput & { priority: number }
) {
  if (next.priority !== current.priority) {
    return next.priority < current.priority;
  }

  const key = normalizeProductFactKey(next.name);

  if (
    (key === "vitamin_d" || key === "vitamin_d3") &&
    next.unit?.toLowerCase() === "iu" &&
    current.unit?.toLowerCase() !== "iu"
  ) {
    return true;
  }

  return current.amount === null && next.amount !== null;
}

function parsedFactsFromBlackmoresNextDataIngredients(html: string) {
  const candidates = blackmoresStructuredIngredientsFromHtml(html)
    .map((ingredient) => {
      const rawName = cleanHtmlText(String(ingredient.ingredientName ?? ""));
      const name = blackmoresIngredientDisplayName(rawName);
      const amount = numberFromIngredientAmount(ingredient.amount);
      const unit = unitFromIngredientUnits(ingredient.units);

      if (!name || amount === null || !unit) {
        return null;
      }

      return {
        amount,
        confidence: "high" as const,
        name,
        priority: blackmoresStructuredIngredientPriority(rawName),
        rawName,
        unit
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  const hasAuthoritativeEquivalent = candidates.some((fact) => fact.priority <= 1);
  const deduped = new Map<string, ProductImportFactInput & { priority: number }>();

  for (const fact of candidates) {
    if (
      hasAuthoritativeEquivalent &&
      fact.priority > 2 &&
      blackmoresStructuredSourceRowLooksRedundant(fact.rawName)
    ) {
      continue;
    }

    const key = normalizeProductFactKey(fact.name);
    const current = deduped.get(key);
    const next = {
      amount: fact.amount,
      confidence: fact.confidence,
      name: fact.name,
      priority: fact.priority,
      unit: fact.unit
    };

    if (!current || shouldPreferBlackmoresFact(next, current)) {
      deduped.set(key, next);
    }
  }

  return [...deduped.values()].map((fact) => ({
    amount: fact.amount,
    confidence: fact.confidence,
    name: fact.name,
    unit: fact.unit
  }));
}

function parsedFactsFromBlackmoresHtml(html: string) {
  const factPattern =
    /<td[^>]*class=["'][^"']*comp_ttl[^"']*["'][^>]*>\s*<div>([\s\S]*?)<\/div>\s*<\/td>\s*<td[^>]*class=["'][^"']*comp_quan[^"']*["'][^>]*>\s*<div>([\s\S]*?)<\/div>/gi;

  return [...html.matchAll(factPattern)]
    .map((match) => {
      const quantity = parseQuantity(match[2]);

      if (!quantity) {
        return null;
      }

      return {
        amount: quantity.amount,
        confidence: "moderate" as const,
        name: normalizeProductFactName(cleanHtmlText(match[1])),
        unit: quantity.unit
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
}

export function parsedFactsFromText(text: string) {
  const factPattern = /([A-Za-z][A-Za-z0-9\s()+\-./]{2,60})\s+(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|iu)\b/gi;

  return [...text.matchAll(factPattern)]
    .slice(0, 80)
    .map((match) => {
      const followingText = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 8);

      if (/^\s*\//.test(followingText)) {
        return null;
      }

      return {
        amount: Number(match[2]),
        confidence: "low" as const,
        name: normalizeProductFactName(match[1].trim()),
        unit: match[3].toLowerCase().replace("µg", "mcg").replace("ug", "mcg")
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
}

export function parsedFactsFromHtml(
  html: string,
  text: string,
  normalizedBrand: string
) {
  if (normalizedBrand === "blackmores") {
    const blackmoresNextDataFacts =
      parsedFactsFromBlackmoresNextDataIngredients(html);

    if (blackmoresNextDataFacts.length > 0) {
      return blackmoresNextDataFacts;
    }

    const blackmoresFacts = parsedFactsFromBlackmoresHtml(html);

    if (blackmoresFacts.length > 0) {
      return blackmoresFacts;
    }
  }

  return parsedFactsFromText(text);
}

export function dosageFromText(text: string) {
  const headingPattern =
    "(?:Dosage|Directions|Recommended use|How to use|วิธีรับประทาน|วิธีกิน|ปริมาณที่แนะนำ)";
  const stopPattern =
    "(?:Active ingredients|Ingredients|Supplement facts|ส่วนประกอบ|ข้อมูลโภชนาการ|คำเตือน|Warnings)";
  const match = text.match(new RegExp(`${headingPattern}\\s+([\\s\\S]{1,600}?)\\s+${stopPattern}`, "i"));

  return match?.[1]
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) ?? null;
}
