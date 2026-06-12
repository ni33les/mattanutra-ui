import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import { hasAdminPermission } from "@/lib/admin-rbac";
import { sendAdminPanyaConversationReply } from "@/lib/admin-panya";
import { saveAndActivatePanyaConfig } from "@/lib/panya";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function panyaContext(request: NextRequest, write: boolean) {
  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });
  const permission = write ? "panya.write" : "panya.read";

  if (
    !context ||
    context.effectiveOrganisation.type !== "platform" ||
    !hasAdminPermission(context, permission)
  ) {
    return null;
  }

  return context;
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const context = await panyaContext(request, true);

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = text(body.action);

  if (action === "send_reply") {
    try {
      const result = await sendAdminPanyaConversationReply({
        body: body.reply,
        context,
        planId: body.planId,
        threadKey: body.threadKey
      });

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Could not send reply"
        },
        { status: 400 }
      );
    }
  }

  if (action !== "save_config") {
    return NextResponse.json({ error: "Unsupported Panya action" }, { status: 400 });
  }

  const configVersion = await saveAndActivatePanyaConfig({
    config: body.config,
    context
  });

  return NextResponse.json({ configVersion });
}
