import { signedAdminSessionAllowedForRequest } from "@/lib/admin-session-cookie";
import {
  bearerToken,
  configuredLegacyToken,
  legacyTokenMatches
} from "@/lib/legacy-token-auth";

function configuredDashboardToken() {
  return configuredLegacyToken("admin_dashboard");
}

function configuredClawToken() {
  return configuredLegacyToken("admin_claw");
}

export function adminDashboardTokenConfigured() {
  return Boolean(configuredDashboardToken());
}

export function adminDashboardTokenAllowed(token: unknown) {
  if (typeof token !== "string") {
    return false;
  }

  return legacyTokenMatches("admin_dashboard", token);
}

export function adminClawTokenConfigured() {
  return Boolean(configuredClawToken());
}

export function adminClawTokenAllowed(token: unknown) {
  if (typeof token !== "string") {
    return false;
  }

  return legacyTokenMatches("admin_claw", token);
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
    ) ||
    signedAdminSessionAllowedForRequest(request)
  );
}
