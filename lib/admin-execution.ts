import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { getSql } from "@/lib/db";

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
  maxAttempts: number;
  planId: string | null;
  priority: number;
  ray: string | null;
  reasoningEffort: string;
  requiredCapabilities: string[];
  scheduledFor: string;
  status: string;
  taskType: string;
  title: string;
  updatedAt: string;
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
  max_attempts: number | string;
  payload: Record<string, unknown> | null;
  plan_id: string | null;
  priority: number | string;
  ray: string | null;
  reasoning_effort: string;
  required_capabilities: string[] | null;
  scheduled_for: Date | string;
  status: string;
  task_type: string;
  title: string;
  updated_at: Date | string;
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
    maxAttempts: numberValue(row.max_attempts),
    planId: row.plan_id,
    priority: numberValue(row.priority),
    ray: row.ray,
    reasoningEffort: row.reasoning_effort,
    requiredCapabilities: row.required_capabilities ?? [],
    scheduledFor: iso(row.scheduled_for),
    status: row.status,
    taskType: row.task_type,
    title: displayTaskTitle(row.title, row.payload),
    updatedAt: iso(row.updated_at)
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
    updatedAt: iso(row.updated_at)
  };
}

export async function getAdminTaskVisibilityData(
  range: AdminDashboardRange
): Promise<AdminTaskVisibilityData> {
  const sql = getSql();

  if (!sql) {
    return emptyVisibilityData();
  }

  try {
    const start = adminDashboardRangeStart(range);
    const liveStatuses = [
      "blocked",
      "needs_review",
      "queued",
      "reserved",
      "running",
      "waiting_approval"
    ];
    const whereClause = sql`
      (${start}::timestamptz is null
        or tasks.created_at >= ${start}
        or tasks.updated_at >= ${start}
        or tasks.status = any(${liveStatuses}))
    `;
    const [summaryRows, taskRows] = await Promise.all([
      sql<VisibilitySummaryDbRow[]>`
        select
          count(*)::int as total,
          count(*) filter (where tasks.status = 'queued')::int as queued,
          count(*) filter (where tasks.status in ('reserved', 'running'))::int as active,
          count(*) filter (
            where tasks.actor_type = 'human'
              or tasks.status in ('needs_review', 'waiting_approval')
          )::int as human,
          count(*) filter (where tasks.status = 'blocked')::int as blocked,
          count(*) filter (
            where tasks.status = 'failed'
              or (
                tasks.status in ('reserved', 'running')
                and tasks.lease_until is not null
                and tasks.lease_until < now()
              )
          )::int as failed,
          count(*) filter (where tasks.status = 'completed')::int as completed
        from public.tasks
        where ${whereClause}
      `,
      sql<VisibilityDbRow[]>`
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
          goals.id::text as goal_id,
          goals.title as goal_title,
          goals.status as goal_status,
          goals.priority as goal_priority,
          goals.plan_id::text,
          goals.ray::text,
          agents.id::text as agent_id,
          agents.name as agent_name,
          (
            select count(*)::int
            from public.task_dependencies
            inner join public.tasks dependency_tasks
              on dependency_tasks.id = task_dependencies.depends_on_task_id
            where task_dependencies.task_id = tasks.id
              and dependency_tasks.status <> 'completed'
          ) as blocked_dependency_count
        from public.tasks
        inner join public.goals on goals.id = tasks.goal_id
        left join public.agents on agents.id = tasks.reserved_by_agent_id
        where ${whereClause}
        order by
          case tasks.status
            when 'queued' then 0
            when 'reserved' then 1
            when 'running' then 2
            when 'needs_review' then 3
            when 'waiting_approval' then 3
            when 'blocked' then 4
            when 'failed' then 5
            when 'completed' then 6
            when 'skipped' then 7
            when 'cancelled' then 8
            else 9
          end,
          goals.priority desc,
          tasks.priority desc,
          tasks.scheduled_for asc,
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
            'blocked',
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
            'blocked',
            'needs_review',
            'queued',
            'reserved',
            'running',
            'waiting_approval'
          )
        order by priority desc, scheduled_for asc, created_at asc
        limit 1
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
          end as failed_count
      from public.agents
      left join reservation_stats on reservation_stats.agent_id = agents.id
      left join active_tasks on active_tasks.agent_id = agents.id
      left join latest_active_task on latest_active_task.agent_id = agents.id
      left join human_task_stats on agents.agent_type = 'human'
      left join human_active_tasks on agents.agent_type = 'human'
      left join human_latest_active_task on agents.agent_type = 'human'
      order by
        active_task_count desc,
        agents.status asc,
        agents.updated_at desc
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
