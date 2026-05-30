import {
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { renewTaskLease } from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

type RenewTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(request: Request, { params }: RenewTaskRouteProps) {
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
      { message: "reservationId is required to renew a task lease" },
      { status: 400 }
    );
  }

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to renew a task lease" },
      { status: 400 }
    );
  }

  try {
    return openClawJson(
      await renewTaskLease({
        accessScope: access.scope,
        agentId: access.principal?.agentId ?? textValue(body.agentId),
        leaseSeconds: body.leaseSeconds,
        reservationId,
        taskId: id,
        workerSessionId
      })
    );
  } catch (error) {
    return taskApiError(error, "Unable to renew task lease");
  }
}
