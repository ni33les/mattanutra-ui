import postgres from "postgres";

type Db = postgres.Sql | postgres.TransactionSql;
type RootDb = postgres.Sql;
type Row = Record<string, unknown>;

const DEFAULT_ORG_SLUGS = ["delight-pharmacy", "enchanted-pharmacy"] as const;
const RETAIL_TABLES = [
  "retail_sellable_products",
  "retail_product_stock",
  "retail_product_cost_observations",
  "retail_product_stock_snapshots",
  "retail_stock_lots",
  "retail_stock_movements",
  "retail_stock_reorder_advice",
] as const;
const DELETE_ORDER = [
  "retail_stock_reorder_advice",
  "retail_stock_movements",
  "retail_stock_lots",
  "retail_product_stock_snapshots",
  "retail_product_cost_observations",
  "retail_product_stock",
  "retail_sellable_products",
] as const;
const INSERT_ORDER = [
  "retail_sellable_products",
  "retail_product_stock",
  "retail_product_cost_observations",
  "retail_product_stock_snapshots",
  "retail_stock_lots",
  "retail_stock_movements",
  "retail_stock_reorder_advice",
] as const;

type RetailTableName = (typeof RETAIL_TABLES)[number];

type OrganisationRow = Readonly<{
  id: string;
  slug: string;
}>;

type InventoryRows = Record<RetailTableName, Row[]>;

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  throw new Error(`[uat-retail-sync] ${message}`);
}

function connectionLooksLike(value: string, pattern: RegExp) {
  try {
    const url = new URL(value);

    return pattern.test(`${url.hostname}${url.pathname}`);
  } catch {
    return false;
  }
}

function shouldUseSsl(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return (
    url.hostname.endsWith(".db.ondigitalocean.com") ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  );
}

function makeSql(connectionString: string): RootDb {
  return postgres(connectionString, {
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...(shouldUseSsl(connectionString) ? { ssl: "require" } : {}),
  });
}

function retailOrgSlugs() {
  const configured = envText("MATTANUTRA_UAT_RETAIL_ORG_SLUGS");

  if (!configured) {
    return [...DEFAULT_ORG_SLUGS];
  }

  const slugs = configured
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  if (slugs.length < 1) {
    fail("MATTANUTRA_UAT_RETAIL_ORG_SLUGS did not contain any slugs");
  }

  return slugs;
}

function uniq(values: Iterable<unknown>) {
  return [
    ...new Set(
      [...values]
        .filter((value): value is string => typeof value === "string")
        .filter(Boolean),
    ),
  ];
}

function chunkRows<T>(rows: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push([...rows.slice(index, index + size)]);
  }

  return chunks;
}

async function currentDatabase(sql: Db) {
  const rows = await sql<Array<{ database: string }>>`
    select current_database() as database
  `;

  return rows[0]?.database ?? "unknown";
}

