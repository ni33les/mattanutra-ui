import type { AgenticEnvironment } from "@/lib/agentic/config";

export type ResourceType = "plan" | "order" | "support" | "checkout" | "feedback";

export type CapabilityRecord = Readonly<{
  allowedActions: readonly string[];
  environment: AgenticEnvironment;
  expiresAt: string | null;
  hash: string;
  id: string;
  issuedAt: string;
  keyVersion: number;
  principalScope: string | null;
  resourceId: string;
  resourceType: ResourceType;
  revokedAt: string | null;
  tenantScope: string;
}>;

export type IdempotencyRecord = Readonly<{
  createdAt: string;
  expiresAt: string;
  key: string;
  operation: string;
  ownerScope: string;
  requestHash: string;
  resourceIds: Readonly<Record<string, string>>;
  responseJson: string;
}>;

export type PlanRecord = Readonly<{
  createdAt: string;
  currentRevision: number;
  environment: AgenticEnvironment;
  id: string;
  principalScope: string | null;
  tenantScope: string;
  updatedAt: string;
}>;

export type PlanRevisionRecord = Readonly<{
  availabilityAsOf: string;
  catalogueVersion: string;
  createdAt: string;
  guidanceRulesVersion: string;
  planId: string;
  requestSnapshot: unknown;
  result: unknown;
  revision: number;
  status: "blocked" | "needs_input" | "processing" | "ready";
}>;

export type OrderRecord = Readonly<{
  cancelledAt: string | null;
  checkoutAccessHash: string | null;
  checkoutExpiresAt: string | null;
  checkoutUrl: string | null;
  completedAt: string | null;
  createdAt: string;
  currency: string;
  destinationCountry: string;
  environment: AgenticEnvironment;
  expiredAt: string | null;
  frozenPlan: unknown;
  fulfilmentStatus:
    | "cancelled"
    | "delivered"
    | "not_started"
    | "processing"
    | "shipped";
  id: string;
  latestPaymentAttempt: string | null;
  latestPaymentReason: string | null;
  orderStatus: "cancelled" | "completed" | "expired" | "open";
  paymentStatus:
    | "paid"
    | "partially_refunded"
    | "processing"
    | "refunded"
    | "unpaid";
  planId: string;
  planRevision: number;
  principalScope: string | null;
  providerSessionId: string | null;
  reference: string;
  stateVersion: number;
  tenantScope: string;
  totalPriceMinor: number;
  updatedAt: string;
}>;

export type OrderItemRecord = Readonly<{
  currency: string;
  dailyPills: number;
  form: string;
  id: string;
  lineTotalMinor: number;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  retailerSku: string;
  sellerId: string;
  sellerName: string;
  unitPriceMinor: number;
}>;

export type PaymentAttemptRecord = Readonly<{
  createdAt: string;
  id: string;
  orderId: string;
  providerEventId: string | null;
  reason: string | null;
  status: string;
}>;

export type ProviderEventRecord = Readonly<{
  createdAt: string;
  id: string;
  orderId: string;
  payload: unknown;
  provider: string;
  providerEventId: string;
}>;

export type PaymentAuditRecord = Readonly<{
  createdAt: string;
  id: string;
  orderId: string;
  type: string;
}>;

export type CheckoutSessionRecord = Readonly<{
  accessHash: string;
  createdAt: string;
  encryptedAddress: string | null;
  expiresAt: string;
  id: string;
  orderId: string;
  providerSessionId: string | null;
  shippingMinor: number | null;
  taxMinor: number | null;
}>;

export type OutboxEventRecord = Readonly<{
  createdAt: string;
  id: string;
  orderId: string | null;
  payload: unknown;
  processedAt: string | null;
  type: string;
}>;

export type RetailOrderLinkRecord = Readonly<{
  adapter: string;
  createdAt: string;
  orderId: string;
  retailerReference: string;
}>;

export type FulfilmentEventRecord = Readonly<{
  createdAt: string;
  id: string;
  orderId: string;
  payload: unknown;
  status: string;
}>;

export type SupportCaseRecord = Readonly<{
  caseReference: string;
  createdAt: string;
  id: string;
  orderId: string;
  status: "closed" | "open";
  updatedAt: string;
}>;

