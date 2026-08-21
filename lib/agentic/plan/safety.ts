import { GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { agenticMessage } from "@/lib/agentic/i18n";
import type { Locale } from "@/lib/i18n";
import { upperLimitAmount } from "@/lib/agentic/plan/limits";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import { doseComparable, fromComparable, roundDose } from "@/lib/agentic/plan/units";
import type {
  CanonicalPlanState,
  CoverageRow,
  PlanQuestion,
  SafetyGuidance,
  StackOption
} from "@/lib/agentic/plan/types";

function guidance(input: Readonly<{
  action: SafetyGuidance["action"];
  code: SafetyGuidance["code"];
  locale: Locale;
  productIds: readonly string[];
  severity: SafetyGuidance["severity"];
  supplementIds: readonly string[];
  exposure?: number | null;
  requested?: number | null;
  threshold?: number | null;
}>): SafetyGuidance {
  const messageKey = `guidance.${input.code}`;
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
  const guidanceId = ["gdn", input.code, family].join(":");

  return {
    action: input.action,
    code: input.code,
    exposure: input.exposure ?? null,
    guidanceId,
    message: agenticMessage(input.locale, messageKey),
    messageKey,
    productIds: input.productIds,
    rulesVersion: GUIDANCE_RULES_VERSION,
    severity: input.severity,
    supplementIds: input.supplementIds,
    threshold: input.threshold ?? null
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
  const zincCoverage = zincExposure(input.selected, input.state);
  const ironCoverage = input.selected?.coverage.find((row) => /iron/i.test(row.name));
  const coverageRows = input.selected?.coverage ?? (zincCoverage ? [zincCoverage] : []);

  const omegaCoverage = input.selected?.coverage.find((row) => /omega/i.test(row.name));

  if (
    input.state.medicationCodes.includes("apixaban") &&
    omegaIds.length > 0
  ) {
    items.push(guidance({
      action: "acknowledge",
      code: "medication_interaction",
      exposure: omegaCoverage?.totalExposureAmount ?? null,
      locale: input.locale,
      productIds,
      requested: omegaCoverage?.requestedAmount ?? null,
      severity: "high",
      supplementIds: omegaIds
    }));
  }

  if (input.state.conditionCodes.includes("ckd") && magnesiumIds.length > 0) {
    items.push(guidance({
      action: "block",
      code: "condition_review_required",
      locale: input.locale,
      productIds,
      severity: "blocking",
      supplementIds: magnesiumIds
    }));
  }

  for (const row of coverageRows) {
    const limit = upperLimitAmount(row.name, row.unit, {
      ceilings: matcherSafetyCeilings(),
      subjectId: row.supplementId
    });

    if (limit != null && row.totalExposureAmount >= limit) {
      items.push(guidance({
        action: "acknowledge",
        code: "dose_review_required",
        exposure: row.totalExposureAmount,
        locale: input.locale,
        productIds,
        requested: row.requestedAmount,
        severity: "high",
        supplementIds: [row.supplementId],
        threshold: limit
      }));
    }

    if (row.currentAmount > 0 && row.deliveredAmount > 0) {
      items.push(guidance({
        action: "acknowledge",
        code: "duplicate_or_overlap",
        exposure: row.totalExposureAmount,
        locale: input.locale,
        productIds,
        requested: row.requestedAmount,
        severity: "high",
        supplementIds: [row.supplementId]
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
          label: agenticMessage(input.locale, "plan.question.algae_only")
        },
        {
          choice: "relax_plant_based",
          effect: "requirements.dietaryPreference=any",
          label: agenticMessage(input.locale, "plan.question.relax_plant_based")
        }
      ],
      prompt: agenticMessage(input.locale, "plan.question.algae_only"),
      promptKey: "plan.question.algae_only",
      questionId: "q_omega3_source"
    });
  }

  for (const row of input.selected?.coverage ?? []) {
    if (
      row.status !== "covered" &&
      row.status !== "over_target" &&
      !input.state.acceptedGaps.some((gap) => gap.supplementId === row.supplementId)
    ) {
      questions.push({
        choices: [
          {
            choice: `accept_gap:${row.supplementId}`,
            effect: `acceptedGap=${row.supplementId}`,
            label: agenticMessage(input.locale, "plan.question.accept_gap")
          },
          {
            choice: `remove_target:${row.supplementId}`,
            effect: `remove target ${row.supplementId}`,
            label: agenticMessage(input.locale, "plan.question.remove_target")
          }
        ],
        prompt: agenticMessage(input.locale, "plan.question.accept_gap"),
        promptKey: "plan.question.accept_gap",
        questionId: `q_gap_${row.supplementId}`
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
            label: agenticMessage(input.locale, "plan.question.safety_review")
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
        label: agenticMessage(input.locale, "plan.question.relax_max_price")
      }
    ];

    for (const option of alternatives) {
      if (option.totalPriceMinor <= cap) {
        choices.push({
          choice: `select_option:${option.optionId}`,
          effect: `selectOptionId=${option.optionId}`,
          label: agenticMessage(input.locale, "plan.question.select_option")
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
        label: agenticMessage(input.locale, "plan.question.relax_max_pills")
      }
    ];

    for (const option of alternatives) {
      if (option.dailyPills <= cap) {
        choices.push({
          choice: `select_option:${option.optionId}`,
          effect: `selectOptionId=${option.optionId}`,
          label: agenticMessage(input.locale, "plan.question.select_option")
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
          label: agenticMessage(input.locale, "plan.question.drop_retain")
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
  if (
    !input.selected ||
    input.selected.basket.length === 0 ||
    input.selected.coverage.every((row) => row.status === "uncovered")
  ) {
    return "blocked";
  }

  if (input.guidance.some((item) => item.action === "block")) {
    return "blocked";
  }

  if (input.unmetRequirements.length > 0) {
    return "needs_input";
  }

  if (input.questions.length > 0) {
    return "needs_input";
  }

  const gaps = input.selected.coverage.filter(
    (row) => row.status !== "covered" && row.status !== "over_target"
  );

  if (
    gaps.some(
      (row) => !input.state.acceptedGaps.some((gap) => gap.supplementId === row.supplementId)
    )
  ) {
    return "needs_input";
  }

  return "ready";
}
