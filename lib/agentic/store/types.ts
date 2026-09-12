import type { AgenticEnvironment } from "@/lib/agentic/config";

export type ResourceType = "plan" | "order" | "support" | "checkout" | "feedback" | "evidence";

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

/** Internal durable work; capabilities and the public plan/get protocol remain
 * the customer interface. Secrets are never included in command/checkpoint. */
export type PlanOperationRecord = Readonly<{
  id: string;
  planId: string;
  ownerScope: string;
  key: string;
  requestHash: string;
  expectedRevision: number;
  revision: number;
  taskId: string;
  deadlineAt?: string;
  status: "queued" | "running" | "retryable" | "complete" | "failed" | "cancelled";
  version: number;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  command: Readonly<{ payload: unknown; prepared: Record<string, unknown>; scope: import("@/lib/agentic/capabilities").CapabilityScope }>;
  checkpoint: unknown;
  catalogueIdentity: string | null;
  referenceIdentity: string | null;
  response: unknown;
  error: unknown;
}>;

export type PlanRevisionRecord = Readonly<{
  storageJson?: Readonly<{request:string;result:string;projection:string}>;
  statusProjection?: import("@/lib/agentic/presentation/status-projection").PlanStatusProjection | null;
  availabilityAsOf: string;
  catalogueVersion: string;
  createdAt: string;
  guidanceRulesVersion: string;
  planId: string;
  requestSnapshot: unknown;
  result: unknown;
  revision: number;
  status: "blocked" | "needs_input" | "no_purchase" | "processing" | "ready";
}>;

export type OrderRecord = Readonly<{
  readProjection?: import("@/lib/agentic/presentation/order-read").OrderReadProjection | null;
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
    | "exception"
    | "not_started"
    | "packed"
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
  author: "client" | "support" | "system";
  body: string;
  caseId: string;
  createdAt: string;
  id: string;
  sequence: number;
}>;

export type FeedbackRecord = Readonly<{
  consentConfirmed: true;
  createdAt: string;
  id: string;
  candidateKey: string | null;
  planId: string;
  points: readonly string[];
  rating: number | null;
  revision: number;
  summary: string | null;
}>;

export type AgenticStore = {
  expireOperation?(id: string, now: string, error: unknown): Promise<boolean>;
  claimOperation?(id: string, token: string, now: string, leaseExpiresAt: string): Promise<PlanOperationRecord | null>;
  patchClaimedOperation?(id: string, token: string, changes: import("@/lib/agentic/store/operation-commands").OperationChanges, now: string, leaseExpiresAt: string | null, preparedJson?: string): Promise<boolean>;
  getPlanOperationHeader?(id:string):Promise<Pick<PlanOperationRecord,"status"|"leaseToken"|"leaseExpiresAt">|null>;
  releaseUnstartedOperationAttempts?(id: string, token: string, attempts: number, reserved: number, restore: number, now: string): Promise<boolean>;
  /** Coherent MVCC presentation read; never locks rows or includes commands/cursors. */
  getPlanReadState(planId: string, revision?: number, includeResult?: boolean | "terminal"): Promise<import("@/lib/agentic/presentation/status-projection").PlanReadState | null>;
  getPlanOperation(id: string, options?: { includeCursor: boolean }): Promise<PlanOperationRecord | null>;
  getPlanOperationByKey(ownerScope: string, key: string): Promise<PlanOperationRecord | null>;
  getActivePlanOperation(planId: string): Promise<PlanOperationRecord | null>;
  getFailedPlanOperation(planId: string, currentRevision: number): Promise<PlanOperationRecord | null>;
  getCompletedPlanOperation(planId: string, revision: number): Promise<PlanOperationRecord | null>;
  /** Insert operation and its framework task in the caller's transaction. */
  insertPlanOperation(record: PlanOperationRecord, preparedJson?: string): Promise<void>;
  updatePlanOperation(record: PlanOperationRecord, expectedVersion: number): Promise<boolean>;
  getCatalogueSnapshot(id: string): Promise<import("@/lib/agentic/catalogue/types").CatalogueSnapshot | null>;
  insertCatalogueSnapshot(id: string, snapshot: import("@/lib/agentic/catalogue/types").CatalogueSnapshot): Promise<void>;
  deleteAll(): Promise<void>;
  deletePrincipalScope(principalScope: string): Promise<void>;
  listPlanIdsByPrincipal(principalScope: string): Promise<readonly string[]>;
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
  getOrderReadState(id: string): Promise<import("@/lib/agentic/presentation/order-read").OrderReadState | null>;
  getOrderForUpdate(id: string): Promise<OrderRecord | null>;
  getOrderByProviderSessionId(id: string): Promise<OrderRecord | null>;
  getOpenOrderForPlanRevision(
    planId: string,
    planRevision: number
  ): Promise<OrderRecord | null>;
  getActiveOrderForPlanRevision(
    planId: string,
    planRevision: number
  ): Promise<OrderRecord | null>;
  /** Mutation-only lookup; protects checkout reuse and payment transitions until commit. */
  getActiveOrderForPlanRevisionForUpdate(planId: string, planRevision: number): Promise<OrderRecord | null>;
  getExecuteResponseForOrder(orderId: string): Promise<unknown | null>;
  getOrderItems(orderId: string): Promise<readonly OrderItemRecord[]>;
  getOutboxPending(): Promise<readonly OutboxEventRecord[]>;
  claimOutboxBatch(limit: number): Promise<readonly OutboxEventRecord[]>;
  getPlan(id: string): Promise<PlanRecord | null>;
  getPlanForUpdate(id: string): Promise<PlanRecord | null>;
  /** Verifies and holds the live catalogue epoch through the enclosing transaction. */
  isCatalogueRevisionCurrent?(expectedRevision: number): Promise<boolean>;
  getPlanRevision(
    planId: string,
    revision: number
  ): Promise<PlanRevisionRecord | null>;
  getPlanRevisionHeader?(planId:string,revision:number):Promise<Pick<PlanRevisionRecord,"revision"|"status"|"createdAt">|null>;
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
  listFulfilmentEvents(orderId: string): Promise<readonly FulfilmentEventRecord[]>;
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