async function tableColumns(sql: Db, tableName: string) {
  const rows = await sql<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
    order by ordinal_position
  `;

  return rows.map((row) => row.column_name);
}

async function requireTenantOrganisations(
  sql: Db,
  slugs: readonly string[],
  label: string,
) {
  const rows = await sql<OrganisationRow[]>`
    select id::text, slug
    from public.organisations
    where slug = any(${slugs}::text[])
      and organisation_type = 'tenant'
    order by slug
  `;
  const found = new Map(rows.map((row) => [row.slug, row]));
  const missing = slugs.filter((slug) => !found.has(slug));

  if (missing.length > 0) {
    fail(`${label} is missing tenant organisation(s): ${missing.join(", ")}`);
  }

  return rows;
}

async function fetchSourceInventory(
  source: Db,
  sourceOrgIds: readonly string[],
) {
  const rows: InventoryRows = {
    retail_sellable_products: await source<Row[]>`
      select *
      from public.retail_sellable_products
      where organisation_id = any(${sourceOrgIds}::uuid[])
      order by organisation_id, product_id, id
    `,
    retail_product_stock: await source<Row[]>`
      select *
      from public.retail_product_stock
      where organisation_id = any(${sourceOrgIds}::uuid[])
      order by organisation_id, product_id, id
    `,
    retail_product_cost_observations: [],
    retail_product_stock_snapshots: await source<Row[]>`
      select snapshots.*
      from public.retail_product_stock_snapshots snapshots
      join public.retail_product_stock stock
        on stock.id = snapshots.retail_product_stock_id
      where stock.organisation_id = any(${sourceOrgIds}::uuid[])
      order by snapshots.organisation_id, snapshots.product_id, snapshots.recorded_at, snapshots.id
    `,
    retail_stock_lots: await source<Row[]>`
      select lots.*
      from public.retail_stock_lots lots
      join public.retail_product_stock stock
        on stock.id = lots.retail_product_stock_id
      where stock.organisation_id = any(${sourceOrgIds}::uuid[])
      order by lots.organisation_id, lots.product_id, lots.received_at, lots.id
    `,
    retail_stock_movements: await source<Row[]>`
      select movements.*
      from public.retail_stock_movements movements
      join public.retail_product_stock stock
        on stock.id = movements.retail_product_stock_id
      where stock.organisation_id = any(${sourceOrgIds}::uuid[])
      order by movements.organisation_id, movements.product_id, movements.occurred_at, movements.id
    `,
    retail_stock_reorder_advice: await source<Row[]>`
      select advice.*
      from public.retail_stock_reorder_advice advice
      join public.retail_product_stock stock
        on stock.id = advice.retail_product_stock_id
      where stock.organisation_id = any(${sourceOrgIds}::uuid[])
      order by advice.organisation_id, advice.product_id, advice.id
    `,
  };
  const productIds = inventoryProductIds(rows);

  rows.retail_product_cost_observations =
    productIds.length > 0
      ? await source<Row[]>`
          select *
          from public.retail_product_cost_observations
          where organisation_id = any(${sourceOrgIds}::uuid[])
            or (
              organisation_id is null
              and product_id = any(${productIds}::uuid[])
            )
          order by organisation_id nulls first, product_id, observed_at, id
        `
      : [];

  return rows;
}

function inventoryProductIds(rows: InventoryRows) {
  return uniq(
    RETAIL_TABLES.flatMap((tableName) =>
      rows[tableName].map((row) => row.product_id),
    ),
  );
}

function inventoryStockIds(rows: InventoryRows) {
  return uniq(rows.retail_product_stock.map((row) => row.id));
}

async function existingIds(sql: Db, tableName: string, ids: readonly string[]) {
  if (ids.length < 1) {
    return new Set<string>();
  }

  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.${sql(tableName)}
    where id = any(${ids}::uuid[])
  `;

  return new Set(rows.map((row) => row.id));
}

async function assertProductsExist(target: Db, productIds: readonly string[]) {
  const existing = await existingIds(target, "products", productIds);
  const missing = productIds.filter((id) => !existing.has(id));

  if (missing.length > 0) {
    fail(
      `UAT catalogue is missing ${missing.length} source retail product(s): ${missing
        .slice(0, 10)
        .join(", ")}`,
    );
  }
}

async function assertNoStockIdConflicts(
  target: Db,
  input: Readonly<{
    sourceStockIds: readonly string[];
    targetOrgIds: readonly string[];
  }>,
) {
  if (input.sourceStockIds.length < 1) {
    return;
  }

  const rows = await target<Array<{ id: string; organisation_id: string }>>`
    select id::text, organisation_id::text
    from public.retail_product_stock
    where id = any(${input.sourceStockIds}::uuid[])
      and not (organisation_id = any(${input.targetOrgIds}::uuid[]))
  `;

  if (rows.length > 0) {
    fail(
      `UAT has ${rows.length} retail stock id conflict(s) outside target tenants`,
    );
  }
}

async function assertNoOperationalStockBlockers(
  target: Db,
  targetOrgIds: readonly string[],
) {
  const rows = await target<Array<{ row_count: string; table_name: string }>>`
    select 'retail_order_allocations' as table_name, count(*)::text as row_count
    from public.retail_order_allocations
    where organisation_id = any(${targetOrgIds}::uuid[])
  `;
  const blockers = rows.filter((row) => Number(row.row_count) > 0);

  if (blockers.length > 0) {
    fail(
      `UAT has stock-linked operational rows; run the full rebuild before sync: ${blockers
        .map((row) => `${row.table_name}=${row.row_count}`)
        .join(", ")}`,
    );
  }
}

