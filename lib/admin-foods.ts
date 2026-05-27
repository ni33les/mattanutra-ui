import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  completeFoodNutrientProfile,
  normalizeFoodNutrientProfileInput,
  normalizeFoodServingSize,
  type FoodNutrientProfileValue,
  type FoodServingSize
} from "@/lib/food-nutrients";
import {
  normalizeFoodBenefitTags,
  normalizeFoodNutrientTags,
  type FoodBenefitTag,
  type FoodNutrientTag
} from "@/lib/food-tags";

export type FoodListStatus =
  | "blacklisted"
  | "inactive"
  | "review_required"
  | "whitelisted";

export type FoodConfidence = "high" | "low" | "moderate";
export type AdminFoodTranslationStatus = "complete" | "draft" | "missing";

export type AdminFoodTranslation = Readonly<{
  category: string | null;
  imageAlt: string | null;
  name: string | null;
  primaryUseCase: string | null;
  status: AdminFoodTranslationStatus;
  updatedAt?: string | null;
}>;

export type AdminFoodRow = Readonly<{
  aliases: string[];
  allergenFlags: string[];
  benefitTags: FoodBenefitTag[];
  category: string;
  conditionFlags: string[];
  confidence: FoodConfidence;
  defaultServing: FoodServingSize | null;
  id: string;
  imagePath: string | null;
  imageSource: string | null;
  listStatus: FoodListStatus;
  name: string;
  nutrientProfile: FoodNutrientProfileValue[];
  nutrientTags: FoodNutrientTag[];
  primaryUseCase: string | null;
  safetyNotes: string | null;
  translations: Record<string, AdminFoodTranslation>;
  updatedAt: string;
}>;

export type AdminFoodsData = Readonly<{
  categories: string[];
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminFoodRow[];
  summary: {
    blacklisted: number;
    inactive: number;
    reviewRequired: number;
    total: number;
    whitelisted: number;
  };
}>;

type FoodDbRow = Readonly<{
  aliases: string[] | null;
  allergen_flags: string[] | null;
  benefit_tags: string[] | null;
  category: string;
  condition_flags: string[] | null;
  confidence: FoodConfidence | null;
  nutrient_profile: unknown;
  default_serving: unknown;
  id: string;
  image_path: string | null;
  image_source: string | null;
  is_active: boolean;
  list_status: FoodListStatus;
  name: string;
  nutrient_tags: string[] | null;
  primary_use_case: string | null;
  safety_notes: string | null;
  translations: unknown;
  updated_at: Date | string;
}>;

export type UpdateAdminFoodInput = Readonly<{
  actor?: string | null;
  benefitTags?: FoodBenefitTag[];
  confidence: FoodConfidence;
  defaultServing?: FoodServingSize | null;
  id: string;
  imagePath?: string | null;
  imageSource?: string | null;
  listStatus: FoodListStatus;
  nutrientProfile?: FoodNutrientProfileValue[];
  nutrientTags?: FoodNutrientTag[];
  safetyNotes: string | null;
  translations?: Record<string, AdminFoodTranslation>;
}>;

const listStatuses = new Set<FoodListStatus>([
  "blacklisted",
  "inactive",
  "review_required",
  "whitelisted"
]);

const confidences = new Set<FoodConfidence>(["high", "low", "moderate"]);
const translationStatuses = new Set<AdminFoodTranslationStatus>([
  "complete",
  "draft",
  "missing"
]);

export function isFoodListStatus(value: string): value is FoodListStatus {
  return listStatuses.has(value as FoodListStatus);
}

export function isFoodConfidence(value: string): value is FoodConfidence {
  return confidences.has(value as FoodConfidence);
}

export function emptyAdminFoodsData(): AdminFoodsData {
  return {
    categories: [],
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      blacklisted: 0,
      inactive: 0,
      reviewRequired: 0,
      total: 0,
      whitelisted: 0
    }
  };
}

