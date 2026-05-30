import { randomUUID } from "node:crypto";
import { isAgentRole } from "@/lib/admin-rbac";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import {
  normalizeCapabilities,
  normalizeTaskBusinessValue,
  normalizeTaskRetryPolicy,
  type NormalizedTaskRetryPolicy,
  type TaskRetryPolicyInput
} from "@/lib/task-service-utils";
import type {
  AgentRow,
  CommentRow,
  DependencyRow,
  TaskAgent,
  TaskComment,
  TaskDependency,
  TaskRecord,
  TaskRow,
  WorkerSession,
  WorkerSessionRow,
  WorkerSessionStatus
} from "@/lib/task-service-types";

export function uuidOrNull(value: unknown) {
  return typeof value === "string" && isUuid(value) ? value : null;
}

export function uuidOrNew(value: unknown) {
  return uuidOrNull(value) ?? randomUUID();
}

export function cleanText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : fallback;
}

export function errorMessage(error: unknown, fallback = "Task side effect failed.") {
  return error instanceof Error ? error.message : fallback;
}

export function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

export function workerSessionStatus(value: unknown): WorkerSessionStatus {
  return value === "idle" ||
    value === "offline" ||
    value === "polling" ||
    value === "working"
    ? value
    : "idle";
}

export function isoDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function positiveInteger(value: unknown, fallback: number) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : fallback;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(1, Math.round(numeric));
}

export function nonNegativeInteger(value: unknown, fallback: number) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : fallback;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.round(numeric));
}

export function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

export function retryPolicyForTask(
  task: Pick<TaskRecord, "maxRetries" | "retryPolicy">
) {
  return {
    backoffMultiplier: task.retryPolicy?.backoffMultiplier ?? 2,
    initialDelaySeconds: task.retryPolicy?.initialDelaySeconds ?? 300,
    maxDelaySeconds: task.retryPolicy?.maxDelaySeconds ?? 3_600,
    maxRetries: task.maxRetries
  };
}

export function taskLineageRootId(
  task: Pick<TaskRecord, "id" | "retryRootTaskId">
) {
  return task.retryRootTaskId ?? task.id;
}

export function taskRetryWillBeScheduled(task: TaskRecord) {
  return Boolean(task.idempotencyKey) && task.retryAttempt < task.maxRetries;
}

export function normalizedRetryPolicyJson(
  policy: NormalizedTaskRetryPolicy | null
) {
  return policy ? toJsonValue(policy) : {};
}

export function mapAgent(row: AgentRow): TaskAgent {
  return {
    capabilities: normalizeCapabilities(row.capabilities),
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    endpointUrl: row.endpoint_url,
    id: row.id,
    lastSeenAt: isoDate(row.last_seen_at),
    metadata: row.metadata,
    model: row.model,
    name: row.name,
    organisationId: row.organisation_id,
    personId: row.person_id,
    role: isAgentRole(row.role) ? row.role : "platform_agent",
    status: row.status,
    type: row.agent_type,
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString()
  };
}

export function mapWorkerSession(row: WorkerSessionRow): WorkerSession {
  return {
    agentId: row.agent_id,
    capabilities: normalizeCapabilities(row.capabilities),
    concurrency: Math.max(1, Math.round(Number(row.concurrency) || 1)),
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    currentTaskId: row.current_task_id,
    id: row.id,
    instanceId: row.instance_id,
    lastSeenAt: isoDate(row.last_seen_at),
    membershipId: row.membership_id ?? "",
    metadata: row.metadata,
    status: row.status,
    taskTypes: normalizeCapabilities(row.task_types),
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString(),
    workerVersion: row.worker_version
  };
}

export function intersectCapabilities(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right);

  return left.filter((item) => rightSet.has(item));
}

export function mapTask(row: TaskRow): TaskRecord {
  const retryPolicy = normalizeTaskRetryPolicy(
    payloadRecord(row.retry_policy) as TaskRetryPolicyInput
  );

  return {
    actorType: row.actor_type,
    attempts: row.attempts,
    businessValue: normalizeTaskBusinessValue(row.business_value),
    completedAt: isoDate(row.completed_at),
    context: row.context,
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    createdByAgentId: row.created_by_agent_id,
    createdByTaskId: row.created_by_task_id,
    description: row.description,
    errorMessage: row.error_message,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    idempotencyScopeKey: row.idempotency_scope_key,
    leaseUntil: isoDate(row.lease_until),
    maxAttempts: row.max_attempts,
    maxRetries: row.max_retries,
    organisationId: row.organisation_id,
    parentTaskId: row.parent_task_id,
    payload: row.payload,
    planId: row.plan_id,
    rayId: row.ray_id,
    reasoningEffort: row.reasoning_effort,
    requiredCapabilities: normalizeCapabilities(row.required_capabilities),
    reservedByAgentId: row.reserved_by_agent_id,
    resultPayload: row.result_payload,
    retryAttempt: row.retry_attempt,
    retryOfTaskId: row.retry_of_task_id,
    retryPolicy,
    retryRootTaskId: row.retry_root_task_id,
    scheduledFor: isoDate(row.scheduled_for) ?? new Date().toISOString(),
    startedAt: isoDate(row.started_at),
    status: row.status,
    taskGroupId: row.task_group_id,
    taskType: row.task_type,
    title: row.title,
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString(),
    groupLabel: row.group_label
  };
}

export function mapComment(row: CommentRow): TaskComment {
  return {
    agentId: row.agent_id,
    authorName: row.author_name,
    authorType: row.author_type,
    body: row.body,
    commentType: row.comment_type,
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    id: row.id,
    metadata: row.metadata,
    taskId: row.task_id,
    visibility: row.visibility
  };
}

export function mapDependency(row: DependencyRow): TaskDependency {
  return {
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    dependencyType: row.dependency_type,
    dependsOnTaskId: row.depends_on_task_id,
    taskId: row.task_id
  };
}
