import { randomUUID } from "node:crypto";
import { toJsonValue } from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import { getSql } from "@/lib/db";
import {
  buildFoodNutrientFacts,
  completeFoodNutrientProfile,
  normalizeFoodServingSize
} from "@/lib/food-nutrients";
import type {
  FoodGuidanceBlueprint,
  FoodGuidanceItem,
  FoodGuidanceSafetyAction,
  LocalizedText
} from "@/lib/formulation-types";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
import { safetyReviewItemColumnsAvailable } from "@/lib/safety-review-schema";
import { createTask, type TaskServiceDb } from "@/lib/task-service";

type SafetyAfterCommit = (effect: () => Promise<void>) => void;

type SafetyAudit = (event: {
  eventType: string;
  level?: "critical" | "high" | "low" | "medium";
  payload?: Record<string, unknown>;
}) => Promise<void>;

type SafetyInput = Readonly<{
  afterCommit?: SafetyAfterCommit;
  answers: unknown;
  audit?: SafetyAudit;
  foodGuidance: FoodGuidanceBlueprint;
  locale: Locale;
  planId: string;
  requestId?: string | null;
  taskId: string;
}>;

type FoodRow = Readonly<{
  aliases: string[] | null;
  allergen_flags: string[] | null;
  benefit_tags: string[] | null;
  category: string | null;
  condition_flags: string[] | null;
  confidence: string | null;
  default_serving: unknown;
  id: string;
  is_active: boolean;
  nutrient_profile: unknown;
  list_status: "blacklisted" | "inactive" | "review_required" | "whitelisted";
  name: string;
  nutrient_tags: string[] | null;
  normalized_name: string;
  safety_notes: string | null;
}>;

type MatchedFood = FoodRow & {
  requestedName: string;
};

type ReviewKind = "condition_review" | "review_required" | "unknown_food";

function textFromLocalized(value: LocalizedText) {
  return resolveLocalizedText(value, "en");
}

function localized(en: string, th = en): LocalizedText {
  return { en, th };
}

