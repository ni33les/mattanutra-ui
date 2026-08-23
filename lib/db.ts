import postgres from "postgres";
import { createLogger } from "@/lib/logger";

const globalDb = globalThis as typeof globalThis & {
  mattanutraDbUnavailableLogged?: boolean;
  mattanutraSql?: postgres.Sql;
  mattanutraSqlConnectionKey?: string;
};

const BENIGN_SCHEMA_NOTICE_CODES = new Set(["42P07", "42701", "42710"]);
const DEFAULT_DB_CONNECT_TIMEOUT_SECONDS = 5;
const DEFAULT_DB_POOL_IDLE_TIMEOUT_SECONDS = 120;
const DEFAULT_DB_POOL_MAX = 4;
const MAX_DB_POOL_MAX = 10;
const DEFAULT_DB_STATEMENT_TIMEOUT_MS = 15_000;
const DEFAULT_DB_LOCK_TIMEOUT_MS = 2_000;
const DEFAULT_DB_IDLE_IN_TXN_TIMEOUT_MS = 10_000;
const dbLog = createLogger("db.pool");
let poolInitLogged = false;

function assertManagedDatabaseEndpoint(connection: string) {
  try {
    const url = new URL(connection);

    if (
      url.hostname.endsWith(".db.ondigitalocean.com") &&
      url.port === "25060" &&
      process.env.DB_ALLOW_DIRECT_CONNECTION !== "true"
    ) {
      throw new Error(
        "DigitalOcean direct database endpoint detected. Use the database-side pool endpoint for DB_URL."
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

function dbTimeoutMs(envName: string, fallback: number) {
  const raw = process.env[envName];

  if (raw === "0") {
    return 0;
  }

  const parsed = Number(raw ?? fallback);

  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(120_000, Math.round(parsed))
    : fallback;
}

function dbStatementTimeoutMs() {
  return dbTimeoutMs("DB_STATEMENT_TIMEOUT_MS", DEFAULT_DB_STATEMENT_TIMEOUT_MS);
}

function dbLockTimeoutMs() {
  return dbTimeoutMs("DB_LOCK_TIMEOUT_MS", DEFAULT_DB_LOCK_TIMEOUT_MS);
}

function dbIdleInTxnTimeoutMs() {
  return dbTimeoutMs(
    "DB_IDLE_IN_TXN_TIMEOUT_MS",
    DEFAULT_DB_IDLE_IN_TXN_TIMEOUT_MS
  );
}

function postgresConnectionSettings() {
  const applicationName = dbApplicationName();
  const statementTimeoutMs = dbStatementTimeoutMs();
  const lockTimeoutMs = dbLockTimeoutMs();
  const idleInTxnTimeoutMs = dbIdleInTxnTimeoutMs();
  const connection: Record<string, string> = {
    application_name: applicationName
  };

  if (statementTimeoutMs > 0) {
    connection.statement_timeout = String(statementTimeoutMs);
  }

  if (lockTimeoutMs > 0) {
    connection.lock_timeout = String(lockTimeoutMs);
  }

  if (idleInTxnTimeoutMs > 0) {
    connection.idle_in_transaction_session_timeout = String(idleInTxnTimeoutMs);
  }

  return {
    applicationName,
    connection,
    idleInTxnTimeoutMs,
    lockTimeoutMs,
    statementTimeoutMs
  };
}

function handleDatabaseNotice(notice: { code?: string }) {
  if (notice.code && BENIGN_SCHEMA_NOTICE_CODES.has(notice.code)) {
    return;
  }

  console.info("Database notice", notice);
}

export function getSql() {
  const connection = process.env.DB_URL;

  if (!connection) {
    return null;
  }

  assertManagedDatabaseEndpoint(connection);

  const useSsl = shouldUseSsl(connection);
  const sslNegotiation = dbSslNegotiation();
  const poolMax = dbPoolMax();
  const connectTimeout = dbConnectTimeout();
  const idleTimeout = dbPoolIdleTimeout();
  const timeouts = postgresConnectionSettings();
  const connectionKey = `${connection}|ssl:${String(
    useSsl
  )}|sslNegotiation:${
    sslNegotiation ?? "standard"
  }|poolMax:${poolMax}|connectTimeout:${connectTimeout}|idleTimeout:${idleTimeout}|applicationName:${timeouts.applicationName}|statementTimeoutMs:${timeouts.statementTimeoutMs}|lockTimeoutMs:${timeouts.lockTimeoutMs}|idleInTxnTimeoutMs:${timeouts.idleInTxnTimeoutMs}`;

  if (
    globalDb.mattanutraSql &&
    globalDb.mattanutraSqlConnectionKey !== connectionKey
  ) {
    void globalDb.mattanutraSql.end();
    globalDb.mattanutraSql = undefined;
  }

  globalDb.mattanutraSql ??= postgres(connection, {
    connect_timeout: connectTimeout,
    connection: timeouts.connection,
    idle_timeout: idleTimeout,
    max: poolMax,
    onnotice: handleDatabaseNotice,
    prepare: false,
    ...(useSsl ? { ssl: "require" } : {}),
    ...(sslNegotiation ? { sslnegotiation: sslNegotiation } : {})
  });
  globalDb.mattanutraSqlConnectionKey = connectionKey;

  if (!poolInitLogged) {
    poolInitLogged = true;
    dbLog.info("pool_initialized", {
      idleInTxnTimeoutMs: timeouts.idleInTxnTimeoutMs,
      lockTimeoutMs: timeouts.lockTimeoutMs,
      poolMax,
      statementTimeoutMs: timeouts.statementTimeoutMs
    });
  }

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

const DB_KEEP_ALIVE_MS = 20_000;
const DB_KEEP_ALIVE_CONNECTIONS = 3;

async function pingWarmConnections(sql: NonNullable<ReturnType<typeof getSql>>) {
  const n = Math.min(DB_KEEP_ALIVE_CONNECTIONS, dbPoolMax());
  await Promise.all(Array.from({ length: n }, () => sql`select 1`));
}

export async function keepDatabaseWarm() {
  const sql = getSql();

  if (!sql) {
    return false;
  }

  let ok = false;

  try {
    await pingWarmConnections(sql);
    globalDb.mattanutraDbUnavailableLogged = false;
    ok = true;
  } catch (error) {
    if (!globalDb.mattanutraDbUnavailableLogged) {
      console.error("Database unavailable", error);
      globalDb.mattanutraDbUnavailableLogged = true;
    }
  }

  const globalKeep = globalThis as typeof globalThis & {
    mattanutraDbKeepAlive?: ReturnType<typeof setInterval>;
  };

  if (!globalKeep.mattanutraDbKeepAlive) {
    const timer = setInterval(() => {
      void pingWarmConnections(sql).catch(() => null);
    }, DB_KEEP_ALIVE_MS);
    timer.unref?.();
    globalKeep.mattanutraDbKeepAlive = timer;
  }

  return ok;
}
