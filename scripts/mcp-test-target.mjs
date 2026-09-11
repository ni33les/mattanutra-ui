/** The maintained pack runs on DEV, or on an explicitly isolated local candidate. */
export function isolatedMcpClientHeaders(target, clientId) {
  if (!target.isolatedCandidate) return {};
  if (!Number.isSafeInteger(clientId) || clientId < 0 || clientId > 0xffffffff) throw new Error("Invalid isolated client identity");
  // Documentation-only IPv6 range; stable for a client's complete journey.
  return { "x-forwarded-for": `2001:db8:${Math.floor(clientId / 65536).toString(16)}:${(clientId % 65536).toString(16)}::1` };
}

export function mcpTestTarget(env = process.env) {
  const dev = "https://dev.mattanutra.com/api/mcp";
  if ((env.MATTANUTRA_ENV ?? "dev") !== "dev") throw new Error("MCP tests require MATTANUTRA_ENV=dev.");
  const target = new URL(env.MCP_URL ?? dev);
  if (target.href === dev && env.MCP_ISOLATED_CANDIDATE !== "1") {
    return { publicUrl: dev, originUrl: "http://127.0.0.1:3000/api/mcp", qaUrl: `${dev}/qa`, isolatedCandidate: false };
  }
  let database;
  try { database = new URL(env.TEST_DB_URL ?? ""); } catch { /* reported below */ }
  if (env.MCP_ISOLATED_CANDIDATE !== "1" || target.protocol !== "http:" || target.hostname !== "127.0.0.1" || !target.port || ["3000", "5432", "80", "443"].includes(target.port) || target.pathname !== "/api/mcp" || target.search || target.hash || target.username || target.password || env.DB_URL !== env.TEST_DB_URL || !database || database.hostname !== "127.0.0.1" || !database.port || ["5432", "3000", "80", "443"].includes(database.port) || !["postgres:", "postgresql:"].includes(database.protocol) || database.search || database.hash || !/^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/.test(database.pathname)) {
    throw new Error("MCP tests target DEV. A local candidate requires MCP_ISOLATED_CANDIDATE=1, an explicit http://127.0.0.1:<port>/api/mcp URL, and identical DB_URL/TEST_DB_URL pointing to an isolated localhost mattanutra_lock_review database.");
  }
  return { publicUrl: target.href, originUrl: target.href, qaUrl: `${target.href}/qa`, isolatedCandidate: true };
}

/** Public-only journeys may target UAT; private fixture/database acceptance stays isolated above. */
export function publicMcpClientEndpoint(value) {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  const hosted = ["dev.mattanutra.com", "uat.mattanutra.com"].includes(url.hostname);
  if ((!local && !hosted) || (hosted && (url.protocol !== "https:" || url.port)) ||
      (local && url.protocol !== "http:") || url.pathname !== "/api/mcp" || url.search || url.hash || url.username || url.password)
    throw new Error("Public MCP journeys require the exact DEV/UAT HTTPS endpoint or an isolated localhost HTTP endpoint");
  return url;
}