export function normalizeFoodName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function splitFreeText(value: unknown) {
  return typeof value === "string"
    ? value
        .split(/[\n,;]+/g)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function activeContextValue(value: unknown) {
  const normalized = textValue(value);

  return Boolean(
    normalized &&
      normalized !== "none" &&
      normalized !== "normal" &&
      normalized !== "no"
  );
}

function hasAnyToken(values: readonly string[], tokens: readonly string[]) {
  return values.some((value) => tokens.includes(normalizeFoodName(value)));
}

function safetyIntake(answers: unknown) {
  const record = objectValue(answers);
  const allergenInputs = [
    ...stringArray(record.foodAllergens),
    ...stringArray(record.allergens),
    ...splitFreeText(record.foodAllergyNotes)
  ];
  const avoidances = [
    ...stringArray(record.avoidedFoods),
    ...stringArray(record.foodAvoidances),
    ...splitFreeText(record.foodAvoidances),
    ...splitFreeText(record.dislikedFoods)
  ];

  return {
    acknowledged: record.disclosure === true || record.foodSafetyAcknowledged === true,
    allergens: allergenInputs.map(normalizeFoodName).filter(Boolean),
    avoidances: avoidances.map(normalizeFoodName).filter(Boolean),
    conditionFlags: deriveConditionFlags(record)
  };
}

export function deriveConditionFlags(record: Record<string, unknown>) {
  const flags = new Set<string>();
  const medicationAnswer = textValue(record.meds);
  const medicationTypes =
    medicationAnswer === "yes" ? stringArray(record.medTypes).map(normalizeFoodName) : [];
  const otherMedication =
    medicationAnswer === "yes" ? textValue(record.otherMed) : "";
  const conditionTokens = [
    ...stringArray(record.conditions),
    ...stringArray(record.medicalConditions),
    ...splitFreeText(record.conditionNotes)
  ].map(normalizeFoodName);
  const symptomText = [
    ...stringArray(record.symptoms),
    ...splitFreeText(record.symptomNotes)
  ].join(" ").toLowerCase();
  const reproductiveContext = [
    textValue(record.reproStatus),
    textValue(record.menopause),
    textValue(record.flow)
  ].join(" ");

  if (
    hasAnyToken(conditionTokens, ["diabetes", "prediabetes", "blood_sugar"]) ||
    Number.parseFloat(textValue(objectValue(record.labs).hba1c)) >= 6.5
  ) {
    flags.add("blood_sugar");
  }

  if (activeContextValue(record.kidney)) {
    flags.add("kidney");
  }

  if (
    hasAnyToken(conditionTokens, ["hypertension", "heart", "cardiac"]) ||
    hasAnyToken(medicationTypes, ["bp"])
  ) {
    flags.add("sodium_heart");
  }

  if (
    reproductiveContext.includes("pregnan") ||
    reproductiveContext.includes("breastfeed")
  ) {
    flags.add("pregnancy");
  }

  if (hasAnyToken(conditionTokens, ["eating_disorder", "restrictive_eating"])) {
    flags.add("restrictive_eating");
  }

  if (
    hasAnyToken(medicationTypes, ["bloodthinner", "blood_thinner", "warfarin", "anticoagulant"]) ||
    otherMedication.includes("warfarin") ||
    otherMedication.includes("anticoagulant")
  ) {
    flags.add("medication_interaction");
  }

  if (
    activeContextValue(record.digCondition) ||
    hasAnyToken(conditionTokens, ["ibs", "ibd", "celiac", "reflux", "gallbladder", "pancreatitis"])
  ) {
    flags.add("digestive");
  }

  if (hasAnyToken(conditionTokens, ["teen", "child", "minor", "older_adult", "elder"])) {
    flags.add("age_sensitive");
  }

  if (
    [
      "unexplained weight loss",
      "fainting",
      "chest pain",
      "blood in stool",
      "persistent vomiting",
      "severe abdominal"
    ].some((pattern) => symptomText.includes(pattern))
  ) {
    flags.add("red_flag");
  }

  return [...flags];
}

async function loadFoodLookup(sql: TaskServiceDb) {
  const rows = await sql<FoodRow[]>`
    select
      foods.id::text,
      foods.name,
      foods.normalized_name,
      foods.category,
      foods.benefit_tags,
      foods.nutrient_tags,
      default_serving.default_serving,
      coalesce(nutrient_rows.nutrient_profile, '[]'::jsonb) as nutrient_profile,
      case
        when foods.is_active = false then 'inactive'
        else foods.list_status
      end as list_status,
      foods.is_active,
      rules.allergen_flags,
      rules.condition_flags,
      rules.confidence,
      rules.safety_notes,
      coalesce(alias_rows.aliases, '{}'::text[]) as aliases
    from public.foods foods
    left join lateral (
      select *
      from public.food_safety_rules rules
      where rules.food_id = foods.id
      order by rules.version desc
      limit 1
    ) rules on true
    left join lateral (
      select coalesce(
        array_remove(
          array_agg(distinct food_aliases.normalized_alias order by food_aliases.normalized_alias),
          null
        ),
        '{}'::text[]
      ) as aliases
      from public.food_aliases
      where food_aliases.food_id = foods.id
    ) alias_rows on true
    left join lateral (
      select jsonb_build_object(
        'label', food_serving_sizes.label,
        'grams', food_serving_sizes.grams,
        'isDefault', food_serving_sizes.is_default,
        'source', food_serving_sizes.source
      ) as default_serving
      from public.food_serving_sizes
      where food_serving_sizes.food_id = foods.id
        and food_serving_sizes.is_default = true
      order by food_serving_sizes.updated_at desc
      limit 1
    ) default_serving on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'nutrientId', nutrients.id,
            'label', nutrients.label,
            'unit', nutrients.unit,
            'category', nutrients.category,
            'amountPer100g', food_nutrient_profiles.amount_per_100g,
            'source', food_nutrient_profiles.source,
            'confidence', food_nutrient_profiles.confidence
          )
          order by nutrients.display_order asc
        ),
        '[]'::jsonb
      ) as nutrient_profile
      from public.food_nutrient_profiles
      join public.nutrients
        on nutrients.id = food_nutrient_profiles.nutrient_id
      where food_nutrient_profiles.food_id = foods.id
    ) nutrient_rows on true
  `;
  const lookup = new Map<string, FoodRow>();

  rows.forEach((row) => {
    lookup.set(row.normalized_name, row);
    (row.aliases ?? []).forEach((alias) => lookup.set(alias, row));
  });

  return lookup;
}

function matchFood(
  lookup: Map<string, FoodRow>,
  item: FoodGuidanceItem
): MatchedFood | null {
  const requestedName = textFromLocalized(item.food);
  const candidates = [
    normalizeFoodName(requestedName),
    normalizeFoodName(item.id.replaceAll("-", "_"))
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = lookup.get(candidate);

    if (match) {
      return { ...match, requestedName };
    }
  }

  return null;
}

function hasOverlap(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right.map(normalizeFoodName));

  return left.some((item) => rightSet.has(normalizeFoodName(item)));
}

