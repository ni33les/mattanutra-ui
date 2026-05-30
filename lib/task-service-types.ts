import type postgres from "postgres";
import type { AgentRole } from "@/lib/admin-rbac";
import type {
  NormalizedTaskRetryPolicy,
  TaskBusinessValue,
  TaskDependencyType,
  TaskIdempotencyScope,
  TaskRetryPolicyInput
} from "@/lib/task-service-utils";

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
  organisationId: string | null;
  personId: string | null;
  role: AgentRole;
  status: AgentStatus;
  type: AgentType;
  updatedAt: string;
}>;

export type TaskAgentAccessScope = Readonly<{
  agentId: string;
  agentName: string;
  capabilities: string[];
  membershipId: string;
  organisationId: string;
  role: AgentRole;
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
  membershipId: string;
  metadata: unknown;
  status: WorkerSessionStatus;
  taskTypes: string[];
  updatedAt: string;
  workerVersion: string | null;
}>;

export type TaskRecord = Readonly<{
  actorType: TaskActorType;
  attempts: number;
  businessValue: TaskBusinessValue;
  completedAt: string | null;
  context: unknown;
  createdAt: string;
  createdByAgentId: string | null;
  createdByTaskId: string | null;
  description: string | null;
  errorMessage: string | null;
  id: string;
  idempotencyKey: string | null;
  idempotencyScopeKey: string;
  leaseUntil: string | null;
  maxAttempts: number;
  maxRetries: number;
  organisationId: string;
  parentTaskId: string | null;
  payload: unknown;
  planId: string | null;
  rayId: string | null;
  reasoningEffort: TaskReasoningEffort;
  requiredCapabilities: string[];
  reservedByAgentId: string | null;
  resultPayload: unknown;
  retryAttempt: number;
  retryOfTaskId: string | null;
  retryPolicy: NormalizedTaskRetryPolicy | null;
  retryRootTaskId: string | null;
  scheduledFor: string;
  startedAt: string | null;
  status: TaskStatus;
  taskGroupId: string;
  taskType: string;
  title: string;
  updatedAt: string;
  groupLabel: string | null;
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
  task: TaskRecord;
}>;

export type ReservedTask = Readonly<{
  agent: TaskAgent;
  comments: TaskComment[];
  reservationId: string;
  task: TaskRecord;
}>;

export type TaskServiceDb = postgres.Sql | postgres.TransactionSql;

export type AgentRow = {
  capabilities: string[];
  created_at: Date | string;
  endpoint_url: string | null;
  id: string;
  last_seen_at: Date | string | null;
  metadata: unknown;
  model: string | null;
  name: string;
  organisation_id: string | null;
  person_id: string | null;
  role: AgentRole;
  status: AgentStatus;
  agent_type: AgentType;
  updated_at: Date | string;
};

export type WorkerSessionRow = {
  agent_id: string;
  capabilities: string[];
  concurrency: number;
  created_at: Date | string;
  current_task_id: string | null;
  id: string;
  instance_id: string;
  last_seen_at: Date | string | null;
  membership_id: string | null;
  metadata: unknown;
  status: WorkerSessionStatus;
  task_types: string[];
  updated_at: Date | string;
  worker_version: string | null;
};

export type TaskRow = {
  actor_type: TaskActorType;
  attempts: number;
  business_value: number;
  completed_at: Date | string | null;
  context: unknown;
  created_at: Date | string;
  created_by_agent_id: string | null;
  created_by_task_id: string | null;
  description: string | null;
  error_message: string | null;
  id: string;
  idempotency_key: string | null;
  idempotency_scope_key: string;
  lease_until: Date | string | null;
  max_attempts: number;
  max_retries: number;
  organisation_id: string;
  parent_task_id: string | null;
  payload: unknown;
  plan_id: string | null;
  ray_id: string | null;
  reasoning_effort: TaskReasoningEffort;
  required_capabilities: string[];
  reserved_by_agent_id: string | null;
  result_payload: unknown;
  retry_attempt: number;
  retry_of_task_id: string | null;
  retry_policy: unknown;
  retry_root_task_id: string | null;
  scheduled_for: Date | string;
  started_at: Date | string | null;
  status: TaskStatus;
  task_group_id: string;
  task_type: string;
  title: string;
  updated_at: Date | string;
  group_label: string | null;
};

