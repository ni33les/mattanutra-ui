import { funnelBpmSource, liveFunnelAssessmentSql, isPlanPaymentEvent, planPaymentEventNames, webJourneyEventNames } from "@/lib/admin-funnel-events";
import { getAdminMcpFunnel, type McpFunnelReport } from "@/lib/admin-mcp-funnel";
import { getPharmacySourceFunnel, type PharmacySourceFunnel } from "@/lib/pharmacy-funnel";
import { getSql } from "@/lib/db";
import {
  adminDashboardFilterSql,
  type AdminDashboardFilters
} from "@/lib/admin-dashboard-filters";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import { writeBpmEvent } from "@/lib/bpm";
import { getQuestionnaireFunnelReport } from "@/lib/admin-questionnaire-data";
import type { QuestionnaireFunnelReport } from "@/lib/questionnaire-dropoffs";
import { getCurrentWebProductPaidJourneys, getWebProductReport, type WebProductPaidJourney, type WebProductReport } from "@/lib/admin-web-product-report";
import { WEB_PRODUCT_JOURNEY_VERSION } from "@/lib/web-product-journey";

export type AdminFlowNodeId =
  | "quizLandingViewed"
  | "resultsDisplayed"
  | "deliveryDetailsCompleted"
  | "productPaymentConfirmed"
  | "revealOpened"
  | "assessmentCaptured"
  | "formulaViewed"
  | "productsViewed"
  | "basketConfirmed"
  | "productCheckoutReady"
  | "assessmentStarted"
  | "assessmentSubmitted"
  | "assessmentViewed"
  | "chatClicked"
  | "dropoffAfterAssessment"
  | "dropoffAfterAssessmentStart"
  | "dropoffAfterFormulation"
  | "dropoffAfterHealthScore"
  | "dropoffAfterLanding"
  | "dropoffAfterPlanSelection"
  | "dropoffAfterProductCheckout"
  | "dropoffAfterDeliveryDetails"
  | "dropoffAfterProductPayment"
  | "dropoffAfterPrecisionPayment"
  | "dropoffAfterProPayment"
  | "dropoffAfterRetailOrder"
  | "dropoffAfterResults"
  | "dropoffAfterSubmission"
  | "deliveryDetailsConfirmed"
  | "formulationReady"
  | "healthscoreDisplayed"
  | "healthscoreViewed"
  | "landingViewed"
  | "marketplaceClicked"
  | "orderTrackingViewed"
  | "planSelected"
  | "precisionPaid"
  | "productCheckoutStarted"
  | "productCheckoutViewed"
  | "productPaymentSucceeded"
  | "proPaid"
  | "retailOrderAwaitingStock"
  | "retailOrderCancelled"
  | "retailOrderCreated"
  | "retailOrderDelivered"
  | "retailOrderReturned"
  | "retailOrderShipped"
  | "resultsViewed";

export type AdminFlowNode = Readonly<{
  count: number;
  id: AdminFlowNodeId;
}>;

export type AdminFlowEdge = Readonly<{
  count: number;
  from: AdminFlowNodeId;
  kind: "continue" | "dropoff";
  rate: number;
  to: AdminFlowNodeId;
}>;

export type AdminFlowData = Readonly<{
  productReport?: WebProductReport;
  productFunnel?: Array<{ id: AdminFlowNodeId; count: number; denominator: number | null; numerator: number | null }>;
  productEngagement?: AdminFlowNode[];
  questionnaire?: QuestionnaireFunnelReport;
  journeyChannel?: "web";
  mcp?: McpFunnelReport;
  transitions?: Partial<Record<AdminConversionTargetId, { numerator: number; denominator: number }>>;
  pharmacySources?: PharmacySourceFunnel[];
  databaseAvailable: boolean;
  reportingLimitExceeded?: boolean;
  edges: AdminFlowEdge[];
  generatedAt: string;
  nodes: AdminFlowNode[];
  range: AdminDashboardRange;
  series: {
    bucketLabels: string[];
    conversionRate?: number[];
    nodes: Partial<Record<AdminFlowNodeId, number[]>>;
  };
  summary: {
    conversionRate: number;
    conversionNumerator: number;
    conversionDenominator: number;
    converted: number;
    entered: number;
    reachedHealthScore: number;
    reachedResults: number;
  };
  targets: AdminConversionTargets;
}>;

export type AdminConversionTargetId =
  | "assessmentCompletions"
  | "assessmentStarts"
  | "healthScoreViews"
  | "landingVisitors"
  | "precisionConversions"
  | "productOrders"
  | "proConversions";

export type AdminConversionTargets = Record<AdminConversionTargetId, number>;

const conversionTargetIds: AdminConversionTargetId[] = [
  "landingVisitors",
  "assessmentStarts",
  "assessmentCompletions",
  "healthScoreViews",
  "precisionConversions",
  "productOrders",
  "proConversions"
];

