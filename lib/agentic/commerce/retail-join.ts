import { isUuid } from "@/lib/agentic/contract/ids";
import { isLocale, type Locale } from "@/lib/i18n";
import type { OrderRecord } from "@/lib/agentic/store/types";
import type { AgenticStore } from "@/lib/agentic/store/types";
import type { CoverageRow, PlanResult } from "@/lib/agentic/plan/types";

export type AgenticRetailJoinResult = Readonly<{
  orderId: string;
  orderNumber: string;
  paymentId: string;
  trackingUrl: string;
}>;

function asLocale(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

async function loadSql() {
  try {
    const { getSql } = await import("@/lib/db");
    return getSql();
  } catch {
    return null;
  }
}

export async function lookupRetailOrderForAgentic(agenticOrderId: string) {
  const sql = await loadSql();

  if (!sql || !agenticOrderId) {
    return null;
  }

  try {
    const rows = await sql<Array<{
      order_id: string;
      order_number: string;
      order_status: string;
      payment_id: string;
    }>>`
      select
        retail_customer_orders.id::text as order_id,
        retail_customer_orders.order_number,
        retail_customer_orders.status as order_status,
        retail_checkout_payments.id::text as payment_id
      from public.retail_checkout_payments
      join public.retail_customer_orders
        on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
      where retail_checkout_payments.metadata->>'agenticOrderId' = ${agenticOrderId}
      order by retail_checkout_payments.created_at desc
      limit 1
    `;
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      orderId: row.order_id,
      orderNumber: row.order_number,
      orderStatus: row.order_status,
      paymentId: row.payment_id,
      trackingUrl: `/en/order/track/${encodeURIComponent(row.order_number)}`
    };
  } catch {
    return null;
  }
}

export async function joinMcpPaidOrderToRetail(input: Readonly<{
  now: string;
  order: OrderRecord;
  request?: Request;
  store: AgenticStore;
}>): Promise<AgenticRetailJoinResult | null> {
  if (input.order.paymentStatus !== "paid") {
    return null;
  }

  if (!(await loadSql())) {
    return null;
  }

  try {
    const existing = await lookupRetailOrderForAgentic(input.order.id);

    if (!existing) {
      return null;
    }

    const linked = await input.store.getRetailLink(input.order.id);

    if (!linked) {
      await input.store.insertRetailLink({
        adapter: "retail_product_checkout",
        createdAt: input.now,
        orderId: input.order.id,
        retailerReference: existing.orderNumber
      });
    }

    return existing;
  } catch (error) {
    console.error("Unable to join MCP pay to retail checkout", {
      error,
      orderId: input.order.id
    });
    return null;
  }
}

function coverageStatus(status: CoverageRow["status"]) {
  if (status === "covered" || status === "over_target") {
    return "covered" as const;
  }

  if (status === "partial") {
    return "add" as const;
  }

  return "review" as const;
}

function mcpFormulation(result: PlanResult) {
  const coverage = result.coverage.length > 0
    ? result.coverage
    : result.selected?.coverage ?? [];

  return {
    channel: "mcp",
    coveragePercent: result.selected?.coveragePercent ?? 0,
    dailyPills: result.selected?.dailyPills ?? 0,
    productStack: result.basket.map((item) => ({
      dailyPills: item.dailyPills,
      lineTotalMinor: item.lineTotalMinor,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity
    })),
    source: "mcp_plan",
    status: result.status,
    supplementBreakdown: coverage.map((row, index) => ({
      category: "Supplement",
      dailyDose: `${row.deliveredAmount} ${row.unit}/day`,
      effectivenessRank: index + 1,
      id: row.supplementId,
      rationale: `${row.status} ${row.coveragePercent}%`,
      status: coverageStatus(row.status),
      supplement: row.name
    })),
    totalPriceMinor: result.selected?.totalPriceMinor ?? 0
  };
}

function mcpAnswers(result: PlanResult) {
  const state = result.requestSnapshot;

  return {
    ageYears: state.profile.ageYears,
    channel: "mcp",
    conditions: [...state.conditionCodes],
    country: state.destinationCountry,
    currentSupplements: state.currentSupplements.map((item) => ({
      dailyAmount: item.dailyAmount,
      name: item.name,
      unit: item.unit
    })),
    firstName: "",
    lifeStage: state.profile.lifeStage,
    meds: state.medicationCodes.join(", "),
    optimization: state.optimization,
    sex: state.profile.sex,
    source: "mcp",
    targets: state.targets.map((item) => ({
      amount: item.amount,
      name: item.name,
      unit: item.unit
    }))
  };
}

