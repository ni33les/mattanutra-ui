import {
  objectValue,
  openClawJson,
  readJsonObject,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { addTaskComment, assertActiveTaskReservation } from "@/lib/task-service";
import { requireWorkerAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

type TaskCommentRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function commentType(value: unknown) {
  const text = textValue(value);

  return text === "answer" ||
    text === "decision" ||
    text === "instruction" ||
    text === "question" ||
    text === "status" ||
    text === "system"
    ? text
    : "note";
}

function visibility(value: unknown) {
  const text = textValue(value);

  return text === "admin" || text === "customer" || text === "worker"
    ? text
    : "internal";
}

function authorType(value: unknown) {
  const text = textValue(value);

  return text === "ai" ||
    text === "deterministic" ||
    text === "external" ||
    text === "human" ||
    text === "worker"
    ? text
    : "system";
}

export async function POST(
  request: Request,
  { params }: TaskCommentRouteProps
) {
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
      { message: "reservationId is required to comment on a task" },
      { status: 400 }
    );
  }

  if (!workerSessionId) {
    return openClawJson(
      { message: "workerSessionId is required to comment on a task" },
      { status: 400 }
    );
  }

  try {
    const agentId = access.principal?.agentId ?? textValue(body.agentId);

    await assertActiveTaskReservation({
      accessScope: access.scope,
      agentId,
      reservationId,
      taskId: id,
      workerSessionId
    });

    const comment = await addTaskComment({
      agentId,
      authorName: textValue(body.authorName),
      authorType: authorType(body.authorType),
      body: textValue(body.body) ?? "",
      commentType: commentType(body.commentType),
      metadata: objectValue(body.metadata),
      taskId: id,
      visibility: visibility(body.visibility)
    });

    return openClawJson({ comment }, { status: 201 });
  } catch (error) {
    return taskApiError(error, "Unable to add task comment");
  }
}
