import { operationCursor, operationCursorBytes, withoutOperationCursor, withOperationCursor } from "@/lib/agentic/store/operation-checkpoint";
import { operationCommands } from "@/lib/agentic/store/operation-commands";
import { getSql, keepDatabaseWarm, withDatabaseTransaction } from "@/lib/db";
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
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { createMemoryStore } from "@/lib/agentic/store/memory";
import { asMinor } from "@/lib/agentic/money";
import { planStatusProjection, type PlanReadState, type PlanStatusProjection, type PlanOperationRead } from "@/lib/agentic/presentation/status-projection";

type Sql = NonNullable<ReturnType<typeof getSql>>;
type StoreSql = {
  <Row extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...params: unknown[]
  ): Promise<Row[]>;
  begin<T>(work: (tx: StoreSql) => Promise<T>): Promise<T>;
};

type SnakeCase<Key extends string> = Key extends `${infer First}${infer Rest}`
  ? `${First extends Lowercase<First> ? "" : "_"}${Lowercase<First>}${SnakeCase<Rest>}`
  : Key;
type DatabaseTimestamp = Date | string;
type DatabaseNumber = number | bigint | string;
/** Query rows retain the store enums/JSON payloads while reflecting PostgreSQL
 * column names and the driver's timestamp/numeric representations. */
type DatabaseRow<RecordType> = {
  [Key in keyof RecordType as SnakeCase<Key & string>]:
    Key extends `${string}At` | "availabilityAsOf"
      ? DatabaseTimestamp | Extract<RecordType[Key], null>
      : Key extends `${string}Minor` | "dailyPills" | "sequence"
        ? DatabaseNumber | Extract<RecordType[Key], null>
        : RecordType[Key];
};
type CapabilityRow = DatabaseRow<Omit<CapabilityRecord, "hash">> & {
  capability_hash: string;
};
type IdempotencyRow = DatabaseRow<Omit<IdempotencyRecord, "key" | "responseJson">> & {
  idempotency_key: string;
  response_json: unknown;
};

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

