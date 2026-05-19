import postgres from "postgres";

const globalDb = globalThis as typeof globalThis & {
  mattanutraDbUnavailableLogged?: boolean;
  mattanutraSql?: postgres.Sql;
  mattanutraSqlConnectionKey?: string;
};

const BENIGN_SCHEMA_NOTICE_CODES = new Set(["42P07", "42701", "42710"]);
const DEFAULT_DB_CONNECT_TIMEOUT_SECONDS = 5;
const DEFAULT_DB_POOL_IDLE_TIMEOUT_SECONDS = 10;
const DEFAULT_DB_POOL_MAX = 1;
const MAX_DB_POOL_MAX = 10;

function assertManagedDatabaseEndpoint(connection: string) {
  try {
    const url = new URL(connection);

    if (
      url.hostname.endsWith(".db.ondigitalocean.com") &&
      url.port === "25060" &&
      process.env.DB_ALLOW_DIRECT_CONNECTION !== "true"
    ) {
      throw new Error(
        "DigitalOcean direct database endpoint detected. Use the database-side pool endpoint for DB_CONNECTION."
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("direct database endpoint")) {
      throw error;
    }
  }
}

function shouldUseSsl(connection: string) {
  try {
    const url = new URL(connection);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

    return (
      url.hostname.endsWith(".db.ondigitalocean.com") ||
      sslMode === "require" ||
      sslMode === "verify-ca" ||
      sslMode === "verify-full"
    );
  } catch {
    return false;
  }
}

function dbSslNegotiation() {
  return process.env.DB_SSL_NEGOTIATION === "direct" ? "direct" : null;
}

function dbPoolMax() {
  const parsed = Number(process.env.DB_POOL_MAX ?? DEFAULT_DB_POOL_MAX);

  return Number.isFinite(parsed)
    ? Math.min(MAX_DB_POOL_MAX, Math.max(1, Math.round(parsed)))
    : DEFAULT_DB_POOL_MAX;
}

function dbPoolIdleTimeout() {
  const parsed = Number(
    process.env.DB_POOL_IDLE_TIMEOUT_SECONDS ??
      DEFAULT_DB_POOL_IDLE_TIMEOUT_SECONDS
  );

  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(120, Math.max(5, Math.round(parsed)))
    : DEFAULT_DB_POOL_IDLE_TIMEOUT_SECONDS;
}

function dbConnectTimeout() {
  const parsed = Number(
    process.env.DB_CONNECT_TIMEOUT_SECONDS ??
      DEFAULT_DB_CONNECT_TIMEOUT_SECONDS
  );

  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(30, Math.max(1, Math.round(parsed)))
    : DEFAULT_DB_CONNECT_TIMEOUT_SECONDS;
}

function dbApplicationName() {
  return process.env.DB_APPLICATION_NAME?.trim() || "mattanutra-web";
}

function handleDatabaseNotice(notice: { code?: string }) {
  if (notice.code && BENIGN_SCHEMA_NOTICE_CODES.has(notice.code)) {
    return;
  }

  console.info("Database notice", notice);
}

export function getSql() {
  const connection = process.env.DB_CONNECTION;

  if (!connection) {
    return null;
  }

  assertManagedDatabaseEndpoint(connection);

  const useSsl = shouldUseSsl(connection);
  const sslNegotiation = dbSslNegotiation();
  const poolMax = dbPoolMax();
  const connectTimeout = dbConnectTimeout();
  const idleTimeout = dbPoolIdleTimeout();
  const applicationName = dbApplicationName();
  const connectionKey = `${connection}|ssl:${String(
    useSsl
  )}|sslNegotiation:${
    sslNegotiation ?? "standard"
  }|poolMax:${poolMax}|connectTimeout:${connectTimeout}|idleTimeout:${idleTimeout}|applicationName:${applicationName}`;

  if (
    globalDb.mattanutraSql &&
    globalDb.mattanutraSqlConnectionKey !== connectionKey
  ) {
    void globalDb.mattanutraSql.end();
    globalDb.mattanutraSql = undefined;
  }

  globalDb.mattanutraSql ??= postgres(connection, {
    connect_timeout: connectTimeout,
    connection: { application_name: applicationName },
    idle_timeout: idleTimeout,
    max: poolMax,
    onnotice: handleDatabaseNotice,
    prepare: false,
    ...(useSsl ? { ssl: "require" } : {}),
    ...(sslNegotiation ? { sslnegotiation: sslNegotiation } : {})
  });
  globalDb.mattanutraSqlConnectionKey = connectionKey;

  return globalDb.mattanutraSql;
}

export async function closeSqlPool() {
  const sql = globalDb.mattanutraSql;

  if (!sql) {
    return;
  }

  globalDb.mattanutraSql = undefined;
  globalDb.mattanutraSqlConnectionKey = undefined;
  await sql.end();
}

export async function checkDatabaseConnection() {
  const sql = getSql();

  if (!sql) {
    return false;
  }

  try {
    await sql`select 1`;
    globalDb.mattanutraDbUnavailableLogged = false;
    return true;
  } catch (error) {
    if (!globalDb.mattanutraDbUnavailableLogged) {
      console.error("Database unavailable", error);
      globalDb.mattanutraDbUnavailableLogged = true;
    }

    return false;
  }
}
