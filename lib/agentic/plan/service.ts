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
  commitIdempotency
} from "@/lib/agentic/idempotency";
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
import type {
  CanonicalPlanState,
  PlanAnswer,
  PlanResult,
  SafetyAcknowledgement,
  StackOption
} from "@/lib/agentic/plan/types";

export const PLAN_FEEDBACK_AFTER_REVISIONS = 3;

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

function composeResult(input: Readonly<{
  alternatives: readonly StackOption[];
  locale: Locale;
  leftovers: PlanResult["leftovers"];
  previous: PlanResult | null;
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
      leftovers: input.leftovers,
      selected: input.selected,
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
  previous: PlanResult | null;
  shownRevision: number;
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): PlanResult {
  const matched = matchPlan({ snapshot: input.snapshot, state: input.state });
  return composeResult({
    alternatives: matched.alternatives,
    locale: input.locale,
    leftovers: matched.leftovers,
    previous: input.previous,
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
    return {
      ...input.state,
      safetyAcknowledgement: input.incomingAck
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

export async function planTool(input: Readonly<{
  config: AgenticConfig;
  now: string;
  payload: PlanToolInput;
  scope: CapabilityScope;
  store: AgenticStore;
}>): Promise<PlanToolSuccess | AgenticErrorResult> {
  const requestedDestination = requestRecord(input.payload.request)?.destinationCountry;
  let snapshot = await ensureCatalogueSnapshot(
    input.config.environment,
    typeof requestedDestination === "string" ? requestedDestination : undefined
  );
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

  if (replay.kind === "replay") {
    return replay.response;
  }

  return input.store.transaction(async (store) => {
    const answers = incomingAnswers(input.payload);
    const ack = incomingAck(input.payload);
    const selectOptionId =
      input.payload.selectOptionId ?? selectFromAnswers(answers);

    let planHandle = input.payload.planHandle;
    let planId: string;
    let revision = 1;
    let previous: PlanResult | null = null;
    let existingPlan = null;

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

      if (!plan || plan.currentRevision !== input.payload.expectedRevision) {
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
      revision = plan.currentRevision + 1;

      if (previous?.requestSnapshot.destinationCountry) {
        snapshot = await ensureCatalogueSnapshot(
          input.config.environment,
          previous.requestSnapshot.destinationCountry
        );
      }
    } else {
      planId = crypto.randomUUID();
    }

    const shownRevision = planHandle ? (input.payload.expectedRevision ?? 1) : 1;

    if (ack && previous && ack.revision !== shownRevision) {
      return businessError({
        fieldPath: "safetyAcknowledgement.revision",
        message:
          "safetyAcknowledgement.revision does not match the current plan revision. Reload the latest revision and resubmit the acknowledgement.",
        reasonCode: "stale_safety_acknowledgement"
      });
    }

    if (selectOptionId) {
      if (!previous || !existingPlan || !planHandle) {
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

      const locale = negotiateLocale(previous.requestSnapshot.locale);
      const state = bindSafetyAcknowledgement({
        answers,
        incomingAck: ack,
        previous,
        shownRevision,
        state: applyPlanAnswers(previous.requestSnapshot, { answers })
      });
      const nextResult = buildPinnedResult({
        locale,
        previous,
        selected: option,
        shownRevision: revision,
        snapshot,
        state: {
          ...state,
          acceptedGaps: state.acceptedGaps.map((gap) => ({ ...gap, revision })),
          pinnedOptionId: option.optionId
        }
      });

      await store.updatePlan({
        ...existingPlan,
        currentRevision: revision,
        updatedAt: input.now
      });
      await store.insertPlanRevision({
        availabilityAsOf: nextResult.availabilityAsOf,
        catalogueVersion: nextResult.catalogueVersion,
        createdAt: input.now,
        guidanceRulesVersion: nextResult.guidanceRulesVersion,
        planId,
        requestSnapshot: nextResult.requestSnapshot,
        result: nextResult,
        revision,
        status: nextResult.status
      });

      const response: PlanToolSuccess = {
        ...publicPlanFields(nextResult),
        ...feedbackFields({
          locale,
          revision,
          status: nextResult.status
        }),
        ok: true,
        planHandle,
        revision
      };

      await commitIdempotency({
        key: input.payload.idempotencyKey,
        now: input.now,
        operation: "plan",
        ownerScope,
        payload: input.payload,
        resourceIds: { planId },
        response,
        store
      });
      await persistCanonicalWebPlan({ locale, planId, result: nextResult });
      await persistMatcherTelemetry({
        planId,
        result: nextResult,
        revision
      });
      return response;
    }

    let state: CanonicalPlanState;
    let pinPrevious = false;

    if (hasFullRequest(input.payload)) {
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
            previous,
            shownRevision,
            snapshot,
            state
          });

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

    await store.insertPlanRevision({
      availabilityAsOf: result.availabilityAsOf,
      catalogueVersion: result.catalogueVersion,
      createdAt: input.now,
      guidanceRulesVersion: result.guidanceRulesVersion,
      planId,
      requestSnapshot: result.requestSnapshot,
      result,
      revision,
      status: result.status
    });

    const response: PlanToolSuccess = {
      ...publicPlanFields(result),
      ...feedbackFields({
        locale,
        revision,
        status: result.status
      }),
      ok: true,
      planHandle: planHandle!,
      revision
    };

    await commitIdempotency({
      key: input.payload.idempotencyKey,
      now: input.now,
      operation: "plan",
      ownerScope,
      payload: input.payload,
      resourceIds: { planId },
      response,
      store
    });

    await persistCanonicalWebPlan({ locale, planId, result });
    await persistMatcherTelemetry({ planId, result, revision });

    return response;
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
