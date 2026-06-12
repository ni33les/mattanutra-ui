import { randomUUID } from "node:crypto";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import { toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import { getSql } from "@/lib/db";
import {
  doseExceedsLimit,
  parseDose,
  parseDoseLimit,
  type ParsedDose
} from "@/lib/dose-conversion";
import type { FormulationBlueprint, FormulationIngredient, LocalizedText } from "@/lib/formulation-types";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
import { productFactAliasKeys, productKeysMatch } from "@/lib/product-recommendations";
import { createTask, type TaskServiceDb } from "@/lib/task-service";

type SafetyAfterCommit = (effect: () => Promise<void>) => void;

type SafetyAudit = (event: {
  eventType: string;
  level?: "critical" | "high" | "low" | "medium";
  payload?: Record<string, unknown>;
}) => Promise<void>;

type SafetyInput = Readonly<{
  afterCommit?: SafetyAfterCommit;
  audit?: SafetyAudit;
  answers?: unknown;
  formulation: FormulationBlueprint;
  locale: Locale;
  plan: AssessmentPlan;
  planId: string;
  requestId?: string | null;
  taskId: string;
}>;

type SupplementRow = Readonly<{
  aliases: string[] | null;
  confidence: string | null;
  id: string;
  is_active: boolean;
  list_status: "active" | "blocked";
  max_amount: number | string | null;
  max_unit: string | null;
  name: string;
  normalized_name: string;
  safety_flags: string[] | null;
  safety_notes: string | null;
}>;

type MatchedSupplement = SupplementRow & {
  requestedName: string;
};

type ReviewKind =
  | "client_context_safety"
  | "dose_reduced"
  | "dose_unverified"
  | "unknown_supplement";

type ContextSafetyReview = Readonly<{
  reason: string;
  reviewType: "condition_stop" | "contraindication" | "medication_interaction" | "pregnancy_breastfeeding";
  ruleCode: string;
  severity: "high" | "medium";
}>;

type SupplementReviewWork = Readonly<{
  taskId: string;
}>;

function textFromLocalized(value: LocalizedText) {
  return resolveLocalizedText(value, "en");
}

function zhSafetyMessage(en: string) {
  if (en.startsWith("Dose reduced from ")) {
    return "剂量已降低，以保持在 MattaNutra 配置的安全上限内。";
  }

  if (en.includes("blocked") || en.includes("blacklisted")) {
    return "此补充剂未通过 MattaNutra 目录安全规则，因此不会显示为建议。";
  }

  if (en.includes("not confirmed") || en.includes("health or medication")) {
    return "此补充剂需要根据您披露的健康或用药情况进行团队安全审核。";
  }

  return "此补充剂需要经过团队安全审核后才能显示。";
}

function localized(en: string, th = en, zh = zhSafetyMessage(en)): LocalizedText {
  return { en, th, "zh-CN": zh };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function textFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "";
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().toLowerCase())
    : [];
}

function activeContextValue(value: string | null | undefined) {
  return Boolean(value && value !== "none" && value !== "normal" && value !== "no");
}

function reviewTypeForKind(kind: ReviewKind, contextReview?: ContextSafetyReview) {
  if (contextReview) {
    return contextReview.reviewType;
  }

  if (kind === "client_context_safety") {
    return "contraindication";
  }

  if (kind === "dose_unverified") {
    return "dose_limit";
  }

  return "ingredient_safety";
}

