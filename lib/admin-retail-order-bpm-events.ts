import type { AdminSessionContext } from "@/lib/admin-access";
import type { StockDb } from "@/lib/admin-retail-stock-types";
import { recordRetailOrderWorkflowBpm } from "@/lib/retail-order-workflow";

export async function recordRetailOrderBpmEvent(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    eventName: string;
    eventStatus: string;
    metadata?: Record<string, unknown>;
    orderId: string;
    organisationId: string;
  }>
) {
  await recordRetailOrderWorkflowBpm(sql, {
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    eventName: input.eventName,
    eventStatus: input.eventStatus,
    locale: context.effectivePerson.preferredLocale,
    metadata: input.metadata,
    orderId: input.orderId,
    organisationId: input.organisationId
  });
}
