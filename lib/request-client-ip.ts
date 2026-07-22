/**
 * Best-effort client IP extraction for rate limiting and audit.
 *
 * Only trust headers that a reverse proxy / edge is expected to set. Raw
 * client-supplied `x-forwarded-for` is ignored unless proxy trust is enabled
 * (production, or TRUST_PROXY=1), so spoofed high-cardinality values cannot
 * fragment rate-limit buckets in local/dev or misconfigured deployments.
 *
 * Optional overrides:
 * - TRUST_PROXY=1|true — trust proxy headers outside production
 * - TRUSTED_CLIENT_IP_HEADER — single preferred header name (e.g. cf-connecting-ip)
 */

import { isIP } from "node:net";

const DEFAULT_TRUSTED_HEADERS = [
  "cf-connecting-ip",
  "true-client-ip",
  "x-real-ip",
  "x-forwarded-for"
] as const;

export function isTrustedProxyClientIpEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const flag = env.TRUST_PROXY?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") {
    return true;
  }

  if (env.TRUSTED_CLIENT_IP_HEADER?.trim()) {
    return true;
  }

  // DigitalOcean App Platform / production reverse proxies normalize
  // x-forwarded-* on inbound traffic to the app component.
  return env.NODE_ENV === "production";
}

export function normalizeClientIpCandidate(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  // Strip port / brackets from forms like "203.0.113.9:1234" or "[::1]:443".
  let value = raw.trim();
  if (!value || value.length > 64) {
    return null;
  }

  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 1) {
      value = value.slice(1, end);
    }
  } else {
    // IPv4:port only (avoid splitting IPv6).
    const ipv4Port = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4Port) {
      value = ipv4Port[1]!;
    }
  }

  // node:net.isIP accepts IPv4 and full/compressed IPv6; rejects garbage.
  if (isIP(value) === 0) {
    return null;
  }

  return value.toLowerCase();
}

function firstForwardedHop(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  for (const hop of headerValue.split(",")) {
    const ip = normalizeClientIpCandidate(hop);
    if (ip) {
      return ip;
    }
  }

  return null;
}

function trustedHeaderNames(env: NodeJS.ProcessEnv): readonly string[] {
  const override = env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (override) {
    return [override];
  }

  return DEFAULT_TRUSTED_HEADERS;
}

/**
 * Resolve client IP from request headers when proxy trust is enabled.
 * Returns null when headers are absent, invalid, or not trusted.
 */
export function getRequestClientIp(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!isTrustedProxyClientIpEnabled(env)) {
    return null;
  }

  const headers = request.headers;

  for (const name of trustedHeaderNames(env)) {
    const raw = headers.get(name);
    if (!raw) {
      continue;
    }

    const ip =
      name === "x-forwarded-for"
        ? firstForwardedHop(raw)
        : normalizeClientIpCandidate(raw);

    if (ip) {
      return ip;
    }
  }

  return null;
}
