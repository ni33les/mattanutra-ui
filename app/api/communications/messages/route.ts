import {
  openClawJson,
  requireOpenClawAccess,
  taskApiError
} from "@/lib/openclaw-api";
import {
  listCommunicationMessages,
  normalizeCommunicationChannelType,
  type CommunicationMessageStatus
} from "@/lib/communications";

export const runtime = "nodejs";

const MESSAGE_STATUSES = new Set([
  "delivered",
  "failed",
  "no_channel",
  "queued",
  "sent",
  "skipped"
]);

function statusValue(value: string | null): CommunicationMessageStatus | null {
  return value && MESSAGE_STATUSES.has(value)
    ? (value as CommunicationMessageStatus)
    : null;
}

function limitValue(value: string | null) {
  const numeric = value ? Number(value) : 50;

  return Number.isFinite(numeric) ? numeric : 50;
}

export async function GET(request: Request) {
  const { unauthorized } = await requireOpenClawAccess(request, "communications.read");

  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);

  try {
    const messages = await listCommunicationMessages({
      channelType: normalizeCommunicationChannelType(
        url.searchParams.get("channelType")
      ),
      limit: limitValue(url.searchParams.get("limit")),
      planId: url.searchParams.get("planId"),
      status: statusValue(url.searchParams.get("status"))
    });

    return openClawJson({ messages });
  } catch (error) {
    return taskApiError(error, "Unable to load communication messages");
  }
}
