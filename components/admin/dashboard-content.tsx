import type { ComponentType, SVGProps } from "react";
import {
  BanknotesIcon,
  BeakerIcon,
  ChatBubbleLeftRightIcon,
  CpuChipIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  HomeIcon,
  MegaphoneIcon,
  QueueListIcon,
  ShoppingBagIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { AdminFlowNodeId } from "@/lib/admin-flow-data";
import type { Locale } from "@/lib/i18n";
import type { SupplementSafetyFlag } from "@/lib/supplement-safety-flags";
import type { AdminContentInventoryRow } from "@/lib/admin-query-data";

export type AdminDashboardView =
  | "agents"
  | "alerts"
  | "blogs"
  | "campaigns"
  | "content"
  | "communications"
  | "financials"
  | "foods"
  | "flow"
  | "glance"
  | "leads"
  | "product-insights"
  | "products"
  | "reviews"
  | "supplement-insights"
  | "supplements"
  | "testimonials"
  | "visibility";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;
export type ContentMetricId =
  | "contentBlogPosts"
  | "contentDeleted"
  | "contentDraft"
  | "contentLocaleEn"
  | "contentLocaleTh"
  | "contentPageViews"
  | "contentPublished"
  | "contentScheduled"
  | "contentTestimonials"
  | "contentTotal";
export type ContentEditorType = "blog_post" | "testimonial";
export type ContentEditorState = Readonly<{
  contentType: ContentEditorType;
  row?: AdminContentInventoryRow;
}> | null;
export type ContentEditorForm = Readonly<{
  authorName: string;
  contentMarkdown: string;
  contentType: ContentEditorType;
  excerpt: string;
  imageAlt: string;
  imageUrl: string;
  locale: Locale;
  quote: string;
  slug: string;
  title: string;
}>;
export type TaskMetricId =
  | "tasksActive"
  | "tasksBlocked"
  | "tasksCompleted"
  | "tasksFailed"
  | "tasksHuman"
  | "tasksQueued"
  | "tasksTotal";

export type AdminNavItem = Readonly<{
  current?: boolean;
  href?: string;
  icon: Icon;
  name: string;
  view?: AdminDashboardView;
}>;

export type AdminContent = Readonly<{
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
    retry: string;
    retrying: string;
    sent: string;
    skipped: string;
    status: string;
    task: string;
    time: string;
    total: string;
  };
  contentNavigation: AdminNavItem[];
  contentTitle: string;
  contentPages: {
    actions: string;
    all: string;
    authorName: string;
    blogPosts: string;
    cancel: string;
    contentMarkdown: string;
    created: string;
    deleted: string;
    deleteAction: string;
    draft: string;
    draftAction: string;
    edit: string;
    editorError: string;
    editorRequiredError: string;
    empty: string;
    en: string;
    excerpt: string;
    imageAlt: string;
    imageAltRequired: string;
    imagePreview: string;
    imageUpload: string;
    imageUploadError: string;
    imageUploadHint: string;
    imageUrl: string;
    lastViewed: string;
    locale: string;
    newBlogPost: string;
    newTestimonial: string;
    pageViews: string;
    publishAction: string;
    published: string;
    quote: string;
    save: string;
    saving: string;
    scheduleAction: string;
    scheduled: string;
    scheduledFor: string;
    scheduleError: string;
    slug: string;
    source: string;
    status: string;
    testimonials: string;
    th: string;
    title: string;
    total: string;
    type: string;
    uploadingImage: string;
    updateError: string;
    updated: string;
    views: string;
  };
  agents: {
    active: string;
    capabilities: string;
    completed: string;
    currentTask: string;
    empty: string;
    failed: string;
    failureRate: string;
    heartbeat: string;
    humanQueue: string;
    lastSeen: string;
    model: string;
    offline: string;
    paused: string;
    retired: string;
    sessions: string;
    status: string;
    successRate: string;
    total: string;
    type: string;
    undeployed: string;
    working: string;
  };
  generated: string;
  financials: {
    aiCost: string;
    amount: string;
    billingPeriod: string;
    category: string;
    description: string;
    details: string;
    empty: string;
    entryType: string;
    from: string;
    hostingCost: string;
    product: string;
    project: string;
    provider: string;
    providerDescription: string;
    region: string;
    resource: string;
    resourceType: string;
    source: string;
    task: string;
    time: string;
    to: string;
    totalCost: string;
    transactions: string;
    usd: string;
  };
  atAGlance: {
    assessmentCompletions: string;
    assessmentStarts: string;
    attentionClear: string;
    attentionTitle: string;
    conversion: string;
    conversionSnapshot: string;
    count: string;
    cancel: string;
    criticalAlerts: string;
    customerContactIssues: string;
    deviation: string;
    dropoff: string;
    editTargets: string;
    freeRequests: string;
    healthScoreViews: string;
    landingVisitors: string;
    pendingReviews: string;
    precisionConversions: string;
    proConversions: string;
    saveTargets: string;
    targetSaveError: string;
    stage: string;
    target: string;
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
  marketingPages: {
    affiliate: string;
    assessmentCompletions: string;
    assessmentStarts: string;
    campaign: string;
    campaignId: string;
    communicationIssues: string;
    currentStage: string;
    emptyCampaigns: string;
    emptyLeads: string;
    events: string;
    firstSeen: string;
    freeRequests: string;
    groupedBy: string;
    healthScoreViews: string;
    identifiers: string;
    interactionThread: string;
    landed: string;
    lastEvent: string;
    lastSeen: string;
    lead: string;
    emailHash: string;
    locale: string;
    medium: string;
    noLeadEvents: string;
    pendingReviews: string;
    plan: string;
    ray: string;
    precisionConversions: string;
    proConversions: string;
    promoCode: string;
    source: string;
    totalLeads: string;
  };
  execution: AdminNavItem[];
  executionTitle: string;
  governance: AdminNavItem[];
  governanceTitle: string;
  insights: AdminNavItem[];
  insightsTitle: string;
  marketing: AdminNavItem[];
  marketingTitle: string;
  openSidebar: string;
  pageTitles: Record<AdminDashboardView, string>;
  performance: AdminNavItem[];
  performanceTitle: string;
  ranges: Record<AdminDashboardRange, string>;
  reviewQueue: {
    approve: string;
    clientDose: string;
    disapprove: string;
    doseReduced: string;
    empty: string;
    flagReason: string;
    foodFrequency: string;
    foodRationale: string;
    foodServing: string;
    highValue: string;
    lowValue: string;
    mediumValue: string;
    newDose: string;
    originalDose: string;
    plan: string;
    planLink: string;
    planReview: string;
    productReview: string;
    queued: string;
    doseUnverified: string;
    foodReview: string;
    supplementReview: string;
    reviewerNote: string;
    reviewRequired: string;
    suggestFoodReview: string;
    suggestFoodReviewBusy: string;
    suggestFoodReviewError: string;
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
    human: string;
    queued: string;
    status: string;
    task: string;
    total: string;
    agent: string;
  };
  supplements: {
    active: string;
    allCategories: string;
    allStatuses: string;
    addSupplement: string;
    blocked: string;
    category: string;
    confidence: string;
    close: string;
    create: string;
    createError: string;
    details: string;
    dose: string;
    empty: string;
    maxAmount: string;
    maxUnit: string;
    name: string;
    newSupplement: string;
    newSupplementHint: string;
    none: string;
    safetyFlag: string;
    safetyFlagOptions: Record<SupplementSafetyFlag, string>;
    safetyNotes: string;
    associateExisting: string;
    associations: string;
    associationHint: string;
    associatedWith: string;
    clearAssociation: string;
    addAssociation: string;
    associationPlaceholder: string;
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
  };
  title: string;
}>;

export const rangeOrder: AdminDashboardRange[] = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "all"
];
export const supplementDoseSuggestionTimeoutMs = 45_000;
export const foodReviewSuggestionTimeoutMs = 45_000;

