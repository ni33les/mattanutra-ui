import { createHash, timingSafeEqual, createHmac } from "node:crypto";
import type postgres from "postgres";
import { recordAdminAudit, type AdminSessionContext } from "@/lib/admin-access";
import { hasAdminPermission } from "@/lib/admin-rbac";
import { writeBpmEvent } from "@/lib/bpm";
import { queueAdminOrganisationCommunication } from "@/lib/communications";
import { getSql } from "@/lib/db";
import { markRetailOrderSettlementDue } from "@/lib/admin-retail-financials";
import {
  recordRetailCustomerOrderPickupBooked,
  repairRetailCustomerOrderAllocationIntegrityForSystem
} from "@/lib/admin-retail-stock";
import {
  bookKexPickup,
  createKexShipment,
  generateKexLabel,
  parseKexCarrierCredentials,
  syncKexTracking,
  testKexAccount,
  type KexCarrierCredentials,
  type KexOrderContext,
  type KexShipmentResult
} from "@/lib/kex-carrier-adapter";
import {
  normalizeRetailCarrier,
  retailCarrierById,
  retailCarrierDisplayName
} from "@/lib/retail-carriers";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";

type Db = postgres.Sql | postgres.TransactionSql;

export type RetailShipmentStatus =
  | "cancelled"
  | "damaged"
  | "delivered"
  | "delivery_failed"
  | "draft"
  | "exception"
  | "in_transit"
  | "label_generated"
  | "lost"
  | "out_for_delivery"
  | "picked_up"
  | "pickup_booked"
  | "returned"
  | "shipment_created";

export type CarrierEventNormalizedStatus =
  | "cancelled"
  | "damaged"
  | "delivered"
  | "delivery_failed"
  | "drop_off"
  | "exception"
  | "in_transit"
  | "label_generated"
  | "lost"
  | "out_for_delivery"
  | "picked_up"
  | "pickup_booked"
  | "returned"
  | "shipment_created"
  | "unknown";

type ShipmentRow = Readonly<{
  carrier_id: string;
  carrier_name: string;
  id: string;
  label_status?: string | null;
  label_url?: string | null;
  organisation_id: string;
  provider_shipment_id: string | null;
  retail_customer_order_id: string;
  status: RetailShipmentStatus;
  tracking_number: string | null;
  tracking_url: string | null;
}>;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const trimmed = cleanText(value);

  return trimmed || null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonValue(value: unknown): postgres.JSONValue {
  const serialized = JSON.stringify(value ?? {});

  return JSON.parse(serialized === undefined ? "{}" : serialized) as postgres.JSONValue;
}

