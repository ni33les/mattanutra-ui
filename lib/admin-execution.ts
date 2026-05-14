import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import { SYSTEM_AGENTS } from "@/lib/system-agents";
import { ensureWorkerSessionSchema } from "@/lib/task-service";

const ADMIN_AGENT_DISPLAY_ORDER = [
  SYSTEM_AGENTS.healthScoreEngine.id,
  SYSTEM_AGENTS.formulationWorker.id,
  SYSTEM_AGENTS.safetyScanner.id,
  SYSTEM_AGENTS.humanReviewer.id,
  SYSTEM_AGENTS.emailDispatcher.id,
  SYSTEM_AGENTS.communicationsCoordinator.id,
  SYSTEM_AGENTS.chatDispatcher.id,
  SYSTEM_AGENTS.contentPublisher.id,
  SYSTEM_AGENTS.scheduler.id
] as const;

export type AdminTaskVisibilityRow = Readonly<{
  actorType: string;
  agentId: string | null;
  agentName: string | null;
  attempts: number;
  blockedDependencyCount: number;
  createdAt: string;
  errorMessage: string | null;
  goalId: string;
  goalPriority: number;
  goalStatus: string;
  goalTitle: string;
  id: string;
  leaseUntil: string | null;
  latestEventAt: string | null;
  latestEventPayload: Record<string, unknown> | null;
  latestEventSeverity: string | null;
  latestEventStatus: string | null;
  latestEventType: string | null;
  maxAttempts: number;
  planId: string | null;
  priority: number;
  ray: string | null;
  reasoningEffort: string;
  reservationHeartbeatAt: string | null;
  reservationId: string | null;
  reservationLeaseUntil: string | null;
  reservationStatus: string | null;
  reservedAt: string | null;
  requiredCapabilities: string[];
  scheduledFor: string;
  status: string;
  taskType: string;
  title: string;
  updatedAt: string;
  workerSessionId: string | null;
  workerSessionLastSeenAt: string | null;
  workerSessionStatus: string | null;
}>;

export type AdminTaskVisibilityData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminTaskVisibilityRow[];
  summary: {
    active: number;
    blocked: number;
    completed: number;
    failed: number;
    human: number;
    queued: number;
    total: number;
  };
}>;

export type AdminAgentRow = Readonly<{
  activeTaskCount: number;
  activeTaskId: string | null;
  activeTaskTitle: string | null;
  capabilities: string[];
  completedCount: number;
  failureRate: number | null;
  failedCount: number;
  id: string;
  lastSeenAt: string | null;
  model: string | null;
  name: string;
  successRate: number | null;
  status: string;
  totalFinished: number;
  type: string;
  updatedAt: string;
  sessionCount: number;
  workingSessionCount: number;
}>;

export type AdminAgentsData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminAgentRow[];
  summary: {
    active: number;
    offline: number;
    paused: number;
    retired: number;
    total: number;
    working: number;
  };
}>;

type VisibilityDbRow = Readonly<{
  actor_type: string;
  agent_id: string | null;
  agent_name: string | null;
  attempts: number | string;
  blocked_dependency_count: number | string | null;
  created_at: Date | string;
  error_message: string | null;
  goal_id: string;
  goal_priority: number | string;
  goal_status: string;
  goal_title: string;
  id: string;
  lease_until: Date | string | null;
  latest_event_at: Date | string | null;
  latest_event_payload: Record<string, unknown> | null;
  latest_event_severity: string | null;
  latest_event_status: string | null;
  latest_event_type: string | null;
  max_attempts: number | string;
  payload: Record<string, unknown> | null;
  plan_id: string | null;
  priority: number | string;
  ray: string | null;
  reasoning_effort: string;
  reservation_heartbeat_at: Date | string | null;
  reservation_id: string | null;
  reservation_lease_until: Date | string | null;
  reservation_status: string | null;
  reserved_at: Date | string | null;
  required_capabilities: string[] | null;
  scheduled_for: Date | string;
  status: string;
  task_type: string;
  title: string;
  updated_at: Date | string;
  worker_session_id: string | null;
  worker_session_count: number | string | null;
  worker_session_last_seen_at: Date | string | null;
  worker_session_status: string | null;
  working_session_count: number | string | null;
}>;

