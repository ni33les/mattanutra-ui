import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { AdminSessionContext } from "@/lib/admin-access-types";
import { recordAdminAudit } from "@/lib/admin-access";
import {
  isUuid,
  toJsonValue
} from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import {
  queueCustomerChatCommunicationDispatchTask,
  sendCommunication
} from "@/lib/communications";
import { getSql } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n";
import { buildReassessmentUrl } from "@/lib/site-url";

type Db = postgres.Sql | postgres.TransactionSql;

export type PanyaEntitlement =
  | "living_protocol"
  | "right_amount_formula"
  | "unpaid";

export type PanyaConfig = Readonly<{
  checkIns: {
    enabled: boolean;
    minimumDaysBetweenMessages: number;
    quietDaysAfterInbound: number;
    questions: Record<Locale, string[]>;
  };
  guardrails: string;
  protocolAdvice: Record<PanyaEntitlement, string>;
  quotas: Record<PanyaEntitlement, number>;
  soul: string;
  upsellTone: string;
}>;

export type PanyaConfigVersion = Readonly<{
  activatedAt: string | null;
  config: PanyaConfig;
  createdAt: string;
  id: string;
  status: "active" | "archived" | "draft";
  updatedAt: string;
  version: number;
}>;

export const DEFAULT_PANYA_CONFIG: PanyaConfig = {
  checkIns: {
    enabled: true,
    minimumDaysBetweenMessages: 7,
    quietDaysAfterInbound: 3,
    questions: {
      en: [
        "How are you feeling with your plan this week?",
        "Has sleep, stress, travel, food, or routine changed since your last check-in?"
      ],
      th: [
        "สัปดาห์นี้คุณรู้สึกอย่างไรกับแผนของคุณ",
        "การนอน ความเครียด การเดินทาง อาหาร หรือกิจวัตรเปลี่ยนไปไหม"
      ],
      "zh-CN": [
        "这周执行方案感觉怎么样？",
        "最近睡眠、压力、旅行、饮食或日常习惯有变化吗？"
      ]
    }
  },
  guardrails: [
    "Do not diagnose, treat, cure, prescribe, or replace clinician advice.",
    "Escalate medication, pregnancy, serious condition, refund, payment, identity, abuse, or safety-risk questions.",
    "Do not provide personalized dose or protocol changes unless the customer has Living Protocol entitlement."
  ].join("\n"),
  protocolAdvice: {
    living_protocol:
      "Living Protocol customers can receive ongoing protocol support. Help them interpret changes in sleep, stress, travel, symptoms, food, and routines, and request refinement when they explicitly ask to adjust or regenerate their protocol.",
    right_amount_formula:
      "Right Amount Formula customers can ask about their generated formula, recommendations, order, food support, and how to follow the plan. Explain the plan clearly, but do not provide ongoing refinement or dose changes unless they upgrade to Living Protocol.",
    unpaid:
      "Unpaid customers can receive order, navigation, and general MattaNutra support. Keep nutrition advice general, explain what Living Protocol unlocks when relevant, and avoid personalized protocol refinement."
  },
  quotas: {
    living_protocol: 32,
    right_amount_formula: 12,
    unpaid: 12
  },
  soul:
    "Panya is warm, practical, concise, commercially helpful without being pushy, and always connected to MattaNutra's evidence-aware plan context.",
  upsellTone:
    "For non-subscribers, explain the value of Living Protocol gently and only when it helps the customer's next step."
};

const timezoneByLocale = {
  en: "UTC",
  th: "Asia/Bangkok",
  "zh-CN": "Asia/Shanghai"
} satisfies Record<Locale, string>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.round(parsed), min), max)
    : fallback;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean).slice(0, 8)
    : fallback;
}

function isoDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function panyaConfigFromUnknown(value: unknown): PanyaConfig {
  const input = objectValue(value);
  const quotas = objectValue(input.quotas);
  const protocolAdvice = objectValue(input.protocolAdvice);
  const checkIns = objectValue(input.checkIns);
  const questions = objectValue(checkIns.questions);

  return {
    checkIns: {
      enabled: checkIns.enabled !== false,
      minimumDaysBetweenMessages: numberValue(
        checkIns.minimumDaysBetweenMessages,
        DEFAULT_PANYA_CONFIG.checkIns.minimumDaysBetweenMessages,
        1,
        90
      ),
      quietDaysAfterInbound: numberValue(
        checkIns.quietDaysAfterInbound,
        DEFAULT_PANYA_CONFIG.checkIns.quietDaysAfterInbound,
        0,
        30
      ),
      questions: {
        en: stringArray(questions.en, DEFAULT_PANYA_CONFIG.checkIns.questions.en),
        th: stringArray(questions.th, DEFAULT_PANYA_CONFIG.checkIns.questions.th),
        "zh-CN": stringArray(
          questions["zh-CN"],
          DEFAULT_PANYA_CONFIG.checkIns.questions["zh-CN"]
        )
      }
    },
    guardrails: text(input.guardrails, DEFAULT_PANYA_CONFIG.guardrails).slice(0, 6000),
    protocolAdvice: {
      living_protocol: text(
        protocolAdvice.living_protocol,
        DEFAULT_PANYA_CONFIG.protocolAdvice.living_protocol
      ).slice(0, 5000),
      right_amount_formula: text(
        protocolAdvice.right_amount_formula,
        DEFAULT_PANYA_CONFIG.protocolAdvice.right_amount_formula
      ).slice(0, 5000),
      unpaid: text(
        protocolAdvice.unpaid,
        DEFAULT_PANYA_CONFIG.protocolAdvice.unpaid
      ).slice(0, 5000)
    },
    quotas: {
      living_protocol: numberValue(
        quotas.living_protocol,
        DEFAULT_PANYA_CONFIG.quotas.living_protocol,
        1,
        500
      ),
      right_amount_formula: numberValue(
        quotas.right_amount_formula,
        DEFAULT_PANYA_CONFIG.quotas.right_amount_formula,
        1,
        500
      ),
      unpaid: numberValue(quotas.unpaid, DEFAULT_PANYA_CONFIG.quotas.unpaid, 1, 500)
    },
    soul: text(input.soul, DEFAULT_PANYA_CONFIG.soul).slice(0, 6000),
    upsellTone: text(input.upsellTone, DEFAULT_PANYA_CONFIG.upsellTone).slice(0, 3000)
  };
}

function activeStatus(value: unknown): PanyaConfigVersion["status"] {
  return value === "archived" || value === "draft" ? value : "active";
}

function mapConfigVersion(row: {
  activated_at: Date | string | null;
  config: unknown;
  created_at: Date | string;
  id: string;
  status: string;
  updated_at: Date | string;
  version: number | string;
}): PanyaConfigVersion {
  return {
    activatedAt: isoDate(row.activated_at),
    config: panyaConfigFromUnknown(row.config),
    createdAt: new Date(row.created_at).toISOString(),
    id: row.id,
    status: activeStatus(row.status),
    updatedAt: new Date(row.updated_at).toISOString(),
    version: Number(row.version) || 1
  };
}

export function resolvePanyaEntitlement(selectedPlan: string | null | undefined) {
  if (selectedPlan === "pro" || selectedPlan === "living_protocol") {
    return "living_protocol" as const;
  }

  if (selectedPlan === "precision") {
    return "right_amount_formula" as const;
  }

  return "unpaid" as const;
}

export function panyaEntitlementLabel(entitlement: PanyaEntitlement) {
  if (entitlement === "living_protocol") {
    return "Living Protocol";
  }

  if (entitlement === "right_amount_formula") {
    return "Right Amount Formula";
  }

  return "Unpaid";
}

export function panyaCustomerTimezone(locale: Locale) {
  return timezoneByLocale[locale] ?? "UTC";
}

export function panyaUsageDay(locale: Locale, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: panyaCustomerTimezone(locale),
    year: "numeric"
  });

  return formatter.format(date);
}

