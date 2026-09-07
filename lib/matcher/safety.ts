
import { conditionImpliesCkd, subjectIsMagnesium } from "@/lib/matcher/condition-ceilings";
import { doseFitScore, knownLimitProfile } from "@/lib/matcher/dose-fit";
import { canonicalNutrientKey, normalizeProductFactKey, productKeysMatch } from "@/lib/product-key-matching";
import { nutrientNameMatchesTarget } from "@/lib/nutrient-identity";
import { isDoseError, scaleAmount, multiplyScaled, numberToRational } from "@/lib/matcher/dose";
import { catalogSubjectHasCeiling, matcherSafetyCeilingsUnavailable, safetyCeilingFor } from "@/lib/matcher/safety-ceilings";
import type {
  CanonicalRequest,
  DoseVariant,
  Exposure,
  MatcherProduct,
  SafetyFinding,
  SafetyResult,
  ScaledAmount
} from "@/lib/matcher/types";

const ZINC = /zinc/i;
const OMEGA = /omega/i;
const IRON = /iron/i;

function nameOf(request: CanonicalRequest, subjectId: string | null) {
  if (!subjectId) {
    return "";
  }

  return (
    request.targets.find((item) => item.subjectId === subjectId)?.name ??
    request.currentSupplements.find((item) => item.subjectId === subjectId)?.name ??
    request.dietaryIntake?.find((item) => item.subjectId === subjectId)?.name ??
    request.safetyCeilings?.find((item) => item.subjectId === subjectId)?.name ??
    subjectId
  );
}

function unitOf(request: CanonicalRequest, subjectId: string | null) {
  if (!subjectId) {
    return null;
  }

  return (
    request.targets.find((item) => item.subjectId === subjectId)?.requestedUnit ??
    request.currentSupplements.find((item) => item.subjectId === subjectId)?.unit ??
    request.safetyCeilings?.find((item) => item.subjectId === subjectId)?.maxUnit ??
    null
  );
}

export function exposureExceedsCeiling(
  request: CanonicalRequest,
  subjectId: string,
  exposureUnits: bigint
) {
  return stackUnitsViolateCeiling(request, subjectId, nameOf(request, subjectId), exposureUnits);
}

export function labelledSafetyExposure(
  product: MatcherProduct,
  dailyUnits: number,
  request?: CanonicalRequest,
  servingRatio?: Readonly<{ num: bigint; den: bigint }>
) {
  const exposure = new Map<string, ScaledAmount>();
  const omegaParts = new Map<string, Map<string, ScaledAmount>>();
  const omegaTotals = new Set<string>();

  for (const fact of product.labelledContributions) {
    if (!fact.amount || fact.amount <= 0 || !fact.unit) {
      continue;
    }

    const target = request?.targets.find((row) =>
      nutrientNameMatchesTarget(row.name, fact.name));
    const current = request?.currentSupplements.find((row) =>
      nutrientNameMatchesTarget(row.name, fact.name));
    const reference = request?.safetyCeilings?.find((row) =>
      row.subjectId === fact.subjectId || productKeysMatch(row.name, fact.name));
    const resolvedId = target?.subjectId ?? current?.subjectId ?? reference?.subjectId ??
      (fact.subjectId || canonicalNutrientKey(fact.name)).trim();
    const conflictsWithTarget = request?.targets.some((row) => row.subjectId === resolvedId && !nutrientNameMatchesTarget(row.name, fact.name));
    const subjectId = conflictsWithTarget ? `incidental:${canonicalNutrientKey(fact.name)}` : resolvedId;

    if (!subjectId) {
      continue;
    }

    const labelled = scaleAmount({
      amount: fact.amount,
      subjectId,
      subjectName: fact.name,
      unit: fact.unit
    });

    const ratio = servingRatio ?? numberToRational(dailyUnits);
    if (isDoseError(labelled) || isDoseError(ratio)) continue;
    const scaled = multiplyScaled(labelled, ratio);
    if (isDoseError(scaled)) continue;

    const nameKey = normalizeProductFactKey(fact.name);
    const part = nutrientNameMatchesTarget("EPA", fact.name) ? "epa" :
      nutrientNameMatchesTarget("DHA", fact.name) ? "dha" : null;
    if (part) {
      const parts = omegaParts.get(subjectId) ?? new Map<string, ScaledAmount>();
      const previous = parts.get(part);
      if (!previous || scaled.units > previous.units) parts.set(part, scaled);
      omegaParts.set(subjectId, parts);
      continue;
    }
    if (["omega_3", "omega3", "omega_3_fatty_acids"].includes(nameKey)) omegaTotals.add(subjectId);

    const previous = exposure.get(subjectId);
    exposure.set(
      subjectId,
      // Duplicate alias/total label rows represent the same nutrient, not extra intake.
      previous && previous.units > scaled.units ? previous : scaled
    );
  }

  for (const [subjectId, parts] of omegaParts) {
    if (omegaTotals.has(subjectId)) continue;
    const values = [...parts.values()];
    const first = values[0];
    if (first && values.every((row) => row.dim === first.dim)) exposure.set(subjectId, { ...first,
      units: values.reduce((sum, row) => sum + row.units, BigInt(0)) });
  }

  return exposure;
}

