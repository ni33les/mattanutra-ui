import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  buildTaskSequenceDependencyPlan,
  normalizeCapabilities,
  normalizeLeaseSeconds,
  normalizeTaskIdempotencyScope,
  normalizeTaskDependencyType,
  normalizeTaskPriority,
  normalizeTaskRetryPolicy,
  TASK_PRIORITY,
  taskRetryDelaySeconds,
  type TaskDependencyType,
  type TaskIdempotencyScope,
  type TaskRetryPolicyInput,
  type TaskPriority
} from "@/lib/task-service-utils";

const globalTaskService = globalThis as typeof globalThis & {
  mattanutraWorkerSessionSchemaReady?: Promise<void>;
};

export type AgentType =
  | "ai"
  | "deterministic"
  | "external"
  | "human"
  | "system";

export type AgentStatus = "active" | "offline" | "paused" | "retired";

export type WorkerSessionStatus =
  | "idle"
  | "offline"
  | "polling"
  | "working";

export type GoalStatus =
  | "active"
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

export type WorkerSession = Readonly<{
  agentId: string;
  capabilities: string[];
  concurrency: number;
  createdAt: string;
  currentTaskId: string | null;
  id: string;
  instanceId: string;
  lastSeenAt: string | null;
  metadata: unknown;
  status: WorkerSessionStatus;
  taskTypes: string[];
  updatedAt: string;
  workerVersion: string | null;
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
  maxRetries: number;
  parentTaskId: string | null;
  payload: unknown;
  planId: string | null;
  priority: TaskPriority;
  goalId: string;
  reasoningEffort: TaskReasoningEffort;
  requiredCapabilities: string[];
  reservedByAgentId: string | null;
  resultPayload: unknown;
  retryAttempt: number;
  retryOfTaskId: string | null;
  retryRootTaskId: string | null;
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

export type TaskServiceDb = postgres.Sql | postgres.TransactionSql;

type Db = TaskServiceDb;

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

type WorkerSessionRow = {
  agent_id: string;
  capabilities: string[];
  concurrency: number;
  created_at: Date | string;
  current_task_id: string | null;
  id: string;
  instance_id: string;
  last_seen_at: Date | string | null;
  metadata: unknown;
  status: WorkerSessionStatus;
  task_types: string[];
  updated_at: Date | string;
  worker_version: string | null;
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
  max_retries: number;
  parent_task_id: string | null;
  payload: unknown;
  plan_id: string | null;
  priority: number;
  goal_id: string;
  reasoning_effort: TaskReasoningEffort;
  required_capabilities: string[];
  reserved_by_agent_id: string | null;
  result_payload: unknown;
  retry_attempt: number;
  retry_of_task_id: string | null;
  retry_root_task_id: string | null;
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

type ExpiredReservationRow = TaskRow & {
  reservation_agent_id: string;
  reservation_id: string;
  reservation_worker_session_id: string | null;
};

const TASK_RETRY_METADATA_KEY = "__taskRetry";

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
  idempotencyScope?: TaskIdempotencyScope;
  initialComment?: Omit<AddTaskCommentInput, "taskId">;
  maxAttempts?: number;
  maxRetries?: unknown;
  parentTaskId?: string | null;
  payload?: Record<string, unknown>;
  planId?: string | null;
  priority?: unknown;
  goalId: string;
  reasoningEffort?: TaskReasoningEffort;
  requiredCapabilities?: unknown;
  retryAttempt?: unknown;
  retryOfTaskId?: string | null;
  retryPolicy?: TaskRetryPolicyInput;
  retryRootTaskId?: string | null;
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
  workerSessionId?: string | null;
}>;

export type ReleaseExpiredReservationsInput = Readonly<{
  applyFailure?: (context: TaskFailureContext) => Promise<unknown>;
}>;

export type RetryFailedTaskInput = Readonly<{
  agentId?: string | null;
  taskId: string;
}>;

export type CompleteTaskInput = Readonly<{
  agentId?: string | null;
  applyResult?: (context: TaskCompletionContext) => Promise<unknown>;
  reservationId?: string | null;
  resultPayload?: Record<string, unknown>;
  taskId: string;
  workerSessionId?: string | null;
}>;

export type TaskAfterCommitEffect = () => Promise<void>;

export type FailTaskInput = Readonly<{
  agentId?: string | null;
  applyFailure?: (context: TaskFailureContext) => Promise<unknown>;
  errorMessage: string;
  reservationId?: string | null;
  resultPayload?: Record<string, unknown>;
  taskId: string;
  workerSessionId?: string | null;
}>;

export type TaskCompletionContext = Readonly<{
  afterCommit?: (effect: TaskAfterCommitEffect) => void;
  agentId?: string | null;
  reservationId?: string | null;
  resultPayload: Record<string, unknown>;
  sql: TaskServiceDb;
  task: TaskRecord;
}>;

export type TaskFailureContext = Readonly<{
  afterCommit?: (effect: TaskAfterCommitEffect) => void;
  agentId?: string | null;
  errorMessage: string;
  reservationId?: string | null;
  resultPayload: Record<string, unknown>;
  retryWillBeScheduled: boolean;
  sql: TaskServiceDb;
  task: TaskRecord;
}>;

export type RenewTaskLeaseInput = Readonly<{
  agentId?: string | null;
  leaseSeconds?: unknown;
  reservationId?: string | null;
  taskId: string;
  workerSessionId?: string | null;
}>;

export type RegisterWorkerSessionInput = Readonly<{
  agent: Readonly<{
    capabilities?: unknown;
    id?: string | null;
    metadata?: Record<string, unknown>;
    model?: string | null;
    name: string;
    type?: AgentType;
  }>;
  capabilities?: unknown;
  concurrency?: unknown;
  instanceId: string;
  metadata?: Record<string, unknown>;
  taskTypes?: unknown;
  workerVersion?: string | null;
}>;

export type HeartbeatWorkerSessionInput = Readonly<{
  agentId?: string | null;
  currentTaskId?: string | null;
  metadata?: Record<string, unknown>;
  status?: WorkerSessionStatus | null;
  workerSessionId: string;
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

export async function ensureWorkerSessionSchema(sql?: postgres.Sql) {
  const configured = getRequiredSql(sql);

  globalTaskService.mattanutraWorkerSessionSchemaReady ??= (async () => {
    await configured`
      create table if not exists public.worker_sessions (
        id uuid primary key,
        agent_id uuid not null references public.agents(id) on delete cascade,
        instance_id text not null,
        status text not null default 'idle',
        capabilities text[] not null default '{}',
        task_types text[] not null default '{}',
        concurrency integer not null default 1,
        worker_version text null,
        current_task_id uuid null,
        metadata jsonb not null default '{}'::jsonb,
        last_seen_at timestamptz not null default now(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await configured`
      alter table public.worker_sessions
        add column if not exists agent_id uuid references public.agents(id) on delete cascade,
        add column if not exists instance_id text,
        add column if not exists status text default 'idle',
        add column if not exists capabilities text[] default '{}',
        add column if not exists task_types text[] default '{}',
        add column if not exists concurrency integer default 1,
        add column if not exists worker_version text,
        add column if not exists current_task_id uuid,
        add column if not exists metadata jsonb default '{}'::jsonb,
        add column if not exists last_seen_at timestamptz default now(),
        add column if not exists created_at timestamptz default now(),
        add column if not exists updated_at timestamptz default now()
    `;
    await configured`
      update public.worker_sessions
      set
        instance_id = coalesce(nullif(instance_id, ''), id::text),
        status = case
          when status in ('idle', 'offline', 'polling', 'working') then status
          else 'idle'
        end,
        capabilities = coalesce(capabilities, '{}'),
        task_types = coalesce(task_types, '{}'),
        concurrency = greatest(1, coalesce(concurrency, 1)),
        metadata = coalesce(metadata, '{}'::jsonb),
        last_seen_at = coalesce(last_seen_at, now()),
        created_at = coalesce(created_at, now()),
        updated_at = coalesce(updated_at, now())
    `;
    await configured`
      alter table public.worker_sessions
        alter column agent_id set not null,
        alter column instance_id set not null,
        alter column status set default 'idle',
        alter column status set not null,
        alter column capabilities set default '{}',
        alter column capabilities set not null,
        alter column task_types set default '{}',
        alter column task_types set not null,
        alter column concurrency set default 1,
        alter column concurrency set not null,
        alter column metadata set default '{}'::jsonb,
        alter column metadata set not null,
        alter column last_seen_at set default now(),
        alter column last_seen_at set not null,
        alter column created_at set default now(),
        alter column created_at set not null,
        alter column updated_at set default now(),
        alter column updated_at set not null
    `;
    await configured`
      do $$
      begin
        alter table public.worker_sessions
          drop constraint if exists worker_sessions_status_check;

        alter table public.worker_sessions
          add constraint worker_sessions_status_check
          check (status in ('idle', 'offline', 'polling', 'working'));
      end $$;
    `;
    await configured`
      create unique index if not exists worker_sessions_agent_instance_idx
        on public.worker_sessions (agent_id, instance_id)
    `;
    await configured`
      create index if not exists worker_sessions_status_idx
        on public.worker_sessions (status, last_seen_at desc)
    `;
    await configured`
      create index if not exists worker_sessions_capabilities_gin_idx
        on public.worker_sessions using gin (capabilities)
    `;
    await configured`
      do $$
      begin
        if to_regclass('public.task_reservations') is not null then
          alter table public.task_reservations
            add column if not exists worker_session_id uuid null;

          if not exists (
            select 1
            from pg_constraint
            where conname = 'task_reservations_worker_session_id_fkey'
              and conrelid = 'public.task_reservations'::regclass
          ) then
            alter table public.task_reservations
              add constraint task_reservations_worker_session_id_fkey
              foreign key (worker_session_id)
              references public.worker_sessions(id)
              on delete set null;
          end if;
        end if;
      end $$;
    `;
    await configured`
      do $$
      begin
        if to_regclass('public.task_reservations') is not null then
          execute 'create index if not exists task_reservations_worker_session_idx on public.task_reservations (worker_session_id, status, reserved_at desc) where worker_session_id is not null';
        end if;
      end $$;
    `;
  })().catch((error) => {
    globalTaskService.mattanutraWorkerSessionSchemaReady = undefined;
    throw error;
  });

  await globalTaskService.mattanutraWorkerSessionSchemaReady;
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

function workerSessionStatus(value: unknown): WorkerSessionStatus {
  return value === "idle" ||
    value === "offline" ||
    value === "polling" ||
    value === "working"
    ? value
    : "idle";
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

function nonNegativeInteger(value: unknown, fallback: number) {
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

function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function retryMetadataRecord(payload: unknown) {
  return payloadRecord(payloadRecord(payload)[TASK_RETRY_METADATA_KEY]);
}

function retryPolicyFromTask(task: Pick<TaskRecord, "payload">) {
  return normalizeTaskRetryPolicy(
    retryMetadataRecord(task.payload).policy as TaskRetryPolicyInput
  );
}

function retryPolicyForTask(
  task: Pick<TaskRecord, "maxRetries" | "payload">
) {
  const legacyPolicy = retryPolicyFromTask(task);

  return {
    backoffMultiplier: legacyPolicy?.backoffMultiplier ?? 2,
    initialDelaySeconds: legacyPolicy?.initialDelaySeconds ?? 300,
    maxDelaySeconds: legacyPolicy?.maxDelaySeconds ?? 3_600,
    maxRetries: task.maxRetries
  };
}

function taskLineageRootId(
  task: Pick<TaskRecord, "id" | "retryRootTaskId">
) {
  return task.retryRootTaskId ?? task.id;
}

function taskRetryWillBeScheduled(task: TaskRecord) {
  return Boolean(task.idempotencyKey) && task.retryAttempt < task.maxRetries;
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

function mapWorkerSession(row: WorkerSessionRow): WorkerSession {
  return {
    agentId: row.agent_id,
    capabilities: normalizeCapabilities(row.capabilities),
    concurrency: Math.max(1, Math.round(Number(row.concurrency) || 1)),
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    currentTaskId: row.current_task_id,
    id: row.id,
    instanceId: row.instance_id,
    lastSeenAt: isoDate(row.last_seen_at),
    metadata: row.metadata,
    status: row.status,
    taskTypes: normalizeCapabilities(row.task_types),
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString(),
    workerVersion: row.worker_version
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
    maxRetries: row.max_retries,
    parentTaskId: row.parent_task_id,
    payload: row.payload,
    planId: row.plan_id,
    priority: normalizeTaskPriority(row.priority),
    goalId: row.goal_id,
    reasoningEffort: row.reasoning_effort,
    requiredCapabilities: normalizeCapabilities(row.required_capabilities),
    reservedByAgentId: row.reserved_by_agent_id,
    resultPayload: row.result_payload,
    retryAttempt: row.retry_attempt,
    retryOfTaskId: row.retry_of_task_id,
    retryRootTaskId: row.retry_root_task_id,
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

export async function addTaskEventToTransaction(
  sql: TaskServiceDb,
  input: AddTaskEventInput
) {
  return addTaskEventInTransaction(sql, input);
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
          'needs_review',
          'waiting_approval'
        )
      )::int as active_count,
      count(*) filter (
        where status = 'failed'
          and not exists (
            select 1
            from public.tasks as successor
            where successor.goal_id = tasks.goal_id
              and successor.status in (
                'queued',
                'reserved',
                'running',
                'needs_review',
                'waiting_approval',
                'completed',
                'skipped'
              )
              and (
                (
                  coalesce(successor.retry_root_task_id, successor.id)
                    = coalesce(tasks.retry_root_task_id, tasks.id)
                  and successor.retry_attempt > tasks.retry_attempt
                )
                or (
                  tasks.idempotency_key is not null
                  and successor.idempotency_key = tasks.idempotency_key
                  and successor.created_at > tasks.created_at
                )
              )
          )
      )::int as failed_count
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
    workerSessionId?: string | null;
  }>,
  options: Readonly<{ lock?: boolean }> = {}
) {
  const agentId = uuidOrNull(input.agentId);
  const reservationId = uuidOrNull(input.reservationId);
  const workerSessionId = uuidOrNull(input.workerSessionId);

  if (input.agentId && !agentId) {
    throw new Error("Task reservation check requires a valid agentId");
  }

  if (input.reservationId && !reservationId) {
    throw new Error("Task reservation check requires a valid reservationId");
  }

  if (input.workerSessionId && !workerSessionId) {
    throw new Error("Task reservation check requires a valid workerSessionId");
  }

  if (!agentId && !reservationId && !workerSessionId) {
    return null;
  }

  const rows = options.lock
    ? await sql<
        Array<{
          agent_id: string;
          id: string;
          worker_session_id: string | null;
        }>
      >`
        select id::text, agent_id::text, worker_session_id::text
        from public.task_reservations
        where task_id = ${input.taskId}::uuid
          and status = 'active'
          and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
          and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
          and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
        order by reserved_at desc
        limit 1
        for update
      `
    : await sql<
        Array<{
          agent_id: string;
          id: string;
          worker_session_id: string | null;
        }>
      >`
        select id::text, agent_id::text, worker_session_id::text
        from public.task_reservations
        where task_id = ${input.taskId}::uuid
          and status = 'active'
          and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
          and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
          and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
        order by reserved_at desc
        limit 1
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
  const requestedId = uuidOrNull(input.id);
  const hasCapabilitiesInput = Array.isArray(input.capabilities);
  const capabilities = normalizeCapabilities(input.capabilities);
  const existing = await sql<AgentRow[]>`
    select *
    from public.agents
    where (
        ${requestedId}::uuid is not null
        and id = ${requestedId}::uuid
      )
      or lower(name) = lower(${name})
    order by
      case
        when ${requestedId}::uuid is not null and id = ${requestedId}::uuid
          then 0
        else 1
      end
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

async function hideLegacyAggregateWorkerAgent(sql: Db) {
  const legacyRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.agents
    where lower(name) = lower('MattaNutra External Worker')
  `;
  const legacyIds = legacyRows.map((row) => row.id);

  if (legacyIds.length < 1) {
    return;
  }

  await sql`
    update public.worker_sessions set
      status = 'offline',
      current_task_id = null,
      updated_at = now()
    where agent_id = any(${legacyIds}::uuid[])
  `;

  await sql`
    update public.agents set
      status = 'retired',
      metadata = metadata || ${sql.json(
        toJsonValue({
          hiddenFromDashboard: true,
          legacyAggregateRuntime: true
        })
      )},
      updated_at = now()
    where id = any(${legacyIds}::uuid[])
  `;
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

    const cycleRows = await sql<Array<{ has_cycle: boolean }>>`
      with recursive dependency_path(task_id) as (
        select ${dependsOnTaskId}::uuid
        union
        select task_dependencies.depends_on_task_id
        from public.task_dependencies
        inner join dependency_path
          on dependency_path.task_id = task_dependencies.task_id
      )
      select exists (
        select 1
        from dependency_path
        where task_id = ${taskUuid}::uuid
      ) as has_cycle
    `;

    if (cycleRows[0]?.has_cycle) {
      throw new Error("Task dependency cycle detected");
    }

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
  const idempotencyScope = normalizeTaskIdempotencyScope(
    input.idempotencyScope
  );
  const includeSuccessfulIdempotencyMatches =
    idempotencyScope === "successful";
  const retryPolicy = normalizeTaskRetryPolicy(input.retryPolicy);
  const retryAttempt = nonNegativeInteger(input.retryAttempt, 0);
  const maxRetries = nonNegativeInteger(
    input.maxRetries,
    retryPolicy?.maxRetries ?? 0
  );
  const retryOfTaskId = uuidOrNull(input.retryOfTaskId);
  const retryRootTaskId = uuidOrNull(input.retryRootTaskId) ?? retryOfTaskId;
  const payload = input.payload ?? {};

  if (idempotencyKey) {
    const existing = await sql<TaskRow[]>`
      select *
      from public.tasks
      where goal_id = ${goalId}::uuid
        and idempotency_key = ${idempotencyKey}
        and (
          status not in ('completed', 'failed', 'cancelled', 'skipped')
          or (
            ${includeSuccessfulIdempotencyMatches}
            and status in ('completed', 'skipped')
          )
        )
      order by
        (status not in ('completed', 'failed', 'cancelled', 'skipped')) desc,
        (status in ('completed', 'skipped')) desc,
        created_at desc
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
      retry_of_task_id,
      retry_root_task_id,
      retry_attempt,
      max_retries,
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
      ${sql.json(toJsonValue(payload))},
      '{}'::jsonb,
      ${idempotencyKey},
      ${input.scheduledFor ? new Date(input.scheduledFor) : new Date()},
      0,
      ${positiveInteger(input.maxAttempts, 3)},
      ${retryOfTaskId}::uuid,
      ${retryRootTaskId}::uuid,
      ${retryAttempt},
      ${maxRetries},
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
          and (
            status not in ('completed', 'failed', 'cancelled', 'skipped')
            or (
              ${includeSuccessfulIdempotencyMatches}
              and status in ('completed', 'skipped')
            )
          )
        order by
          (status not in ('completed', 'failed', 'cancelled', 'skipped')) desc,
          (status in ('completed', 'skipped')) desc,
          created_at desc
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
      idempotencyScope,
      maxRetries,
      priority: task.priority,
      prioritySource: hasExplicitPriority ? "explicit" : "goal",
      requiredCapabilities: task.requiredCapabilities,
      retryAttempt,
      retryOfTaskId,
      retryRootTaskId,
      retryPolicy
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

  return upsertAgentInTransaction(sql, input);
}

export async function registerWorkerSession(input: RegisterWorkerSessionInput) {
  const sql = getRequiredSql();

  await ensureWorkerSessionSchema(sql);

  await hideLegacyAggregateWorkerAgent(sql);

  const capabilities = normalizeCapabilities(
    input.capabilities ?? input.agent.capabilities
  );
  const taskTypes = normalizeCapabilities(input.taskTypes);
  const agent = await upsertAgentInTransaction(sql, {
    capabilities,
    id: input.agent.id,
    metadata: {
      ...(input.agent.metadata ?? {}),
      externalWorker: true
    },
    model: input.agent.model,
    name: input.agent.name,
    status: "active",
    type: input.agent.type ?? "external"
  });
  const rows = await sql<WorkerSessionRow[]>`
    insert into public.worker_sessions (
      id,
      agent_id,
      instance_id,
      status,
      capabilities,
      task_types,
      concurrency,
      worker_version,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${agent.id}::uuid,
      ${cleanText(input.instanceId, agent.name)},
      'idle',
      ${capabilities},
      ${taskTypes},
      ${positiveInteger(input.concurrency, 1)},
      ${optionalText(input.workerVersion)},
      ${sql.json(toJsonValue(input.metadata ?? {}))},
      now(),
      now(),
      now()
    )
    on conflict (agent_id, instance_id)
    do update set
      status = 'idle',
      capabilities = excluded.capabilities,
      task_types = excluded.task_types,
      concurrency = excluded.concurrency,
      worker_version = excluded.worker_version,
      metadata = public.worker_sessions.metadata || excluded.metadata,
      last_seen_at = now(),
      updated_at = now()
    returning *
  `;

  return {
    agent,
    polling: {
      leaseSeconds: 600,
      waitSeconds: 20
    },
    session: mapWorkerSession(rows[0])
  };
}

export async function heartbeatWorkerSession(input: HeartbeatWorkerSessionInput) {
  const sql = getRequiredSql();
  const workerSessionId = uuidOrNull(input.workerSessionId);
  const agentId = uuidOrNull(input.agentId);
  const currentTaskId = uuidOrNull(input.currentTaskId);

  await ensureWorkerSessionSchema(sql);

  if (!workerSessionId) {
    throw new Error("Worker heartbeat requires a valid workerSessionId");
  }

  const status = workerSessionStatus(input.status);
  const rows = await sql<WorkerSessionRow[]>`
    update public.worker_sessions set
      status = ${status},
      current_task_id = case
        when ${status} = 'offline' then null
        else ${currentTaskId}::uuid
      end,
      metadata = metadata || ${sql.json(toJsonValue(input.metadata ?? {}))},
      last_seen_at = now(),
      updated_at = now()
    where id = ${workerSessionId}::uuid
      and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
    returning *
  `;

  if (!rows[0]) {
    throw new Error("Worker session not found");
  }

  await sql`
    update public.agents
    set
      last_seen_at = now(),
      updated_at = now()
    where id = ${rows[0].agent_id}::uuid
  `;

  return mapWorkerSession(rows[0]);
}

export async function createGoal(input: CreateGoalInput) {
  const sql = getRequiredSql();

  return createGoalInTransaction(sql, input);
}

export async function createTask(input: CreateTaskInput) {
  const sql = getRequiredSql();

  return createTaskInTransaction(sql, input);
}

export async function retryFailedTask(input: RetryFailedTaskInput) {
  const sql = getRequiredSql();
  const taskId = uuidOrNull(input.taskId);

  if (!taskId) {
    throw new Error("Task retry requires a valid taskId");
  }

  return sql.begin(async (tx) => {
    const taskRows = await tx<TaskRow[]>`
      select *
      from public.tasks
      where id = ${taskId}::uuid
      for update
    `;

    if (!taskRows[0]) {
      throw new Error(`Task ${input.taskId} not found`);
    }

    const failedTask = mapTask(taskRows[0]);

    if (failedTask.status !== "failed") {
      throw new Error("Only failed tasks can be retried");
    }

    if (await taskHasLaterRetrySuccessorInTransaction(tx, failedTask)) {
      throw new Error("Task already has a later retry attempt");
    }

    const retryAttempt = failedTask.retryAttempt + 1;
    const retryRootTaskId = taskLineageRootId(failedTask);
    const payload = { ...payloadRecord(failedTask.payload) };
    delete payload[TASK_RETRY_METADATA_KEY];
    const dependencyRows = await tx<DependencyRow[]>`
      select
        task_id::text,
        depends_on_task_id::text,
        dependency_type,
        created_at
      from public.task_dependencies
      where task_id = ${failedTask.id}::uuid
      order by created_at asc
    `;
    const created = await createTaskInTransaction(tx, {
      actorType: failedTask.actorType,
      createdByAgentId: input.agentId,
      createdByTaskId: failedTask.id,
      dependencies: dependencyRows.map((dependency) => ({
        taskId: dependency.depends_on_task_id,
        type: dependency.dependency_type
      })),
      description: failedTask.description,
      goalId: failedTask.goalId,
      idempotencyKey: failedTask.idempotencyKey,
      idempotencyScope: "active",
      initialComment: {
        authorName: "MattaNutra admin",
        authorType: "system",
        body: `Manual retry ${retryAttempt} requested from failed task.`,
        commentType: "status",
        metadata: {
          failedTaskId: failedTask.id,
          retryAttempt
        },
        visibility: "worker"
      },
      maxAttempts: failedTask.maxAttempts,
      maxRetries: retryAttempt,
      payload,
      planId: failedTask.planId,
      priority: failedTask.priority,
      reasoningEffort: failedTask.reasoningEffort,
      requiredCapabilities: failedTask.requiredCapabilities,
      retryAttempt,
      retryOfTaskId: failedTask.id,
      retryPolicy: {
        ...retryPolicyForTask(failedTask),
        maxRetries: retryAttempt
      },
      retryRootTaskId,
      scheduledFor: new Date(),
      taskType: failedTask.taskType,
      title: failedTask.title
    });

    await addTaskEventInTransaction(tx, {
      agentId: input.agentId,
      eventPayload: {
        failedTaskId: failedTask.id,
        retryAttempt,
        retryRootTaskId,
        retryTaskId: created.task.id
      },
      eventStatus: created.created ? "requested" : "observed",
      eventType: created.created
        ? "task_manual_retry_requested"
        : "task_manual_retry_already_exists",
      goalId: failedTask.goalId,
      severity: "medium",
      taskId: failedTask.id
    });

    await refreshGoalStateInTransaction(tx, failedTask.goalId);

    return {
      created: created.created,
      sourceTask: failedTask,
      task: created.task
    };
  });
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

  return createTaskSequenceInTransaction(sql, input);
}

export async function addTaskComment(input: AddTaskCommentInput) {
  const sql = getRequiredSql();

  return addTaskCommentInTransaction(sql, input);
}

export async function addTaskEvent(input: AddTaskEventInput) {
  const sql = getRequiredSql();

  return addTaskEventInTransaction(sql, input);
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
    workerSessionId?: string | null;
  }>
) {
  const sql = getRequiredSql();

  await ensureWorkerSessionSchema(sql);

  return activeReservationInTransaction(sql, input);
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
    order by
      case
        when status in (
          'queued',
          'reserved',
          'running',
          'needs_review',
          'waiting_approval'
        ) then 0
        else 1
      end,
      priority desc,
      scheduled_for asc,
      created_at asc
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

export async function releaseExpiredReservations(
  input: ReleaseExpiredReservationsInput = {}
) {
  const sql = getRequiredSql();

  return sql.begin((tx) => releaseExpiredReservationsInTransaction(tx, input));
}

async function releaseExpiredReservationsInTransaction(
  sql: Db,
  input: ReleaseExpiredReservationsInput = {}
) {
  const expired = await sql<ExpiredReservationRow[]>`
    select
      task_reservations.id::text as reservation_id,
      task_reservations.agent_id::text as reservation_agent_id,
      task_reservations.worker_session_id::text as reservation_worker_session_id,
      tasks.*
    from public.task_reservations
    join public.tasks on tasks.id = task_reservations.task_id
    where task_reservations.status = 'active'
      and task_reservations.lease_until < now()
      and tasks.status in ('reserved', 'running')
    order by task_reservations.lease_until asc
    for update skip locked
  `;

  for (const row of expired) {
    const exhausted = row.attempts >= row.max_attempts;
    const pendingTask = mapTask(row);
    const retryWillBeScheduled =
      exhausted && taskRetryWillBeScheduled(pendingTask);
    const resultPayload = payloadRecord(
      exhausted && input.applyFailure
        ? await input.applyFailure({
            agentId: row.reservation_agent_id,
            errorMessage: "Task lease expired after maximum attempts.",
            reservationId: row.reservation_id,
            resultPayload: {},
            retryWillBeScheduled,
            sql,
            task: pendingTask
          })
        : {}
    );

    await sql`
      update public.task_reservations set
        status = 'expired',
        released_at = now()
      where id = ${row.reservation_id}::uuid
    `;

    if (row.reservation_worker_session_id) {
      await sql`
        update public.worker_sessions set
          status = 'idle',
          current_task_id = null,
          updated_at = now()
        where id = ${row.reservation_worker_session_id}::uuid
      `;
    }

    const updatedTasks = await sql<TaskRow[]>`
      update public.tasks set
        status = ${exhausted ? "failed" : "queued"},
        reserved_by_agent_id = null,
        lease_until = null,
        error_message = ${exhausted ? "Task lease expired after maximum attempts." : null},
        result_payload = case
          when ${exhausted} then ${sql.json(toJsonValue(resultPayload))}
          else result_payload
        end,
        updated_at = now()
      where id = ${row.id}::uuid
        and status in ('reserved', 'running')
      returning *
    `;

    await addTaskEventInTransaction(sql, {
      agentId: row.reservation_agent_id,
      eventPayload: {
        exhausted,
        reservationId: row.reservation_id,
        resultPayload
      },
      eventStatus: exhausted ? "failed" : "observed",
      eventType: exhausted ? "task_failed_after_lease_expiry" : "lease_expired",
      goalId: row.goal_id,
      severity: exhausted ? "high" : "medium",
      taskId: row.id
    });

    if (exhausted && updatedTasks[0]) {
      await scheduleRetryForFailedTaskInTransaction(sql, {
        errorMessage: "Task lease expired after maximum attempts.",
        failedByAgentId: row.reservation_agent_id,
        resultPayload,
        task: mapTask(updatedTasks[0])
      });
    }

    await refreshGoalStateInTransaction(sql, row.goal_id);
  }

  return expired.length;
}

async function taskHasSuccessfulRetryInTransaction(sql: Db, task: TaskRecord) {
  if (!task.idempotencyKey) {
    return false;
  }

  const lineageRootId = taskLineageRootId(task);
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.tasks
    where goal_id = ${task.goalId}::uuid
      and status in ('completed', 'skipped')
      and (
        (
          coalesce(retry_root_task_id, id) = ${lineageRootId}::uuid
          and retry_attempt > ${task.retryAttempt}
        )
        or (
          idempotency_key = ${task.idempotencyKey}
          and created_at > ${new Date(task.createdAt)}
        )
      )
    order by created_at desc
    limit 1
  `;

  return Boolean(rows[0]);
}

async function taskHasLaterRetrySuccessorInTransaction(
  sql: Db,
  task: TaskRecord
) {
  const lineageRootId = taskLineageRootId(task);
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.tasks as successor
    where successor.goal_id = ${task.goalId}::uuid
      and successor.id <> ${task.id}::uuid
      and successor.status <> 'cancelled'
      and (
        (
          coalesce(successor.retry_root_task_id, successor.id) = ${lineageRootId}::uuid
          and successor.retry_attempt > ${task.retryAttempt}
        )
        or (
          ${task.idempotencyKey}::text is not null
          and successor.idempotency_key = ${task.idempotencyKey}
          and successor.created_at > ${new Date(task.createdAt)}
        )
      )
    order by successor.created_at desc
    limit 1
  `;

  return Boolean(rows[0]);
}

async function scheduleRetryForFailedTaskInTransaction(
  sql: Db,
  input: Readonly<{
    errorMessage: string;
    failedByAgentId?: string | null;
    resultPayload?: Record<string, unknown>;
    task: TaskRecord;
  }>
) {
  const policy = retryPolicyForTask(input.task);

  if (policy.maxRetries < 1 || !input.task.idempotencyKey) {
    return null;
  }

  if (await taskHasSuccessfulRetryInTransaction(sql, input.task)) {
    await addTaskEventInTransaction(sql, {
      agentId: input.failedByAgentId,
      eventPayload: {
        idempotencyKey: input.task.idempotencyKey,
        retryReason: "successful_retry_exists"
      },
      eventStatus: "observed",
      eventType: "task_retry_not_needed",
      goalId: input.task.goalId,
      taskId: input.task.id
    });

    return null;
  }

  const retryAttempt = input.task.retryAttempt + 1;

  if (retryAttempt > policy.maxRetries) {
    await addTaskEventInTransaction(sql, {
      agentId: input.failedByAgentId,
      eventPayload: {
        maxRetries: policy.maxRetries,
        retryAttempt
      },
      eventStatus: "failed",
      eventType: "task_retry_exhausted",
      goalId: input.task.goalId,
      severity: "high",
      taskId: input.task.id
    });

    return null;
  }

  const delaySeconds = taskRetryDelaySeconds(retryAttempt, policy);
  const scheduledFor = new Date(Date.now() + delaySeconds * 1000);
  const payload = payloadRecord(input.task.payload);
  const retryRootTaskId = taskLineageRootId(input.task);
  const created = await createTaskInTransaction(sql, {
    actorType: input.task.actorType,
    createdByAgentId: input.failedByAgentId,
    createdByTaskId: input.task.id,
    description: input.task.description,
    goalId: input.task.goalId,
    idempotencyKey: input.task.idempotencyKey,
    idempotencyScope: "active",
    initialComment: {
      authorName: "MattaNutra worker",
      authorType: "system",
      body: `Retry ${retryAttempt} of ${policy.maxRetries} scheduled after task failure.`,
      commentType: "status",
      metadata: {
        failedTaskId: input.task.id,
        retryAttempt
      },
      visibility: "worker"
    },
    maxAttempts: input.task.maxAttempts,
    maxRetries: input.task.maxRetries,
    payload,
    planId: input.task.planId,
    priority: input.task.priority,
    reasoningEffort: input.task.reasoningEffort,
    requiredCapabilities: input.task.requiredCapabilities,
    retryAttempt,
    retryOfTaskId: input.task.id,
    retryPolicy: policy,
    retryRootTaskId,
    scheduledFor,
    taskType: input.task.taskType,
    title: input.task.title
  });

  await addTaskEventInTransaction(sql, {
    agentId: input.failedByAgentId,
    eventPayload: {
      delaySeconds,
      maxRetries: policy.maxRetries,
      retryAttempt,
      retryTaskId: created.task.id,
      scheduledFor: scheduledFor.toISOString()
    },
    eventStatus: created.created ? "requested" : "observed",
    eventType: created.created
      ? "task_retry_scheduled"
      : "task_retry_already_scheduled",
    goalId: input.task.goalId,
    severity: "medium",
    taskId: input.task.id
  });

  return created.task;
}

export async function reserveNextTask(
  input: ReserveNextTaskInput
): Promise<ReservedTask | null> {
  const sql = getRequiredSql();

  await ensureWorkerSessionSchema(sql);

  const workerSessionId = uuidOrNull(input.workerSessionId);

  if (input.workerSessionId && !workerSessionId) {
    throw new Error("Task reservation requires a valid workerSessionId");
  }

  let agent: TaskAgent;

  if (workerSessionId) {
    const agentRows = await sql<AgentRow[]>`
      select agents.*
      from public.worker_sessions
      join public.agents on agents.id = worker_sessions.agent_id
      where worker_sessions.id = ${workerSessionId}::uuid
        and worker_sessions.status <> 'offline'
        and agents.status = 'active'
      limit 1
    `;

    if (!agentRows[0]) {
      throw new Error("Worker session is not active for this agent");
    }

    agent = mapAgent(agentRows[0]);
  } else {
    agent = await upsertAgentInTransaction(sql, {
      capabilities: input.agent.capabilities,
      id: input.agent.id,
      metadata: input.agent.metadata,
      model: input.agent.model,
      name: input.agent.name,
      type: input.agent.type ?? "external"
    });
  }

  const leaseSeconds = normalizeLeaseSeconds(input.leaseSeconds);
  const mustRequireCapability =
    normalizeCapabilities([input.mustRequireCapability])[0] ?? null;
  const taskTypes = normalizeCapabilities(input.taskTypes);
  const reserved = await sql.begin(async (tx) => {
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
        started_at = coalesce(public.tasks.started_at, now()),
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
        worker_session_id,
        status,
        reserved_at,
        lease_until,
        metadata
      )
      values (
        ${reservationId}::uuid,
        ${task.id}::uuid,
        ${agent.id}::uuid,
        ${workerSessionId}::uuid,
        'active',
        now(),
        ${new Date(task.leaseUntil ?? Date.now())},
        ${tx.json(
          toJsonValue({
            capabilities: agent.capabilities,
            workerSessionId
          })
        )}
      )
    `;

    if (workerSessionId) {
      await tx`
        update public.worker_sessions set
          status = 'working',
          current_task_id = ${task.id}::uuid,
          last_seen_at = now(),
          updated_at = now()
        where id = ${workerSessionId}::uuid
      `;
    }

    await addTaskEventInTransaction(tx, {
      agentId: agent.id,
      eventPayload: {
        leaseSeconds,
        reservationId,
        workerSessionId
      },
      eventStatus: "accepted",
      eventType: "task_reserved",
      goalId: task.goalId,
      taskId: task.id
    });

    return {
      agent,
      reservationId,
      task
    };
  });

  if (!reserved) {
    return null;
  }

  const commentRows = await sql<CommentRow[]>`
    select *
    from public.task_comments
    where task_id = ${reserved.task.id}::uuid
    order by created_at asc
  `;

  return {
    ...reserved,
    comments: commentRows.map(mapComment)
  };
}

export async function completeTask(input: CompleteTaskInput) {
  const sql = getRequiredSql();
  const afterCommitEffects: TaskAfterCommitEffect[] = [];

  await ensureWorkerSessionSchema(sql);

  const task = await sql.begin(async (tx) => {
    const activeReservation = await activeReservationInTransaction(tx, {
      agentId: input.agentId,
      reservationId: input.reservationId,
      taskId: input.taskId,
      workerSessionId: input.workerSessionId
    }, { lock: true });
    const taskRows = await tx<TaskRow[]>`
      select *
      from public.tasks
      where id = ${input.taskId}::uuid
      for update
    `;
    const pendingTask = taskRows[0] ? mapTask(taskRows[0]) : null;

    if (
      !pendingTask ||
      ![
        "queued",
        "reserved",
        "running",
        "needs_review",
        "waiting_approval"
      ].includes(pendingTask.status) ||
      (
        activeReservation?.agent_id &&
        pendingTask.reservedByAgentId !== activeReservation.agent_id
      )
    ) {
      throw new Error(`Task ${input.taskId} could not be completed`);
    }

    const resultPayload = payloadRecord(
      input.applyResult
        ? await input.applyResult({
            afterCommit: (effect) => afterCommitEffects.push(effect),
            agentId: input.agentId ?? activeReservation?.agent_id,
            reservationId: activeReservation?.id ?? input.reservationId,
            resultPayload: input.resultPayload ?? {},
            sql: tx,
            task: pendingTask
          })
        : (input.resultPayload ?? {})
    );
    const rows = await tx<TaskRow[]>`
      update public.tasks set
        status = 'completed',
        result_payload = ${tx.json(toJsonValue(resultPayload))},
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

    if (activeReservation?.worker_session_id) {
      await tx`
        update public.worker_sessions set
          status = 'idle',
          current_task_id = null,
          last_seen_at = now(),
          updated_at = now()
        where id = ${activeReservation.worker_session_id}::uuid
      `;
    }

    await addTaskEventInTransaction(tx, {
      agentId: input.agentId ?? activeReservation?.agent_id,
      eventPayload: {
        ...resultPayload,
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

  for (const effect of afterCommitEffects) {
    try {
      await effect();
    } catch (error) {
      console.warn("Task after-commit effect failed", error);
      try {
        await addTaskEvent({
          agentId: input.agentId,
          eventPayload: {
            error: error instanceof Error ? error.message : "After-commit effect failed"
          },
          eventStatus: "failed",
          eventType: "task_after_commit_effect_failed",
          goalId: task.goalId,
          severity: "medium",
          taskId: task.id
        });
      } catch (eventError) {
        console.warn("Unable to record task after-commit effect failure", eventError);
      }
    }
  }

  return task;
}

export async function renewTaskLease(input: RenewTaskLeaseInput) {
  const sql = getRequiredSql();
  const taskId = uuidOrNull(input.taskId);
  const reservationId = uuidOrNull(input.reservationId);
  const agentId = uuidOrNull(input.agentId);
  const workerSessionId = uuidOrNull(input.workerSessionId);

  if (!taskId || (!reservationId && !agentId && !workerSessionId)) {
    throw new Error("Task lease renewal requires a valid taskId and reservationId, agentId, or workerSessionId");
  }

  await ensureWorkerSessionSchema(sql);

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
        and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
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
    if (workerSessionId) {
      await tx`
        update public.worker_sessions
        set
          status = 'working',
          current_task_id = ${taskId}::uuid,
          last_seen_at = now(),
          updated_at = now()
        where id = ${workerSessionId}::uuid
      `;
    }
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
  const afterCommitEffects: TaskAfterCommitEffect[] = [];

  await ensureWorkerSessionSchema(sql);

  const task = await sql.begin(async (tx) => {
    const activeReservation = await activeReservationInTransaction(tx, {
      agentId: input.agentId,
      reservationId: input.reservationId,
      taskId: input.taskId,
      workerSessionId: input.workerSessionId
    }, { lock: true });
    const taskRows = await tx<TaskRow[]>`
      select *
      from public.tasks
      where id = ${input.taskId}::uuid
      for update
    `;
    const pendingTask = taskRows[0] ? mapTask(taskRows[0]) : null;

    if (
      !pendingTask ||
      ["completed", "cancelled", "skipped"].includes(pendingTask.status) ||
      (
        activeReservation?.agent_id &&
        pendingTask.reservedByAgentId !== activeReservation.agent_id
      )
    ) {
      throw new Error(`Task ${input.taskId} could not be failed`);
    }

    const retryWillBeScheduled = taskRetryWillBeScheduled(pendingTask);
    const resultPayload = payloadRecord(
      input.applyFailure
        ? await input.applyFailure({
            afterCommit: (effect) => afterCommitEffects.push(effect),
            agentId: input.agentId ?? activeReservation?.agent_id,
            errorMessage: input.errorMessage,
            reservationId: activeReservation?.id ?? input.reservationId,
            resultPayload: input.resultPayload ?? {},
            retryWillBeScheduled,
            sql: tx,
            task: pendingTask
          })
        : (input.resultPayload ?? {})
    );
    const rows = await tx<TaskRow[]>`
      update public.tasks set
        status = 'failed',
        error_message = ${cleanText(input.errorMessage, "Task failed.")},
        result_payload = ${tx.json(toJsonValue(resultPayload))},
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

    if (activeReservation?.worker_session_id) {
      await tx`
        update public.worker_sessions set
          status = 'idle',
          current_task_id = null,
          last_seen_at = now(),
          updated_at = now()
        where id = ${activeReservation.worker_session_id}::uuid
      `;
    }

    await addTaskEventInTransaction(tx, {
      agentId: input.agentId ?? activeReservation?.agent_id,
      eventPayload: {
        errorMessage: input.errorMessage,
        reservationId: activeReservation?.id,
        resultPayload
      },
      eventStatus: "failed",
      eventType: "task_failed",
      goalId: task.goalId,
      severity: "high",
      taskId: task.id
    });

    await scheduleRetryForFailedTaskInTransaction(tx, {
      errorMessage: input.errorMessage,
      failedByAgentId: input.agentId ?? activeReservation?.agent_id,
      resultPayload,
      task
    });

    await refreshGoalStateInTransaction(tx, task.goalId);

    return task;
  });

  for (const effect of afterCommitEffects) {
    try {
      await effect();
    } catch (error) {
      console.warn("Task failure after-commit effect failed", error);
      try {
        await addTaskEvent({
          agentId: input.agentId,
          eventPayload: {
            error: error instanceof Error ? error.message : "After-commit effect failed"
          },
          eventStatus: "failed",
          eventType: "task_after_commit_effect_failed",
          goalId: task.goalId,
          severity: "medium",
          taskId: task.id
        });
      } catch (eventError) {
        console.warn("Unable to record task failure after-commit effect failure", eventError);
      }
    }
  }

  return task;
}

export async function spawnChildTask(input: SpawnChildTaskInput) {
  const sql = getRequiredSql();

  const parentRows = await sql<TaskRow[]>`
    select *
    from public.tasks
    where id = ${input.parentTaskId}::uuid
    limit 1
  `;

  if (!parentRows[0]) {
    throw new Error(`Parent task ${input.parentTaskId} not found`);
  }

  const parent = mapTask(parentRows[0]);
  const created = await createTaskInTransaction(sql, {
    ...input,
    createdByTaskId: parent.id,
    parentTaskId: parent.id,
    goalId: parent.goalId
  });

  await addTaskEventInTransaction(sql, {
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
}

export {
  buildTaskSequenceDependencyPlan,
  TASK_PRIORITY,
  normalizeTaskPriority
};
export type { TaskDependencyType };
