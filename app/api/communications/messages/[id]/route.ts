import {
  openClawJson,
  readJsonObject,
  requireOpenClawAccess,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import {
  getCommunicationMessage,
  updateCommunicationMessageStatus,
  type CommunicationMessageStatus
} from "@/lib/communications";

export const runtime = "nodejs";

type MessageRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

const MESSAGE_STATUSES = new Set([
  "delivered",
  "failed",
  "no_channel",
  "queued",
  "sent",
  "skipped"
]);

function statusValue(value: unknown): CommunicationMessageStatus | null {
  return typeof value === "string" && MESSAGE_STATUSES.has(value)
    ? (value as CommunicationMessageStatus)
    : null;
}

export async function GET(request: Request, { params }: MessageRouteProps) {
  const { unauthorized } = await requireOpenClawAccess(request, "communications.read");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;

  try {
    const message = await getCommunicationMessage(id);

    if (!message) {
      return openClawJson(
        { message: "Communication message not found" },
        { status: 404 }
      );
    }

    return openClawJson({ message });
  } catch (error) {
    return taskApiError(error, "Unable to load communication message");
  }
}

export async function PATCH(request: Request, { params }: MessageRouteProps) {
  const { unauthorized } = await requireOpenClawAccess(request, "communications.write");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  const status = statusValue(body.status);

  if (!status) {
    return openClawJson({ message: "Valid status is required" }, { status: 400 });
  }

  try {
    const message = await updateCommunicationMessageStatus({
      errorMessage: textValue(body.errorMessage),
      messageId: id,
      providerMessageId: textValue(body.providerMessageId),
      status
    });

    return openClawJson({ message });
  } catch (error) {
    return taskApiError(error, "Unable to update communication message");
  }
}
