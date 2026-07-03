import { readFile } from "node:fs/promises";
import path from "node:path";

import { closeSqlPool, getSql } from "@/lib/db";
import {
  captureProtectedDataSnapshot,
  compareProtectedDataSnapshots,
  writeProtectedDataSnapshot,
  type ProtectedDataSnapshot
} from "@/lib/prd-protected-data";
import {
  assertPrdDatabaseTarget,
  assertPrdRuntimeEnvironment
} from "@/lib/prd-rollout-safety";

function argValue(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const directIndex = process.argv.indexOf(`--${name}`);

  if (directIndex >= 0) {
    return process.argv[directIndex + 1] ?? "";
  }

  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function commandName() {
  return process.argv.find((arg) => arg === "snapshot" || arg === "verify") ?? "snapshot";
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function dbUrl() {
  return argValue("db-url") ?? process.env.PRD_DB_URL ?? process.env.DB_URL ?? null;
}

async function main() {
  const connection = dbUrl();

  assertPrdRuntimeEnvironment();
  assertPrdDatabaseTarget(connection, "PRD_DB_URL/DB_URL");
  process.env.DB_URL = connection!;

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured.");
  }

  const outputPath = argValue(
    "out",
    path.join("reports", "prd-protected-data", `${timestampSlug()}.json`)
  )!;
  const snapshot = await captureProtectedDataSnapshot(sql);

  await writeProtectedDataSnapshot(outputPath, snapshot);

  if (commandName() === "verify") {
    const beforePath = argValue("before");

    if (!beforePath) {
      throw new Error("verify requires --before=<snapshot.json>.");
    }

    const before = JSON.parse(await readFile(beforePath, "utf8")) as ProtectedDataSnapshot;
    const verification = compareProtectedDataSnapshots(before, snapshot);

    if (!verification.ok) {
      throw new Error(
        `Protected PRD data verification failed: ${verification.issues
          .map((issue) => `${issue.table}:${issue.issue}`)
          .join(", ")}`
      );
    }
  }

  console.log(JSON.stringify({
    command: commandName(),
    outputPath,
    status: "ok"
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[prd:protected-data] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool();
  });