function assertSourceReferences(rows: InventoryRows) {
  const stockIds = new Set(inventoryStockIds(rows));
  const lotIds = new Set(uniq(rows.retail_stock_lots.map((row) => row.id)));
  const movementIds = new Set(
    uniq(rows.retail_stock_movements.map((row) => row.id)),
  );
  const missingStockRefs = RETAIL_TABLES.flatMap((tableName) =>
    rows[tableName]
      .map((row) => row.retail_product_stock_id)
      .filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && !stockIds.has(id),
      )
      .map((id) => `${tableName}:${id}`),
  );
  const missingLotRefs = rows.retail_stock_movements
    .map((row) => row.lot_id)
    .filter(
      (id): id is string =>
        typeof id === "string" && id.length > 0 && !lotIds.has(id),
    );
  const missingMovementRefs = rows.retail_stock_movements
    .map((row) => row.voids_movement_id)
    .filter(
      (id): id is string =>
        typeof id === "string" && id.length > 0 && !movementIds.has(id),
    );

  if (missingStockRefs.length > 0) {
    fail(
      `DEV inventory has missing stock reference(s): ${missingStockRefs
        .slice(0, 10)
        .join(", ")}`,
    );
  }

  if (missingLotRefs.length > 0) {
    fail(
      `DEV inventory has missing lot reference(s): ${missingLotRefs
        .slice(0, 10)
        .join(", ")}`,
    );
  }

  if (missingMovementRefs.length > 0) {
    fail(
      `DEV inventory has missing movement reference(s): ${missingMovementRefs
        .slice(0, 10)
        .join(", ")}`,
    );
  }
}

function remapOrganisationId(
  tableName: RetailTableName,
  value: unknown,
  organisationIdMap: ReadonlyMap<string, string>,
) {
  if (value === null || value === undefined) {
    if (tableName === "retail_product_cost_observations") {
      return null;
    }

    fail(`${tableName} row is missing organisation_id`);
  }

  const id = String(value);
  const mapped = organisationIdMap.get(id);

  if (!mapped) {
    fail(`${tableName} row references unmapped organisation ${id}`);
  }

  return mapped;
}

function remapRows(
  rows: InventoryRows,
  input: Readonly<{
    organisationIdMap: ReadonlyMap<string, string>;
    targetPersonIds: ReadonlySet<string>;
    targetTaskIds: ReadonlySet<string>;
  }>,
) {
  const remapped = Object.fromEntries(
    RETAIL_TABLES.map((tableName) => [
      tableName,
      rows[tableName].map((row) => {
        const next = { ...row };

        if ("organisation_id" in next) {
          next.organisation_id = remapOrganisationId(
            tableName,
            next.organisation_id,
            input.organisationIdMap,
          );
        }

        if (
          typeof next.actor_person_id === "string" &&
          !input.targetPersonIds.has(next.actor_person_id)
        ) {
          next.actor_person_id = null;
        }

        if (
          typeof next.generated_by_task_id === "string" &&
          !input.targetTaskIds.has(next.generated_by_task_id)
        ) {
          next.generated_by_task_id = null;
        }

        return next;
      }),
    ]),
  ) as InventoryRows;

  return remapped;
}

async function deleteTargetInventory(
  sql: Db,
  input: Readonly<{
    productIds: readonly string[];
    targetOrgIds: readonly string[];
  }>,
) {
  const deleted: Record<string, number> = {};

  for (const tableName of DELETE_ORDER) {
    if (tableName === "retail_product_cost_observations") {
      const result = await sql`
        delete from public.retail_product_cost_observations
        where organisation_id = any(${input.targetOrgIds}::uuid[])
          or (
            organisation_id is null
            and product_id = any(${input.productIds}::uuid[])
          )
      `;
      deleted[tableName] = result.count;
      continue;
    }

    const result = await sql`
      delete from public.${sql(tableName)}
      where organisation_id = any(${input.targetOrgIds}::uuid[])
    `;
    deleted[tableName] = result.count;
  }

  return deleted;
}

