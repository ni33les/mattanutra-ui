import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CONTENT_MASTER_STATUSES,
  isContentMasterTable
} from "@/lib/catalogue-snapshot-tables";
import { publicLocales } from "@/lib/i18n";

type SnapshotTables = Record<string, unknown>;

const REQUIRED_NON_EMPTY_TABLES = [
  "finance_accounts",
  "supplements",
  "supplement_aliases",
  "supplement_safety_limits",
  "supplement_translations",
  "products",
  "product_translations",
  "product_facts",
  "foods",
  "food_translations",
  "testimonials",
  "blog_posts"
] as const;

const REQUIRED_FINANCE_ACCOUNT_IDS = [
  "11111111-1111-4111-8111-111111111111"
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

function localeCoverageById(rows: readonly Record<string, unknown>[], idColumn: string) {
  const localesById = new Map<string, Set<string>>();

  for (const row of rows) {
    const id = textValue(row[idColumn]);
    const locale = textValue(row.locale);

    if (!id || !locale) {
      continue;
    }

    const locales = localesById.get(id) ?? new Set<string>();
    locales.add(locale);
    localesById.set(id, locales);
  }

  return localesById;
}

function validateLocaleCoverage(
  errors: string[],
  options: Readonly<{
    entityLabel: string;
    entityName: (row: Record<string, unknown>) => string;
    idColumn: string;
    rows: readonly Record<string, unknown>[];
    translations: readonly Record<string, unknown>[];
  }>
) {
  const localesById = localeCoverageById(options.translations, options.idColumn);

  for (const row of options.rows) {
    const id = textValue(row.id);
    const name = options.entityName(row);
    const locales = localesById.get(id);

    for (const locale of publicLocales) {
      if (!locales?.has(locale)) {
        errors.push(`${options.entityLabel} ${name} is missing ${locale} translation`);
      }
    }
  }
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
  const financeAccountIds = new Set(
    rowsFor("finance_accounts", tables)
      .map((row) => textValue(row.id))
      .filter(Boolean)
  );

  for (const accountId of REQUIRED_FINANCE_ACCOUNT_IDS) {
    if (!financeAccountIds.has(accountId)) {
      errors.push(`finance_accounts is missing required account ${accountId}`);
    }
  }

  validateLocaleCoverage(errors, {
    entityLabel: "product",
    entityName: (row) => textValue(row.title) || textValue(row.name) || textValue(row.id),
    idColumn: "product_id",
    rows: rowsFor("products", tables),
    translations: rowsFor("product_translations", tables)
  });

  validateLocaleCoverage(errors, {
    entityLabel: "supplement",
    entityName: (row) => textValue(row.name) || textValue(row.id),
    idColumn: "supplement_id",
    rows: rowsFor("supplements", tables),
    translations: rowsFor("supplement_translations", tables)
  });

  const translationLocalesByFood = localeCoverageById(translations, "food_id");

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

    for (const locale of publicLocales) {
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
