import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  permissionForAdminRequest,
  type AdminPermission,
  type AdminRole
} from "@/lib/admin-rbac";

export const adminSessionCookieName = "mn_admin_session";
export const adminCsrfCookieName = "mn_admin_csrf";
export const adminSessionMaxAgeSeconds = 60 * 60 * 12;

export type SignedAdminSession = Readonly<{
  assumedOrganisationId?: string | null;
  assumedPersonId?: string | null;
  expiresAt: number;
  organisationId: string;
  permissions: AdminPermission[];
  personId: string;
  role: AdminRole;
  sessionId: string;
}>;

function configuredSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_DASHBOARD_TOKEN?.trim() ||
    process.env.admin_dashboard_token?.trim() ||
    process.env.ADMIN_CLAW_TOKEN?.trim() ||
    ""
  );
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function hmac(value: string) {
  const secret = configuredSessionSecret();

  if (!secret) {
    return "";
  }

  return createHmac("sha256", secret).update(value).digest("base64url");
}

function tokenMatches(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftHash, rightHash);
}

export function randomAdminToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashAdminToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function signAdminSession(payload: SignedAdminSession) {
  const encoded = base64UrlJson(payload);
  const signature = hmac(encoded);

  if (!signature) {
    throw new Error("ADMIN_SESSION_SECRET or ADMIN_DASHBOARD_TOKEN is required for admin sessions");
  }

  return `${encoded}.${signature}`;
}

export function verifySignedAdminSession(
  cookieValue: string | null | undefined
): SignedAdminSession | null {
  if (!cookieValue) {
    return null;
  }

  const [encoded, signature, extra] = cookieValue.split(".");

  if (!encoded || !signature || extra !== undefined) {
    return null;
  }

  const expected = hmac(encoded);

  if (!expected || !tokenMatches(signature, expected)) {
    return null;
  }

  const payload = decodeBase64UrlJson<SignedAdminSession>(encoded);

  if (!payload || payload.expiresAt <= Date.now()) {
    return null;
  }

  if (
    !payload.sessionId ||
    !payload.personId ||
    !payload.organisationId ||
    !payload.role ||
    !Array.isArray(payload.permissions)
  ) {
    return null;
  }

  return payload;
}

export function adminSessionCookieFromHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (name === adminSessionCookieName) {
      return rest.join("=");
    }
  }

  return null;
}

export function signedAdminSessionFromRequest(request: Request) {
  return verifySignedAdminSession(
    adminSessionCookieFromHeader(request.headers.get("cookie"))
  );
}

export function requestOriginAllowed(request: Request) {
  const method = request.method.toUpperCase();

  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const allowedOrigins = requestAllowedOrigins(request);

    return allowedOrigins.has(originUrl.origin);
  } catch {
    return false;
  }
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function addOrigin(origins: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      origins.add(url.origin);
    }
  } catch {
    // Ignore malformed forwarded/configured origins.
  }
}

function requestAllowedOrigins(request: Request) {
  const origins = new Set<string>();
  const requestUrl = new URL(request.url);

  addOrigin(origins, requestUrl.origin);

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(request.headers.get("host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const proto = forwardedProto || requestUrl.protocol.replace(/:$/, "");

  if (host && (proto === "http" || proto === "https")) {
    addOrigin(origins, `${proto}://${host}`);
  }

  addOrigin(origins, process.env.ADMIN_PASSKEY_ORIGIN);
  addOrigin(origins, process.env.NEXT_PUBLIC_SITE_URL);
  addOrigin(origins, process.env.MATTANUTRA_PUBLIC_SITE_URL);

  return origins;
}

export function signedAdminSessionAllowedForRequest(request: Request) {
  const session = signedAdminSessionFromRequest(request);

  if (!session || !requestOriginAllowed(request)) {
    return false;
  }

  const { pathname } = new URL(request.url);
  const requiredPermission = permissionForAdminRequest(request.method, pathname);

  return requiredPermission
    ? session.permissions.includes(requiredPermission)
    : true;
}
