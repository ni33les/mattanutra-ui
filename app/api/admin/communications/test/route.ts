import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import { hasAdminPermission } from "@/lib/admin-rbac";
import {
  queueAdminOrganisationCommunication,
  type AdminCommunicationChannelType
} from "@/lib/communications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function channelType(value: unknown): AdminCommunicationChannelType | null {
  return value === "email" || value === "line" ? value : null;
}

function canAccessEffectiveOrganisation(
  context: NonNullable<Awaited<ReturnType<typeof resolveAdminSession>>>,
  requestedOrganisationId: string
) {
  return requestedOrganisationId === context.effectiveOrganisation.id;
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (!context || !hasAdminPermission(context, "communications.write")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const organisationId = text(body.organisationId) || context.effectiveOrganisation.id;

  if (!canAccessEffectiveOrganisation(context, organisationId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const queued = await queueAdminOrganisationCommunication({
    body:
      "This is a MattaNutra admin communication test. Future order notifications will use the same channel.",
    channelType: channelType(body.channelType),
    eventKey: "admin_test_message",
    metadata: {
      source: "admin_communications_test",
      triggeredByPersonId: context.actorPerson.id
    },
    organisationId,
    resourceType: "admin_communication_test",
    subject: "MattaNutra admin communication test"
  });

  return NextResponse.json({
    queued: true,
    taskId: queued.task.id
  });
}