export function formulationSafetyContextReview(input: Readonly<{
  answers?: unknown;
  safetyFlags?: readonly string[] | null;
}>): ContextSafetyReview | null {
  const flags = new Set((input.safetyFlags ?? []).map((flag) => flag.toLowerCase()));
  const answers = isRecord(input.answers) ? input.answers : {};
  const reproductiveContext = [
    textFromRecord(answers, "reproStatus"),
    textFromRecord(answers, "menopause"),
    textFromRecord(answers, "flow")
  ].join(" ");
  const hasReproductiveCaution =
    reproductiveContext.includes("pregnan") ||
    reproductiveContext.includes("breastfeed") ||
    reproductiveContext.includes("ttc") ||
    reproductiveContext.includes("trying");
  const medicationAnswer = textFromRecord(answers, "meds");
  const medicationTypes =
    medicationAnswer === "yes" ? stringArrayFromRecord(answers, "medTypes") : [];
  const bloodThinner =
    medicationTypes.includes("blood-thinner") ||
    medicationTypes.includes("bloodthinner") ||
    medicationTypes.includes("anticoagulant") ||
    medicationTypes.includes("warfarin");
  const kidney = textFromRecord(answers, "kidney");
  const liver = textFromRecord(answers, "liver");

  if (
    hasReproductiveCaution &&
    (flags.has("pregnancy_caution") || flags.has("hormone_caution"))
  ) {
    return {
      reason:
        "This supplement needs review because the assessment indicates pregnancy, breastfeeding, or trying-to-conceive context.",
      reviewType: "pregnancy_breastfeeding",
      ruleCode: "client_reproductive_context",
      severity: "high"
    };
  }

  if (
    bloodThinner &&
    (flags.has("bleeding_risk") || flags.has("medication_interaction"))
  ) {
    return {
      reason:
        "This supplement needs review because the assessment includes blood-thinner medication context.",
      reviewType: "medication_interaction",
      ruleCode: "client_medication_context",
      severity: "high"
    };
  }

  if (activeContextValue(kidney) && flags.has("kidney_caution")) {
    return {
      reason:
        "This supplement needs review because the assessment includes kidney context.",
      reviewType: "condition_stop",
      ruleCode: "client_condition_context",
      severity: "medium"
    };
  }

  if (activeContextValue(liver) && flags.has("liver_caution")) {
    return {
      reason:
        "This supplement needs review because the assessment includes liver context.",
      reviewType: "condition_stop",
      ruleCode: "client_condition_context",
      severity: "medium"
    };
  }

  return null;
}

function numberOrNull(value: number | string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatDose(amount: number, unit: string | null) {
  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/\.?0+$/g, "");

  return `${formatted} ${unit || "per day"}`.trim();
}

function reviewTaskType(kind: ReviewKind) {
  if (kind === "unknown_supplement") {
    return "classify_supplement";
  }

  if (kind === "dose_reduced") {
    return "dose_reduction_notice";
  }

  return "review_supplement_for_plan";
}

function reviewTaskBusinessValue(kind: ReviewKind) {
  if (kind === "dose_unverified") {
    return 500;
  }

  if (kind === "client_context_safety") {
    return 550;
  }

  if (kind === "unknown_supplement") {
    return 400;
  }

  return 350;
}

