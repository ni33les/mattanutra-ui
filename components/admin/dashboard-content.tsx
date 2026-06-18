import type { ComponentType, SVGProps } from "react";
import {
  BanknotesIcon,
  BeakerIcon,
  BuildingOffice2Icon,
  ChatBubbleLeftRightIcon,
  ArchiveBoxIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  HomeIcon,
  MegaphoneIcon,
  QueueListIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SparklesIcon,
  UserGroupIcon
} from "@heroicons/react/24/outline";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { AdminFlowNodeId } from "@/lib/admin-flow-data";
import type { Locale } from "@/lib/i18n";
import type { SupplementSafetyFlag } from "@/lib/supplement-safety-flags";
import type { AdminContentInventoryRow } from "@/lib/admin-query-data";
import zhCnContentOverrides from "./dashboard-content.zh-CN.json";

type BaseLocale = Exclude<Locale, "zh-CN">;

export type AdminDashboardView =
  | "access"
  | "access-agents"
  | "agents"
  | "alerts"
  | "audit"
  | "blogs"
  | "campaigns"
  | "content"
  | "coverage-improvement-insights"
  | "customer-insights"
  | "communications"
  | "financials"
  | "food-insights"
  | "foods"
  | "flow"
  | "glance"
  | "leads"
  | "memberships"
  | "organisations"
  | "people"
  | "panya"
  | "product-insights"
  | "products"
  | "reviews"
  | "retail-customer-orders"
  | "retail-audit"
  | "retail-financials"
  | "retail-fulfillment"
  | "retail-movements"
  | "retail-stock-advice"
  | "retail-reorder"
  | "settings"
  | "settlements"
  | "stock"
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
  | "contentLocaleZh"
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
  panyaSection?: "configuration" | "conversations";
  view?: AdminDashboardView;
}>;

