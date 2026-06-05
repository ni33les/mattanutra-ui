import type { NextRequest } from "next/server";
import {
  getAdminExternalQueryData,
  normalizeAdminExternalQueryView
} from "@/lib/admin-query-data";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import {
  openClawJson,
  openClawUnauthorized,
  taskApiError
} from "@/lib/openclaw-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminQueryRouteProps = Readonly<{
  params: Promise<{
    view: string;
  }>;
}>;

export async function GET(request: NextRequest, { params }: AdminQueryRouteProps) {
  const url = new URL(request.url);
  const unauthorized = adminDashboardOrClawRequestAllowed(
    request,
    url.searchParams.get("access_token")
  )
    ? null
    : openClawUnauthorized();

  if (unauthorized) {
    return unauthorized;
  }

  const { view: rawView } = await params;
  const view = normalizeAdminExternalQueryView(rawView);

  if (!view) {
    return openClawJson({ message: "Unknown admin query view" }, { status: 404 });
  }

  try {
    const context = await resolveAdminSession({
      csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
      sessionCookie: request.cookies.get(adminSessionCookieName)?.value
    });

    return openClawJson(await getAdminExternalQueryData(
      view,
      url.searchParams,
      context
    ));
  } catch (error) {
    return taskApiError(error, "Unable to load admin query");
  }
}
