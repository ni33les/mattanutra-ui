"use client";

import {
  useEffect,
  useState,
  type ComponentType,
  type SVGProps
} from "react";
import {
  Bars3Icon,
  BeakerIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  HomeIcon,
  MegaphoneIcon,
  QueueListIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";
import { HealthspanLogo } from "@/components/healthspan-logo";
import type {
  AdminDashboardData,
  AdminDashboardKpi,
  AdminDashboardKpiId,
  AdminDashboardRate,
  AdminDashboardRateId,
  AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import type {
  AdminReviewJobRow,
  AdminReviewQueueData
} from "@/lib/admin-review-queue";
import type {
  AdminJobRow,
  AdminJobsData,
  AdminTechnicalAlertsData,
  AdminTechnicalSeverity
} from "@/lib/admin-technical";
import type {
  AdminSupplementRow,
  AdminSupplementsData,
  SupplementConfidence,
  SupplementListStatus
} from "@/lib/admin-supplements";
import {
  supplementSafetyFlags,
  type SupplementSafetyFlag
} from "@/lib/supplement-safety-flags";
import {
  adminDashboardFilterEntries,
  emptyAdminDashboardFilters,
  hasAdminDashboardFilters,
  type AdminDashboardFilters
} from "@/lib/admin-dashboard-filters";
import type {
  AdminFlowData,
  AdminFlowNodeId
} from "@/lib/admin-flow-data";
import type { Locale } from "@/lib/i18n";

type AdminDashboardView =
  | "alerts"
  | "flow"
  | "jobs"
  | "kpi"
  | "reviews"
  | "supplements";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type AdminNavItem = Readonly<{
  current?: boolean;
  href?: string;
  icon: Icon;
  name: string;
  view?: AdminDashboardView;
}>;

type KpiText = Readonly<{
  title: string;
}>;

type RateText = Readonly<{
  formula: string;
  title: string;
}>;

type AdminContent = Readonly<{
  bucketPrefix: string;
  closeSidebar: string;
  dataUnavailable: string;
  emptyFlow: string;
  filters: {
    active: string;
    affiliate: string;
    apply: string;
    campaign: string;
    campaignId: string;
    clear: string;
    device: string;
    emailHash: string;
    locale: string;
    medium: string;
    planId: string;
    promoCode: string;
    ray: string;
    selectedPlan: string;
    source: string;
    title: string;
  };
  generated: string;
  flowNodes: Record<AdminFlowNodeId, string>;
  flowMetrics: {
    dropped: string;
    happy: string;
    next: string;
    reached: string;
  };
  flowSummary: {
    conversionRate: string;
    converted: string;
    entered: string;
    reachedHealthScore: string;
  };
  flowStatus: {
    lossy: string;
    needsWork: string;
    okay: string;
  };
  flowTitle: string;
  kpis: Record<AdminDashboardKpiId, KpiText>;
  navigation: AdminNavItem[];
  nextBuckets: string;
  openSidebar: string;
  queues: AdminNavItem[];
  queuesTitle: string;
  pageTitles: Record<AdminDashboardView, string>;
  ranges: Record<AdminDashboardRange, string>;
  rates: Record<AdminDashboardRateId, RateText>;
  ratesTitle: string;
  jobs: {
    attempts: string;
    audit: string;
    complete: string;
    completed: string;
    empty: string;
    error: string;
    failed: string;
    jobType: string;
    plan: string;
    priority: string;
    queued: string;
    running: string;
    started: string;
    status: string;
    total: string;
    updated: string;
  };
  reviewQueue: {
    dismiss: string;
    dismissError: string;
    doseReduced: string;
    empty: string;
    maxDose: string;
    newDose: string;
    originalDose: string;
    plan: string;
    priority: string;
    queued: string;
    requiredFields: string;
    reviewRequired: string;
    total: string;
    unknown: string;
  };
  technical: AdminNavItem[];
  technicalAlerts: {
    critical: string;
    empty: string;
    event: string;
    high: string;
    job: string;
    low: string;
    medium: string;
    plan: string;
    source: string;
    status: string;
    time: string;
    total: string;
  };
  technicalTitle: string;
  supplements: {
    allCategories: string;
    allStatuses: string;
    blacklisted: string;
    category: string;
    confidence: string;
    close: string;
    details: string;
    dose: string;
    empty: string;
    inactive: string;
    maxAmount: string;
    maxUnit: string;
    none: string;
    reviewRequired: string;
    safetyFlag: string;
    safetyFlagOptions: Record<SupplementSafetyFlag, string>;
    safetyNotes: string;
    save: string;
    search: string;
    sourceStatus: string;
    status: string;
    total: string;
    updateError: string;
    whitelisted: string;
  };
  title: string;
  trend: Record<AdminDashboardKpi["trend"], string>;
}>;

const rangeOrder: AdminDashboardRange[] = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "all"
];

const content = {
  en: {
    bucketPrefix: "per",
    closeSidebar: "Close sidebar",
    dataUnavailable:
      "Dashboard data is unavailable. Check the database connection.",
    emptyFlow: "No flow events in this timeframe.",
    filters: {
      active: "Active filters",
      affiliate: "Affiliate",
      apply: "Apply filters",
      campaign: "Campaign",
      campaignId: "Campaign ID",
      clear: "Clear",
      device: "Device",
      emailHash: "Email hash",
      locale: "Locale",
      medium: "Medium",
      planId: "Plan ID",
      promoCode: "Promo code",
      ray: "Ray",
      selectedPlan: "Plan",
      source: "Source",
      title: "Filters"
    },
    generated: "Generated",
    flowNodes: {
      assessmentStarted: "Started",
      assessmentSubmitted: "Submitted",
      assessmentViewed: "Assessment",
      chatClicked: "Chat",
      dropoffAfterAssessment: "Dropped after assessment",
      dropoffAfterAssessmentStart: "Dropped after start",
      dropoffAfterFormulation: "Dropped after nutrition plan",
      dropoffAfterFreeEmailRequest: "Dropped after Free request",
      dropoffAfterHealthScore: "Dropped after HealthScore",
      dropoffAfterLanding: "Dropped after landing",
      dropoffAfterPlanSelection: "Dropped after plan",
      dropoffAfterPrecisionPayment: "Dropped after Precision",
      dropoffAfterProPayment: "Dropped after Pro",
      dropoffAfterResults: "Dropped after results",
      dropoffAfterSubmission: "Dropped after submission",
      formulationReady: "Nutrition plan",
      freeEmailRequested: "Free email",
      freeEmailSent: "Email sent",
      healthscoreViewed: "HealthScore",
      landingViewed: "Landing",
      marketplaceClicked: "Marketplace",
      planSelected: "Plan selected",
      precisionPaid: "Precision paid",
      proPaid: "Pro paid",
      resultsViewed: "Results"
    },
    flowMetrics: {
      dropped: "Dropped",
      happy: "Happy",
      next: "Next",
      reached: "Reached"
    },
    flowSummary: {
      conversionRate: "Conversion",
      converted: "Converted",
      entered: "Landed",
      reachedHealthScore: "HealthScore"
    },
    flowStatus: {
      lossy: "Lossy",
      needsWork: "Needs work",
      okay: "Okay"
    },
    flowTitle: "Sales Conversions",
    kpis: {
      free: {
        title: "Free conversions"
      },
      precision: {
        title: "Precision conversions"
      },
      pro: {
        title: "Pro conversions"
      }
    },
    navigation: [
      { icon: HomeIcon, name: "KPI", view: "kpi" },
      { icon: FunnelIcon, name: "Conversions", view: "flow" },
      { href: "#", icon: MegaphoneIcon, name: "Campaigns" },
      { href: "#", icon: EnvelopeIcon, name: "Leads" },
      { icon: BeakerIcon, name: "Supplements", view: "supplements" },
      { href: "#", icon: DocumentTextIcon, name: "Content" }
    ],
    nextBuckets: "Next 3 buckets",
    openSidebar: "Open sidebar",
    queues: [{ icon: ExclamationTriangleIcon, name: "Human review", view: "reviews" }],
    queuesTitle: "Queues",
    pageTitles: {
      alerts: "Technical Alerts",
      flow: "Sales Conversions",
      jobs: "Jobs",
      kpi: "Key Performance Indicators",
      reviews: "Human Review",
      supplements: "Supplements"
    },
    ranges: {
      all: "All",
      day: "Day",
      hour: "Hour",
      month: "Month",
      week: "Week",
      year: "Year"
    },
    rates: {
      freeRate: {
        formula: "Free email requests / HealthScore views",
        title: "Free conversion rate"
      },
      paidRate: {
        formula: "(Paid Precision + Paid Pro) / HealthScore views",
        title: "Paid conversion rate"
      },
      precisionRate: {
        formula: "Paid Precision purchases / HealthScore views",
        title: "Precision conversion rate"
      },
      proRate: {
        formula: "Paid Pro purchases / HealthScore views",
        title: "Pro conversion rate"
      }
    },
    ratesTitle: "Conversion rates",
    jobs: {
      attempts: "Attempts",
      audit: "Latest audit",
      complete: "Complete",
      completed: "Completed",
      empty: "No jobs in this timeframe.",
      error: "Error",
      failed: "Failed",
      jobType: "Job type",
      plan: "Plan",
      priority: "Priority",
      queued: "Queued",
      running: "Running",
      started: "Started",
      status: "Status",
      total: "Total",
      updated: "Updated"
    },
    reviewQueue: {
      dismiss: "Dismiss",
      dismissError: "Could not dismiss this review job.",
      doseReduced: "Dose reduced",
      empty: "No supplement review jobs are waiting.",
      maxDose: "Max dose",
      newDose: "New dose",
      originalDose: "Original dose",
      plan: "Plan",
      priority: "Priority",
      queued: "Queued",
      requiredFields: "Required fields",
      reviewRequired: "Review required",
      total: "Total",
      unknown: "Unknown supplement"
    },
    technical: [
      { icon: ExclamationTriangleIcon, name: "Alerts", view: "alerts" },
      { icon: QueueListIcon, name: "Jobs", view: "jobs" }
    ],
    technicalAlerts: {
      critical: "Critical",
      empty: "No technical alerts in this timeframe.",
      event: "Event",
      high: "High",
      job: "Job",
      low: "Low",
      medium: "Medium",
      plan: "Plan",
      source: "Source",
      status: "Status",
      time: "Time",
      total: "Total"
    },
    technicalTitle: "Technical",
    supplements: {
      allCategories: "All categories",
      allStatuses: "All statuses",
      blacklisted: "Blacklisted",
      category: "Category",
      confidence: "Confidence",
      close: "Close",
      details: "Details",
      dose: "Max dose",
      empty: "No supplements match these filters.",
      inactive: "Inactive",
      maxAmount: "Amount",
      maxUnit: "Unit",
      none: "None",
      reviewRequired: "Review required",
      safetyFlag: "Safety flags",
      safetyFlagOptions: {
        allergy_caution: "Allergy caution",
        bleeding_risk: "Bleeding risk",
        condition_caution: "Condition caution",
        contamination_risk: "Contamination risk",
        exclude_automated_use: "Exclude automated use",
        general_caution: "General caution",
        hormone_caution: "Hormone caution",
        kidney_caution: "Kidney caution",
        liver_caution: "Liver caution",
        medication_interaction: "Medication interaction",
        pregnancy_caution: "Pregnancy caution",
        regulatory_risk: "Regulatory risk",
        stimulant: "Stimulant",
        upper_dose_risk: "Upper dose risk"
      },
      safetyNotes: "Safety notes",
      save: "Save",
      search: "Search supplements",
      sourceStatus: "Source",
      status: "Status",
      total: "Total",
      updateError: "Could not save this supplement.",
      whitelisted: "Whitelisted"
    },
    title: "KPI",
    trend: {
      down: "Down",
      flat: "Flat",
      up: "Up"
    }
  },
  th: {
    bucketPrefix: "ต่อ",
    closeSidebar: "ปิดแถบเมนู",
    dataUnavailable:
      "ไม่สามารถโหลดข้อมูลแดชบอร์ดได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล",
    emptyFlow: "ยังไม่มีข้อมูล Flow ในช่วงเวลานี้",
    filters: {
      active: "ตัวกรองที่ใช้",
      affiliate: "Affiliate",
      apply: "ใช้ตัวกรอง",
      campaign: "Campaign",
      campaignId: "Campaign ID",
      clear: "ล้าง",
      device: "อุปกรณ์",
      emailHash: "Email hash",
      locale: "ภาษา",
      medium: "Medium",
      planId: "Plan ID",
      promoCode: "Promo code",
      ray: "Ray",
      selectedPlan: "แผน",
      source: "Source",
      title: "ตัวกรอง"
    },
    generated: "สร้างเมื่อ",
    flowNodes: {
      assessmentStarted: "เริ่มทำ",
      assessmentSubmitted: "ส่งแบบประเมิน",
      assessmentViewed: "แบบประเมิน",
      chatClicked: "แชต",
      dropoffAfterAssessment: "ออกหลังแบบประเมิน",
      dropoffAfterAssessmentStart: "ออกหลังเริ่มทำ",
      dropoffAfterFormulation: "ออกหลังแผนโภชนาการ",
      dropoffAfterFreeEmailRequest: "ออกหลังขออีเมลฟรี",
      dropoffAfterHealthScore: "ออกหลัง HealthScore",
      dropoffAfterLanding: "ออกหลังหน้าแรก",
      dropoffAfterPlanSelection: "ออกหลังเลือกแผน",
      dropoffAfterPrecisionPayment: "ออกหลัง Precision",
      dropoffAfterProPayment: "ออกหลัง Pro",
      dropoffAfterResults: "ออกหลังผลลัพธ์",
      dropoffAfterSubmission: "ออกหลังส่งแบบประเมิน",
      formulationReady: "แผนโภชนาการ",
      freeEmailRequested: "อีเมลฟรี",
      freeEmailSent: "ส่งอีเมลแล้ว",
      healthscoreViewed: "HealthScore",
      landingViewed: "หน้าแรก",
      marketplaceClicked: "มาร์เก็ตเพลส",
      planSelected: "เลือกแผน",
      precisionPaid: "Precision ชำระแล้ว",
      proPaid: "Pro ชำระแล้ว",
      resultsViewed: "ผลลัพธ์"
    },
    flowMetrics: {
      dropped: "ออก",
      happy: "ไปต่อ",
      next: "ถัดไป",
      reached: "มาถึง"
    },
    flowSummary: {
      conversionRate: "คอนเวอร์ชัน",
      converted: "แปลงเป็นลูกค้า/ลีด",
      entered: "เข้า Landing",
      reachedHealthScore: "HealthScore"
    },
    flowStatus: {
      lossy: "สูญเสียสูง",
      needsWork: "ควรปรับปรุง",
      okay: "ดี"
    },
    flowTitle: "Sales Conversions",
    kpis: {
      free: {
        title: "คอนเวอร์ชันฟรี"
      },
      precision: {
        title: "คอนเวอร์ชัน Precision"
      },
      pro: {
        title: "คอนเวอร์ชัน Pro"
      }
    },
    navigation: [
      { icon: HomeIcon, name: "KPI", view: "kpi" },
      { icon: FunnelIcon, name: "Conversions", view: "flow" },
      { href: "#", icon: MegaphoneIcon, name: "แคมเปญ" },
      { href: "#", icon: EnvelopeIcon, name: "ลีด" },
      { icon: BeakerIcon, name: "อาหารเสริม", view: "supplements" },
      { href: "#", icon: DocumentTextIcon, name: "คอนเทนต์" }
    ],
    nextBuckets: "คาดการณ์ 3 ช่วงถัดไป",
    openSidebar: "เปิดแถบเมนู",
    queues: [{ icon: ExclamationTriangleIcon, name: "รีวิวโดยคน", view: "reviews" }],
    queuesTitle: "คิวงาน",
    pageTitles: {
      alerts: "การแจ้งเตือนทางเทคนิค",
      flow: "Sales Conversions",
      jobs: "งานระบบ",
      kpi: "Key Performance Indicators",
      reviews: "รีวิวโดยคน",
      supplements: "อาหารเสริม"
    },
    ranges: {
      all: "ทั้งหมด",
      day: "วัน",
      hour: "ชั่วโมง",
      month: "เดือน",
      week: "สัปดาห์",
      year: "ปี"
    },
    rates: {
      freeRate: {
        formula: "คำขอแผนฟรี / การดู HealthScore",
        title: "อัตราคอนเวอร์ชันฟรี"
      },
      paidRate: {
        formula: "(Precision ที่ชำระแล้ว + Pro ที่ชำระแล้ว) / การดู HealthScore",
        title: "อัตราคอนเวอร์ชันชำระเงิน"
      },
      precisionRate: {
        formula: "Precision ที่ชำระแล้ว / การดู HealthScore",
        title: "อัตราคอนเวอร์ชัน Precision"
      },
      proRate: {
        formula: "Pro ที่ชำระแล้ว / การดู HealthScore",
        title: "อัตราคอนเวอร์ชัน Pro"
      }
    },
    ratesTitle: "อัตราคอนเวอร์ชัน",
    jobs: {
      attempts: "จำนวนครั้ง",
      audit: "Audit ล่าสุด",
      complete: "เสร็จแล้ว",
      completed: "เสร็จเมื่อ",
      empty: "ไม่มีงานในช่วงเวลานี้",
      error: "ข้อผิดพลาด",
      failed: "ล้มเหลว",
      jobType: "ชนิดงาน",
      plan: "แผน",
      priority: "ความสำคัญ",
      queued: "เข้าคิว",
      running: "กำลังทำงาน",
      started: "เริ่มเมื่อ",
      status: "สถานะ",
      total: "ทั้งหมด",
      updated: "อัปเดต"
    },
    reviewQueue: {
      dismiss: "ปิดรายการ",
      dismissError: "ไม่สามารถปิดงานรีวิวนี้ได้",
      doseReduced: "ลดขนาดแล้ว",
      empty: "ไม่มีงานรีวิวอาหารเสริมที่รอดำเนินการ",
      maxDose: "ขนาดสูงสุด",
      newDose: "ขนาดใหม่",
      originalDose: "ขนาดเดิม",
      plan: "แผน",
      priority: "ความสำคัญ",
      queued: "เข้าคิว",
      requiredFields: "ข้อมูลที่ต้องมี",
      reviewRequired: "ต้องรีวิว",
      total: "ทั้งหมด",
      unknown: "อาหารเสริมใหม่"
    },
    technical: [
      { icon: ExclamationTriangleIcon, name: "แจ้งเตือน", view: "alerts" },
      { icon: QueueListIcon, name: "งานระบบ", view: "jobs" }
    ],
    technicalAlerts: {
      critical: "วิกฤต",
      empty: "ไม่มี Technical Alert ในช่วงเวลานี้",
      event: "อีเวนต์",
      high: "สูง",
      job: "งาน",
      low: "ต่ำ",
      medium: "กลาง",
      plan: "แผน",
      source: "แหล่งข้อมูล",
      status: "สถานะ",
      time: "เวลา",
      total: "ทั้งหมด"
    },
    technicalTitle: "เทคนิค",
    supplements: {
      allCategories: "ทุกหมวดหมู่",
      allStatuses: "ทุกสถานะ",
      blacklisted: "บัญชีดำ",
      category: "หมวดหมู่",
      confidence: "ความมั่นใจ",
      close: "ปิด",
      details: "รายละเอียด",
      dose: "ขนาดสูงสุด",
      empty: "ไม่พบอาหารเสริมตามตัวกรองนี้",
      inactive: "ปิดใช้",
      maxAmount: "ปริมาณ",
      maxUnit: "หน่วย",
      none: "ไม่มี",
      reviewRequired: "ต้องรีวิว",
      safetyFlag: "ธงความปลอดภัย",
      safetyFlagOptions: {
        allergy_caution: "ข้อควรระวังเรื่องแพ้",
        bleeding_risk: "ความเสี่ยงเลือดออก",
        condition_caution: "ข้อควรระวังตามภาวะสุขภาพ",
        contamination_risk: "ความเสี่ยงปนเปื้อน",
        exclude_automated_use: "ห้ามใช้แบบอัตโนมัติ",
        general_caution: "ข้อควรระวังทั่วไป",
        hormone_caution: "ข้อควรระวังฮอร์โมน",
        kidney_caution: "ข้อควรระวังไต",
        liver_caution: "ข้อควรระวังตับ",
        medication_interaction: "ปฏิกิริยากับยา",
        pregnancy_caution: "ข้อควรระวังตั้งครรภ์",
        regulatory_risk: "ความเสี่ยงด้านกฎระเบียบ",
        stimulant: "สารกระตุ้น",
        upper_dose_risk: "ความเสี่ยงขนาดสูง"
      },
      safetyNotes: "หมายเหตุความปลอดภัย",
      save: "บันทึก",
      search: "ค้นหาอาหารเสริม",
      sourceStatus: "แหล่งข้อมูล",
      status: "สถานะ",
      total: "ทั้งหมด",
      updateError: "ไม่สามารถบันทึกอาหารเสริมนี้ได้",
      whitelisted: "อนุญาต"
    },
    title: "KPI",
    trend: {
      down: "ลดลง",
      flat: "คงที่",
      up: "เพิ่มขึ้น"
    }
  }
} satisfies Record<Locale, AdminContent>;

const kpiColors = {
  free: "#0EA5E9",
  precision: "#1FA77A",
  pro: "#20343A"
} satisfies Record<AdminDashboardKpiId, string>;

const rateColors = {
  freeRate: "#0EA5E9",
  paidRate: "#20343A",
  precisionRate: "#1FA77A",
  proRate: "#8B5CF6"
} satisfies Record<AdminDashboardRateId, string>;

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function adminHref(
  locale: Locale,
  accessToken: string,
  range: AdminDashboardRange,
  view: AdminDashboardView,
  filters?: AdminDashboardFilters
) {
  const params = new URLSearchParams({
    access_token: accessToken,
    range,
    view
  });

  if (filters) {
    adminDashboardFilterEntries(filters).forEach(([key, value]) => {
      params.set(key, value);
    });
  }

  return `/${locale}/admin/dashboard?${params.toString()}`;
}

function formatLocale(locale: Locale) {
  return locale === "th" ? "th-TH-u-nu-latn" : "en-GB";
}

function formatGeneratedAt(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(formatLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(formatLocale(locale)).format(value);
}

function formatPercent(value: number, locale: Locale) {
  return `${new Intl.NumberFormat(formatLocale(locale), {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(value)}%`;
}

function SidebarNavList({
  accessToken,
  filters,
  items,
  locale,
  onNavigate,
  range,
  title,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  items: AdminNavItem[];
  locale: Locale;
  onNavigate?: () => void;
  range: AdminDashboardRange;
  title?: string;
  view: AdminDashboardView;
}>) {
  return (
    <li>
      {title ? (
        <div className="text-xs/6 font-semibold uppercase tracking-[0.16em] text-gray-400">
          {title}
        </div>
      ) : null}
      <ul role="list" className={classNames("-mx-2 space-y-1", title && "mt-2")}>
        {items.map((item) => {
          const current = item.view === view;
          const href = item.view
            ? adminHref(locale, accessToken, range, item.view, filters)
            : item.href ?? "#";

          return (
            <li key={item.name}>
              <a
                href={href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={classNames(
                  current
                    ? "bg-[#1FA77A]/10 text-[#126B4F]"
                    : "text-gray-700 hover:bg-gray-50 hover:text-[#126B4F]",
                  "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold"
                )}
              >
                <item.icon
                  aria-hidden={true}
                  className={classNames(
                    current
                      ? "text-[#1FA77A]"
                      : "text-gray-400 group-hover:text-[#1FA77A]",
                    "size-6 shrink-0"
                  )}
                />
                {item.name}
              </a>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function SidebarContent({
  accessToken,
  filters,
  labels,
  locale,
  onNavigate,
  range,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  onNavigate?: () => void;
  range: AdminDashboardRange;
  view: AdminDashboardView;
}>) {
  return (
    <div className="flex grow flex-col gap-y-6 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4">
      <div className="flex h-20 shrink-0 items-center">
        <a
          href={`/${locale}`}
          onClick={onNavigate}
          aria-label="MattaNutra home"
          className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] focus-visible:ring-offset-2"
        >
          <HealthspanLogo />
        </a>
      </div>

      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-8">
          <SidebarNavList
            accessToken={accessToken}
            filters={filters}
            items={labels.navigation}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            filters={filters}
            items={labels.queues}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.queuesTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            filters={filters}
            items={labels.technical}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.technicalTitle}
            view={view}
          />
        </ul>
      </nav>
    </div>
  );
}

function Sparkline({
  color,
  forecast,
  series
}: Readonly<{
  color: string;
  forecast: number[];
  series: number[];
}>) {
  const width = 260;
  const height = 72;
  const actual = series.length > 0 ? series : [0];
  const forecastLine = [actual.at(-1) ?? 0, ...forecast];
  const totalPoints = Math.max(2, actual.length + forecast.length);
  const maxValue = Math.max(1, ...actual, ...forecast);

  const points = (values: number[], startIndex: number) =>
    values
      .map((value, index) => {
        const x = ((startIndex + index) / (totalPoints - 1)) * width;
        const y = height - (value / maxValue) * (height - 8) - 4;

        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg
      aria-hidden={true}
      className="h-20 w-full overflow-visible"
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <line
        x1="0"
        x2={width}
        y1={height - 4}
        y2={height - 4}
        className="stroke-gray-200"
        strokeWidth="1"
      />
      <polyline
        fill="none"
        points={points(actual, 0)}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <polyline
        fill="none"
        opacity="0.55"
        points={points(forecastLine, Math.max(0, actual.length - 1))}
        stroke={color}
        strokeDasharray="5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function TrendPill({
  labels,
  trend
}: Readonly<{
  labels: AdminContent;
  trend: AdminDashboardKpi["trend"];
}>) {
  return (
    <span
      className={classNames(
        trend === "up" && "bg-[#1FA77A]/10 text-[#126B4F]",
        trend === "down" && "bg-red-50 text-red-700",
        trend === "flat" && "bg-gray-100 text-gray-600",
        "rounded-full px-2 py-1 text-xs font-medium"
      )}
    >
      {labels.trend[trend]}
    </span>
  );
}

function KpiCard({
  bucketLabel,
  kpi,
  labels,
  locale
}: Readonly<{
  bucketLabel: string;
  kpi: AdminDashboardKpi;
  labels: AdminContent;
  locale: Locale;
}>) {
  const text = labels.kpis[kpi.id];
  const color = kpiColors[kpi.id];

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{text.title}</h2>
        </div>
        <TrendPill labels={labels} trend={kpi.trend} />
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <p className="text-4xl font-semibold tracking-tight text-[#20343A]">
          {formatNumber(kpi.value, locale)}
        </p>
        <p className="pb-1 text-xs font-medium uppercase tracking-[0.14em] text-gray-400">
          {labels.bucketPrefix} {bucketLabel}
        </p>
      </div>

      <div className="mt-5">
        <Sparkline color={color} forecast={kpi.forecast} series={kpi.series} />
      </div>

      <p className="mt-3 text-sm text-gray-600">
        <span className="font-medium text-gray-900">{labels.nextBuckets}:</span>{" "}
        {kpi.forecast.map((value) => formatNumber(value, locale)).join(" / ")}
      </p>
    </section>
  );
}

function RateCard({
  labels,
  locale,
  rate
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  rate: AdminDashboardRate;
}>) {
  const text = labels.rates[rate.id];
  const color = rateColors[rate.id];

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{text.title}</h3>
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600 ring-1 ring-gray-200">
            {text.formula}
          </p>
        </div>
        <TrendPill labels={labels} trend={rate.trend} />
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <p className="text-4xl font-semibold tracking-tight text-[#20343A]">
          {formatPercent(rate.value, locale)}
        </p>
        <p className="pb-1 text-xs font-medium uppercase tracking-[0.14em] text-gray-400">
          {formatNumber(rate.numerator, locale)} /{" "}
          {formatNumber(rate.denominator, locale)}
        </p>
      </div>

      <div className="mt-5">
        <Sparkline
          color={color}
          forecast={rate.forecast}
          series={rate.series}
        />
      </div>

      <p className="mt-3 text-sm text-gray-600">
        <span className="font-medium text-gray-900">{labels.nextBuckets}:</span>{" "}
        {rate.forecast.map((value) => formatPercent(value, locale)).join(" / ")}
      </p>
    </section>
  );
}

const supplementListStatuses: SupplementListStatus[] = [
  "whitelisted",
  "review_required",
  "blacklisted",
  "inactive"
];

const supplementConfidences: SupplementConfidence[] = [
  "high",
  "moderate",
  "low"
];

function supplementStatusLabel(
  labels: AdminContent,
  status: SupplementListStatus
) {
  if (status === "whitelisted") {
    return labels.supplements.whitelisted;
  }

  if (status === "blacklisted") {
    return labels.supplements.blacklisted;
  }

  if (status === "inactive") {
    return labels.supplements.inactive;
  }

  return labels.supplements.reviewRequired;
}

function supplementStatusClass(status: SupplementListStatus) {
  if (status === "whitelisted") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  if (status === "blacklisted") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "inactive") {
    return "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function sourceStatusLabel(status: AdminSupplementRow["sourceStatus"]) {
  return status === "recommended_add" ? "Recommended add" : "Core";
}

function supplementSafetyFlagLabel(
  labels: AdminContent,
  flag: SupplementSafetyFlag
) {
  return labels.supplements.safetyFlagOptions[flag];
}

function formatSupplementSafetyFlags(
  labels: AdminContent,
  flags: SupplementSafetyFlag[]
) {
  return flags.length
    ? flags.map((flag) => supplementSafetyFlagLabel(labels, flag)).join(", ")
    : labels.supplements.none;
}

function toggleSupplementSafetyFlag(
  flags: SupplementSafetyFlag[],
  flag: SupplementSafetyFlag
) {
  return flags.includes(flag)
    ? flags.filter((item) => item !== flag)
    : [...flags, flag];
}

function AdminSupplementsView({
  accessToken,
  data,
  labels,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminSupplementsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [rows, setRows] = useState(data.rows);
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState<AdminSupplementRow | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const summary = rows.reduce(
    (counts, row) => {
      counts.total += 1;

      if (row.listStatus === "whitelisted") {
        counts.whitelisted += 1;
      } else if (row.listStatus === "blacklisted") {
        counts.blacklisted += 1;
      } else if (row.listStatus === "inactive") {
        counts.inactive += 1;
      } else {
        counts.reviewRequired += 1;
      }

      return counts;
    },
    {
      blacklisted: 0,
      inactive: 0,
      reviewRequired: 0,
      total: 0,
      whitelisted: 0
    }
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    const matchesSearch =
      !normalizedSearch ||
      row.name.toLowerCase().includes(normalizedSearch) ||
      row.category.toLowerCase().includes(normalizedSearch) ||
      row.safetyFlags.some((flag) =>
        supplementSafetyFlagLabel(labels, flag)
          .toLowerCase()
          .includes(normalizedSearch)
      );
    const matchesCategory = !category || row.category === category;
    const matchesStatus = !status || row.listStatus === status;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  function syncRow(row: AdminSupplementRow) {
    setRows((currentRows) =>
      currentRows.map((item) => (item.id === row.id ? row : item))
    );
    setDraft((currentDraft) =>
      currentDraft?.id === row.id ? row : currentDraft
    );
  }

  async function saveRow(row: AdminSupplementRow): Promise<boolean> {
    setSavingId(row.id);
    setErrorId(null);

    try {
      const response = await fetch(`/api/admin/supplements/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          confidence: row.confidence,
          listStatus: row.listStatus,
          maxAmount: row.maxAmount,
          maxUnit: row.maxUnit,
          safetyFlags: row.safetyFlags,
          safetyNotes: row.safetyNotes
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error("Unable to save supplement");
      }

      const payload = (await response.json()) as { row?: AdminSupplementRow };

      syncRow(payload.row ?? row);
      return true;
    } catch {
      setErrorId(row.id);
      return false;
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FlowSummaryCard
          label={labels.supplements.total}
          value={formatNumber(summary.total, locale)}
        />
        <FlowSummaryCard
          label={labels.supplements.whitelisted}
          value={formatNumber(summary.whitelisted, locale)}
        />
        <FlowSummaryCard
          label={labels.supplements.reviewRequired}
          value={formatNumber(summary.reviewRequired, locale)}
        />
        <FlowSummaryCard
          label={labels.supplements.blacklisted}
          value={formatNumber(summary.blacklisted, locale)}
        />
        <FlowSummaryCard
          label={labels.supplements.inactive}
          value={formatNumber(summary.inactive, locale)}
        />
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_14rem_14rem]">
          <input
            aria-label={labels.supplements.search}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.supplements.search}
            type="search"
            value={search}
          />
          <select
            aria-label={labels.supplements.category}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="">{labels.supplements.allCategories}</option>
            {data.categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            aria-label={labels.supplements.status}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">{labels.supplements.allStatuses}</option>
            {supplementListStatuses.map((item) => (
              <option key={item} value={item}>
                {supplementStatusLabel(labels, item)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="divide-y divide-gray-100">
          {filteredRows.map((row) => (
            <button
              key={row.id}
              aria-label={`${labels.supplements.details}: ${row.name}`}
              className="block w-full px-5 py-4 text-left transition hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1FA77A]"
              onClick={() => {
                setDraft(row);
                setErrorId(null);
              }}
              type="button"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_8rem] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={classNames(
                        supplementStatusClass(row.listStatus),
                        "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                      )}
                    >
                      {supplementStatusLabel(labels, row.listStatus)}
                    </span>
                  </div>
                  <h3 className="mt-3 truncate text-base font-semibold text-gray-900">
                    {row.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {sourceStatusLabel(row.sourceStatus)}
                    {row.ingredientType ? ` · ${row.ingredientType}` : ""}
                  </p>
                  {row.primaryUseCase ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">
                      {row.primaryUseCase}
                    </p>
                  ) : null}
                </div>

                <SupplementListMeta
                  label={labels.supplements.category}
                  value={row.category}
                />
                <SupplementListMeta
                  label={labels.supplements.dose}
                  value={formatSupplementDose(row, locale)}
                />
                <SupplementListMeta
                  label={labels.supplements.safetyFlag}
                  value={formatSupplementSafetyFlags(labels, row.safetyFlags)}
                />
              </div>
            </button>
          ))}
        </div>

        {filteredRows.length === 0 ? (
          <div className="border-t border-gray-100 px-5 py-12 text-center text-sm font-medium text-gray-500">
            {labels.supplements.empty}
          </div>
        ) : null}
      </div>

      {draft ? (
        <SupplementDetailsModal
          draft={draft}
          error={errorId === draft.id}
          labels={labels}
          locale={locale}
          onChange={(patch) =>
            setDraft((currentDraft) =>
              currentDraft ? { ...currentDraft, ...patch } : currentDraft
            )
          }
          onClose={() => {
            if (savingId !== draft.id) {
              setDraft(null);
              setErrorId(null);
            }
          }}
          onSave={() => {
            void saveRow(draft).then((saved) => {
              if (saved) {
                setDraft(null);
              }
            });
          }}
          saving={savingId === draft.id}
        />
      ) : null}
    </section>
  );
}

function formatSupplementDose(row: AdminSupplementRow, locale: Locale) {
  if (row.maxAmount === null && !row.maxUnit) {
    return "—";
  }

  const amount =
    row.maxAmount === null
      ? "—"
      : new Intl.NumberFormat(formatLocale(locale), {
          maximumFractionDigits: 2
        }).format(row.maxAmount);

  return row.maxUnit ? `${amount} ${row.maxUnit}` : amount;
}

function SupplementListMeta({
  label,
  value
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900">
        {value || "—"}
      </p>
    </div>
  );
}

function SupplementDetailsModal({
  draft,
  error,
  labels,
  locale,
  onChange,
  onClose,
  onSave,
  saving
}: Readonly<{
  draft: AdminSupplementRow;
  error: boolean;
  labels: AdminContent;
  locale: Locale;
  onChange: (patch: Partial<AdminSupplementRow>) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}>) {
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        aria-label={labels.supplements.close}
        className="fixed inset-0 cursor-default bg-gray-900/40"
        onClick={onClose}
        type="button"
      />
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section
          aria-modal={true}
          className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/10"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={classNames(
                    supplementStatusClass(draft.listStatus),
                    "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {supplementStatusLabel(labels, draft.listStatus)}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-gray-900">
                {draft.name}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {sourceStatusLabel(draft.sourceStatus)}
                {draft.ingredientType ? ` · ${draft.ingredientType}` : ""}
              </p>
            </div>
            <button
              aria-label={labels.supplements.close}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
              onClick={onClose}
              type="button"
            >
              <XMarkIcon aria-hidden={true} className="size-5" />
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <SupplementListMeta
                label={labels.supplements.category}
                value={draft.category}
              />
              <SupplementListMeta
                label={labels.supplements.dose}
                value={formatSupplementDose(draft, locale)}
              />
              <SupplementListMeta
                label={labels.supplements.confidence}
                value={draft.confidence}
              />
              <SupplementListMeta
                label={labels.supplements.safetyFlag}
                value={formatSupplementSafetyFlags(labels, draft.safetyFlags)}
              />
            </div>

            {draft.primaryUseCase ? (
              <div className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700 ring-1 ring-gray-100">
                {draft.primaryUseCase}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.supplements.status}
                <select
                  className={classNames(
                    supplementStatusClass(draft.listStatus),
                    "rounded-md px-3 py-2 text-sm font-semibold ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  )}
                  onChange={(event) =>
                    onChange({
                      listStatus: event.target.value as SupplementListStatus
                    })
                  }
                  value={draft.listStatus}
                >
                  {supplementListStatuses.map((item) => (
                    <option key={item} value={item}>
                      {supplementStatusLabel(labels, item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.supplements.confidence}
                <select
                  className={inputClass}
                  onChange={(event) =>
                    onChange({
                      confidence: event.target.value as SupplementConfidence
                    })
                  }
                  value={draft.confidence}
                >
                  {supplementConfidences.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.supplements.maxAmount}
                <input
                  className={inputClass}
                  min="0"
                  onChange={(event) =>
                    onChange({
                      maxAmount:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value)
                    })
                  }
                  step="any"
                  type="number"
                  value={draft.maxAmount ?? ""}
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.supplements.maxUnit}
                <input
                  className={inputClass}
                  onChange={(event) =>
                    onChange({ maxUnit: event.target.value })
                  }
                  value={draft.maxUnit}
                />
              </label>
            </div>

            <div className="grid gap-2 text-sm font-medium text-gray-700">
              {labels.supplements.safetyFlag}
              <details className="rounded-xl bg-white ring-1 ring-gray-200">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm text-gray-900 outline-none marker:hidden">
                  <span className="font-normal">
                    {formatSupplementSafetyFlags(labels, draft.safetyFlags)}
                  </span>
                </summary>
                <div className="grid gap-2 border-t border-gray-100 p-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <input
                      checked={draft.safetyFlags.length === 0}
                      className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                      onChange={(event) => {
                        if (event.target.checked) {
                          onChange({ safetyFlags: [] });
                        }
                      }}
                      type="checkbox"
                    />
                    {labels.supplements.none}
                  </label>
                  {supplementSafetyFlags.map((flag) => (
                    <label
                      key={flag}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <input
                        checked={draft.safetyFlags.includes(flag)}
                        className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                        onChange={() =>
                          onChange({
                            safetyFlags: toggleSupplementSafetyFlag(
                              draft.safetyFlags,
                              flag
                            )
                          })
                        }
                        type="checkbox"
                      />
                      {supplementSafetyFlagLabel(labels, flag)}
                    </label>
                  ))}
                </div>
              </details>
            </div>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              {labels.supplements.safetyNotes}
              <textarea
                className={classNames(inputClass, "min-h-32 resize-y")}
                onChange={(event) =>
                  onChange({ safetyNotes: event.target.value })
                }
                value={draft.safetyNotes ?? ""}
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            {error ? (
              <p className="text-sm font-medium text-red-600">
                {labels.supplements.updateError}
              </p>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <button
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                onClick={onClose}
                type="button"
              >
                {labels.supplements.close}
              </button>
              <button
                className="rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                onClick={onSave}
                type="button"
              >
                {saving ? "..." : labels.supplements.save}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function reviewKindLabel(labels: AdminContent, row: AdminReviewJobRow) {
  if (row.reviewKind === "dose_reduced") {
    return labels.reviewQueue.doseReduced;
  }

  if (row.reviewKind === "unknown_supplement") {
    return labels.reviewQueue.unknown;
  }

  return labels.reviewQueue.reviewRequired;
}

function canDismissReviewJob(row: AdminReviewJobRow) {
  return row.reviewKind === "dose_reduced" || row.actionOptions.includes("dismiss");
}

function AdminReviewQueueView({
  accessToken,
  data,
  labels,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminReviewQueueData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [queueData, setQueueData] = useState(data);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function dismissRow(row: AdminReviewJobRow) {
    setSavingId(row.id);
    setErrorId(null);

    try {
      const response = await fetch(`/api/admin/review-jobs/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action: "dismiss"
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error("Unable to dismiss review job");
      }

      const payload = (await response.json()) as {
        data?: AdminReviewQueueData;
      };

      setQueueData(
        payload.data ?? {
          ...queueData,
          rows: queueData.rows.filter((item) => item.id !== row.id)
        }
      );
    } catch {
      setErrorId(row.id);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FlowSummaryCard
          label={labels.reviewQueue.total}
          value={formatNumber(queueData.summary.total, locale)}
        />
        <FlowSummaryCard
          label={labels.reviewQueue.doseReduced}
          value={formatNumber(queueData.summary.doseReduced, locale)}
        />
        <FlowSummaryCard
          label={labels.reviewQueue.unknown}
          value={formatNumber(queueData.summary.unknown, locale)}
        />
        <FlowSummaryCard
          label={labels.reviewQueue.reviewRequired}
          value={formatNumber(queueData.summary.reviewRequired, locale)}
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="divide-y divide-gray-100">
          {queueData.rows.map((row) => {
            const canDismiss = canDismissReviewJob(row);

            return (
              <article key={row.id} className="px-5 py-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                        {reviewKindLabel(labels, row)}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
                        {labels.reviewQueue.priority}: {row.priority}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-gray-900">
                      {row.supplementName}
                    </h3>
                    <div className="mt-3 grid gap-3 text-sm text-gray-600 sm:grid-cols-2 xl:grid-cols-4">
                      <SupplementListMeta
                        label={labels.reviewQueue.plan}
                        value={row.planId ?? "—"}
                      />
                      <SupplementListMeta
                        label={labels.reviewQueue.originalDose}
                        value={row.originalDose ?? "—"}
                      />
                      <SupplementListMeta
                        label={labels.reviewQueue.newDose}
                        value={row.newDose ?? "—"}
                      />
                      <SupplementListMeta
                        label={labels.reviewQueue.maxDose}
                        value={
                          row.maxAmount === null && !row.maxUnit
                            ? "—"
                            : `${row.maxAmount ?? "—"} ${row.maxUnit ?? ""}`.trim()
                        }
                      />
                    </div>
                    {row.requiredFields.length > 0 ? (
                      <p className="mt-3 text-xs font-medium text-gray-500">
                        {labels.reviewQueue.requiredFields}:{" "}
                        {row.requiredFields.join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs text-gray-400">
                      {labels.reviewQueue.queued}:{" "}
                      {formatGeneratedAt(row.queuedAt, locale)}
                    </p>
                    {errorId === row.id ? (
                      <p className="mt-3 text-sm font-medium text-red-600">
                        {labels.reviewQueue.dismissError}
                      </p>
                    ) : null}
                  </div>

                  {canDismiss ? (
                    <button
                      className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={savingId === row.id}
                      onClick={() => {
                        void dismissRow(row);
                      }}
                      type="button"
                    >
                      {savingId === row.id ? "..." : labels.reviewQueue.dismiss}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {queueData.rows.length === 0 ? (
          <div className="border-t border-gray-100 px-5 py-12 text-center text-sm font-medium text-gray-500">
            {labels.reviewQueue.empty}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function readableToken(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function severityLabel(labels: AdminContent, value: AdminTechnicalSeverity) {
  return labels.technicalAlerts[value];
}

function severityClass(value: AdminTechnicalSeverity) {
  if (value === "critical") {
    return "bg-red-100 text-red-800 ring-red-200";
  }

  if (value === "high") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (value === "medium") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function jobStatusLabel(labels: AdminContent, status: AdminJobRow["status"]) {
  return labels.jobs[status];
}

function jobStatusClass(status: AdminJobRow["status"]) {
  if (status === "failed") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "running") {
    return "bg-blue-50 text-blue-700 ring-blue-100";
  }

  if (status === "complete") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function jsonPreview(value: Record<string, unknown>) {
  const text = JSON.stringify(value, null, 2);

  return text === "{}" ? "" : text;
}

function AdminTechnicalAlertsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminTechnicalAlertsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  return (
    <section className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FlowSummaryCard
          label={labels.technicalAlerts.total}
          value={formatNumber(data.summary.total, locale)}
        />
        <FlowSummaryCard
          label={labels.technicalAlerts.critical}
          value={formatNumber(data.summary.critical, locale)}
        />
        <FlowSummaryCard
          label={labels.technicalAlerts.high}
          value={formatNumber(data.summary.high, locale)}
        />
        <FlowSummaryCard
          label={labels.technicalAlerts.medium}
          value={formatNumber(data.summary.medium, locale)}
        />
        <FlowSummaryCard
          label={labels.technicalAlerts.low}
          value={formatNumber(data.summary.low, locale)}
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="divide-y divide-gray-100">
          {data.rows.map((row) => {
            const details = jsonPreview(row.details);

            return (
              <article key={`${row.source}:${row.id}`} className="px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={classNames(
                          severityClass(row.severity),
                          "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {severityLabel(labels, row.severity)}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
                        {readableToken(row.source)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-gray-900">
                      {readableToken(row.title)}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {row.message}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <SupplementListMeta
                        label={labels.technicalAlerts.time}
                        value={formatGeneratedAt(row.occurredAt, locale)}
                      />
                      <SupplementListMeta
                        label={labels.technicalAlerts.plan}
                        value={row.planId ?? "—"}
                      />
                      <SupplementListMeta
                        label={labels.technicalAlerts.job}
                        value={row.jobId ?? row.jobType ?? "—"}
                      />
                      <SupplementListMeta
                        label={labels.technicalAlerts.status}
                        value={row.status ?? "—"}
                      />
                    </div>
                    {details ? (
                      <details className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 ring-1 ring-gray-100">
                        <summary className="cursor-pointer font-semibold text-gray-700">
                          {labels.technicalAlerts.event}
                        </summary>
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap">
                          {details}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {data.rows.length === 0 ? (
          <div className="border-t border-gray-100 px-5 py-12 text-center text-sm font-medium text-gray-500">
            {labels.technicalAlerts.empty}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AdminJobsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminJobsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  return (
    <section className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FlowSummaryCard
          label={labels.jobs.total}
          value={formatNumber(data.summary.total, locale)}
        />
        <FlowSummaryCard
          label={labels.jobs.failed}
          value={formatNumber(data.summary.failed, locale)}
        />
        <FlowSummaryCard
          label={labels.jobs.running}
          value={formatNumber(data.summary.running, locale)}
        />
        <FlowSummaryCard
          label={labels.jobs.queued}
          value={formatNumber(data.summary.queued, locale)}
        />
        <FlowSummaryCard
          label={labels.jobs.complete}
          value={formatNumber(data.summary.complete, locale)}
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="divide-y divide-gray-100">
          {data.rows.map((row) => {
            const payload = jsonPreview(row.payload);
            const auditPayload = jsonPreview(row.latestAuditPayload);

            return (
              <article key={row.id} className="px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={classNames(
                          jobStatusClass(row.status),
                          "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {jobStatusLabel(labels, row.status)}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
                        {labels.jobs.attempts}: {row.attempts}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
                        {labels.jobs.priority}: {row.priority}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-semibold text-gray-900">
                      {readableToken(row.jobType)}
                    </h3>

                    {row.errorMessage ? (
                      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                        {row.errorMessage}
                      </p>
                    ) : null}

                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <SupplementListMeta
                        label={labels.jobs.plan}
                        value={row.planId ?? "—"}
                      />
                      <SupplementListMeta
                        label={labels.jobs.queued}
                        value={formatGeneratedAt(row.queuedAt, locale)}
                      />
                      <SupplementListMeta
                        label={labels.jobs.started}
                        value={
                          row.startedAt
                            ? formatGeneratedAt(row.startedAt, locale)
                            : "—"
                        }
                      />
                      <SupplementListMeta
                        label={labels.jobs.completed}
                        value={
                          row.completedAt || row.failedAt
                            ? formatGeneratedAt(
                                row.completedAt ?? row.failedAt ?? row.updatedAt,
                                locale
                              )
                            : "—"
                        }
                      />
                    </div>

                    {row.latestAuditEvent ? (
                      <p className="mt-4 text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">
                          {labels.jobs.audit}:
                        </span>{" "}
                        {readableToken(row.latestAuditEvent)}
                        {row.latestAuditAt
                          ? ` · ${formatGeneratedAt(row.latestAuditAt, locale)}`
                          : ""}
                      </p>
                    ) : null}

                    {payload || auditPayload ? (
                      <details className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 ring-1 ring-gray-100">
                        <summary className="cursor-pointer font-semibold text-gray-700">
                          {labels.jobs.audit}
                        </summary>
                        {payload ? (
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap">
                            {payload}
                          </pre>
                        ) : null}
                        {auditPayload ? (
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap">
                            {auditPayload}
                          </pre>
                        ) : null}
                      </details>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {data.rows.length === 0 ? (
          <div className="border-t border-gray-100 px-5 py-12 text-center text-sm font-medium text-gray-500">
            {labels.jobs.empty}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FlowSummaryCard({
  label,
  value
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-[#20343A]">
        {value}
      </p>
    </div>
  );
}

function flowNodeCount(flowData: AdminFlowData, id: AdminFlowNodeId) {
  return flowData.nodes.find((node) => node.id === id)?.count ?? 0;
}

function flowEdgesFrom(
  flowData: AdminFlowData,
  id: AdminFlowNodeId,
  kind: "continue" | "dropoff"
) {
  return flowData.edges.filter((edge) => edge.from === id && edge.kind === kind);
}

function FlowLegend({ labels }: Readonly<{ labels: AdminContent }>) {
  return (
    <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
      <span className="rounded-full bg-[#ECFDF5] px-3 py-1.5 text-[#126B4F] ring-1 ring-[#A7F3D0]">
        {labels.flowStatus.okay}
      </span>
      <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800 ring-1 ring-amber-200">
        {labels.flowStatus.needsWork}
      </span>
      <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700 ring-1 ring-red-100">
        {labels.flowStatus.lossy}
      </span>
    </div>
  );
}

type MermaidFlowEdge = Readonly<{
  from: AdminFlowNodeId;
  to: AdminFlowNodeId;
}>;

const mermaidNodeIds: Partial<Record<AdminFlowNodeId, string>> = {
  assessmentStarted: "started",
  assessmentSubmitted: "submitted",
  assessmentViewed: "assessment",
  chatClicked: "chat",
  formulationReady: "formulation",
  freeEmailRequested: "free_email",
  freeEmailSent: "email_sent",
  healthscoreViewed: "healthscore",
  landingViewed: "landing",
  marketplaceClicked: "marketplace",
  planSelected: "plan",
  precisionPaid: "precision",
  proPaid: "pro",
  resultsViewed: "results"
};

const mermaidFlowNodes: AdminFlowNodeId[] = [
  "landingViewed",
  "assessmentViewed",
  "assessmentStarted",
  "assessmentSubmitted",
  "healthscoreViewed",
  "freeEmailRequested",
  "freeEmailSent",
  "planSelected",
  "precisionPaid",
  "proPaid",
  "formulationReady",
  "resultsViewed",
  "chatClicked",
  "marketplaceClicked"
];

const mermaidFlowEdges: MermaidFlowEdge[] = [
  { from: "landingViewed", to: "assessmentViewed" },
  { from: "assessmentViewed", to: "assessmentStarted" },
  { from: "assessmentStarted", to: "assessmentSubmitted" },
  { from: "assessmentSubmitted", to: "healthscoreViewed" },
  { from: "healthscoreViewed", to: "freeEmailRequested" },
  { from: "freeEmailRequested", to: "freeEmailSent" },
  { from: "healthscoreViewed", to: "planSelected" },
  { from: "planSelected", to: "precisionPaid" },
  { from: "planSelected", to: "proPaid" },
  { from: "precisionPaid", to: "formulationReady" },
  { from: "proPaid", to: "formulationReady" },
  { from: "formulationReady", to: "resultsViewed" },
  { from: "resultsViewed", to: "chatClicked" },
  { from: "resultsViewed", to: "marketplaceClicked" }
];

const mermaidTerminalNodes = new Set<AdminFlowNodeId>([
  "chatClicked",
  "freeEmailSent",
  "marketplaceClicked"
]);

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function mermaidEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mermaidCount(value: number, locale: Locale) {
  return mermaidEscape(formatNumber(value, locale));
}

function mermaidNodeLabel({
  flowData,
  labels,
  locale,
  nodeId
}: Readonly<{
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
  nodeId: AdminFlowNodeId;
}>) {
  const reached = flowNodeCount(flowData, nodeId);
  const happy = flowEdgesFrom(flowData, nodeId, "continue").reduce(
    (total, edge) => total + edge.count,
    0
  );
  const dropped = flowEdgesFrom(flowData, nodeId, "dropoff").reduce(
    (total, edge) => total + edge.count,
    0
  );
  const ratio =
    reached > 0 && !mermaidTerminalNodes.has(nodeId)
      ? Math.min(100, (happy / reached) * 100)
      : null;

  const lines = [
    mermaidEscape(labels.flowNodes[nodeId]),
    `<b>▲ ${mermaidCount(reached, locale)} <span style='display:inline-block;width:0.75rem'></span> ▼ ${mermaidCount(dropped, locale)}</b>`
  ];

  if (ratio !== null) {
    lines.push(formatPercent(ratio, locale));
  }

  return lines.join("<br/>");
}

type MermaidNodeHealth = "lossy" | "needs_work" | "neutral" | "okay";

function mermaidNodeHealth(
  flowData: AdminFlowData,
  nodeId: AdminFlowNodeId
): MermaidNodeHealth {
  const reached = flowNodeCount(flowData, nodeId);
  const happy = flowEdgesFrom(flowData, nodeId, "continue").reduce(
    (total, edge) => total + edge.count,
    0
  );

  if (reached === 0 || mermaidTerminalNodes.has(nodeId)) {
    return "neutral";
  }

  const dropRate = Math.max(0, (reached - Math.min(happy, reached)) / reached);

  if (dropRate >= 0.4) {
    return "lossy";
  }

  if (dropRate >= 0.15) {
    return "needs_work";
  }

  return "okay";
}

function flowEdgeCount(
  flowData: AdminFlowData,
  from: AdminFlowNodeId,
  to: AdminFlowNodeId
) {
  return flowData.edges.find((edge) => edge.from === from && edge.to === to)
    ?.count ?? 0;
}

function buildMermaidFlowDefinition(
  flowData: AdminFlowData,
  labels: AdminContent,
  locale: Locale
) {
  const lines = [
    "flowchart TD",
    "  classDef okay fill:#FFFFFF,stroke:#1FA77A,color:#111827,stroke-width:2px;",
    "  classDef needs_work fill:#FFFFFF,stroke:#F59E0B,color:#111827,stroke-width:2px;",
    "  classDef lossy fill:#FFFFFF,stroke:#EF4444,color:#111827,stroke-width:2px;",
    "  classDef neutral fill:#FFFFFF,stroke:#CBD5E1,color:#111827,stroke-width:1px;"
  ];

  mermaidFlowNodes.forEach((nodeId) => {
    const id = mermaidNodeIds[nodeId];

    if (!id) {
      return;
    }

    const label = mermaidNodeLabel({ flowData, labels, locale, nodeId });
    const nodeDefinition = mermaidTerminalNodes.has(nodeId)
      ? `${id}(["${label}"])`
      : `${id}["${label}"]`;

    lines.push(`  ${nodeDefinition}`);
    lines.push(`  class ${id} ${mermaidNodeHealth(flowData, nodeId)};`);
  });

  mermaidFlowEdges.forEach((edge) => {
    const from = mermaidNodeIds[edge.from];
    const to = mermaidNodeIds[edge.to];

    if (!from || !to) {
      return;
    }

    const count = flowEdgeCount(flowData, edge.from, edge.to);

    lines.push(`  ${from} -->|"${mermaidCount(count, locale)}"| ${to}`);
  });

  return lines.join("\n");
}

function MermaidFlow({
  definition,
  labels
}: Readonly<{
  definition: string;
  labels: AdminContent;
}>) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    const diagramId = `admin-flow-${hashString(definition)}`;

    import("mermaid")
      .then(async (module) => {
        const mermaid = module.default;
        mermaid.initialize({
          flowchart: {
            curve: "basis",
            htmlLabels: true,
            nodeSpacing: 54,
            rankSpacing: 72
          },
          securityLevel: "loose",
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            lineColor: "#1FA77A",
            mainBkg: "#FFFFFF",
            primaryBorderColor: "#CBD5E1",
            primaryColor: "#FFFFFF",
            primaryTextColor: "#111827"
          }
        });

        return mermaid.render(diagramId, definition);
      })
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Unable to render admin flow diagram", error);
          setSvg("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [definition]);

  return (
    <div className="mt-6 overflow-x-auto">
      {svg ? (
        <div
          aria-label={labels.flowTitle}
          className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
          role="img"
        />
      ) : (
        <div className="flex min-h-96 items-center justify-center text-sm font-medium text-gray-500">
          {labels.flowTitle}
        </div>
      )}
    </div>
  );
}

function FlowChart({
  flowData,
  labels,
  locale
}: Readonly<{
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const hasEvents =
    flowData.nodes.some((node) => node.count > 0) ||
    flowData.edges.some((edge) => edge.count > 0);
  const mermaidDefinition = buildMermaidFlowDefinition(
    flowData,
    labels,
    locale
  );

  return (
    <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      {hasEvents ? (
        <>
          <FlowLegend labels={labels} />
          <MermaidFlow definition={mermaidDefinition} labels={labels} />
        </>
      ) : (
        <div className="mt-6 flex min-h-64 items-center justify-center rounded-xl bg-gray-50 text-sm font-medium text-gray-500 ring-1 ring-gray-100">
          {labels.emptyFlow}
        </div>
      )}
    </section>
  );
}

function AdminFlowView({
  flowData,
  labels,
  locale
}: Readonly<{
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
}>) {
  return (
    <>
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-4">
        <FlowSummaryCard
          label={labels.flowSummary.entered}
          value={formatNumber(flowData.summary.entered, locale)}
        />
        <FlowSummaryCard
          label={labels.flowSummary.reachedHealthScore}
          value={formatNumber(flowData.summary.reachedHealthScore, locale)}
        />
        <FlowSummaryCard
          label={labels.flowSummary.converted}
          value={formatNumber(flowData.summary.converted, locale)}
        />
        <FlowSummaryCard
          label={labels.flowSummary.conversionRate}
          value={formatPercent(flowData.summary.conversionRate, locale)}
        />
      </div>
      <FlowChart flowData={flowData} labels={labels} locale={locale} />
    </>
  );
}

function TimeframeSelector({
  accessToken,
  data,
  filters,
  labels,
  locale,
  view
}: Readonly<{
  accessToken: string;
  data: AdminDashboardData;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  view: AdminDashboardView;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {rangeOrder.map((range) => (
        <a
          key={range}
          href={adminHref(locale, accessToken, range, view, filters)}
          aria-current={data.range === range ? "page" : undefined}
          className={classNames(
            data.range === range
              ? "bg-[#1FA77A] text-white"
              : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50",
            "rounded-full px-3 py-1.5 text-sm font-semibold transition"
          )}
        >
          {labels.ranges[range]}
        </a>
      ))}
    </div>
  );
}

function LocaleFilterSelector({
  accessToken,
  filters,
  locale,
  range,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  locale: Locale;
  range: AdminDashboardRange;
  view: AdminDashboardView;
}>) {
  const localeOptions = [
    { label: "EN", value: "en" },
    { label: "TH", value: "th" }
  ];
  const activeLocales =
    filters.locale === "en"
      ? new Set(["en"])
      : filters.locale === "th"
        ? new Set(["th"])
        : filters.locale === "none"
          ? new Set<string>()
          : new Set(["en", "th"]);

  function toggledLocaleFilter(value: string) {
    const next = new Set(activeLocales);

    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }

    if (next.size === 2) {
      return "";
    }

    if (next.size === 0) {
      return "none";
    }

    return next.has("en") ? "en" : "th";
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {localeOptions.map((option) => {
        const active = activeLocales.has(option.value);

        return (
          <a
            key={option.label}
            href={adminHref(locale, accessToken, range, view, {
              ...filters,
              locale: toggledLocaleFilter(option.value)
            })}
            aria-current={active ? "page" : undefined}
            className={classNames(
              active
                ? "bg-[#1FA77A] text-white"
                : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50",
              "rounded-full px-3 py-1.5 text-sm font-semibold transition"
            )}
          >
            {option.label}
          </a>
        );
      })}
    </div>
  );
}

function FilterInput({
  label,
  name,
  value
}: Readonly<{
  label: string;
  name: keyof AdminDashboardFilters;
  value: string;
}>) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
        {label}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={value}
        className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
      />
    </label>
  );
}

function FilterSelect({
  label,
  name,
  options,
  value
}: Readonly<{
  label: string;
  name: keyof AdminDashboardFilters;
  options: Array<Readonly<{ label: string; value: string }>>;
  value: string;
}>) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-inset focus:ring-[#1FA77A]"
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AdminFilterPanel({
  accessToken,
  filters,
  labels,
  locale,
  range,
  view
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  range: AdminDashboardRange;
  view: AdminDashboardView;
}>) {
  const panelFilters = { ...filters, locale: "" };
  const activeFilters = adminDashboardFilterEntries(panelFilters);
  const hasPanelFilters = hasAdminDashboardFilters(panelFilters);
  const clearHref = adminHref(locale, accessToken, range, view, {
    ...emptyAdminDashboardFilters,
    locale: filters.locale
  });

  return (
    <details
      className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
      open={hasPanelFilters}
    >
      <summary className="group flex cursor-pointer list-none items-center gap-3 p-5 marker:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <span className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
            {labels.filters.title}
          </span>
          {hasPanelFilters ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-[0.14em] text-gray-400">
                {labels.filters.active}
              </span>
              {activeFilters.map(([key, value]) => (
                <span
                  key={key}
                  className="rounded-full bg-gray-50 px-2.5 py-1 font-medium text-gray-700 ring-1 ring-gray-200"
                >
                  {labels.filters[key]}: {value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <ChevronDownIcon
          aria-hidden={true}
          className="ml-auto size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
        />
      </summary>

      <form
        action={`/${locale}/admin/dashboard`}
        method="get"
        className="border-t border-gray-100 p-5"
      >
        <input type="hidden" name="access_token" value={accessToken} />
        <input type="hidden" name="range" value={range} />
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="locale" value={filters.locale} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterInput
            label={labels.filters.source}
            name="source"
            value={filters.source}
          />
          <FilterInput
            label={labels.filters.medium}
            name="medium"
            value={filters.medium}
          />
          <FilterInput
            label={labels.filters.campaign}
            name="campaign"
            value={filters.campaign}
          />
          <FilterInput
            label={labels.filters.campaignId}
            name="campaignId"
            value={filters.campaignId}
          />
          <FilterInput
            label={labels.filters.affiliate}
            name="affiliate"
            value={filters.affiliate}
          />
          <FilterInput
            label={labels.filters.promoCode}
            name="promoCode"
            value={filters.promoCode}
          />
          <FilterSelect
            label={labels.filters.selectedPlan}
            name="selectedPlan"
            value={filters.selectedPlan}
            options={[
              { label: "All", value: "" },
              { label: "Precision", value: "precision" },
              { label: "Pro", value: "pro" }
            ]}
          />
          <FilterSelect
            label={labels.filters.device}
            name="device"
            value={filters.device}
            options={[
              { label: "All", value: "" },
              { label: "Mobile", value: "mobile" },
              { label: "Tablet", value: "tablet" },
              { label: "Desktop", value: "desktop" }
            ]}
          />
          <FilterInput
            label={labels.filters.planId}
            name="planId"
            value={filters.planId}
          />
          <FilterInput label={labels.filters.ray} name="ray" value={filters.ray} />
          <FilterInput
            label={labels.filters.emailHash}
            name="emailHash"
            value={filters.emailHash}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-[#1FA77A] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#188B66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]"
          >
            {labels.filters.apply}
          </button>
          <a
            href={clearHref}
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          >
            {labels.filters.clear}
          </a>
        </div>
      </form>
    </details>
  );
}

function adminViewDatabaseAvailable({
  alertsData,
  data,
  flowData,
  jobsData,
  reviewQueueData,
  supplementsData,
  view
}: Readonly<{
  alertsData: AdminTechnicalAlertsData;
  data: AdminDashboardData;
  flowData: AdminFlowData;
  jobsData: AdminJobsData;
  reviewQueueData: AdminReviewQueueData;
  supplementsData: AdminSupplementsData;
  view: AdminDashboardView;
}>) {
  if (view === "alerts") {
    return alertsData.databaseAvailable;
  }

  if (view === "flow") {
    return flowData.databaseAvailable;
  }

  if (view === "jobs") {
    return jobsData.databaseAvailable;
  }

  if (view === "reviews") {
    return reviewQueueData.databaseAvailable;
  }

  if (view === "supplements") {
    return supplementsData.databaseAvailable;
  }

  return data.databaseAvailable;
}

export function AdminDashboard({
  accessToken,
  alertsData,
  data,
  filters,
  flowData,
  jobsData,
  locale,
  reviewQueueData,
  supplementsData,
  view
}: Readonly<{
  accessToken: string;
  alertsData: AdminTechnicalAlertsData;
  data: AdminDashboardData;
  filters: AdminDashboardFilters;
  flowData: AdminFlowData;
  jobsData: AdminJobsData;
  locale: Locale;
  reviewQueueData: AdminReviewQueueData;
  supplementsData: AdminSupplementsData;
  view: AdminDashboardView;
}>) {
  const labels = content[locale];
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const databaseAvailable = adminViewDatabaseAvailable({
    alertsData,
    data,
    flowData,
    jobsData,
    reviewQueueData,
    supplementsData,
    view
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#20343A]">
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={labels.closeSidebar}
            className="absolute inset-0 bg-gray-900/70"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex h-full w-full max-w-xs">
            <SidebarContent
              accessToken={accessToken}
              filters={filters}
              labels={labels}
              locale={locale}
              onNavigate={() => setSidebarOpen(false)}
              range={data.range}
              view={view}
            />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute left-full top-5 ml-4 rounded-md p-2 text-white"
            >
              <span className="sr-only">{labels.closeSidebar}</span>
              <XMarkIcon aria-hidden={true} className="size-6" />
            </button>
          </aside>
        </div>
      ) : null}

      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <SidebarContent
          accessToken={accessToken}
          filters={filters}
          labels={labels}
          locale={locale}
          range={data.range}
          view={view}
        />
      </aside>

      <div className="sticky top-0 z-40 flex items-center gap-x-6 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900"
        >
          <span className="sr-only">{labels.openSidebar}</span>
          <Bars3Icon aria-hidden={true} className="size-6" />
        </button>
        <div className="flex-1 text-sm/6 font-semibold text-gray-900">
          {labels.pageTitles[view]}
        </div>
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#1FA77A]/10 text-xs font-semibold text-[#126B4F] ring-1 ring-[#1FA77A]/20">
          MN
        </span>
      </div>

      <main className="py-8 lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                {labels.pageTitles[view]}
              </h1>
              {view === "kpi" ? (
                <p className="mt-1 text-xs text-gray-400">
                  {labels.generated}: {formatGeneratedAt(data.generatedAt, locale)}
                </p>
              ) : null}
            </div>
          </div>

          {!databaseAvailable ? (
            <div className="mt-6 rounded-md bg-amber-50 p-4 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              {labels.dataUnavailable}
            </div>
          ) : null}

          {view === "alerts" ||
          view === "flow" ||
          view === "jobs" ||
          view === "kpi" ? (
            <>
              <div className="mt-6">
                <TimeframeSelector
                  accessToken={accessToken}
                  data={data}
                  filters={filters}
                  labels={labels}
                  locale={locale}
                  view={view}
                />
                {view === "flow" || view === "kpi" ? (
                  <LocaleFilterSelector
                    accessToken={accessToken}
                    filters={filters}
                    locale={locale}
                    range={data.range}
                    view={view}
                  />
                ) : null}
              </div>

              {view === "flow" || view === "kpi" ? (
                <AdminFilterPanel
                  accessToken={accessToken}
                  filters={filters}
                  labels={labels}
                  locale={locale}
                  range={data.range}
                  view={view}
                />
              ) : null}
            </>
          ) : null}

          {view === "flow" ? (
            <AdminFlowView flowData={flowData} labels={labels} locale={locale} />
          ) : view === "alerts" ? (
            <AdminTechnicalAlertsView
              data={alertsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "jobs" ? (
            <AdminJobsView data={jobsData} labels={labels} locale={locale} />
          ) : view === "reviews" ? (
            <AdminReviewQueueView
              accessToken={accessToken}
              data={reviewQueueData}
              labels={labels}
              locale={locale}
            />
          ) : view === "supplements" ? (
            <AdminSupplementsView
              accessToken={accessToken}
              data={supplementsData}
              labels={labels}
              locale={locale}
            />
          ) : (
            <>
              <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-3">
                {data.kpis.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    bucketLabel={data.bucketLabel}
                    kpi={kpi}
                    labels={labels}
                    locale={locale}
                  />
                ))}
              </div>

              <section className="mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
                  {labels.ratesTitle}
                </h2>
                <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-4">
                  {data.rates.map((rate) => (
                    <RateCard
                      key={rate.id}
                      labels={labels}
                      locale={locale}
                      rate={rate}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
