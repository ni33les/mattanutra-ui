import { isAgenticErrorResult, businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { canonicalRequestHash } from "@/lib/agentic/idempotency";
import { negotiateLocale } from "@/lib/agentic/i18n";
import type { CatalogueSnapshot, CatalogueSupplement } from "@/lib/agentic/catalogue/types";
import { resolveMarket } from "@/lib/agentic/catalogue/market";
import type { AgenticConfig } from "@/lib/agentic/config";
import type {
  AcceptedGap,
  CanonicalPlanState,
  CurrentSupplement,
  PlanRequest,
  PlanTarget
} from "@/lib/agentic/plan/types";

const MEDICATION_ALIASES: Record<string, string> = {
  apixaban: "apixaban",
  eliquis: "apixaban"
};

const CONDITION_ALIASES: Record<string, string> = {
  af: "atrial_fibrillation",
  atrial_fibrillation: "atrial_fibrillation",
  ckd: "ckd",
  chronic_kidney_disease: "ckd"
};

function normalizeCode(
  value: string,
  aliases: Record<string, string>
) {
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return aliases[key] ?? key;
}

function asRequest(value: unknown): PlanRequest | AgenticErrorResult {
  if (!value || typeof value !== "object") {
    return businessError({
      fieldPath: "request",
      message: "request is required.",
      reasonCode: "required"
    });
  }

  return value as PlanRequest;
}

function uniqueTargets(
  targets: readonly Readonly<{ supplementId: string }>[],
  field: "targets" | "currentSupplements"
): AgenticErrorResult | null {
  const seen = new Set<string>();

  for (const [index, target] of targets.entries()) {
    if (seen.has(target.supplementId)) {
      return businessError({
        fieldPath: `request.${field}[${index}].supplementId`,
        message: "The same supplement concept appears more than once.",
        reasonCode: "duplicate_supplement"
      });
    }

    seen.add(target.supplementId);
  }

  return null;
}

function resolveSupplement(
  snapshot: CatalogueSnapshot,
  supplementId: string,
  fieldPath: string
): CatalogueSupplement | AgenticErrorResult {
  const found = snapshot.supplements.find((item) => item.supplementId === supplementId);

  if (!found) {
    return businessError({
      fieldPath,
      message: "Use a current canonical ID from info. Legacy IDs are not accepted.",
      reasonCode: "legacy_id"
    });
  }

  return found;
}

function applyAnswers(
  state: CanonicalPlanState,
  request: PlanRequest
): CanonicalPlanState {
  const answers = request.answers ?? [];
  let next = state;
  const acceptedGaps = [...state.acceptedGaps];

  for (const answer of answers) {
    if (answer.choice === "allow_algae_only") {
      next = {
        ...next,
        requirements: {
          ...next.requirements,
          omega3SourcePreference: "algae_only"
        }
      };
    }

    if (answer.choice === "relax_plant_based") {
      next = {
        ...next,
        requirements: {
          ...next.requirements,
          dietaryPreference: "any"
        }
      };
    }

    if (answer.choice.startsWith("accept_gap:")) {
      acceptedGaps.push({
        revision: 0,
        supplementId: answer.choice.slice("accept_gap:".length)
      });
    }

    if (answer.choice.startsWith("remove_target:")) {
      const supplementId = answer.choice.slice("remove_target:".length);
      next = {
        ...next,
        targets: next.targets.filter((item) => item.supplementId !== supplementId)
      };
    }
  }

  return { ...next, acceptedGaps };
}

export type NormalizedPlan = Readonly<{
  hash: string;
  state: CanonicalPlanState;
}>;

export function normalizePlanRequest(input: Readonly<{
  config: AgenticConfig;
  request: unknown;
  snapshot: CatalogueSnapshot;
}>): NormalizedPlan | AgenticErrorResult {
  const request = asRequest(input.request);

  if (isAgenticErrorResult(request)) {
    return request;
  }

  const market = resolveMarket({
    countryCode: request.destinationCountry,
    currency: request.currency,
    retailerAdapter: input.config.thailandRetailerAdapter
  });

  if (isAgenticErrorResult(market)) {
    return market;
  }

  const duplicate = uniqueTargets(request.targets, "targets");

  if (duplicate) {
    return duplicate;
  }

  if (request.currentSupplements) {
    const currentDup = uniqueTargets(request.currentSupplements, "currentSupplements");

    if (currentDup) {
      return currentDup;
    }
  }

  const targets: PlanTarget[] = [];

  for (const [index, target] of request.targets.entries()) {
    const supplement = resolveSupplement(
      input.snapshot,
      target.supplementId,
      `request.targets[${index}].supplementId`
    );

    if (isAgenticErrorResult(supplement)) {
      return supplement;
    }

    if (!supplement.acceptedUnits.includes(target.unit)) {
      return businessError({
        fieldPath: `request.targets[${index}].unit`,
        message: `${supplement.name} does not accept unit ${target.unit}. Use ${supplement.acceptedUnits.join(", ")}.`,
        reasonCode: "unsupported_unit"
      });
    }

    targets.push({
      amount: target.amount,
      name: supplement.name,
      supplementId: supplement.supplementId,
      unit: target.unit
    });
  }

  const currentSupplements: CurrentSupplement[] = [];

  for (const [index, item] of (request.currentSupplements ?? []).entries()) {
    const supplement = resolveSupplement(
      input.snapshot,
      item.supplementId,
      `request.currentSupplements[${index}].supplementId`
    );

    if (isAgenticErrorResult(supplement)) {
      return supplement;
    }

    currentSupplements.push({
      dailyAmount: item.dailyAmount,
      name: supplement.name,
      supplementId: supplement.supplementId,
      unit: item.unit
    });
  }

  const exclude = request.requirements.excludeSupplementIds ?? [];
  const retain = request.requirements.retainSupplementIds ?? [];

  if (exclude.some((id) => retain.includes(id))) {
    return businessError({
      fieldPath: "request.requirements.retainSupplementIds",
      message: "A supplement cannot be both retained and excluded.",
      reasonCode: "required"
    });
  }

  const acceptedGaps: AcceptedGap[] = [];
  let state: CanonicalPlanState = {
    acceptedGaps,
    conditionCodes: [...new Set((request.conditionCodes ?? []).map((item) =>
      normalizeCode(item, CONDITION_ALIASES)
    ))],
    currency: "THB",
    currentSupplements,
    destinationCountry: "TH",
    locale: negotiateLocale(request.locale),
    medicationCodes: [...new Set((request.medicationCodes ?? []).map((item) =>
      normalizeCode(item, MEDICATION_ALIASES)
    ))],
    optimization: request.optimization,
    profile: request.profile,
    requirements: { ...request.requirements },
    safetyAcknowledgement: request.safetyAcknowledgement ?? null,
    targets
  };

  state = applyAnswers(state, request);

  return {
    hash: canonicalRequestHash(state),
    state
  };
}
