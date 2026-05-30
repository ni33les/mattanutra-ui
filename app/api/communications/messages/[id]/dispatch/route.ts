import {
  openClawJson,
  requireOpenClawAccess,
  taskApiError
} from "@/lib/openclaw-api";
import { dispatchCommunicationMessage } from "@/lib/communications";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

type DispatchRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(request: Request, { params }: DispatchRouteProps) {
  const openClawAccess = await requireOpenClawAccess(request, "communications.write");

  if (openClawAccess.unauthorized) {
    const workerAccess = await requireWorkerAccess(request);

    if (workerAccess.unauthorized) {
      return workerAccess.unauthorized;
    }
  }

  const { id } = await params;

  try {
    const result = await dispatchCommunicationMessage(id);

    return openClawJson(
      { dispatch: result },
      { status: result.configured ? 200 : 202 }
    );
  } catch (error) {
    return taskApiError(error, "Unable to dispatch communication message");
  }
}
