function cleanText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

type NotificationEnvironment = "dev" | "prd" | "uat";

const NOTIFICATION_ENVIRONMENT_ALIASES: Record<string, NotificationEnvironment> = {
  dev: "dev",
  development: "dev",
  local: "dev",
  prd: "prd",
  prod: "prd",
  production: "prd",
  stage: "uat",
  staging: "uat",
  uat: "uat"
};

function normalizeNotificationEnvironment(value: unknown) {
  return NOTIFICATION_ENVIRONMENT_ALIASES[cleanText(value).toLowerCase()] ?? null;
}

function inferNotificationEnvironmentFromUrl(value: unknown) {
  const first = cleanText(value).split(",")[0]?.trim();

  if (!first) {
    return null;
  }

  try {
    const host = new URL(first.includes("://") ? first : `https://${first}`)
      .hostname
      .toLowerCase();

    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return "dev";
    }

    if (host === "mattanutra.com" || host === "www.mattanutra.com") {
      return "prd";
    }

    if (/(^|[.-])uat($|[.-])/.test(host)) {
      return "uat";
    }

    return /(^|[.-])dev($|[.-])/.test(host) ? "dev" : null;
  } catch {
    return null;
  }
}

export function notificationEnvironmentCode(
  metadata: Record<string, unknown> = {}
): NotificationEnvironment {
  const explicit =
    normalizeNotificationEnvironment(process.env.MATTANUTRA_ENV) ??
    normalizeNotificationEnvironment(metadata.mattanutraEnv);

  if (explicit) {
    return explicit;
  }

  for (const candidate of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APP_BASE_URL,
    process.env.MATTANUTRA_API_BASE_URL,
    process.env.VERCEL_URL,
    process.env.RENDER_EXTERNAL_URL
  ]) {
    const inferred = inferNotificationEnvironmentFromUrl(candidate);

    if (inferred) {
      return inferred;
    }
  }

  return process.env.NODE_ENV === "production" ? "prd" : "dev";
}

export function adminNotificationEnvironmentLabel(
  metadata: Record<string, unknown> = {}
) {
  const environment = notificationEnvironmentCode(metadata);

  return environment === "prd" ? null : environment.toUpperCase();
}

