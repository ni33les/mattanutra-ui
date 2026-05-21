import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { checkProductValidationConsistency } from "@/lib/admin-products";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

function diagnosticsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rowsFromDiagnostics(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

export async function GET(request: Request) {
  const accessToken = new URL(request.url).searchParams.get("access_token");

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
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

  const [
    invalidProducts,
    openReviewsWithoutTasks,
    recommendationRuns,
    validationConsistency
  ] =
    await Promise.all([
      sql<Array<{
        id: string;
        title: string;
        validation_reasons: string[] | null;
        validation_status: string | null;
      }>>`
        select
          products.id::text,
          products.title,
          products.validation_status,
          products.validation_reasons
        from public.products
        where products.status = 'approved'
          and (
            products.validation_status <> 'pass'
            or products.validation_status is null
            or not exists (
              select 1
              from public.product_facts
              where product_facts.product_id = products.id
            )
          )
        order by products.updated_at desc
        limit 100
      `,
      sql<Array<{
        id: string;
        plan_id: string | null;
        rule_code: string | null;
        supplement_name: string;
      }>>`
        select
          id::text,
          plan_id::text,
          rule_code,
          supplement_name
        from public.safety_reviews
        where status = 'open'
          and task_id is null
        order by opened_at asc
        limit 100
      `,
      sql<Array<{
        diagnostics: unknown;
        generated_at: Date | string;
        id: string;
        plan_id: string | null;
      }>>`
        select
          id::text,
          plan_id::text,
          diagnostics,
          generated_at
        from public.product_recommendation_runs
        order by generated_at desc
        limit 20
      `,
      checkProductValidationConsistency({ limit: 1000 })
    ]);

  const unmatchedNeeds = recommendationRuns.flatMap((run) => {
    const diagnostics = diagnosticsRecord(run.diagnostics);

    return rowsFromDiagnostics(diagnostics.unmatchedNeeds).map((need) => ({
      bestRejectedProductId:
        typeof need.bestRejectedProductId === "string"
          ? need.bestRejectedProductId
          : null,
      bestRejectedReason:
        typeof need.bestRejectedReason === "string"
          ? need.bestRejectedReason
          : null,
      displayName:
        typeof need.displayName === "string" ? need.displayName : "Unknown need",
      generatedAt: new Date(run.generated_at).toISOString(),
      planId: run.plan_id,
      recommendationRunId: run.id
    }));
  });

  const missingCanonicalSupplements = openReviewsWithoutTasks.filter(
    (review) => review.rule_code === "unknown_supplement"
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      invalidApprovedProducts: invalidProducts,
      missingCanonicalSupplements,
      openReviewsWithoutTasks,
      summary: {
        invalidApprovedProducts: invalidProducts.length,
        missingCanonicalSupplements: missingCanonicalSupplements.length,
        openReviewsWithoutTasks: openReviewsWithoutTasks.length,
        staleValidationCache: validationConsistency.staleCount,
        unmatchedProductNeeds: unmatchedNeeds.length
      },
      staleValidationCache: validationConsistency.staleRows.slice(0, 100),
      unmatchedProductNeeds: unmatchedNeeds.slice(0, 100)
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
