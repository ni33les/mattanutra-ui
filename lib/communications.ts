import type postgres from "postgres";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import {
  normalizeCommunicationChannelType,
  normalizeLineUserId,
  selectBestCommunicationChannel
} from "@/lib/communication-channel-utils";
import { formatOutboundLineMessage } from "@/lib/line-message-format";
import {
  sendTransactionalEmail,
  type TransactionalEmailAttachment
} from "@/lib/smtp-email";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { createTask } from "@/lib/task-service";
import type { ReservedTask } from "@/lib/task-service";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { validateLeadEmail } from "@/lib/email-validation";
import {
  ADMIN_COMMUNICATION_CHANNEL_TYPES,
  ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY,
  ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY,
  adminCommunicationChannelRank,
  adminCommunicationEventKeys,
  adminCommunicationEventKeysForScope,
  adminCommunicationEventScope,
  adminNotificationEnvironmentLabel,
  applyAdminNotificationContext,
  cleanText,
  configuredLineAccessToken,
  ensureCommunicationSchema,
  ensurePlanIdentity,
  eventKeyAllowedForScope,
  isoDate,
  mapChannel,
  mapMessage,
  MESSAGE_STATUSES,
  normalizeAddress,
  normalizeAdminCommunicationChannelType,
  normalizeAdminCommunicationEventKey,
  objectValue,
  organisationCommunicationScope,
  platformAdminCommunicationEventKeys,
  platformOrganisationId,
  retailAdminCommunicationEventKeys,
  safetyFollowupItems,
  seedKnownPlanChannels,
  sqlOrThrow,
  updateCommunicationChannel,
  upsertChannel,
  type AdminCommunicationChannelType,
  type AdminCommunicationEventKey,
  type AdminCommunicationScope,
  type ChannelRow,
  type CommunicationChannel,
  type CommunicationChannelStatus,
  type CommunicationChannelType,
  type CommunicationDispatchResult,
  type CommunicationMessage,
  type CommunicationMessageStatus,
  type CommunicationRetryClaimInput,
  type Db,
  type DeliveryTargetRow,
  type MessageRow,
  type OrganisationNotificationPreference,
  type PreparedRetryMessage,
  type SafetyFollowupItem
} from "@/lib/communications-shared";
import {
  ensureOrganisationCommunicationIdentity,
  listOrganisationNotificationPreferences,
  queueCommunicationMessageDispatchTask
} from "@/lib/communications-organisation";
import { dispatchCommunicationMessage } from "@/lib/communications-dispatch";

export {
  normalizeCommunicationChannelType,
  normalizeLineUserId,
  selectBestCommunicationChannel
};
export type {
  CommunicationChannelStatus,
  CommunicationChannelType
} from "@/lib/communication-channel-utils";
export type {
  AdminCommunicationChannelType,
  AdminCommunicationEventKey,
  AdminCommunicationScope,
  CommunicationChannel,
  CommunicationDispatchResult,
  CommunicationMessage,
  CommunicationMessageStatus,
  OrganisationNotificationPreference
} from "@/lib/communications-shared";
export {
  ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY,
  ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY,
  adminCommunicationEventKeys,
  adminCommunicationEventKeysForScope,
  adminCommunicationEventScope,
  adminNotificationEnvironmentLabel,
  applyAdminNotificationContext,
  ensureCommunicationSchema,
  updateCommunicationChannel,
  platformAdminCommunicationEventKeys,
  retailAdminCommunicationEventKeys
} from "@/lib/communications-shared";
export {
  consumeCustomerLineConnectCode,
  consumeOrganisationLineConnectCode,
  createCustomerLineConnectToken,
  createOrganisationLineConnectToken,
  deleteDisabledOrganisationCommunicationChannel,
  ensureOrganisationCommunicationIdentity,
  listOrganisationCommunicationChannels,
  listOrganisationPendingLineConnections,
  listOrganisationNotificationPreferences,
  queueCustomerChatCommunicationDispatchTask,
  revokeOrganisationLineConnectToken,
  recordInboundLineCommunication,
  updateOrganisationCommunicationChannel,
  updateOrganisationNotificationPreference,
  upsertOrganisationCommunicationChannel
} from "@/lib/communications-organisation";
export type { PendingOrganisationLineConnection } from "@/lib/communications-organisation";

