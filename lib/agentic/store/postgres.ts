// @ts-nocheck
import { getSql } from "@/lib/db";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { createMemoryStore } from "@/lib/agentic/store/memory";
import { asMinor } from "@/lib/agentic/money";

type Sql = NonNullable<ReturnType<typeof getSql>>;
type AnySql = ((strings: TemplateStringsArray, ...params: unknown[]) => Promise<Array<Record<string, unknown>>>) & {
  begin: (fn: (tx: AnySql) => Promise<unknown>) => Promise<unknown>;
};

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

export function createPostgresStore(inputSql: Sql): AgenticStore {
  const sql = inputSql as unknown as AnySql;
  const store = {
    async deleteAll() {
      await sql`truncate table
        public.agentic_feedback,
        public.agentic_support_messages,
        public.agentic_support_cases,
        public.agentic_fulfilment_events,
        public.agentic_retail_order_links,
        public.agentic_outbox_events,
        public.agentic_payment_audits,
        public.agentic_payment_attempts,
        public.agentic_provider_events,
        public.agentic_order_items,
        public.agentic_checkout_sessions,
        public.agentic_orders,
        public.agentic_idempotency_records,
        public.agentic_capabilities,
        public.agentic_plan_revisions,
        public.agentic_plans
        restart identity cascade`;
    },
    async getCapabilityByHash(hash) {
      const [row] = await sql`
        select * from public.agentic_capabilities where capability_hash = ${hash} limit 1
      `;
      if (!row) return null;
      return {
        allowedActions: row.allowed_actions,
        environment: row.environment,
        expiresAt: toIsoOrNull(row.expires_at),
        hash: row.capability_hash,
        id: row.id,
        issuedAt: toIso(row.issued_at),
        keyVersion: row.key_version,
        principalScope: row.principal_scope,
        resourceId: row.resource_id,
        resourceType: row.resource_type,
        revokedAt: toIsoOrNull(row.revoked_at),
        tenantScope: row.tenant_scope
      };
    },
    async getCheckoutByAccessHash(hash) {
      const [row] = await sql`
        select * from public.agentic_checkout_sessions where access_hash = ${hash} limit 1
      `;
      return row ? mapCheckout(row) : null;
    },
    async getCheckoutByOrderId(orderId) {
      const [row] = await sql`
        select * from public.agentic_checkout_sessions where order_id = ${orderId}::uuid limit 1
      `;
      return row ? mapCheckout(row) : null;
    },
    async getFeedback(id) {
      const [row] = await sql`select * from public.agentic_feedback where id = ${id}::uuid`;
      if (!row) return null;
      return {
        consentConfirmed: true as const,
        createdAt: toIso(row.created_at),
        id: row.id,
        optionId: row.option_id,
        planId: row.plan_id,
        points: row.points ?? [],
        rating: row.rating,
        revision: row.revision,
        summary: row.summary
      };
    },
    async getIdempotency(operation, ownerScope, key) {
      const [row] = await sql`
        select * from public.agentic_idempotency_records
        where operation = ${operation} and owner_scope = ${ownerScope} and idempotency_key = ${key}
      `;
      if (!row) return null;
      return {
        createdAt: toIso(row.created_at),
        expiresAt: toIso(row.expires_at),
        key: row.idempotency_key,
        operation: row.operation,
        ownerScope: row.owner_scope,
        requestHash: row.request_hash,
        resourceIds: row.resource_ids ?? {},
        responseJson: JSON.stringify(row.response_json)
      };
    },
    async getOrder(id) {
      const [row] = await sql`select * from public.agentic_orders where id = ${id}::uuid`;
      return row ? mapOrder(row) : null;
    },
    async getOrderByProviderSessionId(id) {
      const [row] = await sql`
        select * from public.agentic_orders where provider_session_id = ${id} limit 1
      `;
      return row ? mapOrder(row) : null;
    },
    async getOrderItems(orderId) {
      const rows = await sql`
        select * from public.agentic_order_items where order_id = ${orderId}::uuid
      `;
      return rows.map((row) => ({
        currency: row.currency,
        dailyPills: Number(row.daily_pills),
        form: row.form,
        id: row.id,
        lineTotalMinor: asMinor(row.line_total_minor),
        orderId: row.order_id,
        productId: row.product_id,
        productName: row.product_name,
        quantity: row.quantity,
        retailerSku: row.retailer_sku,
        sellerId: row.seller_id,
        sellerName: row.seller_name,
        unitPriceMinor: asMinor(row.unit_price_minor)
      }));
    },
    async getOutboxPending() {
      const rows = await sql`
        select * from public.agentic_outbox_events where processed_at is null
      `;
      return rows.map(mapOutbox);
    },
    async getPlan(id) {
      const [row] = await sql`select * from public.agentic_plans where id = ${id}::uuid`;
      if (!row) return null;
      return {
        createdAt: toIso(row.created_at),
        currentRevision: row.current_revision,
        environment: row.environment,
        id: row.id,
        principalScope: row.principal_scope,
        tenantScope: row.tenant_scope,
        updatedAt: toIso(row.updated_at)
      };
    },
    async getPlanRevision(planId, revision) {
      const [row] = await sql`
        select * from public.agentic_plan_revisions
        where plan_id = ${planId}::uuid and revision = ${revision}
      `;
      if (!row) return null;
      return {
        availabilityAsOf: toIso(row.availability_as_of),
        catalogueVersion: row.catalogue_version,
        createdAt: toIso(row.created_at),
        guidanceRulesVersion: row.guidance_rules_version,
        planId: row.plan_id,
        requestSnapshot: row.request_snapshot,
        result: row.result,
        revision: row.revision,
        status: row.status
      };
    },
    async getProviderEvent(provider, providerEventId) {
      const [row] = await sql`
        select * from public.agentic_provider_events
        where provider = ${provider} and provider_event_id = ${providerEventId}
      `;
      if (!row) return null;
      return {
        createdAt: toIso(row.created_at),
        id: row.id,
        orderId: row.order_id,
        payload: row.payload,
        provider: row.provider,
        providerEventId: row.provider_event_id
      };
    },
    async getRetailLink(orderId) {
      const [row] = await sql`
        select * from public.agentic_retail_order_links where order_id = ${orderId}::uuid
      `;
      if (!row) return null;
      return {
        adapter: row.adapter,
        createdAt: toIso(row.created_at),
        orderId: row.order_id,
        retailerReference: row.retailer_reference
      };
    },
    async getSupportCase(id) {
      const [row] = await sql`select * from public.agentic_support_cases where id = ${id}::uuid`;
      return row ? mapSupport(row) : null;
    },
    async getSupportCaseByOrderId(orderId) {
      const [row] = await sql`
        select * from public.agentic_support_cases where order_id = ${orderId}::uuid limit 1
      `;
      return row ? mapSupport(row) : null;
    },
    async getSupportMessages(caseId) {
      const rows = await sql`
        select * from public.agentic_support_messages where case_id = ${caseId}::uuid
      `;
      return rows.map((row) => ({
        author: row.author,
        body: row.body,
        caseId: row.case_id,
        createdAt: toIso(row.created_at),
        id: row.id
      }));
    },
    async insertCapability(record) {
      await sql`
        insert into public.agentic_capabilities (
          id, capability_hash, resource_type, resource_id, environment, tenant_scope,
          principal_scope, allowed_actions, issued_at, expires_at, revoked_at, key_version
        ) values (
          ${record.id}::uuid, ${record.hash}, ${record.resourceType}, ${record.resourceId}::uuid,
          ${record.environment}, ${record.tenantScope}, ${record.principalScope},
          ${record.allowedActions}, ${record.issuedAt}::timestamptz,
          ${record.expiresAt}::timestamptz, ${record.revokedAt}::timestamptz, ${record.keyVersion}
        )
      `;
    },
    async insertCheckout(record) {
      await sql`
        insert into public.agentic_checkout_sessions (
          id, order_id, access_hash, provider_session_id, encrypted_address,
          shipping_minor, tax_minor, created_at, expires_at
        ) values (
          ${record.id}::uuid, ${record.orderId}::uuid, ${record.accessHash},
          ${record.providerSessionId}, ${record.encryptedAddress},
          ${record.shippingMinor}, ${record.taxMinor},
          ${record.createdAt}::timestamptz, ${record.expiresAt}::timestamptz
        )
      `;
    },
    async insertFeedback(record) {
      await sql`
        insert into public.agentic_feedback (
          id, plan_id, revision, option_id, consent_confirmed, summary, points, rating, created_at
        ) values (
          ${record.id}::uuid, ${record.planId}::uuid, ${record.revision}, ${record.optionId},
          ${record.consentConfirmed}, ${record.summary}, ${record.points}, ${record.rating},
          ${record.createdAt}::timestamptz
        )
      `;
    },
    async insertFulfilmentEvent(record) {
      await sql`
        insert into public.agentic_fulfilment_events (id, order_id, status, payload, created_at)
        values (${record.id}::uuid, ${record.orderId}::uuid, ${record.status}, ${asJson(record.payload)}, ${record.createdAt}::timestamptz)
      `;
    },
    async insertIdempotency(record) {
      await sql`
        insert into public.agentic_idempotency_records (
          operation, owner_scope, idempotency_key, request_hash, resource_ids, response_json, created_at, expires_at
        ) values (
          ${record.operation}, ${record.ownerScope}, ${record.key}, ${record.requestHash},
          ${asJson(record.resourceIds)}, ${asJson(JSON.parse(record.responseJson))},
          ${record.createdAt}::timestamptz, ${record.expiresAt}::timestamptz
        )
      `;
    },
    async insertOrder(record) {
      await sql`
        insert into public.agentic_orders (
          id, reference, plan_id, plan_revision, environment, tenant_scope, principal_scope,
          destination_country, currency, total_price_minor, order_status, payment_status,
          fulfilment_status, state_version, provider_session_id, checkout_url, checkout_expires_at,
          checkout_access_hash, frozen_plan, latest_payment_attempt, latest_payment_reason,
          created_at, updated_at, completed_at, cancelled_at, expired_at
        ) values (
          ${record.id}::uuid, ${record.reference}, ${record.planId}::uuid, ${record.planRevision},
          ${record.environment}, ${record.tenantScope}, ${record.principalScope},
          ${record.destinationCountry}, ${record.currency}, ${record.totalPriceMinor},
          ${record.orderStatus}, ${record.paymentStatus}, ${record.fulfilmentStatus},
          ${record.stateVersion}, ${record.providerSessionId}, ${record.checkoutUrl},
          ${record.checkoutExpiresAt}::timestamptz, ${record.checkoutAccessHash},
          ${asJson(record.frozenPlan)}, ${record.latestPaymentAttempt}, ${record.latestPaymentReason},
          ${record.createdAt}::timestamptz, ${record.updatedAt}::timestamptz,
          ${record.completedAt}::timestamptz, ${record.cancelledAt}::timestamptz,
          ${record.expiredAt}::timestamptz
        )
      `;
    },
    async insertOrderItems(items) {
      for (const item of items) {
        await sql`
          insert into public.agentic_order_items (
            id, order_id, product_id, product_name, retailer_sku, seller_id, seller_name,
            quantity, form, daily_pills, unit_price_minor, line_total_minor, currency
          ) values (
            ${item.id}::uuid, ${item.orderId}::uuid, ${item.productId}, ${item.productName},
            ${item.retailerSku}, ${item.sellerId}, ${item.sellerName}, ${item.quantity},
            ${item.form}, ${item.dailyPills}, ${item.unitPriceMinor}, ${item.lineTotalMinor},
            ${item.currency}
          )
        `;
      }
    },
    async insertOutbox(record) {
      await sql`
        insert into public.agentic_outbox_events (id, type, order_id, payload, created_at, processed_at)
        values (
          ${record.id}::uuid, ${record.type}, ${record.orderId}::uuid, ${asJson(record.payload)},
          ${record.createdAt}::timestamptz, ${record.processedAt}::timestamptz
        )
      `;
    },
    async insertPaymentAttempt(record) {
      await sql`
        insert into public.agentic_payment_attempts (id, order_id, status, reason, provider_event_id, created_at)
        values (${record.id}::uuid, ${record.orderId}::uuid, ${record.status}, ${record.reason}, ${record.providerEventId}, ${record.createdAt}::timestamptz)
      `;
    },
    async insertPaymentAudit(record) {
      await sql`
        insert into public.agentic_payment_audits (id, order_id, type, created_at)
        values (${record.id}::uuid, ${record.orderId}::uuid, ${record.type}, ${record.createdAt}::timestamptz)
      `;
    },
    async insertPlan(record) {
      await sql`
        insert into public.agentic_plans (id, environment, tenant_scope, principal_scope, current_revision, created_at, updated_at)
        values (
          ${record.id}::uuid, ${record.environment}, ${record.tenantScope}, ${record.principalScope},
          ${record.currentRevision}, ${record.createdAt}::timestamptz, ${record.updatedAt}::timestamptz
        )
      `;
    },
    async insertPlanRevision(record) {
      await sql`
        insert into public.agentic_plan_revisions (
          plan_id, revision, status, request_snapshot, result, catalogue_version,
          guidance_rules_version, availability_as_of, created_at
        ) values (
          ${record.planId}::uuid, ${record.revision}, ${record.status},
          ${asJson(record.requestSnapshot)}, ${asJson(record.result)},
          ${record.catalogueVersion}, ${record.guidanceRulesVersion},
          ${record.availabilityAsOf}::timestamptz, ${record.createdAt}::timestamptz
        )
      `;
    },
    async insertProviderEvent(record) {
      await sql`
        insert into public.agentic_provider_events (id, provider, provider_event_id, order_id, payload, created_at)
        values (
          ${record.id}::uuid, ${record.provider}, ${record.providerEventId}, ${record.orderId}::uuid,
          ${asJson(record.payload)}, ${record.createdAt}::timestamptz
        )
      `;
    },
    async insertRetailLink(record) {
      await sql`
        insert into public.agentic_retail_order_links (order_id, adapter, retailer_reference, created_at)
        values (${record.orderId}::uuid, ${record.adapter}, ${record.retailerReference}, ${record.createdAt}::timestamptz)
      `;
    },
    async insertSupportCase(record) {
      await sql`
        insert into public.agentic_support_cases (id, order_id, case_reference, status, created_at, updated_at)
        values (
          ${record.id}::uuid, ${record.orderId}::uuid, ${record.caseReference}, ${record.status},
          ${record.createdAt}::timestamptz, ${record.updatedAt}::timestamptz
        )
      `;
    },
    async insertSupportMessage(record) {
      await sql`
        insert into public.agentic_support_messages (id, case_id, author, body, created_at)
        values (${record.id}::uuid, ${record.caseId}::uuid, ${record.author}, ${record.body}, ${record.createdAt}::timestamptz)
      `;
    },
    async listPaymentAudits(orderId) {
      const rows = await sql`
        select * from public.agentic_payment_audits where order_id = ${orderId}::uuid
      `;
      return rows.map((row) => ({
        createdAt: toIso(row.created_at),
        id: row.id,
        orderId: row.order_id,
        type: row.type
      }));
    },
    async listPaymentAttempts(orderId) {
      const rows = await sql`
        select * from public.agentic_payment_attempts where order_id = ${orderId}::uuid
      `;
      return rows.map((row) => ({
        createdAt: toIso(row.created_at),
        id: row.id,
        orderId: row.order_id,
        providerEventId: row.provider_event_id,
        reason: row.reason,
        status: row.status
      }));
    },
    async markOutboxProcessed(id, processedAt) {
      await sql`
        update public.agentic_outbox_events set processed_at = ${processedAt}::timestamptz where id = ${id}::uuid
      `;
    },
    async transaction<T>(work: (store: AgenticStore) => Promise<T>) {
      return sql.begin((tx) => work(createPostgresStore(tx as unknown as Sql))) as Promise<T>;
    },
    async updateCheckout(record) {
      await sql`
        update public.agentic_checkout_sessions set
          encrypted_address = ${record.encryptedAddress},
          provider_session_id = ${record.providerSessionId},
          shipping_minor = ${record.shippingMinor},
          tax_minor = ${record.taxMinor}
        where id = ${record.id}::uuid
      `;
    },
    async updateOrder(record) {
      await sql`
        update public.agentic_orders set
          checkout_url = ${record.checkoutUrl},
          checkout_expires_at = ${record.checkoutExpiresAt}::timestamptz,
          provider_session_id = ${record.providerSessionId},
          order_status = ${record.orderStatus},
          payment_status = ${record.paymentStatus},
          fulfilment_status = ${record.fulfilmentStatus},
          state_version = ${record.stateVersion},
          latest_payment_attempt = ${record.latestPaymentAttempt},
          latest_payment_reason = ${record.latestPaymentReason},
          frozen_plan = ${asJson(record.frozenPlan)},
          updated_at = ${record.updatedAt}::timestamptz,
          completed_at = ${record.completedAt}::timestamptz,
          cancelled_at = ${record.cancelledAt}::timestamptz,
          expired_at = ${record.expiredAt}::timestamptz
        where id = ${record.id}::uuid
      `;
    },
    async updatePlan(record) {
      await sql`
        update public.agentic_plans set
          current_revision = ${record.currentRevision},
          updated_at = ${record.updatedAt}::timestamptz
        where id = ${record.id}::uuid
      `;
    },
    async updateSupportCase(record) {
      await sql`
        update public.agentic_support_cases set
          status = ${record.status},
          updated_at = ${record.updatedAt}::timestamptz
        where id = ${record.id}::uuid
      `;
    }
  };

  return store as AgenticStore;
}

