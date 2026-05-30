"use client";

import { HeartIcon, UserIcon } from "@heroicons/react/24/solid";
import type {
  AdminAgentRow,
  AdminAgentsData
} from "@/lib/admin-execution";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import { CapabilityList } from "@/components/admin/capability-list";
import {
  BusinessStatsGrid,
  adminLocaleTextClass,
  businessMetricColors,
  classNames,
  compactId,
  formatGeneratedAt,
  formatNumber,
  formatPercent,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { SupplementListMeta } from "@/components/admin/safety-views";

function agentStatusClass(status: string) {
  if (status === "active") {
    return "bg-[#1FA77A]/10 text-[#126B4F] ring-[#1FA77A]/20";
  }

  if (status === "paused") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "offline") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function agentDescription(row: AdminAgentRow, locale: Locale) {
  const thai = locale === "th";
  const chinese = locale === "zh-CN";

  if (row.name === "Product Matcher") {
    return thai
      ? "ตัวทำงานแบบ deterministic สำหรับจับคู่แผนโภชนาการกับสินค้าที่อนุมัติแล้ว โดยใช้ full-beam matcher"
      : chinese
        ? "确定性产品推荐 worker，使用 full-beam matcher 将营养计划匹配到已批准目录产品。"
        : "Deterministic product recommendation worker. Matches nutrition plans to approved catalogue products using the full-beam matcher.";
  }

  if (row.name === "Nutrition Plan Formulator") {
    return thai
      ? "สร้างคำแนะนำอาหารเสริมจาก HealthScore และบริบทของลูกค้า"
      : chinese
        ? "根据 HealthScore 和客户背景生成补充剂指导。"
        : "Builds supplement guidance from the HealthScore and client context.";
  }

  if (row.name === "HealthScore Engine") {
    return thai
      ? "วิเคราะห์คำตอบแบบประเมินและสร้างคำอธิบาย HealthScore"
      : chinese
        ? "分析评估答案并生成 HealthScore 建议。"
        : "Analyzes assessment answers and produces HealthScore advice.";
  }

  if (row.name === "Nutrition Plan Advisor") {
    return thai
      ? "ปรับแต่งแผน ตอบแชต และสรุปแผนโภชนาการฉบับสุดท้าย"
      : chinese
        ? "处理计划优化、聊天回复和最终营养报告。"
        : "Handles plan refinement, chat replies, and final nutrition reports.";
  }

  if (row.name === "Communications Coordinator") {
    return thai
      ? "ประสานงานข้อความติดตามผลและการแจ้งเตือนลูกค้า"
      : chinese
        ? "协调跟进消息和客户通知。"
        : "Coordinates follow-up messages and client notifications.";
  }

  if (row.name === "Email Dispatcher") {
    return thai
      ? "ส่งอีเมลธุรกรรมและอีเมลประเมินซ้ำ"
      : chinese
        ? "发送交易邮件和复评邮件。"
        : "Sends transactional and reassessment emails.";
  }

  if (row.name === "Content Publisher") {
    return thai
      ? "จัดการงานเผยแพร่เนื้อหา"
      : chinese
        ? "运行内容发布工作流任务。"
        : "Runs content publishing workflow tasks.";
  }

  if (row.name === "Scheduler") {
    return thai
      ? "ดูแลงานตามกำหนดเวลาและงานแพลตฟอร์มเบื้องหลัง"
      : chinese
        ? "运行计划任务和平台维护工作。"
        : "Runs scheduled platform and housekeeping work.";
  }

  if (row.type === "human") {
    return thai
      ? "คิวงานตรวจสอบโดยคนสำหรับเคสที่ต้องใช้วิจารณญาณ"
      : chinese
        ? "人工审核队列，用于需要判断的案例。"
        : "Human review queue for cases that need judgement.";
  }

  return thai
    ? "ตัวทำงานของแพลตฟอร์มสำหรับงานที่มีความสามารถเฉพาะ"
    : chinese
      ? "面向特定能力范围任务的平台 worker。"
      : "Platform worker for capability-scoped operational tasks.";
}

function agentHeartbeatState(row: AdminAgentRow, generatedAt: string) {
  if (row.type === "human") {
    return "human";
  }

  if (row.sessionCount <= 0 && !row.lastSeenAt && row.activeTaskCount <= 0) {
    return "undeployed";
  }

  if (row.sessionCount <= 0 || !row.lastSeenAt) {
    return "offline";
  }

  const generatedAtTime = new Date(generatedAt).getTime();
  const lastSeenTime = new Date(row.lastSeenAt).getTime();

  if (!Number.isFinite(generatedAtTime) || !Number.isFinite(lastSeenTime)) {
    return "offline";
  }

  const ageMs = generatedAtTime - lastSeenTime;

  if (ageMs <= 45_000) {
    return "live";
  }

  if (ageMs <= 120_000) {
    return "idle";
  }

  return "offline";
}

function AgentHeartbeatIndicator({
  generatedAt,
  labels,
  locale,
  row
}: Readonly<{
  generatedAt: string;
  labels: AdminContent;
  locale: Locale;
  row: AdminAgentRow;
}>) {
  const state = agentHeartbeatState(row, generatedAt);

  if (state === "human") {
    return (
      <span
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-violet-50 px-2.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100"
        title={labels.agents.humanQueue}
      >
        <UserIcon aria-hidden="true" className="size-4" />
        {row.activeTaskCount > 0
          ? formatNumber(row.activeTaskCount, locale)
          : labels.agents.humanQueue}
        <span className="sr-only">{labels.agents.humanQueue}</span>
      </span>
    );
  }

  if (state === "undeployed") {
    return (
      <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-gray-50 px-2.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
        {labels.agents.undeployed}
      </span>
    );
  }

  const active = state !== "offline";

  return (
    <span
      className={classNames(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full ring-1",
        state === "live" && "bg-rose-50 text-rose-600 ring-rose-100",
        state === "idle" && "bg-amber-50 text-amber-600 ring-amber-100",
        state === "offline" && "bg-gray-50 text-gray-300 ring-gray-200"
      )}
      title={
        row.lastSeenAt
          ? `${labels.visibility.heartbeat} ${formatGeneratedAt(row.lastSeenAt, locale)}`
          : labels.visibility.noWorkerHeartbeat
      }
    >
      <HeartIcon
        aria-hidden="true"
        className={classNames(
          "size-4",
          active && "animate-[worker-heartbeat_700ms_ease-out]"
        )}
        key={`${row.id}:${row.lastSeenAt ?? "none"}`}
      />
      <span className="sr-only">
        {active ? labels.agents.heartbeat : labels.visibility.noWorkerHeartbeat}
      </span>
    </span>
  );
}

export function AdminAgentsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminAgentsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const agentMetrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "agentsTotal",
      label: labels.agents.total,
      series: [],
      value: formatNumber(data.summary.total, locale)
    },
    {
      color: businessMetricColors.active,
      id: "agentsWorking",
      label: labels.agents.working,
      series: [],
      value: formatNumber(data.summary.working, locale)
    },
    {
      color: businessMetricColors.succeeded,
      id: "agentsActive",
      label: labels.agents.active,
      series: [],
      value: formatNumber(data.summary.active, locale)
    },
    {
      color: businessMetricColors.offline,
      id: "agentsOffline",
      label: labels.agents.offline,
      series: [],
      value: formatNumber(data.summary.offline, locale)
    },
    {
      color: businessMetricColors.paused,
      id: "agentsPaused",
      label: labels.agents.paused,
      series: [],
      value: formatNumber(data.summary.paused, locale)
    },
    {
      color: businessMetricColors.retired,
      id: "agentsRetired",
      label: labels.agents.retired,
      series: [],
      value: formatNumber(data.summary.retired, locale)
    }
  ];

  return (
    <section className="mt-8 space-y-6">
      <LiveUpdatedBadge
        generatedAt={data.generatedAt}
        labels={labels}
        locale={locale}
      />

      <BusinessStatsGrid metrics={agentMetrics} />

      {data.rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.rows.map((row) => (
            <AgentCard
              generatedAt={data.generatedAt}
              key={row.id}
              labels={labels}
              locale={locale}
              row={row}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.agents.empty}
        </div>
      )}
    </section>
  );
}

