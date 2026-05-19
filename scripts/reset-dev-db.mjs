#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const args = new Set(process.argv.slice(2));
const confirmation = process.env.MATTANUTRA_CONFIRM_DB_RESET;
const connection = process.env.DB_CONNECTION;

function fail(message) {
  console.error(`[reset-dev-db] ${message}`);
  process.exit(1);
}

function assertConfirmation() {
  if (!args.has("--confirm-blitz") && confirmation !== "blitz") {
    fail("Refusing to reset without --confirm-blitz or MATTANUTRA_CONFIRM_DB_RESET=blitz.");
  }
}

function assertDevTarget(connectionString) {
  let url;

  try {
    url = new URL(connectionString);
  } catch {
    fail("DB_CONNECTION is not a valid PostgreSQL URL.");
  }

  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  const explicitProd =
    target.includes("prd") ||
    target.includes("prod") ||
    target.includes("production");
  const explicitlyAllowed =
    target.includes("localhost") ||
    target.includes("127.0.0.1") ||
    target.includes("mattanutra-dev") ||
    target.includes("mn-pool") ||
    process.env.MATTANUTRA_ALLOW_REMOTE_DEV_RESET === "true";

  if (process.env.NODE_ENV === "production") {
    fail("Refusing to reset while NODE_ENV=production.");
  }

  if (explicitProd && process.env.MATTANUTRA_ALLOW_PROD_RESET !== "true") {
    fail("Refusing to reset a target that looks like production.");
  }

  if (!explicitlyAllowed) {
    fail("Refusing to reset a DB target that is not explicitly marked as dev.");
  }
}

function shouldUseSsl(connectionString) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return (
    url.hostname.endsWith(".db.ondigitalocean.com") ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  );
}

assertConfirmation();

if (!connection) {
  fail("DB_CONNECTION is required.");
}

assertDevTarget(connection);

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaSql = await readFile(resolve(rootDir, "db-schema.sql"), "utf8");
const sql = postgres(connection, {
  connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 10),
  idle_timeout: 5,
  max: 1,
  prepare: false,
  ...(shouldUseSsl(connection) ? { ssl: "require" } : {})
});

try {
  console.log("[reset-dev-db] Applying db-schema.sql to the configured dev database.");
  await sql.unsafe(schemaSql);
  console.log("[reset-dev-db] Dev database reset complete.");
} finally {
  await sql.end({ timeout: 5 });
}
