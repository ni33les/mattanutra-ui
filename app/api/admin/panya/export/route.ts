import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  recordAdminAudit,
  resolveAdminSession
} from "@/lib/admin-access";
import { getAdminPanyaData, panyaConversationsCsv } from "@/lib/admin-panya";
import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";
import { hasAdminPermission } from "@/lib/admin-rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function panyaContext(request: NextRequest) {
  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (
    !context ||
    context.effectiveOrganisation.type !== "platform" ||
    !hasAdminPermission(context, "panya.read")
  ) {
    return null;
  }

  return context;
}

export async function GET(request: NextRequest) {
  const context = await panyaContext(request);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