function LiveUpdatedBadge({
  generatedAt,
  labels,
  locale
}: Readonly<{
  generatedAt: string;
  labels: AdminContent;
  locale: Locale;
}>) {
  return (
    <div className="flex justify-end">
      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
        <span className="size-2 rounded-full bg-[#1FA77A]" />
        {labels.visibility.liveUpdated} · {labels.contentPages.updated}{" "}
        {formatGeneratedAt(generatedAt, locale)}
      </span>
    </div>
  );
}

function AgentCard({
  generatedAt,
  labels,
  locale,
  row
}: Readonly<{
  generatedAt: string;
  labels: AdminContent;
  locale: Locale;
  row: AdminAgentRow;
}>) {
  const runtimeState = agentHeartbeatState(row, generatedAt);
  const description = agentDescription(row, locale);

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-900">
            {row.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#1FA77A]/10 px-2.5 py-1 text-xs font-semibold text-[#126B4F] ring-1 ring-[#1FA77A]/20">
              {readableToken(row.type)}
            </span>
            <span className="text-xs font-medium text-gray-400">
              {compactId(row.id)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AgentHeartbeatIndicator
            generatedAt={generatedAt}
            labels={labels}
            locale={locale}
            row={row}
          />
          {runtimeState !== "undeployed" ? (
            <span
              className={classNames(
                agentStatusClass(row.status),
                "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
              )}
            >
              {readableToken(row.status)}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-gray-600">
        {description}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SupplementListMeta
          label={labels.agents.currentTask}
          value={row.activeTaskTitle ?? row.activeTaskId ?? ""}
        />
        <SupplementListMeta
          label={labels.agents.model}
          value={row.model ?? ""}
        />
        <SupplementListMeta
          label={labels.agents.successRate}
          value={
            row.successRate === null
              ? ""
              : formatPercent(row.successRate * 100, locale)
          }
        />
        <SupplementListMeta
          label={labels.agents.failureRate}
          value={
            row.failureRate === null
              ? ""
              : formatPercent(row.failureRate * 100, locale)
          }
        />
        <SupplementListMeta
          label={labels.agents.completed}
          value={formatNumber(row.completedCount, locale)}
        />
        <SupplementListMeta
          label={labels.agents.failed}
          value={formatNumber(row.failedCount, locale)}
        />
        <SupplementListMeta
          label={labels.agents.lastSeen}
          value={row.lastSeenAt ? formatGeneratedAt(row.lastSeenAt, locale) : ""}
        />
        <SupplementListMeta
          label={labels.agents.sessions}
          value={formatNumber(row.sessionCount, locale)}
        />
        <SupplementListMeta
          label={labels.agents.working}
          value={formatNumber(row.activeTaskCount, locale)}
        />
      </div>

      <div className="mt-5">
        <p
          className={classNames(
            "mb-2 text-xs font-semibold text-gray-400",
            locale === "en"
              ? "uppercase tracking-[0.16em]"
              : adminLocaleTextClass(locale, "label")
          )}
        >
          {labels.agents.capabilities}
        </p>
        <CapabilityList values={row.capabilities} />
      </div>
    </article>
  );
}
