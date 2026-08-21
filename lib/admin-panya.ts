import { randomUUID } from "node:crypto";
import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import type { AdminSessionContext } from "@/lib/admin-access-types";
import { recordAdminAudit } from "@/lib/admin-access";
import { isUuid, toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import {
  queueCustomerChatCommunicationDispatchTask,
  sendCommunication
} from "@/lib/communications";
import { getSql } from "@/lib/db";
import {
  DEFAULT_NONG MATA_CONFIG,
  getActivePanyaConfig,
  panyaEntitlementLabel,
  resolvePanyaEntitlement,
  type PanyaConfig,
  type PanyaConfigVersion,
  type PanyaEntitlement
} from "@/lib/panya";

export type AdminPanyaConversationMessage = Readonly<{
  body: string;
  channelType: string | null;
  createdAt: string;
  direction: "inbound" | "outbound";
  errorMessage: string | null;
  escalated: boolean;
  id: string;
  messageType: string;
  provider: string | null;
  status: string;
  taskId: string | null;
}>;

export type AdminPanyaConversationThread = Readonly<{
  address: string | null;
  channelType: string | null;
  entitlement: PanyaEntitlement;
  entitlementLabel: string;
  escalationCount: number;
  failedCount: number;
  firstName: string | null;
  identityId: string | null;
  inboundCount: number;
  lastMessageAt: string;
  latestSnippet: string;
  locale: string | null;
  messageCount: number;
  openEscalationTaskId: string | null;
  orderNumber: string | null;
  outboundCount: number;
  planId: string | null;
  selectedPlan: string | null;
  threadKey: string;
}>;

export type AdminPanyaData = Readonly<{
  activeConfig: PanyaConfig;
  activeConfigVersion: PanyaConfigVersion | null;
  conversations: AdminPanyaConversationThread[];
  databaseAvailable: boolean;
  generatedAt: string;
  messages: AdminPanyaConversationMessage[];
  selectedThreadKey: string | null;
  summary: {
    escalated: number;
    failed: number;
    livingProtocol: number;
    rightAmountFormula: number;
    totalMessages: number;
    totalThreads: number;
    unpaid: number;
  };
}>;

type ConversationRow = Readonly<{
  address: string | null;
  channel_type: string | null;
  escalation_count: number | string;
  failed_count: number | string;
  first_name: string | null;
  identity_id: string | null;
  inbound_count: number | string;
  last_message_at: Date | string;
  latest_snippet: string | null;
  locale: string | null;
  message_count: number | string;
  open_escalation_task_id: string | null;
  order_number: string | null;
  outbound_count: number | string;
  plan_id: string | null;
  selected_plan: string | null;
  thread_key: string;
}>;

type MessageRow = Readonly<{
  body: string;
  channel_type: string | null;
  created_at: Date | string;
  direction: "inbound" | "outbound";
  error_message: string | null;
  escalated: boolean | null;
  id: string;
  message_type: string;
  provider: string | null;
  status: string;
  task_id: string | null;
}>;

export function emptyAdminPanyaData(): AdminPanyaData {
  return {
    activeConfig: DEFAULT_NONG MATA_CONFIG,
    activeConfigVersion: null,
    conversations: [],
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    messages: [],
    selectedThreadKey: null,
    summary: {
      escalated: 0,
      failed: 0,
      livingProtocol: 0,
      rightAmountFormula: 0,
      totalMessages: 0,
      totalThreads: 0,
      unpaid: 0
    }
  };
}

function mapConversation(row: ConversationRow): AdminPanyaConversationThread {
  const entitlement = resolvePanyaEntitlement(row.selected_plan);

  return {
    address: row.address,
    channelType: row.channel_type,
    entitlement,
    entitlementLabel: panyaEntitlementLabel(entitlement),
    escalationCount: Number(row.escalation_count) || 0,
    failedCount: Number(row.failed_count) || 0,
    firstName: row.first_name,
    identityId: row.identity_id,
    inboundCount: Number(row.inbound_count) || 0,
    lastMessageAt: new Date(row.last_message_at).toISOString(),
    latestSnippet: row.latest_snippet ?? "",
    locale: row.locale,
    messageCount: Number(row.message_count) || 0,
    openEscalationTaskId: row.open_escalation_task_id,
    orderNumber: row.order_number,
    outboundCount: Number(row.outbound_count) || 0,
    planId: row.plan_id,
    selectedPlan: row.selected_plan,
    threadKey: row.thread_key
  };
}

function mapMessage(row: MessageRow): AdminPanyaConversationMessage {
  return {
    body: row.body,
    channelType: row.channel_type,
    createdAt: new Date(row.created_at).toISOString(),
    direction: row.direction,
    errorMessage: row.error_message,
    escalated: row.escalated === true,
    id: row.id,
    messageType: row.message_type,
    provider: row.provider,
    status: row.status,
    taskId: row.task_id
  };
}

function buildSummary(conversations: readonly AdminPanyaConversationThread[]) {
  return conversations.reduce(
    (summary, conversation) => {
      summary.totalThreads += 1;
      summary.totalMessages += conversation.messageCount;
      summary.escalated += conversation.escalationCount > 0 ? 1 : 0;
      summary.failed += conversation.failedCount > 0 ? 1 : 0;

      if (conversation.entitlement === "living_protocol") {
        summary.livingProtocol += 1;
      } else if (conversation.entitlement === "right_amount_formula") {
        summary.rightAmountFormula += 1;
      } else {
        summary.unpaid += 1;
      }

      return summary;
    },
    {
      escalated: 0,
      failed: 0,
      livingProtocol: 0,
      rightAmountFormula: 0,
      totalMessages: 0,
      totalThreads: 0,
      unpaid: 0
    }
  );
}

export async function getAdminPanyaData(
  range: AdminDashboardRange,
  context: AdminSessionContext | null,
  selectedThreadKey?: string | null
): Promise<AdminPanyaData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminPanyaData();
  }

  if (!context || context.effectiveOrganisation.type !== "platform") {
    return {
      ...emptyAdminPanyaData(),
      databaseAvailable: true,
      generatedAt: new Date().toISOString()
    };
  }

  try {
    const start = adminDashboardRangeStart(range);
    const { config, version } = await getActivePanyaConfig(sql);
    const conversations = (
      await sql<ConversationRow[]>`
        with scoped_messages as (
          select
            communication_messages.*,
            communication_channels.channel_type,
            communication_channels.address
          from public.communication_messages
          left join public.communication_channels
            on communication_channels.id = communication_messages.channel_id
          where (${start ?? null}::timestamptz is null or communication_messages.created_at >= ${start ?? null})
            and (
              communication_messages.plan_id is not null
              or communication_messages.message_type like 'panya_%'
              or communication_messages.message_type = 'line_inbound'
            )
        ), grouped as (
          select
            coalesce(identity_id::text, 'no-identity') || ':' || coalesce(plan_id::text, 'no-plan') as thread_key,
            identity_id::text,
            plan_id::text,
            max(created_at) as last_message_at,
            count(*)::int as message_count,
            count(*) filter (where direction = 'inbound')::int as inbound_count,
            count(*) filter (where direction = 'outbound')::int as outbound_count,
            count(*) filter (where status in ('failed', 'no_channel'))::int as failed_count,
            count(*) filter (where metadata ->> 'escalate' = 'true')::int as escalation_count,
            (array_remove(array_agg(channel_type order by created_at desc), null))[1] as channel_type,
            (array_remove(array_agg(address order by created_at desc), null))[1] as address,
            (array_agg(left(body, 180) order by created_at desc))[1] as latest_snippet
          from scoped_messages
          group by identity_id, plan_id
        )
        select
          grouped.*,
          assessments.first_name,
          assessments.locale,
          assessments.selected_plan::text,
          (
            select retail_customer_orders.order_number
            from public.retail_checkout_payments
            join public.retail_customer_orders
              on retail_customer_orders.id = retail_checkout_payments.retail_customer_order_id
            where retail_checkout_payments.plan_id = grouped.plan_id::uuid
            order by retail_checkout_payments.created_at desc
            limit 1
          ) as order_number,
          (
            select tasks.id::text
            from public.tasks
            where tasks.plan_id = grouped.plan_id::uuid
              and tasks.task_type = 'customer_chat_escalation'
              and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
            order by tasks.created_at desc
            limit 1
          ) as open_escalation_task_id
        from grouped
        left join public.assessments
          on assessments.plan_id = grouped.plan_id::uuid
        order by grouped.last_message_at desc
        limit 100
      `
    ).map(mapConversation);
    const selected =
      conversations.find((conversation) => conversation.threadKey === selectedThreadKey) ??
      conversations[0] ??
      null;
    const messageRows = selected
      ? await sql<MessageRow[]>`
          select
            communication_messages.id::text,
            communication_messages.direction,
            communication_messages.message_type,
            communication_messages.status,
            communication_messages.body,
            communication_messages.metadata ->> 'escalate' = 'true' as escalated,
            communication_messages.provider,
            communication_messages.error_message,
            communication_messages.task_id::text,
            communication_messages.created_at,
            communication_channels.channel_type
          from public.communication_messages
          left join public.communication_channels
            on communication_channels.id = communication_messages.channel_id
          where coalesce(communication_messages.identity_id::text, 'no-identity') || ':' || coalesce(communication_messages.plan_id::text, 'no-plan') = ${selected.threadKey}
          order by communication_messages.created_at asc
          limit 500
        `
      : [];

    return {
      activeConfig: config,
      activeConfigVersion: version,
      conversations,
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      messages: messageRows.map(mapMessage),
      selectedThreadKey: selected?.threadKey ?? null,
      summary: buildSummary(conversations)
    };
  } catch (error) {
    console.error("Unable to load admin Nong Mata data", error);
    return emptyAdminPanyaData();
  }
}