function isoOrNull(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function platformOrganisationId(sql: Db) {
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where organisation_type = 'platform'
      and status = 'active'
    order by case when slug = 'mattanutra' then 0 else 1 end, created_at
    limit 1
  `;

  if (!rows[0]?.id) {
    throw new Error("Platform organisation is required for carrier events");
  }

  return rows[0].id;
}

async function shipmentTablesAvailable(sql: Db) {
  const rows = await sql<Array<{ ready: boolean }>>`
    select
      to_regclass('public.retail_order_shipments') is not null
      and to_regclass('public.retail_order_shipment_events') is not null
      as ready
  `;

  return rows[0]?.ready === true;
}

function assertShipmentPermission(
  context: AdminSessionContext,
  permission: "shipments.configure" | "shipments.read" | "shipments.write"
) {
  if (!hasAdminPermission(context, permission)) {
    throw new Error(`${permission} permission is required`);
  }
}

function contextCanAccessOrganisation(context: AdminSessionContext, organisationId: string) {
  return context.effectiveOrganisation.type === "platform" ||
    context.effectiveOrganisation.id === organisationId;
}

function targetCarrierOrganisationId(
  context: AdminSessionContext,
  organisationId: string | null | undefined
) {
  const targetOrganisationId = organisationId?.trim() || context.effectiveOrganisation.id;

  if (!contextCanAccessOrganisation(context, targetOrganisationId)) {
    throw new Error("Organisation not found");
  }

  return targetOrganisationId;
}

function carrierCapabilitiesFromInput(
  carrierId: string,
  capabilities: readonly string[] | null | undefined
) {
  const allowed = new Set(retailCarrierById(carrierId)?.capabilities ?? []);
  const requested = Array.isArray(capabilities)
    ? capabilities
        .map((capability) => cleanText(capability))
        .filter((capability) => capability && (!allowed.size || allowed.has(capability as never)))
    : [];

  return requested.length > 0 ? [...new Set(requested)] : [...allowed];
}

async function orderForShipment(
  sql: Db,
  context: AdminSessionContext,
  orderId: string
) {
  const rows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    order_number: string;
    organisation_id: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, order_number, status, due_at
    from public.retail_customer_orders
    where id = ${orderId}::uuid
    limit 1
  `;
  const order = rows[0];

  if (!order || !contextCanAccessOrganisation(context, order.organisation_id)) {
    throw new Error("Customer order not found");
  }

  return order;
}

function carrierFromInput(carrierId: string | null, carrierName: string | null) {
  const carrier =
    retailCarrierById(carrierId ?? "") ??
    normalizeRetailCarrier(carrierName ?? "") ??
    normalizeRetailCarrier(carrierId ?? "");

  return {
    id: carrier?.id ?? "custom",
    name: carrier?.displayName ?? (cleanText(carrierName) || "Custom carrier")
  };
}

async function activeCarrierAccountForOrganisation(
  sql: Db,
  input: Readonly<{
    carrierAccountId?: string | null;
    carrierId: string;
    organisationId: string;
  }>
) {
  const rows = await sql<Array<{
    capabilities: string[];
    carrier_id: string;
    credential_metadata: Record<string, unknown>;
    encrypted_credentials: Record<string, unknown>;
    id: string;
    organisation_id: string;
    status: string;
  }>>`
    select
      id::text,
      organisation_id::text,
      carrier_id,
      status,
      capabilities,
      credential_metadata,
      encrypted_credentials
    from public.retail_carrier_accounts
    where organisation_id = ${input.organisationId}::uuid
      and carrier_id = ${input.carrierId}
      and status = 'active'
      and (
        ${input.carrierAccountId?.trim() || ""} = ''
        or id = nullif(${input.carrierAccountId?.trim() || ""}, '')::uuid
      )
    order by updated_at desc
    limit 1
  `;

  return rows[0] ?? null;
}

function credentialsForCarrierAccount(account: Readonly<{
  credential_metadata: Record<string, unknown>;
  encrypted_credentials: Record<string, unknown>;
}>): KexCarrierCredentials {
  return parseKexCarrierCredentials({
    ...objectValue(account.credential_metadata),
    ...objectValue(account.encrypted_credentials)
  });
}

function addressFromMetadata(value: unknown) {
  const address = objectValue(value);

  if (Object.keys(address).length === 0) {
    return null;
  }

  return {
    addressLine1: optionalText(address.addressLine1),
    addressLine2: optionalText(address.addressLine2),
    city: optionalText(address.city),
    country: optionalText(address.country),
    customerEmail: optionalText(address.customerEmail),
    customerName: optionalText(address.customerName),
    notes: optionalText(address.notes),
    phone: optionalText(address.phone),
    postalCode: optionalText(address.postalCode),
    province: optionalText(address.province)
  };
}

async function kexOrderContext(
  sql: Db,
  input: Readonly<{
    orderId: string;
    shipmentId?: string | null;
  }>
): Promise<KexOrderContext> {
  const orderRows = await sql<Array<{
    currency: string;
    customer_email: string | null;
    customer_name: string | null;
    id: string;
    metadata: Record<string, unknown>;
    order_number: string;
    organisation_id: string;
    total_retail_amount: number | string | null;
  }>>`
    select
      id::text,
      organisation_id::text,
      order_number,
      customer_name,
      customer_email,
      currency,
      total_retail_amount,
      metadata
    from public.retail_customer_orders
    where id = ${input.orderId}::uuid
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const lineRows = await sql<Array<{
    brand_name: string | null;
    ean13: string | null;
    manufacturer_sku: string | null;
    product_id: string;
    product_title: string;
    quantity_ordered: number | string;
  }>>`
    select
      retail_customer_order_lines.product_id::text,
      retail_customer_order_lines.product_title,
      retail_customer_order_lines.quantity_ordered,
      products.brand_name,
      manufacturer_identifiers.identifier_value as manufacturer_sku,
      ean_identifiers.identifier_value as ean13
    from public.retail_customer_order_lines
    left join public.products
      on products.id = retail_customer_order_lines.product_id
    left join public.product_identifiers manufacturer_identifiers
      on manufacturer_identifiers.product_id = retail_customer_order_lines.product_id
     and manufacturer_identifiers.identifier_type = 'manufacturer_sku'
    left join public.product_identifiers ean_identifiers
      on ean_identifiers.product_id = retail_customer_order_lines.product_id
     and ean_identifiers.identifier_type = 'ean13'
    where retail_customer_order_lines.customer_order_id = ${order.id}::uuid
    order by products.brand_name nulls last, retail_customer_order_lines.product_title
  `;
  const metadata = objectValue(order.metadata);
  const billingSameAsShipping = metadata.billingSameAsShipping !== false;
  const deliveryAddress =
    addressFromMetadata(metadata.shippingAddress) ??
    (billingSameAsShipping ? addressFromMetadata(metadata.billingAddress) : null);

  return {
    currency: order.currency,
    customerEmail: order.customer_email,
    customerName: order.customer_name,
    deliveryAddress,
    lines: lineRows.map((line) => ({
      brandName: line.brand_name,
      ean13: line.ean13,
      manufacturerSku: line.manufacturer_sku,
      productId: line.product_id,
      productTitle: line.product_title,
      quantity: Math.max(0, Math.round(Number(line.quantity_ordered) || 0))
    })),
    orderId: order.id,
    orderNumber: order.order_number,
    retailerOrganisationId: order.organisation_id,
    shipmentId: input.shipmentId ?? null,
    totalAmount: order.total_retail_amount === null
      ? null
      : Number(order.total_retail_amount)
  };
}

function shipmentSnapshot(input: Readonly<{
  carrierId: string;
  carrierName: string;
  exceptionCode?: string | null;
  exceptionMessage?: string | null;
  labelContentBase64?: string | null;
  labelContentType?: string | null;
  labelStatus?: string | null;
  labelUrl?: string | null;
  pickupBookedAt?: string | null;
  pickupProviderStatus?: string | null;
  pickupWindowEnd?: string | null;
  pickupWindowStart?: string | null;
  shipmentNotes?: string | null;
  shippedAt?: string | null;
  status?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}>) {
  const hasPickupDetails = Boolean(
    input.pickupBookedAt ||
      input.pickupProviderStatus ||
      input.pickupWindowEnd ||
      input.pickupWindowStart
  );

  return {
    carrierId: input.carrierId,
    carrierName: input.carrierName,
    exceptionCode: input.exceptionCode ?? null,
    exceptionMessage: input.exceptionMessage ?? null,
    labelContentBase64: input.labelContentBase64 ?? null,
    labelContentType: input.labelContentType ?? null,
    labelStatus: input.labelStatus ?? null,
    labelUrl: input.labelUrl ?? null,
    pickup: hasPickupDetails
      ? {
          bookedAt: input.pickupBookedAt ?? null,
          providerStatus: input.pickupProviderStatus ?? null,
          windowEnd: input.pickupWindowEnd ?? null,
          windowStart: input.pickupWindowStart ?? null
        }
      : null,
    pickupBookedAt: input.pickupBookedAt ?? null,
    pickupProviderStatus: input.pickupProviderStatus ?? null,
    pickupWindowEnd: input.pickupWindowEnd ?? null,
    pickupWindowStart: input.pickupWindowStart ?? null,
    shipmentNotes: input.shipmentNotes ?? null,
    shippedAt: input.shippedAt ?? null,
    status: input.status ?? null,
    trackingNumber: input.trackingNumber ?? null,
    trackingUrl: input.trackingUrl ?? null
  };
}

async function writeCarrierBpm(input: Readonly<{
  eventName: string;
  eventStatus: string;
  metadata?: Record<string, unknown>;
  orderId?: string | null;
  organisationId: string;
  severity?: "high" | "low" | "medium";
  shipmentId?: string | null;
}>) {
  await writeBpmEvent({
    actorType: "system",
    emittedBy: "retail_carrier_shipments",
    eventName: input.eventName,
    eventStatus: input.eventStatus,
    eventType: "fulfillment",
    properties: {
      ...(input.metadata ?? {}),
      organisationId: input.organisationId,
      orderId: input.orderId ?? null,
      shipmentId: input.shipmentId ?? null
    },
    severity: input.severity ?? "low"
  });
}

async function queueCarrierTask(input: Readonly<{
  idempotencyKey: string;
  organisationId: string;
  payload: Record<string, unknown>;
  priorityReason: string;
  requiredCapabilities: readonly string[];
  shipmentId: string | null;
  sourceEntityId: string;
  sourceEntityType?: string;
  taskType:
    | "carrier_event_process"
    | "carrier_label_generate"
    | "carrier_pickup_book"
    | "carrier_shipment_create"
    | "carrier_tracking_sync";
  title: string;
}>) {
  return createTask({
    actorType: "system",
    businessValue: 420,
    description: input.priorityReason,
    groupLabel: "Carrier integration",
    idempotencyKey: input.idempotencyKey,
    idempotencyScope: "successful",
    idempotencyScopeKey: input.idempotencyKey,
    maxAttempts: 3,
    organisationId: input.organisationId,
    payload: input.payload,
    priorityReason: input.priorityReason,
    priorityScore: 420,
    reasoningEffort: "none",
    requiredCapabilities: [...input.requiredCapabilities],
    sourceEntityId: input.sourceEntityId,
    sourceEntityType:
      input.sourceEntityType ??
      (input.shipmentId ? "retail_order_shipment" : "retail_customer_order"),
    taskType: input.taskType,
    title: input.title
  });
}

async function syncOrderShipmentMetadata(
  sql: Db,
  input: Readonly<{ orderId: string; shipmentId: string }>
) {
  const rows = await sql<Array<{
    carrier_id: string;
    carrier_name: string;
    exception_code: string | null;
    exception_message: string | null;
    label_metadata: Record<string, unknown>;
    label_status: string;
    label_url: string | null;
    pickup_booked_at: Date | string | null;
    pickup_provider_status: string | null;
    pickup_window_end: Date | string | null;
    pickup_window_start: Date | string | null;
    status: string;
    tracking_number: string | null;
    tracking_url: string | null;
  }>>`
    select
      carrier_id,
      carrier_name,
      exception_code,
      exception_message,
      label_metadata,
      label_status,
      label_url,
      pickup_booked_at,
      pickup_provider_status,
      pickup_window_end,
      pickup_window_start,
      status,
      tracking_number,
      tracking_url
    from public.retail_order_shipments
    where id = ${input.shipmentId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return;
  }

  const shipment = shipmentSnapshot({
    carrierId: row.carrier_id,
    carrierName: row.carrier_name,
    exceptionCode: row.exception_code,
    exceptionMessage: row.exception_message,
    labelContentBase64: optionalText(objectValue(row.label_metadata).contentBase64),
    labelContentType: optionalText(objectValue(row.label_metadata).contentType),
    labelStatus: row.label_status,
    labelUrl: row.label_url,
    pickupBookedAt: isoOrNull(row.pickup_booked_at),
    pickupProviderStatus: row.pickup_provider_status,
    pickupWindowEnd: isoOrNull(row.pickup_window_end),
    pickupWindowStart: isoOrNull(row.pickup_window_start),
    status: row.status,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url
  });

  await sql`
    update public.retail_customer_orders
    set
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{shipment}',
        ${sql.json(shipment)}::jsonb,
        true
      ),
      updated_at = now()
    where id = ${input.orderId}::uuid
  `;
}

export function verifyKexWebhookSignature(input: Readonly<{
  body: string;
  signature: string | null;
}>) {
  const secret = process.env.KEX_WEBHOOK_SECRET?.trim();

  if (!secret || !input.signature) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(input.body).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(input.signature);

  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function upsertRetailCarrierAccount(
  context: AdminSessionContext,
  input: Readonly<{
    capabilities?: readonly string[] | null;
    carrierId?: string | null;
    carrierName?: string | null;
    credentialMetadata?: Record<string, unknown> | null;
    encryptedCredentials?: Record<string, unknown> | null;
    organisationId?: string | null;
    status?: "active" | "deleted" | "disabled" | null;
  }>
) {
  assertShipmentPermission(context, "shipments.configure");
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const organisationId = targetCarrierOrganisationId(context, input.organisationId);
  const carrier = carrierFromInput(input.carrierId ?? null, input.carrierName ?? null);
  const capabilities = carrierCapabilitiesFromInput(carrier.id, input.capabilities);
  const status = input.status === "disabled" || input.status === "deleted" ? input.status : "active";
  const credentialMetadata = objectValue(input.credentialMetadata ?? {});
  const encryptedCredentials = objectValue(input.encryptedCredentials ?? {});
  const rows = await sql<Array<{ id: string }>>`
    insert into public.retail_carrier_accounts (
      organisation_id,
      carrier_id,
      display_name,
      status,
      capabilities,
      credential_metadata,
      encrypted_credentials,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisationId}::uuid,
      ${carrier.id},
      ${carrier.name},
      ${status},
      ${capabilities},
      ${sql.json(jsonValue(credentialMetadata))},
      ${sql.json(jsonValue(encryptedCredentials))},
      ${sql.json({
        configuredByPersonId: context.actorPerson.id,
        source: "admin_carrier_account_configure"
      })},
      now(),
      now()
    )
    on conflict (organisation_id, carrier_id) do update set
      display_name = excluded.display_name,
      status = excluded.status,
      capabilities = excluded.capabilities,
      credential_metadata = excluded.credential_metadata,
      encrypted_credentials = excluded.encrypted_credentials,
      metadata = public.retail_carrier_accounts.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;
  const accountId = rows[0]?.id;

  if (!accountId) {
    throw new Error("Carrier account could not be saved");
  }

  await recordAdminAudit({
    action: "admin.retail_carrier_account_configured",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    metadata: {
      carrierId: carrier.id,
      capabilityCount: capabilities.length,
      hasCredentialMetadata: Object.keys(credentialMetadata).length > 0,
      hasEncryptedCredentials: Object.keys(encryptedCredentials).length > 0,
      status
    },
    organisationId,
    resourceId: accountId,
    resourceType: "retail_carrier_account"
  });
  await writeCarrierBpm({
    eventName: "retail_carrier_account_configured",
    eventStatus: status,
    metadata: {
      carrierId: carrier.id,
      capabilityCount: capabilities.length
    },
    organisationId,
    shipmentId: null
  });

  return accountId;
}

export async function testRetailCarrierAccount(
  context: AdminSessionContext,
  input: Readonly<{
    carrierAccountId?: string | null;
    carrierId?: string | null;
    organisationId?: string | null;
  }>
) {
  assertShipmentPermission(context, "shipments.configure");
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const organisationId = targetCarrierOrganisationId(context, input.organisationId);
  const carrierId = cleanText(input.carrierId);
  const accountRows = await sql<Array<{
    carrier_id: string;
    credential_metadata: Record<string, unknown>;
    encrypted_credentials: Record<string, unknown>;
    id: string;
    organisation_id: string;
    status: string;
  }>>`
    select
      id::text,
      organisation_id::text,
      carrier_id,
      status,
      credential_metadata,
      encrypted_credentials
    from public.retail_carrier_accounts
    where (
        ${cleanText(input.carrierAccountId)} = ''
        or id = nullif(${cleanText(input.carrierAccountId)}, '')::uuid
      )
      and (
        ${carrierId} = ''
        or carrier_id = ${carrierId}
      )
      and organisation_id = ${organisationId}::uuid
    order by updated_at desc
    limit 1
  `;
  const account = accountRows[0];

  if (!account || !contextCanAccessOrganisation(context, account.organisation_id)) {
    throw new Error("Carrier account not found");
  }

  const testResult = account.carrier_id === "kex_th"
    ? await testKexAccount(credentialsForCarrierAccount(account))
    : {
        reason: "manual_carrier",
        status: account.status === "active" ? "passed" : "failed"
      } as const;
  const status = account.status === "active" && testResult.status === "passed"
    ? "passed"
    : "failed";
  const reason = account.status !== "active"
    ? "inactive_configuration"
    : testResult.reason;

  await sql`
    update public.retail_carrier_accounts
    set
      last_tested_at = now(),
      last_test_status = ${status},
      metadata = metadata || ${sql.json(jsonValue({
        adapterMetadata: testResult.metadata ?? null,
        lastTestReason: reason,
        testedByPersonId: context.actorPerson.id
      }))},
      updated_at = now()
    where id = ${account.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_carrier_account_tested",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    metadata: {
      carrierId: account.carrier_id,
      reason,
      status
    },
    organisationId: account.organisation_id,
    resourceId: account.id,
    resourceType: "retail_carrier_account"
  });
  await writeCarrierBpm({
    eventName: "retail_carrier_account_tested",
    eventStatus: status,
    metadata: {
      carrierId: account.carrier_id,
      reason
    },
    organisationId: account.organisation_id,
    shipmentId: null
  });

  return {
    accountId: account.id,
    reason,
    status
  };
}

