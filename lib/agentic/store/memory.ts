import { orderReadProjection, compactFulfilmentEvents } from "@/lib/agentic/presentation/order-read";
import { operationCursor, withoutOperationCursor, withOperationCursor } from "@/lib/agentic/store/operation-checkpoint";
import { AsyncLocalStorage } from "node:async_hooks";
import { planStatusProjection } from "@/lib/agentic/presentation/status-projection";
import type {
  AgenticStore,
  CapabilityRecord,
  CheckoutSessionRecord,
  FeedbackRecord,
  FulfilmentEventRecord,
  IdempotencyRecord,
  OrderItemRecord,
  OrderRecord,
  OutboxEventRecord,
  PaymentAttemptRecord,
  PaymentAuditRecord,
  PlanRecord,
  PlanOperationRecord,
  PlanRevisionRecord,
  ProviderEventRecord,
  RetailOrderLinkRecord,
  SupportCaseRecord,
  SupportMessageRecord
} from "@/lib/agentic/store/types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryStore(): AgenticStore {
  const catalogues = new Map<string, import("@/lib/agentic/catalogue/types").CatalogueSnapshot>();
  const capabilities = new Map<string, CapabilityRecord>();
  const checkouts = new Map<string, CheckoutSessionRecord>();
  const feedback = new Map<string, FeedbackRecord>();
  const fulfilment = new Map<string, FulfilmentEventRecord[]>();
  const idempotency = new Map<string, IdempotencyRecord>();
  const orderItems = new Map<string, OrderItemRecord[]>();
  const orders = new Map<string, OrderRecord>();
  const outbox = new Map<string, OutboxEventRecord>();
  const paymentAttempts = new Map<string, PaymentAttemptRecord[]>();
  const paymentAudits = new Map<string, PaymentAuditRecord[]>();
  const plans = new Map<string, PlanRecord>();
  const operations = new Map<string, PlanOperationRecord>();
  const providerEvents = new Map<string, ProviderEventRecord>();
  const retailLinks = new Map<string, RetailOrderLinkRecord>();
  const revisions = new Map<string, PlanRevisionRecord>();
  const supportCases = new Map<string, SupportCaseRecord>();
  const supportMessages = new Map<string, SupportMessageRecord[]>();

  function idempotencyKey(operation: string, ownerScope: string, key: string) {
    return `${operation}\0${ownerScope}\0${key}`;
  }

  function revisionKey(planId: string, revision: number) {
    return `${planId}:${revision}`;
  }

  const transactions = new AsyncLocalStorage<boolean>();
  let tail: Promise<unknown> = Promise.resolve();
  const maps = [catalogues, capabilities, checkouts, feedback, fulfilment, idempotency, orderItems, orders, outbox, paymentAttempts, paymentAudits, plans, operations, providerEvents, retailLinks, revisions, supportCases, supportMessages] as Map<string, unknown>[];

  const store: AgenticStore = {
    async getPlanReadState(planId, requestedRevision, includeResult = false) {
      const plan = plans.get(planId); if (!plan) return null;
      const revision = revisions.get(revisionKey(planId, requestedRevision ?? plan.currentRevision)); if (!revision) return null;
      const candidates = [...operations.values()].filter(row => row.planId === planId);
      const active = candidates.filter(row => ["queued", "running", "retryable"].includes(row.status))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
      const op = active ?? candidates.filter(row => row.expectedRevision === plan.currentRevision && ["failed", "cancelled"].includes(row.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
      const projection = revision.statusProjection ?? null;
      const order = [...orders.values()].filter(row => row.planId === planId && row.planRevision === revision.revision &&
        !["expired", "cancelled"].includes(row.orderStatus) && !row.cancelledAt && !row.expiredAt)
        .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
      return clone({ plan, revision: revision.revision, projection,
        result: includeResult || !projection ? revision.result : null,
        operation: op ? { id: op.id, revision: op.revision, status: op.status, error: op.error, createdAt: op.createdAt, deadlineAt: op.deadlineAt } : null,
        frozen: Boolean(order), payment: order ? { orderId: order.id, paymentStatus: order.paymentStatus,
          fulfilmentStatus: order.fulfilmentStatus, orderStatus: order.orderStatus, stateVersion: order.stateVersion } : null,
        catalogueRevision: projection?.catalogueRevision ?? null });
    },
    async getPlanOperation(id, options) {
      const record = operations.get(id);
      return record ? clone(options?.includeCursor === false ? withoutOperationCursor(record) : record) : null;
    },
    async getPlanOperationByKey(ownerScope, key) {
      return clone([...operations.values()].find(row => row.ownerScope === ownerScope && row.key === key) ?? null);
    },
    async getCompletedPlanOperation(planId, revision) {
      return clone([...operations.values()].find(row => row.planId === planId && row.revision === revision && row.status === "complete") ?? null);
    },
    async getActivePlanOperation(planId) {
      return clone([...operations.values()].filter(row => row.planId === planId && ["queued", "running", "retryable"].includes(row.status))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0] ?? null);
    },
    async getFailedPlanOperation(planId, currentRevision) {
      return clone([...operations.values()].filter(row => row.planId === planId && row.expectedRevision === currentRevision && ["failed", "cancelled"].includes(row.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] ?? null);
    },
    async insertPlanOperation(record) {
      if (!transactions.getStore()) throw new Error("Plan admission requires a transaction");
      if (operations.has(record.id) || [...operations.values()].some(row => row.ownerScope === record.ownerScope && row.key === record.key)) throw new Error("idempotency_conflict");
      operations.set(record.id, clone(record));
    },
    async updatePlanOperation(record, expectedVersion) {
      if (operations.get(record.id)?.version !== expectedVersion) return false;
      operations.set(record.id, clone(withOperationCursor(record, operationCursor(record) ?? operationCursor(operations.get(record.id)!)))); return true;
    },
    async getCatalogueSnapshot(id) { return catalogues.get(id) ?? null; },
    async insertCatalogueSnapshot(id, snapshot) { catalogues.set(id, clone(snapshot)); },
    async deletePrincipalScope(principalScope) {
      const planIds = [...plans.values()]
        .filter((record) => record.principalScope === principalScope)
        .map((record) => record.id);
      for (const [id, operation] of operations) if (planIds.includes(operation.planId)) operations.delete(id);
      const orderIds = [...orders.values()]
        .filter(
          (record) =>
            record.principalScope === principalScope || planIds.includes(record.planId)
        )
        .map((record) => record.id);
      const caseIds = [...supportCases.values()]
        .filter((record) => orderIds.includes(record.orderId))
        .map((record) => record.id);

      for (const [hash, record] of [...capabilities.entries()]) {
        if (record.principalScope === principalScope || planIds.includes(record.resourceId) || orderIds.includes(record.resourceId)) {
          capabilities.delete(hash);
        }
      }
      for (const [id, record] of [...checkouts.entries()]) {
        if (orderIds.includes(record.orderId)) {
          checkouts.delete(id);
        }
      }
      for (const [id, record] of [...feedback.entries()]) {
        if (planIds.includes(record.planId)) {
          feedback.delete(id);
        }
      }
      for (const orderId of orderIds) {
        fulfilment.delete(orderId);
        orderItems.delete(orderId);
        paymentAttempts.delete(orderId);
        paymentAudits.delete(orderId);
        retailLinks.delete(orderId);
        orders.delete(orderId);
      }
      for (const [id, record] of [...outbox.entries()]) {
        if (record.orderId && orderIds.includes(record.orderId)) {
          outbox.delete(id);
        }
      }
      for (const [key, record] of [...idempotency.entries()]) {
        if (record.ownerScope.includes(principalScope)) {
          idempotency.delete(key);
        }
      }
      for (const [key, record] of [...revisions.entries()]) {
        if (planIds.includes(record.planId)) {
          revisions.delete(key);
        }
      }
      for (const planId of planIds) {
        plans.delete(planId);
      }
      for (const caseId of caseIds) {
        supportCases.delete(caseId);
        supportMessages.delete(caseId);
      }
    },
    async listPlanIdsByPrincipal(principalScope) {
      return [...plans.values()]
        .filter((record) => record.principalScope === principalScope)
        .map((record) => record.id);
    },
    async deleteAll() {
      capabilities.clear();
      checkouts.clear();
      feedback.clear();
      fulfilment.clear();
      idempotency.clear();
      orderItems.clear();
      orders.clear();
      outbox.clear();
      paymentAttempts.clear();
      paymentAudits.clear();
      plans.clear();
      operations.clear();
      providerEvents.clear();
      retailLinks.clear();
      revisions.clear();
      supportCases.clear();
      supportMessages.clear();
    },
    async getCapabilityByHash(hash) {
      return capabilities.get(hash) ? clone(capabilities.get(hash)!) : null;
    },
    async getCheckoutByAccessHash(hash) {
      for (const record of checkouts.values()) {
        if (record.accessHash === hash) {
          return clone(record);
        }
      }

      return null;
    },
    async getCheckoutByOrderId(orderId) {
      for (const record of checkouts.values()) {
        if (record.orderId === orderId) {
          return clone(record);
        }
      }

      return null;
    },
    async getFeedback(id) {
      return feedback.get(id) ? clone(feedback.get(id)!) : null;
    },
    async getIdempotency(operation, ownerScope, key) {
      const record = idempotency.get(idempotencyKey(operation, ownerScope, key));
      return record ? clone(record) : null;
    },
    async getOrderReadState(id) {
      const order = orders.get(id); if (!order) return null;
      const projection = order.readProjection ?? orderReadProjection(order.frozenPlan);
      return clone({ order: { ...order, readProjection: projection, frozenPlan: projection.presentation }, fulfilmentEvents: compactFulfilmentEvents(fulfilment.get(id) ?? []) });
    },
    async getOrder(id) {
      return orders.get(id) ? clone(orders.get(id)!) : null;
    },
    async getOrderForUpdate(id) {
      if (!transactions.getStore()) throw new Error("Order locks require a transaction");
      return store.getOrder(id);
    },
    async getOrderByProviderSessionId(id) {
      for (const record of orders.values()) {
        if (record.providerSessionId === id) {
          return clone(record);
        }
      }

      return null;
    },
    async getOpenOrderForPlanRevision(planId, planRevision) {
      const matches = [...orders.values()]
        .filter(
          (record) =>
            record.planId === planId &&
            record.planRevision === planRevision &&
            record.orderStatus === "open" &&
            record.paymentStatus === "unpaid" &&
            !record.cancelledAt &&
            !record.expiredAt
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

      return matches[0] ? clone(matches[0]) : null;
    },
    async getActiveOrderForPlanRevision(planId, planRevision) {
      const matches = [...orders.values()]
        .filter(
          (record) =>
            record.planId === planId &&
            record.planRevision === planRevision &&
            record.orderStatus !== "expired" &&
            record.orderStatus !== "cancelled" &&
            !record.cancelledAt &&
            !record.expiredAt
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

      return matches[0] ? clone(matches[0]) : null;
    },
    async getActiveOrderForPlanRevisionForUpdate(planId, planRevision) {
      return store.getActiveOrderForPlanRevision(planId, planRevision);
    },
    async getExecuteResponseForOrder(orderId) {
      const matches = [...idempotency.values()]
        .filter(
          (record) =>
            record.operation === "execute" && record.resourceIds.orderId === orderId
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const first = matches[0];

      if (!first) {
        return null;
      }

      try {
        return JSON.parse(first.responseJson) as unknown;
      } catch {
        return null;
      }
    },
    async getOrderItems(orderId) {
      return clone(orderItems.get(orderId) ?? []);
    },
    async getOutboxPending() {
      return [...outbox.values()]
        .filter((item) => !item.processedAt)
        .map((item) => clone(item));
    },
    async claimOutboxBatch(limit) {
      if (!transactions.getStore()) throw new Error("Outbox claims require a transaction");
      return (await store.getOutboxPending())
        .filter(item => item.type === "OMS_SUBMIT")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .slice(0, Math.max(1, Math.min(50, limit)));
    },
    async getPlanForUpdate(id) {
      if (!transactions.getStore()) throw new Error("Plan locks require a transaction");
      return store.getPlan(id);
    },
    async getPlan(id) {
      return plans.get(id) ? clone(plans.get(id)!) : null;
    },
    async getPlanRevision(planId, revision) {
      const record = revisions.get(revisionKey(planId, revision));
      return record ? clone(record) : null;
    },
    async getProviderEvent(provider, providerEventId) {
      const record = providerEvents.get(`${provider}:${providerEventId}`);
      return record ? clone(record) : null;
    },
    async getRetailLink(orderId) {
      return retailLinks.get(orderId) ? clone(retailLinks.get(orderId)!) : null;
    },
    async getSupportCase(id) {
      return supportCases.get(id) ? clone(supportCases.get(id)!) : null;
    },
    async getSupportCaseByOrderId(orderId) {
      for (const record of supportCases.values()) {
        if (record.orderId === orderId) {
          return clone(record);
        }
      }

      return null;
    },
    async getSupportMessages(caseId) {
      return clone(supportMessages.get(caseId) ?? []);
    },
    async insertCapability(record) {
      capabilities.set(record.hash, clone(record));
    },
    async insertCheckout(record) {
      checkouts.set(record.id, clone(record));
    },
    async insertFeedback(record) {
      feedback.set(record.id, clone(record));
    },
    async insertFulfilmentEvent(record) {
      const list = [...(fulfilment.get(record.orderId) ?? [])];
      list.push(clone(record));
      fulfilment.set(record.orderId, list);
    },
    async listFulfilmentEvents(orderId) {
      return clone(fulfilment.get(orderId) ?? []);
    },
    async insertIdempotency(record) {
      const key = idempotencyKey(record.operation, record.ownerScope, record.key);
      const existing = idempotency.get(key);

      if (existing) {
        if (existing.requestHash === record.requestHash) {
          return;
        }

        throw new Error("idempotency_conflict");
      }

      idempotency.set(key, clone(record));
    },
    async insertOrder(record) {
      orders.set(record.id, clone({ ...record, readProjection: orderReadProjection(record.frozenPlan) }));
    },
    async insertOrderItems(items) {
      if (items.length < 1) {
        return;
      }

      orderItems.set(items[0].orderId, clone([...items]));
    },
    async insertOutbox(record) {
      outbox.set(record.id, clone(record));
    },
    async insertPaymentAttempt(record) {
      const list = [...(paymentAttempts.get(record.orderId) ?? [])];
      list.push(clone(record));
      paymentAttempts.set(record.orderId, list);
    },
    async insertPaymentAudit(record) {
      const list = [...(paymentAudits.get(record.orderId) ?? [])];
      list.push(clone(record));
      paymentAudits.set(record.orderId, list);
    },
    async insertPlan(record) {
      plans.set(record.id, clone(record));
    },
    async insertPlanRevision(record) {
      revisions.set(revisionKey(record.planId, record.revision), clone({ ...record, statusProjection: record.statusProjection ?? planStatusProjection(record.result) }));
    },
    async insertProviderEvent(record) {
      const key = `${record.provider}:${record.providerEventId}`;

      if (providerEvents.has(key)) {
        throw new Error("provider_event_duplicate");
      }

      providerEvents.set(key, clone(record));
    },
    async insertRetailLink(record) {
      retailLinks.set(record.orderId, clone(record));
    },
    async insertSupportCase(record) {
      supportCases.set(record.id, clone(record));
    },
    async insertSupportMessage(record) {
      const list = [...(supportMessages.get(record.caseId) ?? [])];
      list.push(clone(record));
      supportMessages.set(record.caseId, list);
    },
    async listPaymentAudits(orderId) {
      return clone(paymentAudits.get(orderId) ?? []);
    },
    async listPaymentAttempts(orderId) {
      return clone(paymentAttempts.get(orderId) ?? []);
    },
    async markOutboxProcessed(id, processedAt) {
      const record = outbox.get(id);

      if (record) {
        outbox.set(id, { ...record, processedAt });
      }
    },
    async transaction(work) {
      if (transactions.getStore()) return work(store);
      const pending = tail.catch(() => undefined).then(() => transactions.run(true, async () => {
        const before = maps.map(map => new Map(map));
        try { return await work(store); } catch (error) {
          maps.forEach((map, index) => { map.clear(); for (const [key, value] of before[index]) map.set(key, value); });
          throw error;
        }
      }));
      tail = pending.then(() => undefined, () => undefined);
      return pending;
    },
    async updateCheckout(record) {
      checkouts.set(record.id, clone(record));
    },
    async updateIdempotency(record) {
      const key = idempotencyKey(record.operation, record.ownerScope, record.key);

      if (!idempotency.has(key)) {
        throw new Error("idempotency_missing");
      }

      idempotency.set(key, clone(record));
    },
    async updateOrder(record) {
      orders.set(record.id, clone({ ...record, readProjection: orderReadProjection(record.frozenPlan) }));
    },
    async updatePlan(record) {
      plans.set(record.id, clone(record));
    },
    async updatePlanRevision(record) {
      const key = revisionKey(record.planId, record.revision);

      if (!revisions.has(key)) {
        throw new Error("plan_revision_missing");
      }

      revisions.set(key, clone({ ...record, statusProjection: planStatusProjection(record.result) }));
    },
    async updateSupportCase(record) {
      supportCases.set(record.id, clone(record));
    }
  };

  return store;
}
