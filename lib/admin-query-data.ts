import {
  adminDashboardRangeStart,
  normalizeAdminDashboardRange,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import {
  adminDashboardFilterSql,
  normalizeAdminDashboardFilters,
  type AdminDashboardFilters
} from "@/lib/admin-dashboard-filters";
import { getAdminCommunicationsData } from "@/lib/admin-communications";
import {
  getAdminAgentsData,
  getAdminTaskVisibilityData
} from "@/lib/admin-execution";
import {
  getAdminFlowData,
  type AdminFlowData,
  type AdminFlowNodeId
} from "@/lib/admin-flow-data";
import { getAdminGoalsData } from "@/lib/admin-goals";
import { getAdminReviewQueueData } from "@/lib/admin-review-queue";
import { getAdminSupplementsData } from "@/lib/admin-supplements";
import { getAdminTechnicalAlertsData } from "@/lib/admin-technical";
import { getSql } from "@/lib/db";

export type AdminExternalQueryView =
  | "agents"
  | "alerts"
  | "campaigns"
  | "communications"
  | "content"
  | "conversions"
  | "glance"
  | "goals"
  | "leads"
  | "reviews"
  | "supplements"
  | "tasks";

type QueryParams = Readonly<{
  cursor: number;
  filters: AdminDashboardFilters;
  limit: number;
  range: AdminDashboardRange;
  status: string;
}>;

type Pagination = Readonly<{
  cursor: string | null;
  limit: number;
  nextCursor: string | null;
}>;

type CampaignRow = Readonly<{
  affiliate: string | null;
  assessmentCompletions: number;
  assessmentStarts: number;
  campaign: string | null;
  campaignId: string | null;
  firstSeenAt: string;
  freeRequests: number;
  healthScoreViews: number;
  landed: number;
  lastSeenAt: string;
  medium: string | null;
  precisionConversions: number;
  proConversions: number;
  promoCode: string | null;
  source: string | null;
}>;

type LeadRow = Readonly<{
  campaign: string | null;
  communicationIssues: number;
  currentStage: string;
  emailHash: string | null;
  firstSeenAt: string;
  lastEvent: string;
  lastSeenAt: string;
  locale: string | null;
  pendingReviews: number;
  planId: string | null;
  ray: string | null;
  selectedPlan: string | null;
  source: string | null;
  subject: string;
}>;

type ContentInventoryRow = Readonly<{
  contentType: "blog_post" | "testimonial";
  createdAt: string;
  id: string;
  locale: string;
  publishedAt: string | null;
  slug: string | null;
  sourceAgent: string | null;
  sourceChannel: string | null;
  sourceRef: string | null;
  status: string;
  summary: string | null;
  title: string;
  updatedAt: string;
}>;

const views = new Set<AdminExternalQueryView>([
  "agents",
  "alerts",
  "campaigns",
  "communications",
  "content",
  "conversions",
  "glance",
  "goals",
  "leads",
  "reviews",
  "supplements",
  "tasks"
]);

const paidEventNames = new Set([
  "checkout_completed",
  "checkout_paid",
  "payment_completed",
  "payment_confirmed",
  "payment_succeeded",
  "plan_paid"
]);

const paidEventStatuses = new Set([
  "complete",
  "completed",
  "paid",
  "success",
  "succeeded"
]);

export function normalizeAdminExternalQueryView(
  value: string
): AdminExternalQueryView | null {
  return views.has(value as AdminExternalQueryView)
    ? (value as AdminExternalQueryView)
    : null;
}

function paramsRecord(searchParams: URLSearchParams) {
  const record: Record<string, string> = {};

  searchParams.forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

function normalizeLimit(value: string | null) {
  const parsed = value ? Number(value) : 50;

  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.max(1, Math.min(100, Math.round(parsed)));
}

function normalizeCursor(value: string | null) {
  const parsed = value ? Number(value) : 0;

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeQueryParams(searchParams: URLSearchParams): QueryParams {
  const record = paramsRecord(searchParams);

  return {
    cursor: normalizeCursor(searchParams.get("cursor")),
    filters: normalizeAdminDashboardFilters(record),
    limit: normalizeLimit(searchParams.get("limit")),
    range: normalizeAdminDashboardRange(searchParams.get("range") ?? undefined),
    status: (searchParams.get("status") ?? "").trim().slice(0, 80)
  };
}

function paginate<T>(rows: readonly T[], params: QueryParams) {
  const start = params.cursor;
  const pageRows = rows.slice(start, start + params.limit);
  const nextCursor =
    start + params.limit < rows.length ? String(start + params.limit) : null;

  return {
    pageRows,
    pagination: {
      cursor: start > 0 ? String(start) : null,
      limit: params.limit,
      nextCursor
    } satisfies Pagination
  };
}

function queryEnvelope(
  data: unknown,
  params: QueryParams,
  pagination?: Pagination
) {
  return {
    data,
    filters: {
      ...params.filters,
      range: params.range,
      status: params.status || undefined
    },
    generatedAt: new Date().toISOString(),
    pagination:
      pagination ?? {
        cursor: params.cursor > 0 ? String(params.cursor) : null,
        limit: params.limit,
        nextCursor: null
      }
  };
}

function flowNodeCount(flow: AdminFlowData, id: string) {
  return flow.nodes.find((node) => node.id === id)?.count ?? 0;
}

function currentLeadStage(row: {
  free_email_requested: boolean;
  free_email_sent: boolean;
  healthscore_viewed: boolean;
  landed: boolean;
  precision_paid: boolean;
  pro_paid: boolean;
  submitted: boolean;
  started: boolean;
}) {
  if (row.pro_paid) {
    return "pro";
  }

  if (row.precision_paid) {
    return "precision";
  }

  if (row.free_email_sent) {
    return "free_sent";
  }

  if (row.free_email_requested) {
    return "free_requested";
  }

  if (row.healthscore_viewed) {
    return "healthscore";
  }

  if (row.submitted) {
    return "assessment_completed";
  }

  if (row.started) {
    return "assessment_started";
  }

  return row.landed ? "landed" : "observed";
}

function campaignSummary(rows: readonly CampaignRow[]) {
  return rows.reduce(
    (summary, row) => ({
      assessmentCompletions:
        summary.assessmentCompletions + row.assessmentCompletions,
      assessmentStarts: summary.assessmentStarts + row.assessmentStarts,
      freeRequests: summary.freeRequests + row.freeRequests,
      healthScoreViews: summary.healthScoreViews + row.healthScoreViews,
      landed: summary.landed + row.landed,
      precisionConversions:
        summary.precisionConversions + row.precisionConversions,
      proConversions: summary.proConversions + row.proConversions
    }),
    {
      assessmentCompletions: 0,
      assessmentStarts: 0,
      freeRequests: 0,
      healthScoreViews: 0,
      landed: 0,
      precisionConversions: 0,
      proConversions: 0
    }
  );
}

async function getCampaigns(params: QueryParams) {
  const sql = getSql();

  if (!sql) {
    return {
      databaseAvailable: false,
      rows: [],
      summary: campaignSummary([])
    };
  }

  const start = adminDashboardRangeStart(params.range);
  const rows = await sql<
    Array<{
      affiliate: string | null;
      assessment_completions: number | string;
      assessment_starts: number | string;
      campaign: string | null;
      campaign_id: string | null;
      first_seen_at: Date | string;
      free_requests: number | string;
      healthscore_views: number | string;
      landed: number | string;
      last_seen_at: Date | string;
      medium: string | null;
      precision_conversions: number | string;
      pro_conversions: number | string;
      promo_code: string | null;
      source: string | null;
    }>
  >`
    with campaign_events as (
      select
        coalesce(nullif(utm_source, ''), nullif(traffic_source, ''), nullif(source_channel, ''), 'direct') as source,
        nullif(utm_medium, '') as medium,
        coalesce(nullif(utm_campaign, ''), nullif(campaign_name, '')) as campaign,
        nullif(campaign_id, '') as campaign_id,
        coalesce(nullif(affiliate_id, ''), nullif(affiliate_ref, '')) as affiliate,
        nullif(promo_code, '') as promo_code,
        coalesce(plan_id::text, ray::text, id::text) as subject,
        event_name,
        event_type,
        event_status,
        selected_plan::text,
        occurred_at
      from public.bpm
      where ${start ? sql`occurred_at >= ${start} and` : sql``}
        ${adminDashboardFilterSql(sql, params.filters)}
    )
    select
      source,
      medium,
      campaign,
      campaign_id,
      affiliate,
      promo_code,
      min(occurred_at) as first_seen_at,
      max(occurred_at) as last_seen_at,
      count(distinct subject) filter (where event_name in ('home_viewed', 'blog_article_viewed'))::int as landed,
      count(distinct subject) filter (where event_name = 'assessment_started')::int as assessment_starts,
      count(distinct subject) filter (where event_name in ('assessment_submitted', 'assessment_captured', 'assessment_recaptured'))::int as assessment_completions,
      count(distinct subject) filter (where event_name = 'healthscore_viewed')::int as healthscore_views,
      count(distinct subject) filter (where event_name = 'free_email_requested')::int as free_requests,
      count(distinct subject) filter (
        where selected_plan = 'precision'
          and (
            event_name = any(${[...paidEventNames]}::text[])
            or (event_type = 'payment' and event_status = any(${[...paidEventStatuses]}::text[]))
          )
      )::int as precision_conversions,
      count(distinct subject) filter (
        where selected_plan = 'pro'
          and (
            event_name = any(${[...paidEventNames]}::text[])
            or (event_type = 'payment' and event_status = any(${[...paidEventStatuses]}::text[]))
          )
      )::int as pro_conversions
    from campaign_events
    group by source, medium, campaign, campaign_id, affiliate, promo_code
    order by landed desc, healthscore_views desc, last_seen_at desc
    limit 1000
  `;
  const mappedRows: CampaignRow[] = rows.map((row) => ({
    affiliate: row.affiliate,
    assessmentCompletions: Number(row.assessment_completions) || 0,
    assessmentStarts: Number(row.assessment_starts) || 0,
    campaign: row.campaign,
    campaignId: row.campaign_id,
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    freeRequests: Number(row.free_requests) || 0,
    healthScoreViews: Number(row.healthscore_views) || 0,
    landed: Number(row.landed) || 0,
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    medium: row.medium,
    precisionConversions: Number(row.precision_conversions) || 0,
    proConversions: Number(row.pro_conversions) || 0,
    promoCode: row.promo_code,
    source: row.source
  }));
  const { pageRows, pagination } = paginate(mappedRows, params);

  return {
    databaseAvailable: true,
    rows: pageRows,
    summary: campaignSummary(mappedRows),
    pagination
  };
}

async function getLeads(params: QueryParams) {
  const sql = getSql();

  if (!sql) {
    return {
      databaseAvailable: false,
      rows: [],
      summary: { total: 0 }
    };
  }

  const start = adminDashboardRangeStart(params.range);
  const rows = await sql<
    Array<{
      campaign: string | null;
      communication_issues: number | string | null;
      email_hash: string | null;
      first_seen_at: Date | string;
      free_email_requested: boolean;
      free_email_sent: boolean;
      healthscore_viewed: boolean;
      landed: boolean;
      last_event: string;
      last_seen_at: Date | string;
      locale: string | null;
      pending_reviews: number | string | null;
      plan_id: string | null;
      precision_paid: boolean;
      pro_paid: boolean;
      ray: string | null;
      selected_plan: string | null;
      source: string | null;
      started: boolean;
      subject: string;
      submitted: boolean;
    }>
  >`
    with lead_events as (
      select
        coalesce(plan_id::text, ray::text, id::text) as subject,
        ray::text,
        plan_id::text,
        email_hash,
        locale,
        selected_plan::text,
        coalesce(nullif(utm_source, ''), nullif(traffic_source, ''), nullif(source_channel, '')) as source,
        coalesce(nullif(utm_campaign, ''), nullif(campaign_name, '')) as campaign,
        event_name,
        event_type,
        event_status,
        occurred_at
      from public.bpm
      where ${start ? sql`occurred_at >= ${start} and` : sql``}
        ${adminDashboardFilterSql(sql, params.filters)}
    ),
    lead_rows as (
      select
        subject,
        (array_remove(array_agg(ray order by occurred_at desc), null))[1] as ray,
        (array_remove(array_agg(plan_id order by occurred_at desc), null))[1] as plan_id,
        (array_remove(array_agg(email_hash order by occurred_at desc), null))[1] as email_hash,
        (array_remove(array_agg(locale order by occurred_at desc), null))[1] as locale,
        (array_remove(array_agg(selected_plan order by occurred_at desc), null))[1] as selected_plan,
        (array_remove(array_agg(source order by occurred_at desc), null))[1] as source,
        (array_remove(array_agg(campaign order by occurred_at desc), null))[1] as campaign,
        (array_agg(event_name order by occurred_at desc))[1] as last_event,
        min(occurred_at) as first_seen_at,
        max(occurred_at) as last_seen_at,
        bool_or(event_name in ('home_viewed', 'blog_article_viewed')) as landed,
        bool_or(event_name = 'assessment_started') as started,
        bool_or(event_name in ('assessment_submitted', 'assessment_captured', 'assessment_recaptured')) as submitted,
        bool_or(event_name = 'healthscore_viewed') as healthscore_viewed,
        bool_or(event_name = 'free_email_requested') as free_email_requested,
        bool_or(event_name = 'free_email_sent') as free_email_sent,
        bool_or(
          selected_plan = 'precision'
          and (
            event_name = any(${[...paidEventNames]}::text[])
            or (event_type = 'payment' and event_status = any(${[...paidEventStatuses]}::text[]))
          )
        ) as precision_paid,
        bool_or(
          selected_plan = 'pro'
          and (
            event_name = any(${[...paidEventNames]}::text[])
            or (event_type = 'payment' and event_status = any(${[...paidEventStatuses]}::text[]))
          )
        ) as pro_paid
      from lead_events
      group by subject
    )
    select
      lead_rows.*,
      coalesce(review_counts.pending_reviews, 0)::int as pending_reviews,
      coalesce(communication_counts.communication_issues, 0)::int as communication_issues
    from lead_rows
    left join lateral (
      select count(*)::int as pending_reviews
      from public.tasks
      where tasks.plan_id::text = lead_rows.plan_id
        and tasks.task_type in ('classify_supplement', 'review_supplement_for_plan')
        and tasks.status not in ('completed', 'failed', 'cancelled', 'skipped')
    ) review_counts on lead_rows.plan_id is not null
    left join lateral (
      select count(*)::int as communication_issues
      from public.communication_messages
      where communication_messages.plan_id::text = lead_rows.plan_id
        and communication_messages.status in ('failed', 'no_channel')
    ) communication_counts on lead_rows.plan_id is not null
    order by lead_rows.last_seen_at desc
    limit 1000
  `;
  const mappedRows = rows
    .map((row): LeadRow => ({
      campaign: row.campaign,
      communicationIssues: Number(row.communication_issues) || 0,
      currentStage: currentLeadStage(row),
      emailHash: row.email_hash,
      firstSeenAt: new Date(row.first_seen_at).toISOString(),
      lastEvent: row.last_event,
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
      locale: row.locale,
      pendingReviews: Number(row.pending_reviews) || 0,
      planId: row.plan_id,
      ray: row.ray,
      selectedPlan: row.selected_plan,
      source: row.source,
      subject: row.subject
    }))
    .filter((row) => !params.status || row.currentStage === params.status);
  const { pageRows, pagination } = paginate(mappedRows, params);

  return {
    databaseAvailable: true,
    rows: pageRows,
    summary: {
      total: mappedRows.length
    },
    pagination
  };
}

async function getContentInventory(params: QueryParams) {
  const sql = getSql();

  if (!sql) {
    return {
      databaseAvailable: false,
      rows: [],
      summary: { archived: 0, draft: 0, published: 0, review: 0, total: 0 }
    };
  }

  const status = params.status || null;
  const locale = params.filters.locale || null;
  const [postRows, testimonialRows] = await Promise.all([
    sql<
      Array<{
        created_at: Date | string;
        excerpt: string | null;
        id: string;
        locale: string;
        published_at: Date | string | null;
        slug: string;
        source_agent: string | null;
        source_channel: string | null;
        source_ref: string | null;
        status: string;
        title: string;
        updated_at: Date | string;
      }>
    >`
      select
        id::text,
        locale,
        status,
        slug,
        title,
        excerpt,
        source_agent,
        source_channel,
        source_ref,
        published_at,
        created_at,
        updated_at
      from public.blog_posts
      where (${status}::text is null or status = ${status})
        and (${locale}::text is null or locale = ${locale})
      order by updated_at desc
      limit 500
    `,
    sql<
      Array<{
        author_name: string | null;
        created_at: Date | string;
        id: string;
        locale: string;
        quote: string;
        source_agent: string | null;
        status: string;
        updated_at: Date | string;
      }>
    >`
      select
        id::text,
        locale,
        status,
        quote,
        author_name,
        source_agent,
        created_at,
        updated_at
      from public.testimonials
      where (${status}::text is null or status = ${status})
        and (${locale}::text is null or locale = ${locale})
      order by updated_at desc
      limit 500
    `
  ]);
  const rows: ContentInventoryRow[] = [
    ...postRows.map((row) => ({
      contentType: "blog_post" as const,
      createdAt: new Date(row.created_at).toISOString(),
      id: row.id,
      locale: row.locale,
      publishedAt: row.published_at
        ? new Date(row.published_at).toISOString()
        : null,
      slug: row.slug,
      sourceAgent: row.source_agent,
      sourceChannel: row.source_channel,
      sourceRef: row.source_ref,
      status: row.status,
      summary: row.excerpt,
      title: row.title,
      updatedAt: new Date(row.updated_at).toISOString()
    })),
    ...testimonialRows.map((row) => ({
      contentType: "testimonial" as const,
      createdAt: new Date(row.created_at).toISOString(),
      id: row.id,
      locale: row.locale,
      publishedAt: null,
      slug: null,
      sourceAgent: row.source_agent,
      sourceChannel: null,
      sourceRef: null,
      status: row.status,
      summary: row.quote,
      title: row.author_name || "Testimonial",
      updatedAt: new Date(row.updated_at).toISOString()
    }))
  ].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
  const summary = rows.reduce(
    (counts, row) => {
      counts.total += 1;

      if (
        row.status === "archived" ||
        row.status === "draft" ||
        row.status === "published" ||
        row.status === "review"
      ) {
        counts[row.status] += 1;
      }

      return counts;
    },
    { archived: 0, draft: 0, published: 0, review: 0, total: 0 }
  );
  const { pageRows, pagination } = paginate(rows, params);

  return {
    databaseAvailable: true,
    rows: pageRows,
    summary,
    pagination
  };
}

export async function getAdminExternalQueryData(
  view: AdminExternalQueryView,
  searchParams: URLSearchParams
) {
  const params = normalizeQueryParams(searchParams);

  if (view === "conversions") {
    return queryEnvelope(await getAdminFlowData(params.range, params.filters), params);
  }

  if (view === "glance") {
    const [flow, reviews, communications, alerts] = await Promise.all([
      getAdminFlowData(params.range, params.filters),
      getAdminReviewQueueData(),
      getAdminCommunicationsData(params.range),
      getAdminTechnicalAlertsData(params.range)
    ]);
    const emptySeries = flow.series.bucketLabels.map(() => 0);
    const nodeSeries = (id: AdminFlowNodeId) =>
      flow.series.nodes[id] ?? emptySeries;

    return queryEnvelope(
      {
        attention: {
          communicationIssues:
            communications.summary.failed + communications.summary.noChannel,
          criticalAlerts: alerts.summary.critical + alerts.summary.high,
          pendingReviews: reviews.summary.total,
          unknownSupplements: reviews.summary.unknown
        },
        metrics: {
          assessmentCompletions: flowNodeCount(flow, "assessmentSubmitted"),
          assessmentStarts: flowNodeCount(flow, "assessmentStarted"),
          freeRequests: flowNodeCount(flow, "freeEmailRequested"),
          healthScoreViews: flowNodeCount(flow, "healthscoreViewed"),
          landingVisitors: flowNodeCount(flow, "landingViewed"),
          pendingReviews: reviews.summary.total,
          precisionConversions: flowNodeCount(flow, "precisionPaid"),
          proConversions: flowNodeCount(flow, "proPaid")
        },
        trends: {
          bucketLabels: flow.series.bucketLabels,
          metrics: {
            assessmentCompletions: nodeSeries("assessmentSubmitted"),
            assessmentStarts: nodeSeries("assessmentStarted"),
            freeRequests: nodeSeries("freeEmailRequested"),
            healthScoreViews: nodeSeries("healthscoreViewed"),
            landingVisitors: nodeSeries("landingViewed"),
            pendingReviews: flow.series.bucketLabels.map(
              () => reviews.summary.total
            ),
            precisionConversions: nodeSeries("precisionPaid"),
            proConversions: nodeSeries("proPaid")
          }
        },
        range: params.range
      },
      params
    );
  }

  if (view === "campaigns") {
    const data = await getCampaigns(params);

    return queryEnvelope(data, params, data.pagination);
  }

  if (view === "leads") {
    const data = await getLeads(params);

    return queryEnvelope(data, params, data.pagination);
  }

  if (view === "content") {
    const data = await getContentInventory(params);

    return queryEnvelope(data, params, data.pagination);
  }

  if (view === "reviews") {
    const data = await getAdminReviewQueueData();
    const rows = data.rows.filter(
      (row) => !params.status || row.status === params.status
    );
    const { pageRows, pagination } = paginate(rows, params);

    return queryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "supplements") {
    const data = await getAdminSupplementsData();
    const rows = data.rows.filter(
      (row) => !params.status || row.listStatus === params.status
    );
    const { pageRows, pagination } = paginate(rows, params);

    return queryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "communications") {
    const data = await getAdminCommunicationsData(params.range);
    const rows = data.rows.filter(
      (row) => !params.status || row.status === params.status
    );
    const { pageRows, pagination } = paginate(rows, params);

    return queryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "alerts") {
    const data = await getAdminTechnicalAlertsData(params.range);
    const rows = data.rows.filter(
      (row) =>
        !params.status ||
        row.adminStatus === params.status ||
        row.status === params.status
    );
    const { pageRows, pagination } = paginate(rows, params);

    return queryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "goals") {
    const data = await getAdminGoalsData(params.range, null);
    const rows = data.rows.filter(
      (row) => !params.status || row.status === params.status
    );
    const { pageRows, pagination } = paginate(rows, params);

    return queryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "tasks") {
    const data = await getAdminTaskVisibilityData(params.range);
    const rows = data.rows.filter(
      (row) => !params.status || row.status === params.status
    );
    const { pageRows, pagination } = paginate(rows, params);

    return queryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  const data = await getAdminAgentsData(params.range);
  const rows = data.rows.filter(
    (row) => !params.status || row.status === params.status
  );
  const { pageRows, pagination } = paginate(rows, params);

  return queryEnvelope({ ...data, rows: pageRows }, params, pagination);
}
