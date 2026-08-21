/**
 * Organisation channels, notification preferences, and LINE connect flows.
 * Re-exported from the communications facade for stable call sites.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import { formatOutboundLineMessage } from "@/lib/line-message-format";
import {
  ADMIN_COMMUNICATION_CHANNEL_TYPES,
  ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY,
  adminCommunicationChannelRank,
  adminCommunicationEventKeysForScope,
  adminCommunicationPreferenceDefault,
  cleanText,
  configuredLineAccessToken,
  ensureCommunicationSchema,
  ensureOrganisationIdentity,
  ensurePlanIdentity,
  eventKeyAllowedForScope,
  hashLineConnectCode,
  isoDate,
  lineMetadata,
  mapChannel,
  mapMessage,
  newLineConnectCode,
  normalizeAddress,
  normalizeAdminCommunicationChannelType,
  normalizeAdminCommunicationEventKey,
  objectValue,
  optionalText,
  organisationCommunicationScope,
  seedOrganisationNotificationPreferences,
  sqlOrThrow,
  updateCommunicationChannel,
  upsertChannel,
  type AdminCommunicationChannelType,
  type AdminCommunicationEventKey,
  type AdminCommunicationScope,
  type ChannelRow,
  type CommunicationChannel,
  type CommunicationChannelStatus,
  type CommunicationMessage,
  type Db,
  type MessageRow,
  type OrganisationNotificationPreference
} from "@/lib/communications-shared";
import { normalizeLineUserId } from "@/lib/communication-channel-utils";

import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";

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
  locale?: string | null;
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
  const locale = optionalText(input.locale);

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
        locale,
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
    locale: optionalText(tokenMetadata.locale),
    organisationId: token.organisation_id
  };
}

export async function createCustomerLineConnectToken(input: Readonly<{
  expiresInMinutes?: number | null;
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
  const expiresInMinutes = Math.min(
    90 * 24 * 60,
    Math.max(1, Math.round(Number(input.expiresInMinutes) || 15))
  );

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
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

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
        expiresInMinutes,
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
  const assessmentRows = await sql<Array<{
    locale: string | null;
    selected_plan: string | null;
  }>>`
    select locale, selected_plan::text
    from public.assessments
    where plan_id = ${token.plan_id}::uuid
    limit 1
  `;
  const assessment = assessmentRows[0];
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
    locale: optionalText(assessment?.locale),
    planId: token.plan_id,
    retailCustomerOrderId: token.retail_customer_order_id,
    selectedPlan: optionalText(assessment?.selected_plan)
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

export async function queueCommunicationMessageDispatchTask(input: Readonly<{
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
    priorityReason: "Nong Mata reply is queued for the chat dispatcher.",
    priorityScore: ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY,
    reasoningEffort: "none",
    requiredCapabilities: [
      AGENT_CAPABILITIES.communicationDispatch,
      AGENT_CAPABILITIES.lineSend
    ],
    sourceEntityId: input.messageId,
    sourceEntityType: "communication_message",
    taskType: "dispatch_chat_communication_message",
    title: "Dispatch Nong Mata LINE reply"
  });
}

