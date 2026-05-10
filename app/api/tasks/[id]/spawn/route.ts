import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import {
  spawnChildTask,
  type TaskActorType,
  type TaskDependencyType,
  type TaskReasoningEffort
} from "@/lib/task-service";

export const runtime = "nodejs";

type SpawnTaskRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function actorType(value: unknown): TaskActorType {
  const text = textValue(value);

  return text === "ai" ||
    text === "deterministic" ||
    text === "external" ||
    text === "human" ||
    text === "worker"
    ? text
    : "system";
}

function reasoningEffort(value: unknown): TaskReasoningEffort {
  const text = textValue(value);

  return text === "low" ||
    text === "medium" ||
    text === "high" ||
    text === "xhigh"
    ? text
    : "none";
}

function dependencyType(value: unknown): TaskDependencyType {
  const text = textValue(value);

  return text === "approved" || text === "successful" ? text : "complete";
}

function dependencies(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => objectValue(item))
    .map((item) => ({
      taskId: textValue(item.taskId) ?? "",
      type: dependencyType(item.type)
    }))
    .filter((item) => item.taskId);
}

export async function POST(request: Request, { params }: SpawnTaskRouteProps) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);

  try {
    const created = await spawnChildTask({
      actorType: actorType(body.actorType),
      createdByAgentId: textValue(body.createdByAgentId),
      dependencies: dependencies(body.dependencies),
      description: textValue(body.description),
      id: textValue(body.id),
      idempotencyKey: textValue(body.idempotencyKey),
      initialComment: undefined,
      maxAttempts: Number(body.maxAttempts),
      parentTaskId: id,
      payload: objectValue(body.payload),
      planId: textValue(body.planId),
      priority: body.priority,
      reasoningEffort: reasoningEffort(body.reasoningEffort),
      requiredCapabilities: body.requiredCapabilities,
      scheduledFor: textValue(body.scheduledFor),
      taskType: textValue(body.taskType) ?? "child_task",
      title: textValue(body.title) ?? "Child task"
    });

    return openClawJson(created, { status: created.created ? 201 : 200 });
  } catch (error) {
    return taskApiError(error, "Unable to spawn child task");
  }
}
