import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { isUuid } from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import {
  hiddenSafetyIngredientCount,
  nutritionJourneyStatus,
  visibleSupplementRecommendationCount
} from "@/lib/nutrition-journey-status";
import type { FormulationResult } from "@/lib/formulation-types";

export const runtime = "nodejs";

function numberOrNull(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function dateIso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function healthScoreCounts(value: unknown) {
  const healthScore = recordOrNull(value);
  const locked = recordOrNull(healthScore?.pageContent)?.locked;
  const lockedRecord = recordOrNull(locked);
  const subtraction = recordOrNull(lockedRecord?.subtraction);

  return {
    evaluatedIngredientCount:
      numberOrNull(lockedRecord?.nutrientsEvaluated) ??
      numberOrNull(subtraction?.evaluated),
    selectedIngredientCount:
      numberOrNull(lockedRecord?.nutrientsChosen) ??
      numberOrNull(subtraction?.chosen)
  };
}

function formulationFromRow(value: unknown) {
  const formulation = recordOrNull(value);

  if (!formulation || !Array.isArray(formulation.supplementBreakdown)) {
    return null;
  }

  return formulation as Pick<FormulationResult, "supplementBreakdown">;
}

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

  const [
    assessmentRows,
    formulationRows,
    productRows,
    taskRows,
    paymentRows,
    checkoutRows,
    communicationRows
  ] = await Promise.all([
    sql<Array<{
      completed_at: Date | string | null;
      health_score: unknown;
      contact_email: string | null;
      locale: string;
      plan_selected_at: Date | string | null;
      selected_plan: string | null;
      status: string;
      updated_at: Date | string;
    }>>`
      select
        completed_at,
        contact_email,
        health_score,
        locale,
        plan_selected_at,
        selected_plan::text,
        status::text,
        updated_at
      from public.assessments
      where plan_id = ${planId}::uuid
      limit 1
    `,
    sql<Array<{
      formulation: unknown;
      generated_at: Date | string;
      model_version: string | null;
      version: number;
    }>>`
      select formulation, generated_at, model_version, version
      from public.formulations
      where plan_id = ${planId}::uuid
      order by version desc, generated_at desc
      limit 1
    `,
    sql<Array<{
      created_at: Date | string;
      diagnostics: unknown;
      generated_at: Date | string;
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
        supplement_product_coverage_percent,
        total_coverage_percent,
        diagnostics,
        generated_at,
        created_at
      from public.product_recommendation_runs
      where plan_id = ${planId}::uuid
      order by generated_at desc, created_at desc
      limit 1
    `,
    sql<Array<{
      completed_at: Date | string | null;
      error_message: string | null;
      id: string;
      lease_until: Date | string | null;
      status: string;
      task_type: string;
      updated_at: Date | string;
    }>>`
      select
        id::text,
        task_type,
        status,
        error_message,
        lease_until,
        completed_at,
        updated_at
      from public.tasks
      where plan_id = ${planId}::uuid
      order by updated_at desc
      limit 20
    `,
    sql<Array<{
      amount: string | number;
      created_at: Date | string;
      currency: string;
      id: string;
      selected_plan: string;
      status: string;
    }>>`
      select id::text, selected_plan::text, status, amount, currency, created_at
      from public.payments
      where plan_id = ${planId}::uuid
      order by created_at desc
      limit 5
    `,
    sql<Array<{
      created_at: Date | string;
      id: string;
      order_id: string | null;
      order_number: string | null;
      order_status: string | null;
      selected_item_ids: string[];
      selected_retailer_organisation_id: string | null;
      status: string;
    }>>`
      select
        retail_checkout_payments.id::text,
        retail_checkout_payments.status,
        retail_checkout_payments.selected_item_ids,
        retail_checkout_payments.selected_retailer_organisation_id::text,
        retail_checkout_payments.created_at,
        retail_customer_orders.id::text as order_id,
        retail_customer_orders.order_number,
        retail_customer_orders.status as order_status
      from public.retail_checkout_payments
      left join public.retail_customer_orders
        on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
      where retail_checkout_payments.plan_id = ${planId}::uuid
      order by retail_checkout_payments.created_at desc
      limit 5
    `,
    sql<Array<{
      actor_type: string;
      address: string;
      channel_type: string;
      id: string;
      status: string;
      updated_at: Date | string;
    }>>`
      select
        communication_channels.id::text,
        communication_channels.address,
        communication_channels.channel_type,
        communication_channels.status,
        communication_channels.actor_type,
        communication_channels.updated_at
      from public.plan_communication_identities
      join public.communication_channels
        on communication_channels.identity_id = plan_communication_identities.identity_id
      where plan_communication_identities.plan_id = ${planId}::uuid
      order by communication_channels.preference_rank asc, communication_channels.updated_at desc
      limit 10
    `
  ]);

  const assessment = assessmentRows[0] ?? null;

  if (!assessment) {
    return NextResponse.json(
      { message: "Plan was not found", planId },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  const formulationRow = formulationRows[0] ?? null;
  const formulation = formulationFromRow(formulationRow?.formulation);
  const productRun = productRows[0] ?? null;
  const taskStatuses = taskRows.map((task) => task.status);
  const assessmentUpdatedAt = new Date(assessment.updated_at).getTime();
  const formulationGeneratedAt = formulationRow
    ? new Date(formulationRow.generated_at).getTime()
    : null;
  const productGeneratedAt = productRun ? new Date(productRun.generated_at).getTime() : null;
  const staleSnapshotFlags = {
    formulationOlderThanAssessment:
      formulationGeneratedAt !== null && formulationGeneratedAt < assessmentUpdatedAt,
    productRunOlderThanFormulation:
      productGeneratedAt !== null &&
      formulationGeneratedAt !== null &&
      productGeneratedAt < formulationGeneratedAt
  };
  const status = nutritionJourneyStatus({
    assessmentStatus: assessment.status,
    formula: formulation
      ? {
          recommendations: [],
          sectionStatuses: {
            foods: "pending",
            supplements: productRun ? "ready" : "pending"
          },
          supplementBreakdown: formulation.supplementBreakdown
        }
      : null,
    hasPaidPlan: Boolean(assessment.selected_plan),
    hasStaleSnapshot:
      staleSnapshotFlags.formulationOlderThanAssessment ||
      staleSnapshotFlags.productRunOlderThanFormulation,
    taskStatuses
  });

  return NextResponse.json(
    {
      communication: {
        contactEmail: assessment.contact_email,
        channels: communicationRows.map((row) => ({
          address: row.channel_type === "email" ? row.address : null,
          actorType: row.actor_type,
          channelType: row.channel_type,
          id: row.id,
          status: row.status,
          updatedAt: dateIso(row.updated_at)
        })),
        hasActiveLineChannel: communicationRows.some(
          (row) => row.channel_type === "line" && row.status === "active"
        )
      },
      counts: {
        formulationHiddenSafetyRows: hiddenSafetyIngredientCount(formulation),
        formulationVisibleSelected: visibleSupplementRecommendationCount(formulation),
        healthScore: healthScoreCounts(assessment.health_score)
      },
      journeyStatus: status,
      locale: assessment.locale,
      payments: paymentRows.map((row) => ({
        amount: numberOrNull(row.amount),
        createdAt: dateIso(row.created_at),
        currency: row.currency,
        id: row.id,
        selectedPlan: row.selected_plan,
        status: row.status
      })),
      planId,
      productStack: productRun
        ? {
            diagnostics: productRun.diagnostics,
            generatedAt: dateIso(productRun.generated_at),
            recommendationRunId: productRun.id,
            stackCoveragePercent: numberOrNull(productRun.stack_coverage_percent),
            status: productRun.status,
            supplementProductCoveragePercent:
              numberOrNull(productRun.supplement_product_coverage_percent),
            totalCoveragePercent: numberOrNull(productRun.total_coverage_percent)
          }
        : {
            diagnostics: null,
            generatedAt: null,
            recommendationRunId: null,
            stackCoveragePercent: null,
            status: "missing",
            supplementProductCoveragePercent: null,
            totalCoveragePercent: null
          },
      retailCheckout: checkoutRows.map((row) => ({
        createdAt: dateIso(row.created_at),
        id: row.id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        selectedItemIds: row.selected_item_ids,
        selectedRetailerOrganisationId: row.selected_retailer_organisation_id,
        status: row.status
      })),
      selectedPlan: assessment.selected_plan,
      staleSnapshotFlags,
      taskStatus: taskRows.map((row) => ({
        completedAt: dateIso(row.completed_at),
        errorMessage: row.error_message,
        id: row.id,
        leaseUntil: dateIso(row.lease_until),
        status: row.status,
        taskType: row.task_type,
        updatedAt: dateIso(row.updated_at)
      }))
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
