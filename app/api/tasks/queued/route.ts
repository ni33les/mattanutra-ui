import { openClawJson, taskApiError } from "@/lib/openclaw-api";
import { listQueuedTaskHeads } from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireWorkerAccess(request);
  const unauthorized = access.unauthorized;

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const tasks = await listQueuedTaskHeads();

    return openClawJson({
      taskTypes: [...new Set(tasks.map((task) => task.taskType))],
      tasks
    });
  } catch (error) {
    return taskApiError(error, "Unable to list queued tasks");
  }
}