export const content = {
  en: {
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
      noChannel: "Awaiting channel",
      plan: "Plan",
      provider: "Provider",
      queued: "Queued",
      retry: "Retry",
      retrying: "Retrying...",
      sent: "Sent",
      skipped: "Skipped",
      status: "Status",
      task: "Task",
      time: "Time",
      total: "Total"
    },
    contentPages: {
      actions: "Actions",
      all: "All",
      authorName: "Author name",
      blogPosts: "Blog posts",
      cancel: "Cancel",
      contentMarkdown: "Markdown",
      created: "Created",
      deleted: "Deleted",
      deleteAction: "Delete",
      draft: "Draft",
      draftAction: "Draft",
      edit: "Edit",
      editorError: "Could not save this content item.",
      editorRequiredError: "Fill in the required fields before saving.",
      empty: "No content matches this view.",
      en: "EN",
      excerpt: "Excerpt",
      imageAlt: "Image alt text",
      imageAltRequired: "Add image alt text before saving.",
      imagePreview: "Image preview",
      imageUpload: "Upload image",
      imageUploadError: "Could not upload this image.",
      imageUploadHint: "JPG, PNG, WebP or GIF, up to 6 MB.",
      imageUrl: "Image URL",
      lastViewed: "Last viewed",
      locale: "Locale",
      newBlogPost: "New blog post",
      newTestimonial: "New testimonial",
      pageViews: "Page views",
      publishAction: "Publish",
      published: "Published",
      quote: "Quote",
      save: "Save",
      saving: "Saving...",
      scheduleAction: "Schedule",
      scheduled: "Scheduled",
      scheduledFor: "Scheduled for",
      scheduleError: "Choose a future publish date.",
      slug: "Slug",
      source: "Source",
      status: "Status",
      testimonials: "Testimonials",
      th: "TH",
      title: "Title",
      total: "Total",
      type: "Type",
      uploadingImage: "Uploading...",
      updateError: "Could not update this content item.",
      updated: "Updated",
      views: "Views"
    },
    agents: {
      active: "Active",
      capabilities: "Capabilities",
      completed: "Completed",
      currentTask: "Current task",
      empty: "No agents have registered yet.",
      failed: "Failed",
      failureRate: "Failure",
      heartbeat: "Worker heartbeat received",
      humanQueue: "Human review queue",
      lastSeen: "Last seen",
      model: "Model",
      offline: "Offline",
      paused: "Paused",
      retired: "Retired",
      sessions: "Sessions",
      status: "Status",
      successRate: "Success",
      total: "Total",
      type: "Type",
      undeployed: "Undeployed",
      working: "Working"
    },
    generated: "Generated",
    financials: {
      aiCost: "AI cost",
      amount: "Amount",
      billingPeriod: "Billing period",
      category: "Category",
      description: "Description",
      details: "Details",
      empty: "No cost entries in this timeframe.",
      entryType: "Basis",
      from: "Cost center",
      hostingCost: "Hosting cost",
      product: "Product",
      project: "Project",
      provider: "Provider",
      providerDescription: "Provider detail",
      region: "Region",
      resource: "Resource",
      resourceType: "Resource type",
      source: "Source",
      task: "Task",
      time: "Time",
      to: "Provider",
      totalCost: "Total cost",
      transactions: "Cost entries",
      usd: "USD"
    },
    atAGlance: {
      assessmentCompletions: "Assessment completions",
      assessmentStarts: "Assessment starts",
      attentionClear: "Nothing urgent right now.",
      attentionTitle: "Attention required",
      cancel: "Cancel",
      conversion: "Conversion",
      conversionSnapshot: "Conversion snapshot",
      count: "Count",
      criticalAlerts: "Site issues needing attention",
      customerContactIssues: "Customer contact issues",
      deviation: "Actual vs target",
      dropoff: "Drop-off",
      editTargets: "Edit targets",
      freeRequests: "Free requests",
      healthScoreViews: "HealthScore views",
      landingVisitors: "Landed visitors",
      pendingReviews: "Pending reviews",
      precisionConversions: "Precision conversions",
      proConversions: "Pro conversions",
      saveTargets: "Save targets",
      stage: "Stage",
      target: "Target",
      targetSaveError: "Could not save targets."
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
    flowTitle: "Conversions",
    marketingPages: {
      affiliate: "Affiliate",
      assessmentCompletions: "Completed",
      assessmentStarts: "Started",
      campaign: "Campaign",
      campaignId: "Campaign ID",
      communicationIssues: "Contact issues",
      currentStage: "Stage",
      emptyCampaigns: "No campaign traffic in this timeframe.",
      emptyLeads: "No leads in this timeframe.",
      events: "Events",
      firstSeen: "First seen",
      freeRequests: "Free",
      groupedBy: "Grouped by",
      healthScoreViews: "HealthScore",
      identifiers: "Identifiers",
      interactionThread: "Interaction thread",
      landed: "Landed",
      lastEvent: "Last action",
      lastSeen: "Last seen",
      lead: "Lead",
      emailHash: "Email hash",
      locale: "Locale",
      medium: "Medium",
      noLeadEvents: "No interaction events are available for this lead.",
      pendingReviews: "Reviews",
      plan: "Plan",
      precisionConversions: "Precision",
      proConversions: "Pro",
      promoCode: "Promo",
      ray: "Ray",
      source: "Source",
      totalLeads: "Leads"
    },
    performance: [
      { icon: HomeIcon, name: "Dashboard", view: "glance" },
      { icon: FunnelIcon, name: "Conversions", view: "flow" },
      { icon: BanknotesIcon, name: "Financials", view: "financials" }
    ],
    performanceTitle: "Performance",
    marketing: [
      { icon: MegaphoneIcon, name: "Campaigns", view: "campaigns" },
      { icon: EnvelopeIcon, name: "Leads", view: "leads" },
      {
        icon: ChatBubbleLeftRightIcon,
        name: "Communications",
        view: "communications"
      }
    ],
    marketingTitle: "Marketing",
    contentNavigation: [
      { icon: DocumentTextIcon, name: "Blogs", view: "blogs" },
      { icon: SparklesIcon, name: "Testimonials", view: "testimonials" }
    ],
    contentTitle: "Content",
    governance: [
      { icon: SparklesIcon, name: "Foods", view: "foods" },
      { icon: ShoppingBagIcon, name: "Products", view: "products" },
      { icon: BeakerIcon, name: "Supplements", view: "supplements" }
    ],
    governanceTitle: "Safety",
    insights: [
      { icon: BeakerIcon, name: "Supplements", view: "supplement-insights" },
      { icon: ShoppingBagIcon, name: "Products", view: "product-insights" }
    ],
    insightsTitle: "Insights",
    openSidebar: "Open sidebar",
    execution: [
      { icon: ExclamationTriangleIcon, name: "Reviews", view: "reviews" },
      { icon: QueueListIcon, name: "Tasks", view: "visibility" },
      { icon: CpuChipIcon, name: "Agents", view: "agents" },
      { icon: ExclamationTriangleIcon, name: "Alerts", view: "alerts" }
    ],
    executionTitle: "Execution",
    pageTitles: {
      agents: "Agents",
      alerts: "Technical Alerts",
      blogs: "Blogs",
      campaigns: "Campaigns",
      content: "Content",
      communications: "Communications",
      financials: "Financials",
      foods: "Foods",
      flow: "Conversions",
      glance: "Dashboard",
      leads: "Leads",
      "product-insights": "Product Insights",
      products: "Products",
      reviews: "Reviews",
      "supplement-insights": "Supplement Insights",
      supplements: "Supplements",
      testimonials: "Testimonials",
      visibility: "Tasks"
    },
    ranges: {
      all: "All",
      day: "Day",
      hour: "Hour",
      month: "Month",
      week: "Week",
      year: "Year"
    },
    reviewQueue: {
      approve: "Approve",
      clientDose: "Client dose",
      disapprove: "Disapprove",
      doseReduced: "Dose reduced",
      empty: "No supplement review tasks are waiting.",
      flagReason: "Review reason",
      foodFrequency: "Frequency",
      foodRationale: "Rationale",
      foodServing: "Serving",
      highValue: "High Value",
      lowValue: "Low Value",
      mediumValue: "Medium Value",
      newDose: "New dose",
      originalDose: "Original dose",
      plan: "Plan",
      planLink: "Open plan",
      planReview: "Plan review",
      productReview: "Product review",
      queued: "Queued",
      doseUnverified: "Dose unverified",
      foodReview: "Food review",
      supplementReview: "Supplement review",
      reviewerNote: "Reviewer note",
      reviewRequired: "Review required",
      suggestFoodReview: "Suggest food details with AI",
      suggestFoodReviewBusy: "AI is drafting food details...",
      suggestFoodReviewError: "Could not suggest food details.",
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
      active: "Processing",
      actor: "Actor",
      blocked: "Blocked",
      capabilities: "Capabilities",
      completed: "Completed",
      empty: "No tasks are visible in this timeframe.",
      failed: "Failed",
      human: "Human",
      queued: "Queued",
      status: "Status",
      task: "Task",
      total: "Total",
      agent: "Agent"
    },
    supplements: {
      active: "Active",
      allCategories: "All categories",
      allStatuses: "All statuses",
      addSupplement: "Add supplement",
      blocked: "Blocked",
      category: "Category",
      confidence: "Confidence",
      close: "Close",
      create: "Create",
      createError: "Could not create this supplement.",
      details: "Details",
      dose: "Max dose",
      empty: "No supplements match these filters.",
      maxAmount: "Amount",
      maxUnit: "Unit",
      name: "Name",
      newSupplement: "New supplement",
      newSupplementHint:
        "Create the canonical supplement, then add dose, safety notes and associations.",
      none: "None",
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
      addAssociation: "Add",
      associationPlaceholder: "Add another name",
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
        "Enter a positive amount and unit for active supplements."
    },
    title: "Performance"
  },
  th: {
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
      noChannel: "รอช่องทางติดต่อ",
      plan: "แผน",
      provider: "Provider",
      queued: "รอส่ง",
      retry: "ลองอีกครั้ง",
      retrying: "กำลังลองอีกครั้ง...",
      sent: "ส่งแล้ว",
      skipped: "ข้าม",
      status: "สถานะ",
      task: "งาน",
      time: "เวลา",
      total: "ทั้งหมด"
    },
    contentPages: {
      actions: "การดำเนินการ",
      all: "ทั้งหมด",
      authorName: "ชื่อผู้เขียน",
      blogPosts: "บทความ",
      cancel: "ยกเลิก",
      contentMarkdown: "Markdown",
      created: "สร้างเมื่อ",
      deleted: "ลบแล้ว",
      deleteAction: "ลบ",
      draft: "ฉบับร่าง",
      draftAction: "ฉบับร่าง",
      edit: "แก้ไข",
      editorError: "ไม่สามารถบันทึกคอนเทนต์นี้ได้",
      editorRequiredError: "กรอกข้อมูลที่จำเป็นก่อนบันทึก",
      empty: "ไม่มีคอนเทนต์ที่ตรงกับมุมมองนี้",
      en: "EN",
      excerpt: "สรุป",
      imageAlt: "คำอธิบายรูปภาพ",
      imageAltRequired: "เพิ่มคำอธิบายรูปภาพก่อนบันทึก",
      imagePreview: "ตัวอย่างรูปภาพ",
      imageUpload: "อัปโหลดรูปภาพ",
      imageUploadError: "ไม่สามารถอัปโหลดรูปภาพนี้ได้",
      imageUploadHint: "JPG, PNG, WebP หรือ GIF ขนาดไม่เกิน 6 MB",
      imageUrl: "URL รูปภาพ",
      lastViewed: "ดูล่าสุด",
      locale: "ภาษา",
      newBlogPost: "บทความใหม่",
      newTestimonial: "คำรับรองใหม่",
      pageViews: "ยอดดูหน้า",
      publishAction: "เผยแพร่",
      published: "เผยแพร่แล้ว",
      quote: "คำรับรอง",
      save: "บันทึก",
      saving: "กำลังบันทึก...",
      scheduleAction: "ตั้งเวลา",
      scheduled: "ตั้งเวลาแล้ว",
      scheduledFor: "ตั้งเวลา",
      scheduleError: "เลือกเวลาเผยแพร่ในอนาคต",
      slug: "Slug",
      source: "แหล่งที่มา",
      status: "สถานะ",
      testimonials: "คำรับรอง",
      th: "TH",
      title: "ชื่อ",
      total: "ทั้งหมด",
      type: "ประเภท",
      uploadingImage: "กำลังอัปโหลด...",
      updateError: "ไม่สามารถอัปเดตคอนเทนต์นี้ได้",
      updated: "อัปเดต",
      views: "ยอดดู"
    },
    agents: {
      active: "ใช้งาน",
      capabilities: "ความสามารถ",
      completed: "สำเร็จ",
      currentTask: "งานปัจจุบัน",
      empty: "ยังไม่มี agent ลงทะเบียน",
      failed: "ล้มเหลว",
      failureRate: "ล้มเหลว",
      heartbeat: "ได้รับ heartbeat จาก worker",
      humanQueue: "คิวตรวจโดยคน",
      lastSeen: "พบล่าสุด",
      model: "โมเดล",
      offline: "ออฟไลน์",
      paused: "พัก",
      retired: "เลิกใช้",
      sessions: "เซสชัน",
      status: "สถานะ",
      successRate: "สำเร็จ",
      total: "ทั้งหมด",
      type: "ประเภท",
      undeployed: "ยังไม่ deploy",
      working: "กำลังทำ"
    },
    generated: "สร้างเมื่อ",
    financials: {
      aiCost: "ค่า AI",
      amount: "จำนวนเงิน",
      billingPeriod: "รอบบิล",
      category: "หมวดหมู่",
      description: "รายละเอียด",
      details: "รายละเอียด",
      empty: "ไม่มีรายการต้นทุนในช่วงเวลานี้",
      entryType: "ฐานรายการ",
      from: "ศูนย์ต้นทุน",
      hostingCost: "ค่าโฮสติ้ง",
      product: "ผลิตภัณฑ์",
      project: "โปรเจกต์",
      provider: "ผู้ให้บริการ",
      providerDescription: "รายละเอียดจากผู้ให้บริการ",
      region: "ภูมิภาค",
      resource: "รีซอร์ส",
      resourceType: "ประเภทรีซอร์ส",
      source: "แหล่งข้อมูล",
      task: "งาน",
      time: "เวลา",
      to: "ผู้ให้บริการ",
      totalCost: "ต้นทุนรวม",
      transactions: "รายการต้นทุน",
      usd: "USD"
    },
    atAGlance: {
      assessmentCompletions: "ทำแบบประเมินเสร็จ",
      assessmentStarts: "เริ่มแบบประเมิน",
      attentionClear: "ยังไม่มีเรื่องเร่งด่วน",
      attentionTitle: "เรื่องที่ต้องดู",
      cancel: "ยกเลิก",
      conversion: "คอนเวอร์ชัน",
      conversionSnapshot: "ภาพรวมคอนเวอร์ชัน",
      count: "จำนวน",
      criticalAlerts: "ปัญหาเว็บไซต์ที่ควรดู",
      customerContactIssues: "ปัญหาการติดต่อลูกค้า",
      deviation: "จริงเทียบเป้า",
      dropoff: "หลุดออก",
      editTargets: "แก้เป้า",
      freeRequests: "คำขอฟรี",
      healthScoreViews: "ดู HealthScore",
      landingVisitors: "ผู้เข้าเว็บ",
      pendingReviews: "รีวิวที่รออยู่",
      precisionConversions: "คอนเวอร์ชัน Precision",
      proConversions: "คอนเวอร์ชัน Pro",
      saveTargets: "บันทึกเป้า",
      stage: "ขั้นตอน",
      target: "เป้า",
      targetSaveError: "ไม่สามารถบันทึกเป้าได้"
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
    flowTitle: "Conversions",
    marketingPages: {
      affiliate: "Affiliate",
      assessmentCompletions: "เสร็จ",
      assessmentStarts: "เริ่ม",
      campaign: "แคมเปญ",
      campaignId: "Campaign ID",
      communicationIssues: "ปัญหาติดต่อ",
      currentStage: "ขั้นตอน",
      emptyCampaigns: "ยังไม่มีทราฟฟิกจากแคมเปญในช่วงเวลานี้",
      emptyLeads: "ยังไม่มีลีดในช่วงเวลานี้",
      events: "เหตุการณ์",
      firstSeen: "พบครั้งแรก",
      freeRequests: "ฟรี",
      groupedBy: "จัดกลุ่มตาม",
      healthScoreViews: "HealthScore",
      identifiers: "ตัวระบุ",
      interactionThread: "ลำดับการโต้ตอบ",
      landed: "เข้าเว็บ",
      lastEvent: "กิจกรรมล่าสุด",
      lastSeen: "พบล่าสุด",
      lead: "ลีด",
      emailHash: "Email hash",
      locale: "ภาษา",
      medium: "Medium",
      noLeadEvents: "ยังไม่มีเหตุการณ์สำหรับลีดนี้",
      pendingReviews: "รีวิว",
      plan: "แผน",
      precisionConversions: "Precision",
      proConversions: "Pro",
      promoCode: "Promo",
      ray: "Ray",
      source: "Source",
      totalLeads: "ลีด"
    },
    performance: [
      { icon: HomeIcon, name: "Dashboard", view: "glance" },
      { icon: FunnelIcon, name: "Conversions", view: "flow" },
      { icon: BanknotesIcon, name: "Financials", view: "financials" }
    ],
    performanceTitle: "ประสิทธิภาพ",
    marketing: [
      { icon: MegaphoneIcon, name: "แคมเปญ", view: "campaigns" },
      { icon: EnvelopeIcon, name: "ลีด", view: "leads" },
      {
        icon: ChatBubbleLeftRightIcon,
        name: "การสื่อสาร",
        view: "communications"
      }
    ],
    marketingTitle: "การตลาด",
    contentNavigation: [
      { icon: DocumentTextIcon, name: "บทความ", view: "blogs" },
      { icon: SparklesIcon, name: "คำรับรอง", view: "testimonials" }
    ],
    contentTitle: "คอนเทนต์",
    governance: [
      { icon: SparklesIcon, name: "อาหาร", view: "foods" },
      { icon: ShoppingBagIcon, name: "สินค้า", view: "products" },
      { icon: BeakerIcon, name: "อาหารเสริม", view: "supplements" }
    ],
    governanceTitle: "ความปลอดภัย",
    insights: [
      { icon: BeakerIcon, name: "อาหารเสริม", view: "supplement-insights" },
      { icon: ShoppingBagIcon, name: "สินค้า", view: "product-insights" }
    ],
    insightsTitle: "Insights",
    openSidebar: "เปิดแถบเมนู",
    execution: [
      { icon: ExclamationTriangleIcon, name: "รีวิว", view: "reviews" },
      { icon: QueueListIcon, name: "Tasks", view: "visibility" },
      { icon: CpuChipIcon, name: "Agents", view: "agents" },
      { icon: ExclamationTriangleIcon, name: "แจ้งเตือน", view: "alerts" }
    ],
    executionTitle: "การปฏิบัติงาน",
    pageTitles: {
      agents: "Agents",
      alerts: "การแจ้งเตือนทางเทคนิค",
      blogs: "บทความ",
      campaigns: "แคมเปญ",
      content: "คอนเทนต์",
      communications: "การสื่อสาร",
      financials: "Financials",
      foods: "อาหาร",
      flow: "Conversions",
      glance: "Dashboard",
      leads: "ลีด",
      "product-insights": "ข้อมูลสินค้า",
      products: "สินค้า",
      reviews: "รีวิว",
      "supplement-insights": "ข้อมูลอาหารเสริม",
      supplements: "อาหารเสริม",
      testimonials: "คำรับรอง",
      visibility: "Tasks"
    },
    ranges: {
      all: "ทั้งหมด",
      day: "วัน",
      hour: "ชั่วโมง",
      month: "เดือน",
      week: "สัปดาห์",
      year: "ปี"
    },
    reviewQueue: {
      approve: "อนุมัติ",
      clientDose: "ขนาดสำหรับลูกค้า",
      disapprove: "ไม่อนุมัติ",
      doseReduced: "ลดขนาดแล้ว",
      empty: "ไม่มีงานรีวิวอาหารเสริมที่รอดำเนินการ",
      flagReason: "เหตุผลที่ต้องรีวิว",
      foodFrequency: "ความถี่",
      foodRationale: "เหตุผล",
      foodServing: "ปริมาณ",
      highValue: "มูลค่าสูง",
      lowValue: "มูลค่าต่ำ",
      mediumValue: "มูลค่าปานกลาง",
      newDose: "ขนาดใหม่",
      originalDose: "ขนาดเดิม",
      plan: "แผน",
      planLink: "เปิดแผน",
      planReview: "รีวิวแผน",
      productReview: "รีวิวสินค้า",
      queued: "เข้าคิว",
      doseUnverified: "ยังตรวจขนาดไม่ได้",
      foodReview: "รีวิวอาหาร",
      supplementReview: "รีวิวอาหารเสริม",
      reviewerNote: "หมายเหตุผู้รีวิว",
      reviewRequired: "ต้องรีวิว",
      suggestFoodReview: "แนะนำรายละเอียดอาหารด้วย AI",
      suggestFoodReviewBusy: "AI กำลังร่างรายละเอียดอาหาร...",
      suggestFoodReviewError: "ไม่สามารถแนะนำรายละเอียดอาหารได้",
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
      active: "กำลังประมวลผล",
      actor: "ผู้ทำ",
      blocked: "ติดขัด",
      capabilities: "ความสามารถ",
      completed: "สำเร็จ",
      empty: "ไม่มีงานในช่วงเวลานี้",
      failed: "ล้มเหลว",
      human: "คน",
      queued: "รอคิว",
      status: "สถานะ",
      task: "งาน",
      total: "ทั้งหมด",
      agent: "Agent"
    },
    supplements: {
      active: "ใช้งาน",
      allCategories: "ทุกหมวดหมู่",
      allStatuses: "ทุกสถานะ",
      addSupplement: "เพิ่มอาหารเสริม",
      blocked: "บล็อก",
      category: "หมวดหมู่",
      confidence: "ความมั่นใจ",
      close: "ปิด",
      create: "สร้าง",
      createError: "ไม่สามารถสร้างอาหารเสริมนี้ได้",
      details: "รายละเอียด",
      dose: "ขนาดสูงสุด",
      empty: "ไม่พบอาหารเสริมตามตัวกรองนี้",
      maxAmount: "ปริมาณ",
      maxUnit: "หน่วย",
      name: "ชื่อ",
      newSupplement: "อาหารเสริมใหม่",
      newSupplementHint:
        "สร้างอาหารเสริมหลักก่อน จากนั้นเพิ่มขนาด หมายเหตุความปลอดภัย และชื่อเชื่อมโยง",
      none: "ไม่มี",
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
      addAssociation: "เพิ่ม",
      associationPlaceholder: "เพิ่มชื่ออื่น",
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
        "กรอกปริมาณที่มากกว่า 0 และหน่วยสำหรับอาหารเสริมที่ใช้งาน"
    },
    title: "Performance"
  }
} satisfies Record<Locale, AdminContent>;
