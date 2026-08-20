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
import { getCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type { AgenticStore } from "@/lib/agentic/store/types";
import type { CapabilityScope } from "@/lib/agentic/capabilities";
import { normalizePlanRequest } from "@/lib/agentic/plan/normalize";
import { matchPlan, unmetRequirementsFor } from "@/lib/agentic/plan/matching";
import { evaluateSafety, planStatus, safetyQuestions } from "@/lib/agentic/plan/safety";
import { publicPlanFields } from "@/lib/agentic/public-mapper";
import type {
  CanonicalPlanState,
  PlanResult,
  StackOption
} from "@/lib/agentic/plan/types";

export type PlanToolInput = Readonly<{
  expectedRevision?: number;
  idempotencyKey: string;
  planHandle?: string;
  request?: unknown;
  selectOptionId?: string;
}>;

export type PlanToolSuccess = ReturnType<typeof publicPlanFields> &
  Readonly<{
    feedbackInvitation?: Readonly<{ prompt: string; promptKey: string }>;
    ok: true;
    planHandle: string;
    revision: number;
  }>;

function buildResult(input: Readonly<{
  locale: Locale;
  previous: PlanResult | null;
  shownRevision: number;
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): PlanResult {
  const matched = matchPlan({ snapshot: input.snapshot, state: input.state });
  const safety = evaluateSafety({
    locale: input.locale,
    selected: matched.selected,
    state: input.state
  });
  const questions = safetyQuestions({
    alternatives: matched.alternatives,
    guidance: safety,
    locale: input.locale,
    selected: matched.selected,
    shownRevision: input.shownRevision,
    state: input.state,
    unmetRequirements: matched.unmetRequirements
  });
  const status = planStatus({
    guidance: safety,
    questions,
    selected: matched.selected,
    state: input.state,
    unmetRequirements: matched.unmetRequirements
  });
  const summary = agenticMessage(input.locale, `plan.summary.${status}`);
  const changeSummary: string[] = [];

  if (input.previous) {
    if (input.previous.status !== status) {
      changeSummary.push(`status:${input.previous.status}->${status}`);
    }

    if (
      input.previous.selected?.totalPriceMinor !== matched.selected?.totalPriceMinor
    ) {
      changeSummary.push("price_changed");
    }
  }

  return {
    alternatives: matched.alternatives,
    appliedRequirements: Object.entries(input.state.requirements)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
    assumptions: [],
    availabilityAsOf: input.snapshot.availabilityAsOf,
    basket: matched.selected?.basket ?? [],
    catalogueVersion: input.snapshot.catalogueVersion,
    changeSummary,
    coverage: matched.selected?.coverage ?? [],
    guidanceRulesVersion: input.snapshot.catalogueVersion,
    optimizationEvidence: {
      mode: input.state.optimization,
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
    requestSnapshot: input.state,
    safetyGuidance: [...safety],
    selected: matched.selected,
    status,
    summary,
    unmetRequirements: matched.unmetRequirements
  };
}

function previousResult(record: unknown): PlanResult | null {
  return record && typeof record === "object" ? (record as PlanResult) : null;
}

function bindSafetyAcknowledgement(input: Readonly<{
  previous: PlanResult | null;
  request: unknown;
  shownRevision: number;
  state: CanonicalPlanState;
}>): CanonicalPlanState {
  if (input.state.safetyAcknowledgement) {
    return input.state;
  }

  const answers =
    input.request &&
    typeof input.request === "object" &&
    Array.isArray((input.request as { answers?: unknown }).answers)
      ? (input.request as { answers: Array<{ choice?: string }> }).answers
      : [];
  const wantsAck = answers.some((item) => item.choice === "acknowledge_safety");

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

export async function planTool(input: Readonly<{
  config: AgenticConfig;
  now: string;
  payload: PlanToolInput;
  scope: CapabilityScope;
  store: AgenticStore;
}>): Promise<PlanToolSuccess | AgenticErrorResult> {
  const snapshot = getCatalogueSnapshot();
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
    const selectFromAnswers =
      input.payload.request &&
      typeof input.payload.request === "object" &&
      Array.isArray((input.payload.request as { answers?: unknown }).answers)
        ? (
            (input.payload.request as { answers: Array<{ choice?: string }> }).answers.find(
              (item) =>
                typeof item.choice === "string" &&
                item.choice.startsWith("select_option:")
            )?.choice ?? null
          )
        : null;
    const selectOptionId =
      input.payload.selectOptionId ??
      (selectFromAnswers ? selectFromAnswers.slice("select_option:".length) : undefined);

    if (selectOptionId) {
      const capability = await resolveCapability({
        action: "plan.revise",
        config: input.config,
        handle: input.payload.planHandle ?? "",
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

      const result = previousResult(current.result);

      if (!result) {
        return businessError({ message: "Not found.", reasonCode: "not_found" });
      }

      const option: StackOption | null =
        result.selected?.optionId === selectOptionId
          ? result.selected
          : result.alternatives.find((item) => item.optionId === selectOptionId) ??
            null;

      if (!option) {
        return businessError({
          fieldPath: "selectOptionId",
          message: "Not found.",
          reasonCode: "not_found"
        });
      }

      const nextRevision = plan.currentRevision + 1;
      const state = result.requestSnapshot;
      const locale = negotiateLocale(state.locale);
      const unmet = unmetRequirementsFor({ option, state });
      const safety = evaluateSafety({
        locale,
        selected: option,
        state
      });
      const questions = safetyQuestions({
        alternatives: [],
        guidance: safety,
        locale,
        selected: option,
        shownRevision: nextRevision,
        state,
        unmetRequirements: unmet
      });
      const status = planStatus({
        guidance: safety,
        questions,
        selected: option,
        state,
        unmetRequirements: unmet
      });
      const nextResult: PlanResult = {
        ...result,
        alternatives: [],
        basket: option.basket,
        changeSummary: [`selected_option:${option.optionId}`],
        coverage: option.coverage,
        questions,
        safetyGuidance: [...safety],
        selected: option,
        status,
        summary: agenticMessage(locale, `plan.summary.${status}`),
        unmetRequirements: unmet
      };

      await store.insertPlanRevision({
        availabilityAsOf: current.availabilityAsOf,
        catalogueVersion: current.catalogueVersion,
        createdAt: input.now,
        guidanceRulesVersion: current.guidanceRulesVersion,
        planId: plan.id,
        requestSnapshot: current.requestSnapshot,
        result: nextResult,
        revision: nextRevision,
        status: nextResult.status
      });
      await store.updatePlan({ ...plan, currentRevision: nextRevision, updatedAt: input.now });

      const response: PlanToolSuccess = {
        ...publicPlanFields(nextResult),
        ok: true,
        planHandle: input.payload.planHandle!,
        revision: nextRevision
      };

      await commitIdempotency({
        key: input.payload.idempotencyKey,
        now: input.now,
        operation: "plan",
        ownerScope,
        payload: input.payload,
        resourceIds: { planId: plan.id },
        response,
        store
      });

      await persistCanonicalWebPlan({
        locale,
        planId: plan.id,
        result: nextResult
      });

      return response;
    }

    const normalized = normalizePlanRequest({
      config: input.config,
      request: input.payload.request,
      snapshot
    });

    if (isAgenticErrorResult(normalized)) {
      return normalized;
    }

    let planHandle = input.payload.planHandle;
    let planId: string;
    let revision = 1;
    let previous: PlanResult | null = null;

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
        return businessError({ message: "Not found.", reasonCode: "not_found" });
      }

      const plan = await store.getPlan(capability.resourceId);

      if (!plan) {
        return businessError({ message: "Not found.", reasonCode: "not_found" });
      }

      if (plan.currentRevision !== input.payload.expectedRevision) {
        return businessError({
          fieldPath: "expectedRevision",
          message: "The plan revision is stale. Reload the latest revision.",
          reasonCode: "revision_conflict"
        });
      }

      const current = await store.getPlanRevision(plan.id, plan.currentRevision);
      previous = previousResult(current?.result);
      planId = plan.id;
      revision = plan.currentRevision + 1;
      await store.updatePlan({ ...plan, currentRevision: revision, updatedAt: input.now });
    } else {
      planId = crypto.randomUUID();
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

    const locale = negotiateLocale(normalized.state.locale);
    const shownRevision = planHandle ? (input.payload.expectedRevision ?? 1) : 1;
    const result = buildResult({
      locale,
      previous,
      shownRevision,
      snapshot,
      state: {
        ...bindSafetyAcknowledgement({
          previous,
          request: input.payload.request,
          shownRevision,
          state: normalized.state
        }),
        acceptedGaps: normalized.state.acceptedGaps.map((gap) => ({
          ...gap,
          revision
        }))
      }
    });

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
      ...(result.status === "ready"
        ? {
            feedbackInvitation: {
              prompt: agenticMessage(locale, "feedback.invitation"),
              promptKey: "feedback.invitation"
            }
          }
        : {}),
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

    await persistCanonicalWebPlan({ locale, planId, result });

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
