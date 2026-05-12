import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { getSql } from "@/lib/db";

export type AdminGoalStatus =
  | "blocked"
  | "cancelled"
  | "failed"
  | "processing"
  | "scheduled"
  | "succeeded";

export type AdminGoalRow = Readonly<{
  activeTaskCount: number;
  blockedTaskCount: number;
  completedAt: string | null;
  completedTaskCount: number;
  createdAt: string;
  emailHash: string | null;
  failedTaskCount: number;
  id: string;
  lastActivityAt: string;
  planId: string | null;
  priority: number;
  rawStatus: string;
  ray: string | null;
  scheduledTaskCount: number;
  source: string | null;
  status: AdminGoalStatus;
  taskCount: number;
  title: string;
  type: string;
  updatedAt: string;
}>;

export type AdminGoalTaskRow = Readonly<{
  actorType: string;
  attempts: number;
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  id: string;
  leaseUntil: string | null;
  maxAttempts: number;
  priority: number;
  requiredCapabilities: string[];
  scheduledFor: string;
  startedAt: string | null;
  status: string;
  taskType: string;
  title: string;
  updatedAt: string;
}>;

export type AdminGoalEventRow = Readonly<{
  agentName: string | null;
  eventStatus: string;
  eventType: string;
  id: string;
  occurredAt: string;
  severity: string;
  taskId: string | null;
}>;

export type AdminGoalCommentRow = Readonly<{
  authorName: string | null;
  authorType: string;
  body: string;
  commentType: string;
  createdAt: string;
  id: string;
  taskId: string;
  visibility: string;
}>;

export type AdminGoalDependencyRow = Readonly<{
  dependencyType: string;
  dependsOnTaskId: string;
  taskId: string;
}>;

export type AdminGoalReservationRow = Readonly<{
  agentName: string | null;
  completedAt: string | null;
  id: string;
  leaseUntil: string;
  releasedAt: string | null;
  reservedAt: string;
  status: string;
  taskId: string;
}>;

export type AdminGoalApprovalRow = Readonly<{
  approvalType: string;
  decidedAt: string | null;
  decisionComment: string | null;
  id: string;
  requestedAt: string;
  requestComment: string | null;
  status: string;
  taskId: string;
}>;

export type AdminGoalsData = Readonly<{
  approvals: AdminGoalApprovalRow[];
  comments: AdminGoalCommentRow[];
  databaseAvailable: boolean;
  dependencies: AdminGoalDependencyRow[];
  events: AdminGoalEventRow[];
  generatedAt: string;
  reservations: AdminGoalReservationRow[];
  rows: AdminGoalRow[];
  selectedGoal: AdminGoalRow | null;
  selectedGoalId: string | null;
  summary: {
    blocked: number;
    failed: number;
    processing: number;
    scheduled: number;
    succeeded: number;
    total: number;
  };
  tasks: AdminGoalTaskRow[];
}>;

type GoalDbRow = Readonly<{
  active_task_count: number | string | null;
  blocked_task_count: number | string | null;
  completed_at: Date | string | null;
  completed_task_count: number | string | null;
  created_at: Date | string;
  email_hash: string | null;
  failed_task_count: number | string | null;
  id: string;
  last_activity_at: Date | string | null;
  plan_id: string | null;
  priority: number | string;
  raw_status: string;
  ray: string | null;
  goal_type: string;
  scheduled_task_count: number | string | null;
  source: string | null;
  task_count: number | string | null;
  title: string;
  updated_at: Date | string;
}>;

type TaskDbRow = Readonly<{
  actor_type: string;
  attempts: number | string;
  completed_at: Date | string | null;
  created_at: Date | string;
  error_message: string | null;
  id: string;
  lease_until: Date | string | null;
  max_attempts: number | string;
  payload: Record<string, unknown> | null;
  priority: number | string;
  required_capabilities: string[] | null;
  scheduled_for: Date | string;
  started_at: Date | string | null;
  status: string;
  task_type: string;
  title: string;
  updated_at: Date | string;
}>;

type EventDbRow = Readonly<{
  agent_name: string | null;
  event_status: string;
  event_type: string;
  id: string;
  occurred_at: Date | string;
  severity: string;
  task_id: string | null;
}>;

type CommentDbRow = Readonly<{
  author_name: string | null;
  author_type: string;
  body: string;
  comment_type: string;
  created_at: Date | string;
  id: string;
  task_id: string;
  visibility: string;
}>;

type DependencyDbRow = Readonly<{
  dependency_type: string;
  depends_on_task_id: string;
  task_id: string;
}>;

