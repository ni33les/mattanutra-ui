import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  buildTaskSequenceDependencyPlan,
  normalizeCapabilities,
  normalizeLeaseSeconds,
  normalizeTaskDependencyType,
  normalizeTaskPriority,
  TASK_PRIORITY,
  type TaskDependencyType,
  type TaskPriority
} from "@/lib/task-service-utils";

export type AgentType =
  | "ai"
  | "deterministic"
  | "external"
  | "human"
  | "system";

export type AgentStatus = "active" | "offline" | "paused" | "retired";

export type GoalStatus =
  | "active"
  | "blocked"
  | "cancelled"
  | "completed"
  | "failed"
  | "open";

export type GoalType = "goal" | "journey" | "system" | "task_run";

export type TaskActorType =
  | "ai"
  | "deterministic"
  | "external"
  | "human"
  | "system"
  | "worker";

export type TaskStatus =
  | "blocked"
  | "cancelled"
  | "completed"
  | "failed"
  | "needs_review"
  | "queued"
  | "reserved"
  | "running"
  | "skipped"
  | "waiting_approval";

export type TaskReasoningEffort =
  | "high"
  | "low"
  | "medium"
  | "none"
  | "xhigh";

export type TaskEventSeverity = "critical" | "high" | "low" | "medium";

export type TaskEventStatus =
  | "accepted"
  | "failed"
  | "observed"
  | "rejected"
  | "requested"
  | "succeeded";

export type TaskCommentType =
  | "answer"
  | "decision"
  | "instruction"
  | "note"
  | "question"
  | "status"
  | "system";

export type TaskCommentVisibility =
  | "admin"
  | "customer"
  | "internal"
  | "worker";

export type TaskAgent = Readonly<{
  capabilities: string[];
  createdAt: string;
  endpointUrl: string | null;
  id: string;
  lastSeenAt: string | null;
  metadata: unknown;
  model: string | null;
  name: string;
  status: AgentStatus;
  type: AgentType;
  updatedAt: string;
}>;

export type TaskGoal = Readonly<{
  completedAt: string | null;
  context: unknown;
  createdAt: string;
  createdByAgentId: string | null;
  emailHash: string | null;
  id: string;
  planId: string | null;
  priority: TaskPriority;
  ray: string | null;
  source: string | null;
  status: GoalStatus;
  title: string;
  type: GoalType;
  updatedAt: string;
}>;

export type TaskRecord = Readonly<{
  actorType: TaskActorType;
  attempts: number;
  completedAt: string | null;
  createdAt: string;
  createdByAgentId: string | null;
  createdByTaskId: string | null;
  description: string | null;
  errorMessage: string | null;
  id: string;
  idempotencyKey: string | null;
  leaseUntil: string | null;
  maxAttempts: number;
  parentTaskId: string | null;
  payload: unknown;
  planId: string | null;
  priority: TaskPriority;
  goalId: string;
  reasoningEffort: TaskReasoningEffort;
  requiredCapabilities: string[];
  reservedByAgentId: string | null;
  resultPayload: unknown;
  scheduledFor: string;
  startedAt: string | null;
  status: TaskStatus;
  taskType: string;
  title: string;
  updatedAt: string;
}>;

export type TaskComment = Readonly<{
  agentId: string | null;
  authorName: string | null;
  authorType: TaskActorType;
  body: string;
  commentType: TaskCommentType;
  createdAt: string;
  id: string;
  metadata: unknown;
  goalId: string;
  taskId: string;
  visibility: TaskCommentVisibility;
}>;

export type TaskDependency = Readonly<{
  createdAt: string;
  dependencyType: TaskDependencyType;
  dependsOnTaskId: string;
  taskId: string;
}>;

export type TaskBundle = Readonly<{
  comments: TaskComment[];
  dependencies: TaskDependency[];
  goal: TaskGoal;
  task: TaskRecord;
}>;

export type ReservedTask = Readonly<{
  agent: TaskAgent;
  comments: TaskComment[];
  reservationId: string;
  task: TaskRecord;
}>;

type Db = postgres.Sql | postgres.TransactionSql;

type AgentRow = {
  capabilities: string[];
  created_at: Date | string;
  endpoint_url: string | null;
  id: string;
  last_seen_at: Date | string | null;
  metadata: unknown;
  model: string | null;
  name: string;
  status: AgentStatus;
  agent_type: AgentType;
  updated_at: Date | string;
};

type GoalRow = {
  completed_at: Date | string | null;
  context: unknown;
  created_at: Date | string;
  created_by_agent_id: string | null;
  email_hash: string | null;
  id: string;
  plan_id: string | null;
  priority: number;
  ray: string | null;
  goal_type: GoalType;
  source: string | null;
  status: GoalStatus;
  title: string;
  updated_at: Date | string;
};

type TaskRow = {
  actor_type: TaskActorType;
  attempts: number;
  completed_at: Date | string | null;
  created_at: Date | string;
  created_by_agent_id: string | null;
  created_by_task_id: string | null;
  description: string | null;
  error_message: string | null;
  id: string;
  idempotency_key: string | null;
  lease_until: Date | string | null;
  max_attempts: number;
  parent_task_id: string | null;
  payload: unknown;
  plan_id: string | null;
  priority: number;
  goal_id: string;
  reasoning_effort: TaskReasoningEffort;
  required_capabilities: string[];
  reserved_by_agent_id: string | null;
  result_payload: unknown;
  scheduled_for: Date | string;
  started_at: Date | string | null;
  status: TaskStatus;
  task_type: string;
  title: string;
  updated_at: Date | string;
};

type CommentRow = {
  agent_id: string | null;
  author_name: string | null;
  author_type: TaskActorType;
  body: string;
  comment_type: TaskCommentType;
  created_at: Date | string;
  id: string;
  metadata: unknown;
  goal_id: string;
  task_id: string;
  visibility: TaskCommentVisibility;
};

