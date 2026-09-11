import { isAgenticErrorResult, businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { canonicalRequestHash } from "@/lib/agentic/idempotency";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type { CatalogueSnapshot, CatalogueSupplement } from "@/lib/agentic/catalogue/types";
import { CONDITION_ALIASES, MEDICATION_ALIASES } from "@/lib/agentic/catalogue/names";
import { resolveMarket } from "@/lib/agentic/catalogue/market";
import type { AgenticConfig } from "@/lib/agentic/config";
import { scaleAmount, isDoseError, convertAmount } from "@/lib/matcher/dose";
import type { MatcherUnit } from "@/lib/matcher/types";
import { DEFAULT_TARGET_BASIS } from "@/lib/agentic/contract/schemas";
import { resolvePracticalProfile } from "@/lib/matcher/practical-scoring";
import { resolvedNutrientFormName } from "@/lib/nutrient-identity";
import type {
  AcceptedGap,
  CanonicalPlanState,
  CurrentSupplement,
  PlanLeftover,
  PlanRequest,
  PlanTarget
} from "@/lib/agentic/plan/types";

function validateQuantityPrecision(amount: number, unit: string, supplement: CatalogueSupplement, fieldPath: string): AgenticErrorResult | null {
  if (!supplement.acceptedUnits.includes(unit as MatcherUnit)) return businessError({ fieldPath: fieldPath.replace(/(?:amount|dailyAmount|minimum|maximum)$/, "unit"), reasonCode: "unsupported_unit", message: `${supplement.name} accepts ${supplement.acceptedUnits.join(", ")}.` });
  if (amount === 0) return null;
  const one = scaleAmount({ amount: 1, unit: unit as MatcherUnit, subjectId: supplement.supplementId, subjectName: supplement.name });
  if (isDoseError(one) || one.units <= BigInt(0)) return businessError({ fieldPath, reasonCode: "unsupported_unit", message: "This nutrient form and unit cannot be converted without losing its identity." });
  const minimum = 1 / Number(one.units);
  if (amount >= minimum) return null;
  return businessError({ fieldPath, reasonCode: "invalid_request", message: `${fieldPath} must be at least ${minimum} ${unit}, the supported quantity precision.`, issues: [{ fieldPath, reasonCode: "out_of_range", messageKey: "mcp.errors.out_of_range", permittedLimit: minimum, actual: amount }] });
}

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
  return value.normalize("NFKC").trim().toLowerCase().replace(new RegExp("[^\\p{L}\\p{N}]+", "gu"), " ").trim();
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

function formIdentity(name: string) {
  if (/\b(?:epa|eicosapentaenoic)\b/.test(name)) return "epa";
  if (/\b(?:dha|docosahexaenoic)\b/.test(name)) return "dha";
  return null;
}
function formCompatible(item: CatalogueSupplement, wanted: string) {
  const form = formIdentity(wanted);
  return !form || formIdentity(normalizeName(item.name)) === form;
}

function matchByName(snapshot: CatalogueSnapshot, wanted: string) {
  const exactName = snapshot.supplements.filter(
    (item) => normalizeName(item.name) === wanted
  );

  if (exactName.length === 1) {
    return exactName;
  }

  const exact = snapshot.supplements.filter((item) => namesOf(item).includes(wanted) && formCompatible(item, wanted));

  if (exact.length === 1) {
    return exact;
  }

  if (exact.length > 1) {
    return [];
  }

  // Qualifiers such as D2/D3, MK-4/MK-7, salts and elemental amounts are meaningful.
  // A supported form must be an explicit catalogue alias; do not erase it by token matching.

  return [];
}

export function resolveSupplement(
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

      if (!namesOf(found).includes(wanted) || !formCompatible(found, wanted)) {
        return businessError({
          fieldPath,
          message: "The supplied nutrient name/form does not match this identifier. Use an identifier for that exact form or send the requested name without an identifier.",
          reasonCode: "incompatible_identity"
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
  source: "target" | "current_supplement";
  requestIndex: number;
}>): PlanLeftover {
  return {
    ...(input.amount != null ? { amount: input.amount } : {}),
    name: input.name,
    note: "not_in_catalogue",
    source: input.source,
    requestIndex: input.requestIndex,
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
    if (answer.choice === "acknowledge_unassessed") {
      const unassessedMeds = next.medicationCodes.filter((code) => !MEDICATION_ALIASES[code]);
      const unassessedConditions = next.conditionCodes.filter(
        (code) => !CONDITION_ALIASES[code]
      );
      next = {
        ...next,
        acknowledgedUnassessedConditionCodes: [
          ...new Set([
            ...(next.acknowledgedUnassessedConditionCodes ?? []),
            ...unassessedConditions
          ])
        ],
        acknowledgedUnassessedMedicationCodes: [
          ...new Set([
            ...(next.acknowledgedUnassessedMedicationCodes ?? []),
            ...unassessedMeds
          ])
        ]
      };
    }

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

    if (answer.choice.startsWith("satisfy_prerequisite:")) {
      const supplementId = answer.choice.slice("satisfy_prerequisite:".length);
      next = {
        ...next,
        targets: next.targets.map((item) =>
          item.supplementId === supplementId
            ? {
                ...item,
                prerequisite: {
                  ...(item.prerequisite ?? { status: "satisfied" as const }),
                  status: "satisfied"
                }
              }
            : item
        )
      };
    }

    if (answer.choice.startsWith("leave_prerequisite:")) {
      const supplementId = answer.choice.slice("leave_prerequisite:".length);
      next = {
        ...next,
        targets: next.targets.map((item) =>
          item.supplementId === supplementId
            ? {
                ...item,
                prerequisite: {
                  ...(item.prerequisite ?? { status: "unsatisfied" as const }),
                  status: "unsatisfied"
                }
              }
            : item
        )
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
      const requirements = { ...next.requirements }; delete requirements.maxPriceMinor;
      next = { ...next, requirements };
    }

    if (answer.choice === "relax_max_pills") {
      const requirements = { ...next.requirements }; delete requirements.maxDailyPills;
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

    if (answer.questionId.startsWith("q_inventory_duration_")) {
      const supplementId = answer.questionId.slice("q_inventory_duration_".length);
      const daysMatch = /^days:(\d+)$/.exec(answer.choice) ?? /^(\d+)$/.exec(answer.choice);
      if (answer.choice === "unknown" || answer.choice === "duration_unknown") {
        next = {
          ...next,
          currentSupplements: next.currentSupplements.map((item) => {
            if (item.supplementId !== supplementId) {
              return item;
            }
            const rest = { ...item }; delete rest.daysRemaining;
            return { ...rest, durationUnknown: true };
          })
        };
      } else if (daysMatch) {
        const days = Number(daysMatch[1]);
        if (Number.isFinite(days) && days >= 0) {
          next = {
            ...next,
            currentSupplements: next.currentSupplements.map((item) => {
              if (item.supplementId !== supplementId) {
                return item;
              }
              const rest = { ...item }; delete rest.durationUnknown;
              return { ...rest, daysRemaining: days };
            })
          };
        }
      }
    }
  }

  const remainingIds = new Set(next.targets.map((item) => item.supplementId));
  const remainingNames = new Set(next.targets.map((item) => item.name.trim().toLowerCase()));
  const acceptedIds = new Set(acceptedGaps.map((item) => item.supplementId));
  const original = next.originalRequest;
  const effectiveOriginal = original && answers.length ? {
    ...original,
    requirements: { ...next.requirements },
    targets: original.targets.filter((target, index) => {
      const mapped = state.targets.find(item => item.requestedName === target.name || item.name === target.name || item.supplementId === target.supplementId);
      if (mapped) return remainingIds.has(mapped.supplementId);
      return !answers.some(answer => answer.choice === `remove_target:leftover:${target.name}`) && original.targets[index] != null;
    }).map(target => {
      const mapped = next.targets.find(item => item.requestedName === target.name || item.name === target.name || item.supplementId === target.supplementId);
      return mapped?.prerequisite ? { ...target, prerequisite: mapped.prerequisite } : target;
    }),
    ...(original.currentSupplements ? { currentSupplements: original.currentSupplements.map(current => {
      const mapped = next.currentSupplements.find(item => item.name === current.name || item.supplementId === current.supplementId);
      return mapped?.daysRemaining != null ? { ...current, daysRemaining: mapped.daysRemaining } : current;
    }) } : {})
  } : original;
  return {
    ...next,
    ...(effectiveOriginal ? { originalRequest: effectiveOriginal } : {}),
    acceptedGaps,
    leftovers: state.leftovers.filter((item) => {
      if (item.supplementId && !remainingIds.has(item.supplementId) && item.reason !== "not_in_catalogue") {
        return false;
      }
      if (
        item.reason !== "not_in_catalogue" &&
        !remainingNames.has(item.name.trim().toLowerCase()) &&
        !(item.supplementId && remainingIds.has(item.supplementId))
      ) {
        return false;
      }
      if (
        item.supplementId &&
        acceptedIds.has(item.supplementId) &&
        item.reason !== "unsupported_unit_conversion" &&
        item.reason !== "dose_gap"
      ) {
        return false;
      }
      return true;
    }),
    pinnedCandidateKey: state.pinnedCandidateKey
  };
}

export function planRematchFingerprint(state: CanonicalPlanState) {
  return JSON.stringify({
    scoringProfileHash: resolvePracticalProfile({ optimization: state.optimization, preferenceImportance: state.requirements.preferenceImportance, scoring: state.scoring }).hash,
    ageYears: state.profile.ageYears,
    conditionCodes: state.conditionCodes,
    currency: state.currency,
    currentSupplements: state.currentSupplements,
    destinationCountry: state.destinationCountry,
    dietaryPreference: state.requirements.dietaryPreference ?? null,
    excludeSupplementIds: state.requirements.excludeSupplementIds ?? [],
    excludeProductIds: state.requirements.excludeProductIds ?? [],
    intake: state.intake ?? [],
    profileKnown: state.profileKnown,
    forms: state.requirements.allowedForms ?? [],
    lifeStage: state.profile.lifeStage,
    maxDailyPills: state.requirements.maxDailyPills ?? null,
    maxPriceMinor: state.requirements.maxPriceMinor ?? null,
    maxProductCount: state.requirements.maxProductCount ?? null,
    productDoses: state.requirements.productDoses ?? [],
    searchEffort: state.searchEffort ?? "standard",
    medicationCodes: state.medicationCodes,
    omega3SourcePreference: state.requirements.omega3SourcePreference ?? null,
    optimization: state.optimization,
    sex: state.profile.sex,
    targets: state.targets,
    retainProductIds: state.requirements.retainProductIds ?? [],
    retainSupplementIds: state.requirements.retainSupplementIds ?? [],
    baseline: state.baseline ?? null
  });
}

export type NormalizedPlan = Readonly<{
  hash: string;
  state: CanonicalPlanState;
}>;

export async function normalizePlanRequest(input: Readonly<{
  config: AgenticConfig;
  request: unknown;
  searchEffort?: "standard" | "expanded";
  snapshot: CatalogueSnapshot;
}>): Promise<NormalizedPlan | AgenticErrorResult> {
  const request = asRequest(input.request);

  if (isAgenticErrorResult(request)) {
    return request;
  }

  const market = await resolveMarket({
    countryCode: request.destinationCountry,
    locale: request.locale,
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
    const algaeAlias = normalizeName(target.name ?? "") === "algae omega 3";
    const sourceAgreed = request.requirements.omega3SourcePreference === "algae_only";
    if (algaeAlias && !sourceAgreed) {
      leftovers.push({ ...leftoverForUnknown({ amount: target.amount, name: target.name, unit: target.unit, source: "target", requestIndex: index }),
        note: agenticMessage(negotiateLocale(request.locale), "plan.source.algae_alias_clarification") });
      continue;
    }
    const supplement = resolveSupplement(
      input.snapshot,
      { name: algaeAlias ? "Omega-3" : target.name, supplementId: target.supplementId },
      fieldPath
    );

    if (isAgenticErrorResult(supplement)) {
      if (supplement.error.reasonCode === "unknown_supplement") {
        leftovers.push(leftoverForUnknown({
          amount: target.amount,
          name: target.name,
          unit: target.unit,
          source: "target", requestIndex: index
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

    const precision = validateQuantityPrecision(target.amount, target.unit, supplement, `request.targets[${index}].amount`);
    if (precision) return precision;
    if (target.acceptableRange) for (const field of ["minimum", "maximum"] as const) {
      const rangePrecision = validateQuantityPrecision(target.acceptableRange[field], target.acceptableRange.unit, supplement, `request.targets[${index}].acceptableRange.${field}`);
      if (rangePrecision) return rangePrecision;
    }

    let acceptableRange = target.acceptableRange;
    if (acceptableRange) {
      const minimum = convertAmount({ amount: acceptableRange.minimum, fromUnit: acceptableRange.unit, toUnit: target.unit, subjectId: supplement.supplementId, subjectName: supplement.name });
      const maximum = convertAmount({ amount: acceptableRange.maximum, fromUnit: acceptableRange.unit, toUnit: target.unit, subjectId: supplement.supplementId, subjectName: supplement.name });
      if (minimum == null || maximum == null || minimum > target.amount || maximum < target.amount) return businessError({ fieldPath: `request.targets[${index}].acceptableRange`, reasonCode: "invalid_request", message: "After unit conversion, acceptableRange.minimum must be no greater than the target and maximum must be no less than the target." });
      acceptableRange = { minimum, maximum, unit: target.unit };
    }
    targets.push({
      basis: target.basis ?? DEFAULT_TARGET_BASIS,
      ...(acceptableRange ? { acceptableRange } : {}),
      amount: target.amount,
      importance: target.importance ?? "required",
      name: resolvedNutrientFormName(target.name, supplement.name),
      ...(target.prerequisite ? { prerequisite: target.prerequisite } : {}),
      requestedName: target.name,
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
    if (item.daysRemaining != null && item.daysRemaining <= 0) {
      const fieldPath = `request.currentSupplements[${index}].daysRemaining`;
      return businessError({ fieldPath, reasonCode: "invalid_request", message: "Retained stock must have positive days remaining. Omit when unknown; if no stock remains, remove this retained inventory entry and revise the intended request.", issues: [{ fieldPath, reasonCode: "out_of_range", messageKey: "mcp.errors.out_of_range", permittedLimit: "> 0", actual: item.daysRemaining }] });
    }
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
          unit: item.unit,
          source: "current_supplement", requestIndex: index
        }));
        continue;
      }

      return supplement;
    }

    const precision = validateQuantityPrecision(item.dailyAmount, item.unit, supplement, `request.currentSupplements[${index}].dailyAmount`);
    if (precision) return precision;

    currentSupplements.push({
      dailyAmount: item.dailyAmount,
      ...(item.daysRemaining != null ? { daysRemaining: item.daysRemaining } : {}),
      name: supplement.name,
      ...(item.productId ? { productId: item.productId } : {}),
      supplementId: supplement.supplementId,
      unit: item.unit
    });
  }

  const currentDup = uniqueIds(
    currentSupplements.map((item) => `${item.productId ?? "unspecified"}:${item.supplementId}`),
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

  const excludeProducts = request.requirements.excludeProductIds ?? [];
  if (excludeProducts.some(id => request.requirements.retainProductIds?.includes(id))) {
    return businessError({ fieldPath: "request.requirements.retainProductIds", reasonCode: "invalid_request", message: "A product cannot be both retained and excluded. Clear one constraint explicitly." });
  }
  const intake = [];
  for (const [index, observation] of (request.intake ?? []).entries()) {
    if (observation.daysRemaining != null && (observation.source !== "current_supplement" || observation.daysRemaining <= 0)) return businessError({ fieldPath: `request.intake[${index}].daysRemaining`, reasonCode: "invalid_request", message: "daysRemaining is positive retained stock duration for current_supplement observations only; omit unknown duration and do not supply it for diet.", issues: [{ fieldPath: `request.intake[${index}].daysRemaining`, reasonCode: "out_of_range", messageKey: "mcp.errors.out_of_range", permittedLimit: observation.source === "diet" ? "omit for diet" : "> 0", actual: observation.daysRemaining }] });
    if (observation.certainty === "estimated" && ((observation.amount != null || observation.minimum != null || observation.maximum != null) && !observation.unit)) {
      return businessError({ fieldPath: `request.intake[${index}].unit`, reasonCode: "required", message: "A quantified estimate requires its unit." });
    }
    if (observation.certainty === "estimated" && observation.minimum != null && observation.maximum != null && observation.minimum > observation.maximum) {
      return businessError({ fieldPath: `request.intake[${index}].minimum`, reasonCode: "invalid_request", message: "The estimated minimum must not exceed the maximum." });
    }
    if (!observation.name && !observation.supplementId) { intake.push(observation); continue; }
    const resolved = resolveSupplement(input.snapshot, observation, `request.intake[${index}]`);
    if (isAgenticErrorResult(resolved)) {
      if (observation.supplementId) return resolved;
      intake.push(observation);
    } else {
      if (observation.certainty !== "unknown" && observation.unit) for (const field of ["amount", "minimum", "maximum"] as const) {
        const value = field in observation ? (observation as Record<string, unknown>)[field] : undefined;
        if (typeof value === "number") {
          const precision = validateQuantityPrecision(value, observation.unit, resolved, `request.intake[${index}].${field}`);
          if (precision) return precision;
        }
      }
      if (observation.source === "current_supplement" && (
        currentSupplements.some(item => item.supplementId === resolved.supplementId && item.productId === observation.productId) ||
        intake.some(item => item.source === "current_supplement" && item.supplementId === resolved.supplementId && item.productId === observation.productId)
      )) return businessError({ fieldPath: `request.intake[${index}]`, reasonCode: "duplicate_supplement", message: "Report each product and nutrient pair once, in currentSupplements or intake. Distinct products or nutrients may be reported separately." });
      intake.push({ ...observation, supplementId: resolved.supplementId, name: resolved.name });
    }
  }
  const acceptedGaps: AcceptedGap[] = [];
  let state: CanonicalPlanState = {
    ...(request.scoring ? { scoring: request.scoring } : {}),
    acceptedGaps,
    ...(request.baseline ? { baseline: request.baseline } : {}),
    conditionCodes: [...new Set((request.conditionCodes ?? []).map((item) =>
      normalizeCode(item, CONDITION_ALIASES)
    ))],
    currency: market.currency,
    currentSupplements,
    destinationCountry: market.countryCode,
    leftovers,
    locale: negotiateLocale(request.locale),
    medicationCodes: [...new Set((request.medicationCodes ?? []).map((item) =>
      normalizeCode(item, MEDICATION_ALIASES)
    ))],
    optimization: request.optimization,
    pinnedCandidateKey: null,
    profile: { ...request.profile, ageYears: request.profile.ageYears ?? 0, lifeStage: request.profile.lifeStage ?? "adult" },
    profileKnown: { ageYears: request.profile.ageYears != null, lifeStage: request.profile.lifeStage != null, sex: request.profile.sex != null },
    originalRequest: structuredClone(request),
    intake,
    requirements: { ...request.requirements },
    searchEffort: input.searchEffort ?? "standard",
    safetyAcknowledgement: request.safetyAcknowledgement ?? null,
    targets
  };

  state = applyPlanAnswers(state, request);


  return {
    hash: canonicalRequestHash(state),
    state
  };
}