type VisibilitySummaryDbRow = Readonly<{
  active: number | string;
  blocked: number | string;
  completed: number | string;
  failed: number | string;
  human: number | string;
  queued: number | string;
  total: number | string;
}>;

type AgentDbRow = Readonly<{
  active_task_count: number | string | null;
  active_task_id: string | null;
  active_task_payload: Record<string, unknown> | null;
  active_task_title: string | null;
  capabilities: string[] | null;
  completed_count: number | string | null;
  failed_count: number | string | null;
  id: string;
  last_seen_at: Date | string | null;
  model: string | null;
  name: string;
  status: string;
  agent_type: string;
  updated_at: Date | string;
  worker_session_count: number | string | null;
  working_session_count: number | string | null;
}>;

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoOrNull(value: Date | string | null) {
  return value ? iso(value) : null;
}

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
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

function emptyVisibilityData(): AdminTaskVisibilityData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      active: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
      human: 0,
      queued: 0,
      total: 0
    }
  };
}

function emptyAgentsData(): AdminAgentsData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      active: 0,
      offline: 0,
      paused: 0,
      retired: 0,
      total: 0,
      working: 0
    }
  };
}

function visibilityRowFromDb(row: VisibilityDbRow): AdminTaskVisibilityRow {
  return {
    actorType: row.actor_type,
    agentId: row.agent_id,
    agentName: row.agent_name,
    attempts: numberValue(row.attempts),
    blockedDependencyCount: numberValue(row.blocked_dependency_count),
    createdAt: iso(row.created_at),
    errorMessage: row.error_message,
    goalId: row.goal_id,
    goalPriority: numberValue(row.goal_priority),
    goalStatus: row.goal_status,
    goalTitle: displayGoalTitle(row.goal_title),
    id: row.id,
    leaseUntil: isoOrNull(row.lease_until),
    latestEventAt: isoOrNull(row.latest_event_at),
    latestEventPayload: row.latest_event_payload,
    latestEventSeverity: row.latest_event_severity,
    latestEventStatus: row.latest_event_status,
    latestEventType: row.latest_event_type,
    maxAttempts: numberValue(row.max_attempts),
    planId: row.plan_id,
    priority: numberValue(row.priority),
    ray: row.ray,
    reasoningEffort: row.reasoning_effort,
    reservationHeartbeatAt: isoOrNull(row.reservation_heartbeat_at),
    reservationId: row.reservation_id,
    reservationLeaseUntil: isoOrNull(row.reservation_lease_until),
    reservationStatus: row.reservation_status,
    reservedAt: isoOrNull(row.reserved_at),
    requiredCapabilities: row.required_capabilities ?? [],
    scheduledFor: iso(row.scheduled_for),
    status: row.status,
    taskType: row.task_type,
    title: displayTaskTitle(row.title, row.payload),
    updatedAt: iso(row.updated_at),
    workerSessionId: row.worker_session_id,
    workerSessionLastSeenAt: isoOrNull(row.worker_session_last_seen_at),
    workerSessionStatus: row.worker_session_status
  };
}

function agentRowFromDb(row: AgentDbRow): AdminAgentRow {
  const completedCount = numberValue(row.completed_count);
  const failedCount = numberValue(row.failed_count);
  const totalFinished = completedCount + failedCount;

  return {
    activeTaskCount: numberValue(row.active_task_count),
    activeTaskId: row.active_task_id,
    activeTaskTitle: row.active_task_title
      ? displayTaskTitle(row.active_task_title, row.active_task_payload)
      : null,
    capabilities: row.capabilities ?? [],
    completedCount,
    failureRate: totalFinished > 0 ? failedCount / totalFinished : null,
    failedCount,
    id: row.id,
    lastSeenAt: isoOrNull(row.last_seen_at),
    model: row.model,
    name: row.name,
    status: row.status,
    successRate: totalFinished > 0 ? completedCount / totalFinished : null,
    totalFinished,
    type: row.agent_type,
    updatedAt: iso(row.updated_at),
    sessionCount: numberValue(row.worker_session_count),
    workingSessionCount: numberValue(row.working_session_count)
  };
}

