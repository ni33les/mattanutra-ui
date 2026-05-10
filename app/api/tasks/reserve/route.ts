import {
  objectValue,
  openClawJson,
  readJsonObject,
  requireOpenClawRequest,
  taskApiError,
  textValue
} from "@/lib/openclaw-api";
import { getTaskBundle, reserveNextTask } from "@/lib/task-service";
import type { AgentType } from "@/lib/task-service";

export const runtime = "nodejs";

function agentType(value: unknown): AgentType {
  const text = textValue(value);

  return text === "ai" ||
    text === "deterministic" ||
    text === "human" ||
    text === "system"
    ? text
    : "external";
}

export async function POST(request: Request) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const body = await readJsonObject(request);
  const agent = objectValue(body.agent);

  try {
    const reserved = await reserveNextTask({
      agent: {
        capabilities: agent.capabilities,
        id: textValue(agent.id),
        metadata: objectValue(agent.metadata),
        model: textValue(agent.model),
        name: textValue(agent.name) ?? "Unnamed OpenClaw agent",
        type: agentType(agent.type)
      },
      leaseSeconds: body.leaseSeconds
    });

    if (!reserved) {
      return openClawJson({ task: null });
    }

    const bundle = await getTaskBundle({ taskId: reserved.task.id });

    return openClawJson({
      agent: reserved.agent,
      comments: bundle.comments,
      dependencies: bundle.dependencies,
      ray: bundle.ray,
      reservationId: reserved.reservationId,
      task: bundle.task
    });
  } catch (error) {
    return taskApiError(error, "Unable to reserve task");
  }
}