type DependencyRow = {
  created_at: Date | string;
  dependency_type: TaskDependencyType;
  depends_on_task_id: string;
  task_id: string;
};

type ExpiredReservationRow = {
  agent_id: string;
  attempts: number;
  max_attempts: number;
  goal_id: string;
  reservation_id: string;
  task_id: string;
};

export type CreateGoalInput = Readonly<{
  context?: Record<string, unknown>;
  createdByAgentId?: string | null;
  emailHash?: string | null;
  id?: string | null;
  planId?: string | null;
  priority?: unknown;
  ray?: string | null;
  source?: string | null;
  status?: GoalStatus;
  title: string;
  type?: GoalType;
}>;

export type CreateTaskInput = Readonly<{
  actorType?: TaskActorType;
  createdByAgentId?: string | null;
  createdByTaskId?: string | null;
  dependencies?: ReadonlyArray<{
    taskId: string;
    type?: TaskDependencyType;
  }>;
  description?: string | null;
  id?: string | null;
  idempotencyKey?: string | null;
  initialComment?: Omit<AddTaskCommentInput, "taskId">;
  maxAttempts?: number;
  parentTaskId?: string | null;
  payload?: Record<string, unknown>;
  planId?: string | null;
  priority?: unknown;
  goalId: string;
  reasoningEffort?: TaskReasoningEffort;
  requiredCapabilities?: unknown;
  scheduledFor?: Date | string | null;
  taskType: string;
  title: string;
}>;

export type AddTaskCommentInput = Readonly<{
  agentId?: string | null;
  authorName?: string | null;
  authorType?: TaskActorType;
  body: string;
  commentType?: TaskCommentType;
  metadata?: Record<string, unknown>;
  taskId: string;
  visibility?: TaskCommentVisibility;
}>;

export type AddTaskEventInput = Readonly<{
  agentId?: string | null;
  eventPayload?: Record<string, unknown>;
  eventStatus?: TaskEventStatus;
  eventType: string;
  goalId?: string | null;
  severity?: TaskEventSeverity;
  taskId?: string | null;
}>;

export type ReserveNextTaskInput = Readonly<{
  agent: Readonly<{
    capabilities?: unknown;
    id?: string | null;
    metadata?: Record<string, unknown>;
    model?: string | null;
    name: string;
    type?: AgentType;
  }>;
  leaseSeconds?: unknown;
  mustRequireCapability?: string | null;
  taskTypes?: unknown;
}>;

export type CompleteTaskInput = Readonly<{
  agentId?: string | null;
  reservationId?: string | null;
  resultPayload?: Record<string, unknown>;
  taskId: string;
}>;

export type FailTaskInput = Readonly<{
  agentId?: string | null;
  errorMessage: string;
  reservationId?: string | null;
  resultPayload?: Record<string, unknown>;
  taskId: string;
}>;

export type RenewTaskLeaseInput = Readonly<{
  agentId?: string | null;
  leaseSeconds?: unknown;
  reservationId?: string | null;
  taskId: string;
}>;

export type SpawnChildTaskInput = Omit<CreateTaskInput, "createdByTaskId" | "parentTaskId" | "goalId"> &
  Readonly<{
    parentTaskId: string;
  }>;

export type TaskSequenceDependencyInput = Readonly<{
  key?: string | null;
  taskId?: string | null;
  type?: TaskDependencyType;
}>;

export type TaskSequenceTaskInput = Omit<CreateTaskInput, "dependencies" | "goalId"> &
  Readonly<{
    dependsOn?: ReadonlyArray<TaskSequenceDependencyInput>;
    key?: string | null;
  }>;

export type TaskSequenceStageInput = Readonly<{
  dependencyType?: TaskDependencyType;
  dependsOnPreviousStage?: boolean;
  tasks: ReadonlyArray<TaskSequenceTaskInput>;
}>;

export type CreateTaskSequenceInput = Readonly<{
  createdByAgentId?: string | null;
  goalId: string;
  sequenceKey?: string | null;
  stages: ReadonlyArray<TaskSequenceStageInput>;
}>;

export type CreatedTaskSequence = Readonly<{
  dependencies: TaskDependency[];
  tasks: TaskRecord[];
}>;

function getRequiredSql(sql?: postgres.Sql) {
  const configured = sql ?? getSql();

  if (!configured) {
    throw new Error("Database connection is not configured");
  }

  return configured;
}

function uuidOrNull(value: unknown) {
  return typeof value === "string" && isUuid(value) ? value : null;
}

function uuidOrNew(value: unknown) {
  return uuidOrNull(value) ?? randomUUID();
}

function cleanText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : fallback;
}

