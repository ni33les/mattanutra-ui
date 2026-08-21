import { GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { scaleAmount, unitsOrZero } from "@/lib/matcher/dose";
import { safetyCeilingFor } from "@/lib/matcher/safety-ceilings";
import type {
  CanonicalRequest,
  DoseVariant,
  Exposure,
  MatcherProduct,
  SafetyFinding,
  SafetyResult
} from "@/lib/matcher/types";

const ZINC = /zinc/i;
const MAGNESIUM = /magnesium/i;
const OMEGA = /omega/i;
const IRON = /iron/i;

function guidanceId(code: string, family: string) {
  return ["gdn", code, family].join(":");
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

function ceilingThreshold(request: CanonicalRequest, subjectId: string) {
  const ceiling = safetyCeilingFor(request.safetyCeilings ?? [], {
    name: nameOf(request, subjectId),
    subjectId
  });

  if (!ceiling) {
    return null;
  }

  const scaled = scaleAmount({
    amount: ceiling.maxAmount,
    subjectId,
    subjectName: ceiling.name || nameOf(request, subjectId) || subjectId,
    unit: ceiling.maxUnit
  });

  if ("reason" in scaled) {
    return null;
  }

  return scaled;
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
    findings.push({
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
    findings.push({
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

    if (!threshold) {
      continue;
    }

    const total = unitsOrZero(input.exposure.totals, subjectId);

    if (total > threshold.units) {
      findings.push({
        action: "block",
        code: "dose_review_required",
        contributors: productIds,
        exposureUnits: total,
        family: "dose",
        guidanceId: guidanceId("dose_review_required", "dose"),
        ruleId: `ul:${subjectId}`,
        subjectId,
        thresholdUnits: threshold.units
      });
    } else if (total === threshold.units) {
      findings.push({
        action: "acknowledge",
        code: "dose_review_required",
        contributors: productIds,
        exposureUnits: total,
        family: "dose",
        guidanceId: guidanceId("dose_review_required", "dose"),
        ruleId: `ul:${subjectId}`,
        subjectId,
        thresholdUnits: threshold.units
      });
    }
  }

  if (zincSubject && zincCurrent > BigInt(0) && zincSelected > BigInt(0)) {
    findings.push({
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
      findings.push({
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
