import { getSql } from "@/lib/db";
import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";

export type AdminTechnicalSeverity = "critical" | "high" | "low" | "medium";

export type AdminTechnicalAlertRow = Readonly<{
  cronId: string | null;
  details: Record<string, unknown>;
  eventType: string | null;
  id: string;
  message: string;
  occurredAt: string;
  planId: string | null;
  rootCause: string;
  severity: AdminTechnicalSeverity;
  source: "bpm" | "cron" | "task" | "task_event";
  status: string | null;
  taskId: string | null;
  taskType: string | null;
  title: string;
}>;

export type AdminTechnicalAlertsData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminTechnicalAlertRow[];
  summary: {
    critical: number;
    high: number;
    low: number;
    medium: number;
    total: number;
  };
}>;

type AlertDbRow = Readonly<{
  cron_id: string | null;
  details: Record<string, unknown> | null;
  event_type: string | null;
  id: string;
  message: string | null;
  occurred_at: Date | string;
  plan_id: string | null;
  severity: AdminTechnicalSeverity | string;
  source: AdminTechnicalAlertRow["source"];
  status: string | null;
  task_id: string | null;
  task_type: string | null;
  title: string;
}>;

const severityRank: Record<AdminTechnicalSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeSeverity(value: string): AdminTechnicalSeverity {
  return value === "critical" ||
    value === "high" ||
    value === "low" ||
    value === "medium"
    ? value
    : "medium";
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function usefulCause(value: unknown) {
  const text = textValue(value);

  if (
    !text ||
    text === "Task failed." ||
    text === "High-priority task event." ||
    text === "Task failed without a recorded error." ||
    text === "Scheduled action failed without a recorded error."
  ) {
    return "";
  }

  return text;
}

function findRootCause(value: unknown, depth = 0): string {
  if (depth > 4) {
    return "";
  }

  const record = jsonRecord(value);

  for (const key of [
    "rootCause",
    "errorMessage",
    "error",
    "message",
    "reason",
    "cause"
  ]) {
    const cause = usefulCause(record[key]);

    if (cause) {
      return cause;
    }
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      const cause = findRootCause(nested, depth + 1);

      if (cause) {
        return cause;
      }
    }
  }

  return "";
}

function explainRootCause({
  details,
  fallback,
  taskType
}: Readonly<{
  details: Record<string, unknown>;
  fallback: string;
  taskType: string | null;
}>) {
  const rawCause = findRootCause(details) || usefulCause(fallback) || fallback;
  const lower = rawCause.toLowerCase();

  if (lower.includes("this operation was aborted")) {
    return taskType === "analyze_healthscore"
      ? "xAI HealthScore analysis timed out before a response was returned."
      : "The external request was aborted before a response was returned.";
  }

  if (lower.includes("healthscore") && lower.includes("timed out")) {
    return rawCause;
  }

  if (lower.includes("connect_timeout")) {
    return "A network or database connection timed out before a response was returned.";
  }

  return rawCause;
}

function emptyAlertsData(): AdminTechnicalAlertsData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      critical: 0,
      high: 0,
      low: 0,
      medium: 0,
      total: 0
    }
  };
}

function buildAlertsSummary(rows: AdminTechnicalAlertRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      summary[row.severity] += 1;

      return summary;
    },
    {
      critical: 0,
      high: 0,
      low: 0,
      medium: 0,
      total: 0
    }
  );
}

function alertRowFromDb(row: AlertDbRow): AdminTechnicalAlertRow {
  const details = jsonRecord(row.details);
  const message = row.message ?? row.title;

  return {
    cronId: row.cron_id,
    details,
    eventType: row.event_type,
    id: row.id,
    message,
    occurredAt: iso(row.occurred_at),
    planId: row.plan_id,
    rootCause: explainRootCause({
      details,
      fallback: message,
      taskType: row.task_type
    }),
    severity: normalizeSeverity(row.severity),
    source: row.source,
    status: row.status,
    taskId: row.task_id,
    taskType: row.task_type,
    title: row.title
  };
}

