import type postgres from "postgres";
import { toJsonValue } from "@/lib/assessment-store";

type Db = postgres.Sql | postgres.TransactionSql;

export async function insertFormulationVersion(
  db: Db,
  input: Readonly<{
    formulation: Record<string, unknown>;
    includeEmptyRecommendations?: boolean;
    modelVersion: string;
    planId: string;
  }>
) {
  const rows = input.includeEmptyRecommendations
    ? await db<{ version: number | string }[]>`
        with bumped as (
          insert into public.assessment_version_counters as counters (
            plan_id,
            current_formulation_version
          )
          values (
            ${input.planId}::uuid,
            1
          )
          on conflict (plan_id) do update set
            current_formulation_version = counters.current_formulation_version + 1
          returning counters.plan_id, counters.current_formulation_version as version
        ),
        inserted_formulation as (
          insert into public.formulations (
            plan_id,
            version,
            formulation,
            model_version,
            generated_at,
            updated_at
          )
          select
            bumped.plan_id,
            bumped.version,
            ${db.json(toJsonValue(input.formulation))},
            ${input.modelVersion},
            now(),
            now()
          from bumped
          returning version
        ),
        inserted_recommendations as (
          insert into public.recommendations (
            plan_id,
            version,
            recommendations,
            generated_at,
            updated_at
          )
          select
            bumped.plan_id,
            bumped.version,
            ${db.json(toJsonValue([]))},
            now(),
            now()
          from bumped
          returning version
        )
        select inserted_formulation.version
        from inserted_formulation
        left join inserted_recommendations using (version)
      `
    : await db<{ version: number | string }[]>`
        with bumped as (
          insert into public.assessment_version_counters as counters (
            plan_id,
            current_formulation_version
          )
          values (
            ${input.planId}::uuid,
            1
          )
          on conflict (plan_id) do update set
            current_formulation_version = counters.current_formulation_version + 1
          returning counters.plan_id, counters.current_formulation_version as version
        )
        insert into public.formulations (
          plan_id,
          version,
          formulation,
          model_version,
          generated_at,
          updated_at
        )
        select
          bumped.plan_id,
          bumped.version,
          ${db.json(toJsonValue(input.formulation))},
          ${input.modelVersion},
          now(),
          now()
        from bumped
        returning version
      `;

  return Number(rows[0]?.version ?? 1);
}

export async function insertFoodGuidanceVersion(
  db: Db,
  input: Readonly<{
    foodGuidance: Record<string, unknown>;
    modelVersion: string;
    planId: string;
  }>
) {
  const rows = await db<{ version: number | string }[]>`
    with bumped as (
      insert into public.assessment_version_counters as counters (
        plan_id,
        current_food_guidance_version
      )
      values (
        ${input.planId}::uuid,
        1
      )
      on conflict (plan_id) do update set
        current_food_guidance_version = counters.current_food_guidance_version + 1
      returning counters.plan_id, counters.current_food_guidance_version as version
    )
    insert into public.food_guidance (
      plan_id,
      version,
      guidance,
      model_version,
      generated_at,
      updated_at
    )
    select
      bumped.plan_id,
      bumped.version,
      ${db.json(toJsonValue(input.foodGuidance))},
      ${input.modelVersion},
      now(),
      now()
    from bumped
    returning version
  `;

  return Number(rows[0]?.version ?? 1);
}
