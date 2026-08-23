import { createHash, randomBytes, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import {
  normalizeCommunicationChannelType,
  normalizeLineUserId,
  selectBestCommunicationChannel,
  type CommunicationChannelStatus,
  type CommunicationChannelType
} from "@/lib/communication-channel-utils";
import { formatOutboundLineMessage } from "@/lib/line-message-format";
import { getSql } from "@/lib/db";
import { textArray } from "@/lib/sql-arrays";
import { validateLeadEmail } from "@/lib/email-validation";
import {
  sendTransactionalEmail,
  type TransactionalEmailAttachment
} from "@/lib/smtp-email";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";
import type { ReservedTask } from "@/lib/task-service";

export {
  normalizeCommunicationChannelType,
  normalizeLineUserId,
  selectBestCommunicationChannel
};
export type { CommunicationChannelStatus, CommunicationChannelType };

export type CommunicationMessageStatus =
  | "delivered"
  | "failed"
  | "no_channel"
  | "queued"
  | "sent"
  | "skipped";

export type AdminCommunicationEventKey =
  | "admin_test_message"
  | "platform_checkout_failed"
  | "platform_communication_failed"
  | "platform_carrier_integration_failed"
  | "platform_payment_failed"
  | "platform_payout_failed"
  | "platform_revenue_received"
  | "platform_retailer_payout_due"
  | "platform_retailer_settlement_needs_review"
  | "platform_task_stuck"
  | "platform_technical_alert"
  | "platform_worker_unavailable"
  | "retail_order_awaiting_stock"
  | "retail_order_cancelled"
  | "retail_order_created"
  | "retail_order_delivered"
  | "retail_order_ready_to_pack"
  | "retail_order_ready_to_ship"
  | "retail_order_pickup_booked"
  | "retail_order_returned"
  | "retail_order_shipment_exception"
  | "retail_order_shipped"
  | "retail_settlement_needs_review"
  | "retail_settlement_payout_paid";

export type AdminCommunicationScope = "platform" | "retail";

export type AdminCommunicationChannelType = Extract<
  CommunicationChannelType,
  "email" | "line"
>;

export type OrganisationNotificationPreference = Readonly<{
  channelType: AdminCommunicationChannelType;
  enabled: boolean;
  eventKey: AdminCommunicationEventKey;
  preferenceRank: number;
  updatedAt: string;
}>;

export type CommunicationChannel = Readonly<{
  actorType: "ai" | "human" | "system" | "unknown";
  address: string;
  channelType: CommunicationChannelType;
  createdAt: string;
  displayName: string | null;
  id: string;
  identityId: string;
  metadata: unknown;
  preferenceRank: number;
  status: CommunicationChannelStatus;
  updatedAt: string;
}>;

export type CommunicationMessage = Readonly<{
  body: string;
  channelId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  direction: "inbound" | "outbound";
  errorMessage: string | null;
  html: string | null;
  id: string;
  identityId: string | null;
  messageType: string;
  metadata: unknown;
  planId: string | null;
  provider: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  status: CommunicationMessageStatus;
  subject: string | null;
  taskId: string | null;
  updatedAt: string;
}>;

export type Db = postgres.Sql | postgres.TransactionSql;

export type ChannelRow = {
  actor_type: CommunicationChannel["actorType"];
  address: string;
  channel_type: CommunicationChannelType;
  created_at: Date | string;
  display_name: string | null;
  id: string;
  identity_id: string;
  metadata: unknown;
  preference_rank: number | string;
  status: CommunicationChannelStatus;
  updated_at: Date | string;
};

export type MessageRow = {
  body: string;
  channel_id: string | null;
  created_at: Date | string;
  delivered_at: Date | string | null;
  direction: "inbound" | "outbound";
  error_message: string | null;
  html: string | null;
  id: string;
  identity_id: string | null;
  message_type: string;
  metadata: unknown;
  plan_id: string | null;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: Date | string | null;
  status: CommunicationMessageStatus;
  subject: string | null;
  task_id: string | null;
  updated_at: Date | string;
};

export type DeliveryTargetRow = MessageRow & {
  delivery_address: string | null;
  delivery_channel_metadata: unknown;
  delivery_channel_type: CommunicationChannelType | null;
};

export type CommunicationDispatchResult = Readonly<{
  attempted: boolean;
  configured: boolean;
  message: CommunicationMessage;
  provider: string | null;
  reason: string | null;
}>;

export type PreparedRetryMessage = Readonly<{
  channel: CommunicationChannel | null;
  message: CommunicationMessage;
}>;

export type CommunicationRetryClaimInput = Readonly<{
  identityId: string | null;
  messageId: string;
  selected: CommunicationChannel | null;
}>;

export const MESSAGE_STATUSES = new Set<string>([
  "delivered",
  "failed",
  "no_channel",
  "queued",
  "sent",
  "skipped"
]);
export const ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY = 300;
export const ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY = 260;
export const ADMIN_COMMUNICATION_CHANNEL_TYPES = ["line", "email"] as const;
const RETAIL_ADMIN_COMMUNICATION_EVENT_DEFAULTS = {
  retail_order_awaiting_stock: true,
  retail_order_cancelled: true,
  retail_order_created: true,
  retail_order_delivered: false,
  retail_order_pickup_booked: true,
  retail_order_ready_to_pack: true,
  retail_order_ready_to_ship: true,
  retail_order_returned: true,
  retail_order_shipment_exception: true,
  retail_order_shipped: false,
  retail_settlement_needs_review: true,
  retail_settlement_payout_paid: true
} satisfies Record<Extract<AdminCommunicationEventKey, `retail_${string}`>, boolean>;
const PLATFORM_ADMIN_COMMUNICATION_EVENT_KEYS = [
  "platform_revenue_received",
  "platform_checkout_failed",
  "platform_carrier_integration_failed",
  "platform_payment_failed",
  "platform_payout_failed",
  "platform_retailer_payout_due",
  "platform_retailer_settlement_needs_review",
  "platform_worker_unavailable",
  "platform_task_stuck",
  "platform_communication_failed",
  "platform_technical_alert"
] as const satisfies readonly Extract<AdminCommunicationEventKey, `platform_${string}`>[];
const ADMIN_COMMUNICATION_EVENT_DEFAULTS = {
  admin_test_message: false,
  ...RETAIL_ADMIN_COMMUNICATION_EVENT_DEFAULTS,
  platform_checkout_failed: true,
  platform_carrier_integration_failed: true,
  platform_communication_failed: true,
  platform_payment_failed: true,
  platform_payout_failed: true,
  platform_revenue_received: true,
  platform_retailer_payout_due: true,
  platform_retailer_settlement_needs_review: true,
  platform_task_stuck: true,
  platform_technical_alert: true,
  platform_worker_unavailable: true
} satisfies Record<AdminCommunicationEventKey, boolean>;
export const retailAdminCommunicationEventKeys = Object.keys(
  RETAIL_ADMIN_COMMUNICATION_EVENT_DEFAULTS
) as Array<Extract<AdminCommunicationEventKey, `retail_${string}`>>;
export const platformAdminCommunicationEventKeys = [
  ...PLATFORM_ADMIN_COMMUNICATION_EVENT_KEYS
];
export const adminCommunicationEventKeys = Object.keys(
  ADMIN_COMMUNICATION_EVENT_DEFAULTS
) as AdminCommunicationEventKey[];

const globalCommunications = globalThis as typeof globalThis & {
  mattanutraCommunicationSchemaReady?: Promise<void>;
};

export function isoDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed || fallback;
}

