import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import {
  assertActiveTaskReservation,
  spawnChildTask,
  type TaskActorType,
  type TaskDependencyType,
  type TaskReasoningEffort
} from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

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
      { message: "reservationId is required to spawn a child task" },
      { status: 400 }
    );
  }

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to spawn a child task" },
      { status: 400 }
    );
  }

  try {
    const agentId =
      access.principal?.agentId ?? textValue(body.createdByAgentId);

    await assertActiveTaskReservation({
      accessScope: access.scope,
      agentId,
      reservationId,
      taskId: id,
      workerSessionId
    });

    const created = await spawnChildTask({
      accessScope: access.scope,
      actorType: actorType(body.actorType),
      createdByAgentId: agentId,
      dependencies: dependencies(body.dependencies),
      description: textValue(body.description),
      businessValue: body.businessValue,
      context: objectValue(body.context),
      id: textValue(body.id),
      idempotencyKey: textValue(body.idempotencyKey),
      idempotencyScopeKey: textValue(body.idempotencyScopeKey),
      initialComment: undefined,
      maxAttempts: Number(body.maxAttempts),
      parentTaskId: id,
      payload: objectValue(body.payload),
      planId: textValue(body.planId),
      rayId: textValue(body.rayId),
      reasoningEffort: reasoningEffort(body.reasoningEffort),
      requiredCapabilities: body.requiredCapabilities,
      scheduledFor: textValue(body.scheduledFor),
      taskGroupId: textValue(body.taskGroupId),
      groupLabel: textValue(body.groupLabel),
      taskType: textValue(body.taskType) ?? "child_task",
      title: textValue(body.title) ?? "Child task"
    });

    return openClawJson(created, { status: created.created ? 201 : 200 });
  } catch (error) {
    return taskApiError(error, "Unable to spawn child task");
  }
}
