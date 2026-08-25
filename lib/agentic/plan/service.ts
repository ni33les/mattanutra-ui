import type { Locale } from "@/lib/i18n";
import type { AgenticConfig } from "@/lib/agentic/config";
import {
  businessError,
  isAgenticErrorResult,
  type AgenticErrorResult
} from "@/lib/agentic/contract/errors";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { issueCapability, resolveCapability } from "@/lib/agentic/capabilities";
import {
  beginIdempotency,
  commitIdempotency,
  overwriteIdempotency
} from "@/lib/agentic/idempotency";
import { resolveMarket } from "@/lib/agentic/catalogue/market";
import { ensureCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type { AgenticStore } from "@/lib/agentic/store/types";
import type { CapabilityScope } from "@/lib/agentic/capabilities";
import {
  applyPlanAnswers,
  normalizePlanRequest,
  planRematchFingerprint
} from "@/lib/agentic/plan/normalize";
import {
  leftoversFor,
  matcherTelemetryFor,
  matchPlan,
  unmetRequirementsFor
} from "@/lib/agentic/plan/matching";
import { evaluateSafety, planStatus, safetyQuestions } from "@/lib/agentic/plan/safety";
import { persistMatcherTelemetry } from "@/lib/agentic/plan/telemetry";
import { publicPlanFields } from "@/lib/agentic/public-mapper";
import { DEFAULT_MATCHER_CONFIG } from "@/lib/matcher/config";
import type {
  CanonicalPlanState,
  PlanAnswer,
  PlanRequest,
  PlanResult,
  SafetyAcknowledgement,
  StackOption
} from "@/lib/agentic/plan/types";

export const PLAN_FEEDBACK_AFTER_REVISIONS = 3;
export const PLAN_MATCH_RETURN_BUDGET_MS = 1_500;

const inflightPlanMatches = new Map<
  string,
  Promise<PlanToolSuccess | AgenticErrorResult>
>();

export type PlanToolInput = Readonly<{
  answers?: unknown;
  expectedRevision?: number;
  idempotencyKey: string;
  planHandle?: string;
  request?: unknown;
  safetyAcknowledgement?: unknown;
  selectOptionId?: string;
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
  return Array.isArray(nested?.targets) && nested.targets.length > 0;
}

function snapshotForPin(previous: PlanResult): CatalogueSnapshot {
  return {
    availabilityAsOf: previous.availabilityAsOf,
    catalogueVersion: previous.catalogueVersion,
    products: [],
    supplements: []
  };
}

function composeResult(input: Readonly<{
  ackMs?: number;
  alternatives: readonly StackOption[];
  locale: Locale;
  leftovers: PlanResult["leftovers"];
  matchMs?: number;
  previous: PlanResult | null;
  rejected?: PlanResult["matcherTelemetry"]["rejectedAll"];
  selected: StackOption | null;
  shownRevision: number;
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
  unmetRequirements: readonly string[];
}>): PlanResult {
  const safety = evaluateSafety({
    locale: input.locale,
    selected: input.selected,
    state: input.state
  });
  const questions = safetyQuestions({
    alternatives: input.alternatives,
    guidance: safety,
    locale: input.locale,
    selected: input.selected,
    shownRevision: input.shownRevision,
    state: input.state,
    unmetRequirements: [...input.unmetRequirements]
  });
  const status = planStatus({
    guidance: safety,
    questions,
    selected: input.selected,
    state: input.state,
    unmetRequirements: [...input.unmetRequirements]
  });
  const summary = agenticMessage(input.locale, `plan.summary.${status}`);
  const changeSummary: string[] = [];
  const pinnedState = {
    ...input.state,
    leftovers: input.leftovers,
    pinnedOptionId: input.selected?.optionId ?? input.state.pinnedOptionId
  };

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

  return {
    alternatives: [...input.alternatives],
    appliedRequirements: Object.entries(pinnedState.requirements)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
    assumptions: [],
    availabilityAsOf: input.snapshot.availabilityAsOf,
    basket: input.selected?.basket ?? [],
    catalogueVersion: input.snapshot.catalogueVersion,
    changeSummary,
    coverage: input.selected?.coverage ?? [],
    guidanceRulesVersion: input.snapshot.catalogueVersion,
    leftovers: input.leftovers,
    matcherTelemetry: matcherTelemetryFor({
      ackMs: input.ackMs,
      leftovers: input.leftovers,
      matchMs: input.matchMs,
      rejected: input.rejected ?? input.previous?.matcherTelemetry.rejectedAll,
      searchDeadlineMs: DEFAULT_MATCHER_CONFIG.searchDeadlineMs,
      selected: input.selected,
      snapshot: input.snapshot,
      state: pinnedState
    }),
    optimizationEvidence: {
      mode: pinnedState.optimization,
      tieBreak: [
        "objective",
        "unmet_targets",
        "safety",
        "price",
        "pills",
        "product_count",
        "productId"
      ]
    },
    questions,
    requestSnapshot: pinnedState,
    safetyGuidance: [...safety],
    selected: input.selected,
    status,
    summary,
    unmetRequirements: [...input.unmetRequirements]
  };
}

function buildResult(input: Readonly<{
  locale: Locale;
  matchStartedAt?: number;
  previous: PlanResult | null;
  shownRevision: number;
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): PlanResult {
  const matched = matchPlan({ snapshot: input.snapshot, state: input.state });
  const matchMs =
    input.matchStartedAt != null ? Math.max(0, Date.now() - input.matchStartedAt) : undefined;
  const ackMs =
    matchMs == null
      ? undefined
      : Math.min(matchMs, PLAN_MATCH_RETURN_BUDGET_MS);
  return composeResult({
    ackMs,
    alternatives: matched.alternatives,
    locale: input.locale,
    leftovers: matched.leftovers,
    matchMs,
    previous: input.previous,
    rejected: matched.rejected,
    selected: matched.selected,
    shownRevision: input.shownRevision,
    snapshot: input.snapshot,
    state: input.state,
    unmetRequirements: matched.unmetRequirements
  });
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
    alternatives: input.previous.alternatives,
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

function feedbackFields(input: Readonly<{
  locale: Locale;
  revision: number;
  status: PlanResult["status"];
}>) {
  if (
    input.status !== "ready" &&
    input.revision < PLAN_FEEDBACK_AFTER_REVISIONS
  ) {
    return {};
  }

  return {
    feedbackInvitation: {
      prompt: agenticMessage(input.locale, "feedback.invitation"),
      promptKey: "feedback.invitation"
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTerminalPlanStatus(
  status: PlanResult["status"]
): status is "blocked" | "needs_input" | "ready" {
  return status === "blocked" || status === "needs_input" || status === "ready";
}

function successFromResult(input: Readonly<{
  locale: Locale;
  planHandle: string;
  result: PlanResult;
  revision: number;
}>): PlanToolSuccess {
  return {
    ...publicPlanFields(input.result),
    ...feedbackFields({
      locale: input.locale,
      revision: input.revision,
      status: input.result.status
    }),
    ok: true,
    planHandle: input.planHandle,
    revision: input.revision
  };
}

function requestFromState(state: CanonicalPlanState): PlanRequest {
  return {
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
        conditionCodes: [...new Set(request.conditionCodes ?? [])],
        currency: "THB",
        currentSupplements: (request.currentSupplements ?? []).map((item) => ({
          dailyAmount: item.dailyAmount,
          name: item.name,
          supplementId: item.supplementId ?? item.name,
          unit: item.unit
        })),
        destinationCountry: request.destinationCountry,
        leftovers: [],
        locale: request.locale,
        medicationCodes: [...new Set(request.medicationCodes ?? [])],
        optimization: request.optimization,
        pinnedOptionId: input.previous?.selected?.optionId ?? null,
        profile: request.profile,
        requirements: { ...request.requirements },
        safetyAcknowledgement: request.safetyAcknowledgement ?? null,
        targets: request.targets.map((item) => ({
          amount: item.amount,
          name: item.name,
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
        "objective",
        "unmet_targets",
        "safety",
        "price",
        "pills",
        "product_count",
        "productId"
      ]
    },
    questions: input.previous?.questions ?? [],
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
    await overwriteIdempotency({
      key: input.key,
      now: input.now,
      operation: "plan",
      ownerScope: input.ownerScope,
      payload: input.payload,
      resourceIds: { planId: input.planId },
      response: input.response,
      store: input.store
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
  shownRevision: number;
  state: CanonicalPlanState;
}>;

export async function planTool(input: Readonly<{
  config: AgenticConfig;
  now: string;
  payload: PlanToolInput;
  scope: CapabilityScope;
  store: AgenticStore;
}>): Promise<PlanToolSuccess | AgenticErrorResult> {
  const requestedDestination = requestRecord(input.payload.request)?.destinationCountry;
  const loadLiveCatalogue =
    hasFullRequest(input.payload) || !input.payload.planHandle;
  const ownerScope = `${input.scope.environment}:${input.scope.tenantScope}:${input.scope.principalScope ?? "anon"}`;
  const replay = await beginIdempotency<PlanToolSuccess>({
    key: input.payload.idempotencyKey,
    now: input.now,
    operation: "plan",
    ownerScope,
    payload: input.payload,
    store: input.store
  });

  if (replay.kind === "conflict") {
    return replay.error;
  }

  let payload = input.payload;

  if (replay.kind === "replay") {
    if (replay.response.status !== "processing") {
      return replay.response;
    }

    payload = {
      ...input.payload,
      expectedRevision: replay.response.revision,
      planHandle: replay.response.planHandle
    };
  }

  if (hasFullRequest(payload) && typeof requestedDestination === "string") {
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

  const prepared = await input.store.transaction(async (store) => {
    const answers = incomingAnswers(payload);
    const ack = incomingAck(payload);
    const selectOptionId =
      payload.selectOptionId ?? selectFromAnswers(answers);

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

      if (!plan || plan.currentRevision !== payload.expectedRevision) {
        return businessError({
          fieldPath: "expectedRevision",
          message: "The plan revision is stale. Reload the latest revision.",
          reasonCode: "revision_conflict"
        });
      }

      const current = await store.getPlanRevision(plan.id, plan.currentRevision);

      if (!current) {
        return businessError({ message: "Not found.", reasonCode: "not_found" });
      }

      previous = previousResult(current.result);
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
      planId = crypto.randomUUID();
    }

    if (ack && previous && ack.revision !== shownRevision) {
      return businessError({
        fieldPath: "safetyAcknowledgement.revision",
        message:
          "safetyAcknowledgement.revision does not match the current plan revision. Reload the latest revision and resubmit the acknowledgement.",
        reasonCode: "stale_safety_acknowledgement"
      });
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

    const draft = draftStateFromPayload({
      answers,
      payload,
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
    const processing = processingResult({ locale, previous, state });

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
    } else {
      await store.updatePlan({
        ...existingPlan,
        currentRevision: revision,
        updatedAt: input.now
      });
    }

    await store.insertPlanRevision(
      revisionRecord(planId, revision, processing, input.now)
    );

    const processingResponse = successFromResult({
      locale,
      planHandle: planHandle!,
      result: processing,
      revision
    });

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

    return {
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
    } satisfies PreparedPlanCommand;
  });

  if (!prepared || typeof prepared !== "object" || !("planId" in prepared)) {
    return prepared as AgenticErrorResult;
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
      await commitTerminalIdempotency({
        key: input.payload.idempotencyKey,
        now: input.now,
        ownerScope,
        payload: input.payload,
        planId: prepared.planId,
        response,
        store: input.store
      });
      return response;
    }
  }

  const matchStartedAt = Date.now();
  const work = runPlanMatch(prepared, input, loadLiveCatalogue, matchStartedAt);
  const raced = await Promise.race([
    work.then((result) => ({ done: true as const, result })),
    sleep(PLAN_MATCH_RETURN_BUDGET_MS).then(() => ({ done: false as const }))
  ]);

  if (raced.done) {
    return raced.result;
  }

  const ackMs = Math.max(0, Date.now() - matchStartedAt);
  return successFromResult({
    locale: prepared.locale,
    planHandle: prepared.planHandle,
    result: {
      ...prepared.processing,
      matcherTelemetry: {
        ...prepared.processing.matcherTelemetry,
        ackMs,
        searchDeadlineMs: DEFAULT_MATCHER_CONFIG.searchDeadlineMs
      }
    },
    revision: prepared.revision
  });
}

function runPlanMatch(
  prepared: PreparedPlanCommand,
  input: Readonly<{
    config: AgenticConfig;
    now: string;
    payload: PlanToolInput;
    scope: CapabilityScope;
    store: AgenticStore;
  }>,
  loadLiveCatalogue: boolean,
  matchStartedAt: number
) {
  const key = matchInflightKey(prepared.planId, prepared.revision);
  const existing = inflightPlanMatches.get(key);

  if (existing) {
    return existing;
  }

  const work = completePreparedPlan(
    prepared,
    input,
    loadLiveCatalogue,
    matchStartedAt
  ).finally(() => {
    inflightPlanMatches.delete(key);
  });
  inflightPlanMatches.set(key, work);
  return work;
}

async function completePreparedPlan(
  prepared: PreparedPlanCommand,
  input: Readonly<{
    config: AgenticConfig;
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
  const snapshot =
    loadLiveCatalogue || prepared.resume
      ? await ensureCatalogueSnapshot(input.config.environment, country)
      : prepared.previous
        ? snapshotForPin(prepared.previous)
        : await ensureCatalogueSnapshot(input.config.environment, country);

  const answers = prepared.answers;
  const ack = prepared.ack;
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
      revision
    });
  }

  let state: CanonicalPlanState;
  let pinPrevious = false;

  if (hasFullRequest(input.payload) && !prepared.resume) {
    const normalized = await normalizePlanRequest({
      config: input.config,
      request: input.payload.request,
      snapshot
    });

    if (isAgenticErrorResult(normalized)) {
      return normalized;
    }

    const merged = applyPlanAnswers(normalized.state, { answers });
    pinPrevious = Boolean(
      previous &&
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
    const normalized = await normalizePlanRequest({
      config: input.config,
      request: requestFromState(prepared.state),
      snapshot
    });

    if (isAgenticErrorResult(normalized)) {
      return normalized;
    }

    state = applyPlanAnswers(normalized.state, { answers });
  } else if (previous) {
    pinPrevious = true;
    state = applyPlanAnswers(previous.requestSnapshot, { answers });
  } else {
    return businessError({
      fieldPath: "request",
      message: "request is required.",
      reasonCode: "required"
    });
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

  const locale = negotiateLocale(state.locale);
  const pinnedOption =
    pinPrevious && previous
      ? previous.selected?.optionId === state.pinnedOptionId || !state.pinnedOptionId
        ? previous.selected
        : previous.alternatives.find((item) => item.optionId === state.pinnedOptionId) ??
          previous.selected
      : null;
  const result =
    pinPrevious && previous && pinnedOption
      ? buildPinnedResult({
          locale,
          previous,
          selected: pinnedOption,
          shownRevision: revision,
          snapshot,
          state
        })
      : buildResult({
          locale,
          matchStartedAt,
          previous,
          shownRevision,
          snapshot,
          state
        });

  return persistTerminalPlan({
    input,
    locale,
    ownerScope: prepared.ownerScope,
    planHandle: prepared.planHandle,
    planId: prepared.planId,
    result,
    revision
  });
}

async function persistTerminalPlan(input: Readonly<{
  input: Readonly<{
    config: AgenticConfig;
    now: string;
    payload: PlanToolInput;
    store: AgenticStore;
  }>;
  locale: Locale;
  ownerScope: string;
  planHandle: string;
  planId: string;
  result: PlanResult;
  revision: number;
}>): Promise<PlanToolSuccess> {
  const response = successFromResult({
    locale: input.locale,
    planHandle: input.planHandle,
    result: input.result,
    revision: input.revision
  });

  await input.input.store.transaction(async (store) => {
    const plan = await store.getPlan(input.planId);

    if (plan) {
      await store.updatePlan({
        ...plan,
        currentRevision: input.revision,
        updatedAt: input.input.now
      });
    }

    const current = await store.getPlanRevision(input.planId, input.revision);
    const record = revisionRecord(
      input.planId,
      input.revision,
      input.result,
      current?.createdAt ?? input.input.now
    );

    if (current) {
      await store.updatePlanRevision(record);
    } else {
      await store.insertPlanRevision(record);
    }

    await commitTerminalIdempotency({
      key: input.input.payload.idempotencyKey,
      now: input.input.now,
      ownerScope: input.ownerScope,
      payload: input.input.payload,
      planId: input.planId,
      response,
      store
    });
  });

  schedulePersistPlanSideEffects({
    locale: input.locale,
    planId: input.planId,
    result: input.result,
    revision: input.revision
  });
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
