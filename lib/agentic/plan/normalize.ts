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

function uniqueIds(
  ids: readonly string[],
  field: "targets" | "currentSupplements"
): AgenticErrorResult | null {
  const seen = new Set<string>();

  for (const [index, id] of ids.entries()) {
    if (seen.has(id)) {
      return businessError({
        fieldPath: `request.${field}[${index}].supplementId`,
        message: "The same supplement concept appears more than once.",
        reasonCode: "duplicate_supplement"
      });
    }

    seen.add(id);
  }

  return null;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesOf(item: CatalogueSupplement) {
  return [item.name, ...item.aliases].map(normalizeName);
}

function resolveSupplement(
  snapshot: CatalogueSnapshot,
  input: Readonly<{ name?: string; supplementId?: string }>,
  fieldPath: string
): CatalogueSupplement | AgenticErrorResult {
  if (input.supplementId) {
    const found = snapshot.supplements.find(
      (item) => item.supplementId === input.supplementId
    );

    if (!found) {
      return businessError({
        fieldPath,
        message: "Use a current canonical ID from info. Legacy IDs are not accepted.",
        reasonCode: "legacy_id"
      });
    }

    if (input.name) {
      const wanted = normalizeName(input.name);

      if (!namesOf(found).includes(wanted)) {
        return businessError({
          fieldPath,
          message: "Use a current canonical ID from info. Legacy IDs are not accepted.",
          reasonCode: "legacy_id"
        });
      }
    }

    return found;
  }

  const wanted = normalizeName(input.name ?? "");

  if (!wanted) {
    return businessError({
      fieldPath,
      message: "A required field is missing or invalid.",
      reasonCode: "required"
    });
  }

  const matches = snapshot.supplements.filter((item) => namesOf(item).includes(wanted));

  if (matches.length === 1 && matches[0]) {
    return matches[0];
  }

  if (matches.length > 1) {
    return businessError({
      fieldPath,
      message: "A required field is missing or invalid.",
      reasonCode: "required"
    });
  }

  return businessError({
    fieldPath,
    message: "Use a current canonical ID from info. Legacy IDs are not accepted.",
    reasonCode: "legacy_id"
  });
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

    if (answer.choice === "relax_max_price") {
      const { maxPriceMinor: _removed, ...requirements } = next.requirements;
      next = { ...next, requirements };
    }

    if (answer.choice === "relax_max_pills") {
      const { maxDailyPills: _removed, ...requirements } = next.requirements;
      next = { ...next, requirements };
    }

    if (answer.choice.startsWith("drop_retain:")) {
      const productId = answer.choice.slice("drop_retain:".length);
      next = {
        ...next,
        requirements: {
          ...next.requirements,
          retainProductIds: (next.requirements.retainProductIds ?? []).filter(
            (item) => item !== productId
          )
        }
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
    retailerAdapter: input.config.thailandRetailerAdapter
  });

  if (isAgenticErrorResult(market)) {
    return market;
  }

  const targets: PlanTarget[] = [];

  for (const [index, target] of request.targets.entries()) {
    const fieldPath = target.supplementId
      ? `request.targets[${index}].supplementId`
      : `request.targets[${index}].name`;
    const supplement = resolveSupplement(
      input.snapshot,
      { name: target.name, supplementId: target.supplementId },
      fieldPath
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

  const targetDup = uniqueIds(
    targets.map((item) => item.supplementId),
    "targets"
  );

  if (targetDup) {
    return targetDup;
  }

  const currentSupplements: CurrentSupplement[] = [];

  for (const [index, item] of (request.currentSupplements ?? []).entries()) {
    const fieldPath = item.supplementId
      ? `request.currentSupplements[${index}].supplementId`
      : `request.currentSupplements[${index}].name`;
    const supplement = resolveSupplement(
      input.snapshot,
      { name: item.name, supplementId: item.supplementId },
      fieldPath
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

  const currentDup = uniqueIds(
    currentSupplements.map((item) => item.supplementId),
    "currentSupplements"
  );

  if (currentDup) {
    return currentDup;
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