async function insertTableRows(
  sql: Db,
  tableName: RetailTableName,
  rows: readonly Row[],
) {
  if (rows.length < 1) {
    return 0;
  }

  const targetColumns = await tableColumns(sql, tableName);
  const insertColumns = targetColumns.filter((column) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column)),
  );

  if (insertColumns.length < 1) {
    return 0;
  }

  for (const chunk of chunkRows(rows, 250)) {
    await sql`
      insert into public.${sql(tableName)}
      ${sql(chunk, ...insertColumns)}
    `;
  }

  return rows.length;
}

async function insertTargetInventory(sql: Db, rows: InventoryRows) {
  const inserted: Record<string, number> = {};

  for (const tableName of INSERT_ORDER) {
    if (tableName === "retail_stock_movements") {
      const baseMovements = rows.retail_stock_movements.filter(
        (row) => !row.voids_movement_id,
      );
      const voidMovements = rows.retail_stock_movements.filter(
        (row) => row.voids_movement_id,
      );
      inserted[tableName] =
        (await insertTableRows(sql, tableName, baseMovements)) +
        (await insertTableRows(sql, tableName, voidMovements));
      continue;
    }

    inserted[tableName] = await insertTableRows(sql, tableName, rows[tableName]);
  }

  return inserted;
}

async function targetCounts(
  sql: Db,
  input: Readonly<{
    productIds: readonly string[];
    targetOrgIds: readonly string[];
  }>,
) {
  const counts: Record<string, number> = {};

  for (const tableName of RETAIL_TABLES) {
    if (tableName === "retail_product_cost_observations") {
      const rows = await sql<Array<{ count: string }>>`
        select count(*)::text as count
        from public.retail_product_cost_observations
        where organisation_id = any(${input.targetOrgIds}::uuid[])
          or (
            organisation_id is null
            and product_id = any(${input.productIds}::uuid[])
          )
      `;
      counts[tableName] = Number(rows[0]?.count ?? 0);
      continue;
    }

    const rows = await sql<Array<{ count: string }>>`
      select count(*)::text as count
      from public.${sql(tableName)}
      where organisation_id = any(${input.targetOrgIds}::uuid[])
    `;
    counts[tableName] = Number(rows[0]?.count ?? 0);
  }

  return counts;
}

async function activeRetailCounts(sql: Db, slugs: readonly string[]) {
  return sql<
    Array<{
      active_sellables: string;
      active_stock_rows: string;
      slug: string;
      stock_quantity_sum: string;
    }>
  >`
    select
      organisations.slug,
      (
        select count(*)::text
        from public.retail_sellable_products sellable
        where sellable.organisation_id = organisations.id
          and sellable.status = 'active'
      ) as active_sellables,
      (
        select count(*)::text
        from public.retail_product_stock stock
        where stock.organisation_id = organisations.id
          and stock.status = 'active'
      ) as active_stock_rows,
      (
        select coalesce(sum(stock.stock_quantity), 0)::text
        from public.retail_product_stock stock
        where stock.organisation_id = organisations.id
          and stock.status = 'active'
      ) as stock_quantity_sum
    from public.organisations
    where organisations.slug = any(${slugs}::text[])
    order by organisations.slug
  `;
}