function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function isoDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function positiveInteger(value: unknown, fallback: number) {
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

function mapAgent(row: AgentRow): TaskAgent {
  return {
    capabilities: normalizeCapabilities(row.capabilities),
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    endpointUrl: row.endpoint_url,
    id: row.id,
    lastSeenAt: isoDate(row.last_seen_at),
    metadata: row.metadata,
    model: row.model,
    name: row.name,
    status: row.status,
    type: row.agent_type,
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString()
  };
}

function mapGoal(row: GoalRow): TaskGoal {
  return {
    completedAt: isoDate(row.completed_at),
    context: row.context,
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    createdByAgentId: row.created_by_agent_id,
    emailHash: row.email_hash,
    id: row.id,
    planId: row.plan_id,
    priority: normalizeTaskPriority(row.priority),
    ray: row.ray,
    source: row.source,
    status: row.status,
    title: row.title,
    type: row.goal_type,
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString()
  };
}

function mapTask(row: TaskRow): TaskRecord {
  return {
    actorType: row.actor_type,
    attempts: row.attempts,
    completedAt: isoDate(row.completed_at),
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    createdByAgentId: row.created_by_agent_id,
    createdByTaskId: row.created_by_task_id,
    description: row.description,
    errorMessage: row.error_message,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    leaseUntil: isoDate(row.lease_until),
    maxAttempts: row.max_attempts,
    parentTaskId: row.parent_task_id,
    payload: row.payload,
    planId: row.plan_id,
    priority: normalizeTaskPriority(row.priority),
    goalId: row.goal_id,
    reasoningEffort: row.reasoning_effort,
    requiredCapabilities: normalizeCapabilities(row.required_capabilities),
    reservedByAgentId: row.reserved_by_agent_id,
    resultPayload: row.result_payload,
    scheduledFor: isoDate(row.scheduled_for) ?? new Date().toISOString(),
    startedAt: isoDate(row.started_at),
    status: row.status,
    taskType: row.task_type,
    title: row.title,
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString()
  };
}

function mapComment(row: CommentRow): TaskComment {
  return {
    agentId: row.agent_id,
    authorName: row.author_name,
    authorType: row.author_type,
    body: row.body,
    commentType: row.comment_type,
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    id: row.id,
    metadata: row.metadata,
    goalId: row.goal_id,
    taskId: row.task_id,
    visibility: row.visibility
  };
}

function mapDependency(row: DependencyRow): TaskDependency {
  return {
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    dependencyType: row.dependency_type,
    dependsOnTaskId: row.depends_on_task_id,
    taskId: row.task_id
  };
}

async function taskGoalId(sql: Db, taskId: string) {
  const rows = await sql<{ goal_id: string }[]>`
    select goal_id::text
    from public.tasks
    where id = ${taskId}::uuid
    limit 1
  `;

  if (!rows[0]) {
    throw new Error(`Task ${taskId} not found`);
  }

  return rows[0].goal_id;
}

async function addTaskEventInTransaction(sql: Db, input: AddTaskEventInput) {
  const taskId = uuidOrNull(input.taskId);
  const goalId = uuidOrNull(input.goalId) ?? (taskId ? await taskGoalId(sql, taskId) : null);

  if (!goalId) {
    throw new Error("Task event requires a goalId or valid taskId");
  }

  const id = randomUUID();

  await sql`
    insert into public.task_events (
      id,
      task_id,
      goal_id,
      agent_id,
      event_type,
      event_status,
      severity,
      event_payload,
      occurred_at,
      created_at
    )
    values (
      ${id}::uuid,
      ${taskId}::uuid,
      ${goalId}::uuid,
      ${uuidOrNull(input.agentId)}::uuid,
      ${cleanText(input.eventType, "unknown")},
      ${input.eventStatus ?? "observed"},
      ${input.severity ?? "low"},
      ${sql.json(toJsonValue(input.eventPayload ?? {}))},
      now(),
      now()
    )
  `;

  return id;
}

async function refreshGoalStateInTransaction(sql: Db, goalId: string) {
  const rows = await sql<
    Array<{
      active_count: number | string;
      failed_count: number | string;
      task_count: number | string;
    }>
  >`
    select
      count(*)::int as task_count,
      count(*) filter (
        where status in (
          'queued',
          'reserved',
          'running',
          'blocked',
          'needs_review',
          'waiting_approval'
        )
      )::int as active_count,
      count(*) filter (where status = 'failed')::int as failed_count
    from public.tasks
    where goal_id = ${goalId}::uuid
  `;
  const counts = rows[0];

  if (!counts || Number(counts.task_count) < 1) {
    return;
  }

  const activeCount = Number(counts.active_count);
  const failedCount = Number(counts.failed_count);
  const status =
    activeCount > 0 ? "active" : failedCount > 0 ? "failed" : "completed";

  await sql`
    update public.goals
    set
      status = ${status},
      completed_at = case
        when ${status} = 'completed' then coalesce(completed_at, now())
        else null
      end,
      updated_at = now()
    where id = ${goalId}::uuid
      and status <> 'cancelled'
  `;
}

async function activeReservationInTransaction(
  sql: Db,
  input: Readonly<{
    agentId?: string | null;
    reservationId?: string | null;
    taskId: string;
  }>
) {
  const agentId = uuidOrNull(input.agentId);
  const reservationId = uuidOrNull(input.reservationId);

  if (input.agentId && !agentId) {
    throw new Error("Task reservation check requires a valid agentId");
  }

  if (input.reservationId && !reservationId) {
    throw new Error("Task reservation check requires a valid reservationId");
  }

  if (!agentId && !reservationId) {
    return null;
  }

  const rows = await sql<
    Array<{
      agent_id: string;
      id: string;
    }>
  >`
    select id::text, agent_id::text
    from public.task_reservations
    where task_id = ${input.taskId}::uuid
      and status = 'active'
      and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
      and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
    order by reserved_at desc
    limit 1
    for update
  `;

  if (!rows[0]) {
    throw new Error(`Active reservation for task ${input.taskId} not found`);
  }

  return rows[0];
}

async function upsertAgentInTransaction(
  sql: Db,
  input: Readonly<{
    capabilities?: unknown;
    id?: string | null;
    metadata?: Record<string, unknown>;
    model?: string | null;
    name: string;
    status?: AgentStatus;
    type?: AgentType;
  }>
) {
  const name = cleanText(input.name, "Unnamed agent");
  const hasCapabilitiesInput = Array.isArray(input.capabilities);
  const capabilities = normalizeCapabilities(input.capabilities);
  const existing = await sql<AgentRow[]>`
    select *
    from public.agents
    where lower(name) = lower(${name})
    limit 1
  `;

  if (existing[0]) {
    const rows = await sql<AgentRow[]>`
      update public.agents set
        agent_type = ${input.type ?? existing[0].agent_type},
        status = ${input.status ?? existing[0].status},
        capabilities = ${hasCapabilitiesInput ? capabilities : existing[0].capabilities},
        model = coalesce(${optionalText(input.model)}, model),
        metadata = metadata || ${sql.json(toJsonValue(input.metadata ?? {}))},
        last_seen_at = now(),
        updated_at = now()
      where id = ${existing[0].id}::uuid
      returning *
    `;

    return mapAgent(rows[0]);
  }

  const rows = await sql<AgentRow[]>`
    insert into public.agents (
      id,
      name,
      agent_type,
      status,
      capabilities,
      model,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      ${uuidOrNew(input.id)}::uuid,
      ${name},
      ${input.type ?? "system"},
      ${input.status ?? "active"},
      ${capabilities},
      ${optionalText(input.model)},
      ${sql.json(toJsonValue(input.metadata ?? {}))},
      now(),
      now(),
      now()
    )
    returning *
  `;

  return mapAgent(rows[0]);
}

async function createGoalInTransaction(sql: Db, input: CreateGoalInput) {
  const goalId = uuidOrNew(input.id);
  const ray = uuidOrNull(input.ray) ?? goalId;
  const rows = await sql<GoalRow[]>`
    insert into public.goals (
      id,
      ray,
      goal_type,
      title,
      status,
      priority,
      plan_id,
      email_hash,
      source,
      context,
      created_by_agent_id,
      created_at,
      updated_at
    )
    values (
      ${goalId}::uuid,
      ${ray}::uuid,
      ${input.type ?? "goal"},
      ${cleanText(input.title, "Untitled goal")},
      ${input.status ?? "open"},
      ${normalizeTaskPriority(input.priority)},
      ${uuidOrNull(input.planId)}::uuid,
      ${optionalText(input.emailHash)},
      ${optionalText(input.source)},
      ${sql.json(toJsonValue(input.context ?? {}))},
      ${uuidOrNull(input.createdByAgentId)}::uuid,
      now(),
      now()
    )
    on conflict (id) do update set
      ray = coalesce(public.goals.ray, excluded.ray),
      plan_id = coalesce(public.goals.plan_id, excluded.plan_id),
      email_hash = coalesce(public.goals.email_hash, excluded.email_hash),
      source = coalesce(public.goals.source, excluded.source),
      context = public.goals.context || excluded.context,
      priority = greatest(public.goals.priority, excluded.priority),
      updated_at = now()
    returning *
  `;

  return mapGoal(rows[0]);
}

async function addTaskCommentInTransaction(
  sql: Db,
  input: AddTaskCommentInput
) {
  const taskId = uuidOrNull(input.taskId);

  if (!taskId) {
    throw new Error("Task comment requires a valid taskId");
  }

  const goalId = await taskGoalId(sql, taskId);
  const id = randomUUID();
  const rows = await sql<CommentRow[]>`
    insert into public.task_comments (
      id,
      task_id,
      goal_id,
      agent_id,
      author_type,
      author_name,
      visibility,
      comment_type,
      body,
      metadata,
      created_at
    )
    values (
      ${id}::uuid,
      ${taskId}::uuid,
      ${goalId}::uuid,
      ${uuidOrNull(input.agentId)}::uuid,
      ${input.authorType ?? "system"},
      ${optionalText(input.authorName)},
      ${input.visibility ?? "internal"},
      ${input.commentType ?? "note"},
      ${cleanText(input.body, "")},
      ${sql.json(toJsonValue(input.metadata ?? {}))},
      now()
    )
    returning *
  `;

  await addTaskEventInTransaction(sql, {
    agentId: input.agentId,
    eventPayload: {
      commentId: id,
      commentType: input.commentType ?? "note",
      visibility: input.visibility ?? "internal"
    },
    eventType: "comment_added",
    goalId,
    taskId
  });

  return mapComment(rows[0]);
}

async function ensureTaskDependenciesInTransaction(
  sql: Db,
  taskId: string,
  dependencies: ReadonlyArray<{
    taskId: string;
    type?: TaskDependencyType;
  }>
) {
  const taskUuid = uuidOrNull(taskId);

  if (!taskUuid || dependencies.length < 1) {
    return [];
  }

  const saved: TaskDependency[] = [];
  const seen = new Set<string>();

  for (const dependency of dependencies) {
    const dependsOnTaskId = uuidOrNull(dependency.taskId);
    const dependencyType = normalizeTaskDependencyType(dependency.type);

    if (!dependsOnTaskId) {
      continue;
    }

    if (dependsOnTaskId === taskUuid) {
      throw new Error("Task cannot depend on itself");
    }

    const key = `${dependsOnTaskId}:${dependencyType}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const rows = await sql<DependencyRow[]>`
      insert into public.task_dependencies (
        task_id,
        depends_on_task_id,
        dependency_type,
        created_at
      )
      values (
        ${taskUuid}::uuid,
        ${dependsOnTaskId}::uuid,
        ${dependencyType},
        now()
      )
      on conflict (task_id, depends_on_task_id) do update set
        dependency_type = excluded.dependency_type
      returning
        task_id::text,
        depends_on_task_id::text,
        dependency_type,
        created_at
    `;

    if (rows[0]) {
      saved.push(mapDependency(rows[0]));
    }
  }

  return saved;
}

async function createTaskInTransaction(sql: Db, input: CreateTaskInput) {
  const goalId = uuidOrNull(input.goalId);

  if (!goalId) {
    throw new Error("Task requires a valid goalId");
  }

  const idempotencyKey = optionalText(input.idempotencyKey);

  if (idempotencyKey) {
    const existing = await sql<TaskRow[]>`
      select *
      from public.tasks
      where goal_id = ${goalId}::uuid
        and idempotency_key = ${idempotencyKey}
        and status not in ('completed', 'failed', 'cancelled', 'skipped')
      order by created_at desc
      limit 1
    `;

    if (existing[0]) {
      return { created: false, task: mapTask(existing[0]) };
    }
  }

  const goals = await sql<Array<{ priority: number | string }>>`
    select priority
    from public.goals
    where id = ${goalId}::uuid
    limit 1
  `;
  const goalPriority = normalizeTaskPriority(goals[0]?.priority);
  const hasExplicitPriority =
    input.priority !== undefined &&
    input.priority !== null &&
    !(typeof input.priority === "string" && input.priority.trim() === "");
  const taskPriority = hasExplicitPriority
    ? normalizeTaskPriority(input.priority)
    : goalPriority;

  if (!goals[0]) {
    throw new Error(`Goal ${goalId} not found`);
  }

  const inserted = await sql<TaskRow[]>`
    insert into public.tasks (
      id,
      goal_id,
      parent_task_id,
      plan_id,
      task_type,
      title,
      description,
      actor_type,
      status,
      priority,
      required_capabilities,
      reasoning_effort,
      payload,
      result_payload,
      idempotency_key,
      scheduled_for,
      attempts,
      max_attempts,
      created_by_agent_id,
      created_by_task_id,
      created_at,
      updated_at
    )
    values (
      ${uuidOrNew(input.id)}::uuid,
      ${goalId}::uuid,
      ${uuidOrNull(input.parentTaskId)}::uuid,
      ${uuidOrNull(input.planId)}::uuid,
      ${cleanText(input.taskType, "unknown")},
      ${cleanText(input.title, "Untitled task")},
      ${optionalText(input.description)},
      ${input.actorType ?? "system"},
      'queued',
      ${taskPriority},
      ${normalizeCapabilities(input.requiredCapabilities)},
      ${input.reasoningEffort ?? "none"},
      ${sql.json(toJsonValue(input.payload ?? {}))},
      '{}'::jsonb,
      ${idempotencyKey},
      ${input.scheduledFor ? new Date(input.scheduledFor) : new Date()},
      0,
      ${positiveInteger(input.maxAttempts, 3)},
      ${uuidOrNull(input.createdByAgentId)}::uuid,
      ${uuidOrNull(input.createdByTaskId)}::uuid,
      now(),
      now()
    )
    on conflict do nothing
    returning *
  `;

  const taskRow =
    inserted[0] ??
    (
      await sql<TaskRow[]>`
        select *
        from public.tasks
        where goal_id = ${goalId}::uuid
          and idempotency_key = ${idempotencyKey}
          and status not in ('completed', 'failed', 'cancelled', 'skipped')
        order by created_at desc
        limit 1
      `
    )[0];

  if (!taskRow) {
    throw new Error("Unable to create or locate task");
  }

  const task = mapTask(taskRow);

  if (!inserted[0]) {
    await ensureTaskDependenciesInTransaction(sql, task.id, input.dependencies ?? []);

    return { created: false, task };
  }

  await ensureTaskDependenciesInTransaction(sql, task.id, input.dependencies ?? []);

  await addTaskEventInTransaction(sql, {
    agentId: input.createdByAgentId,
    eventPayload: {
      goalPriority,
      idempotencyKey,
      priority: task.priority,
      prioritySource: hasExplicitPriority ? "explicit" : "goal",
      requiredCapabilities: task.requiredCapabilities
    },
    eventType: "task_created",
    goalId,
    taskId: task.id
  });

  if (hasExplicitPriority && task.priority !== goalPriority) {
    await addTaskEventInTransaction(sql, {
      agentId: input.createdByAgentId,
      eventPayload: {
        goalPriority,
        requestedPriority: input.priority,
        taskPriority: task.priority
      },
      eventStatus: "observed",
      eventType: "task_priority_overridden",
      goalId,
      severity: "low",
      taskId: task.id
    });
  }

  if (input.initialComment) {
    await addTaskCommentInTransaction(sql, {
      ...input.initialComment,
      taskId: task.id
    });
  }

  return { created: true, task };
}

export async function upsertAgent(input: Parameters<typeof upsertAgentInTransaction>[1]) {
  const sql = getRequiredSql();

  return sql.begin((tx) => upsertAgentInTransaction(tx, input));
}

export async function createGoal(input: CreateGoalInput) {
  const sql = getRequiredSql();

  return sql.begin((tx) => createGoalInTransaction(tx, input));
}

export async function createTask(input: CreateTaskInput) {
  const sql = getRequiredSql();

  return sql.begin((tx) => createTaskInTransaction(tx, input));
}

async function createTaskSequenceInTransaction(
  sql: Db,
  input: CreateTaskSequenceInput
): Promise<CreatedTaskSequence> {
  const goalId = uuidOrNull(input.goalId);

  if (!goalId) {
    throw new Error("Task sequence requires a valid goalId");
  }

  const plan = buildTaskSequenceDependencyPlan(input.stages);

  if (plan.length < 1) {
    throw new Error("Task sequence requires at least one task");
  }

  const sequenceKey = optionalText(input.sequenceKey);
  const dependencies: TaskDependency[] = [];
  const tasks: TaskRecord[] = [];
  const tasksByKey = new Map<string, TaskRecord>();

  for (const planItem of plan) {
    const sourceTask =
      input.stages[planItem.stageIndex]?.tasks[planItem.taskIndex];

    if (!sourceTask) {
      throw new Error(`Task sequence item ${planItem.key} no longer exists`);
    }

    const taskInput = { ...sourceTask };
    delete taskInput.dependsOn;
    delete taskInput.key;

    const resolvedDependencies = planItem.dependencies.map((dependency) => {
      if (dependency.taskId) {
        return {
          taskId: dependency.taskId,
          type: dependency.type
        };
      }

      const dependencyTask = tasksByKey.get(dependency.key ?? "");

      if (!dependencyTask) {
        throw new Error(
          `Task sequence dependency ${dependency.key ?? "unknown"} has not been created`
        );
      }

      return {
        taskId: dependencyTask.id,
        type: dependency.type
      };
    });
    const created = await createTaskInTransaction(sql, {
      ...taskInput,
      createdByAgentId: taskInput.createdByAgentId ?? input.createdByAgentId,
      dependencies: [],
      goalId,
      idempotencyKey:
        optionalText(taskInput.idempotencyKey) ??
        (sequenceKey ? `${sequenceKey}:${planItem.key}` : null)
    });
    const savedDependencies = await ensureTaskDependenciesInTransaction(
      sql,
      created.task.id,
      resolvedDependencies
    );

    tasksByKey.set(planItem.key, created.task);
    tasks.push(created.task);
    dependencies.push(...savedDependencies);
  }

  await addTaskEventInTransaction(sql, {
    agentId: input.createdByAgentId,
    eventPayload: {
      dependencyCount: dependencies.length,
      sequenceKey,
      stageCount: input.stages.length,
      taskCount: tasks.length,
      taskKeys: plan.map((item) => item.key)
    },
    eventStatus: "requested",
    eventType: "task_sequence_created",
    goalId
  });

  return {
    dependencies,
    tasks
  };
}

export async function createTaskSequence(input: CreateTaskSequenceInput) {
  const sql = getRequiredSql();

  return sql.begin((tx) => createTaskSequenceInTransaction(tx, input));
}

export async function addTaskComment(input: AddTaskCommentInput) {
  const sql = getRequiredSql();

  return sql.begin((tx) => addTaskCommentInTransaction(tx, input));
}

export async function addTaskEvent(input: AddTaskEventInput) {
  const sql = getRequiredSql();

  return sql.begin((tx) => addTaskEventInTransaction(tx, input));
}

export async function getTaskBundle(input: Readonly<{ taskId: string }>) {
  const sql = getRequiredSql();
  const taskId = uuidOrNull(input.taskId);

  if (!taskId) {
    throw new Error("Task not found");
  }

  const taskRows = await sql<TaskRow[]>`
    select *
    from public.tasks
    where id = ${taskId}::uuid
    limit 1
  `;

  if (!taskRows[0]) {
    throw new Error(`Task ${taskId} not found`);
  }

  const task = mapTask(taskRows[0]);
  const [goalRows, commentRows, dependencyRows] = await Promise.all([
    sql<GoalRow[]>`
      select *
      from public.goals
      where id = ${task.goalId}::uuid
      limit 1
    `,
    sql<CommentRow[]>`
      select *
      from public.task_comments
      where task_id = ${task.id}::uuid
      order by created_at asc
    `,
    sql<DependencyRow[]>`
      select
        task_id::text,
        depends_on_task_id::text,
        dependency_type,
        created_at
      from public.task_dependencies
      where task_id = ${task.id}::uuid
      order by created_at asc
    `
  ]);

  if (!goalRows[0]) {
    throw new Error(`Goal ${task.goalId} not found`);
  }

  return {
    comments: commentRows.map(mapComment),
    dependencies: dependencyRows.map(mapDependency),
    goal: mapGoal(goalRows[0]),
    task
  } satisfies TaskBundle;
}

export async function assertActiveTaskReservation(
  input: Readonly<{
    agentId?: string | null;
    reservationId?: string | null;
    taskId: string;
  }>
) {
  const sql = getRequiredSql();

  return sql.begin((tx) => activeReservationInTransaction(tx, input));
}

export async function listGoalTasks(input: Readonly<{ goalId: string }>) {
  const sql = getRequiredSql();
  const goalId = uuidOrNull(input.goalId);

  if (!goalId) {
    throw new Error("Goal not found");
  }

  const goalRows = await sql<GoalRow[]>`
    select *
    from public.goals
    where id = ${goalId}::uuid
    limit 1
  `;

  if (!goalRows[0]) {
    throw new Error(`Goal ${goalId} not found`);
  }

  const taskRows = await sql<TaskRow[]>`
    select *
    from public.tasks
    where goal_id = ${goalId}::uuid
    order by created_at asc
  `;
  const taskIds = taskRows.map((row) => row.id);
  const dependencyRows =
    taskIds.length > 0
      ? await sql<DependencyRow[]>`
          select
            task_id::text,
            depends_on_task_id::text,
            dependency_type,
            created_at
          from public.task_dependencies
          where task_id = any(${taskIds}::uuid[])
          order by created_at asc
        `
      : [];

  return {
    dependencies: dependencyRows.map(mapDependency),
    goal: mapGoal(goalRows[0]),
    tasks: taskRows.map(mapTask)
  };
}

export async function releaseExpiredReservations() {
  const sql = getRequiredSql();

  return sql.begin((tx) => releaseExpiredReservationsInTransaction(tx));
}

async function releaseExpiredReservationsInTransaction(sql: Db) {
  const expired = await sql<ExpiredReservationRow[]>`
    select
      task_reservations.id::text as reservation_id,
      task_reservations.task_id::text,
      task_reservations.agent_id::text,
      tasks.goal_id::text,
      tasks.attempts,
      tasks.max_attempts
    from public.task_reservations
    join public.tasks on tasks.id = task_reservations.task_id
    where task_reservations.status = 'active'
      and task_reservations.lease_until < now()
    order by task_reservations.lease_until asc
    for update skip locked
  `;

  for (const row of expired) {
    const exhausted = row.attempts >= row.max_attempts;

    await sql`
      update public.task_reservations set
        status = 'expired',
        released_at = now()
      where id = ${row.reservation_id}::uuid
    `;

    await sql`
      update public.tasks set
        status = ${exhausted ? "failed" : "queued"},
        reserved_by_agent_id = null,
        lease_until = null,
        error_message = ${exhausted ? "Task lease expired after maximum attempts." : null},
        updated_at = now()
      where id = ${row.task_id}::uuid
        and status in ('reserved', 'running')
    `;

    await addTaskEventInTransaction(sql, {
      agentId: row.agent_id,
      eventPayload: {
        exhausted,
        reservationId: row.reservation_id
      },
      eventStatus: exhausted ? "failed" : "observed",
      eventType: exhausted ? "task_failed_after_lease_expiry" : "lease_expired",
      goalId: row.goal_id,
      severity: exhausted ? "high" : "medium",
      taskId: row.task_id
    });
    await refreshGoalStateInTransaction(sql, row.goal_id);
  }

  return expired.length;
}

export async function reserveNextTask(
  input: ReserveNextTaskInput
): Promise<ReservedTask | null> {
  const sql = getRequiredSql();

  return sql.begin(async (tx) => {
    const agent = await upsertAgentInTransaction(tx, {
      capabilities: input.agent.capabilities,
      id: input.agent.id,
      metadata: input.agent.metadata,
      model: input.agent.model,
      name: input.agent.name,
      type: input.agent.type ?? "external"
    });
    await releaseExpiredReservationsInTransaction(tx);

    const leaseSeconds = normalizeLeaseSeconds(input.leaseSeconds);
    const mustRequireCapability =
      normalizeCapabilities([input.mustRequireCapability])[0] ?? null;
    const taskTypes = normalizeCapabilities(input.taskTypes);
    const rows = await tx<TaskRow[]>`
      with candidate as (
        select tasks.*
        from public.tasks
        join public.goals on goals.id = tasks.goal_id
        where tasks.status = 'queued'
          and goals.status in ('open', 'active')
          and tasks.scheduled_for <= now()
          and tasks.attempts < tasks.max_attempts
          and (
            coalesce(cardinality(tasks.required_capabilities), 0) = 0
            or tasks.required_capabilities <@ ${agent.capabilities}::text[]
          )
          and (
            ${mustRequireCapability}::text is null
            or ${mustRequireCapability} = any(tasks.required_capabilities)
          )
          and (
            ${taskTypes.length < 1}
            or tasks.task_type = any(${taskTypes}::text[])
          )
          and not exists (
            select 1
            from public.task_dependencies
            join public.tasks as dependency
              on dependency.id = task_dependencies.depends_on_task_id
            where task_dependencies.task_id = tasks.id
              and (
                (
                  task_dependencies.dependency_type = 'complete'
                  and dependency.status not in ('completed', 'skipped')
                )
                or (
                  task_dependencies.dependency_type = 'successful'
                  and dependency.status <> 'completed'
                )
                or (
                  task_dependencies.dependency_type = 'approved'
                  and not exists (
                    select 1
                    from public.task_approvals
                    where task_approvals.task_id = dependency.id
                      and task_approvals.status = 'approved'
                  )
                )
              )
          )
        order by goals.priority desc, tasks.priority desc, tasks.scheduled_for asc, tasks.created_at asc
        limit 1
        for update skip locked
      )
      update public.tasks set
        status = 'reserved',
        reserved_by_agent_id = ${agent.id}::uuid,
        lease_until = now() + make_interval(secs => ${leaseSeconds}),
        started_at = coalesce(started_at, now()),
        attempts = public.tasks.attempts + 1,
        updated_at = now()
      from candidate
      where public.tasks.id = candidate.id
      returning public.tasks.*
    `;

    if (!rows[0]) {
      return null;
    }

    const task = mapTask(rows[0]);
    const reservationId = randomUUID();

    await tx`
      update public.goals
      set
        status = 'active',
        updated_at = now()
      where id = ${task.goalId}::uuid
        and status = 'open'
    `;

    await tx`
      insert into public.task_reservations (
        id,
        task_id,
        agent_id,
        status,
        reserved_at,
        lease_until,
        metadata
      )
      values (
        ${reservationId}::uuid,
        ${task.id}::uuid,
        ${agent.id}::uuid,
        'active',
        now(),
        ${new Date(task.leaseUntil ?? Date.now())},
        ${tx.json(toJsonValue({ capabilities: agent.capabilities }))}
      )
    `;

    await addTaskEventInTransaction(tx, {
      agentId: agent.id,
      eventPayload: {
        leaseSeconds,
        reservationId
      },
      eventStatus: "accepted",
      eventType: "task_reserved",
      goalId: task.goalId,
      taskId: task.id
    });

    const commentRows = await tx<CommentRow[]>`
      select *
      from public.task_comments
      where task_id = ${task.id}::uuid
      order by created_at asc
    `;

    return {
      agent,
      comments: commentRows.map(mapComment),
      reservationId,
      task
    };
  });
}

export async function completeTask(input: CompleteTaskInput) {
  const sql = getRequiredSql();

  return sql.begin(async (tx) => {
    const activeReservation = await activeReservationInTransaction(tx, {
      agentId: input.agentId,
      reservationId: input.reservationId,
      taskId: input.taskId
    });
    const rows = await tx<TaskRow[]>`
      update public.tasks set
        status = 'completed',
        result_payload = ${tx.json(toJsonValue(input.resultPayload ?? {}))},
        completed_at = now(),
        lease_until = null,
        reserved_by_agent_id = null,
        updated_at = now()
      where id = ${input.taskId}::uuid
        and status in ('queued', 'reserved', 'running', 'needs_review', 'waiting_approval')
        and (
          ${activeReservation?.agent_id ?? null}::uuid is null
          or reserved_by_agent_id = ${activeReservation?.agent_id ?? null}::uuid
        )
      returning *
    `;

    if (!rows[0]) {
      throw new Error(`Task ${input.taskId} could not be completed`);
    }

    const task = mapTask(rows[0]);

    await tx`
      update public.task_reservations set
        status = 'completed',
        completed_at = now()
      where task_id = ${task.id}::uuid
        and status = 'active'
        and (
          ${activeReservation?.id ?? null}::uuid is null
          or id = ${activeReservation?.id ?? null}::uuid
        )
    `;

    await addTaskEventInTransaction(tx, {
      agentId: input.agentId ?? activeReservation?.agent_id,
      eventPayload: {
        ...(input.resultPayload ?? {}),
        reservationId: activeReservation?.id
      },
      eventStatus: "succeeded",
      eventType: "task_completed",
      goalId: task.goalId,
      taskId: task.id
    });
    await refreshGoalStateInTransaction(tx, task.goalId);

    return task;
  });
}

export async function renewTaskLease(input: RenewTaskLeaseInput) {
  const sql = getRequiredSql();
  const taskId = uuidOrNull(input.taskId);
  const reservationId = uuidOrNull(input.reservationId);
  const agentId = uuidOrNull(input.agentId);

  if (!taskId || (!reservationId && !agentId)) {
    throw new Error("Task lease renewal requires a valid taskId and reservationId or agentId");
  }

  return sql.begin(async (tx) => {
    const leaseSeconds = normalizeLeaseSeconds(input.leaseSeconds);
    const reservations = await tx<
      Array<{
        agent_id: string;
        id: string;
      }>
    >`
      select id::text, agent_id::text
      from public.task_reservations
      where task_id = ${taskId}::uuid
        and status = 'active'
        and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
        and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
      order by reserved_at desc
      limit 1
      for update
    `;

    if (!reservations[0]) {
      throw new Error(`Active reservation for task ${taskId} not found`);
    }

    const reservation = reservations[0];
    const taskRows = await tx<TaskRow[]>`
      update public.tasks set
        lease_until = now() + make_interval(secs => ${leaseSeconds}),
        updated_at = now()
      where id = ${taskId}::uuid
        and reserved_by_agent_id = ${reservation.agent_id}::uuid
        and status in ('reserved', 'running')
      returning *
    `;

    if (!taskRows[0]) {
      throw new Error(`Task ${taskId} is not currently renewable`);
    }

    await tx`
      update public.task_reservations set
        lease_until = ${taskRows[0].lease_until},
        heartbeat_at = now()
      where id = ${reservation.id}::uuid
    `;
    await tx`
      update public.agents
      set
        last_seen_at = now(),
        updated_at = now()
      where id = ${reservation.agent_id}::uuid
    `;

    const task = mapTask(taskRows[0]);

    await addTaskEventInTransaction(tx, {
      agentId: reservation.agent_id,
      eventPayload: {
        leaseSeconds,
        reservationId: reservation.id
      },
      eventStatus: "accepted",
      eventType: "task_lease_renewed",
      goalId: task.goalId,
      taskId: task.id
    });

    return {
      reservationId: reservation.id,
      task
    };
  });
}

export async function failTask(input: FailTaskInput) {
  const sql = getRequiredSql();

  return sql.begin(async (tx) => {
    const activeReservation = await activeReservationInTransaction(tx, {
      agentId: input.agentId,
      reservationId: input.reservationId,
      taskId: input.taskId
    });
    const rows = await tx<TaskRow[]>`
      update public.tasks set
        status = 'failed',
        error_message = ${cleanText(input.errorMessage, "Task failed.")},
        result_payload = ${tx.json(toJsonValue(input.resultPayload ?? {}))},
        lease_until = null,
        reserved_by_agent_id = null,
        updated_at = now()
      where id = ${input.taskId}::uuid
        and status not in ('completed', 'cancelled', 'skipped')
        and (
          ${activeReservation?.agent_id ?? null}::uuid is null
          or reserved_by_agent_id = ${activeReservation?.agent_id ?? null}::uuid
        )
      returning *
    `;

    if (!rows[0]) {
      throw new Error(`Task ${input.taskId} could not be failed`);
    }

    const task = mapTask(rows[0]);

    await tx`
      update public.task_reservations set
        status = 'failed',
        released_at = now()
      where task_id = ${task.id}::uuid
        and status = 'active'
        and (
          ${activeReservation?.id ?? null}::uuid is null
          or id = ${activeReservation?.id ?? null}::uuid
        )
    `;

    await addTaskEventInTransaction(tx, {
      agentId: input.agentId ?? activeReservation?.agent_id,
      eventPayload: {
        errorMessage: input.errorMessage,
        reservationId: activeReservation?.id,
        resultPayload: input.resultPayload ?? {}
      },
      eventStatus: "failed",
      eventType: "task_failed",
      goalId: task.goalId,
      severity: "high",
      taskId: task.id
    });
    await refreshGoalStateInTransaction(tx, task.goalId);

    return task;
  });
}

export async function spawnChildTask(input: SpawnChildTaskInput) {
  const sql = getRequiredSql();

  return sql.begin(async (tx) => {
    const parentRows = await tx<TaskRow[]>`
      select *
      from public.tasks
      where id = ${input.parentTaskId}::uuid
      limit 1
    `;

    if (!parentRows[0]) {
      throw new Error(`Parent task ${input.parentTaskId} not found`);
    }

    const parent = mapTask(parentRows[0]);
    const created = await createTaskInTransaction(tx, {
      ...input,
      createdByTaskId: parent.id,
      parentTaskId: parent.id,
      goalId: parent.goalId
    });

    await addTaskEventInTransaction(tx, {
      agentId: input.createdByAgentId,
      eventPayload: {
        childTaskId: created.task.id,
        childTaskType: created.task.taskType
      },
      eventType: "child_task_created",
      goalId: parent.goalId,
      taskId: parent.id
    });

    return created;
  });
}

export {
  buildTaskSequenceDependencyPlan,
  TASK_PRIORITY,
  normalizeTaskPriority
};
export type { TaskDependencyType };
