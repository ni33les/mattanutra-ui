import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawAccess,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import {
  updateCommunicationChannel,
  type CommunicationChannelStatus
} from "@/lib/communications";

export const runtime = "nodejs";

type ChannelRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function numberValue(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : null;

  return Number.isFinite(numeric) ? Number(numeric) : null;
}

function statusValue(value: unknown): CommunicationChannelStatus | null {
  return value === "active" ||
    value === "disabled" ||
    value === "failed" ||
    value === "unverified"
    ? value
    : null;
}

export async function PATCH(request: Request, { params }: ChannelRouteProps) {
  const { unauthorized } = await requireOpenClawAccess(request, "communications.write");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);

  try {
    const channel = await updateCommunicationChannel({
      address: textValue(body.address),
      channelId: id,
      displayName: textValue(body.displayName),
      metadata: objectValue(body.metadata),
      preferenceRank: numberValue(body.preferenceRank),
      status: statusValue(body.status)
    });

    return openClawJson({ channel });
  } catch (error) {
    return taskApiError(error, "Unable to update communication channel");
  }
}