export async function getActivePanyaConfig(sql: Db | null = getSql()) {
  if (!sql) {
    return {
      config: DEFAULT_PANYA_CONFIG,
      version: null
    };
  }

  try {
    const rows = await sql<Array<{
      activated_at: Date | string | null;
      config: unknown;
      created_at: Date | string;
      id: string;
      status: string;
      updated_at: Date | string;
      version: number | string;
    }>>`
      select id::text, version, status, config, activated_at, created_at, updated_at
      from public.panya_config_versions
      where status = 'active'
      order by activated_at desc nulls last, version desc, created_at desc
      limit 1
    `;
    const row = rows[0];

    if (!row) {
      return {
        config: DEFAULT_PANYA_CONFIG,
        version: null
      };
    }

    const version = mapConfigVersion(row);

    return {
      config: version.config,
      version
    };
  } catch {
    return {
      config: DEFAULT_PANYA_CONFIG,
      version: null
    };
  }
}

export async function saveAndActivatePanyaConfig(input: Readonly<{
  config: unknown;
  context: AdminSessionContext;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is unavailable");
  }

  if (input.context.effectiveOrganisation.type !== "platform") {
    throw new Error("Panya can only be configured from platform context");
  }

  const config = panyaConfigFromUnknown(input.config);
  const rows = await sql<Array<{
    activated_at: Date | string | null;
    config: unknown;
    created_at: Date | string;
    id: string;
    status: string;
    updated_at: Date | string;
    version: number | string;
  }>>`
    with next_version as (
      select coalesce(max(version), 0) + 1 as version
      from public.panya_config_versions
    ), archived as (
      update public.panya_config_versions
      set status = 'archived', updated_at = now()
      where status = 'active'
      returning id
    )
    insert into public.panya_config_versions (
      version,
      status,
      config,
      created_by_person_id,
      activated_by_person_id,
      activated_at,
      created_at,
      updated_at
    )
    select
      next_version.version,
      'active',
      ${sql.json(toJsonValue(config))}::jsonb,
      ${input.context.actorPerson.id}::uuid,
      ${input.context.actorPerson.id}::uuid,
      now(),
      now(),
      now()
    from next_version
    returning id::text, version, status, config, activated_at, created_at, updated_at
  `;
  const version = mapConfigVersion(rows[0]);

  await recordAdminAudit({
    action: "admin.panya_config_activated",
    actorPersonId: input.context.actorPerson.id,
    assumedPersonId: input.context.assumedPerson?.id ?? null,
    metadata: {
      quotaLivingProtocol: config.quotas.living_protocol,
      quotaRightAmountFormula: config.quotas.right_amount_formula,
      quotaUnpaid: config.quotas.unpaid
    },
    organisationId: input.context.effectiveOrganisation.id,
    resourceId: version.id,
    resourceType: "panya_config_version"
  });

  await writeBpmEvent({
    actorType: "admin",
    emittedBy: "admin_panya",
    eventName: "panya_config_activated",
    eventStatus: "succeeded",
    eventType: "system",
    properties: {
      configVersionId: version.id,
      version: version.version
    },
    severity: "low",
    sql
  });

  return version;
}

export type PanyaQuotaResult = Readonly<{
  allowed: boolean;
  count: number;
  entitlement: PanyaEntitlement;
  limit: number;
  locale: Locale;
  selectedPlan: string | null;
  timezone: string;
  usageDay: string;
}>;

