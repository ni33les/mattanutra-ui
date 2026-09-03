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
  GapReviewTarget,
  OptionSafety,
  PlanQuestion,
  SafetyGuidance,
  StackOption
} from "@/lib/agentic/plan/types";
import { publicAmount } from "@/lib/agentic/public-mapper";
import {
  CONDITION_ALIASES,
  MEDICATION_ALIASES
} from "@/lib/agentic/catalogue/names";

function catalogRule(
  name: string,
  subjectId: string,
  profile: CanonicalPlanState["profile"],
  fallbackRuleId: string,
  conditionCodes: readonly string[] = []
) {
  const ceiling = safetyCeilingFor(matcherSafetyCeilings(), {
    conditionCodes,
    name,
    profile,
    subjectId
  });
  return {
    ruleId: catalogBandRuleId(ceiling) ?? fallbackRuleId,
    rulesVersion: catalogBandRulesVersion(ceiling) ?? GUIDANCE_RULES_VERSION
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
    ...currentContributors(row),
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
    input.code === "duplicate_or_overlap"
      ? ["gdn", input.code, family, factSlug || "fact"].join(":")
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
        ? "stop and seek clinician review"
        : informationalOverlap
          ? "listed for awareness"
        : input.code === "medication_interaction"
          ? "listed as a safety fact"
          : "review before purchase";

  return {
    action: input.action,
    code: input.code,
    contributors: input.contributors ?? [],
    exposure: input.exposure ?? null,
    guidanceId,
    message: agenticMessage(input.locale, messageKey, {
      contributors: contributorLabel,
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
    severity: input.severity,
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
      ceilings: matcherSafetyCeilings(),
      conditionCodes: input.state.conditionCodes,
      profile: input.state.profile,
      subjectId: target.supplementId
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
          input.state.profile,
          `ul:${target.supplementId}`,
          input.state.conditionCodes
        )
      }));
    }
  }

  for (const leftover of input.state.leftovers) {
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
      ceilings: matcherSafetyCeilings(),
      conditionCodes: input.state.conditionCodes,
      profile: input.state.profile,
      subjectId
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
          input.state.profile,
          `ul:${subjectId}`,
          input.state.conditionCodes
        )
      }));
    }
  }

  for (const row of coverageRows) {
    const limit = upperLimitAmount(row.name, row.unit, {
      ceilings: matcherSafetyCeilings(),
      conditionCodes: input.state.conditionCodes,
      profile: input.state.profile,
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
        sourceScope: "supplemental",
        supplementIds: [row.supplementId],
        threshold: null,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state.profile,
          `ul:missing:${row.supplementId}`,
          input.state.conditionCodes
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
        sourceScope: "supplemental",
        supplementIds: [row.supplementId],
        threshold: null,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state.profile,
          `ul:missing:${row.supplementId}`,
          input.state.conditionCodes
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
        sourceScope: "supplemental",
        supplementIds: [row.supplementId],
        threshold: limit,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state.profile,
          `ul:${row.supplementId}`,
          input.state.conditionCodes
        )
      }));
    } else if (amountExceedsCeiling(row.totalExposureAmount, limit)) {
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
        sourceScope: "supplemental",
        supplementIds: [row.supplementId],
        threshold: limit,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state.profile,
          `ul:${row.supplementId}`,
          input.state.conditionCodes
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
        code: "dose_review_required",
        contributors: rowContributors,
        exposure: row.totalExposureAmount,
        locale: input.locale,
        nutrientName: row.name,
        productIds,
        requested: row.requestedAmount,
        severity: "high",
        sourceScope: "supplemental",
        supplementIds: [row.supplementId],
        threshold: limit,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state.profile,
          `ul:${row.supplementId}`,
          input.state.conditionCodes
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
        sourceScope: "supplemental",
        supplementIds: [row.supplementId],
        threshold: row.upperLimitAmount,
        unit: row.unit
      }));
    }
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
      ceilings: matcherSafetyCeilings(),
      conditionCodes: input.state.conditionCodes,
      profile: input.state.profile,
      subjectId: nutrient.name
    });

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
        ...catalogRule(
          nutrient.name,
          nutrient.name,
          input.state.profile,
          `ul:incidental:${nutrient.name}`,
          input.state.conditionCodes
        )
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

  return items;
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
  const acknowledgedMeds = new Set(input.state.acknowledgedUnassessedMedicationCodes ?? []);
  const acknowledgedConditions = new Set(
    input.state.acknowledgedUnassessedConditionCodes ?? []
  );
  const unassessedMeds = input.state.medicationCodes.filter(
    (code) => !MEDICATION_ALIASES[code] && !acknowledgedMeds.has(code)
  );
  const unassessedConditions = input.state.conditionCodes.filter(
    (code) => !CONDITION_ALIASES[code] && !acknowledgedConditions.has(code)
  );

  const unknownConditionals = input.state.targets.filter(
    (target) =>
      target.importance === "conditional" && target.prerequisite?.status === "unknown"
  );

  for (const target of unknownConditionals) {
    questions.push({
      choices: [
        {
          choice: `satisfy_prerequisite:${target.supplementId}`,
          effect: `prerequisite.satisfied=${target.supplementId}`,
          label: agenticMessage(input.locale, "plan.question.satisfy_prerequisite"),
          labelKey: "plan.question.satisfy_prerequisite"
        },
        {
          choice: `leave_prerequisite:${target.supplementId}`,
          effect: `prerequisite.unsatisfied=${target.supplementId}`,
          label: agenticMessage(input.locale, "plan.question.leave_prerequisite"),
          labelKey: "plan.question.leave_prerequisite"
        }
      ],
      prompt: agenticMessage(input.locale, "plan.question.unknown_prerequisite", {
        name: target.name
      }),
      promptKey: "plan.question.unknown_prerequisite",
      questionId: `q_prerequisite_${target.supplementId}`
    });
  }

  if (unassessedMeds.length > 0 || unassessedConditions.length > 0) {
    questions.push({
      choices: [
        {
          choice: "acknowledge_unassessed",
          effect: "acknowledge_unassessed",
          label: agenticMessage(input.locale, "plan.question.acknowledge_unassessed"),
          labelKey: "plan.question.acknowledge_unassessed"
        }
      ],
      prompt: agenticMessage(input.locale, "plan.question.unassessed_medical_context"),
      promptKey: "plan.question.unassessed_medical_context",
      questionId: "q_unassessed_medical_context"
    });
  }

  const omegaTarget = input.state.targets.find((item) => /omega/i.test(item.name));

  if (
    input.state.requirements.dietaryPreference === "plant_based" &&
    omegaTarget &&
    input.state.requirements.omega3SourcePreference !== "algae_only"
  ) {
    questions.push({
      choices: [
        {
          choice: "allow_algae_only",
          effect: "requirements.omega3SourcePreference=algae_only",
          label: agenticMessage(input.locale, "plan.question.algae_only"),
          labelKey: "plan.question.algae_only"
        },
        {
          choice: "relax_plant_based",
          effect: "requirements.dietaryPreference=any",
          label: agenticMessage(input.locale, "plan.question.relax_plant_based"),
          labelKey: "plan.question.relax_plant_based"
        }
      ],
      prompt: agenticMessage(input.locale, "plan.question.algae_only"),
      promptKey: "plan.question.algae_only",
      questionId: "q_omega3_source"
    });
  }

  const blockingDose = input.guidance.some(
    (item) => item.code === "dose_review_required" && item.action === "block"
  );
  const review = unresolvedGapReview(input, blockingDose);
  const decisionItems = review.filter(
    (item) =>
      item.reason === "uncovered" ||
      item.reason === "unsupported_unit_conversion" ||
      item.reason === "not_in_catalogue"
  );
  const includeDose = decisionItems.length >= 2;
  const items = includeDose ? review : decisionItems;

  if (items.length >= 2) {
    const names = items.map((item) => item.name);
    questions.push({
      choices: items.flatMap((item) => {
        const id = item.supplementId || leftoverGapId(item);
        return [
          {
            choice: `accept_gap:${id}`,
            effect: `acceptedGap=${id}`,
            label: agenticMessage(input.locale, "plan.question.accept_gap_named", {
              name: item.name
            }),
            labelKey: "plan.question.accept_gap_named"
          },
          {
            choice: `remove_target:${id}`,
            effect: `remove target ${id}`,
            label: agenticMessage(input.locale, "plan.question.remove_target_named", {
              name: item.name
            }),
            labelKey: "plan.question.remove_target_named"
          }
        ];
      }),
      prompt: agenticMessage(input.locale, "plan.question.unresolved_targets", {
        names: names.join(", ")
      }),
      promptKey: "plan.question.unresolved_targets",
      questionId: "q_unresolved_targets",
      targets: items
    });
  } else {
    for (const item of items) {
      const gapId = item.supplementId || leftoverGapId(item);
      questions.push({
        choices: [
          {
            choice: `accept_gap:${gapId}`,
            effect: `acceptedGap=${gapId}`,
            label: agenticMessage(input.locale, "plan.question.accept_gap_named", {
              name: item.name
            }),
            labelKey: "plan.question.accept_gap_named"
          },
          {
            choice: `remove_target:${gapId}`,
            effect: `remove target ${gapId}`,
            label: agenticMessage(input.locale, "plan.question.remove_target_named", {
              name: item.name
            }),
            labelKey: "plan.question.remove_target_named"
          }
        ],
        prompt: agenticMessage(input.locale, "plan.question.accept_gap_named", {
          name: item.name
        }),
        promptKey: "plan.question.accept_gap_named",
        questionId: `q_gap_${gapId}`
      });
    }
  }

  const ackable = input.guidance.filter((item) => item.action === "acknowledge");

  if (ackable.length > 0) {
    const bound = input.state.safetyAcknowledgement;
    const covered =
      bound?.confirmed === true &&
      ackable.every((item) => bound.guidanceIds.includes(item.guidanceId));

    if (!covered) {
      questions.push({
        choices: [
          {
            choice: "acknowledge_safety",
            effect: "safetyAcknowledgement.confirmed=true",
            label: agenticMessage(input.locale, "plan.question.acknowledge_safety"),
            labelKey: "plan.question.acknowledge_safety"
          }
        ],
        prompt: agenticMessage(input.locale, "plan.question.safety_review"),
        promptKey: "plan.question.safety_review",
        questionId: "q_safety_ack"
      });
    }
  }

  const unmet = input.unmetRequirements ?? [];
  const alternatives = input.alternatives ?? [];

  if (unmet.includes("maxPriceMinor")) {
    const cap = input.state.requirements.maxPriceMinor ?? 0;
    const choices: PlanQuestion["choices"][number][] = [
      {
        choice: "relax_max_price",
        effect: "requirements.maxPriceMinor=",
        label: agenticMessage(input.locale, "plan.question.relax_max_price"),
        labelKey: "plan.question.relax_max_price"
      }
    ];

    for (const option of alternatives) {
      if (option.totalPriceMinor <= cap) {
        choices.push({
          choice: `select_option:${option.optionId}`,
          effect: `selectOptionId=${option.optionId}`,
          label: agenticMessage(input.locale, "plan.question.select_option"),
          labelKey: "plan.question.select_option"
        });
      }
    }

    questions.push({
      choices,
      prompt: agenticMessage(input.locale, "plan.question.relax_max_price"),
      promptKey: "plan.question.relax_max_price",
      questionId: "q_max_price"
    });
  }

  if (unmet.includes("maxDailyPills")) {
    const cap = input.state.requirements.maxDailyPills ?? 0;
    const choices: PlanQuestion["choices"][number][] = [
      {
        choice: "relax_max_pills",
        effect: "requirements.maxDailyPills=",
        label: agenticMessage(input.locale, "plan.question.relax_max_pills"),
        labelKey: "plan.question.relax_max_pills"
      }
    ];

    for (const option of alternatives) {
      if (option.dailyPills <= cap) {
        choices.push({
          choice: `select_option:${option.optionId}`,
          effect: `selectOptionId=${option.optionId}`,
          label: agenticMessage(input.locale, "plan.question.select_option"),
          labelKey: "plan.question.select_option"
        });
      }
    }

    questions.push({
      choices,
      prompt: agenticMessage(input.locale, "plan.question.relax_max_pills"),
      promptKey: "plan.question.relax_max_pills",
      questionId: "q_max_pills"
    });
  }

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

  const durationQuestions: PlanQuestion[] = [];
  for (const current of input.state.currentSupplements) {
    if (current.daysRemaining != null || current.durationUnknown) {
      continue;
    }
    const row = input.selected?.coverage.find((item) => item.supplementId === current.supplementId);
    const covers = row
      ? row.status === "already_covered" ||
        row.status === "over_target" ||
        (row.currentAmount >= row.requestedAmount && row.deliveredAmount <= 0)
      : input.state.targets.some(
          (target) =>
            target.supplementId === current.supplementId && current.dailyAmount >= target.amount
        );
    if (!covers) {
      continue;
    }
    durationQuestions.push({
      choices: [
        ...[7, 14, 30, 60, 90].map((days) => ({
          choice: `days:${days}`,
          effect: `currentSupplements.daysRemaining=${days}`,
          label: agenticMessage(input.locale, "plan.question.inventory_duration_days", { days }),
          labelKey: "plan.question.inventory_duration_days"
        })),
        {
          choice: "unknown",
          effect: "currentSupplements.durationUnknown=true",
          label: agenticMessage(input.locale, "plan.question.inventory_duration_unknown"),
          labelKey: "plan.question.inventory_duration_unknown"
        }
      ],
      prompt: agenticMessage(input.locale, "plan.question.inventory_duration", {
        name: current.name
      }),
      promptKey: "plan.question.inventory_duration",
      questionId: `q_inventory_duration_${current.supplementId}`
    });
  }

  return [...durationQuestions, ...questions];
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

  if (input.guidance.some((item) => item.action === "block")) {
    return "blocked";
  }

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

  if (
    input.selected?.coverage.some(
      (row) =>
        row.upperLimitAmount != null &&
        row.totalExposureAmount > row.upperLimitAmount &&
        row.status !== "conditional_deferred"
    )
  ) {
    return "blocked";
  }

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

    return "blocked";
  }

  return "ready";
}

