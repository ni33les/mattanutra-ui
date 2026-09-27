import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { assessmentInputHash } from "@/lib/assessment-revisions";
import { FunnelError } from "@/lib/funnel-errors";

function requestHash(key: string, input: unknown) {
  if (!key || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new FunnelError("A valid Idempotency-Key is required", 400, "invalid_idempotency_key");
  }
  return assessmentInputHash(input);
}

/** Only completed receipts are immutable. Incomplete checkout claims still serialize. */
export async function completedFunnelRequest(sql: postgres.Sql, scope: string, key: string, input: unknown) {
  const hash = requestHash(key, input);
  const [row] = await sql`select input_hash, response from public.funnel_requests
    where scope=${scope} and request_key=${key} and response is not null`;
  if (!row) return null;
  if (row.input_hash !== hash) throw new FunnelError("This request key was already used for different input", 409, "idempotency_conflict");
  return row.response as Record<string, unknown>;
}

/** Call inside a transaction. An unsuccessful capture rolls its request receipt back too. */
export async function claimFunnelRequest(
  sql: postgres.Sql | postgres.TransactionSql,
  scope: string,
  key: string,
  input: unknown,
  resourceId: string = randomUUID()
) {
  const hash = requestHash(key, input);
  const [inserted] = await sql`insert into public.funnel_requests (scope, request_key, input_hash, resource_id)
    values (${scope}, ${key}, ${hash}, ${resourceId}::uuid) on conflict (scope, request_key) do nothing returning resource_id, input_hash, response`;
  const row = inserted ?? (await sql`select resource_id, input_hash, response from public.funnel_requests
    where scope = ${scope} and request_key = ${key} for update`)[0];
  if (row.input_hash !== hash) throw new FunnelError("This request key was already used for different input", 409, "idempotency_conflict");
  return { resourceId: String(row.resource_id), response: row.response as Record<string, unknown> | null };
}

export async function completeFunnelRequest(
  sql: postgres.Sql | postgres.TransactionSql, scope: string, key: string, response: unknown
) {
  await sql`update public.funnel_requests set response = ${sql.json(JSON.parse(JSON.stringify(response)))}
    where scope = ${scope} and request_key = ${key}`;
}