export function optionalText(value: unknown) {
  const trimmed = cleanText(value);

  return trimmed || null;
}

const NOTIFICATION_AMOUNT_MICROS_PER_UNIT = 1_000_000;
type NotificationEnvironment = "dev" | "prd" | "uat";

const NOTIFICATION_ENVIRONMENT_ALIASES: Record<string, NotificationEnvironment> = {
  dev: "dev",
  development: "dev",
  local: "dev",
  prd: "prd",
  prod: "prd",
  production: "prd",
  stage: "uat",
  staging: "uat",
  uat: "uat"
};

function normalizeNotificationEnvironment(value: unknown) {
  return NOTIFICATION_ENVIRONMENT_ALIASES[cleanText(value).toLowerCase()] ?? null;
}

function inferNotificationEnvironmentFromUrl(value: unknown) {
  const first = cleanText(value).split(",")[0]?.trim();

  if (!first) {
    return null;
  }

  try {
    const host = new URL(first.includes("://") ? first : `https://${first}`)
      .hostname
      .toLowerCase();

    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return "dev";
    }

    if (host === "mattanutra.com" || host === "www.mattanutra.com") {
      return "prd";
    }

    if (/(^|[.-])uat($|[.-])/.test(host)) {
      return "uat";
    }

    return /(^|[.-])dev($|[.-])/.test(host) ? "dev" : null;
  } catch {
    return null;
  }
}