export type SupportMessageRecord = Readonly<{
  author: "client" | "system";
  body: string;
  caseId: string;
  createdAt: string;
  id: string;
}>;

export type FeedbackRecord = Readonly<{
  consentConfirmed: true;
  createdAt: string;
  id: string;
  optionId: string | null;
  planId: string;
  points: readonly string[];
  rating: number | null;
  revision: number;
  summary: string | null;
}>;

export type AgenticStore = {
  deleteAll(): Promise<void>;
  getCapabilityByHash(hash: string): Promise<CapabilityRecord | null>;
  getCheckoutByAccessHash(hash: string): Promise<CheckoutSessionRecord | null>;
  getCheckoutByOrderId(orderId: string): Promise<CheckoutSessionRecord | null>;
  getFeedback(id: string): Promise<FeedbackRecord | null>;
  getIdempotency(
    operation: string,
    ownerScope: string,
    key: string
  ): Promise<IdempotencyRecord | null>;
  getOrder(id: string): Promise<OrderRecord | null>;
  getOrderByProviderSessionId(id: string): Promise<OrderRecord | null>;
  getOpenOrderForPlanRevision(
    planId: string,
    planRevision: number
  ): Promise<OrderRecord | null>;
  getExecuteResponseForOrder(orderId: string): Promise<unknown | null>;
  getOrderItems(orderId: string): Promise<readonly OrderItemRecord[]>;
  getOutboxPending(): Promise<readonly OutboxEventRecord[]>;
  getPlan(id: string): Promise<PlanRecord | null>;
  getPlanRevision(
    planId: string,
    revision: number
  ): Promise<PlanRevisionRecord | null>;
  getProviderEvent(
    provider: string,
    providerEventId: string
  ): Promise<ProviderEventRecord | null>;
  getRetailLink(orderId: string): Promise<RetailOrderLinkRecord | null>;
  getSupportCase(id: string): Promise<SupportCaseRecord | null>;
  getSupportCaseByOrderId(orderId: string): Promise<SupportCaseRecord | null>;
  getSupportMessages(caseId: string): Promise<readonly SupportMessageRecord[]>;
  insertCapability(record: CapabilityRecord): Promise<void>;
  insertCheckout(record: CheckoutSessionRecord): Promise<void>;
  insertFeedback(record: FeedbackRecord): Promise<void>;
  insertFulfilmentEvent(record: FulfilmentEventRecord): Promise<void>;
  insertIdempotency(record: IdempotencyRecord): Promise<void>;
  insertOrder(record: OrderRecord): Promise<void>;
  insertOrderItems(items: readonly OrderItemRecord[]): Promise<void>;
  insertOutbox(record: OutboxEventRecord): Promise<void>;
  insertPaymentAttempt(record: PaymentAttemptRecord): Promise<void>;
  insertPaymentAudit(record: PaymentAuditRecord): Promise<void>;
  insertPlan(record: PlanRecord): Promise<void>;
  insertPlanRevision(record: PlanRevisionRecord): Promise<void>;
  insertProviderEvent(record: ProviderEventRecord): Promise<void>;
  insertRetailLink(record: RetailOrderLinkRecord): Promise<void>;
  insertSupportCase(record: SupportCaseRecord): Promise<void>;
  insertSupportMessage(record: SupportMessageRecord): Promise<void>;
  listPaymentAudits(orderId: string): Promise<readonly PaymentAuditRecord[]>;
  listPaymentAttempts(orderId: string): Promise<readonly PaymentAttemptRecord[]>;
  markOutboxProcessed(id: string, processedAt: string): Promise<void>;
  transaction<T>(work: (store: AgenticStore) => Promise<T>): Promise<T>;
  updateCheckout(record: CheckoutSessionRecord): Promise<void>;
  updateIdempotency(record: IdempotencyRecord): Promise<void>;
  updateOrder(record: OrderRecord): Promise<void>;
  updatePlan(record: PlanRecord): Promise<void>;
  updatePlanRevision(record: PlanRevisionRecord): Promise<void>;
  updateSupportCase(record: SupportCaseRecord): Promise<void>;
};