export function leftoverGapId(item: Readonly<{ name: string; supplementId?: string }>) {
  return item.supplementId || `leftover:${item.name}`;
}

function unresolvedGapReview(
  input: Readonly<{
    selected: StackOption | null;
    state: CanonicalPlanState;
  }>,
  blockingDose: boolean
): GapReviewTarget[] {
  const accepted = new Set(input.state.acceptedGaps.map((item) => item.supplementId));
  const requestedIds = new Set(input.state.targets.map((item) => item.supplementId));
  const requestedNames = new Set(
    input.state.targets.map((item) => item.name.trim().toLowerCase())
  );
  const items: GapReviewTarget[] = [];
  const seen = new Set<string>();

  function push(row: GapReviewTarget) {
    const key = row.supplementId || row.name.trim().toLowerCase();
    if (!key || seen.has(key) || (row.supplementId && accepted.has(row.supplementId))) {
      return;
    }
    seen.add(key);
    items.push(row);
  }

  for (const leftover of input.state.leftovers) {
    const id = leftoverGapId(leftover);
    if (accepted.has(id)) {
      continue;
    }
    const stillRequested =
      leftover.reason === "not_in_catalogue" ||
      (leftover.supplementId != null && requestedIds.has(leftover.supplementId)) ||
      requestedNames.has(leftover.name.trim().toLowerCase());
    if (!stillRequested) {
      continue;
    }
    const coverage = input.selected?.coverage.find(
      (row) =>
        (leftover.supplementId && row.supplementId === leftover.supplementId) ||
        row.name.trim().toLowerCase() === leftover.name.trim().toLowerCase()
    );
    const requestedAmount = publicAmount(
      Number(coverage?.requestedAmount ?? leftover.amount ?? 0)
    );
    const deliveredAmount =
      leftover.reason === "dose_gap"
        ? publicAmount(Number(coverage?.deliveredAmount ?? 0))
        : 0;
    const remainingGap = publicAmount(Math.max(0, requestedAmount - deliveredAmount));
    if (remainingGap <= 0 || !leftover.unit) {
      continue;
    }
    if (
      coverage?.status === "optional_omitted" ||
      coverage?.status === "conditional_deferred" ||
      coverage?.status === "already_covered"
    ) {
      continue;
    }
    push({
      decisions: ["accept_gap", "remove_target"],
      deliveredAmount,
      name: leftover.name,
      reason: leftover.reason,
      remainingGap,
      requestedAmount,
      unit: leftover.unit,
      ...(leftover.supplementId ? { supplementId: leftover.supplementId } : {})
    });
  }

  for (const row of input.selected?.coverage ?? []) {
    if (blockingDose && row.status === "upper_limit_risk") {
      continue;
    }
    if (
      row.remainingGap <= 0 ||
      row.status === "covered" ||
      row.status === "partial" ||
      row.status === "optional_omitted" ||
      row.status === "conditional_deferred" ||
      row.status === "already_covered" ||
      accepted.has(row.supplementId) ||
      !requestedIds.has(row.supplementId)
    ) {
      continue;
    }
    push({
      decisions: ["accept_gap", "remove_target"],
      deliveredAmount: publicAmount(row.deliveredAmount),
      name: row.name,
      reason: "uncovered",
      remainingGap: publicAmount(row.remainingGap),
      requestedAmount: publicAmount(row.requestedAmount),
      supplementId: row.supplementId,
      unit: row.unit
    });
  }

  return items;
}

function leftoverRequiresDecision(
  item: Readonly<{ reason: string; severity: "high" | "low" | "medium" }>
) {
  return (
    (item.reason === "not_in_catalogue" ||
      item.reason === "uncovered" ||
      item.reason === "unsupported_unit_conversion") &&
    (item.severity === "high" || item.severity === "medium")
  );
}
