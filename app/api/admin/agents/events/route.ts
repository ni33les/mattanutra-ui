import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";
import { getAdminAgentsData } from "@/lib/admin-execution";
import { streamAdminSnapshots } from "@/lib/admin-sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessToken = url.searchParams.get("access_token");

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const range = normalizeAdminDashboardRange(
    url.searchParams.get("range") ?? undefined
  );

  return streamAdminSnapshots({
    eventName: "agents",
    load: () => getAdminAgentsData(range),
    request
  });
}
