import { getSql } from "@/lib/db";
import { translateProductCopyWithAi } from "@/lib/product-copy-translation";
import { normalizeProductKey } from "@/lib/product-recommendations";
import { normalizeLocaleCode } from "@/lib/i18n";

type ProductForBackfill = Readonly<{
  brandName: string | null;
  descriptionEn: string | null;
  id: string;
  sourceSnapshot: unknown;
  title: string;
}>;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

async function delay(ms: number) {
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function normalizeBrand(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasSuccessfulAiCopyTranslation(snapshot: unknown, locale: string) {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const translation = (snapshot as Record<string, unknown>).aiCopyTranslation;

  return Boolean(
    translation &&
    typeof translation === "object" &&
    (
      "translatedAt" in translation ||
      (
        locale in translation &&
        translation[locale as keyof typeof translation] &&
        typeof translation[locale as keyof typeof translation] === "object" &&
        "translatedAt" in translation[locale as keyof typeof translation]
      )
    )
  );
}

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const brand = normalizeBrand(argValue("brand") ?? "mega we care");
  const normalizedBrand = normalizeProductKey(brand);
  const limit = positiveInt(argValue("limit"), 500);
  const targetLocale = normalizeLocaleCode(argValue("locale")) ?? "th";
  const startAt = positiveInt(argValue("start-at"), 1);
  const delayMs = Math.min(10_000, positiveInt(argValue("delay-ms"), 750));
  const force = hasArg("force");
  const allBrands = hasArg("all");
  const missingDescriptionEnOnly = hasArg("missing-description-en-only");
  const dryRun = hasArg("dry-run");
  const productRows = allBrands
    ? await sql<ProductForBackfill[]>`
      select
        products.id::text,
        products.title,
        products.brand_name as "brandName",
        products.description_en as "descriptionEn",
        products.source_snapshot as "sourceSnapshot"
      from public.products products
      left join public.product_translations translations
        on translations.product_id = products.id
        and translations.locale = ${targetLocale}
      where ${force}
         or translations.product_id is null
         or translations.status <> 'complete'
         or nullif(translations.title, '') is null
         or nullif(translations.description, '') is null
      order by products.brand_name asc nulls last, products.title asc
      limit ${limit}
    `
    : await sql<ProductForBackfill[]>`
    select
      id::text,
      title,
      brand_name as "brandName",
      description_en as "descriptionEn",
      source_snapshot as "sourceSnapshot"
    from public.products
    where normalized_brand_name = ${normalizedBrand}
       or lower(brand_name) = ${brand}
    order by title asc
    limit ${limit}
  `;
  const products = missingDescriptionEnOnly
    ? productRows.filter((product) => !product.descriptionEn)
    : productRows;
  let failed = 0;
  let skipped = 0;
  let translated = 0;

  console.log(`[copy] loaded ${products.length} products for ${brand}`);

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const productNumber = index + 1;

    if (productNumber < startAt) {
      skipped += 1;
      continue;
    }

    if (!force && hasSuccessfulAiCopyTranslation(product.sourceSnapshot, targetLocale)) {
      skipped += 1;
      continue;
    }

    console.log(`[copy] ${productNumber}/${products.length} ${product.title}`);

    if (dryRun) {
      translated += 1;
      continue;
    }

    try {
      await translateProductCopyWithAi({
        actor: "product_copy_translation_backfill",
        productId: product.id,
        targetLocale
      });
      translated += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[copy] ${product.title} failed: ${message}`);
    }

    await delay(delayMs);
  }

  console.log(JSON.stringify({
    brand,
    dryRun,
    allBrands,
    failed,
    force,
    missingDescriptionEnOnly,
    products: products.length,
    skipped,
    targetLocale,
    translated
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
