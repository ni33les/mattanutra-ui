import {
  openClawJson,
  requireOpenClawAccess,
  taskApiError
} from "@/lib/openclaw-api";
import { getTaskBundle } from "@/lib/task-service";

export const runtime = "nodejs";

type TaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function GET(request: Request, { params }: TaskRouteProps) {
  const { scope, unauthorized } = await requireOpenClawAccess(request, "tasks.read");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;

  try {
    return openClawJson(await getTaskBundle({ accessScope: scope, taskId: id }));
  } catch (error) {
    return taskApiError(error, "Unable to load task");
  }
}
