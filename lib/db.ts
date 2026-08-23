import postgres from "postgres";
import { createLogger } from "@/lib/logger";

const globalDb = globalThis as typeof globalThis & {
  mattanutraDbUnavailableLogged?: boolean;
  mattanutraSql?: postgres.Sql;
  mattanutraSqlConnectionKey?: string;
  mattanutraWorkerSql?: postgres.Sql;
  mattanutraWorkerSqlConnectionKey?: string;
  mattanutraListenSql?: postgres.Sql;
  mattanutraListenSqlConnectionKey?: string;
};

const BENIGN_SCHEMA_NOTICE_CODES = new Set(["42P07", "42701", "42710"]);
const DEFAULT_DB_CONNECT_TIMEOUT_SECONDS = 5;
const DEFAULT_DB_POOL_IDLE_TIMEOUT_SECONDS = 120;
const DEFAULT_DB_POOL_MAX = 4;
const DEFAULT_DB_WORKER_POOL_MAX = 4;
const MAX_DB_POOL_MAX = 8;
const DEFAULT_DB_STATEMENT_TIMEOUT_MS = 15_000;
const DEFAULT_DB_LOCK_TIMEOUT_MS = 2_000;
const DEFAULT_DB_IDLE_IN_TXN_TIMEOUT_MS = 10_000;
const dbLog = createLogger("db.pool");
const poolInitLogged = {
  interactive: false,
  listen: false,
  worker: false
};

type PoolKind = "interactive" | "worker";

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

function clampPoolMax(parsed: number, fallback: number) {
  return Number.isFinite(parsed)
    ? Math.min(MAX_DB_POOL_MAX, Math.max(1, Math.round(parsed)))
    : fallback;
}

function dbPoolMax() {
  return clampPoolMax(
    Number(process.env.DB_POOL_MAX ?? DEFAULT_DB_POOL_MAX),
    DEFAULT_DB_POOL_MAX
  );
}