function foodMatchesTokens(food: MatchedFood | null, item: FoodGuidanceItem, tokens: readonly string[]) {
  const searchable = [
    food?.name,
    food?.normalized_name,
    ...(food?.aliases ?? []),
    textFromLocalized(item.food),
    item.id
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeFoodName);

  return tokens.some((token) =>
    searchable.some((candidate) => candidate.includes(token) || token.includes(candidate))
  );
}

function withHiddenSafety(
  item: FoodGuidanceItem,
  input: {
    action: FoodGuidanceSafetyAction;
    message: LocalizedText;
    reviewId?: string;
    reviewTaskId?: string;
  }
): FoodGuidanceItem {
  return {
    ...item,
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

function withAutomatedSafetyStatus(item: FoodGuidanceItem): FoodGuidanceItem {
  return item.status === "review" ? { ...item, status: "add" } : item;
}

function withKnownFoodTags(
  item: FoodGuidanceItem,
  food: MatchedFood | null
): FoodGuidanceItem {
  if (!food) {
    return item;
  }

  const serving = normalizeFoodServingSize(food.default_serving);
  const nutrientProfile = completeFoodNutrientProfile(food.nutrient_profile);

  return {
    ...item,
    benefitTags: food.benefit_tags ?? [],
    nutrientFacts: buildFoodNutrientFacts(nutrientProfile, serving?.grams),
    nutrientTags: food.nutrient_tags ?? []
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
      severity
    });
  };

  if (input.afterCommit) {
    input.afterCommit(effect);
    return;
  }

  await effect();
}

