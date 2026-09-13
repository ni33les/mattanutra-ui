import { hasHealthScoreAiCopy } from "@/lib/healthscore-readiness";
import { randomUUID } from "node:crypto";
import { getSql, withDatabaseTransaction } from "@/lib/db";
import { getStoredAssessmentPrefill, getStoredFormulationRead, isUuid, toJsonValue } from "@/lib/assessment-store";
import { inStorePharmacyFromAnswers, resolvePharmacyOrganisation } from "@/lib/pharmacy-in-store";
import { pharmacyOrganisationSlug } from "@/lib/pharmacy-journey";
import { preparePharmacyOrder, type PharmacyOrderProduct } from "@/lib/pharmacy-order-input";
import { claimFunnelRequest, completeFunnelRequest } from "@/lib/funnel-idempotency";
import { currentWebCheckoutRecommendations, lockCurrentWebCheckoutRecommendations, lockWebCheckoutAssessment } from "@/lib/retail-product-checkout";
import { queueAdminOrganisationCommunication } from "@/lib/communications";
import { FunnelError } from "@/lib/funnel-errors";
import { isLocale, type Locale } from "@/lib/i18n";
import type { FormulationResult } from "@/lib/formulation-types";

export type PharmacyOrderReceipt = Readonly<{
  id: string; reference: string; status: "unpaid"; pharmacyName: string; customerName: string;
  revision: number; currency: string; total: number; lines: readonly PharmacyOrderProduct[];
}>;

export async function pharmacyAssessment(planId: string, slug: string) {
  const pharmacy = await resolvePharmacyOrganisation(pharmacyOrganisationSlug(slug));
  const assessment = isUuid(planId) ? await getStoredAssessmentPrefill(planId) : null;
  if (!pharmacy || !assessment || inStorePharmacyFromAnswers(assessment.answers)?.id !== pharmacy.id) {
    throw new FunnelError("Pharmacy assessment not found", 404, "assessment_not_found");
  }
  return { pharmacy, assessment };
}

export async function pharmacyOrderQuote(planId: string, slug: string, locale: Locale) {
  const context = await pharmacyAssessment(planId, slug);
  const generationLocale = context.assessment.locale ?? locale;
  const stored = await getStoredFormulationRead(planId, { locale: generationLocale, includeProducts: true });
  if (!stored?.result || !stored.readiness?.readyForReveal) throw new FunnelError("Your plan is still being prepared", 409, "plan_not_ready");
  const result = stored.result;
  const products = result.recommendations;
  const selection = { planId, locale: generationLocale, selectedItemIds: products.map(p => p.productId ?? p.id),
    recommendationRunId: result.productRecommendations?.runId, assessmentRevision: context.assessment.revision,
    selectionRevision: result.selectionRevision };
  const sql = getSql()!;
  if (products.length) await currentWebCheckoutRecommendations(sql, selection);
  const ids = selection.selectedItemIds;
  const rows = ids.length ? await sql`select s.product_id::text, s.rrp_price_amount, s.currency, s.backorder_policy,
      s.status, p.status as product_status,
      (select i.selected_retailer_organisation_id::text from public.product_recommendation_items i
        where i.run_id=${selection.recommendationRunId ?? null}::uuid and i.product_id=s.product_id limit 1) as recommended_organisation_id, greatest(0, coalesce(stock.stock_quantity, 0) - coalesce(a.allocated, 0)) as available_now
    from public.retail_sellable_products s join public.products p on p.id=s.product_id
    left join public.retail_product_stock stock on stock.organisation_id=s.organisation_id and stock.product_id=s.product_id and stock.status<>'deleted'
    left join lateral (select sum(quantity_allocated) as allocated from public.retail_order_allocations
      where organisation_id=s.organisation_id and product_id=s.product_id and status in ('active','picked')) a on true
    where s.organisation_id=${context.pharmacy.id}::uuid and s.product_id=any(${ids}::uuid[])` : [];
  const lines = products.map(product => {
    const id = product.productId ?? product.id;
    const row = rows.find(r => r.product_id === id);
    const price = Number(row?.rrp_price_amount);
    if (!row || row.status !== "active" || row.product_status !== "approved" || !(price > 0) ||
      (Number(row.available_now) <= 0 && row.backorder_policy === "deny") || row.recommended_organisation_id !== context.pharmacy.id ||
      Math.round(price * 100) !== Math.round((product.price?.amount ?? -1) * 100)) {
      throw new FunnelError("Products or prices changed. Refresh your recommendation before ordering.", 409, "commercial_facts_changed");
    }
    // The existing web first-order recommendation prices one pack per selected SKU.
    // Daily labelled servings are a separate quantity; unknown supply is not invented.
    return { productId: id, name: product.name, quantity: 1, unitPrice: price,
      currency: String(row.currency ?? context.pharmacy.currency ?? "THB"), imageUrl: product.imageUrl ?? null };
  });
  return { ...context, result, lines, selection };
}

