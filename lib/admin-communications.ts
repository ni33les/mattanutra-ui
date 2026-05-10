import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import { getSql } from "@/lib/db";

export type AdminCommunicationStatus =
  | "delivered"
  | "failed"
  | "no_channel"
  | "queued"
  | "sent"
  | "skipped";

export type AdminCommunicationRow = Readonly<{
  address: string | null;
  body: string;
  channelType: string | null;
  createdAt: string;
  errorMessage: string | null;
  goalId: string | null;
  goalTitle: string | null;
  id: string;
  identityId: string | null;
  messageType: string;
  planId: string | null;
  provider: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  status: AdminCommunicationStatus;
  subject: string | null;
  taskId: string | null;
  taskTitle: string | null;
  updatedAt: string;
}>;

export type AdminCommunicationsData = Readonly<{
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminCommunicationRow[];
  summary: {
    delivered: number;
    failed: number;
    noChannel: number;
    queued: number;
    sent: number;
    skipped: number;
    total: number;
  };
}>;

type CommunicationDbRow = Readonly<{
  address: string | null;
  body: string;
  channel_type: string | null;
  created_at: Date | string;
  error_message: string | null;
  goal_id: string | null;
  goal_title: string | null;
  id: string;
  identity_id: string | null;
  message_type: string;
  plan_id: string | null;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: Date | string | null;
  status: string;
  subject: string | null;
  task_id: string | null;
  task_title: string | null;
  updated_at: Date | string;
}>;

type CommunicationSummaryRow = Readonly<{
  status: string;
  total: number | string;
}>;

const statuses = new Set<AdminCommunicationStatus>([
  "delivered",
  "failed",
  "no_channel",
  "queued",
  "sent",
  "skipped"
]);

function isoDate(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function communicationStatus(value: string): AdminCommunicationStatus {
  return statuses.has(value as AdminCommunicationStatus)
    ? (value as AdminCommunicationStatus)
    : "queued";
}

function emptyCommunicationsData(): AdminCommunicationsData {
  return {
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      delivered: 0,
      failed: 0,
      noChannel: 0,
      queued: 0,
      sent: 0,
      skipped: 0,
      total: 0
    }
  };
}

function mapCommunicationRow(row: CommunicationDbRow): AdminCommunicationRow {
  return {
    address: row.address,
    body: row.body,
    channelType: row.channel_type,
    createdAt: new Date(row.created_at).toISOString(),
    errorMessage: row.error_message,
    goalId: row.goal_id,
    goalTitle: row.goal_title,
    id: row.id,
    identityId: row.identity_id,
    messageType: row.message_type,
    planId: row.plan_id,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    sentAt: isoDate(row.sent_at),
    status: communicationStatus(row.status),
    subject: row.subject,
    taskId: row.task_id,
    taskTitle: row.task_title,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function buildSummary(rows: CommunicationSummaryRow[]) {
  const summary = {
    delivered: 0,
    failed: 0,
    noChannel: 0,
    queued: 0,
    sent: 0,
    skipped: 0,
    total: 0
  };

  rows.forEach((row) => {
    const total = Number(row.total) || 0;
    const status = communicationStatus(row.status);

    summary.total += total;

    if (status === "no_channel") {
      summary.noChannel += total;
    } else {
      summary[status] += total;
    }
  });

  return summary;
}

export async function getAdminCommunicationsData(
  range: AdminDashboardRange
): Promise<AdminCommunicationsData> {
  const sql = getSql();

  if (!sql) {
    return emptyCommunicationsData();
  }

  try {
    const start = adminDashboardRangeStart(range);
    const timeFilter = start
      ? sql`where communication_messages.created_at >= ${start}`
      : sql``;
    const [summaryRows, rows] = await Promise.all([
      sql<CommunicationSummaryRow[]>`
        select communication_messages.status, count(*)::int as total
        from public.communication_messages
        ${timeFilter}
        group by communication_messages.status
      `,
      sql<CommunicationDbRow[]>`
        select
          communication_messages.id::text,
          communication_messages.identity_id::text,
          communication_messages.plan_id::text,
          communication_messages.goal_id::text,
          communication_messages.task_id::text,
          communication_messages.message_type,
          communication_messages.status,
          communication_messages.subject,
          communication_messages.body,
          communication_messages.provider,
          communication_messages.provider_message_id,
          communication_messages.error_message,
          communication_messages.sent_at,
          communication_messages.created_at,
          communication_messages.updated_at,
          communication_channels.channel_type,
          communication_channels.address,
          goals.title as goal_title,
          tasks.title as task_title
        from public.communication_messages
        left join public.communication_channels
          on communication_channels.id = communication_messages.channel_id
        left join public.goals
          on goals.id = communication_messages.goal_id
        left join public.tasks
          on tasks.id = communication_messages.task_id
        ${timeFilter}
        order by communication_messages.created_at desc
        limit 200
      `
    ]);

    return {
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows: rows.map(mapCommunicationRow),
      summary: buildSummary(summaryRows)
    };
  } catch (error) {
    console.error("Unable to load admin communications", error);
    return emptyCommunicationsData();
  }
}
