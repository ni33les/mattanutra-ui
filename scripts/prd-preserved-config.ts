#!/usr/bin/env node

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

type Db = postgres.Sql | postgres.TransactionSql;

type PreserveTable = Readonly<{
  conflictColumns: readonly string[];
  name: string;
  query: string;
  requireNonEmpty?: boolean;
}>;

type PreservedSnapshot = Readonly<{
  createdAt: string;
  database: string;
  tables: Record<string, readonly Record<string, unknown>[]>;
}>;

const preservedTables: readonly PreserveTable[] = [
  {
    conflictColumns: ["id"],
    name: "organisations",
    query: "select * from public.organisations order by created_at, id",
    requireNonEmpty: true
  },
  {
    conflictColumns: ["id"],
    name: "finance_accounts",
    query: "select * from public.finance_accounts order by created_at, id"
  },
  {
    conflictColumns: ["id"],
    name: "people",
    query: "select * from public.people order by created_at, id"
  },
  {
    conflictColumns: ["id"],
    name: "agents",
    query: "select * from public.agents order by created_at, id",
    requireNonEmpty: true
  },
  {
    conflictColumns: ["id"],
    name: "organisation_memberships",
    query: "select * from public.organisation_memberships order by created_at, id",
    requireNonEmpty: true
  },
  {
    conflictColumns: ["id"],
    name: "admin_passkey_credentials",
    query: "select * from public.admin_passkey_credentials order by created_at, id"
  },
  {
    conflictColumns: ["id"],
    name: "agent_credentials",
    query: "select * from public.agent_credentials order by created_at, id",
    requireNonEmpty: true
  },
  {
    conflictColumns: ["id"],
    name: "communication_identities",
    query: "select * from public.communication_identities order by created_at, id"
  },
  {
    conflictColumns: ["id"],
    name: "communication_channels",
    query: "select * from public.communication_channels where status = 'active' order by created_at, id"
  },
  {
    conflictColumns: ["organisation_id", "identity_id"],
    name: "organisation_communication_identities",
    query: "select * from public.organisation_communication_identities order by created_at, organisation_id, identity_id"
  },
  {
    conflictColumns: ["organisation_id", "event_key", "channel_type"],
    name: "organisation_notification_preferences",
    query: "select * from public.organisation_notification_preferences order by organisation_id, event_key, channel_type"
  },
  {
    conflictColumns: ["id"],
    name: "retail_carrier_accounts",
    query: "select * from public.retail_carrier_accounts where status <> 'deleted' order by created_at, id"
  },
  {
    conflictColumns: ["organisation_id", "account_role"],
    name: "organisation_finance_accounts",
    query: "select * from public.organisation_finance_accounts order by created_at, organisation_id, account_role"
  }
] as const;

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  throw new Error(`[prd-preserved-config] ${message}`);
}

function quoteIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    fail(`Unsafe identifier ${value}`);
  }

  return `"${value.replaceAll('"', '""')}"`;
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

function connectionLooksLikePrd(connectionString: string) {
  try {
    const url = new URL(connectionString);

    return /prd|prod|mattanutra-prd/i.test(`${url.hostname}${url.pathname}`);
  } catch {
    return false;
  }
}

function makeSql(connectionString: string) {
  return postgres(connectionString, {
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...(shouldUseSsl(connectionString) ? { ssl: "require" } : {})
  });
}

function preservedSqlValue(value: unknown): postgres.ParameterOrJSON<never> {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string" ||
    value instanceof Date ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  return value === undefined
    ? null
    : JSON.parse(JSON.stringify(value)) as postgres.ParameterOrJSON<never>;
}

