import { getSql } from "@/lib/db";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";

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
  summary: {
    conversionRate: number;
    converted: number;
    entered: number;
    reachedHealthScore: number;
  };
}>;

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
    summary: {
      conversionRate: 0,
      converted: 0,
      entered: 0,
      reachedHealthScore: 0
    }
  };
}

export async function getAdminFlowData(
  range: AdminDashboardRange
): Promise<AdminFlowData> {
  const sql = getSql();

  if (!sql) {
    return emptyFlow(range);
  }

  try {
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
          where event_name in (
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
      summary: {
        conversionRate:
          reachedHealthScore > 0
            ? Number(((convertedSubjects / reachedHealthScore) * 100).toFixed(1))
            : 0,
        converted: convertedSubjects,
        entered: countByNode.get("landingViewed") ?? 0,
        reachedHealthScore
      }
    };
  } catch (error) {
    console.error("Unable to load admin flow data", error);
    return emptyFlow(range);
  }
}