export function stackUnitsViolateCeiling(
  request: CanonicalRequest,
  subjectId: string,
  name: string,
  exposureUnits: bigint
) {
  if (exposureUnits <= BigInt(0)) {
    return false;
  }

  const ceiling = safetyCeilingFor(request.safetyCeilings ?? [], {
    name,
    profile: request.profile,
    subjectId
  });

  if (ceiling) {
    const threshold = scaleAmount({
      amount: ceiling.maxAmount,
      subjectId,
      subjectName: ceiling.name || name || subjectId,
      unit: ceiling.maxUnit
    });

    if (isDoseError(threshold)) {
      return true;
    }

    return exposureUnits > threshold.units;
  }

  return catalogSubjectHasCeiling(request.safetyCeilings ?? [], {
    name,
    subjectId
  });
}

export function exposureOvershootsTarget(
  request: CanonicalRequest,
  subjectId: string,
  exposureUnits: bigint
) {
  const target = request.targets.find((item) => item.subjectId === subjectId);

  if (!target || target.requested.units <= BigInt(0)) {
    return false;
  }

  return (
    exposureUnits > target.requested.units
  );
}

export function variantDedicatedOvershoot(
  request: CanonicalRequest,
  contributions: DoseVariant["contributions"],
  dailyUnits = 1
) {
  if (dailyUnits > 1) {
    return false;
  }

  const contributing = request.targets.filter(
    (target) => (contributions.get(target.subjectId)?.units ?? BigInt(0)) > BigInt(0)
  );

  if (contributing.length !== 1) {
    return false;
  }

  const target = contributing[0]!;
  const units = contributions.get(target.subjectId)?.units ?? BigInt(0);

  if (!exposureOvershootsTarget(request, target.subjectId, units)) {
    return false;
  }

  const ceiling = safetyCeilingFor(request.safetyCeilings ?? [], {
    name: target.name,
    profile: request.profile,
    subjectId: target.subjectId
  });

  if (!ceiling) {
    return true;
  }

  const scaled = scaleAmount({
    amount: ceiling.maxAmount,
    subjectId: target.subjectId,
    subjectName: ceiling.name || target.name,
    unit: ceiling.maxUnit
  });

  if ("reason" in scaled || units < scaled.units) {
    return false;
  }

  return units * BigInt(100) > target.requested.units * BigInt(250);
}

