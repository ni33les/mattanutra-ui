import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!adminDashboardOrClawRequestAllowed(request)) {
    return NextResponse.json(
      { message: "Not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  const sql = getSql();

  if (!sql) {
    return NextResponse.json(
      { message: "Database is not configured" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503
      }
    );
  }

  const url = new URL(request.url);
  const planId = url.searchParams.get("planId");

  if (!planId || !isUuid(planId)) {
    return NextResponse.json(
      { message: "A valid planId is required" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 400
      }
    );
  }

  const rows = await sql<Array<{
    created_at: Date | string;
    diagnostics: unknown;
    exclusions: unknown;
    food_coverage_percent: string | number;
    id: string;
    stack_coverage_percent: string | number;
    status: string;
    supplement_product_coverage_percent: string | number;
    total_coverage_percent: string | number;
  }>>`
    select
      id::text,
      status,
      stack_coverage_percent,
      coalesce(to_jsonb(product_recommendation_runs) ->> 'supplement_product_coverage_percent', stack_coverage_percent::text) as supplement_product_coverage_percent,
      coalesce(to_jsonb(product_recommendation_runs) ->> 'food_coverage_percent', '0') as food_coverage_percent,
      coalesce(to_jsonb(product_recommendation_runs) ->> 'total_coverage_percent', stack_coverage_percent::text) as total_coverage_percent,
      exclusions,
      coalesce(to_jsonb(product_recommendation_runs) -> 'diagnostics', '{}'::jsonb) as diagnostics,
      created_at
    from public.product_recommendation_runs
    where plan_id = ${planId}::uuid
    order by generated_at desc
    limit 1
  `;
  const row = rows[0];

  return NextResponse.json(
    {
      diagnostics: row?.diagnostics ?? null,
      exclusions: row?.exclusions ?? [],
      foodCoveragePercent: row ? Number(row.food_coverage_percent) || 0 : 0,
      generatedAt: row ? new Date(row.created_at).toISOString() : null,
      planId,
      recommendationRunId: row?.id ?? null,
      stackCoveragePercent: row ? Number(row.stack_coverage_percent) || 0 : 0,
      status: row?.status ?? "missing",
      supplementProductCoveragePercent:
        row ? Number(row.supplement_product_coverage_percent) || 0 : 0,
      totalCoveragePercent: row ? Number(row.total_coverage_percent) || 0 : 0
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

