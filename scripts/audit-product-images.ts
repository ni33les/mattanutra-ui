import {
  defaultProductImageHealthReportPaths,
  productImageHealthAuditShouldFail,
  productImageHealthIssueRows,
  runProductImageHealthAudit,
  type ProductImageHealthEnvironment
} from "@/lib/product-image-health-audit";
import { assertProductImageRepairDatabaseTarget } from "@/lib/product-image-repair";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

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

function environmentFromArgs(): ProductImageHealthEnvironment {
  const raw =
    argValue("env") ??
    process.env.MATTANUTRA_ENV ??
    process.env.NODE_ENV ??
    "dev";
  const normalized = raw.trim().toLowerCase();

  if (normalized === "production" || normalized === "prod") {
    return "prd";
  }

  if (normalized === "staging" || normalized === "stage") {
    return "uat";
  }

  if (normalized === "dev" || normalized === "development" || normalized === "local") {
    return "dev";
  }

  if (normalized === "uat" || normalized === "prd") {
    return normalized;
  }

  throw new Error(`Unsupported product image audit environment: ${raw}`);
}

function applyEnvironmentDbUrl(environment: ProductImageHealthEnvironment) {
  const explicitEnvName = argValue("db-url-env");

  if (explicitEnvName) {
    if (process.env[explicitEnvName]) {
      process.env.DB_URL = process.env[explicitEnvName];
    } else {
      throw new Error(`${explicitEnvName} is not set.`);
    }

    return;
  }

  const fallbackEnvName =
    environment === "uat"
      ? "UAT_DB_URL"
      : environment === "prd"
        ? "PRD_DB_URL"
        : null;

  if (!process.env.DB_URL && fallbackEnvName && process.env[fallbackEnvName]) {
    process.env.DB_URL = process.env[fallbackEnvName];
  }
}

function listArg(name: string, fallback: readonly string[]) {
  const raw = argValue(name);

  if (!raw) {
    return [...fallback];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function main() {
  const environment = environmentFromArgs();

  applyEnvironmentDbUrl(environment);
  assertProductImageRepairDatabaseTarget(process.env.DB_URL, environment);

  const defaults = defaultProductImageHealthReportPaths(environment);
  const orgSlugs = listArg("org-slugs", [
    "delight-pharmacy",
    "enchanted-pharmacy"
  ]);
  const report = await runProductImageHealthAudit({
    concurrency: positiveInt(argValue("concurrency"), 24),
    csvOutputPath: argValue("csv-out") ?? defaults.csvOutputPath,
    environment,
    outputPath: argValue("out") ?? defaults.outputPath,
    targetRetailOrgSlugs: orgSlugs,
    timeoutMs: positiveInt(argValue("timeout-ms"), 8000)
  });
  const reportCsv = argValue("csv-out") ?? defaults.csvOutputPath;
  const reportJson = argValue("out") ?? defaults.outputPath;
  const issueRows = productImageHealthIssueRows(report);
  const shouldFail = !hasArg("no-fail") && productImageHealthAuditShouldFail(report);

  console.log(JSON.stringify({
    byRetailer: report.byRetailer,
    byStatus: report.byStatus,
    counts: report.counts,
    environment: report.environment,
    issueRows: issueRows.length,
    reportCsv,
    reportJson,
    targetRetailOrgSlugs: report.targetRetailOrgSlugs
  }, null, 2));

  if (shouldFail) {
    console.error(
      "[products:images:audit] active retail products have missing, broken, non-image, invalid, or external image URLs."
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`[products:images:audit] failed: ${message}`);
  process.exitCode = 1;
});
