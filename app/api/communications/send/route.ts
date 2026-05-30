import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawAccess,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import {
  normalizeCommunicationChannelType,
  sendCommunication
} from "@/lib/communications";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const openClawAccess = await requireOpenClawAccess(request, "communications.write");

  if (openClawAccess.unauthorized) {
    const workerAccess = await requireWorkerAccess(request);

    if (workerAccess.unauthorized) {
      return workerAccess.unauthorized;
    }
  }

  const body = await readJsonObject(request);
  const messageBody = textValue(body.body);

  if (!messageBody) {
    return openClawJson({ message: "body is required" }, { status: 400 });
  }

  try {
    const result = await sendCommunication({
      body: messageBody,
      channelType: normalizeCommunicationChannelType(body.channelType),
      html: textValue(body.html),
      identityId: textValue(body.identityId),
      messageType: textValue(body.messageType),
      metadata: objectValue(body.metadata),
      planId: textValue(body.planId),
      subject: textValue(body.subject),
      taskId: textValue(body.taskId)
    });

    return openClawJson(result);
  } catch (error) {
    return taskApiError(error, "Unable to send communication");
  }
}
