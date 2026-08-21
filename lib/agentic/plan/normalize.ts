import { isAgenticErrorResult, businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { canonicalRequestHash } from "@/lib/agentic/idempotency";
import { negotiateLocale } from "@/lib/agentic/i18n";
import type { CatalogueSnapshot, CatalogueSupplement } from "@/lib/agentic/catalogue/types";
import { CONDITION_ALIASES, MEDICATION_ALIASES } from "@/lib/agentic/catalogue/names";
import { resolveMarket } from "@/lib/agentic/catalogue/market";
import type { AgenticConfig } from "@/lib/agentic/config";
import type {
  AcceptedGap,
  CanonicalPlanState,
  CurrentSupplement,
  PlanLeftover,
  PlanRequest,
  PlanTarget
} from "@/lib/agentic/plan/types";

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

function isIdShaped(value: string) {
  const trimmed = value.trim();
  return (
    /^(sup_|prd_|cap_|ord_|tkt_)/i.test(trimmed) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ||
    /^[0-9a-f]{32}$/i.test(trimmed.replace(/-/g, ""))
  );
}

function tokensOf(value: string) {
  return normalizeName(value).split(" ").filter((part) => part.length > 0);
}

function tokenSubsetMatch(left: string, right: string) {
  const leftTokens = tokensOf(left);
  const rightTokens = tokensOf(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const [shorter, longer] =
    leftTokens.length <= rightTokens.length
      ? [leftTokens, rightTokens]
      : [rightTokens, leftTokens];

  if (shorter.length === 1 && (shorter[0]?.length ?? 0) < 2) {
    return false;
  }

  return shorter.every((part) => longer.includes(part));
}

function matchByName(snapshot: CatalogueSnapshot, wanted: string) {
  const exact = snapshot.supplements.filter((item) => namesOf(item).includes(wanted));

  if (exact.length === 1) {
    return exact;
  }

  if (exact.length > 1) {
    return exact;
  }

  const prefix = snapshot.supplements.filter((item) =>
    namesOf(item).some((name) => name === wanted || name.startsWith(`${wanted} `))
  );

  if (prefix.length === 1) {
    return prefix;
  }

  const token = snapshot.supplements.filter((item) =>
    namesOf(item).some((name) => tokenSubsetMatch(name, wanted))
  );

  if (token.length === 1) {
    return token;
  }

  return [];
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
        message: "That identifier is not a current supplement ID. Send a recognised supplement name instead.",
        reasonCode: "legacy_id"
      });
    }

    if (input.name) {
      const wanted = normalizeName(input.name);

      if (!namesOf(found).includes(wanted) && !namesOf(found).some((name) => name.startsWith(`${wanted} `))) {
        return businessError({
          fieldPath,
          message: "That identifier is not a current supplement ID. Send a recognised supplement name instead.",
          reasonCode: "legacy_id"
        });
      }
    }

    return found;
  }

  const rawName = (input.name ?? "").trim();
  const wanted = normalizeName(rawName);

  if (!wanted) {
    return businessError({
      fieldPath,
      message: "A required field is missing or invalid.",
      reasonCode: "required"
    });
  }

  if (isIdShaped(rawName)) {
    return businessError({
      fieldPath,
      message: "That identifier is not a current supplement ID. Send a recognised supplement name instead.",
      reasonCode: "legacy_id"
    });
  }

  const matches = matchByName(snapshot, wanted);

  if (matches.length === 1 && matches[0]) {
    return matches[0];
  }

  return businessError({
    fieldPath,
    message: "Unknown supplement name. Use a recognised name such as Folate, Vitamin D3 or Creatine.",
    reasonCode: "unknown_supplement"
  });
}

function leftoverForUnknown(input: Readonly<{
  amount?: number;
  name: string;
  unit?: PlanTarget["unit"];
}>): PlanLeftover {
  return {
    ...(input.amount != null ? { amount: input.amount } : {}),
    name: input.name,
    note: "not_in_catalogue",
    reason: "not_in_catalogue",
    severity: "high",
    ...(input.unit ? { unit: input.unit } : {})
  };
}

export function applyPlanAnswers(
  state: CanonicalPlanState,
  request: Pick<PlanRequest, "answers">
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

  return {
    ...next,
    acceptedGaps,
    leftovers: state.leftovers,
    pinnedOptionId: state.pinnedOptionId
  };
}

export function planRematchFingerprint(state: CanonicalPlanState) {
  return JSON.stringify({
    currentSupplements: state.currentSupplements,
    excludeSupplementIds: state.requirements.excludeSupplementIds ?? [],
    dietaryPreference: state.requirements.dietaryPreference ?? null,
    forms: state.requirements.allowedForms ?? [],
    lifeStage: state.profile.lifeStage,
    maxDailyPills: state.requirements.maxDailyPills ?? null,
    maxPriceMinor: state.requirements.maxPriceMinor ?? null,
    maxProductCount: state.requirements.maxProductCount ?? null,
    omega3SourcePreference: state.requirements.omega3SourcePreference ?? null,
    optimization: state.optimization,
    targets: state.targets
  });
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
  const leftovers: PlanLeftover[] = [];

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
      if (supplement.error.reasonCode === "unknown_supplement") {
        leftovers.push(leftoverForUnknown({
          amount: target.amount,
          name: target.name,
          unit: target.unit
        }));
        continue;
      }

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
      if (supplement.error.reasonCode === "unknown_supplement") {
        leftovers.push(leftoverForUnknown({
          amount: item.dailyAmount,
          name: item.name,
          unit: item.unit
        }));
        continue;
      }

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
    leftovers,
    locale: negotiateLocale(request.locale),
    medicationCodes: [...new Set((request.medicationCodes ?? []).map((item) =>
      normalizeCode(item, MEDICATION_ALIASES)
    ))],
    optimization: request.optimization,
    pinnedOptionId: null,
    profile: request.profile,
    requirements: { ...request.requirements },
    safetyAcknowledgement: request.safetyAcknowledgement ?? null,
    targets
  };

  state = applyPlanAnswers(state, request);

  return {
    hash: canonicalRequestHash(state),
    state
  };
}
