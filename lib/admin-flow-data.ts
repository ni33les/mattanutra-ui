import { getSql } from "@/lib/db";
import {
  adminDashboardFilterSql,
  type AdminDashboardFilters
} from "@/lib/admin-dashboard-filters";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import { writeBpmEvent } from "@/lib/bpm";

export type AdminFlowNodeId =
  | "assessmentStarted"
  | "assessmentSubmitted"
  | "assessmentViewed"
  | "chatClicked"
  | "dropoffAfterAssessment"
  | "dropoffAfterAssessmentStart"
  | "dropoffAfterFormulation"
  | "dropoffAfterFreeEmailRequest"
  | "dropoffAfterHealthScore"
  | "dropoffAfterLanding"
  | "dropoffAfterPlanSelection"
  | "dropoffAfterPrecisionPayment"
  | "dropoffAfterProPayment"
  | "dropoffAfterResults"
  | "dropoffAfterSubmission"
  | "formulationReady"
  | "freeEmailRequested"
  | "freeEmailSent"
  | "healthscoreViewed"
  | "landingViewed"
  | "marketplaceClicked"
  | "planSelected"
  | "precisionPaid"
  | "proPaid"
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
  databaseAvailable: boolean;
  edges: AdminFlowEdge[];
  generatedAt: string;
  nodes: AdminFlowNode[];
  range: AdminDashboardRange;
  series: {
    bucketLabels: string[];
    nodes: Partial<Record<AdminFlowNodeId, number[]>>;
  };
  summary: {
    conversionRate: number;
    converted: number;
    entered: number;
    reachedHealthScore: number;
  };
  targets: AdminConversionTargets;
}>;

export type AdminConversionTargetId =
  | "assessmentCompletions"
  | "assessmentStarts"
  | "freeRequests"
  | "healthScoreViews"
  | "landingVisitors"
  | "precisionConversions"
  | "proConversions";

export type AdminConversionTargets = Record<AdminConversionTargetId, number>;

const conversionTargetIds: AdminConversionTargetId[] = [
  "landingVisitors",
  "assessmentStarts",
  "assessmentCompletions",
  "healthScoreViews",
  "freeRequests",
  "precisionConversions",
  "proConversions"
];

export const defaultAdminConversionTargets = {
  assessmentCompletions: 65,
  assessmentStarts: 30,
  freeRequests: 20,
  healthScoreViews: 95,
  landingVisitors: 100,
  precisionConversions: 5,
  proConversions: 1
} satisfies AdminConversionTargets;

type FlowRow = Readonly<{
  event_name: string;
  event_status: string | null;
  event_type: string | null;
  id: string;
  occurred_at: Date | string;
  plan_id: string | null;
  ray: string | null;
  selected_plan: string | null;
}>;

