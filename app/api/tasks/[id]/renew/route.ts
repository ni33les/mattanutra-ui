import {
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { renewTaskLease } from "@/lib/task-service";

export const runtime = "nodejs";

type RenewTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(request: Request, { params }: RenewTaskRouteProps) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);

  try {
    return openClawJson(
      await renewTaskLease({
        agentId: textValue(body.agentId),
        leaseSeconds: body.leaseSeconds,
        reservationId: textValue(body.reservationId),
        taskId: id
      })
    );
  } catch (error) {
    return taskApiError(error, "Unable to renew task lease");
  }
}