export const defaultAdminConversionTargets = {
  assessmentCompletions: 65,
  assessmentStarts: 30,
  healthScoreViews: 95,
  landingVisitors: 100,
  precisionConversions: 5,
  productOrders: 5,
  proConversions: 1
} satisfies AdminConversionTargets;

export type FlowRow = Readonly<{
  event_name: string;
  event_status: string | null;
  event_type: string | null;
  id: string;
  occurred_at: Date | string;
  plan_id: string | null;
  ray: string | null;
  selected_plan: string | null;
  /** Persisted assessment identity; event hints cannot promote a legacy plan. */
  journey_version?: string | null;
  event_journey_version?: string | null;
  path?: string | null;
  session_id?: string | null;
  attempt_id?: string | null;
  post_completion_review?: boolean;
}>;

const coreNodeIds: AdminFlowNodeId[] = [
  "quizLandingViewed", "resultsDisplayed", "deliveryDetailsCompleted", "productPaymentConfirmed",
  "assessmentCaptured", "revealOpened", "formulaViewed", "productsViewed", "basketConfirmed", "productCheckoutReady",
  "landingViewed",
  "assessmentViewed",
  "assessmentStarted",
  "assessmentSubmitted",
  "healthscoreViewed",
  "healthscoreDisplayed",
  "planSelected",
  "precisionPaid",
  "proPaid",
  "formulationReady",
  "resultsViewed",
  "chatClicked",
  "marketplaceClicked",
  "productCheckoutViewed",
  "deliveryDetailsConfirmed",
  "productCheckoutStarted",
  "productPaymentSucceeded",
  "retailOrderCreated",
  "retailOrderAwaitingStock",
  "retailOrderShipped",
  "retailOrderDelivered",
  "retailOrderCancelled",
  "retailOrderReturned",
  "orderTrackingViewed"
];

const dropoffNodeIds: AdminFlowNodeId[] = [
  "dropoffAfterLanding",
  "dropoffAfterAssessment",
  "dropoffAfterAssessmentStart",
  "dropoffAfterSubmission",
  "dropoffAfterHealthScore",
  "dropoffAfterPlanSelection",
  "dropoffAfterProductCheckout",
  "dropoffAfterDeliveryDetails",
  "dropoffAfterProductPayment",
  "dropoffAfterPrecisionPayment",
  "dropoffAfterProPayment",
  "dropoffAfterRetailOrder",
  "dropoffAfterFormulation",
  "dropoffAfterResults"
];

const nodeIds: AdminFlowNodeId[] = [...coreNodeIds, ...dropoffNodeIds];

const continueEdgeDefinitions: Array<
  Readonly<{ from: AdminFlowNodeId; to: AdminFlowNodeId }>
> = [
  { from: "landingViewed", to: "assessmentViewed" },
  { from: "assessmentViewed", to: "assessmentStarted" },
  { from: "assessmentStarted", to: "assessmentSubmitted" },
  { from: "assessmentSubmitted", to: "healthscoreViewed" },
  { from: "healthscoreViewed", to: "planSelected" },
  { from: "planSelected", to: "precisionPaid" },
  { from: "planSelected", to: "proPaid" },
  { from: "precisionPaid", to: "formulationReady" },
  { from: "proPaid", to: "formulationReady" },
  { from: "formulationReady", to: "resultsViewed" },
  { from: "resultsViewed", to: "chatClicked" },
  { from: "resultsViewed", to: "marketplaceClicked" },
  { from: "resultsViewed", to: "productCheckoutViewed" },
  { from: "productCheckoutViewed", to: "deliveryDetailsConfirmed" },
  { from: "deliveryDetailsConfirmed", to: "productCheckoutStarted" },
  { from: "productCheckoutStarted", to: "productPaymentSucceeded" },
  { from: "productPaymentSucceeded", to: "retailOrderCreated" },
  { from: "retailOrderCreated", to: "retailOrderAwaitingStock" },
  { from: "retailOrderCreated", to: "retailOrderShipped" },
  { from: "retailOrderAwaitingStock", to: "retailOrderShipped" },
  { from: "retailOrderShipped", to: "retailOrderDelivered" },
  { from: "retailOrderCreated", to: "retailOrderCancelled" },
  { from: "retailOrderShipped", to: "retailOrderReturned" },
  { from: "retailOrderCreated", to: "orderTrackingViewed" }
];

const dropoffNodeByStage = {
  assessmentStarted: "dropoffAfterAssessmentStart",
  assessmentSubmitted: "dropoffAfterSubmission",
  assessmentViewed: "dropoffAfterAssessment",
  formulationReady: "dropoffAfterFormulation",
  healthscoreViewed: "dropoffAfterHealthScore",
  landingViewed: "dropoffAfterLanding",
  planSelected: "dropoffAfterPlanSelection",
  productCheckoutViewed: "dropoffAfterProductCheckout",
  deliveryDetailsConfirmed: "dropoffAfterDeliveryDetails",
  productPaymentSucceeded: "dropoffAfterProductPayment",
  precisionPaid: "dropoffAfterPrecisionPayment",
  proPaid: "dropoffAfterProPayment",
  retailOrderCreated: "dropoffAfterRetailOrder",
  resultsViewed: "dropoffAfterResults"
} satisfies Partial<Record<AdminFlowNodeId, AdminFlowNodeId>>;

