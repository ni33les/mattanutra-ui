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

  const store: AgenticStore = {
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
    async getOrder(id) {
      return orders.get(id) ? clone(orders.get(id)!) : null;
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
      const list = fulfilment.get(record.orderId) ?? [];
      list.push(clone(record));
      fulfilment.set(record.orderId, list);
    },
    async insertIdempotency(record) {
      const key = idempotencyKey(record.operation, record.ownerScope, record.key);

      if (idempotency.has(key)) {
        throw new Error("idempotency_conflict");
      }

      idempotency.set(key, clone(record));
    },
    async insertOrder(record) {
      orders.set(record.id, clone(record));
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
      const list = paymentAttempts.get(record.orderId) ?? [];
      list.push(clone(record));
      paymentAttempts.set(record.orderId, list);
    },
    async insertPaymentAudit(record) {
      const list = paymentAudits.get(record.orderId) ?? [];
      list.push(clone(record));
      paymentAudits.set(record.orderId, list);
    },
    async insertPlan(record) {
      plans.set(record.id, clone(record));
    },
    async insertPlanRevision(record) {
      revisions.set(revisionKey(record.planId, record.revision), clone(record));
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
      const list = supportMessages.get(record.caseId) ?? [];
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
      return work(store);
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
      orders.set(record.id, clone(record));
    },
    async updatePlan(record) {
      plans.set(record.id, clone(record));
    },
    async updatePlanRevision(record) {
      const key = revisionKey(record.planId, record.revision);

      if (!revisions.has(key)) {
        throw new Error("plan_revision_missing");
      }

      revisions.set(key, clone(record));
    },
    async updateSupportCase(record) {
      supportCases.set(record.id, clone(record));
    }
  };

  return store;
}