const coreNodeIds: AdminFlowNodeId[] = [
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

const dropoffNodeIds: AdminFlowNodeId[] = [
  "dropoffAfterLanding",
  "dropoffAfterAssessment",
  "dropoffAfterAssessmentStart",
  "dropoffAfterSubmission",
  "dropoffAfterHealthScore",
  "dropoffAfterFreeEmailRequest",
  "dropoffAfterPlanSelection",
  "dropoffAfterPrecisionPayment",
  "dropoffAfterProPayment",
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

const dropoffNodeByStage = {
  assessmentStarted: "dropoffAfterAssessmentStart",
  assessmentSubmitted: "dropoffAfterSubmission",
  assessmentViewed: "dropoffAfterAssessment",
  formulationReady: "dropoffAfterFormulation",
  freeEmailRequested: "dropoffAfterFreeEmailRequest",
  healthscoreViewed: "dropoffAfterHealthScore",
  landingViewed: "dropoffAfterLanding",
  planSelected: "dropoffAfterPlanSelection",
  precisionPaid: "dropoffAfterPrecisionPayment",
  proPaid: "dropoffAfterProPayment",
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

function buildFlowBuckets(range: AdminDashboardRange, rows: FlowRow[]) {
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

function isPaidEvent(row: FlowRow) {
  return (
    paidEventNames.has(row.event_name) ||
    (row.event_type === "payment" &&
      Boolean(row.event_status && paidEventStatuses.has(row.event_status)))
  );
}

function nodesForRow(row: FlowRow): AdminFlowNodeId[] {
  if (row.event_name === "home_viewed" || row.event_name === "blog_article_viewed") {
    return ["landingViewed"];
  }

  if (row.event_name === "assessment_viewed") {
    return ["assessmentViewed"];
  }

  if (row.event_name === "assessment_started") {
    return ["assessmentStarted"];
  }

  if (
    row.event_name === "assessment_submitted" ||
    row.event_name === "assessment_captured" ||
    row.event_name === "assessment_recaptured"
  ) {
    return ["assessmentSubmitted"];
  }

  if (row.event_name === "healthscore_viewed") {
    return ["healthscoreViewed"];
  }

  if (row.event_name === "free_email_requested") {
    return ["freeEmailRequested"];
  }

  if (row.event_name === "free_email_sent") {
    return ["freeEmailSent"];
  }

  if (row.event_name === "plan_selected") {
    return ["planSelected"];
  }

  if (isPaidEvent(row) && row.selected_plan === "precision") {
    return ["precisionPaid"];
  }

  if (isPaidEvent(row) && row.selected_plan === "pro") {
    return ["proPaid"];
  }

  if (row.event_name === "formulation_ready") {
    return ["formulationReady"];
  }

  if (row.event_name === "formulation_page_viewed") {
    return ["resultsViewed"];
  }

  if (row.event_name === "chat_channel_clicked") {
    return ["chatClicked"];
  }

  if (row.event_name === "marketplace_product_clicked") {
    return ["marketplaceClicked"];
  }

  return [];
}

function edgeKey(from: AdminFlowNodeId, to: AdminFlowNodeId) {
  return `${from}->${to}`;
}

function emptyFlow(range: AdminDashboardRange): AdminFlowData {
  return {
    databaseAvailable: false,
    edges: edgeDefinitions,
    generatedAt: new Date().toISOString(),
    nodes: nodeIds.map((id) => ({ count: 0, id })),
    range,
    series: emptyFlowSeries(range),
    summary: {
      conversionRate: 0,
      converted: 0,
      entered: 0,
      reachedHealthScore: 0
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

  await sql`
    create table if not exists public.admin_conversion_targets (
      target_id text primary key,
      target_rate numeric(5, 2) not null,
      description text null,
      updated_by text null,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )
  `;

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

export async function getAdminFlowData(
  range: AdminDashboardRange,
  filters: AdminDashboardFilters
): Promise<AdminFlowData> {
  const sql = getSql();

  if (!sql) {
    return emptyFlow(range);
  }

  try {
    const targets = await getAdminConversionTargets();
    const start = queryStartForRange(range);
    const rows = start
      ? await sql<FlowRow[]>`
          select
            id::text,
            ray::text,
            plan_id::text,
            event_name,
            event_type,
            event_status,
            selected_plan::text,
            occurred_at
          from public.bpm
          where occurred_at >= ${start}
            and ${adminDashboardFilterSql(sql, filters)}
            and (
              event_name in (
                'assessment_captured',
                'assessment_recaptured',
                'assessment_started',
                'assessment_submitted',
                'assessment_viewed',
                'blog_article_viewed',
                'chat_channel_clicked',
                'formulation_page_viewed',
                'formulation_ready',
                'free_email_requested',
                'free_email_sent',
                'healthscore_viewed',
                'home_viewed',
                'marketplace_product_clicked',
                'plan_selected'
              )
              or event_name in (
                'checkout_completed',
                'checkout_paid',
                'payment_completed',
                'payment_confirmed',
                'payment_succeeded',
                'plan_paid'
              )
              or event_type = 'payment'
            )
          order by occurred_at asc
          limit 100000
        `
      : await sql<FlowRow[]>`
          select
            id::text,
            ray::text,
            plan_id::text,
            event_name,
            event_type,
            event_status,
            selected_plan::text,
            occurred_at
          from public.bpm
          where ${adminDashboardFilterSql(sql, filters)}
            and (
              event_name in (
              'assessment_captured',
              'assessment_recaptured',
              'assessment_started',
              'assessment_submitted',
              'assessment_viewed',
              'blog_article_viewed',
              'chat_channel_clicked',
              'formulation_page_viewed',
              'formulation_ready',
              'free_email_requested',
              'free_email_sent',
              'healthscore_viewed',
              'home_viewed',
              'marketplace_product_clicked',
              'plan_selected'
            )
            or event_name in (
              'checkout_completed',
              'checkout_paid',
              'payment_completed',
              'payment_confirmed',
              'payment_succeeded',
              'plan_paid'
            )
            or event_type = 'payment'
            )
          order by occurred_at asc
          limit 100000
        `;
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
    const buckets = buildFlowBuckets(range, rows);
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
    const convertedSubjects = [...subjects.values()].filter(
      (steps) =>
        steps.has("freeEmailRequested") ||
        steps.has("precisionPaid") ||
        steps.has("proPaid")
    ).length;
    const reachedHealthScore = countByNode.get("healthscoreViewed") ?? 0;

    return {
      databaseAvailable: true,
      edges,
      generatedAt: new Date().toISOString(),
      nodes: [...nodes, ...dropoffNodes],
      range,
      series: {
        bucketLabels: buckets.map((bucket) => bucket.label),
        nodes: seriesByNode
      },
      summary: {
        conversionRate:
          reachedHealthScore > 0
            ? Number(((convertedSubjects / reachedHealthScore) * 100).toFixed(1))
            : 0,
        converted: convertedSubjects,
        entered: countByNode.get("landingViewed") ?? 0,
        reachedHealthScore
      },
      targets
    };
  } catch (error) {
    console.error("Unable to load admin flow data", error);
    return emptyFlow(range);
  }
}
