import type postgres from "postgres";
import type { PlanOperationRecord } from "@/lib/agentic/store/types";
import { operationCursor, operationCursorBytes, withoutOperationCursor, withOperationCursor } from "@/lib/agentic/store/operation-checkpoint";

export type OperationChanges = Partial<Pick<PlanOperationRecord, "checkpoint" | "catalogueIdentity" | "referenceIdentity" | "status" | "response" | "error">>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as postgres.JSONValue;

/** Conditional writes evaluate ownership under PostgreSQL's row lock. Immutable
 * commands stay in the database during heartbeat/checkpoint metadata updates. */
export function operationCommands(sql: postgres.Sql) {
  return {
    async expireOperation(id: string, now: string, error: unknown) {
      const rows = await sql`update public.agentic_plan_operations set status='failed',version=version+1,updated_at=${now}::timestamptz,
        record_json=record_json || jsonb_build_object('status','failed','version',version+1,'leaseToken',null,'leaseExpiresAt',null,'updatedAt',${now}::text,'error',${sql.json(json(error))}::jsonb)
        where id=${id}::uuid and status in ('queued','running','retryable')
          and coalesce((record_json->>'deadlineAt')::timestamptz,created_at+interval '175 seconds')<=${now}::timestamptz returning id`;
      return rows.length === 1;
    },
    async claimOperation(id: string, token: string, now: string, leaseExpiresAt: string) {
      const [row] = await sql<{ record_json: PlanOperationRecord; checkpoint_cursor: Buffer | null }[]>`
        update public.agentic_plan_operations set status='running',version=version+1,updated_at=${now}::timestamptz,
          checkpoint_cursor=coalesce(checkpoint_cursor,decode(record_json #>> '{checkpoint,search,cursor}','base64')),
          record_json=(record_json #- '{checkpoint,search,cursor}') || jsonb_build_object('status','running','version',version+1,
            'leaseToken',${token}::text,'leaseExpiresAt',${leaseExpiresAt}::text,'updatedAt',${now}::text)
        where id=${id}::uuid and status in ('queued','retryable','running')
          and (status<>'running' or (record_json->>'leaseExpiresAt')::timestamptz<=${now}::timestamptz)
          and coalesce((record_json->>'deadlineAt')::timestamptz,created_at+interval '175 seconds')>${now}::timestamptz
        returning record_json,checkpoint_cursor`;
      return row ? withOperationCursor(row.record_json, row.checkpoint_cursor ?? undefined) : null;
    },
    async patchClaimedOperation(id: string, token: string, changes: OperationChanges, now: string, leaseExpiresAt: string | null) {
      const patch = { ...changes };
      const cursor = operationCursor({ checkpoint: changes.checkpoint } as PlanOperationRecord);
      if (Object.hasOwn(changes, "checkpoint")) patch.checkpoint = withoutOperationCursor({ checkpoint: changes.checkpoint } as PlanOperationRecord).checkpoint;
      const rows = await sql`update public.agentic_plan_operations set status=${changes.status ?? "running"},version=version+1,updated_at=${now}::timestamptz,
        record_json=(record_json #- '{checkpoint,search,cursor}') || ${sql.json(json(patch))}::jsonb ||
          jsonb_build_object('status',${changes.status ?? "running"}::text,'version',version+1,'updatedAt',${now}::text,'leaseExpiresAt',${leaseExpiresAt}::text),
        checkpoint_cursor=case when ${cursor !== undefined} then ${cursor === undefined ? null : operationCursorBytes(cursor)}
          when ${changes.checkpoint === null} then null else coalesce(checkpoint_cursor,decode(record_json #>> '{checkpoint,search,cursor}','base64')) end
        where id=${id}::uuid and status='running' and record_json->>'leaseToken'=${token}
          and (record_json->>'leaseExpiresAt')::timestamptz>${now}::timestamptz returning id`;
      return rows.length === 1;
    }
  };
}