type ReservationDbRow = Readonly<{
  agent_name: string | null;
  completed_at: Date | string | null;
  id: string;
  lease_until: Date | string;
  released_at: Date | string | null;
  reserved_at: Date | string;
  status: string;
  task_id: string;
}>;

type ApprovalDbRow = Readonly<{
  approval_type: string;
  decided_at: Date | string | null;
  decision_comment: string | null;
  id: string;
  requested_at: Date | string;
  request_comment: string | null;
  status: string;
  task_id: string;
}>;

function dateOrNull(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function uuidOrNull(value: string | null | undefined) {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
    ? value
    : null;
}

function textFromPayload(
  payload: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = payload?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayGoalTitle(value: string) {
  if (value.startsWith("Review supplement safety for plan ")) {
    return "Review plan";
  }

  if (value.startsWith("Review dose reduction: ")) {
    return "Review plan";
  }

  if (value.startsWith("Review supplement: ")) {
    return "Review plan";
  }

  if (
    value.startsWith("Classify supplement: ") ||
    value.startsWith("Classify new supplement: ")
  ) {
    return "Review supplement";
  }

  return value;
}

function displayTaskTitle(value: string, payload: Record<string, unknown> | null) {
  const supplementName = textFromPayload(payload, "supplementName");

  if (
    value === "Review plan" ||
    value === "Review supplement" ||
    value.startsWith("Review supplement: ") ||
    value.startsWith("Review dose reduction: ") ||
    value.startsWith("Classify supplement: ") ||
    value.startsWith("Classify new supplement: ")
  ) {
    const name =
      supplementName ??
      value
        .replace(/^Review supplement:\s*/i, "")
        .replace(/^Review dose reduction:\s*/i, "")
        .replace(/^Classify(?: new)? supplement:\s*/i, "")
        .trim();

    return name && name !== "Review plan" && name !== "Review supplement"
      ? `Review supplement ${name}`
      : "Review supplement";
  }

  return value;
}

function goalStatus(row: GoalDbRow): AdminGoalStatus {
  if (row.raw_status === "cancelled") {
    return "cancelled";
  }

  if (row.raw_status === "failed") {
    return "failed";
  }

  if (numberValue(row.blocked_task_count) > 0 || row.raw_status === "blocked") {
    return "blocked";
  }

  if (numberValue(row.active_task_count) > 0) {
    return "processing";
  }

  if (numberValue(row.scheduled_task_count) > 0) {
    return "scheduled";
  }

  if (
    numberValue(row.task_count) > 0 &&
    numberValue(row.completed_task_count) === numberValue(row.task_count)
  ) {
    return "succeeded";
  }

  return "processing";
}

function goalFromDb(row: GoalDbRow): AdminGoalRow {
  return {
    activeTaskCount: numberValue(row.active_task_count),
    blockedTaskCount: numberValue(row.blocked_task_count),
    completedAt: dateOrNull(row.completed_at),
    completedTaskCount: numberValue(row.completed_task_count),
    createdAt: new Date(row.created_at).toISOString(),
    emailHash: row.email_hash,
    failedTaskCount: numberValue(row.failed_task_count),
    id: row.id,
    lastActivityAt: new Date(row.last_activity_at ?? row.updated_at).toISOString(),
    planId: row.plan_id,
    priority: numberValue(row.priority),
    rawStatus: row.raw_status,
    ray: row.ray,
    scheduledTaskCount: numberValue(row.scheduled_task_count),
    source: row.source,
    status: goalStatus(row),
    taskCount: numberValue(row.task_count),
    title: displayGoalTitle(row.title),
    type: row.goal_type,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function sortGoals(left: AdminGoalRow, right: AdminGoalRow) {
  const priorityDifference = right.priority - left.priority;

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const ageDifference =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

  if (ageDifference !== 0) {
    return ageDifference;
  }

  const activityDifference =
    new Date(left.lastActivityAt).getTime() -
    new Date(right.lastActivityAt).getTime();

  return activityDifference || left.title.localeCompare(right.title);
}

function taskFromDb(row: TaskDbRow): AdminGoalTaskRow {
  return {
    actorType: row.actor_type,
    attempts: numberValue(row.attempts),
    completedAt: dateOrNull(row.completed_at),
    createdAt: new Date(row.created_at).toISOString(),
    errorMessage: row.error_message,
    id: row.id,
    leaseUntil: dateOrNull(row.lease_until),
    maxAttempts: numberValue(row.max_attempts),
    priority: numberValue(row.priority),
    requiredCapabilities: Array.isArray(row.required_capabilities)
      ? row.required_capabilities
      : [],
    scheduledFor: new Date(row.scheduled_for).toISOString(),
    startedAt: dateOrNull(row.started_at),
    status: row.status,
    taskType: row.task_type,
    title: displayTaskTitle(row.title, row.payload),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function emptyGoalsData(): AdminGoalsData {
  return {
    approvals: [],
    comments: [],
    databaseAvailable: false,
    dependencies: [],
    events: [],
    generatedAt: new Date().toISOString(),
    reservations: [],
    rows: [],
    selectedGoal: null,
    selectedGoalId: null,
    summary: {
      blocked: 0,
      failed: 0,
      processing: 0,
      scheduled: 0,
      succeeded: 0,
      total: 0
    },
    tasks: []
  };
}

function summary(rows: AdminGoalRow[]): AdminGoalsData["summary"] {
  return rows.reduce(
    (current, row) => {
      current.total += 1;

      if (row.status !== "cancelled") {
        current[row.status] += 1;
      }

      return current;
    },
    {
      blocked: 0,
      failed: 0,
      processing: 0,
      scheduled: 0,
      succeeded: 0,
      total: 0
    }
  );
}

export async function getAdminGoalsData(
  range: AdminDashboardRange,
  selectedGoalId?: string | null
): Promise<AdminGoalsData> {
  const sql = getSql();

  if (!sql) {
    return emptyGoalsData();
  }

  try {
    const start = adminDashboardRangeStart(range);
    const goalRows = await sql<GoalDbRow[]>`
      with task_summary as (
        select
          goal_id,
          count(*)::int as task_count,
          count(*) filter (
            where status in ('reserved', 'running')
              or (
                status = 'queued'
                and scheduled_for <= now()
              )
          )::int as active_task_count,
          count(*) filter (
            where status = 'queued'
              and scheduled_for > now()
          )::int as scheduled_task_count,
          count(*) filter (
            where status in ('blocked', 'needs_review', 'waiting_approval', 'failed')
              or (
                actor_type = 'human'
                and status in ('queued', 'reserved', 'running')
                and scheduled_for <= now()
              )
              or (
                status in ('reserved', 'running')
                and lease_until is not null
                and lease_until < now()
              )
          )::int as blocked_task_count,
          count(*) filter (where status = 'failed')::int as failed_task_count,
          count(*) filter (where status = 'completed')::int as completed_task_count,
          max(updated_at) as task_updated_at
        from public.tasks
        group by goal_id
      ),
      event_summary as (
        select goal_id, max(occurred_at) as event_at
        from public.task_events
        group by goal_id
      )
      select
        goals.id::text,
        goals.goal_type,
        goals.title,
        goals.status as raw_status,
        goals.priority,
        goals.ray::text,
        goals.plan_id::text,
        goals.email_hash,
        goals.source,
        goals.created_at,
        goals.updated_at,
        goals.completed_at,
        coalesce(task_summary.task_count, 0) as task_count,
        coalesce(task_summary.active_task_count, 0) as active_task_count,
        coalesce(task_summary.scheduled_task_count, 0) as scheduled_task_count,
        coalesce(task_summary.blocked_task_count, 0) as blocked_task_count,
        coalesce(task_summary.failed_task_count, 0) as failed_task_count,
        coalesce(task_summary.completed_task_count, 0) as completed_task_count,
        greatest(
          goals.updated_at,
          coalesce(task_summary.task_updated_at, goals.updated_at),
          coalesce(event_summary.event_at, goals.updated_at)
        ) as last_activity_at
      from public.goals
      left join task_summary on task_summary.goal_id = goals.id
      left join event_summary on event_summary.goal_id = goals.id
      where ${start}::timestamptz is null
        or greatest(
          goals.updated_at,
          coalesce(task_summary.task_updated_at, goals.updated_at),
          coalesce(event_summary.event_at, goals.updated_at)
        ) >= ${start}
      order by goals.priority desc, goals.created_at asc
      limit 500
    `;
    const rows = goalRows.map(goalFromDb).sort(sortGoals).slice(0, 60);
    const requestedSelectedId = uuidOrNull(selectedGoalId);
    const selectedId = requestedSelectedId || rows[0]?.id || null;
    const selectedGoal = rows.find((row) => row.id === selectedId) ?? null;

    if (!selectedId) {
      return {
        ...emptyGoalsData(),
        databaseAvailable: true,
        generatedAt: new Date().toISOString(),
        rows,
        summary: summary(rows)
      };
    }

    const [
      taskRows,
      eventRows,
      commentRows,
      dependencyRows,
      reservationRows,
      approvalRows
    ] = await Promise.all([
      sql<TaskDbRow[]>`
        select
          id::text,
          task_type,
          title,
          actor_type,
          status,
          priority,
          required_capabilities,
          attempts,
          max_attempts,
          scheduled_for,
          started_at,
          completed_at,
          lease_until,
          error_message,
          payload,
          created_at,
          updated_at
        from public.tasks
        where goal_id = ${selectedId}::uuid
        order by
          case
            when status in (
              'queued',
              'reserved',
              'running',
              'needs_review',
              'waiting_approval',
              'blocked'
            ) then 0
            else 1
          end,
          priority desc,
          scheduled_for asc,
          created_at asc
      `,
      sql<EventDbRow[]>`
        select
          task_events.id::text,
          task_events.task_id::text,
          agents.name as agent_name,
          task_events.event_type,
          task_events.event_status,
          task_events.severity,
          task_events.occurred_at
        from public.task_events
        left join public.agents on agents.id = task_events.agent_id
        where task_events.goal_id = ${selectedId}::uuid
        order by task_events.occurred_at desc
        limit 80
      `,
      sql<CommentDbRow[]>`
        select
          id::text,
          task_id::text,
          author_type,
          author_name,
          visibility,
          comment_type,
          body,
          created_at
        from public.task_comments
        where goal_id = ${selectedId}::uuid
        order by created_at desc
        limit 80
      `,
      sql<DependencyDbRow[]>`
        select
          task_id::text,
          depends_on_task_id::text,
          dependency_type
        from public.task_dependencies
        where task_id in (
          select id from public.tasks where goal_id = ${selectedId}::uuid
        )
        order by created_at asc
      `,
      sql<ReservationDbRow[]>`
        select
          task_reservations.id::text,
          task_reservations.task_id::text,
          agents.name as agent_name,
          task_reservations.status,
          task_reservations.reserved_at,
          task_reservations.lease_until,
          task_reservations.released_at,
          task_reservations.completed_at
        from public.task_reservations
        left join public.agents on agents.id = task_reservations.agent_id
        where task_reservations.task_id in (
          select id from public.tasks where goal_id = ${selectedId}::uuid
        )
        order by task_reservations.reserved_at desc
        limit 80
      `,
      sql<ApprovalDbRow[]>`
        select
          id::text,
          task_id::text,
          approval_type,
          status,
          request_comment,
          decision_comment,
          requested_at,
          decided_at
        from public.task_approvals
        where goal_id = ${selectedId}::uuid
        order by requested_at desc
        limit 80
      `
    ]);

    return {
      approvals: approvalRows.map((row) => ({
        approvalType: row.approval_type,
        decidedAt: dateOrNull(row.decided_at),
        decisionComment: row.decision_comment,
        id: row.id,
        requestedAt: new Date(row.requested_at).toISOString(),
        requestComment: row.request_comment,
        status: row.status,
        taskId: row.task_id
      })),
      comments: commentRows.map((row) => ({
        authorName: row.author_name,
        authorType: row.author_type,
        body: row.body,
        commentType: row.comment_type,
        createdAt: new Date(row.created_at).toISOString(),
        id: row.id,
        taskId: row.task_id,
        visibility: row.visibility
      })),
      databaseAvailable: true,
      dependencies: dependencyRows.map((row) => ({
        dependencyType: row.dependency_type,
        dependsOnTaskId: row.depends_on_task_id,
        taskId: row.task_id
      })),
      events: eventRows.map((row) => ({
        agentName: row.agent_name,
        eventStatus: row.event_status,
        eventType: row.event_type,
        id: row.id,
        occurredAt: new Date(row.occurred_at).toISOString(),
        severity: row.severity,
        taskId: row.task_id
      })),
      generatedAt: new Date().toISOString(),
      reservations: reservationRows.map((row) => ({
        agentName: row.agent_name,
        completedAt: dateOrNull(row.completed_at),
        id: row.id,
        leaseUntil: new Date(row.lease_until).toISOString(),
        releasedAt: dateOrNull(row.released_at),
        reservedAt: new Date(row.reserved_at).toISOString(),
        status: row.status,
        taskId: row.task_id
      })),
      rows,
      selectedGoal,
      selectedGoalId: selectedId,
      summary: summary(rows),
      tasks: taskRows.map(taskFromDb)
    };
  } catch (error) {
    console.error("Unable to load admin goals", error);
    return emptyGoalsData();
  }
}
