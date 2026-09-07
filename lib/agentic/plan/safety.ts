import { nutrientNameMatchesTarget } from "@/lib/nutrient-identity";
import { intakeCertaintyFor } from "@/lib/agentic/plan/intake-certainty";
import { conditionImpliesCkd, subjectIsMagnesium } from "@/lib/matcher/condition-ceilings";
import { knownLimitProfile } from "@/lib/matcher/dose-fit";
import { GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { agenticMessage } from "@/lib/agentic/i18n";
import type { Locale } from "@/lib/i18n";
import { amountExceedsCeiling, upperLimitAmount } from "@/lib/agentic/plan/limits";
import {
  catalogBandRuleId,
  catalogBandRulesVersion,
  catalogSubjectHasCeiling,
  matcherSafetyCeilings,
  safetyCeilingFor
} from "@/lib/matcher/safety-ceilings";
import { doseComparable, fromComparable, roundDose } from "@/lib/agentic/plan/units";
import type {
  CanonicalPlanState,
  CoverageContributor,
  CoverageRow,
  OptionSafety,
  PlanQuestion,
  SafetyGuidance,
  StackOption
} from "@/lib/agentic/plan/types";
import {
  CONDITION_ALIASES,
  MEDICATION_ALIASES
} from "@/lib/agentic/catalogue/names";

function activeReferenceScope(name: string, subjectId: string, state: Pick<CanonicalPlanState, "profile" | "profileKnown" | "conditionCodes">,
  preferred: "supplemental" | "total" = "supplemental") {
  const profile = knownLimitProfile(state);
  return safetyCeilingFor(profile ? matcherSafetyCeilings() : [], { name, subjectId, profile,
    conditionCodes: state.conditionCodes, sourceScope: preferred }) ? preferred : preferred === "supplemental" ? "total" : "supplemental";
}

function catalogRule(
  name: string,
  subjectId: string,
  state: Pick<CanonicalPlanState, "profile" | "profileKnown">,
  fallbackRuleId: string,
  conditionCodes: readonly string[] = [],
  sourceScope?: "supplemental" | "total"
) {
  const profile = knownLimitProfile(state);
  const ceiling = safetyCeilingFor(profile ? matcherSafetyCeilings() : [], {
    conditionCodes,
    name,
    profile,
    sourceScope: sourceScope ?? activeReferenceScope(name, subjectId, { ...state, conditionCodes }),
    subjectId
  });
  return {
    ruleId: catalogBandRuleId(ceiling) ?? fallbackRuleId,
    rulesVersion: catalogBandRulesVersion(ceiling) ?? GUIDANCE_RULES_VERSION,
    ...(ceiling?.sourceScope ? { sourceScope: ceiling.sourceScope } : {}),
    ...(ceiling?.authorityUrl ? { authorityUrl: ceiling.authorityUrl, evidence: [ceiling.authorityUrl] } : {})
  };
}

function currentContributors(
  row: Pick<CoverageRow, "currentAmount" | "name" | "unit">
): CoverageContributor[] {
  if (row.currentAmount <= 0) {
    return [];
  }

  return [
    {
      amount: row.currentAmount,
      productName: row.name,
      source: "current",
      unit: row.unit
    }
  ];
}

function exposureContributors(
  row: Pick<CoverageRow, "currentAmount" | "name" | "unit"> & {
    contributors?: CoverageRow["contributors"];
  }
): CoverageContributor[] {
  const rows = [
    ...((row.contributors ?? []).some(item => item.source === "current" || item.source === "diet") ? [] : currentContributors(row)),
    ...(row.contributors ?? []).map((item) => ({
      ...item,
      source: item.source ?? ("selected" as const)
    }))
  ];
  const seen = new Set<string>();
  const unique: CoverageContributor[] = [];

  for (const item of rows) {
    const key = `${item.source ?? ""}:${item.productId ?? item.productName}:${item.amount}:${item.unit}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function guidance(input: Readonly<{
  action: SafetyGuidance["action"];
  comparator?: SafetyGuidance["comparator"];
  authorityUrl?: string | null;
  evidence?: readonly string[];
  code: SafetyGuidance["code"];
  locale: Locale;
  productIds: readonly string[];
  severity: SafetyGuidance["severity"];
  supplementIds: readonly string[];
  contributors?: readonly CoverageContributor[];
  exposure?: number | null;
  nutrientName?: string | null;
  overflow?: number | null;
  remainingGap?: number | null;
  requested?: number | null;
  ruleId?: string;
  rulesVersion?: string;
  sourceScope?: SafetyGuidance["sourceScope"];
  threshold?: number | null;
  unit?: string | null;
}>): SafetyGuidance {
  const informationalOverlap =
    input.code === "duplicate_or_overlap" && input.action === "review";
  const remainingZero =
    input.code === "dose_review_required" &&
    input.action === "block" &&
    input.threshold === 0;
  const messageKey = informationalOverlap
    ? "guidance.informational_overlap"
    : remainingZero
      ? "guidance.dose_review_required_remaining_zero"
      : `guidance.${input.code}`;
  const family =
    input.code === "medication_interaction"
      ? "omega3+anticoagulant"
      : input.code === "condition_review_required"
        ? "magnesium+ckd"
        : input.code === "dose_review_required"
          ? "dose"
          : input.code === "duplicate_or_overlap"
            ? "overlap"
            : input.code === "pediatric_review_required"
              ? "pediatric"
              : input.code;
  const factSlug = String(input.nutrientName ?? family)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const guidanceId =
    input.code === "duplicate_or_overlap" || input.code === "dose_review_required" || input.code === "continued_dose_increased"
      ? ["gdn", input.code, factSlug || "fact", input.sourceScope ?? "unknown", input.ruleId ?? family].join(":")
      : ["gdn", input.code, family].join(":");
  const contributorLabel =
    (input.contributors ?? [])
      .map((item) => {
        const name = item.productName?.trim();
        if (!name) {
          return "";
        }
        return item.amount != null && item.unit
          ? `${name} ${item.amount} ${item.unit}`
          : name;
      })
      .filter(Boolean)
      .join("; ") || "none selected";
  const nextAction =
    remainingZero
      ? "do not add this nutrient"
      : input.code === "condition_review_required"
        ? "seek clinician review before use"
        : informationalOverlap
          ? "listed for awareness"
        : input.code === "medication_interaction"
          ? "listed as a safety fact"
          : "review before use";

  return {
    action: "review",
    comparator: input.comparator ?? null,
    ...(input.authorityUrl ? { authorityUrl: input.authorityUrl } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
    code: input.code,
    contributors: input.contributors ?? [],
    exposure: input.exposure ?? null,
    guidanceId,
    message: agenticMessage(input.locale, messageKey, {
      contributors: contributorLabel,
      threshold: input.threshold ?? 0,
      exposure: input.exposure ?? 0,
      nextAction,
      nutrientName: input.nutrientName ?? "",
      overflow: input.overflow ?? 0,
      remainingGap: input.remainingGap ?? 0,
      unit: input.unit ?? ""
    }),
    messageKey,
    nutrientName: input.nutrientName ?? null,
    productIds: input.productIds,
    ruleId: input.ruleId ?? family,
    rulesVersion: input.rulesVersion ?? GUIDANCE_RULES_VERSION,
    severity: input.severity === "blocking" ? "high" : input.severity,
    sourceScope: input.sourceScope ?? null,
    supplementIds: input.supplementIds,
    threshold: input.threshold ?? null,
    unit: input.unit ?? null
  };
}

function zincExposure(
  selected: StackOption | null,
  state: CanonicalPlanState
): CoverageRow | null {
  const row = selected?.coverage.find((item) => /zinc/i.test(item.name));

  if (row) {
    return row;
  }

  const current = state.currentSupplements.filter(
    (item) => /zinc/i.test(item.name)
  );
  const first = current[0];

  if (!first) {
    return null;
  }

  const unit = first.unit;
  const currentComparable = current.reduce(
    (sum, item) => sum + doseComparable(item.dailyAmount, item.unit, item.name),
    0
  );
  const currentAmount = roundDose(fromComparable(currentComparable, unit, "Zinc"));

  return {
    contributors: [],
    coveragePercent: 0,
    currentAmount,
    deliveredAmount: 0,
    name: "Zinc",
    percentOfUpperLimit: null,
    remainingGap: 0,
    requestedAmount: 0,
    status: "uncovered",
    supplementId: first.supplementId,
    totalExposureAmount: currentAmount,
    unit,
    upperLimitAmount: null
  };
}

export function assessedSafetyCodes(state: CanonicalPlanState) {
  return {
    assessedConditionCodes: [
      ...new Set(
        state.conditionCodes
          .map((code) => CONDITION_ALIASES[code])
          .filter((code): code is string => Boolean(code))
      )
    ],
    assessedMedicationCodes: [
      ...new Set(
        state.medicationCodes
          .map((code) => MEDICATION_ALIASES[code])
          .filter((code): code is string => Boolean(code))
      )
    ]
  };
}

export function optionSafety(input: Readonly<{
  locale: Locale;
  selected: StackOption;
  state: CanonicalPlanState;
}>): OptionSafety {
  return {
    ...assessedSafetyCodes(input.state),
    guidance: evaluateSafety({
      coverage: input.selected.coverage,
      locale: input.locale,
      selected: input.selected,
      state: input.state
    })
  };
}

export function evaluateSafety(input: Readonly<{
  coverage?: readonly CoverageRow[];
  locale: Locale;
  selected: StackOption | null;
  state: CanonicalPlanState;
}>): readonly SafetyGuidance[] {
  const items: SafetyGuidance[] = [];
  for (const product of input.selected?.basket ?? []) {
    const uncertain = product.labelledFacts?.filter(fact => fact.confidence !== "high" || fact.mappingStatus === "conflicting") ?? [];
    if (!uncertain.length && product.pillCountKnown !== false) continue;
    const finding = guidance({ action: "review", code: "unverified_product_facts", locale: input.locale, productIds: [product.productId], supplementIds: product.contributionSupplementIds, severity: "high" });
    items.push({ ...finding, message: `${product.productName}: ${finding.message}`, evidence: uncertain.map(fact => fact.sourceUrl).filter((url): url is string => Boolean(url)), uncertainty: agenticMessage(input.locale, "guidance.unverified_product_facts"), uncertaintyCodes: [ ...(product.pillCountKnown === false ? ["physical_quantity_unknown"] : []), ...uncertain.map(fact => `label_${fact.mappingStatus === "conflicting" ? "conflicting" : "unverified"}:${fact.name}`) ].sort() });
  }
  const knownProfile = knownLimitProfile(input.state);
  const populationCeilings = knownProfile ? matcherSafetyCeilings() : [];
  const productIds = input.selected?.basket.map((item) => item.productId) ?? [];
  const omegaIds = input.state.targets
    .filter((item) => /omega/i.test(item.name))
    .map((item) => item.supplementId);
  const coverageFromPlan = input.coverage ?? input.selected?.coverage ?? [];
  const zincCoverage =
    coverageFromPlan.find((item) => /zinc/i.test(item.name)) ??
    zincExposure(input.selected, input.state);
  const ironCoverage = coverageFromPlan.find((row) => /iron/i.test(row.name));
  const coverageRows =
    coverageFromPlan.length > 0
      ? [...coverageFromPlan]
      : zincCoverage
        ? [zincCoverage]
        : [];

  if (conditionImpliesCkd(input.state.conditionCodes)) {
    for (const row of coverageRows.filter(item => subjectIsMagnesium({ name: item.name, subjectId: item.supplementId }))) {
      items.push(guidance({ action: "review", code: "condition_review_required", contributors: exposureContributors(row), exposure: row.totalExposureAmount, locale: input.locale, nutrientName: row.name, productIds, severity: "high", sourceScope: "total", supplementIds: [row.supplementId], threshold: null, unit: row.unit }));
    }
  }

  const omegaCoverage = input.selected?.coverage.find((row) => /omega/i.test(row.name));

  if (
    input.state.medicationCodes.includes("apixaban") &&
    omegaIds.length > 0
  ) {
    items.push(guidance({
      action: "acknowledge",
      code: "medication_interaction",
      contributors: omegaCoverage
        ? exposureContributors(omegaCoverage)
        : [],
      exposure: omegaCoverage?.totalExposureAmount ?? null,
      locale: input.locale,
      nutrientName: omegaCoverage?.name ?? "Omega-3",
      productIds,
      requested: omegaCoverage?.requestedAmount ?? null,
      severity: "high",
      sourceScope: "supplemental",
      supplementIds: omegaIds,
      unit: omegaCoverage?.unit ?? "mg"
    }));
  }

  for (const target of input.state.targets) {
    if (coverageRows.some((row) => row.supplementId === target.supplementId)) {
      continue;
    }

    const limit = upperLimitAmount(target.name, target.unit, {
      ceilings: populationCeilings,
      conditionCodes: input.state.conditionCodes,
      profile: input.state.profile,
      subjectId: target.supplementId,
      sourceScope: activeReferenceScope(target.name, target.supplementId, input.state, target.basis === "total_daily" ? "total" : "supplemental")
    });

    if (amountExceedsCeiling(target.amount, limit)) {
      items.push(guidance({
        action: "block",
        code: "dose_review_required",
        exposure: 0,
        locale: input.locale,
        nutrientName: target.name,
        productIds,
        requested: target.amount,
        severity: "blocking",
        sourceScope: "supplemental",
        supplementIds: [target.supplementId],
        threshold: limit,
        unit: target.unit,
        ...catalogRule(
          target.name,
          target.supplementId,
          input.state,
          `ul:${target.supplementId}`,
          input.state.conditionCodes,
          activeReferenceScope(target.name, target.supplementId, input.state, target.basis === "total_daily" ? "total" : "supplemental")
        )
      }));
    }
  }

  for (const leftover of input.state.leftovers) {
    if (leftover.source === "current_supplement") continue;
    const amount = leftover.amount;
    const unit = leftover.unit;
    if (amount == null || !unit) {
      continue;
    }
    const subjectId = leftover.supplementId || leftover.name;
    if (
      coverageRows.some(
        (row) =>
          row.supplementId === leftover.supplementId ||
          row.name.trim().toLowerCase() === leftover.name.trim().toLowerCase()
      ) ||
      input.state.targets.some(
        (target) =>
          target.supplementId === leftover.supplementId ||
          target.name.trim().toLowerCase() === leftover.name.trim().toLowerCase()
      )
    ) {
      continue;
    }
    const limit = upperLimitAmount(leftover.name, unit, {
      ceilings: populationCeilings,
      conditionCodes: input.state.conditionCodes,
      profile: input.state.profile,
      subjectId,
      sourceScope: activeReferenceScope(leftover.name, subjectId, input.state)
    });
    if (amountExceedsCeiling(amount, limit)) {
      items.push(guidance({
        action: "block",
        code: "dose_review_required",
        exposure: 0,
        locale: input.locale,
        nutrientName: leftover.name,
        productIds,
        requested: amount,
        severity: "blocking",
        sourceScope: "supplemental",
        supplementIds: leftover.supplementId ? [leftover.supplementId] : [],
        threshold: limit,
        unit,
        ...catalogRule(
          leftover.name,
          subjectId,
          input.state,
          `ul:${subjectId}`,
          input.state.conditionCodes
        )
      }));
    }
  }

  for (const originalRow of coverageRows) {
    const rowScope = originalRow.sourceScope ?? "supplemental";
    const allContributors = exposureContributors(originalRow);
    const sourceContributors = allContributors.filter(item => rowScope === "total" || item.source !== "diet");
    const quantifiedExposure = allContributors.length ? sourceContributors.reduce((sum, item) => sum + item.amount, 0) : originalRow.totalExposureAmount;
    const row = { ...originalRow, totalExposureAmount: quantifiedExposure, contributors: sourceContributors };
    const limit = upperLimitAmount(row.name, row.unit, {
      ceilings: populationCeilings,
      conditionCodes: input.state.conditionCodes,
      profile: input.state.profile,
      sourceScope: rowScope,
      subjectId: row.supplementId
    });
    const missingRequiredBand =
      limit == null &&
      catalogSubjectHasCeiling(matcherSafetyCeilings(), {
        name: row.name,
        subjectId: row.supplementId
      }) &&
      row.totalExposureAmount > 0;

    const rowContributors = exposureContributors(row);

    if (missingRequiredBand) {
      items.push(guidance({
        action: "block",
        code: "dose_review_required",
        contributors: rowContributors,
        exposure: row.totalExposureAmount,
        locale: input.locale,
        nutrientName: row.name,
        productIds,
        requested: row.requestedAmount,
        severity: "blocking",
        sourceScope: rowScope,
        supplementIds: [row.supplementId],
        threshold: null,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state,
          `ul:missing:${row.supplementId}`,
          input.state.conditionCodes,
          rowScope
        )
      }));
    } else if (limit == null && row.coveragePercent > 125) {
      items.push(guidance({
        action: "block",
        code: "dose_review_required",
        contributors: rowContributors,
        exposure: row.totalExposureAmount,
        locale: input.locale,
        nutrientName: row.name,
        productIds,
        requested: row.requestedAmount,
        severity: "blocking",
        sourceScope: rowScope,
        supplementIds: [row.supplementId],
        threshold: null,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state,
          `ul:missing:${row.supplementId}`,
          input.state.conditionCodes,
          rowScope
        )
      }));
    } else if (
      amountExceedsCeiling(row.requestedAmount, limit) &&
      row.currentAmount <= 0
    ) {
      items.push(guidance({
        action: "block",
        code: "dose_review_required",
        contributors: rowContributors,
        exposure: row.totalExposureAmount,
        locale: input.locale,
        nutrientName: row.name,
        productIds,
        requested: row.requestedAmount,
        severity: "blocking",
        sourceScope: rowScope,
        supplementIds: [row.supplementId],
        threshold: limit,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state,
          `ul:${row.supplementId}`,
          input.state.conditionCodes,
          rowScope
        )
      }));
    } else if (amountExceedsCeiling(row.totalExposureAmount, limit)) {
      items.push(guidance({
        action: "block",
        comparator: "gt",
        code: "dose_review_required",
        contributors: rowContributors,
        exposure: row.totalExposureAmount,
        locale: input.locale,
        nutrientName: row.name,
        productIds,
        requested: row.requestedAmount,
        severity: "blocking",
        sourceScope: rowScope,
        supplementIds: [row.supplementId],
        threshold: limit,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state,
          `ul:${row.supplementId}`,
          input.state.conditionCodes,
          rowScope
        )
      }));
    } else if (
      limit != null &&
      Number.isFinite(limit) &&
      limit > 0 &&
      row.totalExposureAmount >= limit
    ) {
      items.push(guidance({
        action: "acknowledge",
        comparator: "gte",
        code: "dose_review_required",
        contributors: rowContributors,
        exposure: row.totalExposureAmount,
        locale: input.locale,
        nutrientName: row.name,
        productIds,
        requested: row.requestedAmount,
        severity: "high",
        sourceScope: rowScope,
        supplementIds: [row.supplementId],
        threshold: limit,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state,
          `ul:${row.supplementId}`,
          input.state.conditionCodes,
          rowScope
        )
      }));
    }

    const overlap =
      row.status !== "already_covered" &&
      row.status !== "optional_omitted" &&
      row.status !== "conditional_deferred" &&
      (new Set(
        rowContributors.map(
          (item) => `${item.source ?? ""}:${item.productId ?? item.productName}`
        )
      ).size >= 2 ||
        (row.currentAmount > 0 && row.deliveredAmount > 0));

    if (overlap) {
      const harmful =
        input.state.medicationCodes.length > 0 ||
        input.state.conditionCodes.length > 0 ||
        (row.upperLimitAmount != null && row.totalExposureAmount > row.upperLimitAmount);
      items.push(guidance({
        action: harmful ? "acknowledge" : "review",
        code: "duplicate_or_overlap",
        contributors: rowContributors,
        exposure: row.totalExposureAmount,
        locale: input.locale,
        nutrientName: row.name,
        overflow: Math.max(0, row.deliveredAmount - row.requestedAmount),
        productIds: [
          ...new Set(
            rowContributors
              .map((item) => item.productId)
              .filter((id): id is string => Boolean(id))
          )
        ],
        remainingGap: row.remainingGap,
        requested: row.requestedAmount,
        severity: harmful ? "high" : "info",
        sourceScope: rowScope,
        supplementIds: [row.supplementId],
        threshold: row.upperLimitAmount,
        unit: row.unit
      }));
    }
  }

  for (const reference of input.selected?.doseFit?.perLimit ?? []) {
    const maximum = reference.exposureMaximum ?? reference.exposure;
    if (maximum < reference.limit) continue;
    const row = coverageRows.find(item => item.supplementId === reference.subjectId);
    const contributors = row ? exposureContributors(row)
      .filter(item => reference.sourceScope === "total" || item.source !== "diet")
      .map(item => ({ ...item, amount: roundDose(fromComparable(doseComparable(item.amount, item.unit, reference.name), reference.unit, reference.name)), unit: reference.unit })) : [];
    const ruleId = reference.ruleId ?? `ul:${reference.subjectId}:${reference.sourceScope}`;
    const uncertainty = reference.certainty === "known" ? undefined : agenticMessage(input.locale, "guidance.estimated_limit_uncertainty", { amount: maximum, unit: reference.unit });
    const existing = items.findIndex(item => item.code === "dose_review_required" && item.supplementIds.includes(reference.subjectId) && item.sourceScope === reference.sourceScope);
    const advice = { ...guidance({ action: "review", code: "dose_review_required", comparator: maximum > reference.limit ? "gt" : "gte", contributors, exposure: maximum, locale: input.locale, nutrientName: reference.name, productIds: contributors.flatMap(item => item.productId ? [item.productId] : []), requested: row?.requestedAmount ?? null, severity: "high", sourceScope: reference.sourceScope, supplementIds: [reference.subjectId], threshold: reference.limit, unit: reference.unit, ruleId, authorityUrl: reference.authorityUrl, ...(reference.authorityUrl ? { evidence: [reference.authorityUrl] } : {}) }), ...(uncertainty ? { uncertainty, uncertaintyCodes: [reference.certainty + "_intake", "upper_endpoint_of_estimate"] } : {}) };
    if (existing >= 0) items[existing] = advice; else items.push(advice);
  }

  for (const reference of input.selected?.doseFit?.perContinuedDose ?? []) {
    if (reference.over <= 0) continue;
    const contributors: CoverageContributor[] = [
      ...input.state.currentSupplements.filter(item => item.supplementId === reference.subjectId).map(item => ({ amount: roundDose(fromComparable(doseComparable(item.dailyAmount, item.unit, reference.name), reference.unit, reference.name)), productId: item.productId, productName: item.name, unit: reference.unit, source: "current" as const })),
      ...(input.state.intake ?? []).flatMap(item => item.source === "current_supplement" && item.supplementId === reference.subjectId && item.certainty !== "unknown" && item.amount != null && item.unit ? [{ amount: roundDose(fromComparable(doseComparable(item.amount, item.unit, reference.name), reference.unit, reference.name)), productId: item.productId, productName: item.name ?? reference.name, unit: reference.unit, source: "current" as const }] : []),
      ...(input.selected?.basket ?? []).flatMap(item => [...(item.requestedNutrients ?? []), ...item.incidentalNutrients].filter(nutrient => nutrientNameMatchesTarget(reference.name, nutrient.name)).map(nutrient => ({ amount: roundDose(fromComparable(doseComparable(nutrient.amount, nutrient.unit, reference.name), reference.unit, reference.name)), productId: item.productId, productName: item.productName, unit: reference.unit, source: "selected" as const })))
    ];
    items.push({ ...guidance({ action: "review", code: "continued_dose_increased", comparator: "gt", contributors, exposure: reference.exposure, locale: input.locale, nutrientName: reference.name, productIds: contributors.flatMap(item => item.productId ? [item.productId] : []), severity: "info", sourceScope: "supplemental", supplementIds: [reference.subjectId], threshold: reference.referenceDose, unit: reference.unit, ruleId: `continued_dose:${reference.subjectId}` }), referenceBasis: "continued_dose", uncertainty: agenticMessage(input.locale, "guidance.continued_dose_uncertainty"), uncertaintyCodes: ["continued_dose_is_not_medical_limit", ...(reference.certainty === "known" ? [] : [reference.certainty + "_intake"])] });
  }

  const incidentalTotals = new Map<string, { amount: number; name: string; unit: string }>();

  for (const item of input.selected?.basket ?? []) {
    for (const nutrient of item.incidentalNutrients ?? []) {
      const key = nutrient.name.trim().toLowerCase();

      if (!key) {
        continue;
      }

      const previous = incidentalTotals.get(key);
      incidentalTotals.set(key, {
        amount: (previous?.amount ?? 0) + nutrient.amount,
        name: nutrient.name,
        unit: nutrient.unit
      });
    }
  }

  for (const nutrient of incidentalTotals.values()) {
    const covered = coverageRows.some(
      (row) => row.name.trim().toLowerCase() === nutrient.name.trim().toLowerCase()
    );

    if (covered) {
      continue;
    }

    const limit = upperLimitAmount(nutrient.name, nutrient.unit, {
      ceilings: populationCeilings,
      conditionCodes: input.state.conditionCodes,
      profile: input.state.profile,
      subjectId: nutrient.name,
      sourceScope: activeReferenceScope(nutrient.name, nutrient.name, input.state)
    });

    const referenceRule = catalogRule(nutrient.name, nutrient.name, input.state,
      `ul:incidental:${nutrient.name}`, input.state.conditionCodes);
    if (items.some(item => item.code === "dose_review_required" && item.ruleId === referenceRule.ruleId)) continue;

    if (amountExceedsCeiling(nutrient.amount, limit)) {
      const incidentalRows = (input.selected?.basket ?? []).flatMap((item) =>
        (item.incidentalNutrients ?? [])
          .filter(
            (fact) =>
              fact.name.trim().toLowerCase() === nutrient.name.trim().toLowerCase()
          )
          .map((fact) => ({
            amount: fact.amount,
            productId: item.productId,
            productName: item.productName,
            source: "selected" as const,
            unit: fact.unit
          }))
      );
      const incidentalProductIds = [
        ...new Set(incidentalRows.map((item) => item.productId))
      ];
      items.push(guidance({
        action: "block",
        code: "dose_review_required",
        contributors: incidentalRows,
        exposure: nutrient.amount,
        locale: input.locale,
        nutrientName: nutrient.name,
        productIds: incidentalProductIds.length > 0 ? incidentalProductIds : productIds,
        requested: 0,
        severity: "blocking",
        sourceScope: "supplemental",
        supplementIds: [],
        threshold: limit,
        unit: nutrient.unit,
        ...referenceRule
      }));
    }
  }

  if (input.state.profile.lifeStage === "child") {
    const pediatricIds = [zincCoverage?.supplementId, ironCoverage?.supplementId]
      .filter((item): item is string => Boolean(item));

    if (pediatricIds.length > 0) {
      items.push(guidance({
        action: "block",
        code: "pediatric_review_required",
        locale: input.locale,
        productIds,
        severity: "blocking",
        supplementIds: pediatricIds
      }));
    }
  }

  const original = input.state.originalRequest;
  const undisclosedContext = Boolean(original && (original.medicationCodes === undefined || original.conditionCodes === undefined)) || input.state.targets.some(item => intakeCertaintyFor(input.state, item.supplementId) !== "known") || coverageRows.some(item => intakeCertaintyFor(input.state, item.supplementId) !== "known");
  if (undisclosedContext || (input.state.profileKnown && Object.values(input.state.profileKnown).some(known => !known)) || (input.state.intake ?? []).some(item => item.certainty !== "known") || input.state.medicationCodes.some(code => !MEDICATION_ALIASES[code]) || input.state.conditionCodes.some(code => !CONDITION_ALIASES[code])) {
    items.push({ ...guidance({ action: "review", code: "incomplete_information", locale: input.locale, productIds, severity: "high", supplementIds: [] }), uncertainty: agenticMessage(input.locale, "guidance.incomplete_information_uncertainty"), uncertaintyCodes: [
      ...(original?.medicationCodes === undefined ? ["medication_context_unknown"] : []),
      ...(original?.conditionCodes === undefined ? ["condition_context_unknown"] : []),
      ...Object.entries(input.state.profileKnown ?? {}).filter(([, known]) => !known).map(([field]) => `profile_unknown:${field}`),
      ...[...new Set([...input.state.targets.map(item => item.supplementId), ...coverageRows.map(item => item.supplementId)])].filter(id => intakeCertaintyFor(input.state, id) !== "known").map(id => `intake_${intakeCertaintyFor(input.state, id)}:${id}`),
      ...input.state.medicationCodes.filter(code => !MEDICATION_ALIASES[code]).map(code => `medication_unassessed:${code}`),
      ...input.state.conditionCodes.filter(code => !CONDITION_ALIASES[code]).map(code => `condition_unassessed:${code}`)
    ].sort() });
  }
  return items.map(item => {
    const reference = matcherSafetyCeilings().find(ceiling => ceiling.bandId && ceiling.bandId === item.ruleId);
    if (!reference?.referenceConfidence) return item;
    const unverified = reference.referenceConfidence !== "high";
    return { ...item, referenceConfidence: reference.referenceConfidence,
      ...(reference.basisRationale ? { basisRationale: reference.basisRationale } : {}),
      ...(unverified ? {
        uncertainty: [item.uncertainty, agenticMessage(input.locale, "guidance.reference_unverified_uncertainty")].filter(Boolean).join(" "),
        uncertaintyCodes: [...new Set([...(item.uncertaintyCodes ?? []), "reference_unverified"])]
      } : {}) };
  });
}

export function safetyQuestions(input: Readonly<{
  alternatives?: readonly StackOption[];
  guidance: readonly SafetyGuidance[];
  locale: Locale;
  selected: StackOption | null;
  shownRevision: number;
  state: CanonicalPlanState;
  unmetRequirements?: readonly string[];
}>): PlanQuestion[] {
  const questions: PlanQuestion[] = [];
  for (const target of input.state.targets) {
    if (target.importance !== "conditional" || target.prerequisite?.status !== "unknown") continue;
    questions.push({
      questionId: `q_prerequisite_${target.supplementId}`,
      prompt: agenticMessage(input.locale, "plan.question.unknown_prerequisite", { name: target.name }),
      promptKey: "plan.question.unknown_prerequisite",
      choices: [
        { choice: `satisfy_prerequisite:${target.supplementId}`, effect: "prerequisite.status=satisfied", label: agenticMessage(input.locale, "plan.question.satisfy_prerequisite"), labelKey: "plan.question.satisfy_prerequisite" },
        { choice: `leave_prerequisite:${target.supplementId}`, effect: "prerequisite.status=unsatisfied", label: agenticMessage(input.locale, "plan.question.leave_prerequisite"), labelKey: "plan.question.leave_prerequisite" }
      ]
    });
  }
  const unmet = input.unmetRequirements ?? [];

  for (const item of unmet) {
    if (!item.startsWith("retainProductIds:")) {
      continue;
    }

    const productId = item.slice("retainProductIds:".length);
    questions.push({
      choices: [
        {
          choice: `drop_retain:${productId}`,
          effect: `requirements.retainProductIds-=${productId}`,
          label: agenticMessage(input.locale, "plan.question.drop_retain"),
          labelKey: "plan.question.drop_retain"
        }
      ],
      prompt: agenticMessage(input.locale, "plan.question.drop_retain"),
      promptKey: "plan.question.drop_retain",
      questionId: `q_retain_${productId}`
    });
  }


  return questions;
}

export function planStatus(input: Readonly<{
  guidance: readonly SafetyGuidance[];
  horizon?: Readonly<{
    nextReplenishmentDay?: number | null;
    orders: readonly Readonly<{ type: string; day: number }>[];
    purchaseRequiredNow: boolean;
    reasonCode?: string | null;
  }> | null;
  questions: readonly PlanQuestion[];
  selected: StackOption | null;
  state: CanonicalPlanState;
  unmetRequirements: readonly string[];
}>): "blocked" | "needs_input" | "no_purchase" | "ready" {
  void input.unmetRequirements;

  if (input.questions.length > 0) {
    return "needs_input";
  }

  const coverage = input.selected?.coverage ?? [];
  const unknownPrerequisite = input.state.targets.some(
    (target) =>
      target.importance === "conditional" &&
      target.prerequisite?.status === "unknown"
  );
  const unsatisfiedPrerequisite = input.state.targets.some(
    (target) =>
      target.importance === "conditional" &&
      target.prerequisite?.status === "unsatisfied"
  );
  const coreOrRequired = coverage.filter((row) => {
    const target = input.state.targets.find((item) => item.supplementId === row.supplementId);
    return target?.importance === "core" || target?.importance === "required" || !target?.importance;
  });
  const coreUnresolved = coreOrRequired.some(
    (row) =>
      row.status === "uncovered" ||
      row.status === "gap" ||
      row.status === "partial"
  );
  const basketEmpty = !input.selected || input.selected.basket.length === 0;

  if (basketEmpty) {
    if (unknownPrerequisite && !coreUnresolved) {
      return "needs_input";
    }

    if (unsatisfiedPrerequisite && !coreUnresolved) {
      return "no_purchase";
    }

    if (!coreUnresolved) {
      const replenishDay = input.horizon?.nextReplenishmentDay;
      const replenishesLater = Boolean(
        input.horizon &&
          !input.horizon.purchaseRequiredNow &&
          ((typeof replenishDay === "number" && replenishDay > 0 && replenishDay < 90) ||
            input.horizon.orders.some(
              (item) => item.type === "replenishment" && item.day > 0 && item.day < 90
            ))
      );
      return replenishesLater ? "ready" : "no_purchase";
    }

    return "no_purchase";
  }

  return "ready";
}

export function leftoverGapId(item: Readonly<{ name: string; supplementId?: string }>) {
  return item.supplementId || `leftover:${item.name}`;
}