async function main() {
  if (hasArg("help")) {
    console.log(
      "Usage: sync-uat-retail-inventory.ts --confirm-retail-sync\n\nCopies DEV retail inventory for configured tenant slugs into UAT, preserving UAT organisation ids.",
    );
    return;
  }

  const targetConnection = envText("DB_URL") || envText("UAT_DB_URL");
  const sourceConnection = envText("DEV_DB_URL");

  if (!targetConnection) {
    fail("DB_URL or UAT_DB_URL is required for target UAT");
  }

  if (!sourceConnection) {
    fail("DEV_DB_URL is required for source DEV");
  }

  if (targetConnection === sourceConnection) {
    fail("Target UAT and source DEV connections are identical");
  }

  if (process.env.MATTANUTRA_ENV !== "uat") {
    fail("MATTANUTRA_ENV=uat is required");
  }

  if (
    process.env.MATTANUTRA_CONFIRM_UAT_RETAIL_SYNC !== "sync" &&
    !hasArg("confirm-retail-sync")
  ) {
    fail(
      "MATTANUTRA_CONFIRM_UAT_RETAIL_SYNC=sync or --confirm-retail-sync is required",
    );
  }

  if (!connectionLooksLike(targetConnection, /uat|mattanutra-uat/i)) {
    fail("DB_URL does not look like UAT");
  }

  if (!connectionLooksLike(sourceConnection, /dev|mn-dev|mattanutra-dev/i)) {
    fail("DEV_DB_URL does not look like DEV");
  }

  const slugs = retailOrgSlugs();
  const source = makeSql(sourceConnection);
  const target = makeSql(targetConnection);

  try {
    const sourceOrganisations = await requireTenantOrganisations(
      source,
      slugs,
      "DEV source",
    );
    const targetOrganisations = await requireTenantOrganisations(
      target,
      slugs,
      "UAT target",
    );
    const sourceBySlug = new Map(
      sourceOrganisations.map((organisation) => [
        organisation.slug,
        organisation,
      ]),
    );
    const targetBySlug = new Map(
      targetOrganisations.map((organisation) => [
        organisation.slug,
        organisation,
      ]),
    );
    const organisationIdMap = new Map(
      slugs.map((slug) => [
        sourceBySlug.get(slug)?.id ?? "",
        targetBySlug.get(slug)?.id ?? "",
      ]),
    );
    const sourceOrgIds = sourceOrganisations.map((organisation) => organisation.id);
    const targetOrgIds = targetOrganisations.map((organisation) => organisation.id);
    const sourceRows = await fetchSourceInventory(source, sourceOrgIds);
    const productIds = inventoryProductIds(sourceRows);
    const sourceStockIds = inventoryStockIds(sourceRows);

    assertSourceReferences(sourceRows);
    await assertProductsExist(target, productIds);
    await assertNoStockIdConflicts(target, {
      sourceStockIds,
      targetOrgIds,
    });
    await assertNoOperationalStockBlockers(target, targetOrgIds);

    const targetPersonIds = await existingIds(
      target,
      "people",
      uniq(
        [
          ...sourceRows.retail_product_stock_snapshots,
          ...sourceRows.retail_stock_movements,
        ].map((row) => row.actor_person_id),
      ),
    );
    const targetTaskIds = await existingIds(
      target,
      "tasks",
      uniq(sourceRows.retail_stock_reorder_advice.map((row) => row.generated_by_task_id)),
    );
    const remappedRows = remapRows(sourceRows, {
      organisationIdMap,
      targetPersonIds,
      targetTaskIds,
    });
    let deleted: Record<string, number> = {};
    let inserted: Record<string, number> = {};

    await target.begin(async (transaction) => {
      deleted = await deleteTargetInventory(transaction, {
        productIds,
        targetOrgIds,
      });
      inserted = await insertTargetInventory(transaction, remappedRows);
    });

    const counts = await targetCounts(target, {
      productIds,
      targetOrgIds,
    });
    const activeCounts = await activeRetailCounts(target, slugs);

    console.log(
      JSON.stringify(
        {
          activeCounts: activeCounts.map((row) => ({
            activeSellables: Number(row.active_sellables),
            activeStockRows: Number(row.active_stock_rows),
            slug: row.slug,
            stockQuantitySum: Number(row.stock_quantity_sum),
          })),
          deleted,
          inserted,
          sourceCounts: Object.fromEntries(
            RETAIL_TABLES.map((tableName) => [
              tableName,
              sourceRows[tableName].length,
            ]),
          ),
          sourceDatabase: await currentDatabase(source),
          status: "ok",
          targetCounts: counts,
          targetDatabase: await currentDatabase(target),
          targetOrganisationIdsBySlug: Object.fromEntries(
            targetOrganisations.map((organisation) => [
              organisation.slug,
              organisation.id,
            ]),
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([source.end({ timeout: 5 }), target.end({ timeout: 5 })]);
  }
}

await main();
