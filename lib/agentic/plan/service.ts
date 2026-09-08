import { catalogueSnapshotId } from "@/lib/agentic/catalogue/freeze";
import { validateProductDoseProposals } from "@/lib/matcher/serving-grid";
import { toMatcherProduct } from "@/lib/agentic/plan/to-matcher-product";
import { mergeRequestPatch, originalRequestFor } from "@/lib/agentic/plan/request-patch";
import { requestLifetime, withRequestLifetime } from "@/lib/request-lifetime";
import { admitPlanOperation, claimPlanOperation, failPlanOperation, updateClaimedOperation } from "@/lib/agentic/plan/operations";
import type { PlanOperationRecord } from "@/lib/agentic/store/types";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Locale } from "@/lib/i18n";
import type { AgenticConfig } from "@/lib/agentic/config";
import {
  businessError,
  isAgenticErrorResult,
  type AgenticErrorResult
} from "@/lib/agentic/contract/errors";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { issueCapability, nextTestUuid, resolveCapability } from "@/lib/agentic/capabilities";
import type { PlanMatchPort } from "@/lib/agentic/plan/match-port";
import {
  beginIdempotency,
  canonicalRequestHash,
  commitIdempotency,
  isIdempotencyRace
} from "@/lib/agentic/idempotency";
import { resolveMarket } from "@/lib/agentic/catalogue/market";
import { refreshAdminSafetyCeilings } from "@/lib/agentic/catalogue/load-safety-ceilings";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import { AGENTIC_CONTRACT_VERSION, GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { ensureCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import {
  persistCataloguePin,
  pinCatalogueSnapshot,
  restoreCataloguePin,
  pinnedSnapshotIdFromResult
} from "@/lib/agentic/catalogue/pin";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type { AgenticStore } from "@/lib/agentic/store/types";
import type { CapabilityScope } from "@/lib/agentic/capabilities";
import {
  applyPlanAnswers,
  normalizePlanRequest,
  planRematchFingerprint
} from "@/lib/agentic/plan/normalize";
import {
  coverageFor,
  toCanonicalRequest,
  leftoversFor,
  matcherTelemetryFor,
  matchPlan,
  unmetRequirementsFor
} from "@/lib/agentic/plan/matching";
import { evaluateSafety, planStatus, safetyQuestions } from "@/lib/agentic/plan/safety";
import { persistMatcherTelemetry } from "@/lib/agentic/plan/telemetry";
import { publicPlanFields } from "@/lib/agentic/public-mapper";
import { matchPlanInWorker, matchPlanChunkInWorker, MatcherUnavailableError } from "@/lib/agentic/plan/match-worker-pool";
import { issueEvidenceCapability } from "@/lib/agentic/evidence/tool";
import { planCompactApplicable } from "@/lib/agentic/contract/plan-result";
import { planClaimIds, planResearchVersion } from "@/lib/agentic/value/compact-decision";
import { commitFunnelEvent } from "@/lib/agentic/funnel/ledger";
import { setQueryNamespace } from "@/lib/agentic/plan/query-budget";
import { acquirePermit, releasePermit } from "@/lib/agentic/qa/resource-permits";
import { persistQueryBudget } from "@/lib/agentic/qa/persist";
import { QA_NAMESPACE_PREFIX } from "@/lib/agentic/qa/session";
import { throwIfAborted, waitUntilCancelled } from "@/lib/agentic/qa/request-trace";
import {
  deadlineExceeded,
  serviceDeadlineError,
  waitUntilDeadline
} from "@/lib/agentic/qa/service-clock";
import { waitForServiceDelay } from "@/lib/agentic/qa/service-clock";
import { buildHorizonPlan } from "@/lib/agentic/value/inventory-ledger";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import { isDoseError, scaleAmount } from "@/lib/matcher/dose";
import type {
  CanonicalPlanState,
  PlanAnswer,
  PlanQuestion,
  PlanRequest,
  PlanRequestPatch,
  PlanResult,
  SafetyAcknowledgement,
  StackOption
} from "@/lib/agentic/plan/types";

export const PLAN_FEEDBACK_AFTER_REVISIONS = 3;
export const PLAN_MATCH_RETURN_BUDGET_MS = 3_000;
export const PLAN_PROCESSING_POLL_AFTER_SECONDS = 1;

let matcherGate: Promise<void> | null = null;
let matcherEntered: (() => void) | null = null;

export function setMatcherGateForTests(gate: Promise<void> | null) {
  matcherGate = gate;
}

export function setMatcherEnteredForTests(notify: (() => void) | null) {
  matcherEntered = notify;
}

const planClaimLatches = new Map<string, Promise<void>>();
const planClaimEntered = new Map<string, () => void>();

export function setPlanClaimLatchForTests(
  key: string,
  gate: Promise<void> | null,
  entered: (() => void) | null = null
) {
  if (!gate) {
    planClaimLatches.delete(key);
    planClaimEntered.delete(key);
    return;
  }
  planClaimLatches.set(key, gate);
  if (entered) {
    planClaimEntered.set(key, entered);
  }
}

export function snapshotPlanInflightForTests() {
  return {
    idempotency: inflightPlanIdempotency.size,
    matches: inflightPlanMatches.size
  };
}

export function resetPlanCreateInflightForTests() {
  inflightPlanIdempotency.clear();
  inflightPlanMatches.clear();
}

type PlanAttempt = Readonly<{
  operation?: PlanOperationRecord;
  operationStore?: AgenticStore;
  correlationId: string;
  signal?: AbortSignal;
  releases: Set<() => void>;
}>;
type PlanWork = Readonly<{
  attempt: PlanAttempt;
  work: Promise<PlanToolSuccess | AgenticErrorResult>;
}>;
const planAttempts = new AsyncLocalStorage<PlanAttempt>();
const inflightPlanMatches = new Map<string, PlanWork>();
const inflightPlanIdempotency = new Map<string, PlanWork & { hash: string }>();

function attemptStopped(attempt: PlanAttempt) {
  return attempt.signal ? attempt.signal.aborted : Boolean(attempt.correlationId && deadlineExceeded(attempt.correlationId));
}

function releaseAttempt(attempt: PlanAttempt | undefined) {
  for (const release of attempt?.releases ?? []) release();
}

function trackPlanWork<T extends PlanWork>(map: Map<string, T>, key: string, entry: T) {
  const release = () => {
    // A cancelled attempt may finish after its replacement has already started.
    if (map.get(key) === entry) map.delete(key);
  };
  map.set(key, entry);
  entry.attempt.releases.add(release);
  if (attemptStopped(entry.attempt)) release();
  void entry.work.finally(() => {
    release();
    entry.attempt.releases.delete(release);
  }).catch(() => undefined);
}

function planCorrelationId(idempotencyKey?: string) {
  return requestLifetime()?.correlationId ?? (idempotencyKey ? `plan:${idempotencyKey}` : "");
}

function logicalPlanQueryCounts(namespace: string) {
  void namespace;
  return {
    "catalogue.snapshot.TH": 1,
    "plan.match": 1,
    "plan.match.hit": 1,
    "plan.match.miss": 0
  };
}

async function stopIfPlanDeadline(
  idempotencyKey: string | undefined
): Promise<AgenticErrorResult | null> {
  const correlation = planCorrelationId(idempotencyKey);
  if (!correlation) {
    return null;
  }
  try {
    planAttempts.getStore()?.signal?.throwIfAborted();
    throwIfAborted(correlation);
  } catch {
    releaseAttempt(planAttempts.getStore());
    return serviceDeadlineError(correlation);
  }
  if (!deadlineExceeded(correlation)) {
    return null;
  }
  releaseAttempt(planAttempts.getStore());
  return serviceDeadlineError(correlation);
}

export type PlanToolInput = Readonly<{
  answers?: unknown;
  expectedRevision?: number;
  idempotencyKey?: string;
  operation?: "answer" | "create" | "get" | "revise" | "select";
  optionId?: string;
  planHandle?: string;
  request?: unknown;
  requestPatch?: unknown;
  safetyAcknowledgement?: unknown;
  selectOptionId?: string;
  searchEffort?: "standard" | "expanded";
}>;

export type PlanToolSuccess = ReturnType<typeof publicPlanFields> &
  Readonly<{
    feedbackInvitation?: Readonly<{ prompt: string; promptKey: string }>;
    ok: true;
    planHandle: string;
    revision: number;
  }>;

function asAnswers(value: unknown): PlanAnswer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is PlanAnswer =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { choice?: unknown }).choice === "string" &&
      typeof (item as { questionId?: unknown }).questionId === "string"
  );
}

function asAck(value: unknown): SafetyAcknowledgement | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    record.confirmed !== true ||
    !Array.isArray(record.guidanceIds) ||
    typeof record.revision !== "number"
  ) {
    return null;
  }

  return {
    confirmed: true,
    guidanceIds: record.guidanceIds.filter((item): item is string => typeof item === "string"),
    revision: record.revision
  };
}

function requestRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function incomingAnswers(payload: PlanToolInput) {
  const nested = requestRecord(payload.request);
  return [
    ...asAnswers(payload.answers),
    ...asAnswers(nested?.answers)
  ];
}

function incomingAck(payload: PlanToolInput) {
  return asAck(payload.safetyAcknowledgement) ?? asAck(requestRecord(payload.request)?.safetyAcknowledgement);
}