function dbWorkerPoolMax() {
  return clampPoolMax(
    Number(process.env.DB_WORKER_POOL_MAX ?? DEFAULT_DB_WORKER_POOL_MAX),
    DEFAULT_DB_WORKER_POOL_MAX
  );
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

function dbWorkerApplicationName() {
  return process.env.DB_WORKER_APPLICATION_NAME?.trim() || "mattanutra-worker";
}

function dbListenApplicationName() {
  return process.env.DB_LISTEN_APPLICATION_NAME?.trim() || "mattanutra-listen";
}

function listenConnectionUrl() {
  const explicit = process.env.DB_LISTEN_URL?.trim();

  if (explicit) {
    return explicit;
  }

  const connection = process.env.DB_URL?.trim();

  if (!connection) {
    return null;
  }

  try {
    const url = new URL(connection);

    if (
      url.hostname.endsWith(".db.ondigitalocean.com") &&
      url.port === "25061"
    ) {
      url.port = "25060";
      return url.toString();
    }
  } catch {
    return connection;
  }

  return connection;
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

function postgresConnectionSettings(applicationName: string) {
  return {
    applicationName,
    connection: {
      application_name: applicationName
    },
    idleInTxnTimeoutMs: dbIdleInTxnTimeoutMs(),
    lockTimeoutMs: dbLockTimeoutMs(),
    statementTimeoutMs: dbStatementTimeoutMs()
  };
}

async function applyInteractiveTimeouts(
  sql: NonNullable<ReturnType<typeof getSql>>
) {
  const statementTimeoutMs = dbStatementTimeoutMs();
  const lockTimeoutMs = dbLockTimeoutMs();
  const idleInTxnTimeoutMs = dbIdleInTxnTimeoutMs();

  await sql`
    select
      set_config('statement_timeout', ${String(statementTimeoutMs)}, false),
      set_config('lock_timeout', ${String(lockTimeoutMs)}, false),
      set_config('idle_in_transaction_session_timeout', ${String(idleInTxnTimeoutMs)}, false)
  `;
}

function handleDatabaseNotice(notice: { code?: string }) {
  if (notice.code && BENIGN_SCHEMA_NOTICE_CODES.has(notice.code)) {
    return;
  }

  console.info("Database notice", notice);
}

function getOrCreateSqlPool(kind: PoolKind) {
  const connection = process.env.DB_URL;

  if (!connection) {
    return null;
  }

  assertManagedDatabaseEndpoint(connection);

  const useSsl = shouldUseSsl(connection);
  const sslNegotiation = dbSslNegotiation();
  const poolMax = kind === "worker" ? dbWorkerPoolMax() : dbPoolMax();
  const connectTimeout = dbConnectTimeout();
  const idleTimeout = dbPoolIdleTimeout();
  const applicationName =
    kind === "worker" ? dbWorkerApplicationName() : dbApplicationName();
  const timeouts = postgresConnectionSettings(applicationName);
  const connectionKey = `${connection}|kind:${kind}|ssl:${String(
    useSsl
  )}|sslNegotiation:${
    sslNegotiation ?? "standard"
  }|poolMax:${poolMax}|connectTimeout:${connectTimeout}|idleTimeout:${idleTimeout}|applicationName:${timeouts.applicationName}|statementTimeoutMs:${timeouts.statementTimeoutMs}|lockTimeoutMs:${timeouts.lockTimeoutMs}|idleInTxnTimeoutMs:${timeouts.idleInTxnTimeoutMs}`;

  if (kind === "worker") {
    if (
      globalDb.mattanutraWorkerSql &&
      globalDb.mattanutraWorkerSqlConnectionKey !== connectionKey
    ) {
      void globalDb.mattanutraWorkerSql.end();
      globalDb.mattanutraWorkerSql = undefined;
    }
  } else if (
    globalDb.mattanutraSql &&
    globalDb.mattanutraSqlConnectionKey !== connectionKey
  ) {
    void globalDb.mattanutraSql.end();
    globalDb.mattanutraSql = undefined;
  }

  const existing =
    kind === "worker" ? globalDb.mattanutraWorkerSql : globalDb.mattanutraSql;
  const sql =
    existing ??
    postgres(connection, {
      connect_timeout: connectTimeout,
      connection: timeouts.connection,
      idle_timeout: idleTimeout,
      max: poolMax,
      onnotice: handleDatabaseNotice,
      prepare: false,
      ...(useSsl ? { ssl: "require" } : {}),
      ...(sslNegotiation ? { sslnegotiation: sslNegotiation } : {})
    });

  if (kind === "worker") {
    globalDb.mattanutraWorkerSql = sql;
    globalDb.mattanutraWorkerSqlConnectionKey = connectionKey;
  } else {
    globalDb.mattanutraSql = sql;
    globalDb.mattanutraSqlConnectionKey = connectionKey;
  }

  if (!poolInitLogged[kind]) {
    poolInitLogged[kind] = true;
    dbLog.info(
      kind === "worker" ? "worker_pool_initialized" : "pool_initialized",
      {
        applicationName: timeouts.applicationName,
        idleInTxnTimeoutMs: timeouts.idleInTxnTimeoutMs,
        lockTimeoutMs: timeouts.lockTimeoutMs,
        poolMax,
        statementTimeoutMs: timeouts.statementTimeoutMs
      }
    );
    void applyInteractiveTimeouts(sql).catch((error) => {
      dbLog.warn("unable_to_apply_interactive_timeouts", {
        kind,
        message: error instanceof Error ? error.message : "unknown"
      });
    });
  }

  return sql;
}

export function getSql() {
  if (process.env.DB_POOL_ROLE === "worker") {
    return getOrCreateSqlPool("worker");
  }

  return getOrCreateSqlPool("interactive");
}

export function getWorkerSql() {
  return getOrCreateSqlPool("worker");
}

export function getListenSql() {
  const connection = listenConnectionUrl();

  if (!connection) {
    return null;
  }

  const useSsl = shouldUseSsl(connection);
  const sslNegotiation = dbSslNegotiation();
  const connectTimeout = dbConnectTimeout();
  const applicationName = dbListenApplicationName();
  const connectionKey = `${connection}|kind:listen|ssl:${String(
    useSsl
  )}|sslNegotiation:${
    sslNegotiation ?? "standard"
  }|connectTimeout:${connectTimeout}|applicationName:${applicationName}`;

  if (
    globalDb.mattanutraListenSql &&
    globalDb.mattanutraListenSqlConnectionKey !== connectionKey
  ) {
    void globalDb.mattanutraListenSql.end();
    globalDb.mattanutraListenSql = undefined;
  }

  globalDb.mattanutraListenSql ??= postgres(connection, {
    connect_timeout: connectTimeout,
    connection: {
      application_name: applicationName
    },
    idle_timeout: 0,
    keep_alive: 30,
    max: 1,
    max_lifetime: null,
    onclose: () => {
      const listeners = (
        globalThis as typeof globalThis & {
          mattanutraListenSqlOnClose?: Set<() => void>;
        }
      ).mattanutraListenSqlOnClose;

      if (!listeners) {
        return;
      }

      for (const listener of listeners) {
        listener();
      }
    },
    onnotice: handleDatabaseNotice,
    prepare: false,
    ...(useSsl ? { ssl: "require" } : {}),
    ...(sslNegotiation ? { sslnegotiation: sslNegotiation } : {})
  });
  globalDb.mattanutraListenSqlConnectionKey = connectionKey;

  if (!poolInitLogged.listen) {
    poolInitLogged.listen = true;
    dbLog.info("listen_initialized", {
      applicationName,
      derivedDirect:
        Boolean(process.env.DB_URL?.includes(":25061")) &&
        !process.env.DB_LISTEN_URL?.trim()
    });
  }

  return globalDb.mattanutraListenSql;
}

export function onListenSqlClose(listener: () => void) {
  const globalListen = globalThis as typeof globalThis & {
    mattanutraListenSqlOnClose?: Set<() => void>;
  };

  globalListen.mattanutraListenSqlOnClose ??= new Set();
  globalListen.mattanutraListenSqlOnClose.add(listener);

  return () => {
    globalListen.mattanutraListenSqlOnClose?.delete(listener);
  };
}

export async function closeSqlPool() {
  const sql = globalDb.mattanutraSql;
  const workerSql = globalDb.mattanutraWorkerSql;
  const listenSql = globalDb.mattanutraListenSql;

  globalDb.mattanutraSql = undefined;
  globalDb.mattanutraSqlConnectionKey = undefined;
  globalDb.mattanutraWorkerSql = undefined;
  globalDb.mattanutraWorkerSqlConnectionKey = undefined;
  globalDb.mattanutraListenSql = undefined;
  globalDb.mattanutraListenSqlConnectionKey = undefined;

  await Promise.all([
    sql ? sql.end() : Promise.resolve(),
    workerSql ? workerSql.end() : Promise.resolve(),
    listenSql ? listenSql.end() : Promise.resolve()
  ]);
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
const DB_KEEP_ALIVE_CONNECTIONS = 1;

async function pingWarmConnections(sql: NonNullable<ReturnType<typeof getSql>>) {
  await Promise.all(
    Array.from({ length: DB_KEEP_ALIVE_CONNECTIONS }, () => sql`select 1`)
  );
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
