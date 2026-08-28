import { GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { agenticMessage } from "@/lib/agentic/i18n";
import type { Locale } from "@/lib/i18n";
import { upperLimitAmount } from "@/lib/agentic/plan/limits";
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
  PlanQuestion,
  SafetyGuidance,
  StackOption
} from "@/lib/agentic/plan/types";
import {
  CONDITION_ALIASES,
  MEDICATION_ALIASES
} from "@/lib/agentic/catalogue/names";

function catalogRule(
  name: string,
  subjectId: string,
  profile: CanonicalPlanState["profile"],
  fallbackRuleId: string
) {
  const ceiling = safetyCeilingFor(matcherSafetyCeilings(), {
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

function exposureContributors(row: CoverageRow): CoverageContributor[] {
  return [
    ...currentContributors(row),
    ...(row.contributors ?? []).map((item) => ({
      ...item,
      source: item.source ?? ("selected" as const)
    }))
  ];
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
  const messageKey = informationalOverlap
    ? "guidance.informational_overlap"
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
  const guidanceId = ["gdn", input.code, family, factSlug || "fact"].join(":");
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
    input.code === "condition_review_required"
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
): Pick<
  CoverageRow,
  | "currentAmount"
  | "deliveredAmount"
  | "name"
  | "requestedAmount"
  | "supplementId"
  | "totalExposureAmount"
  | "unit"
> | null {
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
    currentAmount,
    deliveredAmount: 0,
    name: "Zinc",
    requestedAmount: 0,
    supplementId: first.supplementId,
    totalExposureAmount: currentAmount,
    unit
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
  const magnesiumIds = input.state.targets
    .filter((item) => /magnesium/i.test(item.name))
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

  if (input.state.conditionCodes.includes("ckd") && magnesiumIds.length > 0) {
    const magnesiumCoverage =
      input.selected?.coverage.find((row) => /magnesium/i.test(row.name)) ??
      coverageFromPlan.find((row) => /magnesium/i.test(row.name));
    items.push(guidance({
      action: "block",
      code: "condition_review_required",
      contributors: magnesiumCoverage
        ? exposureContributors(magnesiumCoverage)
        : [],
      exposure: magnesiumCoverage?.totalExposureAmount ?? null,
      locale: input.locale,
      nutrientName: magnesiumCoverage?.name ?? "Magnesium",
      productIds,
      requested: magnesiumCoverage?.requestedAmount ?? null,
      severity: "blocking",
      sourceScope: "supplemental",
      supplementIds: magnesiumIds,
      unit: magnesiumCoverage?.unit ?? "mg",
      ...catalogRule(
        "Magnesium",
        magnesiumIds[0] ?? "Magnesium",
        input.state.profile,
        "magnesium+ckd"
      )
    }));
  }

  for (const target of input.state.targets) {
    if (coverageRows.some((row) => row.supplementId === target.supplementId)) {
      continue;
    }

    const limit = upperLimitAmount(target.name, target.unit, {
      ceilings: matcherSafetyCeilings(),
      profile: input.state.profile,
      subjectId: target.supplementId
    });

    if (limit != null && Number.isFinite(limit) && limit > 0 && target.amount > limit) {
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
          `ul:${target.supplementId}`
        )
      }));
    }
  }

  for (const row of coverageRows) {
    const limit = upperLimitAmount(row.name, row.unit, {
      ceilings: matcherSafetyCeilings(),
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
          `ul:missing:${row.supplementId}`
        )
      }));
    } else if (
      limit == null &&
      "coveragePercent" in row &&
      row.coveragePercent > 125
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
        threshold: null,
        unit: row.unit,
        ...catalogRule(
          row.name,
          row.supplementId,
          input.state.profile,
          `ul:missing:${row.supplementId}`
        )
      }));
    } else if (
      limit != null &&
      Number.isFinite(limit) &&
      limit > 0 &&
      row.requestedAmount > limit
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
          `ul:${row.supplementId}`
        )
      }));
    } else if (limit != null && Number.isFinite(limit) && limit > 0 && row.totalExposureAmount > limit) {
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
          `ul:${row.supplementId}`
        )
      }));
    } else if (limit != null && Number.isFinite(limit) && limit > 0 && row.totalExposureAmount >= limit) {
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
          `ul:${row.supplementId}`
        )
      }));
    }

    const overlap =
      rowContributors.length >= 2 ||
      (row.currentAmount > 0 && row.deliveredAmount > 0);

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
      profile: input.state.profile,
      subjectId: nutrient.name
    });

    if (
      limit != null &&
      Number.isFinite(limit) &&
      limit > 0 &&
      nutrient.amount > limit
    ) {
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
          `ul:incidental:${nutrient.name}`
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

  for (const row of input.selected?.coverage ?? []) {
    if (blockingDose && row.status === "upper_limit_risk") {
      continue;
    }

    if (
      row.remainingGap > 0 &&
      row.status !== "covered" &&
      row.status !== "partial" &&
      !(row.status === "upper_limit_risk" && row.remainingGap === 0) &&
      !input.state.acceptedGaps.some((gap) => gap.supplementId === row.supplementId)
    ) {
      questions.push({
        choices: [
          {
            choice: `accept_gap:${row.supplementId}`,
            effect: `acceptedGap=${row.supplementId}`,
            label: agenticMessage(input.locale, "plan.question.accept_gap"),
            labelKey: "plan.question.accept_gap"
          },
          {
            choice: `remove_target:${row.supplementId}`,
            effect: `remove target ${row.supplementId}`,
            label: agenticMessage(input.locale, "plan.question.remove_target"),
            labelKey: "plan.question.remove_target"
          }
        ],
        prompt: agenticMessage(input.locale, "plan.question.accept_gap"),
        promptKey: "plan.question.accept_gap",
        questionId: `q_gap_${row.supplementId}`
      });
    }
  }

  for (const leftover of input.state.leftovers) {
    if (
      leftover.reason !== "not_in_catalogue" &&
      leftover.reason !== "uncovered"
    ) {
      continue;
    }

    if (leftover.severity !== "high" && leftover.severity !== "medium") {
      continue;
    }

    const gapId = leftoverGapId(leftover);

    if (input.state.acceptedGaps.some((gap) => gap.supplementId === gapId)) {
      continue;
    }

    questions.push({
      choices: [
        {
          choice: `accept_gap:${gapId}`,
          effect: `acceptedGap=${gapId}`,
          label: agenticMessage(input.locale, "plan.question.accept_gap"),
          labelKey: "plan.question.accept_gap"
        }
      ],
      prompt: agenticMessage(input.locale, "plan.question.accept_gap"),
      promptKey: "plan.question.accept_gap",
      questionId: `q_gap_${gapId}`
    });
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

  return questions;
}

export function planStatus(input: Readonly<{
  guidance: readonly SafetyGuidance[];
  questions: readonly PlanQuestion[];
  selected: StackOption | null;
  state: CanonicalPlanState;
  unmetRequirements: readonly string[];
}>): "blocked" | "needs_input" | "ready" {
  if (input.guidance.some((item) => item.action === "block")) {
    return "blocked";
  }

  if (input.unmetRequirements.length > 0) {
    return "needs_input";
  }

  if (
    !input.selected ||
    input.selected.basket.length === 0 ||
    input.selected.coverage.every((row) => row.status === "uncovered")
  ) {
    return "blocked";
  }

  if (input.questions.length > 0) {
    return "needs_input";
  }

  if (
    input.selected.coverage.some(
      (row) =>
        row.upperLimitAmount != null &&
        row.totalExposureAmount > row.upperLimitAmount
    )
  ) {
    return "blocked";
  }

  const reviewAcked =
    input.state.safetyAcknowledgement?.confirmed === true &&
    input.guidance
      .filter((item) => item.action === "acknowledge")
      .every((item) =>
        Boolean(input.state.safetyAcknowledgement?.guidanceIds.includes(item.guidanceId))
      );

  if (
    !reviewAcked &&
    input.selected.coverage.some(
      (row) =>
        row.upperLimitAmount != null &&
        row.totalExposureAmount >= row.upperLimitAmount
    )
  ) {
    return "needs_input";
  }

  const gaps = input.selected.coverage.filter(
    (row) =>
      row.remainingGap > 0 &&
      row.status !== "covered" &&
      row.status !== "partial" &&
      !(reviewAcked && row.status === "upper_limit_risk" && row.remainingGap === 0)
  );

  if (
    gaps.some(
      (row) => !input.state.acceptedGaps.some((gap) => gap.supplementId === row.supplementId)
    )
  ) {
    return "needs_input";
  }

  const pendingLeftovers = input.state.leftovers.filter(
    (item) =>
      (item.reason === "not_in_catalogue" || item.reason === "uncovered") &&
      (item.severity === "high" || item.severity === "medium") &&
      !input.state.acceptedGaps.some(
        (gap) => gap.supplementId === leftoverGapId(item)
      )
  );

  if (pendingLeftovers.length > 0) {
    return "needs_input";
  }

  return "ready";
}

export function leftoverGapId(item: Readonly<{ name: string; supplementId?: string }>) {
  return item.supplementId || `leftover:${item.name}`;
}
