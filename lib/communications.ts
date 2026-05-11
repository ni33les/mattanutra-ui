import { randomUUID } from "node:crypto";
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
import { getSql } from "@/lib/db";
import { validateLeadEmail } from "@/lib/email-validation";
import { sendTransactionalEmail } from "@/lib/smtp-email";
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
  goalId: string | null;
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
  goal_id: string | null;
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

const MESSAGE_STATUSES = new Set<string>([
  "delivered",
  "failed",
  "no_channel",
  "queued",
  "sent",
  "skipped"
]);

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
    goalId: row.goal_id,
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

function sqlOrThrow(sql?: postgres.Sql) {
  const configured = sql ?? getSql();

  if (!configured) {
    throw new Error("Database connection is not configured");
  }

  return configured;
}

export async function ensureCommunicationSchema(sql = sqlOrThrow()) {
  if (globalCommunications.mattanutraCommunicationSchemaReady) {
    return globalCommunications.mattanutraCommunicationSchemaReady;
  }

  globalCommunications.mattanutraCommunicationSchemaReady = (async () => {
    await sql`
      create table if not exists public.communication_identities (
        id uuid primary key,
        display_name text null,
        source text null,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists public.plan_communication_identities (
        plan_id uuid not null references public.assessments(plan_id) on delete cascade,
        identity_id uuid not null references public.communication_identities(id) on delete cascade,
        relationship text not null default 'client',
        is_primary boolean not null default true,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        primary key (plan_id, identity_id)
      )
    `;
    await sql`
      create unique index if not exists plan_communication_primary_identity_idx
        on public.plan_communication_identities (plan_id)
        where is_primary
    `;
    await sql`
      create table if not exists public.communication_channels (
        id uuid primary key,
        identity_id uuid not null references public.communication_identities(id) on delete cascade,
        channel_type text not null,
        address text not null,
        display_name text null,
        status text not null default 'active',
        preference_rank integer not null default 100,
        actor_type text not null default 'human',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create unique index if not exists communication_channels_identity_address_idx
        on public.communication_channels (identity_id, channel_type, lower(address))
    `;
    await sql`
      create table if not exists public.communication_messages (
        id uuid primary key,
        identity_id uuid null references public.communication_identities(id) on delete set null,
        channel_id uuid null references public.communication_channels(id) on delete set null,
        plan_id uuid null references public.assessments(plan_id) on delete set null,
        goal_id uuid null references public.goals(id) on delete set null,
        task_id uuid null references public.tasks(id) on delete set null,
        direction text not null default 'outbound',
        message_type text not null default 'general',
        status text not null default 'queued',
        subject text null,
        body text not null,
        html text null,
        provider text null,
        provider_message_id text null,
        error_message text null,
        metadata jsonb not null default '{}'::jsonb,
        scheduled_for timestamptz null,
        sent_at timestamptz null,
        delivered_at timestamptz null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.communication_channels'::regclass
            and conname = 'communication_channels_type_check'
        ) then
          alter table public.communication_channels
            add constraint communication_channels_type_check
            check (channel_type in ('email', 'line', 'manual', 'sms', 'telegram', 'wechat', 'whatsapp'));
        end if;

        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.communication_channels'::regclass
            and conname = 'communication_channels_status_check'
        ) then
          alter table public.communication_channels
            add constraint communication_channels_status_check
            check (status in ('active', 'unverified', 'disabled', 'failed'));
        end if;

        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.communication_channels'::regclass
            and conname = 'communication_channels_actor_check'
        ) then
          alter table public.communication_channels
            add constraint communication_channels_actor_check
            check (actor_type in ('ai', 'human', 'system', 'unknown'));
        end if;

        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.communication_messages'::regclass
            and conname = 'communication_messages_status_check'
        ) then
          alter table public.communication_messages
            add constraint communication_messages_status_check
            check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped', 'no_channel'));
        end if;

        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'public.communication_messages'::regclass
            and conname = 'communication_messages_direction_check'
        ) then
          alter table public.communication_messages
            add constraint communication_messages_direction_check
            check (direction in ('inbound', 'outbound'));
        end if;
      end $$
    `;
    await sql`
      create index if not exists communication_messages_plan_idx
        on public.communication_messages (plan_id, created_at desc)
        where plan_id is not null
    `;
    await sql`
      create index if not exists communication_messages_status_idx
        on public.communication_messages (status, created_at asc)
    `;
  })().catch((error) => {
    globalCommunications.mattanutraCommunicationSchemaReady = undefined;
    throw error;
  });

  return globalCommunications.mattanutraCommunicationSchemaReady;
}