function rowFromDb(row: FoodDbRow): AdminFoodRow {
  const defaultServing = normalizeFoodServingSize(row.default_serving);
  const translations = adminFoodTranslationsFromRow(row);

  return {
    aliases: row.aliases ?? [],
    allergenFlags: row.allergen_flags ?? [],
    benefitTags: normalizeFoodBenefitTags(row.benefit_tags),
    category: row.category,
    conditionFlags: row.condition_flags ?? [],
    confidence: row.confidence ?? "moderate",
    defaultServing,
    id: row.id,
    imagePath: row.image_path,
    imageSource: row.image_source,
    listStatus: row.is_active ? row.list_status : "inactive",
    name: row.name,
    nutrientProfile: completeFoodNutrientProfile(row.nutrient_profile),
    nutrientTags: normalizeFoodNutrientTags(row.nutrient_tags),
    primaryUseCase: row.primary_use_case,
    safetyNotes: row.safety_notes,
    translations,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function recordFromUnknown(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function translationStatus(value: unknown): AdminFoodTranslationStatus {
  return typeof value === "string" &&
    translationStatuses.has(value as AdminFoodTranslationStatus)
    ? (value as AdminFoodTranslationStatus)
    : "missing";
}

function normalizeFoodTranslations(
  value: unknown
): Record<string, AdminFoodTranslation> {
  const translations: Record<string, AdminFoodTranslation> = {};

  for (const [locale, rawTranslation] of Object.entries(recordFromUnknown(value))) {
    const record = recordFromUnknown(rawTranslation);

    translations[locale] = {
      category: nullableText(record.category),
      imageAlt: nullableText(record.imageAlt),
      name: nullableText(record.name),
      primaryUseCase: nullableText(record.primaryUseCase),
      status: translationStatus(record.status),
      updatedAt: nullableText(record.updatedAt)
    };
  }

  return translations;
}

function adminFoodTranslationsFromRow(row: FoodDbRow) {
  const translations = normalizeFoodTranslations(row.translations);

  if (!translations.en) {
    translations.en = {
      category: row.category,
      imageAlt: row.name,
      name: row.name,
      primaryUseCase: row.primary_use_case,
      status: "complete",
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  return translations;
}

function buildSummary(rows: AdminFoodRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.listStatus === "blacklisted") {
        summary.blacklisted += 1;
      } else if (row.listStatus === "inactive") {
        summary.inactive += 1;
      } else if (row.listStatus === "review_required") {
        summary.reviewRequired += 1;
      } else {
        summary.whitelisted += 1;
      }

      return summary;
    },
    {
      blacklisted: 0,
      inactive: 0,
      reviewRequired: 0,
      total: 0,
      whitelisted: 0
    }
  );
}

export async function getAdminFoodsData(): Promise<AdminFoodsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminFoodsData();
  }

  try {
    const rows = await sql<FoodDbRow[]>`
      select
        foods.id::text,
        foods.name,
        foods.category,
        foods.primary_use_case,
        foods.benefit_tags,
        foods.nutrient_tags,
        foods.list_status,
        foods.image_path,
        foods.image_source,
        foods.is_active,
        foods.updated_at,
        rules.allergen_flags,
        rules.condition_flags,
        rules.confidence,
        rules.safety_notes,
        coalesce(alias_rows.aliases, '{}'::text[]) as aliases,
        default_serving.default_serving,
        coalesce(translation_rows.translations, '{}'::jsonb) as translations,
        coalesce(nutrient_rows.nutrient_profile, '[]'::jsonb) as nutrient_profile
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
          array_remove(array_agg(distinct food_aliases.alias order by food_aliases.alias), null),
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
        select jsonb_object_agg(
          food_translations.locale,
          jsonb_build_object(
            'category', food_translations.category,
            'imageAlt', food_translations.image_alt,
            'name', food_translations.name,
            'primaryUseCase', food_translations.primary_use_case,
            'status', food_translations.status,
            'updatedAt', food_translations.updated_at
          )
          order by food_translations.locale
        ) as translations
        from public.food_translations
        where food_translations.food_id = foods.id
      ) translation_rows on true
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
      order by foods.name asc
    `;
    const mappedRows = rows.map(rowFromDb);

    return {
      categories: [...new Set(mappedRows.map((row) => row.category))].sort(),
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows: mappedRows,
      summary: buildSummary(mappedRows)
    };
  } catch (error) {
    console.error("Unable to load food governance data", error);
    return emptyAdminFoodsData();
  }
}