function notificationEnvironmentCode(
  metadata: Record<string, unknown> = {}
): NotificationEnvironment {
  const explicit =
    normalizeNotificationEnvironment(process.env.MATTANUTRA_ENV) ??
    normalizeNotificationEnvironment(metadata.mattanutraEnv);

  if (explicit) {
    return explicit;
  }

  for (const candidate of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APP_BASE_URL,
    process.env.MATTANUTRA_API_BASE_URL,
    process.env.VERCEL_URL,
    process.env.RENDER_EXTERNAL_URL
  ]) {
    const inferred = inferNotificationEnvironmentFromUrl(candidate);

    if (inferred) {
      return inferred;
    }
  }

  return process.env.NODE_ENV === "production" ? "prd" : "dev";
}

export function adminNotificationEnvironmentLabel(
  metadata: Record<string, unknown> = {}
) {
  const environment = notificationEnvironmentCode(metadata);

  return environment === "prd" ? null : environment.toUpperCase();
}

function notificationText(value: unknown, maxLength = 140) {
  const text =
    typeof value === "number" || typeof value === "bigint"
      ? String(value)
      : cleanText(value);

  return !text
    ? null
    : text.length > maxLength
      ? `${text.slice(0, maxLength - 3)}...`
      : text;
}

function firstNotificationText(
  metadata: Record<string, unknown>,
  keys: readonly string[],
  maxLength?: number
) {
  for (const key of keys) {
    const value = notificationText(metadata[key], maxLength);

    if (value) {
      return value;
    }
  }

  return null;
}

function notificationNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function firstNotificationNumber(
  metadata: Record<string, unknown>,
  keys: readonly string[]
) {
  for (const key of keys) {
    const value = notificationNumber(metadata[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function formatNotificationAmount(amount: number, currency: string) {
  return `${amount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  })}${currency ? ` ${currency}` : ""}`;
}

function notificationAmountLine(metadata: Record<string, unknown>) {
  const currency = firstNotificationText(
    metadata,
    ["currency", "settlementCurrency"],
    10
  )?.toUpperCase() ?? "";

  for (const [key, label] of [
    ["amountMicros", "Amount"],
    ["grossCustomerAmountMicros", "Gross amount"],
    ["retailerPayableAmountMicros", "Retailer payable"],
    ["mattanutraMarginAmountMicros", "MattaNutra margin"],
    ["paidAmountMicros", "Paid amount"],
    ["totalAmountMicros", "Total"]
  ] as const) {
    const amountMicros = notificationNumber(metadata[key]);

    if (amountMicros !== null) {
      return `${label}: ${formatNotificationAmount(
        amountMicros / NOTIFICATION_AMOUNT_MICROS_PER_UNIT,
        currency
      )}`;
    }
  }

  const majorAmount = firstNotificationNumber(metadata, [
    "totalAmount",
    "retailerPayableAmount",
    "grossCustomerAmount"
  ]);

  return majorAmount === null || !currency
    ? null
    : `Amount: ${formatNotificationAmount(majorAmount, currency)}`;
}

function positiveCountLine(label: string, count: number | null) {
  return count !== null && count > 0 ? `${label}: ${count}` : null;
}

function adminNotificationDetailLines(input: Readonly<{
  metadata?: Record<string, unknown>;
  resourceId?: string | null;
  resourceType?: string | null;
}>) {
  const metadata = input.metadata ?? {};
  const order = firstNotificationText(metadata, ["orderNumber"], 80);
  const payment = firstNotificationText(
    metadata,
    [
      "checkoutPaymentId",
      "paymentId",
      "stripePaymentIntentId",
      "stripeCheckoutSessionId",
      "stripePayoutId"
    ],
    120
  );
  const retailer = firstNotificationText(
    metadata,
    ["organisationName", "retailerName", "organisationId", "targetOrganisationId"],
    120
  );
  const reference =
    !order && !payment && !retailer && input.resourceType && input.resourceId
      ? `${input.resourceType}/${input.resourceId}`
      : null;
  const status = firstNotificationText(
    metadata,
    ["paymentStatus", "stripePayoutStatus", "status", "toStatus"],
    80
  );
  const reason = firstNotificationText(metadata, ["reason", "errorMessage", "error"]);
  const source = firstNotificationText(
    metadata,
    ["source", "sourceSurface", "stripeMode"],
    100
  );

  const environment = adminNotificationEnvironmentLabel(metadata);

  return [
    environment ? `Environment: ${environment}` : null,
    notificationAmountLine(metadata),
    order ? `Order: ${order}` : null,
    payment ? `Payment: ${payment}` : null,
    retailer ? `Retailer: ${retailer}` : null,
    status ? `Status: ${status}` : null,
    reason ? `Reason: ${reason}` : null,
    positiveCountLine(
      "Items",
      firstNotificationNumber(metadata, ["lineCount", "selectedItemCount"])
    ),
    positiveCountLine("Stock gap", notificationNumber(metadata.gapUnits)),
    source ? `Source: ${source}` : null,
    reference ? `Reference: ${reference}` : null
  ].filter((line): line is string => Boolean(line));
}

function environmentSubject(subject: string, environment: string | null) {
  return !environment || /^\[[A-Z]+\]\s/.test(subject)
    ? subject
    : `[${environment}] ${subject}`;
}

export function applyAdminNotificationContext(input: Readonly<{
  body: string;
  eventKey: AdminCommunicationEventKey;
  metadata?: Record<string, unknown>;
  resourceId?: string | null;
  resourceType?: string | null;
  subject: string;
}>) {
  const metadata = input.metadata ?? {};
  const environment = adminNotificationEnvironmentLabel(metadata);
  const subject = environmentSubject(input.subject, environment);

  if (/^Environment:\s*[A-Z]+$/im.test(input.body)) {
    return {
      body: input.body,
      subject
    };
  }

  const details = adminNotificationDetailLines(input);

  return {
    body: details.length > 0
      ? `${input.body.trim()}\n\n${details.join("\n")}`
      : input.body.trim(),
    subject
  };
}

export function normalizeAdminCommunicationEventKey(
  value: unknown
): AdminCommunicationEventKey | null {
  const key = cleanText(value);

  return key in ADMIN_COMMUNICATION_EVENT_DEFAULTS
    ? (key as AdminCommunicationEventKey)
    : null;
}

export function adminCommunicationEventScope(
  eventKey: AdminCommunicationEventKey
): AdminCommunicationScope | "system" {
  if (eventKey === "admin_test_message") {
    return "system";
  }

  return eventKey.startsWith("platform_") ? "platform" : "retail";
}

export function adminCommunicationEventKeysForScope(
  scope: AdminCommunicationScope
) {
  return scope === "platform"
    ? [...platformAdminCommunicationEventKeys]
    : [...retailAdminCommunicationEventKeys];
}

export function eventKeyAllowedForScope(
  eventKey: AdminCommunicationEventKey,
  scope: AdminCommunicationScope
) {
  const eventScope = adminCommunicationEventScope(eventKey);

  return eventScope === "system" || eventScope === scope;
}

export function normalizeAdminCommunicationChannelType(
  value: unknown
): AdminCommunicationChannelType | null {
  const channelType = normalizeCommunicationChannelType(value);

  return channelType === "email" || channelType === "line"
    ? channelType
    : null;
}

export function adminCommunicationChannelRank(channelType: AdminCommunicationChannelType) {
  return channelType === "line" ? 10 : 80;
}

export function hashLineConnectCode(code: string) {
  return createHash("sha256")
    .update(code.trim().toUpperCase())
    .digest("hex");
}

export function newLineConnectCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type SafetyFollowupItem = Readonly<{
  clientDose: string | null;
  decision: string;
  safetyReviewId: string | null;
  supplementName: string;
}>;

export function safetyFollowupItems(value: unknown): SafetyFollowupItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = objectValue(item);
      const supplementName = cleanText(record.supplementName);

      if (!supplementName) {
        return null;
      }

      return {
        clientDose: optionalText(record.clientDose),
        decision: cleanText(record.decision, "reviewed"),
        safetyReviewId: isUuid(cleanText(record.safetyReviewId))
          ? cleanText(record.safetyReviewId)
          : null,
        supplementName
      } satisfies SafetyFollowupItem;
    })
    .filter((item): item is SafetyFollowupItem => Boolean(item));
}

export function configuredLineAccessToken() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
}

