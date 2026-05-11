import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";

export type AdminAlertSource = "bpm" | "cron" | "task" | "task_event";
export type AdminAlertAction = "acknowledged" | "resolved";

export type AdminAlertAcknowledgement = Readonly<{
  acknowledgedAt: string | null;
  actor: string;
  id: string;
  note: string | null;
  resolvedAt: string | null;
  source: AdminAlertSource;
  sourceId: string;
  status: AdminAlertAction;
  updatedAt: string;
}>;

const sources = new Set<AdminAlertSource>([
  "bpm",
  "cron",
  "task",
  "task_event"
]);

function iso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

export function isAdminAlertSource(value: unknown): value is AdminAlertSource {
  return typeof value === "string" && sources.has(value as AdminAlertSource);
}

export async function recordAdminAlertAction(input: Readonly<{
  action: AdminAlertAction;
  actor?: string | null;
  note?: string | null;
  source: AdminAlertSource;
  sourceId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const actor = input.actor?.trim() || "admin_api";
  const note = input.note?.trim() || null;
  const rows = await sql<
    Array<{
      acknowledged_at: Date | string | null;
      actor: string;
      id: string;
      note: string | null;
      resolved_at: Date | string | null;
      source: AdminAlertSource;
      source_id: string;
      status: AdminAlertAction;
      updated_at: Date | string;
    }>
  >`
    insert into public.admin_alert_acknowledgements (
      id,
      source,
      source_id,
      status,
      actor,
      note,
      acknowledged_at,
      resolved_at,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${input.source},
      ${input.sourceId},
      ${input.action},
      ${actor},
      ${note},
      now(),
      ${input.action === "resolved" ? sql`now()` : sql`null`},
      now(),
      now()
    )
    on conflict (source, source_id) do update set
      status = excluded.status,
      actor = excluded.actor,
      note = excluded.note,
      acknowledged_at = coalesce(public.admin_alert_acknowledgements.acknowledged_at, now()),
      resolved_at = case
        when excluded.status = 'resolved' then coalesce(public.admin_alert_acknowledgements.resolved_at, now())
        else null
      end,
      updated_at = now()
    returning
      id::text,
      source,
      source_id,
      status,
      actor,
      note,
      acknowledged_at,
      resolved_at,
      updated_at
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Unable to record alert action");
  }

  return {
    acknowledgedAt: iso(row.acknowledged_at),
    actor: row.actor,
    id: row.id,
    note: row.note,
    resolvedAt: iso(row.resolved_at),
    source: row.source,
    sourceId: row.source_id,
    status: row.status,
    updatedAt: new Date(row.updated_at).toISOString()
  } satisfies AdminAlertAcknowledgement;
}