export async function getAdminTaskVisibilityData(
  range: AdminDashboardRange,
  selectedTaskId?: string | null
): Promise<AdminTaskVisibilityData> {
  const sql = getSql();

  if (!sql) {
    return emptyVisibilityData();
  }

  try {
    const start = adminDashboardRangeStart(range);
    const liveStatuses = [
      "needs_review",
      "queued",
      "reserved",
      "running",
      "waiting_approval"
    ];
    const taskId = selectedTaskId && isUuid(selectedTaskId) ? selectedTaskId : null;
    const whereClause = sql`
      (${start}::timestamptz is null
        or tasks.created_at >= ${start}
        or tasks.updated_at >= ${start}
        or tasks.status = any(${liveStatuses}))
    `;
    const taskRowsWhereClause = sql`
      (${whereClause}
        or (${taskId}::uuid is not null and tasks.id = ${taskId}::uuid))
    `;
    const taskFlagsCte = sql`
      task_flags as (
        select
          tasks.*,
          (
            select count(*)::int
            from public.task_dependencies
            inner join public.tasks dependency_tasks
              on dependency_tasks.id = task_dependencies.depends_on_task_id
            where task_dependencies.task_id = tasks.id
              and (
                (
                  task_dependencies.dependency_type = 'complete'
                  and dependency_tasks.status not in ('completed', 'skipped')
                )
                or (
                  task_dependencies.dependency_type = 'successful'
                  and dependency_tasks.status <> 'completed'
                )
                or (
                  task_dependencies.dependency_type = 'approved'
                  and not exists (
                    select 1
                    from public.task_approvals
                    where task_approvals.task_id = dependency_tasks.id
                      and task_approvals.status = 'approved'
                  )
                )
              )
          ) as blocked_dependency_count
        from public.tasks
      )
    `;
    const [summaryRows, taskRows] = await Promise.all([
      sql<VisibilitySummaryDbRow[]>`
        with ${taskFlagsCte}
        select
          count(*)::int as total,
          count(*) filter (
            where tasks.status in ('queued', 'needs_review', 'waiting_approval')
          )::int as queued,
          count(*) filter (where tasks.status in ('reserved', 'running'))::int as active,
          count(*) filter (
            where (
                tasks.actor_type = 'human'
                or tasks.status in ('needs_review', 'waiting_approval')
              )
              and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
          )::int as human,
          count(*) filter (
            where tasks.status = 'queued'
              and tasks.scheduled_for <= now()
              and tasks.blocked_dependency_count > 0
          )::int as blocked,
          count(*) filter (
            where tasks.status = 'failed'
              or (
                tasks.status in ('reserved', 'running')
                and tasks.lease_until is not null
                and tasks.lease_until < now()
              )
          )::int as failed,
          count(*) filter (where tasks.status = 'completed')::int as completed
        from task_flags as tasks
        where ${whereClause}
      `,
      sql<VisibilityDbRow[]>`
        with ${taskFlagsCte}
        select
          tasks.id::text,
          tasks.task_type,
          tasks.title,
          tasks.actor_type,
          tasks.status,
          tasks.priority,
          tasks.required_capabilities,
          tasks.reasoning_effort,
          tasks.attempts,
          tasks.max_attempts,
          tasks.payload,
          tasks.scheduled_for,
          tasks.lease_until,
          tasks.error_message,
          tasks.created_at,
          tasks.updated_at,
          latest_reservation.id::text as reservation_id,
          latest_reservation.status as reservation_status,
          latest_reservation.reserved_at,
          latest_reservation.heartbeat_at as reservation_heartbeat_at,
          latest_reservation.lease_until as reservation_lease_until,
          worker_sessions.id::text as worker_session_id,
          worker_sessions.status as worker_session_status,
          worker_sessions.last_seen_at as worker_session_last_seen_at,
          latest_event.event_type as latest_event_type,
          latest_event.event_status as latest_event_status,
          latest_event.severity as latest_event_severity,
          latest_event.event_payload as latest_event_payload,
          latest_event.occurred_at as latest_event_at,
          goals.id::text as goal_id,
          goals.title as goal_title,
          goals.status as goal_status,
          goals.priority as goal_priority,
          goals.plan_id::text,
          goals.ray::text,
          agents.id::text as agent_id,
          agents.name as agent_name,
          tasks.blocked_dependency_count
        from task_flags as tasks
        inner join public.goals on goals.id = tasks.goal_id
        left join lateral (
          select *
          from public.task_reservations
          where task_reservations.task_id = tasks.id
          order by
            case when task_reservations.status = 'active' then 0 else 1 end,
            task_reservations.reserved_at desc
          limit 1
        ) latest_reservation on true
        left join public.worker_sessions
          on worker_sessions.id = latest_reservation.worker_session_id
        left join lateral (
          select *
          from public.task_events
          where task_events.task_id = tasks.id
          order by task_events.occurred_at desc
          limit 1
        ) latest_event on true
        left join public.agents
          on agents.id = coalesce(tasks.reserved_by_agent_id, latest_reservation.agent_id)
        where ${taskRowsWhereClause}
        order by
          case
            when ${taskId}::uuid is not null and tasks.id = ${taskId}::uuid then -1
            else 0
          end,
          case
            when tasks.status in (
              'queued',
              'reserved',
              'running',
              'needs_review',
              'waiting_approval'
            ) then 0
            else 1
          end,
          goals.priority desc,
          tasks.priority desc,
          tasks.scheduled_for asc,
          case tasks.status
            when 'queued' then 0
            when 'reserved' then 1
            when 'running' then 2
            when 'needs_review' then 3
            when 'waiting_approval' then 3
            when 'failed' then 5
            when 'completed' then 6
            when 'skipped' then 7
            when 'cancelled' then 8
            else 9
          end,
          tasks.created_at asc
        limit 120
      `
    ]);
    const summaryRow = summaryRows[0];

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows: taskRows.map(visibilityRowFromDb),
      summary: {
        active: numberValue(summaryRow?.active),
        blocked: numberValue(summaryRow?.blocked),
        completed: numberValue(summaryRow?.completed),
        failed: numberValue(summaryRow?.failed),
        human: numberValue(summaryRow?.human),
        queued: numberValue(summaryRow?.queued),
        total: numberValue(summaryRow?.total)
      }
    };
  } catch (error) {
    console.error("Unable to load admin task visibility", error);
    return emptyVisibilityData();
  }
}