async function shipmentByIdOrOrder(
  sql: Db,
  input: Readonly<{
    orderId?: string | null;
    shipmentId?: string | null;
  }>
) {
  const rows = await sql<ShipmentRow[]>`
    select
      id::text,
      retail_customer_order_id::text,
      organisation_id::text,
      carrier_id,
      carrier_name,
      provider_shipment_id,
      label_status,
      label_url,
      status,
      tracking_number,
      tracking_url
    from public.retail_order_shipments
    where (
        ${input.shipmentId?.trim() || ""} <> ''
        and id = nullif(${input.shipmentId?.trim() || ""}, '')::uuid
      )
      or (
        ${input.shipmentId?.trim() || ""} = ''
        and ${input.orderId?.trim() || ""} <> ''
        and retail_customer_order_id = nullif(${input.orderId?.trim() || ""}, '')::uuid
      )
    order by updated_at desc
    limit 1
  `;

  return rows[0] ?? null;
}

async function ensureKexShipmentForOrder(
  sql: Db,
  input: Readonly<{
    orderId: string;
  }>
) {
  const existing = await shipmentByIdOrOrder(sql, { orderId: input.orderId });

  if (existing) {
    return existing;
  }

  const orderRows = await sql<Array<{
    id: string;
    organisation_id: string;
  }>>`
    select id::text, organisation_id::text
    from public.retail_customer_orders
    where id = ${input.orderId}::uuid
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const carrier = retailCarrierById("kex_th");
  const rows = await sql<ShipmentRow[]>`
    insert into public.retail_order_shipments (
      retail_customer_order_id,
      organisation_id,
      carrier_id,
      carrier_name,
      status,
      metadata,
      created_by_person_id,
      created_at,
      updated_at
    )
    values (
      ${order.id}::uuid,
      ${order.organisation_id}::uuid,
      'kex_th',
      ${carrier?.displayName ?? "KEX Express (Thailand)"},
      'draft',
      ${sql.json({ source: "carrier_task_ensure_shipment" })},
      null,
      now(),
      now()
    )
    on conflict (retail_customer_order_id) do update set
      carrier_id = public.retail_order_shipments.carrier_id,
      updated_at = public.retail_order_shipments.updated_at
    returning
      id::text,
      retail_customer_order_id::text,
      organisation_id::text,
      carrier_id,
      carrier_name,
      provider_shipment_id,
      label_status,
      label_url,
      status,
      tracking_number,
      tracking_url
  `;

  return rows[0];
}

async function kexTaskRequest(
  sql: Db,
  input: Readonly<{
    orderId?: string | null;
    shipmentId?: string | null;
    taskId: string;
  }>
) {
  const shipment = input.shipmentId
    ? await shipmentByIdOrOrder(sql, { shipmentId: input.shipmentId })
    : input.orderId
      ? await ensureKexShipmentForOrder(sql, { orderId: input.orderId })
      : null;

  if (!shipment) {
    throw new Error("KEX shipment task is missing a shipment or order");
  }

  if (shipment.carrier_id !== "kex_th") {
    throw new Error("Carrier task is not for KEX");
  }

  const account = await activeCarrierAccountForOrganisation(sql, {
    carrierId: "kex_th",
    organisationId: shipment.organisation_id
  });

  if (!account) {
    throw new Error("Active KEX carrier account is not configured");
  }

  const credentials = credentialsForCarrierAccount(account);
  const order = await kexOrderContext(sql, {
    orderId: shipment.retail_customer_order_id,
    shipmentId: shipment.id
  });

  return {
    credentials,
    order,
    request: {
      credentials,
      idempotencyKey: `kex:${input.taskId}:${shipment.id}`,
      order,
      shipment: {
        labelUrl: shipment.label_url ?? null,
        providerShipmentId: shipment.provider_shipment_id,
        status: shipment.status,
        trackingNumber: shipment.tracking_number,
        trackingUrl: shipment.tracking_url
      }
    },
    shipment
  };
}

async function updateShipmentFromKexResult(
  sql: Db,
  input: Readonly<{
    eventName: string;
    labelRequested?: boolean;
    operation: "label" | "pickup" | "shipment" | "tracking";
    result: KexShipmentResult;
    shipment: ShipmentRow;
    taskId: string;
  }>
) {
  const result = input.result;
  const labelStatus =
    input.operation === "label"
      ? result.labelUrl || result.labelContentBase64
        ? "generated"
        : "failed"
      : input.labelRequested
        ? "requested"
        : input.shipment.label_status ?? "not_requested";
  const nextStatus =
    input.operation === "pickup"
      ? "pickup_booked"
      : input.operation === "label" && labelStatus === "generated"
        ? "label_generated"
        : input.operation === "shipment"
          ? "shipment_created"
          : (result.status as RetailShipmentStatus | null) ??
            input.shipment.status;
  const rows = await sql<ShipmentRow[]>`
    update public.retail_order_shipments
    set
      provider_shipment_id = coalesce(${result.providerShipmentId ?? null}, provider_shipment_id),
      provider_pickup_request_id = coalesce(${result.pickupRequestId ?? null}, provider_pickup_request_id),
      tracking_number = coalesce(${result.trackingNumber ?? null}, tracking_number),
      tracking_url = coalesce(${result.trackingUrl ?? null}, tracking_url),
      status = case
        when ${nextStatus} in (
          'draft',
          'shipment_created',
          'label_generated',
          'pickup_booked',
          'picked_up',
          'in_transit',
          'out_for_delivery',
          'delivered',
          'delivery_failed',
          'returned',
          'lost',
          'damaged',
          'cancelled',
          'exception'
        ) then ${nextStatus}
        else status
      end,
      label_status = case
        when ${input.operation} = 'label' then ${labelStatus}
        when ${input.labelRequested ?? false} then 'requested'
        else label_status
      end,
      label_url = coalesce(${result.labelUrl ?? null}, label_url),
      label_metadata = label_metadata || ${sql.json(jsonValue({
        contentBase64: result.labelContentBase64 ?? null,
        contentType: result.labelContentType ?? null,
        generatedByTaskId: input.operation === "label" ? input.taskId : null,
        kexMetadata: result.metadata ?? null,
        source: `kex_${input.operation}`
      }))},
      pickup_booked_at = case
        when ${input.operation} = 'pickup' then coalesce(pickup_booked_at, now())
        else pickup_booked_at
      end,
      pickup_window_start = coalesce(${isoOrNull(result.pickupWindowStart)}::timestamptz, pickup_window_start),
      pickup_window_end = coalesce(${isoOrNull(result.pickupWindowEnd)}::timestamptz, pickup_window_end),
      pickup_provider_status = case
        when ${input.operation} = 'pickup' then coalesce(${result.status ?? "booked"}, pickup_provider_status, 'booked')
        else pickup_provider_status
      end,
      metadata = metadata || ${sql.json({
        lastCarrierTaskId: input.taskId,
        lastKexOperation: input.operation,
        lastKexOperationAt: new Date().toISOString()
      })},
      updated_at = now()
    where id = ${input.shipment.id}::uuid
    returning
      id::text,
      retail_customer_order_id::text,
      organisation_id::text,
      carrier_id,
      carrier_name,
      provider_shipment_id,
      label_status,
      label_url,
      status,
      tracking_number,
      tracking_url
  `;
  const shipment = rows[0] ?? input.shipment;

  await syncOrderShipmentMetadata(sql, {
    orderId: shipment.retail_customer_order_id,
    shipmentId: shipment.id
  });
  await recordAdminAudit({
    action: `admin.${input.eventName}`,
    actorPersonId: null,
    metadata: {
      carrierId: "kex_th",
      operation: input.operation,
      taskId: input.taskId
    },
    organisationId: shipment.organisation_id,
    resourceId: shipment.id,
    resourceType: "retail_order_shipment"
  });
  await writeCarrierBpm({
    eventName: input.eventName,
    eventStatus: input.operation,
    metadata: {
      carrierId: "kex_th",
      taskId: input.taskId
    },
    orderId: shipment.retail_customer_order_id,
    organisationId: shipment.organisation_id,
    shipmentId: shipment.id
  });

  if (input.operation === "pickup") {
    await queueAdminOrganisationCommunication({
      eventKey: "retail_order_pickup_booked",
      metadata: {
        carrierId: "kex_th",
        pickupWindowEnd: result.pickupWindowEnd ?? null,
        pickupWindowStart: result.pickupWindowStart ?? null,
        source: "carrier_pickup_booking"
      },
      organisationId: shipment.organisation_id,
      resourceId: shipment.retail_customer_order_id,
      resourceType: "retail_customer_order"
    });
  }

  return shipment;
}

export async function createRetailOrderShipment(
  context: AdminSessionContext,
  input: Readonly<{
    carrierAccountId?: string | null;
    carrierId?: string | null;
    carrierName?: string | null;
    customerOrderId: string;
    providerShipmentId?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
  }>
) {
  assertShipmentPermission(context, "shipments.write");
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const order = await orderForShipment(sql, context, input.customerOrderId.trim());
  const carrier = carrierFromInput(input.carrierId ?? null, input.carrierName ?? null);
  const carrierAccount =
    carrier.id === "kex_th"
      ? await activeCarrierAccountForOrganisation(sql, {
          carrierAccountId: input.carrierAccountId ?? null,
          carrierId: "kex_th",
          organisationId: order.organisation_id
        })
      : null;
  const carrierAccountId = (carrierAccount?.id ?? input.carrierAccountId?.trim()) || null;
  const rows = await sql<ShipmentRow[]>`
    insert into public.retail_order_shipments (
      retail_customer_order_id,
      organisation_id,
      carrier_account_id,
      carrier_id,
      carrier_name,
      provider_shipment_id,
      tracking_number,
      tracking_url,
      status,
      metadata,
      created_by_person_id,
      created_at,
      updated_at
    )
    values (
      ${order.id}::uuid,
      ${order.organisation_id}::uuid,
      ${carrierAccountId}::uuid,
      ${carrier.id},
      ${carrier.name},
      ${input.providerShipmentId?.trim() || null},
      ${input.trackingNumber?.trim() || null},
      ${input.trackingUrl?.trim() || null},
      'shipment_created',
      ${sql.json({ source: "admin_carrier_shipment_create" })},
      ${context.actorPerson.id}::uuid,
      now(),
      now()
    )
    on conflict (retail_customer_order_id) do update set
      carrier_account_id = coalesce(excluded.carrier_account_id, public.retail_order_shipments.carrier_account_id),
      carrier_id = excluded.carrier_id,
      carrier_name = excluded.carrier_name,
      provider_shipment_id = coalesce(excluded.provider_shipment_id, public.retail_order_shipments.provider_shipment_id),
      tracking_number = coalesce(excluded.tracking_number, public.retail_order_shipments.tracking_number),
      tracking_url = coalesce(excluded.tracking_url, public.retail_order_shipments.tracking_url),
      status = case
        when public.retail_order_shipments.status = 'draft' then 'shipment_created'
        else public.retail_order_shipments.status
      end,
      updated_at = now()
    returning
      id::text,
      retail_customer_order_id::text,
      organisation_id::text,
      carrier_id,
      carrier_name,
      provider_shipment_id,
      label_status,
      label_url,
      status,
      tracking_number,
      tracking_url
  `;
  const shipment = rows[0];

  await sql`
    update public.retail_customer_orders
    set
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{shipment}',
        ${sql.json(shipmentSnapshot({
          carrierId: shipment.carrier_id,
          carrierName: shipment.carrier_name,
          status: shipment.status,
          trackingNumber: shipment.tracking_number,
          trackingUrl: shipment.tracking_url
        }))}::jsonb,
        true
      ),
      updated_at = now()
    where id = ${order.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_order_shipment_created",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    metadata: {
      carrierId: shipment.carrier_id,
      hasTrackingUrl: Boolean(shipment.tracking_url),
      providerShipmentId: shipment.provider_shipment_id
    },
    organisationId: order.organisation_id,
    resourceId: shipment.id,
    resourceType: "retail_order_shipment"
  });
  await writeCarrierBpm({
    eventName: "retail_order_shipment_created",
    eventStatus: "shipment_created",
      metadata: { carrierId: shipment.carrier_id },
    orderId: order.id,
    organisationId: order.organisation_id,
    shipmentId: shipment.id
  });

  if (shipment.carrier_id === "kex_th") {
    await queueCarrierTask({
      idempotencyKey: `kex-shipment-create:${shipment.id}`,
      organisationId: order.organisation_id,
      payload: {
        carrierId: "kex_th",
        orderId: order.id,
        shipmentId: shipment.id
      },
      priorityReason: "Create KEX shipment and AWB.",
      requiredCapabilities: [AGENT_CAPABILITIES.carrierShipmentCreate],
      shipmentId: shipment.id,
      sourceEntityId: shipment.id,
      sourceEntityType: "retail_order_shipment",
      taskType: "carrier_shipment_create",
      title: "Create KEX shipment"
    });
  }

  return shipment.id;
}

