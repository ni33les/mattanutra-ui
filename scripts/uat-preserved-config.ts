#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

type Db = any;

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
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["id"],
    name: "people",
    query: "select * from public.people order by created_at, id",
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["id"],
    name: "finance_accounts",
    query: "select * from public.finance_accounts order by created_at, id",
  },
  {
    conflictColumns: ["id"],
    name: "agents",
    query: "select * from public.agents order by created_at, id",
  },
  {
    conflictColumns: ["id"],
    name: "organisation_memberships",
    query:
      "select * from public.organisation_memberships order by created_at, id",
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["id"],
    name: "admin_passkey_credentials",
    query:
      "select * from public.admin_passkey_credentials order by created_at, id",
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["id"],
    name: "agent_credentials",
    query: "select * from public.agent_credentials order by created_at, id",
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["id"],
    name: "communication_identities",
    query: `
      select distinct communication_identities.*
      from public.communication_identities
      join public.organisation_communication_identities
        on organisation_communication_identities.identity_id = communication_identities.id
      join public.communication_channels
        on communication_channels.identity_id = communication_identities.id
      where communication_channels.status = 'active'
      order by communication_identities.created_at, communication_identities.id
    `,
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["organisation_id", "identity_id"],
    name: "organisation_communication_identities",
    query: `
      select distinct organisation_communication_identities.*
      from public.organisation_communication_identities
      join public.communication_channels
        on communication_channels.identity_id = organisation_communication_identities.identity_id
      where communication_channels.status = 'active'
      order by organisation_communication_identities.created_at,
        organisation_communication_identities.organisation_id,
        organisation_communication_identities.identity_id
    `,
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["id"],
    name: "communication_channels",
    query: `
      select communication_channels.*
      from public.communication_channels
      join public.organisation_communication_identities
        on organisation_communication_identities.identity_id = communication_channels.identity_id
      where communication_channels.status = 'active'
      order by communication_channels.created_at, communication_channels.id
    `,
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["organisation_id", "event_key", "channel_type"],
    name: "organisation_notification_preferences",
    query: `
      select organisation_notification_preferences.*
      from public.organisation_notification_preferences
      join public.organisations
        on organisations.id = organisation_notification_preferences.organisation_id
      order by organisation_notification_preferences.organisation_id,
        organisation_notification_preferences.event_key,
        organisation_notification_preferences.channel_type
    `,
    requireNonEmpty: true,
  },
  {
    conflictColumns: ["id"],
    name: "retail_carrier_accounts",
    query: `
      select *
      from public.retail_carrier_accounts
      where status <> 'deleted'
      order by created_at, id
    `,
  },
  {
    conflictColumns: ["organisation_id", "account_role"],
    name: "organisation_finance_accounts",
    query:
      "select * from public.organisation_finance_accounts order by created_at, organisation_id, account_role",
  },
] as const;

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function fail(message: string): never {
  throw new Error(`[uat-preserved-config] ${message}`);
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
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

function connectionLooksLikeUat(connectionString: string) {
  try {
    const url = new URL(connectionString);

    return /uat|mattanutra-uat/i.test(`${url.hostname}${url.pathname}`);
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
    ...(shouldUseSsl(connectionString) ? { ssl: "require" } : {}),
  });
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

  return rows.map((row: { column_name: string }) => row.column_name);
}