const edgeDefinitions: AdminFlowEdge[] = [
  ...continueEdgeDefinitions.map((edge) => ({
    ...edge,
    count: 0,
    kind: "continue" as const,
    rate: 0
  })),
  ...Object.entries(dropoffNodeByStage).map(([from, to]) => ({
    count: 0,
    from: from as AdminFlowNodeId,
    kind: "dropoff" as const,
    rate: 0,
    to
  }))
];

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);

  return next;
}

function startOfHour(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours()
    )
  );
}

function startOfDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfFiveMinuteBucket(date: Date) {
  const bucketMinute = Math.floor(date.getUTCMinutes() / 5) * 5;

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      bucketMinute
    )
  );
}

function queryStartForRange(range: AdminDashboardRange) {
  const now = new Date();

  if (range === "all") {
    return null;
  }

  if (range === "hour") {
    return addMinutes(addMinutes(startOfFiveMinuteBucket(now), 5), -60);
  }

  if (range === "day") {
    return addHours(addHours(startOfHour(now), 1), -24);
  }

  if (range === "week") {
    return addDays(addDays(startOfDay(now), 1), -7);
  }

  if (range === "month") {
    return addDays(addDays(startOfDay(now), 1), -30);
  }

  return addMonths(addMonths(startOfMonth(now), 1), -12);
}

function bucketDateFormatter(range: AdminDashboardRange) {
  if (range === "hour") {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC"
    });
  }

  if (range === "day") {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      timeZone: "UTC"
    });
  }

  if (range === "year" || range === "all") {
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      timeZone: "UTC"
    });
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC"
  });
}

function buildFlowBuckets(range: AdminDashboardRange, rows: readonly Pick<FlowRow, "occurred_at">[]) {
  const now = new Date();
  const buckets: Array<{ end: Date; label: string; start: Date }> = [];
  const formatter = bucketDateFormatter(range);

  if (range === "hour") {
    const end = addMinutes(startOfFiveMinuteBucket(now), 5);
    const start = addMinutes(end, -60);

    for (
      let bucketStart = start;
      bucketStart < end;
      bucketStart = addMinutes(bucketStart, 5)
    ) {
      buckets.push({
        end: addMinutes(bucketStart, 5),
        label: formatter.format(bucketStart),
        start: bucketStart
      });
    }

    return buckets;
  }

  if (range === "day") {
    const end = addHours(startOfHour(now), 1);
    const start = addHours(end, -24);

    for (
      let bucketStart = start;
      bucketStart < end;
      bucketStart = addHours(bucketStart, 1)
    ) {
      buckets.push({
        end: addHours(bucketStart, 1),
        label: formatter.format(bucketStart),
        start: bucketStart
      });
    }

    return buckets;
  }

  if (range === "week") {
    const end = addDays(startOfDay(now), 1);
    const start = addDays(end, -7);

    for (
      let bucketStart = start;
      bucketStart < end;
      bucketStart = addDays(bucketStart, 1)
    ) {
      buckets.push({
        end: addDays(bucketStart, 1),
        label: formatter.format(bucketStart),
        start: bucketStart
      });
    }

    return buckets;
  }

  if (range === "month") {
    const end = addDays(startOfDay(now), 1);
    const start = addDays(end, -30);

    for (
      let bucketStart = start;
      bucketStart < end;
      bucketStart = addDays(bucketStart, 1)
    ) {
      buckets.push({
        end: addDays(bucketStart, 1),
        label: formatter.format(bucketStart),
        start: bucketStart
      });
    }

    return buckets;
  }

  const end = addMonths(startOfMonth(now), 1);
  const earliest =
    rows.length > 0
      ? startOfMonth(
          rows.reduce((min, row) => {
            const occurredAt = new Date(row.occurred_at);

            return occurredAt < min ? occurredAt : min;
          }, now)
        )
      : addMonths(end, -12);
  const start = range === "all" ? earliest : addMonths(end, -12);

  for (
    let bucketStart = start;
    bucketStart < end;
    bucketStart = addMonths(bucketStart, 1)
  ) {
    buckets.push({
      end: addMonths(bucketStart, 1),
      label: formatter.format(bucketStart),
      start: bucketStart
    });
  }

  return buckets;
}

function emptyFlowSeries(range: AdminDashboardRange) {
  const buckets = buildFlowBuckets(range, []);

  return {
    bucketLabels: buckets.map((bucket) => bucket.label),
    nodes: Object.fromEntries(
      coreNodeIds.map((id) => [id, buckets.map(() => 0)])
    ) as Partial<Record<AdminFlowNodeId, number[]>>
  };
}

