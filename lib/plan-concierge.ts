import { createHash } from "node:crypto";
import type postgres from "postgres";
import {
  getStoredFormulationResult,
  isUuid,
  toJsonValue
} from "@/lib/assessment-store";
import { getSql } from "@/lib/db";
import type {
  PlanFeedbackItem
} from "@/lib/formulation-types";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  inferPlanFeedbackFromMessage,
  loadActivePlanFeedback,
  normalizePlanFeedbackItems,
  savePlanFeedback
} from "@/lib/plan-feedback";

type Db = postgres.Sql | postgres.TransactionSql;
const PLAN_CHAT_WELCOME_KIND = "plan_chat_welcome";
export const PLAN_CHAT_MAX_USER_ROUNDS = 8;
export const PLAN_CHAT_LIMIT_ERROR_MESSAGE =
  "Plan chat interaction limit reached";

const planConciergeCopy = {
  en: {
    pendingProfile: "Profile pending",
    pendingRegion: "Thailand",
    welcome:
      "Hi, I’m MattaNutra AI. I’ll help tailor your food and supplement guidance.\n\nTell me what you’d like to remove, swap, simplify, or adjust.\n\nWhen you’re happy, press Deliver Nutrition Plan or tell me to go ahead."
  },
  th: {
    pendingProfile: "กำลังเตรียมข้อมูล",
    pendingRegion: "ไทย",
    welcome:
      "สวัสดีครับ ผมคือ MattaNutra AI ผมจะช่วยปรับคำแนะนำอาหารและอาหารเสริมให้เข้ากับคุณ\n\nบอกผมได้เลยว่าอยากเอาอะไรออก เปลี่ยนอะไร หรือทำให้ง่ายขึ้น\n\nเมื่อพร้อมแล้ว ให้กด Deliver Nutrition Plan หรือบอกผมว่าไปต่อได้เลย"
  }
} satisfies Record<Locale, {
  pendingProfile: string;
  pendingRegion: string;
  welcome: string;
}>;

export type PlanChatChannel =
  | "email"
  | "gui"
  | "line"
  | "telegram"
  | "unknown"
  | "whatsapp";

export type AppendPlanChatMessageInput = Readonly<{
  body: string;
  channel?: PlanChatChannel | null;
  externalMessageId?: string | null;
  feedback?: unknown;
  identityId?: string | null;
  metadata?: Record<string, unknown>;
  planId: string;
  replyToMessageId?: string | null;
  role: "assistant" | "user";
  source: "openclaw" | "results_page";
  status?: "failed" | "queued" | "ready";
}>;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function metadataValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function channelValue(value: unknown): PlanChatChannel {
  const channel = textValue(value);

  return channel === "email" ||
    channel === "gui" ||
    channel === "line" ||
    channel === "telegram" ||
    channel === "whatsapp"
    ? channel
    : "unknown";
}

function deterministicUuid(seed: string) {
  const bytes = Buffer.from(
    createHash("sha256").update(seed).digest().subarray(0, 16)
  );

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

export function planChatWelcomeBody(locale: Locale) {
  return planConciergeCopy[locale].welcome;
}

async function paidPlanExists(sql: Db, planId: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.assessments
      where plan_id = ${planId}::uuid
        and selected_plan is not null
    ) as exists
  `;

  return rows[0]?.exists === true;
}

async function planChatWelcomeState(sql: Db, planId: string) {
  const rows = await sql<Array<{
    locale: string;
    nutrition_ready: boolean;
  }>>`
    select
      locale,
      (
        exists (
          select 1
          from public.formulations
          where plan_id = ${planId}::uuid
            and (
              model_version is null
              or model_version not like '%:example'
            )
        )
        and exists (
          select 1
          from public.food_guidance
          where plan_id = ${planId}::uuid
            and (
              model_version is null
              or model_version not like '%:example'
            )
        )
      ) as nutrition_ready
    from public.assessments
    where plan_id = ${planId}::uuid
      and selected_plan is not null
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    locale: isLocale(row.locale) ? row.locale : "en",
    nutritionReady: row.nutrition_ready === true
  };
}

async function planChatUserMessageCount(sql: Db, planId: string) {
  const rows = await sql<Array<{ count: number }>>`
    select count(*)::int as count
    from public.plan_chat_messages
    where plan_id = ${planId}::uuid
      and role = 'user'
  `;

  return Number(rows[0]?.count ?? 0);
}

export async function ensurePlanChatWelcomeMessage(sql: Db, planId: string) {
  if (!isUuid(planId)) {
    return null;
  }

  const state = await planChatWelcomeState(sql, planId);

  if (!state?.nutritionReady) {
    return null;
  }

  const id = deterministicUuid(`mattanutra:plan-chat-welcome:${planId}`);
  const body = planChatWelcomeBody(state.locale);
  const rows = await sql<Array<{ id: string }>>`
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
    select
      ${id}::uuid,
      ${planId}::uuid,
      null,
      null,
      'assistant',
      ${body},
      'ready',
      ${sql.json(toJsonValue({
        channel: "gui",
        kind: PLAN_CHAT_WELCOME_KIND,
        source: "results_page"
      }))}::jsonb,
      coalesce(
        (
          select min(created_at) - interval '1 second'
          from public.plan_chat_messages
          where plan_id = ${planId}::uuid
        ),
        now()
      ),
      now()
    where not exists (
      select 1
      from public.plan_chat_messages
      where plan_id = ${planId}::uuid
        and (
          id = ${id}::uuid
          or metadata ->> 'kind' = ${PLAN_CHAT_WELCOME_KIND}
        )
    )
    on conflict (id) do nothing
    returning id::text
  `;

  if (!rows[0]?.id) {
    await sql`
      update public.plan_chat_messages set
        body = ${body},
        updated_at = now()
      where plan_id = ${planId}::uuid
        and role = 'assistant'
        and metadata ->> 'kind' = ${PLAN_CHAT_WELCOME_KIND}
        and body <> ${body}
    `;
  }

  return rows[0]?.id ?? id;
}

