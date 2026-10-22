import type postgres from "postgres";
import { writeBpmEvent } from "@/lib/bpm";
import { withDatabaseTransaction } from "@/lib/db";
import { commerceBpmContext } from "@/lib/journey-attribution";
import { isWebProductJourney } from "@/lib/web-product-journey";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Called only after address validation and creation/reuse of an eligible saved
 * checkout intent. The event and its receipt commit together before Stripe I/O.
 * Retries use that same intent; browser quote caching cannot skip this boundary.
 */
export async function recordWebDeliveryDetailsCompleted(sql: postgres.Sql, paymentId: string) {
  return withDatabaseTransaction(sql, async tx => {
    const [payment] = await tx`select id, plan_id, locale, metadata, stripe_mode, selected_item_ids
      from public.retail_checkout_payments where id = ${paymentId}::uuid for update`;
    if (!payment) return null;
    const metadata = record(payment.metadata);
    if (metadata.channel !== "web" || !isWebProductJourney(metadata.journeyVersion)
        || metadata.webDeliveryDetailsCompletedEventId || !payment.selected_item_ids?.length) return null;
    const context = commerceBpmContext(metadata, payment.stripe_mode);
    const eventId = await writeBpmEvent({
      ...context, sql: tx, actorType: "visitor", emittedBy: "retail_product_checkout",
      eventName: "web_delivery_details_completed", eventStatus: "completed", eventType: "funnel",
      locale: payment.locale, planId: payment.plan_id,
      properties: { ...context.properties, checkoutPaymentId: payment.id, lineCount: payment.selected_item_ids.length }
    });
    if (eventId) await tx`update public.retail_checkout_payments
      set metadata = metadata || jsonb_build_object('webDeliveryDetailsCompletedEventId', ${eventId}::text)
      where id = ${paymentId}::uuid`;
    return eventId;
  });
}