function nodesForRow(row: FlowRow): AdminFlowNodeId[] {
  if (
    row.event_name === "home_viewed" ||
    row.event_name === "blog_article_viewed" ||
    row.event_name === "library_article_viewed"
  ) {
    return ["landingViewed"];
  }

  if (row.event_name === "assessment_viewed") {
    return ["landingViewed", "assessmentViewed"];
  }

  if (row.event_name === "assessment_started") {
    return ["assessmentStarted"];
  }

  if (
    row.event_name === "assessment_submitted" ||
    row.event_name === "assessment_captured" ||
    row.event_name === "assessment_recaptured"
  ) {
    return row.event_name === "assessment_submitted" ? ["assessmentSubmitted"] : ["assessmentSubmitted", "assessmentCaptured"];
  }

  if (row.event_name === "healthscore_viewed") {
    return ["landingViewed", "healthscoreViewed", "healthscoreDisplayed"];
  }

  if (row.event_name === "healthscore_page_viewed") {
    return ["landingViewed", "healthscoreViewed"];
  }

  if (row.event_name === "web_page_viewed") return ["landingViewed"];
  if (row.event_name === "reveal_page_viewed") return ["landingViewed", "revealOpened"];
  if (row.event_name === "formula_details_viewed") return ["formulaViewed"];
  if (row.event_name === "product_matches_viewed") return ["productsViewed"];
  if (row.event_name === "product_basket_confirmed") return ["basketConfirmed"];

  if (row.event_name === "plan_selected") {
    return ["planSelected"];
  }

  if (isPlanPaymentEvent(row) && row.selected_plan === "precision") {
    return ["precisionPaid"];
  }

  if (isPlanPaymentEvent(row) && row.selected_plan === "pro") {
    return ["proPaid"];
  }

  if (row.event_name === "formulation_ready") {
    return ["formulationReady"];
  }

  if (row.event_name === "formulation_page_viewed") {
    return ["landingViewed", "resultsViewed"];
  }

  if (row.event_name === "chat_channel_clicked") {
    return ["chatClicked"];
  }

  if (row.event_name === "product_clicked") {
    return ["marketplaceClicked"];
  }

  if (row.event_name === "retail_product_checkout_viewed") {
    return ["landingViewed", "productCheckoutViewed"];
  }

  if (row.event_name === "retail_delivery_details_confirmed") {
    return ["deliveryDetailsConfirmed"];
  }

  if (
    row.event_name === "retail_product_checkout_requested" ||
    row.event_name === "retail_product_checkout_session_created" ||
    row.event_name === "retail_product_checkout_opened"
  ) {
    return row.event_name === "retail_product_checkout_requested" ? ["productCheckoutStarted"] : ["productCheckoutStarted", "productCheckoutReady"];
  }

  if (row.event_name === "retail_product_payment_succeeded") {
    return ["productPaymentSucceeded"];
  }

  if (
    row.event_name === "retail_customer_order_created" ||
    row.event_name === "retail_order_created"
  ) {
    return ["retailOrderCreated"];
  }

  if (row.event_name === "retail_order_awaiting_stock") {
    return ["retailOrderAwaitingStock"];
  }

  if (row.event_name === "retail_order_shipped") {
    return ["retailOrderShipped"];
  }

  if (row.event_name === "retail_order_delivered") {
    return ["retailOrderDelivered"];
  }

  if (row.event_name === "retail_order_cancelled") {
    return ["retailOrderCancelled"];
  }

  if (row.event_name === "retail_order_returned") {
    return ["retailOrderReturned"];
  }

  if (row.event_name === "order_tracking_viewed") {
    return ["landingViewed", "orderTrackingViewed"];
  }

  return [];
}

function edgeKey(from: AdminFlowNodeId, to: AdminFlowNodeId) {
  return `${from}->${to}`;
}

export function emptyFlow(range: AdminDashboardRange): AdminFlowData {
  return {
    databaseAvailable: false,
    edges: edgeDefinitions,
    generatedAt: new Date().toISOString(),
    nodes: nodeIds.map((id) => ({ count: 0, id })),
    range,
    series: emptyFlowSeries(range),
    summary: {
      conversionRate: 0,
      conversionNumerator: 0,
      conversionDenominator: 0,
      converted: 0,
      entered: 0,
      reachedHealthScore: 0,
      reachedResults: 0
    },
    targets: defaultAdminConversionTargets
  };
}

function normalizeTargetValue(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(100, Number(parsed.toFixed(1))));
}