export type AdminContent = Readonly<{
  adminLanguage: string;
  closeSidebar: string;
  dataUnavailable: string;
  emptyFlow: string;
  logout: string;
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
    retryError: string;
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
    zh: string;
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
  access: {
    accessControl: string;
    accepted: string;
    active: string;
    actor: string;
    addAgent: string;
    addAgentAssociation: string;
    addMembership: string;
    addOrganisation: string;
    agents: string;
    alreadyMember: string;
    allOrganisations: string;
    allPeople: string;
    assume: string;
    assumed: string;
    audit: string;
    capabilities: string;
    credentials: string;
    country: string;
    createdAt: string;
    create: string;
    createOrganisation: string;
    defaultLocale: string;
    deleted: string;
    deleteInvitation: string;
    deleteMembership: string;
    details: string;
    disabled: string;
    email: string;
    error: string;
    expired: string;
    expiresAt: string;
    filterByOrganisation: string;
    filterByPerson: string;
    generateKey: string;
    grokModel: string;
    invite: string;
    inactivePerson: string;
    invitePerson: string;
    inviteUrl: string;
    invitations: string;
    invitationDeleted: string;
    memberships: string;
    membershipAdded: string;
    membershipDeleted: string;
    model: string;
    name: string;
    noCredentials: string;
    noPrompt: string;
    organisation: string;
    organisations: string;
    owner: string;
    people: string;
    pending: string;
    platform: string;
    preferredLocale: string;
    prompt: string;
    keyLabel: string;
    apiKey: string;
    keyShownOnce: string;
    lastUsedAt: string;
    reasoningLevel: string;
    role: string;
    revoked: string;
    revokeKey: string;
    rotateKey: string;
    save: string;
    session: string;
    slug: string;
    status: string;
    stopAssuming: string;
    type: string;
    updated: string;
  };
  settings: {
    account: string;
    currency: string;
    customerMargin: string;
    displayName: string;
    email: string;
    language: string;
    logoutHint: string;
    profile: string;
    save: string;
    saved: string;
    saveError: string;
  };
  stock: {
    actions: string;
    addItem: string;
    addProduct: string;
    addCustomerOrder: string;
    agentTasks: string;
    allocate: string;
    allocated: string;
	    allocatedTo: string;
	    audit: string;
	    all: string;
	    allOrganisations: string;
	    awaitingStock: string;
	    availability: string;
	    allocateAvailable: string;
	    availableNow: string;
    backorderAllowed: string;
    backToCustomerOrders: string;
    backorderDisabled: string;
    backorderPolicy: string;
    cancel: string;
    capital: string;
	    claimedBy: string;
	    claimTask: string;
	    completeTask: string;
	    confidence: string;
    applyShoppingList: string;
    available: string;
    customer: string;
    customerDemand: string;
    customerOrderDetails: string;
    customerOrders: string;
    customerOrderSaveError: string;
    created: string;
    createShoppingList: string;
    currency: string;
	    daysCover: string;
	    disabled: string;
    dueAt: string;
    empty: string;
    escalateTask: string;
    expiresAt: string;
    editStock: string;
    exportCsv: string;
    exportPdf: string;
    expectedAt: string;
    event: string;
    fastestDelivery: string;
    fulfill: string;
    insightActiveProducts: string;
    insightOutOfStock: string;
    insightRecommendationPressure: string;
    insightRetailValue: string;
    insightsTab: string;
    hygeiaExport: string;
    hygeiaImport: string;
    hygeiaImportError: string;
    hygeiaRetailerRequired: string;
    importCsv: string;
	    inStock: string;
	    chooseProduct: string;
    leadTimeDays: string;
    lowStock: string;
    lots: string;
    movementAdjustment: string;
    movementExpiryWriteOff: string;
    movementReceive: string;
    movementReturn: string;
    movementSale: string;
    movementTransferIn: string;
    movementTransferOut: string;
    movementVoid: string;
    movementType: string;
    movementsTab: string;
    noItemsSelected: string;
    noProductMatches: string;
    notSet: string;
    notes: string;
    onTrack: string;
    organisation: string;
    orderItems: string;
    outOfStock: string;
    partial: string;
	    pack: string;
	    partiallyAllocated: string;
	    payable: string;
    pick: string;
    placeOrder: string;
    pipelineUnavailable: string;
    placedAt: string;
    product: string;
    priceOverride: string;
    profitImpact: string;
    actualQuantity: string;
    quantity: string;
    ordered: string;
    receivedNow: string;
	    reason: string;
	    receiveStock: string;
	    receive: string;
		    receiveQuantityError: string;
      recheckWorkflow: string;
    recordMovement: string;
    remaining: string;
    requiredQuantity: string;
    removeItem: string;
    regionalCheckout: string;
    reorderTab: string;
    review: string;
    retailPrice: string;
    retailValue: string;
    save: string;
    saveError: string;
    ship: string;
    snoozeTask: string;
    boxed: string;
    bookPickup: string;
    cheapestPrice: string;
    basketLines: string;
    deliver: string;
    directRetailer: string;
    billingAddress: string;
    billingSameAsDelivery: string;
    deliveryAddress: string;
    deliveryDetails: string;
    deliveryNotes: string;
    downloadPdf: string;
    email: string;
    invoice: string;
    lineTotal: string;
    packingSheet: string;
    phone: string;
    pickupBooked: string;
    printOrder: string;
    readyToPack: string;
    readyToShip: string;
    sent: string;
    shippingLabel: string;
    shortfall: string;
    shortfallHandling: string;
    shortfallReference: string;
    shortfallExpectedAt: string;
    supplierBackorder: string;
    replacementShipment: string;
    supplierCredit: string;
    supplierRefund: string;
    closeShort: string;
    damagedRejected: string;
    closedShort: string;
    noSupplierShortfall: string;
    noOrders: string;
    mockPaidOrder: string;
    nextAction: string;
    supplier: string;
    supplierContact: string;
	    selectProduct: string;
	    search: string;
	    searchProducts: string;
	    searchOrders: string;
	    searchStock: string;
	    status: string;
	    stockDetails: string;
	    stockListTab: string;
	    stockPipeline: string;
    stockQuantity: string;
    stuck: string;
    suggestedOrder: string;
    taskDetails: string;
    taskQueue: string;
    taskPriority: string;
    title: string;
    total: string;
    unitCost: string;
    units: string;
    updated: string;
    updateStockCounts: string;
    updatingStockCounts: string;
    unavailable: string;
    unclaimed: string;
    unorderedNeed: string;
    unorderedNeedDescription: string;
    voidMovement: string;
	    wholesalePrice: string;
		    waitingForStock: string;
	    workflow: string;
	    routingPreference: string;
    selectedRetailer: string;
    shippingCountry: string;
    shoppingList: string;
    shoppingLists: string;
    reorderBackorders: string;
    reorderBackordersDescription: string;
    reorderRecommendations: string;
    reorderRecommendationsDescription: string;
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
    healthScoreViews: string;
    landingVisitors: string;
    pendingReviews: string;
    precisionConversions: string;
    productOrders: string;
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
  administration: AdminNavItem[];
  administrationTitle: string;
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
  panyaNavigation: AdminNavItem[];
  panyaTitle: string;
  performance: AdminNavItem[];
  performanceTitle: string;
  retailBuyingNavigation: AdminNavItem[];
  retailBuyingTitle: string;
  retailInventoryNavigation: AdminNavItem[];
  retailInventoryTitle: string;
  retailSellingNavigation: AdminNavItem[];
  retailSellingTitle: string;
  retailTasksNavigation: AdminNavItem[];
  retailTasksTitle: string;
  ranges: Record<AdminDashboardRange, string>;
  reviewQueue: {
    approve: string;
    confidenceHigh: string;
    confidenceLow: string;
    confidenceModerate: string;
    clientDose: string;
    close: string;
    disapprove: string;
    dismissTask: string;
    duplicateProduct: string;
    completeTask: string;
    completeHumanTaskHint: string;
    completeHumanTaskTitle: string;
    doseReduced: string;
    due: string;
    empty: string;
    flagReason: string;
    foodFrequency: string;
    foodItem: string;
    foodRationale: string;
    foodServing: string;
    foodReviewHint: string;
    highValue: string;
    ingredient: string;
    lowValue: string;
    mediumValue: string;
    newDose: string;
    noParsedFacts: string;
    productItem: string;
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
    remove: string;
    reviewPlanSafety: string;
    selectProduct: string;
    source: string;
    suppItem: string;
    suggestFoodReview: string;
    suggestFoodReviewBusy: string;
    suggestFoodReviewError: string;
    taskItem: string;
    taskReview: string;
    taskType: string;
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
    age: string;
    agent: string;
    agentSeen: string;
    agentSession: string;
    assignee: string;
    blocked: string;
    capabilities: string;
    completed: string;
    disconnected: string;
    empty: string;
    failed: string;
    group: string;
    heartbeat: string;
    heartbeatStale: string;
    human: string;
    idle: string;
    lastEvent: string;
    lease: string;
    leaseExpired: string;
    live: string;
    liveUpdated: string;
    liveUpdates: string;
    noWorkerHeartbeat: string;
    organisation: string;
    plan: string;
    priority: string;
    queued: string;
    ray: string;
    reasoning: string;
    reservation: string;
    reserved: string;
    runtime: string;
    scheduled: string;
    seen: string;
    session: string;
    status: string;
    task: string;
    total: string;
    unassigned: string;
  };
  supplements: {
    active: string;
    allCategories: string;
    allStatuses: string;
    addSupplement: string;
    blocked: string;
    category: string;
    categoryPlaceholder: string;
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

const baseContent = {
  en: {
    adminLanguage: "Admin language",
    closeSidebar: "Close sidebar",
    dataUnavailable:
      "Dashboard data is unavailable. Check the database connection.",
    emptyFlow: "No flow events in this timeframe.",
    logout: "Log out",
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
      retryError: "Unable to retry this message.",
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
      zh: "中文",
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
      total: "All",
      type: "Type",
      undeployed: "Undeployed",
      working: "Working"
    },
    access: {
      accessControl: "Access control",
      accepted: "Accepted",
      active: "Active",
      actor: "Signed in as",
      addAgent: "Invite agent",
      addAgentAssociation: "Associate Agent",
      addMembership: "Associate Person",
      addOrganisation: "Add Organisation",
      agents: "Agents",
      alreadyMember: "This person already belongs to that organisation. Use Memberships to change their role or status.",
      allOrganisations: "All organisations",
      allPeople: "All people",
      assume: "Assume",
      assumed: "Viewing as",
      audit: "Audit",
      capabilities: "Capabilities",
      credentials: "Credentials",
      country: "Country",
      createdAt: "Created",
      create: "Create",
      createOrganisation: "Create retailer",
      defaultLocale: "Default language",
      deleted: "Deleted",
      deleteInvitation: "Delete invite",
      deleteMembership: "Delete membership",
      details: "Details",
      disabled: "Disabled",
      email: "Email",
      error: "Could not update access controls.",
      expired: "Expired",
      expiresAt: "Expires",
      filterByOrganisation: "Filter by organisation",
      filterByPerson: "Filter by person",
      generateKey: "Generate key",
      grokModel: "Grok model",
      invite: "Invite",
      inactivePerson: "This person already exists but is not active. Update their person record before adding access.",
      invitePerson: "Invite person",
      inviteUrl: "Invite link",
      invitations: "Invitations",
      invitationDeleted: "Invite deleted.",
      memberships: "Memberships",
      membershipAdded: "Existing person found. Organisation access was added without creating a new passkey invite.",
      membershipDeleted: "Membership deleted.",
      model: "Model",
      name: "Name",
      noCredentials: "No active credentials yet.",
      noPrompt: "No prompt stored.",
      organisation: "Organisation",
      organisations: "Organisations",
      owner: "Owner",
      people: "People",
      pending: "Pending",
      platform: "Platform",
      preferredLocale: "Preferred language",
      prompt: "Prompt",
      keyLabel: "Key label",
      apiKey: "API key",
      keyShownOnce: "This key is shown once. Store it in the worker or integration secret store now.",
      lastUsedAt: "Last used",
      reasoningLevel: "Reasoning",
      role: "Role",
      revoked: "Revoked",
      revokeKey: "Revoke key",
      rotateKey: "Rotate key",
      save: "Save",
      session: "Session",
      slug: "Slug",
      status: "Status",
      stopAssuming: "Stop assuming",
      type: "Type",
      updated: "Access controls updated."
    },
    settings: {
      account: "Account",
      currency: "Currency",
      customerMargin: "MattaNutra margin %",
      displayName: "Name",
      email: "Email",
      language: "Language",
      logoutHint: "End this admin session on this device.",
      profile: "Profile",
      save: "Save",
      saved: "Settings saved.",
      saveError: "Could not save settings."
    },
    stock: {
      actions: "Actions",
      addItem: "Add item",
      addProduct: "Add Sellable Product",
      addCustomerOrder: "Add Customer Order",
      agentTasks: "Agent tasks",
      allocate: "Allocate",
	      allocated: "Allocated",
	      allocatedTo: "Allocated to",
	      audit: "Audit",
	      all: "All",
	      allOrganisations: "All organisations",
      awaitingStock: "Awaiting Stock",
      availability: "Checking availability",
      allocateAvailable: "Allocate available",
      availableNow: "Available now",
      backorderAllowed: "Allowed",
      backToCustomerOrders: "Back to customer orders",
      backorderDisabled: "Disabled",
      backorderPolicy: "Backorder policy",
      basketLines: "Basket lines",
      cancel: "Cancel",
      capital: "Capital",
      cheapestPrice: "Cheapest price",
      claimedBy: "Claimed",
      claimTask: "Claim",
      completeTask: "Complete",
      confidence: "Confidence",
      applyShoppingList: "Apply list",
      available: "Available",
      customer: "Customer",
      customerDemand: "Demand",
      customerOrderDetails: "Customer order details",
      customerOrders: "Customer Orders",
      customerOrderSaveError: "Could not save customer order.",
      created: "Created",
      createShoppingList: "Create Shopping List",
      currency: "Currency",
      daysCover: "Days cover",
      deliver: "Deliver",
      disabled: "Disabled",
      directRetailer: "Direct retailer",
      dueAt: "Due date",
      empty: "No stock rows yet.",
      escalateTask: "Escalate",
      expiresAt: "Expiry",
      editStock: "Edit sellable product",
      exportCsv: "Export CSV",
      exportPdf: "Export PDF",
      expectedAt: "Expected",
      event: "Event",
      fastestDelivery: "Fastest delivery",
      fulfill: "Fulfill",
      insightActiveProducts: "Active products",
      insightOutOfStock: "Out of stock",
      insightRecommendationPressure: "Recommendation pressure",
      insightRetailValue: "Retail stock value",
      insightsTab: "Insights",
      hygeiaExport: "Export Hygeia",
      hygeiaImport: "Import Hygeia",
      hygeiaImportError: "Could not import Hygeia stock file.",
      hygeiaRetailerRequired: "Assume or select one retailer to use Hygeia stock files.",
      importCsv: "Import CSV",
      inStock: "Stock OK",
      chooseProduct: "Choose product",
      leadTimeDays: "Lead time",
      lowStock: "Low stock",
      lots: "Lots",
      movementAdjustment: "Adjustment",
      movementExpiryWriteOff: "Expiry write-off",
      movementReceive: "Receive",
      movementReturn: "Return",
      movementSale: "Sale",
      movementTransferIn: "Transfer in",
      movementTransferOut: "Transfer out",
      movementVoid: "Void",
      movementType: "Movement",
      movementsTab: "Movements",
      noItemsSelected: "No items selected.",
      noProductMatches: "No matching products.",
      notSet: "Not set",
      notes: "Notes",
      onTrack: "On track",
      organisation: "Organisation",
      orderItems: "Order items",
      outOfStock: "Out of stock",
      partial: "Partial",
      pack: "Pack",
      partiallyAllocated: "Partially allocated",
      payable: "Payable",
      pick: "Pick",
      placeOrder: "Place order",
      pipelineUnavailable: "Pipeline unavailable. Recheck workflow.",
      placedAt: "Placed",
      product: "Product",
      priceOverride: "Retail Price",
      profitImpact: "Profit impact",
      actualQuantity: "Actual quantity",
      quantity: "Quantity",
      ordered: "Ordered",
      receivedNow: "Received",
	      reason: "Reason",
	      receive: "Receive",
	      receiveQuantityError: "Invalid quantity.",
      receiveStock: "Receive stock",
      recheckWorkflow: "Recheck workflow",
      recordMovement: "Record movement",
      remaining: "Remaining",
      requiredQuantity: "Required quantity",
      removeItem: "Remove",
      regionalCheckout: "Regional checkout",
      reorderTab: "Reorder",
      review: "Review",
      retailPrice: "Retail",
      retailValue: "Retail value",
      save: "Save",
      saveError: "Could not save stock.",
      ship: "Ship",
      snoozeTask: "Snooze",
      boxed: "Boxed",
      bookPickup: "Book pickup",
      billingAddress: "Billing address",
      billingSameAsDelivery: "Billing address same as delivery",
      deliveryAddress: "Delivery address",
      deliveryDetails: "Delivery details",
      deliveryNotes: "Delivery notes",
      downloadPdf: "Download PDF",
      email: "Email",
      invoice: "Invoice",
      lineTotal: "Line total",
      packingSheet: "Packing sheet",
      phone: "Phone",
      pickupBooked: "Pickup booked",
      printOrder: "Print order",
      readyToPack: "Ready to pack",
      readyToShip: "Ready to ship",
      sent: "Shipped",
      shippingLabel: "Shipping label",
      shortfall: "Shortfall",
      shortfallHandling: "Shortfall handling",
      shortfallReference: "Reference",
      shortfallExpectedAt: "Expected follow-up",
      supplierBackorder: "Supplier backorder",
      replacementShipment: "Replacement shipment",
      supplierCredit: "Supplier credit",
      supplierRefund: "Supplier refund",
      closeShort: "Close short",
      damagedRejected: "Damaged/rejected",
      closedShort: "Closed short",
      noSupplierShortfall: "No shortfall",
      noOrders: "No orders",
      mockPaidOrder: "Mock paid checkout",
      nextAction: "Next action",
      routingPreference: "Routing preference",
      selectedRetailer: "Selected retailer",
      shippingCountry: "Shipping country",
      shoppingList: "Shopping list",
      shoppingLists: "Shopping Lists",
      supplier: "Supplier",
	      supplierContact: "Supplier contact",
	      selectProduct: "Select product",
	      search: "Search",
	      searchProducts: "Search",
	      searchOrders: "Search",
	      searchStock: "Search",
      status: "Status",
      stockDetails: "Sellable product details",
      stockListTab: "Sellable products",
      stockPipeline: "Stock pipeline",
      stockQuantity: "Stock",
      stuck: "Stuck",
      suggestedOrder: "Suggested order",
      taskDetails: "Task details",
      taskPriority: "Priority",
      taskQueue: "Task Queue",
      title: "Sellable Products",
      total: "Total",
      unitCost: "Unit cost",
      units: "Units",
      updated: "Updated",
      updateStockCounts: "Update stock counts",
      updatingStockCounts: "Updating stock counts...",
      unavailable: "Unavailable",
      unclaimed: "Unclaimed",
      unorderedNeed: "Unordered demand",
      unorderedNeedDescription:
        "These products have customer demand that is not covered by stock. Select lines to add them to the shopping list.",
      voidMovement: "Void movement",
	      waitingForStock: "Waiting for stock",
	      wholesalePrice: "Wholesale",
	      workflow: "Workflow",
	      reorderBackorders: "Backorders",
	      reorderBackordersDescription:
	        "These items are required to cover active customer orders.",
      reorderRecommendations: "Recommendations",
      reorderRecommendationsDescription:
        "Optional stock buys suggested from recent demand and reorder risk."
		    },
    generated: "Generated",
    financials: {
      aiCost: "AI cost",
      amount: "Amount",
      billingPeriod: "Billing period",
      category: "Category",
      description: "Description",
      details: "Details",
      empty: "No ledger entries in this timeframe.",
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
      transactions: "Ledger entries",
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
      healthScoreViews: "HealthScore views",
      landingVisitors: "Landed visitors",
      pendingReviews: "Pending reviews",
      precisionConversions: "Precision conversions",
      productOrders: "Product orders",
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
      dropoffAfterHealthScore: "Dropped after HealthScore",
      dropoffAfterLanding: "Dropped after landing",
      dropoffAfterPlanSelection: "Dropped after plan",
      dropoffAfterDeliveryDetails: "Dropped after delivery details",
      dropoffAfterProductCheckout: "Dropped after checkout",
      dropoffAfterProductPayment: "Dropped after product payment",
      dropoffAfterPrecisionPayment: "Dropped after Precision",
      dropoffAfterProPayment: "Dropped after Pro",
      dropoffAfterRetailOrder: "Dropped after order",
      dropoffAfterResults: "Dropped after results",
      dropoffAfterSubmission: "Dropped after submission",
      deliveryDetailsConfirmed: "Delivery confirmed",
      formulationReady: "Nutrition plan",
      healthscoreViewed: "HealthScore",
      landingViewed: "Landing",
      marketplaceClicked: "Marketplace",
      orderTrackingViewed: "Tracking viewed",
      planSelected: "Plan selected",
      precisionPaid: "Precision paid",
      productCheckoutStarted: "Product payment started",
      productCheckoutViewed: "Product checkout",
      productPaymentSucceeded: "Product paid",
      proPaid: "Pro paid",
      retailOrderAwaitingStock: "Awaiting stock",
      retailOrderCancelled: "Order cancelled",
      retailOrderCreated: "Product order",
      retailOrderDelivered: "Order delivered",
      retailOrderReturned: "Order returned",
      retailOrderShipped: "Order shipped",
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
      { icon: BanknotesIcon, name: "Financials", view: "financials" },
      { icon: DocumentTextIcon, name: "Settlements", view: "settlements" }
    ],
    performanceTitle: "Performance",
    marketing: [
      { icon: MegaphoneIcon, name: "Campaigns", view: "campaigns" },
      { icon: EnvelopeIcon, name: "Leads", view: "leads" }
    ],
    marketingTitle: "Marketing",
    panyaNavigation: [
      {
        icon: Cog6ToothIcon,
        name: "Configuration",
        panyaSection: "configuration",
        view: "panya"
      },
      {
        icon: ChatBubbleLeftRightIcon,
        name: "Conversations",
        panyaSection: "conversations",
        view: "panya"
      }
    ],
    panyaTitle: "Panya",
    administration: [
      { icon: BuildingOffice2Icon, name: "Organisations", view: "organisations" },
      { icon: UserGroupIcon, name: "Memberships", view: "memberships" },
      { icon: UserGroupIcon, name: "People", view: "people" },
      {
        icon: ChatBubbleLeftRightIcon,
        name: "Communications",
        view: "communications"
      },
      { icon: CpuChipIcon, name: "Agents", view: "access-agents" },
      { icon: ClipboardDocumentListIcon, name: "Audit", view: "audit" },
      { icon: Cog6ToothIcon, name: "Settings", view: "settings" }
    ],
    administrationTitle: "Administration",
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
    governanceTitle: "Catalogue",
    retailTasksNavigation: [],
    retailTasksTitle: "Retail Tasks",
    retailBuyingNavigation: [],
    retailBuyingTitle: "",
    retailInventoryNavigation: [
      { icon: ClipboardDocumentListIcon, name: "Reorders", view: "retail-stock-advice" },
      { icon: ArchiveBoxIcon, name: "Stock", view: "stock" }
    ],
    retailInventoryTitle: "Stock",
    retailSellingNavigation: [
      { icon: ShoppingCartIcon, name: "Orders", view: "retail-customer-orders" },
      { icon: BanknotesIcon, name: "Financials", view: "retail-financials" }
    ],
    retailSellingTitle: "Orders",
    insights: [
      { icon: UserGroupIcon, name: "Customer Intelligence", view: "customer-insights" },
      { icon: FunnelIcon, name: "Coverage Improvement", view: "coverage-improvement-insights" },
      { icon: BeakerIcon, name: "Supplements", view: "supplement-insights" },
      { icon: ShoppingBagIcon, name: "Products", view: "product-insights" },
      { icon: SparklesIcon, name: "Food Improvement", view: "food-insights" }
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
      access: "Access",
      "access-agents": "Access Agents",
      agents: "Agents",
      alerts: "Technical Alerts",
      audit: "Audit",
      blogs: "Blogs",
      campaigns: "Campaigns",
      content: "Content",
      "coverage-improvement-insights": "Coverage Improvement",
      "customer-insights": "Customer Intelligence",
      communications: "Communications",
      financials: "Financials",
      "food-insights": "Food Improvement",
      foods: "Foods",
      flow: "Conversions",
      glance: "Dashboard",
      leads: "Leads",
      memberships: "Memberships",
      organisations: "Organisations",
      people: "People",
      panya: "Panya",
      "product-insights": "Product Insights",
      products: "Products",
      "retail-customer-orders": "Customer Orders",
      "retail-audit": "Audit",
      "retail-financials": "Retail Financials",
      "retail-fulfillment": "Fulfillment",
      "retail-movements": "Stock Movements",
      "retail-stock-advice": "Reorders",
      "retail-reorder": "Reorders",
      reviews: "Reviews",
      settings: "Settings",
      settlements: "Settlements",
      stock: "Stock",
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
      confidenceHigh: "High",
      confidenceLow: "Low",
      confidenceModerate: "Moderate",
      clientDose: "Client dose",
      close: "Close",
      disapprove: "Disapprove",
      dismissTask: "Dismiss",
      duplicateProduct: "Duplicate of existing product",
      completeTask: "Complete",
      completeHumanTaskHint:
        "Use this for review/escalation tasks that do not have a specialist editor. Completing or dismissing the task clears it from the review queue and records an audit note.",
      completeHumanTaskTitle: "Clear human review task",
      doseReduced: "Dose reduced",
      due: "Due",
      empty: "No supplement review tasks are waiting.",
      flagReason: "Review reason",
      foodFrequency: "Frequency",
      foodItem: "Food",
      foodRationale: "Rationale",
      foodServing: "Serving",
      foodReviewHint: "Review whether this food can be shown in the client guidance.",
      highValue: "High Value",
      ingredient: "Ingredient",
      lowValue: "Low Value",
      mediumValue: "Medium Value",
      newDose: "New dose",
      noParsedFacts: "No parsed facts yet.",
      productItem: "Product",
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
      remove: "Remove",
      reviewPlanSafety: "Review nutrition safety for plan",
      selectProduct: "Select product",
      source: "Source",
      suppItem: "Supp",
      suggestFoodReview: "Suggest food details with AI",
      suggestFoodReviewBusy: "AI is drafting food details...",
      suggestFoodReviewError: "Could not suggest food details.",
      taskItem: "Task",
      taskReview: "Task review",
      taskType: "Task type",
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
      age: "Age",
      agent: "Agent",
      agentSeen: "Agent seen",
      agentSession: "Agent session",
      assignee: "Assigned to",
      blocked: "Blocked",
      capabilities: "Capabilities",
      completed: "Completed",
      disconnected: "Disconnected",
      empty: "No tasks are visible in this timeframe.",
      failed: "Failed",
      group: "Group",
      heartbeat: "Heartbeat",
      heartbeatStale: "Agent heartbeat is stale.",
      human: "Human",
      idle: "Idle",
      lastEvent: "Last event",
      lease: "Lease",
      leaseExpired: "Lease expired before the agent completed the task.",
      live: "Live",
      liveUpdated: "Live",
      liveUpdates: "Live updates",
      noWorkerHeartbeat: "No worker heartbeat",
      organisation: "Organisation",
      plan: "Plan",
      priority: "Priority",
      queued: "Queued",
      ray: "Ray",
      reasoning: "Reasoning",
      reservation: "Reservation",
      reserved: "Reserved",
      runtime: "Runtime",
      scheduled: "Scheduled",
      seen: "Seen",
      session: "Session",
      status: "Status",
      task: "Task",
      total: "All",
      unassigned: "Unassigned"
    },
    supplements: {
      active: "Active",
      allCategories: "All categories",
      allStatuses: "All statuses",
      addSupplement: "Add supplement",
      blocked: "Blocked",
      category: "Category",
      categoryPlaceholder: "Manual",
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
    adminLanguage: "ภาษาแอดมิน",
    closeSidebar: "ปิดแถบเมนู",
    dataUnavailable:
      "ไม่สามารถโหลดข้อมูลแดชบอร์ดได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล",
    emptyFlow: "ยังไม่มีข้อมูล Flow ในช่วงเวลานี้",
    logout: "ออกจากระบบ",
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
      retryError: "ไม่สามารถลองส่งข้อความนี้ใหม่ได้",
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
      zh: "中文",
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
    access: {
      accessControl: "การควบคุมสิทธิ์",
      accepted: "ตอบรับแล้ว",
      active: "ใช้งาน",
      actor: "เข้าสู่ระบบเป็น",
      addAgent: "เชิญเอเจนต์",
      addAgentAssociation: "เชื่อมโยงเอเจนต์",
      addMembership: "เชื่อมโยงผู้ใช้",
      addOrganisation: "เพิ่มองค์กร",
      agents: "เอเจนต์",
      alreadyMember: "ผู้ใช้นี้อยู่ในองค์กรนี้แล้ว ใช้ส่วนสมาชิกเพื่อเปลี่ยนบทบาทหรือสถานะ",
      allOrganisations: "ทุกองค์กร",
      allPeople: "ผู้ใช้ทั้งหมด",
      assume: "สวมบทบาท",
      assumed: "กำลังดูเป็น",
      audit: "ประวัติ",
      capabilities: "ความสามารถ",
      credentials: "คีย์",
      country: "ประเทศ",
      createdAt: "สร้างเมื่อ",
      create: "สร้าง",
      createOrganisation: "สร้างผู้ค้าปลีก",
      defaultLocale: "ภาษาเริ่มต้น",
      deleted: "ลบแล้ว",
      deleteInvitation: "ลบคำเชิญ",
      deleteMembership: "ลบสมาชิก",
      details: "รายละเอียด",
      disabled: "ปิดใช้งาน",
      email: "อีเมล",
      error: "ไม่สามารถอัปเดตสิทธิ์ได้",
      expired: "หมดอายุ",
      expiresAt: "หมดอายุ",
      filterByOrganisation: "กรองตามองค์กร",
      filterByPerson: "กรองตามผู้ใช้",
      generateKey: "สร้างคีย์",
      grokModel: "โมเดล Grok",
      invite: "เชิญ",
      inactivePerson: "ผู้ใช้นี้มีอยู่แล้วแต่ยังไม่ได้เปิดใช้งาน โปรดแก้ไขข้อมูลผู้ใช้ก่อนเพิ่มสิทธิ์",
      invitePerson: "เชิญผู้ใช้",
      inviteUrl: "ลิงก์เชิญ",
      invitations: "คำเชิญ",
      invitationDeleted: "ลบคำเชิญแล้ว",
      memberships: "สมาชิก",
      membershipAdded: "พบผู้ใช้เดิมแล้ว เพิ่มสิทธิ์เข้าองค์กรโดยไม่สร้างคำเชิญ passkey ใหม่",
      membershipDeleted: "ลบสมาชิกแล้ว",
      model: "โมเดล",
      name: "ชื่อ",
      noCredentials: "ยังไม่มีคีย์ที่ใช้งานอยู่",
      noPrompt: "ยังไม่มี prompt ที่บันทึกไว้",
      organisation: "องค์กร",
      organisations: "องค์กร",
      owner: "เจ้าของ",
      people: "ผู้ใช้",
      pending: "รอดำเนินการ",
      platform: "แพลตฟอร์ม",
      preferredLocale: "ภาษาที่ต้องการ",
      prompt: "Prompt",
      keyLabel: "ชื่อคีย์",
      apiKey: "API key",
      keyShownOnce: "คีย์นี้จะแสดงครั้งเดียว โปรดเก็บไว้ใน secret store ของ worker หรือ integration ตอนนี้",
      lastUsedAt: "ใช้ล่าสุด",
      reasoningLevel: "ระดับ reasoning",
      role: "บทบาท",
      revoked: "ยกเลิกแล้ว",
      revokeKey: "ยกเลิกคีย์",
      rotateKey: "หมุนคีย์",
      save: "บันทึก",
      session: "เซสชัน",
      slug: "Slug",
      status: "สถานะ",
      stopAssuming: "หยุดสวมบทบาท",
      type: "ประเภท",
      updated: "อัปเดตสิทธิ์แล้ว"
    },
    settings: {
      account: "บัญชี",
      currency: "สกุลเงิน",
      customerMargin: "มาร์จิน MattaNutra %",
      displayName: "ชื่อ",
      email: "อีเมล",
      language: "ภาษา",
      logoutHint: "ออกจากเซสชันแอดมินบนอุปกรณ์นี้",
      profile: "โปรไฟล์",
      save: "บันทึก",
      saved: "บันทึกการตั้งค่าแล้ว",
      saveError: "ไม่สามารถบันทึกการตั้งค่าได้"
    },
    stock: {
      actions: "การดำเนินการ",
      addItem: "เพิ่มรายการ",
      addProduct: "เพิ่มสินค้าที่ขายได้",
      addCustomerOrder: "เพิ่มคำสั่งซื้อ",
      agentTasks: "งานของ Agent",
      allocate: "จัดสรร",
	      allocated: "จัดสรรแล้ว",
	      allocatedTo: "จัดสรรให้",
	      audit: "บันทึกเหตุการณ์",
	      all: "ทั้งหมด",
	      allOrganisations: "ทุกองค์กร",
      awaitingStock: "รอสต็อก",
      availability: "กำลังตรวจสอบความพร้อม",
      allocateAvailable: "จัดสรรที่มีอยู่",
      availableNow: "พร้อมจัดสรรตอนนี้",
      backorderAllowed: "อนุญาต",
      backToCustomerOrders: "กลับไปคำสั่งซื้อลูกค้า",
      backorderDisabled: "ปิดใช้งาน",
      backorderPolicy: "นโยบายสั่งจอง",
      basketLines: "รายการในตะกร้า",
      cancel: "ยกเลิก",
      capital: "เงินทุน",
      cheapestPrice: "ราคาถูกที่สุด",
      claimedBy: "รับงานโดย",
      claimTask: "รับงาน",
      completeTask: "เสร็จสิ้น",
      confidence: "ความมั่นใจ",
      applyShoppingList: "นำรายการไปใช้",
      available: "มีสินค้า",
      customer: "ลูกค้า",
      customerDemand: "ความต้องการ",
      customerOrderDetails: "รายละเอียดคำสั่งซื้อลูกค้า",
      customerOrders: "คำสั่งซื้อลูกค้า",
      customerOrderSaveError: "ไม่สามารถบันทึกคำสั่งซื้อลูกค้าได้",
      created: "สร้างเมื่อ",
      createShoppingList: "สร้างรายการซื้อ",
      currency: "สกุลเงิน",
      daysCover: "วันที่ครอบคลุม",
      deliver: "ส่งมอบ",
      disabled: "ปิดใช้งาน",
      directRetailer: "เลือกร้านโดยตรง",
      dueAt: "วันที่ครบกำหนด",
      empty: "ยังไม่มีรายการสต็อก",
      escalateTask: "ยกระดับ",
      expiresAt: "วันหมดอายุ",
      editStock: "แก้ไขสินค้าที่ขายได้",
      exportCsv: "ส่งออก CSV",
      exportPdf: "ส่งออก PDF",
      expectedAt: "วันที่คาดว่าจะถึง",
      event: "เหตุการณ์",
      fastestDelivery: "ส่งเร็วที่สุด",
      fulfill: "ดำเนินการจัดส่ง",
      insightActiveProducts: "สินค้าที่ใช้งาน",
      insightOutOfStock: "สินค้าหมด",
      insightRecommendationPressure: "แรงกดดันจากคำแนะนำ",
      insightRetailValue: "มูลค่าสต็อกขายปลีก",
      insightsTab: "ข้อมูลเชิงลึก",
      hygeiaExport: "ส่งออก Hygeia",
      hygeiaImport: "นำเข้า Hygeia",
      hygeiaImportError: "ไม่สามารถนำเข้าไฟล์สต็อก Hygeia ได้",
      hygeiaRetailerRequired: "เลือกหรือสวมสิทธิ์ร้านค้าหนึ่งแห่งเพื่อใช้ไฟล์สต็อก Hygeia",
      importCsv: "นำเข้า CSV",
      inStock: "สต็อกปกติ",
      chooseProduct: "เลือกสินค้า",
      leadTimeDays: "ระยะเวลานำ",
      lowStock: "สต็อกต่ำ",
      lots: "ล็อต",
      movementAdjustment: "ปรับปรุง",
      movementExpiryWriteOff: "ตัดจำหน่ายหมดอายุ",
      movementReceive: "รับเข้า",
      movementReturn: "คืนสินค้า",
      movementSale: "ขาย",
      movementTransferIn: "โอนเข้า",
      movementTransferOut: "โอนออก",
      movementVoid: "ยกเลิก",
      movementType: "การเคลื่อนไหว",
      movementsTab: "การเคลื่อนไหว",
      noItemsSelected: "ยังไม่ได้เลือกรายการ",
      noProductMatches: "ไม่พบสินค้าที่ตรงกัน",
      notSet: "ยังไม่ได้ตั้งค่า",
      notes: "หมายเหตุ",
      onTrack: "ปกติ",
      organisation: "องค์กร",
      orderItems: "รายการสั่งซื้อ",
      outOfStock: "สินค้าหมด",
      partial: "บางส่วน",
      pack: "แพ็ก",
      partiallyAllocated: "จัดสรรบางส่วน",
      payable: "ชำระเงินได้",
      pick: "หยิบสินค้า",
      placeOrder: "สั่งซื้อ",
      pipelineUnavailable: "ไม่มีข้อมูลไปป์ไลน์ ตรวจสอบเวิร์กโฟลว์อีกครั้ง",
      placedAt: "เวลาสั่งซื้อ",
      product: "สินค้า",
      priceOverride: "ราคาขายปลีก",
      profitImpact: "ผลกระทบกำไร",
      actualQuantity: "จำนวนจริง",
      quantity: "จำนวน",
      ordered: "สั่งซื้อ",
      receivedNow: "รับแล้ว",
	      reason: "เหตุผล",
	      receive: "รับเข้า",
      receiveQuantityError: "จำนวนไม่ถูกต้อง",
      receiveStock: "รับสต็อก",
      recheckWorkflow: "ตรวจสอบเวิร์กโฟลว์อีกครั้ง",
      recordMovement: "บันทึกการเคลื่อนไหว",
      remaining: "คงเหลือ",
      requiredQuantity: "จำนวนที่ต้องใช้",
      removeItem: "ลบ",
      regionalCheckout: "จำลองเช็กเอาต์ตามภูมิภาค",
      reorderTab: "สั่งซื้อเพิ่ม",
      review: "ตรวจสอบ",
      retailPrice: "ราคาขายปลีก",
      retailValue: "มูลค่าขายปลีก",
      save: "บันทึก",
      saveError: "ไม่สามารถบันทึกสต็อกได้",
      ship: "จัดส่ง",
      snoozeTask: "เลื่อน",
      boxed: "ใส่กล่องแล้ว",
      bookPickup: "จองรับพัสดุ",
      billingAddress: "ที่อยู่สำหรับออกบิล",
      billingSameAsDelivery: "ที่อยู่สำหรับออกบิลเหมือนที่อยู่จัดส่ง",
      deliveryAddress: "ที่อยู่จัดส่ง",
      deliveryDetails: "รายละเอียดการจัดส่ง",
      deliveryNotes: "หมายเหตุการจัดส่ง",
      downloadPdf: "ดาวน์โหลด PDF",
      email: "อีเมล",
      invoice: "ใบแจ้งหนี้",
      lineTotal: "รวมรายการ",
      packingSheet: "ใบจัดสินค้า",
      phone: "โทรศัพท์",
      pickupBooked: "จองรับพัสดุแล้ว",
      printOrder: "พิมพ์คำสั่งซื้อ",
      readyToPack: "พร้อมแพ็ก",
      readyToShip: "พร้อมจัดส่ง",
      sent: "จัดส่งแล้ว",
      shippingLabel: "ป้ายจัดส่ง",
      shortfall: "ส่วนขาด",
      shortfallHandling: "การจัดการส่วนขาด",
      shortfallReference: "เลขอ้างอิง",
      shortfallExpectedAt: "วันที่ติดตาม",
      supplierBackorder: "ซัพพลายเออร์ค้างส่ง",
      replacementShipment: "ส่งทดแทน",
      supplierCredit: "เครดิตจากซัพพลายเออร์",
      supplierRefund: "คืนเงินจากซัพพลายเออร์",
      closeShort: "ปิดส่วนขาด",
      damagedRejected: "เสียหาย/ปฏิเสธรับ",
      closedShort: "ปิดส่วนขาดแล้ว",
      noSupplierShortfall: "ไม่มีส่วนขาด",
      noOrders: "ไม่มีคำสั่งซื้อ",
      mockPaidOrder: "เช็กเอาต์จำลองที่ชำระแล้ว",
      nextAction: "ขั้นตอนถัดไป",
      routingPreference: "รูปแบบการเลือกผู้จัดส่ง",
      selectedRetailer: "ร้านที่เลือก",
      shippingCountry: "ประเทศจัดส่ง",
      shoppingList: "รายการซื้อ",
      shoppingLists: "รายการซื้อ",
      supplier: "ซัพพลายเออร์",
	      supplierContact: "ข้อมูลติดต่อซัพพลายเออร์",
	      selectProduct: "เลือกสินค้า",
	      search: "ค้นหา",
	      searchProducts: "ค้นหา",
	      searchOrders: "ค้นหา",
	      searchStock: "ค้นหา",
      status: "สถานะ",
      stockDetails: "รายละเอียดสินค้าที่ขายได้",
      stockListTab: "สินค้าที่ขายได้",
      stockPipeline: "ไปป์ไลน์สต็อก",
      stockQuantity: "สต็อก",
      stuck: "ติดขัด",
      suggestedOrder: "จำนวนแนะนำ",
      taskDetails: "รายละเอียดงาน",
      taskPriority: "ลำดับความสำคัญ",
      taskQueue: "คิวงาน",
      title: "สินค้าที่ขายได้",
      total: "รวม",
      unitCost: "ต้นทุนต่อหน่วย",
      units: "หน่วย",
      updated: "อัปเดต",
      updateStockCounts: "อัปเดตจำนวนสต็อก",
      updatingStockCounts: "กำลังอัปเดตจำนวนสต็อก...",
      unavailable: "ไม่พร้อมขาย",
      unclaimed: "ยังไม่มีผู้รับงาน",
      unorderedNeed: "ความต้องการที่ยังไม่ได้สั่งซื้อ",
      unorderedNeedDescription:
        "สินค้าเหล่านี้มีคำสั่งซื้อจากลูกค้าที่ยังไม่มีสต็อกรองรับ เลือกรายการเพื่อเพิ่มลงในรายการซื้อ",
      voidMovement: "ยกเลิกรายการ",
	      waitingForStock: "รอสต็อก",
	      wholesalePrice: "ราคาส่ง",
	      workflow: "เวิร์กโฟลว์",
	      reorderBackorders: "รายการค้างส่ง",
	      reorderBackordersDescription:
	        "รายการเหล่านี้จำเป็นเพื่อรองรับคำสั่งซื้อจากลูกค้าที่เปิดอยู่",
      reorderRecommendations: "คำแนะนำ",
      reorderRecommendationsDescription:
        "รายการซื้อสต็อกเพิ่มเติมที่แนะนำจากความต้องการล่าสุดและความเสี่ยงในการสั่งซื้อเพิ่ม"
		    },
    generated: "สร้างเมื่อ",
    financials: {
      aiCost: "ค่า AI",
      amount: "จำนวนเงิน",
      billingPeriod: "รอบบิล",
      category: "หมวดหมู่",
      description: "รายละเอียด",
      details: "รายละเอียด",
      empty: "ไม่มีรายการบัญชีในช่วงเวลานี้",
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
      transactions: "รายการบัญชี",
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
      healthScoreViews: "ดู HealthScore",
      landingVisitors: "ผู้เข้าเว็บ",
      pendingReviews: "รีวิวที่รออยู่",
      precisionConversions: "คอนเวอร์ชัน Precision",
      productOrders: "คำสั่งซื้อสินค้า",
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
      dropoffAfterHealthScore: "ออกหลัง HealthScore",
      dropoffAfterLanding: "ออกหลังหน้าแรก",
      dropoffAfterPlanSelection: "ออกหลังเลือกแผน",
      dropoffAfterDeliveryDetails: "ออกหลังยืนยันที่อยู่",
      dropoffAfterProductCheckout: "ออกหลังเช็กเอาต์สินค้า",
      dropoffAfterProductPayment: "ออกหลังชำระค่าสินค้า",
      dropoffAfterPrecisionPayment: "ออกหลัง Precision",
      dropoffAfterProPayment: "ออกหลัง Pro",
      dropoffAfterRetailOrder: "ออกหลังสร้างคำสั่งซื้อ",
      dropoffAfterResults: "ออกหลังผลลัพธ์",
      dropoffAfterSubmission: "ออกหลังส่งแบบประเมิน",
      deliveryDetailsConfirmed: "ยืนยันที่อยู่จัดส่ง",
      formulationReady: "แผนโภชนาการ",
      healthscoreViewed: "HealthScore",
      landingViewed: "หน้าแรก",
      marketplaceClicked: "มาร์เก็ตเพลส",
      orderTrackingViewed: "ดูสถานะคำสั่งซื้อ",
      planSelected: "เลือกแผน",
      precisionPaid: "Precision ชำระแล้ว",
      productCheckoutStarted: "เริ่มชำระค่าสินค้า",
      productCheckoutViewed: "เช็กเอาต์สินค้า",
      productPaymentSucceeded: "ชำระค่าสินค้าแล้ว",
      proPaid: "Pro ชำระแล้ว",
      retailOrderAwaitingStock: "รอสต็อก",
      retailOrderCancelled: "ยกเลิกคำสั่งซื้อ",
      retailOrderCreated: "คำสั่งซื้อสินค้า",
      retailOrderDelivered: "จัดส่งสำเร็จ",
      retailOrderReturned: "คืนสินค้า",
      retailOrderShipped: "ส่งออกแล้ว",
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
    flowTitle: "คอนเวอร์ชัน",
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
      { icon: HomeIcon, name: "แดชบอร์ด", view: "glance" },
      { icon: FunnelIcon, name: "คอนเวอร์ชัน", view: "flow" },
      { icon: BanknotesIcon, name: "การเงิน", view: "financials" },
      { icon: DocumentTextIcon, name: "การชำระร้านค้า", view: "settlements" }
    ],
    performanceTitle: "ประสิทธิภาพ",
    marketing: [
      { icon: MegaphoneIcon, name: "แคมเปญ", view: "campaigns" },
      { icon: EnvelopeIcon, name: "ลีด", view: "leads" }
    ],
    marketingTitle: "การตลาด",
    panyaNavigation: [
      {
        icon: Cog6ToothIcon,
        name: "การตั้งค่า",
        panyaSection: "configuration",
        view: "panya"
      },
      {
        icon: ChatBubbleLeftRightIcon,
        name: "บทสนทนา",
        panyaSection: "conversations",
        view: "panya"
      }
    ],
    panyaTitle: "Panya",
    administration: [
      { icon: BuildingOffice2Icon, name: "องค์กร", view: "organisations" },
      { icon: UserGroupIcon, name: "สมาชิก", view: "memberships" },
      { icon: UserGroupIcon, name: "ผู้ใช้", view: "people" },
      {
        icon: ChatBubbleLeftRightIcon,
        name: "การสื่อสาร",
        view: "communications"
      },
      { icon: CpuChipIcon, name: "เอเจนต์", view: "access-agents" },
      { icon: ClipboardDocumentListIcon, name: "ประวัติ", view: "audit" },
      { icon: Cog6ToothIcon, name: "การตั้งค่า", view: "settings" }
    ],
    administrationTitle: "การดูแลระบบ",
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
    governanceTitle: "แค็ตตาล็อก",
    retailTasksNavigation: [],
    retailTasksTitle: "งานค้าปลีก",
    retailBuyingNavigation: [],
    retailBuyingTitle: "",
    retailInventoryNavigation: [
      { icon: ClipboardDocumentListIcon, name: "สั่งซื้อเพิ่ม", view: "retail-stock-advice" },
      { icon: ArchiveBoxIcon, name: "สต็อก", view: "stock" }
    ],
    retailInventoryTitle: "สต็อก",
    retailSellingNavigation: [
      { icon: ShoppingCartIcon, name: "คำสั่งซื้อ", view: "retail-customer-orders" },
      { icon: BanknotesIcon, name: "การเงิน", view: "retail-financials" }
    ],
    retailSellingTitle: "คำสั่งซื้อ",
    insights: [
      { icon: UserGroupIcon, name: "ข้อมูลลูกค้า", view: "customer-insights" },
      { icon: FunnelIcon, name: "ปรับปรุงความครอบคลุม", view: "coverage-improvement-insights" },
      { icon: BeakerIcon, name: "อาหารเสริม", view: "supplement-insights" },
      { icon: ShoppingBagIcon, name: "สินค้า", view: "product-insights" },
      { icon: SparklesIcon, name: "ปรับปรุงอาหาร", view: "food-insights" }
    ],
    insightsTitle: "อินไซต์",
    openSidebar: "เปิดแถบเมนู",
    execution: [
      { icon: ExclamationTriangleIcon, name: "รีวิว", view: "reviews" },
      { icon: QueueListIcon, name: "งาน", view: "visibility" },
      { icon: CpuChipIcon, name: "เอเจนต์", view: "agents" },
      { icon: ExclamationTriangleIcon, name: "แจ้งเตือน", view: "alerts" }
    ],
    executionTitle: "การปฏิบัติงาน",
    pageTitles: {
      access: "สิทธิ์เข้าถึง",
      "access-agents": "เอเจนต์สิทธิ์เข้าถึง",
      agents: "เอเจนต์",
      alerts: "การแจ้งเตือนทางเทคนิค",
      audit: "ประวัติ",
      blogs: "บทความ",
      campaigns: "แคมเปญ",
      content: "คอนเทนต์",
      "coverage-improvement-insights": "ปรับปรุงความครอบคลุม",
      "customer-insights": "ข้อมูลลูกค้า",
      communications: "การสื่อสาร",
      financials: "การเงิน",
      "food-insights": "ปรับปรุงอาหาร",
      foods: "อาหาร",
      flow: "คอนเวอร์ชัน",
      glance: "แดชบอร์ด",
      leads: "ลีด",
      memberships: "สมาชิก",
      organisations: "องค์กร",
      people: "ผู้ใช้",
      panya: "Panya",
      "product-insights": "ข้อมูลสินค้า",
      products: "สินค้า",
      "retail-customer-orders": "คำสั่งซื้อลูกค้า",
      "retail-audit": "บันทึกเหตุการณ์",
      "retail-financials": "การเงินร้านค้า",
      "retail-fulfillment": "จัดส่ง",
      "retail-movements": "การเคลื่อนไหวสต็อก",
      "retail-stock-advice": "สั่งซื้อเพิ่ม",
      "retail-reorder": "สั่งซื้อเพิ่ม",
      reviews: "รีวิว",
      settings: "การตั้งค่า",
      settlements: "การชำระร้านค้า",
      stock: "สต็อก",
      "supplement-insights": "ข้อมูลอาหารเสริม",
      supplements: "อาหารเสริม",
      testimonials: "คำรับรอง",
      visibility: "งาน"
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
      confidenceHigh: "สูง",
      confidenceLow: "ต่ำ",
      confidenceModerate: "ปานกลาง",
      clientDose: "ขนาดสำหรับลูกค้า",
      close: "ปิด",
      disapprove: "ไม่อนุมัติ",
      dismissTask: "ยกเลิกงาน",
      duplicateProduct: "ซ้ำกับสินค้าที่มีอยู่",
      completeTask: "เสร็จสิ้น",
      completeHumanTaskHint:
        "ใช้สำหรับงานรีวิวหรือ escalation ที่ไม่มีหน้าจอแก้ไขเฉพาะ การทำเครื่องหมายเสร็จหรือยกเลิกจะลบงานออกจากคิวรีวิวและบันทึกหมายเหตุไว้",
      completeHumanTaskTitle: "เคลียร์งานรีวิวของมนุษย์",
      doseReduced: "ลดขนาดแล้ว",
      due: "ครบกำหนด",
      empty: "ไม่มีงานรีวิวอาหารเสริมที่รอดำเนินการ",
      flagReason: "เหตุผลที่ต้องรีวิว",
      foodFrequency: "ความถี่",
      foodItem: "อาหาร",
      foodRationale: "เหตุผล",
      foodServing: "ปริมาณ",
      foodReviewHint: "ตรวจสอบว่าอาหารนี้สามารถแสดงในคำแนะนำลูกค้าได้หรือไม่",
      highValue: "มูลค่าสูง",
      ingredient: "ส่วนผสม",
      lowValue: "มูลค่าต่ำ",
      mediumValue: "มูลค่าปานกลาง",
      newDose: "ขนาดใหม่",
      noParsedFacts: "ยังไม่มีข้อมูลฉลากที่อ่านได้",
      productItem: "สินค้า",
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
      remove: "ลบ",
      reviewPlanSafety: "รีวิวความปลอดภัยของแผนโภชนาการ",
      selectProduct: "เลือกสินค้า",
      source: "แหล่งที่มา",
      suppItem: "อาหารเสริม",
      suggestFoodReview: "แนะนำรายละเอียดอาหารด้วย AI",
      suggestFoodReviewBusy: "AI กำลังร่างรายละเอียดอาหาร...",
      suggestFoodReviewError: "ไม่สามารถแนะนำรายละเอียดอาหารได้",
      taskItem: "งาน",
      taskReview: "รีวิวงาน",
      taskType: "ประเภทงาน",
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
      age: "อายุ",
      agent: "Agent",
      agentSeen: "Agent เห็นล่าสุด",
      agentSession: "เซสชัน Agent",
      assignee: "มอบหมายให้",
      blocked: "ติดขัด",
      capabilities: "ความสามารถ",
      completed: "สำเร็จ",
      disconnected: "ขาดการเชื่อมต่อ",
      empty: "ไม่มีงานในช่วงเวลานี้",
      failed: "ล้มเหลว",
      group: "กลุ่ม",
      heartbeat: "Heartbeat",
      heartbeatStale: "heartbeat ของ agent เก่าเกินไป",
      human: "คน",
      idle: "พัก",
      lastEvent: "เหตุการณ์ล่าสุด",
      lease: "Lease",
      leaseExpired: "lease หมดอายุก่อน agent ทำงานเสร็จ",
      live: "สด",
      liveUpdated: "สด",
      liveUpdates: "อัปเดตสด",
      noWorkerHeartbeat: "ไม่มี heartbeat จาก worker",
      organisation: "องค์กร",
      plan: "แผน",
      priority: "ความสำคัญ",
      queued: "รอคิว",
      ray: "Ray",
      reasoning: "Reasoning",
      reservation: "Reservation",
      reserved: "จองแล้ว",
      runtime: "Runtime",
      scheduled: "ตั้งเวลา",
      seen: "เห็นล่าสุด",
      session: "เซสชัน",
      status: "สถานะ",
      task: "งาน",
      total: "ทั้งหมด",
      unassigned: "ยังไม่มอบหมาย"
    },
    supplements: {
      active: "ใช้งาน",
      allCategories: "ทุกหมวดหมู่",
      allStatuses: "ทุกสถานะ",
      addSupplement: "เพิ่มอาหารเสริม",
      blocked: "บล็อก",
      category: "หมวดหมู่",
      categoryPlaceholder: "กรอกเอง",
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
} satisfies Record<BaseLocale, AdminContent>;

function mergeLocalizedContent<T>(base: T, overrides: unknown): T {
  if (typeof base === "string") {
    return (typeof overrides === "string" ? overrides : base) as T;
  }

  if (Array.isArray(base)) {
    const overrideItems = Array.isArray(overrides) ? overrides : [];

    return base.map((item, index) =>
      mergeLocalizedContent(item, overrideItems[index])
    ) as T;
  }

  if (base && typeof base === "object") {
    const overrideRecord =
      overrides && typeof overrides === "object" && !Array.isArray(overrides)
        ? (overrides as Record<string, unknown>)
        : {};

    return Object.fromEntries(
      Object.entries(base).map(([key, value]) => [
        key,
        mergeLocalizedContent(value, overrideRecord[key])
      ])
    ) as T;
  }

  return base;
}

export const content = {
  ...baseContent,
  "zh-CN": mergeLocalizedContent(baseContent.en, zhCnContentOverrides)
} satisfies Record<Locale, AdminContent>;
