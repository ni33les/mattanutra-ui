import {
  assertProductImageRepairDatabaseTarget,
  defaultProductImageRepairReportPaths,
  runProductImageRepair,
  type ProductImageRepairEnvironment
} from "@/lib/product-image-repair";

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

function environmentFromArgs(): ProductImageRepairEnvironment {
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

  throw new Error(`Unsupported product image repair environment: ${raw}`);
}

function applyEnvironmentDbUrl(environment: ProductImageRepairEnvironment) {
  const explicitEnvName = argValue("db-url-env");
  const fallbackEnvName =
    explicitEnvName ??
    (environment === "uat"
      ? "UAT_DB_URL"
      : environment === "prd"
        ? "PRD_DB_URL"
        : null);

  if (!process.env.DB_URL && fallbackEnvName && process.env[fallbackEnvName]) {
    process.env.DB_URL = process.env[fallbackEnvName];
  }
}

async function main() {
  const environment = environmentFromArgs();

  applyEnvironmentDbUrl(environment);
  assertProductImageRepairDatabaseTarget(process.env.DB_URL, environment);

  const defaults = defaultProductImageRepairReportPaths(environment);
  const report = await runProductImageRepair({
    apply: hasArg("apply"),
    csvOutputPath: argValue("csv-out") ?? defaults.csvOutputPath,
    delayMs: positiveInt(argValue("delay-ms"), 350),
    environment,
    force: hasArg("force"),
    limit: argValue("limit") ? positiveInt(argValue("limit"), 1) : undefined,
    outputPath: argValue("out") ?? defaults.outputPath
  });

  console.log(JSON.stringify({
    applied: report.applied,
    before: report.before,
    checked: report.checked,
    dryRun: report.dryRun,
    environment: report.environment,
    reportCsv: argValue("csv-out") ?? defaults.csvOutputPath,
    reportJson: argValue("out") ?? defaults.outputPath,
    resolved: report.resolved.length,
    sourceCounts: report.sourceCounts,
    updated: report.updated,
    unresolved: report.unresolved.length
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`[products:images:repair] failed: ${message}`);
  process.exitCode = 1;
});
