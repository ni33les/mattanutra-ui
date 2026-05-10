import type postgres from "postgres";
import { randomUUID } from "node:crypto";
import type { AssessmentPlan } from "@/lib/assessment-jobs";
import { toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import {
  doseExceedsLimit,
  parseDose,
  parseDoseLimit,
  type ParsedDose
} from "@/lib/dose-conversion";
import type { FormulationBlueprint, FormulationIngredient, LocalizedText } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";

type SafetyAudit = (event: {
  eventType: string;
  level?: "critical" | "high" | "low" | "medium";
  payload?: Record<string, unknown>;
}) => Promise<void>;

type SafetyInput = Readonly<{
  audit?: SafetyAudit;
  formulation: FormulationBlueprint;
  jobId: string;
  locale: Locale;
  plan: AssessmentPlan;
  planId: string;
  requestId?: string | null;
}>;

type SupplementRow = Readonly<{
  aliases: string[] | null;
  confidence: string | null;
  id: string;
  is_active: boolean;
  list_status: "blacklisted" | "inactive" | "review_required" | "whitelisted";
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
  | "dose_reduced"
  | "dose_unverified"
  | "review_required"
  | "unknown_supplement";

function textFromLocalized(value: LocalizedText) {
  return typeof value === "string" ? value : value.en || value.th || "";
}

function localized(en: string, th = en): LocalizedText {
  return { en, th };
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

async function loadSupplementLookup(sql: postgres.Sql) {
  const rows = await sql<SupplementRow[]>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      case
        when supplements.is_active = false then 'inactive'
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
    normalizeName(requestedName),
    normalizeName(ingredient.id.replaceAll("-", "_"))
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = lookup.get(candidate);

    if (match) {
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
    reviewJobId?: string;
  }
): FormulationIngredient {
  return {
    ...ingredient,
    safety: {
      action: input.action,
      message: input.message,
      reviewId: input.reviewId,
      reviewJobId: input.reviewJobId,
      visibility: "hidden"
    },
    status: "review"
  };
}

function withReducedDose(
  ingredient: FormulationIngredient,
  dose: string,
  message: LocalizedText,
  reviewJobId?: string
): FormulationIngredient {
  return {
    ...ingredient,
    dailyDose: localized(dose),
    safety: {
      action: "dose_reduced",
      message,
      originalDailyDose: ingredient.dailyDose,
      reviewJobId,
      visibility: "visible"
    }
  };
}

async function enqueueSupplementReviewJob(
  sql: postgres.Sql,
  input: {
    kind: ReviewKind;
    normalizedSupplementName: string;
    payload: Record<string, unknown>;
    planId: string | null;
  }
) {
  const globalUnknown = input.kind === "unknown_supplement";
  const planId = input.planId ?? null;
  const existing = globalUnknown
    ? await sql<{ id: string }[]>`
        select id::text
        from public.jobs
        where job_type = 'supplement_review'
          and status = 'queued'
          and payload ->> 'reviewKind' = ${input.kind}
          and payload ->> 'normalizedSupplementName' = ${input.normalizedSupplementName}
        order by queued_at asc
        limit 1
      `
    : await sql<{ id: string }[]>`
        select id::text
        from public.jobs
        where job_type = 'supplement_review'
          and status = 'queued'
          and plan_id = ${planId}::uuid
          and payload ->> 'reviewKind' = ${input.kind}
          and payload ->> 'normalizedSupplementName' = ${input.normalizedSupplementName}
        order by queued_at asc
        limit 1
      `;

  if (existing[0]?.id) {
    return existing[0].id;
  }

  const jobId = randomUUID();

  await sql`
    insert into public.jobs (
      id,
      job_type,
      plan_id,
      status,
      priority,
      payload,
      queued_at,
      updated_at
    )
    values (
      ${jobId}::uuid,
      'supplement_review',
      ${globalUnknown ? null : planId}::uuid,
      'queued',
      ${input.kind === "unknown_supplement" ? 12 : 8},
      ${sql.json(
        toJsonValue({
          normalizedSupplementName: input.normalizedSupplementName,
          reviewKind: input.kind,
          ...input.payload
        })
      )},
      now(),
      now()
    )
  `;

  return jobId;
}

async function createSafetyReview(
  sql: postgres.Sql,
  input: {
    aiSuggestion: FormulationIngredient;
    context: Record<string, unknown>;
    dose?: ParsedDose | null;
    flagReason: string;
    jobId?: string | null;
    limit?: ParsedDose | null;
    planId: string;
    reviewType: string;
    ruleCode: string;
    severity: "critical" | "high" | "low" | "medium";
    supplementName: string;
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
    return existing[0].id;
  }

  const reviewId = randomUUID();
  const jobId = input.jobId ?? null;

  await sql`
    insert into public.safety_reviews (
      id,
      plan_id,
      job_id,
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
      ${jobId}::uuid,
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
  await writeBpmEvent({
    actorType: "worker",
    eventName,
    eventType: "safety",
    exampleRequestId: input.requestId,
    jobId: input.jobId,
    locale: input.locale,
    planId: input.planId,
    properties,
    selectedPlan: input.plan,
    severity
  });
}

async function hideForReview(
  sql: postgres.Sql,
  input: SafetyInput,
  ingredient: FormulationIngredient,
  match: MatchedSupplement | null,
  kind: ReviewKind,
  reason: string,
  severity: "critical" | "high" | "low" | "medium",
  dose: ParsedDose | null,
  limit: ParsedDose | null
) {
  const supplementName = match?.name ?? textFromLocalized(ingredient.supplement);
  const normalizedSupplementName = match?.normalized_name ?? normalizeName(supplementName);
  const reviewJobId = await enqueueSupplementReviewJob(sql, {
    kind,
    normalizedSupplementName,
    payload: {
      actionOptions:
        kind === "unknown_supplement"
          ? ["whitelist", "review_required", "blacklist", "ignore"]
          : ["accept", "revise", "blacklist", "ignore"],
      confidence: match?.confidence,
      maxAmount: numberOrNull(match?.max_amount ?? null),
      maxUnit: match?.max_unit,
      requiredFields: ["status", "maxAmount", "maxUnit", "confidence"],
      source: "formulation_safety",
      supplementId: match?.id,
      supplementName
    },
    planId: input.planId
  });
  const reviewId = await createSafetyReview(sql, {
    aiSuggestion: ingredient,
    context: {
      matchedSupplementId: match?.id,
      normalizedSupplementName,
      reviewJobId,
      safetyFlags: match?.safety_flags ?? [],
      safetyNotes: match?.safety_notes
    },
    dose,
    flagReason: reason,
    jobId: reviewJobId,
    limit,
    planId: input.planId,
    reviewType:
      kind === "unknown_supplement"
        ? "ingredient_safety"
        : kind === "dose_unverified"
          ? "dose_limit"
          : "ingredient_safety",
    ruleCode: kind,
    severity,
    supplementName
  });

  await audit(input, {
    eventType: "formulation_safety_review_opened",
    level: severity,
    payload: {
      reason,
      reviewId,
      reviewJobId,
      reviewKind: kind,
      supplementName
    }
  });
  await logSafetyBpm(input, "formulation_safety_review_opened", severity, {
    reason,
    reviewId,
    reviewJobId,
    reviewKind: kind,
    supplementName
  });

  return withHiddenSafety(ingredient, {
    action: kind === "unknown_supplement" ? "unknown_supplement" : "human_review",
    message: localized(reason),
    reviewId,
    reviewJobId
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
  sql: postgres.Sql,
  input: SafetyInput,
  ingredient: FormulationIngredient,
  match: MatchedSupplement,
  dose: ParsedDose,
  limit: ParsedDose
) {
  const reason = `Dose reduced from ${dose.amount} ${dose.unit} to the configured maximum of ${formatDose(limit.amount, match.max_unit)}.`;
  const normalizedSupplementName = match.normalized_name;
  const reviewJobId = await enqueueSupplementReviewJob(sql, {
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
    planId: input.planId
  });

  await createSafetyReview(sql, {
    aiSuggestion: ingredient,
    context: {
      normalizedSupplementName,
      reviewJobId,
      safetyFlags: match.safety_flags ?? [],
      safetyNotes: match.safety_notes
    },
    dose,
    flagReason: reason,
    jobId: reviewJobId,
    limit,
    planId: input.planId,
    reviewType: "dose_limit",
    ruleCode: "dose_reduced",
    severity: "low",
    supplementName: match.name
  });
  await audit(input, {
    eventType: "formulation_safety_dose_reduced",
    level: "medium",
    payload: {
      maxAmount: numberOrNull(match.max_amount),
      maxUnit: match.max_unit,
      originalDose: dose.originalText,
      reviewJobId,
      supplementName: match.name
    }
  });
  await logSafetyBpm(input, "formulation_safety_dose_reduced", "medium", {
    maxAmount: numberOrNull(match.max_amount),
    maxUnit: match.max_unit,
    originalDose: dose.originalText,
    reviewJobId,
    supplementName: match.name
  });

  return withReducedDose(
    ingredient,
    formatDose(limit.amount, match.max_unit),
    localized(reason),
    reviewJobId
  );
}

export async function applyFormulationSafety(
  sql: postgres.Sql,
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
          "This supplement is not yet in the MattaNutra whitelist.",
          "medium",
          dose,
          null
        )
      );
      continue;
    }

    if (match.list_status === "blacklisted" || match.list_status === "inactive") {
      summary.removedCount += 1;
      await logRemoved(
        input,
        ingredient,
        match,
        `Supplement is ${match.list_status} in the MattaNutra supplement list.`
      );
      continue;
    }

    if (match.list_status === "review_required" || ingredient.status === "review") {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      supplementBreakdown.push(
        await hideForReview(
          sql,
          input,
          ingredient,
          match,
          "review_required",
          "This supplement needs human review before we show it.",
          "medium",
          dose,
          limit
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

    supplementBreakdown.push(ingredient);
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