export function createPostgresStore(inputSql: Sql, inTransaction = false): AgenticStore {
  // PostgreSQL remains the trusted decoding boundary; each read names its row
  // shape rather than leaking untyped columns into the store interface.
  const sql = inputSql as unknown as StoreSql;
  const store: AgenticStore = {
    ...operationCommands(inputSql),
    async getPlanReadState(planId, requestedRevision, includeResult = false) {
      const [row] = await sql<DatabaseRow<PlanRecord> & { revision: number; projection: PlanStatusProjection | null;
        result: unknown; operation: PlanOperationRead | null; frozen: boolean; catalogue_revision: number | null }>`
        select p.*,r.revision,r.status_projection as projection,
          case when ${includeResult} or r.status_projection is null then r.result else null end as result,
          op.read_projection as operation,
          exists(select 1 from public.agentic_orders o where o.plan_id=p.id and o.plan_revision=r.revision
            and o.order_status not in ('expired','cancelled') and o.checkout_reuse_eligible
            and o.cancelled_at is null and o.expired_at is null) as frozen,
          epoch.revision as catalogue_revision
        from public.agentic_plans p
        join public.agentic_plan_revisions r on r.plan_id=p.id and r.revision=coalesce(${requestedRevision ?? null}::integer,p.current_revision)
        left join public.catalogue_runtime_revision epoch on epoch.singleton=true
        left join lateral (
          select x.read_projection from public.agentic_plan_operations x where x.plan_id=p.id
            and (x.status in ('queued','running','retryable') or
              (x.status in ('failed','cancelled') and x.read_projection->>'expectedRevision'=p.current_revision::text))
          order by case when x.status in ('queued','running','retryable') then 0 else 1 end,
            case when x.status in ('queued','running','retryable') then x.created_at end asc,
            case when x.status in ('failed','cancelled') then x.created_at end desc,
            case when x.status in ('queued','running','retryable') then x.id end asc,x.id desc limit 1
        ) op on true where p.id=${planId}::uuid`;
      if (!row) return null;
      return { plan: { id: row.id, currentRevision: row.current_revision, environment: row.environment,
        principalScope: row.principal_scope, tenantScope: row.tenant_scope, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) },
        revision: row.revision, projection: row.projection, result: row.result, operation: row.operation,
        frozen: row.frozen, catalogueRevision: row.catalogue_revision == null ? null : Number(row.catalogue_revision) } satisfies PlanReadState;
    },
    async getPlanOperation(id, options) {
      if (options?.includeCursor === false) {
        const [row] = await sql<{ record_json: PlanOperationRecord }>`select record_json from public.agentic_plan_operations where id=${id}::uuid`;
        return row ? withoutOperationCursor(row.record_json) : null;
      }
      const [row] = await sql<{ record_json: PlanOperationRecord; checkpoint_cursor: Buffer | null }>`select record_json,checkpoint_cursor from public.agentic_plan_operations where id=${id}::uuid`;
      return row ? withOperationCursor(row.record_json, row.checkpoint_cursor?.toString("base64")) : null;
    },
    async getPlanOperationByKey(ownerScope, key) {
      const [row] = await sql<{ record_json: PlanOperationRecord }>`select record_json from public.agentic_plan_operations where owner_scope=${ownerScope} and idempotency_key=${key}`;
      return row ? withoutOperationCursor(row.record_json) : null;
    },
    async getCompletedPlanOperation(planId, revision) {
      const [row] = await sql<{ id: string }>`select id from public.agentic_plan_operations
        where plan_id=${planId}::uuid and status='complete' and record_json->>'revision'=${String(revision)} order by created_at desc limit 1`;
      return row ? store.getPlanOperation(row.id) : null;
    },
    async getActivePlanOperation(planId) {
      const [row] = await sql<{ record_json: PlanOperationRecord }>`select record_json from public.agentic_plan_operations
        where plan_id=${planId}::uuid and status in ('queued','running','retryable') order by created_at,id limit 1`;
      return row ? withoutOperationCursor(row.record_json) : null;
    },
    async getFailedPlanOperation(planId, currentRevision) {
      const [row] = await sql<{ record_json: PlanOperationRecord }>`select record_json from public.agentic_plan_operations
        where plan_id=${planId}::uuid and status in ('failed','cancelled') and record_json->>'expectedRevision'=${String(currentRevision)}
        order by created_at desc,id desc limit 1`;
      return row ? withoutOperationCursor(row.record_json) : null;
    },
    async insertPlanOperation(record) {
      if (!inTransaction) throw new Error("Plan admission requires a transaction");
      await sql`insert into public.agentic_plan_operations(id,plan_id,owner_scope,idempotency_key,status,version,record_json,created_at,updated_at)
        values(${record.id}::uuid,${record.planId}::uuid,${record.ownerScope},${record.key},${record.status},${record.version},${asJson(record)},${record.createdAt}::timestamptz,${record.updatedAt}::timestamptz)`;
      const { createTask } = await import("@/lib/task-service");
      await createTask({ id: record.taskId, taskType: "match_agentic_plan", title: "Complete supplement matching",
        sourceEntityId: record.id, sourceEntityType: "agentic_plan_operation", payload: { operationId: record.id },
        idempotencyKey: `agentic-plan:${record.id}`, requiredCapabilities: ["match_agentic_plan"], maxAttempts: 3 }, inputSql);
    },
    async updatePlanOperation(record, expectedVersion) {
      const cursor = operationCursor(record), metadata = asJson(withoutOperationCursor(record));
      const rows = cursor !== undefined
        ? await sql<{ id: string }>`update public.agentic_plan_operations set status=${record.status},version=${record.version},
          record_json=${metadata},checkpoint_cursor=${operationCursorBytes(cursor)},updated_at=${record.updatedAt}::timestamptz
          where id=${record.id}::uuid and version=${expectedVersion} returning id`
        : await sql<{ id: string }>`update public.agentic_plan_operations set status=${record.status},version=${record.version},
          record_json=${metadata},checkpoint_cursor=case when ${record.checkpoint === null} then null else
            coalesce(checkpoint_cursor,decode(record_json #>> '{checkpoint,search,cursor}','base64')) end,
          updated_at=${record.updatedAt}::timestamptz where id=${record.id}::uuid and version=${expectedVersion} returning id`;
      return rows.length === 1;
    },
    async isCatalogueRevisionCurrent(expectedRevision) {
      if (!inTransaction) throw new Error("Catalogue publication fences require a transaction");
      const [row] = await sql<{ revision: number | string }>`
        select revision from public.catalogue_runtime_revision where singleton = true for share`;
      return row != null && String(row.revision) === String(expectedRevision);
    },
    async getCatalogueSnapshot(id) {
      const [row] = await sql<{ snapshot_json: CatalogueSnapshot }>`
        select snapshot_json from public.agentic_catalogue_snapshots where snapshot_id = ${id}
        union all
        select snapshot_json from public.agentic_qa_catalogues where snapshot_id = ${id}
        limit 1
      `;
      return row?.snapshot_json ?? null;
    },
    async insertCatalogueSnapshot(id, snapshot) {
      await sql`
        insert into public.agentic_catalogue_snapshots (snapshot_id, snapshot_json)
        values (${id}, ${asJson(snapshot)}) on conflict (snapshot_id) do nothing
      `;
    },
    async listPlanIdsByPrincipal(principalScope) {
      const rows = await sql<{ id: string }>`
        select id from public.agentic_plans where principal_scope = ${principalScope}
      `;
      return rows.map((row) => String(row.id));
    },
    async deletePrincipalScope(principalScope) {
      if (!String(principalScope).startsWith("qa-v3:")) {
        return;
      }
      await sql`delete from public.agentic_plan_operations where plan_id in (select id from public.agentic_plans where principal_scope=${principalScope})`;
      await sql`
        delete from public.agentic_support_messages
        where case_id in (
          select c.id from public.agentic_support_cases c
          join public.agentic_orders o on o.id = c.order_id
          where o.principal_scope = ${principalScope}
        )
      `;
      await sql`
        delete from public.agentic_support_cases
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_fulfilment_events
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_order_items
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_checkout_sessions
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_payment_attempts
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_payment_audits
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_provider_events
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_outbox_events
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_retail_order_links
        where order_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_feedback
        where plan_id in (select id from public.agentic_plans where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_capabilities
        where principal_scope = ${principalScope}
           or resource_id in (select id from public.agentic_orders where principal_scope = ${principalScope})
           or resource_id in (select id from public.agentic_plans where principal_scope = ${principalScope})
      `;
      await sql`
        delete from public.agentic_idempotency_records
        where owner_scope like ${"%" + principalScope + "%"}
      `;
      await sql`delete from public.agentic_orders where principal_scope = ${principalScope}`;
      await sql`
        delete from public.agentic_plan_revisions
        where plan_id in (select id from public.agentic_plans where principal_scope = ${principalScope})
      `;
      await sql`delete from public.agentic_plans where principal_scope = ${principalScope}`;
    },
    async deleteAll() {
      await sql`truncate table
        public.agentic_plan_operations,
        public.agentic_funnel_events,
        public.agentic_matcher_events,
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
      const [row] = await sql<CapabilityRow>`
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
      const [row] = await sql<DatabaseRow<CheckoutSessionRecord>>`
        select * from public.agentic_checkout_sessions where access_hash = ${hash} limit 1
      `;
      return row ? mapCheckout(row) : null;
    },
    async getCheckoutByOrderId(orderId) {
      const [row] = await sql<DatabaseRow<CheckoutSessionRecord>>`
        select * from public.agentic_checkout_sessions where order_id = ${orderId}::uuid limit 1
      `;
      return row ? mapCheckout(row) : null;
    },
    async getFeedback(id) {
      const [row] = await sql<DatabaseRow<FeedbackRecord>>`select * from public.agentic_feedback where id = ${id}::uuid`;
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
      const [row] = await sql<IdempotencyRow>`
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
      const [row] = await sql<DatabaseRow<OrderRecord>>`select * from public.agentic_orders where id = ${id}::uuid`;
      return row ? mapOrder(row) : null;
    },
    async getOrderByProviderSessionId(id) {
      const [row] = await sql<DatabaseRow<OrderRecord>>`
        select * from public.agentic_orders where provider_session_id = ${id} limit 1
      `;
      return row ? mapOrder(row) : null;
    },
    async getOpenOrderForPlanRevision(planId, planRevision) {
      const [row] = await sql<DatabaseRow<OrderRecord>>`
        select * from public.agentic_orders
        where plan_id = ${planId}::uuid
          and plan_revision = ${planRevision}
          and order_status = 'open'
          and checkout_reuse_eligible
          and payment_status = 'unpaid'
          and cancelled_at is null
          and expired_at is null
        order by created_at asc
        limit 1
        for update
      `;
      return row ? mapOrder(row) : null;
    },
    async getActiveOrderForPlanRevision(planId, planRevision) {
      const [row] = await sql<DatabaseRow<OrderRecord>>`
        select * from public.agentic_orders
        where plan_id = ${planId}::uuid
          and plan_revision = ${planRevision}
          and order_status not in ('expired', 'cancelled')
          and checkout_reuse_eligible
          and cancelled_at is null
          and expired_at is null
        order by created_at asc
        limit 1
        for update
      `;
      return row ? mapOrder(row) : null;
    },
    async getExecuteResponseForOrder(orderId) {
      const [row] = await sql<{ response_json: unknown }>`
        select response_json from public.agentic_idempotency_records
        where operation = 'execute'
          and resource_ids->>'orderId' = ${orderId}
        order by created_at asc
        limit 1
      `;
      return row ? (row.response_json ?? null) : null;
    },
    async getOrderItems(orderId) {
      const rows = await sql<DatabaseRow<OrderItemRecord>>`
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
      const rows = await sql<DatabaseRow<OutboxEventRecord>>`
        select * from public.agentic_outbox_events where processed_at is null
      `;
      return rows.map(mapOutbox);
    },
    async claimOutboxBatch(limit) {
      if (!inTransaction) throw new Error("Outbox claims require a transaction");
      const rows = await sql<DatabaseRow<OutboxEventRecord>>`
        select * from public.agentic_outbox_events
        where processed_at is null and type = 'OMS_SUBMIT'
        order by created_at, id limit ${Math.max(1, Math.min(50, limit))}
        for update skip locked
      `;
      return rows.map(mapOutbox);
    },
    async getOrderForUpdate(id) {
      if (!inTransaction) throw new Error("Order locks require a transaction");
      const [row] = await sql<DatabaseRow<OrderRecord>>`select * from public.agentic_orders where id = ${id}::uuid for update`;
      return row ? mapOrder(row) : null;
    },
    async getPlanForUpdate(id) {
      if (!inTransaction) throw new Error("Plan locks require a transaction");
      const [row] = await sql<DatabaseRow<PlanRecord>>`select * from public.agentic_plans where id = ${id}::uuid for update`;
      return row ? mapPlan(row) : null;
    },
    async getPlan(id) {
      const [row] = await sql<DatabaseRow<PlanRecord>>`select * from public.agentic_plans where id = ${id}::uuid`;
      return row ? mapPlan(row) : null;
    },
    async getPlanRevision(planId, revision) {
      const [row] = await sql<DatabaseRow<PlanRevisionRecord>>`
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
      const [row] = await sql<DatabaseRow<ProviderEventRecord>>`
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
      const [row] = await sql<DatabaseRow<RetailOrderLinkRecord>>`
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
      const [row] = await sql<DatabaseRow<SupportCaseRecord>>`select * from public.agentic_support_cases where id = ${id}::uuid`;
      return row ? mapSupport(row) : null;
    },
    async getSupportCaseByOrderId(orderId) {
      const [row] = await sql<DatabaseRow<SupportCaseRecord>>`
        select * from public.agentic_support_cases where order_id = ${orderId}::uuid limit 1
      `;
      return row ? mapSupport(row) : null;
    },
    async getSupportMessages(caseId) {
      const rows = await sql<DatabaseRow<SupportMessageRecord>>`
        select * from public.agentic_support_messages
        where case_id = ${caseId}::uuid
        order by sequence asc, id asc
      `;
      return rows.map((row) => ({
        author: row.author,
        body: row.body,
        caseId: row.case_id,
        createdAt: toIso(row.created_at),
        id: row.id,
        sequence: Number(row.sequence ?? 0)
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
    async listFulfilmentEvents(orderId) {
      const rows = await sql<DatabaseRow<FulfilmentEventRecord>>`
        select id, order_id, status, payload, created_at
        from public.agentic_fulfilment_events
        where order_id = ${orderId}::uuid
        order by created_at asc
      `;
      return rows.map((row) => ({
        createdAt: toIso(row.created_at),
        id: row.id,
        orderId: row.order_id,
        payload: row.payload,
        status: row.status
      }));
    },
    async insertIdempotency(record) {
      const rows = await sql`
        insert into public.agentic_idempotency_records (
          operation, owner_scope, idempotency_key, request_hash, resource_ids, response_json, created_at, expires_at
        ) values (
          ${record.operation}, ${record.ownerScope}, ${record.key}, ${record.requestHash},
          ${asJson(record.resourceIds)}, ${asJson(JSON.parse(record.responseJson))},
          ${record.createdAt}::timestamptz, ${record.expiresAt}::timestamptz
        )
        on conflict (operation, owner_scope, idempotency_key) do nothing
        returning operation
      `;

      if (rows.length < 1) {
        throw new Error("idempotency_conflict");
      }
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
      const projection = record.statusProjection ?? planStatusProjection(record.result);
      await sql`
        insert into public.agentic_plan_revisions (
          plan_id, revision, status, request_snapshot, result, catalogue_version,
          guidance_rules_version, availability_as_of, created_at, status_projection
        ) values (
          ${record.planId}::uuid, ${record.revision}, ${record.status},
          ${asJson(record.requestSnapshot)}, ${asJson(record.result)},
          ${record.catalogueVersion}, ${record.guidanceRulesVersion},
          ${record.availabilityAsOf}::timestamptz, ${record.createdAt}::timestamptz,
          case when ${projection !== null} then jsonb_set(${asJson(projection)}::jsonb,'{catalogueRevision}',
            coalesce((select snapshot_json->'runtimeRevision' from public.agentic_catalogue_snapshots where snapshot_id=${projection?.snapshotId ?? ""}),${asJson(projection?.catalogueRevision ?? null)}::jsonb,'null'::jsonb)) else null end
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
        insert into public.agentic_support_messages (id, case_id, author, body, created_at, sequence)
        values (
          ${record.id}::uuid, ${record.caseId}::uuid, ${record.author}, ${record.body},
          ${record.createdAt}::timestamptz, ${record.sequence}
        )
      `;
    },
    async listPaymentAudits(orderId) {
      const rows = await sql<DatabaseRow<PaymentAuditRecord>>`
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
      const rows = await sql<DatabaseRow<PaymentAttemptRecord>>`
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
      if (inTransaction) return work(store);
      return withDatabaseTransaction(inputSql, tx => work(createPostgresStore(tx, true)));
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
    async updateIdempotency(record) {
      await sql`
        update public.agentic_idempotency_records set
          request_hash = ${record.requestHash},
          resource_ids = ${asJson(record.resourceIds)},
          response_json = ${asJson(JSON.parse(record.responseJson))},
          expires_at = ${record.expiresAt}::timestamptz
        where operation = ${record.operation}
          and owner_scope = ${record.ownerScope}
          and idempotency_key = ${record.key}
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
    async updatePlanRevision(record) {
      const projection = record.statusProjection ?? planStatusProjection(record.result);
      await sql`
        update public.agentic_plan_revisions set
          status = ${record.status},
          request_snapshot = ${asJson(record.requestSnapshot)},
          result = ${asJson(record.result)},
          status_projection = case when ${projection !== null} then jsonb_set(${asJson(projection)}::jsonb,'{catalogueRevision}',
            coalesce((select snapshot_json->'runtimeRevision' from public.agentic_catalogue_snapshots where snapshot_id=${projection?.snapshotId ?? ""}),${asJson(projection?.catalogueRevision ?? null)}::jsonb,'null'::jsonb)) else null end,
          catalogue_version = ${record.catalogueVersion},
          guidance_rules_version = ${record.guidanceRulesVersion},
          availability_as_of = ${record.availabilityAsOf}::timestamptz
        where plan_id = ${record.planId}::uuid and revision = ${record.revision}
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

  return store;
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

function mapCheckout(row: DatabaseRow<CheckoutSessionRecord>): CheckoutSessionRecord {
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

function mapPlan(row: DatabaseRow<PlanRecord>): PlanRecord {
  return { createdAt: toIso(row.created_at), currentRevision: row.current_revision, environment: row.environment,
    id: row.id, principalScope: row.principal_scope, tenantScope: row.tenant_scope, updatedAt: toIso(row.updated_at) };
}

function mapOrder(row: DatabaseRow<OrderRecord>): OrderRecord {
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

function mapOutbox(row: DatabaseRow<OutboxEventRecord>): OutboxEventRecord {
  return {
    createdAt: toIso(row.created_at),
    id: row.id,
    orderId: row.order_id,
    payload: row.payload,
    processedAt: toIsoOrNull(row.processed_at),
    type: row.type
  };
}

function mapSupport(row: DatabaseRow<SupportCaseRecord>): SupportCaseRecord {
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
    if (process.env.NODE_TEST_CONTEXT || (
      process.env.AGENTIC_ALLOW_MEMORY_STORE === "true" && process.env.NODE_ENV !== "production"
    )) return createMemoryStore();
    throw new Error("DB_URL is required for the MCP runtime");
  }

  void keepDatabaseWarm();
  return createPostgresStore(sql);
}