export function evaluateSafety(input: Readonly<{
  exposure: Exposure;
  products: readonly MatcherProduct[];
  request: CanonicalRequest;
  rulesVersion?: string;
  variants: readonly DoseVariant[];
}>): SafetyResult {
  const findings: SafetyFinding[] = [];
  const exposure = new Map([...input.exposure.totals].map(([id, amount]) => [id, amount.units]));
  const fit = doseFitScore(input.request, exposure);
  const contributors = [...new Set(input.variants.map((row) => row.productId))].sort();
  const add = (row: Omit<SafetyFinding, "action" | "guidanceId" | "contributors"> & { contributors?: readonly string[] }) => {
    const relevant = row.subjectId ? input.variants.filter((variant) =>
      (variant.contributions.get(row.subjectId!)?.units ?? variant.safetyExposure?.get(row.subjectId!)?.units ?? BigInt(0)) > BigInt(0)).map((variant) => variant.productId) : contributors;
    findings.push({ ...row, action: "inform", contributors: row.contributors ?? [...new Set(relevant)].sort(),
      guidanceId: ["gdn", row.code, row.ruleId, row.subjectId ?? "context"].join(":") });
  };
  for (const row of fit.perTarget) {
    const possibleExposure = row.exposureMaximum ?? row.exposure;
    if (possibleExposure <= row.target) continue;
    const target = input.request.targets.find((item) => item.subjectId === row.subjectId)!;
    const amount = scaleAmount({ amount: possibleExposure, subjectId: row.subjectId, subjectName: row.name, unit: row.unit });
    add({ code: "target_exceeded", family: "dose", subjectId: row.subjectId, nutrientName: row.name,
      ruleId: `target:${row.subjectId}`, thresholdUnits: target.requested.units,
      exposureUnits: isDoseError(amount) ? null : amount.units, unit: row.unit, severity: "info", comparator: "gt",
      sourceScope: row.basis === "total_daily" ? "total" : "supplemental", uncertainty: row.certainty === "known" ? [] : [row.certainty + "_intake"] });
  }
  for (const row of fit.perLimit) {
    const possibleExposure = row.exposureMaximum ?? row.exposure;
    if (possibleExposure < row.limit) continue;
    const total = scaleAmount({ amount: possibleExposure, subjectId: row.subjectId, subjectName: row.name, unit: row.unit });
    const threshold = scaleAmount({ amount: row.limit, subjectId: row.subjectId, subjectName: row.name, unit: row.unit });
    add({ code: "dose_review_required", family: "dose", subjectId: row.subjectId, nutrientName: row.name,
      ruleId: row.ruleId ?? `ul:${row.sourceScope}:${row.subjectId}`,
      thresholdUnits: isDoseError(threshold) ? null : threshold.units,
      exposureUnits: isDoseError(total) ? null : total.units, unit: row.unit, severity: "high",
      comparator: possibleExposure > row.limit ? "gt" : "gte", sourceScope: row.sourceScope,
      authorityUrl: row.authorityUrl,
      uncertainty: row.certainty === "known" ? [] : [row.certainty + "_intake", ...(row.exposureMinimum !== row.exposureMaximum ? ["amount_is_upper_endpoint_of_estimate"] : [])] });
  }
  for (const row of fit.perContinuedDose ?? []) {
    if (row.over <= 0) continue;
    const exposure = scaleAmount({ amount: row.exposure, subjectId: row.subjectId, subjectName: row.name, unit: row.unit });
    const reference = scaleAmount({ amount: row.referenceDose, subjectId: row.subjectId, subjectName: row.name, unit: row.unit });
    add({ code: "continued_dose_increased", family: "dose", subjectId: row.subjectId, nutrientName: row.name,
      ruleId: `continued_dose:${row.subjectId}`, thresholdUnits: isDoseError(reference) ? null : reference.units,
      exposureUnits: isDoseError(exposure) ? null : exposure.units, unit: row.unit, severity: "info", comparator: "gt",
      sourceScope: "supplemental", uncertainty: row.certainty === "known" ? [] : [row.certainty + "_intake"] });
  }
  const omegaIds = [...exposure.keys()].filter((id) => OMEGA.test(nameOf(input.request, id)) || OMEGA.test(id));
  if (input.request.medicationCodes.some((code) => ["apixaban", "warfarin", "anticoagulant", "blood-thinner", "blood_thinner"].includes(code))) {
    for (const id of omegaIds) {
      if ((exposure.get(id) ?? BigInt(0)) <= BigInt(0)) continue;
      add({ code: "medication_interaction", family: "omega3+anticoagulant", subjectId: id,
        nutrientName: nameOf(input.request, id), ruleId: "omega3+anticoagulant", thresholdUnits: null,
        exposureUnits: exposure.get(id) ?? null, unit: unitOf(input.request, id), severity: "high",
        comparator: null, uncertainty: ["possible_interaction_requires_individual_review"] });
    }
  }
  for (const [id, amount] of exposure) {
    const name = nameOf(input.request, id);
    if (conditionImpliesCkd(input.request.conditionCodes) && subjectIsMagnesium({ name, subjectId: id }) && amount > BigInt(0)) add({
      code: "condition_review_required", family: "condition", subjectId: id, nutrientName: name,
      ruleId: "condition:" + id, thresholdUnits: null, exposureUnits: amount, unit: unitOf(input.request, id),
      severity: "high", comparator: null, uncertainty: ["clinical_caution_is_not_a_numeric_zero_limit"] });
    if (input.request.profileKnown?.lifeStage !== false && input.request.profile.lifeStage === "child" && (ZINC.test(name) || IRON.test(name)) && amount > BigInt(0)) add({
      code: "pediatric_review_required", family: "pediatric", subjectId: id, nutrientName: name,
      ruleId: "pediatric:" + id, thresholdUnits: null, exposureUnits: amount, unit: unitOf(input.request, id), severity: "high", comparator: null });
  }
  const unknownReasons = new Set<string>();
  if (matcherSafetyCeilingsUnavailable()) unknownReasons.add("reference_limits_unavailable");
  if (!knownLimitProfile(input.request)) unknownReasons.add("unknown_reference_population");
  if (input.request.unknownIntakeSubjectIds?.length) unknownReasons.add("unknown_intake");
  if (input.request.estimatedIntakeSubjectIds?.length) unknownReasons.add("estimated_intake");
  if (input.variants.some((row) => row.unknownSafetyAmount)) unknownReasons.add("unknown_product_amount");
  for (const subjectId of new Set([...input.request.targets.map((row) => row.subjectId), ...exposure.keys()])) {
    if (!fit.perLimit.some((row) => row.subjectId === subjectId)) unknownReasons.add("no_applicable_reference:" + subjectId);
  }
  if (unknownReasons.size > 0) add({ code: "incomplete_health_information", family: "uncertainty", subjectId: null,
    nutrientName: null, ruleId: "health-information", thresholdUnits: null, exposureUnits: null, unit: null,
    severity: "info", comparator: null, uncertainty: [...unknownReasons].sort() });
  findings.sort((a, b) => a.guidanceId.localeCompare(b.guidanceId));
  return { findings, hardBlocked: false, requiresAck: false };
}

export function safetyFingerprint(findings: readonly SafetyFinding[]) {
  return findings
    .map((item) => `${item.guidanceId}:${item.exposureUnits ?? ""}`)
    .join("|");
}
