import type postgres from "postgres";
import { getSql } from "@/lib/db";

function toJsonValue(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value ?? null)) as postgres.JSONValue;
}

export async function recordAdminAudit({
  action,
  actorPersonId,
  assumedPersonId = null,
  metadata = {},
  organisationId,
  resourceId = null,
  resourceType = null
}: Readonly<{
  action: string;
  actorPersonId?: string | null;
  assumedPersonId?: string | null;
  metadata?: Record<string, unknown>;
  organisationId?: string | null;
  resourceId?: string | null;
  resourceType?: string | null;
}>) {
  const sql = getSql();

  if (!sql) {
    return;
  }

  const persistedActorPersonId =
    actorPersonId?.startsWith("00000000-0000-4000-8000-")
      ? null
      : actorPersonId ?? null;
  const persistedAssumedPersonId =
    assumedPersonId?.startsWith("00000000-0000-4000-8000-")
      ? null
      : assumedPersonId ?? null;

  await sql`
    insert into public.admin_audit_events (
      organisation_id,
      actor_person_id,
      assumed_person_id,
      action,
      resource_type,
      resource_id,
      metadata
    )
    values (
      ${organisationId ?? null}::uuid,
      ${persistedActorPersonId}::uuid,
      ${persistedAssumedPersonId}::uuid,
      ${action},
      ${resourceType},
      ${resourceId},
      ${sql.json(toJsonValue(metadata))}::jsonb
    )
  `.catch(() => undefined);
}
