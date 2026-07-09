import { NextResponse, type NextRequest } from "next/server";
import { recordAdminAudit } from "@/lib/admin-access";
import { getAdminPanyaData, panyaConversationsCsv } from "@/lib/admin-panya";
import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { context, unauthorized } = await requireAdminRouteAccess(
    request,
    "panya.read"
  );

  if (unauthorized) {
    return unauthorized;
  }

  if (!context || context.effectiveOrganisation.type !== "platform") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const range = normalizeAdminDashboardRange(url.searchParams.get("range") ?? undefined);
  const data = await getAdminPanyaData(
    range,
    context,
    url.searchParams.get("conversation")
  );
  const filename = `panya-conversations-${range}-${new Date().toISOString().slice(0, 10)}`;

  await recordAdminAudit({
    action: "admin.panya_conversations_exported",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    metadata: {
      format,
      range,
      threadCount: data.conversations.length
    },
    organisationId: context.effectiveOrganisation.id,
    resourceId: null,
    resourceType: "panya_conversation_archive"
  });

  if (format === "json") {
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}.json"`,
        "Content-Type": "application/json; charset=utf-8"
      }
    });
  }

  return new NextResponse(panyaConversationsCsv(data), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
