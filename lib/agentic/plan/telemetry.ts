import { getSql } from "@/lib/db";
import { isUuid } from "@/lib/agentic/contract/ids";
import type { PlanResult } from "@/lib/agentic/plan/types";

export async function persistMatcherTelemetry(input: Readonly<{
  planId: string;
  result: PlanResult;
  revision: number;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(input.planId)) {
    return;
  }

  const telemetry = input.result.matcherTelemetry;
  const asJsonb = (value: unknown) => JSON.stringify(value ?? null);

  try {
    await sql`
      insert into public.agentic_matcher_events (
        id,
        plan_id,
        revision,
        requested_names,
        requested_doses,
        constraints,
        selected_option_id,
        coverage_percent,
        product_ids,
        product_skus,
        leftovers,
        created_at
      ) values (
        ${crypto.randomUUID()}::uuid,
        ${input.planId}::uuid,
        ${input.revision},
        ${asJsonb(telemetry.requestedNames)}::jsonb,
        ${asJsonb(telemetry.requestedDoses)}::jsonb,
        ${asJsonb({
          ...telemetry.constraints,
          ...(telemetry.rejected ? { rejected: telemetry.rejected } : {}),
          ...(telemetry.matcherVersion
            ? { matcherVersion: telemetry.matcherVersion }
            : {}),
          ...(telemetry.snapshotId ? { snapshotId: telemetry.snapshotId } : {}),
          ...(telemetry.targetClassifications
            ? { targetClassifications: telemetry.targetClassifications }
            : {})
        })}::jsonb,
        ${telemetry.selectedOptionId},
        ${telemetry.coveragePercent},
        ${asJsonb(telemetry.productIds)}::jsonb,
        ${asJsonb(telemetry.productSkus)}::jsonb,
        ${asJsonb(telemetry.leftovers)}::jsonb,
        now()
      )
    `;
  } catch (error) {
    console.warn("Unable to persist MCP matcher telemetry", {
      error,
      planId: input.planId
    });
  }
}
