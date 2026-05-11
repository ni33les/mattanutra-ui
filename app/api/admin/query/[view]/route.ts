import {
  getAdminExternalQueryData,
  normalizeAdminExternalQueryView
} from "@/lib/admin-query-data";
import {
  openClawJson,
  requireOpenClawRequest,
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
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { view: rawView } = await params;
  const view = normalizeAdminExternalQueryView(rawView);

  if (!view) {
    return openClawJson({ message: "Unknown admin query view" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);

    return openClawJson(await getAdminExternalQueryData(view, url.searchParams));
  } catch (error) {
    return taskApiError(error, "Unable to load admin query");
  }
}
