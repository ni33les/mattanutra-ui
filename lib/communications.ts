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
  optionalText,
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
  recordInboundLineCommunication,
  updateOrganisationCommunicationChannel,
  updateOrganisationNotificationPreference,
  upsertOrganisationCommunicationChannel
} from "@/lib/communications-organisation";
export type { PendingOrganisationLineConnection } from "@/lib/communications-organisation";

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
  metadata?: Record<string, unknown>;
  resourceId?: string | null;
  resourceType?: string | null;
  subject?: string | null;
  sql: Db;
}>) {
  const subject = optionalText(input.subject);
  const body = optionalText(input.body);

  if (subject && body) {
    return applyAdminNotificationContext({
      body,
      eventKey: input.eventKey,
      metadata: input.metadata,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      subject
    });
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

    return applyAdminNotificationContext({
      body: body ?? copy.body,
      eventKey: input.eventKey,
      metadata: input.metadata,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      subject: subject ?? copy.subject
    });
  }

  if (input.eventKey.startsWith("platform_")) {
    const copy = platformEventCopy(input.eventKey);

    return applyAdminNotificationContext({
      body: body ?? copy.body,
      eventKey: input.eventKey,
      metadata: input.metadata,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      subject: subject ?? copy.subject
    });
  }

  const copy = orderEventCopy({
    customerName: null,
    eventKey: input.eventKey,
    lineCount: 0,
    orderNumber: null,
    status: null
  });

  return applyAdminNotificationContext({
    body: body ?? copy.body,
    eventKey: input.eventKey,
    metadata: input.metadata,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    subject: subject ?? copy.subject
  });
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