export async function checkAndRecordPanyaUserMessage(input: Readonly<{
  channelId?: string | null;
  communicationMessageId?: string | null;
  identityId?: string | null;
  planId: string;
  source: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(input.planId)) {
    return null;
  }

  const assessmentRows = await sql<Array<{
    locale: string | null;
    selected_plan: string | null;
  }>>`
    select locale, selected_plan::text
    from public.assessments
    where plan_id = ${input.planId}::uuid
    limit 1
  `;
  const assessment = assessmentRows[0];
  const locale: Locale = isLocale(assessment?.locale) ? assessment.locale : "en";
  const selectedPlan = assessment?.selected_plan ?? null;
  const entitlement = resolvePanyaEntitlement(selectedPlan);
  const { config } = await getActivePanyaConfig(sql);
  const limit = config.quotas[entitlement];
  const usageDay = panyaUsageDay(locale);
  const timezone = panyaCustomerTimezone(locale);
  const identityId = isUuid(input.identityId ?? "") ? input.identityId ?? null : null;
  const channelId = isUuid(input.channelId ?? "") ? input.channelId ?? null : null;
  const communicationMessageId = isUuid(input.communicationMessageId ?? "")
    ? input.communicationMessageId ?? null
    : null;
  const conversationKey = [
    identityId,
    input.planId
  ].filter(Boolean).join(":");

  try {
    const rows = await sql<Array<{ user_message_count: number | string }>>`
      insert into public.panya_daily_usage (
        conversation_key,
        plan_id,
        identity_id,
        channel_id,
        usage_day,
        timezone,
        entitlement,
        source,
        user_message_count,
        quota_limit,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${conversationKey},
        ${input.planId}::uuid,
        ${identityId}::uuid,
        ${channelId}::uuid,
        ${usageDay}::date,
        ${timezone},
        ${entitlement},
        ${text(input.source, "line")},
        1,
        ${limit},
        ${sql.json(toJsonValue({
          communicationMessageId
        }))}::jsonb,
        now(),
        now()
      )
      on conflict (conversation_key, usage_day) do update
      set
        entitlement = excluded.entitlement,
        quota_limit = excluded.quota_limit,
        user_message_count = public.panya_daily_usage.user_message_count + 1,
        metadata = public.panya_daily_usage.metadata || excluded.metadata,
        updated_at = now()
      where public.panya_daily_usage.user_message_count < excluded.quota_limit
      returning user_message_count
    `;
    const count = Number(rows[0]?.user_message_count ?? 0);
    const allowed = rows.length > 0 && count <= limit;

    if (allowed) {
      await writeBpmEvent({
        actorType: "system",
        emittedBy: "panya_quota",
        eventName: "panya_quota_allowed",
        eventStatus: "allowed",
        eventType: "chat",
        planId: input.planId,
        properties: {
          count,
          entitlement,
          limit,
          usageDay
        },
        severity: "low",
        sql
      });

      return {
        allowed,
        count,
        entitlement,
        limit,
        locale,
        selectedPlan,
        timezone,
        usageDay
      } satisfies PanyaQuotaResult;
    }

    const existing = await sql<Array<{ user_message_count: number | string }>>`
      select user_message_count
      from public.panya_daily_usage
      where conversation_key = ${conversationKey}
        and usage_day = ${usageDay}::date
      limit 1
    `;
    const existingCount = Number(existing[0]?.user_message_count ?? limit);

    await writeBpmEvent({
      actorType: "system",
      emittedBy: "panya_quota",
      eventName: "panya_quota_blocked",
      eventStatus: "blocked",
      eventType: "chat",
      planId: input.planId,
      properties: {
        count: existingCount,
        entitlement,
        limit,
        usageDay
      },
      severity: "medium",
      sql
    });

    return {
      allowed: false,
      count: existingCount,
      entitlement,
      limit,
      locale,
      selectedPlan,
      timezone,
      usageDay
    } satisfies PanyaQuotaResult;
  } catch (error) {
    await writeBpmEvent({
      actorType: "system",
      emittedBy: "panya_quota",
      errorMessage: error instanceof Error ? error.message : "Unknown quota error",
      eventName: "panya_quota_check_failed",
      eventStatus: "failed",
      eventType: "error",
      planId: input.planId,
      severity: "medium",
      sql
    });

    return {
      allowed: true,
      count: 0,
      entitlement,
      limit,
      locale,
      selectedPlan,
      timezone,
      usageDay
    } satisfies PanyaQuotaResult;
  }
}

