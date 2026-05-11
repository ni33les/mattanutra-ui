import { createHash, timingSafeEqual } from "node:crypto";

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function configuredDashboardToken() {
  return (
    process.env.ADMIN_DASHBOARD_TOKEN?.trim() ||
    process.env.admin_dashboard_token?.trim() ||
    ""
  );
}

function configuredClawToken() {
  return process.env.ADMIN_CLAW_TOKEN?.trim() || "";
}

function bearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";

  return authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
}

function tokenMatches(supplied: string, configuredToken: string) {
  const trimmed = supplied.trim();

  if (!configuredToken || !trimmed) {
    return false;
  }

  return timingSafeEqual(hash(trimmed), hash(configuredToken));
}

export function adminDashboardTokenConfigured() {
  return Boolean(configuredDashboardToken());
}

export function adminDashboardTokenAllowed(token: unknown) {
  const configuredToken = configuredDashboardToken();

  if (typeof token !== "string") {
    return false;
  }

  return tokenMatches(token, configuredToken);
}

export function adminClawTokenConfigured() {
  return Boolean(configuredClawToken());
}

export function adminClawTokenAllowed(token: unknown) {
  if (typeof token !== "string") {
    return false;
  }

  return tokenMatches(token, configuredClawToken());
}

export function adminClawRequestAllowed(request: Request) {
  return (
    adminClawTokenAllowed(bearerToken(request)) ||
    adminClawTokenAllowed(request.headers.get("x-admin-claw-token"))
  );
}

export function adminDashboardOrClawRequestAllowed(
  request: Request,
  dashboardToken?: unknown
) {
  return (
    adminClawRequestAllowed(request) ||
    adminDashboardTokenAllowed(
      dashboardToken ?? request.headers.get("x-admin-dashboard-token")
    )
  );
}
