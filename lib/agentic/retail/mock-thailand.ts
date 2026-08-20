import { randomUUID } from "node:crypto";
import type { AgenticStore } from "@/lib/agentic/store/types";

export async function processOmsOutbox(input: Readonly<{
  now: string;
  store: AgenticStore;
}>) {
  const pending = await input.store.getOutboxPending();

  for (const event of pending) {
    if (event.type !== "OMS_SUBMIT" || !event.orderId) {
      continue;
    }

    const existing = await input.store.getRetailLink(event.orderId);

    if (!existing) {
      await input.store.insertRetailLink({
        adapter: "mock_thailand",
        createdAt: input.now,
        orderId: event.orderId,
        retailerReference: `th-mock-${event.orderId.slice(0, 8)}`
      });
    }

    const order = await input.store.getOrder(event.orderId);

    if (order && order.fulfilmentStatus === "not_started" && order.paymentStatus === "paid") {
      await input.store.updateOrder({
        ...order,
        fulfilmentStatus: "processing",
        updatedAt: input.now
      });
      await input.store.insertFulfilmentEvent({
        createdAt: input.now,
        id: randomUUID(),
        orderId: order.id,
        payload: { status: "processing" },
        status: "processing"
      });
    }

    await input.store.markOutboxProcessed(event.id, input.now);
  }
}