async function tableExists(sql: Db, tableName: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select to_regclass(${`public.${tableName}`}) is not null as exists
  `;

  return rows[0]?.exists === true;
}

function assertSnapshot(snapshot: PreservedSnapshot) {
  const missing = preservedTables
    .filter((table) => table.requireNonEmpty)
    .filter((table) => (snapshot.tables[table.name]?.length ?? 0) < 1)
    .map((table) => table.name);

  if (missing.length > 0) {
    fail(
      `Preserved UAT config snapshot is unexpectedly empty for: ${missing.join(", ")}`,
    );
  }
}

async function snapshotConfig(
  sql: Db,
  outputPath: string,
  input: Readonly<{ requireNonEmpty: boolean }>,
) {
  const tables: Record<string, readonly Record<string, unknown>[]> = {};

  for (const table of preservedTables) {
    if (!(await tableExists(sql, table.name))) {
      if (table.requireNonEmpty && input.requireNonEmpty) {
        fail(`Required preserved table is missing: ${table.name}`);
      }

      tables[table.name] = [];
      continue;
    }

    tables[table.name] = (await sql.unsafe(table.query)) as Record<
      string,
      unknown
    >[];
  }

  const snapshot: PreservedSnapshot = {
    createdAt: new Date().toISOString(),
    database: await currentDatabase(sql),
    tables,
  };

  if (input.requireNonEmpty) {
    assertSnapshot(snapshot);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        database: snapshot.database,
        outputPath,
        status: "snapshotted",
        tables: Object.fromEntries(
          preservedTables.map((table) => [
            table.name,
            tables[table.name]?.length ?? 0,
          ]),
        ),
      },
      null,
      2,
    ),
  );
}

async function restoreTable(
  sql: Db,
  table: PreserveTable,
  rows: readonly Record<string, unknown>[],
) {
  if (rows.length < 1) {
    return 0;
  }

  if (!(await tableExists(sql, table.name))) {
    fail(`Cannot restore ${table.name}; target table is missing`);
  }

  const columns = await tableColumns(sql, table.name);
  const insertColumns = columns.filter((column: string) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column)),
  );

  if (insertColumns.length < 1) {
    return 0;
  }

  const conflictColumns = table.conflictColumns.map(quoteIdentifier).join(", ");
  const updateColumns = insertColumns
    .filter((column: string) => !table.conflictColumns.includes(column))
    .map(
      (column: string) =>
        `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`,
    );
  const sqlText = [
    `insert into public.${quoteIdentifier(table.name)} (${insertColumns.map(quoteIdentifier).join(", ")})`,
    `values (${insertColumns.map((_: string, index: number) => `$${index + 1}`).join(", ")})`,
    `on conflict (${conflictColumns})`,
    updateColumns.length > 0
      ? `do update set ${updateColumns.join(", ")}`
      : "do nothing",
  ].join(" ");

  for (const row of rows) {
    await sql.unsafe(
      sqlText,
      insertColumns.map((column: string) => row[column] ?? null),
    );
  }

  return rows.length;
}

async function restoreConfig(sql: Db, snapshotPath: string) {
  const snapshot = JSON.parse(
    await readFile(snapshotPath, "utf8"),
  ) as PreservedSnapshot;
  const restored: Record<string, number> = {};

  assertSnapshot(snapshot);

  await sql.begin(async (transaction: Db) => {
    for (const table of preservedTables) {
      restored[table.name] = await restoreTable(
        transaction,
        table,
        snapshot.tables[table.name] ?? [],
      );
    }
  });

  console.log(
    JSON.stringify(
      {
        database: await currentDatabase(sql),
        snapshotPath,
        status: "restored",
        tables: restored,
      },
      null,
      2,
    ),
  );
}

async function verifyConfig(sql: Db, snapshotPath: string) {
  const snapshot = JSON.parse(
    await readFile(snapshotPath, "utf8"),
  ) as PreservedSnapshot;
  const details: Record<string, { expected: number; actual: number }> = {};

  assertSnapshot(snapshot);

  for (const table of preservedTables) {
    const expected = snapshot.tables[table.name]?.length ?? 0;

    if (!(await tableExists(sql, table.name))) {
      if (expected > 0) {
        fail(`Restore verification failed for ${table.name}: table is missing`);
      }

      details[table.name] = { actual: 0, expected };
      continue;
    }

    const rows = await sql<Array<{ count: string }>>`
      select count(*)::text as count
      from public.${sql(table.name)}
    `;
    const actual = Number(rows[0]?.count ?? 0);

    details[table.name] = { actual, expected };

    if (actual < expected) {
      fail(
        `Restore verification failed for ${table.name}: expected at least ${expected}, got ${actual}`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        database: await currentDatabase(sql),
        snapshotPath,
        status: "verified",
        tables: details,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const command = process.argv[2];
  const connection = envText("DB_URL") || envText("UAT_DB_URL");

  if (!command || !["snapshot", "restore", "verify"].includes(command)) {
    fail(
      "Usage: uat-preserved-config.ts <snapshot|restore|verify> --snapshot=<path>",
    );
  }

  if (!connection) {
    fail("DB_URL or UAT_DB_URL is required");
  }

  if (!connectionLooksLikeUat(connection) && !hasArg("allow-non-uat-db")) {
    fail("Configured database does not look like UAT");
  }

  const snapshotPath = resolve(
    argValue("snapshot") ??
      `reports/uat-preserved-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const sql = makeSql(connection);

  try {
    if (command === "snapshot") {
      await snapshotConfig(sql, snapshotPath, {
        requireNonEmpty: !hasArg("allow-empty"),
      });
      return;
    }

    if (command === "restore") {
      await restoreConfig(sql, snapshotPath);
      return;
    }

    await verifyConfig(sql, snapshotPath);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
