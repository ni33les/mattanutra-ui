import { recordAdminAudit, type AdminSessionContext } from "@/lib/admin-access";
import { canOverrideRetailTaskClaim } from "@/lib/admin-retail-stock-access";
import { recordRetailOrderBpmEvent } from "@/lib/admin-retail-order-bpm-events";
import type { StockDb } from "@/lib/admin-retail-stock-types";
import { ensureRetailCommandTask, type RetailCommandId } from "@/lib/retail-command-registry";
import { RETAIL_ORDER_WORKFLOW_TASK_TYPES } from "@/lib/retail-task-policy";
import { retailOrderWorkflowTaskDetails } from "@/lib/retail-order-workflow-rules";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { addTaskEvent, createTask } from "@/lib/task-service";

export function retailCommandIdForTaskType(taskType: string): RetailCommandId | null {
  if (taskType === "retail_customer_order_allocate") {
    return "allocate_customer_order";
  }

  if (taskType === "retail_stock_forecast_refresh") {
    return "refresh_stock_reorder_advice";
  }

  if (taskType === "retail_shopping_list_review") {
    return "sync_order_shortages_to_reorder_advice";
  }

  if (
    taskType === "retail_order_cancel_review" ||
    taskType === "retail_order_delivery_confirm" ||
    taskType === "retail_order_pick" ||
    taskType === "retail_order_pack" ||
    taskType === "retail_order_return_review" ||
    taskType === "retail_order_ship"
  ) {
    return "advance_customer_order";
  }

  return null;
}

export function humanReviewDueAt(days = 3) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function queueRetailOperationTask(input: Readonly<{
  commandId?: RetailCommandId;
  description: string;
  dueAt?: Date | string | null;
  idempotencyKey: string;
  organisationId: string;
  payload?: Record<string, unknown>;
  priorityReason: string;
  priorityScore: number;
  profitImpactAmount?: number | null;
  profitImpactCurrency?: string | null;
  sourceEntityId?: string | null;
  sourceEntityType?: string | null;
  taskType: string;
  title: string;
}>) {
  try {
    if (input.commandId) {
      await ensureRetailCommandTask({
        commandId: input.commandId,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        organisationId: input.organisationId,
        payload: input.payload,
        priorityReason: input.priorityReason,
        priorityScore: input.priorityScore,
        sourceEntityId: input.sourceEntityId ?? null,
        sourceEntityType: input.sourceEntityType ?? null,
        taskType: input.taskType,
        title: input.title
      });
      return;
    }

    await createTask({
      actorType: "human",
      businessValue: input.priorityScore,
      description: input.description,
      dueAt: input.dueAt ?? null,
      idempotencyKey: input.idempotencyKey,
      idempotencyScope: "active",
      idempotencyScopeKey: input.taskType,
      maxAttempts: 3,
      organisationId: input.organisationId,
      payload: {
        ...(input.payload ?? {}),
        priorityReason: input.priorityReason,
        sourceEntityId: input.sourceEntityId ?? null,
        sourceEntityType: input.sourceEntityType ?? null
      },
      priorityReason: input.priorityReason,
      priorityScore: input.priorityScore,
      profitImpactAmount: input.profitImpactAmount ?? null,
      profitImpactCurrency: input.profitImpactCurrency ?? null,
      requiredCapabilities: [AGENT_CAPABILITIES.retailStockPolicyReview],
      scheduledFor: new Date(),
      sourceEntityId: input.sourceEntityId ?? null,
      sourceEntityType: input.sourceEntityType ?? null,
      taskType: input.taskType,
      title: input.title
    });
  } catch (error) {
    console.warn("Unable to queue retail operations task", error);
  }
}

export async function completeOrderWorkflowTask(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    action: string;
    orderId: string;
    organisationId: string;
    taskTypes: readonly string[];
  }>
) {
  if (input.taskTypes.length === 0) {
    return null;
  }

  const taskRows = await sql<Array<{
    claimed_by_person_id: string | null;
    id: string;
    status: string;
    task_type: string;
  }>>`
    select
      id::text,
      status,
      task_type,
      context->>'claimedByPersonId' as claimed_by_person_id
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = any(${input.taskTypes}::text[])
      and status not in ('completed', 'cancelled', 'skipped')
    order by
      case when context ? 'claimedByPersonId' then 0 else 1 end,
      coalesce(due_at, scheduled_for) asc,
      updated_at asc
  `;

  if (taskRows.length === 0) {
    return null;
  }

  for (const task of taskRows) {
    if (
      task.claimed_by_person_id &&
      task.claimed_by_person_id !== context.actorPerson.id &&
      !canOverrideRetailTaskClaim(context)
    ) {
      throw new Error("This workflow task is claimed by another person");
    }
  }

  for (const task of taskRows) {
    await sql`
      update public.tasks
      set
        status = 'completed',
        started_at = coalesce(started_at, now()),
        completed_at = now(),
        context = coalesce(context, '{}'::jsonb) || ${sql.json({
          claimedByDisplayName: context.actorPerson.displayName,
          claimedByEmail: context.actorPerson.email,
          claimedByPersonId: context.actorPerson.id,
          completedByDisplayName: context.actorPerson.displayName,
          completedByEmail: context.actorPerson.email,
          completedByPersonId: context.actorPerson.id,
          workflowAction: input.action
        })},
        updated_at = now()
      where id = ${task.id}::uuid
    `;

    await addTaskEvent({
      eventPayload: {
        action: input.action,
        actorPersonId: context.actorPerson.id,
        claimedByPersonId: task.claimed_by_person_id,
        customerOrderId: input.orderId,
        fromStatus: task.status,
        source: "retail_order_workflow"
      },
      eventStatus: "succeeded",
      eventType: "retail_order_workflow_task_completed",
      severity: "low",
      taskId: task.id
    });

    await recordAdminAudit({
      action: "admin.retail_order_workflow_task_completed",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: input.organisationId,
      resourceId: task.id,
      resourceType: "task",
      metadata: {
        customerOrderId: input.orderId,
        taskType: task.task_type,
        workflowAction: input.action
      }
    });

    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_task_completed",
      eventStatus: "task_completed",
      metadata: {
        taskId: task.id,
        taskType: task.task_type,
        workflowAction: input.action
      },
      orderId: input.orderId,
      organisationId: input.organisationId
    });
  }

  return taskRows[0]?.id ?? null;
}

