import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CONTENT_MASTER_STATUSES,
  isContentMasterTable
} from "@/lib/catalogue-snapshot-tables";

type SnapshotTables = Record<string, unknown>;

const REQUIRED_NON_EMPTY_TABLES = [
  "supplements",
  "supplement_aliases",
  "supplement_safety_limits",
  "products",
  "product_facts",
  "foods",
  "food_translations",
  "testimonials",
  "blog_posts"
] as const;

function rowsFor(tableName: string, tables: SnapshotTables) {
  const rows = tables[tableName];

  return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boolValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function foodImageFileExists(imagePath: string) {
  if (!imagePath.startsWith("/foods/")) {
    return false;
  }

  return existsSync(join(process.cwd(), "public", imagePath.replace(/^\//, "")));
}

export function validateCuratedMasterSnapshot(
  tables: SnapshotTables,
  options: Readonly<{ strict?: boolean }> = {}
) {
  const errors: string[] = [];

  if (options.strict) {
    for (const tableName of REQUIRED_NON_EMPTY_TABLES) {
      if (rowsFor(tableName, tables).length < 1) {
        errors.push(`${tableName} must contain at least one row`);
      }
    }
  }

  for (const tableName of ["blog_posts", "testimonials"]) {
    const archivedRows = rowsFor(tableName, tables).filter((row) =>
      !CONTENT_MASTER_STATUSES.includes(
        textValue(row.status) as typeof CONTENT_MASTER_STATUSES[number]
      )
    );

    if (archivedRows.length > 0) {
      errors.push(`${tableName} includes archived or unsupported content rows`);
    }
  }

  const foods = rowsFor("foods", tables);
  const translations = rowsFor("food_translations", tables);
  const translationLocalesByFood = new Map<string, Set<string>>();

  for (const translation of translations) {
    const foodId = textValue(translation.food_id);
    const locale = textValue(translation.locale);

    if (!foodId || !locale) {
      continue;
    }

    const locales = translationLocalesByFood.get(foodId) ?? new Set<string>();
    locales.add(locale);
    translationLocalesByFood.set(foodId, locales);
  }

  for (const food of foods) {
    const active = boolValue(food.is_active, true);
    const listStatus = textValue(food.list_status);

    if (!active || listStatus !== "whitelisted") {
      continue;
    }

    const normalizedName = textValue(food.normalized_name) || textValue(food.name);
    const imagePath = textValue(food.image_path);

    if (!imagePath) {
      errors.push(`whitelisted food ${normalizedName} is missing image_path`);
    } else if (!foodImageFileExists(imagePath)) {
      errors.push(`whitelisted food ${normalizedName} image file is missing: ${imagePath}`);
    }

    const locales = translationLocalesByFood.get(textValue(food.id));

    for (const locale of ["en", "th"]) {
      if (!locales?.has(locale)) {
        errors.push(`whitelisted food ${normalizedName} is missing ${locale} translation`);
      }
    }
  }

  for (const tableName of Object.keys(tables)) {
    if (!isContentMasterTable(tableName)) {
      continue;
    }

    if (!Array.isArray(tables[tableName])) {
      errors.push(`${tableName} must be an array`);
    }
  }

  return {
    errors,
    ok: errors.length === 0
  };
}
