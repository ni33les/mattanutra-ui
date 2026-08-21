import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  T10_CATALOGUE_GROUPS,
  T10_PRD_RETAIL_SOURCE,
  assertPrdCatalogueDatabase,
  assertUatCatalogueDatabase,
  databaseNameFromUrl,
  derivePrdCatalogueSourceUrl,
  deriveUatCatalogueTargetUrl
} from "@/lib/catalogue-env-urls";
import { closeSqlPool, getSql } from "@/lib/db";

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolvePrdUrl() {
  return (
    argValue("prd-db-url") ||
    process.env.PRD_DB_URL ||
    derivePrdCatalogueSourceUrl(process.env.DB_URL)
  );
}

function resolveUatUrl() {
  return (
    argValue("uat-db-url") ||
    process.env.UAT_DB_URL ||
    deriveUatCatalogueTargetUrl(process.env.DB_URL)
  );
}

function runNode(script: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", script, ...args],
      {
        cwd: process.cwd(),
        env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function readJsonFile(filePath: string, label: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `${label} could not be read from ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function tableCountsFromSnapshot(payload: Record<string, unknown>) {
  const tables =
    payload.tables && typeof payload.tables === "object"
      ? (payload.tables as Record<string, unknown>)
      : {};
  const counts: Record<string, number> = {};

  for (const [name, rows] of Object.entries(tables)) {
    counts[name] = Array.isArray(rows) ? rows.length : 0;
  }

  return counts;
}

function groupCounts(counts: Record<string, number> | undefined) {
  const grouped: Record<string, { tables: Record<string, number>; total: number }> = {};

  for (const [group, tables] of Object.entries(T10_CATALOGUE_GROUPS)) {
    const tableCounts: Record<string, number> = {};
    let total = 0;

    for (const table of tables) {
      const value = Number(counts?.[table] ?? 0);
      tableCounts[table] = value;
      total += value;
    }

    grouped[group] = { tables: tableCounts, total };
  }

  return grouped;
}

function numberMap(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, number>;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      Number(entry ?? 0)
    ])
  );
}

function sumForTables(counts: Record<string, number>, tables: readonly string[]) {
  return tables.reduce((total, table) => total + Number(counts[table] ?? 0), 0);
}

function catalogOpLog(input: {
  failed: number;
  retained?: number;
  skipped: number;
  tables: readonly string[];
  insertedChildren: Record<string, number>;
  upserted: Record<string, number>;
}) {
  return {
    failed: input.failed,
    retained: input.retained ?? 0,
    skipped: input.skipped,
    updated: sumForTables(input.upserted, input.tables),
    written: sumForTables(input.insertedChildren, input.tables)
  };
}

async function withDatabase<T>(connection: string, work: (sql: NonNullable<ReturnType<typeof getSql>>) => Promise<T>) {
  process.env.DB_URL = connection;
  await closeSqlPool();
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured.");
  }

  try {
    return await work(sql);
  } finally {
    await closeSqlPool();
  }
}

async function delightApprovedLiveCount(sql: NonNullable<ReturnType<typeof getSql>>) {
  const rows = await sql<Array<{ n: number }>>`
    select count(*)::int as n
    from public.retail_sellable_products sellable
    join public.organisations organisation on organisation.id = sellable.organisation_id
    join public.products products on products.id = sellable.product_id
    where organisation.slug = 'delight-pharmacy'
      and products.status = 'approved'
      and coalesce(sellable.status, '') <> 'deleted'
  `;

  return Number(rows[0]?.n ?? 0);
}

async function retainedDelightLiveProductIds(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productIds: readonly string[]
) {
  if (productIds.length < 1) {
    return [] as string[];
  }

  const rows = await sql<Array<{ product_id: string }>>`
    select sellable.product_id::text as product_id
    from public.retail_sellable_products sellable
    join public.organisations organisation on organisation.id = sellable.organisation_id
    where organisation.slug = 'delight-pharmacy'
      and sellable.product_id::text = any(${productIds as string[]})
      and coalesce(sellable.status, '') <> 'deleted'
  `;

  return rows.map((row) => row.product_id);
}

async function main() {
  const apply = hasArg("apply");
  const skipValidation = hasArg("skip-validation");
  const outputDir = path.resolve(
    argValue("out", path.join("reports", "t10-prd-to-uat", timestampSlug())) ??
      path.join("reports", "t10-prd-to-uat", timestampSlug())
  );
  const prdUrl = resolvePrdUrl();
  const uatUrl = resolveUatUrl();

  assertPrdCatalogueDatabase(prdUrl, "PRD_DB_URL/--prd-db-url");
  assertUatCatalogueDatabase(uatUrl, "UAT_DB_URL/--uat-db-url");

  if (apply && process.env.MATTANUTRA_CONFIRM_UAT_CATALOGUE_SYNC !== "prd-to-uat") {
    throw new Error(
      "Refusing to write PRD catalogues into UAT without MATTANUTRA_CONFIRM_UAT_CATALOGUE_SYNC=prd-to-uat."
    );
  }

  await mkdir(outputDir, { recursive: true });
  const platformSnapshot = path.join(outputDir, "prd-platform-catalogue.json");
  const retailSnapshot = path.join(outputDir, "prd-retail-catalogue.json");
  const sourceEnv = { ...process.env, DB_URL: prdUrl! };
  const targetEnv = {
    ...process.env,
    DB_URL: uatUrl!,
    MATTANUTRA_CONFIRM_UAT_CATALOGUE_ALIGN: apply ? "prd-to-uat" : "",
    MATTANUTRA_CONFIRM_UAT_RETAIL_CATALOGUE_ALIGN: apply ? "prd-to-uat" : ""
  };

  const snapshotArgs = [
    "--no-db-backup",
    "--allow-incomplete-translations",
    `--out=${platformSnapshot}`
  ];

  if (skipValidation) {
    snapshotArgs.push("--skip-validation");
  }

  const platformSnap = await runNode("scripts/catalogue-snapshot.ts", snapshotArgs, sourceEnv);

  if (platformSnap.code !== 0) {
    throw new Error(
      `PRD platform snapshot failed: ${platformSnap.stderr || platformSnap.stdout.slice(-800)}`
    );
  }

  const retailSnap = await runNode(
    "scripts/retail-snapshot.ts",
    ["--no-db-backup", `--out=${retailSnapshot}`],
    sourceEnv
  );

  if (retailSnap.code !== 0) {
    throw new Error(
      `PRD retail snapshot failed: ${retailSnap.stderr || retailSnap.stdout.slice(-800)}`
    );
  }

  const platformSnapPayload = await readJsonFile(platformSnapshot, "platform snapshot");
  const retailSnapPayload = await readJsonFile(retailSnapshot, "retail snapshot");
  const platformAlignOut = path.join(outputDir, "platform-align");
  const retailAlignOut = path.join(outputDir, "retail-align");
  const alignArgs = [
    `--snapshot=${platformSnapshot}`,
    `--target-env=uat`,
    `--out=${platformAlignOut}`,
    "--allow-incomplete-translations",
    "--retain-blocked-stale-products"
  ];
  const retailAlignArgs = [
    `--snapshot=${retailSnapshot}`,
    `--target-env=uat`,
    `--out=${retailAlignOut}`,
    "--snapshot-orgs-only"
  ];

  if (apply) {
    alignArgs.push("--apply");
    retailAlignArgs.push("--apply");
  }

  const platformAlign = await runNode(
    "scripts/catalogue-align-from-snapshot.ts",
    alignArgs,
    targetEnv
  );

  if (platformAlign.code !== 0) {
    throw new Error(
      `UAT platform align failed: ${platformAlign.stderr || platformAlign.stdout.slice(-1200)}`
    );
  }

  const retailAlign = await runNode(
    "scripts/retail-catalogue-align-from-snapshot.ts",
    retailAlignArgs,
    targetEnv
  );

  if (retailAlign.code !== 0) {
    throw new Error(
      `UAT retail align failed: ${retailAlign.stderr || retailAlign.stdout.slice(-1200)}`
    );
  }

  const platformAlignSummary = await readJsonFile(
    path.join(platformAlignOut, "catalogue-alignment-summary.json"),
    "platform align"
  );
  const retailAlignSummary = await readJsonFile(
    path.join(retailAlignOut, "retail-catalogue-alignment-summary.json"),
    "retail align"
  );
  const applyReport =
    platformAlignSummary.applyReport && typeof platformAlignSummary.applyReport === "object"
      ? (platformAlignSummary.applyReport as Record<string, unknown>)
      : {};
  const retailApply =
    retailAlignSummary.applyReport && typeof retailAlignSummary.applyReport === "object"
      ? (retailAlignSummary.applyReport as Record<string, unknown>)
      : {};
  const upserted = numberMap(applyReport.upserted);
  const insertedChildren = numberMap(applyReport.insertedChildren);
  const deletedRoots = numberMap(applyReport.deletedRoots);
  const deletedChildren = numberMap(applyReport.deletedChildren);
  const retailUpserted = numberMap(retailApply.upserted);
  const retailMarkedDeleted = numberMap(retailApply.markedDeleted);
  const retainedProductIds = Array.isArray(platformAlignSummary.retainedProductIds)
    ? platformAlignSummary.retainedProductIds.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const skippedRetailOrgs = Array.isArray(retailAlignSummary.missingTargetOrganisationSlugs)
    ? retailAlignSummary.missingTargetOrganisationSlugs.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const requestedRetailOrgs = Array.isArray(retailAlignSummary.requestedOrganisationSlugs)
    ? retailAlignSummary.requestedOrganisationSlugs.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const catalogLogs = {
    food: catalogOpLog({
      failed: 0,
      insertedChildren,
      skipped: 0,
      tables: T10_CATALOGUE_GROUPS.food,
      upserted
    }),
    supplement: catalogOpLog({
      failed: 0,
      insertedChildren,
      skipped: 0,
      tables: T10_CATALOGUE_GROUPS.supplement,
      upserted
    }),
    "platform-product": catalogOpLog({
      failed: 0,
      insertedChildren,
      retained: retainedProductIds.length,
      skipped: 0,
      tables: T10_CATALOGUE_GROUPS["platform-product"],
      upserted
    }),
    "retail-product": {
      failed: 0,
      retained: 0,
      skipped: skippedRetailOrgs.length,
      updated: sumForTables(retailUpserted, T10_CATALOGUE_GROUPS["retail-product"]),
      written: 0
    }
  };
  const prdApprovedLive = await withDatabase(prdUrl!, delightApprovedLiveCount);
  const uatApprovedLive = await withDatabase(uatUrl!, delightApprovedLiveCount);
  const retainedStillSellableOnDelight = await withDatabase(uatUrl!, (sql) =>
    retainedDelightLiveProductIds(sql, retainedProductIds)
  );
  const leftovers = {
    platform: {
      blockers: platformAlignSummary.dependencyReport,
      cannotBeSoldOnDelight: retainedStillSellableOnDelight.length === 0,
      liveDelightSellableProductIds: retainedStillSellableOnDelight,
      reason:
        "UAT-only product roots referenced by retail_customer_order_lines are retained so order history is not deleted",
      retainedBlockedProductCount: retainedProductIds.length,
      retainedBlockedProductIds: retainedProductIds
    },
    retail: {
      delightApprovedLiveSellable: {
        prd: prdApprovedLive,
        query: T10_PRD_RETAIL_SOURCE.query,
        uat: uatApprovedLive
      },
      delightTargetOnlyMarkedDeleted: retailMarkedDeleted,
      enchantedPharmacy: {
        inPrdSnapshot: false,
        reason:
          "PRD organisations snapshot has delight-pharmacy only; enchanted-pharmacy is a UAT-only tenant and is not part of the existing PRD retail source. Unapproved Enchanted leftovers are T01, not a second retail catalog.",
        skipped: skippedRetailOrgs.includes("enchanted-pharmacy")
      },
      requestedOrganisationSlugs: requestedRetailOrgs,
      skippedOrganisationSlugs: skippedRetailOrgs
    }
  };
  const summary = {
    applied: apply,
    catalogs: groupCounts({
      ...tableCountsFromSnapshot(platformSnapPayload),
      ...tableCountsFromSnapshot(retailSnapPayload)
    }),
    dryRun: !apply,
    generatedAt: new Date().toISOString(),
    idempotencyKey: "public table identity columns (id / organisation_id+product_id)",
    leftovers,
    logs: catalogLogs,
    outputDir,
    source: {
      database: databaseNameFromUrl(prdUrl),
      pool: "mn-pool-prd",
      retail: T10_PRD_RETAIL_SOURCE,
      script: "catalogue:snapshot + retail:snapshot"
    },
    target: {
      database: databaseNameFromUrl(uatUrl),
      pool: "mn-uat",
      writePath: "catalogue:align + retail:catalogue-align"
    },
    platform: {
      applied: platformAlignSummary.applied,
      blocked: platformAlignSummary.blocked,
      dryRun: platformAlignSummary.dryRun,
      tablesAfter: platformAlignSummary.tablesAfter ?? {},
      tablesBefore: platformAlignSummary.tablesBefore ?? {},
      upserted,
      insertedChildren,
      deletedRoots,
      deletedChildren
    },
    retail: {
      applied: retailAlignSummary.applied,
      dryRun: retailAlignSummary.dryRun,
      applyReport: {
        markedDeleted: retailMarkedDeleted,
        upserted: retailUpserted
      },
      report: retailAlignSummary.report ?? {},
      requestedOrganisationSlugs: requestedRetailOrgs,
      snapshotOrgsOnly: retailAlignSummary.snapshotOrgsOnly === true
    },
    written: apply
      ? "upserted PRD rows into existing UAT public tables; deleted UAT-only catalogue roots/children not in PRD except retained blocked products"
      : "dry-run only; pass --apply with MATTANUTRA_CONFIRM_UAT_CATALOGUE_SYNC=prd-to-uat"
  };
  const summaryPath = path.join(outputDir, "t10-summary.json");

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[t10-prd-to-uat] failed: ${message}`);
  process.exitCode = 1;
});
