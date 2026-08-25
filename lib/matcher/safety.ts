import { GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { scaleAmount, unitsOrZero } from "@/lib/matcher/dose";
import {
  catalogSubjectHasCeiling,
  isPediatricSafetyProfile,
  matcherSafetyCeilingsUnavailable,
  safetyCeilingFor
} from "@/lib/matcher/safety-ceilings";
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
const MAGNESIUM = /magnesium/i;
const OMEGA = /omega/i;
const IRON = /iron/i;

function guidanceId(code: string, family: string) {
  return ["gdn", code, family].join(":");
}

function pushFinding(
  findings: SafetyFinding[],
  input: Omit<SafetyFinding, "nutrientName" | "unit"> & {
    nutrientName?: string | null;
    unit?: string | null;
  }
) {
  findings.push({
    ...input,
    nutrientName: input.nutrientName ?? null,
    unit: input.unit ?? null
  });
}

function nameOf(request: CanonicalRequest, subjectId: string | null) {
  if (!subjectId) {
    return "";
  }

  return (
    request.targets.find((item) => item.subjectId === subjectId)?.name ??
    request.currentSupplements.find((item) => item.subjectId === subjectId)?.name ??
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
    null
  );
}

function subjectIdsMatching(
  request: CanonicalRequest,
  pattern: RegExp
) {
  const ids = new Set<string>();

  for (const target of request.targets) {
    if (pattern.test(target.name) || pattern.test(target.subjectId)) {
      ids.add(target.subjectId);
    }
  }

  for (const current of request.currentSupplements) {
    if (pattern.test(current.name) || pattern.test(current.subjectId)) {
      ids.add(current.subjectId);
    }
  }

  return [...ids].sort();
}

const thresholdCache = new WeakMap<
  CanonicalRequest,
  Map<string, ScaledAmount | null>
>();

function ceilingThreshold(
  request: CanonicalRequest,
  subjectId: string
): ScaledAmount | null {
  let cached = thresholdCache.get(request);

  if (!cached) {
    cached = new Map();
    thresholdCache.set(request, cached);
  }

  if (cached.has(subjectId)) {
    return cached.get(subjectId) ?? null;
  }

  const ceiling = safetyCeilingFor(request.safetyCeilings ?? [], {
    name: nameOf(request, subjectId),
    profile: request.profile,
    subjectId
  });

  if (!ceiling) {
    cached.set(subjectId, null);
    return null;
  }

  const scaled = scaleAmount({
    amount: ceiling.maxAmount,
    subjectId,
    subjectName: ceiling.name || nameOf(request, subjectId) || subjectId,
    unit: ceiling.maxUnit
  });

  const resolved = "reason" in scaled ? null : scaled;
  cached.set(subjectId, resolved);
  return resolved;
}

export function exposureExceedsCeiling(
  request: CanonicalRequest,
  subjectId: string,
  exposureUnits: bigint
) {
  const threshold = ceilingThreshold(request, subjectId);
  return threshold != null && exposureUnits > threshold.units;
}

export function evaluateSafety(input: Readonly<{
  exposure: Exposure;
  products: readonly MatcherProduct[];
  request: CanonicalRequest;
  rulesVersion?: string;
  variants: readonly DoseVariant[];
}>): SafetyResult {
  const findings: SafetyFinding[] = [];
  const productIds = [...new Set(input.variants.map((item) => item.productId))].sort();

  if (matcherSafetyCeilingsUnavailable()) {
    pushFinding(findings, {
      action: "block",
      code: "dose_review_required",
      contributors: productIds,
      exposureUnits: null,
      family: "dose",
      guidanceId: guidanceId("dose_review_required", "dose"),
      ruleId: "ul:unavailable",
      subjectId: null,
      thresholdUnits: null
    });
  }
  const omegaIds = subjectIdsMatching(input.request, OMEGA);
  const magnesiumIds = subjectIdsMatching(input.request, MAGNESIUM);
  const zincIds = subjectIdsMatching(input.request, ZINC);
  const ironIds = subjectIdsMatching(input.request, IRON);
  const zincSubject = zincIds[0] ?? null;
  const zincTotal = zincSubject
    ? unitsOrZero(input.exposure.totals, zincSubject)
    : BigInt(0);
  const zincCurrent = input.request.currentSupplements
    .filter((item) => ZINC.test(item.name) || zincIds.includes(item.subjectId))
    .reduce((sum, item) => sum + item.daily.units, BigInt(0));
  const zincSelected = zincTotal - zincCurrent;
  const ceilingSubjects = new Set<string>([
    ...input.request.targets.map((item) => item.subjectId),
    ...input.request.currentSupplements.map((item) => item.subjectId),
    ...input.exposure.totals.keys()
  ]);

  if (
    input.request.medicationCodes.includes("apixaban") &&
    omegaIds.length > 0
  ) {
    pushFinding(findings, {
      action: "acknowledge",
      code: "medication_interaction",
      contributors: productIds,
      exposureUnits: omegaIds[0]
        ? unitsOrZero(input.exposure.totals, omegaIds[0])
        : null,
      family: "omega3+anticoagulant",
      guidanceId: guidanceId("medication_interaction", "omega3+anticoagulant"),
      ruleId: "omega3+anticoagulant",
      subjectId: omegaIds[0] ?? null,
      thresholdUnits: null
    });
  }

  if (input.request.conditionCodes.includes("ckd") && magnesiumIds.length > 0) {
    pushFinding(findings, {
      action: "block",
      code: "condition_review_required",
      contributors: productIds,
      exposureUnits: magnesiumIds[0]
        ? unitsOrZero(input.exposure.totals, magnesiumIds[0])
        : null,
      family: "magnesium+ckd",
      guidanceId: guidanceId("condition_review_required", "magnesium+ckd"),
      ruleId: "magnesium+ckd",
      subjectId: magnesiumIds[0] ?? null,
      thresholdUnits: null
    });
  }

  for (const subjectId of ceilingSubjects) {
    const threshold = ceilingThreshold(input.request, subjectId);
    const total = unitsOrZero(input.exposure.totals, subjectId);
    const isTarget = input.request.targets.some((item) => item.subjectId === subjectId);

    if (!threshold) {
      const requested = input.request.targets.find(
        (item) => item.subjectId === subjectId
      )?.requested.units;
      const missingRequiredBand =
        catalogSubjectHasCeiling(input.request.safetyCeilings ?? [], {
          name: nameOf(input.request, subjectId),
          subjectId
        }) && total > BigInt(0);
      if (
        missingRequiredBand ||
        (isTarget &&
          requested != null &&
          requested > BigInt(0) &&
          total * BigInt(100) > requested * BigInt(125))
      ) {
        pushFinding(findings, {
          action: "block",
          code: "dose_review_required",
          contributors: productIds,
          exposureUnits: total,
          family: "dose",
          guidanceId: guidanceId("dose_review_required", "dose"),
          nutrientName: nameOf(input.request, subjectId) || null,
          ruleId: `ul:missing:${subjectId}`,
          subjectId,
          thresholdUnits: null,
          unit: unitOf(input.request, subjectId)
        });
      }
      continue;
    }

    if (total > threshold.units) {
      pushFinding(findings, {
        action: "block",
        code: "dose_review_required",
        contributors: productIds,
        exposureUnits: total,
        family: "dose",
        guidanceId: guidanceId("dose_review_required", "dose"),
        nutrientName: nameOf(input.request, subjectId) || null,
        ruleId: `ul:${subjectId}`,
        subjectId,
        thresholdUnits: threshold.units,
        unit: unitOf(input.request, subjectId)
      });
    } else if (total === threshold.units) {
      pushFinding(findings, {
        action: "acknowledge",
        code: "dose_review_required",
        contributors: productIds,
        exposureUnits: total,
        family: "dose",
        guidanceId: guidanceId("dose_review_required", "dose"),
        nutrientName: nameOf(input.request, subjectId) || null,
        ruleId: `ul:${subjectId}`,
        subjectId,
        thresholdUnits: threshold.units,
        unit: unitOf(input.request, subjectId)
      });
    }
  }

  const targetIds = new Set(input.request.targets.map((item) => item.subjectId));
  const productsById = new Map(input.products.map((item) => [item.productId, item]));
  const incidentalByKey = new Map<string, { name: string; subjectId: string; units: bigint }>();

  for (const variant of input.variants) {
    const product = productsById.get(variant.productId);

    if (!product) {
      continue;
    }

    for (const fact of product.labelledContributions) {
      if (
        !fact.amount ||
        fact.amount <= 0 ||
        !fact.unit ||
        (fact.subjectId && targetIds.has(fact.subjectId))
      ) {
        continue;
      }

      const subjectId = fact.subjectId || fact.name;
      const scaled = scaleAmount({
        amount: fact.amount * variant.dailyUnits,
        subjectId,
        subjectName: fact.name,
        unit: fact.unit
      });

      if ("reason" in scaled) {
        continue;
      }

      const key = subjectId.trim().toLowerCase();
      const previous = incidentalByKey.get(key);
      incidentalByKey.set(key, {
        name: fact.name,
        subjectId,
        units: (previous?.units ?? BigInt(0)) + scaled.units
      });
    }
  }

  for (const incidental of incidentalByKey.values()) {
    const ceiling = safetyCeilingFor(input.request.safetyCeilings ?? [], {
      name: incidental.name,
      profile: input.request.profile,
      subjectId: incidental.subjectId
    });

    if (!ceiling) {
      continue;
    }

    const threshold = scaleAmount({
      amount: ceiling.maxAmount,
      subjectId: incidental.subjectId,
      subjectName: incidental.name,
      unit: ceiling.maxUnit
    });

    if ("reason" in threshold) {
      continue;
    }

    if (incidental.units > threshold.units) {
      const unit =
        input.products
          .flatMap((item) => item.labelledContributions)
          .find((fact) => (fact.subjectId || fact.name) === incidental.subjectId)
          ?.unit ?? ceiling.maxUnit;
      pushFinding(findings, {
        action: "block",
        code: "dose_review_required",
        contributors: productIds,
        exposureUnits: incidental.units,
        family: "dose",
        guidanceId: guidanceId("dose_review_required", "dose"),
        nutrientName: incidental.name,
        ruleId: `ul:incidental:${incidental.subjectId}`,
        subjectId: incidental.subjectId,
        thresholdUnits: threshold.units,
        unit
      });
    }
  }

  if (zincSubject && zincCurrent > BigInt(0) && zincSelected > BigInt(0)) {
    pushFinding(findings, {
      action: "acknowledge",
      code: "duplicate_or_overlap",
      contributors: productIds,
      exposureUnits: zincTotal,
      family: "overlap",
      guidanceId: guidanceId("duplicate_or_overlap", "overlap"),
      ruleId: "zinc-overlap",
      subjectId: zincSubject,
      thresholdUnits: null
    });
  }

  if (input.request.profile.lifeStage === "child") {
    const pediatric = [...zincIds, ...ironIds].filter((id) => {
      const selected = input.variants.some((variant) =>
        variant.contributions.has(id)
      );
      const current = input.request.currentSupplements.some(
        (item) => item.subjectId === id
      );
      return selected || current;
    });

    if (pediatric.length > 0) {
      pushFinding(findings, {
        action: "block",
        code: "pediatric_review_required",
        contributors: productIds,
        exposureUnits: null,
        family: "pediatric",
        guidanceId: guidanceId("pediatric_review_required", "pediatric"),
        ruleId: "pediatric",
        subjectId: pediatric[0] ?? null,
        thresholdUnits: null
      });
    }
  }

  const unique = new Map<string, SafetyFinding>();

  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.subjectId ?? ""}:${finding.action}`;

    if (!unique.has(key)) {
      unique.set(key, finding);
    }
  }

  const sorted = [...unique.values()].sort((left, right) =>
    left.guidanceId.localeCompare(right.guidanceId)
  );
  void (input.rulesVersion ?? GUIDANCE_RULES_VERSION);

  return {
    findings: sorted,
    hardBlocked: sorted.some((item) => item.action === "block"),
    requiresAck: sorted.some((item) => item.action === "acknowledge")
  };
}

export function safetyFingerprint(findings: readonly SafetyFinding[]) {
  return findings
    .map((item) => `${item.guidanceId}:${item.exposureUnits ?? ""}`)
    .join("|");
}