function toIso(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value) {
    return value;
  }
  return new Date(0).toISOString();
}

function toIsoOrNull(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  return toIso(value);
}

function mapCheckout(row: Record<string, any>) {
  return {
    accessHash: String(row.access_hash),
    createdAt: toIso(row.created_at),
    encryptedAddress: row.encrypted_address == null ? null : String(row.encrypted_address),
    expiresAt: toIso(row.expires_at),
    id: row.id,
    orderId: row.order_id,
    providerSessionId: row.provider_session_id,
    shippingMinor: row.shipping_minor == null ? null : asMinor(row.shipping_minor),
    taxMinor: row.tax_minor == null ? null : asMinor(row.tax_minor)
  };
}

function mapOrder(row: Record<string, any>) {
  return {
    cancelledAt: toIsoOrNull(row.cancelled_at),
    checkoutAccessHash: row.checkout_access_hash ?? null,
    checkoutExpiresAt: toIsoOrNull(row.checkout_expires_at),
    checkoutUrl: row.checkout_url ?? null,
    completedAt: toIsoOrNull(row.completed_at),
    createdAt: toIso(row.created_at),
    currency: row.currency,
    destinationCountry: row.destination_country,
    environment: row.environment,
    expiredAt: toIsoOrNull(row.expired_at),
    frozenPlan: row.frozen_plan,
    fulfilmentStatus: row.fulfilment_status,
    id: row.id,
    latestPaymentAttempt: row.latest_payment_attempt,
    latestPaymentReason: row.latest_payment_reason,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    planId: row.plan_id,
    planRevision: row.plan_revision,
    principalScope: row.principal_scope,
    providerSessionId: row.provider_session_id,
    reference: row.reference,
    stateVersion: row.state_version,
    tenantScope: row.tenant_scope,
    totalPriceMinor: asMinor(row.total_price_minor),
    updatedAt: toIso(row.updated_at)
  };
}

function mapOutbox(row: Record<string, any>) {
  return {
    createdAt: toIso(row.created_at),
    id: row.id,
    orderId: row.order_id,
    payload: row.payload,
    processedAt: toIsoOrNull(row.processed_at),
    type: row.type
  };
}

function mapSupport(row: Record<string, any>) {
  return {
    caseReference: row.case_reference,
    createdAt: toIso(row.created_at),
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    updatedAt: toIso(row.updated_at)
  };
}

export function createRuntimeStore() {
  const sql = getSql();

  if (!sql) {
    return createMemoryStore();
  }

  return createPostgresStore(sql);
}