async function enqueueFoodReviewWork(input: {
  afterCommit?: SafetyAfterCommit;
  foodName: string;
  kind: ReviewKind;
  normalizedFoodName: string;
  payload: Record<string, unknown>;
  planId: string | null;
}) {
  const globalUnknown = input.kind === "unknown_food" && !input.planId;
  const taskTitle = `Review food ${input.foodName}`;
  const idempotencyKey = `food-review:${input.kind}:${globalUnknown ? "global" : input.planId}:${input.normalizedFoodName}`;
  const createReviewWork = async () => {
    const result = await createTask({
      actorType: "human",
      businessValue: globalUnknown ? 350 : 400,
      context: {
        normalizedFoodName: input.normalizedFoodName,
        reviewKind: input.kind,
        source: "food_guidance_safety"
      },
      groupLabel: globalUnknown ? "Review food" : "Review food guidance",
      id: randomUUID(),
      idempotencyKey,
      idempotencyScopeKey: globalUnknown
        ? `food:${input.normalizedFoodName}`
        : `food-safety:${input.planId}`,
      initialComment: {
        authorName: "MattaNutra food safety",
        authorType: "system",
        body: `Food safety review opened for ${input.foodName}.`,
        commentType: "instruction",
        metadata: {
          reviewKind: input.kind
        },
        visibility: "admin"
      },
      maxAttempts: 1,
      payload: {
        foodName: input.foodName,
        normalizedFoodName: input.normalizedFoodName,
        reviewKind: input.kind,
        source: "food_guidance_safety",
        ...input.payload
      },
      planId: globalUnknown ? null : input.planId,
      reasoningEffort: "none",
      requiredCapabilities: ["food_review"],
      taskType: input.kind === "unknown_food" ? "classify_food" : "review_food_for_plan",
      title: taskTitle
    });

    return { taskId: result.task.id };
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

async function createFoodSafetyReview(
  sql: TaskServiceDb,
  input: {
    afterCommit?: SafetyAfterCommit;
    aiSuggestion: FoodGuidanceItem;
    context: Record<string, unknown>;
    flagReason: string;
    foodName: string;
    planId: string;
    reviewType: string;
    ruleCode: string;
    severity: "critical" | "high" | "low" | "medium";
    taskId?: string | null;
  }
) {
  const itemColumnsAvailable = await safetyReviewItemColumnsAvailable(sql);
  const existing = itemColumnsAvailable
    ? await sql<{ id: string }[]>`
        select id::text
        from public.safety_reviews
        where plan_id = ${input.planId}::uuid
          and item_type = 'food'
          and lower(item_name) = lower(${input.foodName})
          and rule_code = ${input.ruleCode}
          and status in ('open', 'in_review', 'escalated')
        order by opened_at asc
        limit 1
      `
    : await sql<{ id: string }[]>`
        select id::text
        from public.safety_reviews
        where plan_id = ${input.planId}::uuid
          and lower(supplement_name) = lower(${input.foodName})
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
  if (itemColumnsAvailable) {
    await sql`
      insert into public.safety_reviews (
        id,
        plan_id,
        review_type,
        status,
        severity,
        item_type,
        item_name,
        supplement_name,
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
        'food',
        ${input.foodName},
        ${input.foodName},
        ${input.ruleCode},
        ${input.flagReason},
        ${sql.json(toJsonValue(input.aiSuggestion))},
        ${sql.json(toJsonValue(input.context))},
        now(),
        now()
      )
    `;
  } else {
    await sql`
      insert into public.safety_reviews (
        id,
        plan_id,
        review_type,
        status,
        severity,
        supplement_name,
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
        ${input.foodName},
        ${input.ruleCode},
        ${input.flagReason},
        ${sql.json(toJsonValue(input.aiSuggestion))},
        ${sql.json(toJsonValue(input.context))},
        now(),
        now()
      )
    `;
  }

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

async function hideForReview(
  sql: TaskServiceDb,
  input: SafetyInput,
  item: FoodGuidanceItem,
  match: MatchedFood | null,
  kind: ReviewKind,
  reason: string,
  severity: "critical" | "high" | "low" | "medium",
  context: Record<string, unknown> = {}
) {
  const foodName = match?.name ?? textFromLocalized(item.food);
  const normalizedFoodName = match?.normalized_name ?? normalizeFoodName(foodName);
  const reviewWork = await enqueueFoodReviewWork({
    afterCommit: input.afterCommit,
    foodName,
    kind,
    normalizedFoodName,
    payload: {
      actionOptions:
        kind === "unknown_food"
          ? ["whitelist", "review_required", "blacklist", "ignore"]
          : ["accept", "revise", "blacklist", "ignore"],
      conditionFlags: match?.condition_flags ?? [],
      confidence: match?.confidence,
      foodId: match?.id,
      foodName,
      requiredFields: ["status", "confidence", "conditionFlags", "allergenFlags"],
      source: "food_guidance_safety"
    },
    planId: input.planId
  });
  const reviewId = await createFoodSafetyReview(sql, {
    afterCommit: input.afterCommit,
    aiSuggestion: item,
    context: {
      allergenFlags: match?.allergen_flags ?? [],
      conditionFlags: match?.condition_flags ?? [],
      foodId: match?.id,
      normalizedFoodName,
      reviewTaskId: reviewWork.taskId,
      safetyNotes: match?.safety_notes,
      taskId: reviewWork.taskId,
      ...context
    },
    flagReason: reason,
    foodName,
    planId: input.planId,
    reviewType: kind === "condition_review" ? "condition_stop" : "ingredient_safety",
    ruleCode: kind,
    severity,
    taskId: reviewWork.taskId
  });

  await audit(input, {
    eventType: "food_guidance_safety_review_opened",
    level: severity,
    payload: {
      foodName,
      reason,
      reviewId,
      reviewKind: kind,
      reviewTaskId: reviewWork.taskId
    }
  });
  await logSafetyBpm(input, "food_guidance_safety_review_opened", severity, {
    foodName,
    reason,
    reviewId,
    reviewKind: kind,
    reviewTaskId: reviewWork.taskId
  });

  return withHiddenSafety(item, {
    action: kind === "unknown_food" ? "unknown_food" : "human_review",
    message: localized(reason),
    reviewId,
    reviewTaskId: reviewWork.taskId ?? undefined
  });
}

async function logRemoved(
  input: SafetyInput,
  item: FoodGuidanceItem,
  reason: string,
  level: "critical" | "high" | "low" | "medium" = "high"
) {
  await audit(input, {
    eventType: "food_guidance_safety_item_removed",
    level,
    payload: {
      aiSuggestion: item,
      reason
    }
  });
  await logSafetyBpm(input, "food_guidance_safety_item_removed", level, {
    aiSuggestion: item,
    reason
  });
}

export async function applyFoodGuidanceSafety(
  sql: TaskServiceDb,
  input: SafetyInput
) {
  const lookup = await loadFoodLookup(sql);
  const intake = safetyIntake(input.answers);
  const foodGuidance: FoodGuidanceItem[] = [];
  const summary = {
    adjustedCount: 0,
    hiddenCount: 0,
    removedCount: 0,
    reviewCount: 0
  };

  for (const item of input.foodGuidance.foodGuidance) {
    const match = matchFood(lookup, item);
    const allergenFlags = match?.allergen_flags ?? [];
    const conditionFlags = match?.condition_flags ?? [];
    const explicitAllergen =
      hasOverlap(allergenFlags, intake.allergens) ||
      foodMatchesTokens(match, item, intake.allergens);
    const explicitAvoidance = foodMatchesTokens(match, item, intake.avoidances);
    const triggeredConditions = conditionFlags.filter((flag) =>
      intake.conditionFlags.includes(normalizeFoodName(flag))
    );

    if (explicitAllergen) {
      summary.removedCount += 1;
      await logRemoved(
        input,
        item,
        "Food removed because it matches a disclosed allergy.",
        "critical"
      );
      continue;
    }

    if (explicitAvoidance) {
      summary.removedCount += 1;
      await logRemoved(
        input,
        item,
        "Food removed because it matches a disclosed avoidance or dislike.",
        "medium"
      );
      continue;
    }

    if (!match) {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      foodGuidance.push(
        await hideForReview(
          sql,
          input,
          item,
          null,
          "unknown_food",
          "This food is not yet in the MattaNutra food list.",
          "medium",
          { acknowledged: intake.acknowledged }
        )
      );
      continue;
    }

    if (match.list_status === "blacklisted" || match.list_status === "inactive") {
      summary.removedCount += 1;
      await logRemoved(
        input,
        item,
        `Food is ${match.list_status} in the MattaNutra food list.`,
        "high"
      );
      continue;
    }

    if (!intake.acknowledged) {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      foodGuidance.push(
        await hideForReview(
          sql,
          input,
          withKnownFoodTags(item, match),
          match,
          "condition_review",
          "Food safety acknowledgement was not confirmed before guidance generation.",
          "high",
          { acknowledged: false }
        )
      );
      continue;
    }

    if (triggeredConditions.length > 0) {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      foodGuidance.push(
        await hideForReview(
          sql,
          input,
          withKnownFoodTags(item, match),
          match,
          "condition_review",
          "This food needs review against disclosed health or medication context.",
          "medium",
          { triggeredConditions }
        )
      );
      continue;
    }

    if (match.list_status === "review_required") {
      summary.hiddenCount += 1;
      summary.reviewCount += 1;
      foodGuidance.push(
        await hideForReview(
          sql,
          input,
          withKnownFoodTags(item, match),
          match,
          "review_required",
          "This food needs human review before we show it.",
          "medium"
        )
      );
      continue;
    }

    foodGuidance.push(withAutomatedSafetyStatus(withKnownFoodTags(item, match)));
  }

  await audit(input, {
    eventType: "food_guidance_safety_completed",
    level: summary.reviewCount > 0 || summary.removedCount > 0 ? "medium" : "low",
    payload: summary
  });
  await logSafetyBpm(
    input,
    "food_guidance_safety_completed",
    summary.reviewCount > 0 || summary.removedCount > 0 ? "medium" : "low",
    summary
  );

  return {
    ...input.foodGuidance,
    foodGuidance,
    foodSafetySummary: summary
  } satisfies FoodGuidanceBlueprint;
}