function mcpHealthScore(result: PlanResult) {
  return {
    band: "mcp",
    domains: [],
    headline: result.summary,
    movers: [],
    score: Math.round(result.selected?.coveragePercent ?? 0),
    summary: result.summary,
    version: "mcp:plan"
  };
}

function mcpAssessmentStatus(result: PlanResult) {
  if (result.status === "ready") {
    return "ready" as const;
  }

  if (result.status === "blocked") {
    return "failed" as const;
  }

  return "captured" as const;
}

export async function persistMcpAssessment(input: Readonly<{
  locale?: string;
  planId: string;
  result?: PlanResult;
}>) {
  const sql = await loadSql();

  if (!sql || !isUuid(input.planId)) {
    return;
  }

  const locale = asLocale(input.locale ?? input.result?.requestSnapshot.locale);

  // planHandle stays an opaque cap_* capability. assessments.plan_id is the same
  // UUID as agentic_plans.id so admin/reporting see MCP plans on the web path.
  if (!input.result) {
    await sql`
      insert into public.assessments (
        plan_id,
        locale,
        status,
        answers,
        answer_summary,
        health_score,
        updated_at
      )
      values (
        ${input.planId}::uuid,
        ${locale},
        'captured',
        '{"source":"mcp"}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        now()
      )
      on conflict (plan_id) do nothing
    `;
    return;
  }

  try {
    const { persistAssessmentSubmission } = await import("@/lib/assessment-store");
    const { insertFormulationVersion } = await import("@/lib/plan-version-writes");
    const status = mcpAssessmentStatus(input.result);

    await persistAssessmentSubmission({
      answers: mcpAnswers(input.result),
      locale,
      selectedPlan: "precision",
      snapshot: {
        healthScore: mcpHealthScore(input.result),
        plan: "precision",
        planId: input.planId,
        queuePosition: 0,
        status: status === "captured" ? "queued" : status,
        steps: [
          { id: "assessment", state: "complete" },
          { id: "score", state: status === "ready" ? "complete" : "pending" },
          { id: "results", state: status === "ready" ? "complete" : "pending" }
        ]
      },
      status
    });

    await insertFormulationVersion(sql, {
      formulation: mcpFormulation(input.result),
      includeEmptyRecommendations: true,
      modelVersion: "mcp-plan:v1",
      planId: input.planId
    });
  } catch (error) {
    console.warn("Unable to persist MCP plan to web assessments", {
      error,
      planId: input.planId
    });
  }
}

export async function persistMcpPlanFeedback(input: Readonly<{
  optionId: string | null;
  planId: string;
  rating: number | null;
  revision: number;
  summary: string | null;
}>) {
  const sql = await loadSql();

  if (!sql || !isUuid(input.planId) || !input.summary?.trim()) {
    return;
  }

  try {
    const { savePlanFeedback } = await import("@/lib/plan-feedback");
    await persistMcpAssessment({ locale: "en", planId: input.planId });

    const retail = await sql<Array<{ order_id: string }>>`
      select retail_customer_orders.id::text as order_id
      from public.retail_checkout_payments
      join public.retail_customer_orders
        on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
      where retail_checkout_payments.plan_id = ${input.planId}::uuid
      order by retail_checkout_payments.created_at desc
      limit 1
    `;

    await savePlanFeedback(sql, {
      feedback: [
        {
          body: input.summary.trim(),
          feedbackType: "other",
          itemId: input.optionId,
          itemName: "MCP plan",
          itemType: "plan",
          urgency: "normal"
        }
      ],
      metadata: {
        channel: "mcp",
        consentConfirmed: true,
        rating: input.rating,
        retailOrderId: retail[0]?.order_id ?? null,
        revision: input.revision,
        source: "mcp_feedback"
      },
      planId: input.planId
    });
  } catch (error) {
    console.warn("Unable to persist MCP feedback to plan_feedback", {
      error,
      planId: input.planId
    });
  }
}
