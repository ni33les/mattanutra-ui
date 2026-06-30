import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { reportTaskProgress } from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

type ProgressTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(
  request: Request,
  { params }: ProgressTaskRouteProps
) {
  const access = await requireWorkerAccess(request);
  const unauthorized = access.unauthorized;

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  const reservationId = textValue(body.reservationId);
  const workerSessionId = textValue(body.workerSessionId);

  if (!reservationId) {
    return openClawJson(
      { message: "reservationId is required to report task progress" },
      { status: 400 }
    );
  }

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to report task progress" },
      { status: 400 }
    );
  }

  try {
    return openClawJson(
      await reportTaskProgress({
        accessScope: access.scope,
        agentId: access.principal?.agentId ?? textValue(body.agentId),
        leaseSeconds: body.leaseSeconds,
        reservationId,
        resultPayload: objectValue(body.resultPayload),
        taskId: id,
        workerSessionId
      })
    );
  } catch (error) {
    return taskApiError(error, "Unable to report task progress");
  }
}