async function tableExists(sql: Db, tableName: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select to_regclass(${`public.${tableName}`}) is not null as exists
  `;

  return rows[0]?.exists === true;
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

async function currentDatabase(sql: Db) {
  const rows = await sql<Array<{ database: string }>>`
    select current_database() as database
  `;

  return rows[0]?.database ?? "unknown";
}

function assertSnapshot(snapshot: PreservedSnapshot) {
  const missing = preservedTables
    .filter((table) => table.requireNonEmpty)
    .filter((table) => (snapshot.tables[table.name]?.length ?? 0) < 1)
    .map((table) => table.name);

  if (missing.length > 0) {
    fail(`Preserved PRD runtime config is empty for: ${missing.join(", ")}`);
  }
}

async function snapshotConfig(sql: Db, outputPath: string) {
  const tables: Record<string, readonly Record<string, unknown>[]> = {};

  for (const table of preservedTables) {
    tables[table.name] = (await tableExists(sql, table.name))
      ? await sql.unsafe(table.query) as Record<string, unknown>[]
      : [];
  }

  const snapshot: PreservedSnapshot = {
    createdAt: new Date().toISOString(),
    database: await currentDatabase(sql),
    tables
  };

  assertSnapshot(snapshot);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await chmod(outputPath, 0o600);

  console.log(JSON.stringify({
    database: snapshot.database,
    outputPath,
    status: "snapshotted",
    tables: Object.fromEntries(
      preservedTables.map((table) => [table.name, tables[table.name]?.length ?? 0])
    )
  }, null, 2));
}

async function deleteNaturalKeyConflicts(
  sql: Db,
  tableName: string,
  rows: readonly Record<string, unknown>[]
) {
  for (const row of rows) {
    if (tableName === "organisations" && row.slug && row.id) {
      await sql`
        delete from public.organisations
        where lower(slug) = lower(${String(row.slug)})
          and id::text <> ${String(row.id)}
      `;
    }

    if (tableName === "people" && row.email && row.id) {
      await sql`
        delete from public.people
        where lower(email) = lower(${String(row.email)})
          and id::text <> ${String(row.id)}
      `;
    }

    if (tableName === "finance_accounts" && row.name && row.id) {
      await sql`
        delete from public.finance_accounts
        where lower(name) = lower(${String(row.name)})
          and id::text <> ${String(row.id)}
      `;
    }

    if (tableName === "agents" && row.name && row.id) {
      await sql`
        delete from public.agents
        where lower(name) = lower(${String(row.name)})
          and id::text <> ${String(row.id)}
      `;
    }
  }
}

async function restoreTable(
  sql: Db,
  table: PreserveTable,
  rows: readonly Record<string, unknown>[]
) {
  if (rows.length < 1) {
    return 0;
  }

  if (!(await tableExists(sql, table.name))) {
    fail(`Cannot restore ${table.name}; target table is missing`);
  }

  await deleteNaturalKeyConflicts(sql, table.name, rows);
  const columns = await tableColumns(sql, table.name);
  const insertColumns = columns.filter((column) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))
  );

  if (insertColumns.length < 1) {
    return 0;
  }

  const conflictColumns = table.conflictColumns.map(quoteIdentifier).join(", ");
  const updateColumns = insertColumns
    .filter((column) => !table.conflictColumns.includes(column))
    .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`);
  const sqlText = [
    `insert into public.${quoteIdentifier(table.name)} (${insertColumns.map(quoteIdentifier).join(", ")})`,
    `values (${insertColumns.map((_, index) => `$${index + 1}`).join(", ")})`,
    `on conflict (${conflictColumns})`,
    updateColumns.length > 0 ? `do update set ${updateColumns.join(", ")}` : "do nothing"
  ].join(" ");

  for (const row of rows) {
    await sql.unsafe(
      sqlText,
      insertColumns.map((column) => preservedSqlValue(row[column]))
    );
  }

  return rows.length;
}

async function restoreConfig(sql: postgres.Sql, snapshotPath: string) {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as PreservedSnapshot;
  const restored: Record<string, number> = {};

  assertSnapshot(snapshot);
  await sql.begin(async (transaction) => {
    for (const table of preservedTables) {
      restored[table.name] = await restoreTable(
        transaction,
        table,
        snapshot.tables[table.name] ?? []
      );
    }
  });

  console.log(JSON.stringify({
    database: await currentDatabase(sql),
    snapshotPath,
    status: "restored",
    tables: restored
  }, null, 2));
}

async function verifyConfig(sql: Db, snapshotPath: string) {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as PreservedSnapshot;
  const details: Record<string, { actual: number; expected: number }> = {};

  assertSnapshot(snapshot);
  for (const table of preservedTables) {
    const expected = snapshot.tables[table.name]?.length ?? 0;
    const actual = (await tableExists(sql, table.name))
      ? Number((await sql<Array<{ count: string }>>`
          select count(*)::text as count
          from public.${sql(table.name)}
        `)[0]?.count ?? 0)
      : 0;

    details[table.name] = { actual, expected };
    if ((table.requireNonEmpty || expected > 0) && actual < expected) {
      fail(`Restore verification failed for ${table.name}: expected at least ${expected}, got ${actual}`);
    }
  }

  console.log(JSON.stringify({
    database: await currentDatabase(sql),
    snapshotPath,
    status: "verified",
    tables: details
  }, null, 2));
}

async function main() {
  const command = process.argv[2];
  const connection = envText("DB_URL") || envText("PRD_DB_URL");

  if (!command || !["snapshot", "restore", "verify"].includes(command)) {
    fail("Usage: prd-preserved-config.ts <snapshot|restore|verify> --snapshot=<path>");
  }

  if (!connection) {
    fail("DB_URL or PRD_DB_URL is required");
  }

  if (!connectionLooksLikePrd(connection) && !hasArg("allow-non-prd-db")) {
    fail("Configured database does not look like PRD");
  }

  const snapshotPath = resolve(
    argValue("snapshot") ??
      `reports/prd-preserved-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  const sql = makeSql(connection);

  try {
    if (command === "snapshot") {
      await snapshotConfig(sql, snapshotPath);
    } else if (command === "restore") {
      await restoreConfig(sql, snapshotPath);
    } else {
      await verifyConfig(sql, snapshotPath);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
