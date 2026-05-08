import postgres from "postgres";

const globalDb = globalThis as typeof globalThis & {
  mattanutraDbUnavailableLogged?: boolean;
  mattanutraSql?: postgres.Sql;
  mattanutraSqlConnectionKey?: string;
};

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

export function getSql() {
  const connection = process.env.DB_CONNECTION;

  if (!connection) {
    return null;
  }

  const useSsl = shouldUseSsl(connection);
  const sslNegotiation = dbSslNegotiation();
  const configuredConnectTimeout = Number(
    process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 5
  );
  const connectionKey = `${connection}|ssl:${String(
    useSsl
  )}|sslNegotiation:${sslNegotiation ?? "standard"}`;

  if (
    globalDb.mattanutraSql &&
    globalDb.mattanutraSqlConnectionKey !== connectionKey
  ) {
    void globalDb.mattanutraSql.end();
    globalDb.mattanutraSql = undefined;
  }

  globalDb.mattanutraSql ??= postgres(connection, {
    connect_timeout:
      Number.isFinite(configuredConnectTimeout) && configuredConnectTimeout > 0
        ? configuredConnectTimeout
        : 5,
    connection: { application_name: "mattanutra-web" },
    idle_timeout: 20,
    max: 3,
    prepare: false,
    ...(useSsl ? { ssl: "require" } : {}),
    ...(sslNegotiation ? { sslnegotiation: sslNegotiation } : {})
  });
  globalDb.mattanutraSqlConnectionKey = connectionKey;

  return globalDb.mattanutraSql;
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
