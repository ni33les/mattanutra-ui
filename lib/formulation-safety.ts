import { joinedAdviceMessage, webHealthAdvice } from "@/lib/web-health-advice";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import { writeBpmEvent } from "@/lib/bpm";
import { doseExceedsLimit, parseDose, parseDoseLimit } from "@/lib/dose-conversion";
import type { FormulationBlueprint, FormulationIngredient, LocalizedText } from "@/lib/formulation-types";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import { productFactAliasKeys, productKeysMatch } from "@/lib/product-recommendations";
import { type TaskServiceDb } from "@/lib/task-service";

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
  countryCode?: string | null;
  requestId?: string | null;
  taskId: string;
}>;

type SupplementRow = Readonly<{
  aliases: string[] | null;
  confidence: string | null;
  id: string;
  is_active: boolean;
  list_status: string;
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

type ContextSafetyReview = Readonly<{
  reason: string;
  reviewType: "condition_stop" | "contraindication" | "medication_interaction" | "pregnancy_breastfeeding";
  ruleCode: string;
  severity: "high" | "medium";
}>;

function textFromLocalized(value: LocalizedText) {
  return resolveLocalizedText(value, "en");
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

function countryCodeFromSafetyInput(input: SafetyInput) {
  if (input.countryCode) {
    return normalizeProductCountryCode(input.countryCode) ?? defaultProductCountryCode;
  }

  const answers = isRecord(input.answers) ? input.answers : {};

  return normalizeProductCountryCode(answers.country) ?? defaultProductCountryCode;
}

async function loadSupplementLookup(sql: TaskServiceDb, countryCode: string) {
  const rows = await sql<SupplementRow[]>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      case
        when country_availability.status in ('allowed', 'blocked')
          then case country_availability.status
            when 'allowed' then 'active'
            else 'blocked'
          end
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
      select rule.status
      from jsonb_to_recordset(
        case
          when jsonb_typeof(supplements.source_payload -> 'countryAvailability') = 'array'
            then supplements.source_payload -> 'countryAvailability'
          else '[]'::jsonb
        end
      ) as rule("countryCode" text, country_code text, status text)
      where coalesce(rule."countryCode", rule.country_code) = ${countryCode}
        and rule.status in ('allowed', 'blocked')
      limit 1
    ) country_availability on true
    left join lateral (
      select *
      from public.supplement_safety_limits limits
      where limits.supplement_id = supplements.id
        and limits.life_stage = 'adult'
        and limits.source_scope = 'supplemental'
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
      country_availability.status,
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

export async function applyFormulationSafety(
  sql: TaskServiceDb,
  input: SafetyInput
) {
  const countryCode = countryCodeFromSafetyInput(input);
  const lookup = await loadSupplementLookup(sql, countryCode);
  const supplementBreakdown: FormulationIngredient[] = [];
  const summary = {
    adjustedCount: 0,
    hiddenCount: 0,
    removedCount: 0,
    reviewCount: 0
  };

  for (const ingredient of input.formulation.supplementBreakdown) {
    const match = matchSupplement(lookup, ingredient);
    const dose = parseDose(textFromLocalized(ingredient.dailyDose), match?.normalized_name);
    const limit = match ? parseDoseLimit(numberOrNull(match.max_amount), match.max_unit) : null;
    // Catalogue availability is operational; clinical findings are advice only.
    if (match?.list_status === "blocked") {
      summary.removedCount += 1;
      await logRemoved(input, ingredient, match, "Supplement is unavailable in the MattaNutra catalogue for this country.");
      continue;
    }
    const context = formulationSafetyContextReview({ answers: input.answers, safetyFlags: match?.safety_flags });
    const common = {
      ingredient: match?.name ?? textFromLocalized(ingredient.supplement),
      amount: dose?.amount ?? null, unit: dose?.unit ?? null,
      limit: limit && limit.amount > 0 ? { amount: limit.amount, unit: limit.unit } : null,
      evidence: match?.safety_notes, confidence: match?.confidence
    };
    const advice = [];
    if (context) advice.push(webHealthAdvice({ ...common, code: context.ruleCode, kind: "context" }));
    const comparable = dose && limit && limit.amount > 0 ? doseExceedsLimit(dose, limit, match?.normalized_name) : null;
    if (comparable === true) advice.push(webHealthAdvice({ ...common, code: "reference_limit_exceeded", kind: "limit" }));
    if (!match || !dose || !limit || limit.amount <= 0 || comparable === null) {
      advice.push(webHealthAdvice({ ...common, code: !match ? "unknown_supplement" : "intake_or_limit_unknown", kind: "unknown" }));
    }
    summary.reviewCount += advice.length > 0 ? 1 : 0;
    const visible = withAutomatedSafetyStatus(ingredient);
    supplementBreakdown.push(advice.length ? {
      ...visible,
      safety: { action: "advisory", advice, message: joinedAdviceMessage(advice), visibility: "visible" }
    } : visible);
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
