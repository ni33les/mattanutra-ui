import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { toJsonValue } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  buildTaskSequenceDependencyPlan,
  normalizeCapabilities,
  normalizeLeaseSeconds,
  normalizeTaskBusinessValue,
  normalizeTaskIdempotencyScope,
  normalizeTaskDependencyType,
  normalizeTaskRetryPolicy,
  TASK_BUSINESS_VALUE,
  taskRetryDelaySeconds,
  type TaskDependencyType
} from "@/lib/task-service-utils";
import {
  ensureWorkerSessionSchema,
  upsertAgentRecord
} from "@/lib/task-service-agents";
import {
  cleanText,
  errorMessage,
  intersectCapabilities,
  mapAgent,
  mapComment,
  mapDependency,
  mapTask,
  mapWorkerSession,
  nonNegativeInteger,
  normalizedRetryPolicyJson,
  optionalText,
  payloadRecord,
  positiveInteger,
  retryPolicyForTask,
  taskLineageRootId,
  taskRetryWillBeScheduled,
  uuidOrNew,
  uuidOrNull
} from "@/lib/task-service-mappers";
import { notifyTaskQueueChanged } from "@/lib/task-wakeup";
import type {
  AddTaskCommentInput,
  AddTaskEventInput,
  AgentRow,
  CommentRow,
  CompleteTaskInput,
  CreateTaskInput,
  CreateTaskSequenceInput,
  CreatedTaskSequence,
  DependencyRow,
  ExpiredReservationClaim,
  ExpiredReservationRow,
  FailTaskInput,
  ReleaseExpiredReservationsInput,
  RenewTaskLeaseInput,
  ReserveNextTaskInput,
  ReservedTask,
  RetryFailedTaskInput,
  SpawnChildTaskInput,
  TaskAfterCommitEffect,
  TaskAgent,
  TaskAgentAccessScope,
  TaskBundle,
  TaskDependency,
  TaskFailureContext,
  TaskRecord,
  TaskServiceDb,
  TaskRow,
  WorkerSessionRow
} from "@/lib/task-service-types";
export {
  ensureWorkerSessionSchema,
  heartbeatWorkerSession,
  registerWorkerSession,
  upsertAgent
} from "@/lib/task-service-agents";
export type {
  AddTaskCommentInput,
  AddTaskEventInput,
  AgentStatus,
  AgentType,
  CompleteTaskInput,
  CreateTaskInput,
  CreateTaskSequenceInput,
  CreatedTaskSequence,
  FailTaskInput,
  HeartbeatWorkerSessionInput,
  RegisterWorkerSessionInput,
  ReleaseExpiredReservationsInput,
  RenewTaskLeaseInput,
  ReserveNextTaskInput,
  ReservedTask,
  RetryFailedTaskInput,
  SpawnChildTaskInput,
  TaskActorType,
  TaskAfterCommitEffect,
  TaskAgent,
  TaskAgentAccessScope,
  TaskBundle,
  TaskComment,
  TaskCommentType,
  TaskCommentVisibility,
  TaskCompletionContext,
  TaskEventSeverity,
  TaskEventStatus,
  TaskFailureContext,
  TaskReasoningEffort,
  TaskRecord,
  TaskSequenceDependencyInput,
  TaskSequenceStageInput,
  TaskSequenceTaskInput,
  TaskServiceDb,
  TaskStatus,
  WorkerSession,
  WorkerSessionStatus
} from "@/lib/task-service-types";


const TASK_FINALIZATION_LEASE_SECONDS = 300;
const EXPIRED_RESERVATION_SWEEP_BATCH_LIMIT = 50;
const EXPIRED_RESERVATION_SWEEP_BATCH_LIMIT_MAX = 100;
const DEPENDENCY_BOOTSTRAP_DELAY_MS = 60_000;

type Db = TaskServiceDb;
type ActiveReservationRow = {
  agent_id: string;
  id: string;
  membership_id: string | null;
  worker_session_id: string | null;
};
type TaskReservationResultRow = TaskRow & {
  reservation_agent_id: string | null;
  reservation_id: string | null;
  reservation_membership_id: string | null;
  reservation_worker_session_id: string | null;
};
type ExpiredReservationClaimRow = ExpiredReservationRow & {
  exhausted: boolean;
  retry_will_be_scheduled: boolean;
};

function getRequiredSql(sql?: postgres.Sql) {
  const configured = sql ?? getSql();

  if (!configured) {
    throw new Error("Database connection is not configured");
  }

  return configured;
}

function normalizeExpiredReservationSweepLimit(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return EXPIRED_RESERVATION_SWEEP_BATCH_LIMIT;
  }

  return Math.min(
    EXPIRED_RESERVATION_SWEEP_BATCH_LIMIT_MAX,
    Math.max(1, Math.floor(value))
  );
}

function uniqueUuids(values: ReadonlyArray<string | null | undefined>) {
  return [...new Set(values.flatMap((value) => uuidOrNull(value) ?? []))];
}

