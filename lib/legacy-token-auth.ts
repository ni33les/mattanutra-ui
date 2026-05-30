import { createHash, timingSafeEqual } from "node:crypto";

export type LegacyTokenSource = "admin_claw" | "admin_dashboard" | "worker";

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function tokenMatches(supplied: string, configuredToken: string) {
  const trimmed = supplied.trim();

  if (!configuredToken || !trimmed) {
    return false;
  }

  return timingSafeEqual(hash(trimmed), hash(configuredToken));
}

export function legacyTokenAuthAllowed() {
  return process.env.MATTANUTRA_LEGACY_TOKEN_AUTH === "allow";
}

export function configuredLegacyToken(source: LegacyTokenSource) {
  if (!legacyTokenAuthAllowed()) {
    return "";
  }

  if (source === "admin_claw") {
    return process.env.ADMIN_CLAW_TOKEN?.trim() || "";
  }

  if (source === "admin_dashboard") {
    return (
      process.env.ADMIN_DASHBOARD_TOKEN?.trim() ||
      process.env.admin_dashboard_token?.trim() ||
      ""
    );
  }

  return process.env.WORKER_API_TOKEN?.trim() || "";
}

export function legacyTokenMatches(
  source: LegacyTokenSource,
  supplied: unknown
) {
  return typeof supplied === "string" &&
    tokenMatches(supplied, configuredLegacyToken(source));
}

export function bearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";

  return authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
}