export async function readPharmacyOrder(planId: string, slug: string, orderId?: string) {
  const { pharmacy, assessment } = await pharmacyAssessment(planId, slug);
  if (orderId && !isUuid(orderId)) throw new FunnelError("Order not found", 404, "order_not_found");
  const sql = getSql()!;
  const [order] = await sql`select id::text, metadata from public.retail_customer_orders
    where organisation_id=${pharmacy.id}::uuid and source='pharmacy' and metadata->>'planId'=${planId}
      and ${orderId ? sql`id=${orderId}::uuid` : sql`metadata #>> '{receipt,revision}'=${String(assessment.revision)}`} order by created_at desc limit 1`;
  if (orderId && !order) throw new FunnelError("Order not found", 404, "order_not_found");
  return order ? { receipt: order.metadata.receipt as PharmacyOrderReceipt, result: order.metadata.result as FormulationResult, locale: isLocale(order.metadata.locale) ? order.metadata.locale : assessment.locale } : null;
}

export async function createPharmacyOrder(value: unknown, key: string): Promise<PharmacyOrderReceipt> {
  const input = value as Record<string, unknown> | null;
  if (!input || !isUuid(String(input.planId)) || typeof input.pharmacy !== "string" || !isLocale(input.locale) ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) {
    throw new FunnelError("Invalid pharmacy order", 400, "invalid_order");
  }
  const planId = String(input.planId), slug = input.pharmacy, locale = input.locale;
  const sql = getSql()!;
  await pharmacyAssessment(planId, slug);
  // Replay precedes freshness checks: a completed order remains recoverable after a replan.
  const [prior] = await sql`select response, input_hash from public.funnel_requests where scope='pharmacy-order' and request_key=${key}`;
  if (prior?.response) {
    const { assessmentInputHash } = await import("@/lib/assessment-revisions");
    if (prior.input_hash !== assessmentInputHash(input)) throw new FunnelError("Request key was reused for different input", 409, "idempotency_conflict");
    return prior.response as PharmacyOrderReceipt;
  }
  const quote = await pharmacyOrderQuote(planId, slug, locale);
  if (quote.assessment.revision !== input.expectedRevision) throw new FunnelError("Assessment changed", 409, "assessment_changed");
  const prepared = preparePharmacyOrder({ customerName: input.customerName, productIds: input.productIds }, quote.lines);
  const selected = { ...quote.selection, selectedItemIds: prepared.lines.map(p => p.productId) };
  const orderId = randomUUID();
  const preparedReceipt: PharmacyOrderReceipt = { id: orderId, reference: `PH-${orderId.slice(0, 8).toUpperCase()}`,
    status: "unpaid", pharmacyName: quote.pharmacy.name, customerName: prepared.customerName,
    revision: quote.assessment.revision, currency: prepared.currency, total: prepared.total, lines: prepared.lines };
  const metadata = toJsonValue({ planId, locale: quote.assessment.locale, paymentMethod: "pay_at_till", paymentStatus: "unpaid", receipt: preparedReceipt, result: quote.result });
  const orderLines = prepared.lines.map(p => ({ customer_order_id: orderId, organisation_id: quote.pharmacy.id,
    product_id: p.productId, quantity_ordered: p.quantity, retail_price_amount: p.unitPrice }));
  const receipt = await withDatabaseTransaction(sql, async tx => {
    const claim = await claimFunnelRequest(tx, "pharmacy-order", key, input, orderId);
    if (claim.response) return claim.response as PharmacyOrderReceipt;
    await lockWebCheckoutAssessment(tx, planId);
    await lockCurrentWebCheckoutRecommendations(tx, selected);
    const receipt = preparedReceipt;
    await tx`insert into public.retail_customer_orders (id, organisation_id, order_number, source, customer_name, status, currency, placed_at, metadata)
      values (${receipt.id}::uuid, ${quote.pharmacy.id}::uuid, ${receipt.reference}, 'pharmacy', ${receipt.customerName}, 'placed', ${receipt.currency}, now(),
        ${tx.json(metadata)})`;
    await tx`insert into public.retail_customer_order_lines ${tx(orderLines)}`;
    await completeFunnelRequest(tx, "pharmacy-order", key, receipt);
    // Durable notification admission participates in the existing task transaction;
    // the worker performs delivery after commit.
    await queueAdminOrganisationCommunication({ organisationId: quote.pharmacy.id, eventKey: "retail_order_created",
      resourceId: receipt.id, resourceType: "retail_customer_order", subject: `Pay at till: ${receipt.reference}`,
      metadata: { source: "pharmacy", paymentStatus: "unpaid" } });
    return receipt;
  });
  return receipt;
}

/** Read the explanation belonging to the frozen order, rather than a later assessment revision. */
export async function readPharmacyAnalysis(planId: string, slug: string, orderId?: string) {
  const { assessment } = await pharmacyAssessment(planId, slug);
  const order = orderId ? await readPharmacyOrder(planId, slug, orderId) : null;
  const revision = order?.receipt.revision ?? assessment.revision;
  const locale = order?.locale ?? assessment.locale;
  const sql = getSql()!;
  const [row] = await sql`select result from public.assessment_healthscore_results
    where plan_id=${planId}::uuid and revision=${revision} and locale=${locale} order by updated_at desc limit 1`;
  const [task] = await sql`select status from public.tasks where plan_id=${planId}::uuid and task_type='analyze_healthscore'
    and payload #>> '{generation,revision}'=${String(revision)} and payload #>> '{generation,locale}'=${locale}
    order by created_at desc limit 1`;
  const ready = hasHealthScoreAiCopy(row?.result, locale);
  return { revision, healthScore: ready ? row.result : null,
    generationStatus: ready ? "ready" : revision !== assessment.revision || ["failed","cancelled","completed"].includes(task?.status) ? "failed" : "preparing",
    retryAllowed: revision === assessment.revision };
}
