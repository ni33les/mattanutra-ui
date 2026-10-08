import { getQuestionnaireDefinition } from "@/lib/questionnaire/definition";
import type { AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import type { AdminLeadRow } from "@/lib/admin-query-data";
import type { Locale } from "@/lib/i18n";

export const QUESTIONNAIRE_INACTIVITY_MS = 30 * 60_000;
export const questionnaireEventNames = ["chat_start", "chat_question_viewed", "chat_question_activity", "chat_answer", "chat_skip",
  "chat_complete", "chat_capture_failed", "chat_part_checkpoint", "assessment_captured", "assessment_recaptured", "assessment_submitted"];
export type QuestionnaireJourney = "web" | "retail";
export type QuestionnaireBucket = "dropped" | "unknown" | "transition" | "submission_failed" | "submission_pending" | "active" | "completed";
export type QuestionProperties = {
  attemptId?: string; sessionId?: string; questionnaireVersion?: string; turnKey?: string; displayId?: string;
  clientAt?: number; telemetryEventId?: string; postCompletionReview?: boolean;
};
export type QuestionnaireEventRow = {
  id: string; attemptKey: string; eventName: string; occurredAt: string; properties: QuestionProperties; inScope: boolean;
  journey: QuestionnaireJourney; pharmacy: string; source: string; ray: string | null; planId: string | null;
  emailHash: string | null; locale: string | null; campaign: string | null; path: string | null; contactEmail: string | null;
};
export type QuestionFunnelRow = {
  key: string; version: string; order: number; reached: number; continued: number; inProgress: number; dropped: number; unknown: number;
};
export type QuestionnaireFunnelGroup = {
  journey: QuestionnaireJourney; pharmacy: string; source: string; questions: QuestionFunnelRow[];
  unknown: number; transition: number; submission_failed: number; submission_pending: number; active: number;
};
export type QuestionnaireFunnelReport = {
  databaseAvailable: boolean; generatedAt: string; range: AdminDashboardRange; filters: AdminDashboardFilters;
  groups: QuestionnaireFunnelGroup[];
};
export type QuestionnaireAttempt = {
  key: string; journey: QuestionnaireJourney; pharmacy: string; source: string; version: string;
  bucket: QuestionnaireBucket; questionKey: string | null; lastAnsweredKey: string | null;
  firstSeenAt: string; lastSeenAt: string; ray: string | null; planId: string | null; emailHash: string | null;
  contactEmail: string | null; locale: string | null; campaign: string | null; events: QuestionnaireEventRow[];
};
export type QuestionnaireDropoffPage = {
  generatedAt: string; rows: Omit<QuestionnaireAttempt, "events">[]; total: number;
  pagination: { cursor: number; limit: number; nextCursor: number | null }; lead?: AdminLeadRow;
};

export function questionLabel(key: string | null, version: string, locale: Locale) {
  const definition = getQuestionnaireDefinition(locale);
  if (!key || version !== definition.version) return null;
  const turn = definition.turns.find(t => t.k === key);
  return turn ? { question: turn.q, section: definition.sections[turn.sec]?.title ?? "", order: definition.turns.indexOf(turn) } : null;
}

function eventTime(row: QuestionnaireEventRow) {
  const received = Date.parse(row.occurredAt), client = row.properties.clientAt;
  // Browser clocks cannot move inactivity into the future. Small delivery reorderings use the client clock.
  return typeof client === "number" && Number.isFinite(client) && Math.abs(client - received) < 5 * 60_000
    ? Math.min(client, received) : received;
}
function compareEvents(a: QuestionnaireEventRow, b: QuestionnaireEventRow) {
  return eventTime(a) - eventTime(b)
    || Number(b.eventName === "chat_question_viewed") - Number(a.eventName === "chat_question_viewed")
    || a.id.localeCompare(b.id);
}
function validView(row: QuestionnaireEventRow) {
  return row.eventName === "chat_question_viewed" && Boolean(row.properties.attemptId && row.properties.displayId
    && questionLabel(row.properties.turnKey ?? null, row.properties.questionnaireVersion ?? "", "en"));
}
function answered(row: QuestionnaireEventRow) { return row.eventName === "chat_answer" || row.eventName === "chat_skip"; }
function resolved(view: QuestionnaireEventRow, events: QuestionnaireEventRow[]) {
  return events.some(e => answered(e) && e.properties.displayId === view.properties.displayId
    && e.properties.turnKey === view.properties.turnKey && eventTime(e) >= eventTime(view));
}

/** Aggregate only metadata. The returned report never contains visitor identifiers or answers. */
export function buildQuestionnaireReport(input: {
  rows: readonly QuestionnaireEventRow[]; generatedAt: string; range: AdminDashboardRange; filters: AdminDashboardFilters;
}) {
  const groups = new Map<string, QuestionnaireFunnelGroup>();
  const histories = new Map<string, QuestionnaireEventRow[]>();
  const asOf = Date.parse(input.generatedAt);
  for (const row of input.rows) {
    if (Date.parse(row.occurredAt) > asOf || row.properties.postCompletionReview) continue;
    const history = histories.get(row.attemptKey) ?? [];
    history.push(row); histories.set(row.attemptKey, history);
  }
  const attempts: QuestionnaireAttempt[] = [];
  for (const [key, raw] of histories) {
    const dedup = new Map<string, QuestionnaireEventRow>();
    for (const row of raw) {
      const id = row.properties.telemetryEventId || row.id;
      const previous = dedup.get(id);
      if (!previous || Date.parse(row.occurredAt) < Date.parse(previous.occurredAt)) dedup.set(id, row);
    }
    let events = [...dedup.values()].sort(compareEvents);
    // Legacy rows lack an attempt identifier. Never let an earlier completion conceal a later start.
    if (key.startsWith("legacy:")) {
      const lastStart = events.findLastIndex(e => e.eventName === "chat_start");
      if (lastStart >= 0) events = events.slice(lastStart);
    }
    const cohort = events.filter(e => e.inScope);
    if (!cohort.length) continue;
    const entry = cohort.find(validView) ?? cohort[0];
    const groupKey = JSON.stringify([entry.journey, entry.pharmacy, entry.source]);
    const group = groups.get(groupKey) ?? { journey: entry.journey, pharmacy: entry.pharmacy, source: entry.source,
      questions: [], unknown: 0, transition: 0, submission_failed: 0, submission_pending: 0, active: 0 };
    groups.set(groupKey, group);
    const last = events.at(-1)!;
    const lastActivity = events.reduce((latest, e) => Math.max(latest, eventTime(e)), 0);
    const inactive = asOf - lastActivity >= QUESTIONNAIRE_INACTIVITY_MS;
    const views = events.filter(validView);
    const latestView = views.at(-1);
    const latestRawView = events.findLast(e => e.eventName === "chat_question_viewed");
    const lastAnswer = events.findLast(answered);
    const captured = events.some(e => ["assessment_captured", "assessment_recaptured", "assessment_submitted"].includes(e.eventName));
    const complete = events.some(e => e.eventName === "chat_complete");
    const failed = events.some(e => e.eventName === "chat_capture_failed");
    const open = latestView && latestRawView === latestView && !resolved(latestView, events)
      && (!lastAnswer || eventTime(lastAnswer) < eventTime(latestView));
    let bucket: QuestionnaireBucket;
    if (captured) bucket = "completed";
    else if (failed) bucket = "submission_failed";
    else if (complete) bucket = "submission_pending";
    else if (open) bucket = inactive ? "dropped" : "active";
    else if (latestRawView && !validView(latestRawView)) bucket = inactive ? "unknown" : "active";
    else if (latestView) bucket = inactive ? "transition" : "active";
    else bucket = inactive ? "unknown" : "active";
    const version = latestView?.properties.questionnaireVersion ?? last.properties.questionnaireVersion ?? "unknown";
    const attempt: QuestionnaireAttempt = {
      key, journey: entry.journey, pharmacy: entry.pharmacy, source: entry.source, version, bucket,
      questionKey: open ? latestView!.properties.turnKey! : null, lastAnsweredKey: lastAnswer?.properties.turnKey ?? null,
      firstSeenAt: events[0].occurredAt, lastSeenAt: new Date(lastActivity).toISOString(),
      ray: events.findLast(e => e.ray)?.ray ?? null, planId: events.findLast(e => e.planId)?.planId ?? null,
      emailHash: events.findLast(e => e.emailHash)?.emailHash ?? null,
      contactEmail: events.findLast(e => e.contactEmail)?.contactEmail ?? null,
      locale: entry.locale, campaign: entry.campaign, events
    };
    const stoppingQuestionInCohort = cohort.some(e => validView(e) && e.properties.turnKey === attempt.questionKey
      && e.properties.questionnaireVersion === attempt.version);
    if (bucket !== "dropped" || stoppingQuestionInCohort) attempts.push(attempt);
    if (bucket !== "completed" && bucket !== "dropped") group[bucket]++;
    const reached = new Map<string, QuestionnaireEventRow>();
    for (const view of views) if (view.inScope) reached.set(`${view.properties.questionnaireVersion}:${view.properties.turnKey}`, view);
    for (const view of reached.values()) {
      const questionKey = view.properties.turnKey!, questionVersion = view.properties.questionnaireVersion!;
      let row = group.questions.find(q => q.key === questionKey && q.version === questionVersion);
      if (!row) {
        row = { key: questionKey, version: questionVersion, order: questionLabel(questionKey, questionVersion, "en")!.order,
          reached: 0, continued: 0, inProgress: 0, dropped: 0, unknown: 0 };
        group.questions.push(row);
      }
      row.reached++;
      const currentView = views.findLast(v => v.properties.turnKey === questionKey && v.properties.questionnaireVersion === questionVersion)!;
      if (resolved(currentView, events)) row.continued++;
      else if (currentView === latestView && bucket === "dropped") row.dropped++;
      else if (currentView === latestView && bucket === "active") row.inProgress++;
      else row.unknown++;
    }
  }
  for (const group of groups.values()) group.questions.sort((a, b) => a.version.localeCompare(b.version) || a.order - b.order);
  const report: QuestionnaireFunnelReport = { databaseAvailable: true, generatedAt: input.generatedAt,
    range: input.range, filters: input.filters, groups: [...groups.values()] };
  return { report, attempts };
}