export async function generateRetailOrderShippingLabel(
  context: AdminSessionContext,
  input: Readonly<{
    carrierId?: string | null;
    carrierName?: string | null;
    customerOrderId: string;
    labelUrl?: string | null;
  }>
) {
  assertShipmentPermission(context, "shipments.write");
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const shipmentId = await createRetailOrderShipment(context, input);
  const carrier = carrierFromInput(input.carrierId ?? null, input.carrierName ?? null);
  const carrierDefinition = retailCarrierById(carrier.id);
  const labelUrl = input.labelUrl?.trim() || null;
  const labelStatus = labelUrl
    ? "generated"
    : carrier.id === "kex_th"
      ? "requested"
      : carrierDefinition?.requiresOfficialLabel
        ? "manual_required"
        : "generated";

  await sql`
    update public.retail_order_shipments
    set
      label_status = ${labelStatus},
      label_url = ${labelUrl},
      label_metadata = label_metadata || ${sql.json({
        generatedByPersonId: context.actorPerson.id,
        manualRequired: labelStatus === "manual_required",
        usesQrCode: carrierDefinition?.usesQrCode ?? false
      })},
      status = case when status = 'shipment_created' then 'label_generated' else status end,
      updated_at = now()
    where id = ${shipmentId}::uuid
  `;

  await writeCarrierBpm({
    eventName: "retail_order_shipping_label_generated",
    eventStatus: labelStatus,
    metadata: {
      carrierId: carrier.id,
      officialLabelAvailable: Boolean(labelUrl)
    },
    orderId: input.customerOrderId,
    organisationId: context.effectiveOrganisation.id,
    shipmentId
  });

  if (carrier.id === "kex_th") {
    const queuedShipment = await shipmentByIdOrOrder(sql, { shipmentId });

    await queueCarrierTask({
      idempotencyKey: `kex-label-generate:${shipmentId}`,
      organisationId: queuedShipment?.organisation_id ?? context.effectiveOrganisation.id,
      payload: {
        carrierId: "kex_th",
        orderId: input.customerOrderId,
        shipmentId
      },
      priorityReason: "Generate official KEX shipping label.",
      requiredCapabilities: [AGENT_CAPABILITIES.carrierLabelGenerate],
      shipmentId,
      sourceEntityId: shipmentId,
      sourceEntityType: "retail_order_shipment",
      taskType: "carrier_label_generate",
      title: "Generate KEX shipping label"
    });
  }

  return shipmentId;
}

