import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { assessmentInputHash } from "@/lib/assessment-revisions";
import { FunnelError } from "@/lib/funnel-errors";

/** Call inside a transaction. An unsuccessful capture rolls its request receipt back too. */
export async function claimFunnelRequest(
  sql: postgres.Sql | postgres.TransactionSql,
  scope: string,
  key: string,
  input: unknown,
  resourceId: string = randomUUID()
) {
  if (!key || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new FunnelError("A valid Idempotency-Key is required", 400, "invalid_idempotency_key");
  }
  const hash = assessmentInputHash(input);
  await sql`insert into public.funnel_requests (scope, request_key, input_hash, resource_id)
    values (${scope}, ${key}, ${hash}, ${resourceId}::uuid) on conflict (scope, request_key) do nothing`;
  const [row] = await sql`select * from public.funnel_requests
    where scope = ${scope} and request_key = ${key} for update`;
  if (row.input_hash !== hash) throw new FunnelError("This request key was already used for different input", 409, "idempotency_conflict");
  return { resourceId: String(row.resource_id), response: row.response as Record<string, unknown> | null };
}

export async function completeFunnelRequest(
  sql: postgres.Sql | postgres.TransactionSql, scope: string, key: string, response: unknown
) {
  await sql`update public.funnel_requests set response = ${sql.json(JSON.parse(JSON.stringify(response)))}
    where scope = ${scope} and request_key = ${key}`;
}