function quotaReplyCopy(result: PanyaQuotaResult) {
  const subscription = result.entitlement === "living_protocol";

  if (result.locale === "th") {
    return subscription
      ? `วันนี้คุณใช้ข้อความ Panya ครบ ${result.limit} ข้อความแล้ว พรุ่งนี้กลับมาคุยต่อได้ หรือหากเป็นเรื่องเร่งด่วน ทีม MattaNutra จะช่วยตรวจสอบให้`
      : `วันนี้คุณใช้ข้อความ Panya ครบ ${result.limit} ข้อความแล้ว คุณยังดูแผนและคำสั่งซื้อได้ตามปกติ หากต้องการการดูแลและปรับแผนต่อเนื่อง Living Protocol จะปลดล็อกการสนับสนุนที่ลึกขึ้น`;
  }

  if (result.locale === "zh-CN") {
    return subscription
      ? `你今天已用完 ${result.limit} 条 Panya 消息。明天可以继续沟通；如有紧急问题，MattaNutra 团队会协助跟进。`
      : `你今天已用完 ${result.limit} 条 Panya 消息。你仍可查看方案和订单；如果需要持续跟进和调整，Living Protocol 会解锁更深入的支持。`;
  }

  return subscription
    ? `You have used today's ${result.limit} Panya messages. You can continue tomorrow, and the MattaNutra team can still review anything urgent.`
    : `You have used today's ${result.limit} Panya messages. You can still view your plan and orders. Living Protocol unlocks deeper ongoing support and plan refinement.`;
}

export async function queuePanyaQuotaLimitReply(input: Readonly<{
  createdByMessageId?: string | null;
  planId: string;
  quota: PanyaQuotaResult;
}>) {
  const prepared = await sendCommunication({
    body: quotaReplyCopy(input.quota),
    channelType: "line",
    messageType: "panya_quota_limit",
    metadata: {
      entitlement: input.quota.entitlement,
      limit: input.quota.limit,
      replyToCommunicationMessageId: isUuid(input.createdByMessageId ?? "")
        ? input.createdByMessageId
        : null,
      source: "panya_quota"
    },
    planId: input.planId,
    subject: "Panya message limit"
  });

  if (prepared.channel?.channelType === "line" && prepared.message.status === "queued") {
    await queueCustomerChatCommunicationDispatchTask({
      messageId: prepared.message.id,
      planId: input.planId
    });
  }

  return prepared.message;
}

export function panyaToolContext(input: Readonly<{
  entitlement: PanyaEntitlement;
}>) {
  const canRefine = input.entitlement === "living_protocol";

  return {
    allowedTools: [
      "load_customer_plan_summary",
      "load_health_score",
      "load_formula",
      "load_product_recommendations",
      "load_order_tracking",
      "load_chat_history",
      "create_support_escalation",
      ...(canRefine ? ["request_living_protocol_refinement"] : []),
      ...(canRefine ? [] : ["generate_upgrade_guidance"])
    ],
    canRefine,
    mutationPolicy: canRefine
      ? "May queue Living Protocol refinement task on explicit request."
      : "May not queue refinement; may explain upgrade path."
  };
}

function panyaCheckInQuestion(
  config: PanyaConfig,
  locale: Locale,
  usageDay = panyaUsageDay(locale)
) {
  const questions = config.checkIns.questions[locale];
  const daySeed = Number(usageDay.replaceAll("-", "")) || 0;

  return questions[daySeed % Math.max(questions.length, 1)] ??
    DEFAULT_PANYA_CONFIG.checkIns.questions.en[0];
}