export async function getAdminAgentsData(
  range: AdminDashboardRange
): Promise<AdminAgentsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAgentsData();
  }

  try {
    const start = adminDashboardRangeStart(range);
    await ensureWorkerSessionSchema(sql);
    const rows = await sql<AgentDbRow[]>`
      with reservation_stats as (
        select
          agent_id,
          count(*) filter (where status = 'completed')::int as completed_count,
          count(*) filter (
            where status in ('cancelled', 'expired', 'failed')
          )::int as failed_count
        from public.task_reservations
        where ${start}::timestamptz is null
          or reserved_at >= ${start}
          or completed_at >= ${start}
          or released_at >= ${start}
        group by agent_id
      ),
      human_task_stats as (
        select
          count(*) filter (where status = 'completed')::int as completed_count,
          count(*) filter (
            where status in ('cancelled', 'failed', 'skipped')
          )::int as failed_count
        from public.tasks
        where actor_type = 'human'
          and (
            ${start}::timestamptz is null
            or created_at >= ${start}
            or completed_at >= ${start}
            or updated_at >= ${start}
          )
      ),
      active_tasks as (
        select
          reserved_by_agent_id as agent_id,
          count(*)::int as active_task_count
        from public.tasks
        where reserved_by_agent_id is not null
          and status in ('reserved', 'running')
        group by reserved_by_agent_id
      ),
      human_active_tasks as (
        select count(*)::int as active_task_count
        from public.tasks
        where actor_type = 'human'
          and status in (
            'needs_review',
            'queued',
            'reserved',
            'running',
            'waiting_approval'
          )
      ),
      latest_active_task as (
        select distinct on (reserved_by_agent_id)
          reserved_by_agent_id as agent_id,
          id::text as active_task_id,
          payload as active_task_payload,
          title as active_task_title
        from public.tasks
        where reserved_by_agent_id is not null
          and status in ('reserved', 'running')
        order by reserved_by_agent_id, updated_at desc
      ),
      human_latest_active_task as (
        select
          id::text as active_task_id,
          payload as active_task_payload,
          title as active_task_title
        from public.tasks
        where actor_type = 'human'
          and status in (
            'needs_review',
            'queued',
            'reserved',
            'running',
            'waiting_approval'
          )
        order by priority desc, scheduled_for asc, created_at asc
        limit 1
      ),
      worker_session_stats as (
        select
          agent_id,
          count(*)::int as worker_session_count,
          count(*) filter (where status = 'working')::int as working_session_count
        from public.worker_sessions
        where status <> 'offline'
          and last_seen_at >= now() - interval '2 minutes'
        group by agent_id
      )
      select
        agents.id::text,
        agents.name,
        agents.agent_type,
        agents.status,
        agents.capabilities,
        agents.model,
        agents.last_seen_at,
        agents.updated_at,
        coalesce(active_tasks.active_task_count, 0)
          + case
            when agents.agent_type = 'human'
              then coalesce(human_active_tasks.active_task_count, 0)
            else 0
          end as active_task_count,
        case
          when agents.agent_type = 'human'
            then coalesce(
              latest_active_task.active_task_id,
              human_latest_active_task.active_task_id
            )
          else latest_active_task.active_task_id
        end as active_task_id,
        case
          when agents.agent_type = 'human'
            then coalesce(
              latest_active_task.active_task_payload,
              human_latest_active_task.active_task_payload
            )
          else latest_active_task.active_task_payload
        end as active_task_payload,
        case
          when agents.agent_type = 'human'
            then coalesce(
              latest_active_task.active_task_title,
              human_latest_active_task.active_task_title
            )
          else latest_active_task.active_task_title
        end as active_task_title,
        coalesce(reservation_stats.completed_count, 0)
          + case
            when agents.agent_type = 'human'
              then coalesce(human_task_stats.completed_count, 0)
            else 0
          end as completed_count,
        coalesce(reservation_stats.failed_count, 0)
          + case
            when agents.agent_type = 'human'
              then coalesce(human_task_stats.failed_count, 0)
            else 0
          end as failed_count,
        coalesce(worker_session_stats.worker_session_count, 0) as worker_session_count,
        coalesce(worker_session_stats.working_session_count, 0) as working_session_count
      from public.agents
      left join reservation_stats on reservation_stats.agent_id = agents.id
      left join active_tasks on active_tasks.agent_id = agents.id
      left join latest_active_task on latest_active_task.agent_id = agents.id
      left join human_task_stats on agents.agent_type = 'human'
      left join human_active_tasks on agents.agent_type = 'human'
      left join human_latest_active_task on agents.agent_type = 'human'
      left join worker_session_stats on worker_session_stats.agent_id = agents.id
      where agents.metadata->>'hiddenFromDashboard' is distinct from 'true'
      order by
        case
          when array_position(${ADMIN_AGENT_DISPLAY_ORDER}::uuid[], agents.id) is null
            then 1
          else 0
        end,
        array_position(${ADMIN_AGENT_DISPLAY_ORDER}::uuid[], agents.id),
        lower(agents.name) asc,
        agents.id asc
      limit 120
    `;
    const agentRows = rows.map(agentRowFromDb);

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows: agentRows,
      summary: {
        active: agentRows.filter((row) => row.status === "active").length,
        offline: agentRows.filter((row) => row.status === "offline").length,
        paused: agentRows.filter((row) => row.status === "paused").length,
        retired: agentRows.filter((row) => row.status === "retired").length,
        total: agentRows.length,
        working: agentRows.filter((row) => row.activeTaskCount > 0).length
      }
    };
  } catch (error) {
    console.error("Unable to load admin agents", error);
    return emptyAgentsData();
  }
}
