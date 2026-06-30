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
  const startedAt = Date.now();
  const access = await requireWorkerAccess(request);
  const authDurationMs = Date.now() - startedAt;
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
    const resultPayload = objectValue(body.resultPayload);
    const dbStartedAt = Date.now();
    const result = await reportTaskProgress({
      accessScope: access.scope,
      agentId: access.principal?.agentId ?? textValue(body.agentId),
      leaseSeconds: body.leaseSeconds,
      reservationId,
      resultPayload,
      taskId: id,
      workerSessionId
    });
    const dbDurationMs = Date.now() - dbStartedAt;

    console.info("[tasks:progress]", {
      authDurationMs,
      dbDurationMs,
      reservationId,
      stage: typeof resultPayload.stage === "string" ? resultPayload.stage : null,
      taskId: id,
      totalDurationMs: Date.now() - startedAt,
      workerSessionId
    });

    return openClawJson(result);
  } catch (error) {
    console.warn("[tasks:progress] failed", {
      authDurationMs,
      error: error instanceof Error ? error.message : "Unknown error",
      reservationId,
      taskId: id,
      totalDurationMs: Date.now() - startedAt,
      workerSessionId
    });

    return taskApiError(error, "Unable to report task progress");
  }
}