function panyaReorderCallbackBody(input: Readonly<{
  locale: Locale;
  planId: string;
}>) {
  const reassessmentUrl = buildReassessmentUrl(input.locale, input.planId);

  if (input.locale === "th") {
    return [
      "ตอนนี้ใกล้ครบสามสัปดาห์หลังคำสั่งซื้อ MattaNutra ของคุณแล้ว",
      "ถ้าสูตรนี้ยังเหมาะกับคุณ นี่เป็นช่วงเวลาที่ดีในการสั่งซ้ำ เพื่อไม่ให้หมดใกล้วันที่ 30",
      `ถ้าการนอน ความเครียด ยา การเดินทาง อาหาร หรือเป้าหมายเปลี่ยนไป โปรดทำแบบประเมินอีกครั้งก่อนสั่งซ้ำ: ${reassessmentUrl}`,
      "ตอบกลับที่นี่ได้เลยถ้าต้องการให้ Panya ช่วยเรื่องขั้นตอนถัดไป"
    ].join("\n");
  }

  if (input.locale === "zh-CN") {
    return [
      "距离你的 MattaNutra 订单大约三周了。",
      "如果当前配方仍然适合你，现在是安排续购的好时机，这样接近第 30 天时不容易断档。",
      `如果睡眠、压力、用药、旅行、饮食或目标发生了变化，请先重新填写评估再续购：${reassessmentUrl}`,
      "你可以直接回复这里，Panya 会帮你处理下一步。"
    ].join("\n");
  }

  return [
    "It has been about three weeks since your MattaNutra order.",
    "If your current formula is still working for you, this is a good time to reorder so you do not run out around day 30.",
    `If sleep, stress, medication, travel, diet, or goals have changed, take the assessment again before reordering: ${reassessmentUrl}`,
    "Reply here if you want Panya to help with the next step."
  ].join("\n");
}

export async function schedulePanyaCheckInForPlan(input: Readonly<{
  planId: string;
  source: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(input.planId)) {
    return null;
  }

  const { config } = await getActivePanyaConfig(sql);

  if (!config.checkIns.enabled) {
    return null;
  }

  const assessmentRows = await sql<Array<{ locale: string | null }>>`
    select locale
    from public.assessments
    where plan_id = ${input.planId}::uuid
    limit 1
  `;
  const locale: Locale = isLocale(assessmentRows[0]?.locale)
    ? assessmentRows[0].locale
    : "en";
  const existing = await sql<Array<{ id: string }>>`
    select id::text
    from public.cron
    where plan_id = ${input.planId}::uuid
      and action_type = 'panya_checkin'
      and status in ('scheduled', 'queued')
    order by scheduled_for asc
    limit 1
  `;

  if (existing[0]?.id) {
    return existing[0].id;
  }

  const cronId = randomUUID();

  await sql`
    insert into public.cron (
      id,
      plan_id,
      action_type,
      recipient,
      payload,
      scheduled_for,
      recurrence_days,
      status,
      created_at,
      updated_at
    )
    values (
      ${cronId}::uuid,
      ${input.planId}::uuid,
      'panya_checkin',
      ${sql.json(toJsonValue({ channelType: "line" }))}::jsonb,
      ${sql.json(toJsonValue({
        locale,
        source: input.source
      }))}::jsonb,
      now() + (${config.checkIns.minimumDaysBetweenMessages || 7}::text || ' days')::interval,
      ${config.checkIns.minimumDaysBetweenMessages || 7},
      'scheduled',
      now(),
      now()
    )
  `;

  await writeBpmEvent({
    actorType: "system",
    cronId,
    emittedBy: "panya_checkin",
    eventName: "panya_checkin_scheduled",
    eventStatus: "scheduled",
    eventType: "chat",
    planId: input.planId,
    properties: {
      source: input.source
    },
    severity: "low",
    sql
  });

  return cronId;
}

export async function schedulePanyaReorderCallbackForOrder(input: Readonly<{
  locale: Locale;
  orderId: string;
  orderNumber?: string | null;
  planId: string;
  source: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(input.planId) || !isUuid(input.orderId)) {
    return null;
  }

  const existing = await sql<Array<{ id: string }>>`
    select id::text
    from public.cron
    where plan_id = ${input.planId}::uuid
      and action_type = 'panya_reorder_callback'
      and payload ->> 'retailCustomerOrderId' = ${input.orderId}
      and status in ('scheduled', 'queued', 'complete')
    order by scheduled_for asc
    limit 1
  `;

  if (existing[0]?.id) {
    return existing[0].id;
  }

  const cronId = randomUUID();
  const locale: Locale = isLocale(input.locale) ? input.locale : "en";

  await sql`
    insert into public.cron (
      id,
      plan_id,
      action_type,
      recipient,
      payload,
      scheduled_for,
      recurrence_days,
      status,
      created_at,
      updated_at
    )
    values (
      ${cronId}::uuid,
      ${input.planId}::uuid,
      'panya_reorder_callback',
      ${sql.json(toJsonValue({ channelType: "line" }))}::jsonb,
      ${sql.json(toJsonValue({
        locale,
        orderNumber: input.orderNumber ?? null,
        retailCustomerOrderId: input.orderId,
        source: input.source
      }))}::jsonb,
      now() + interval '21 days',
      null,
      'scheduled',
      now(),
      now()
    )
  `;

  await writeBpmEvent({
    actorType: "system",
    cronId,
    emittedBy: "panya_reorder_callback",
    eventName: "panya_reorder_callback_scheduled",
    eventStatus: "scheduled",
    eventType: "chat",
    planId: input.planId,
    properties: {
      orderNumber: input.orderNumber ?? null,
      retailCustomerOrderId: input.orderId,
      source: input.source
    },
    severity: "low",
    sql
  });

  return cronId;
}