export function lineMetadata(address: string, metadata: Record<string, unknown>) {
  const userId =
    normalizeLineUserId(metadata.lineUserId) ?? normalizeLineUserId(address);
  const trimmedAddress = address.trim();
  const mappingRequired =
    Boolean(trimmedAddress) && !userId && trimmedAddress !== "manual";

  return {
    ...metadata,
    ...(userId ? { lineUserId: userId, requiresIdentityMapping: false } : {}),
    ...(!userId && trimmedAddress
      ? { lineHandle: trimmedAddress, requiresIdentityMapping: true }
      : {}),
    ...(mappingRequired
      ? { identityMappingRequired: true }
      : { identityMappingRequired: false })
  };
}

export function normalizeAddress(type: CommunicationChannelType, address: string) {
  const trimmed = address.trim();

  return type === "email" ? trimmed.toLowerCase() : trimmed;
}

export function mapChannel(row: ChannelRow): CommunicationChannel {
  return {
    actorType: row.actor_type,
    address: row.address,
    channelType: row.channel_type,
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    displayName: row.display_name,
    id: row.id,
    identityId: row.identity_id,
    metadata: row.metadata,
    preferenceRank: Number(row.preference_rank) || 100,
    status: row.status,
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString()
  };
}

export function mapMessage(row: MessageRow): CommunicationMessage {
  return {
    body: row.body,
    channelId: row.channel_id,
    createdAt: isoDate(row.created_at) ?? new Date().toISOString(),
    deliveredAt: isoDate(row.delivered_at),
    direction: row.direction,
    errorMessage: row.error_message,
    html: row.html,
    id: row.id,
    identityId: row.identity_id,
    messageType: row.message_type,
    metadata: row.metadata,
    planId: row.plan_id,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    sentAt: isoDate(row.sent_at),
    status: row.status,
    subject: row.subject,
    taskId: row.task_id,
    updatedAt: isoDate(row.updated_at) ?? new Date().toISOString()
  };
}

export function sqlOrThrow(): postgres.Sql;
export function sqlOrThrow(sql: Db): Db;
export function sqlOrThrow(sql?: Db) {
  const configured = sql ?? getSql();

  if (!configured) {
    throw new Error("Database connection is not configured");
  }

  return configured;
}

