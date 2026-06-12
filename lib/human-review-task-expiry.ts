import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { notifyTaskQueueChanged } from "@/lib/task-wakeup";

export const ADMIN_REVIEW_TASK_TYPES = [
  "classify_food",
  "classify_supplement",
  "review_food_for_plan",
  "review_supplement_for_plan",
  "review_product_import",
  "dose_reduction_notice"
] as const;

export const GENERIC_HUMAN_REVIEW_EXCLUDED_TASK_TYPES = [
  "retail_order_cancel_review",
  "retail_order_delivery_confirm",
  "retail_order_pack",
  "retail_order_pick",
  "retail_order_return_review",
  "retail_order_ship"
] as const;

export const GENERIC_HUMAN_REVIEW_EXPIRY_DAYS = 3;

type Db = postgres.Sql | postgres.TransactionSql;

export type HumanReviewTaskExpiryResult = Readonly<{
  dueDatesAssigned: number;
  expired: number;
}>;

async function humanReviewTaskTablesAvailable(sql: Db) {
  const rows = await sql<{ available: boolean }[]>`
    select to_regclass('public.tasks') is not null
      and to_regclass('public.task_events') is not null
      as available
  `;

  return rows[0]?.available === true;
}

export async function expireOverdueGenericHumanReviewTasks(
  sqlInput?: postgres.Sql
): Promise<HumanReviewTaskExpiryResult> {
  const sql = sqlInput ?? getSql();

  if (!sql || !(await humanReviewTaskTablesAvailable(sql))) {
    return { dueDatesAssigned: 0, expired: 0 };
  }

  const dueDateRows = await sql<Array<{ id: string }>>`
    update public.tasks
    set
      due_at = created_at + (${GENERIC_HUMAN_REVIEW_EXPIRY_DAYS}::int * interval '1 day'),
      updated_at = now()
    where actor_type = 'human'
      and not (task_type = any(${[...ADMIN_REVIEW_TASK_TYPES]}::text[]))
      and not (task_type = any(${[...GENERIC_HUMAN_REVIEW_EXCLUDED_TASK_TYPES]}::text[]))
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
      and due_at is null
    returning id::text
  `;

  const expiredRows = await sql<Array<{ id: string }>>`
    update public.tasks
    set
      status = 'skipped',
      completed_at = now(),
      lease_until = null,
      reserved_by_agent_id = null,
      result_payload = coalesce(result_payload, '{}'::jsonb) ||
        jsonb_build_object(
          'source', 'human_review_task_expiry_cron',
          'expiredAfterDays', ${GENERIC_HUMAN_REVIEW_EXPIRY_DAYS}::int,
          'expiredAt', now()
        ),
      updated_at = now()
    where actor_type = 'human'
      and not (task_type = any(${[...ADMIN_REVIEW_TASK_TYPES]}::text[]))
      and not (task_type = any(${[...GENERIC_HUMAN_REVIEW_EXCLUDED_TASK_TYPES]}::text[]))
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
      and created_at + (${GENERIC_HUMAN_REVIEW_EXPIRY_DAYS}::int * interval '1 day') <= now()
    returning id::text
  `;

  if (expiredRows.length > 0) {
    await sql`
      insert into public.task_events (
        id,
        task_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        expired_tasks.id::uuid,
        'human_review_task_expired',
        'succeeded',
        'low',
        jsonb_build_object(
          'source', 'cron',
          'expiredAfterDays', ${GENERIC_HUMAN_REVIEW_EXPIRY_DAYS}::int
        ),
        now(),
        now()
      from unnest(${expiredRows.map((task) => task.id)}::uuid[]) as expired_tasks(id)
    `;
  }

  if (dueDateRows.length > 0 || expiredRows.length > 0) {
    notifyTaskQueueChanged();
  }

  return {
    dueDatesAssigned: dueDateRows.length,
    expired: expiredRows.length
  };
}
