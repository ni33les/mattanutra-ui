import { NextResponse, type NextRequest } from "next/server";
import {
  resolveAdminPanyaConversationEscalation,
  sendAdminPanyaConversationReply
} from "@/lib/admin-panya";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";
import { saveAndActivatePanyaConfig } from "@/lib/panya";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const { context, unauthorized } = await requireAdminRouteAccess(
    request,
    "panya.write"
  );

  if (unauthorized) {
    return unauthorized;
  }

  if (!context || context.effectiveOrganisation.type !== "platform") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  if (action === "resolve_escalation") {
    try {
      const result = await resolveAdminPanyaConversationEscalation({
        context,
        note: body.note,
        planId: body.planId,
        threadKey: body.threadKey
      });

      return NextResponse.json({ result });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not resolve escalation"
        },
        { status: 400 }
      );
    }
  }

  if (action !== "save_config") {
    return NextResponse.json({ error: "Unsupported Panya action" }, { status: 400 });
  }

  try {
    const configVersion = await saveAndActivatePanyaConfig({
      config: body.config,
      context
    });

    return NextResponse.json({ configVersion });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save Panya config"
      },
      { status: 400 }
    );
  }
}