export async function assertOrderWorkflowTaskClaimable(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    orderId: string;
    organisationId: string;
    taskTypes: readonly string[];
  }>
) {
  if (input.taskTypes.length === 0) {
    return;
  }

  const taskRows = await sql<Array<{
    claimed_by_person_id: string | null;
    id: string;
  }>>`
    select
      id::text,
      context->>'claimedByPersonId' as claimed_by_person_id
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = any(${input.taskTypes}::text[])
      and status not in ('completed', 'cancelled', 'skipped')
    order by
      case when context ? 'claimedByPersonId' then 0 else 1 end,
      coalesce(due_at, scheduled_for) asc,
      updated_at asc
    limit 1
  `;
  const task = taskRows[0];

  if (
    task?.claimed_by_person_id &&
    task.claimed_by_person_id !== context.actorPerson.id &&
    !canOverrideRetailTaskClaim(context)
  ) {
    throw new Error("This workflow task is claimed by another person");
  }
}

export async function ensureOrderWorkflowTask(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    dueAt?: Date | string | null;
    orderId: string;
    organisationId: string;
    taskType: string;
  }>
) {
  const taskRows = await sql<Array<{
    claimed_by_person_id: string | null;
    id: string;
  }>>`
    select
      id::text,
      context->>'claimedByPersonId' as claimed_by_person_id
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = ${input.taskType}
      and status not in ('completed', 'cancelled', 'skipped')
    order by
      case when context ? 'claimedByPersonId' then 0 else 1 end,
      coalesce(due_at, scheduled_for) asc,
      updated_at asc
    limit 1
  `;
  const existingTask = taskRows[0];

  if (
    existingTask?.claimed_by_person_id &&
    existingTask.claimed_by_person_id !== context.actorPerson.id &&
    !canOverrideRetailTaskClaim(context)
  ) {
    throw new Error("This workflow task is claimed by another person");
  }

  if (existingTask) {
    return existingTask.id;
  }

  const details = retailOrderWorkflowTaskDetails(input.taskType);

  await queueRetailOperationTask({
    commandId: retailCommandIdForTaskType(input.taskType) ?? undefined,
    description: details.description,
    dueAt: input.dueAt ?? null,
    idempotencyKey: `${input.orderId}:${input.taskType}:repair`,
    organisationId: input.organisationId,
    priorityReason: details.priorityReason,
    priorityScore: details.priorityScore,
    sourceEntityId: input.orderId,
    sourceEntityType: "retail_customer_order",
    taskType: input.taskType,
    title: details.title
  });

  const repairedRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = ${input.taskType}
      and status not in ('completed', 'cancelled', 'skipped')
    order by updated_at desc
    limit 1
  `;
  const taskId = repairedRows[0]?.id ?? null;

  await recordAdminAudit({
    action: "admin.retail_order_workflow_task_repaired",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: input.organisationId,
    resourceId: taskId ?? input.orderId,
    resourceType: taskId ? "task" : "retail_customer_order",
    metadata: {
      customerOrderId: input.orderId,
      taskType: input.taskType
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: "retail_order_task_repaired",
    eventStatus: taskId ? "repaired" : "repair_attempted",
    metadata: {
      taskId,
      taskType: input.taskType
    },
    orderId: input.orderId,
    organisationId: input.organisationId
  });

  return taskId;
}

export async function cancelStaleOrderWorkflowTasks(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    expectedTaskTypes: readonly string[];
    orderId: string;
    organisationId: string;
    reason: string;
    status: string;
  }>
) {
  const rows = await sql<Array<{ id: string; task_type: string }>>`
    update public.tasks
    set
      status = 'cancelled',
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${sql.json({
        actorPersonId: context.actorPerson.id,
        expectedTaskTypes: [...input.expectedTaskTypes],
        reason: input.reason,
        source: "retail_order_lifecycle_reconciliation",
        status: input.status
      })}::jsonb,
      lease_until = null,
      reserved_by_agent_id = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = any(${[...RETAIL_ORDER_WORKFLOW_TASK_TYPES]}::text[])
      and not (task_type = any(${[...input.expectedTaskTypes]}::text[]))
      and status not in ('completed', 'cancelled', 'skipped')
    returning id::text, task_type
  `;

  for (const task of rows) {
    await addTaskEvent({
      eventPayload: {
        actorPersonId: context.actorPerson.id,
        expectedTaskTypes: [...input.expectedTaskTypes],
        source: "retail_order_lifecycle_reconciliation",
        status: input.status,
        taskType: task.task_type
      },
      eventStatus: "succeeded",
      eventType: "retail_order_stale_workflow_task_cancelled",
      severity: "low",
      taskId: task.id
    });
  }

  return rows.length;
}
