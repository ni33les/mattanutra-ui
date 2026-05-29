import {
  adminDashboardRangeStart,
  type AdminDashboardRange
} from "@/lib/admin-dashboard-data";
import {
  adminDashboardFilterSql,
  type AdminDashboardFilters
} from "@/lib/admin-dashboard-filters";
import {
  adminQueryEnvelope,
  dashboardQueryParams,
  normalizeAdminQueryParams,
  paginateAdminRows,
  type AdminQueryPagination,
  type AdminQueryParams
} from "@/lib/admin-query-helpers";
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
import { getAdminReviewQueueData } from "@/lib/admin-review-queue";
import { getAdminProductsData } from "@/lib/admin-products";
import { getAdminSupplementsData } from "@/lib/admin-supplements";
import { getAdminTechnicalAlertsData } from "@/lib/admin-technical";
import { getSql } from "@/lib/db";
import type { BlogArticleBody } from "@/lib/blog";

export type AdminExternalQueryView =
  | "agents"
  | "alerts"
  | "campaigns"
  | "communications"
  | "content"
  | "conversions"
  | "glance"
  | "leads"
  | "product-recommendations"
  | "products"
  | "reviews"
  | "supplements"
  | "tasks";

type QueryParams = AdminQueryParams;

export type { AdminQueryPagination } from "@/lib/admin-query-helpers";