async function platformOrganisationId(sql: Db) {
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where slug = 'mattanutra'
      and organisation_type = 'platform'
      and status = 'active'
    limit 1
  `;

  if (!rows[0]?.id) {
    throw new Error("Platform organisation is required to create tasks");
  }

  return rows[0].id;
}

function scopeAgentId(
  input: Readonly<{
    accessScope?: TaskAgentAccessScope | null;
    agentId?: string | null;
  }>
) {
  return uuidOrNull(input.accessScope?.agentId ?? input.agentId);
}

function scopeMembershipId(
  input: Readonly<{
    accessScope?: TaskAgentAccessScope | null;
  }>
) {
  return uuidOrNull(input.accessScope?.membershipId);
}

async function ensurePlatformMembershipForAgent(
  sql: Db,
  agent: TaskAgent
): Promise<TaskAgentAccessScope> {
  const organisationId = await platformOrganisationId(sql);

  await sql`
    update public.agents
    set
      organisation_id = coalesce(organisation_id, ${organisationId}::uuid),
      role = 'platform_agent',
      updated_at = now()
    where id = ${agent.id}::uuid
  `;

  const rows = await sql<Array<{ id: string }>>`
    insert into public.organisation_memberships (
      organisation_id,
      principal_type,
      agent_id,
      role,
      status,
      metadata
    )
    values (
      ${organisationId}::uuid,
      'agent',
      ${agent.id}::uuid,
      'platform_agent',
      'active',
      jsonb_build_object('backfilledAt', now(), 'source', 'legacy_task_runtime')
    )
    on conflict (agent_id, organisation_id)
      where principal_type = 'agent' and status <> 'deleted'
    do update set
      role = 'platform_agent',
      status = 'active',
      updated_at = now()
    returning id::text
  `;

  if (!rows[0]?.id) {
    throw new Error("Unable to resolve platform agent membership");
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    capabilities: agent.capabilities,
    membershipId: rows[0].id,
    organisationId,
    role: "platform_agent"
  };
}

async function assertAccessScopeCanAccessTask(
  sql: Db,
  task: Pick<TaskRecord, "id" | "organisationId">,
  accessScope?: TaskAgentAccessScope | null
) {
  if (!accessScope) {
    return;
  }

  const rows = await sql<Array<{ organisation_type: string }>>`
    select organisation_type
    from public.organisations
    where id = ${task.organisationId}::uuid
      and status = 'active'
    limit 1
  `;
  const organisationType = rows[0]?.organisation_type;
  const allowed = accessScope.role === "platform_agent"
    ? organisationType === "platform"
    : organisationType === "tenant" &&
      task.organisationId === accessScope.organisationId;

  if (!allowed) {
    throw new Error(`Agent membership cannot access task ${task.id}`);
  }
}

async function insertTaskEvent(sql: Db, input: AddTaskEventInput) {
  const taskId = uuidOrNull(input.taskId);

  const id = randomUUID();

  await sql`
    insert into public.task_events (
      id,
      task_id,
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

export async function addTaskEventWithDb(
  sql: TaskServiceDb,
  input: AddTaskEventInput
) {
  return insertTaskEvent(sql, input);
}

async function getActiveReservation(
  sql: Db,
  input: Readonly<{
    accessScope?: TaskAgentAccessScope | null;
    agentId?: string | null;
    reservationId?: string | null;
    taskId: string;
    workerSessionId?: string | null;
  }>
) {
  const agentId = scopeAgentId(input);
  const membershipId = scopeMembershipId(input);
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

  const rows = await sql<ActiveReservationRow[]>`
    select id::text, agent_id::text, membership_id::text, worker_session_id::text
    from public.task_reservations
    where task_id = ${input.taskId}::uuid
      and status = 'active'
      and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
      and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
      and (${membershipId}::uuid is null or membership_id = ${membershipId}::uuid)
      and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
    order by reserved_at desc
    limit 1
  `;

  if (!rows[0]) {
    throw new Error(`Active reservation for task ${input.taskId} not found`);
  }

  return rows[0];
}

async function insertTaskComment(
  sql: Db,
  input: AddTaskCommentInput
) {
  const taskId = uuidOrNull(input.taskId);

  if (!taskId) {
    throw new Error("Task comment requires a valid taskId");
  }

  const id = randomUUID();
  const rows = await sql<CommentRow[]>`
    insert into public.task_comments (
      id,
      task_id,
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

  await insertTaskEvent(sql, {
    agentId: input.agentId,
    eventPayload: {
      commentId: id,
      commentType: input.commentType ?? "note",
      visibility: input.visibility ?? "internal"
    },
    eventType: "comment_added",
    taskId
  });

  return mapComment(rows[0]);
}

async function ensureTaskDependencies(
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

async function createTaskRecord(sql: Db, input: CreateTaskInput) {
  const taskId = uuidOrNew(input.id);
  const parentTaskId = uuidOrNull(input.parentTaskId);
  const createdByTaskId = uuidOrNull(input.createdByTaskId);
  const parentContextTaskId = parentTaskId ?? createdByTaskId;
  let inheritedGroupId: string | null = null;
  let inheritedRayId: string | null = null;
  let inheritedPlanId: string | null = null;
  let inheritedOrganisationId: string | null = null;
  let inheritedGroupLabel: string | null = null;

  if (parentContextTaskId) {
    const parentRows = await sql<Array<{
      group_label: string | null;
      organisation_id: string | null;
      plan_id: string | null;
      ray_id: string | null;
      task_group_id: string;
    }>>`
      select
        group_label,
        organisation_id::text,
        plan_id::text,
        ray_id::text,
        task_group_id::text
      from public.tasks
      where id = ${parentContextTaskId}::uuid
      limit 1
    `;
    inheritedGroupId = parentRows[0]?.task_group_id ?? null;
    inheritedRayId = parentRows[0]?.ray_id ?? null;
    inheritedPlanId = parentRows[0]?.plan_id ?? null;
    inheritedOrganisationId = parentRows[0]?.organisation_id ?? null;
    inheritedGroupLabel = parentRows[0]?.group_label ?? null;
  }

  const organisationId =
    uuidOrNull(input.organisationId) ??
    inheritedOrganisationId ??
    await platformOrganisationId(sql);

  if (!organisationId) {
    throw new Error("Task organisation could not be resolved");
  }
  const taskGroupId =
    uuidOrNull(input.taskGroupId) ?? inheritedGroupId ?? taskId;
  const rayId = uuidOrNull(input.rayId) ?? inheritedRayId;
  const planId = uuidOrNull(input.planId) ?? inheritedPlanId;
  const idempotencyKey = optionalText(input.idempotencyKey);
  const idempotencyScopeKey =
    optionalText(input.idempotencyScopeKey) ??
    taskGroupId ??
    cleanText(input.taskType, "unknown");
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
  const businessValue = normalizeTaskBusinessValue(input.businessValue);
  const groupLabel =
    optionalText(input.groupLabel) ??
    inheritedGroupLabel ??
    cleanText(input.title, "Untitled task");
  const dependencies = input.dependencies ?? [];
  const hasDependencyInputs = dependencies.some((dependency) =>
    Boolean(uuidOrNull(dependency.taskId))
  );
  const intendedScheduledFor = input.scheduledFor
    ? new Date(input.scheduledFor)
    : new Date();
  const initialScheduledFor = hasDependencyInputs
    ? new Date(Date.now() + DEPENDENCY_BOOTSTRAP_DELAY_MS)
    : intendedScheduledFor;

	  if (idempotencyKey) {
	    const existing = await sql<TaskRow[]>`
	      select *
	      from public.tasks
	      where idempotency_scope_key = ${idempotencyScopeKey}
	        and idempotency_key = ${idempotencyKey}
	        and organisation_id = ${organisationId}::uuid
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
      const task = mapTask(existing[0]);

      await ensureTaskDependencies(sql, task.id, dependencies);

      return { created: false, task };
    }
  }

  const inserted = await sql<TaskRow[]>`
    insert into public.tasks (
      id,
      organisation_id,
      parent_task_id,
      plan_id,
      ray_id,
      task_group_id,
      group_label,
      task_type,
      title,
      description,
      actor_type,
      status,
      business_value,
      required_capabilities,
      reasoning_effort,
      context,
      payload,
      result_payload,
      idempotency_key,
      idempotency_scope_key,
      scheduled_for,
      attempts,
      max_attempts,
      retry_of_task_id,
      retry_root_task_id,
      retry_attempt,
      max_retries,
      retry_policy,
      created_by_agent_id,
      created_by_task_id,
      created_at,
      updated_at
    )
    values (
      ${taskId}::uuid,
      ${organisationId}::uuid,
      ${parentTaskId}::uuid,
      ${planId}::uuid,
      ${rayId}::uuid,
      ${taskGroupId}::uuid,
      ${groupLabel},
      ${cleanText(input.taskType, "unknown")},
      ${cleanText(input.title, "Untitled task")},
      ${optionalText(input.description)},
      ${input.actorType ?? "system"},
      'queued',
      ${businessValue},
      ${normalizeCapabilities(input.requiredCapabilities)},
      ${input.reasoningEffort ?? "none"},
      ${sql.json(toJsonValue(input.context ?? {}))},
      ${sql.json(toJsonValue(payload))},
      '{}'::jsonb,
      ${idempotencyKey},
      ${idempotencyScopeKey},
      ${initialScheduledFor},
      0,
      ${positiveInteger(input.maxAttempts, 3)},
      ${retryOfTaskId}::uuid,
      ${retryRootTaskId}::uuid,
      ${retryAttempt},
      ${maxRetries},
      ${sql.json(normalizedRetryPolicyJson(retryPolicy))},
      ${uuidOrNull(input.createdByAgentId)}::uuid,
      ${createdByTaskId}::uuid,
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
        where idempotency_scope_key = ${idempotencyScopeKey}
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

  let task = mapTask(taskRow);

  if (!inserted[0]) {
    await ensureTaskDependencies(sql, task.id, dependencies);

    return { created: false, task };
  }

  await ensureTaskDependencies(sql, task.id, dependencies);

  if (hasDependencyInputs) {
    const updatedRows = await sql<TaskRow[]>`
      update public.tasks
      set scheduled_for = ${intendedScheduledFor}
      where id = ${task.id}::uuid
        and status = 'queued'
      returning *
    `;

    if (updatedRows[0]) {
      task = mapTask(updatedRows[0]);
    }
  }

  await insertTaskEvent(sql, {
    agentId: input.createdByAgentId,
    eventPayload: {
      businessValue: task.businessValue,
      idempotencyKey,
      idempotencyScopeKey,
      idempotencyScope,
      maxRetries,
      requiredCapabilities: task.requiredCapabilities,
      retryAttempt,
      retryOfTaskId,
      retryRootTaskId,
      retryPolicy
    },
    eventType: "task_created",
    taskId: task.id
  });

  if (input.initialComment) {
    await insertTaskComment(sql, {
      ...input.initialComment,
      taskId: task.id
    });
  }

  notifyTaskQueueChanged();

  return { created: true, task };
}

export async function createTask(input: CreateTaskInput) {
  const sql = getRequiredSql();

  return createTaskRecord(sql, input);
}

export async function retryFailedTask(input: RetryFailedTaskInput) {
  const sql = getRequiredSql();
  const taskId = uuidOrNull(input.taskId);

  if (!taskId) {
    throw new Error("Task retry requires a valid taskId");
  }

  const taskRows = await sql<TaskRow[]>`
    select *
    from public.tasks
    where id = ${taskId}::uuid
    limit 1
  `;

  if (!taskRows[0]) {
    throw new Error(`Task ${input.taskId} not found`);
  }

  const failedTask = mapTask(taskRows[0]);

  if (failedTask.status !== "failed") {
    throw new Error("Only failed tasks can be retried");
  }

  const existingRetry = await findLaterRetrySuccessor(sql, failedTask);

  if (existingRetry) {
    await insertTaskEvent(sql, {
      agentId: input.agentId,
      eventPayload: {
        failedTaskId: failedTask.id,
        retryAttempt: existingRetry.retryAttempt,
        retryRootTaskId: taskLineageRootId(failedTask),
        retryTaskId: existingRetry.id
      },
      eventStatus: "observed",
      eventType: "task_manual_retry_already_exists",
      severity: "medium",
      taskId: failedTask.id
    });

    return {
      created: false,
      sourceTask: failedTask,
      task: existingRetry
    };
  }

  const retryAttempt = failedTask.retryAttempt + 1;
  const retryRootTaskId = taskLineageRootId(failedTask);
  const retryIdempotencyKey =
    failedTask.idempotencyKey ?? `manual-retry:${retryRootTaskId}:${retryAttempt}`;
  const retryIdempotencyScopeKey =
    failedTask.idempotencyKey ? failedTask.idempotencyScopeKey : `manual-retry:${retryRootTaskId}`;
  const payload = { ...payloadRecord(failedTask.payload) };
  const dependencyRows = await sql<DependencyRow[]>`
    select
      task_id::text,
      depends_on_task_id::text,
      dependency_type,
      created_at
    from public.task_dependencies
    where task_id = ${failedTask.id}::uuid
    order by created_at asc
  `;
  const created = await createTaskRecord(sql, {
    actorType: failedTask.actorType,
    createdByAgentId: input.agentId,
    createdByTaskId: failedTask.id,
    dependencies: dependencyRows.map((dependency) => ({
      taskId: dependency.depends_on_task_id,
      type: dependency.dependency_type
    })),
    description: failedTask.description,
    idempotencyKey: retryIdempotencyKey,
    idempotencyScope: "active",
    idempotencyScopeKey: retryIdempotencyScopeKey,
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
    rayId: failedTask.rayId,
    businessValue: failedTask.businessValue,
    context: payloadRecord(failedTask.context),
    groupLabel: failedTask.groupLabel,
    taskGroupId: failedTask.taskGroupId,
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

  await insertTaskEvent(sql, {
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
    severity: "medium",
    taskId: failedTask.id
  });

  return {
    created: created.created,
    sourceTask: failedTask,
    task: created.task
  };
}

async function createTaskSequenceRecord(
  sql: Db,
  input: CreateTaskSequenceInput
): Promise<CreatedTaskSequence> {
  const plan = buildTaskSequenceDependencyPlan(input.stages);

  if (plan.length < 1) {
    throw new Error("Task sequence requires at least one task");
  }

  const sequenceKey = optionalText(input.sequenceKey);
  let taskGroupId = uuidOrNull(input.taskGroupId);
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
    const created = await createTaskRecord(sql, {
      ...taskInput,
      createdByAgentId: taskInput.createdByAgentId ?? input.createdByAgentId,
      dependencies: [],
      idempotencyKey:
        optionalText(taskInput.idempotencyKey) ??
        (sequenceKey ? `${sequenceKey}:${planItem.key}` : null),
      idempotencyScopeKey: taskInput.idempotencyScopeKey ?? sequenceKey,
      taskGroupId: taskGroupId ?? undefined
    });
    taskGroupId ??= created.task.taskGroupId;
    const savedDependencies = await ensureTaskDependencies(
      sql,
      created.task.id,
      resolvedDependencies
    );

    tasksByKey.set(planItem.key, created.task);
    tasks.push(created.task);
    dependencies.push(...savedDependencies);
  }

  await insertTaskEvent(sql, {
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
    taskId: tasks[0]?.id
  });

  return {
    dependencies,
    tasks
  };
}

export async function createTaskSequence(input: CreateTaskSequenceInput) {
  const sql = getRequiredSql();

  return createTaskSequenceRecord(sql, input);
}

export async function addTaskComment(input: AddTaskCommentInput) {
  const sql = getRequiredSql();

  return insertTaskComment(sql, input);
}

export async function addTaskEvent(input: AddTaskEventInput) {
  const sql = getRequiredSql();

  return insertTaskEvent(sql, input);
}

export async function getTaskBundle(
  input: Readonly<{
    accessScope?: TaskAgentAccessScope | null;
    taskId: string;
  }>
) {
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

  await assertAccessScopeCanAccessTask(sql, task, input.accessScope);

  const [commentRows, dependencyRows] = await Promise.all([
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

  return {
    comments: commentRows.map(mapComment),
    dependencies: dependencyRows.map(mapDependency),
    task
  } satisfies TaskBundle;
}

export async function assertActiveTaskReservation(
  input: Readonly<{
    accessScope?: TaskAgentAccessScope | null;
    agentId?: string | null;
    reservationId?: string | null;
    taskId: string;
    workerSessionId?: string | null;
  }>
) {
  const sql = getRequiredSql();

  await ensureWorkerSessionSchema(sql);

  return getActiveReservation(sql, input);
}

export async function releaseExpiredReservations(
  input: ReleaseExpiredReservationsInput = {}
) {
  const sql = getRequiredSql();
  const afterCommitEffects: TaskAfterCommitEffect[] = [];
  const batchLimit = normalizeExpiredReservationSweepLimit(input.batchLimit);

  const released = await claimExpiredReservationsBatch(sql, batchLimit);

  const releasedWorkerSessionIds = uniqueUuids(
    released.map((claim) => claim.reservationWorkerSessionId)
  );

  if (releasedWorkerSessionIds.length > 0) {
    await sql`
      update public.worker_sessions set
        status = 'idle',
        current_task_id = null,
        updated_at = now()
      where id = any(${releasedWorkerSessionIds}::uuid[])
    `;
  }

  for (const claim of released) {
    if (!claim.exhausted) {
      continue;
    }

    const resultPayload = await applyExpiredReservationFailure(sql, {
      afterCommitEffects,
      applyFailure: input.applyFailure,
      claim
    });

    await updateExpiredFailureResultPayload(sql, {
      resultPayload,
      taskId: claim.task.id
    });

    await scheduleRetryForFailedTask(sql, {
      errorMessage: "Task lease expired after maximum attempts.",
      failedByAgentId: claim.reservationAgentId,
      resultPayload,
      task: claim.task
    });
  }

  if (released.length > 0) {
    notifyTaskQueueChanged();
  }

  await runTaskAfterCommitEffects({
    agentId: null,
    effects: afterCommitEffects,
    taskId: null
  });

  return released.length;
}

async function claimExpiredReservationsBatch(
  sql: Db,
  batchLimit: number
) {
  const rows = await sql<ExpiredReservationClaimRow[]>`
    with expired as (
      select
        task_reservations.id as reservation_id,
        task_reservations.agent_id as reservation_agent_id,
        task_reservations.membership_id as reservation_membership_id,
        task_reservations.worker_session_id as reservation_worker_session_id,
        tasks.id as task_id,
        (tasks.attempts >= tasks.max_attempts) as exhausted,
        (
          tasks.idempotency_key is not null
          and tasks.retry_attempt < tasks.max_retries
        ) as retry_will_be_scheduled
      from public.task_reservations
      join public.tasks on tasks.id = task_reservations.task_id
      where task_reservations.status = 'active'
        and task_reservations.lease_until < now()
        and tasks.status in ('reserved', 'running')
      order by task_reservations.lease_until asc
      limit ${batchLimit}
      for update skip locked
    ),
    released as (
      update public.task_reservations set
        status = 'expired',
        released_at = now()
      from expired
      where task_reservations.id = expired.reservation_id
      returning
        expired.reservation_id,
        expired.reservation_agent_id,
        expired.reservation_membership_id,
        expired.reservation_worker_session_id,
        expired.task_id,
        expired.exhausted,
        expired.retry_will_be_scheduled
    ),
    updated_tasks as (
      update public.tasks set
        status = case when released.exhausted then 'failed' else 'queued' end,
        reserved_by_agent_id = null,
        lease_until = null,
        error_message = case
          when released.exhausted then 'Task lease expired after maximum attempts.'
          else null
        end,
        result_payload = case
          when released.exhausted then '{}'::jsonb
          else public.tasks.result_payload
        end,
        updated_at = now()
      from released
      where public.tasks.id = released.task_id
        and public.tasks.status in ('reserved', 'running')
      returning
        public.tasks.*,
        released.reservation_id::text as reservation_id,
        released.reservation_agent_id::text as reservation_agent_id,
        released.reservation_membership_id::text as reservation_membership_id,
        released.reservation_worker_session_id::text as reservation_worker_session_id,
        released.exhausted,
        released.retry_will_be_scheduled
    ),
    task_events as (
      insert into public.task_events (
        id,
        task_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        updated_tasks.id,
        updated_tasks.reservation_agent_id::uuid,
        case
          when updated_tasks.exhausted then 'task_failed_after_lease_expiry'
          else 'lease_expired'
        end,
        case when updated_tasks.exhausted then 'failed' else 'observed' end,
        case when updated_tasks.exhausted then 'high' else 'medium' end,
        jsonb_build_object(
          'exhausted', updated_tasks.exhausted,
          'reservationId', updated_tasks.reservation_id,
          'retryWillBeScheduled', updated_tasks.retry_will_be_scheduled
        ),
        now(),
        now()
      from updated_tasks
      returning id
    )
    select *
    from updated_tasks
  `;

  return rows.map((row) => ({
    exhausted: row.exhausted,
    reservationAgentId: row.reservation_agent_id,
    reservationId: row.reservation_id,
    reservationWorkerSessionId: row.reservation_worker_session_id,
    retryWillBeScheduled: row.retry_will_be_scheduled,
    task: mapTask(row)
  }));
}

async function taskHasSuccessfulRetry(sql: Db, task: TaskRecord) {
  if (!task.idempotencyKey) {
    return false;
  }

  const lineageRootId = taskLineageRootId(task);
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.tasks
    where status in ('completed', 'skipped')
      and (
        (
          coalesce(retry_root_task_id, id) = ${lineageRootId}::uuid
          and retry_attempt > ${task.retryAttempt}
        )
        or (
          idempotency_key = ${task.idempotencyKey}
          and idempotency_scope_key = ${task.idempotencyScopeKey}
          and created_at > ${new Date(task.createdAt)}
        )
      )
    order by created_at desc
    limit 1
  `;

  return Boolean(rows[0]);
}

async function findLaterRetrySuccessor(
  sql: Db,
  task: TaskRecord
) {
  const lineageRootId = taskLineageRootId(task);
  const rows = await sql<TaskRow[]>`
    select successor.*
    from public.tasks as successor
    where successor.id <> ${task.id}::uuid
      and successor.status <> 'cancelled'
      and (
        (
          coalesce(successor.retry_root_task_id, successor.id) = ${lineageRootId}::uuid
          and successor.retry_attempt > ${task.retryAttempt}
        )
        or (
          ${task.idempotencyKey}::text is not null
          and successor.idempotency_key = ${task.idempotencyKey}
          and successor.idempotency_scope_key = ${task.idempotencyScopeKey}
          and successor.created_at > ${new Date(task.createdAt)}
        )
      )
    order by successor.created_at desc
    limit 1
  `;

  return rows[0] ? mapTask(rows[0]) : null;
}

async function scheduleRetryForFailedTaskFromRecord(
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

  if (await taskHasSuccessfulRetry(sql, input.task)) {
    await insertTaskEvent(sql, {
      agentId: input.failedByAgentId,
      eventPayload: {
        idempotencyKey: input.task.idempotencyKey,
        retryReason: "successful_retry_exists"
      },
      eventStatus: "observed",
      eventType: "task_retry_not_needed",
      taskId: input.task.id
    });

    return null;
  }

  const retryAttempt = input.task.retryAttempt + 1;

  if (retryAttempt > policy.maxRetries) {
    await insertTaskEvent(sql, {
      agentId: input.failedByAgentId,
      eventPayload: {
        maxRetries: policy.maxRetries,
        retryAttempt
      },
      eventStatus: "failed",
      eventType: "task_retry_exhausted",
      severity: "high",
      taskId: input.task.id
    });

    return null;
  }

  const delaySeconds = taskRetryDelaySeconds(retryAttempt, policy);
  const scheduledFor = new Date(Date.now() + delaySeconds * 1000);
  const payload = payloadRecord(input.task.payload);
  const retryRootTaskId = taskLineageRootId(input.task);
  const created = await createTaskRecord(sql, {
    actorType: input.task.actorType,
    createdByAgentId: input.failedByAgentId,
    createdByTaskId: input.task.id,
    description: input.task.description,
    idempotencyKey: input.task.idempotencyKey,
    idempotencyScope: "active",
    idempotencyScopeKey: input.task.idempotencyScopeKey,
    initialComment: {
      authorName: "MattaNutra agent",
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
    rayId: input.task.rayId,
    businessValue: input.task.businessValue,
    context: payloadRecord(input.task.context),
    groupLabel: input.task.groupLabel,
    taskGroupId: input.task.taskGroupId,
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

  await insertTaskEvent(sql, {
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
    severity: "medium",
    taskId: input.task.id
  });

  return created.task;
}

async function scheduleRetryForFailedTask(
  sql: postgres.Sql,
  input: Readonly<{
    errorMessage: string;
    failedByAgentId?: string | null;
    resultPayload?: Record<string, unknown>;
    task: TaskRecord;
  }>
) {
  try {
    const taskRows = await sql<TaskRow[]>`
      select *
      from public.tasks
      where id = ${input.task.id}::uuid
        and status = 'failed'
      limit 1
    `;

    if (!taskRows[0]) {
      return null;
    }

    return scheduleRetryForFailedTaskFromRecord(sql, {
      ...input,
      task: mapTask(taskRows[0])
    });
  } catch (error) {
    await addTaskEvent({
      agentId: input.failedByAgentId,
      eventPayload: {
        error: errorMessage(error, "Unable to schedule retry."),
        failedTaskId: input.task.id
      },
      eventStatus: "failed",
      eventType: "task_retry_schedule_failed",
      severity: "high",
      taskId: input.task.id
    });
    return null;
  }
}

async function applyExpiredReservationFailure(
  sql: postgres.Sql,
  input: Readonly<{
    afterCommitEffects: TaskAfterCommitEffect[];
    applyFailure?: (context: TaskFailureContext) => Promise<unknown>;
    claim: ExpiredReservationClaim;
  }>
) {
  if (!input.applyFailure) {
    return {};
  }

  try {
    return payloadRecord(
      await input.applyFailure({
        afterCommit: (effect) => input.afterCommitEffects.push(effect),
        agentId: input.claim.reservationAgentId,
        errorMessage: "Task lease expired after maximum attempts.",
        reservationId: input.claim.reservationId,
        resultPayload: {},
        retryWillBeScheduled: input.claim.retryWillBeScheduled,
        sql,
        task: input.claim.task
      })
    );
  } catch (error) {
    const message = errorMessage(error, "Task failure side effect failed.");

    await addTaskEvent({
      agentId: input.claim.reservationAgentId,
      eventPayload: {
        error: message,
        reservationId: input.claim.reservationId,
        stage: "expired_reservation_failure_application"
      },
      eventStatus: "failed",
      eventType: "task_failure_result_apply_failed",
      severity: "high",
      taskId: input.claim.task.id
    });

    return {
      failureApplicationError: message
    };
  }
}

async function updateExpiredFailureResultPayload(
  sql: postgres.Sql,
  input: Readonly<{
    resultPayload: Record<string, unknown>;
    taskId: string;
  }>
) {
  await sql`
    update public.tasks set
      result_payload = ${sql.json(toJsonValue(input.resultPayload))}::jsonb,
      updated_at = now()
    where id = ${input.taskId}::uuid
      and status = 'failed'
  `;
}

async function runTaskAfterCommitEffects(
  input: Readonly<{
    agentId?: string | null;
    effects: readonly TaskAfterCommitEffect[];
    taskId?: string | null;
  }>
) {
  for (const effect of input.effects) {
    try {
      await effect();
    } catch (error) {
      console.warn("Task after-commit effect failed", error);
      try {
        await addTaskEvent({
          agentId: input.agentId,
          eventPayload: {
            error: errorMessage(error, "After-commit effect failed.")
          },
          eventStatus: "failed",
          eventType: "task_after_commit_effect_failed",
          severity: "medium",
          taskId: input.taskId
        });
      } catch (eventError) {
        console.warn("Unable to record task after-commit effect failure", eventError);
      }
    }
  }
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
  let accessScope: TaskAgentAccessScope;
  let registeredTaskTypes: string[] = [];
  let reserveCapabilities: string[] = [];

  if (workerSessionId) {
    const hasAuthenticatedScope = Boolean(input.accessScope);
    const sessionRows = await sql<Array<{
      agent: AgentRow;
      membership_id: string;
      organisation_id: string;
      role: string;
      session: WorkerSessionRow;
    }>>`
      select
        to_jsonb(agents.*) as agent,
        organisation_memberships.id::text as membership_id,
        organisation_memberships.organisation_id::text as organisation_id,
        organisation_memberships.role,
        to_jsonb(worker_sessions.*) as session
      from public.worker_sessions
      join public.agents on agents.id = worker_sessions.agent_id
      join public.organisation_memberships
        on organisation_memberships.id = worker_sessions.membership_id
        and organisation_memberships.agent_id = worker_sessions.agent_id
        and organisation_memberships.principal_type = 'agent'
      join public.organisations
        on organisations.id = organisation_memberships.organisation_id
      where worker_sessions.id = ${workerSessionId}::uuid
        and worker_sessions.status <> 'offline'
        and agents.status = 'active'
        and organisation_memberships.status = 'active'
        and organisations.status = 'active'
        and (${input.accessScope?.agentId ?? null}::uuid is null or agents.id = ${input.accessScope?.agentId ?? null}::uuid)
        and (${input.accessScope?.membershipId ?? null}::uuid is null or organisation_memberships.id = ${input.accessScope?.membershipId ?? null}::uuid)
        and (
          ${hasAuthenticatedScope}
          or (
            organisation_memberships.role = 'platform_agent'
            and organisations.organisation_type = 'platform'
          )
        )
      limit 1
    `;
    const sessionRow = sessionRows[0];

    if (!sessionRow) {
      throw new Error("Worker session is not active for this agent");
    }

    agent = mapAgent(sessionRow.agent);
    const session = mapWorkerSession(sessionRow.session);
    accessScope = {
      agentId: agent.id,
      agentName: agent.name,
      capabilities: agent.capabilities,
      membershipId: sessionRow.membership_id,
      organisationId: sessionRow.organisation_id,
      role: sessionRow.role === "retail_agent" ? "retail_agent" : "platform_agent"
    };
    agent = {
      ...agent,
      organisationId: accessScope.organisationId,
      role: accessScope.role
    };
    reserveCapabilities = intersectCapabilities(
      accessScope.capabilities,
      session.capabilities
    );
    registeredTaskTypes = session.taskTypes;
  } else if (input.accessScope) {
    const agentRows = await sql<AgentRow[]>`
      update public.agents set
        last_seen_at = now(),
        updated_at = now()
      where id = ${input.accessScope.agentId}::uuid
        and status = 'active'
      returning *
    `;

    if (!agentRows[0]) {
      throw new Error("Agent is not active");
    }

    accessScope = input.accessScope;
    agent = {
      ...mapAgent(agentRows[0]),
      capabilities: accessScope.capabilities,
      name: accessScope.agentName,
      organisationId: accessScope.organisationId,
      role: accessScope.role
    };
    reserveCapabilities = accessScope.capabilities;
  } else {
    agent = await upsertAgentRecord(sql, {
      capabilities: input.agent.capabilities,
      id: input.agent.id,
      metadata: input.agent.metadata,
      model: input.agent.model,
      name: input.agent.name,
      type: input.agent.type ?? "external"
    });
    accessScope = await ensurePlatformMembershipForAgent(sql, agent);
    reserveCapabilities = accessScope.capabilities;
  }

  const leaseSeconds = normalizeLeaseSeconds(input.leaseSeconds);
  const mustRequireCapability =
    normalizeCapabilities([input.mustRequireCapability])[0] ?? null;
  const requestedTaskTypes = normalizeCapabilities(input.taskTypes);
  const taskTypes = registeredTaskTypes.length > 0
    ? requestedTaskTypes.length > 0
      ? intersectCapabilities(requestedTaskTypes, registeredTaskTypes)
      : registeredTaskTypes
    : requestedTaskTypes;

  if (
    (mustRequireCapability && !reserveCapabilities.includes(mustRequireCapability)) ||
    (requestedTaskTypes.length > 0 && registeredTaskTypes.length > 0 && taskTypes.length < 1)
  ) {
    return null;
  }

  const reservationId = randomUUID();
  const rows = await sql<Array<TaskRow & { reservation_id: string }>>`
    with candidate as (
      select tasks.*
      from public.tasks
      join public.organisations task_organisations
        on task_organisations.id = tasks.organisation_id
      where tasks.status = 'queued'
        and tasks.scheduled_for <= now()
        and tasks.attempts < tasks.max_attempts
        and not exists (
          select 1
          from public.task_reservations
          where task_reservations.task_id = tasks.id
            and task_reservations.status = 'active'
        )
        and (
          coalesce(cardinality(tasks.required_capabilities), 0) = 0
          or tasks.required_capabilities <@ ${reserveCapabilities}::text[]
        )
        and (
          ${mustRequireCapability}::text is null
          or ${mustRequireCapability} = any(tasks.required_capabilities)
        )
        and (
          ${taskTypes.length < 1}
          or tasks.task_type = any(${taskTypes}::text[])
        )
        and (
          (
            ${accessScope.role}::text = 'platform_agent'
            and task_organisations.organisation_type = 'platform'
          )
          or (
            ${accessScope.role}::text = 'retail_agent'
            and task_organisations.organisation_type = 'tenant'
            and tasks.organisation_id = ${accessScope.organisationId}::uuid
          )
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
      order by
        (
          tasks.business_value
          + least(
            200,
            floor(greatest(0, extract(epoch from now() - tasks.scheduled_for) - 300) / 900) * 10
          )
        ) desc,
        tasks.scheduled_for asc,
        tasks.created_at asc
      limit 1
      for update skip locked
    ),
    claimed_task as (
      update public.tasks set
        status = 'reserved',
        reserved_by_agent_id = ${accessScope.agentId}::uuid,
        lease_until = now() + make_interval(secs => ${leaseSeconds}),
        started_at = coalesce(public.tasks.started_at, now()),
        attempts = public.tasks.attempts + 1,
        updated_at = now()
      from candidate
      where public.tasks.id = candidate.id
      returning public.tasks.*
    ),
    reservation as (
      insert into public.task_reservations (
        id,
        task_id,
        agent_id,
        membership_id,
        worker_session_id,
        status,
        reserved_at,
        lease_until,
        metadata
      )
      select
        ${reservationId}::uuid,
        claimed_task.id,
        ${accessScope.agentId}::uuid,
        ${accessScope.membershipId}::uuid,
        ${workerSessionId}::uuid,
        'active',
        now(),
        coalesce(claimed_task.lease_until, now()),
        ${sql.json(
          toJsonValue({
            capabilities: reserveCapabilities,
            membershipId: accessScope.membershipId,
            organisationId: accessScope.organisationId,
            registeredTaskTypes,
            requestedTaskTypes,
            role: accessScope.role,
            workerSessionId
          })
        )}::jsonb
      from claimed_task
      returning id::text
    ),
    task_event as (
      insert into public.task_events (
        id,
        task_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        claimed_task.id,
        ${accessScope.agentId}::uuid,
        'task_reserved',
        'accepted',
        'low',
        jsonb_build_object(
          'leaseSeconds', ${leaseSeconds}::integer,
          'reservationId', reservation.id,
          'workerSessionId', ${workerSessionId}::text
        ),
        now(),
        now()
      from claimed_task
      join reservation on true
      returning id
    )
    select claimed_task.*, reservation.id as reservation_id
    from claimed_task
    join reservation on true
  `;

  const reserved = rows[0]
    ? {
        agent,
        reservationId: rows[0].reservation_id,
        task: mapTask(rows[0])
      }
    : null;

  if (!reserved) {
    return null;
  }

  if (workerSessionId) {
    await sql`
      update public.worker_sessions set
        status = 'working',
        current_task_id = ${reserved.task.id}::uuid,
        last_seen_at = now(),
        updated_at = now()
      where id = ${workerSessionId}::uuid
        and agent_id = ${accessScope.agentId}::uuid
        and membership_id = ${accessScope.membershipId}::uuid
    `;
  }

  notifyTaskQueueChanged();

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

async function claimTaskCompletionApplication(
  sql: postgres.Sql,
  input: CompleteTaskInput
) {
  const taskId = uuidOrNull(input.taskId);
  const reservationId = uuidOrNull(input.reservationId);
  const agentId = scopeAgentId(input);
  const membershipId = scopeMembershipId(input);
  const workerSessionId = uuidOrNull(input.workerSessionId);

  if (!taskId) {
    throw new Error("Task completion requires a valid taskId");
  }

  if (input.reservationId && !reservationId) {
    throw new Error("Task completion requires a valid reservationId");
  }

  if (input.agentId && !agentId) {
    throw new Error("Task completion requires a valid agentId");
  }

  if (input.workerSessionId && !workerSessionId) {
    throw new Error("Task completion requires a valid workerSessionId");
  }

  const requiresReservation = Boolean(reservationId || agentId || workerSessionId);
  const rows = await sql<TaskReservationResultRow[]>`
    with active_reservation as (
      select id, agent_id, membership_id, worker_session_id
      from public.task_reservations
      where task_id = ${taskId}::uuid
        and status = 'active'
        and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
        and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
        and (${membershipId}::uuid is null or membership_id = ${membershipId}::uuid)
        and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
      order by reserved_at desc
      limit 1
    ),
    extended_reservation as (
      update public.task_reservations set
        lease_until = greatest(
          lease_until,
          now() + make_interval(secs => ${TASK_FINALIZATION_LEASE_SECONDS})
        ),
        heartbeat_at = now(),
        metadata = metadata || jsonb_build_object(
          'finalizationLeaseExtendedAt', now()
        )
      from active_reservation
      where task_reservations.id = active_reservation.id
      returning
        active_reservation.id::text,
        active_reservation.agent_id::text,
        active_reservation.membership_id::text,
        active_reservation.worker_session_id::text
    ),
    reservation_info as (
      select * from extended_reservation
      union all
      select null::text, null::text, null::text, null::text
      where ${!requiresReservation}
    ),
    updated_task as (
      update public.tasks set
        status = 'running',
        lease_until = greatest(
          coalesce(public.tasks.lease_until, now()),
          now() + make_interval(secs => ${TASK_FINALIZATION_LEASE_SECONDS})
        ),
        updated_at = now()
      from reservation_info
      where public.tasks.id = ${taskId}::uuid
        and public.tasks.status in ('queued', 'reserved', 'running', 'needs_review', 'waiting_approval')
        and (${!requiresReservation} or reservation_info.id is not null)
        and (
          reservation_info.agent_id is null
          or public.tasks.reserved_by_agent_id = reservation_info.agent_id::uuid
        )
      returning
        public.tasks.*,
        reservation_info.id as reservation_id,
        reservation_info.agent_id as reservation_agent_id,
        reservation_info.membership_id as reservation_membership_id,
        reservation_info.worker_session_id as reservation_worker_session_id
    ),
    task_event as (
      insert into public.task_events (
        id,
        task_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        updated_task.id,
        coalesce(${agentId}::uuid, updated_task.reservation_agent_id::uuid),
        'task_completion_result_applying',
        'accepted',
        'low',
        jsonb_build_object(
          'reservationId', updated_task.reservation_id,
          'stage', 'completion_result_application'
        ),
        now(),
        now()
      from updated_task
      returning id
    )
    select *
    from updated_task
  `;
  const row = rows[0];

  if (!row) {
    throw new Error(`Task ${input.taskId} could not be completed`);
  }

  return {
    activeReservation: row.reservation_id
      ? {
          agent_id: row.reservation_agent_id ?? "",
          id: row.reservation_id,
          membership_id: row.reservation_membership_id,
          worker_session_id: row.reservation_worker_session_id
        }
      : null,
    task: mapTask(row)
  };
}

async function finalizeTaskCompletion(
  sql: postgres.Sql,
  input: Readonly<{
    claim: Awaited<ReturnType<typeof claimTaskCompletionApplication>>;
    completionInput: CompleteTaskInput;
    resultPayload: Record<string, unknown>;
  }>
) {
  const taskId = uuidOrNull(input.completionInput.taskId);
  const agentId =
    scopeAgentId(input.completionInput) ??
    input.claim.activeReservation?.agent_id ??
    null;
  const membershipId =
    scopeMembershipId(input.completionInput) ??
    input.claim.activeReservation?.membership_id ??
    null;
  const reservationId =
    uuidOrNull(input.completionInput.reservationId) ??
    input.claim.activeReservation?.id ??
    null;
  const workerSessionId =
    uuidOrNull(input.completionInput.workerSessionId) ??
    input.claim.activeReservation?.worker_session_id ??
    null;
  const requiresReservation = Boolean(reservationId || agentId || workerSessionId);

  if (!taskId) {
    throw new Error("Task completion requires a valid taskId");
  }

  const rows = await sql<TaskReservationResultRow[]>`
    with active_reservation as (
      select id, agent_id, membership_id, worker_session_id
      from public.task_reservations
      where task_id = ${taskId}::uuid
        and status = 'active'
        and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
        and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
        and (${membershipId}::uuid is null or membership_id = ${membershipId}::uuid)
        and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
      order by reserved_at desc
      limit 1
    ),
    reservation_info as (
      select id::text, agent_id::text, membership_id::text, worker_session_id::text
      from active_reservation
      union all
      select null::text, null::text, null::text, null::text
      where ${!requiresReservation}
    ),
    updated_task as (
      update public.tasks set
        status = 'completed',
        result_payload = ${sql.json(toJsonValue(input.resultPayload))}::jsonb,
        completed_at = now(),
        lease_until = null,
        reserved_by_agent_id = null,
        updated_at = now()
      from reservation_info
      where public.tasks.id = ${taskId}::uuid
        and public.tasks.status = 'running'
        and (${!requiresReservation} or reservation_info.id is not null)
        and (
          reservation_info.agent_id is null
          or public.tasks.reserved_by_agent_id = reservation_info.agent_id::uuid
        )
      returning
        public.tasks.*,
        reservation_info.id as reservation_id,
        reservation_info.agent_id as reservation_agent_id,
        reservation_info.membership_id as reservation_membership_id,
        reservation_info.worker_session_id as reservation_worker_session_id
    ),
    updated_reservation as (
      update public.task_reservations set
        status = 'completed',
        completed_at = now()
      from updated_task
      where task_reservations.id = updated_task.reservation_id::uuid
        and task_reservations.status = 'active'
      returning task_reservations.id
    ),
    task_event as (
      insert into public.task_events (
        id,
        task_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        updated_task.id,
        coalesce(${agentId}::uuid, updated_task.reservation_agent_id::uuid),
        'task_completed',
        'succeeded',
        'low',
        ${sql.json(toJsonValue(input.resultPayload))}::jsonb ||
          jsonb_build_object('reservationId', updated_task.reservation_id),
        now(),
        now()
      from updated_task
      returning id
    )
    select *
    from updated_task
  `;
  const row = rows[0];

  if (!row) {
    throw new Error(`Task ${input.completionInput.taskId} could not be completed`);
  }

  if (row.reservation_worker_session_id) {
    await sql`
      update public.worker_sessions set
        status = 'idle',
        current_task_id = null,
        last_seen_at = now(),
        updated_at = now()
	      where id = ${row.reservation_worker_session_id}::uuid
        and (${row.reservation_membership_id ?? null}::uuid is null or membership_id = ${row.reservation_membership_id ?? null}::uuid)
    `;
  }

  return mapTask(row);
}

export async function completeTask(input: CompleteTaskInput) {
  const sql = getRequiredSql();
  const afterCommitEffects: TaskAfterCommitEffect[] = [];

  await ensureWorkerSessionSchema(sql);

  const claim = await claimTaskCompletionApplication(sql, input);
  let resultPayload: Record<string, unknown>;

  try {
    resultPayload = payloadRecord(
      input.applyResult
        ? await input.applyResult({
            afterCommit: (effect) => afterCommitEffects.push(effect),
            agentId: input.accessScope?.agentId ?? input.agentId ?? claim.activeReservation?.agent_id,
            reservationId: claim.activeReservation?.id ?? input.reservationId,
            resultPayload: input.resultPayload ?? {},
            sql,
            task: claim.task
          })
        : (input.resultPayload ?? {})
    );
  } catch (error) {
    await addTaskEvent({
      agentId: input.accessScope?.agentId ?? input.agentId ?? claim.activeReservation?.agent_id,
      eventPayload: {
        error: errorMessage(error, "Task completion side effect failed."),
        reservationId: claim.activeReservation?.id,
        stage: "completion_result_application"
      },
      eventStatus: "failed",
      eventType: "task_completion_result_apply_failed",
      severity: "high",
      taskId: claim.task.id
    });
    notifyTaskQueueChanged();
    throw error;
  }

  const task = await finalizeTaskCompletion(sql, {
    claim,
    completionInput: input,
    resultPayload
  });

  notifyTaskQueueChanged();

  await runTaskAfterCommitEffects({
    agentId: input.accessScope?.agentId ?? input.agentId ?? claim.activeReservation?.agent_id,
    effects: afterCommitEffects,
    taskId: task.id
  });

  return task;
}

export async function renewTaskLease(input: RenewTaskLeaseInput) {
  const sql = getRequiredSql();
  const taskId = uuidOrNull(input.taskId);
  const reservationId = uuidOrNull(input.reservationId);
  const agentId = scopeAgentId(input);
  const membershipId = scopeMembershipId(input);
  const workerSessionId = uuidOrNull(input.workerSessionId);

  if (!taskId || (!reservationId && !agentId && !workerSessionId)) {
    throw new Error("Task lease renewal requires a valid taskId and reservationId, agentId, or workerSessionId");
  }

  await ensureWorkerSessionSchema(sql);

  const leaseSeconds = normalizeLeaseSeconds(input.leaseSeconds);
  const rows = await sql<TaskReservationResultRow[]>`
    with active_reservation as (
      select id, agent_id, membership_id, worker_session_id
      from public.task_reservations
      where task_id = ${taskId}::uuid
        and status = 'active'
        and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
        and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
        and (${membershipId}::uuid is null or membership_id = ${membershipId}::uuid)
        and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
      order by reserved_at desc
      limit 1
    ),
    updated_task as (
      update public.tasks set
        lease_until = now() + make_interval(secs => ${leaseSeconds}),
        updated_at = now()
      from active_reservation
      where public.tasks.id = ${taskId}::uuid
        and public.tasks.reserved_by_agent_id = active_reservation.agent_id
        and public.tasks.status in ('reserved', 'running')
      returning
        public.tasks.*,
        active_reservation.id::text as reservation_id,
        active_reservation.agent_id::text as reservation_agent_id,
        active_reservation.membership_id::text as reservation_membership_id,
        active_reservation.worker_session_id::text as reservation_worker_session_id
    ),
    updated_reservation as (
      update public.task_reservations set
        lease_until = updated_task.lease_until,
        heartbeat_at = now()
      from updated_task
      where task_reservations.id = updated_task.reservation_id::uuid
      returning task_reservations.id
    ),
    task_event as (
      insert into public.task_events (
        id,
        task_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        updated_task.id,
        updated_task.reservation_agent_id::uuid,
        'task_lease_renewed',
        'accepted',
        'low',
        jsonb_build_object(
          'leaseSeconds', ${leaseSeconds}::integer,
          'reservationId', updated_task.reservation_id
        ),
        now(),
        now()
      from updated_task
      returning id
    )
    select *
    from updated_task
  `;
  const row = rows[0];

  if (!row) {
    throw new Error(`Task ${taskId} is not currently renewable`);
  }

  if (workerSessionId) {
    await sql`
      update public.worker_sessions
      set
        status = 'working',
        current_task_id = ${taskId}::uuid,
        last_seen_at = now(),
        updated_at = now()
      where id = ${workerSessionId}::uuid
        and (${row.reservation_membership_id ?? null}::uuid is null or membership_id = ${row.reservation_membership_id ?? null}::uuid)
    `;
  }

  if (row.reservation_agent_id) {
    await sql`
      update public.agents
      set
        last_seen_at = now(),
        updated_at = now()
      where id = ${row.reservation_agent_id}::uuid
    `;
  }

  return {
    reservationId: row.reservation_id ?? "",
    task: mapTask(row)
  };
}

async function claimTaskFailureApplication(
  sql: postgres.Sql,
  input: FailTaskInput
) {
  const taskId = uuidOrNull(input.taskId);
  const reservationId = uuidOrNull(input.reservationId);
  const agentId = scopeAgentId(input);
  const membershipId = scopeMembershipId(input);
  const workerSessionId = uuidOrNull(input.workerSessionId);

  if (!taskId) {
    throw new Error("Task failure requires a valid taskId");
  }

  if (input.reservationId && !reservationId) {
    throw new Error("Task failure requires a valid reservationId");
  }

  if (input.agentId && !agentId) {
    throw new Error("Task failure requires a valid agentId");
  }

  if (input.workerSessionId && !workerSessionId) {
    throw new Error("Task failure requires a valid workerSessionId");
  }

  const requiresReservation = Boolean(reservationId || agentId || workerSessionId);
  const rows = await sql<TaskReservationResultRow[]>`
    with active_reservation as (
      select id, agent_id, membership_id, worker_session_id
      from public.task_reservations
      where task_id = ${taskId}::uuid
        and status = 'active'
        and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
        and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
        and (${membershipId}::uuid is null or membership_id = ${membershipId}::uuid)
        and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
      order by reserved_at desc
      limit 1
    ),
    extended_reservation as (
      update public.task_reservations set
        lease_until = greatest(
          lease_until,
          now() + make_interval(secs => ${TASK_FINALIZATION_LEASE_SECONDS})
        ),
        heartbeat_at = now(),
        metadata = metadata || jsonb_build_object(
          'finalizationLeaseExtendedAt', now()
        )
      from active_reservation
      where task_reservations.id = active_reservation.id
      returning
        active_reservation.id::text,
        active_reservation.agent_id::text,
        active_reservation.membership_id::text,
        active_reservation.worker_session_id::text
    ),
    reservation_info as (
      select * from extended_reservation
      union all
      select null::text, null::text, null::text, null::text
      where ${!requiresReservation}
    ),
    updated_task as (
      update public.tasks set
        status = 'running',
        lease_until = greatest(
          coalesce(public.tasks.lease_until, now()),
          now() + make_interval(secs => ${TASK_FINALIZATION_LEASE_SECONDS})
        ),
        updated_at = now()
      from reservation_info
      where public.tasks.id = ${taskId}::uuid
        and public.tasks.status not in ('completed', 'cancelled', 'skipped')
        and (${!requiresReservation} or reservation_info.id is not null)
        and (
          reservation_info.agent_id is null
          or public.tasks.reserved_by_agent_id = reservation_info.agent_id::uuid
        )
      returning
        public.tasks.*,
        reservation_info.id as reservation_id,
        reservation_info.agent_id as reservation_agent_id,
        reservation_info.membership_id as reservation_membership_id,
        reservation_info.worker_session_id as reservation_worker_session_id
    ),
    task_event as (
      insert into public.task_events (
        id,
        task_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        updated_task.id,
        coalesce(${agentId}::uuid, updated_task.reservation_agent_id::uuid),
        'task_failure_result_applying',
        'accepted',
        'medium',
        jsonb_build_object(
          'reservationId', updated_task.reservation_id,
          'stage', 'failure_result_application'
        ),
        now(),
        now()
      from updated_task
      returning id
    )
    select *
    from updated_task
  `;
  const row = rows[0];

  if (!row) {
    throw new Error(`Task ${input.taskId} could not be failed`);
  }

  return {
    activeReservation: row.reservation_id
      ? {
          agent_id: row.reservation_agent_id ?? "",
          id: row.reservation_id,
          membership_id: row.reservation_membership_id,
          worker_session_id: row.reservation_worker_session_id
        }
      : null,
    task: mapTask(row)
  };
}

async function finalizeTaskFailure(
  sql: postgres.Sql,
  input: Readonly<{
    claim: Awaited<ReturnType<typeof claimTaskFailureApplication>>;
    failureInput: FailTaskInput;
    resultPayload: Record<string, unknown>;
  }>
) {
  const taskId = uuidOrNull(input.failureInput.taskId);
  const agentId =
    scopeAgentId(input.failureInput) ??
    input.claim.activeReservation?.agent_id ??
    null;
  const membershipId =
    scopeMembershipId(input.failureInput) ??
    input.claim.activeReservation?.membership_id ??
    null;
  const reservationId =
    uuidOrNull(input.failureInput.reservationId) ??
    input.claim.activeReservation?.id ??
    null;
  const workerSessionId =
    uuidOrNull(input.failureInput.workerSessionId) ??
    input.claim.activeReservation?.worker_session_id ??
    null;
  const requiresReservation = Boolean(reservationId || agentId || workerSessionId);

  if (!taskId) {
    throw new Error("Task failure requires a valid taskId");
  }

  const rows = await sql<TaskReservationResultRow[]>`
    with active_reservation as (
      select id, agent_id, membership_id, worker_session_id
      from public.task_reservations
      where task_id = ${taskId}::uuid
        and status = 'active'
        and (${reservationId}::uuid is null or id = ${reservationId}::uuid)
        and (${agentId}::uuid is null or agent_id = ${agentId}::uuid)
        and (${membershipId}::uuid is null or membership_id = ${membershipId}::uuid)
        and (${workerSessionId}::uuid is null or worker_session_id = ${workerSessionId}::uuid)
      order by reserved_at desc
      limit 1
    ),
    reservation_info as (
      select id::text, agent_id::text, membership_id::text, worker_session_id::text
      from active_reservation
      union all
      select null::text, null::text, null::text, null::text
      where ${!requiresReservation}
    ),
    updated_task as (
      update public.tasks set
        status = 'failed',
        error_message = ${cleanText(input.failureInput.errorMessage, "Task failed.")},
        result_payload = ${sql.json(toJsonValue(input.resultPayload))}::jsonb,
        lease_until = null,
        reserved_by_agent_id = null,
        updated_at = now()
      from reservation_info
      where public.tasks.id = ${taskId}::uuid
        and public.tasks.status = 'running'
        and (${!requiresReservation} or reservation_info.id is not null)
        and (
          reservation_info.agent_id is null
          or public.tasks.reserved_by_agent_id = reservation_info.agent_id::uuid
        )
      returning
        public.tasks.*,
        reservation_info.id as reservation_id,
        reservation_info.agent_id as reservation_agent_id,
        reservation_info.membership_id as reservation_membership_id,
        reservation_info.worker_session_id as reservation_worker_session_id
    ),
    updated_reservation as (
      update public.task_reservations set
        status = 'failed',
        released_at = now()
      from updated_task
      where task_reservations.id = updated_task.reservation_id::uuid
        and task_reservations.status = 'active'
      returning task_reservations.id
    ),
    task_event as (
      insert into public.task_events (
        id,
        task_id,
        agent_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        updated_task.id,
        coalesce(${agentId}::uuid, updated_task.reservation_agent_id::uuid),
        'task_failed',
        'failed',
        'high',
        jsonb_build_object(
          'errorMessage', ${input.failureInput.errorMessage}::text,
          'reservationId', updated_task.reservation_id,
          'resultPayload', ${sql.json(toJsonValue(input.resultPayload))}::jsonb
        ),
        now(),
        now()
      from updated_task
      returning id
    )
    select *
    from updated_task
  `;
  const row = rows[0];

  if (!row) {
    throw new Error(`Task ${input.failureInput.taskId} could not be failed`);
  }

  if (row.reservation_worker_session_id) {
    await sql`
      update public.worker_sessions set
        status = 'idle',
        current_task_id = null,
        last_seen_at = now(),
        updated_at = now()
      where id = ${row.reservation_worker_session_id}::uuid
        and (${row.reservation_membership_id ?? null}::uuid is null or membership_id = ${row.reservation_membership_id ?? null}::uuid)
    `;
  }

  return mapTask(row);
}

export async function failTask(input: FailTaskInput) {
  const sql = getRequiredSql();
  const afterCommitEffects: TaskAfterCommitEffect[] = [];

  await ensureWorkerSessionSchema(sql);

  const claim = await claimTaskFailureApplication(sql, input);
  const retryWillBeScheduled = taskRetryWillBeScheduled(claim.task);
  let resultPayload: Record<string, unknown>;

  try {
    resultPayload = payloadRecord(
      input.applyFailure
	        ? await input.applyFailure({
            afterCommit: (effect) => afterCommitEffects.push(effect),
            agentId: input.accessScope?.agentId ?? input.agentId ?? claim.activeReservation?.agent_id,
            errorMessage: input.errorMessage,
            reservationId: claim.activeReservation?.id ?? input.reservationId,
            resultPayload: input.resultPayload ?? {},
            retryWillBeScheduled,
            sql,
            task: claim.task
          })
        : (input.resultPayload ?? {})
    );
  } catch (error) {
    const message = errorMessage(error, "Task failure side effect failed.");

    resultPayload = {
      ...payloadRecord(input.resultPayload ?? {}),
      failureApplicationError: message
    };
    await addTaskEvent({
      agentId: input.accessScope?.agentId ?? input.agentId ?? claim.activeReservation?.agent_id,
      eventPayload: {
        error: message,
        reservationId: claim.activeReservation?.id,
        stage: "failure_result_application"
      },
      eventStatus: "failed",
      eventType: "task_failure_result_apply_failed",
      severity: "high",
      taskId: claim.task.id
    });
  }

  const task = await finalizeTaskFailure(sql, {
    claim,
    failureInput: input,
    resultPayload
  });

  await scheduleRetryForFailedTask(sql, {
    errorMessage: input.errorMessage,
    failedByAgentId: input.accessScope?.agentId ?? input.agentId ?? claim.activeReservation?.agent_id,
    resultPayload,
    task
  });

  notifyTaskQueueChanged();

  await runTaskAfterCommitEffects({
    agentId: input.accessScope?.agentId ?? input.agentId ?? claim.activeReservation?.agent_id,
    effects: afterCommitEffects,
    taskId: task.id
  });

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
  await assertAccessScopeCanAccessTask(sql, parent, input.accessScope);

  const created = await createTaskRecord(sql, {
    ...input,
    createdByTaskId: parent.id,
    organisationId: parent.organisationId,
    parentTaskId: parent.id,
    planId: input.planId ?? parent.planId,
    rayId: input.rayId ?? parent.rayId,
    taskGroupId: input.taskGroupId ?? parent.taskGroupId,
    groupLabel: input.groupLabel ?? parent.groupLabel
  });

  await insertTaskEvent(sql, {
    agentId: input.createdByAgentId,
    eventPayload: {
      childTaskId: created.task.id,
      childTaskType: created.task.taskType
    },
    eventType: "child_task_created",
    taskId: parent.id
  });

  return created;
}

export {
  buildTaskSequenceDependencyPlan,
  TASK_BUSINESS_VALUE,
  normalizeTaskBusinessValue
};
export type { TaskDependencyType };
