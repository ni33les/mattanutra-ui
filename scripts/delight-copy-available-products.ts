import {
  assertProductListRolloutDatabaseTarget,
  type ProductListRolloutEnvironment
} from "@/lib/product-list-rollout";
import { runDelightAvailableProductsRollout } from "@/lib/delight-available-products-rollout";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
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

  throw new Error(`Unsupported Delight available product rollout environment: ${raw}`);
}

function deriveUatDbUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  const url = new URL(value);
  const database = url.pathname.replace(/^\/+/, "");

  if (/uat/i.test(database)) {
    return url.toString();
  }

  if (/^mn-dev$/i.test(database)) {
    url.pathname = "/mn-uat";
  } else if (/mattanutra-dev/i.test(database)) {
    url.pathname = `/${database.replace(/mattanutra-dev/ig, "mattanutra-uat")}`;
  } else {
    url.pathname = "/mn-uat";
  }

  url.searchParams.set("sslmode", "require");

  return url.toString();
}

function dbUrlForEnvironment(environment: ProductListRolloutEnvironment) {
  const explicitEnvName = argValue("db-url-env");

  if (explicitEnvName) {
    return process.env[explicitEnvName] ?? null;
  }

  if (environment === "uat") {
    return process.env.UAT_DB_URL ?? deriveUatDbUrl(process.env.DB_URL);
  }

  return process.env.DB_URL ?? null;
}

async function main() {
  const environment = environmentFromArgs();
  const dbUrl = dbUrlForEnvironment(environment);

  assertProductListRolloutDatabaseTarget(dbUrl ?? undefined, environment);

  const summary = await runDelightAvailableProductsRollout({
    apply: hasArg("apply"),
    dbUrl,
    environment,
    outputDir: argValue("out")
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`[delight:copy-available-products] failed: ${message}`);
  process.exitCode = 1;
});
