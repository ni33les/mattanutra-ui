import { getSql } from "@/lib/db";
import { recordFinanceTransaction } from "@/lib/finance-ledger";
import type { 
  AgentAttributedRevenue, 
  AgentRateSchedule 
} from "./agent-commercial-models";

/**
 * Agent Platform Fee Service
 *
 * Core logic for the business model:
 * "We send customers to the Fulfillment Agent. The Agent (who is the retailer) pays us a percentage for the privilege."
 *
 * MattaNutra is the platform provider only. We are not the retailer.
 * The old model where MattaNutra collected customer payments is out of scope.
 */

/**
 * Calculate platform fee due from an agent for a given period.
 * This is the main calculation for the only supported model (agent_direct_platform_fee).
 */
export async function calculatePlatformFeeDue(params: {
  fulfillmentAgentId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<AgentAttributedRevenue | null> {
  const sql = getSql();
  if (!sql) return null;

  // 1. Get the active rate schedule for the agent during this period
  const rateSchedule = await getActiveRateScheduleForPeriod(
    params.fulfillmentAgentId,
    params.periodStart,
    params.periodEnd
  );

  if (!rateSchedule || rateSchedule.commercialModel !== 'agent_direct_platform_fee') {
    return null; // Not applicable for this agent/period
  }

  // 2. Sum gross revenue from fulfillment orders attributed to this agent in the period
  //    (This query will need to be refined once the fulfillment_orders table is built)
  const revenueRows = await sql<Array<{ total: string; count: string }>>`
    SELECT 
      COALESCE(SUM(amount), 0) as total,
      COUNT(*) as count
    FROM public.fulfillment_orders
    WHERE fulfillment_agent_id = ${params.fulfillmentAgentId}
      AND created_at >= ${params.periodStart}
      AND created_at < ${params.periodEnd}
      AND status NOT IN ('cancelled', 'returned')
  `;

  const grossRevenue = Number(revenueRows[0]?.total ?? 0);
  const orderCount = Number(revenueRows[0]?.count ?? 0);

  if (grossRevenue <= 0) {
    return null;
  }

  let platformFee = grossRevenue * rateSchedule.feeValue;

  // Apply min/max caps if configured
  if (rateSchedule.minimumFee && platformFee < rateSchedule.minimumFee) {
    platformFee = rateSchedule.minimumFee;
  }
  if (rateSchedule.maximumFee && platformFee > rateSchedule.maximumFee) {
    platformFee = rateSchedule.maximumFee;
  }

  return {
    fulfillmentAgentId: params.fulfillmentAgentId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    currency: rateSchedule.currency ?? 'THB',
    grossRevenue: Math.round(grossRevenue),
    orderCount,
    platformFeeRate: rateSchedule.feeValue,
    calculatedPlatformFee: Math.round(platformFee),
  };
}

/**
 * Record that a platform fee is now due from the agent.
 * This creates the receivable in MattaNutra's books.
 */
export async function recordPlatformFeeReceivable(
  attributedRevenue: AgentAttributedRevenue,
  _rateSchedule: AgentRateSchedule
) {
  void _rateSchedule;

  const sql = getSql();
  if (!sql) throw new Error("Database unavailable");

  // Record in finance ledger as a receivable from the agent
  await recordFinanceTransaction({
    amount: attributedRevenue.calculatedPlatformFee,
    category: "revenue",
    currency: attributedRevenue.currency,
    description: `Platform fee due from Fulfillment Agent ${attributedRevenue.fulfillmentAgentId} for period ${attributedRevenue.periodStart} → ${attributedRevenue.periodEnd}`,
    entryType: "nominal", // Will become actual when paid
    from: `fulfillment_agent:${attributedRevenue.fulfillmentAgentId}`,
    metadata: {
      fulfillmentAgentId: attributedRevenue.fulfillmentAgentId,
      periodStart: attributedRevenue.periodStart,
      periodEnd: attributedRevenue.periodEnd,
      grossRevenue: attributedRevenue.grossRevenue,
      platformFeeRate: attributedRevenue.platformFeeRate,
      source: "agent_platform_fee_calculation",
    },
    occurredAt: new Date(),
    source: "agent_platform_fee",
    sourceRef: `platform-fee:${attributedRevenue.fulfillmentAgentId}:${attributedRevenue.periodStart}:${attributedRevenue.periodEnd}`,
    to: "mattanutra:platform",
    usdRate: 1, // TODO: proper FX handling
  });

  // TODO: Also create a row in an agent_platform_fee_settlements table for tracking
}

/**
 * Internal helper - finds the rate schedule that was active for most of the period.
 */
async function getActiveRateScheduleForPeriod(
  agentId: string,
  periodStart: string,
  periodEnd: string
): Promise<AgentRateSchedule | null> {
  const sql = getSql();
  if (!sql) return null;

  type AgentRateScheduleRow = {
    id: string;
    fulfillment_agent_id: string;
    commercial_model: AgentRateSchedule["commercialModel"];
    fee_type: AgentRateSchedule["feeType"];
    fee_value: string | number;
    currency: string | null;
    effective_from: string;
    effective_to: string | null;
    minimum_fee: string | number | null;
    maximum_fee: string | number | null;
    notes: string | null;
  };

  // Simplified: return the rate that was effective at the start of the period
  const rows = await sql<AgentRateScheduleRow[]>`
    SELECT *
    FROM public.agent_rate_schedules
    WHERE fulfillment_agent_id = ${agentId}
      AND effective_from <= ${periodStart}
      AND (effective_to IS NULL OR effective_to > ${periodStart})
      AND effective_from < ${periodEnd}
    ORDER BY effective_from DESC
    LIMIT 1
  `;

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fulfillmentAgentId: row.fulfillment_agent_id,
    commercialModel: row.commercial_model,
    feeType: row.fee_type,
    feeValue: Number(row.fee_value),
    currency: row.currency ?? undefined,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    minimumFee: row.minimum_fee === null ? null : Number(row.minimum_fee),
    maximumFee: row.maximum_fee === null ? null : Number(row.maximum_fee),
    notes: row.notes ?? undefined
  };
}
