import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import {
  heartbeatWorkerSession,
  type WorkerSessionStatus
} from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

function sessionStatus(value: unknown): WorkerSessionStatus {
  return value === "offline" ||
    value === "polling" ||
    value === "working" ||
    value === "idle"
    ? value
    : "idle";
}

export async function POST(request: Request) {
  const access = await requireWorkerAccess(request);
  const unauthorized = access.unauthorized;

  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonObject(request);
  const workerSessionId = textValue(body.workerSessionId);

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required" },
      { status: 400 }
    );
  }

  try {
    const session = await heartbeatWorkerSession({
      accessScope: access.scope,
      agentId: access.principal?.agentId ?? textValue(body.agentId),
      currentTaskId: textValue(body.currentTaskId),
      metadata: objectValue(body.metadata),
      status: sessionStatus(body.status),
      workerSessionId
    });

    return openClawJson({ session });
  } catch (error) {
    return taskApiError(error, "Unable to record worker heartbeat");
  }
}