export async function queueDuePanyaCheckIn(input: Readonly<{
  cronId: string;
  planId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(input.cronId) || !isUuid(input.planId)) {
    return { queued: false, reason: "missing_identifiers" as const };
  }
  const db = sql;

  const assessmentRows = await db<Array<{
    locale: string | null;
    selected_plan: string | null;
  }>>`
    select locale, selected_plan::text
    from public.assessments
    where plan_id = ${input.planId}::uuid
    limit 1
  `;
  const assessment = assessmentRows[0];

  if (!assessment) {
    throw new Error("Panya check-in plan was not found");
  }

  const locale: Locale = isLocale(assessment.locale) ? assessment.locale : "en";
  const selectedPlan = assessment.selected_plan ?? null;
  const entitlement = resolvePanyaEntitlement(selectedPlan);
  const { config } = await getActivePanyaConfig(sql);
  const intervalDays = Math.max(1, config.checkIns.minimumDaysBetweenMessages || 7);

  async function reschedule(reason: string) {
    await db`
      update public.cron set
        status = 'scheduled',
        scheduled_for = now() + (${intervalDays}::text || ' days')::interval,
        result_payload = coalesce(result_payload, '{}'::jsonb) || ${db.json(
          toJsonValue({ lastSuppressedReason: reason })
        )}::jsonb,
        error_message = null,
        updated_at = now()
      where id = ${input.cronId}::uuid
    `;

    await writeBpmEvent({
      actorType: "system",
      cronId: input.cronId,
      emittedBy: "panya_checkin",
      eventName: "panya_checkin_suppressed",
      eventStatus: "suppressed",
      eventType: "chat",
      planId: input.planId,
      properties: {
        entitlement,
        reason
      },
      severity: "low",
      sql: db
    });

    return { queued: false, reason };
  }

  if (!config.checkIns.enabled) {
    return reschedule("disabled");
  }

  const recentRows = await sql<Array<{ latest_inbound_at: Date | string | null }>>`
    select max(created_at) as latest_inbound_at
    from public.communication_messages
    where plan_id = ${input.planId}::uuid
      and direction = 'inbound'
  `;
  const latestInboundAt = recentRows[0]?.latest_inbound_at
    ? new Date(recentRows[0].latest_inbound_at)
    : null;

  if (
    latestInboundAt &&
    latestInboundAt.getTime() >
      Date.now() - config.checkIns.quietDaysAfterInbound * 24 * 60 * 60 * 1000
  ) {
    return reschedule("recent_inbound");
  }

  const usageDay = panyaUsageDay(locale);
  const usageRows = await sql<Array<{
    quota_limit: number | string | null;
    user_message_count: number | string | null;
  }>>`
    select user_message_count, quota_limit
    from public.panya_daily_usage
    where plan_id = ${input.planId}::uuid
      and usage_day = ${usageDay}::date
    order by updated_at desc
    limit 1
  `;
  const usage = usageRows[0];
  const limit = Number(usage?.quota_limit ?? config.quotas[entitlement]);
  const count = Number(usage?.user_message_count ?? 0);

  if (count >= limit) {
    return reschedule("quota_exhausted");
  }

  const body = panyaCheckInQuestion(config, locale, usageDay);
  const prepared = await sendCommunication({
    body,
    channelType: "line",
    messageType: "panya_checkin",
    metadata: {
      cronId: input.cronId,
      entitlement,
      source: "panya_checkin"
    },
    planId: input.planId,
    subject: "Panya check-in"
  });
  const dispatchTask =
    prepared.channel?.channelType === "line" && prepared.message.status === "queued"
      ? await queueCustomerChatCommunicationDispatchTask({
          messageId: prepared.message.id,
          planId: input.planId
        })
      : null;

  await sql`
    update public.cron set
      status = 'scheduled',
      scheduled_for = now() + (${intervalDays}::text || ' days')::interval,
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${sql.json(
        toJsonValue({
          dispatchTaskId: dispatchTask ?? null,
          messageId: prepared.message.id,
          messageStatus: prepared.message.status
        })
      )}::jsonb,
      error_message = null,
      completed_at = now(),
      updated_at = now()
    where id = ${input.cronId}::uuid
  `;

  await writeBpmEvent({
    actorType: "system",
    cronId: input.cronId,
    emittedBy: "panya_checkin",
    eventName: "panya_checkin_queued",
    eventStatus: prepared.message.status === "queued" ? "queued" : prepared.message.status,
    eventType: "chat",
    planId: input.planId,
    properties: {
      entitlement,
      messageId: prepared.message.id
    },
    severity: "low",
    sql
  });

  return {
    messageId: prepared.message.id,
    queued: prepared.message.status === "queued",
    reason: prepared.message.status
  };
}

