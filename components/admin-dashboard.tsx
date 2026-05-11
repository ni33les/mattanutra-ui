"use client";

import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps
} from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions
} from "@headlessui/react";
import {
  Bars3Icon,
  BeakerIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  CpuChipIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  FlagIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  HomeIcon,
  MegaphoneIcon,
  QueueListIcon,
  SparklesIcon,
  XMarkIcon
} from "@heroicons/react/24/outline";
import { ChevronDownIcon as ChevronDownSolidIcon } from "@heroicons/react/20/solid";
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
  AdminAgentsData,
  AdminAgentRow,
  AdminTaskVisibilityData,
  AdminTaskVisibilityRow
} from "@/lib/admin-execution";
import type {
  AdminCommunicationRow,
  AdminCommunicationsData,
  AdminCommunicationStatus
} from "@/lib/admin-communications";
import type {
  AdminReviewTaskRow,
  AdminReviewQueueData
} from "@/lib/admin-review-queue";
import type {
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
import { supplementDoseUnits } from "@/lib/supplement-dose-units";
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
import type {
  AdminGoalsData,
  AdminGoalRow,
  AdminGoalStatus
} from "@/lib/admin-goals";
import type { Locale } from "@/lib/i18n";

type AdminDashboardView =
  | "agents"
  | "alerts"
  | "communications"
  | "flow"
  | "glance"
  | "goals"
  | "kpi"
  | "reviews"
  | "supplements"
  | "visibility";
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
  communications: {
    address: string;
    body: string;
    delivered: string;
    empty: string;
    failed: string;
    messageType: string;
    noChannel: string;
    plan: string;
    provider: string;
    queued: string;
    sent: string;
    skipped: string;
    status: string;
    task: string;
    time: string;
    total: string;
  };
  agents: {
    active: string;
    capabilities: string;
    completed: string;
    currentTask: string;
    empty: string;
    failed: string;
    failureRate: string;
    lastSeen: string;
    model: string;
    offline: string;
    paused: string;
    retired: string;
    status: string;
    successRate: string;
    total: string;
    type: string;
    working: string;
  };
  generated: string;
  atAGlance: {
    assessmentCompletions: string;
    assessmentStarts: string;
    attentionClear: string;
    attentionTitle: string;
    conversion: string;
    conversionSnapshot: string;
    count: string;
    criticalAlerts: string;
    customerContactIssues: string;
    dropoff: string;
    freeRequests: string;
    healthScoreViews: string;
    landingVisitors: string;
    pendingReviews: string;
    precisionConversions: string;
    proConversions: string;
    stage: string;
  };
  goals: {
    active: string;
    approvals: string;
    blocked: string;
    cancelled: string;
    comments: string;
    dependencies: string;
    empty: string;
    events: string;
    failed: string;
    age: string;
    lastActivity: string;
    live: string;
    needsReview: string;
    noSelection: string;
    plan: string;
    priority: string;
    processing: string;
    reservations: string;
    source: string;
    stuck: string;
    succeeded: string;
    tasks: string;
    trace: string;
    total: string;
    updated: string;
  };
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
  execution: AdminNavItem[];
  executionTitle: string;
  governance: AdminNavItem[];
  governanceTitle: string;
  marketing: AdminNavItem[];
  marketingTitle: string;
  nextBuckets: string;
  openSidebar: string;
  pageTitles: Record<AdminDashboardView, string>;
  performance: AdminNavItem[];
  performanceTitle: string;
  ranges: Record<AdminDashboardRange, string>;
  rates: Record<AdminDashboardRateId, RateText>;
  ratesTitle: string;
  reviewQueue: {
    approve: string;
    clientDose: string;
    disapprove: string;
    doseReduced: string;
    empty: string;
    flagReason: string;
    highPriority: string;
    lowPriority: string;
    mediumPriority: string;
    newDose: string;
    originalDose: string;
    plan: string;
    planLink: string;
    planReview: string;
    queued: string;
    doseUnverified: string;
    supplementReview: string;
    reviewerNote: string;
    reviewRequired: string;
    total: string;
    unknown: string;
  };
  technicalAlerts: {
    critical: string;
    empty: string;
    event: string;
    high: string;
    low: string;
    medium: string;
    plan: string;
    rootCause: string;
    source: string;
    status: string;
    task: string;
    time: string;
    total: string;
  };
  visibility: {
    active: string;
    actor: string;
    blocked: string;
    capabilities: string;
    completed: string;
    empty: string;
    failed: string;
    goal: string;
    human: string;
    priority: string;
    queued: string;
    status: string;
    task: string;
    total: string;
    worker: string;
  };
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
    associateExisting: string;
    associations: string;
    associationHint: string;
    associatedWith: string;
    clearAssociation: string;
    noAssociationMatches: string;
    removeAssociation: string;
    save: string;
    search: string;
    searchExisting: string;
    sourceStatus: string;
    status: string;
    suggestDose: string;
    suggestDoseBusy: string;
    suggestDoseError: string;
    total: string;
    updateError: string;
    doseValidationError: string;
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
const supplementDoseSuggestionTimeoutMs = 45_000;

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
    communications: {
      address: "Address",
      body: "Message",
      delivered: "Delivered",
      empty: "No communication messages in this timeframe.",
      failed: "Failed",
      messageType: "Type",
      noChannel: "No channel",
      plan: "Plan",
      provider: "Provider",
      queued: "Queued",
      sent: "Sent",
      skipped: "Skipped",
      status: "Status",
      task: "Task",
      time: "Time",
      total: "Total"
    },
    agents: {
      active: "Active",
      capabilities: "Capabilities",
      completed: "Completed",
      currentTask: "Current task",
      empty: "No agents have registered yet.",
      failed: "Failed",
      failureRate: "Failure",
      lastSeen: "Last seen",
      model: "Model",
      offline: "Offline",
      paused: "Paused",
      retired: "Retired",
      status: "Status",
      successRate: "Success",
      total: "Total",
      type: "Type",
      working: "Working"
    },
    generated: "Generated",
    atAGlance: {
      assessmentCompletions: "Assessment completions",
      assessmentStarts: "Assessment starts",
      attentionClear: "Nothing urgent right now.",
      attentionTitle: "Attention required",
      conversion: "Conversion",
      conversionSnapshot: "Conversion snapshot",
      count: "Count",
      criticalAlerts: "Site issues needing attention",
      customerContactIssues: "Customer contact issues",
      dropoff: "Drop-off",
      freeRequests: "Free requests",
      healthScoreViews: "HealthScore views",
      landingVisitors: "Landed visitors",
      pendingReviews: "Pending reviews",
      precisionConversions: "Precision conversions",
      proConversions: "Pro conversions",
      stage: "Stage"
    },
    goals: {
      active: "Active",
      approvals: "Approvals",
      blocked: "Blocked",
      cancelled: "Cancelled",
      comments: "Comments",
      dependencies: "Dependencies",
      empty: "No goals in this timeframe.",
      events: "Events",
      failed: "Failed",
      age: "Age",
      lastActivity: "Last activity",
      live: "Live",
      needsReview: "Needs review",
      noSelection: "Select a goal to see its timeline.",
      plan: "Plan",
      priority: "Priority",
      processing: "Processing",
      reservations: "Reservations",
      source: "Source",
      stuck: "Stuck",
      succeeded: "Succeeded",
      tasks: "Tasks",
      trace: "Trace",
      total: "Total",
      updated: "Updated"
    },
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
      conversionRate: "From HealthScore",
      converted: "Free or paid",
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
    performance: [
      { icon: HomeIcon, name: "At a Glance", view: "glance" },
      { icon: SparklesIcon, name: "KPIs", view: "kpi" },
      { icon: FunnelIcon, name: "Conversions", view: "flow" }
    ],
    performanceTitle: "Performance",
    marketing: [
      { href: "#", icon: MegaphoneIcon, name: "Campaigns" },
      { href: "#", icon: EnvelopeIcon, name: "Leads" },
      {
        icon: ChatBubbleLeftRightIcon,
        name: "Communications",
        view: "communications"
      },
      { href: "#", icon: DocumentTextIcon, name: "Content" }
    ],
    marketingTitle: "Marketing",
    governance: [
      { icon: ExclamationTriangleIcon, name: "Reviews", view: "reviews" },
      { icon: BeakerIcon, name: "Supplements", view: "supplements" }
    ],
    governanceTitle: "Safety",
    nextBuckets: "Next 3 buckets",
    openSidebar: "Open sidebar",
    execution: [
      { icon: FlagIcon, name: "Goals", view: "goals" },
      { icon: QueueListIcon, name: "Tasks", view: "visibility" },
      { icon: CpuChipIcon, name: "Agents", view: "agents" },
      { icon: ExclamationTriangleIcon, name: "Alerts", view: "alerts" }
    ],
    executionTitle: "Execution",
    pageTitles: {
      agents: "Agents",
      alerts: "Technical Alerts",
      communications: "Communications",
      flow: "Sales Conversions",
      glance: "At a Glance",
      goals: "Goals",
      kpi: "Key Performance Indicators",
      reviews: "Review",
      supplements: "Supplements",
      visibility: "Visibility"
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
    reviewQueue: {
      approve: "Approve",
      clientDose: "Client dose",
      disapprove: "Disapprove",
      doseReduced: "Dose reduced",
      empty: "No supplement review tasks are waiting.",
      flagReason: "Review reason",
      highPriority: "High Priority",
      lowPriority: "Low Priority",
      mediumPriority: "Medium Priority",
      newDose: "New dose",
      originalDose: "Original dose",
      plan: "Plan",
      planLink: "Open plan",
      planReview: "Plan review",
      queued: "Queued",
      doseUnverified: "Dose unverified",
      supplementReview: "Supplement review",
      reviewerNote: "Reviewer note",
      reviewRequired: "Review required",
      total: "Total",
      unknown: "Unknown supplement"
    },
    technicalAlerts: {
      critical: "Critical",
      empty: "No technical alerts in this timeframe.",
      event: "Event",
      high: "High",
      low: "Low",
      medium: "Medium",
      plan: "Plan",
      rootCause: "Root cause",
      source: "Source",
      status: "Status",
      task: "Task",
      time: "Time",
      total: "Total"
    },
    visibility: {
      active: "Active",
      actor: "Actor",
      blocked: "Blocked",
      capabilities: "Capabilities",
      completed: "Completed",
      empty: "No tasks are visible in this timeframe.",
      failed: "Failed",
      goal: "Goal",
      human: "Human",
      priority: "Priority",
      queued: "Queued",
      status: "Status",
      task: "Task",
      total: "Total",
      worker: "Worker"
    },
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
      associateExisting: "Associate with existing supplement",
      associations: "Associations",
      associationHint:
        "Use this when the unknown item is just another name for a supplement already in the database.",
      associatedWith: "Associated with",
      clearAssociation: "Clear",
      noAssociationMatches: "No matching supplements.",
      removeAssociation: "Remove association",
      save: "Save",
      search: "Search supplements",
      searchExisting: "Search existing supplements",
      sourceStatus: "Source",
      status: "Status",
      suggestDose: "Suggest with AI",
      suggestDoseBusy: "AI is drafting safety details...",
      suggestDoseError: "Could not suggest a dose.",
      total: "Total",
      updateError: "Could not save this supplement.",
      doseValidationError:
        "Enter a positive amount and unit for whitelisted or review-required supplements.",
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
    communications: {
      address: "ปลายทาง",
      body: "ข้อความ",
      delivered: "ส่งถึงแล้ว",
      empty: "ไม่มีข้อความสื่อสารในช่วงเวลานี้",
      failed: "ล้มเหลว",
      messageType: "ชนิด",
      noChannel: "ไม่มีช่องทาง",
      plan: "แผน",
      provider: "Provider",
      queued: "รอส่ง",
      sent: "ส่งแล้ว",
      skipped: "ข้าม",
      status: "สถานะ",
      task: "งาน",
      time: "เวลา",
      total: "ทั้งหมด"
    },
    agents: {
      active: "ใช้งาน",
      capabilities: "ความสามารถ",
      completed: "สำเร็จ",
      currentTask: "งานปัจจุบัน",
      empty: "ยังไม่มี agent ลงทะเบียน",
      failed: "ล้มเหลว",
      failureRate: "ล้มเหลว",
      lastSeen: "พบล่าสุด",
      model: "โมเดล",
      offline: "ออฟไลน์",
      paused: "พัก",
      retired: "เลิกใช้",
      status: "สถานะ",
      successRate: "สำเร็จ",
      total: "ทั้งหมด",
      type: "ประเภท",
      working: "กำลังทำ"
    },
    generated: "สร้างเมื่อ",
    atAGlance: {
      assessmentCompletions: "ทำแบบประเมินเสร็จ",
      assessmentStarts: "เริ่มแบบประเมิน",
      attentionClear: "ยังไม่มีเรื่องเร่งด่วน",
      attentionTitle: "เรื่องที่ต้องดู",
      conversion: "คอนเวอร์ชัน",
      conversionSnapshot: "ภาพรวมคอนเวอร์ชัน",
      count: "จำนวน",
      criticalAlerts: "ปัญหาเว็บไซต์ที่ควรดู",
      customerContactIssues: "ปัญหาการติดต่อลูกค้า",
      dropoff: "หลุดออก",
      freeRequests: "คำขอฟรี",
      healthScoreViews: "ดู HealthScore",
      landingVisitors: "ผู้เข้าเว็บ",
      pendingReviews: "รีวิวที่รออยู่",
      precisionConversions: "คอนเวอร์ชัน Precision",
      proConversions: "คอนเวอร์ชัน Pro",
      stage: "ขั้นตอน"
    },
    goals: {
      active: "กำลังทำ",
      approvals: "การอนุมัติ",
      blocked: "ติดขัด",
      cancelled: "ยกเลิก",
      comments: "ความคิดเห็น",
      dependencies: "เงื่อนไขก่อนหน้า",
      empty: "ไม่มี Goals ในช่วงเวลานี้",
      events: "อีเวนต์",
      failed: "ล้มเหลว",
      age: "อายุ",
      lastActivity: "กิจกรรมล่าสุด",
      live: "สด",
      needsReview: "ต้องรีวิว",
      noSelection: "เลือก Goal เพื่อดูไทม์ไลน์",
      plan: "แผน",
      priority: "ความสำคัญ",
      processing: "กำลังดำเนินการ",
      reservations: "การจองงาน",
      source: "แหล่งที่มา",
      stuck: "ค้าง",
      succeeded: "สำเร็จ",
      tasks: "งาน",
      trace: "Trace",
      total: "ทั้งหมด",
      updated: "อัปเดต"
    },
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
      conversionRate: "จาก HealthScore",
      converted: "ฟรีหรือชำระเงิน",
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
    performance: [
      { icon: HomeIcon, name: "ภาพรวม", view: "glance" },
      { icon: SparklesIcon, name: "KPIs", view: "kpi" },
      { icon: FunnelIcon, name: "Conversions", view: "flow" }
    ],
    performanceTitle: "ประสิทธิภาพ",
    marketing: [
      { href: "#", icon: MegaphoneIcon, name: "แคมเปญ" },
      { href: "#", icon: EnvelopeIcon, name: "ลีด" },
      {
        icon: ChatBubbleLeftRightIcon,
        name: "การสื่อสาร",
        view: "communications"
      },
      { href: "#", icon: DocumentTextIcon, name: "คอนเทนต์" }
    ],
    marketingTitle: "การตลาด",
    governance: [
      { icon: ExclamationTriangleIcon, name: "รีวิว", view: "reviews" },
      { icon: BeakerIcon, name: "อาหารเสริม", view: "supplements" }
    ],
    governanceTitle: "ความปลอดภัย",
    nextBuckets: "คาดการณ์ 3 ช่วงถัดไป",
    openSidebar: "เปิดแถบเมนู",
    execution: [
      { icon: FlagIcon, name: "Goals", view: "goals" },
      { icon: QueueListIcon, name: "Tasks", view: "visibility" },
      { icon: CpuChipIcon, name: "Agents", view: "agents" },
      { icon: ExclamationTriangleIcon, name: "แจ้งเตือน", view: "alerts" }
    ],
    executionTitle: "การปฏิบัติงาน",
    pageTitles: {
      agents: "Agents",
      alerts: "การแจ้งเตือนทางเทคนิค",
      communications: "การสื่อสาร",
      flow: "Sales Conversions",
      glance: "ภาพรวม",
      goals: "Goals",
      kpi: "Key Performance Indicators",
      reviews: "รีวิว",
      supplements: "อาหารเสริม",
      visibility: "Visibility"
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
    reviewQueue: {
      approve: "อนุมัติ",
      clientDose: "ขนาดสำหรับลูกค้า",
      disapprove: "ไม่อนุมัติ",
      doseReduced: "ลดขนาดแล้ว",
      empty: "ไม่มีงานรีวิวอาหารเสริมที่รอดำเนินการ",
      flagReason: "เหตุผลที่ต้องรีวิว",
      highPriority: "ความสำคัญสูง",
      lowPriority: "ความสำคัญต่ำ",
      mediumPriority: "ความสำคัญปานกลาง",
      newDose: "ขนาดใหม่",
      originalDose: "ขนาดเดิม",
      plan: "แผน",
      planLink: "เปิดแผน",
      planReview: "รีวิวแผน",
      queued: "เข้าคิว",
      doseUnverified: "ยังตรวจขนาดไม่ได้",
      supplementReview: "รีวิวอาหารเสริม",
      reviewerNote: "หมายเหตุผู้รีวิว",
      reviewRequired: "ต้องรีวิว",
      total: "ทั้งหมด",
      unknown: "อาหารเสริมใหม่"
    },
    technicalAlerts: {
      critical: "วิกฤต",
      empty: "ไม่มี Technical Alert ในช่วงเวลานี้",
      event: "อีเวนต์",
      high: "สูง",
      low: "ต่ำ",
      medium: "กลาง",
      plan: "แผน",
      rootCause: "สาเหตุหลัก",
      source: "แหล่งข้อมูล",
      status: "สถานะ",
      task: "งาน",
      time: "เวลา",
      total: "ทั้งหมด"
    },
    visibility: {
      active: "กำลังทำ",
      actor: "ผู้ทำ",
      blocked: "ติดขัด",
      capabilities: "ความสามารถ",
      completed: "สำเร็จ",
      empty: "ไม่มีงานในช่วงเวลานี้",
      failed: "ล้มเหลว",
      goal: "Goal",
      human: "คน",
      priority: "ความสำคัญ",
      queued: "รอคิว",
      status: "สถานะ",
      task: "งาน",
      total: "ทั้งหมด",
      worker: "ผู้รับงาน"
    },
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
      associateExisting: "เชื่อมกับอาหารเสริมที่มีอยู่",
      associations: "ชื่อเชื่อมโยง",
      associationHint:
        "ใช้เมื่อรายการใหม่นี้เป็นอีกชื่อหนึ่งของอาหารเสริมที่มีอยู่ในฐานข้อมูลแล้ว",
      associatedWith: "เชื่อมกับ",
      clearAssociation: "ล้าง",
      noAssociationMatches: "ไม่พบอาหารเสริมที่ตรงกัน",
      removeAssociation: "ลบชื่อเชื่อมโยง",
      save: "บันทึก",
      search: "ค้นหาอาหารเสริม",
      searchExisting: "ค้นหาอาหารเสริมที่มีอยู่",
      sourceStatus: "แหล่งข้อมูล",
      status: "สถานะ",
      suggestDose: "แนะนำด้วย AI",
      suggestDoseBusy: "AI กำลังร่างรายละเอียดความปลอดภัย...",
      suggestDoseError: "ไม่สามารถแนะนำขนาดได้",
      total: "ทั้งหมด",
      updateError: "ไม่สามารถบันทึกอาหารเสริมนี้ได้",
      doseValidationError:
        "กรอกปริมาณที่มากกว่า 0 และหน่วยสำหรับรายการที่อนุญาตหรือต้องรีวิว",
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

function adminGoalHref({
  accessToken,
  filters,
  goalId,
  locale,
  range
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  goalId: string;
  locale: Locale;
  range: AdminDashboardRange;
}>) {
  const params = new URLSearchParams({
    access_token: accessToken,
    goal: goalId,
    range,
    view: "goals"
  });

  adminDashboardFilterEntries(filters).forEach(([key, value]) => {
    params.set(key, value);
  });

  return `/${locale}/admin/dashboard?${params.toString()}`;
}

function adminReviewTaskHref({
  accessToken,
  filters,
  locale,
  range,
  reviewTaskId
}: Readonly<{
  accessToken: string;
  filters: AdminDashboardFilters;
  locale: Locale;
  range: AdminDashboardRange;
  reviewTaskId: string;
}>) {
  const params = new URLSearchParams({
    access_token: accessToken,
    range,
    review: reviewTaskId,
    view: "reviews"
  });

  adminDashboardFilterEntries(filters).forEach(([key, value]) => {
    params.set(key, value);
  });

  return `/${locale}/admin/dashboard?${params.toString()}`;
}

function adminGoalsEventsHref({
  accessToken,
  goalId,
  range
}: Readonly<{
  accessToken: string;
  goalId: string | null;
  range: AdminDashboardRange;
}>) {
  const params = new URLSearchParams({
    access_token: accessToken,
    range
  });

  if (goalId) {
    params.set("goal", goalId);
  }

  return `/api/admin/goals/events?${params.toString()}`;
}

function adminExecutionEventsHref({
  accessToken,
  range,
  view
}: Readonly<{
  accessToken: string;
  range: AdminDashboardRange;
  view: "agents" | "visibility";
}>) {
  const params = new URLSearchParams({
    access_token: accessToken,
    range
  });

  return `/api/admin/${view}/events?${params.toString()}`;
}

function useLiveAdminData<T>({
  enabled,
  eventName,
  href,
  initialData,
  streamKey
}: Readonly<{
  enabled: boolean;
  eventName: string;
  href: string;
  initialData: T;
  streamKey: string;
}>) {
  const [streamedData, setStreamedData] = useState<{
    data: T;
    key: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !href || typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource(href);

    function handleEvent(event: Event) {
      try {
        setStreamedData({
          data: JSON.parse((event as MessageEvent).data) as T,
          key: streamKey
        });
      } catch {
        // Keep the last good snapshot if the browser receives a malformed frame.
      }
    }

    source.addEventListener(eventName, handleEvent);

    return () => {
      source.removeEventListener(eventName, handleEvent);
      source.close();
    };
  }, [enabled, eventName, href, streamKey]);

  return streamedData?.key === streamKey ? streamedData.data : initialData;
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

function formatTaskDuration(ms: number, locale: Locale) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const number = (value: number) => formatNumber(value, locale);

  if (days > 0) {
    return `${number(days)}d ${number(hours)}h`;
  }

  if (hours > 0) {
    return `${number(hours)}h ${number(minutes)}m`;
  }

  if (minutes > 0) {
    return `${number(minutes)}m ${number(seconds)}s`;
  }

  return `${number(seconds)}s`;
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
            items={labels.performance}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.performanceTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            filters={filters}
            items={labels.marketing}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.marketingTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            filters={filters}
            items={labels.governance}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.governanceTitle}
            view={view}
          />
          <SidebarNavList
            accessToken={accessToken}
            filters={filters}
            items={labels.execution}
            locale={locale}
            onNavigate={onNavigate}
            range={range}
            title={labels.executionTitle}
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

function dashboardKpiValue(data: AdminDashboardData, id: AdminDashboardKpiId) {
  return data.kpis.find((kpi) => kpi.id === id)?.value ?? 0;
}

type BusinessMetric = Readonly<{
  label: string;
  value: string;
}>;

function BusinessStatsGrid({
  metrics
}: Readonly<{
  metrics: BusinessMetric[];
}>) {
  return (
    <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
      <div className="grid grid-cols-1 gap-px bg-gray-900/5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div className="bg-white px-5 py-6" key={metric.label}>
            <p className="text-sm/6 font-medium text-gray-500">{metric.label}</p>
            <p className="mt-2 flex items-baseline gap-x-2">
              <span className="text-4xl font-semibold tracking-tight text-gray-900">
                {metric.value}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

type BusinessFunnelStage = Readonly<{
  count: number;
  denominator: number | null;
  label: string;
}>;

function businessFunnelStages(
  flowData: AdminFlowData,
  labels: AdminContent
): BusinessFunnelStage[] {
  const landed = flowNodeCount(flowData, "landingViewed");
  const started = flowNodeCount(flowData, "assessmentStarted");
  const completed = flowNodeCount(flowData, "assessmentSubmitted");
  const healthScore = flowNodeCount(flowData, "healthscoreViewed");

  return [
    {
      count: landed,
      denominator: null,
      label: labels.atAGlance.landingVisitors
    },
    {
      count: started,
      denominator: landed,
      label: labels.atAGlance.assessmentStarts
    },
    {
      count: completed,
      denominator: started,
      label: labels.atAGlance.assessmentCompletions
    },
    {
      count: healthScore,
      denominator: completed,
      label: labels.atAGlance.healthScoreViews
    },
    {
      count: flowNodeCount(flowData, "freeEmailRequested"),
      denominator: healthScore,
      label: labels.atAGlance.freeRequests
    },
    {
      count: flowNodeCount(flowData, "precisionPaid"),
      denominator: healthScore,
      label: labels.atAGlance.precisionConversions
    },
    {
      count: flowNodeCount(flowData, "proPaid"),
      denominator: healthScore,
      label: labels.atAGlance.proConversions
    }
  ];
}

function BusinessFunnelTable({
  flowData,
  labels,
  locale
}: Readonly<{
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
}>) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-base font-semibold text-gray-900">
        {labels.atAGlance.conversionSnapshot}
      </h2>
      <div className="mt-6 flow-root">
        <div className="-mx-5 -my-2 overflow-x-auto">
          <div className="inline-block min-w-full py-2 align-middle px-5">
            <div className="overflow-hidden shadow-sm outline-1 outline-black/5 sm:rounded-lg">
              <table className="relative min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                      scope="col"
                    >
                      {labels.atAGlance.stage}
                    </th>
                    <th
                      className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                      scope="col"
                    >
                      {labels.atAGlance.count}
                    </th>
                    <th
                      className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                      scope="col"
                    >
                      {labels.atAGlance.dropoff}
                    </th>
                    <th
                      className="py-3.5 pr-4 pl-3 text-right text-sm font-semibold text-gray-900 sm:pr-6"
                      scope="col"
                    >
                      {labels.atAGlance.conversion}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {businessFunnelStages(flowData, labels).map((stage) => {
                    const dropoff =
                      stage.denominator === null
                        ? null
                        : Math.max(0, stage.denominator - stage.count);
                    const conversion =
                      stage.denominator && stage.denominator > 0
                        ? (stage.count / stage.denominator) * 100
                        : null;

                    return (
                      <tr key={stage.label}>
                        <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-6">
                          {stage.label}
                        </td>
                        <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                          {formatNumber(stage.count, locale)}
                        </td>
                        <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                          {dropoff === null ? "-" : formatNumber(dropoff, locale)}
                        </td>
                        <td className="py-4 pr-4 pl-3 text-right text-sm whitespace-nowrap text-gray-500 sm:pr-6">
                          {conversion === null
                            ? "-"
                            : formatPercent(conversion, locale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminAtAGlanceView({
  accessToken,
  alertsData,
  communicationsData,
  data,
  filters,
  flowData,
  labels,
  locale,
  reviewQueueData
}: Readonly<{
  accessToken: string;
  alertsData: AdminTechnicalAlertsData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  filters: AdminDashboardFilters;
  flowData: AdminFlowData;
  labels: AdminContent;
  locale: Locale;
  reviewQueueData: AdminReviewQueueData;
}>) {
  const communicationIssues =
    communicationsData.summary.failed + communicationsData.summary.noChannel;
  const siteIssues =
    alertsData.summary.critical + alertsData.summary.high;
  const attentionItems = [
    {
      count: reviewQueueData.summary.total,
      href: adminHref(locale, accessToken, data.range, "reviews", filters),
      label: labels.atAGlance.pendingReviews
    },
    {
      count: reviewQueueData.summary.unknown,
      href: adminHref(locale, accessToken, data.range, "reviews", filters),
      label: labels.reviewQueue.unknown
    },
    {
      count: communicationIssues,
      href: adminHref(locale, accessToken, data.range, "communications", filters),
      label: labels.atAGlance.customerContactIssues
    },
    {
      count: siteIssues,
      href: adminHref(locale, accessToken, data.range, "alerts", filters),
      label: labels.atAGlance.criticalAlerts
    }
  ].filter((item) => item.count > 0);
  const metrics: BusinessMetric[] = [
    {
      label: labels.atAGlance.landingVisitors,
      value: formatNumber(flowNodeCount(flowData, "landingViewed"), locale)
    },
    {
      label: labels.atAGlance.assessmentStarts,
      value: formatNumber(flowNodeCount(flowData, "assessmentStarted"), locale)
    },
    {
      label: labels.atAGlance.assessmentCompletions,
      value: formatNumber(flowNodeCount(flowData, "assessmentSubmitted"), locale)
    },
    {
      label: labels.atAGlance.healthScoreViews,
      value: formatNumber(flowNodeCount(flowData, "healthscoreViewed"), locale)
    },
    {
      label: labels.atAGlance.freeRequests,
      value: formatNumber(dashboardKpiValue(data, "free"), locale)
    },
    {
      label: labels.atAGlance.precisionConversions,
      value: formatNumber(dashboardKpiValue(data, "precision"), locale)
    },
    {
      label: labels.atAGlance.proConversions,
      value: formatNumber(dashboardKpiValue(data, "pro"), locale)
    },
    {
      label: labels.atAGlance.pendingReviews,
      value: formatNumber(reviewQueueData.summary.total, locale)
    }
  ];

  return (
    <>
      <BusinessStatsGrid metrics={metrics} />

      <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <BusinessFunnelTable flowData={flowData} labels={labels} locale={locale} />

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
            {labels.atAGlance.attentionTitle}
          </h2>
          <div className="mt-4 space-y-3">
            {attentionItems.length > 0 ? (
              attentionItems.map((item) => (
                <a
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 ring-1 ring-gray-100 transition hover:bg-gray-100"
                  href={item.href}
                  key={item.label}
                >
                  <span>{item.label}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 ring-1 ring-gray-200">
                    {formatNumber(item.count, locale)}
                  </span>
                </a>
              ))
            ) : (
              <p className="rounded-xl bg-[#ECFDF5] px-4 py-3 text-sm font-medium text-[#126B4F] ring-1 ring-[#A7F3D0]">
                {labels.atAGlance.attentionClear}
              </p>
            )}
          </div>
        </section>
      </div>
    </>
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

function supplementSearchText(labels: AdminContent, row: AdminSupplementRow) {
  return [
    row.name,
    row.category,
    row.ingredientType,
    row.primaryUseCase,
    row.aliases.map((alias) => alias.name).join(" "),
    ...row.safetyFlags.map((flag) => supplementSafetyFlagLabel(labels, flag))
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null);
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
      supplementSearchText(labels, row).includes(normalizedSearch);
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

  async function deleteAssociation(row: AdminSupplementRow, aliasId: string) {
    setDeletingAliasId(aliasId);
    setErrorId(null);

    try {
      const response = await fetch(
        `/api/admin/supplements/${row.id}/aliases/${aliasId}`,
        {
          body: JSON.stringify({ accessToken }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error("Unable to delete supplement association");
      }

      const payload = (await response.json()) as { row?: AdminSupplementRow };

      if (payload.row) {
        syncRow(payload.row);
      }
    } catch {
      setErrorId(row.id);
    } finally {
      setDeletingAliasId(null);
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
              <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_8rem] lg:items-center">
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
                    {row.ingredientType ?? row.category}
                  </p>
                  {row.primaryUseCase ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">
                      {row.primaryUseCase}
                    </p>
                  ) : null}
                  {row.aliases.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.aliases.map((alias) => (
                        <span
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                          key={alias.id}
                        >
                          {alias.name}
                        </span>
                      ))}
                    </div>
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
          accessToken={accessToken}
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
          onDeleteAssociation={(aliasId) => void deleteAssociation(draft, aliasId)}
          onSave={() => {
            void saveRow(draft).then((saved) => {
              if (saved) {
                setDraft(null);
              }
            });
          }}
          saving={savingId === draft.id}
          deletingAssociationId={deletingAliasId}
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
  value: ReactNode;
}>) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900">
        {hasValue ? value : "—"}
      </p>
    </div>
  );
}

function SupplementDetailsModal({
  accessToken,
  associatedSupplementId,
  associationOptions,
  deletingAssociationId,
  draft,
  error,
  headerNote,
  labels,
  locale,
  onAssociateSupplement,
  onChange,
  onClose,
  onDeleteAssociation,
  onSave,
  saving
}: Readonly<{
  accessToken: string;
  associatedSupplementId?: string;
  associationOptions?: AdminSupplementRow[];
  deletingAssociationId?: string | null;
  draft: AdminSupplementRow;
  error: boolean;
  headerNote?: string | null;
  labels: AdminContent;
  locale: Locale;
  onAssociateSupplement?: (supplementId: string) => void;
  onChange: (patch: Partial<AdminSupplementRow>) => void;
  onClose: () => void;
  onDeleteAssociation?: (aliasId: string) => void;
  onSave: () => void;
  saving: boolean;
}>) {
  const [suggestingDose, setSuggestingDose] = useState(false);
  const [suggestDoseError, setSuggestDoseError] = useState(false);
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";
  const associationLocked = Boolean(associatedSupplementId);
  const associationEnabled =
    Boolean(onAssociateSupplement) && Boolean(associationOptions?.length);
  const doseRequired =
    draft.listStatus === "review_required" || draft.listStatus === "whitelisted";
  const doseValid =
    !doseRequired ||
    (draft.maxAmount !== null &&
      Number.isFinite(draft.maxAmount) &&
      draft.maxAmount > 0 &&
      draft.maxUnit.trim() !== "");
  const unitOptions =
    draft.maxUnit &&
    !(supplementDoseUnits as readonly string[]).includes(draft.maxUnit)
      ? [draft.maxUnit, ...supplementDoseUnits]
      : supplementDoseUnits;

  async function suggestDose() {
    setSuggestingDose(true);
    setSuggestDoseError(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      supplementDoseSuggestionTimeoutMs
    );

    try {
      const response = await fetch("/api/admin/supplements/suggest-dose", {
        body: JSON.stringify({
          accessToken,
          category: draft.category,
          confidence: draft.confidence,
          currentMaxAmount: draft.maxAmount,
          currentMaxUnit: draft.maxUnit,
          listStatus: draft.listStatus,
          primaryUseCase: draft.primaryUseCase,
          safetyFlags: draft.safetyFlags,
          safetyNotes: draft.safetyNotes,
          supplementName: draft.name
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("Unable to suggest supplement dose");
      }

      const payload = (await response.json()) as {
        suggestion?: {
          confidence?: SupplementConfidence;
          listStatus?: SupplementListStatus;
          maxAmount?: number | null;
          maxUnit?: string;
          safetyFlags?: SupplementSafetyFlag[];
          safetyNotes?: string;
        };
      };
      const suggestion = payload.suggestion;
      const suggestedStatus = suggestion?.listStatus ?? draft.listStatus;
      const suggestedMaxAmount = suggestion?.maxAmount;
      const suggestedMaxUnit = suggestion?.maxUnit;
      const suggestedDoseRequired =
        suggestedStatus === "review_required" ||
        suggestedStatus === "whitelisted";

      if (
        !suggestion ||
        (suggestedDoseRequired &&
          (typeof suggestedMaxAmount !== "number" ||
            !Number.isFinite(suggestedMaxAmount) ||
            suggestedMaxAmount <= 0 ||
            typeof suggestedMaxUnit !== "string" ||
            !suggestedMaxUnit.trim())) ||
        (!suggestedDoseRequired &&
          suggestedMaxAmount !== null &&
          suggestedMaxAmount !== undefined &&
          (typeof suggestedMaxAmount !== "number" ||
            !Number.isFinite(suggestedMaxAmount))) ||
        (suggestedMaxUnit !== undefined && typeof suggestedMaxUnit !== "string")
      ) {
        throw new Error("Invalid supplement dose suggestion");
      }

      onChange({
        confidence: suggestion.confidence ?? draft.confidence,
        listStatus: suggestedStatus,
        maxAmount:
          suggestedMaxAmount === null
            ? null
            : typeof suggestedMaxAmount === "number"
              ? suggestedMaxAmount
              : draft.maxAmount,
        maxUnit:
          typeof suggestedMaxUnit === "string"
            ? suggestedMaxUnit
            : draft.maxUnit,
        safetyFlags: Array.isArray(suggestion.safetyFlags)
          ? suggestion.safetyFlags
          : draft.safetyFlags,
        safetyNotes:
          typeof suggestion.safetyNotes === "string" &&
          suggestion.safetyNotes.trim()
            ? suggestion.safetyNotes.trim()
            : draft.safetyNotes
      });
    } catch (suggestionError) {
      console.error("Unable to suggest supplement details", suggestionError);
      setSuggestDoseError(true);
    } finally {
      window.clearTimeout(timeout);
      setSuggestingDose(false);
    }
  }

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
              <h2 className="text-xl font-semibold text-gray-900">
                {draft.name}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {draft.ingredientType ?? draft.category}
              </p>
              {headerNote ? (
                <p className="mt-1 text-sm text-gray-500">{headerNote}</p>
              ) : null}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

            {draft.aliases.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                  {labels.supplements.associations}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {draft.aliases.map((alias) => (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                      key={alias.id}
                    >
                      {alias.name}
                      {onDeleteAssociation ? (
                        <button
                          aria-label={`${labels.supplements.removeAssociation}: ${alias.name}`}
                          className="rounded-full p-0.5 text-emerald-500 hover:bg-white hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          disabled={deletingAssociationId === alias.id}
                          onClick={() => onDeleteAssociation(alias.id)}
                          type="button"
                        >
                          <XMarkIcon aria-hidden={true} className="size-3.5" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {associationEnabled ? (
              <SupplementAssociationPicker
                labels={labels}
                locale={locale}
                onSelect={(supplementId) =>
                  onAssociateSupplement?.(supplementId)
                }
                options={associationOptions ?? []}
                selectedId={associatedSupplementId ?? ""}
              />
            ) : null}

            <fieldset
              className={classNames(
                "space-y-6 transition-opacity",
                associationLocked ? "opacity-40" : ""
              )}
              disabled={associationLocked}
            >
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
                    aria-invalid={doseRequired && !doseValid}
                    className={classNames(
                      inputClass,
                      doseRequired && !doseValid
                        ? "ring-red-300 focus:ring-red-500"
                        : ""
                    )}
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
                  <select
                    aria-invalid={doseRequired && !doseValid}
                    className={classNames(
                      inputClass,
                      doseRequired && !doseValid
                        ? "ring-red-300 focus:ring-red-500"
                        : ""
                    )}
                    onChange={(event) =>
                      onChange({ maxUnit: event.target.value })
                    }
                    value={draft.maxUnit}
                  >
                    <option value="">{labels.supplements.none}</option>
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
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
            </fieldset>

            {!associationLocked && !doseValid ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {labels.supplements.doseValidationError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                aria-label={labels.supplements.suggestDose}
                className="inline-flex size-9 items-center justify-center rounded-md bg-[#3A7BD5] text-white shadow-sm transition hover:bg-[#2F67B8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A7BD5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={suggestingDose || associationLocked}
                onClick={() => void suggestDose()}
                title={labels.supplements.suggestDose}
                type="button"
              >
                <SparklesIcon
                  aria-hidden={true}
                  className={classNames(
                    "size-5",
                    suggestingDose ? "animate-pulse" : ""
                  )}
                />
              </button>
              {suggestingDose ? (
                <p className="text-sm font-medium text-[#3A7BD5]">
                  {labels.supplements.suggestDoseBusy}
                </p>
              ) : null}
              {suggestDoseError ? (
                <p className="text-sm font-medium text-red-600">
                  {labels.supplements.suggestDoseError}
                </p>
              ) : null}
              {error ? (
                <p className="text-sm font-medium text-red-600">
                  {labels.supplements.updateError}
                </p>
              ) : null}
            </div>
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
                disabled={
                  saving ||
                  suggestingDose ||
                  (!associationLocked && !doseValid)
                }
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

function SupplementAssociationPicker({
  labels,
  locale,
  onSelect,
  options,
  selectedId
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  onSelect: (supplementId: string) => void;
  options: AdminSupplementRow[];
  selectedId: string;
}>) {
  const [query, setQuery] = useState("");
  const selectedSupplement =
    options.find((option) => option.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const matches = options
    .filter((option) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        option.name,
        option.category,
        option.ingredientType,
        option.primaryUseCase,
        option.aliases.map((alias) => alias.name).join(" ")
      ]
        .filter(Boolean)
        .some((value) =>
          value?.toLowerCase().includes(normalizedQuery)
        );
    });

  return (
    <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-gray-900">
            {labels.supplements.associateExisting}
          </span>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            {labels.supplements.associationHint}
          </p>
        </div>
        {selectedSupplement ? (
          <button
            className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
            onClick={() => onSelect("")}
            type="button"
          >
            {labels.supplements.clearAssociation}
          </button>
        ) : null}
      </div>

      <Combobox
        as="div"
        className="mt-4"
        onChange={(option: AdminSupplementRow | null) => {
          setQuery("");
          onSelect(option?.id ?? "");
        }}
        value={selectedSupplement}
      >
        <div className="relative mt-2">
          <ComboboxInput
            aria-label={labels.supplements.associateExisting}
            className="block w-full rounded-md bg-white py-2 pr-12 pl-3 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            displayValue={(option: AdminSupplementRow | null) =>
              option?.name ?? ""
            }
            id="supplement-association-search"
            onBlur={() => setQuery("")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.supplements.searchExisting}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
            <ChevronDownSolidIcon
              aria-hidden={true}
              className="size-5 text-gray-400"
            />
          </ComboboxButton>

          <ComboboxOptions
            transition={true}
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg outline outline-black/5 data-closed:data-leave:opacity-0 data-leave:transition data-leave:duration-100 data-leave:ease-in"
          >
            {matches.length > 0 ? (
              matches.map((option) => (
                <ComboboxOption
                  className="cursor-default px-3 py-2 text-gray-900 select-none data-focus:bg-[#1FA77A] data-focus:text-white data-focus:outline-none"
                  key={option.id}
                  value={option}
                >
                  <span className="block truncate font-semibold">
                    {option.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500 data-focus:text-white/80">
                    {option.category} · {supplementStatusLabel(labels, option.listStatus)}
                  </span>
                </ComboboxOption>
              ))
            ) : (
              <p className="px-3 py-2 text-sm font-medium text-gray-500">
                {labels.supplements.noAssociationMatches}
              </p>
            )}
          </ComboboxOptions>
        </div>
      </Combobox>

      {selectedSupplement ? (
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-gray-200">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {labels.supplements.associatedWith}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={classNames(
                supplementStatusClass(selectedSupplement.listStatus),
                "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
              )}
            >
              {supplementStatusLabel(labels, selectedSupplement.listStatus)}
            </span>
            <h3 className="text-sm font-semibold text-gray-900">
              {selectedSupplement.name}
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {selectedSupplement.category} ·{" "}
            {formatSupplementDose(selectedSupplement, locale)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function reviewKindLabel(labels: AdminContent, row: AdminReviewTaskRow) {
  if (row.reviewKind === "dose_reduced") {
    return labels.reviewQueue.doseReduced;
  }

  if (row.reviewKind === "unknown_supplement") {
    return labels.reviewQueue.unknown;
  }

  if (row.reviewKind === "dose_unverified") {
    return labels.reviewQueue.doseUnverified;
  }

  return labels.reviewQueue.reviewRequired;
}

function reviewScopeLabel(labels: AdminContent, row: AdminReviewTaskRow) {
  return row.planId
    ? labels.reviewQueue.planReview
    : labels.reviewQueue.supplementReview;
}

type ReviewGoalGroup = Readonly<{
  createdAt: string;
  key: string;
  planId: string | null;
  priority: number;
  rows: AdminReviewTaskRow[];
  title: string;
}>;

function sortReviewRows(
  left: AdminReviewTaskRow,
  right: AdminReviewTaskRow
) {
  const priorityDifference = right.priority - left.priority;

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime();
}

function groupReviewRows(
  labels: AdminContent,
  rows: AdminReviewTaskRow[]
): ReviewGoalGroup[] {
  const groups = new Map<string, ReviewGoalGroup>();

  rows.forEach((row) => {
    const key = row.goalId ?? row.id;
    const existing = groups.get(key);
    const createdAt = existing
      ? existing.createdAt
      : row.goalQueuedAt || row.queuedAt;
    const priority = Math.max(existing?.priority ?? 0, row.goalPriority, row.priority);

    groups.set(key, {
      createdAt,
      key,
      planId: existing?.planId ?? row.planId,
      priority,
      rows: [...(existing?.rows ?? []), row],
      title: existing?.title ?? row.goalTitle ?? reviewScopeLabel(labels, row)
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(sortReviewRows)
    }))
    .sort((left, right) => {
      const priorityDifference = right.priority - left.priority;

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return (
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime()
      );
    });
}

function reviewPriorityPill(labels: AdminContent, priority: number) {
  if (priority >= 5) {
    return {
      className: "bg-red-50 text-red-700 ring-red-200",
      label: labels.reviewQueue.highPriority
    };
  }

  if (priority >= 3) {
    return {
      className: "bg-amber-50 text-amber-800 ring-amber-200",
      label: labels.reviewQueue.mediumPriority
    };
  }

  return {
    className: "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]",
    label: labels.reviewQueue.lowPriority
  };
}

function reviewContextText(
  labels: AdminContent,
  row: AdminReviewTaskRow
) {
  const details = [
    row.planId ? `${labels.reviewQueue.plan}: ${row.planId}` : "",
    row.originalDose
      ? `${labels.reviewQueue.originalDose}: ${row.originalDose}`
      : "",
    row.newDose ? `${labels.reviewQueue.newDose}: ${row.newDose}` : ""
  ].filter(Boolean);

  return details.length > 0 ? details.join(" · ") : null;
}

function reviewRowToSupplementDraft(
  labels: AdminContent,
  row: AdminReviewTaskRow
): AdminSupplementRow {
  const priority = reviewPriorityPill(labels, row.priority);

  return {
    aliases: [],
    category: reviewKindLabel(labels, row),
    confidence: row.reviewKind === "unknown_supplement" ? "low" : "moderate",
    id: row.id,
    ingredientType: `${reviewKindLabel(labels, row)} · ${priority.label}`,
    listStatus: "review_required",
    maxAmount: row.maxAmount,
    maxUnit: row.maxUnit ?? "",
    name: row.supplementName,
    primaryUseCase: null,
    safetyFlags: [],
    safetyNotes: reviewContextText(labels, row),
    sourceStatus: "recommended_add",
    updatedAt: row.queuedAt
  };
}

function formatReviewQueueDose(
  amount: number | null,
  unit: string | null,
  locale: Locale
) {
  if (amount === null && !unit) {
    return "—";
  }

  const formattedAmount =
    amount === null
      ? "—"
      : new Intl.NumberFormat(formatLocale(locale), {
          maximumFractionDigits: 2
        }).format(amount);

  return unit ? `${formattedAmount} ${unit}` : formattedAmount;
}

function reviewProposedDose(row: AdminReviewTaskRow, locale: Locale) {
  return (
    row.clientDoseText ??
    formatReviewQueueDose(row.clientDoseAmount, row.clientDoseUnit, locale)
  );
}

function PlanSafetyReviewModal({
  error,
  labels,
  locale,
  onClose,
  onDecision,
  row,
  saving
}: Readonly<{
  error: boolean;
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  onDecision: (
    decision: "approve" | "disapprove",
    clientDoseAmount: number | null,
    clientDoseUnit: string,
    reviewerNote: string | null
  ) => void;
  row: AdminReviewTaskRow;
  saving: boolean;
}>) {
  const [clientDoseAmount, setClientDoseAmount] = useState<number | null>(
    row.clientDoseAmount
  );
  const [clientDoseUnit, setClientDoseUnit] = useState(row.clientDoseUnit ?? "");
  const [reviewerNote, setReviewerNote] = useState("");
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";
  const unitOptions =
    clientDoseUnit &&
    !(supplementDoseUnits as readonly string[]).includes(clientDoseUnit)
      ? [clientDoseUnit, ...supplementDoseUnits]
      : supplementDoseUnits;
  const doseValid =
    clientDoseAmount !== null &&
    Number.isFinite(clientDoseAmount) &&
    clientDoseAmount > 0 &&
    clientDoseUnit.trim() !== "";

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
              <h2 className="text-xl font-semibold text-gray-900">
                {row.supplementName}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {formatGeneratedAt(row.queuedAt, locale)}
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
            {row.planId ? (
              <SupplementListMeta
                label={labels.reviewQueue.plan}
                value={<PlanIdLink locale={locale} planId={row.planId} />}
              />
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SupplementListMeta
                label={labels.reviewQueue.clientDose}
                value={
                  row.clientDoseText ??
                  formatReviewQueueDose(
                    row.clientDoseAmount,
                    row.clientDoseUnit,
                    locale
                  )
                }
              />
              <SupplementListMeta
                label={labels.supplements.maxAmount}
                value={formatReviewQueueDose(
                  row.limitAmount ?? row.maxAmount,
                  row.limitUnit ?? row.maxUnit,
                  locale
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.supplements.maxAmount}
                <input
                  aria-invalid={!doseValid}
                  className={classNames(
                    inputClass,
                    !doseValid ? "ring-red-300 focus:ring-red-500" : ""
                  )}
                  min="0"
                  onChange={(event) =>
                    setClientDoseAmount(
                      event.target.value === ""
                        ? null
                        : Number(event.target.value)
                    )
                  }
                  step="any"
                  type="number"
                  value={clientDoseAmount ?? ""}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.supplements.maxUnit}
                <select
                  aria-invalid={!doseValid}
                  className={classNames(
                    inputClass,
                    !doseValid ? "ring-red-300 focus:ring-red-500" : ""
                  )}
                  onChange={(event) => setClientDoseUnit(event.target.value)}
                  value={clientDoseUnit}
                >
                  <option value="">{labels.supplements.none}</option>
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              {labels.reviewQueue.reviewerNote}
              <textarea
                className={classNames(inputClass, "min-h-28 resize-y")}
                onChange={(event) => setReviewerNote(event.target.value)}
                value={reviewerNote}
              />
            </label>

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {labels.supplements.updateError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              onClick={onClose}
              type="button"
            >
              {labels.supplements.close}
            </button>
            <button
              className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={() =>
                onDecision(
                  "disapprove",
                  clientDoseAmount,
                  clientDoseUnit,
                  reviewerNote.trim() || null
                )
              }
              type="button"
            >
              {labels.reviewQueue.disapprove}
            </button>
            <button
              className="rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || !doseValid}
              onClick={() =>
                onDecision(
                  "approve",
                  clientDoseAmount,
                  clientDoseUnit,
                  reviewerNote.trim() || null
                )
              }
              type="button"
            >
              {saving ? "..." : labels.reviewQueue.approve}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminReviewQueueView({
  accessToken,
  data,
  labels,
  locale,
  selectedReviewTaskId,
  supplementsData
}: Readonly<{
  accessToken: string;
  data: AdminReviewQueueData;
  labels: AdminContent;
  locale: Locale;
  selectedReviewTaskId?: string | null;
  supplementsData: AdminSupplementsData;
}>) {
  const [queueState, setQueueState] = useState<{
    data: AdminReviewQueueData;
    generatedAt: string;
  }>({
    data,
    generatedAt: data.generatedAt
  });
  const [errorReviewId, setErrorReviewId] = useState<string | null>(null);
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<{
    associatedSupplementId: string;
    draft: AdminSupplementRow;
    queuedLabel: string;
    row: AdminReviewTaskRow;
  } | null>(null);
  const [dismissedReviewTaskId, setDismissedReviewTaskId] = useState<
    string | null
  >(null);
  const queueData =
    queueState.generatedAt === data.generatedAt ? queueState.data : data;
  const reviewGroups = groupReviewRows(labels, queueData.rows);

  function setLocalQueueData(
    next:
      | AdminReviewQueueData
      | ((currentData: AdminReviewQueueData) => AdminReviewQueueData)
  ) {
    setQueueState((currentState) => {
      const currentData =
        currentState.generatedAt === data.generatedAt
          ? currentState.data
          : data;

      return {
        data:
          typeof next === "function"
            ? next(currentData)
            : next,
        generatedAt: data.generatedAt
      };
    });
  }

  async function saveReview(
    row: AdminSupplementRow,
    associatedSupplementId: string
  ) {
    setSavingReviewId(row.id);
    setErrorReviewId(null);

    try {
      const response = await fetch(`/api/admin/review-tasks/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action: "resolve",
          associatedSupplementId: associatedSupplementId || null,
          category: row.category,
          confidence: row.confidence,
          listStatus: row.listStatus,
          maxAmount: row.maxAmount,
          maxUnit: row.maxUnit,
          safetyFlags: row.safetyFlags,
          safetyNotes: row.safetyNotes,
          supplementName: row.name
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(
          errorPayload?.message ?? "Unable to resolve review task"
        );
      }

      const payload = (await response.json()) as {
        data?: AdminReviewQueueData;
      };

      if (payload.data) {
        setLocalQueueData(payload.data);
      } else {
        setLocalQueueData((currentData) => {
          const rows = currentData.rows.filter((item) => item.id !== row.id);

          return {
            ...currentData,
            rows,
            summary: {
              doseReduced: rows.filter(
                (item) => item.reviewKind === "dose_reduced"
              ).length,
              reviewRequired: rows.filter(
                (item) =>
                  item.reviewKind !== "dose_reduced" &&
                  item.reviewKind !== "unknown_supplement"
              ).length,
              total: rows.length,
              unknown: rows.filter(
                (item) => item.reviewKind === "unknown_supplement"
              ).length
            }
          };
        });
      }

      setDismissedReviewTaskId(row.id);
      setSelectedReview(null);
    } catch (saveError) {
      console.error("Unable to resolve review task", saveError);
      setErrorReviewId(row.id);
    } finally {
      setSavingReviewId(null);
    }
  }

  async function decidePlanReview(
    row: AdminReviewTaskRow,
    decision: "approve" | "disapprove",
    clientDoseAmount: number | null,
    clientDoseUnit: string,
    reviewerNote: string | null
  ) {
    setSavingReviewId(row.id);
    setErrorReviewId(null);

    try {
      const response = await fetch(`/api/admin/review-tasks/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action: decision,
          clientDoseAmount,
          clientDoseUnit,
          reviewerNote
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(
          errorPayload?.message ?? "Unable to update plan review"
        );
      }

      const payload = (await response.json()) as {
        data?: AdminReviewQueueData;
      };

      if (payload.data) {
        setLocalQueueData(payload.data);
      }

      setDismissedReviewTaskId(row.id);
      setSelectedReview(null);
    } catch (decisionError) {
      console.error("Unable to update plan review", decisionError);
      setErrorReviewId(row.id);
    } finally {
      setSavingReviewId(null);
    }
  }

  function selectReview(row: AdminReviewTaskRow) {
    setDismissedReviewTaskId(null);
    setSelectedReview({
      associatedSupplementId: "",
      draft: reviewRowToSupplementDraft(labels, row),
      queuedLabel: formatGeneratedAt(row.queuedAt, locale),
      row
    });
  }

  const linkedReviewRow =
    selectedReviewTaskId && dismissedReviewTaskId !== selectedReviewTaskId
      ? queueData.rows.find((item) => item.id === selectedReviewTaskId) ?? null
      : null;
  const visibleReview =
    selectedReview ??
    (linkedReviewRow
      ? {
          associatedSupplementId: "",
          draft: reviewRowToSupplementDraft(labels, linkedReviewRow),
          queuedLabel: formatGeneratedAt(linkedReviewRow.queuedAt, locale),
          row: linkedReviewRow
        }
      : null);

  function closeReviewModal() {
    setDismissedReviewTaskId(selectedReviewTaskId ?? visibleReview?.row.id ?? null);
    setSelectedReview(null);
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FlowSummaryCard
          compact={true}
          label={labels.reviewQueue.total}
          value={formatNumber(queueData.summary.total, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.reviewQueue.unknown}
          value={formatNumber(queueData.summary.unknown, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.reviewQueue.reviewRequired}
          value={formatNumber(queueData.summary.reviewRequired, locale)}
        />
      </div>

      {reviewGroups.length > 0 ? (
        <div className="space-y-7">
          {reviewGroups.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-baseline gap-x-1 text-sm font-semibold text-gray-900">
                    {group.planId ? (
                      <>
                        <span>Review supplement safety for plan</span>
                        <PlanIdLink
                          className="break-all"
                          locale={locale}
                          planId={group.planId}
                        />
                      </>
                    ) : (
                      group.title
                    )}
                  </h3>
                  <p className="mt-0.5 text-xs font-medium text-gray-500">
                    <ReviewGoalAgeTimer
                      createdAt={group.createdAt}
                      locale={locale}
                    />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={classNames(
                      taskPriorityClass(group.priority),
                      "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                    )}
                  >
                    {taskPriorityLabel(group.priority, locale)}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {group.rows.map((row) => (
                  <article
                    key={row.id}
                    className="grid w-full cursor-pointer gap-3 rounded-2xl bg-white px-5 py-3 text-left shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] sm:grid-cols-[8rem_8rem_9rem_minmax(0,1fr)_8rem_7rem] sm:items-center"
                    onClick={() => selectReview(row)}
                    onKeyDown={(event) => {
                      if (
                        event.target instanceof HTMLElement &&
                        event.target.closest("a")
                      ) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectReview(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span
                      className={classNames(
                        taskStatusClass(row.status),
                        "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                      )}
                    >
                      {readableToken(row.status)}
                    </span>
                    <span
                      className={classNames(
                        taskPriorityClass(row.priority),
                        "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                      )}
                    >
                      {taskPriorityLabel(row.priority, locale)}
                    </span>
                    <span className="w-max rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      {reviewScopeLabel(labels, row)}
                    </span>
                    <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900 sm:text-base">
                      {row.supplementName}
                    </h3>
                    {row.planId ? (
                      <span className="truncate text-sm font-semibold text-gray-700">
                        {reviewProposedDose(row, locale)}
                      </span>
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                    {row.planId ? (
                      <PlanIdLink
                        className="truncate text-sm sm:justify-self-end"
                        compact={true}
                        locale={locale}
                        planId={row.planId}
                        stopPropagation={true}
                      />
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.reviewQueue.empty}
        </div>
      )}

      {visibleReview?.row.reviewKind === "unknown_supplement" ? (
        <SupplementDetailsModal
          accessToken={accessToken}
          associatedSupplementId={visibleReview.associatedSupplementId}
          associationOptions={supplementsData.rows}
          draft={visibleReview.draft}
          error={errorReviewId === visibleReview.draft.id}
          headerNote={visibleReview.queuedLabel}
          labels={labels}
          locale={locale}
          onAssociateSupplement={(supplementId) =>
            setSelectedReview((currentReview) =>
              currentReview
                ? {
                    ...currentReview,
                    associatedSupplementId: supplementId
                  }
                : currentReview
            )
          }
          onChange={(patch) =>
            setSelectedReview((currentReview) =>
              currentReview
                ? {
                    ...currentReview,
                    draft: { ...currentReview.draft, ...patch }
                  }
                : currentReview
            )
          }
          onClose={closeReviewModal}
          onSave={() =>
            void saveReview(
              visibleReview.draft,
              visibleReview.associatedSupplementId
            )
          }
          saving={savingReviewId === visibleReview.draft.id}
        />
      ) : visibleReview ? (
        <PlanSafetyReviewModal
          error={errorReviewId === visibleReview.row.id}
          labels={labels}
          locale={locale}
          onClose={closeReviewModal}
          onDecision={(decision, clientDoseAmount, clientDoseUnit, reviewerNote) =>
            void decidePlanReview(
              visibleReview.row,
              decision,
              clientDoseAmount,
              clientDoseUnit,
              reviewerNote
            )
          }
          row={visibleReview.row}
          saving={savingReviewId === visibleReview.row.id}
        />
      ) : null}
    </section>
  );
}

function readableToken(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function taskPriorityLabel(priority: number, locale: Locale) {
  const labels =
    locale === "th"
      ? ["ต่ำ", "ปกติ", "เร่งด่วน", "สูง", "วิกฤต"]
      : ["Low", "Normal", "Expedited", "High", "Critical"];
  const index = Math.min(Math.max(Math.round(priority), 1), 5) - 1;

  return labels[index];
}

function taskPriorityClass(priority: number) {
  const normalized = Math.min(Math.max(Math.round(priority), 1), 5);

  if (normalized >= 5) {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (normalized === 4) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (normalized === 3) {
    return "bg-sky-50 text-sky-700 ring-sky-100";
  }

  if (normalized === 2) {
    return "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

function taskActorClass(actorType: string) {
  if (actorType === "human") {
    return "bg-violet-50 text-violet-700 ring-violet-100";
  }

  return "bg-cyan-50 text-cyan-700 ring-cyan-100";
}

function taskActorLabel(actorType: string) {
  return actorType === "human" ? "Human" : "Agent";
}

function isReviewTaskType(taskType: string) {
  return [
    "classify_supplement",
    "dose_reduction_notice",
    "review_supplement_for_plan"
  ].includes(taskType);
}

function taskIsTerminal(status: string) {
  return ["cancelled", "completed", "failed", "skipped"].includes(status);
}

function useNowTimer(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [enabled]);

  return now;
}

function TaskAgeTimer({
  locale,
  row
}: Readonly<{
  locale: Locale;
  row: Pick<AdminTaskVisibilityRow, "createdAt" | "status" | "updatedAt">;
}>) {
  const terminal = taskIsTerminal(row.status);
  const now = useNowTimer(!terminal);

  const createdAt = new Date(row.createdAt).getTime();
  const endAt = terminal ? new Date(row.updatedAt).getTime() : now;

  if (!Number.isFinite(createdAt) || endAt === null || !Number.isFinite(endAt)) {
    return "—";
  }

  return formatTaskDuration(endAt - createdAt, locale);
}

function GoalAgeTimer({
  goal,
  locale
}: Readonly<{
  goal: AdminGoalRow;
  locale: Locale;
}>) {
  const terminal = ["cancelled", "failed", "stuck", "succeeded"].includes(
    goal.status
  );
  const now = useNowTimer(!terminal);
  const createdAt = new Date(goal.createdAt).getTime();
  const endAt = terminal ? new Date(goal.lastActivityAt).getTime() : now;

  if (!Number.isFinite(createdAt) || endAt === null || !Number.isFinite(endAt)) {
    return "—";
  }

  return formatTaskDuration(endAt - createdAt, locale);
}

function ReviewGoalAgeTimer({
  createdAt,
  locale
}: Readonly<{
  createdAt: string;
  locale: Locale;
}>) {
  const now = useNowTimer(true);
  const startedAt = new Date(createdAt).getTime();

  if (!Number.isFinite(startedAt)) {
    return "—";
  }

  return formatTaskDuration(now - startedAt, locale);
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

function jsonPreview(value: Record<string, unknown>) {
  const text = JSON.stringify(value, null, 2);

  return text === "{}" ? "" : text;
}

function communicationStatusLabel(
  labels: AdminContent,
  status: AdminCommunicationStatus
) {
  if (status === "no_channel") {
    return labels.communications.noChannel;
  }

  return labels.communications[status];
}

function communicationStatusClass(status: AdminCommunicationStatus) {
  if (status === "failed" || status === "no_channel") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "queued") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "sent" || status === "delivered") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function communicationTitle(row: AdminCommunicationRow) {
  return (
    row.subject ||
    row.taskTitle ||
    row.goalTitle ||
    readableToken(row.messageType)
  );
}

function AdminCommunicationsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminCommunicationsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  return (
    <section className="mt-8 space-y-6">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
          <span className="size-2 rounded-full bg-[#1FA77A]" />
          {labels.goals.live} · {labels.goals.updated}{" "}
          {formatGeneratedAt(data.generatedAt, locale)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <FlowSummaryCard
          label={labels.communications.total}
          value={formatNumber(data.summary.total, locale)}
        />
        <FlowSummaryCard
          label={labels.communications.queued}
          value={formatNumber(data.summary.queued, locale)}
        />
        <FlowSummaryCard
          label={labels.communications.sent}
          value={formatNumber(data.summary.sent, locale)}
        />
        <FlowSummaryCard
          label={labels.communications.delivered}
          value={formatNumber(data.summary.delivered, locale)}
        />
        <FlowSummaryCard
          label={labels.communications.failed}
          value={formatNumber(data.summary.failed, locale)}
        />
        <FlowSummaryCard
          label={labels.communications.noChannel}
          value={formatNumber(data.summary.noChannel, locale)}
        />
      </div>

      {data.rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="divide-y divide-gray-100">
            {data.rows.map((row) => (
              <article key={row.id} className="px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={classNames(
                          communicationStatusClass(row.status),
                          "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                        )}
                      >
                        {communicationStatusLabel(labels, row.status)}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                        {readableToken(row.channelType ?? row.provider ?? "manual")}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-semibold text-gray-900">
                      {communicationTitle(row)}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">
                      {row.body}
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <SupplementListMeta
                        label={labels.communications.time}
                        value={formatGeneratedAt(row.createdAt, locale)}
                      />
                      <SupplementListMeta
                        label={labels.communications.messageType}
                        value={readableToken(row.messageType)}
                      />
                      <SupplementListMeta
                        label={labels.communications.address}
                        value={row.address ?? "—"}
                      />
                      <SupplementListMeta
                        label={labels.communications.plan}
                        value={<PlanIdLink locale={locale} planId={row.planId} />}
                      />
                      <SupplementListMeta
                        label={labels.communications.task}
                        value={row.taskTitle ?? row.taskId ?? "—"}
                      />
                    </div>

                    {row.errorMessage ? (
                      <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                        {row.errorMessage}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.communications.empty}
        </div>
      )}
    </section>
  );
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
                    <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
                      <div className="text-xs font-semibold uppercase tracking-wide text-red-700">
                        {labels.technicalAlerts.rootCause}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-red-900">
                        {row.rootCause}
                      </p>
                    </div>
                    {row.message && row.message !== row.rootCause ? (
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {row.message}
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <SupplementListMeta
                        label={labels.technicalAlerts.time}
                        value={formatGeneratedAt(row.occurredAt, locale)}
                      />
                      <SupplementListMeta
                        label={labels.technicalAlerts.plan}
                        value={<PlanIdLink locale={locale} planId={row.planId} />}
                      />
                      <SupplementListMeta
                        label={labels.technicalAlerts.task}
                        value={row.taskId ?? row.taskType ?? "—"}
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

function goalStatusLabel(labels: AdminContent, status: AdminGoalStatus) {
  if (status === "needs_review") {
    return labels.goals.needsReview;
  }

  return labels.goals[status];
}

function goalStatusClass(status: AdminGoalStatus) {
  if (status === "succeeded") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  if (status === "needs_review" || status === "blocked") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "stuck" || status === "failed") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "cancelled") {
    return "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return "bg-blue-50 text-blue-700 ring-blue-100";
}

function compactId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function planResultsHref(locale: Locale, planId: string) {
  return `/${locale}/assessment/results?plan=${encodeURIComponent(planId)}`;
}

function PlanIdLink({
  className,
  compact = false,
  locale,
  planId,
  stopPropagation = false
}: Readonly<{
  className?: string;
  compact?: boolean;
  locale: Locale;
  planId: string | null | undefined;
  stopPropagation?: boolean;
}>) {
  if (!planId) {
    return "—";
  }

  return (
    <a
      className={classNames(
        "font-semibold text-[#3A7BD5] hover:text-[#2F67B8]",
        className
      )}
      href={planResultsHref(locale, planId)}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      onKeyDown={
        stopPropagation ? (event) => event.stopPropagation() : undefined
      }
      rel="noreferrer"
      target="_blank"
    >
      {compact ? compactId(planId) : planId}
    </a>
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
        {labels.goals.live} · {labels.goals.updated}{" "}
        {formatGeneratedAt(generatedAt, locale)}
      </span>
    </div>
  );
}

function taskStatusClass(status: string) {
  if (status === "completed") {
    return "bg-[#1FA77A]/10 text-[#126B4F] ring-[#1FA77A]/20";
  }

  if (status === "queued") {
    return "bg-sky-50 text-sky-700 ring-sky-100";
  }

  if (status === "reserved" || status === "running") {
    return "bg-blue-50 text-blue-700 ring-blue-100";
  }

  if (
    status === "blocked" ||
    status === "needs_review" ||
    status === "waiting_approval"
  ) {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (status === "failed") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  return "bg-gray-50 text-gray-700 ring-gray-200";
}

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

function CapabilityList({ values }: Readonly<{ values: string[] }>) {
  if (values.length === 0) {
    return <span className="text-gray-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.slice(0, 5).map((value) => (
        <span
          key={value}
          className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
        >
          {readableToken(value)}
        </span>
      ))}
      {values.length > 5 ? (
        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
          +{values.length - 5}
        </span>
      ) : null}
    </div>
  );
}

function AdminVisibilityView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminTaskVisibilityData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [selectedTask, setSelectedTask] =
    useState<AdminTaskVisibilityRow | null>(null);

  return (
    <section className="mt-8 space-y-6">
      <LiveUpdatedBadge
        generatedAt={data.generatedAt}
        labels={labels}
        locale={locale}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <FlowSummaryCard
          compact={true}
          label={labels.visibility.total}
          value={formatNumber(data.summary.total, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.visibility.queued}
          value={formatNumber(data.summary.queued, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.visibility.active}
          value={formatNumber(data.summary.active, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.visibility.human}
          value={formatNumber(data.summary.human, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.visibility.blocked}
          value={formatNumber(data.summary.blocked, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.visibility.failed}
          value={formatNumber(data.summary.failed, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.visibility.completed}
          value={formatNumber(data.summary.completed, locale)}
        />
      </div>

      {data.rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="divide-y divide-gray-100">
            {data.rows.map((row) => (
              <VisibilityTaskRow
                key={row.id}
                labels={labels}
                locale={locale}
                onClick={() => setSelectedTask(row)}
                row={row}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.visibility.empty}
        </div>
      )}

      {selectedTask ? (
        <VisibilityTaskDetailsModal
          labels={labels}
          locale={locale}
          onClose={() => setSelectedTask(null)}
          row={selectedTask}
        />
      ) : null}
    </section>
  );
}

function VisibilityTaskRow({
  labels,
  locale,
  onClick,
  row
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  onClick: () => void;
  row: AdminTaskVisibilityRow;
}>) {
  return (
    <button
      aria-label={`${labels.supplements.details}: ${row.title}`}
      className="block w-full px-5 py-3 text-left transition hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1FA77A]"
      onClick={onClick}
      type="button"
    >
      <div className="grid gap-3 sm:grid-cols-[9rem_8rem_8rem_minmax(0,1fr)_7rem] sm:items-center">
        <span
          className={classNames(
            taskStatusClass(row.status),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          )}
        >
          {readableToken(row.status)}
        </span>
        <span
          className={classNames(
            taskPriorityClass(row.goalPriority),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          )}
        >
          {taskPriorityLabel(row.goalPriority, locale)}
        </span>
        <span
          className={classNames(
            taskActorClass(row.actorType),
            "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          )}
        >
          {taskActorLabel(row.actorType)}
        </span>
        <h2 className="min-w-0 truncate text-sm font-semibold text-gray-900 sm:text-base">
          {row.title}
        </h2>
        <span className="text-sm font-semibold tabular-nums text-gray-500 sm:justify-self-end">
          <TaskAgeTimer locale={locale} row={row} />
        </span>
      </div>
    </button>
  );
}

function VisibilityTaskDetailsModal({
  labels,
  locale,
  onClose,
  row
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  row: AdminTaskVisibilityRow;
}>) {
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
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={classNames(
                    taskStatusClass(row.status),
                    "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {readableToken(row.status)}
                </span>
                <span
                  className={classNames(
                    taskPriorityClass(row.goalPriority),
                    "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {taskPriorityLabel(row.goalPriority, locale)}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-gray-900">
                {row.title}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {readableToken(row.taskType)} · {compactId(row.id)}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <SupplementListMeta
                label={labels.visibility.goal}
                value={row.goalTitle}
              />
              <SupplementListMeta
                label={labels.visibility.actor}
                value={readableToken(row.actorType)}
              />
              <SupplementListMeta
                label={labels.visibility.worker}
                value={row.agentName ?? "—"}
              />
              <SupplementListMeta
                label={labels.visibility.task}
                value={taskPriorityLabel(row.priority, locale)}
              />
              <SupplementListMeta
                label={labels.visibility.status}
                value={`${row.attempts}/${row.maxAttempts}`}
              />
              <SupplementListMeta
                label={labels.visibility.blocked}
                value={formatNumber(row.blockedDependencyCount, locale)}
              />
              <SupplementListMeta
                label={labels.goals.lastActivity}
                value={formatGeneratedAt(row.updatedAt, locale)}
              />
              <SupplementListMeta
                label={labels.generated}
                value={formatGeneratedAt(row.createdAt, locale)}
              />
              <SupplementListMeta
                label="Scheduled"
                value={formatGeneratedAt(row.scheduledFor, locale)}
              />
              <SupplementListMeta
                label="Lease"
                value={
                  row.leaseUntil ? formatGeneratedAt(row.leaseUntil, locale) : "—"
                }
              />
              <SupplementListMeta
                label="Plan"
                value={
                  <PlanIdLink
                    compact={true}
                    locale={locale}
                    planId={row.planId}
                  />
                }
              />
              <SupplementListMeta
                label="Ray"
                value={row.ray ? compactId(row.ray) : "—"}
              />
              <SupplementListMeta
                label="Reasoning"
                value={readableToken(row.reasoningEffort)}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                {labels.visibility.capabilities}
              </p>
              <CapabilityList values={row.requiredCapabilities} />
            </div>

            {row.errorMessage ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                {row.errorMessage}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminAgentsView({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminAgentsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  return (
    <section className="mt-8 space-y-6">
      <LiveUpdatedBadge
        generatedAt={data.generatedAt}
        labels={labels}
        locale={locale}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <FlowSummaryCard
          compact={true}
          label={labels.agents.total}
          value={formatNumber(data.summary.total, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.agents.working}
          value={formatNumber(data.summary.working, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.agents.active}
          value={formatNumber(data.summary.active, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.agents.offline}
          value={formatNumber(data.summary.offline, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.agents.paused}
          value={formatNumber(data.summary.paused, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.agents.retired}
          value={formatNumber(data.summary.retired, locale)}
        />
      </div>

      {data.rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.rows.map((row) => (
            <AgentCard key={row.id} labels={labels} locale={locale} row={row} />
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

function AgentCard({
  labels,
  locale,
  row
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  row: AdminAgentRow;
}>) {
  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-900">
            {row.name}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {readableToken(row.type)} · {compactId(row.id)}
          </p>
        </div>
        <span
          className={classNames(
            agentStatusClass(row.status),
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
          )}
        >
          {readableToken(row.status)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SupplementListMeta
          label={labels.agents.currentTask}
          value={row.activeTaskTitle ?? row.activeTaskId ?? "—"}
        />
        <SupplementListMeta
          label={labels.agents.model}
          value={row.model ?? "—"}
        />
        <SupplementListMeta
          label={labels.agents.successRate}
          value={
            row.successRate === null
              ? "—"
              : formatPercent(row.successRate * 100, locale)
          }
        />
        <SupplementListMeta
          label={labels.agents.failureRate}
          value={
            row.failureRate === null
              ? "—"
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
          value={row.lastSeenAt ? formatGeneratedAt(row.lastSeenAt, locale) : "—"}
        />
        <SupplementListMeta
          label={labels.agents.working}
          value={formatNumber(row.activeTaskCount, locale)}
        />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
          {labels.agents.capabilities}
        </p>
        <CapabilityList values={row.capabilities} />
      </div>
    </article>
  );
}

function AdminGoalsView({
  accessToken,
  data,
  filters,
  labels,
  locale,
  range
}: Readonly<{
  accessToken: string;
  data: AdminGoalsData;
  filters: AdminDashboardFilters;
  labels: AdminContent;
  locale: Locale;
  range: AdminDashboardRange;
}>) {
  const selectedGoal = data.selectedGoal;

  return (
    <section className="mt-8 space-y-6">
      <LiveUpdatedBadge
        generatedAt={data.generatedAt}
        labels={labels}
        locale={locale}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <FlowSummaryCard
          compact={true}
          label={labels.goals.total}
          value={formatNumber(data.summary.total, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.goals.processing}
          value={formatNumber(data.summary.processing, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.goals.needsReview}
          value={formatNumber(data.summary.needsReview, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.goals.blocked}
          value={formatNumber(data.summary.blocked, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.goals.stuck}
          value={formatNumber(data.summary.stuck, locale)}
        />
        <FlowSummaryCard
          compact={true}
          label={labels.goals.succeeded}
          value={formatNumber(data.summary.succeeded, locale)}
        />
      </div>

      {data.rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.55fr)]">
          <div className="space-y-3">
            {data.rows.map((goal) => (
              <a
                key={goal.id}
                aria-current={goal.id === data.selectedGoalId ? "page" : undefined}
                className={classNames(
                  goal.id === data.selectedGoalId
                    ? "ring-[#1FA77A]"
                    : "ring-gray-200 hover:bg-gray-50",
                  "block rounded-2xl bg-white p-4 shadow-sm ring-1 transition"
                )}
                href={adminGoalHref({
                  accessToken,
                  filters,
                  goalId: goal.id,
                  locale,
                  range
                })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-gray-900">
                      {goal.title}
                    </h2>
                    <p className="mt-1 text-xs font-medium text-gray-500">
                      {compactId(goal.id)}
                    </p>
                  </div>
                  <span
                    className={classNames(
                      taskPriorityClass(goal.priority),
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                    )}
                  >
                    {taskPriorityLabel(goal.priority, locale)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <SupplementListMeta
                    label={labels.goals.tasks}
                    value={`${formatNumber(goal.completedTaskCount, locale)} / ${formatNumber(goal.taskCount, locale)}`}
                  />
                  <SupplementListMeta
                    label={labels.goals.age}
                    value={<GoalAgeTimer goal={goal} locale={locale} />}
                  />
                </div>
              </a>
            ))}
          </div>

          <GoalDetailPanel
            accessToken={accessToken}
            data={data}
            filters={filters}
            goal={selectedGoal}
            labels={labels}
            locale={locale}
            range={range}
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.goals.empty}
        </div>
      )}
    </section>
  );
}

function GoalDetailPanel({
  accessToken,
  data,
  filters,
  goal,
  labels,
  locale,
  range
}: Readonly<{
  accessToken: string;
  data: AdminGoalsData;
  filters: AdminDashboardFilters;
  goal: AdminGoalRow | null;
  labels: AdminContent;
  locale: Locale;
  range: AdminDashboardRange;
}>) {
  if (!goal) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
        {labels.goals.noSelection}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span
              className={classNames(
                goalStatusClass(goal.status),
                "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
              )}
            >
              {goalStatusLabel(labels, goal.status)}
            </span>
            <h2 className="mt-3 text-xl font-semibold text-gray-900">
              {goal.title}
            </h2>
            <p className="mt-1 text-sm">
              <PlanIdLink locale={locale} planId={goal.planId} />
            </p>
          </div>
          <div
            className={classNames(
              taskPriorityClass(goal.priority),
              "shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1"
            )}
          >
            {taskPriorityLabel(goal.priority, locale)}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SupplementListMeta
            label={labels.goals.trace}
            value={goal.ray ?? "—"}
          />
          <SupplementListMeta
            label={labels.goals.source}
            value={goal.source ?? "—"}
          />
          <SupplementListMeta
            label={labels.goals.lastActivity}
            value={formatGeneratedAt(goal.lastActivityAt, locale)}
          />
        </div>
      </section>

      <GoalDetailSection
        count={data.tasks.length}
        defaultOpen={true}
        locale={locale}
        title={labels.goals.tasks}
      >
        <div className="space-y-3">
          {data.tasks.map((task) => {
            const reviewTaskIsOpen =
              isReviewTaskType(task.taskType) && !taskIsTerminal(task.status);
            const reviewHref = reviewTaskIsOpen
              ? adminReviewTaskHref({
                  accessToken,
                  filters,
                  locale,
                  range,
                  reviewTaskId: task.id
                })
              : null;

            return (
              <article
                key={task.id}
                className="rounded-xl bg-white p-4 ring-1 ring-gray-200"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-gray-900">
                      {reviewHref ? (
                        <a
                          className="text-[#1FA77A] underline-offset-2 hover:underline"
                          href={reviewHref}
                        >
                          {task.title}
                        </a>
                      ) : (
                        task.title
                      )}
                    </h3>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <span
                      className={classNames(
                        taskActorClass(task.actorType),
                        "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                      )}
                    >
                      {taskActorLabel(task.actorType)}
                    </span>
                    <span
                      className={classNames(
                        taskStatusClass(task.status),
                        "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                      )}
                    >
                      {readableToken(task.status)}
                    </span>
                  </div>
                </div>
                {task.errorMessage ? (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-100">
                    {task.errorMessage}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </GoalDetailSection>

      <GoalEventsSection data={data} labels={labels} locale={locale} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <GoalDetailCompactList
          empty="—"
          items={data.dependencies.map(
            (item) =>
              `${compactId(item.taskId)} → ${compactId(item.dependsOnTaskId)} · ${readableToken(item.dependencyType)}`
          )}
          title={labels.goals.dependencies}
        />
        <GoalDetailCompactList
          empty="—"
          items={data.reservations.map(
            (item) =>
              `${item.agentName ?? "Agent"} · ${readableToken(item.status)} · ${formatGeneratedAt(item.reservedAt, locale)}`
          )}
          title={labels.goals.reservations}
        />
        <GoalDetailCompactList
          empty="—"
          items={data.approvals.map(
            (item) =>
              `${readableToken(item.approvalType)} · ${readableToken(item.status)} · ${formatGeneratedAt(item.requestedAt, locale)}`
          )}
          title={labels.goals.approvals}
        />
      </div>
    </div>
  );
}

function GoalEventsSection({
  data,
  labels,
  locale
}: Readonly<{
  data: AdminGoalsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [open, setOpen] = useState(false);
  const timelineItems = [...data.events, ...data.comments]
    .sort((left, right) => {
      const leftDate = "occurredAt" in left ? left.occurredAt : left.createdAt;
      const rightDate =
        "occurredAt" in right ? right.occurredAt : right.createdAt;

      return new Date(rightDate).getTime() - new Date(leftDate).getTime();
    })
    .slice(0, 30);

  return (
    <section>
      <button
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
          {labels.goals.events}
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          {formatNumber(timelineItems.length, locale)}
          <ChevronDownIcon
            aria-hidden={true}
            className={classNames(
              "size-4 transition-transform",
              open ? "rotate-180" : ""
            )}
          />
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          {timelineItems.map((item) =>
            "occurredAt" in item ? (
              <TimelineItem
                key={`event:${item.id}`}
                eyebrow={`${readableToken(item.eventStatus)} · ${item.agentName ?? "System"}`}
                title={readableToken(item.eventType)}
                time={formatGeneratedAt(item.occurredAt, locale)}
              />
            ) : (
              <TimelineItem
                key={`comment:${item.id}`}
                eyebrow={`${readableToken(item.commentType)} · ${item.authorName ?? readableToken(item.authorType)}`}
                title={item.body}
                time={formatGeneratedAt(item.createdAt, locale)}
              />
            )
          )}
        </div>
      ) : null}
    </section>
  );
}

function GoalDetailSection({
  children,
  count,
  defaultOpen = false,
  locale,
  title
}: Readonly<{
  children: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  locale?: Locale;
  title: string;
}>) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
          {title}
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          {typeof count === "number" && locale
            ? formatNumber(count, locale)
            : null}
          <ChevronDownIcon
            aria-hidden={true}
            className={classNames(
              "size-4 transition-transform",
              open ? "rotate-180" : ""
            )}
          />
        </span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

function TimelineItem({
  eyebrow,
  time,
  title
}: Readonly<{
  eyebrow: string;
  time: string;
  title: string;
}>) {
  return (
    <article className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {eyebrow}
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{title}</p>
        </div>
        <p className="shrink-0 text-xs font-medium text-gray-500">{time}</p>
      </div>
    </article>
  );
}

function GoalDetailCompactList({
  empty,
  items,
  title
}: Readonly<{
  empty: string;
  items: string[];
  title: string;
}>) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
        {title}
      </h2>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.slice(0, 6).map((item) => (
            <p
              className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-gray-100"
              key={item}
            >
              {item}
            </p>
          ))
        ) : (
          <p className="text-sm font-medium text-gray-400">{empty}</p>
        )}
      </div>
    </section>
  );
}

function FlowSummaryCard({
  compact = false,
  label,
  value
}: Readonly<{
  compact?: boolean;
  label: string;
  value: string;
}>) {
  return (
    <div
      className={classNames(
        "rounded-2xl bg-white shadow-sm ring-1 ring-gray-200",
        compact ? "p-3" : "p-5"
      )}
    >
      <p
        className={classNames(
          "font-semibold text-gray-500",
          compact ? "text-xs" : "text-sm"
        )}
      >
        {label}
      </p>
      <p
        className={classNames(
          "font-semibold tracking-tight text-[#20343A]",
          compact ? "mt-1 text-xl" : "mt-3 text-3xl"
        )}
      >
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
      <div className="mt-8">
        <BusinessFunnelTable flowData={flowData} labels={labels} locale={locale} />
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
  agentsData,
  communicationsData,
  data,
  flowData,
  goalsData,
  reviewQueueData,
  supplementsData,
  visibilityData,
  view
}: Readonly<{
  alertsData: AdminTechnicalAlertsData;
  agentsData: AdminAgentsData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  flowData: AdminFlowData;
  goalsData: AdminGoalsData;
  reviewQueueData: AdminReviewQueueData;
  supplementsData: AdminSupplementsData;
  visibilityData: AdminTaskVisibilityData;
  view: AdminDashboardView;
}>) {
  if (view === "glance") {
    return (
      alertsData.databaseAvailable &&
      communicationsData.databaseAvailable &&
      data.databaseAvailable &&
      flowData.databaseAvailable &&
      reviewQueueData.databaseAvailable
    );
  }

  if (view === "agents") {
    return agentsData.databaseAvailable;
  }

  if (view === "alerts") {
    return alertsData.databaseAvailable;
  }

  if (view === "communications") {
    return communicationsData.databaseAvailable;
  }

  if (view === "flow") {
    return flowData.databaseAvailable;
  }

  if (view === "goals") {
    return goalsData.databaseAvailable;
  }

  if (view === "reviews") {
    return reviewQueueData.databaseAvailable;
  }

  if (view === "supplements") {
    return supplementsData.databaseAvailable;
  }

  if (view === "visibility") {
    return visibilityData.databaseAvailable;
  }

  return data.databaseAvailable;
}

export function AdminDashboard({
  accessToken,
  alertsData,
  agentsData,
  communicationsData,
  data,
  filters,
  flowData,
  goalsData,
  locale,
  reviewQueueData,
  selectedReviewTaskId,
  supplementsData,
  visibilityData,
  view
}: Readonly<{
  accessToken: string;
  alertsData: AdminTechnicalAlertsData;
  agentsData: AdminAgentsData;
  communicationsData: AdminCommunicationsData;
  data: AdminDashboardData;
  filters: AdminDashboardFilters;
  flowData: AdminFlowData;
  goalsData: AdminGoalsData;
  locale: Locale;
  reviewQueueData: AdminReviewQueueData;
  selectedReviewTaskId?: string | null;
  supplementsData: AdminSupplementsData;
  visibilityData: AdminTaskVisibilityData;
  view: AdminDashboardView;
}>) {
  const labels = content[locale];
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const goalsStreamKey = `${view}:${data.range}:${goalsData.selectedGoalId ?? ""}`;
  const liveGoalsData = useLiveAdminData({
    enabled: view === "goals" && Boolean(accessToken),
    eventName: "goals",
    href:
      accessToken && view === "goals"
        ? adminGoalsEventsHref({
            accessToken,
            goalId: goalsData.selectedGoalId,
            range: data.range
          })
        : "",
    initialData: goalsData,
    streamKey: goalsStreamKey
  });
  const visibilityStreamKey = `${view}:${data.range}:visibility`;
  const liveVisibilityData = useLiveAdminData({
    enabled: view === "visibility" && Boolean(accessToken),
    eventName: "visibility",
    href:
      accessToken && view === "visibility"
        ? adminExecutionEventsHref({
            accessToken,
            range: data.range,
            view: "visibility"
          })
        : "",
    initialData: visibilityData,
    streamKey: visibilityStreamKey
  });
  const agentsStreamKey = `${view}:${data.range}:agents`;
  const liveAgentsData = useLiveAdminData({
    enabled: view === "agents" && Boolean(accessToken),
    eventName: "agents",
    href:
      accessToken && view === "agents"
        ? adminExecutionEventsHref({
            accessToken,
            range: data.range,
            view: "agents"
          })
        : "",
    initialData: agentsData,
    streamKey: agentsStreamKey
  });

  const databaseAvailable = adminViewDatabaseAvailable({
    alertsData,
    agentsData: liveAgentsData,
    communicationsData,
    data,
    flowData,
    goalsData: liveGoalsData,
    reviewQueueData,
    supplementsData,
    visibilityData: liveVisibilityData,
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
              {view === "glance" || view === "kpi" ? (
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

          {view === "agents" ||
          view === "alerts" ||
          view === "communications" ||
          view === "flow" ||
          view === "glance" ||
          view === "goals" ||
          view === "kpi" ||
          view === "visibility" ? (
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
                {view === "flow" || view === "glance" || view === "kpi" ? (
                  <LocaleFilterSelector
                    accessToken={accessToken}
                    filters={filters}
                    locale={locale}
                    range={data.range}
                    view={view}
                  />
                ) : null}
              </div>

              {view === "flow" || view === "glance" || view === "kpi" ? (
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
          ) : view === "glance" ? (
            <AdminAtAGlanceView
              accessToken={accessToken}
              alertsData={alertsData}
              communicationsData={communicationsData}
              data={data}
              filters={filters}
              flowData={flowData}
              labels={labels}
              locale={locale}
              reviewQueueData={reviewQueueData}
            />
          ) : view === "agents" ? (
            <AdminAgentsView
              data={liveAgentsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "communications" ? (
            <AdminCommunicationsView
              data={communicationsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "goals" ? (
            <AdminGoalsView
              accessToken={accessToken}
              data={liveGoalsData}
              filters={filters}
              labels={labels}
              locale={locale}
              range={data.range}
            />
          ) : view === "alerts" ? (
            <AdminTechnicalAlertsView
              data={alertsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "reviews" ? (
            <AdminReviewQueueView
              accessToken={accessToken}
              data={reviewQueueData}
              labels={labels}
              locale={locale}
              selectedReviewTaskId={selectedReviewTaskId}
              supplementsData={supplementsData}
            />
          ) : view === "supplements" ? (
            <AdminSupplementsView
              accessToken={accessToken}
              data={supplementsData}
              labels={labels}
              locale={locale}
            />
          ) : view === "visibility" ? (
            <AdminVisibilityView
              data={liveVisibilityData}
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
