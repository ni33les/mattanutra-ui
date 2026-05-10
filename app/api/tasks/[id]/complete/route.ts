import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { completeTask } from "@/lib/task-service";

export const runtime = "nodejs";

type CompleteTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: CompleteTaskRouteProps
) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);

  try {
    const task = await completeTask({
      agentId: textValue(body.agentId),
      resultPayload: objectValue(body.resultPayload),
      taskId: id
    });

    return openClawJson({ task });
  } catch (error) {
    return taskApiError(error, "Unable to complete task");
  }
}