export async function bookRetailOrderPickup(
  context: AdminSessionContext,
  input: Readonly<{
    carrierId?: string | null;
    carrierName?: string | null;
    customerOrderId: string;
    pickupProviderStatus?: string | null;
    pickupRequestId?: string | null;
    pickupWindowEnd?: string | null;
    pickupWindowStart?: string | null;
    shipmentNotes?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
  }>
) {
  assertShipmentPermission(context, "shipments.write");
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const order = await orderForShipment(sql, context, input.customerOrderId.trim());

  if (order.status !== "packed") {
    throw new Error("Order must be packed before pickup can be booked");
  }

  const shipmentId = await createRetailOrderShipment(context, {
    ...input,
    trackingNumber: input.trackingNumber ?? null,
    trackingUrl: input.trackingUrl ?? null
  });
  const carrier = carrierFromInput(input.carrierId ?? null, input.carrierName ?? null);

  if (carrier.id === "kex_th") {
    await sql`
      update public.retail_order_shipments
      set
        pickup_provider_status = coalesce(pickup_provider_status, 'requested'),
        metadata = metadata || ${sql.json({
          pickupRequestedByPersonId: context.actorPerson.id,
          requestedShipmentNotes: input.shipmentNotes?.trim() || null,
          source: "admin_pickup_booking_request"
        })},
        updated_at = now()
      where id = ${shipmentId}::uuid
    `;
    await syncOrderShipmentMetadata(sql, {
      orderId: order.id,
      shipmentId
    });
    await queueCarrierTask({
      idempotencyKey: `kex-pickup-book:${shipmentId}`,
      organisationId: order.organisation_id,
      payload: {
        carrierId: "kex_th",
        orderId: order.id,
        shipmentId
      },
      priorityReason: "Book KEX courier pickup.",
      requiredCapabilities: [AGENT_CAPABILITIES.carrierPickupBook],
      shipmentId,
      sourceEntityId: shipmentId,
      sourceEntityType: "retail_order_shipment",
      taskType: "carrier_pickup_book",
      title: "Book KEX pickup"
    });
    await recordAdminAudit({
      action: "admin.retail_order_pickup_requested",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      metadata: {
        carrierId: "kex_th"
      },
      organisationId: order.organisation_id,
      resourceId: shipmentId,
      resourceType: "retail_order_shipment"
    });
    await writeCarrierBpm({
      eventName: "retail_order_pickup_requested",
      eventStatus: "queued",
      metadata: {
        carrierId: "kex_th"
      },
      orderId: order.id,
      organisationId: order.organisation_id,
      shipmentId
    });
    await recordRetailCustomerOrderPickupBooked(context, {
      customerOrderId: order.id,
      pickupProviderStatus: "requested",
      shipmentId
    });

    return shipmentId;
  }

  const pickupBookedAt = new Date().toISOString();
  const rows = await sql<ShipmentRow[]>`
    update public.retail_order_shipments
    set
      provider_pickup_request_id = coalesce(${input.pickupRequestId?.trim() || null}, provider_pickup_request_id),
      pickup_booked_at = coalesce(pickup_booked_at, now()),
      pickup_window_start = ${isoOrNull(input.pickupWindowStart)}::timestamptz,
      pickup_window_end = ${isoOrNull(input.pickupWindowEnd)}::timestamptz,
      pickup_provider_status = coalesce(${input.pickupProviderStatus?.trim() || null}, 'booked'),
      status = 'pickup_booked',
      metadata = metadata || ${sql.json({
        bookedByPersonId: context.actorPerson.id,
        source: "admin_pickup_booking"
      })},
      updated_at = now()
    where id = ${shipmentId}::uuid
    returning
      id::text,
      retail_customer_order_id::text,
      organisation_id::text,
      carrier_id,
      carrier_name,
      provider_shipment_id,
      status,
      tracking_number,
      tracking_url
  `;
  const shipment = rows[0];

  await sql`
    update public.retail_customer_orders
    set
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{shipment}',
        ${sql.json(shipmentSnapshot({
          carrierId: shipment.carrier_id,
          carrierName: shipment.carrier_name,
          pickupBookedAt,
          pickupProviderStatus: input.pickupProviderStatus?.trim() || "booked",
          pickupWindowEnd: isoOrNull(input.pickupWindowEnd),
          pickupWindowStart: isoOrNull(input.pickupWindowStart),
          shipmentNotes: input.shipmentNotes?.trim() || null,
          status: shipment.status,
          trackingNumber: shipment.tracking_number,
          trackingUrl: shipment.tracking_url
        }))}::jsonb,
        true
      ),
      updated_at = now()
    where id = ${order.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_order_pickup_booked",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    metadata: {
      carrierId: shipment.carrier_id,
      pickupProviderStatus: input.pickupProviderStatus?.trim() || "booked",
      pickupRequestId: input.pickupRequestId?.trim() || null
    },
    organisationId: order.organisation_id,
    resourceId: shipment.id,
    resourceType: "retail_order_shipment"
  });
  await writeCarrierBpm({
    eventName: "retail_order_pickup_booked",
    eventStatus: "pickup_booked",
    metadata: {
      carrierId: shipment.carrier_id,
      pickupWindowEnd: isoOrNull(input.pickupWindowEnd),
      pickupWindowStart: isoOrNull(input.pickupWindowStart)
    },
    orderId: order.id,
    organisationId: order.organisation_id,
    shipmentId: shipment.id
  });
  await queueAdminOrganisationCommunication({
    eventKey: "retail_order_pickup_booked",
    metadata: {
      carrierId: shipment.carrier_id,
      pickupWindowEnd: isoOrNull(input.pickupWindowEnd),
      pickupWindowStart: isoOrNull(input.pickupWindowStart),
      source: "carrier_pickup_booking"
    },
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order"
  });
  await recordRetailCustomerOrderPickupBooked(context, {
    customerOrderId: order.id,
    pickupProviderStatus: input.pickupProviderStatus?.trim() || "booked",
    shipmentId: shipment.id
  });

  return shipment.id;
}

export async function syncRetailOrderTracking(
  context: AdminSessionContext,
  input: Readonly<{
    customerOrderId?: string | null;
    shipmentId?: string | null;
  }>
) {
  assertShipmentPermission(context, "shipments.write");
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const shipment = await shipmentByIdOrOrder(sql, {
    orderId: input.customerOrderId ?? null,
    shipmentId: input.shipmentId ?? null
  });

  if (!shipment || !contextCanAccessOrganisation(context, shipment.organisation_id)) {
    throw new Error("Shipment not found");
  }

  if (shipment.carrier_id !== "kex_th") {
    return {
      queued: false,
      reason: "manual_carrier"
    };
  }

  await queueCarrierTask({
    idempotencyKey: `kex-tracking-sync:${shipment.id}`,
    organisationId: shipment.organisation_id,
    payload: {
      carrierId: "kex_th",
      orderId: shipment.retail_customer_order_id,
      shipmentId: shipment.id
    },
    priorityReason: "Synchronize KEX tracking state.",
    requiredCapabilities: [AGENT_CAPABILITIES.carrierTrackingSync],
    shipmentId: shipment.id,
    sourceEntityId: shipment.id,
    sourceEntityType: "retail_order_shipment",
    taskType: "carrier_tracking_sync",
    title: "Sync KEX tracking"
  });

  await recordAdminAudit({
    action: "admin.retail_order_tracking_sync_queued",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    metadata: {
      carrierId: "kex_th"
    },
    organisationId: shipment.organisation_id,
    resourceId: shipment.id,
    resourceType: "retail_order_shipment"
  });
  await writeCarrierBpm({
    eventName: "retail_order_tracking_sync_queued",
    eventStatus: "queued",
    metadata: {
      carrierId: "kex_th"
    },
    orderId: shipment.retail_customer_order_id,
    organisationId: shipment.organisation_id,
    shipmentId: shipment.id
  });

  return {
    queued: true,
    reason: "queued"
  };
}

export function normalizeKexShipmentStatus(input: Readonly<{
  statusCode?: string | null;
  statusText?: string | null;
}>): CarrierEventNormalizedStatus {
  const statusCode = cleanText(input.statusCode).toUpperCase();
  const statusText = cleanText(input.statusText).toLowerCase();

  if (statusCode === "POD" || statusText.includes("deliver successfully") || statusText.includes("delivered")) {
    return "delivered";
  }

  if (statusCode === "005" || statusText.includes("drop-off") || statusText.includes("drop off")) {
    return "drop_off";
  }

  if (statusCode === "010" || statusText.includes("picked-up") || statusText.includes("picked up")) {
    return "picked_up";
  }

  if (statusCode === "045" || statusText.includes("out for delivery")) {
    return "out_for_delivery";
  }

  if (statusCode.startsWith("060") || statusText.includes("unsuccessful")) {
    return "delivery_failed";
  }

  if (statusCode === "091" || statusCode === "112" || statusText.includes("return")) {
    return "returned";
  }

  if (statusCode === "113" || statusText.includes("lost")) {
    return "lost";
  }

  if (statusCode === "114" || statusText.includes("damage")) {
    return "damaged";
  }

  if (["101", "102", "103"].includes(statusCode) || statusText.includes("hub") || statusText.includes("transit")) {
    return "in_transit";
  }

  return "unknown";
}

function shipmentStatusFromEvent(status: CarrierEventNormalizedStatus): RetailShipmentStatus {
  if (status === "drop_off") {
    return "picked_up";
  }

  if (status === "unknown") {
    return "exception";
  }

  return status;
}

export async function recordKexShipmentEvent(input: Readonly<{
  rawPayload: unknown;
  providerEventId?: string | null;
  providerShipmentId?: string | null;
  providerStatusCode?: string | null;
  providerStatusText?: string | null;
  eventOccurredAt?: string | null;
}>) {
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const providerShipmentId = optionalText(input.providerShipmentId);
  const shipmentRows = providerShipmentId
    ? await sql<ShipmentRow[]>`
        select
          id::text,
          retail_customer_order_id::text,
          organisation_id::text,
          carrier_id,
          carrier_name,
          provider_shipment_id,
          status,
          tracking_number,
          tracking_url
        from public.retail_order_shipments
        where carrier_id = 'kex_th'
          and (
            provider_shipment_id = ${providerShipmentId}
            or tracking_number = ${providerShipmentId}
          )
        limit 1
      `
    : [];
  const shipment = shipmentRows[0] ?? null;
  const organisationId = shipment?.organisation_id ?? await platformOrganisationId(sql);
  const normalizedStatus = normalizeKexShipmentStatus({
    statusCode: input.providerStatusCode,
    statusText: input.providerStatusText
  });
  const dedupeSource = [
    input.providerEventId,
    providerShipmentId,
    input.providerStatusCode,
    input.providerStatusText,
    input.eventOccurredAt
  ].filter(Boolean).join(":") || JSON.stringify(input.rawPayload);
  const eventDedupeKey = createHash("sha256").update(dedupeSource).digest("hex");
  const rows = await sql<Array<{ id: string; processing_status: string }>>`
    insert into public.retail_order_shipment_events (
      shipment_id,
      retail_customer_order_id,
      organisation_id,
      carrier_id,
      provider_event_id,
      provider_shipment_id,
      provider_status_code,
      provider_status_text,
      normalized_status,
      event_dedupe_key,
      event_occurred_at,
      processing_status,
      raw_payload,
      metadata
    )
    values (
      ${shipment?.id ?? null}::uuid,
      ${shipment?.retail_customer_order_id ?? null}::uuid,
      ${organisationId}::uuid,
      'kex_th',
      ${input.providerEventId?.trim() || null},
      ${providerShipmentId},
      ${input.providerStatusCode?.trim() || null},
      ${input.providerStatusText?.trim() || null},
      ${normalizedStatus},
      ${eventDedupeKey},
      ${isoOrNull(input.eventOccurredAt)}::timestamptz,
      'queued',
      ${sql.json(jsonValue(input.rawPayload))},
      ${sql.json({ source: "kex_webhook" })}
    )
    on conflict (carrier_id, event_dedupe_key) do update set
      received_at = public.retail_order_shipment_events.received_at
    returning id::text, processing_status
  `;
  const eventId = rows[0]?.id ?? "";

  if (eventId && rows[0]?.processing_status === "queued") {
    await queueCarrierTask({
      idempotencyKey: `carrier-event-process:${eventId}`,
      organisationId,
      payload: {
        carrierId: "kex_th",
        eventId
      },
      priorityReason: "Process carrier shipment status event.",
      requiredCapabilities: [AGENT_CAPABILITIES.carrierEventProcess],
      shipmentId: shipment?.id ?? null,
      sourceEntityId: eventId,
      sourceEntityType: "retail_order_shipment_event",
      taskType: "carrier_event_process",
      title: "Process carrier shipment event"
    });
  }

  await writeCarrierBpm({
    eventName: "carrier_shipment_event_received",
    eventStatus: normalizedStatus,
    metadata: {
      carrierId: "kex_th",
      hasShipmentMatch: Boolean(shipment),
      providerStatusCode: input.providerStatusCode ?? null
    },
    orderId: shipment?.retail_customer_order_id ?? null,
    organisationId,
    shipmentId: shipment?.id ?? null
  });

  return eventId;
}

async function queuePlatformCarrierFailure(input: Readonly<{
  error: string;
  eventId: string;
  organisationId: string;
}>) {
  await queueAdminOrganisationCommunication({
    eventKey: "platform_carrier_integration_failed",
    metadata: {
      carrierId: "kex_th",
      eventId: input.eventId,
      error: input.error,
      source: "carrier_event_process"
    },
    organisationId: input.organisationId,
    resourceId: input.eventId,
    resourceType: "retail_order_shipment_event"
  });
}

async function markOrderShippedFromCarrierEvent(
  sql: Db,
  input: Readonly<{
    carrierEventId: string;
    orderId: string;
    organisationId: string;
    shipmentId: string | null;
  }>
) {
  const orderRows = await sql<Array<{ status: string }>>`
    select status
    from public.retail_customer_orders
    where id = ${input.orderId}::uuid
    limit 1
  `;
  const currentStatus = orderRows[0]?.status;

  if (!currentStatus || currentStatus === "shipped" || currentStatus === "delivered") {
    return false;
  }

  if (currentStatus !== "allocated" && currentStatus !== "picking" && currentStatus !== "packed") {
    return false;
  }

  const shippedAt = new Date().toISOString();
  const integrity = await repairRetailCustomerOrderAllocationIntegrityForSystem({
    customerOrderId: input.orderId,
    organisationId: input.organisationId,
    source: "carrier_event_ship_preflight",
    sql,
    taskId: input.carrierEventId
  });

  if (!integrity.fullyBacked) {
    throw new Error(
      "Stock changed after allocation. The order has been moved back to Awaiting Stock."
    );
  }

  const allocationRows = await sql<Array<{
    customer_order_line_id: string;
    id: string;
    product_id: string;
    quantity_allocated: number | string;
    retail_product_stock_id: string;
  }>>`
    select
      id::text,
      customer_order_line_id::text,
      retail_product_stock_id::text,
      product_id::text,
      quantity_allocated
    from public.retail_order_allocations
    where customer_order_id = ${input.orderId}::uuid
      and status in ('active', 'picked')
  `;

  for (const allocation of allocationRows) {
    const quantity = Math.max(0, Math.round(Number(allocation.quantity_allocated) || 0));

    if (quantity < 1) {
      continue;
    }

    const stockRows = await sql<Array<{
      currency: string;
      lead_time_days: number | string;
      notes: string | null;
      organisation_id: string;
      product_id: string;
      retail_price_amount: number | string | null;
      status: string;
      stock_quantity: number | string;
      wholesale_price_amount: number | string | null;
    }>>`
      update public.retail_product_stock
      set
        stock_quantity = stock_quantity - ${quantity},
        metadata = metadata || ${sql.json({
          carrierEventId: input.carrierEventId,
          shipmentId: input.shipmentId,
          updatedVia: "carrier_event"
        })},
        updated_at = now()
      where id = ${allocation.retail_product_stock_id}::uuid
        and organisation_id = ${input.organisationId}::uuid
        and stock_quantity - ${quantity} >= 0
      returning
        organisation_id::text,
        product_id::text,
        status,
        stock_quantity,
        lead_time_days,
        wholesale_price_amount,
        retail_price_amount,
        currency,
        notes
    `;
    const stock = stockRows[0];

    if (!stock) {
      throw new Error("Carrier pickup cannot ship order because stock is no longer available");
    }

    await sql`
      insert into public.retail_stock_movements (
        retail_product_stock_id,
        organisation_id,
        product_id,
        movement_type,
        quantity_delta,
        currency,
        reason,
        source,
        metadata,
        occurred_at,
        created_at
      )
      values (
        ${allocation.retail_product_stock_id}::uuid,
        ${stock.organisation_id}::uuid,
        ${stock.product_id}::uuid,
        'sale',
        ${-quantity},
        ${stock.currency},
        'Carrier pickup confirmed shipment',
        'carrier_event',
        ${sql.json({
          allocationId: allocation.id,
          carrierEventId: input.carrierEventId,
          shipmentId: input.shipmentId
        })},
        now(),
        now()
      )
    `;

    await sql`
      insert into public.retail_product_stock_snapshots (
        retail_product_stock_id,
        organisation_id,
        product_id,
        event_type,
        status,
        stock_quantity,
        lead_time_days,
        wholesale_price_amount,
        retail_price_amount,
        currency,
        notes,
        metadata,
        recorded_at
      )
      values (
        ${allocation.retail_product_stock_id}::uuid,
        ${stock.organisation_id}::uuid,
        ${stock.product_id}::uuid,
        'movement',
        ${stock.status},
        ${Math.max(0, Math.round(Number(stock.stock_quantity) || 0))},
        ${Math.max(0, Math.round(Number(stock.lead_time_days) || 0))},
        ${stock.wholesale_price_amount},
        ${stock.retail_price_amount},
        ${stock.currency},
        ${stock.notes},
        ${sql.json({
          carrierEventId: input.carrierEventId,
          movementType: "sale",
          quantityDelta: -quantity,
          source: "carrier_event"
        })},
        now()
      )
    `;

    await sql`
      update public.retail_customer_order_lines
      set
        quantity_shipped = least(quantity_ordered, quantity_shipped + ${quantity}),
        updated_at = now()
      where id = ${allocation.customer_order_line_id}::uuid
    `;

    await sql`
      update public.retail_order_allocations
      set status = 'shipped', updated_at = now()
      where id = ${allocation.id}::uuid
    `;
  }

  await sql`
    update public.retail_customer_orders
    set
      status = 'shipped',
      shipped_at = coalesce(shipped_at, ${shippedAt}::timestamptz),
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{shipment,shippedAt}',
        to_jsonb(${shippedAt}::text),
        true
      ),
      updated_at = now()
    where id = ${input.orderId}::uuid
      and status in ('allocated', 'picking', 'packed')
  `;

  await markRetailOrderSettlementDue(sql, {
    actorPersonId: null,
    orderId: input.orderId
  });
  const { sendRetailOrderWorkflowEmail } = await import("@/lib/retail-order-workflow");

  await sendRetailOrderWorkflowEmail({
    event: "shipped",
    locale: "en",
    orderId: input.orderId,
    sql
  });
  await queueAdminOrganisationCommunication({
    eventKey: "retail_order_shipped",
    metadata: {
      carrierEventId: input.carrierEventId,
      source: "carrier_event_process"
    },
    organisationId: input.organisationId,
    resourceId: input.orderId,
    resourceType: "retail_customer_order"
  });
  await writeCarrierBpm({
    eventName: "retail_order_shipped",
    eventStatus: "shipped",
    metadata: {
      carrierEventId: input.carrierEventId,
      source: "carrier_event_process"
    },
    orderId: input.orderId,
    organisationId: input.organisationId,
    shipmentId: input.shipmentId
  });

  return true;
}

export async function processCarrierShipmentEvent(input: Readonly<{
  eventId: string;
  taskId?: string | null;
}>) {
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const rows = await sql<Array<{
    id: string;
    normalized_status: CarrierEventNormalizedStatus;
    organisation_id: string;
    provider_status_code: string | null;
    provider_status_text: string | null;
    retail_customer_order_id: string | null;
    shipment_id: string | null;
  }>>`
    select
      id::text,
      shipment_id::text,
      retail_customer_order_id::text,
      organisation_id::text,
      normalized_status,
      provider_status_code,
      provider_status_text
    from public.retail_order_shipment_events
    where id = ${input.eventId}::uuid
    limit 1
  `;
  const event = rows[0];

  if (!event) {
    throw new Error("Carrier shipment event not found");
  }

  try {
    const nextShipmentStatus = shipmentStatusFromEvent(event.normalized_status);

    if (event.shipment_id) {
      await sql`
        update public.retail_order_shipments
        set
          status = ${nextShipmentStatus},
          pickup_provider_status = case
            when ${event.normalized_status} in ('picked_up', 'drop_off') then ${event.provider_status_text ?? event.provider_status_code ?? "picked_up"}
            else pickup_provider_status
          end,
          exception_code = case
            when ${event.normalized_status} in ('delivery_failed', 'returned', 'lost', 'damaged', 'exception', 'unknown') then ${event.provider_status_code}
            else exception_code
          end,
          exception_message = case
            when ${event.normalized_status} in ('delivery_failed', 'returned', 'lost', 'damaged', 'exception', 'unknown') then ${event.provider_status_text}
            else exception_message
          end,
          metadata = metadata || ${sql.json({
            lastCarrierEventId: event.id,
            lastCarrierStatus: event.normalized_status,
            processedByTaskId: input.taskId ?? null
          })},
          updated_at = now()
        where id = ${event.shipment_id}::uuid
      `;

      if (event.retail_customer_order_id) {
        await syncOrderShipmentMetadata(sql, {
          orderId: event.retail_customer_order_id,
          shipmentId: event.shipment_id
        });
      }
    }

    if (event.retail_customer_order_id) {
      if (event.normalized_status === "picked_up" || event.normalized_status === "drop_off") {
        await markOrderShippedFromCarrierEvent(sql, {
          carrierEventId: event.id,
          orderId: event.retail_customer_order_id,
          organisationId: event.organisation_id,
          shipmentId: event.shipment_id
        });
      } else if (event.normalized_status === "delivered") {
        const orderRows = await sql<Array<{ status: string }>>`
          update public.retail_customer_orders
          set
            status = 'delivered',
            delivered_at = coalesce(delivered_at, now()),
            updated_at = now()
          where id = ${event.retail_customer_order_id}::uuid
            and status = 'shipped'
          returning status
        `;

        if (orderRows[0]?.status === "delivered") {
          const { sendRetailOrderWorkflowEmail } = await import("@/lib/retail-order-workflow");

          await sendRetailOrderWorkflowEmail({
            event: "delivered",
            locale: "en",
            orderId: event.retail_customer_order_id,
            sql
          });
          await queueAdminOrganisationCommunication({
            eventKey: "retail_order_delivered",
            metadata: {
              carrierEventId: event.id,
              source: "carrier_event_process"
            },
            organisationId: event.organisation_id,
            resourceId: event.retail_customer_order_id,
            resourceType: "retail_customer_order"
          });
        }
      } else if (
        event.normalized_status === "delivery_failed" ||
        event.normalized_status === "returned" ||
        event.normalized_status === "lost" ||
        event.normalized_status === "damaged" ||
        event.normalized_status === "exception" ||
        event.normalized_status === "unknown"
      ) {
        await queueAdminOrganisationCommunication({
          eventKey: "retail_order_shipment_exception",
          metadata: {
            carrierEventId: event.id,
            providerStatusCode: event.provider_status_code,
            providerStatusText: event.provider_status_text,
            source: "carrier_event_process"
          },
          organisationId: event.organisation_id,
          resourceId: event.retail_customer_order_id,
          resourceType: "retail_customer_order"
        });
      }
    }

    await sql`
      update public.retail_order_shipment_events
      set
        processed_at = now(),
        processing_status = 'processed',
        processing_error = null,
        metadata = metadata || ${sql.json({ processedByTaskId: input.taskId ?? null })},
        received_at = received_at
      where id = ${event.id}::uuid
    `;
    await writeCarrierBpm({
      eventName: "carrier_shipment_event_processed",
      eventStatus: event.normalized_status,
      metadata: {
        providerStatusCode: event.provider_status_code,
        providerStatusText: event.provider_status_text
      },
      orderId: event.retail_customer_order_id,
      organisationId: event.organisation_id,
      shipmentId: event.shipment_id
    });

    return {
      eventId: event.id,
      normalizedStatus: event.normalized_status,
      shipmentId: event.shipment_id
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Carrier event processing failed";

    await sql`
      update public.retail_order_shipment_events
      set
        processed_at = now(),
        processing_status = 'failed',
        processing_error = ${message},
        metadata = metadata || ${sql.json({ processedByTaskId: input.taskId ?? null })},
        received_at = received_at
      where id = ${event.id}::uuid
    `;
    await queuePlatformCarrierFailure({
      error: message,
      eventId: event.id,
      organisationId: await platformOrganisationId(sql)
    });

    throw error;
  }
}

export async function replayCarrierShipmentEvent(
  context: AdminSessionContext,
  input: Readonly<{
    eventId: string;
  }>
) {
  assertShipmentPermission(context, "shipments.write");
  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const rows = await sql<Array<{
    id: string;
    normalised_status?: string;
    normalized_status: string;
    organisation_id: string;
    retail_customer_order_id: string | null;
    shipment_id: string | null;
  }>>`
    select
      id::text,
      organisation_id::text,
      shipment_id::text,
      retail_customer_order_id::text,
      normalized_status
    from public.retail_order_shipment_events
    where id = ${input.eventId.trim()}::uuid
    limit 1
  `;
  const event = rows[0];

  if (!event || !contextCanAccessOrganisation(context, event.organisation_id)) {
    throw new Error("Carrier shipment event not found");
  }

  await sql`
    update public.retail_order_shipment_events
    set
      processing_status = 'queued',
      processing_error = null,
      metadata = metadata || ${sql.json({
        replayQueuedByPersonId: context.actorPerson.id,
        replayQueuedAt: new Date().toISOString()
      })},
      received_at = received_at
    where id = ${event.id}::uuid
  `;
  await queueCarrierTask({
    idempotencyKey: `carrier-event-replay:${event.id}`,
    organisationId: event.organisation_id,
    payload: {
      eventId: event.id,
      replay: true,
      shipmentId: event.shipment_id
    },
    priorityReason: "Replay carrier shipment event",
    requiredCapabilities: [AGENT_CAPABILITIES.carrierEventProcess],
    shipmentId: event.shipment_id,
    sourceEntityId: event.id,
    sourceEntityType: "retail_order_shipment_event",
    taskType: "carrier_event_process",
    title: "Replay carrier shipment event"
  });

  await recordAdminAudit({
    action: "admin.retail_order_shipment_event_replayed",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    metadata: {
      normalizedStatus: event.normalized_status,
      orderId: event.retail_customer_order_id,
      shipmentId: event.shipment_id
    },
    organisationId: event.organisation_id,
    resourceId: event.id,
    resourceType: "retail_order_shipment_event"
  });
  await writeCarrierBpm({
    eventName: "carrier_shipment_event_replayed",
    eventStatus: event.normalized_status,
    metadata: {
      orderId: event.retail_customer_order_id
    },
    organisationId: event.organisation_id,
    shipmentId: event.shipment_id
  });

  return event.id;
}

export async function executeCarrierShipmentTask(input: Readonly<{
  carrierId: string | null;
  eventId: string | null;
  orderId: string | null;
  shipmentId: string | null;
  taskId: string;
  taskType: string;
}>) {
  if (input.taskType === "carrier_event_process") {
    if (!input.eventId) {
      throw new Error("Carrier event task is missing an event id");
    }

    return processCarrierShipmentEvent({
      eventId: input.eventId,
      taskId: input.taskId
    });
  }

  const sql = getSql();

  if (!sql || !(await shipmentTablesAvailable(sql))) {
    throw new Error("Carrier shipment tables are not available");
  }

  const task = await kexTaskRequest(sql, {
    orderId: input.orderId,
    shipmentId: input.shipmentId,
    taskId: input.taskId
  });

  try {
    if (input.taskType === "carrier_shipment_create") {
      const result = task.shipment.provider_shipment_id
        ? {
            providerShipmentId: task.shipment.provider_shipment_id,
            status: task.shipment.status,
            trackingNumber: task.shipment.tracking_number,
            trackingUrl: task.shipment.tracking_url
          }
        : await createKexShipment(task.request);

      const shipment = await updateShipmentFromKexResult(sql, {
        eventName: "retail_order_kex_shipment_created",
        operation: "shipment",
        result,
        shipment: task.shipment,
        taskId: input.taskId
      });

      return {
        carrierId: shipment.carrier_id,
        shipmentId: shipment.id,
        status: shipment.status,
        trackingNumber: shipment.tracking_number
      };
    }

    if (input.taskType === "carrier_label_generate") {
      let shipment = task.shipment;

      if (!shipment.provider_shipment_id) {
        const createResult = await createKexShipment(task.request);
        shipment = await updateShipmentFromKexResult(sql, {
          eventName: "retail_order_kex_shipment_created",
          operation: "shipment",
          result: createResult,
          shipment,
          taskId: input.taskId
        });
      }

      const result = await generateKexLabel({
        ...task.request,
        shipment: {
          labelUrl: shipment.label_url ?? null,
          providerShipmentId: shipment.provider_shipment_id,
          status: shipment.status,
          trackingNumber: shipment.tracking_number,
          trackingUrl: shipment.tracking_url
        }
      });
      const updated = await updateShipmentFromKexResult(sql, {
        eventName: "retail_order_kex_label_generated",
        operation: "label",
        result,
        shipment,
        taskId: input.taskId
      });

      return {
        carrierId: updated.carrier_id,
        labelStatus: updated.label_status,
        labelUrl: updated.label_url,
        shipmentId: updated.id
      };
    }

    if (input.taskType === "carrier_pickup_book") {
      let shipment = task.shipment;

      if (!shipment.provider_shipment_id) {
        const createResult = await createKexShipment(task.request);
        shipment = await updateShipmentFromKexResult(sql, {
          eventName: "retail_order_kex_shipment_created",
          operation: "shipment",
          result: createResult,
          shipment,
          taskId: input.taskId
        });
      }

      const result = await bookKexPickup({
        ...task.request,
        shipment: {
          labelUrl: shipment.label_url ?? null,
          providerShipmentId: shipment.provider_shipment_id,
          status: shipment.status,
          trackingNumber: shipment.tracking_number,
          trackingUrl: shipment.tracking_url
        }
      });
      const updated = await updateShipmentFromKexResult(sql, {
        eventName: "retail_order_kex_pickup_booked",
        operation: "pickup",
        result,
        shipment,
        taskId: input.taskId
      });

      return {
        carrierId: updated.carrier_id,
        pickupBookedAt: true,
        shipmentId: updated.id,
        status: updated.status
      };
    }

    if (input.taskType === "carrier_tracking_sync") {
      const result = await syncKexTracking(task.request);
      const updated = await updateShipmentFromKexResult(sql, {
        eventName: "retail_order_kex_tracking_synced",
        operation: "tracking",
        result,
        shipment: task.shipment,
        taskId: input.taskId
      });

      return {
        carrierId: updated.carrier_id,
        shipmentId: updated.id,
        status: updated.status,
        trackingNumber: updated.tracking_number
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "KEX carrier task failed";

    await queuePlatformCarrierFailure({
      error: message,
      eventId: input.taskId,
      organisationId: await platformOrganisationId(sql)
    });

    throw error;
  }

  throw new Error(`Unsupported carrier task type: ${input.taskType}`);
}

export function carrierNameForDisplay(value: string | null | undefined) {
  return retailCarrierDisplayName(value);
}
