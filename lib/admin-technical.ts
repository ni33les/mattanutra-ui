import { getSql } from "@/lib/db";
import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";

export type AdminJobStatus = "complete" | "failed" | "queued" | "running";
export type AdminTechnicalSeverity = "critical" | "high" | "low" | "medium";

export type AdminJobRow = Readonly<{
  attempts: number;
  completedAt: string | null;
  errorMessage: string | null;
  failedAt: string | null;
  id: string;
  jobType: string;
  latestAuditAt: string | null;
  latestAuditEvent: string | null;
  latestAuditLevel: AdminTechnicalSeverity | null;
  latestAuditPayload: Record<string, unknown>;
  payload: Record<string, unknown>;
  planId: string | null;
  priority: number;
  queuedAt: string;
  startedAt: string | null;
  status: AdminJobStatus;
  updatedAt: string;
}>;

export type AdminJobsData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminJobRow[];
  summary: {
    complete: number;
    failed: number;
    queued: number;
    running: number;
    total: number;
  };
}>;

export type AdminTechnicalAlertRow = Readonly<{
  cronId: string | null;
  details: Record<string, unknown>;
  eventType: string | null;
  id: string;
  jobId: string | null;
  jobType: string | null;
  message: string;
  occurredAt: string;
  planId: string | null;
  severity: AdminTechnicalSeverity;
  source: "bpm" | "cron" | "job" | "job_audit";
  status: string | null;
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

type JobDbRow = Readonly<{
  attempts: number | string;
  completed_at: Date | string | null;
  error_message: string | null;
  failed_at: Date | string | null;
  id: string;
  job_type: string;
  latest_audit_at: Date | string | null;
  latest_audit_event: string | null;
  latest_audit_level: AdminTechnicalSeverity | null;
  latest_audit_payload: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  plan_id: string | null;
  priority: number | string;
  queued_at: Date | string;
  started_at: Date | string | null;
  status: AdminJobStatus | string;
  updated_at: Date | string;
}>;

type AlertDbRow = Readonly<{
  cron_id: string | null;
  details: Record<string, unknown> | null;
  event_type: string | null;
  id: string;
  job_id: string | null;
  job_type: string | null;
  message: string | null;
  occurred_at: Date | string;
  plan_id: string | null;
  severity: AdminTechnicalSeverity | string;
  source: AdminTechnicalAlertRow["source"];
  status: string | null;
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

function dateOrNull(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function severity(value: unknown): AdminTechnicalSeverity {
  return value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
    ? value
    : "medium";
}

function jobStatus(value: unknown): AdminJobStatus {
  return value === "complete" ||
    value === "failed" ||
    value === "running" ||
    value === "queued"
    ? value
    : "queued";
}

function jobRowFromDb(row: JobDbRow): AdminJobRow {
  return {
    attempts: Number(row.attempts) || 0,
    completedAt: dateOrNull(row.completed_at),
    errorMessage: row.error_message,
    failedAt: dateOrNull(row.failed_at),
    id: row.id,
    jobType: row.job_type,
    latestAuditAt: dateOrNull(row.latest_audit_at),
    latestAuditEvent: row.latest_audit_event,
    latestAuditLevel: row.latest_audit_level
      ? severity(row.latest_audit_level)
      : null,
    latestAuditPayload: jsonRecord(row.latest_audit_payload),
    payload: jsonRecord(row.payload),
    planId: row.plan_id,
    priority: Number(row.priority) || 0,
    queuedAt: new Date(row.queued_at).toISOString(),
    startedAt: dateOrNull(row.started_at),
    status: jobStatus(row.status),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function alertRowFromDb(row: AlertDbRow): AdminTechnicalAlertRow {
  return {
    cronId: row.cron_id,
    details: jsonRecord(row.details),
    eventType: row.event_type,
    id: row.id,
    jobId: row.job_id,
    jobType: row.job_type,
    message: row.message || "No detail recorded.",
    occurredAt: new Date(row.occurred_at).toISOString(),
    planId: row.plan_id,
    severity: severity(row.severity),
    source: row.source,
    status: row.status,
    title: row.title
  };
}

function emptyJobsData(): AdminJobsData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      complete: 0,
      failed: 0,
      queued: 0,
      running: 0,
      total: 0
    }
  };
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

function buildJobsSummary(rows: AdminJobRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      summary[row.status] += 1;

      return summary;
    },
    {
      complete: 0,
      failed: 0,
      queued: 0,
      running: 0,
      total: 0
    }
  );
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

export async function getAdminJobsData(
  range: AdminDashboardRange
): Promise<AdminJobsData> {
  const sql = getSql();

  if (!sql) {
    return emptyJobsData();
  }

  try {
    const start = adminDashboardRangeStart(range);
    const rangeFilter = start
      ? sql`where coalesce(jobs.updated_at, jobs.queued_at) >= ${start}`
      : sql``;
    const rows = await sql<JobDbRow[]>`
      select
        jobs.id::text,
        jobs.job_type,
        jobs.plan_id::text,
        jobs.status,
        jobs.priority,
        jobs.attempts,
        jobs.payload,
        jobs.error_message,
        jobs.queued_at,
        jobs.started_at,
        jobs.completed_at,
        jobs.failed_at,
        jobs.updated_at,
        latest.event_type as latest_audit_event,
        latest.level as latest_audit_level,
        latest.event_payload as latest_audit_payload,
        latest.created_at as latest_audit_at
      from public.jobs
      left join lateral (
        select event_type, level, event_payload, created_at
        from public.job_audit_events
        where job_audit_events.job_id = jobs.id
        order by created_at desc
        limit 1
      ) latest on true
      ${rangeFilter}
      order by
        case jobs.status
          when 'failed' then 1
          when 'running' then 2
          when 'queued' then 3
          else 4
        end,
        jobs.updated_at desc
      limit 300
    `;
    const mappedRows = rows.map(jobRowFromDb);

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows: mappedRows,
      summary: buildJobsSummary(mappedRows)
    };
  } catch (error) {
    console.error("Unable to load admin jobs", error);
    return emptyJobsData();
  }
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
    const bpmTimeFilter = start ? sql`and bpm.occurred_at >= ${start}` : sql``;
    const [
      failedJobs,
      stuckJobs,
      failedCron,
      highAuditEvents,
      highBpmEvents
    ] = await Promise.all([
      sql<AlertDbRow[]>`
        select
          jobs.id::text as id,
          'job'::text as source,
          'high'::text as severity,
          jobs.job_type || ' failed' as title,
          coalesce(jobs.error_message, 'Job failed without a recorded error.') as message,
          jobs.id::text as job_id,
          null::text as cron_id,
          jobs.plan_id::text as plan_id,
          jobs.job_type,
          jobs.status,
          'job_failed'::text as event_type,
          coalesce(jobs.failed_at, jobs.updated_at, jobs.queued_at) as occurred_at,
          jsonb_build_object(
            'attempts', jobs.attempts,
            'priority', jobs.priority,
            'payload', jobs.payload
          ) as details
        from public.jobs
        where jobs.status = 'failed'
          ${start ? sql`and coalesce(jobs.failed_at, jobs.updated_at, jobs.queued_at) >= ${start}` : sql``}
        order by coalesce(jobs.failed_at, jobs.updated_at, jobs.queued_at) desc
        limit 100
      `,
      sql<AlertDbRow[]>`
        select
          jobs.id::text as id,
          'job'::text as source,
          'high'::text as severity,
          jobs.job_type || ' appears stuck' as title,
          'Job has been running for more than 10 minutes.' as message,
          jobs.id::text as job_id,
          null::text as cron_id,
          jobs.plan_id::text as plan_id,
          jobs.job_type,
          jobs.status,
          'job_stuck'::text as event_type,
          coalesce(jobs.started_at, jobs.updated_at, jobs.queued_at) as occurred_at,
          jsonb_build_object(
            'attempts', jobs.attempts,
            'priority', jobs.priority,
            'payload', jobs.payload
          ) as details
        from public.jobs
        where jobs.status = 'running'
          and jobs.started_at < now() - interval '10 minutes'
          ${start ? sql`and coalesce(jobs.started_at, jobs.updated_at, jobs.queued_at) >= ${start}` : sql``}
        order by coalesce(jobs.started_at, jobs.updated_at, jobs.queued_at) asc
        limit 100
      `,
      sql<AlertDbRow[]>`
        select
          cron.id::text as id,
          'cron'::text as source,
          'high'::text as severity,
          cron.action_type || ' cron failed' as title,
          coalesce(cron.error_message, 'Scheduled action failed without a recorded error.') as message,
          cron.job_id::text as job_id,
          cron.id::text as cron_id,
          cron.plan_id::text as plan_id,
          null::text as job_type,
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
          job_audit_events.id::text as id,
          'job_audit'::text as source,
          job_audit_events.level as severity,
          job_audit_events.event_type as title,
          coalesce(
            job_audit_events.event_payload ->> 'error',
            job_audit_events.event_payload ->> 'message',
            job_audit_events.event_payload ->> 'errorMessage',
            'High-priority job audit event.'
          ) as message,
          job_audit_events.job_id::text as job_id,
          null::text as cron_id,
          job_audit_events.plan_id::text as plan_id,
          jobs.job_type,
          jobs.status,
          job_audit_events.event_type,
          job_audit_events.created_at as occurred_at,
          job_audit_events.event_payload as details
        from public.job_audit_events
        left join public.jobs on jobs.id = job_audit_events.job_id
        where job_audit_events.level in ('high', 'critical')
          ${start ? sql`and job_audit_events.created_at >= ${start}` : sql``}
        order by job_audit_events.created_at desc
        limit 100
      `,
      sql<AlertDbRow[]>`
        select
          bpm.id::text as id,
          'bpm'::text as source,
          bpm.severity,
          bpm.event_name as title,
          coalesce(bpm.error_message, bpm.properties ->> 'error', bpm.properties ->> 'message', bpm.event_name) as message,
          bpm.job_id::text as job_id,
          bpm.cron_id::text as cron_id,
          bpm.plan_id::text as plan_id,
          null::text as job_type,
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
          ${bpmTimeFilter}
        order by bpm.occurred_at desc
        limit 100
      `
    ]);
    const rows = [
      ...failedJobs,
      ...stuckJobs,
      ...failedCron,
      ...highAuditEvents,
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
