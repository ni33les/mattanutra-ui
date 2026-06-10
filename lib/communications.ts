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
import { validateLeadEmail } from "@/lib/email-validation";
import { sendTransactionalEmail } from "@/lib/smtp-email";
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

type Db = postgres.Sql | postgres.TransactionSql;

type ChannelRow = {
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

type MessageRow = {
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

type DeliveryTargetRow = MessageRow & {
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

type PreparedRetryMessage = Readonly<{
  channel: CommunicationChannel | null;
  message: CommunicationMessage;
}>;

type CommunicationRetryClaimInput = Readonly<{
  identityId: string | null;
  messageId: string;
  selected: CommunicationChannel | null;
}>;

const MESSAGE_STATUSES = new Set<string>([
  "delivered",
  "failed",
  "no_channel",
  "queued",
  "sent",
  "skipped"
]);
export const ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY = 300;
export const ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY = 260;
const ADMIN_COMMUNICATION_CHANNEL_TYPES = ["line", "email"] as const;
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

function isoDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed || fallback;
}

function optionalText(value: unknown) {
  const trimmed = cleanText(value);

  return trimmed || null;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeAdminCommunicationEventKey(
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

function eventKeyAllowedForScope(
  eventKey: AdminCommunicationEventKey,
  scope: AdminCommunicationScope
) {
  const eventScope = adminCommunicationEventScope(eventKey);

  return eventScope === "system" || eventScope === scope;
}

function normalizeAdminCommunicationChannelType(
  value: unknown
): AdminCommunicationChannelType | null {
  const channelType = normalizeCommunicationChannelType(value);

  return channelType === "email" || channelType === "line"
    ? channelType
    : null;
}

function adminCommunicationChannelRank(channelType: AdminCommunicationChannelType) {
  return channelType === "line" ? 10 : 80;
}

function hashLineConnectCode(code: string) {
  return createHash("sha256")
    .update(code.trim().toUpperCase())
    .digest("hex");
}

function newLineConnectCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type SafetyFollowupItem = Readonly<{
  clientDose: string | null;
  decision: string;
  safetyReviewId: string | null;
  supplementName: string;
}>;

function safetyFollowupItems(value: unknown): SafetyFollowupItem[] {
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

function configuredLineAccessToken() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
}

function lineMetadata(address: string, metadata: Record<string, unknown>) {
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

function normalizeAddress(type: CommunicationChannelType, address: string) {
  const trimmed = address.trim();

  return type === "email" ? trimmed.toLowerCase() : trimmed;
}

function mapChannel(row: ChannelRow): CommunicationChannel {
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

function mapMessage(row: MessageRow): CommunicationMessage {
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

function sqlOrThrow(): postgres.Sql;
function sqlOrThrow(sql: Db): Db;
function sqlOrThrow(sql?: Db) {
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
        and table_name = any(${Object.keys(requiredColumns)}::text[])
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

async function ensurePlanIdentity(
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

async function upsertChannel(
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

async function seedKnownPlanChannels(
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

async function organisationName(sql: Db, organisationId: string) {
  const rows = await sql<Array<{ name: string }>>`
    select name
    from public.organisations
    where id = ${organisationId}::uuid
    limit 1
  `;

  return cleanText(rows[0]?.name, "Retail organisation");
}

async function organisationCommunicationScope(
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

async function platformOrganisationId(sql: Db) {
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

function organisationIdentityRelationship(scope: AdminCommunicationScope) {
  return scope === "platform" ? "platform" : "retailer";
}

function adminCommunicationPreferenceDefault(
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

async function ensureOrganisationIdentity(
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

async function seedOrganisationNotificationPreferences(
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

export async function ensureOrganisationCommunicationIdentity(input: Readonly<{
  organisationId: string;
  sql?: Db;
}>) {
  if (!isUuid(input.organisationId)) {
    throw new Error("Organisation communication identity requires an organisation");
  }

  const sql = input.sql ? sqlOrThrow(input.sql) : sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const identityId = await ensureOrganisationIdentity(sql, input.organisationId);
  await seedOrganisationNotificationPreferences(sql, input.organisationId);

  return identityId;
}

export async function listOrganisationCommunicationChannels(input: Readonly<{
  organisationId: string;
  sql?: Db;
}>) {
  const sql = input.sql ? sqlOrThrow(input.sql) : sqlOrThrow();
  const identityId = await ensureOrganisationCommunicationIdentity({
    organisationId: input.organisationId,
    sql
  });
  const rows = await sql<ChannelRow[]>`
    select *
    from public.communication_channels
    where identity_id = ${identityId}::uuid
    order by preference_rank asc, created_at asc
  `;

  return rows.map(mapChannel);
}

export async function listOrganisationNotificationPreferences(input: Readonly<{
  organisationId: string;
  sql?: Db;
}>) {
  const sql = input.sql ? sqlOrThrow(input.sql) : sqlOrThrow();
  const scope = await organisationCommunicationScope(sql, input.organisationId);
  const allowedEventKeys = new Set<AdminCommunicationEventKey>(
    adminCommunicationEventKeysForScope(scope)
  );

  await ensureOrganisationCommunicationIdentity({
    organisationId: input.organisationId,
    sql
  });

  const rows = await sql<Array<{
    channel_type: string;
    enabled: boolean;
    event_key: string;
    preference_rank: number | string;
    updated_at: Date | string;
  }>>`
    select event_key, channel_type, enabled, preference_rank, updated_at
    from public.organisation_notification_preferences
    where organisation_id = ${input.organisationId}::uuid
    order by event_key asc, preference_rank asc, channel_type asc
  `;

  return rows
    .map((row) => {
      const eventKey = normalizeAdminCommunicationEventKey(row.event_key);
      const channelType = normalizeAdminCommunicationChannelType(row.channel_type);

      if (!eventKey || !channelType) {
        return null;
      }

      if (!allowedEventKeys.has(eventKey)) {
        return null;
      }

      return {
        channelType,
        enabled: Boolean(row.enabled),
        eventKey,
        preferenceRank: Number(row.preference_rank) || adminCommunicationChannelRank(channelType),
        updatedAt: isoDate(row.updated_at) ?? new Date().toISOString()
      } satisfies OrganisationNotificationPreference;
    })
    .filter((row): row is OrganisationNotificationPreference => Boolean(row));
}

export async function upsertOrganisationCommunicationChannel(input: Readonly<{
  address: string;
  channelType: AdminCommunicationChannelType;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
  organisationId: string;
  preferenceRank?: number | null;
  status?: CommunicationChannelStatus | null;
}>) {
  const sql = sqlOrThrow();
  const identityId = await ensureOrganisationCommunicationIdentity({
    organisationId: input.organisationId,
    sql
  });

  return upsertChannel(sql, {
    actorType: "human",
    address: input.address,
    channelType: input.channelType,
    displayName: input.displayName,
    identityId,
    metadata: {
      ...(input.metadata ?? {}),
      organisationId: input.organisationId,
      source: input.metadata?.source ?? "admin_organisation_channel"
    },
    preferenceRank:
      input.preferenceRank ?? adminCommunicationChannelRank(input.channelType),
    status: input.status ?? "active"
  });
}

export async function updateOrganisationNotificationPreference(input: Readonly<{
  channelType: AdminCommunicationChannelType;
  enabled: boolean;
  eventKey: AdminCommunicationEventKey;
  organisationId: string;
  preferenceRank?: number | null;
}>) {
  if (!isUuid(input.organisationId)) {
    throw new Error("Notification preference requires an organisation");
  }

  if (input.eventKey === "admin_test_message") {
    throw new Error("Test messages do not have notification preferences");
  }

  const sql = sqlOrThrow();
  const scope = await organisationCommunicationScope(sql, input.organisationId);

  if (!eventKeyAllowedForScope(input.eventKey, scope)) {
    throw new Error("Notification preference does not belong to this organisation scope");
  }

  await ensureOrganisationCommunicationIdentity({
    organisationId: input.organisationId,
    sql
  });

  const rows = await sql<Array<{
    channel_type: string;
    enabled: boolean;
    event_key: string;
    preference_rank: number | string;
    updated_at: Date | string;
  }>>`
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
      ${input.organisationId}::uuid,
      ${input.eventKey},
      ${input.channelType},
      ${input.enabled},
      ${input.preferenceRank ?? adminCommunicationChannelRank(input.channelType)},
      ${sql.json(toJsonValue({ source: "admin_update" }))},
      now(),
      now()
    )
    on conflict (organisation_id, event_key, channel_type)
    do update set
      enabled = excluded.enabled,
      preference_rank = excluded.preference_rank,
      metadata = organisation_notification_preferences.metadata || excluded.metadata,
      updated_at = now()
    returning event_key, channel_type, enabled, preference_rank, updated_at
  `;
  const row = rows[0];

  return {
    channelType: input.channelType,
    enabled: Boolean(row?.enabled ?? input.enabled),
    eventKey: input.eventKey,
    preferenceRank:
      Number(row?.preference_rank) ||
      input.preferenceRank ||
      adminCommunicationChannelRank(input.channelType),
    updatedAt: isoDate(row?.updated_at ?? new Date()) ?? new Date().toISOString()
  } satisfies OrganisationNotificationPreference;
}

async function assertChannelBelongsToOrganisation(
  sql: Db,
  input: Readonly<{
    channelId: string;
    organisationId: string;
  }>
) {
  const rows = await sql<Array<{ id: string }>>`
    select communication_channels.id::text
    from public.communication_channels
    join public.organisation_communication_identities
      on organisation_communication_identities.identity_id = communication_channels.identity_id
    where communication_channels.id = ${input.channelId}::uuid
      and organisation_communication_identities.organisation_id = ${input.organisationId}::uuid
    limit 1
  `;

  if (!rows[0]) {
    throw new Error("Communication channel not found for this organisation");
  }
}

export async function updateOrganisationCommunicationChannel(input: Readonly<{
  address?: string | null;
  channelId: string;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
  organisationId: string;
  preferenceRank?: number | null;
  status?: CommunicationChannelStatus | null;
}>) {
  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);
  await assertChannelBelongsToOrganisation(sql, {
    channelId: input.channelId,
    organisationId: input.organisationId
  });

  return updateCommunicationChannel({
    address: input.address,
    channelId: input.channelId,
    displayName: input.displayName,
    metadata: input.metadata,
    preferenceRank: input.preferenceRank,
    status: input.status
  });
}

export async function deleteDisabledOrganisationCommunicationChannel(input: Readonly<{
  channelId: string;
  organisationId: string;
}>) {
  if (!isUuid(input.channelId) || !isUuid(input.organisationId)) {
    throw new Error("Communication channel not found for this organisation");
  }

  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);
  await assertChannelBelongsToOrganisation(sql, {
    channelId: input.channelId,
    organisationId: input.organisationId
  });

  const rows = await sql<Array<{ id: string; status: CommunicationChannelStatus }>>`
    select id::text, status
    from public.communication_channels
    where id = ${input.channelId}::uuid
    limit 1
  `;

  if (!rows[0]) {
    throw new Error("Communication channel not found");
  }

  if (rows[0].status !== "disabled") {
    throw new Error("Only disabled communication channels can be deleted");
  }

  await sql`
    delete from public.communication_channels
    where id = ${input.channelId}::uuid
      and status = 'disabled'
  `;
}

export async function createOrganisationLineConnectToken(input: Readonly<{
  displayName?: string | null;
  organisationId: string;
}>) {
  if (!isUuid(input.organisationId)) {
    throw new Error("LINE connection requires an organisation");
  }

  const sql = sqlOrThrow();
  const code = newLineConnectCode();
  const tokenHash = hashLineConnectCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const displayName = optionalText(input.displayName);

  await ensureOrganisationCommunicationIdentity({
    organisationId: input.organisationId,
    sql
  });

  const rows = await sql<Array<{
    id: string;
    expires_at: Date | string;
  }>>`
    insert into public.line_connect_tokens (
      id,
      organisation_id,
      token_hash,
      status,
      expires_at,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${input.organisationId}::uuid,
      ${tokenHash},
      'active',
      ${expiresAt},
      ${sql.json(toJsonValue({
        contactName: displayName,
        displayName,
        source: "admin_connect"
      }))},
      now(),
      now()
    )
    returning id::text, expires_at
  `;

  return {
    code,
    expiresAt: isoDate(rows[0]?.expires_at ?? expiresAt) ?? expiresAt.toISOString(),
    id: rows[0]?.id ?? null
  };
}

function lineSourceMetadata(
  sourceType: "group" | "room" | "user",
  recipientId: string
) {
  return {
    lineSourceType: sourceType,
    lineUserId: recipientId,
    provider: "line",
    requiresIdentityMapping: false,
    source: "line_webhook_connect"
  };
}

export async function consumeOrganisationLineConnectCode(input: Readonly<{
  code: string;
  providerEventId?: string | null;
  rawEvent?: Record<string, unknown>;
  recipientId: string;
  sourceType: "group" | "room" | "user";
}>) {
  const code = cleanText(input.code).toUpperCase();
  const recipientId = normalizeLineUserId(input.recipientId);

  if (!code || !recipientId) {
    return null;
  }

  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const tokenRows = await sql<Array<{
    id: string;
    metadata: unknown;
    organisation_id: string;
  }>>`
    update public.line_connect_tokens
    set
      status = 'consuming',
      updated_at = now()
    where token_hash = ${hashLineConnectCode(code)}
      and status = 'active'
      and consumed_at is null
      and expires_at > now()
    returning id::text, organisation_id::text, metadata
  `;
  const token = tokenRows[0];

  if (!token) {
    return null;
  }

  const tokenMetadata = objectValue(token.metadata);
  const contactName = optionalText(tokenMetadata.contactName) ??
    optionalText(tokenMetadata.displayName);
  const channel = await upsertOrganisationCommunicationChannel({
    address: recipientId,
    channelType: "line",
    displayName:
      contactName ??
      (input.sourceType === "user" ? "LINE" : `LINE ${input.sourceType}`),
    metadata: {
      ...lineSourceMetadata(input.sourceType, recipientId),
      contactName,
      providerEventId: input.providerEventId ?? null
    },
    organisationId: token.organisation_id,
    preferenceRank: adminCommunicationChannelRank("line"),
    status: "active"
  });

  await sql`
    update public.line_connect_tokens
    set
      consumed_at = now(),
      consumed_by_channel_id = ${channel.id}::uuid,
      metadata = metadata || ${sql.json(toJsonValue({
        lineRecipientId: recipientId,
        providerEventId: input.providerEventId ?? null,
        rawEvent: input.rawEvent ?? null,
        sourceType: input.sourceType
      }))}::jsonb,
      status = 'consumed',
      updated_at = now()
    where id = ${token.id}::uuid
  `;

  await writeBpmEvent({
    actorType: "system",
    emittedBy: "line_webhook",
    eventName: "admin_line_channel_connected",
    eventStatus: "succeeded",
    eventType: "chat",
    properties: {
      channelId: channel.id,
      organisationId: token.organisation_id,
      sourceType: input.sourceType
    },
    severity: "low",
    sql
  });

  return {
    channel,
    organisationId: token.organisation_id
  };
}

export async function createCustomerLineConnectToken(input: Readonly<{
  planId: string;
  retailCustomerOrderId?: string | null;
  source?: string | null;
}>) {
  if (!isUuid(input.planId)) {
    throw new Error("LINE connection requires a valid plan");
  }

  const sql = sqlOrThrow();
  const source = optionalText(input.source) ?? "customer_line_cta";
  const orderId = isUuid(input.retailCustomerOrderId ?? "")
    ? input.retailCustomerOrderId!
    : null;

  await ensureCommunicationSchema(sql);

  const assessmentRows = await sql<Array<{ plan_id: string }>>`
    select plan_id::text
    from public.assessments
    where plan_id = ${input.planId}::uuid
    limit 1
  `;

  if (!assessmentRows[0]) {
    throw new Error("Plan not found");
  }

  const orderRows = orderId
    ? await sql<Array<{ id: string }>>`
        select id::text
        from public.retail_customer_orders
        where id = ${orderId}::uuid
        limit 1
      `
    : [];
  const retailCustomerOrderId = orderRows[0]?.id ?? null;
  const code = newLineConnectCode();
  const tokenHash = hashLineConnectCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await ensurePlanIdentity(sql, input.planId);

  const rows = await sql<Array<{
    id: string;
    expires_at: Date | string;
  }>>`
    insert into public.customer_line_connect_tokens (
      id,
      plan_id,
      retail_customer_order_id,
      token_hash,
      status,
      expires_at,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${input.planId}::uuid,
      ${retailCustomerOrderId}::uuid,
      ${tokenHash},
      'active',
      ${expiresAt},
      ${sql.json(toJsonValue({
        retailCustomerOrderId,
        source
      }))},
      now(),
      now()
    )
    returning id::text, expires_at
  `;

  await writeBpmEvent({
    actorType: "visitor",
    emittedBy: "customer_line_connect",
    eventName: "customer_line_connect_code_created",
    eventStatus: "created",
    eventType: "chat",
    planId: input.planId,
    properties: {
      retailCustomerOrderId,
      source,
      tokenId: rows[0]?.id ?? null
    },
    severity: "low",
    sql
  });

  return {
    code,
    expiresAt: isoDate(rows[0]?.expires_at ?? expiresAt) ?? expiresAt.toISOString(),
    id: rows[0]?.id ?? null,
    retailCustomerOrderId
  };
}

export async function consumeCustomerLineConnectCode(input: Readonly<{
  code: string;
  providerEventId?: string | null;
  rawEvent?: Record<string, unknown>;
  recipientId: string;
  sourceType: "group" | "room" | "user";
}>) {
  const code = cleanText(input.code).toUpperCase();
  const recipientId = normalizeLineUserId(input.recipientId);

  if (!code || !recipientId) {
    return null;
  }

  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const tokenRows = await sql<Array<{
    id: string;
    metadata: unknown;
    plan_id: string;
    retail_customer_order_id: string | null;
  }>>`
    update public.customer_line_connect_tokens
    set
      status = 'consuming',
      updated_at = now()
    where token_hash = ${hashLineConnectCode(code)}
      and status = 'active'
      and consumed_at is null
      and expires_at > now()
    returning id::text, plan_id::text, retail_customer_order_id::text, metadata
  `;
  const token = tokenRows[0];

  if (!token) {
    return null;
  }

  const identityId = await ensurePlanIdentity(sql, token.plan_id);
  const tokenMetadata = objectValue(token.metadata);
  const channel = await upsertChannel(sql, {
    actorType: "human",
    address: recipientId,
    channelType: "line",
    displayName: optionalText(tokenMetadata.displayName) ?? "LINE",
    identityId,
    metadata: {
      ...lineSourceMetadata(input.sourceType, recipientId),
      lineRecipientId: recipientId,
      planId: token.plan_id,
      providerEventId: input.providerEventId ?? null,
      retailCustomerOrderId: token.retail_customer_order_id,
      source: "line_webhook_customer_connect"
    },
    preferenceRank: 10,
    status: "active"
  });

  await sql`
    update public.customer_line_connect_tokens
    set
      consumed_at = now(),
      consumed_by_channel_id = ${channel.id}::uuid,
      metadata = metadata || ${sql.json(toJsonValue({
        lineRecipientId: recipientId,
        providerEventId: input.providerEventId ?? null,
        rawEvent: input.rawEvent ?? null,
        sourceType: input.sourceType
      }))}::jsonb,
      status = 'consumed',
      updated_at = now()
    where id = ${token.id}::uuid
  `;

  await writeBpmEvent({
    actorType: "system",
    emittedBy: "line_webhook",
    eventName: "customer_line_channel_connected",
    eventStatus: "succeeded",
    eventType: "chat",
    planId: token.plan_id,
    properties: {
      channelId: channel.id,
      retailCustomerOrderId: token.retail_customer_order_id,
      sourceType: input.sourceType
    },
    severity: "low",
    sql
  });

  return {
    channel,
    planId: token.plan_id,
    retailCustomerOrderId: token.retail_customer_order_id
  };
}

export async function recordInboundLineCommunication(input: Readonly<{
  body: string;
  providerEventId?: string | null;
  rawEvent?: Record<string, unknown>;
  recipientId: string;
  replyToken?: string | null;
  sourceType: "group" | "room" | "user";
}>) {
  const recipientId = normalizeLineUserId(input.recipientId);

  if (!recipientId) {
    throw new Error("Inbound LINE message is missing a recipient id");
  }

  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const channelRows = await sql<Array<{
    channel_id: string | null;
    identity_id: string | null;
    organisation_id: string | null;
    plan_id: string | null;
  }>>`
    select
      communication_channels.id::text as channel_id,
      communication_channels.identity_id::text,
      organisation_communication_identities.organisation_id::text,
      plan_communication_identities.plan_id::text
    from public.communication_channels
    left join public.organisation_communication_identities
      on organisation_communication_identities.identity_id = communication_channels.identity_id
    left join public.plan_communication_identities
      on plan_communication_identities.identity_id = communication_channels.identity_id
    where communication_channels.channel_type = 'line'
      and lower(communication_channels.address) = lower(${recipientId})
    order by communication_channels.updated_at desc
    limit 1
  `;
  const channel = channelRows[0];
  const rows = await sql<MessageRow[]>`
    insert into public.communication_messages (
      id,
      identity_id,
      channel_id,
      plan_id,
      direction,
      message_type,
      status,
      body,
      provider,
      provider_message_id,
      metadata,
      delivered_at,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${channel?.identity_id ?? null}::uuid,
      ${channel?.channel_id ?? null}::uuid,
      ${channel?.plan_id ?? null}::uuid,
      'inbound',
      'line_inbound',
      'delivered',
      ${cleanText(input.body, "LINE message")},
      'line',
      ${input.providerEventId ?? null},
      ${sql.json(toJsonValue({
        commandExecution: "disabled_v1",
        lineRecipientId: recipientId,
        organisationId: channel?.organisation_id ?? null,
        planId: channel?.plan_id ?? null,
        rawEvent: input.rawEvent ?? null,
        replyTokenPresent: Boolean(input.replyToken),
        sourceType: input.sourceType
      }))}::jsonb,
      now(),
      now(),
      now()
    )
    returning *
  `;

  await writeBpmEvent({
    actorType: "system",
    emittedBy: "line_webhook",
    eventName: channel?.plan_id
      ? "customer_line_message_captured"
      : "admin_line_message_captured",
    eventStatus: "captured",
    eventType: "chat",
    planId: channel?.plan_id ?? undefined,
    properties: {
      commandExecution: "disabled_v1",
      hasOrganisation: Boolean(channel?.organisation_id),
      hasPlan: Boolean(channel?.plan_id),
      messageId: rows[0]?.id,
      organisationId: channel?.organisation_id ?? null,
      planId: channel?.plan_id ?? null,
      sourceType: input.sourceType
    },
    severity: "low",
    sql
  });

  return mapMessage(rows[0]);
}

function adminCommunicationDispatchTaskType(channelType: AdminCommunicationChannelType) {
  return channelType === "email"
    ? "dispatch_email_communication_message"
    : "dispatch_chat_communication_message";
}

async function queueCommunicationMessageDispatchTask(input: Readonly<{
  channelType: AdminCommunicationChannelType;
  messageId: string;
  organisationId: string;
}>) {
  const taskType = adminCommunicationDispatchTaskType(input.channelType);
  const isEmail = input.channelType === "email";

  return createTask({
    actorType: "system",
    businessValue: ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY,
    description: `Dispatch queued ${input.channelType.toUpperCase()} admin communication message.`,
    groupLabel: "Admin communication dispatch",
    idempotencyKey: `admin-communication-dispatch:${input.messageId}`,
    idempotencyScope: "successful",
    idempotencyScopeKey: `admin-communication-dispatch:${input.messageId}`,
    maxAttempts: 3,
    payload: {
      channelType: input.channelType,
      messageId: input.messageId,
      targetOrganisationId: input.organisationId
    },
    priorityReason: "Admin communication dispatch is queued for the channel dispatcher.",
    priorityScore: ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY,
    reasoningEffort: "none",
    requiredCapabilities: isEmail
      ? [AGENT_CAPABILITIES.emailSend]
      : [AGENT_CAPABILITIES.communicationDispatch, AGENT_CAPABILITIES.lineSend],
    sourceEntityId: input.messageId,
    sourceEntityType: "communication_message",
    taskType,
    title: isEmail ? "Dispatch admin email" : "Dispatch admin LINE message"
  });
}

export async function queueCustomerChatCommunicationDispatchTask(input: Readonly<{
  createdByTaskId?: string | null;
  messageId: string;
  planId?: string | null;
}>) {
  if (!isUuid(input.messageId)) {
    throw new Error("Customer chat dispatch requires a message");
  }

  return createTask({
    actorType: "system",
    businessValue: ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY,
    createdByTaskId: input.createdByTaskId ?? null,
    description: "Dispatch a queued customer chat reply through LINE.",
    groupLabel: "Customer chat dispatch",
    idempotencyKey: `customer-chat-dispatch:${input.messageId}`,
    idempotencyScope: "successful",
    idempotencyScopeKey: `customer-chat-dispatch:${input.messageId}`,
    maxAttempts: 3,
    payload: {
      channelType: "line",
      messageId: input.messageId
    },
    planId: input.planId ?? null,
    priorityReason: "Panya reply is queued for the chat dispatcher.",
    priorityScore: ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY,
    reasoningEffort: "none",
    requiredCapabilities: [
      AGENT_CAPABILITIES.communicationDispatch,
      AGENT_CAPABILITIES.lineSend
    ],
    sourceEntityId: input.messageId,
    sourceEntityType: "communication_message",
    taskType: "dispatch_chat_communication_message",
    title: "Dispatch Panya LINE reply"
  });
}

function orderEventCopy(input: Readonly<{
  customerName: string | null;
  eventKey: AdminCommunicationEventKey;
  lineCount: number;
  orderNumber: string | null;
  status: string | null;
}>) {
  const orderNumber = input.orderNumber ?? "customer order";
  const customer = input.customerName ? ` for ${input.customerName}` : "";
  const itemSummary = input.lineCount === 1 ? "1 item" : `${input.lineCount} items`;
  const testMessageCopy = {
    body: "This is a MattaNutra admin communication test message.",
    subject: "MattaNutra admin communication test"
  };
  const copies: Partial<Record<AdminCommunicationEventKey, { body: string; subject: string }>> = {
    admin_test_message: testMessageCopy,
    retail_order_awaiting_stock: {
      body: `${orderNumber}${customer} is awaiting stock. Review reorder advice or the active shopping lists. Basket: ${itemSummary}.`,
      subject: `${orderNumber} is awaiting stock`
    },
    retail_order_cancelled: {
      body: `${orderNumber}${customer} has been cancelled. No further fulfilment action is required unless stock or refund handling is pending.`,
      subject: `${orderNumber} was cancelled`
    },
    retail_order_created: {
      body: `${orderNumber}${customer} has been paid and created. Allocate stock or review shortages. Basket: ${itemSummary}.`,
      subject: `New paid order ${orderNumber}`
    },
    retail_order_delivered: {
      body: `${orderNumber}${customer} has been marked delivered.`,
      subject: `${orderNumber} delivered`
    },
    retail_order_pickup_booked: {
      body: `${orderNumber}${customer} has a courier pickup booked. Review the pickup window and keep the parcel ready for handover. Basket: ${itemSummary}.`,
      subject: `${orderNumber} pickup booked`
    },
    retail_order_ready_to_pack: {
      body: `${orderNumber}${customer} has stock available and is ready to pack. Basket: ${itemSummary}.`,
      subject: `${orderNumber} is ready to pack`
    },
    retail_order_ready_to_ship: {
      body: `${orderNumber}${customer} is allocated and ready to ship. Pack it, add tracking if available, then mark it shipped.`,
      subject: `${orderNumber} is ready to ship`
    },
    retail_order_returned: {
      body: `${orderNumber}${customer} has been marked returned. Review stock and settlement handling if needed.`,
      subject: `${orderNumber} was returned`
    },
    retail_order_shipment_exception: {
      body: `${orderNumber}${customer} has a shipment exception. Review the carrier timeline and decide the next action.`,
      subject: `${orderNumber} shipment exception`
    },
    retail_order_shipped: {
      body: `${orderNumber}${customer} has been marked shipped.`,
      subject: `${orderNumber} shipped`
    },
    retail_settlement_needs_review: {
      body: "A retailer settlement needs review because the related order was cancelled, returned, or adjusted after shipment. Review the Retail Financials page before reconciling.",
      subject: "Retail settlement needs review"
    },
    retail_settlement_payout_paid: {
      body: "A retailer payout has been marked paid by MattaNutra. Review Retail Financials and confirm receipt when the funds arrive.",
      subject: "Retail payout sent"
    }
  };

  return copies[input.eventKey] ?? testMessageCopy;
}

function platformEventCopy(eventKey: AdminCommunicationEventKey) {
  const copies: Partial<Record<AdminCommunicationEventKey, { body: string; subject: string }>> = {
    platform_checkout_failed: {
      body: "A customer checkout failed before payment could be completed. Review the checkout logs and payment configuration.",
      subject: "Platform checkout failure"
    },
    platform_carrier_integration_failed: {
      body: "A carrier integration failed while creating a shipment, generating a label, booking pickup, or processing a provider event. Review carrier tasks and shipment events.",
      subject: "Carrier integration failure"
    },
    platform_communication_failed: {
      body: "A platform communication failed or had no usable channel. Review the Communications log and dispatch tasks.",
      subject: "Platform communication failure"
    },
    platform_payment_failed: {
      body: "A customer payment failed or expired. Review Stripe/mock payment records and the customer checkout state.",
      subject: "Platform payment failure"
    },
    platform_payout_failed: {
      body: "A Stripe payout failed or was cancelled. Review payout reconciliation and finance ledger state.",
      subject: "Platform payout failure"
    },
    platform_revenue_received: {
      body: "A customer payment was received. Review the finance ledger for the recorded revenue and payment details.",
      subject: "Platform revenue received"
    },
    platform_retailer_payout_due: {
      body: "A retailer settlement is now due because an order has shipped. Review platform Financials and pay the retailer when ready.",
      subject: "Retailer payout due"
    },
    platform_retailer_settlement_needs_review: {
      body: "A retailer settlement needs platform review because the related order was cancelled, returned, or adjusted after shipment.",
      subject: "Retailer settlement needs review"
    },
    platform_task_stuck: {
      body: "A platform task appears stuck or overdue. Review task health and worker availability.",
      subject: "Platform task needs attention"
    },
    platform_technical_alert: {
      body: "A platform technical alert was raised. Review admin alerts and recent runtime errors.",
      subject: "Platform technical alert"
    },
    platform_worker_unavailable: {
      body: "A worker or required agent capability is unavailable. Review worker registration and capability health.",
      subject: "Platform worker unavailable"
    }
  };

  return copies[eventKey] ?? {
    body: "A MattaNutra platform notification was raised.",
    subject: "MattaNutra platform notification"
  };
}

async function adminCommunicationCopy(input: Readonly<{
  body?: string | null;
  eventKey: AdminCommunicationEventKey;
  resourceId?: string | null;
  resourceType?: string | null;
  subject?: string | null;
  sql: Db;
}>) {
  const subject = optionalText(input.subject);
  const body = optionalText(input.body);

  if (subject && body) {
    return { body, subject };
  }

  const resourceId = input.resourceId ?? null;

  if (
    input.resourceType === "retail_customer_order" &&
    resourceId &&
    isUuid(resourceId)
  ) {
    const sql = input.sql;
    const rows = await sql<Array<{
      customer_name: string | null;
      line_count: number | string;
      order_number: string | null;
      status: string | null;
    }>>`
      select
        retail_customer_orders.order_number,
        retail_customer_orders.customer_name,
        retail_customer_orders.status,
        count(retail_customer_order_lines.id)::int as line_count
      from public.retail_customer_orders
      left join public.retail_customer_order_lines
        on retail_customer_order_lines.customer_order_id = retail_customer_orders.id
      where retail_customer_orders.id = ${resourceId}::uuid
      group by retail_customer_orders.id
      limit 1
    `;
    const row = rows[0];
    const copy = orderEventCopy({
      customerName: row?.customer_name ?? null,
      eventKey: input.eventKey,
      lineCount: Number(row?.line_count) || 0,
      orderNumber: row?.order_number ?? null,
      status: row?.status ?? null
    });

    return {
      body: body ?? copy.body,
      subject: subject ?? copy.subject
    };
  }

  if (input.eventKey.startsWith("platform_")) {
    const copy = platformEventCopy(input.eventKey);

    return {
      body: body ?? copy.body,
      subject: subject ?? copy.subject
    };
  }

  const copy = orderEventCopy({
    customerName: null,
    eventKey: input.eventKey,
    lineCount: 0,
    orderNumber: null,
    status: null
  });

  return {
    body: body ?? copy.body,
    subject: subject ?? copy.subject
  };
}

export async function routeAdminCommunication(input: Readonly<{
  body?: string | null;
  channelType?: AdminCommunicationChannelType | null;
  eventKey: AdminCommunicationEventKey;
  metadata?: Record<string, unknown>;
  organisationId: string;
  resourceId?: string | null;
  resourceType?: string | null;
  subject?: string | null;
  taskId?: string | null;
}>) {
  const sql = sqlOrThrow();
  const scope = await organisationCommunicationScope(sql, input.organisationId);

  if (!eventKeyAllowedForScope(input.eventKey, scope)) {
    throw new Error("Admin communication event does not belong to this organisation scope");
  }

  const identityId = await ensureOrganisationCommunicationIdentity({
    organisationId: input.organisationId,
    sql
  });
  const copy = await adminCommunicationCopy({
    body: input.body,
    eventKey: input.eventKey,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    sql,
    subject: input.subject
  });
  const forcedChannelType = input.channelType ?? null;
  const preferences = input.eventKey === "admin_test_message"
    ? ADMIN_COMMUNICATION_CHANNEL_TYPES.map((channelType) => ({
        channelType,
        enabled: true,
        eventKey: input.eventKey,
        preferenceRank: adminCommunicationChannelRank(channelType),
        updatedAt: new Date().toISOString()
      } satisfies OrganisationNotificationPreference))
    : await listOrganisationNotificationPreferences({
        organisationId: input.organisationId,
        sql
      });
  const enabledTypes = new Set(
    preferences
      .filter((preference) => preference.eventKey === input.eventKey)
      .filter((preference) => preference.enabled)
      .filter((preference) => !forcedChannelType || preference.channelType === forcedChannelType)
      .sort((left, right) => left.preferenceRank - right.preferenceRank)
      .map((preference) => preference.channelType)
  );

  if (enabledTypes.size === 0) {
    await writeBpmEvent({
      actorType: "system",
      emittedBy: "admin_communications",
      eventName: "admin_communication_suppressed",
      eventStatus: "preference_disabled",
      eventType: "system",
      properties: {
        eventKey: input.eventKey,
        organisationId: input.organisationId,
        resourceId: input.resourceId ?? null,
        resourceType: input.resourceType ?? null
      },
      severity: "low",
      sql
    });

    return {
      dispatchTasks: [],
      messages: []
    };
  }

  const broadcastChannels = (
    await sql<ChannelRow[]>`
      select *
      from public.communication_channels
      where identity_id = ${identityId}::uuid
        and status = 'active'
        and channel_type = any(${[...enabledTypes]}::text[])
      order by preference_rank asc, created_at asc
    `
  )
    .map(mapChannel)
    .filter((channel): channel is CommunicationChannel & { channelType: AdminCommunicationChannelType } =>
      channel.channelType === "email" || channel.channelType === "line"
    );
  const taskId = isUuid(input.taskId ?? "") ? input.taskId! : null;

  if (broadcastChannels.length === 0) {
    const rows = await sql<MessageRow[]>`
      insert into public.communication_messages (
        id,
        identity_id,
        channel_id,
        task_id,
        direction,
        message_type,
        status,
        subject,
        body,
        provider,
        error_message,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${randomUUID()}::uuid,
        ${identityId}::uuid,
        null,
        ${taskId}::uuid,
        'outbound',
        ${input.eventKey},
        'no_channel',
        ${copy.subject},
        ${copy.body},
        ${forcedChannelType},
        'No active organisation communication channel is configured',
        ${sql.json(toJsonValue({
          ...(input.metadata ?? {}),
          eventKey: input.eventKey,
          organisationId: input.organisationId,
          resourceId: input.resourceId ?? null,
          resourceType: input.resourceType ?? null
        }))}::jsonb,
        now(),
        now()
      )
      returning *
    `;

    await writeBpmEvent({
      actorType: "system",
      emittedBy: "admin_communications",
      eventName: "admin_communication_no_channel",
      eventStatus: "no_channel",
      eventType: "chat",
      properties: {
        eventKey: input.eventKey,
        messageId: rows[0]?.id,
        organisationId: input.organisationId,
        resourceId: input.resourceId ?? null,
        resourceType: input.resourceType ?? null
      },
      severity: "medium",
      sql
    });

    return {
      dispatchTasks: [],
      messages: rows.map(mapMessage)
    };
  }

  const messages: CommunicationMessage[] = [];
  const dispatchTasks: Array<{ created: boolean; taskId: string; taskType: string }> = [];

  // Organisation notifications are broadcasts: every subscribed active channel
  // gets its own immutable message and dispatch task.
  for (const channel of broadcastChannels) {
    const rows = await sql<MessageRow[]>`
      insert into public.communication_messages (
        id,
        identity_id,
        channel_id,
        task_id,
        direction,
        message_type,
        status,
        subject,
        body,
        provider,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${randomUUID()}::uuid,
        ${identityId}::uuid,
        ${channel.id}::uuid,
        ${taskId}::uuid,
        'outbound',
        ${input.eventKey},
        'queued',
        ${copy.subject},
        ${copy.body},
        ${channel.channelType},
        ${sql.json(toJsonValue({
          ...(input.metadata ?? {}),
          channelType: channel.channelType,
          eventKey: input.eventKey,
          organisationId: input.organisationId,
          resourceId: input.resourceId ?? null,
          resourceType: input.resourceType ?? null
        }))}::jsonb,
        now(),
        now()
      )
      returning *
    `;
    const message = mapMessage(rows[0]);
    const { created, task } = await queueCommunicationMessageDispatchTask({
      channelType: channel.channelType,
      messageId: message.id,
      organisationId: input.organisationId
    });

    messages.push(message);
    dispatchTasks.push({
      created,
      taskId: task.id,
      taskType: task.taskType
    });
  }

  await writeBpmEvent({
    actorType: "system",
    emittedBy: "admin_communications",
    eventName: "admin_communication_routed",
    eventStatus: "queued",
    eventType: broadcastChannels.some((channel) => channel.channelType === "line") ? "chat" : "email",
    properties: {
      broadcastChannelCount: broadcastChannels.length,
      broadcastChannelIds: broadcastChannels.map((channel) => channel.id),
      channelTypes: broadcastChannels.map((channel) => channel.channelType),
      eventKey: input.eventKey,
      messageCount: messages.length,
      organisationId: input.organisationId,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? null
    },
    severity: "low",
    sql
  });

  return {
    dispatchTasks,
    messages
  };
}

export async function queueAdminOrganisationCommunication(input: Readonly<{
  body?: string | null;
  channelType?: AdminCommunicationChannelType | null;
  eventKey: AdminCommunicationEventKey;
  metadata?: Record<string, unknown>;
  organisationId: string;
  resourceId?: string | null;
  resourceType?: string | null;
  subject?: string | null;
}>) {
  const sql = sqlOrThrow();
  const scope = await organisationCommunicationScope(sql, input.organisationId);

  if (!eventKeyAllowedForScope(input.eventKey, scope)) {
    throw new Error("Admin communication event does not belong to this organisation scope");
  }

  const resourceType = cleanText(input.resourceType, "none");
  const resourceId = cleanText(input.resourceId, "none");
  const channelType = input.channelType ?? "all";
  const idempotencyKey =
    `admin-communication:${input.organisationId}:${input.eventKey}:${resourceType}:${resourceId}:${channelType}`;
  const { created, task } = await createTask({
    actorType: "system",
    businessValue: ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY,
    description:
      "Route an admin organisation communication through configured organisation channels.",
    groupLabel: "Admin communication",
    idempotencyKey,
    idempotencyScope:
      input.eventKey === "admin_test_message" ? "active" : "successful",
    idempotencyScopeKey: `admin-communication:${input.organisationId}`,
    maxAttempts: 3,
    payload: {
      body: input.body ?? null,
      channelType: input.channelType ?? null,
      eventKey: input.eventKey,
      metadata: input.metadata ?? {},
      organisationId: input.organisationId,
      targetOrganisationId: input.organisationId,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? null,
      subject: input.subject ?? null
    },
    priorityReason:
      "Organisation notification is queued for the communications coordinator.",
    priorityScore: ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY,
    reasoningEffort: "none",
    requiredCapabilities: [AGENT_CAPABILITIES.communicationRoute],
    sourceEntityId: isUuid(input.resourceId ?? "") ? input.resourceId : null,
    sourceEntityType: input.resourceType ?? "admin_communication",
    taskType: "route_admin_communication",
    title: `Route ${input.eventKey.replaceAll("_", " ")} notification`
  });

  await writeBpmEvent({
    actorType: "system",
    emittedBy: "admin_communications",
    eventName: created
      ? "admin_communication_task_queued"
      : "admin_communication_task_reused",
    eventStatus: created ? "queued" : "duplicate_reused",
    eventType: "system",
    properties: {
      eventKey: input.eventKey,
      idempotencyKey,
      organisationId: input.organisationId,
      priorityScore: ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? null,
      taskId: task.id,
      taskType: task.taskType
    },
    severity: "low"
  });

  return {
    created,
    task
  };
}

export async function queuePlatformAdminCommunication(input: Readonly<{
  body?: string | null;
  channelType?: AdminCommunicationChannelType | null;
  eventKey: Extract<AdminCommunicationEventKey, `platform_${string}`>;
  metadata?: Record<string, unknown>;
  resourceId?: string | null;
  resourceType?: string | null;
  subject?: string | null;
}>) {
  const sql = sqlOrThrow();
  const organisationId = await platformOrganisationId(sql);

  return queueAdminOrganisationCommunication({
    body: input.body,
    channelType: input.channelType,
    eventKey: input.eventKey,
    metadata: input.metadata,
    organisationId,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    subject: input.subject
  });
}

export async function executeAdminCommunicationRouteTask(input: Readonly<{
  body?: string | null;
  channelType?: AdminCommunicationChannelType | null;
  eventKey: AdminCommunicationEventKey;
  metadata?: Record<string, unknown>;
  organisationId: string;
  resourceId?: string | null;
  resourceType?: string | null;
  subject?: string | null;
  taskId: string;
}>) {
  return routeAdminCommunication(input);
}

export async function executeCommunicationDispatchTask(input: Readonly<{
  messageId: string;
}>) {
  return dispatchCommunicationMessage(input.messageId);
}

export async function ensurePlanCommunicationIdentity(input: Readonly<{
  planId: string;
}>) {
  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const identityId = await ensurePlanIdentity(sql, input.planId);
  await seedKnownPlanChannels(sql, input.planId, identityId);

  return identityId;
}

export async function upsertCommunicationChannel(input: Readonly<{
  actorType?: CommunicationChannel["actorType"] | null;
  address: string;
  channelType: CommunicationChannelType;
  displayName?: string | null;
  identityId?: string | null;
  metadata?: Record<string, unknown>;
  planId?: string | null;
  preferenceRank?: number | null;
  status?: CommunicationChannelStatus | null;
}>) {
  const sql = sqlOrThrow();
  const channelType = normalizeCommunicationChannelType(input.channelType);

  if (!channelType) {
    throw new Error("Communication channel type is not valid");
  }

  await ensureCommunicationSchema(sql);

  const identityId = isUuid(input.identityId ?? "")
    ? input.identityId!
    : isUuid(input.planId ?? "")
      ? await ensurePlanIdentity(sql, input.planId!)
      : null;

  if (!identityId) {
    throw new Error("Communication channel requires a planId or identityId");
  }

  if (input.planId && isUuid(input.planId)) {
    await seedKnownPlanChannels(sql, input.planId, identityId);
  }

  return upsertChannel(sql, {
    actorType: input.actorType,
    address: input.address,
    channelType,
    displayName: input.displayName,
    identityId,
    metadata: input.metadata,
    preferenceRank: input.preferenceRank,
    status: input.status
  });
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

export async function recordEmailCommunicationDelivery(input: Readonly<{
  body: string;
  emailHtml?: string | null;
  messageId?: string | null;
  messageType: string;
  metadata?: Record<string, unknown>;
  planId: string;
  reason?: string | null;
  sent: boolean;
  sql?: Db;
  subject?: string | null;
  taskId?: string | null;
  to: string;
}>) {
  const sql = input.sql ? sqlOrThrow(input.sql) : sqlOrThrow();
  const emailValidation = validateLeadEmail(input.to);

  if (!emailValidation.ok || !isUuid(input.planId)) {
    throw new Error("Communication email delivery is missing identifiers");
  }

  await ensureCommunicationSchema(sql);

  const planId = input.planId;
  const taskId = isUuid(input.taskId ?? "") ? input.taskId! : null;
  const status: CommunicationMessageStatus = input.sent ? "sent" : "failed";
  const errorMessage = input.sent ? null : optionalText(input.reason);
  const identityId = await ensurePlanIdentity(sql, planId);
  await seedKnownPlanChannels(sql, planId, identityId);
  const channel = await upsertChannel(sql, {
    actorType: "human",
    address: emailValidation.email,
    channelType: "email",
    displayName: "Email",
    identityId,
    metadata: {
      source: "email_delivery"
    },
    preferenceRank: 80,
    status: "active"
  });
  const sentAt = input.sent ? new Date() : null;
  const rows = await sql<MessageRow[]>`
    insert into public.communication_messages (
      id,
      identity_id,
      channel_id,
      plan_id,
      task_id,
      direction,
      message_type,
      status,
      subject,
      body,
      html,
      provider,
      provider_message_id,
      error_message,
      metadata,
      sent_at,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${identityId}::uuid,
      ${channel.id}::uuid,
      ${planId}::uuid,
      ${taskId}::uuid,
      'outbound',
      ${cleanText(input.messageType, "email")},
      ${status},
      ${optionalText(input.subject)},
      ${cleanText(input.body, "Email sent from MattaNutra")},
      ${optionalText(input.emailHtml)},
      'email',
      ${optionalText(input.messageId)},
      ${errorMessage},
      ${sql.json(toJsonValue(input.metadata ?? {}))},
      ${sentAt},
      now(),
      now()
    )
    returning *
  `;

  return mapMessage(rows[0]);
}

export async function listCommunicationChannels(input: Readonly<{
  identityId?: string | null;
  planId?: string | null;
}>) {
  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const identityId = isUuid(input.identityId ?? "")
    ? input.identityId!
    : isUuid(input.planId ?? "")
      ? await ensurePlanIdentity(sql, input.planId!)
      : null;

  if (!identityId) {
    return [];
  }

  if (input.planId && isUuid(input.planId)) {
    await seedKnownPlanChannels(sql, input.planId, identityId);
  }

  const rows = await sql<ChannelRow[]>`
    select *
    from public.communication_channels
    where identity_id = ${identityId}::uuid
    order by preference_rank asc, created_at asc
  `;

  return rows.map(mapChannel);
}

function plainTextEmailHtml(subject: string | null, body: string) {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  return [
    "<!doctype html><html><body>",
    subject ? `<h1>${escape(subject)}</h1>` : "",
    `<p>${escape(body).replaceAll("\n", "<br>")}</p>`,
    "</body></html>"
  ].join("");
}

export async function sendCommunication(input: Readonly<{
  body: string;
  channelType?: CommunicationChannelType | null;
  html?: string | null;
  identityId?: string | null;
  messageType?: string | null;
  metadata?: Record<string, unknown>;
  planId?: string | null;
  subject?: string | null;
  taskId?: string | null;
}>) {
  const sql = sqlOrThrow();
  const planId = isUuid(input.planId ?? "") ? input.planId! : null;
  const forcedChannelType = normalizeCommunicationChannelType(input.channelType);

  await ensureCommunicationSchema(sql);

  const identityId = isUuid(input.identityId ?? "")
    ? input.identityId!
    : planId
      ? await ensurePlanIdentity(sql, planId)
      : null;

  if (planId && identityId) {
    await seedKnownPlanChannels(sql, planId, identityId);
  }

  const channels = identityId
    ? (
        await sql<ChannelRow[]>`
          select *
          from public.communication_channels
          where identity_id = ${identityId}::uuid
          order by preference_rank asc, created_at asc
        `
      ).map(mapChannel)
    : [];
  const selected = selectBestCommunicationChannel<CommunicationChannel>(
    channels,
    forcedChannelType
  );
  const metadata = {
    ...(input.metadata ?? {}),
    selectedChannelType: selected?.channelType ?? forcedChannelType ?? null
  };
  const messageStatus = selected ? "queued" : "no_channel";
  const provider = selected?.channelType ?? null;
  const taskId = isUuid(input.taskId ?? "") ? input.taskId! : null;
  const inserted = await sql<MessageRow[]>`
    insert into public.communication_messages (
      id,
      identity_id,
      channel_id,
      plan_id,
      task_id,
      direction,
      message_type,
      status,
      subject,
      body,
      html,
      provider,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${identityId ?? null}::uuid,
      ${selected?.id ?? null}::uuid,
      ${planId ?? null}::uuid,
      ${taskId}::uuid,
      'outbound',
      ${cleanText(input.messageType, "general")},
      ${messageStatus},
      ${optionalText(input.subject)},
      ${cleanText(input.body, "Message")},
      ${optionalText(input.html)},
      ${provider},
      ${sql.json(toJsonValue(metadata))},
      now(),
      now()
    )
    returning *
  `;
  const prepared = {
    channel: selected,
    message: mapMessage(inserted[0])
  };

  if (!prepared.channel) {
    if (planId) {
      await writeBpmEvent({
        actorType: "worker",
        eventName: "communication_channel_missing",
        eventStatus: "failed",
        eventType: "system",
        planId,
        properties: {
          messageId: prepared.message.id,
          messageType: prepared.message.messageType
        },
        severity: "medium"
      });
    }

    return prepared;
  }

  if (prepared.channel.channelType !== "email") {
    if (planId) {
      await writeBpmEvent({
        actorType: "worker",
        eventName: "communication_queued",
        eventStatus: "observed",
        eventType: "chat",
        planId,
        properties: {
          channelType: prepared.channel.channelType,
          messageId: prepared.message.id,
          messageType: prepared.message.messageType
        }
      });
    }

    return prepared;
  }

  const delivery = await sendTransactionalEmail({
    html:
      input.html ??
      plainTextEmailHtml(input.subject ?? "MattaNutra update", input.body),
    subject: input.subject ?? "MattaNutra update",
    to: prepared.channel.address
  });
  const updated = await sql<MessageRow[]>`
    update public.communication_messages
    set
      status = ${delivery.sent ? "sent" : "failed"},
      sent_at = ${delivery.sent ? new Date() : null},
      provider_message_id = ${delivery.messageId ?? null},
      error_message = ${delivery.reason ?? null},
      updated_at = now()
    where id = ${prepared.message.id}::uuid
    returning *
  `;

  if (planId) {
    await writeBpmEvent({
      actorType: "worker",
      eventName: delivery.sent ? "communication_sent" : "communication_failed",
      eventStatus: delivery.sent ? "succeeded" : "failed",
      eventType: "email",
      planId,
      properties: {
        channelType: "email",
        messageId: prepared.message.id,
        messageType: prepared.message.messageType,
        providerMessageId: delivery.messageId,
        reason: delivery.reason
      },
      severity: delivery.sent ? "low" : "medium"
    });
  }

  return {
    channel: prepared.channel,
    message: mapMessage(updated[0])
  };
}

export async function listCommunicationMessages(input: Readonly<{
  channelType?: CommunicationChannelType | null;
  limit?: number | null;
  planId?: string | null;
  status?: CommunicationMessageStatus | null;
}>) {
  const sql = sqlOrThrow();
  const limit = Math.min(100, Math.max(1, Math.round(input.limit ?? 50)));
  const channelType = input.channelType ?? null;
  const planId = isUuid(input.planId ?? "") ? input.planId! : null;
  const status = input.status ?? null;

  await ensureCommunicationSchema(sql);

  const rows = await sql<MessageRow[]>`
    select communication_messages.*
    from public.communication_messages
    left join public.communication_channels
      on communication_channels.id = communication_messages.channel_id
    where (${status}::text is null or communication_messages.status = ${status})
      and (${planId}::uuid is null or communication_messages.plan_id = ${planId}::uuid)
      and (${channelType}::text is null or communication_channels.channel_type = ${channelType})
    order by communication_messages.created_at asc
    limit ${limit}
  `;

  return rows.map(mapMessage);
}

export async function getCommunicationMessage(messageId: string) {
  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const rows = await sql<MessageRow[]>`
    select *
    from public.communication_messages
    where id = ${messageId}::uuid
    limit 1
  `;

  return rows[0] ? mapMessage(rows[0]) : null;
}

export async function updateCommunicationMessageStatus(input: Readonly<{
  errorMessage?: string | null;
  messageId: string;
  providerMessageId?: string | null;
  status: CommunicationMessageStatus;
}>) {
  if (!MESSAGE_STATUSES.has(input.status)) {
    throw new Error("Communication message status is not valid");
  }

  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const rows = await sql<MessageRow[]>`
    update public.communication_messages
    set
      status = ${input.status},
      provider_message_id = coalesce(${input.providerMessageId ?? null}, provider_message_id),
      error_message = ${input.errorMessage ?? null},
      sent_at = case
        when ${input.status} in ('sent', 'delivered') then coalesce(sent_at, now())
        else sent_at
      end,
      delivered_at = case
        when ${input.status} = 'delivered' then coalesce(delivered_at, now())
        else delivered_at
      end,
      updated_at = now()
    where id = ${input.messageId}::uuid
    returning *
  `;

  if (!rows[0]) {
    throw new Error("Communication message not found");
  }

  const message = mapMessage(rows[0]);
  const metadata = objectValue(message.metadata);
  const safetyReviewId = cleanText(metadata.safetyReviewId);

  if (isUuid(safetyReviewId)) {
    const nextStatus =
      input.status === "delivered" || input.status === "sent"
        ? "sent"
        : input.status === "failed"
          ? "failed"
          : null;

    if (nextStatus) {
      await sql`
        update public.safety_reviews
        set
          client_notification_status = ${nextStatus},
          client_informed_at = case
            when ${nextStatus} = 'sent' then coalesce(client_informed_at, now())
            else client_informed_at
          end,
          updated_at = now()
        where id = ${safetyReviewId}::uuid
      `;
    }
  }

  return message;
}

async function sendPreparedEmailMessage(
  message: CommunicationMessage,
  channel: CommunicationChannel
): Promise<CommunicationDispatchResult> {
  const delivery = await sendTransactionalEmail({
    html:
      message.html ??
      plainTextEmailHtml(message.subject ?? "MattaNutra update", message.body),
    subject: message.subject ?? "MattaNutra update",
    to: channel.address
  });
  const updated = await updateCommunicationMessageStatus({
    errorMessage: delivery.reason ?? null,
    messageId: message.id,
    providerMessageId: delivery.messageId ?? null,
    status: delivery.sent ? "sent" : "failed"
  });

  if (message.planId) {
    await writeBpmEvent({
      actorType: "worker",
      eventName: delivery.sent
        ? "communication_retry_sent"
        : "communication_retry_failed",
      eventStatus: delivery.sent ? "succeeded" : "failed",
      eventType: "email",
      planId: message.planId,
      properties: {
        channelType: "email",
        messageId: message.id,
        messageType: message.messageType,
        providerMessageId: delivery.messageId,
        reason: delivery.reason
      },
      severity: delivery.sent ? "low" : "medium"
    });
  }

  return {
    attempted: true,
    configured: true,
    message: updated,
    provider: "email",
    reason: delivery.reason ?? null
  };
}

async function claimCommunicationRetry(
  sql: Db,
  input: CommunicationRetryClaimInput
): Promise<PreparedRetryMessage> {
  if (!input.selected) {
    const updated = await sql<MessageRow[]>`
      update public.communication_messages
      set
        identity_id = coalesce(${input.identityId ?? null}::uuid, identity_id),
        channel_id = null,
        provider = null,
        status = 'no_channel',
        error_message = 'Awaiting a contact channel for this plan',
        updated_at = now()
      where id = ${input.messageId}::uuid
        and status not in ('sent', 'delivered')
      returning *
    `;

    if (updated[0]) {
      return {
        channel: null,
        message: mapMessage(updated[0])
      };
    }
  } else {
    const updated = await sql<MessageRow[]>`
      update public.communication_messages
      set
        identity_id = coalesce(${input.identityId ?? null}::uuid, identity_id),
        channel_id = ${input.selected.id}::uuid,
        provider = ${input.selected.channelType},
        status = 'queued',
        error_message = null,
        metadata = metadata || ${sql.json(
          toJsonValue({
            retrySelectedChannelType: input.selected.channelType,
            retryStartedAt: new Date().toISOString()
          })
        )}::jsonb,
        updated_at = now()
      where id = ${input.messageId}::uuid
        and status not in ('sent', 'delivered')
      returning *
    `;

    if (updated[0]) {
      return {
        channel: input.selected,
        message: mapMessage(updated[0])
      };
    }
  }

  const rows = await sql<MessageRow[]>`
    select *
    from public.communication_messages
    where id = ${input.messageId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Communication message not found");
  }

  return {
    channel: null,
    message: mapMessage(row)
  };
}

export async function retryCommunicationMessage(messageId: string) {
  if (!isUuid(messageId)) {
    throw new Error("Communication message not found");
  }

  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const initialRows = await sql<MessageRow[]>`
    select *
    from public.communication_messages
    where id = ${messageId}::uuid
    limit 1
  `;
  const initial = initialRows[0];

  if (!initial) {
    throw new Error("Communication message not found");
  }

  if (initial.status === "sent" || initial.status === "delivered") {
    return {
      attempted: false,
      configured: true,
      message: mapMessage(initial),
      provider: initial.provider,
      reason: "Message is already complete"
    } satisfies CommunicationDispatchResult;
  }

  const planId = isUuid(initial.plan_id ?? "") ? initial.plan_id : null;
  const identityId = isUuid(initial.identity_id ?? "")
    ? initial.identity_id
    : planId
      ? await ensurePlanIdentity(sql, planId)
      : null;

  if (planId && identityId) {
    await seedKnownPlanChannels(sql, planId, identityId);
  }

  const channels = identityId
    ? (
        await sql<ChannelRow[]>`
          select *
          from public.communication_channels
          where identity_id = ${identityId}::uuid
          order by preference_rank asc, created_at asc
        `
      ).map(mapChannel)
    : [];
  const selected = selectBestCommunicationChannel(channels);
  const prepared = await claimCommunicationRetry(sql, {
    identityId,
    messageId,
    selected
  });

  if (!prepared.channel) {
    return {
      attempted: false,
      configured: true,
      message: prepared.message,
      provider: prepared.message.provider,
      reason:
        prepared.message.status === "no_channel"
          ? "Awaiting a contact channel for this plan"
          : "Message is already complete"
    } satisfies CommunicationDispatchResult;
  }

  if (prepared.channel.channelType === "email") {
    return sendPreparedEmailMessage(prepared.message, prepared.channel);
  }

  return dispatchCommunicationMessage(messageId);
}

function lineRecipient(row: DeliveryTargetRow) {
  const messageMetadata = objectValue(row.metadata);
  const channelMetadata = objectValue(row.delivery_channel_metadata);

  return (
    normalizeLineUserId(messageMetadata.lineUserId) ||
    normalizeLineUserId(messageMetadata.userId) ||
    normalizeLineUserId(channelMetadata.lineUserId) ||
    normalizeLineUserId(channelMetadata.userId) ||
    normalizeLineUserId(row.delivery_address)
  );
}

async function deliverLineMessage(row: DeliveryTargetRow) {
  const accessToken = configuredLineAccessToken();

  if (!accessToken) {
    return {
      attempted: false,
      configured: false,
      message: mapMessage(row),
      provider: "line",
      reason: "LINE_CHANNEL_ACCESS_TOKEN is not configured"
    } satisfies CommunicationDispatchResult;
  }

  const recipient = lineRecipient(row);

  if (!recipient) {
    const message = await updateCommunicationMessageStatus({
      errorMessage: "LINE channel needs a LINE user id mapping",
      messageId: row.id,
      status: "no_channel"
    });

    return {
      attempted: false,
      configured: true,
      message,
      provider: "line",
      reason: "LINE channel needs a LINE user id mapping"
    } satisfies CommunicationDispatchResult;
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    body: JSON.stringify({
      messages: [
        {
          text: formatOutboundLineMessage(row.body).slice(0, 4900),
          type: "text"
        }
      ],
      to: recipient
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const providerMessageId = response.headers.get("x-line-request-id");

  if (response.ok) {
    const message = await updateCommunicationMessageStatus({
      messageId: row.id,
      providerMessageId,
      status: "sent"
    });

    return {
      attempted: true,
      configured: true,
      message,
      provider: "line",
      reason: null
    } satisfies CommunicationDispatchResult;
  }

  const errorText = await response.text().catch(() => "");
  const message = await updateCommunicationMessageStatus({
    errorMessage:
      errorText || `LINE delivery failed with status ${response.status}`,
    messageId: row.id,
    providerMessageId,
    status: "failed"
  });

  return {
    attempted: true,
    configured: true,
    message,
    provider: "line",
    reason: message.errorMessage
  } satisfies CommunicationDispatchResult;
}

export async function dispatchCommunicationMessage(messageId: string) {
  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  const rows = await sql<DeliveryTargetRow[]>`
    select
      communication_messages.*,
      communication_channels.channel_type as delivery_channel_type,
      communication_channels.address as delivery_address,
      communication_channels.metadata as delivery_channel_metadata
    from public.communication_messages
    left join public.communication_channels
      on communication_channels.id = communication_messages.channel_id
    where communication_messages.id = ${messageId}::uuid
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Communication message not found");
  }

  if (row.status !== "queued") {
    return {
      attempted: false,
      configured: true,
      message: mapMessage(row),
      provider: row.provider,
      reason: "Message is not queued"
    } satisfies CommunicationDispatchResult;
  }

  if (!row.delivery_channel_type) {
    const message = await updateCommunicationMessageStatus({
      errorMessage: "Communication message has no channel",
      messageId,
      status: "no_channel"
    });

    if (row.plan_id) {
      await writeBpmEvent({
        actorType: "worker",
        eventName: "communication_dispatch_no_channel",
        eventStatus: "failed",
        eventType: "chat",
        planId: row.plan_id,
        properties: {
          messageId: row.id,
          messageType: row.message_type
        },
        severity: "medium"
      });
    }

    return {
      attempted: false,
      configured: true,
      message,
      provider: null,
      reason: "Communication message has no channel"
    } satisfies CommunicationDispatchResult;
  }

  const result =
    row.delivery_channel_type === "email"
      ? await sendPreparedEmailMessage(mapMessage(row), mapChannel({
          actor_type: "human",
          address: row.delivery_address ?? "",
          channel_type: "email",
          created_at: row.created_at,
          display_name: null,
          id: row.channel_id ?? randomUUID(),
          identity_id: row.identity_id ?? randomUUID(),
          metadata: row.delivery_channel_metadata ?? {},
          preference_rank: 80,
          status: "active",
          updated_at: row.updated_at
        }))
      : row.delivery_channel_type === "line"
        ? await deliverLineMessage(row)
        : ({
            attempted: false,
            configured: false,
            message: mapMessage(row),
            provider: row.delivery_channel_type,
            reason: `${row.delivery_channel_type} delivery is not configured`
          } satisfies CommunicationDispatchResult);

  if (row.plan_id) {
    await writeBpmEvent({
      actorType: "worker",
      eventName:
        result.message.status === "sent" ||
        result.message.status === "delivered"
          ? "communication_dispatch_sent"
          : result.message.status === "failed"
            ? "communication_dispatch_failed"
            : "communication_dispatch_queued",
      eventStatus:
        result.message.status === "sent" ||
        result.message.status === "delivered"
          ? "succeeded"
          : result.message.status === "failed"
            ? "failed"
            : "observed",
      eventType: row.delivery_channel_type === "email" ? "email" : "chat",
      planId: row.plan_id,
      properties: {
        attempted: result.attempted,
        configured: result.configured,
        messageId: row.id,
        messageType: row.message_type,
        provider: result.provider,
        reason: result.reason
      },
      severity: result.message.status === "failed" ? "medium" : "low"
    });
  }

  if (
    result.message.status === "failed" &&
    row.message_type !== "platform_communication_failed"
  ) {
    try {
      await queuePlatformAdminCommunication({
        eventKey: "platform_communication_failed",
        metadata: {
          channelType: row.delivery_channel_type,
          messageId: row.id,
          messageType: row.message_type,
          provider: result.provider,
          reason: result.reason,
          source: "communication_dispatch"
        },
        resourceId: row.id,
        resourceType: "communication_message"
      });
    } catch (error) {
      console.warn("Unable to queue platform communication failure notification", error);
    }
  }

  return result;
}

export async function dispatchQueuedCommunicationMessages(input: Readonly<{
  limit?: number | null;
}> = {}) {
  if (!configuredLineAccessToken()) {
    return [];
  }

  const sql = sqlOrThrow();
  const limit = Math.min(25, Math.max(1, Math.round(input.limit ?? 10)));

  await ensureCommunicationSchema(sql);

  const rows = await sql<Array<{ id: string }>>`
    select communication_messages.id::text
    from public.communication_messages
    join public.communication_channels
      on communication_channels.id = communication_messages.channel_id
    where communication_messages.status = 'queued'
      and communication_channels.status = 'active'
      and communication_channels.channel_type = 'line'
      and (
        communication_messages.scheduled_for is null
        or communication_messages.scheduled_for <= now()
      )
    order by communication_messages.created_at asc
    limit ${limit}
  `;
  const results: CommunicationDispatchResult[] = [];

  for (const row of rows) {
    results.push(await dispatchCommunicationMessage(row.id));
  }

  return results;
}

function safetyFollowupMessage(input: Readonly<{
  clientDose?: string | null;
  decision: string;
  reviewedItems?: SafetyFollowupItem[];
  supplementName: string;
}>) {
  const reviewedItems = input.reviewedItems ?? [];

  if (reviewedItems.length > 1) {
    const summary = reviewedItems
      .map((item) => {
        if (item.decision === "approve") {
          return item.clientDose
            ? `${item.supplementName} approved at ${item.clientDose}`
            : `${item.supplementName} approved`;
        }

        if (item.decision === "disapprove") {
          return `${item.supplementName} removed`;
        }

        return `${item.supplementName} reviewed`;
      })
      .join("; ");

    return `Your human safety review is complete. We have updated your nutrition plan after reviewing ${reviewedItems.length} supplements: ${summary}.`;
  }

  const singleItem = reviewedItems[0];

  if (singleItem) {
    return safetyFollowupMessage({
      clientDose: singleItem.clientDose,
      decision: singleItem.decision,
      supplementName: singleItem.supplementName
    });
  }

  if (input.decision === "approve") {
    return input.clientDose
      ? `Your human safety review for ${input.supplementName} is complete. The reviewed dose is ${input.clientDose}. Your nutrition plan has been updated.`
      : `Your human safety review for ${input.supplementName} is complete. Your nutrition plan has been updated.`;
  }

  return `Your human safety review for ${input.supplementName} is complete. We have removed that suggestion from your nutrition plan.`;
}

export async function sendClientSafetyFollowupTask(reserved: ReservedTask) {
  const payload = objectValue(reserved.task.payload);
  const legacySafetyReviewId = cleanText(payload.safetyReviewId);
  const reviewedItems = safetyFollowupItems(payload.reviewedItems);
  const safetyReviewIds = [
    ...reviewedItems
      .map((item) => item.safetyReviewId)
      .filter((id): id is string => Boolean(id)),
    ...(isUuid(legacySafetyReviewId) ? [legacySafetyReviewId] : [])
  ];
  const supplementName = cleanText(payload.supplementName, "your supplement");
  const decision = cleanText(payload.decision, "reviewed");
  const planId = isUuid(cleanText(payload.planId))
    ? cleanText(payload.planId)
    : reserved.task.planId;

  if (!planId) {
    throw new Error("Client safety follow-up task is missing planId");
  }

  const clientDose = optionalText(payload.clientDose);
  const body = safetyFollowupMessage({
    clientDose,
    decision,
    reviewedItems,
    supplementName
  });
  const result = await sendCommunication({
    body,
    messageType: "safety_review_decision",
    metadata: {
      decision,
      reviewedItems,
      safetyReviewIds,
      source: "client_safety_followup_task",
      supplementName
    },
    planId,
    subject: "Your MattaNutra safety review is complete",
    taskId: reserved.task.id
  });
  const status =
    result.message.status === "sent" || result.message.status === "delivered"
      ? "sent"
      : result.message.status === "queued"
        ? "queued"
        : "failed";
  const sql = sqlOrThrow();

  if (safetyReviewIds.length > 0) {
    await sql`
      update public.safety_reviews
      set
        client_notification_status = ${status},
        client_informed_at = case
          when ${status} = 'sent' then coalesce(client_informed_at, now())
          else client_informed_at
        end,
        safety_context = safety_context || ${sql.json(
          toJsonValue({
            communicationChannelType: result.channel?.channelType ?? null,
            communicationMessageId: result.message.id
          })
        )}::jsonb,
        updated_at = now()
      where id = any(${safetyReviewIds}::uuid[])
    `;
  }

  if (result.message.status === "no_channel") {
    return result;
  }

  if (result.message.status === "failed") {
    throw new Error(result.message.errorMessage ?? "Client communication failed");
  }

  return result;
}
