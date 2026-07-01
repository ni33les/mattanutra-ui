import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import { permissionForAdminRequest, type AdminPermission } from "@/lib/admin-rbac";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import type { AdminSessionContext } from "@/lib/admin-access-types";

export type AdminRouteAccess = Readonly<{
  context: AdminSessionContext | null;
  unauthorized: NextResponse | null;
}>;

export function adminRouteUnauthorized(status = 401) {
  return NextResponse.json(
    { error: status === 403 ? "Forbidden" : "Unauthorized" },
    {
      headers: {
        "Cache-Control": "no-store"
      },
      status
    }
  );
}

export async function resolveAdminRouteAccess(
  request: NextRequest,
  requiredPermission: AdminPermission | null =
    permissionForAdminRequest(request.method, new URL(request.url).pathname)
): Promise<AdminRouteAccess> {
  if (!requestOriginAllowed(request)) {
    return { context: null, unauthorized: adminRouteUnauthorized(403) };
  }

  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (!context) {
    return { context: null, unauthorized: adminRouteUnauthorized(401) };
  }

  if (requiredPermission && !context.permissions.includes(requiredPermission)) {
    return { context, unauthorized: adminRouteUnauthorized(403) };
  }

  return { context, unauthorized: null };
}

export async function requireAdminRouteAccess(
  request: NextRequest,
  requiredPermission?: AdminPermission | null
) {
  return resolveAdminRouteAccess(
    request,
    requiredPermission === undefined
      ? permissionForAdminRequest(request.method, new URL(request.url).pathname)
      : requiredPermission
  );
}