export type AdminCampaignRow = Readonly<{
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

export type AdminCampaignSummary = Readonly<{
  assessmentCompletions: number;
  assessmentStarts: number;
  freeRequests: number;
  healthScoreViews: number;
  landed: number;
  precisionConversions: number;
  proConversions: number;
}>;

export type AdminCampaignsData = Readonly<{
  databaseAvailable: boolean;
  pagination?: AdminQueryPagination;
  rows: AdminCampaignRow[];
  summary: AdminCampaignSummary;
}>;

export type AdminLeadRow = Readonly<{
  campaign: string | null;
  communicationIssues: number;
  currentStage: string;
  emailHash: string | null;
  events: AdminLeadEventRow[];
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

export type AdminLeadEventRow = Readonly<{
  actorType: string;
  campaign: string | null;
  emailHash: string | null;
  errorMessage: string | null;
  eventName: string;
  eventStatus: string;
  eventType: string;
  id: string;
  occurredAt: string;
  path: string | null;
  planId: string | null;
  ray: string | null;
  route: string | null;
  severity: string;
  source: string | null;
}>;

export type AdminLeadsData = Readonly<{
  databaseAvailable: boolean;
  pagination?: AdminQueryPagination;
  rows: AdminLeadRow[];
  summary: Readonly<{
    total: number;
  }>;
}>;

export type AdminContentWorkflowStatus =
  | "deleted"
  | "draft"
  | "published"
  | "scheduled";

export type AdminContentInventoryRow = Readonly<{
  contentMarkdown: string | null;
  contentType: "blog_post" | "testimonial";
  createdAt: string;
  id: string;
  imageAlt: string | null;
  imageUrl: string | null;
  lastViewedAt: string | null;
  locale: string;
  pageViews: number;
  pendingTaskId: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  slug: string | null;
  sourceAgent: string | null;
  sourceChannel: string | null;
  sourceRef: string | null;
  status: string;
  summary: string | null;
  title: string;
  translationGroupId: string | null;
  translationLocales: string[];
  updatedAt: string;
  workflowStatus: AdminContentWorkflowStatus;
}>;

export type AdminContentInventoryData = Readonly<{
  databaseAvailable: boolean;
  pagination?: AdminQueryPagination;
  rows: AdminContentInventoryRow[];
  summary: Readonly<{
    blogPosts: number;
    deleted: number;
    draft: number;
    pageViews: number;
    published: number;
    scheduled: number;
    testimonials: number;
    total: number;
  }>;
}>;

export function emptyCampaignsData(): AdminCampaignsData {
  return {
    databaseAvailable: false,
    rows: [],
    summary: campaignSummary([])
  };
}

export function emptyLeadsData(): AdminLeadsData {
  return {
    databaseAvailable: false,
    rows: [],
    summary: { total: 0 }
  };
}

export function emptyContentData(): AdminContentInventoryData {
  return {
    databaseAvailable: false,
    rows: [],
    summary: {
      blogPosts: 0,
      deleted: 0,
      draft: 0,
      pageViews: 0,
      published: 0,
      scheduled: 0,
      testimonials: 0,
      total: 0
    }
  };
}

const views = new Set<AdminExternalQueryView>([
  "agents",
  "alerts",
  "campaigns",
  "communications",
  "content",
  "conversions",
  "glance",
  "leads",
  "product-recommendations",
  "products",
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

function markdownFromBlogBody(body?: BlogArticleBody | null) {
  if (!body) {
    return null;
  }

  const points =
    body.points
      ?.map((point) => `- **${point.title}** ${point.body}`.trim())
      .filter(Boolean)
      .join("\n") ?? "";
  const sections = [
    body.intro,
    points,
    body.sectionTitle ? `## ${body.sectionTitle}` : "",
    body.sectionBody,
    body.closing
  ].filter((section): section is string => Boolean(section?.trim()));

  return sections.length > 0 ? sections.join("\n\n") : null;
}

const leadEventNames = new Set([
  "assessment_started",
  "assessment_submitted",
  "assessment_captured",
  "assessment_recaptured",
  "healthscore_viewed",
  "free_email_requested",
  "free_email_sent",
  "formulation_page_viewed",
  "plan_selected"
]);

export function normalizeAdminExternalQueryView(
  value: string
): AdminExternalQueryView | null {
  return views.has(value as AdminExternalQueryView)
    ? (value as AdminExternalQueryView)
    : null;
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

function campaignSummary(rows: readonly AdminCampaignRow[]): AdminCampaignSummary {
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

async function getCampaigns(params: QueryParams): Promise<AdminCampaignsData> {
  const sql = getSql();

  if (!sql) {
    return emptyCampaignsData();
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
  const mappedRows: AdminCampaignRow[] = rows.map((row) => ({
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
  const { pageRows, pagination } = paginateAdminRows(mappedRows, params);

  return {
    databaseAvailable: true,
    rows: pageRows,
    summary: campaignSummary(mappedRows),
    pagination
  };
}

async function getLeads(params: QueryParams): Promise<AdminLeadsData> {
  const sql = getSql();

  if (!sql) {
    return emptyLeadsData();
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
        coalesce(
          case when ray <> id then ray::text else null end,
          plan_id::text,
          nullif(email_hash, '')
        ) as subject,
        ray::text,
        plan_id::text,
        nullif(email_hash, '') as email_hash,
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
      where subject is not null
      group by subject
      having bool_or(
        event_name = any(${[...leadEventNames]}::text[])
        or event_name = any(${[...paidEventNames]}::text[])
        or selected_plan is not null
        or email_hash is not null
        or plan_id is not null
      )
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
    .map((row): AdminLeadRow => ({
      campaign: row.campaign,
      communicationIssues: Number(row.communication_issues) || 0,
      currentStage: currentLeadStage(row),
      emailHash: row.email_hash,
      events: [],
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
  const { pageRows, pagination } = paginateAdminRows(mappedRows, params);
  const subjects = pageRows.map((row) => row.subject);
  const eventRows = subjects.length
    ? await sql<
        Array<{
          actor_type: string;
          campaign: string | null;
          email_hash: string | null;
          error_message: string | null;
          event_name: string;
          event_status: string;
          event_type: string;
          id: string;
          occurred_at: Date | string;
          path: string | null;
          plan_id: string | null;
          ray: string | null;
          route: string | null;
          severity: string;
          source: string | null;
          subject: string;
        }>
      >`
        with event_rows as (
          select
            coalesce(
              case when ray <> id then ray::text else null end,
              plan_id::text,
              nullif(email_hash, '')
            ) as subject,
            id::text,
            ray::text,
            plan_id::text,
            nullif(email_hash, '') as email_hash,
            event_name,
            event_type,
            event_status,
            severity,
            actor_type,
            path,
            route,
            coalesce(nullif(utm_source, ''), nullif(traffic_source, ''), nullif(source_channel, '')) as source,
            coalesce(nullif(utm_campaign, ''), nullif(campaign_name, '')) as campaign,
            error_message,
            occurred_at
          from public.bpm
          where ${start ? sql`occurred_at >= ${start} and` : sql``}
            ${adminDashboardFilterSql(sql, params.filters)}
        ),
        ranked_events as (
          select
            *,
            row_number() over (
              partition by subject
              order by occurred_at asc, id asc
            ) as event_index
          from event_rows
          where subject = any(${subjects}::text[])
        )
        select
          subject,
          id,
          ray,
          plan_id,
          email_hash,
          event_name,
          event_type,
          event_status,
          severity,
          actor_type,
          path,
          route,
          source,
          campaign,
          error_message,
          occurred_at
        from ranked_events
        where event_index <= 80
        order by subject asc, occurred_at asc, id asc
      `
    : [];
  const eventsBySubject = new Map<string, AdminLeadEventRow[]>();

  eventRows.forEach((row) => {
    const current = eventsBySubject.get(row.subject) ?? [];

    current.push({
      actorType: row.actor_type,
      campaign: row.campaign,
      emailHash: row.email_hash,
      errorMessage: row.error_message,
      eventName: row.event_name,
      eventStatus: row.event_status,
      eventType: row.event_type,
      id: row.id,
      occurredAt: new Date(row.occurred_at).toISOString(),
      path: row.path,
      planId: row.plan_id,
      ray: row.ray,
      route: row.route,
      severity: row.severity,
      source: row.source
    });
    eventsBySubject.set(row.subject, current);
  });
  const rowsWithEvents = pageRows.map((row) => ({
    ...row,
    events: eventsBySubject.get(row.subject) ?? []
  }));

  return {
    databaseAvailable: true,
    rows: rowsWithEvents,
    summary: {
      total: mappedRows.length
    },
    pagination
  };
}

export async function getAdminCampaignsData(
  range: AdminDashboardRange,
  filters: AdminDashboardFilters,
  limit = 100
) {
  try {
    return await getCampaigns(dashboardQueryParams({ filters, limit, range }));
  } catch (error) {
    console.error("Unable to load admin campaigns data", error);
    return emptyCampaignsData();
  }
}

export async function getAdminLeadsData(
  range: AdminDashboardRange,
  filters: AdminDashboardFilters,
  status = "",
  limit = 100
) {
  try {
    return await getLeads(dashboardQueryParams({ filters, limit, range, status }));
  } catch (error) {
    console.error("Unable to load admin leads data", error);
    return emptyLeadsData();
  }
}

async function getContentInventory(params: QueryParams) {
  const sql = getSql();

  if (!sql) {
    return emptyContentData();
  }

  const locale = params.filters.locale || null;
  const start = adminDashboardRangeStart(params.range);
  const [postRows, testimonialRows, scheduledTaskRows] = await Promise.all([
    sql<
      Array<{
        body: BlogArticleBody | null;
        content_markdown: string | null;
        created_at: Date | string;
        excerpt: string | null;
        id: string;
        image_alt: string | null;
        image_url: string | null;
        last_viewed_at: Date | string | null;
        locale: string;
        page_views: number | string;
        published_at: Date | string | null;
        slug: string;
        source_agent: string | null;
        source_channel: string | null;
        source_ref: string | null;
        status: string;
        title: string;
        translation_group_id: string;
        translation_locales: string[] | null;
        updated_at: Date | string;
      }>
    >`
      select
        id::text,
        translation_group_id::text,
        coalesce(translation_group.locales, array[blog_posts.locale]::text[]) as translation_locales,
        locale,
        status,
        slug,
        title,
        excerpt,
        content_markdown,
        body,
        image_alt,
        image_url,
        source_agent,
        source_channel,
        source_ref,
        published_at,
        coalesce(view_stats.page_views, 0)::int as page_views,
        view_stats.last_viewed_at,
        created_at,
        updated_at
      from public.blog_posts
      left join lateral (
        select array_agg(sibling_locales.locale order by sibling_locales.locale) as locales
        from (
          select distinct sibling.locale
          from public.blog_posts sibling
          where sibling.translation_group_id = blog_posts.translation_group_id
            and sibling.locale is not null
        ) sibling_locales
      ) translation_group on true
      left join lateral (
        select
          count(*)::int as page_views,
          max(occurred_at) as last_viewed_at
        from public.bpm
        where event_name = 'blog_article_viewed'
          ${start ? sql`and occurred_at >= ${start}` : sql``}
          and (
            path = '/' || blog_posts.locale || '/blog/' || blog_posts.slug
            or source_url like '%' || '/blog/' || blog_posts.slug || '%'
          )
      ) view_stats on true
      where (${locale}::text is null or locale = any(string_to_array(${locale}, ',')))
      order by updated_at desc
      limit 500
    `,
    sql<
      Array<{
        author_image_alt: string | null;
        author_image_url: string | null;
        author_name: string | null;
        created_at: Date | string;
        id: string;
        locale: string;
        quote: string;
        source_agent: string | null;
        status: string;
        translation_group_id: string;
        translation_locales: string[] | null;
        updated_at: Date | string;
      }>
    >`
      select
        id::text,
        translation_group_id::text,
        coalesce(translation_group.locales, array[testimonials.locale]::text[]) as translation_locales,
        locale,
        status,
        quote,
        author_image_alt,
        author_image_url,
        author_name,
        source_agent,
        created_at,
        updated_at
      from public.testimonials
      left join lateral (
        select array_agg(sibling_locales.locale order by sibling_locales.locale) as locales
        from (
          select distinct sibling.locale
          from public.testimonials sibling
          where sibling.translation_group_id = testimonials.translation_group_id
            and sibling.locale is not null
        ) sibling_locales
      ) translation_group on true
      where (${locale}::text is null or locale = any(string_to_array(${locale}, ',')))
      order by updated_at desc
      limit 500
    `,
    sql<
      Array<{
        content_id: string | null;
        content_type: string | null;
        id: string;
        scheduled_for: Date | string;
      }>
    >`
      select
        id::text,
        payload ->> 'contentId' as content_id,
        payload ->> 'contentType' as content_type,
        scheduled_for
      from public.tasks
      where task_type = 'content_status_change'
        and payload ->> 'targetStatus' = 'published'
        and scheduled_for > now()
        and status not in ('completed', 'failed', 'cancelled', 'skipped')
      order by scheduled_for asc
      limit 1000
    `
  ]);
  const scheduledTasks = new Map(
    scheduledTaskRows
      .filter((row) => row.content_id && row.content_type)
      .map((row) => [
        `${row.content_type}:${row.content_id}`,
        {
          id: row.id,
          scheduledFor: new Date(row.scheduled_for).toISOString()
        }
      ])
  );
  const workflowStatus = (
    contentType: "blog_post" | "testimonial",
    id: string,
    status: string
  ): AdminContentWorkflowStatus => {
    if (scheduledTasks.has(`${contentType}:${id}`)) {
      return "scheduled";
    }

    if (status === "archived") {
      return "deleted";
    }

    if (status === "published") {
      return "published";
    }

    return "draft";
  };
  const rows: AdminContentInventoryRow[] = [
    ...postRows.map((row) => ({
      contentMarkdown:
        row.content_markdown ?? markdownFromBlogBody(row.body),
      contentType: "blog_post" as const,
      createdAt: new Date(row.created_at).toISOString(),
      id: row.id,
      imageAlt: row.image_alt,
      imageUrl: row.image_url,
      lastViewedAt: row.last_viewed_at
        ? new Date(row.last_viewed_at).toISOString()
        : null,
      locale: row.locale,
      pageViews: Number(row.page_views) || 0,
      pendingTaskId: scheduledTasks.get(`blog_post:${row.id}`)?.id ?? null,
      publishedAt: row.published_at
        ? new Date(row.published_at).toISOString()
        : null,
      scheduledFor: scheduledTasks.get(`blog_post:${row.id}`)?.scheduledFor ?? null,
      slug: row.slug,
      sourceAgent: row.source_agent,
      sourceChannel: row.source_channel,
      sourceRef: row.source_ref,
      status: row.status,
      summary: row.excerpt,
      title: row.title,
      translationGroupId: row.translation_group_id,
      translationLocales:
        row.translation_locales?.filter((value): value is string => Boolean(value)) ??
        [row.locale],
      updatedAt: new Date(row.updated_at).toISOString(),
      workflowStatus: workflowStatus("blog_post", row.id, row.status)
    })),
    ...testimonialRows.map((row) => ({
      contentMarkdown: null,
      contentType: "testimonial" as const,
      createdAt: new Date(row.created_at).toISOString(),
      id: row.id,
      imageAlt: row.author_image_alt,
      imageUrl: row.author_image_url,
      lastViewedAt: null,
      locale: row.locale,
      pageViews: 0,
      pendingTaskId: scheduledTasks.get(`testimonial:${row.id}`)?.id ?? null,
      publishedAt: null,
      scheduledFor:
        scheduledTasks.get(`testimonial:${row.id}`)?.scheduledFor ?? null,
      slug: null,
      sourceAgent: row.source_agent,
      sourceChannel: null,
      sourceRef: null,
      status: row.status,
      summary: row.quote,
      title: row.author_name || "Testimonial",
      translationGroupId: row.translation_group_id,
      translationLocales:
        row.translation_locales?.filter((value): value is string => Boolean(value)) ??
        [row.locale],
      updatedAt: new Date(row.updated_at).toISOString(),
      workflowStatus: workflowStatus("testimonial", row.id, row.status)
    }))
  ]
    .filter((row) => !params.status || row.workflowStatus === params.status)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  const summary = rows.reduce(
    (counts, row) => {
      counts.total += 1;
      counts.pageViews += row.pageViews;

      if (row.contentType === "blog_post") {
        counts.blogPosts += 1;
      } else {
        counts.testimonials += 1;
      }

      counts[row.workflowStatus] += 1;

      return counts;
    },
    {
      blogPosts: 0,
      deleted: 0,
      draft: 0,
      pageViews: 0,
      published: 0,
      scheduled: 0,
      testimonials: 0,
      total: 0
    }
  );
  const { pageRows, pagination } = paginateAdminRows(rows, params);

  return {
    databaseAvailable: true,
    rows: pageRows,
    summary,
    pagination
  };
}

export async function getAdminContentData(
  range: AdminDashboardRange,
  filters: AdminDashboardFilters,
  status = "",
  limit = 100
) {
  try {
    return await getContentInventory(
      dashboardQueryParams({ filters, limit, range, status })
    );
  } catch (error) {
    console.error("Unable to load admin content data", error);
    return emptyContentData();
  }
}

async function getProductRecommendationHistory(params: QueryParams) {
  const sql = getSql();

  if (!sql) {
    return {
      databaseAvailable: false,
      rows: [],
      summary: {
        averageStackCoveragePercent: null,
        runs: 0,
        shownProducts: 0
      }
    };
  }

  const planFilter = /^[0-9a-f-]{36}$/i.test(params.filters.planId)
    ? params.filters.planId
    : null;
  const rayFilter = /^[0-9a-f-]{36}$/i.test(params.filters.ray)
    ? params.filters.ray
    : null;
  const rows = await sql<Array<{
    affiliate: boolean;
    created_at: Date | string;
    diagnostics: unknown;
    food_coverage_percent: string | number;
    platform: string;
    plan_id: string | null;
    product_coverage_percent: string | number;
    product_id: string;
    product_title: string;
    rank: number;
    run_id: string;
    stack_contribution_percent: string | number;
    stack_coverage_percent: string | number;
    supplement_product_coverage_percent: string | number;
    status: string;
    total_coverage_percent: string | number;
    unknown_at_recommendation: boolean;
    url_used: string;
  }>>`
    select
      product_recommendation_runs.id::text as run_id,
      product_recommendation_runs.plan_id::text,
      product_recommendation_runs.status,
      product_recommendation_runs.stack_coverage_percent,
      coalesce(to_jsonb(product_recommendation_runs) ->> 'supplement_product_coverage_percent', product_recommendation_runs.stack_coverage_percent::text) as supplement_product_coverage_percent,
      coalesce(to_jsonb(product_recommendation_runs) ->> 'food_coverage_percent', '0') as food_coverage_percent,
      coalesce(to_jsonb(product_recommendation_runs) ->> 'total_coverage_percent', product_recommendation_runs.stack_coverage_percent::text) as total_coverage_percent,
      coalesce(to_jsonb(product_recommendation_runs) -> 'diagnostics', '{}'::jsonb) as diagnostics,
      product_recommendation_items.product_id::text,
      products.title as product_title,
      products.platform,
      product_recommendation_items.rank,
      product_recommendation_items.product_coverage_percent,
      product_recommendation_items.stack_contribution_percent,
      product_recommendation_items.url_used,
      product_recommendation_items.unknown_at_recommendation,
      product_recommendation_items.offer_id is not null as affiliate,
      product_recommendation_items.created_at
    from public.product_recommendation_items
    join public.product_recommendation_runs
      on product_recommendation_runs.id = product_recommendation_items.run_id
    join public.products
      on products.id = product_recommendation_items.product_id
    where (${planFilter}::uuid is null or product_recommendation_runs.plan_id = ${planFilter}::uuid)
      and (${rayFilter}::uuid is null or product_recommendation_runs.ray_id = ${rayFilter}::uuid)
      and (${params.status || null}::text is null or product_recommendation_runs.status = ${params.status || null})
    order by product_recommendation_items.created_at desc, product_recommendation_items.rank asc
    limit ${params.limit}
    offset ${params.cursor}
  `;
  const mappedRows = rows.map((row) => ({
    affiliate: row.affiliate,
    createdAt: new Date(row.created_at).toISOString(),
    diagnostics: row.diagnostics,
    foodCoveragePercent: Number(row.food_coverage_percent) || 0,
    platform: row.platform,
    planId: row.plan_id,
    productCoveragePercent: Number(row.product_coverage_percent) || 0,
    productId: row.product_id,
    productTitle: row.product_title,
    rank: row.rank,
    runId: row.run_id,
    stackContributionPercent: Number(row.stack_contribution_percent) || 0,
    stackCoveragePercent: Number(row.stack_coverage_percent) || 0,
    status: row.status,
    supplementProductCoveragePercent:
      Number(row.supplement_product_coverage_percent) || 0,
    totalCoveragePercent: Number(row.total_coverage_percent) || 0,
    unknownAtRecommendation: row.unknown_at_recommendation,
    urlUsed: row.url_used
  }));
  const runIds = new Set(mappedRows.map((row) => row.runId));
  const averageStackCoveragePercent =
    mappedRows.length > 0
      ? Math.round(
          mappedRows.reduce(
            (total, row) => total + row.stackCoveragePercent,
            0
          ) / mappedRows.length
        )
      : null;

  return {
    databaseAvailable: true,
    rows: mappedRows,
    summary: {
      averageStackCoveragePercent,
      runs: runIds.size,
      shownProducts: mappedRows.length
    }
  };
}

export async function getAdminExternalQueryData(
  view: AdminExternalQueryView,
  searchParams: URLSearchParams
) {
  const params = normalizeAdminQueryParams(searchParams);

  if (view === "conversions") {
    return adminQueryEnvelope(await getAdminFlowData(params.range, params.filters), params);
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

    return adminQueryEnvelope(
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

    return adminQueryEnvelope(data, params, data.pagination);
  }

  if (view === "leads") {
    const data = await getLeads(params);

    return adminQueryEnvelope(data, params, data.pagination);
  }

  if (view === "content") {
    const data = await getContentInventory(params);

    return adminQueryEnvelope(data, params, data.pagination);
  }

  if (view === "reviews") {
    const data = await getAdminReviewQueueData();
    const rows = data.rows.filter(
      (row) => !params.status || row.status === params.status
    );
    const { pageRows, pagination } = paginateAdminRows(rows, params);

    return adminQueryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "supplements") {
    const data = await getAdminSupplementsData();
    const rows = data.rows.filter(
      (row) => !params.status || row.listStatus === params.status
    );
    const { pageRows, pagination } = paginateAdminRows(rows, params);

    return adminQueryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "products") {
    const data = await getAdminProductsData();
    const rows = data.rows.filter(
      (row) =>
        (!params.status || row.status === params.status) &&
        (!params.filters.source || row.platform === params.filters.source)
    );
    const { pageRows, pagination } = paginateAdminRows(rows, params);

    return adminQueryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "product-recommendations") {
    const data = await getProductRecommendationHistory(params);
    const pagination = {
      cursor: params.cursor > 0 ? String(params.cursor) : null,
      limit: params.limit,
      nextCursor:
        data.rows.length === params.limit
          ? String(params.cursor + params.limit)
          : null
    } satisfies AdminQueryPagination;

    return adminQueryEnvelope(data, params, pagination);
  }

  if (view === "communications") {
    const data = await getAdminCommunicationsData(params.range);
    const rows = data.rows.filter(
      (row) => !params.status || row.status === params.status
    );
    const { pageRows, pagination } = paginateAdminRows(rows, params);

    return adminQueryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "alerts") {
    const data = await getAdminTechnicalAlertsData(params.range);
    const rows = data.rows.filter(
      (row) =>
        !params.status ||
        row.adminStatus === params.status ||
        row.status === params.status
    );
    const { pageRows, pagination } = paginateAdminRows(rows, params);

    return adminQueryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  if (view === "tasks") {
    const data = await getAdminTaskVisibilityData(params.range);
    const rows = data.rows.filter(
      (row) => !params.status || row.status === params.status
    );
    const { pageRows, pagination } = paginateAdminRows(rows, params);

    return adminQueryEnvelope({ ...data, rows: pageRows }, params, pagination);
  }

  const data = await getAdminAgentsData(params.range);
  const rows = data.rows.filter(
    (row) => !params.status || row.status === params.status
  );
  const { pageRows, pagination } = paginateAdminRows(rows, params);

  return adminQueryEnvelope({ ...data, rows: pageRows }, params, pagination);
}
