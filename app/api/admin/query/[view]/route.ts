import {
  getAdminExternalQueryData,
  normalizeAdminExternalQueryView
} from "@/lib/admin-query-data";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
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

export async function GET(request: Request, { params }: AdminQueryRouteProps) {
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
    return openClawJson(await getAdminExternalQueryData(view, url.searchParams));
  } catch (error) {
    return taskApiError(error, "Unable to load admin query");
  }
}