export async function updateAdminFood(input: UpdateAdminFoodInput) {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  const ruleId = randomUUID();
  const auditId = randomUUID();
  const benefitTags = normalizeFoodBenefitTags(input.benefitTags);
  const defaultServing =
    input.defaultServing === undefined
      ? undefined
      : normalizeFoodServingSize(input.defaultServing);
  const nutrientProfile = normalizeFoodNutrientProfileInput(
    input.nutrientProfile
  );
  const nutrientTags = normalizeFoodNutrientTags(input.nutrientTags);
  const imagePath =
    input.imagePath === undefined ? undefined : nullableText(input.imagePath);
  const imageSource =
    input.imageSource === undefined
      ? undefined
      : nullableText(input.imageSource) ?? "admin";
  const imagePathValue = imagePath ?? null;
  const imageSourceValue = imageSource ?? null;
  const rows = await sql<FoodDbRow[]>`
    with updated_food as (
      update public.foods set
        benefit_tags = case
          when ${input.benefitTags === undefined} then benefit_tags
          else ${benefitTags}::text[]
        end,
        list_status = ${input.listStatus},
        image_path = case
          when ${input.imagePath === undefined} then image_path
          else ${imagePathValue}
        end,
        image_source = case
          when ${input.imageSource === undefined} then image_source
          else ${imageSourceValue}
        end,
        image_updated_at = case
          when ${input.imagePath === undefined && input.imageSource === undefined}
            then image_updated_at
          else now()
        end,
        nutrient_tags = case
          when ${input.nutrientTags === undefined} then nutrient_tags
          else ${nutrientTags}::text[]
        end,
        is_active = ${input.listStatus !== "inactive"},
        updated_at = now()
      where id = ${input.id}::uuid
      returning *
    ),
    latest_rule as (
      select coalesce(max(version), 0) + 1 as version
      from public.food_safety_rules
      where food_id = ${input.id}::uuid
    ),
    inserted_rule as (
      insert into public.food_safety_rules (
        id,
        food_id,
        version,
        allergen_flags,
        condition_flags,
        confidence,
        safety_notes,
        created_at,
        updated_at
      )
      select
        ${ruleId}::uuid,
        updated_food.id,
        latest_rule.version,
        coalesce(previous_rule.allergen_flags, '{}'::text[]),
        coalesce(previous_rule.condition_flags, '{}'::text[]),
        ${input.confidence},
        ${input.safetyNotes},
        now(),
        now()
      from updated_food
      cross join latest_rule
      left join lateral (
        select allergen_flags, condition_flags
        from public.food_safety_rules
        where food_id = updated_food.id
        order by version desc
        limit 1
      ) previous_rule on true
      returning *
    )
    select
      updated_food.id::text,
      updated_food.name,
      updated_food.category,
      updated_food.primary_use_case,
      updated_food.benefit_tags,
      updated_food.nutrient_tags,
      updated_food.list_status,
      updated_food.image_path,
      updated_food.image_source,
      updated_food.is_active,
      updated_food.updated_at,
      inserted_rule.allergen_flags,
      inserted_rule.condition_flags,
      inserted_rule.confidence,
      inserted_rule.safety_notes,
      (
        select coalesce(array_remove(array_agg(alias), null), '{}'::text[])
        from public.food_aliases
        where food_id = updated_food.id
      ) as aliases,
      (
        select coalesce(jsonb_object_agg(
          food_translations.locale,
          jsonb_build_object(
            'category', food_translations.category,
            'imageAlt', food_translations.image_alt,
            'name', food_translations.name,
            'primaryUseCase', food_translations.primary_use_case,
            'status', food_translations.status,
            'updatedAt', food_translations.updated_at
          )
        ), '{}'::jsonb)
        from public.food_translations
        where food_translations.food_id = updated_food.id
      ) as translations,
      null::jsonb as default_serving,
      '[]'::jsonb as nutrient_profile
    from updated_food
    join inserted_rule on inserted_rule.food_id = updated_food.id
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  if (input.translations) {
    for (const [locale, translation] of Object.entries(input.translations)) {
      const normalizedLocale = locale.trim().toLowerCase();

      if (!/^[a-z]{2}(?:-[a-z0-9]{2,8})?$/.test(normalizedLocale)) {
        continue;
      }

      await sql`
        insert into public.food_translations (
          food_id,
          locale,
          name,
          category,
          primary_use_case,
          image_alt,
          status,
          updated_at
        )
        values (
          ${input.id}::uuid,
          ${normalizedLocale},
          ${nullableText(translation.name) ?? row.name},
          ${nullableText(translation.category)},
          ${nullableText(translation.primaryUseCase)},
          ${nullableText(translation.imageAlt)},
          ${translationStatus(translation.status)},
          now()
        )
        on conflict (food_id, locale) do update set
          name = excluded.name,
          category = excluded.category,
          primary_use_case = excluded.primary_use_case,
          image_alt = excluded.image_alt,
          status = excluded.status,
          updated_at = now()
      `;
    }
  }

  if (input.defaultServing !== undefined) {
    if (!defaultServing) {
      await sql`
        update public.food_serving_sizes
        set is_default = false,
            updated_at = now()
        where food_id = ${input.id}::uuid
      `;
    } else {
      await sql`
        with cleared as (
          update public.food_serving_sizes
          set is_default = false,
              updated_at = now()
          where food_id = ${input.id}::uuid
        )
        insert into public.food_serving_sizes (
          food_id,
          label,
          grams,
          is_default,
          source,
          created_at,
          updated_at
        )
        values (
          ${input.id}::uuid,
          ${defaultServing.label},
          ${defaultServing.grams},
          true,
          ${defaultServing.source ?? "admin"},
          now(),
          now()
        )
        on conflict (food_id, label) do update
        set
          grams = excluded.grams,
          is_default = true,
          source = excluded.source,
          updated_at = now()
      `;
    }
  }

  if (nutrientProfile !== undefined && nutrientProfile !== null) {
    const profileRows = nutrientProfile
      .filter((value) => value.amountPer100g !== null)
      .map((value) => ({
        amount_per_100g: value.amountPer100g,
        confidence: value.confidence ?? "moderate",
        nutrient_id: value.nutrientId,
        source: value.source ?? "admin"
      }));

    await sql`
      with input_rows as (
        select *
        from jsonb_to_recordset(${sql.json(profileRows)}::jsonb) as x(
          nutrient_id text,
          amount_per_100g numeric,
          source text,
          confidence text
        )
      ),
      deleted as (
        delete from public.food_nutrient_profiles
        where food_id = ${input.id}::uuid
          and nutrient_id not in (select nutrient_id from input_rows)
      )
      insert into public.food_nutrient_profiles (
        food_id,
        nutrient_id,
        amount_per_100g,
        source,
        source_url,
        confidence,
        created_at,
        updated_at
      )
      select
        ${input.id}::uuid,
        input_rows.nutrient_id,
        input_rows.amount_per_100g,
        input_rows.source,
        null,
        input_rows.confidence,
        now(),
        now()
      from input_rows
      join public.nutrients
        on nutrients.id = input_rows.nutrient_id
      on conflict (food_id, nutrient_id) do update
      set
        amount_per_100g = excluded.amount_per_100g,
        source = excluded.source,
        source_url = excluded.source_url,
        confidence = excluded.confidence,
        updated_at = now()
    `;
  }

  await sql`
    insert into public.food_admin_audit (
      id,
      food_id,
      actor_id,
      action,
      after_state,
      created_at
    )
    values (
      ${auditId}::uuid,
      ${input.id}::uuid,
      ${input.actor ?? null},
      'update_food',
      ${sql.json({
        confidence: input.confidence,
        benefitTags,
        defaultServing,
        listStatus: input.listStatus,
        nutrientProfile,
        nutrientTags,
        safetyNotes: input.safetyNotes
      })},
      now()
    )
  `;

  const data = await getAdminFoodsData();
  return data.rows.find((item) => item.id === input.id) ?? rowFromDb(row);
}
