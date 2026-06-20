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
