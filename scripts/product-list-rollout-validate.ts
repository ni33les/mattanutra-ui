import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  assertProductListRolloutDatabaseTarget,
  parseProductListRolloutCsv,
  productListRolloutCounts,
  type ProductListRolloutEnvironment
} from "@/lib/product-list-rollout";
import { closeSqlPool, getSql } from "@/lib/db";

const FIRST_PARTY_IMAGE_PATTERN =
  "^(https://mattanutra\\.sgp1\\.cdn\\.digitaloceanspaces\\.com/|https://mattanutra\\.com/|https://dev\\.mattanutra\\.com/|https://uat\\.mattanutra\\.com/|/)";

type SnapshotPayload = Readonly<{
  tables?: {
    retail_product_stock?: Array<{
      organisation_id?: string;
      product_id?: string;
      stock_quantity?: unknown;
    }>;
  };
}>;

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function environmentFromArgs(): ProductListRolloutEnvironment {
  const raw = argValue("env") ?? process.env.MATTANUTRA_ENV ?? "dev";
  const normalized = raw.trim().toLowerCase();

  if (normalized === "dev" || normalized === "development" || normalized === "local") {
    return "dev";
  }

  if (normalized === "uat" || normalized === "staging" || normalized === "stage") {
    return "uat";
  }

  throw new Error(`Unsupported product list rollout environment: ${raw}`);
}

function asCount(row: { count?: unknown } | undefined) {
  return Number(row?.count ?? 0);
}

function stockKey(row: { organisation_id?: string; product_id?: string }) {
  return `${row.organisation_id ?? ""}:${row.product_id ?? ""}`;
}

async function loadBeforeStockSnapshot(snapshotPath: string | null) {
  if (!snapshotPath) {
    return new Map<string, string>();
  }

  const payload = JSON.parse(await readFile(snapshotPath, "utf8")) as SnapshotPayload;
  const rows = payload.tables?.retail_product_stock ?? [];

  return new Map(
    rows
      .filter((row) => row.organisation_id && row.product_id)
      .map((row) => [stockKey(row), String(row.stock_quantity ?? "")])
  );
}

async function maybeWriteReport(outputPath: string | null, payload: unknown) {
  if (!outputPath) {
    return;
  }

  const { mkdir } = await import("node:fs/promises");

  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const environment = environmentFromArgs();
  const csvPath = argValue("csv") ?? "/root/files/new-prodcuts.csv";
  const dbUrl = process.env.DB_URL;

  assertProductListRolloutDatabaseTarget(dbUrl ?? undefined, environment);

  const parsed = parseProductListRolloutCsv(await readFile(csvPath, "utf8"));
  const counts = productListRolloutCounts(parsed.rows);
  const selectedIds = parsed.rows
    .filter((row) => row.selectedRetail)
    .map((row) => row.canonicalProductId);
  const dhcIds = parsed.rows
    .filter((row) => row.isDhc)
    .map((row) => row.canonicalProductId);
  const newIds = parsed.rows
    .filter((row) => row.isNewAddition)
    .map((row) => row.canonicalProductId);
  const beforeStock = await loadBeforeStockSnapshot(argValue("before-retail-snapshot"));
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const [newProducts] = await sql<Array<{ count: string }>>`
    select count(*)::text
    from public.products
    where id = any(${newIds}::uuid[])
  `;
  const [approvedSelected] = await sql<Array<{ count: string }>>`
    select count(*)::text
    from public.products
    where id = any(${selectedIds}::uuid[])
      and status = 'approved'
  `;
  const activeSellables = await sql<Array<{ count: string; slug: string }>>`
    select organisation.slug, count(*)::text
    from public.retail_sellable_products sellable
    join public.organisations organisation on organisation.id = sellable.organisation_id
    where organisation.slug in ('delight-pharmacy', 'enchanted-pharmacy')
      and sellable.product_id = any(${selectedIds}::uuid[])
      and sellable.status = 'active'
    group by organisation.slug
  `;
  const [activeDhcSellables] = await sql<Array<{ count: string }>>`
    select count(*)::text
    from public.retail_sellable_products sellable
    join public.organisations organisation on organisation.id = sellable.organisation_id
    where organisation.slug in ('delight-pharmacy', 'enchanted-pharmacy')
      and sellable.product_id = any(${dhcIds}::uuid[])
      and sellable.status = 'active'
  `;
  const [externalImageUrls] = await sql<Array<{ count: string }>>`
    select count(*)::text
    from public.products
    where image_url is not null
      and image_url <> ''
      and image_url !~ ${FIRST_PARTY_IMAGE_PATTERN}
  `;
  const [selectedMissingFirstPartyImage] = await sql<Array<{ count: string }>>`
    select count(*)::text
    from public.products
    where id = any(${selectedIds}::uuid[])
      and (
        image_url is null
        or image_url = ''
        or image_url !~ ${FIRST_PARTY_IMAGE_PATTERN}
      )
  `;
  const currentStockRows = await sql<Array<{
    organisation_id: string;
    product_id: string;
    stock_quantity: unknown;
  }>>`
    select
      stock.organisation_id::text,
      stock.product_id::text,
      stock.stock_quantity
    from public.retail_product_stock stock
    join public.organisations organisation on organisation.id = stock.organisation_id
    where organisation.slug in ('delight-pharmacy', 'enchanted-pharmacy')
  `;
  const currentStock = new Map(
    currentStockRows.map((row) => [stockKey(row), String(row.stock_quantity ?? "")])
  );
  const stockQuantityChanges = [...beforeStock].filter(
    ([key, quantity]) => currentStock.get(key) !== quantity
  );
  const sellableCounts = Object.fromEntries(
    activeSellables.map((row) => [row.slug, Number(row.count)])
  );
  const summary = {
    checkedAt: new Date().toISOString(),
    counts,
    environment,
    checks: {
      activeDhcSellables: asCount(activeDhcSellables),
      approvedSelected: asCount(approvedSelected),
      externalImageUrls: asCount(externalImageUrls),
      newProducts: asCount(newProducts),
      selectedMissingFirstPartyImage: asCount(selectedMissingFirstPartyImage),
      sellableCounts,
      stockQuantityChanges: stockQuantityChanges.length
    },
    expected: {
      activeDhcSellables: 0,
      approvedSelected: counts.nonDhcRows,
      externalImageUrls: 0,
      newProducts: counts.newRows,
      selectedMissingFirstPartyImage: 0,
      sellableCountPerRetailer: counts.nonDhcRows,
      stockQuantityChanges: 0
    },
    ok:
      asCount(newProducts) === counts.newRows &&
      asCount(approvedSelected) === counts.nonDhcRows &&
      Number(sellableCounts["delight-pharmacy"] ?? 0) === counts.nonDhcRows &&
      Number(sellableCounts["enchanted-pharmacy"] ?? 0) === counts.nonDhcRows &&
      asCount(activeDhcSellables) === 0 &&
      asCount(externalImageUrls) === 0 &&
      asCount(selectedMissingFirstPartyImage) === 0 &&
      stockQuantityChanges.length === 0,
    stockQuantityChangeSample: stockQuantityChanges.slice(0, 10).map(([key, before]) => ({
      after: currentStock.get(key) ?? null,
      before,
      key
    }))
  };

  await maybeWriteReport(argValue("out"), summary);
  await closeSqlPool();

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`[product-list:validate] failed: ${message}`);
  process.exitCode = 1;
});
