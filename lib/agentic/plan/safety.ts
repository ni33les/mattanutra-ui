import { GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { agenticMessage } from "@/lib/agentic/i18n";
import type { Locale } from "@/lib/i18n";
import type {
  CanonicalPlanState,
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
  threshold?: number | null;
}>): SafetyGuidance {
  const messageKey = `guidance.${input.code}`;

  return {
    action: input.action,
    code: input.code,
    exposure: input.exposure ?? null,
    guidanceId: `gdn_${input.code}`,
    message: agenticMessage(input.locale, messageKey),
    messageKey,
    productIds: input.productIds,
    rulesVersion: GUIDANCE_RULES_VERSION,
    severity: input.severity,
    supplementIds: input.supplementIds,
    threshold: input.threshold ?? null
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
  const zincCoverage = input.selected?.coverage.find((row) => /zinc/i.test(row.name));
  const ironCoverage = input.selected?.coverage.find((row) => /iron/i.test(row.name));

  if (
    input.state.medicationCodes.includes("apixaban") &&
    omegaIds.length > 0
  ) {
    items.push(guidance({
      action: "acknowledge",
      code: "medication_interaction",
      locale: input.locale,
      productIds,
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

  if (zincCoverage && zincCoverage.totalExposureAmount > 40_000) {
    items.push(guidance({
      action: "acknowledge",
      code: "dose_review_required",
      exposure: zincCoverage.totalExposureAmount,
      locale: input.locale,
      productIds,
      severity: "high",
      supplementIds: [zincCoverage.supplementId],
      threshold: 40_000
    }));
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
  guidance: readonly SafetyGuidance[];
  locale: Locale;
  selected: StackOption | null;
  state: CanonicalPlanState;
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
      row.status === "uncovered" &&
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
    const same =
      bound &&
      bound.guidanceIds.slice().sort().join() ===
        ackable.map((item) => item.guidanceId).sort().join();

    if (!same) {
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

  return questions;
}

export function planStatus(input: Readonly<{
  guidance: readonly SafetyGuidance[];
  questions: readonly PlanQuestion[];
  selected: StackOption | null;
  state: CanonicalPlanState;
  unmetRequirements: readonly string[];
}>): "blocked" | "needs_input" | "ready" {
  if (!input.selected || input.selected.coveragePercent === 0) {
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

  const uncovered = input.selected.coverage.filter((row) => row.status === "uncovered");

  if (
    uncovered.some(
      (row) => !input.state.acceptedGaps.some((gap) => gap.supplementId === row.supplementId)
    )
  ) {
    return "needs_input";
  }

  return "ready";
}
