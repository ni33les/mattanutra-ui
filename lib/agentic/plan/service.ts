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
import { matchPlan } from "@/lib/agentic/plan/matching";
import { evaluateSafety, planStatus, safetyQuestions } from "@/lib/agentic/plan/safety";
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

export type PlanToolSuccess = Readonly<{
  alternatives: PlanResult["alternatives"];
  appliedRequirements: readonly string[];
  assumptions: readonly string[];
  availabilityAsOf: string;
  basket: PlanResult["basket"];
  catalogueVersion: string;
  changeSummary: readonly string[];
  coverage: PlanResult["coverage"];
  feedbackInvitation?: Readonly<{ prompt: string; promptKey: string }>;
  guidanceRulesVersion: string;
  ok: true;
  optimizationEvidence: PlanResult["optimizationEvidence"];
  planHandle: string;
  questions: PlanResult["questions"];
  requestSnapshot: CanonicalPlanState;
  revision: number;
  safetyGuidance: PlanResult["safetyGuidance"];
  status: PlanResult["status"];
  summary: string;
  unmetRequirements: readonly string[];
}>;

function buildResult(input: Readonly<{
  locale: Locale;
  previous: PlanResult | null;
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
    guidance: safety,
    locale: input.locale,
    selected: matched.selected,
    state: input.state
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
    if (input.payload.selectOptionId) {
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
        result.selected?.optionId === input.payload.selectOptionId
          ? result.selected
          : result.alternatives.find((item) => item.optionId === input.payload.selectOptionId) ??
            null;

      if (!option) {
        return businessError({
          fieldPath: "selectOptionId",
          message: "Not found.",
          reasonCode: "not_found"
        });
      }

      const nextRevision = plan.currentRevision + 1;
      const nextResult: PlanResult = {
        ...result,
        alternatives: [],
        basket: option.basket,
        changeSummary: [`selected_option:${option.optionId}`],
        coverage: option.coverage,
        selected: option,
        status: result.status === "blocked" ? "blocked" : "ready",
        summary: agenticMessage(
          negotiateLocale(result.requestSnapshot.locale),
          "plan.summary.ready"
        )
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
        alternatives: nextResult.alternatives,
        appliedRequirements: nextResult.appliedRequirements,
        assumptions: nextResult.assumptions,
        availabilityAsOf: nextResult.availabilityAsOf,
        basket: nextResult.basket,
        catalogueVersion: nextResult.catalogueVersion,
        changeSummary: nextResult.changeSummary,
        coverage: nextResult.coverage,
        guidanceRulesVersion: nextResult.guidanceRulesVersion,
        ok: true,
        optimizationEvidence: nextResult.optimizationEvidence,
        planHandle: input.payload.planHandle!,
        questions: [],
        requestSnapshot: nextResult.requestSnapshot,
        revision: nextRevision,
        safetyGuidance: nextResult.safetyGuidance,
        status: nextResult.status,
        summary: nextResult.summary,
        unmetRequirements: nextResult.unmetRequirements
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
        now: input.now,
        resourceId: planId,
        resourceType: "plan",
        scope: input.scope,
        store
      });
      planHandle = issued.handle;
    }

    const locale = negotiateLocale(normalized.state.locale);
    const result = buildResult({
      locale,
      previous,
      snapshot,
      state: {
        ...normalized.state,
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
      alternatives: result.alternatives,
      appliedRequirements: result.appliedRequirements,
      assumptions: result.assumptions,
      availabilityAsOf: result.availabilityAsOf,
      basket: result.basket,
      catalogueVersion: result.catalogueVersion,
      changeSummary: result.changeSummary,
      coverage: result.coverage,
      ...(result.status === "ready"
        ? {
            feedbackInvitation: {
              prompt: agenticMessage(locale, "feedback.invitation"),
              promptKey: "feedback.invitation"
            }
          }
        : {}),
      guidanceRulesVersion: result.guidanceRulesVersion,
      ok: true,
      optimizationEvidence: result.optimizationEvidence,
      planHandle,
      questions: result.questions,
      requestSnapshot: result.requestSnapshot,
      revision,
      safetyGuidance: result.safetyGuidance,
      status: result.status,
      summary: result.summary,
      unmetRequirements: result.unmetRequirements
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

    return response;
  });
}
