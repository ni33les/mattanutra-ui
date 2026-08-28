import { getSql } from "@/lib/db";
import { isUuid } from "@/lib/agentic/contract/ids";
import type { PlanResult } from "@/lib/agentic/plan/types";

export async function listCatalogueGaps() {
  const sql = getSql();

  if (!sql) {
    return [];
  }

  try {
    return await sql<
      Array<{
        add_priority: number;
        frequency: number;
        last_seen_at: Date | string | null;
        miss_reason: string | null;
        miss_severity: string | null;
        requested_name: string | null;
      }>
    >`
      select
        requested_name,
        miss_reason,
        miss_severity,
        frequency,
        last_seen_at,
        add_priority
      from public.agentic_catalogue_gaps
      order by add_priority desc
      limit 50
    `;
  } catch {
    return [];
  }
}

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
        ${sql.json(telemetry.requestedNames)}::jsonb,
        ${sql.json(telemetry.requestedDoses)}::jsonb,
        ${sql.json({
          ...telemetry.constraints,
          ...(telemetry.rejected ? { rejected: telemetry.rejected } : {}),
          ...(telemetry.matcherVersion
            ? { matcherVersion: telemetry.matcherVersion }
            : {}),
          ...(telemetry.ackMs != null ? { ackMs: telemetry.ackMs } : {}),
          ...(telemetry.matchMs != null ? { matchMs: telemetry.matchMs } : {}),
          ...(telemetry.searchDeadlineMs != null
            ? { searchDeadlineMs: telemetry.searchDeadlineMs }
            : {}),
          ...(telemetry.snapshotId ? { snapshotId: telemetry.snapshotId } : {}),
          ...(telemetry.targetClassifications
            ? { targetClassifications: telemetry.targetClassifications }
            : {})
        })}::jsonb,
        ${telemetry.selectedOptionId},
        ${telemetry.coveragePercent},
        ${sql.json(telemetry.productIds)}::jsonb,
        ${sql.json(telemetry.productSkus)}::jsonb,
        ${sql.json(telemetry.leftovers)}::jsonb,
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
