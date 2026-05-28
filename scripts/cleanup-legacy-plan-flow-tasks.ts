import postgres from "postgres";

const connection = process.env.DB_CONNECTION;

if (!connection) {
  throw new Error("DB_CONNECTION is not configured");
}

const sql = postgres(connection, { max: 1 });

const legacySources = [
  "assessment",
  "assessment_pregeneration",
  "paid_plan_adoption",
  "payment_checkout_pregeneration",
  "post_commit_readiness_refresh"
];

try {
  const skipped = await sql<Array<{
    id: string;
    plan_id: string | null;
    task_type: string;
  }>>`
    with candidates as (
      select id, plan_id, task_type
      from public.tasks
      where status = 'queued'
        and (
          (
            task_type in ('generate_food_guidance', 'generate_nutrition_report')
            and coalesce(payload ->> 'source', context ->> 'source') = any(${legacySources}::text[])
          )
          or (
            task_type = 'analyze_healthscore'
            and coalesce(payload ->> 'source', context ->> 'source') = 'product_recommendations_ready'
          )
        )
    ),
    updated as (
      update public.tasks
      set
        status = 'skipped',
        result_payload = coalesce(result_payload, '{}'::jsonb) || jsonb_build_object(
          'skippedReason', 'superseded_by_single_pass_plan_flow',
          'skippedAt', now()
        ),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where id in (select id from candidates)
      returning id, plan_id, task_type
    )
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
      updated.id,
      'task_skipped',
      'succeeded',
      'medium',
      jsonb_build_object(
        'reason', 'superseded_by_single_pass_plan_flow',
        'taskType', updated.task_type
      ),
      now(),
      now()
    from updated
    returning task_id::text as id,
      (select plan_id::text from public.tasks where public.tasks.id = task_events.task_id) as plan_id,
      (event_payload ->> 'taskType') as task_type
  `;

  console.log(
    JSON.stringify(
      {
        skipped: skipped.length,
        taskTypes: skipped.reduce<Record<string, number>>((counts, task) => {
          counts[task.task_type] = (counts[task.task_type] ?? 0) + 1;
          return counts;
        }, {})
      },
      null,
      2
    )
  );
} finally {
  await sql.end();
}