export async function queueDuePanyaReorderCallback(input: Readonly<{
  cronId: string;
  planId: string;
}>) {
  const sql = getSql();

  if (!sql || !isUuid(input.cronId) || !isUuid(input.planId)) {
    return { queued: false, reason: "missing_identifiers" as const };
  }

  const rows = await sql<Array<{
    payload: unknown;
  }>>`
    select payload
    from public.cron
    where id = ${input.cronId}::uuid
      and plan_id = ${input.planId}::uuid
      and action_type = 'panya_reorder_callback'
    limit 1
  `;
  const payload = objectValue(rows[0]?.payload);
  const locale: Locale = isLocale(payload.locale) ? payload.locale : "en";
  const body = panyaReorderCallbackBody({ locale, planId: input.planId });
  const prepared = await sendCommunication({
    body,
    channelType: "line",
    messageType: "panya_reorder_callback",
    metadata: {
      cronId: input.cronId,
      orderNumber: text(payload.orderNumber) || null,
      retailCustomerOrderId: text(payload.retailCustomerOrderId) || null,
      source: "panya_reorder_callback"
    },
    planId: input.planId,
    subject: "Panya reorder callback"
  });
  const dispatchTask =
    prepared.channel?.channelType === "line" && prepared.message.status === "queued"
      ? await queueCustomerChatCommunicationDispatchTask({
          messageId: prepared.message.id,
          planId: input.planId
        })
      : null;

  await sql`
    update public.cron set
      status = 'complete',
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${sql.json(
        toJsonValue({
          dispatchTaskId: dispatchTask ?? null,
          messageId: prepared.message.id,
          messageStatus: prepared.message.status
        })
      )}::jsonb,
      error_message = null,
      completed_at = now(),
      updated_at = now()
    where id = ${input.cronId}::uuid
  `;

  await writeBpmEvent({
    actorType: "system",
    cronId: input.cronId,
    emittedBy: "panya_reorder_callback",
    eventName: "panya_reorder_callback_queued",
    eventStatus: prepared.message.status === "queued" ? "queued" : prepared.message.status,
    eventType: "chat",
    planId: input.planId,
    properties: {
      dispatchTaskId: dispatchTask ?? null,
      messageId: prepared.message.id,
      messageStatus: prepared.message.status
    },
    severity: prepared.message.status === "queued" ? "low" : "medium",
    sql
  });

  return {
    messageId: prepared.message.id,
    queued: prepared.message.status === "queued",
    reason: prepared.message.status
  };
}
