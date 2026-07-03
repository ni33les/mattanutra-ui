import { closeSqlPool, getSql } from "@/lib/db";
import {
  assertPrdApplyConfirmation,
  assertPrdDatabaseTarget,
  assertPrdPreserveConfirmation,
  assertPrdRuntimeEnvironment
} from "@/lib/prd-rollout-safety";
import { runPrdLiveCatalogueSync } from "@/lib/prd-live-catalogue-sync";

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

function prdDbUrl() {
  return argValue("db-url") ?? process.env.PRD_DB_URL ?? process.env.DB_URL ?? null;
}

async function main() {
  const inputPath = argValue("snapshot") ?? argValue("input");

  if (!inputPath) {
    throw new Error("--snapshot=<uat-snapshot.json> is required.");
  }

  const dbUrl = prdDbUrl();
  const apply = hasArg("apply");

  assertPrdRuntimeEnvironment();
  assertPrdDatabaseTarget(dbUrl, "PRD_DB_URL/DB_URL");

  if (apply) {
    assertPrdPreserveConfirmation();
    assertPrdApplyConfirmation({
      envName: "MATTANUTRA_CONFIRM_PRD_CATALOGUE_SYNC",
      expected: "sync",
      label: "PRD catalogue sync"
    });
  }

  process.env.DB_URL = dbUrl!;
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured.");
  }

  const syncInput = {
    allowIncompleteTranslations:
      hasArg("allow-incomplete-translations") ||
      process.env.MATTANUTRA_ALLOW_INCOMPLETE_TRANSLATIONS === "true",
    apply,
    inputPath,
    outputDir: argValue("out"),
    skipValidation:
      hasArg("skip-validation") ||
      process.env.MATTANUTRA_SKIP_MASTER_SNAPSHOT_VALIDATION === "true",
    sql,
    strictMasterData:
      hasArg("strict-master-data") ||
      process.env.MATTANUTRA_STRICT_MASTER_SNAPSHOT === "true"
  };
  const summary = apply
    ? await sql.begin((transaction) =>
        runPrdLiveCatalogueSync({
          ...syncInput,
          sql: transaction as unknown as typeof sql
        })
      )
    : await runPrdLiveCatalogueSync(syncInput);

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[catalogue:sync-prd] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool();
  });