async function adminCommunicationCopy(input: Readonly<{
  body?: string | null;
  eventKey: AdminCommunicationEventKey;
  metadata?: Record<string, unknown>;
  resourceId?: string | null;
  resourceType?: string | null;
  subject?: string | null;
  sql: Db;
}>) {
  const metadata = { ...(input.metadata ?? {}) };
  const resourceId = input.resourceId ?? "";
  const sql = input.sql;
  if (isUuid(resourceId) && input.resourceType === "retail_customer_order") {
    const [order] = await sql<Array<{
      order_number: string; status: string; source: string; metadata: unknown;
    }>>`select order_number,status,source,metadata from public.retail_customer_orders
      where id=${resourceId}::uuid limit 1`;
    if (order) {
      const orderMetadata = objectValue(order.metadata);
      const paymentId = cleanText(orderMetadata.checkoutPaymentId);
      const [payment] = isUuid(paymentId)
        ? await sql<Array<{ status: string }>>`select status from public.retail_checkout_payments where id=${paymentId}::uuid limit 1`
        : [];
      Object.assign(metadata, {
        orderId: resourceId,
        orderNumber: order.order_number,
        orderStatus: order.status,
        orderSource: order.source === "pharmacy" ? "pharmacy" : orderMetadata.channel || (["manual", "checkout"].includes(order.source) ? "web" : order.source),
        // Order creation and fulfilment are not evidence of payment.
        paymentStatus: payment?.status ?? orderMetadata.paymentStatus ?? "unknown"
      });
    }
  }
  if (isUuid(resourceId) && input.resourceType === "retail_order_settlement") {
    const [order] = await sql`select o.id::text,o.order_number,o.source,o.metadata
      from public.retail_order_settlements s join public.retail_customer_orders o on o.id=s.retail_customer_order_id
      where s.id=${resourceId}::uuid limit 1`;
    if (order) Object.assign(metadata, {
      orderId: order.id, orderNumber: order.order_number,
      orderSource: order.source === "pharmacy" ? "pharmacy" : objectValue(order.metadata).channel || "web"
    });
  }
  if (metadata.source) metadata.triggerSource = metadata.source;
  return applyAdminNotificationContext({ ...input, metadata });
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
    metadata: input.metadata,
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
        html,
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
        ${copy.html},
        ${forcedChannelType},
        'No active organisation communication channel is configured',
        ${sql.json(toJsonValue({
          ...copy.metadata,
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
        html,
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
        ${copy.html},
        ${channel.channelType},
        ${sql.json(toJsonValue({
          ...copy.metadata,
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
  const delivery = await dispatchCommunicationMessage(input.messageId);
  if (delivery.message.messageType === "pharmacy_plan_welcome" && !["sent", "delivered"].includes(delivery.message.status)) {
    // Let the existing three-attempt task policy recover this durable delivery.
    throw new Error(`LINE plan delivery failed: ${delivery.reason ?? delivery.message.status}`);
  }
  return delivery;
}

export {
  ensurePlanCommunicationIdentity,
  upsertCommunicationChannel,
  recordEmailCommunicationDelivery,
  listCommunicationChannels,
  sendCommunication,
  listCommunicationMessages,
  getCommunicationMessage,
  updateCommunicationMessageStatus,
  retryCommunicationMessage,
  dispatchCommunicationMessage,
  dispatchQueuedCommunicationMessages,
  sendClientSafetyFollowupTask
} from "@/lib/communications-dispatch";