export async function ensureCommunicationSchema(sql: Db = sqlOrThrow()) {
  if (globalCommunications.mattanutraCommunicationSchemaReady) {
    return globalCommunications.mattanutraCommunicationSchemaReady;
  }

  globalCommunications.mattanutraCommunicationSchemaReady = (async () => {
    const requiredColumns = {
      communication_channels: [
        "id",
        "identity_id",
        "channel_type",
        "address",
        "status",
        "preference_rank",
        "actor_type",
        "metadata",
        "created_at",
        "updated_at"
      ],
      communication_identities: [
        "id",
        "source",
        "metadata",
        "created_at",
        "updated_at"
      ],
      communication_messages: [
        "id",
        "identity_id",
        "channel_id",
        "plan_id",
        "task_id",
        "direction",
        "message_type",
        "status",
        "subject",
        "body",
        "html",
        "provider",
        "provider_message_id",
        "error_message",
        "metadata",
        "scheduled_for",
        "sent_at",
        "delivered_at",
        "created_at",
        "updated_at"
      ],
      customer_line_connect_tokens: [
        "id",
        "plan_id",
        "retail_customer_order_id",
        "token_hash",
        "status",
        "expires_at",
        "consumed_at",
        "consumed_by_channel_id",
        "metadata",
        "created_at",
        "updated_at"
      ],
      line_connect_tokens: [
        "id",
        "organisation_id",
        "token_hash",
        "status",
        "expires_at",
        "consumed_at",
        "consumed_by_channel_id",
        "metadata",
        "created_at",
        "updated_at"
      ],
      organisation_communication_identities: [
        "organisation_id",
        "identity_id",
        "relationship",
        "is_primary",
        "metadata",
        "created_at"
      ],
      organisation_notification_preferences: [
        "organisation_id",
        "event_key",
        "channel_type",
        "enabled",
        "preference_rank",
        "metadata",
        "created_at",
        "updated_at"
      ],
      plan_communication_identities: [
        "plan_id",
        "identity_id",
        "relationship",
        "is_primary",
        "metadata",
        "created_at"
      ]
    } as const;
    const rows = await sql<Array<{
      column_name: string;
      table_name: string;
    }>>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any(${textArray(sql, Object.keys(requiredColumns))}::text[])
    `;
    const available = new Map<string, Set<string>>();

    for (const row of rows) {
      const columns = available.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      available.set(row.table_name, columns);
    }

    const missing = Object.entries(requiredColumns).flatMap(([table, columns]) => {
      const availableColumns = available.get(table) ?? new Set<string>();

      return [...columns]
        .filter((column) => !availableColumns.has(column))
        .map((column) => `public.${table}.${column}`);
    });

    if (missing.length > 0) {
      throw new Error(
        `Communication schema is incomplete. Apply db-schema.sql before using communication APIs. Missing: ${missing.join(", ")}`
      );
    }
  })().catch((error) => {
    globalCommunications.mattanutraCommunicationSchemaReady = undefined;
    throw error;
  });

  return globalCommunications.mattanutraCommunicationSchemaReady;
}

export async function ensurePlanIdentity(
  sql: Db,
  planId: string
): Promise<string> {
  const existing = await sql<{ identity_id: string }[]>`
    select identity_id::text
    from public.plan_communication_identities
    where plan_id = ${planId}::uuid
      and is_primary
    order by created_at asc
    limit 1
  `;

  if (existing[0]?.identity_id) {
    return existing[0].identity_id;
  }

  const identityId = randomUUID();

  await sql`
    insert into public.communication_identities (
      id,
      source,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${identityId}::uuid,
      'plan',
      ${sql.json(toJsonValue({ planId }))},
      now(),
      now()
    )
    on conflict (id) do nothing
  `;
  await sql`
    insert into public.plan_communication_identities (
      plan_id,
      identity_id,
      relationship,
      is_primary,
      metadata,
      created_at
    )
    values (
      ${planId}::uuid,
      ${identityId}::uuid,
      'client',
      true,
      '{}'::jsonb,
      now()
    )
    on conflict do nothing
  `;

  const rows = await sql<{ identity_id: string }[]>`
    select identity_id::text
    from public.plan_communication_identities
    where plan_id = ${planId}::uuid
      and is_primary
    order by created_at asc
    limit 1
  `;

  if (!rows[0]?.identity_id) {
    throw new Error("Unable to create communication identity for plan");
  }

  return rows[0].identity_id;
}

export async function upsertChannel(
  sql: Db,
  input: Readonly<{
    actorType?: CommunicationChannel["actorType"] | null;
    address: string;
    channelType: CommunicationChannelType;
    displayName?: string | null;
    identityId: string;
    metadata?: Record<string, unknown>;
    preferenceRank?: number | null;
    status?: CommunicationChannelStatus | null;
  }>
) {
  const address = normalizeAddress(input.channelType, input.address);
  const status = input.status ?? "active";
  const metadata =
    input.channelType === "line"
      ? lineMetadata(address, input.metadata ?? {})
      : (input.metadata ?? {});

  if (input.channelType === "email") {
    const validation = validateLeadEmail(address);

    if (!validation.ok) {
      throw new Error("Communication email channel is not valid");
    }
  }

  const existing = await sql<ChannelRow[]>`
    select *
    from public.communication_channels
    where identity_id = ${input.identityId}::uuid
      and channel_type = ${input.channelType}
      and lower(address) = lower(${address})
    limit 1
  `;

  const rows = existing[0]
    ? await sql<ChannelRow[]>`
        update public.communication_channels
        set
          actor_type = ${input.actorType ?? existing[0].actor_type},
          display_name = ${input.displayName ?? existing[0].display_name},
          metadata = metadata || ${sql.json(toJsonValue(metadata))}::jsonb,
          preference_rank = ${input.preferenceRank ?? existing[0].preference_rank},
          status = ${status},
          updated_at = now()
        where id = ${existing[0].id}::uuid
        returning *
      `
    : await sql<ChannelRow[]>`
        insert into public.communication_channels (
          id,
          identity_id,
          channel_type,
          address,
          display_name,
          status,
          preference_rank,
          actor_type,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${randomUUID()}::uuid,
          ${input.identityId}::uuid,
          ${input.channelType},
          ${address},
          ${input.displayName ?? null},
          ${status},
          ${input.preferenceRank ?? 100},
          ${input.actorType ?? "human"},
          ${sql.json(toJsonValue(metadata))},
          now(),
          now()
        )
        returning *
      `;

  return mapChannel(rows[0]);
}

export async function seedKnownPlanChannels(
  sql: Db,
  planId: string,
  identityId: string
) {
  const rows = await sql<Array<{ email: string | null }>>`
    select email
    from public.assessment_example_requests
    where plan_id = ${planId}::uuid
      and email is not null
    union
    select recipient ->> 'email' as email
    from public.cron
    where plan_id = ${planId}::uuid
      and recipient ? 'email'
    limit 5
  `;

  for (const row of rows) {
    const validation = validateLeadEmail(row.email ?? "");

    if (validation.ok) {
      await upsertChannel(sql, {
        address: validation.email,
        channelType: "email",
        displayName: "Email",
        identityId,
        metadata: {
          source: "known_plan_email"
        },
        preferenceRank: 80,
        status: "active"
      });
    }
  }
}

export async function organisationName(sql: Db, organisationId: string) {
  const rows = await sql<Array<{ name: string }>>`
    select name
    from public.organisations
    where id = ${organisationId}::uuid
    limit 1
  `;

  return cleanText(rows[0]?.name, "Retail organisation");
}

export async function organisationCommunicationScope(
  sql: Db,
  organisationId: string
): Promise<AdminCommunicationScope> {
  const rows = await sql<Array<{ organisation_type: string }>>`
    select organisation_type
    from public.organisations
    where id = ${organisationId}::uuid
    limit 1
  `;

  if (!rows[0]) {
    throw new Error("Organisation is required for communications");
  }

  return rows[0].organisation_type === "platform" ? "platform" : "retail";
}

export async function platformOrganisationId(sql: Db) {
  const rows = await sql<Array<{ id: string }>>`
    select id::text
    from public.organisations
    where slug = 'mattanutra'
      and organisation_type = 'platform'
      and status = 'active'
    limit 1
  `;

  if (!rows[0]?.id) {
    throw new Error("Platform organisation is required for communications");
  }

  return rows[0].id;
}

export function organisationIdentityRelationship(scope: AdminCommunicationScope) {
  return scope === "platform" ? "platform" : "retailer";
}

export function adminCommunicationPreferenceDefault(
  eventKey: AdminCommunicationEventKey,
  channelType: AdminCommunicationChannelType
) {
  if (eventKey === "admin_test_message") {
    return false;
  }

  if (eventKey.startsWith("platform_")) {
    if (channelType === "email") {
      return true;
    }

    return eventKey !== "platform_revenue_received";
  }

  return RETAIL_ADMIN_COMMUNICATION_EVENT_DEFAULTS[
    eventKey as keyof typeof RETAIL_ADMIN_COMMUNICATION_EVENT_DEFAULTS
  ] ?? false;
}

export async function ensureOrganisationIdentity(
  sql: Db,
  organisationId: string
): Promise<string> {
  const scope = await organisationCommunicationScope(sql, organisationId);
  const relationship = organisationIdentityRelationship(scope);
  const existing = await sql<{ identity_id: string }[]>`
    select identity_id::text
    from public.organisation_communication_identities
    where organisation_id = ${organisationId}::uuid
      and is_primary
    order by created_at asc
    limit 1
  `;

  if (existing[0]?.identity_id) {
    await sql`
      update public.organisation_communication_identities
      set relationship = ${relationship}
      where organisation_id = ${organisationId}::uuid
        and identity_id = ${existing[0].identity_id}::uuid
        and relationship <> ${relationship}
    `;

    return existing[0].identity_id;
  }

  const identityId = randomUUID();
  const displayName = await organisationName(sql, organisationId);

  await sql`
    insert into public.communication_identities (
      id,
      display_name,
      source,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${identityId}::uuid,
      ${displayName},
      'organisation',
      ${sql.json(toJsonValue({ organisationId }))},
      now(),
      now()
    )
    on conflict (id) do nothing
  `;
  await sql`
    insert into public.organisation_communication_identities (
      organisation_id,
      identity_id,
      relationship,
      is_primary,
      metadata,
      created_at
    )
    values (
      ${organisationId}::uuid,
      ${identityId}::uuid,
      ${relationship},
      true,
      '{}'::jsonb,
      now()
    )
    on conflict do nothing
  `;

  const rows = await sql<{ identity_id: string }[]>`
    select identity_id::text
    from public.organisation_communication_identities
    where organisation_id = ${organisationId}::uuid
      and is_primary
    order by created_at asc
    limit 1
  `;

  if (!rows[0]?.identity_id) {
    throw new Error("Unable to create communication identity for organisation");
  }

  return rows[0].identity_id;
}

export async function seedOrganisationNotificationPreferences(
  sql: Db,
  organisationId: string
) {
  const scope = await organisationCommunicationScope(sql, organisationId);

  for (const eventKey of adminCommunicationEventKeysForScope(scope)) {
    for (const channelType of ADMIN_COMMUNICATION_CHANNEL_TYPES) {
      await sql`
        insert into public.organisation_notification_preferences (
          organisation_id,
          event_key,
          channel_type,
          enabled,
          preference_rank,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${organisationId}::uuid,
          ${eventKey},
          ${channelType},
          ${adminCommunicationPreferenceDefault(eventKey, channelType)},
          ${adminCommunicationChannelRank(channelType)},
          ${sql.json(toJsonValue({ source: "default_seed" }))},
          now(),
          now()
        )
        on conflict (organisation_id, event_key, channel_type) do nothing
      `;
    }
  }
}

export async function updateCommunicationChannel(input: Readonly<{
  address?: string | null;
  channelId: string;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
  preferenceRank?: number | null;
  status?: CommunicationChannelStatus | null;
}>) {
  if (!isUuid(input.channelId)) {
    throw new Error("Communication channel not found");
  }

  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const existingRows = await sql<ChannelRow[]>`
    select *
    from public.communication_channels
    where id = ${input.channelId}::uuid
    limit 1
  `;
  const existing = existingRows[0];

  if (!existing) {
    throw new Error("Communication channel not found");
  }

  const nextAddress = input.address
    ? normalizeAddress(existing.channel_type, input.address)
    : existing.address;

  if (existing.channel_type === "email") {
    const validation = validateLeadEmail(nextAddress);

    if (!validation.ok) {
      throw new Error("Communication email channel is not valid");
    }
  }

  const metadataPatch =
    existing.channel_type === "line"
      ? lineMetadata(nextAddress, input.metadata ?? {})
      : (input.metadata ?? {});
  const rows = await sql<ChannelRow[]>`
    update public.communication_channels
    set
      address = ${nextAddress},
      display_name = coalesce(${input.displayName ?? null}, display_name),
      metadata = metadata || ${sql.json(toJsonValue(metadataPatch))}::jsonb,
      preference_rank = coalesce(${input.preferenceRank ?? null}, preference_rank),
      status = coalesce(${input.status ?? null}, status),
      updated_at = now()
    where id = ${input.channelId}::uuid
    returning *
  `;

  if (
    existing.channel_type === "line" &&
    normalizeLineUserId(metadataPatch.lineUserId)
  ) {
    await sql`
      update public.communication_messages
      set
        status = 'queued',
        error_message = null,
        updated_at = now()
      where channel_id = ${input.channelId}::uuid
        and status = 'no_channel'
        and provider = 'line'
        and error_message = 'LINE channel needs a LINE user id mapping'
    `;
  }

  return mapChannel(rows[0]);
}