export type CommentRow = {
  agent_id: string | null;
  author_name: string | null;
  author_type: TaskActorType;
  body: string;
  comment_type: TaskCommentType;
  created_at: Date | string;
  id: string;
  metadata: unknown;
  task_id: string;
  visibility: TaskCommentVisibility;
};

export type DependencyRow = {
  created_at: Date | string;
  dependency_type: TaskDependencyType;
  depends_on_task_id: string;
  task_id: string;
};

export type ExpiredReservationRow = TaskRow & {
  reservation_agent_id: string;
  reservation_id: string;
  reservation_membership_id: string | null;
  reservation_worker_session_id: string | null;
};

export type ExpiredReservationClaim = Readonly<{
  exhausted: boolean;
  reservationAgentId: string;
  reservationId: string;
  reservationWorkerSessionId?: string | null;
  retryWillBeScheduled: boolean;
  task: TaskRecord;
}>;

export type CreateTaskInput = Readonly<{
  actorType?: TaskActorType;
  businessValue?: unknown;
  context?: Record<string, unknown>;
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
  idempotencyScopeKey?: string | null;
  initialComment?: Omit<AddTaskCommentInput, "taskId">;
  maxAttempts?: number;
  maxRetries?: unknown;
  organisationId?: string | null;
  parentTaskId?: string | null;
  payload?: Record<string, unknown>;
  planId?: string | null;
  rayId?: string | null;
  reasoningEffort?: TaskReasoningEffort;
  requiredCapabilities?: unknown;
  retryAttempt?: unknown;
  retryOfTaskId?: string | null;
  retryPolicy?: TaskRetryPolicyInput;
  retryRootTaskId?: string | null;
  scheduledFor?: Date | string | null;
  taskGroupId?: string | null;
  groupLabel?: string | null;
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
  severity?: TaskEventSeverity;
  taskId?: string | null;
}>;

export type ReserveNextTaskInput = Readonly<{
  accessScope?: TaskAgentAccessScope | null;
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
  batchLimit?: number;
}>;

export type RetryFailedTaskInput = Readonly<{
  agentId?: string | null;
  taskId: string;
}>;

export type CompleteTaskInput = Readonly<{
  accessScope?: TaskAgentAccessScope | null;
  agentId?: string | null;
  applyResult?: (context: TaskCompletionContext) => Promise<unknown>;
  reservationId?: string | null;
  resultPayload?: Record<string, unknown>;
  taskId: string;
  workerSessionId?: string | null;
}>;

export type TaskAfterCommitEffect = () => Promise<void>;

export type FailTaskInput = Readonly<{
  accessScope?: TaskAgentAccessScope | null;
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
  accessScope?: TaskAgentAccessScope | null;
  agentId?: string | null;
  leaseSeconds?: unknown;
  reservationId?: string | null;
  taskId: string;
  workerSessionId?: string | null;
}>;

export type RegisterWorkerSessionInput = Readonly<{
  accessScope?: TaskAgentAccessScope | null;
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
  accessScope?: TaskAgentAccessScope | null;
  agentId?: string | null;
  currentTaskId?: string | null;
  metadata?: Record<string, unknown>;
  status?: WorkerSessionStatus | null;
  workerSessionId: string;
}>;

export type SpawnChildTaskInput = Omit<CreateTaskInput, "createdByTaskId" | "parentTaskId"> &
  Readonly<{
    accessScope?: TaskAgentAccessScope | null;
    parentTaskId: string;
  }>;

export type TaskSequenceDependencyInput = Readonly<{
  key?: string | null;
  taskId?: string | null;
  type?: TaskDependencyType;
}>;

export type TaskSequenceTaskInput = Omit<CreateTaskInput, "dependencies"> &
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
  taskGroupId?: string | null;
  sequenceKey?: string | null;
  stages: ReadonlyArray<TaskSequenceStageInput>;
}>;

export type CreatedTaskSequence = Readonly<{
  dependencies: TaskDependency[];
  tasks: TaskRecord[];
}>;
