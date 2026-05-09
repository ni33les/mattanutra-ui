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

export function adminDashboardTokenConfigured() {
  return Boolean(configuredDashboardToken());
}

export function adminDashboardTokenAllowed(token: unknown) {
  const configuredToken = configuredDashboardToken();

  if (!configuredToken || typeof token !== "string") {
    return false;
  }

  const supplied = token.trim();

  if (!supplied) {
    return false;
  }

  return timingSafeEqual(hash(supplied), hash(configuredToken));
}