export async function getAdminTechnicalAlertsData(
  range: AdminDashboardRange
): Promise<AdminTechnicalAlertsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAlertsData();
  }

  try {
    const start = adminDashboardRangeStart(range);
    const [
      failedTasks,
      stuckTasks,
      failedCron,
      highTaskEvents,
      highBpmEvents
    ] = await Promise.all([
      sql<AlertDbRow[]>`
        select
          tasks.id::text as id,
          'task'::text as source,
          'high'::text as severity,
          tasks.task_type || ' failed' as title,
          coalesce(tasks.error_message, 'Task failed without a recorded error.') as message,
          null::text as cron_id,
          tasks.plan_id::text as plan_id,
          tasks.id::text as task_id,
          tasks.task_type,
          tasks.status,
          'task_failed'::text as event_type,
          coalesce(tasks.completed_at, tasks.updated_at, tasks.created_at) as occurred_at,
          jsonb_build_object(
            'attempts', tasks.attempts,
            'priority', tasks.priority,
            'payload', tasks.payload,
            'resultPayload', tasks.result_payload
          ) as details
        from public.tasks
        where tasks.status = 'failed'
          ${start ? sql`and coalesce(tasks.completed_at, tasks.updated_at, tasks.created_at) >= ${start}` : sql``}
        order by coalesce(tasks.completed_at, tasks.updated_at, tasks.created_at) desc
        limit 100
      `,
      sql<AlertDbRow[]>`
        select
          tasks.id::text as id,
          'task'::text as source,
          'high'::text as severity,
          tasks.task_type || ' appears stuck' as title,
          'Task lease has expired while it is still reserved or running.' as message,
          null::text as cron_id,
          tasks.plan_id::text as plan_id,
          tasks.id::text as task_id,
          tasks.task_type,
          tasks.status,
          'task_stuck'::text as event_type,
          coalesce(tasks.started_at, tasks.updated_at, tasks.created_at) as occurred_at,
          jsonb_build_object(
            'attempts', tasks.attempts,
            'priority', tasks.priority,
            'leaseUntil', tasks.lease_until,
            'payload', tasks.payload
          ) as details
        from public.tasks
        where tasks.status in ('reserved', 'running')
          and coalesce(tasks.lease_until, tasks.updated_at) < now()
          ${start ? sql`and coalesce(tasks.started_at, tasks.updated_at, tasks.created_at) >= ${start}` : sql``}
        order by coalesce(tasks.started_at, tasks.updated_at, tasks.created_at) asc
        limit 100
      `,
      sql<AlertDbRow[]>`
        select
          cron.id::text as id,
          'cron'::text as source,
          'high'::text as severity,
          cron.action_type || ' cron failed' as title,
          coalesce(cron.error_message, 'Scheduled action failed without a recorded error.') as message,
          cron.id::text as cron_id,
          cron.plan_id::text as plan_id,
          null::text as task_id,
          null::text as task_type,
          cron.status,
          'cron_failed'::text as event_type,
          coalesce(cron.updated_at, cron.scheduled_for, cron.created_at) as occurred_at,
          jsonb_build_object(
            'attempts', cron.attempts,
            'actionType', cron.action_type,
            'payload', cron.payload,
            'resultPayload', cron.result_payload
          ) as details
        from public.cron
        where cron.status = 'failed'
          ${start ? sql`and coalesce(cron.updated_at, cron.scheduled_for, cron.created_at) >= ${start}` : sql``}
        order by coalesce(cron.updated_at, cron.scheduled_for, cron.created_at) desc
        limit 100
      `,
      sql<AlertDbRow[]>`
        select
          task_events.id::text as id,
          'task_event'::text as source,
          task_events.severity,
          task_events.event_type as title,
          coalesce(
            task_events.event_payload ->> 'error',
            task_events.event_payload ->> 'message',
            task_events.event_payload ->> 'errorMessage',
            'High-priority task event.'
          ) as message,
          null::text as cron_id,
          tasks.plan_id::text as plan_id,
          task_events.task_id::text as task_id,
          tasks.task_type,
          tasks.status,
          task_events.event_type,
          task_events.created_at as occurred_at,
          task_events.event_payload as details
        from public.task_events
        left join public.tasks on tasks.id = task_events.task_id
        where task_events.severity in ('high', 'critical')
          ${start ? sql`and task_events.created_at >= ${start}` : sql``}
        order by task_events.created_at desc
        limit 100
      `,
      sql<AlertDbRow[]>`
        select
          bpm.id::text as id,
          'bpm'::text as source,
          bpm.severity,
          bpm.event_name as title,
          coalesce(bpm.error_message, bpm.properties ->> 'error', bpm.properties ->> 'message', bpm.event_name) as message,
          bpm.cron_id::text as cron_id,
          bpm.plan_id::text as plan_id,
          bpm.properties ->> 'taskId' as task_id,
          null::text as task_type,
          bpm.event_status as status,
          bpm.event_type,
          bpm.occurred_at,
          jsonb_build_object(
            'properties', bpm.properties,
            'metrics', bpm.metrics,
            'path', bpm.path,
            'route', bpm.route
          ) as details
        from public.bpm
        where (bpm.event_type = 'error' or bpm.severity in ('high', 'critical'))
          ${start ? sql`and bpm.occurred_at >= ${start}` : sql``}
        order by bpm.occurred_at desc
        limit 100
      `
    ]);
    const rows = [
      ...failedTasks,
      ...stuckTasks,
      ...failedCron,
      ...highTaskEvents,
      ...highBpmEvents
    ]
      .map(alertRowFromDb)
      .sort((a, b) => {
        const severityDifference =
          severityRank[a.severity] - severityRank[b.severity];

        if (severityDifference !== 0) {
          return severityDifference;
        }

        return (
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
        );
      })
      .slice(0, 300);

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows,
      summary: buildAlertsSummary(rows)
    };
  } catch (error) {
    console.error("Unable to load admin technical alerts", error);
    return emptyAlertsData();
  }
}
