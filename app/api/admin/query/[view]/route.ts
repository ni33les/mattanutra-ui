import type { NextRequest } from "next/server";
import {
  getAdminExternalQueryData,
  normalizeAdminExternalQueryView
} from "@/lib/admin-query-data";
import { permissionForAdminRequest } from "@/lib/admin-rbac";
import {
  openClawJson,
  requireRemoteAgentAccess,
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
  const { view: rawView } = await params;
  const view = normalizeAdminExternalQueryView(rawView);

  if (!view) {
    return openClawJson({ message: "Unknown admin query view" }, { status: 404 });
  }

  const permission =
    permissionForAdminRequest(request.method, `/api/admin/query/${view}`) ??
    "performance.read";
  const { unauthorized } = await requireRemoteAgentAccess(request, permission);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    return openClawJson(await getAdminExternalQueryData(
      view,
      url.searchParams,
      null
    ));
  } catch (error) {
    return taskApiError(error, "Unable to load admin query");
  }
}
