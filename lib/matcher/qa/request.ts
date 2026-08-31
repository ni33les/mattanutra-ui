import { isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { impliedOmegaPreference } from "@/lib/matcher/canonicalizer";
import type { QaSubjectKey } from "@/lib/matcher/qa/subjects";
import { QA_SUBJECTS } from "@/lib/matcher/qa/subjects";
import { qaCatalogSafetyCeilings } from "@/lib/matcher/qa/safety-ceilings";
import type {
  CanonicalCurrent,
  CanonicalRequest,
  CanonicalTarget,
  MatcherUnit
} from "@/lib/matcher/types";

export function qaTarget(
  key: QaSubjectKey,
  amount: number,
  unit?: MatcherUnit,
  name?: string
): CanonicalTarget {
  const subject = QA_SUBJECTS[key];
  const requestedUnit = unit ?? subject.unit;
  const requested = scaleAmount({
    amount,
    subjectId: subject.id,
    subjectName: name ?? subject.name,
    unit: requestedUnit
  });

  if (isDoseError(requested)) {
    throw new Error(requested.message);
  }

  return {
    importance: "required",
    name: name ?? subject.name,
    requested,
    requestedAmount: amount,
    requestedUnit,
    subjectId: subject.id
  };
}

export function qaCurrent(
  key: QaSubjectKey,
  amount: number,
  unit?: MatcherUnit
): CanonicalCurrent {
  const subject = QA_SUBJECTS[key];
  const requestedUnit = unit ?? subject.unit;
  const daily = scaleAmount({
    amount,
    subjectId: subject.id,
    subjectName: subject.name,
    unit: requestedUnit
  });

  if (isDoseError(daily)) {
    throw new Error(daily.message);
  }

  return {
    daily,
    dailyAmount: amount,
    name: subject.name,
    sourceId: `current:${subject.id}`,
    subjectId: subject.id,
    unit: requestedUnit
  };
}

export const QA_BASELINE_TARGETS = [
  qaTarget("d3", 2000),
  qaTarget("omega", 1000),
  qaTarget("mag", 200),
  qaTarget("b12", 250),
  qaTarget("c", 500)
] as const;

export function qaRequest(
  overrides: Partial<CanonicalRequest> = {}
): CanonicalRequest {
  const merged: CanonicalRequest = {
    acceptedGapSubjectIds: [],
    allowedForms: null,
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    dietaryPreference: "any",
    excludeSubjectIds: [],
    leftovers: [],
    maxDailyPills: null,
    maxPriceMinor: null,
    maxProductCount: 8,
    medicationCodes: [],
    omega3SourcePreference: "any",
    optimization: "fewest_pills",
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    retainProductIds: [],
    retainSubjectIds: [],
    safetyCeilings: qaCatalogSafetyCeilings(),
    selectorMode: "agentic",
    targets: [...QA_BASELINE_TARGETS],
    ...overrides
  };

  return {
    ...merged,
    omega3SourcePreference:
      overrides.omega3SourcePreference ??
      impliedOmegaPreference(
        merged.dietaryPreference,
        "any",
        merged.targets.map((item) => item.name)
      )
  };
}