function hasFullRequest(payload: PlanToolInput) {
  const nested = requestRecord(payload.request);
  return (Array.isArray(nested?.targets) && nested.targets.length > 0) || Boolean(requestRecord(payload.requestPatch));
}

function composeResult(input: Readonly<{
  alternativeSearch?: PlanResult["alternativeSearch"];
  searchSummary?: PlanResult["searchSummary"];
  matchingDiagnostics?: PlanResult["matchingDiagnostics"];
  ackMs?: number;
  alternatives: readonly StackOption[];
  catalogueMs?: number;
  locale: Locale;
  leftovers: PlanResult["leftovers"];
  lossCertificates?: PlanResult["matcherTelemetry"]["lossCertificates"];
  matchMs?: number;
  previous: PlanResult | null;
  rejected?: PlanResult["matcherTelemetry"]["rejectedAll"];
  searchMs?: number;
  selected: StackOption | null;
  shownRevision: number;
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
  targetFrontiers?: PlanResult["matcherTelemetry"]["targetFrontiers"];
  unmetRequirements: readonly string[];
}>): PlanResult {
  const tooBroad =
    input.state.targets.length > 30 &&
    (!input.selected || input.selected.basket.length === 0);
  const coverage = tooBroad
    ? []
    : input.selected?.coverage ?? coverageFor(input.state, null);
  const workState = {
    ...input.state,
    leftovers: input.leftovers,
    pinnedOptionId: input.selected?.optionId ?? input.state.pinnedOptionId
  };
  const safety = evaluateSafety({
    coverage,
    locale: input.locale,
    selected: input.selected,
    state: workState
  });
  const safetyQs = safetyQuestions({
    alternatives: input.alternatives,
    guidance: safety,
    locale: input.locale,
    selected: input.selected,
    shownRevision: input.shownRevision,
    state: workState,
    unmetRequirements: [...input.unmetRequirements]
  });
  const splitQuestion: PlanQuestion = {
    choices: [
      {
        choice: "split_request",
        effect: "split_request",
        label: agenticMessage(input.locale, "plan.question.split_request"),
        labelKey: "plan.question.split_request"
      }
    ],
    prompt: agenticMessage(input.locale, "plan.question.split_request"),
    promptKey: "plan.question.split_request",
    questionId: "q_request_too_broad"
  };
  const questions = tooBroad ? [splitQuestion] : safetyQs;
  const horizon = tooBroad
    ? undefined
    : buildHorizonPlan({
        items: input.selected?.basket ?? [],
        snapshot: input.snapshot,
        state: workState
      });
  const status = tooBroad
    ? "needs_input"
    : planStatus({
        guidance: safety,
        horizon,
        questions,
        selected: input.selected,
        state: workState,
        unmetRequirements: [...input.unmetRequirements]
      });
  const summary = tooBroad
    ? agenticMessage(input.locale, "plan.summary.request_too_broad")
    : agenticMessage(input.locale, `plan.summary.${status}`);
  const split = tooBroad ? targetNameGroups(input.state.targets, 10) : undefined;
  const suggestedGroups = split?.groups;
  const changeSummary: string[] = [];
  const pinnedState = workState;

  if (input.previous) {
    if (input.previous.status !== status) {
      changeSummary.push(`status:${input.previous.status}->${status}`);
    }

    if (input.previous.selected?.optionId !== input.selected?.optionId) {
      changeSummary.push(
        input.selected ? `selected_option:${input.selected.optionId}` : "selected_cleared"
      );
    }

    if (
      input.previous.selected?.totalPriceMinor !== input.selected?.totalPriceMinor
    ) {
      changeSummary.push("price_changed");
    }
  }

  pinCatalogueSnapshot(input.snapshot, GUIDANCE_RULES_VERSION);
  return {
    contractVersion: AGENTIC_CONTRACT_VERSION,
    ...(input.alternativeSearch ? { alternativeSearch: input.alternativeSearch } : {}),
    ...(input.searchSummary ? { searchSummary: input.searchSummary } : {}),
    ...(input.matchingDiagnostics ? { matchingDiagnostics: { ...input.matchingDiagnostics, ...(input.selected?.basket.length ? { reasonCode: "purchase_options_available" as const } : {}) } } : {}),
    originalRequest: input.state.originalRequest,
    alternatives: [...input.alternatives],
    appliedRequirements: Object.entries(pinnedState.requirements)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
    assumptions: [],
    availabilityAsOf: input.snapshot.availabilityAsOf,
    basket: input.selected?.basket ?? [],
    catalogueVersion: input.snapshot.catalogueVersion,
    changeSummary,
    coverage,
    guidanceRulesVersion: GUIDANCE_RULES_VERSION,
    leftovers: tooBroad ? [] : input.leftovers,
    ...(horizon ? { horizon } : {}),
    matcherTelemetry: matcherTelemetryFor({
      ackMs: input.ackMs,
      catalogueMs: input.catalogueMs,
      leftovers: tooBroad ? [] : input.leftovers,
      lossCertificates: input.lossCertificates,
      matchMs: input.matchMs,
      rejected: input.rejected ?? input.previous?.matcherTelemetry.rejectedAll,
      searchDeadlineMs: DEFAULT_MATCHER_CONFIG.searchDeadlineMs,
      searchMs: input.searchMs,
      selected: input.selected,
      snapshot: input.snapshot,
      state: pinnedState,
      targetFrontiers: input.targetFrontiers
    }),
    optimizationEvidence: {
      mode: pinnedState.optimization,
      tieBreak: [
        "exact_normalized_dose_total_with_upper_limit_weight_2",
        ...(pinnedState.optimization === "fewest_pills" ? ["daily_pills"] : pinnedState.optimization === "balanced" || pinnedState.optimization === "best_coverage" ? ["capped_aggregate_coverage_desc"] : []),
        "price_minor",
        "daily_pills",
        "product_count",
        "seller_id_and_sorted_product_dose_variant_ids"
      ]
    },
    questions,
    ...(questions.find((item) => item.targets && item.targets.length > 0)?.targets
      ? {
          gapReview: {
            targets: questions.find((item) => item.targets && item.targets.length > 0)!.targets!
          }
        }
      : {}),
    requestSnapshot: pinnedState,
    safetyGuidance: [...safety],
    selected: input.selected,
    status,
    summary,
    unmetRequirements: [...input.unmetRequirements],
    ...(tooBroad && suggestedGroups
      ? {
          breadth: {
            maxTargetsPerRequest: 10,
            reasonCode: "request_too_broad" as const,
            suggestedGroups,
            ...(split?.unsupported.length
              ? { unsupportedTargets: split.unsupported }
              : {})
          }
        }
      : {})
  };
}

function targetNameGroups(
  targets: CanonicalPlanState["targets"],
  size: number
) {
  const feasible: Array<{ amount: number; name: string; unit: string }> = [];
  const unsupported: Array<{
    amount: number;
    name: string;
    reason: "unsupported_unit_conversion";
    unit: string;
  }> = [];
  for (const item of targets) {
    const name = item.requestedName ?? item.name;
    const row = { amount: item.amount, name, unit: item.unit };
    const scaled = scaleAmount({
      amount: item.amount,
      subjectId: item.supplementId,
      subjectName: name,
      unit: item.unit
    });
    if (isDoseError(scaled)) {
      unsupported.push({ ...row, reason: "unsupported_unit_conversion" });
      continue;
    }
    feasible.push(row);
  }
  const groups: Array<{
    names: string[];
    targets: Array<{ amount: number; name: string; unit: string }>;
  }> = [];
  for (let index = 0; index < feasible.length; index += size) {
    const slice = feasible.slice(index, index + size);
    groups.push({
      names: slice.map((item) => item.name),
      targets: slice
    });
  }
  return { groups, unsupported };
}

type DurableSearchCheckpoint = {
  stage: "normalized" | "search"; state: CanonicalPlanState; catalogueId: string;
  search?: import("@/lib/agentic/plan/matching").PlanSearchCheckpoint;
  reservedAttempts?: number;
};
async function durableMatch(input: { snapshot: CatalogueSnapshot; state: CanonicalPlanState }) {
  const attempt = planAttempts.getStore();
  if (!attempt?.operation || !attempt.operationStore) return matchPlanInWorker(input);
  const store = attempt.operationStore, claim = attempt.operation;
  const current = await store.getPlanOperation(claim.id);
  let checkpoint = current?.checkpoint as DurableSearchCheckpoint | null;
  if (!checkpoint) throw new Error("Missing normalized operation checkpoint");
  let lostAttempts = checkpoint.reservedAttempts ?? 0;
  while (true) {
    const remaining = (input.state.searchEffort === "expanded" ? 64_000 : checkpoint.search?.expansionBudget ?? 8_000)
      - (checkpoint.search?.expansionAttempts ?? 0) - lostAttempts;
    const chunkBudget = Math.min(4_000, Math.max(0, remaining));
    const reserved = { ...checkpoint, stage: "search" as const, reservedAttempts: chunkBudget + lostAttempts };
    if (!await updateClaimedOperation(store, claim, { checkpoint: reserved }, new Date().toISOString())) throw new Error("Matching operation lease lost");
    const reply = await matchPlanChunkInWorker(input, { checkpoint: checkpoint.search, chunkBudget: Math.max(1, chunkBudget), lostAttempts });
    checkpoint = { ...checkpoint, stage: "search", search: reply.checkpoint, reservedAttempts: 0 };
    if (!await updateClaimedOperation(store, claim, { checkpoint }, new Date().toISOString())) throw new Error("Matching operation lease lost");
    lostAttempts = 0;
    console.info("[agentic-plan-checkpoint]", { operationId: claim.id, attempts: reply.expansionAttempts, budget: reply.checkpoint.expansionBudget, checkpointBytes: reply.checkpoint.cursor.length, complete: reply.done });
    if (reply.done) {
      if (!reply.result) throw new Error("Completed matcher chunk has no result");
      return reply.result;
    }
  }
}

