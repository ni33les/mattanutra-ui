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
        with next_version as (
          select greatest(
            (
              select coalesce(max(version), 0)
              from public.formulations
              where plan_id = ${input.planId}::uuid
            ),
            (
              select coalesce(max(version), 0)
              from public.recommendations
              where plan_id = ${input.planId}::uuid
            )
          ) + 1 as version
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
            ${input.planId}::uuid,
            next_version.version,
            ${db.json(toJsonValue(input.formulation))},
            ${input.modelVersion},
            now(),
            now()
          from next_version
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
            ${input.planId}::uuid,
            inserted_formulation.version,
            ${db.json(toJsonValue([]))},
            now(),
            now()
          from inserted_formulation
          returning version
        )
        select inserted_formulation.version
        from inserted_formulation
        left join inserted_recommendations using (version)
      `
    : await db<{ version: number | string }[]>`
        insert into public.formulations (
          plan_id,
          version,
          formulation,
          model_version,
          generated_at,
          updated_at
        )
        select
          ${input.planId}::uuid,
          coalesce(max(version), 0) + 1,
          ${db.json(toJsonValue(input.formulation))},
          ${input.modelVersion},
          now(),
          now()
        from public.formulations
        where plan_id = ${input.planId}::uuid
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
    insert into public.food_guidance (
      plan_id,
      version,
      guidance,
      model_version,
      generated_at,
      updated_at
    )
    select
      ${input.planId}::uuid,
      coalesce(max(version), 0) + 1,
      ${db.json(toJsonValue(input.foodGuidance))},
      ${input.modelVersion},
      now(),
      now()
    from public.food_guidance
    where plan_id = ${input.planId}::uuid
    returning version
  `;

  return Number(rows[0]?.version ?? 1);
}
