import {
  assertFirstPartyImageMirrorDatabaseTarget,
  type FirstPartyImageEnvironment
} from "@/lib/first-party-image-mirror";
import {
  defaultFirstPartyImageBackfillReportPath,
  runFirstPartyImageBackfill
} from "@/lib/first-party-image-backfill";

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

function environmentFromArgs(): FirstPartyImageEnvironment {
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

  throw new Error(`Unsupported image mirror environment: ${raw}`);
}

function applyEnvironmentDbUrl(environment: FirstPartyImageEnvironment) {
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

async function main() {
  const environment = environmentFromArgs();

  applyEnvironmentDbUrl(environment);
  assertFirstPartyImageMirrorDatabaseTarget(process.env.DB_URL, environment);

  const outputPath =
    argValue("out") ?? defaultFirstPartyImageBackfillReportPath(environment);
  const report = await runFirstPartyImageBackfill({
    apply: hasArg("apply"),
    delayMs: positiveInt(argValue("delay-ms"), 350),
    environment,
    limit: argValue("limit") ? positiveInt(argValue("limit"), 1) : undefined,
    outputPath
  });

  console.log(JSON.stringify({
    applied: report.applied,
    byHost: report.byHost,
    checked: report.checked,
    dryRun: report.dryRun,
    dryRunCandidates: report.dryRunCandidates,
    environment: report.environment,
    failed: report.failed,
    mirrored: report.mirrored,
    reportJson: outputPath,
    skippedFirstParty: report.skippedFirstParty,
    skippedLimit: report.skippedLimit,
    updatedRows: report.updatedRows
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`[images:mirror:first-party] failed: ${message}`);
  process.exitCode = 1;
});