async function ensureAdminConversionTargetsSchema() {
  const sql = getSql();

  if (!sql) {
    return false;
  }

  const requiredColumns = [
    "target_id",
    "target_rate",
    "description",
    "updated_by",
    "updated_at",
    "created_at"
  ];
  const rows = await sql<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_conversion_targets'
  `;
  const available = new Set(rows.map((row) => row.column_name));

  if (!requiredColumns.every((column) => available.has(column))) {
    throw new Error(
      "Admin conversion target schema is incomplete. Apply db-schema.sql before using conversion targets."
    );
  }

  return true;
}

export async function getAdminConversionTargets(): Promise<AdminConversionTargets> {
  const sql = getSql();

  if (!sql || !(await ensureAdminConversionTargetsSchema())) {
    return defaultAdminConversionTargets;
  }

  const rows = await sql<
    Array<{
      target_id: string;
      target_rate: number | string;
    }>
  >`
    select target_id, target_rate
    from public.admin_conversion_targets
    where target_id = any(${conversionTargetIds}::text[])
  `;
  const targets = { ...defaultAdminConversionTargets };

  rows.forEach((row) => {
    const id = row.target_id as AdminConversionTargetId;
    const value = normalizeTargetValue(row.target_rate);

    if (conversionTargetIds.includes(id) && value !== null) {
      targets[id] = value;
    }
  });

  return targets;
}

export async function updateAdminConversionTargets(input: Readonly<{
  actor?: string | null;
  targets: Partial<Record<AdminConversionTargetId, unknown>>;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureAdminConversionTargetsSchema();

  const entries = conversionTargetIds
    .map((id) => {
      const value = normalizeTargetValue(input.targets[id]);

      return value === null ? null : { id, value };
    })
    .filter((entry): entry is { id: AdminConversionTargetId; value: number } =>
      Boolean(entry)
    );

  if (entries.length === 0) {
    throw new Error("At least one conversion target is required");
  }

  for (const entry of entries) {
    await sql`
      insert into public.admin_conversion_targets (
        target_id,
        target_rate,
        updated_by,
        created_at,
        updated_at
      )
      values (
        ${entry.id},
        ${entry.value},
        ${input.actor ?? "admin_dashboard"},
        now(),
        now()
      )
      on conflict (target_id) do update set
        target_rate = excluded.target_rate,
        updated_by = excluded.updated_by,
        updated_at = now()
    `;
  }

  await writeBpmEvent({
    actorType: "admin",
    eventName: "admin_conversion_targets_updated",
    eventType: "system",
    properties: {
      targetIds: entries.map((entry) => entry.id)
    }
  });

  return getAdminConversionTargets();
}

const maxFlowEventRows = 100_000;

const productStages: AdminFlowNodeId[] = [
  "quizLandingViewed", "assessmentStarted", "assessmentCaptured", "revealOpened", "resultsDisplayed",
  "basketConfirmed", "productCheckoutViewed", "deliveryDetailsCompleted", "productCheckoutReady", "productPaymentConfirmed"
];
const productEngagementStages: AdminFlowNodeId[] = ["formulaViewed", "productsViewed", "healthscoreDisplayed"];
const currentOnlyNodeIds: AdminFlowNodeId[] = ["quizLandingViewed", "resultsDisplayed", "deliveryDetailsCompleted", "productPaymentConfirmed"];

function isQuizArrival(row: FlowRow) {
  return row.event_name === "web_quiz_landing_viewed" ||
    row.event_name === "assessment_viewed" && /^\/(en|th|zh-CN)\/nutrition\/quiz\/?$/.test(row.path ?? "");
}

function currentProductNodes(row: FlowRow): AdminFlowNodeId[] {
  if (isQuizArrival(row)) return ["quizLandingViewed"];
  if (row.event_name === "assessment_started") return row.post_completion_review ? [] : ["assessmentStarted"];
  if (row.event_name === "assessment_captured" || row.event_name === "assessment_recaptured") return ["assessmentCaptured"];
  if (row.event_name === "reveal_page_viewed") return ["revealOpened"];
  if (row.event_name === "web_results_displayed") return ["resultsDisplayed"];
  if (row.event_name === "formula_details_viewed") return ["resultsDisplayed", "formulaViewed"];
  if (row.event_name === "product_matches_viewed") return ["resultsDisplayed", "productsViewed"];
  if (row.event_name === "healthscore_viewed") return ["healthscoreDisplayed"];
  if (row.event_name === "product_basket_confirmed") return ["basketConfirmed"];
  if (row.event_name === "retail_product_checkout_viewed") return ["productCheckoutViewed"];
  if (row.event_name === "web_delivery_details_completed") return ["deliveryDetailsCompleted"];
  if (row.event_name === "retail_product_checkout_session_created") return ["productCheckoutReady"];
  // Neither payment telemetry nor an order record is proof of paid funds.
  return [];
}

/** Explicit questionnaire identity survives long sessions and browser-ray changes.
 * Ambiguous identities never merge two plans; old telemetry retains a bounded ray fallback.
 * A saved legacy plan cannot enter the current cohort merely by emitting a new event. */
function currentProductSubjects(rows: readonly FlowRow[], payments: readonly WebProductPaidJourney[]) {
  const plans = new Map(rows.filter(row => row.plan_id).map(row => [row.plan_id!, row.journey_version]));
  for (const payment of payments) plans.set(payment.plan_id, WEB_PRODUCT_JOURNEY_VERSION);
  const planRows = rows.filter(row => row.plan_id).toSorted((a, b) => +new Date(a.occurred_at) - +new Date(b.occurred_at));
  type Identity = { plans: Set<string>; captures: FlowRow[] };
  const indexes = { attempt_id: new Map<string, Identity>(), session_id: new Map<string, Identity>(), ray: new Map<string, Identity>() };
  for (const row of planRows) for (const field of ["attempt_id", "session_id", "ray"] as const) {
    const value = row[field];
    if (!value) continue;
    const identity = indexes[field].get(value) ?? { plans: new Set<string>(), captures: [] };
    identity.plans.add(row.plan_id!);
    if (["assessment_captured", "assessment_recaptured"].includes(row.event_name)) identity.captures.push(row);
    indexes[field].set(value, identity);
  }
  const nextEvent = (events: readonly FlowRow[], time: number) => {
    let low = 0, high = events.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (+new Date(events[middle].occurred_at) < time) low = middle + 1;
      else high = middle;
    }
    return events[low];
  };
  const keyFor = (row: FlowRow) => {
    if (row.plan_id) return `plan:${row.plan_id}`;
    const time = +new Date(row.occurred_at);
    if (row.attempt_id) {
      const identity = indexes.attempt_id.get(row.attempt_id);
      if (identity?.plans.size === 1) return `plan:${identity.plans.values().next().value}`;
      const next = nextEvent(identity?.captures ?? [], time);
      if (next) return `plan:${next.plan_id}`;
      return row.session_id ? `session:${row.session_id}` : `attempt:${row.attempt_id}`;
    }
    if (row.session_id) {
      // Welcome has no attempt yet. A previous capture is not this new quiz.
      const next = nextEvent(indexes.session_id.get(row.session_id)?.captures ?? [], time);
      return next ? `plan:${next.plan_id}` : `session:${row.session_id}`;
    }
    const next = row.ray ? nextEvent(indexes.ray.get(row.ray)?.captures ?? [], time) : undefined;
    if (next && +new Date(next.occurred_at) - time <= 30 * 60_000) return `plan:${next.plan_id}`;
    return row.ray ? `ray:${row.ray}` : `row:${row.id}`;
  };
  const keyed = rows.map(row => ({ row, key: keyFor(row) }));
  const arrivals = new Map<string, Date>();
  const currentAnonymous = new Set(keyed.filter(({ row }) => row.event_name === "web_quiz_landing_viewed" ||
    row.event_journey_version === WEB_PRODUCT_JOURNEY_VERSION).map(({ key }) => key));
  for (const { row, key } of keyed) if (isQuizArrival(row)) {
    const at = new Date(row.occurred_at), prior = arrivals.get(key);
    if (!prior || at < prior) arrivals.set(key, at);
  }
  const subjects = new Map<string, Map<AdminFlowNodeId, Date>>();
  const record = (key: string, id: AdminFlowNodeId, at: Date) => {
    const steps = subjects.get(key) ?? new Map<AdminFlowNodeId, Date>();
    const prior = steps.get(id);
    if (!prior || at < prior) steps.set(id, at);
    subjects.set(key, steps);
  };
  for (const { row, key } of keyed) {
    const at = new Date(row.occurred_at), arrival = arrivals.get(key);
    if (key.startsWith("plan:")) {
      if (plans.get(key.slice(5)) !== WEB_PRODUCT_JOURNEY_VERSION) continue;
    } else if (!currentAnonymous.has(key) || arrival && at < arrival) continue;
    for (const id of currentProductNodes(row)) record(key, id, at);
  }
  for (const payment of payments) record(`plan:${payment.plan_id}`, "productPaymentConfirmed", new Date(payment.paid_at));
  return subjects;
}

/** Pure aggregation shared by the report and regression tests. Counts never imply missing steps. */
export function buildAdminFlowData(range: AdminDashboardRange, rows: readonly FlowRow[], targets: AdminConversionTargets = defaultAdminConversionTargets, payments: readonly WebProductPaidJourney[] = []): AdminFlowData {
    // Never compare complete payment facts with a silently truncated event cohort.
    if (rows.length > maxFlowEventRows) return { ...emptyFlow(range), databaseAvailable: true, reportingLimitExceeded: true };
    const planEventsByRay = new Map<
      string,
      Array<{ planId: string; time: Date }>
    >();

    rows.forEach((row) => {
      if (!row.ray || !row.plan_id) {
        return;
      }

      const events = planEventsByRay.get(row.ray) ?? [];

      events.push({
        planId: row.plan_id,
        time: new Date(row.occurred_at)
      });
      planEventsByRay.set(row.ray, events);
    });

    planEventsByRay.forEach((events) => {
      events.sort((left, right) => left.time.getTime() - right.time.getTime());
    });

    const keyForRow = (row: FlowRow) => {
      if (row.plan_id) {
        return row.plan_id;
      }

      if (!row.ray) {
        return row.id;
      }

      const occurredAt = new Date(row.occurred_at);
      const nextPlanEvent = planEventsByRay.get(row.ray)?.find((event) => {
        const deltaMs = event.time.getTime() - occurredAt.getTime();

        return deltaMs >= 0 && deltaMs <= 30 * 60_000;
      });

      return nextPlanEvent?.planId ?? row.ray;
    };

    const subjects = new Map<string, Map<AdminFlowNodeId, Date>>();

    rows.forEach((row) => {
      const rowNodes = nodesForRow(row);

      if (rowNodes.length === 0) {
        return;
      }

      const key = keyForRow(row);
      const steps = subjects.get(key) ?? new Map<AdminFlowNodeId, Date>();
      const occurredAt = new Date(row.occurred_at);

      rowNodes.forEach((nodeId) => {
        const existing = steps.get(nodeId);

        if (!existing || occurredAt < existing) {
          steps.set(nodeId, occurredAt);
        }
      });

      subjects.set(key, steps);
    });

    const nodes = coreNodeIds.map((id) => ({
      count: [...subjects.values()].filter((steps) => steps.has(id)).length,
      id
    }));
    const buckets = buildFlowBuckets(range, [...rows, ...payments.map(payment => ({ occurred_at: payment.paid_at }))]);
    const seriesByNode = Object.fromEntries(
      coreNodeIds.map((id) => [id, buckets.map(() => 0)])
    ) as Partial<Record<AdminFlowNodeId, number[]>>;

    subjects.forEach((steps) => {
      coreNodeIds.forEach((nodeId) => {
        const occurredAt = steps.get(nodeId);

        if (!occurredAt) {
          return;
        }

        const bucketIndex = buckets.findIndex(
          (bucket) => occurredAt >= bucket.start && occurredAt < bucket.end
        );

        if (bucketIndex !== -1) {
          seriesByNode[nodeId]![bucketIndex] += 1;
        }
      });
    });
    const countByNode = new Map(nodes.map((node) => [node.id, node.count]));
    const nextNodesByStage = continueEdgeDefinitions.reduce(
      (map, edge) => {
        const nextNodes = map.get(edge.from) ?? [];

        nextNodes.push(edge.to);
        map.set(edge.from, nextNodes);

        return map;
      },
      new Map<AdminFlowNodeId, AdminFlowNodeId[]>()
    );
    const continueCountByEdge = new Map<string, number>();
    const dropoffCountByNode = new Map<AdminFlowNodeId, number>();

    subjects.forEach((steps) => {
      nextNodesByStage.forEach((nextNodes, from) => {
        const fromTime = steps.get(from);

        if (!fromTime) {
          return;
        }

        const nextSteps = nextNodes
          .map((to) => ({ time: steps.get(to), to }))
          .filter(
            (candidate): candidate is { time: Date; to: AdminFlowNodeId } =>
              Boolean(candidate.time && candidate.time >= fromTime)
          );

        if (nextSteps.length > 0) {
          nextSteps.forEach((nextStep) => {
            const key = edgeKey(from, nextStep.to);

            continueCountByEdge.set(
              key,
              (continueCountByEdge.get(key) ?? 0) + 1
            );
          });
          return;
        }

        const dropoffNodeId = (
          dropoffNodeByStage as Partial<Record<AdminFlowNodeId, AdminFlowNodeId>>
        )[from];

        if (dropoffNodeId) {
          dropoffCountByNode.set(
            dropoffNodeId,
            (dropoffCountByNode.get(dropoffNodeId) ?? 0) + 1
          );
        }
      });
    });

    const continueEdges = continueEdgeDefinitions.map((edge) => {
      const count = continueCountByEdge.get(edgeKey(edge.from, edge.to)) ?? 0;
      const fromCount = countByNode.get(edge.from) ?? 0;

      return {
        ...edge,
        count,
        kind: "continue" as const,
        rate: fromCount > 0 ? Number(((count / fromCount) * 100).toFixed(1)) : 0
      };
    });
    const dropoffEdges = Object.entries(dropoffNodeByStage).map(
      ([fromNodeId, to]) => {
        const from = fromNodeId as AdminFlowNodeId;
        const count = dropoffCountByNode.get(to) ?? 0;
        const fromCount = countByNode.get(from) ?? 0;

        return {
          count,
          from,
          kind: "dropoff" as const,
          rate:
            fromCount > 0 ? Number(((count / fromCount) * 100).toFixed(1)) : 0,
          to
        };
      }
    );
    const dropoffNodes = Object.entries(dropoffNodeByStage).map(
      ([, dropoffNodeId]) => {
        const count = dropoffCountByNode.get(dropoffNodeId) ?? 0;

        countByNode.set(dropoffNodeId, count);

        return {
          count,
          id: dropoffNodeId
        };
      }
    );
    const edges = [...continueEdges, ...dropoffEdges];
    const productSubjects = [...currentProductSubjects(rows, payments).values()];
    const productCount = (id: AdminFlowNodeId) => productSubjects.filter(steps => steps.has(id)).length;
    const entered = productCount("quizLandingViewed");
    const convertedAfterQuiz = productSubjects.filter(steps => {
      const arrived = steps.get("quizLandingViewed"), paid = steps.get("productPaymentConfirmed");
      return arrived && paid && paid >= arrived;
    });
    for (const id of currentOnlyNodeIds) {
      const count = productCount(id);
      const node = nodes.find(node => node.id === id)!;
      node.count = count;
      countByNode.set(id, count);
      seriesByNode[id] = buckets.map(bucket => productSubjects.filter(steps => {
        const at = steps.get(id);
        return at && at >= bucket.start && at < bucket.end;
      }).length);
    }
    const conversionRateSeries = buckets.map((bucket, index) => {
      const denominator = seriesByNode.quizLandingViewed?.[index] ?? 0;
      const numerator = convertedAfterQuiz.filter(steps => {
        const arrived = steps.get("quizLandingViewed")!;
        return arrived >= bucket.start && arrived < bucket.end;
      }).length;
      return denominator ? 100 * numerator / denominator : 0;
    });
    const reachedHealthScore = countByNode.get("healthscoreViewed") ?? 0;

    const stagePairs: Array<[AdminConversionTargetId, AdminFlowNodeId, AdminFlowNodeId]> = [
      ["assessmentStarts", "landingViewed", "assessmentStarted"],
      ["assessmentCompletions", "assessmentStarted", "assessmentSubmitted"],
      ["healthScoreViews", "assessmentSubmitted", "healthscoreViewed"],
      ["precisionConversions", "healthscoreViewed", "precisionPaid"],
      ["proConversions", "healthscoreViewed", "proPaid"],
      ["productOrders", "healthscoreViewed", "retailOrderCreated"]
    ];
    const transitions = Object.fromEntries(stagePairs.map(([id, from, to]) => [id, {
      denominator: countByNode.get(from) ?? 0,
      numerator: [...subjects.values()].filter(steps => {
        const entered = steps.get(from), advanced = steps.get(to);
        return entered && advanced && advanced >= entered;
      }).length
    }]));
    const productFunnel = productStages.map((id, index) => {
      const previous = productStages[index - 1];
      return { id, count: productCount(id), denominator: previous ? productCount(previous) : null,
        numerator: previous ? productSubjects.filter(steps => {
          const before = steps.get(previous), after = steps.get(id);
          return before && after && after >= before;
        }).length : null };
    });
    return {
      databaseAvailable: true,
      journeyChannel: "web",
      productFunnel,
      productEngagement: productEngagementStages.map(id => ({ id, count: productCount(id) })),
      transitions,
      edges,
      generatedAt: new Date().toISOString(),
      nodes: [...nodes, ...dropoffNodes],
      range,
      series: {
        bucketLabels: buckets.map((bucket) => bucket.label),
        conversionRate: conversionRateSeries,
        nodes: seriesByNode
      },
      summary: {
        conversionRate: entered ? Number((100 * convertedAfterQuiz.length / entered).toFixed(1)) : 0,
        conversionNumerator: convertedAfterQuiz.length,
        conversionDenominator: entered,
        converted: productCount("productPaymentConfirmed"),
        entered,
        reachedResults: productCount("resultsDisplayed"),
        reachedHealthScore
      },
      targets
    };

}

export async function getAdminFlowData(range: AdminDashboardRange, filters: AdminDashboardFilters): Promise<AdminFlowData> {
  const sql = getSql();
  if (!sql) return emptyFlow(range);
  try {
    const start = queryStartForRange(range);
    const names = [...webJourneyEventNames, ...planPaymentEventNames];
    const [targets, rows, pharmacySources, mcp, questionnaire, productReport, paidJourneys] = await Promise.all([
      getAdminConversionTargets(),
      sql<FlowRow[]>`
        select id::text,ray::text,plan_id::text,funnel_event_name as event_name,event_type,event_status,selected_plan::text,occurred_at,
          (select a.journey_version from public.assessments a where a.plan_id=bpm.plan_id
            and ${liveFunnelAssessmentSql(sql)}) as journey_version,
          coalesce(path,route) as path, properties->>'journeyVersion' as event_journey_version,
          properties->>'sessionId' as session_id, properties->>'attemptId' as attempt_id,
          coalesce(properties->>'postCompletionReview','false')='true' as post_completion_review
        from ${funnelBpmSource(sql)}
        where journey_channel='web' and (${start}::timestamptz is null or occurred_at>=${start})
          and ${adminDashboardFilterSql(sql, filters)}
          and (funnel_event_name=any(${names}::text[]) or event_type='payment')
        order by occurred_at,id limit ${maxFlowEventRows + 1}`,
      getPharmacySourceFunnel(start, filters),
      getAdminMcpFunnel(start),
      getQuestionnaireFunnelReport(range, filters),
      getWebProductReport(start, filters, { currentJourneyOnly: true }),
      getCurrentWebProductPaidJourneys(start, filters)
    ]);
    return { ...buildAdminFlowData(range, rows, targets, paidJourneys), pharmacySources, mcp, questionnaire, productReport };
  } catch (error) {
    console.error("Unable to load admin flow data", error);
    return emptyFlow(range);
  }
}
