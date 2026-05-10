import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { failTask } from "@/lib/task-service";

export const runtime = "nodejs";

type FailTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(request: Request, { params }: FailTaskRouteProps) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);

  try {
    const task = await failTask({
      agentId: textValue(body.agentId),
      errorMessage: textValue(body.errorMessage) ?? "Task failed.",
      resultPayload: objectValue(body.resultPayload),
      taskId: id
    });

    return openClawJson({ task });
  } catch (error) {
    return taskApiError(error, "Unable to fail task");
  }
}
