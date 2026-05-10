import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import {
  normalizeCommunicationChannelType,
  sendCommunication
} from "@/lib/communications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
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
      goalId: textValue(body.goalId),
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
