import type postgres from "postgres";
import { toJsonValue } from "@/lib/assessment-store";

type Db = postgres.Sql | postgres.TransactionSql;

type JsonPayload = Record<string, unknown> | readonly unknown[];

function jsonPayload(value: unknown) {
  return toJsonValue(value ?? {});
}

export async function appendAssessmentEvent(
  db: Db,
  input: Readonly<{
    actor?: string | null;
    afterPayload?: unknown;
    changeReason: string;
    eventPayload?: unknown;
    eventType: string;
    planId: string;
    requestId?: string | null;
    source?: string | null;
    taskId?: string | null;
  }>
) {
  await db`
    insert into public.assessment_events (
      plan_id,
      event_type,
      actor,
      change_reason,
      source,
      task_id,
      request_id,
      before_payload,
      after_payload,
      event_payload,
      occurred_at,
      created_at
    )
    select
      assessments.plan_id,
      ${input.eventType},
      ${input.actor ?? "system"},
      ${input.changeReason},
      ${input.source ?? "application"},
      ${input.taskId ?? null}::uuid,
      ${input.requestId ?? null},
      to_jsonb(assessments),
      ${db.json(jsonPayload(input.afterPayload))}::jsonb,
      ${db.json(jsonPayload(input.eventPayload))}::jsonb,
      now(),
      now()
    from public.assessments assessments
    where assessments.plan_id = ${input.planId}::uuid
  `;
}

export async function appendSupplementVersion(
  db: Db,
  input: Readonly<{
    action: string;
    actor?: string | null;
    afterPayload?: unknown;
    beforePayload?: unknown;
    changeReason: string;
    source?: string | null;
    supplementId: string;
  }>
) {
  await db`
    insert into public.supplement_versions (
      supplement_id,
      version,
      action,
      actor,
      change_reason,
      source,
      before_payload,
      after_payload,
      created_at
    )
    select
      ${input.supplementId}::uuid,
      coalesce(max(version), 0) + 1,
      ${input.action},
      ${input.actor ?? "admin_dashboard"},
      ${input.changeReason},
      ${input.source ?? "application"},
      ${db.json(jsonPayload(input.beforePayload))}::jsonb,
      ${db.json(jsonPayload(input.afterPayload))}::jsonb,
      now()
    from public.supplement_versions
    where supplement_id = ${input.supplementId}::uuid
  `;
}

export async function appendSupplementAliasEvent(
  db: Db,
  input: Readonly<{
    action: string;
    actor?: string | null;
    afterPayload?: unknown;
    aliasId?: string | null;
    beforePayload?: unknown;
    changeReason: string;
    normalizedAlias?: string | null;
    source?: string | null;
    supplementId?: string | null;
  }>
) {
  await db`
    insert into public.supplement_alias_events (
      alias_id,
      supplement_id,
      normalized_alias,
      action,
      actor,
      change_reason,
      source,
      before_payload,
      after_payload,
      created_at
    )
    values (
      ${input.aliasId ?? null}::uuid,
      ${input.supplementId ?? null}::uuid,
      ${input.normalizedAlias ?? null},
      ${input.action},
      ${input.actor ?? "admin_dashboard"},
      ${input.changeReason},
      ${input.source ?? "application"},
      ${db.json(jsonPayload(input.beforePayload))}::jsonb,
      ${db.json(jsonPayload(input.afterPayload))}::jsonb,
      now()
    )
  `;
}

export async function appendProductFactVersion(
  db: Db,
  input: Readonly<{
    action: string;
    actor?: string | null;
    afterFacts: JsonPayload;
    beforeFacts: JsonPayload;
    changeReason: string;
    productId: string;
    source?: string | null;
  }>
) {
  await db`
    insert into public.product_fact_versions (
      product_id,
      version,
      action,
      actor,
      change_reason,
      source,
      before_facts_snapshot,
      after_facts_snapshot,
      created_at
    )
    select
      ${input.productId}::uuid,
      coalesce(max(version), 0) + 1,
      ${input.action},
      ${input.actor ?? "admin_dashboard"},
      ${input.changeReason},
      ${input.source ?? "application"},
      ${db.json(jsonPayload(input.beforeFacts))}::jsonb,
      ${db.json(jsonPayload(input.afterFacts))}::jsonb,
      now()
    from public.product_fact_versions
    where product_id = ${input.productId}::uuid
  `;
}