async function buildResult(input: Readonly<{
  catalogueMs?: number;
  locale: Locale;
  matchPort?: PlanMatchPort;
  matchStartedAt?: number;
  previous: PlanResult | null;
  shownRevision: number;
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): Promise<PlanResult> {
  const searchStartedAt = Date.now();
  const portMatch = input.matchPort?.match(input.state);
  const matched = portMatch
    ? {
        alternatives: portMatch.alternatives,
        leftovers: portMatch.leftovers,
        lossCertificates: undefined,
        rejected: [],
        selected: portMatch.selected,
        targetFrontiers: undefined,
        unmetRequirements: unmetRequirementsFor({
          option: portMatch.selected,
          state: input.state
        })
      }
    : process.env.NODE_TEST_CONTEXT && process.env.AX_REFINEMENT_REAL_WORKERS !== "1"
      ? matchPlan({ snapshot: input.snapshot, state: input.state })
      : await durableMatch({ snapshot: input.snapshot, state: input.state });
  const searchMs = Math.max(0, Date.now() - searchStartedAt);
  const matchMs =
    input.matchStartedAt != null ? Math.max(0, Date.now() - input.matchStartedAt) : searchMs;
  const ackMs =
    matchMs == null
      ? undefined
      : Math.min(matchMs, PLAN_MATCH_RETURN_BUDGET_MS);
  return composeResult({
    ackMs,
    alternatives: matched.alternatives,
    alternativeSearch: "alternativeSearch" in matched ? matched.alternativeSearch : undefined,
    searchSummary: "searchSummary" in matched ? matched.searchSummary : undefined,
    matchingDiagnostics: "matchingDiagnostics" in matched ? matched.matchingDiagnostics : undefined,
    catalogueMs: input.catalogueMs,
    locale: input.locale,
    leftovers: matched.leftovers,
    lossCertificates: matched.lossCertificates,
    matchMs,
    previous: input.previous,
    rejected: matched.rejected,
    searchMs,
    selected: matched.selected,
    shownRevision: input.shownRevision,
    snapshot: input.snapshot,
    state: input.state,
    targetFrontiers: matched.targetFrontiers,
    unmetRequirements: matched.unmetRequirements
  });
}

function advertisedAlternatives(
  previous: PlanResult,
  selected: StackOption
): StackOption[] {
  const rows = [previous.selected, ...previous.alternatives].filter(
    (item): item is StackOption => Boolean(item)
  );
  return rows.filter(
    (item, index, list) =>
      item.optionId !== selected.optionId &&
      list.findIndex((row) => row.optionId === item.optionId) === index
  );
}

function buildPinnedResult(input: Readonly<{
  locale: Locale;
  previous: PlanResult;
  selected: StackOption;
  shownRevision: number;
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): PlanResult {
  const unmet = unmetRequirementsFor({ option: input.selected, state: input.state });
  const leftovers = leftoversFor(
    input.state,
    input.selected,
    input.previous.alternatives[0] ?? null
  );

  return composeResult({
    alternatives: advertisedAlternatives(input.previous, input.selected),
    alternativeSearch: input.previous.alternativeSearch,
    searchSummary: input.previous.searchSummary,
    matchingDiagnostics: input.previous.matchingDiagnostics,
    locale: input.locale,
    leftovers,
    previous: input.previous,
    selected: input.selected,
    shownRevision: input.shownRevision,
    snapshot: input.snapshot,
    state: input.state,
    unmetRequirements: unmet
  });
}

function previousResult(record: unknown): PlanResult | null {
  return record && typeof record === "object" ? (record as PlanResult) : null;
}

function bindSafetyAcknowledgement(input: Readonly<{
  incomingAck: SafetyAcknowledgement | null;
  previous: PlanResult | null;
  answers: readonly PlanAnswer[];
  shownRevision: number;
  state: CanonicalPlanState;
}>): CanonicalPlanState {
  if (input.incomingAck) {
    const previousTargets = input.previous?.requestSnapshot.targets ?? [];
    const sameExposure = previousTargets.length === input.state.targets.length &&
      previousTargets.every((item, index) => {
        const next = input.state.targets[index];
        return (
          next != null &&
          item.supplementId === next.supplementId &&
          item.amount === next.amount &&
          item.unit === next.unit
        );
      });

    return {
      ...input.state,
      safetyAcknowledgement: sameExposure ? input.incomingAck : null
    };
  }

  if (input.state.safetyAcknowledgement) {
    return input.state;
  }

  const wantsAck = input.answers.some((item) => item.choice === "acknowledge_safety");

  if (!wantsAck || !input.previous) {
    return input.state;
  }

  const guidanceIds = input.previous.safetyGuidance
    .filter((item) => item.action === "acknowledge")
    .map((item) => item.guidanceId);

  if (guidanceIds.length === 0) {
    return input.state;
  }

  return {
    ...input.state,
    safetyAcknowledgement: {
      confirmed: true,
      guidanceIds,
      revision: input.shownRevision
    }
  };
}

function selectFromAnswers(answers: readonly PlanAnswer[]) {
  const found = answers.find((item) => item.choice.startsWith("select_option:"));
  return found ? found.choice.slice("select_option:".length) : undefined;
}

function matchInflightKey(planId: string, revision: number) {
  return `${planId}:${revision}`;
}

function isTerminalPlanStatus(
  status: PlanResult["status"]
): status is "blocked" | "needs_input" | "no_purchase" | "ready" {
  return (
    status === "blocked" ||
    status === "needs_input" ||
    status === "no_purchase" ||
    status === "ready"
  );
}

function successFromResult(input: Readonly<{
  locale: Locale;
  planHandle: string;
  result: PlanResult;
  revision: number;
}>): PlanToolSuccess {
  const fields = publicPlanFields(input.result);

  if (input.result.status === "processing") {
    return {
      contractVersion: AGENTIC_CONTRACT_VERSION,
      operationalDecision: fields.operationalDecision,
      locale: input.locale,
      nextActions: ["poll_plan"],
      ok: true as const,
      planHandle: input.planHandle,
      pollAfterSeconds: PLAN_PROCESSING_POLL_AFTER_SECONDS,
      revision: input.revision,
      status: "processing",
      summary: fields.summary,
      summaryKey: "plan.summary.processing"
    } as PlanToolSuccess;
  }

  return {
    ...fields,
    ok: true,
    planHandle: input.planHandle,
    revision: input.revision
  };
}

function requestFromState(state: CanonicalPlanState): PlanRequest {
  return {
    ...(state.originalRequest ?? {}),
    ...(state.intake ? { intake: state.intake } : {}),
    ...(state.baseline ? { baseline: state.baseline } : {}),
    ...(state.conditionCodes.length > 0 ? { conditionCodes: state.conditionCodes } : {}),
    ...(state.currentSupplements.length > 0
      ? { currentSupplements: state.currentSupplements }
      : {}),
    destinationCountry: state.destinationCountry,
    locale: state.locale,
    ...(state.medicationCodes.length > 0 ? { medicationCodes: state.medicationCodes } : {}),
    optimization: state.optimization,
    profile: state.profile,
    requirements: state.requirements,
    ...(state.safetyAcknowledgement
      ? { safetyAcknowledgement: state.safetyAcknowledgement }
      : {}),
    targets: state.targets
  };
}

function draftStateFromPayload(input: Readonly<{
  answers: readonly PlanAnswer[];
  payload: PlanToolInput;
  previous: PlanResult | null;
}>): CanonicalPlanState | null {
  if (hasFullRequest(input.payload)) {
    const request = input.payload.request as PlanRequest;
    return applyPlanAnswers(
      {
        acceptedGaps: [],
        searchEffort: input.payload.searchEffort ?? input.previous?.requestSnapshot.searchEffort ?? "standard",
        ...(request.baseline ? { baseline: request.baseline } : {}),
        conditionCodes: [...new Set(request.conditionCodes ?? [])],
        currency: "THB",
        currentSupplements: (request.currentSupplements ?? []).map((item) => ({
          dailyAmount: item.dailyAmount,
          ...(item.daysRemaining != null ? { daysRemaining: item.daysRemaining } : {}),
          name: item.name,
          ...(item.productId ? { productId: item.productId } : {}),
          supplementId: item.supplementId ?? item.name,
          unit: item.unit
        })),
        destinationCountry: request.destinationCountry,
        leftovers: [],
        locale: request.locale,
        medicationCodes: [...new Set(request.medicationCodes ?? [])],
        optimization: request.optimization,
        pinnedOptionId: input.previous?.selected?.optionId ?? null,
        profile: { ...request.profile, ageYears: request.profile.ageYears ?? 0, lifeStage: request.profile.lifeStage ?? "adult" },
        profileKnown: { ageYears: request.profile.ageYears != null, lifeStage: request.profile.lifeStage != null, sex: request.profile.sex != null },
        originalRequest: structuredClone(request),
        intake: request.intake ?? [],
        requirements: { ...request.requirements },
        safetyAcknowledgement: request.safetyAcknowledgement ?? null,
        targets: request.targets.map((item) => ({
          amount: item.amount,
          ...(item.basis ? { basis: item.basis } : {}),
          ...(item.acceptableRange ? { acceptableRange: item.acceptableRange } : {}),
          ...(item.importance ? { importance: item.importance } : {}),
          name: item.name,
          ...(item.prerequisite ? { prerequisite: item.prerequisite } : {}),
          supplementId: item.supplementId ?? item.name,
          unit: item.unit
        }))
      },
      { answers: input.answers }
    );
  }

  if (input.previous) {
    return applyPlanAnswers(input.previous.requestSnapshot, {
      answers: input.answers
    });
  }

  return null;
}

function processingResult(input: Readonly<{
  locale: Locale;
  pendingInput?: PlanResult["pendingInput"];
  previous: PlanResult | null;
  state: CanonicalPlanState;
}>): PlanResult {
  const selected = input.previous?.selected ?? null;
  const leftovers = input.previous?.leftovers ?? input.state.leftovers;
  const pinnedState = {
    ...input.state,
    leftovers,
    pinnedOptionId: selected?.optionId ?? input.state.pinnedOptionId
  };

  return {
    alternatives: input.previous?.alternatives ?? [],
    appliedRequirements: Object.entries(pinnedState.requirements)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
    assumptions: [],
    availabilityAsOf: input.previous?.availabilityAsOf ?? new Date().toISOString(),
    basket: selected?.basket ?? [],
    catalogueVersion: input.previous?.catalogueVersion ?? "processing",
    changeSummary: [],
    coverage: selected?.coverage ?? [],
    guidanceRulesVersion: input.previous?.guidanceRulesVersion ?? "processing",
    leftovers,
    matcherTelemetry: matcherTelemetryFor({
      leftovers,
      searchDeadlineMs: DEFAULT_MATCHER_CONFIG.searchDeadlineMs,
      selected,
      state: pinnedState
    }),
    optimizationEvidence: {
      mode: pinnedState.optimization,
      tieBreak: [
        "exact_normalized_dose_total_with_upper_limit_weight_2",
        ...(pinnedState.optimization === "fewest_pills" ? ["daily_pills"] : pinnedState.optimization === "balanced" || pinnedState.optimization === "best_coverage" ? ["capped_aggregate_coverage_desc"] : []),
        "price_minor",
        "daily_pills",
        "product_count",
        "seller_id_and_sorted_product_dose_variant_ids"
      ]
    },
    questions: input.previous?.questions ?? [],
    contractVersion: AGENTIC_CONTRACT_VERSION,
    ...(input.pendingInput ? { pendingInput: input.pendingInput, originalRequest: input.pendingInput.request } : {}),
    requestSnapshot: pinnedState,
    safetyGuidance: input.previous?.safetyGuidance ?? [],
    selected,
    status: "processing",
    summary: agenticMessage(input.locale, "plan.summary.processing"),
    unmetRequirements: input.previous?.unmetRequirements ?? []
  };
}

function revisionRecord(
  planId: string,
  revision: number,
  result: PlanResult,
  createdAt: string
) {
  return {
    availabilityAsOf: result.availabilityAsOf,
    catalogueVersion: result.catalogueVersion,
    createdAt,
    guidanceRulesVersion: result.guidanceRulesVersion,
    planId,
    requestSnapshot: result.requestSnapshot,
    result,
    revision,
    status: result.status
  };
}

async function commitTerminalIdempotency(input: Readonly<{
  key: string;
  now: string;
  ownerScope: string;
  payload: unknown;
  planId: string;
  response: unknown;
  store: AgenticStore;
}>) {
  const existing = await input.store.getIdempotency(
    "plan",
    input.ownerScope,
    input.key
  );

  if (existing) {
    // A handle poll may complete a create. Keep the original request identity so
    // replaying that create after completion still resolves to the same resource.
    await input.store.updateIdempotency({
      ...existing,
      resourceIds: { planId: input.planId },
      responseJson: JSON.stringify(input.response)
    });
    return;
  }

  await commitIdempotency({
    key: input.key,
    now: input.now,
    operation: "plan",
    ownerScope: input.ownerScope,
    payload: input.payload,
    resourceIds: { planId: input.planId },
    response: input.response,
    store: input.store
  });
}

type PreparedPlanCommand = Readonly<{
  operationId?: string;
  effectiveRequest?: PlanRequest;
  answers: readonly PlanAnswer[];
  ack: SafetyAcknowledgement | null;
  existingPlan: Awaited<ReturnType<AgenticStore["getPlan"]>>;
  locale: Locale;
  ownerScope: string;
  persistProcessing: boolean;
  planHandle: string;
  planId: string;
  previous: PlanResult | null;
  processing: PlanResult;
  resume: boolean;
  revision: number;
  selectOptionId?: string;
  searchEffort?: "standard" | "expanded";
  shownRevision: number;
  state: CanonicalPlanState;
}>;

type PlanExecutionInput = Readonly<{
  config: AgenticConfig;
  deferProcessing?: boolean;
  matchPort?: PlanMatchPort;
  now: string;
  payload: PlanToolInput;
  scope: CapabilityScope;
  store: AgenticStore;
}>;

const inflightDurableOperations = new Map<string, Promise<PlanToolSuccess | AgenticErrorResult>>();

function operationProcessingResponse(operation: PlanOperationRecord) {
  const prepared = operation.command.prepared as PreparedPlanCommand;
  return successFromResult({ locale: prepared.locale, planHandle: prepared.planHandle,
    result: prepared.processing, revision: operation.revision });
}

/** One admitted operation owns work independently of any transport attempt. */
export async function runAdmittedPlanOperation(input: Readonly<{
  store: AgenticStore; config: AgenticConfig; operationId: string; signal?: AbortSignal;
}>): Promise<PlanToolSuccess | AgenticErrorResult> {
  const existingWork = inflightDurableOperations.get(input.operationId);
  if (existingWork) return existingWork;
  const operation = await input.store.getPlanOperation(input.operationId);
  if (!operation) return businessError({ reasonCode: "not_found", message: "Matching operation not found." });
  if (operation.status === "complete") return operation.response as PlanToolSuccess;
  if (operation.status === "cancelled" || operation.status === "failed") return (operation.error as AgenticErrorResult | null) ?? businessError({ reasonCode: "stale_revision", message: "This matching operation is no longer active. Reload the plan." });
  const claim = await claimPlanOperation(input.store, operation.id, nextTestUuid(), new Date().toISOString());
  if (!claim) return operationProcessingResponse(operation);
  const controller = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  const attempt: PlanAttempt = { correlationId: `plan-operation:${claim.id}`, signal, releases: new Set(), operation: claim, operationStore: input.store };
  const prepared = claim.command.prepared as PreparedPlanCommand;
  const work = withRequestLifetime({ signal, correlationId: attempt.correlationId }, () => planAttempts.run(attempt, async () => {
    try {
      const result = await completePreparedPlan(prepared, {
        config: input.config, now: claim.createdAt, payload: claim.command.payload as PlanToolInput,
        scope: claim.command.scope, store: input.store
      }, !(claim.command.payload as PlanToolInput).planHandle, Date.now());
      if (isAgenticErrorResult(result)) {
        const status = result.error.retryable ? "retryable" : "failed";
        await updateClaimedOperation(input.store, claim, { status, error: result }, new Date().toISOString());
      }
      return result;
    } catch (error) {
      const result = businessError({ reasonCode: "temporarily_unavailable", retryable: true,
        message: "Matching could not finish. Retry this operation with the same key and unchanged request." });
      await failPlanOperation(input.store, claim, result, new Date().toISOString());
      console.error("[agentic-plan-operation]", { operationId: claim.id, origin: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message : "operation_failed" });
      return result;
    }
  })).finally(() => { inflightDurableOperations.delete(claim.id); releaseAttempt(attempt); });
  inflightDurableOperations.set(claim.id, work);
  return work;
}

async function admittedResponse(input: PlanExecutionInput, operation: PlanOperationRecord) {
  if (operation.status === "complete") return operation.response as PlanToolSuccess;
  const work = runAdmittedPlanOperation({ config: input.config, store: input.store, operationId: operation.id });
  if (input.payload.operation === "get") {
    void work.catch(() => undefined);
    return operationProcessingResponse(operation);
  }
  const handoff = waitForServiceDelay(PLAN_MATCH_RETURN_BUDGET_MS);
  try { return await Promise.race([work, handoff.then(() => operationProcessingResponse(operation))]); }
  finally { handoff.cancel(); }
}

export async function planTool(input: PlanExecutionInput): Promise<PlanToolSuccess | AgenticErrorResult> {
  if (input.scope.principalScope?.startsWith("qa-v3:")) {
    setQueryNamespace(input.scope.principalScope);
  }
  const ownerScope = `${input.scope.environment}:${input.scope.tenantScope}:${input.scope.principalScope ?? "anon"}`;
  const inflightKey =
    input.payload.operation === "get" || !input.payload.idempotencyKey
      ? null
      : `${ownerScope}\0${input.payload.idempotencyKey}`;
  if (inflightKey) {
    const existing = inflightPlanIdempotency.get(inflightKey);
    if (existing && existing.hash !== canonicalRequestHash(input.payload)) {
      return businessError({ fieldPath: "idempotencyKey", message: "This key is in use with a different payload.", reasonCode: "idempotency_conflict" });
    }
    if (existing) {
      if (!attemptStopped(existing.attempt)) return existing.work;
      releaseAttempt(existing.attempt);
    }
  }

  const attempt: PlanAttempt = {
    correlationId: planCorrelationId(input.payload.idempotencyKey),
    signal: requestLifetime()?.signal,
    releases: new Set()
  };
  const release = () => releaseAttempt(attempt);
  attempt.signal?.addEventListener("abort", release, { once: true });
  const work = planAttempts.run(attempt, () => executePlanTool(input).then(async (result) => {
    const stopped = await stopIfPlanDeadline(input.payload.idempotencyKey);
    if (stopped) {
      return stopped;
    }
    if (isAgenticErrorResult(result)) {
      return result;
    }
    const namespace = input.scope.principalScope;
    if (namespace?.startsWith(QA_NAMESPACE_PREFIX)) {
      setQueryNamespace(namespace);
      const next = logicalPlanQueryCounts(namespace);
      if (Object.values(next).some((value) => Number(value) > 0)) {
        await persistQueryBudget(namespace, next);
      }
    }
    return result;
  }).finally(() => {
    release();
    attempt.signal?.removeEventListener("abort", release);
  }));
  if (inflightKey) {
    trackPlanWork(inflightPlanIdempotency, inflightKey, { hash: canonicalRequestHash(input.payload), attempt, work });
  }
  return work;
}

async function executePlanTool(input: Readonly<{
  config: AgenticConfig;
  deferProcessing?: boolean;
  matchPort?: PlanMatchPort;
  now: string;
  payload: PlanToolInput;
  scope: CapabilityScope;
  store: AgenticStore;
}>): Promise<PlanToolSuccess | AgenticErrorResult> {
  const answerRows = Array.isArray(input.payload.answers) ? input.payload.answers : [];
  if (
    input.payload.operation === "answer" &&
    answerRows.length === 0 &&
    !input.payload.safetyAcknowledgement
  ) {
    return businessError({
      fieldPath: "answers",
      issues: [
        {
          fieldPath: "answers",
          messageKey: "mcp.errors.required",
          reasonCode: "required"
        }
      ],
      message: "answers is required.",
      reasonCode: "invalid_request"
    });
  }
  const requestedDestination = requestRecord(input.payload.request)?.destinationCountry;
  const loadLiveCatalogue =
    !input.matchPort && !input.payload.planHandle;
  const ownerScope = `${input.scope.environment}:${input.scope.tenantScope}:${input.scope.principalScope ?? "anon"}`;
  if (!input.matchPort && input.payload.idempotencyKey) {
    const admitted = await input.store.getPlanOperationByKey(ownerScope, input.payload.idempotencyKey);
    if (admitted) {
      if (admitted.requestHash !== canonicalRequestHash(input.payload)) return businessError({ fieldPath: "idempotencyKey", reasonCode: "idempotency_conflict", message: "This key belongs to a different request." });
      return admittedResponse(input, admitted);
    }
  }
  if (!input.matchPort && input.payload.operation === "get" && input.payload.planHandle) {
    const capability = await resolveCapability({ action: "plan.read", config: input.config, handle: input.payload.planHandle,
      now: input.now, resourceType: "plan", scope: input.scope, store: input.store });
    if (!capability) return businessError({ reasonCode: "not_found", message: "Not found." });
    const active = await input.store.getActivePlanOperation(capability.resourceId);
    if (active && active.status !== "retryable") return admittedResponse(input, active);
    if (active?.status === "retryable" && active.expectedRevision === active.revision) return active.error as AgenticErrorResult;
  }
  const skipIdempotency =
    input.payload.operation === "get" || !input.payload.idempotencyKey;
  const replay = skipIdempotency
    ? ({ kind: "fresh" } as const)
    : await beginIdempotency<PlanToolSuccess>({
        key: input.payload.idempotencyKey!,
        now: input.now,
        operation: "plan",
        ownerScope,
        payload: input.payload,
        store: input.store
      });

  if (replay.kind === "conflict") {
    return replay.error;
  }

  const claimKey = input.payload.idempotencyKey;
  if (claimKey) {
    planClaimEntered.get(claimKey)?.();
    const claimGate = planClaimLatches.get(claimKey);
    if (claimGate) {
      await claimGate;
    }
  }
  const claimedDeadline = await stopIfPlanDeadline(input.payload.idempotencyKey);
  if (claimedDeadline) {
    return claimedDeadline;
  }

  let payload = input.payload;

  if (replay.kind === "replay") {
    if (replay.response.status !== "processing") {
      return replay.response;
    }

    payload = {
      operation: "get",
      expectedRevision: replay.response.revision,
      planHandle: replay.response.planHandle
    };
  }

  if (
    !input.matchPort &&
    hasFullRequest(payload) &&
    typeof requestedDestination === "string"
  ) {
    const market = await resolveMarket({
      countryCode: requestedDestination,
      locale:
        typeof requestRecord(input.payload.request)?.locale === "string"
          ? String(requestRecord(input.payload.request)?.locale)
          : undefined,
      retailerAdapter: input.config.thailandRetailerAdapter
    });

    if (isAgenticErrorResult(market)) {
      return market;
    }
  }

  let prepared: PreparedPlanCommand | AgenticErrorResult;
  try {
    prepared = await persistPreparedPlan();
  } catch (error) {
    if (!isIdempotencyRace(error)) {
      throw error;
    }

    const raced = skipIdempotency
      ? ({ kind: "fresh" } as const)
      : await beginIdempotency<PlanToolSuccess>({
          key: input.payload.idempotencyKey!,
          now: input.now,
          operation: "plan",
          ownerScope,
          payload: input.payload,
          store: input.store
        });

    if (raced.kind === "conflict") {
      return raced.error;
    }

    if (raced.kind !== "replay") {
      throw error;
    }

    if (raced.response.status !== "processing") {
      return raced.response;
    }

    payload = {
      operation: "get",
      expectedRevision: raced.response.revision,
      planHandle: raced.response.planHandle
    };
    prepared = await persistPreparedPlan();
  }

  async function persistPreparedPlan() {
    return input.store.transaction(async (store) => {
    const answers = incomingAnswers(payload);
    const ack = null;
    const selectOptionId =
      payload.selectOptionId ?? payload.optionId ?? selectFromAnswers(answers);

    let planHandle = payload.planHandle;
    let planId: string;
    let revision = 1;
    let previous: PlanResult | null = null;
    let existingPlan = null;
    let resume = false;
    let shownRevision = 1;

    if (planHandle) {
      const capability = await resolveCapability({
        action: "plan.revise",
        config: input.config,
        handle: planHandle,
        now: input.now,
        resourceType: "plan",
        scope: input.scope,
        store
      });

      if (!capability) {
        return businessError({
          message: "Not found.",
          reasonCode: "not_found"
        });
      }

      const plan = await store.getPlan(capability.resourceId);

      if (!plan) {
        return businessError({ message: "Not found.", reasonCode: "not_found" });
      }

      if (
        payload.operation !== "get" &&
        plan.currentRevision !== payload.expectedRevision
      ) {
        return businessError({
          currentRevision: plan.currentRevision,
          fieldPath: "expectedRevision",
          message: "This plan changed. Reload the current plan and retry.",
          nextActions: ["reload_plan"],
          reasonCode: "stale_revision"
        });
      }

      if (!input.matchPort && payload.operation !== "get") {
        const pending = await store.getActivePlanOperation(plan.id);
        if (pending) return businessError({ reasonCode: "stale_revision", currentRevision: plan.currentRevision,
          nextActions: ["reload_plan"], message: "A refinement is still pending. Poll this plan before submitting another change." });
      }
      const current = await store.getPlanRevision(plan.id, plan.currentRevision);

      if (!current) {
        return businessError({ message: "Not found.", reasonCode: "not_found" });
      }

      previous = previousResult(current.result);
      if (previous && previous.contractVersion !== AGENTIC_CONTRACT_VERSION && current.status !== "processing") {
        const existingOrder = await store.getActiveOrderForPlanRevision(plan.id, plan.currentRevision);
        previous = { ...previous, sourceContractVersion: previous.contractVersion ?? "3.0.0", refreshRequired: !existingOrder };
      }
      existingPlan = plan;
      planId = plan.id;
      shownRevision = payload.expectedRevision ?? 1;
      const isPoll =
        !hasFullRequest(payload) &&
        !selectOptionId &&
        answers.length === 0 &&
        !ack;

      if (current.status === "processing" || isPoll) {
        resume = current.status === "processing";
        revision = plan.currentRevision;
      } else {
        revision = plan.currentRevision + 1;
      }
    } else {
      planId = nextTestUuid();
    }


    if (selectOptionId && (!previous || !existingPlan || !planHandle)) {
      return businessError({
        fieldPath: "selectOptionId",
        message: "Not found.",
        reasonCode: "not_found"
      });
    }

    if (selectOptionId && previous) {
      const option =
        previous.selected?.optionId === selectOptionId
          ? previous.selected
          : previous.alternatives.find((item) => item.optionId === selectOptionId) ??
            null;

      if (!option) {
        return businessError({
          fieldPath: "selectOptionId",
          message: "Not found.",
          reasonCode: "not_found"
        });
      }
    }

    let effectiveRequest = payload.request as PlanRequest | undefined;
    if (payload.requestPatch != null) {
      if (!previous) return businessError({ fieldPath: "planHandle", reasonCode: "not_found", message: "A patch requires an existing plan." });
      const original = originalRequestFor(previous);
      if (isAgenticErrorResult(original)) return original;
      const merged = mergeRequestPatch(original, payload.requestPatch as PlanRequestPatch);
      if (isAgenticErrorResult(merged)) return merged;
      effectiveRequest = merged;
    }
    if (previous?.refreshRequired && !hasFullRequest(payload) && (selectOptionId || answers.length > 0)) return businessError({ fieldPath: "planHandle", reasonCode: "contract_refresh_required", message: "Refresh this unexecuted plan with revise.requestPatch={} and the current revision before selecting or answering.", nextActions: ["refresh_plan"] });
    for (const [index, answer] of answers.entries()) {
      const question = previous?.questions?.find(item => item.questionId === answer.questionId);
      const fieldPath = `answers[${index}].${question ? "choice" : "questionId"}`;
      if (!question || !question.choices.some(item => item.choice === answer.choice)) {
        return businessError({ fieldPath, reasonCode: "invalid_request", message: question ? "Choose one of the choices offered for this question and revision." : "This question was not offered for the current revision.", issues: [{ fieldPath, messageKey: "mcp.errors.invalid_enum", reasonCode: "invalid_enum", permittedLimit: question ? question.choices.map(item => item.choice) : (previous?.questions ?? []).map(item => item.questionId), message: question ? "The choice is not permitted for this question." : "The question ID is not present in the current plan." }] });
      }
    }
    const draft = draftStateFromPayload({
      answers,
      payload: effectiveRequest ? { ...payload, request: effectiveRequest } : payload,
      previous
    });

    if (!draft) {
      return businessError({
        fieldPath: "request",
        message: "request is required.",
        reasonCode: "required"
      });
    }

    const locale = negotiateLocale(draft.locale);
    const state = bindSafetyAcknowledgement({
      answers,
      incomingAck: ack,
      previous,
      shownRevision,
      state: {
        ...draft,
        acceptedGaps: draft.acceptedGaps.map((gap) => ({ ...gap, revision })),
        ...(selectOptionId ? { pinnedOptionId: selectOptionId } : {})
      }
    });
    const pendingInput = hasFullRequest(payload)
      ? { request: structuredClone(effectiveRequest!), searchEffort: state.searchEffort ?? "standard", answers, safetyAcknowledgement: null }
      : previous?.pendingInput;
    const processing = processingResult({ locale, previous, state, pendingInput });

    const persistProcessing = !resume && !(
      !hasFullRequest(payload) &&
      !selectOptionId &&
      answers.length === 0 &&
      !ack &&
      previous &&
      isTerminalPlanStatus(previous.status)
    );

    if (!persistProcessing) {
      return {
        effectiveRequest,
        answers,
        ack,
        existingPlan,
        locale,
        ownerScope,
        persistProcessing: false,
        planHandle: planHandle!,
        planId,
        previous,
        processing,
        resume,
        revision,
        selectOptionId,
        shownRevision,
        state
      } satisfies PreparedPlanCommand;
    }

    if (!existingPlan) {
      await store.insertPlan({
        createdAt: input.now,
        currentRevision: 1,
        environment: input.scope.environment,
        id: planId,
        principalScope: input.scope.principalScope,
        tenantScope: input.scope.tenantScope,
        updatedAt: input.now
      });
      const issued = await issueCapability({
        allowedActions: ["plan.read", "plan.revise", "plan.execute", "feedback.write"],
        config: input.config,
        expiresAt: new Date(Date.parse(input.now) + input.config.planTtlMs).toISOString(),
        now: input.now,
        resourceId: planId,
        resourceType: "plan",
        scope: input.scope,
        store
      });
      planHandle = issued.handle;
    }

    // Claim new creates durably. Edits retain the current usable revision until
    // their fully validated result can be published under the plan row lock.
    const writeProcessingRevision = !existingPlan;
    if (writeProcessingRevision) {
      await store.insertPlanRevision(
        revisionRecord(planId, revision, processing, input.now)
      );

      const processingResponse = successFromResult({
        locale,
        planHandle: planHandle!,
        result: processing,
        revision
      });

      if (input.payload.idempotencyKey) {
        await commitIdempotency({
          key: input.payload.idempotencyKey,
          now: input.now,
          operation: "plan",
          ownerScope,
          payload: input.payload,
          resourceIds: { planId },
          response: processingResponse,
          store
        });
      }
    }

    const prepared: PreparedPlanCommand = {
      effectiveRequest,
      answers,
      ack,
      existingPlan,
      locale,
      ownerScope,
      persistProcessing: true,
      planHandle: planHandle!,
      planId,
      previous,
      processing,
      resume: false,
      revision,
      selectOptionId,
      shownRevision,
      state
    };
    if (!input.matchPort && payload.operation !== "get" && payload.idempotencyKey) {
      const operation = await admitPlanOperation(store, {
        planId, ownerScope, key: payload.idempotencyKey, payload: input.payload,
        expectedRevision: existingPlan?.currentRevision ?? revision, revision,
        prepared, scope: input.scope, now: input.now
      });
      return { ...prepared, operationId: operation.id };
    }
    return prepared;
    });
  }

  if (!prepared || typeof prepared !== "object" || !("planId" in prepared)) {
    return prepared as AgenticErrorResult;
  }
  if (prepared.operationId) {
    const operation = await input.store.getPlanOperation(prepared.operationId);
    if (!operation) throw new Error("Admitted plan operation disappeared");
    return admittedResponse(input, operation);
  }

  if (!prepared.resume && prepared.previous && isTerminalPlanStatus(prepared.previous.status)) {
    const isPoll =
      !hasFullRequest(payload) &&
      !prepared.selectOptionId &&
      prepared.answers.length === 0 &&
      !prepared.ack;

    if (isPoll) {
      const response = successFromResult({
        locale: prepared.locale,
        planHandle: prepared.planHandle,
        result: prepared.previous,
        revision: prepared.revision
      });
      if (input.payload.idempotencyKey) {
        await commitTerminalIdempotency({
          key: input.payload.idempotencyKey,
          now: input.now,
          ownerScope,
          payload: input.payload,
          planId: prepared.planId,
          response,
          store: input.store
        });
      }
      return response;
    }
  }

  const matchStartedAt = Date.now();
  if (input.matchPort || input.deferProcessing) {
    const result = await runPlanMatch(
      prepared,
      input,
      loadLiveCatalogue,
      matchStartedAt
    );
    if (
      input.deferProcessing &&
      payload.operation === "create" &&
      result &&
      typeof result === "object" &&
      (result as { ok?: unknown }).ok === true &&
      (result as { status?: unknown }).status !== "processing"
    ) {
      return successFromResult({
        locale: prepared.locale,
        planHandle: prepared.planHandle,
        result: prepared.processing,
        revision: prepared.revision
      });
    }
    return result;
  }

  return runPlanMatch(prepared, input, loadLiveCatalogue, matchStartedAt);
}

function runPlanMatch(
  prepared: PreparedPlanCommand,
  input: Readonly<{
    config: AgenticConfig;
    matchPort?: PlanMatchPort;
    now: string;
    payload: PlanToolInput;
    scope: CapabilityScope;
    store: AgenticStore;
  }>,
  loadLiveCatalogue: boolean,
  matchStartedAt: number
) {
  const key = `${matchInflightKey(prepared.planId, prepared.revision)}:${canonicalRequestHash(input.payload)}`;
  const existing = inflightPlanMatches.get(key);

  if (existing) {
    if (!attemptStopped(existing.attempt)) return existing.work;
    releaseAttempt(existing.attempt);
  }

  const work = completePreparedPlan(
    prepared,
    input,
    loadLiveCatalogue,
    matchStartedAt
  );
  trackPlanWork(inflightPlanMatches, key, { attempt: planAttempts.getStore()!, work });
  return work;
}

async function completePreparedPlan(
  prepared: PreparedPlanCommand,
  input: Readonly<{
    config: AgenticConfig;
    matchPort?: PlanMatchPort;
    now: string;
    payload: PlanToolInput;
    scope: CapabilityScope;
    store: AgenticStore;
  }>,
  loadLiveCatalogue: boolean,
  matchStartedAt: number
): Promise<PlanToolSuccess | AgenticErrorResult> {
  const country =
    prepared.state.destinationCountry ||
    prepared.previous?.requestSnapshot.destinationCountry;
  const catalogueStartedAt = Date.now();
  const isolated = Boolean(input.matchPort);
  let snapshot: CatalogueSnapshot;
  if (isolated) {
    snapshot = {
      availabilityAsOf: input.now,
      catalogueVersion: "isolated",
      products: [],
      supplements: []
    };
  } else if (input.payload.operation === "get" && prepared.previous && prepared.previous.status !== "processing" && !loadLiveCatalogue &&
    prepared.previous.requestSnapshot.destinationCountry === country) {
    const pinned = await restoreCataloguePin(
      pinnedSnapshotIdFromResult(prepared.previous), GUIDANCE_RULES_VERSION, input.store
    );
    if (!pinned) {
      return businessError({
        fieldPath: "planHandle",
        message: "This plan is missing its frozen catalogue snapshot.",
        reasonCode: "not_found"
      });
    }
    snapshot = pinned;
  } else {
    const permitId = `plan:${prepared.planId}:${prepared.revision}`;
    acquirePermit(permitId, "database");
    try {
      snapshot = await persistCataloguePin(
        await ensureCatalogueSnapshot(input.config.environment, country),
        GUIDANCE_RULES_VERSION, input.store
      );
    } finally {
      releasePermit(permitId, "database");
    }
  }
  matcherEntered?.();
  const planCorrelation = planCorrelationId(input.payload.idempotencyKey);
  if (matcherGate) {
    await Promise.race([
      matcherGate,
      ...(planCorrelation
        ? [waitUntilDeadline(planCorrelation), waitUntilCancelled(planCorrelation)]
        : [])
    ]);
  }
  const gatedDeadline = await stopIfPlanDeadline(input.payload.idempotencyKey);
  if (gatedDeadline) {
    return gatedDeadline;
  }
  const catalogueMs = Math.max(0, Date.now() - catalogueStartedAt);
  if (!isolated && matcherSafetyCeilings().length < 1) {
    await refreshAdminSafetyCeilings();
  }

  const pendingInput = prepared.resume ? prepared.processing.pendingInput : undefined;
  const replacingPendingRequest = prepared.resume && Boolean(input.payload.planHandle) && hasFullRequest(input.payload);
  const verifiedLegacyRequest = prepared.resume && !pendingInput && hasFullRequest(input.payload) &&
    input.payload.idempotencyKey && !input.payload.planHandle
    ? input.payload.request as PlanRequest
    : undefined;
  const answers = [
    ...(replacingPendingRequest ? [] : pendingInput?.answers ?? (verifiedLegacyRequest ? incomingAnswers(input.payload) : [])),
    ...prepared.answers
  ];
  const ack = prepared.ack ?? pendingInput?.safetyAcknowledgement ??
    (verifiedLegacyRequest ? incomingAck(input.payload) : null);
  const selectOptionId = prepared.selectOptionId;
  const previous = prepared.previous;
  const revision = prepared.revision;
  const shownRevision = prepared.shownRevision;

  if (selectOptionId) {
    if (!previous) {
      return businessError({
        fieldPath: "selectOptionId",
        message: "Not found.",
        reasonCode: "not_found"
      });
    }

    const option: StackOption | null =
      previous.selected?.optionId === selectOptionId
        ? previous.selected
        : previous.alternatives.find((item) => item.optionId === selectOptionId) ??
          null;

    if (!option) {
      return businessError({
        fieldPath: "selectOptionId",
        message: "Not found.",
        reasonCode: "not_found"
      });
    }

    if (!isolated && option.snapshotId && option.snapshotId !== catalogueSnapshotId(snapshot)) {
      return businessError({ fieldPath: "optionId", reasonCode: "availability_changed", message: "Catalogue facts changed after this option was evaluated. Revise with requestPatch={} and the current revision, review the new options, then select a returned option ID.", nextActions: ["refresh_plan"] });
    }
    const nextResult = buildPinnedResult({
      locale: prepared.locale,
      previous,
      selected: option,
      shownRevision: revision,
      snapshot,
      state: {
        ...prepared.state,
        pinnedOptionId: option.optionId
      }
    });
    return persistTerminalPlan({
      input,
      locale: prepared.locale,
      ownerScope: prepared.ownerScope,
      planHandle: prepared.planHandle,
      planId: prepared.planId,
      result: nextResult,
      revision,
      expectedCatalogueRevision: isolated ? undefined : snapshot.runtimeRevision,
      skipSideEffects: isolated
    });
  }

  let state: CanonicalPlanState;
  let pinPrevious = false;

  if (isolated) {
    if (hasFullRequest(input.payload) && !prepared.resume) {
      const merged = applyPlanAnswers(prepared.state, { answers });
      pinPrevious = Boolean(
        previous && previous.contractVersion === AGENTIC_CONTRACT_VERSION &&
        (isolated || previous.selected?.snapshotId === catalogueSnapshotId(snapshot)) &&
          planRematchFingerprint(previous.requestSnapshot) ===
            planRematchFingerprint(merged)
      );
      state = pinPrevious
        ? {
            ...merged,
            leftovers: previous!.requestSnapshot.leftovers,
            pinnedOptionId: previous!.selected?.optionId ?? null
          }
        : merged;
    } else if (previous) {
      pinPrevious = !hasFullRequest(input.payload);
      state = applyPlanAnswers(
        pinPrevious ? previous.requestSnapshot : prepared.state,
        { answers }
      );
    } else {
      state = applyPlanAnswers(prepared.state, { answers });
    }
  } else if (hasFullRequest(input.payload) && !prepared.resume) {
    const normalized = await normalizePlanRequest({
      config: input.config,
      request: prepared.effectiveRequest ?? input.payload.request,
      searchEffort: input.payload.searchEffort ?? prepared.state.searchEffort ?? previous?.requestSnapshot.searchEffort,
      snapshot
    });

    if (isAgenticErrorResult(normalized)) {
      return normalized;
    }

    const merged = applyPlanAnswers(normalized.state, { answers });
    pinPrevious = Boolean(
      previous && previous.contractVersion === AGENTIC_CONTRACT_VERSION &&
        (isolated || previous.selected?.snapshotId === catalogueSnapshotId(snapshot)) &&
        planRematchFingerprint(previous.requestSnapshot) ===
          planRematchFingerprint(merged)
    );
    state = pinPrevious
      ? {
          ...merged,
          leftovers: [
            ...previous!.requestSnapshot.leftovers.filter(
              (item) => item.reason === "not_in_catalogue"
            ),
            ...merged.leftovers.filter((item) => item.reason === "not_in_catalogue")
          ].filter(
            (item, index, list) =>
              list.findIndex(
                (row) => row.reason === item.reason && row.name === item.name
              ) === index
          ),
          pinnedOptionId: previous!.selected?.optionId ?? null
        }
      : merged;
  } else if (prepared.resume || hasFullRequest(input.payload)) {
    // Legacy processing rows lack pendingInput. Only a create whose original
    // payload passed the durable idempotency check can supply that missing input.
    // A name-as-ID placeholder is ambiguous and must never become a trusted ID.
    if (prepared.resume && !pendingInput && !verifiedLegacyRequest &&
      [...prepared.state.targets, ...prepared.state.currentSupplements].some(item => item.supplementId === item.name)) {
      return businessError({
        message: "Retry this unfinished plan with the original request and idempotency key.",
        reasonCode: "temporarily_unavailable", retryable: true
      });
    }
    const normalized = await normalizePlanRequest({
      config: input.config,
      request: pendingInput?.request ?? verifiedLegacyRequest ?? requestFromState(prepared.state),
      searchEffort: pendingInput?.searchEffort ?? prepared.state.searchEffort,
      snapshot
    });

    if (isAgenticErrorResult(normalized)) {
      return normalized;
    }

    state = applyPlanAnswers(normalized.state, { answers });
  } else if (previous) {
    const merged = applyPlanAnswers(previous.requestSnapshot, { answers });
    pinPrevious = (isolated || previous.selected?.snapshotId === catalogueSnapshotId(snapshot)) &&
      planRematchFingerprint(previous.requestSnapshot) ===
      planRematchFingerprint(merged);
    state = pinPrevious
      ? {
          ...merged,
          leftovers: previous.requestSnapshot.leftovers,
          pinnedOptionId: previous.selected?.optionId ?? null
        }
      : merged;
  } else {
    return businessError({
      fieldPath: "request",
      message: "request is required.",
      reasonCode: "required"
    });
  }

  if (state.targets.length === 1) {
    const only = state.targets[0]!;
    if (/probiotic/i.test(only.name) && only.unit !== "CFU") {
      return businessError({
        fieldPath: "request.targets[0].unit",
        issues: [
          {
            fieldPath: "request.targets[0].unit",
            messageKey: "mcp.errors.unsupported_unit",
            reasonCode: "unsupported_unit"
          }
        ],
        message: `${only.name} does not accept unit ${only.unit}. Use CFU.`,
        reasonCode: "unsupported_unit"
      });
    }
  }

  state = bindSafetyAcknowledgement({
    answers,
    incomingAck: ack,
    previous,
    shownRevision,
    state
  });
  state = {
    ...state,
    acceptedGaps: state.acceptedGaps.map((gap) => ({ ...gap, revision }))
  };

  const activeOperation = planAttempts.getStore()?.operation;
  if (activeOperation) {
    const { matcherSafetyReferenceIdentity } = await import("@/lib/matcher/safety-ceilings");
    let checkpoint = activeOperation.checkpoint as DurableSearchCheckpoint | null;
    if (!checkpoint && state.searchEffort === "expanded" && activeOperation.expectedRevision > 0) {
      const predecessor = await input.store.getCompletedPlanOperation(activeOperation.planId, activeOperation.expectedRevision);
      const candidate = predecessor?.checkpoint as DurableSearchCheckpoint | null;
      const { planCheckpointInputIdentity } = await import("@/lib/agentic/plan/matching");
      if (candidate?.search?.inputIdentity === planCheckpointInputIdentity({ snapshot, state })) checkpoint = candidate;
    }
    if (checkpoint && (checkpoint.catalogueId !== catalogueSnapshotId(snapshot) ||
      activeOperation.referenceIdentity && activeOperation.referenceIdentity !== matcherSafetyReferenceIdentity()?.fingerprint)) {
      return businessError({ reasonCode: "stale_revision", message: "Catalogue or reference inputs changed during matching. Reload the plan." });
    }
    const saved = await updateClaimedOperation(input.store, activeOperation, {
      catalogueIdentity: catalogueSnapshotId(snapshot), referenceIdentity: matcherSafetyReferenceIdentity()?.fingerprint ?? null,
      checkpoint: checkpoint ?? { stage: "normalized", state, catalogueId: catalogueSnapshotId(snapshot) }
    }, new Date().toISOString());
    if (!saved) return businessError({ reasonCode: "stale_revision", message: "This matching operation was cancelled or superseded. Reload the plan." });
  }

  if (state.requirements.productDoses?.length) {
    const canonical = toCanonicalRequest(state);
    if ("error" in canonical) return businessError({ fieldPath: "request.requirements.productDoses", reasonCode: "invalid_request", message: canonical.error });
    const issues = validateProductDoseProposals(canonical, { availabilityAsOf: snapshot.availabilityAsOf, catalogueVersion: snapshot.catalogueVersion, products: snapshot.products.map(toMatcherProduct) });
    if (issues.length) return businessError({ fieldPath: `request.${issues[0]!.field}`, reasonCode: "invalid_request", message: issues[0]!.reason, issues: issues.map(issue => ({ fieldPath: `request.${issue.field}`, reasonCode: "invalid_request", messageKey: "mcp.errors.invalid_request", message: issue.reason, ...(issue.permittedIncrement != null ? { permittedLimit: `positive multiples of ${issue.permittedIncrement} labelled servings per day` } : {}) })) });
  }
  const locale = negotiateLocale(state.locale);
  const pinnedOption =
    pinPrevious && previous
      ? previous.selected?.optionId === state.pinnedOptionId || !state.pinnedOptionId
        ? previous.selected
        : previous.alternatives.find((item) => item.optionId === state.pinnedOptionId) ??
          previous.selected
      : null;
  let result: PlanResult;
  try {
    result =
    pinPrevious && previous && pinnedOption
      ? buildPinnedResult({
          locale,
          previous,
          selected: pinnedOption,
          shownRevision: revision,
          snapshot,
          state
        })
      : await buildResult({
          catalogueMs,
          locale,
          matchPort: input.matchPort,
          matchStartedAt,
          previous,
          shownRevision,
          snapshot,
          state
        });
  } catch (error) {
    if (error instanceof MatcherUnavailableError) {
      return businessError({
        message: error.reason === "checkpoint_mismatch" ? "Matching inputs changed. Reload the plan before refining it."
          : error.reason === "capacity" ? "Matching capacity is temporarily occupied. Retry with the same idempotency key."
          : error.reason === "timeout" ? "The matching worker timed out. Retry with the same idempotency key to resume."
          : "The matching worker failed. Retry with the same idempotency key to resume.",
        reasonCode: error.reason === "checkpoint_mismatch" ? "stale_revision" : "temporarily_unavailable", retryable: error.reason !== "checkpoint_mismatch"
      });
    }
    throw error;
  }

  return persistTerminalPlan({
    input,
    locale,
    ownerScope: prepared.ownerScope,
    planHandle: prepared.planHandle,
    planId: prepared.planId,
    result,
    revision,
    expectedCatalogueRevision: isolated ? undefined : snapshot.runtimeRevision,
    skipSideEffects: isolated
  });
}

async function persistTerminalPlan(input: Readonly<{
  input: Readonly<{
    config: AgenticConfig;
    now: string;
    payload: PlanToolInput;
    scope: CapabilityScope;
    store: AgenticStore;
  }>;
  locale: Locale;
  ownerScope: string;
  planHandle: string;
  planId: string;
  result: PlanResult;
  revision: number;
  expectedCatalogueRevision?: number;
  skipSideEffects?: boolean;
}>): Promise<PlanToolSuccess | AgenticErrorResult> {
  let committedResult: PlanResult | null = null;
  const response = await input.input.store.transaction(async (store) => {
    const plan = await store.getPlanForUpdate(input.planId);
    if (!plan) return businessError({ message: "Not found.", reasonCode: "not_found" });
    const operationClaim = planAttempts.getStore()?.operation;
    if (operationClaim) {
      const active = await store.getPlanOperation(operationClaim.id);
      if (!active || active.status !== "running" || active.leaseToken !== operationClaim.leaseToken || Date.parse(active.leaseExpiresAt ?? "") <= Date.now()) {
        return businessError({ reasonCode: "stale_revision", message: "This matching operation no longer owns publication. Reload the plan." });
      }
    }

    const key = input.input.payload.idempotencyKey;
    if (key) {
      const replay = await beginIdempotency<PlanToolSuccess>({
        key, now: input.input.now, operation: "plan", ownerScope: input.ownerScope,
        payload: input.input.payload, store
      });
      if (replay.kind === "conflict") return replay.error;
      if (replay.kind === "replay" && replay.response.status !== "processing") return replay.response;
    }

    const current = await store.getPlanRevision(input.planId, input.revision);
    const baseRevision = input.input.payload.expectedRevision ?? input.revision;
    if (plan.currentRevision !== baseRevision || (current && current.status !== "processing")) {
      return businessError({
        currentRevision: plan.currentRevision, fieldPath: "expectedRevision",
        message: "This plan changed. Reload the current plan and retry.",
        nextActions: ["reload_plan"], reasonCode: "stale_revision"
      });
    }
    planAttempts.getStore()?.signal?.throwIfAborted();
    throwIfAborted(planCorrelationId(key));
    if (input.expectedCatalogueRevision != null &&
      (!store.isCatalogueRevisionCurrent || !await store.isCatalogueRevisionCurrent(input.expectedCatalogueRevision))) {
      // Keep the saved processing request and its idempotency receipt. A retry
      // or handle poll loads a fresh snapshot and resumes this same revision.
      return businessError({
        currentRevision: plan.currentRevision, fieldPath: "planHandle", reasonCode: "availability_changed", retryable: true,
        message: "Catalogue facts changed while this plan was being matched. Retry with the same idempotency key, or reload the saved plan, to evaluate current products before selecting.",
        nextActions: ["retry_same_key", "refresh_plan"]
      });
    }
    let result = input.result;
    if (planCompactApplicable(result.status) && !result.evidenceHandle) {
      const evidenceHandle = await issueEvidenceCapability({
        config: input.input.config, now: input.input.now, planId: input.planId,
        revision: input.revision, scope: input.input.scope, store
      });
      result = { ...result, claimIds: planClaimIds(result), evidenceHandle, researchVersion: planResearchVersion() };
    }
    const success = successFromResult({
      locale: input.locale, planHandle: input.planHandle, result, revision: input.revision
    });
    const record = revisionRecord(input.planId, input.revision, result, current?.createdAt ?? input.input.now);
    if (current) await store.updatePlanRevision(record);
    else await store.insertPlanRevision(record);
    await store.updatePlan({ ...plan, currentRevision: input.revision, updatedAt: input.input.now });
    if (key) {
      await commitTerminalIdempotency({
        key, now: input.input.now, ownerScope: input.ownerScope,
        payload: input.input.payload, planId: input.planId, response: success, store
      });
    }
    if (operationClaim && !await updateClaimedOperation(store, operationClaim, { status: "complete", response: success, error: null }, new Date().toISOString())) {
      throw new Error("Plan operation lost publication ownership");
    }
    planAttempts.getStore()?.signal?.throwIfAborted();
    throwIfAborted(planCorrelationId(key));
    committedResult = result;
    return success;
  });

  if (!isAgenticErrorResult(response) && committedResult && !input.skipSideEffects) {
    if (planCompactApplicable(response.status)) {
      const events = [
        ["info:" + input.planId, "info_shown"],
        ["plan-created:" + input.planId + ":" + input.revision, "plan_created"],
        ...(response.status === "ready" ? [["plan-ready:" + input.planId + ":" + input.revision, "plan_ready"]] : [])
      ];
      for (const [eventId, eventType] of events) {
        await commitFunnelEvent({
          attribution: "agent_connector", correlationId: input.planId, createdAt: input.input.now,
          eventId, eventType, payload: { locale: input.locale }
        });
      }
    }
    if (!process.env.NODE_TEST_CONTEXT) {
      schedulePersistPlanSideEffects({
        locale: input.locale, planId: input.planId, result: committedResult, revision: input.revision
      });
    }
  }
  return response;
}

function schedulePersistPlanSideEffects(
  input: Readonly<{
    locale: Locale;
    planId: string;
    result: PlanResult;
    revision: number;
  }>
) {
  const startedAt = Date.now();
  const wait = async () => {
    const { isLivePlanInFlight } = await import("@/lib/agentic/plan/warm-dev");
    const elapsed = Date.now() - startedAt;

    if (elapsed < 750 || (isLivePlanInFlight() && elapsed < 8_000)) {
      setTimeout(() => {
        void wait();
      }, 25);
      return;
    }

    void persistPlanSideEffects(input);
  };

  setTimeout(() => {
    void wait();
  }, 25);
}

async function persistPlanSideEffects(input: Readonly<{
  locale: Locale;
  planId: string;
  result: PlanResult;
  revision: number;
}>) {
  await persistCanonicalWebPlan({
    locale: input.locale,
    planId: input.planId,
    result: input.result
  });
  await persistMatcherTelemetry({
    planId: input.planId,
    result: input.result,
    revision: input.revision
  });
}

async function persistCanonicalWebPlan(input: Readonly<{
  locale: Locale;
  planId: string;
  result: PlanResult;
}>) {
  try {
    const { persistMcpAssessment } = await import("@/lib/agentic/commerce/retail-join");
    await persistMcpAssessment(input);
  } catch {
    return;
  }
}
