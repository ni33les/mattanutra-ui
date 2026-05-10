import {
  openClawJson,
  requireOpenClawRequest,
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
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;

  try {
    return openClawJson(await getTaskBundle({ taskId: id }));
  } catch (error) {
    return taskApiError(error, "Unable to load task");
  }
}
