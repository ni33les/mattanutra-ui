import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import {
  listCommunicationChannels,
  normalizeCommunicationChannelType,
  upsertCommunicationChannel
} from "@/lib/communications";
import { kickJobsWorker } from "@/lib/job-queue";

export const runtime = "nodejs";

function numberValue(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : null;

  return Number.isFinite(numeric) ? Number(numeric) : null;
}

export async function GET(request: Request) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);

  try {
    const channels = await listCommunicationChannels({
      identityId: url.searchParams.get("identityId"),
      planId: url.searchParams.get("planId")
    });

    return openClawJson({ channels });
  } catch (error) {
    return taskApiError(error, "Unable to load communication channels");
  }
}

export async function POST(request: Request) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonObject(request);
  const channelType = normalizeCommunicationChannelType(body.channelType);
  const address = textValue(body.address);

  if (!channelType || !address) {
    return openClawJson(
      { message: "channelType and address are required" },
      { status: 400 }
    );
  }

  try {
    const channel = await upsertCommunicationChannel({
      actorType:
        body.actorType === "ai" ||
        body.actorType === "human" ||
        body.actorType === "system" ||
        body.actorType === "unknown"
          ? body.actorType
          : "human",
      address,
      channelType,
      displayName: textValue(body.displayName),
      identityId: textValue(body.identityId),
      metadata: objectValue(body.metadata),
      planId: textValue(body.planId),
      preferenceRank: numberValue(body.preferenceRank),
      status:
        body.status === "active" ||
        body.status === "disabled" ||
        body.status === "failed" ||
        body.status === "unverified"
          ? body.status
          : "active"
    });

    void kickJobsWorker();

    return openClawJson({ channel });
  } catch (error) {
    return taskApiError(error, "Unable to save communication channel");
  }
}