async function loadSupplementLookup(sql: TaskServiceDb) {
  const rows = await sql<SupplementRow[]>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      case
        when supplements.is_active = false then 'blocked'
        else supplements.list_status
      end as list_status,
      supplements.is_active,
      limits.max_amount,
      limits.max_unit,
      limits.confidence,
      limits.safety_flags,
      limits.safety_notes,
      coalesce(
        array_remove(array_agg(distinct supplement_aliases.normalized_alias), null),
        '{}'::text[]
      ) as aliases
    from public.supplements supplements
    left join lateral (
      select *
      from public.supplement_safety_limits limits
      where limits.supplement_id = supplements.id
      order by limits.version desc
      limit 1
    ) limits on true
    left join public.supplement_aliases
      on supplement_aliases.supplement_id = supplements.id
    group by
      supplements.id,
      supplements.name,
      supplements.normalized_name,
      supplements.list_status,
      supplements.is_active,
      limits.max_amount,
      limits.max_unit,
      limits.confidence,
      limits.safety_flags,
      limits.safety_notes
  `;
  const lookup = new Map<string, SupplementRow>();

  rows.forEach((row) => {
    lookup.set(row.normalized_name, row);
    (row.aliases ?? []).forEach((alias) => lookup.set(alias, row));
  });

  return lookup;
}

function matchSupplement(
  lookup: Map<string, SupplementRow>,
  ingredient: FormulationIngredient
): MatchedSupplement | null {
  const requestedName = textFromLocalized(ingredient.supplement);
  const candidates = [
    ...productFactAliasKeys(requestedName),
    ...productFactAliasKeys(ingredient.id.replaceAll("-", "_")),
    normalizeName(requestedName),
    normalizeName(ingredient.id.replaceAll("-", "_"))
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = lookup.get(candidate);

    if (match) {
      return { ...match, requestedName };
    }
  }

  for (const [key, match] of lookup.entries()) {
    if (candidates.some((candidate) => productKeysMatch(candidate, key))) {
      return { ...match, requestedName };
    }
  }

  return null;
}

function withHiddenSafety(
  ingredient: FormulationIngredient,
  input: {
    action: "human_review" | "unknown_supplement";
    message: LocalizedText;
    reviewId?: string;
    reviewTaskId?: string;
  }
): FormulationIngredient {
  return {
    ...ingredient,
    safety: {
      action: input.action,
      message: input.message,
      reviewId: input.reviewId,
      reviewTaskId: input.reviewTaskId,
      visibility: "hidden"
    },
    status: "review"
  };
}

function withAutomatedSafetyStatus(
  ingredient: FormulationIngredient
): FormulationIngredient {
  if (ingredient.status !== "review" && !ingredient.safety) {
    return ingredient;
  }

  const safeIngredient = { ...ingredient };
  delete safeIngredient.safety;

  return {
    ...safeIngredient,
    status: ingredient.status === "review" ? "add" : ingredient.status
  };
}

function withReducedDose(
  ingredient: FormulationIngredient,
  dose: string,
  message: LocalizedText,
  reviewTaskId?: string
): FormulationIngredient {
  return {
    ...ingredient,
    dailyDose: localized(dose),
    safety: {
      action: "dose_reduced",
      message,
      originalDailyDose: ingredient.dailyDose,
      reviewTaskId,
      visibility: "visible"
    },
    status: ingredient.status === "review" ? "add" : ingredient.status
  };
}

async function enqueueSupplementReviewWork(input: {
  afterCommit?: SafetyAfterCommit;
  kind: ReviewKind;
  normalizedSupplementName: string;
  payload: Record<string, unknown>;
  planId: string | null;
  supplementName: string;
}): Promise<SupplementReviewWork> {
  const unknownSupplement = input.kind === "unknown_supplement";
  const globalUnknown = unknownSupplement && !input.planId;
  const businessValue = reviewTaskBusinessValue(input.kind);
  const groupLabel = unknownSupplement
    ? "Review supplement"
    : "Review plan";
  const taskTitle = `Review supplement ${input.supplementName}`;
  const idempotencyKey = `supplement-review:${input.kind}:${globalUnknown ? "global" : input.planId}:${input.normalizedSupplementName}`;
  const createReviewWork = async () => {
    const result = await createTask({
      actorType: "human",
      businessValue,
      context: {
        normalizedSupplementName: input.normalizedSupplementName,
        reviewKind: input.kind,
        source: "formulation_safety"
      },
      groupLabel,
      id: randomUUID(),
      idempotencyKey,
      idempotencyScopeKey: globalUnknown
        ? `supplement:${input.normalizedSupplementName}`
        : `supplement-safety:${input.planId}`,
      initialComment: {
        authorName: "MattaNutra safety",
        authorType: "system",
        body: `Safety review opened for ${input.supplementName}.`,
        commentType: "instruction",
        metadata: {
          reviewKind: input.kind
        },
        visibility: "admin"
      },
      maxAttempts: 1,
      payload: {
        normalizedSupplementName: input.normalizedSupplementName,
        reviewKind: input.kind,
        source: "formulation_safety",
        supplementName: input.supplementName,
        ...input.payload
      },
      planId: globalUnknown ? null : input.planId,
      reasoningEffort: "none",
      requiredCapabilities: ["supplement_review"],
      taskType: reviewTaskType(input.kind),
      title: taskTitle
    });

    return {
      taskId: result.task.id
    };
  };

  return createReviewWork();
}

async function attachSafetyReviewWork(
  sql: TaskServiceDb,
  input: {
    context?: Record<string, unknown>;
    reviewId: string;
    taskId?: string | null;
  }
) {
  try {
    await sql`
      update public.safety_reviews
      set
        task_id = coalesce(task_id, ${input.taskId ?? null}::uuid),
        safety_context = safety_context || ${sql.json(
          toJsonValue(input.context ?? {})
        )}::jsonb,
        updated_at = now()
      where id = ${input.reviewId}::uuid
    `;
  } catch (error) {
    console.warn("Unable to attach task reference to safety review", {
      error,
      reviewId: input.reviewId
    });
  }
}

async function attachSafetyReviewWorkAfterCommit(
  input: Parameters<typeof attachSafetyReviewWork>[1]
) {
  const sql = getSql();

  if (!sql) {
    return;
  }

  await attachSafetyReviewWork(sql, input);
}

async function createSafetyReview(
  sql: TaskServiceDb,
  input: {
    afterCommit?: SafetyAfterCommit;
    aiSuggestion: FormulationIngredient;
    context: Record<string, unknown>;
    dose?: ParsedDose | null;
    flagReason: string;
    limit?: ParsedDose | null;
    planId: string;
    reviewType: string;
    ruleCode: string;
    severity: "critical" | "high" | "low" | "medium";
    supplementName: string;
    taskId?: string | null;
  }
) {
  const existing = await sql<{ id: string }[]>`
    select id::text
    from public.safety_reviews
    where plan_id = ${input.planId}::uuid
      and lower(supplement_name) = lower(${input.supplementName})
      and rule_code = ${input.ruleCode}
      and status in ('open', 'in_review', 'escalated')
    order by opened_at asc
    limit 1
  `;

  if (existing[0]?.id) {
    const attachInput = {
      context: input.context,
      reviewId: existing[0].id,
      taskId: input.taskId
    };

    if (input.afterCommit) {
      input.afterCommit(() => attachSafetyReviewWorkAfterCommit(attachInput));
    } else {
      await attachSafetyReviewWork(sql, attachInput);
    }

    return existing[0].id;
  }

  const reviewId = randomUUID();
  await sql`
    insert into public.safety_reviews (
      id,
      plan_id,
      review_type,
      status,
      severity,
      supplement_name,
      suggested_dose_value,
      suggested_dose_unit,
      limit_value,
      limit_unit,
      rule_code,
      flag_reason,
      ai_suggestion,
      safety_context,
      opened_at,
      updated_at
    )
    values (
      ${reviewId}::uuid,
      ${input.planId}::uuid,
      ${input.reviewType},
      'open',
      ${input.severity},
      ${input.supplementName},
      ${input.dose?.amount ?? null},
      ${input.dose?.unit ?? null},
      ${input.limit?.amount ?? null},
      ${input.limit?.originalText ?? input.limit?.unit ?? null},
      ${input.ruleCode},
      ${input.flagReason},
      ${sql.json(toJsonValue(input.aiSuggestion))},
      ${sql.json(toJsonValue(input.context))},
      now(),
      now()
    )
  `;

  const attachInput = {
    context: input.context,
    reviewId,
    taskId: input.taskId
  };

  if (input.afterCommit) {
    input.afterCommit(() => attachSafetyReviewWorkAfterCommit(attachInput));
  } else {
    await attachSafetyReviewWork(sql, attachInput);
  }

  return reviewId;
}

async function audit(input: SafetyInput, event: Parameters<SafetyAudit>[0]) {
  await input.audit?.(event);
}

async function logSafetyBpm(
  input: SafetyInput,
  eventName: string,
  severity: "critical" | "high" | "low" | "medium",
  properties: Record<string, unknown>
) {
  const effect = async () => {
    await writeBpmEvent({
      actorType: "worker",
      eventName,
      eventType: "safety",
      exampleRequestId: input.requestId,
      locale: input.locale,
      planId: input.planId,
      properties: {
        taskId: input.taskId,
        ...properties
      },
      selectedPlan: input.plan,
      severity
    });
  };

  if (input.afterCommit) {
    input.afterCommit(effect);
    return;
  }

  await effect();
}

async function hideForReview(
  sql: TaskServiceDb,
  input: SafetyInput,
  ingredient: FormulationIngredient,
  match: MatchedSupplement | null,
  kind: ReviewKind,
  reason: string,
  severity: "critical" | "high" | "low" | "medium",
  dose: ParsedDose | null,
  limit: ParsedDose | null,
  contextReview?: ContextSafetyReview
) {
  const supplementName = match?.name ?? textFromLocalized(ingredient.supplement);
  const normalizedSupplementName = match?.normalized_name ?? normalizeName(supplementName);
  const reviewWork = await enqueueSupplementReviewWork({
    afterCommit: input.afterCommit,
    kind,
    normalizedSupplementName,
    payload: {
      actionOptions:
        kind === "unknown_supplement"
          ? ["add_active", "block", "ignore"]
          : ["accept", "revise", "block", "ignore"],
      confidence: match?.confidence,
      maxAmount: numberOrNull(match?.max_amount ?? null),
      maxUnit: match?.max_unit,
      requiredFields: ["status", "maxAmount", "maxUnit", "confidence"],
      source: "formulation_safety",
      supplementId: match?.id,
      supplementName
    },
    planId: input.planId,
    supplementName
  });
  const reviewId = await createSafetyReview(sql, {
    afterCommit: input.afterCommit,
    aiSuggestion: ingredient,
    context: {
      matchedSupplementId: match?.id,
      normalizedSupplementName,
      reviewTaskId: reviewWork.taskId,
      safetyFlags: match?.safety_flags ?? [],
      safetyNotes: match?.safety_notes,
      ...(contextReview
        ? {
            contextRuleCode: contextReview.ruleCode,
            contextReviewType: contextReview.reviewType
          }
        : {}),
      taskId: reviewWork.taskId
    },
    dose,
    flagReason: reason,
    limit,
    planId: input.planId,
    reviewType: reviewTypeForKind(kind, contextReview),
    ruleCode: contextReview?.ruleCode ?? kind,
    severity,
    supplementName,
    taskId: reviewWork.taskId
  });

  await audit(input, {
    eventType: "formulation_safety_review_opened",
    level: severity,
    payload: {
      reason,
      reviewId,
      reviewKind: kind,
      reviewTaskId: reviewWork.taskId,
      supplementName
    }
  });
  await logSafetyBpm(input, "formulation_safety_review_opened", severity, {
    reason,
    reviewId,
    reviewKind: kind,
    reviewTaskId: reviewWork.taskId,
    supplementName
  });

  return withHiddenSafety(ingredient, {
    action: kind === "unknown_supplement" ? "unknown_supplement" : "human_review",
    message: localized(reason),
    reviewId,
    reviewTaskId: reviewWork.taskId ?? undefined
  });
}

async function logRemoved(
  input: SafetyInput,
  ingredient: FormulationIngredient,
  match: MatchedSupplement,
  reason: string
) {
  await audit(input, {
    eventType: "formulation_safety_item_removed",
    level: "high",
    payload: {
      reason,
      status: match.list_status,
      supplementId: match.id,
      supplementName: match.name
    }
  });
  await logSafetyBpm(input, "formulation_safety_item_removed", "high", {
    aiSuggestion: ingredient,
    reason,
    status: match.list_status,
    supplementId: match.id,
    supplementName: match.name
  });
}

async function reduceDose(
  sql: TaskServiceDb,
  input: SafetyInput,
  ingredient: FormulationIngredient,
  match: MatchedSupplement,
  dose: ParsedDose,
  limit: ParsedDose
) {
  const reason = `Dose reduced from ${dose.amount} ${dose.unit} to the configured maximum of ${formatDose(limit.amount, match.max_unit)}.`;
  const normalizedSupplementName = match.normalized_name;
  const reviewWork = await enqueueSupplementReviewWork({
    afterCommit: input.afterCommit,
    kind: "dose_reduced",
    normalizedSupplementName,
    payload: {
      actionOptions: ["dismiss"],
      maxAmount: numberOrNull(match.max_amount),
      maxUnit: match.max_unit,
      newDose: formatDose(limit.amount, match.max_unit),
      originalDose: dose.originalText,
      source: "formulation_safety",
      supplementId: match.id,
      supplementName: match.name
    },
    planId: input.planId,
    supplementName: match.name
  });

  await createSafetyReview(sql, {
    afterCommit: input.afterCommit,
    aiSuggestion: ingredient,
    context: {
      normalizedSupplementName,
      reviewTaskId: reviewWork.taskId,
      safetyFlags: match.safety_flags ?? [],
      safetyNotes: match.safety_notes,
      taskId: reviewWork.taskId
    },
    dose,
    flagReason: reason,
    limit,
    planId: input.planId,
    reviewType: "dose_limit",
    ruleCode: "dose_reduced",
    severity: "low",
    supplementName: match.name,
    taskId: reviewWork.taskId
  });
  await audit(input, {
    eventType: "formulation_safety_dose_reduced",
    level: "medium",
    payload: {
      maxAmount: numberOrNull(match.max_amount),
      maxUnit: match.max_unit,
      originalDose: dose.originalText,
      reviewTaskId: reviewWork.taskId,
      supplementName: match.name
    }
  });
  await logSafetyBpm(input, "formulation_safety_dose_reduced", "medium", {
    maxAmount: numberOrNull(match.max_amount),
    maxUnit: match.max_unit,
    originalDose: dose.originalText,
    reviewTaskId: reviewWork.taskId,
    supplementName: match.name
  });

  return withReducedDose(
    ingredient,
    formatDose(limit.amount, match.max_unit),
    localized(reason),
    reviewWork.taskId ?? undefined
  );
}

export async function applyFormulationSafety(
  sql: TaskServiceDb,
  input: SafetyInput
) {
  const lookup = await loadSupplementLookup(sql);
  const supplementBreakdown: FormulationIngredient[] = [];
  const summary = {
    adjustedCount: 0,
    hiddenCount: 0,
    removedCount: 0,
    reviewCount: 0
  };

  for (const ingredient of input.formulation.supplementBreakdown) {
    const match = matchSupplement(lookup, ingredient);
    const dose = parseDose(
      textFromLocalized(ingredient.dailyDose),
      match?.normalized_name
    );
    const limit = match
      ? parseDoseLimit(numberOrNull(match.max_amount), match.max_unit)
      : null;

    if (!match) {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      supplementBreakdown.push(
        await hideForReview(
          sql,
          input,
          ingredient,
          null,
          "unknown_supplement",
          "This supplement is not yet in the MattaNutra supplement catalogue.",
          "medium",
          dose,
          null
        )
      );
      continue;
    }

    if (match.list_status === "blocked") {
      summary.removedCount += 1;
      await logRemoved(
        input,
        ingredient,
        match,
        "Supplement is blocked in the MattaNutra supplement catalogue."
      );
      continue;
    }

    const contextReview = formulationSafetyContextReview({
      answers: input.answers,
      safetyFlags: match.safety_flags
    });

    if (contextReview) {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      supplementBreakdown.push(
        await hideForReview(
          sql,
          input,
          ingredient,
          match,
          "client_context_safety",
          contextReview.reason,
          contextReview.severity,
          dose,
          limit,
          contextReview
        )
      );
      continue;
    }

    if (limit && limit.amount <= 0) {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      supplementBreakdown.push(
        await hideForReview(
          sql,
          input,
          ingredient,
          match,
          "dose_unverified",
          "This supplement has no automated safe dose configured yet.",
          "high",
          dose,
          limit
        )
      );
      continue;
    }

    if (limit && !dose) {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      supplementBreakdown.push(
        await hideForReview(
          sql,
          input,
          ingredient,
          match,
          "dose_unverified",
          "The suggested dose could not be checked automatically.",
          "medium",
          null,
          limit
        )
      );
      continue;
    }

    if (dose && limit) {
      const exceedsLimit = doseExceedsLimit(dose, limit, match.normalized_name);

      if (exceedsLimit === null) {
        summary.hiddenCount += 1;
        summary.reviewCount += 1;
        supplementBreakdown.push(
          await hideForReview(
            sql,
            input,
            ingredient,
            match,
            "dose_unverified",
            "The suggested dose uses a unit we could not compare automatically.",
            "medium",
            dose,
            limit
          )
        );
        continue;
      }

      if (exceedsLimit) {
        summary.adjustedCount += 1;
        supplementBreakdown.push(
          await reduceDose(sql, input, ingredient, match, dose, limit)
        );
        continue;
      }
    }

    supplementBreakdown.push(withAutomatedSafetyStatus(ingredient));
  }

  await audit(input, {
    eventType: "formulation_safety_completed",
    level: summary.reviewCount > 0 || summary.removedCount > 0 ? "medium" : "low",
    payload: summary
  });
  await logSafetyBpm(
    input,
    "formulation_safety_completed",
    summary.reviewCount > 0 || summary.removedCount > 0 ? "medium" : "low",
    summary
  );

  return {
    ...input.formulation,
    safetySummary: summary,
    supplementBreakdown
  } satisfies FormulationBlueprint;
}