export async function loadPlanChatMessages(sql: Db, planId: string) {
  const rows = await sql<Array<{
    body: string;
    created_at: Date;
    id: string;
    metadata: Record<string, unknown>;
    reply_to_message_id: string | null;
    role: "assistant" | "user";
    status: "failed" | "queued" | "ready";
    task_id: string | null;
  }>>`
    select
      id::text,
      task_id::text,
      reply_to_message_id::text,
      role,
      body,
      status,
      metadata,
      created_at
    from public.plan_chat_messages
    where plan_id = ${planId}::uuid
    order by created_at asc
  `;

  return rows.map((row) => ({
    body: row.body,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    metadata: row.metadata ?? {},
    replyToMessageId: row.reply_to_message_id,
    role: row.role,
    status: row.status,
    taskId: row.task_id
  }));
}

export async function loadPlanConversationForClient(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId) || !(await paidPlanExists(sql, planId))) {
    return null;
  }

  await ensurePlanChatWelcomeMessage(sql, planId);

  return loadPlanChatMessages(sql, planId);
}

export async function appendPlanChatMessage(
  sql: Db,
  input: AppendPlanChatMessageInput
) {
  if (!isUuid(input.planId) || !(await paidPlanExists(sql, input.planId))) {
    throw new Error("Plan not found");
  }

  const body = input.body.trim();

  if (!body) {
    throw new Error("Message is required");
  }

  if (body.length > 1200) {
    throw new Error("Message is too long");
  }

  if (input.role === "user") {
    await ensurePlanChatWelcomeMessage(sql, input.planId);

    if (
      (await planChatUserMessageCount(sql, input.planId)) >=
      PLAN_CHAT_MAX_USER_ROUNDS
    ) {
      throw new Error(PLAN_CHAT_LIMIT_ERROR_MESSAGE);
    }
  }

  const channel = channelValue(input.channel ?? input.source);
  const metadata = {
    ...metadataValue(input.metadata),
    channel,
    externalMessageId: textValue(input.externalMessageId) || null,
    identityId: textValue(input.identityId) || null,
    source: input.source
  };
  const rows = await sql<Array<{ id: string }>>`
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
      ${input.planId}::uuid,
      null,
      ${input.replyToMessageId ?? null}::uuid,
      ${input.role},
      ${body},
      ${input.status ?? "ready"},
      ${sql.json(toJsonValue(metadata))}::jsonb,
      now(),
      now()
    )
    returning id::text
  `;
  const messageId = rows[0]?.id;

  if (!messageId) {
    throw new Error("Unable to record plan chat message");
  }

  if (input.role === "user") {
    const feedback = [
      ...normalizePlanFeedbackItems(input.feedback),
      ...inferPlanFeedbackFromMessage({ message: body })
    ];

    await savePlanFeedback(sql, {
      feedback,
      messageId,
      metadata,
      planId: input.planId
    });
  }

  return { messageId };
}

export async function loadOpenClawPlanContext(planId: string) {
  const sql = getSql();

  if (!sql || !isUuid(planId) || !(await paidPlanExists(sql, planId))) {
    return null;
  }

  const result = await getStoredFormulationResult(planId, { mode: "full" });
  const assessmentRows = await sql<Array<{
    answers: unknown;
    locale: string;
    selected_plan: string | null;
  }>>`
    select answers, locale, selected_plan::text
    from public.assessments
    where plan_id = ${planId}::uuid
    limit 1
  `;
  const assessment = assessmentRows[0];
  const locale: Locale = isLocale(assessment?.locale) ? assessment.locale : "en";
  const selectedPlan =
    assessment?.selected_plan === "pro" || assessment?.selected_plan === "precision"
      ? assessment.selected_plan
      : "precision";
  await ensurePlanChatWelcomeMessage(sql, planId);
  const chatMessages = await loadPlanChatMessages(sql, planId);
  const feedback = await loadActivePlanFeedback(sql, planId);

  return {
    assessmentAnswers: assessment?.answers ?? null,
    assessmentSummary:
      result?.assessmentSummary ?? {
        constraints: [],
        goals: [],
        plan: selectedPlan,
        profile: planConciergeCopy[locale].pendingProfile,
        region: planConciergeCopy[locale].pendingRegion
      },
    chatMessages,
    feedback,
    foodGuidance: result?.foodGuidance ?? [],
    nutritionReport: result?.nutritionReport ?? null,
    planId,
    sectionStatuses: result?.sectionStatuses ?? null,
    supplementGuidance: result?.supplementBreakdown ?? []
  };
}

export function feedbackForOpenClaw(value: unknown): PlanFeedbackItem[] {
  return normalizePlanFeedbackItems(value);
}
