const firstPartyImageHosts = [
  "dev.mattanutra.com",
  "uat.mattanutra.com",
  "mattanutra.com",
  "www.mattanutra.com",
  "mattanutra.sgp1.cdn.digitaloceanspaces.com",
  "mattanutra.sgp1.digitaloceanspaces.com"
] as const;

export const FIRST_PARTY_IMAGE_SQL_REGEX =
  "^(https://(dev\\.|uat\\.|www\\.)?mattanutra\\.com/|https://mattanutra\\.sgp1\\.cdn\\.digitaloceanspaces\\.com/|https://mattanutra\\.sgp1\\.digitaloceanspaces\\.com/|/[^/])";

function isLocalRuntimePath(value: string) {
  return value.startsWith("/") && !value.startsWith("//");
}

export function normalizeRuntimeImageUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (isLocalRuntimePath(trimmed) || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://")) {
    return `https://${trimmed.slice("http://".length)}`;
  }

  return null;
}

export function isFirstPartyImageHost(hostname: string) {
  const normalized = hostname.toLowerCase();

  return (
    firstPartyImageHosts.includes(normalized as (typeof firstPartyImageHosts)[number]) ||
    normalized.endsWith(".mattanutra.com")
  );
}

export function imageUrlHost(value: string | null | undefined) {
  const normalized = normalizeRuntimeImageUrl(value);

  if (!normalized || isLocalRuntimePath(normalized)) {
    return null;
  }

  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isFirstPartyImageUrl(value: string | null | undefined) {
  const normalized = normalizeRuntimeImageUrl(value);

  if (!normalized) {
    return false;
  }

  if (isLocalRuntimePath(normalized)) {
    return true;
  }

  const hostname = imageUrlHost(normalized);

  return hostname ? isFirstPartyImageHost(hostname) : false;
}

const SHARED_SPACES_ENVS = ["dev", "prd", "uat"] as const;

export type SharedSpacesImageEnvironment = (typeof SHARED_SPACES_ENVS)[number];

function pathnameFromFirstPartyUrl(value: string | null | undefined) {
  const normalized = normalizeRuntimeImageUrl(value);

  if (!normalized) {
    return null;
  }

  if (isLocalRuntimePath(normalized)) {
    return normalized;
  }

  try {
    const url = new URL(normalized);

    if (!isFirstPartyImageHost(url.hostname)) {
      return null;
    }

    return url.pathname;
  } catch {
    return null;
  }
}

export function sharedSpacesImageEnvPrefix(
  value: string | null | undefined
): SharedSpacesImageEnvironment | null {
  const pathname = pathnameFromFirstPartyUrl(value);

  if (!pathname) {
    return null;
  }

  const first = pathname.replace(/^\/+/, "").split("/")[0] ?? "";

  return SHARED_SPACES_ENVS.includes(first as SharedSpacesImageEnvironment)
    ? (first as SharedSpacesImageEnvironment)
    : null;
}

export function sharedSpacesObjectKey(value: string | null | undefined) {
  const pathname = pathnameFromFirstPartyUrl(value);

  if (!pathname) {
    return null;
  }

  const key = pathname.replace(/^\/+/, "");

  return key.includes("/") ? key : null;
}

export function isSameEnvironmentFirstPartyImage(
  value: string | null | undefined,
  environment: string | null | undefined
) {
  const normalized = normalizeRuntimeImageUrl(value);

  if (!normalized || !isFirstPartyImageUrl(normalized)) {
    return false;
  }

  if (isLocalRuntimePath(normalized)) {
    return true;
  }

  const prefix = sharedSpacesImageEnvPrefix(normalized);

  if (!prefix) {
    return true;
  }

  const mapped =
    environment === "production" || environment === "prod"
      ? "prd"
      : environment === "development" || environment === "local"
        ? "dev"
        : environment === "staging" || environment === "stage"
          ? "uat"
          : environment?.trim().toLowerCase();

  return prefix === mapped;
}

export function retargetSharedSpacesImageUrl(
  value: string | null | undefined,
  targetEnvironment: SharedSpacesImageEnvironment
) {
  const normalized = normalizeRuntimeImageUrl(value);

  if (!normalized) {
    return value ?? null;
  }

  const prefix = sharedSpacesImageEnvPrefix(normalized);

  if (!prefix || prefix === targetEnvironment) {
    return normalized;
  }

  if (isLocalRuntimePath(normalized)) {
    return normalized.replace(
      new RegExp(`^/${prefix}/`),
      `/${targetEnvironment}/`
    );
  }

  try {
    const url = new URL(normalized);
    url.pathname = url.pathname.replace(
      new RegExp(`^/${prefix}/`),
      `/${targetEnvironment}/`
    );
    return url.toString();
  } catch {
    return normalized;
  }
}

export function isExternalRuntimeImageUrl(value: string | null | undefined) {
  const normalized = normalizeRuntimeImageUrl(value);

  if (!normalized || isFirstPartyImageUrl(normalized)) {
    return false;
  }

  try {
    const url = new URL(normalized);

    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export { firstPartyImageHosts };
