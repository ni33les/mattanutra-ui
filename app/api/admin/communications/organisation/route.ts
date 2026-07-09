import { NextResponse, type NextRequest } from "next/server";
import type { AdminSessionContext } from "@/lib/admin-access-types";
import { getAdminOrganisationCommunicationSettings } from "@/lib/admin-communications";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";
import {
  adminCommunicationEventKeys,
  adminCommunicationEventScope,
  deleteDisabledOrganisationCommunicationChannel,
  updateOrganisationCommunicationChannel,
  updateOrganisationNotificationPreference,
  upsertOrganisationCommunicationChannel,
  type AdminCommunicationChannelType,
  type AdminCommunicationEventKey
} from "@/lib/communications";
import { validateLeadEmail } from "@/lib/email-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function channelType(value: unknown): AdminCommunicationChannelType | null {
  return value === "email" || value === "line" ? value : null;
}

function eventKey(value: unknown): AdminCommunicationEventKey | null {
  return typeof value === "string" &&
    adminCommunicationEventKeys.includes(value as AdminCommunicationEventKey)
    ? value as AdminCommunicationEventKey
    : null;
}

function canAccessEffectiveOrganisation(
  context: AdminSessionContext,
  requestedOrganisationId: string
) {
  return requestedOrganisationId === context.effectiveOrganisation.id;
}

async function requireCommunicationSession(request: NextRequest, write: boolean) {
  const permission = write ? "communications.write" : "communications.read";
  const { context, unauthorized } = await requireAdminRouteAccess(
    request,
    permission
  );

  if (unauthorized || !context) {
    return {
      context: null,
      response: unauthorized ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  return { context, response: null };
}

export async function GET(request: NextRequest) {
  const { context, response } = await requireCommunicationSession(request, false);

  if (!context) {
    return response;
  }

  const organisationId = text(new URL(request.url).searchParams.get("organisationId")) ||
    context.effectiveOrganisation.id;

  if (!canAccessEffectiveOrganisation(context, organisationId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getAdminOrganisationCommunicationSettings(
    context,
    organisationId
  );

  return NextResponse.json({ settings }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireCommunicationSession(request, true);

  if (!context) {
    return response;
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action);
  const organisationId = text(body.organisationId) || context.effectiveOrganisation.id;

  if (!canAccessEffectiveOrganisation(context, organisationId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "add_email") {
    const validation = validateLeadEmail(text(body.email));
    const displayName = text(body.displayName);

    if (!validation.ok) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }

    if (!displayName) {
      return NextResponse.json({ error: "Enter a contact name" }, { status: 400 });
    }

    await upsertOrganisationCommunicationChannel({
      address: validation.email,
      channelType: "email",
      displayName,
      metadata: { source: "admin_communications_page" },
      organisationId,
      preferenceRank: numberValue(body.preferenceRank),
      status: "active"
    });
  } else if (action === "update_channel") {
    const channelId = text(body.channelId);

    if (!channelId) {
      return NextResponse.json({ error: "Channel is required" }, { status: 400 });
    }

    await updateOrganisationCommunicationChannel({
      address: text(body.address) || null,
      channelId,
      displayName: text(body.displayName) || null,
      metadata: { source: "admin_communications_page" },
      organisationId,
      preferenceRank: numberValue(body.preferenceRank),
      status:
        body.status === "active" ||
        body.status === "disabled" ||
        body.status === "failed" ||
        body.status === "unverified"
          ? body.status
          : null
    });
  } else if (action === "delete_channel") {
    const channelId = text(body.channelId);

    if (!channelId) {
      return NextResponse.json({ error: "Channel is required" }, { status: 400 });
    }

    try {
      await deleteDisabledOrganisationCommunicationChannel({
        channelId,
        organisationId
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not delete communication channel"
        },
        { status: 400 }
      );
    }
  } else if (action === "update_preference") {
    const nextEventKey = eventKey(body.eventKey);
    const nextChannelType = channelType(body.channelType);

    if (!nextEventKey || !nextChannelType || nextEventKey === "admin_test_message") {
      return NextResponse.json({ error: "Preference is invalid" }, { status: 400 });
    }

    const expectedScope =
      context.effectiveOrganisation.type === "platform" ? "platform" : "retail";
    const nextEventScope = adminCommunicationEventScope(nextEventKey);

    if (nextEventScope !== expectedScope) {
      return NextResponse.json({ error: "Preference is invalid for this organisation" }, { status: 400 });
    }

    await updateOrganisationNotificationPreference({
      channelType: nextChannelType,
      enabled: body.enabled === true,
      eventKey: nextEventKey,
      organisationId,
      preferenceRank: numberValue(body.preferenceRank)
    });
  } else {
    return NextResponse.json({ error: "Unknown communication action" }, { status: 400 });
  }

  const settings = await getAdminOrganisationCommunicationSettings(
    context,
    organisationId
  );

  return NextResponse.json({ settings, updated: true });
}
