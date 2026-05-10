import {
  openClawJson,
  requireOpenClawRequest,
  taskApiError
} from "@/lib/openclaw-api";
import { listRayTasks } from "@/lib/task-service";

export const runtime = "nodejs";

type RayTasksRouteProps = Readonly<{
  params: Promise<{
    rayId: string;
  }>;
}>;

export async function GET(request: Request, { params }: RayTasksRouteProps) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { rayId } = await params;

  try {
    return openClawJson(await listRayTasks({ rayId }));
  } catch (error) {
    return taskApiError(error, "Unable to load ray tasks");
  }
}