async function ensurePlanIdentityInTransaction(
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

async function upsertChannelInTransaction(
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

async function seedKnownPlanChannelsInTransaction(
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
      await upsertChannelInTransaction(sql, {
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

export async function ensurePlanCommunicationIdentity(input: Readonly<{
  planId: string;
}>) {
  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  return sql.begin(async (tx) => {
    const identityId = await ensurePlanIdentityInTransaction(tx, input.planId);
    await seedKnownPlanChannelsInTransaction(tx, input.planId, identityId);

    return identityId;
  });
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

  return sql.begin(async (tx) => {
    const identityId = isUuid(input.identityId ?? "")
      ? input.identityId!
      : isUuid(input.planId ?? "")
        ? await ensurePlanIdentityInTransaction(tx, input.planId!)
        : null;

    if (!identityId) {
      throw new Error("Communication channel requires a planId or identityId");
    }

    if (input.planId && isUuid(input.planId)) {
      await seedKnownPlanChannelsInTransaction(tx, input.planId, identityId);
    }

    return upsertChannelInTransaction(tx, {
      actorType: input.actorType,
      address: input.address,
      channelType,
      displayName: input.displayName,
      identityId,
      metadata: input.metadata,
      preferenceRank: input.preferenceRank,
      status: input.status
    });
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

  return sql.begin(async (tx) => {
    const existingRows = await tx<ChannelRow[]>`
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
    const rows = await tx<ChannelRow[]>`
      update public.communication_channels
      set
        address = ${nextAddress},
        display_name = coalesce(${input.displayName ?? null}, display_name),
        metadata = metadata || ${tx.json(toJsonValue(metadataPatch))}::jsonb,
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
      await tx`
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
  });
}

export async function listCommunicationChannels(input: Readonly<{
  identityId?: string | null;
  planId?: string | null;
}>) {
  const sql = sqlOrThrow();

  await ensureCommunicationSchema(sql);

  return sql.begin(async (tx) => {
    const identityId = isUuid(input.identityId ?? "")
      ? input.identityId!
      : isUuid(input.planId ?? "")
        ? await ensurePlanIdentityInTransaction(tx, input.planId!)
        : null;

    if (!identityId) {
      return [];
    }

    if (input.planId && isUuid(input.planId)) {
      await seedKnownPlanChannelsInTransaction(tx, input.planId, identityId);
    }

    const rows = await tx<ChannelRow[]>`
      select *
      from public.communication_channels
      where identity_id = ${identityId}::uuid
      order by preference_rank asc, created_at asc
    `;

    return rows.map(mapChannel);
  });
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
  goalId?: string | null;
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

  const prepared = await sql.begin(async (tx) => {
    const identityId = isUuid(input.identityId ?? "")
      ? input.identityId!
      : planId
        ? await ensurePlanIdentityInTransaction(tx, planId)
        : null;

    if (planId && identityId) {
      await seedKnownPlanChannelsInTransaction(tx, planId, identityId);
    }

    const channels = identityId
      ? (
          await tx<ChannelRow[]>`
            select *
            from public.communication_channels
            where identity_id = ${identityId}::uuid
            order by preference_rank asc, created_at asc
          `
        ).map(mapChannel)
      : [];
    const selected = selectBestCommunicationChannel(channels, forcedChannelType);
    const metadata = {
      ...(input.metadata ?? {}),
      selectedChannelType: selected?.channelType ?? forcedChannelType ?? null
    };
    const goalId = isUuid(input.goalId ?? "") ? input.goalId! : null;
    const messageStatus = selected ? "queued" : "no_channel";
    const provider = selected?.channelType ?? null;
    const taskId = isUuid(input.taskId ?? "") ? input.taskId! : null;
    const inserted = await tx<MessageRow[]>`
      insert into public.communication_messages (
        id,
        identity_id,
        channel_id,
        plan_id,
        goal_id,
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
        ${goalId}::uuid,
        ${taskId}::uuid,
        'outbound',
        ${cleanText(input.messageType, "general")},
        ${messageStatus},
        ${optionalText(input.subject)},
        ${cleanText(input.body, "Message")},
        ${optionalText(input.html)},
        ${provider},
        ${tx.json(toJsonValue(metadata))},
        now(),
        now()
      )
      returning *
    `;

    return {
      channel: selected,
      message: mapMessage(inserted[0])
    };
  });

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

  return sql.begin(async (tx) => {
    const rows = await tx<MessageRow[]>`
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
        await tx`
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
  });
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
          text: row.body.slice(0, 4900),
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
    row.delivery_channel_type === "line"
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
    goalId: reserved.task.goalId,
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
    throw new Error("No communication channel is available for this plan");
  }

  if (result.message.status === "failed") {
    throw new Error(result.message.errorMessage ?? "Client communication failed");
  }

  return result;
}
