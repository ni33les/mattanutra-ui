"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownTrayIcon,
  ChatBubbleLeftRightIcon,
  FunnelIcon,
  UserCircleIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";
import type {
  AdminCustomerInsightsData,
  CustomerInsightArchetype,
  CustomerInsightProfile,
  CustomerInsightSegment
} from "@/lib/admin-customer-insights";
import type { Locale } from "@/lib/i18n";
import {
  BusinessStatsGrid,
  PlanIdLink,
  businessMetricColors,
  classNames,
  compactId,
  formatGeneratedAt,
  formatNumber,
  optionalLabel,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";

type FilterState = Readonly<{
  archetypeId: string;
  healthBand: string;
  locale: string;
  orderStatus: string;
  panyaStatus: string;
  plan: string;
  query: string;
  recency: string;
  segmentId: string;
  source: string;
}>;

const initialFilters: FilterState = {
  archetypeId: "all",
  healthBand: "all",
  locale: "all",
  orderStatus: "all",
  panyaStatus: "all",
  plan: "all",
  query: "",
  recency: "all",
  segmentId: "all",
  source: "all"
};

const copy = {
  en: {
    aiFallback: "AI fallback",
    aiGenerated: "AI enriched",
    aiUnavailable: "AI unavailable",
    archetype: "Archetype",
    archetypeHint: "Plan, age, life-stage, and goal patterns behind the exact customer list.",
    archetypes: "Personality archetypes",
    atlas: "Customer Atlas",
    campaign: "Campaign",
    clear: "Clear",
    constraints: "Constraints",
    customer: "Customer",
    customerDrawer: "Customer details",
    customers: "Customers",
    email: "Email",
    empty: "No matching customer intelligence rows for these filters.",
    engagement: "Nong Mata engagement",
    export: "Export CSV",
    filter: "Filter",
    funnel: "Funnel",
    goals: "Goals",
    health: "HealthScore",
    lastActivity: "Last activity",
    line: "LINE",
    locale: "Locale",
    motivation: "Motivation",
    nextMessage: "Next message",
    objection: "Objection",
    order: "Order",
    orderStatus: "Order status",
    panya: "Nong Mata",
    plan: "Plan",
    products: "Products",
    readiness: "Purchase readiness",
    segment: "Segment",
    segments: "Segments",
    signalMix: "Signals",
    source: "Source",
    supplements: "Supplements",
    total: "Total customers"
  },
  th: {
    aiFallback: "ใช้ข้อความสำรอง AI",
    aiGenerated: "AI ช่วยสรุป",
    aiUnavailable: "ไม่มี AI",
    archetype: "บุคลิกกลุ่มลูกค้า",
    archetypeHint: "รูปแบบแผน อายุ ช่วงชีวิต และเป้าหมายของรายชื่อลูกค้าจริง",
    archetypes: "บุคลิกกลุ่มลูกค้า",
    atlas: "แผนที่ลูกค้า",
    campaign: "แคมเปญ",
    clear: "ล้าง",
    constraints: "ข้อจำกัด",
    customer: "ลูกค้า",
    customerDrawer: "รายละเอียดลูกค้า",
    customers: "ลูกค้า",
    email: "อีเมล",
    empty: "ไม่พบลูกค้าที่ตรงกับตัวกรองนี้",
    engagement: "การคุยกับ Nong Mata",
    export: "ส่งออก CSV",
    filter: "ตัวกรอง",
    funnel: "ขั้นตอน",
    goals: "เป้าหมาย",
    health: "HealthScore",
    lastActivity: "กิจกรรมล่าสุด",
    line: "LINE",
    locale: "ภาษา",
    motivation: "แรงจูงใจ",
    nextMessage: "ข้อความถัดไป",
    objection: "ข้อกังวล",
    order: "คำสั่งซื้อ",
    orderStatus: "สถานะคำสั่งซื้อ",
    panya: "Nong Mata",
    plan: "แผน",
    products: "สินค้า",
    readiness: "ความพร้อมซื้อ",
    segment: "กลุ่ม",
    segments: "กลุ่มลูกค้า",
    signalMix: "สัญญาณ",
    source: "แหล่งที่มา",
    supplements: "อาหารเสริม",
    total: "ลูกค้าทั้งหมด"
  },
  "zh-CN": {
    aiFallback: "AI 回退",
    aiGenerated: "AI 增强",
    aiUnavailable: "AI 不可用",
    archetype: "客户原型",
    archetypeHint: "精确客户列表背后的方案、年龄、生命阶段和目标模式。",
    archetypes: "客户原型",
    atlas: "客户图谱",
    campaign: "活动",
    clear: "清除",
    constraints: "限制",
    customer: "客户",
    customerDrawer: "客户详情",
    customers: "客户",
    email: "邮箱",
    empty: "没有符合这些筛选条件的客户。",
    engagement: "Nong Mata 互动",
    export: "导出 CSV",
    filter: "筛选",
    funnel: "漏斗",
    goals: "目标",
    health: "HealthScore",
    lastActivity: "最近活动",
    line: "LINE",
    locale: "语言",
    motivation: "动机",
    nextMessage: "下一条消息",
    objection: "顾虑",
    order: "订单",
    orderStatus: "订单状态",
    panya: "Nong Mata",
    plan: "方案",
    products: "产品",
    readiness: "购买准备度",
    segment: "细分",
    segments: "细分客户",
    signalMix: "信号",
    source: "来源",
    supplements: "补充剂",
    total: "客户总数"
  }
} satisfies Record<Locale, Record<string, string>>;

function customerName(customer: CustomerInsightProfile) {
  return (
    customer.firstName ||
    customer.contactEmail ||
    customer.panya.channelAddress ||
    `Plan ${compactId(customer.planId)}`
  );
}

function csvValue(value: unknown) {
  const text = Array.isArray(value)
    ? value.join(" | ")
    : value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCustomersCsv(customers: readonly CustomerInsightProfile[]) {
  const headers = [
    "first_name",
    "email",
    "line_or_channel",
    "plan_id",
    "selected_plan",
    "locale",
    "archetype",
    "segment",
    "goals",
    "constraints",
    "health_score",
    "health_band",
    "age_band",
    "sex",
    "life_stage",
    "panya_messages",
    "panya_inbound",
    "source",
    "campaign",
    "funnel_stage",
    "order_number",
    "order_status",
    "product_interests",
    "supplement_interests",
    "last_activity_at"
  ];
  const rows = customers.map((customer) => [
    customer.firstName,
    customer.contactEmail,
    customer.panya.channelAddress,
    customer.planId,
    customer.selectedPlan,
    customer.locale,
    customer.archetypeLabel,
    customer.primarySegmentId,
    customer.goals,
    customer.constraints,
    customer.healthScore?.score,
    customer.healthScore?.band,
    customer.demographics.ageBand,
    customer.demographics.sex,
    customer.demographics.lifeStage,
    customer.panya.messageCount,
    customer.panya.inboundCount,
    customer.source,
    customer.campaign,
    customer.funnelStage,
    customer.orderNumber,
    customer.orderStatus,
    customer.productInterests,
    customer.supplementInterests,
    customer.lastActivityAt
  ]);
  const csv = [
    headers.map(csvValue).join(","),
    ...rows.map((row) => row.map(csvValue).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `customer-intelligence-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function daysSince(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();

  return Number.isFinite(elapsed) ? elapsed / 86_400_000 : Number.POSITIVE_INFINITY;
}

function optionValues(customers: readonly CustomerInsightProfile[], key: "locale" | "orderStatus" | "selectedPlan" | "source") {
  return [...new Set(customers.flatMap((customer) => {
    const value = customer[key];

    return value ? [value] : [];
  }))].sort((first, second) => first.localeCompare(second));
}

function filteredCustomers(
  customers: readonly CustomerInsightProfile[],
  filters: FilterState
) {
  const query = filters.query.trim().toLowerCase();

  return customers.filter((customer) => {
    if (filters.archetypeId !== "all" && customer.archetypeId !== filters.archetypeId) {
      return false;
    }

    if (filters.segmentId !== "all" && !customer.segmentIds.includes(filters.segmentId)) {
      return false;
    }

    if (filters.plan !== "all" && customer.selectedPlan !== filters.plan) {
      return false;
    }

    if (filters.locale !== "all" && customer.locale !== filters.locale) {
      return false;
    }

    if (filters.panyaStatus === "engaged" && customer.panya.messageCount === 0) {
      return false;
    }

    if (filters.panyaStatus === "quiet" && customer.panya.messageCount > 0) {
      return false;
    }

    if (filters.orderStatus === "none" && (customer.orderNumber || customer.orderStatus)) {
      return false;
    }

    if (
      filters.orderStatus !== "all" &&
      filters.orderStatus !== "none" &&
      customer.orderStatus !== filters.orderStatus
    ) {
      return false;
    }

    if (filters.source !== "all" && customer.source !== filters.source) {
      return false;
    }

    if (filters.healthBand !== "all" && customer.healthScore?.band !== filters.healthBand) {
      return false;
    }

    if (filters.recency === "7d" && daysSince(customer.lastActivityAt) > 7) {
      return false;
    }

    if (filters.recency === "30d" && daysSince(customer.lastActivityAt) > 30) {
      return false;
    }

    if (filters.recency === "90d" && daysSince(customer.lastActivityAt) > 90) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      customerName(customer),
      customer.contactEmail,
      customer.panya.channelAddress,
      customer.planId,
      customer.orderNumber,
      customer.archetypeLabel,
      customer.demographics.ageBand,
      customer.demographics.sexLabel,
      customer.demographics.lifeStage,
      customer.source,
      customer.campaign,
      ...customer.goals,
      ...customer.constraints,
      ...customer.productInterests,
      ...customer.supplementInterests
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function SelectFilter({
  label,
  onChange,
  options,
  value
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  options: Array<Readonly<{ label: string; value: string }>>;
  value: string;
}>) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-gray-500">
      <span>{label}</span>
      <select
        className="h-9 rounded-md bg-white px-2 text-sm font-medium text-gray-800 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function scoreBadge(score: number) {
  if (score >= 76) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }

  if (score >= 46) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-rose-50 text-rose-700 ring-rose-100";
}

function ArchetypePanel({
  activeArchetypeId,
  archetypes,
  locale,
  onSelectArchetype
}: Readonly<{
  activeArchetypeId: string;
  archetypes: readonly CustomerInsightArchetype[];
  locale: Locale;
  onSelectArchetype: (archetypeId: string) => void;
}>) {
  const labels = copy[locale];

  if (archetypes.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {labels.archetypes}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {labels.archetypeHint}
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          onClick={() => onSelectArchetype("all")}
          type="button"
        >
          {labels.clear}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {archetypes.slice(0, 8).map((archetype) => {
          const active = activeArchetypeId === archetype.id;

          return (
            <button
              className={classNames(
                "rounded-xl bg-white p-4 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-sm",
                active ? "ring-[#1FA77A]" : "ring-gray-200"
              )}
              key={archetype.id}
              onClick={() => onSelectArchetype(archetype.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">
                  {archetype.label}
                </h3>
                <span className="shrink-0 rounded-full bg-[#20343A] px-2 py-0.5 text-xs font-bold text-white">
                  {formatNumber(archetype.count, locale)}
                </span>
              </div>
              <p className="mt-2 truncate text-xs font-semibold text-[#1FA77A]">
                {archetype.planLabel}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-800">
                  <p className="font-bold">
                    {formatNumber(archetype.panyaEngaged, locale)}
                  </p>
                  <p>{labels.panya}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800">
                  <p className="font-bold">
                    {formatNumber(archetype.paidCustomers, locale)}
                  </p>
                  <p>{labels.plan}</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-2 text-amber-900">
                  <p className="font-bold">
                    {formatNumber(archetype.customersWithOrders, locale)}
                  </p>
                  <p>{labels.order}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {archetype.signalMix.slice(0, 4).map((signal) => (
                  <span
                    className="max-w-full truncate rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200"
                    key={signal}
                  >
                    {signal}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SegmentAtlas({
  locale,
  onSelectSegment,
  segments,
  selectedSegmentId
}: Readonly<{
  locale: Locale;
  onSelectSegment: (segmentId: string) => void;
  segments: readonly CustomerInsightSegment[];
  selectedSegmentId: string;
}>) {
  const labels = copy[locale];
  const maxCount = Math.max(1, ...segments.map((segment) => segment.count));

  return (
    <section className="self-start rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-gray-900">{labels.atlas}</h2>
        <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
          <span>{labels.engagement}</span>
          <span>{labels.readiness}</span>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl bg-[#F8FAFC] ring-1 ring-gray-100">
        <svg
          aria-label={labels.atlas}
          className="h-[230px] w-full"
          preserveAspectRatio="none"
          viewBox="0 0 760 260"
        >
          <defs>
            <linearGradient id="customer-atlas-grid" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ECFDF5" />
              <stop offset="55%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#EEF2FF" />
            </linearGradient>
          </defs>
          <rect fill="url(#customer-atlas-grid)" height="260" width="760" />
          {[0, 1, 2, 3, 4].map((index) => (
            <g key={index}>
              <line
                stroke="#D1D5DB"
                strokeDasharray="4 8"
                strokeWidth="1"
                x1={80 + index * 150}
                x2={80 + index * 150}
                y1="24"
                y2="206"
              />
              <line
                stroke="#D1D5DB"
                strokeDasharray="4 8"
                strokeWidth="1"
                x1="80"
                x2="680"
                y1={24 + index * 45.5}
                y2={24 + index * 45.5}
              />
            </g>
          ))}
          <text className="fill-gray-500 text-[12px] font-semibold" x="80" y="242">
            {labels.readiness}
          </text>
          <text
            className="fill-gray-500 text-[12px] font-semibold"
            transform="rotate(-90 24 206)"
            x="24"
            y="206"
          >
            {labels.engagement}
          </text>
          {segments.map((segment, index) => {
            const radius = 10 + (segment.count / maxCount) * 22;
            const x = 80 + (Math.max(4, segment.purchaseReadinessScore) / 100) * 600;
            const y = 206 - (Math.max(4, segment.panyaEngagementScore) / 100) * 182;
            const selected = selectedSegmentId === segment.id;
            const fill = ["#1FA77A", "#3A7BD5", "#F59E0B", "#8B5CF6", "#0F766E"][index % 5];

            return (
              <g
                className="cursor-pointer"
                key={segment.id}
                onClick={() => onSelectSegment(segment.id)}
                role="button"
                tabIndex={0}
              >
                <circle
                  cx={x}
                  cy={y}
                  fill={fill}
                  fillOpacity={selected ? 0.9 : 0.68}
                  r={radius}
                  stroke={selected ? "#111827" : "#ffffff"}
                  strokeWidth={selected ? 3 : 2}
                />
                <text
                  className="pointer-events-none fill-white text-[12px] font-bold"
                  textAnchor="middle"
                  x={x}
                  y={y + 4}
                >
                  {segment.count}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function SegmentCard({
  active,
  locale,
  onSelect,
  segment
}: Readonly<{
  active: boolean;
  locale: Locale;
  onSelect: () => void;
  segment: CustomerInsightSegment;
}>) {
  const labels = copy[locale];

  return (
    <button
      className={classNames(
        "flex h-full min-h-[16rem] flex-col rounded-2xl bg-white p-5 text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md",
        active ? "ring-[#1FA77A]" : "ring-gray-200"
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900">{segment.label}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {segment.description}
          </p>
        </div>
        <span className="rounded-full bg-[#20343A] px-2.5 py-1 text-xs font-semibold text-white">
          {formatNumber(segment.count, locale)}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800">
          <p className="font-bold">{formatNumber(segment.paidCustomers, locale)}</p>
          <p>{labels.plan}</p>
        </div>
        <div className="rounded-lg bg-blue-50 p-2 text-blue-800">
          <p className="font-bold">{formatNumber(segment.panyaEngaged, locale)}</p>
          <p>{labels.panya}</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-2 text-amber-900">
          <p className="font-bold">{formatNumber(segment.customersWithOrders, locale)}</p>
          <p>{labels.order}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3 text-sm text-gray-600">
        <p>
          <span className="font-semibold text-gray-900">{labels.motivation}: </span>
          {segment.likelyMotivation}
        </p>
        <p>
          <span className="font-semibold text-gray-900">{labels.objection}: </span>
          {segment.likelyObjection}
        </p>
        <p>
          <span className="font-semibold text-gray-900">{labels.nextMessage}: </span>
          {segment.nextMessageTheme}
        </p>
      </div>
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap gap-2">
          {segment.signalMix.slice(0, 5).map((signal) => (
            <span
              className="max-w-full truncate rounded-full bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200"
              key={signal}
            >
              {signal}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function CustomerDrawer({
  customer,
  locale,
  onClose,
  segment
}: Readonly<{
  customer: CustomerInsightProfile;
  locale: Locale;
  onClose: () => void;
  segment: CustomerInsightSegment | null;
}>) {
  const labels = copy[locale];

  return (
    <div className="fixed inset-0 z-[90]">
      <button
        aria-label="Close customer details"
        className="absolute inset-0 bg-gray-900/40"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1FA77A]">
              {labels.customerDrawer}
            </p>
            <h2 className="mt-1 truncate text-2xl font-bold text-gray-900">
              {customerName(customer)}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-gray-500">
              <span className="rounded-full bg-gray-50 px-2.5 py-1 ring-1 ring-gray-200">
                {segment?.label ?? customer.primarySegmentId}
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700 ring-1 ring-blue-100">
                {customer.archetypeLabel}
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-100">
                {customer.entitlementLabel}
              </span>
            </div>
          </div>
          <button
            className="inline-flex size-9 items-center justify-center rounded-md text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50"
            onClick={onClose}
            type="button"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <section className="grid gap-3 sm:grid-cols-2">
            {[
              [labels.email, optionalLabel(customer.contactEmail)],
              [labels.line, optionalLabel(customer.panya.channelAddress)],
              [labels.source, optionalLabel(customer.source)],
              [labels.campaign, optionalLabel(customer.campaign)],
              [labels.archetype, customer.archetypeLabel],
              [labels.funnel, readableToken(customer.funnelStage)],
              [labels.lastActivity, formatGeneratedAt(customer.lastActivityAt, locale)]
            ].map(([label, value]) => (
              <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100" key={label}>
                <p className="text-xs font-semibold text-gray-400">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-gray-900">
                  {value || "—"}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">{labels.plan}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-gray-400">{labels.plan}</p>
                <PlanIdLink locale={locale} planId={customer.planId} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400">{labels.order}</p>
                <p className="text-sm font-semibold text-gray-900">
                  {[customer.orderNumber, customer.orderStatus]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">{labels.health}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {customer.healthScore?.score !== null &&
              customer.healthScore?.score !== undefined ? (
                <span
                  className={classNames(
                    scoreBadge(customer.healthScore.score),
                    "rounded-full px-2.5 py-1 text-xs font-bold ring-1"
                  )}
                >
                  {customer.healthScore.score}
                </span>
              ) : null}
              {[
                customer.healthScore?.band,
                ...(customer.healthScore?.focusAreas ?? [])
              ]
                .filter(Boolean)
                .map((item) => (
                  <span
                    className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <SignalList label={labels.goals} values={customer.goals} />
            <SignalList label={labels.constraints} values={customer.constraints} />
            <SignalList label={labels.products} values={customer.productInterests} />
            <SignalList label={labels.supplements} values={customer.supplementInterests} />
          </section>

          <section className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <ChatBubbleLeftRightIcon className="size-4 text-[#3A7BD5]" />
              {labels.panya}
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-800">
                <p className="font-bold">{customer.panya.messageCount}</p>
                <p>{labels.panya}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800">
                <p className="font-bold">{customer.panya.inboundCount}</p>
                <p>Inbound</p>
              </div>
              <div className="rounded-lg bg-rose-50 p-2 text-rose-700">
                <p className="font-bold">{customer.panya.escalationCount}</p>
                <p>Escalations</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {customer.panya.latestSnippets.length > 0 ? (
                customer.panya.latestSnippets.map((snippet, index) => (
                  <p
                    className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 ring-1 ring-gray-100"
                    key={`${snippet}:${index}`}
                  >
                    {snippet}
                  </p>
                ))
              ) : (
                <p className="text-sm text-gray-500">—</p>
              )}
            </div>
          </section>

          <section className="rounded-xl bg-[#20343A] p-4 text-white">
            <h3 className="text-sm font-semibold">{labels.segment}</h3>
            <p className="mt-2 text-sm text-white/80">
              {customer.segmentReasons.join(" · ")}
            </p>
            {segment ? (
              <p className="mt-3 text-sm text-[#CFF7E8]">{segment.marketingAngle}</p>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}

function SignalList({
  label,
  values
}: Readonly<{
  label: string;
  values: readonly string[];
}>) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
      <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.length > 0 ? (
          values.map((value) => (
            <span
              className="max-w-full truncate rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200"
              key={value}
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </div>
    </div>
  );
}

export function AdminCustomerInsightsView({
  data,
  locale
}: Readonly<{
  data: AdminCustomerInsightsData;
  locale: Locale;
}>) {
  const labels = copy[locale];
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerInsightProfile | null>(null);
  const segmentsById = useMemo(
    () => new Map(data.segments.map((segment) => [segment.id, segment])),
    [data.segments]
  );
  const customers = useMemo(
    () => filteredCustomers(data.customers, filters),
    [data.customers, filters]
  );
  const healthBands = [
    ...new Set(data.customers.flatMap((customer) =>
      customer.healthScore?.band ? [customer.healthScore.band] : []
    ))
  ].sort((first, second) => first.localeCompare(second));
  const metrics: BusinessMetric[] = [
    {
      color: businessMetricColors.total,
      id: "customerInsightsTotal",
      label: labels.total,
      series: [],
      value: formatNumber(data.summary.totalCustomers, locale)
    },
    {
      color: businessMetricColors.converted,
      id: "customerInsightsPaid",
      label: labels.plan,
      series: [],
      value: formatNumber(data.summary.paidCustomers, locale)
    },
    {
      color: businessMetricColors.active,
      id: "customerInsightsPanya",
      label: labels.panya,
      series: [],
      value: formatNumber(data.summary.panyaEngagedCustomers, locale)
    },
    {
      color: businessMetricColors.productOrders,
      id: "customerInsightsOrders",
      label: labels.order,
      series: [],
      value: formatNumber(data.summary.orderLinkedCustomers, locale)
    }
  ];
  const aiLabel =
    data.aiStatus === "generated"
      ? labels.aiGenerated
      : data.aiStatus === "fallback"
        ? labels.aiFallback
        : labels.aiUnavailable;

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <section className="mt-8">
      <BusinessStatsGrid metrics={metrics} />

      <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-9">
          <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-semibold text-gray-500 md:col-span-2 xl:col-span-2">
            <span>{labels.customer}</span>
            <input
              className="h-9 rounded-md bg-white px-3 text-sm font-medium text-gray-800 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) => updateFilter("query", event.target.value)}
              placeholder="Name, email, LINE, plan, product"
              type="search"
              value={filters.query}
            />
          </label>
            <SelectFilter
              label={labels.segment}
              onChange={(value) => updateFilter("segmentId", value)}
              options={[
                { label: "All", value: "all" },
                ...data.segments.map((segment) => ({
                  label: segment.label,
                  value: segment.id
                }))
              ]}
              value={filters.segmentId}
            />
            <SelectFilter
              label={labels.plan}
              onChange={(value) => updateFilter("plan", value)}
              options={[
                { label: "All", value: "all" },
                ...optionValues(data.customers, "selectedPlan").map((value) => ({
                  label: readableToken(value),
                  value
                }))
              ]}
              value={filters.plan}
            />
            <SelectFilter
              label={labels.locale}
              onChange={(value) => updateFilter("locale", value)}
              options={[
                { label: "All", value: "all" },
                ...optionValues(data.customers, "locale").map((value) => ({
                  label: value,
                  value
                }))
              ]}
              value={filters.locale}
            />
            <SelectFilter
              label={labels.panya}
              onChange={(value) => updateFilter("panyaStatus", value)}
              options={[
                { label: "All", value: "all" },
                { label: "Engaged", value: "engaged" },
                { label: "Quiet", value: "quiet" }
              ]}
              value={filters.panyaStatus}
            />
            <SelectFilter
              label={labels.orderStatus}
              onChange={(value) => updateFilter("orderStatus", value)}
              options={[
                { label: "All", value: "all" },
                { label: "No order", value: "none" },
                ...optionValues(data.customers, "orderStatus").map((value) => ({
                  label: readableToken(value),
                  value
                }))
              ]}
              value={filters.orderStatus}
            />
            <SelectFilter
              label={labels.source}
              onChange={(value) => updateFilter("source", value)}
              options={[
                { label: "All", value: "all" },
                ...optionValues(data.customers, "source").map((value) => ({
                  label: value,
                  value
                }))
              ]}
              value={filters.source}
            />
            <SelectFilter
              label={labels.health}
              onChange={(value) => updateFilter("healthBand", value)}
              options={[
                { label: "All", value: "all" },
                ...healthBands.map((value) => ({
                  label: value,
                  value
                }))
              ]}
              value={filters.healthBand}
            />
            <SelectFilter
              label={labels.lastActivity}
              onChange={(value) => updateFilter("recency", value)}
              options={[
                { label: "All", value: "all" },
                { label: "7 days", value: "7d" },
                { label: "30 days", value: "30d" },
                { label: "90 days", value: "90d" }
              ]}
              value={filters.recency}
            />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <FunnelIcon className="size-4 text-[#1FA77A]" />
            <span>
              {formatNumber(customers.length, locale)} /{" "}
              {formatNumber(data.customers.length, locale)} {labels.customers}
            </span>
            <span className="rounded-full bg-gray-50 px-2 py-1 ring-1 ring-gray-200">
              {aiLabel}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              onClick={() => setFilters(initialFilters)}
              type="button"
            >
              {labels.clear}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md bg-[#20343A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#16262B] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={customers.length === 0}
              onClick={() => downloadCustomersCsv(customers)}
              type="button"
            >
              <ArrowDownTrayIcon className="size-4" />
              {labels.export}
            </button>
          </div>
        </div>
      </div>

      <ArchetypePanel
        activeArchetypeId={filters.archetypeId}
        archetypes={data.archetypes}
        locale={locale}
        onSelectArchetype={(archetypeId) => updateFilter("archetypeId", archetypeId)}
      />

      <div className="mt-8 grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(32rem,0.9fr)]">
        <SegmentAtlas
          locale={locale}
          onSelectSegment={(segmentId) => updateFilter("segmentId", segmentId)}
          segments={data.segments}
          selectedSegmentId={filters.segmentId}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-1">
          {data.segments.slice(0, 4).map((segment) => (
            <SegmentCard
              active={filters.segmentId === segment.id}
              key={segment.id}
              locale={locale}
              onSelect={() => updateFilter("segmentId", segment.id)}
              segment={segment}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  labels.customer,
                  labels.segment,
                  labels.plan,
                  labels.panya,
                  labels.order,
                  labels.health,
                  labels.source,
                  labels.lastActivity
                ].map((heading) => (
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
                    key={heading}
                    scope="col"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {customers.length > 0 ? (
                customers.map((customer) => {
                  const segment = segmentsById.get(customer.primarySegmentId);

                  return (
                    <tr
                      className="cursor-pointer hover:bg-gray-50"
                      key={customer.planId}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="px-4 py-4 text-sm">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#20343A] text-white">
                            <UserCircleIcon className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900">
                              {customerName(customer)}
                            </p>
                            <p className="mt-1 truncate text-xs text-gray-500">
                              {customer.contactEmail || customer.panya.channelAddress || customer.locale}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        <div className="max-w-[14rem]">
                          <p className="truncate font-semibold text-gray-900">
                            {segment?.label ?? customer.primarySegmentId}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-400">
                            {customer.archetypeLabel}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <PlanIdLink
                          compact={true}
                          locale={locale}
                          planId={customer.planId}
                          stopPropagation={true}
                        />
                        <p className="mt-1 text-xs font-medium text-gray-500">
                          {customer.entitlementLabel}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span
                          className={classNames(
                            customer.panya.messageCount > 0
                              ? "bg-blue-50 text-blue-700 ring-blue-100"
                              : "bg-gray-50 text-gray-600 ring-gray-200",
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                          )}
                        >
                          {formatNumber(customer.panya.messageCount, locale)}
                        </span>
                        <p className="mt-1 text-xs text-gray-400">
                          {customer.panya.channelType || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        <p className="font-semibold text-gray-900">
                          {customer.orderNumber || "—"}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          {customer.orderStatus ? readableToken(customer.orderStatus) : "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {customer.healthScore?.score !== null &&
                        customer.healthScore?.score !== undefined ? (
                          <span
                            className={classNames(
                              scoreBadge(customer.healthScore.score),
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1"
                            )}
                          >
                            {customer.healthScore.score}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        <p className="mt-1 max-w-[8rem] truncate text-xs text-gray-400">
                          {customer.healthScore?.band ?? ""}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        <p>{optionalLabel(customer.source) || "—"}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {optionalLabel(customer.campaign)}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatGeneratedAt(customer.lastActivityAt, locale)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-sm font-medium text-gray-500"
                    colSpan={8}
                  >
                    {labels.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCustomer ? (
        <CustomerDrawer
          customer={selectedCustomer}
          locale={locale}
          onClose={() => setSelectedCustomer(null)}
          segment={segmentsById.get(selectedCustomer.primarySegmentId) ?? null}
        />
      ) : null}
    </section>
  );
}
