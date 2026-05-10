import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { addTaskComment } from "@/lib/task-service";

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
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const body = await readJsonObject(request);

  try {
    const comment = await addTaskComment({
      agentId: textValue(body.agentId),
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