export function panyaConversationsCsv(data: AdminPanyaData) {
  const headers = [
    "Thread",
    "Plan ID",
    "Order",
    "Customer",
    "Locale",
    "Entitlement",
    "Channel",
    "Messages",
    "Inbound",
    "Outbound",
    "Escalations",
    "Failures",
    "Last message",
    "Latest snippet"
  ];
  const escape = (value: unknown) => {
    const text = String(value ?? "");

    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    headers.join(","),
    ...data.conversations.map((conversation) =>
      [
        conversation.threadKey,
        conversation.planId,
        conversation.orderNumber,
        conversation.firstName,
        conversation.locale,
        conversation.entitlementLabel,
        conversation.channelType,
        conversation.messageCount,
        conversation.inboundCount,
        conversation.outboundCount,
        conversation.escalationCount,
        conversation.failedCount,
        conversation.lastMessageAt,
        conversation.latestSnippet
      ].map(escape).join(",")
    )
  ].join("\n");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function sendAdminPanyaConversationReply(input: Readonly<{
  body: unknown;
  context: AdminSessionContext;
  planId: unknown;
  threadKey: unknown;
}>) {
  const sql = getSql();
  const planId = text(input.planId);
  const threadKey = text(input.threadKey);
  const body = text(input.body);

  if (!sql) {
    throw new Error("Database is not available");
  }

  if (input.context.effectiveOrganisation.type !== "platform") {
    throw new Error("Nong Mata replies are platform-only");
  }

  if (!isUuid(planId)) {
    throw new Error("Select a plan-linked conversation before replying");
  }

  if (body.length < 1) {
    throw new Error("Reply cannot be blank");
  }

  if (body.length > 4_000) {
    throw new Error("Reply is too long");
  }

  const conversationRows = await sql<Array<{
    identity_id: string | null;
    plan_id: string | null;
    thread_key: string;
  }>>`
    select
      communication_messages.identity_id::text,
      communication_messages.plan_id::text,
      coalesce(communication_messages.identity_id::text, 'no-identity') || ':' || coalesce(communication_messages.plan_id::text, 'no-plan') as thread_key
    from public.communication_messages
    where communication_messages.plan_id = ${planId}::uuid
      and coalesce(communication_messages.identity_id::text, 'no-identity') || ':' || coalesce(communication_messages.plan_id::text, 'no-plan') = ${threadKey}
    order by communication_messages.created_at desc
    limit 1
  `;
  const conversation = conversationRows[0];

  if (!conversation) {
    throw new Error("Conversation was not found");
  }

  const chatRows = await sql<Array<{ id: string }>>`
    insert into public.plan_chat_messages (
      id,
      plan_id,
      task_id,
      reply_to_message_id,
      role,
      body,
      status,
      metadata,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      ${planId}::uuid,
      null,
      null,
      'assistant',
      ${body},
      'ready',
      ${sql.json(toJsonValue({
        actorPersonId: input.context.actorPerson.id,
        assumedPersonId: input.context.assumedPerson?.id ?? null,
        source: "admin_panya_manual_reply",
        threadKey
      }))}::jsonb,
      now(),
      now()
    )
    returning id::text
  `;
  const prepared = await sendCommunication({
    body,
    channelType: "line",
    messageType: "panya_admin_reply",
    metadata: {
      actorPersonId: input.context.actorPerson.id,
      assistantMessageId: chatRows[0]?.id ?? null,
      source: "admin_panya_manual_reply",
      threadKey
    },
    planId,
    subject: "MattaNutra reply"
  });
  const dispatch =
    prepared.channel?.channelType === "line" && prepared.message.status === "queued"
      ? await queueCustomerChatCommunicationDispatchTask({
          messageId: prepared.message.id,
          planId
        })
      : null;

  await recordAdminAudit({
    action: "admin.panya_manual_reply_sent",
    actorPersonId: input.context.actorPerson.id,
    assumedPersonId: input.context.assumedPerson?.id ?? null,
    metadata: {
      assistantMessageId: chatRows[0]?.id ?? null,
      communicationMessageId: prepared.message.id,
      dispatchTaskId: dispatch?.task.id ?? null,
      messageStatus: prepared.message.status,
      threadKey
    },
    organisationId: input.context.effectiveOrganisation.id,
    resourceId: planId,
    resourceType: "panya_conversation"
  });

  await writeBpmEvent({
    actorType: "admin",
    emittedBy: "admin_panya",
    eventName: "panya_manual_reply_queued",
    eventStatus: prepared.message.status === "queued" ? "queued" : prepared.message.status,
    eventType: "chat",
    planId,
    properties: {
      assistantMessageId: chatRows[0]?.id ?? null,
      communicationMessageId: prepared.message.id,
      dispatchTaskId: dispatch?.task.id ?? null,
      messageStatus: prepared.message.status
    },
    severity: prepared.message.status === "queued" ? "low" : "medium",
    sql
  });

  return {
    assistantMessageId: chatRows[0]?.id ?? null,
    dispatchTaskId: dispatch?.task.id ?? null,
    message: prepared.message
  };
}

export async function resolveAdminPanyaConversationEscalation(input: Readonly<{
  context: AdminSessionContext;
  note?: unknown;
  planId?: unknown;
  threadKey: unknown;
}>) {
  const sql = getSql();
  const threadKey = text(input.threadKey);
  const requestedPlanId = text(input.planId);
  const planId = isUuid(requestedPlanId) ? requestedPlanId : null;
  const note = text(input.note) || null;
  const resolvedAt = new Date().toISOString();

  if (!sql) {
    throw new Error("Database is not available");
  }

  if (input.context.effectiveOrganisation.type !== "platform") {
    throw new Error("Nong Mata escalation resolution is platform-only");
  }

  if (!threadKey) {
    throw new Error("Conversation is required");
  }

  const openTaskRows = await sql<Array<{
    id: string;
    plan_id: string | null;
  }>>`
    select id::text, plan_id::text
    from public.tasks
    where task_type = 'customer_chat_escalation'
      and status not in ('completed', 'failed', 'cancelled', 'skipped')
      and (
        payload ->> 'conversationThreadKey' = ${threadKey}
        or context ->> 'conversationThreadKey' = ${threadKey}
        or (
          ${planId}::uuid is not null
          and plan_id = ${planId}::uuid
          and payload ->> 'conversationThreadKey' = ${threadKey}
        )
      )
    order by created_at desc
  `;
  const taskIds = openTaskRows.map((task) => task.id);
  const resolvedMetadata = {
    actorPersonId: input.context.actorPerson.id,
    assumedPersonId: input.context.assumedPerson?.id ?? null,
    note,
    resolvedAt,
    source: "admin_panya_resolve_escalation",
    threadKey
  };
  const updatedMessages = await sql<Array<{
    id: string;
    plan_id: string | null;
  }>>`
    update public.communication_messages
    set
      metadata = (coalesce(metadata, '{}'::jsonb) - 'escalate') ||
        ${sql.json(toJsonValue(resolvedMetadata))}::jsonb,
      updated_at = now()
    where coalesce(identity_id::text, 'no-identity') || ':' || coalesce(plan_id::text, 'no-plan') = ${threadKey}
      and metadata ->> 'escalate' = 'true'
    returning id::text, plan_id::text
  `;
  const resultPayload = toJsonValue({
    ...resolvedMetadata,
    resolvedCommunicationMessageIds: updatedMessages.map((message) => message.id)
  });
  const completedTasks = taskIds.length > 0
    ? await sql<Array<{ id: string; plan_id: string | null }>>`
        update public.tasks
        set
          status = 'completed',
          completed_at = now(),
          lease_until = null,
          reserved_by_agent_id = null,
          result_payload = coalesce(result_payload, '{}'::jsonb) ||
            ${sql.json(resultPayload)}::jsonb,
          updated_at = now()
        where id = any(${taskIds}::uuid[])
          and task_type = 'customer_chat_escalation'
          and status not in ('completed', 'failed', 'cancelled', 'skipped')
        returning id::text, plan_id::text
      `
    : [];

  for (const task of completedTasks) {
    await sql`
      insert into public.task_comments (
        id,
        task_id,
        author_type,
        author_name,
        visibility,
        comment_type,
        body,
        metadata,
        created_at
      )
      values (
        ${randomUUID()}::uuid,
        ${task.id}::uuid,
        'human',
        ${input.context.actorPerson.displayName || "admin_dashboard"},
        'admin',
        'decision',
        ${note ?? "Nong Mata escalation resolved from the conversation page."},
        ${sql.json(resultPayload)}::jsonb,
        now()
      )
    `;

    await sql`
      insert into public.task_events (
        id,
        task_id,
        event_type,
        event_status,
        severity,
        event_payload,
        occurred_at,
        created_at
      )
      values (
        ${randomUUID()}::uuid,
        ${task.id}::uuid,
        'panya_escalation_resolved',
        'succeeded',
        'medium',
        ${sql.json(resultPayload)}::jsonb,
        now(),
        now()
      )
    `;
  }

  const result = {
    communicationMessageIds: updatedMessages.map((message) => message.id),
    planId:
      planId ??
      updatedMessages.find((message) => message.plan_id)?.plan_id ??
      completedTasks.find((task) => task.plan_id)?.plan_id ??
      null,
    taskIds: completedTasks.map((task) => task.id),
    threadKey
  };

  await recordAdminAudit({
    action: "admin.panya_escalation_resolved",
    actorPersonId: input.context.actorPerson.id,
    assumedPersonId: input.context.assumedPerson?.id ?? null,
    metadata: {
      communicationMessageIds: result.communicationMessageIds,
      note,
      resolvedAt,
      taskIds: result.taskIds,
      threadKey
    },
    organisationId: input.context.effectiveOrganisation.id,
    resourceId: threadKey,
    resourceType: "panya_conversation"
  });

  await writeBpmEvent({
    actorType: "admin",
    emittedBy: "admin_panya",
    eventName: "panya_escalation_resolved",
    eventStatus: "completed",
    eventType: "chat",
    planId: result.planId,
    properties: {
      communicationMessageIds: result.communicationMessageIds,
      taskIds: result.taskIds,
      threadKey
    },
    severity: "low",
    sql
  });

  return result;
}
