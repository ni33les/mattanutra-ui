import type postgres from "postgres";
import { toJsonValue } from "@/lib/assessment-store";

type Db = postgres.Sql | postgres.TransactionSql;

function jsonPayload(value: unknown) {
  return toJsonValue(value ?? {});
}

export async function appendAssessmentVersion(
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
    with bumped as (
      insert into public.assessment_version_counters as counters (
        plan_id,
        current_version
      )
      values (
        ${input.planId}::uuid,
        1
      )
      on conflict (plan_id) do update set
        current_version = counters.current_version + 1
      returning
        counters.plan_id,
        counters.current_version
    )
    insert into public.assessment_versions (
      plan_id,
      version,
      action,
      actor,
      reason,
      source,
      task_id,
      request_id,
      snapshot,
      metadata,
      created_at
    )
    select
      bumped.plan_id,
      bumped.current_version,
      ${input.eventType},
      ${input.actor ?? "system"},
      ${input.changeReason},
      ${input.source ?? "application"},
      ${input.taskId ?? null}::uuid,
      ${input.requestId ?? null},
      jsonb_build_object(
        'projectionBefore', coalesce((
          select to_jsonb(assessments.*)
          from public.assessments
          where assessments.plan_id = bumped.plan_id
          limit 1
        ), '{}'::jsonb),
        'projectionPatch', ${db.json(jsonPayload(input.afterPayload))}::jsonb
      ),
      ${db.json(jsonPayload(input.eventPayload))}::jsonb,
      now()
    from bumped
  `;
}

export async function appendNutritionPlanVersion(
  db: Db,
  input: Readonly<{
    actor?: string | null;
    planId: string;
    reason: string;
    snapshot: unknown;
    source?: string | null;
    taskId?: string | null;
  }>
) {
  await db`
    insert into public.nutrition_plan_versions (
      plan_id,
      version,
      action,
      actor,
      reason,
      source,
      task_id,
      snapshot,
      metadata,
      created_at
    )
    values (
      ${input.planId}::uuid,
      coalesce((
        select max(version)
        from public.nutrition_plan_versions
        where plan_id = ${input.planId}::uuid
      ), 0) + 1,
      'snapshot_recorded',
      ${input.actor ?? "system"},
      ${input.reason},
      ${input.source ?? "application"},
      ${input.taskId ?? null}::uuid,
      ${db.json(jsonPayload(input.snapshot))}::jsonb,
      '{}'::jsonb,
      now()
    )
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
      snapshot,
      metadata,
      created_at
    )
    values (
      ${input.supplementId}::uuid,
      coalesce((
        select max(version)
        from public.supplement_versions
        where supplement_id = ${input.supplementId}::uuid
      ), 0) + 1,
      ${input.action},
      ${input.actor ?? "admin_dashboard"},
      ${input.changeReason},
      ${input.source ?? "application"},
      ${db.json(jsonPayload(input.beforePayload))}::jsonb,
      ${db.json(jsonPayload(input.afterPayload))}::jsonb,
      jsonb_build_object(
        'projectionBefore', ${db.json(jsonPayload(input.beforePayload))}::jsonb,
        'projectionPatch', ${db.json(jsonPayload(input.afterPayload))}::jsonb
      ),
      '{}'::jsonb,
      now()
    )
  `;
}

export async function appendSupplementAliasVersion(
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
  if (!input.supplementId) {
    throw new Error("Supplement alias versions require a supplement ID");
  }

  await appendSupplementVersion(db, {
    action: input.action,
    actor: input.actor,
    afterPayload: {
      aliasChange: {
        aliasId: input.aliasId ?? null,
        normalizedAlias: input.normalizedAlias ?? null,
        payload: jsonPayload(input.afterPayload)
      }
    },
    beforePayload: {
      aliasChange: {
        aliasId: input.aliasId ?? null,
        normalizedAlias: input.normalizedAlias ?? null,
        payload: jsonPayload(input.beforePayload)
      }
    },
    changeReason: input.changeReason,
    source: input.source,
    supplementId: input.supplementId
  });
}
