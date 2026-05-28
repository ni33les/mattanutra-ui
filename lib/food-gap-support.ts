import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type {
  FoodGapSupport,
  FoodGapSupportItem,
  FoodGapSupportVariant,
  FoodGuidanceBlueprint,
  FormulationBlueprint,
  PlanChatMessage,
  PlanFeedbackItem,
  ProductNeedCoverage,
  ProductStackPreference
} from "@/lib/formulation-types";
import { foodGapSupportVersion } from "@/lib/managed-foods";
import type { Locale } from "@/lib/i18n";

type AnalysisAuditEvent = {
  eventType: string;
  level?: "critical" | "high" | "low" | "medium";
  payload?: Record<string, unknown>;
};

export type ManagedFoodCatalogItem = Readonly<{
  benefitTags: string[];
  category: string;
  foodId: string;
  imagePath: string;
  normalizedName: string;
  nutrientTags: string[];
  primaryUseCase: string | null;
  translations: Readonly<Record<"en" | "th", {
    category: string;
    imageAlt: string;
    name: string;
    primaryUseCase: string;
  }>>;
}>;

export type FoodGapProductVariant = Readonly<{
  needCoverage: ProductNeedCoverage[];
  recommendationCount?: number;
  runId?: string | null;
  stackCoveragePercent?: number;
  stackPreference: ProductStackPreference;
}>;

type AnalysisInput = Readonly<{
  answers: unknown;
  audit?: (event: AnalysisAuditEvent) => Promise<void>;
  chatMessages?: PlanChatMessage[];
  locale: Locale;
  managedFoods: ManagedFoodCatalogItem[];
  plan: AssessmentPlan;
  planFeedback?: PlanFeedbackItem[];
  planId: string;
  previousFoodGuidance?: FoodGuidanceBlueprint | null;
  previousFormulation?: FormulationBlueprint | null;
  productVariants: FoodGapProductVariant[];
  taskId?: string | null;
}>;

type AnalysisResult = Readonly<{
  attempts: number;
  fallbackUsed?: boolean;
  foodGapSupport: FoodGapSupport;
  model: string;
  promptVersion: string;
  reasoningEffort: string;
  responseId?: string;
  usage?: unknown;
}>;

const DEFAULT_PROMPT_VERSION = "food-gap:v1";
const FOOD_GAP_COVERAGE_THRESHOLD = 90;
const STACK_PREFERENCES = ["balanced", "compact"] as const;
const ALLOWED_TOP_LEVEL_KEYS = new Set(["variants"]);
const ALLOWED_VARIANT_KEYS = new Set(["body", "headline", "items"]);
const ALLOWED_ITEM_KEYS = new Set([
  "foodId",
  "frequency",
  "gapNeedIds",
  "position",
  "rationale",
  "serving"
]);
const bannedCopyPattern =
  /\b(?:cure|diagnose|heal|prevent|prescribe|reverse|treat|treatment)\b/i;
const markdownOrHtmlPattern = /(?:<[^>]+>|\*\*|__|```|^#{1,6}\s)/m;
const placeholderCopyValues = new Set([
  "english body",
  "english headline",
  "one plain wellness sentence no medical claims",
  "thai body",
  "thai headline",
  "หนึ่งประโยคภาษาไทยเพื่อสุขภาวะ ไม่ใช่คำกล่าวอ้างทางการแพทย์"
]);

const servingByFood: Record<string, Record<"en" | "th", string>> = {
  brown_rice: { en: "1 small bowl", th: "1 ถ้วยเล็ก" },
  chia_seeds: { en: "1 tbsp", th: "1 ช้อนโต๊ะ" },
  chickpeas: { en: "1/2 cup cooked", th: "ถั่วสุก 1/2 ถ้วย" },
  flaxseed: { en: "1 tbsp ground", th: "บด 1 ช้อนโต๊ะ" },
  ginger_tea: { en: "1 cup", th: "1 ถ้วย" },
  green_tea: { en: "1 cup", th: "1 ถ้วย" },
  holy_basil: { en: "1 handful cooked", th: "ปรุงสุก 1 กำมือ" },
  kimchi: { en: "2-3 tbsp", th: "2-3 ช้อนโต๊ะ" },
  lentils: { en: "1/2 cup cooked", th: "เลนทิลสุก 1/2 ถ้วย" },
  moringa_leaves: { en: "1 small bowl cooked", th: "ปรุงสุก 1 ถ้วยเล็ก" },
  mung_beans: { en: "1/2 cup cooked", th: "ถั่วเขียวสุก 1/2 ถ้วย" },
  oats: { en: "1 small bowl", th: "1 ถ้วยเล็ก" },
  papaya: { en: "1 small bowl", th: "1 ถ้วยเล็ก" },
  pumpkin_seeds: { en: "1 small handful", th: "1 กำมือเล็ก" },
  salmon: { en: "1 palm-sized portion", th: "1 ชิ้นขนาดฝ่ามือ" },
  sardines: { en: "1 small tin or portion", th: "1 กระป๋องเล็กหรือ 1 ส่วน" },
  sesame_seeds: { en: "1 tbsp", th: "1 ช้อนโต๊ะ" },
  tofu: { en: "1 palm-sized portion", th: "1 ชิ้นขนาดฝ่ามือ" },
  turmeric: { en: "1-2 tsp in cooking", th: "1-2 ช้อนชาในอาหาร" },
  unsweetened_yogurt: { en: "1 small bowl", th: "1 ถ้วยเล็ก" }
};

const frequencyByFood: Record<string, Record<"en" | "th", string>> = {
  ginger_tea: { en: "3-5 times/week", th: "3-5 ครั้งต่อสัปดาห์" },
  green_tea: { en: "3-5 times/week", th: "3-5 ครั้งต่อสัปดาห์" },
  kimchi: { en: "3-4 times/week", th: "3-4 ครั้งต่อสัปดาห์" },
  salmon: { en: "1-2 times/week", th: "1-2 ครั้งต่อสัปดาห์" },
  sardines: { en: "1-2 times/week", th: "1-2 ครั้งต่อสัปดาห์" },
  turmeric: { en: "most cooking days", th: "ในมื้ออาหารหลายวันต่อสัปดาห์" }
};

const foodNeedRules = [
  {
    foods: ["salmon", "sardines", "chia_seeds", "flaxseed"],
    patterns: ["omega", "dha", "epa", "fatty acid"],
    tags: ["omega_3", "fatty_acids"]
  },
  {
    foods: ["pumpkin_seeds", "chia_seeds", "sesame_seeds", "brown_rice", "oats"],
    patterns: ["magnesium"],
    tags: ["magnesium"]
  },
  {
    foods: ["pumpkin_seeds", "sesame_seeds", "chickpeas", "lentils"],
    patterns: ["zinc"],
    tags: ["zinc"]
  },
  {
    foods: ["sardines", "sesame_seeds", "unsweetened_yogurt", "tofu"],
    patterns: ["calcium"],
    tags: ["calcium"]
  },
  {
    foods: ["papaya", "moringa_leaves"],
    patterns: ["vitamin c", "ascorb"],
    tags: ["vitamin_c"]
  },
  {
    foods: ["salmon", "sardines"],
    patterns: ["vitamin d", "vitamin d3", "d3", "cholecalciferol"],
    tags: ["vitamin_d"]
  },
  {
    foods: ["salmon", "sardines", "unsweetened_yogurt"],
    patterns: ["vitamin b12", "b12", "cobalamin"],
    tags: ["vitamin_b12", "b12"]
  },
  {
    foods: ["oats", "lentils", "chickpeas", "mung_beans", "chia_seeds", "flaxseed"],
    patterns: ["fiber", "fibre", "prebiotic"],
    tags: ["fiber", "prebiotic"]
  },
  {
    foods: ["kimchi", "unsweetened_yogurt"],
    patterns: ["probiotic", "microbiome", "gut"],
    tags: ["probiotic", "gut_health"]
  },
  {
    foods: ["turmeric"],
    patterns: ["curcumin", "turmeric"],
    tags: ["curcumin"]
  },
  {
    foods: ["green_tea", "holy_basil", "moringa_leaves", "turmeric", "papaya"],
    patterns: ["polyphenol", "antioxidant", "inflamm"],
    tags: ["polyphenols", "anti_inflammatory", "antioxidant"]
  },
  {
    foods: ["tofu", "chickpeas", "lentils", "mung_beans"],
    patterns: ["protein", "recovery", "muscle"],
    tags: ["protein"]
  }
] as const;

const animalManagedFoods = new Set(["salmon", "sardines", "unsweetened_yogurt"]);

const managedFoodAllergenMap: Record<string, readonly string[]> = {
  dairy: ["unsweetened_yogurt"],
  fish: ["salmon", "sardines"],
  milk: ["unsweetened_yogurt"],
  sesame: ["sesame_seeds"],
  soy: ["tofu"]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? value.trim() : "";
}

function textSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .trim();
}

function textSearchTokens(value: string) {
  return textSearch(value).split(/\s+/).filter(Boolean);
}

function textSearchMatchesPattern(value: string, pattern: string) {
  const valueTokens = textSearchTokens(value);
  const patternTokens = textSearchTokens(pattern);

  if (patternTokens.length < 1 || valueTokens.length < 1) {
    return false;
  }

  if (patternTokens.length === 1) {
    const [patternToken] = patternTokens;

    if (!patternToken) {
      return false;
    }

    return valueTokens.some((token) =>
      patternToken.length <= 3
        ? token === patternToken
        : token === patternToken || token.startsWith(patternToken)
    );
  }

  return valueTokens.some((_, startIndex) =>
    patternTokens.every((patternToken, offset) => {
      const token = valueTokens[startIndex + offset];

      return Boolean(
        token &&
          (token === patternToken ||
            (patternToken.length > 1 && token.startsWith(patternToken)))
      );
    })
  );
}

function recordValue(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}

function answerText(value: unknown) {
  if (typeof value === "string") {
    return textSearch(value);
  }

  if (isRecord(value)) {
    const candidate =
      value.value ??
      value.answer ??
      value.label ??
      value.en ??
      value.th;

    return answerText(candidate);
  }

  return "";
}

function answerTextValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => answerTextValues(item));
  }

  const text = answerText(value);

  return text ? [text] : [];
}

function localizedCopy(
  en: string,
  th: string
): Record<"en" | "th", string> {
  return { en, th };
}

function localizedFoodName(food: ManagedFoodCatalogItem, locale: "en" | "th") {
  return food.translations[locale]?.name || food.translations.en.name;
}

function localizedNeedNames(needs: readonly ProductNeedCoverage[], locale: "en" | "th") {
  const names = needs
    .map((need) => need.displayName.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (names.length < 1) {
    return locale === "th" ? "ช่องว่างของแผน" : "the remaining plan gaps";
  }

  if (locale === "th") {
    return names.join(" และ ");
  }

  return names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
}

function englishFoodSupportVerb(foodName: string) {
  return foodName.endsWith("s") ? "give" : "gives";
}

export function foodGapNeedsForVariant(
  variant: FoodGapProductVariant,
  threshold = FOOD_GAP_COVERAGE_THRESHOLD
) {
  return variant.needCoverage
    .filter((need) =>
      need.itemType === "supplement" &&
      Number.isFinite(need.coveragePercent) &&
      need.coveragePercent < threshold
    )
    .sort((first, second) => first.coveragePercent - second.coveragePercent);
}

export function managedFoodSupportsNeed(
  food: ManagedFoodCatalogItem,
  need: ProductNeedCoverage
) {
  const needText = `${need.id} ${need.displayName}`;

  return foodNeedRules.some((rule) => {
    const ruleMatchesNeed =
      rule.patterns.some((pattern) => textSearchMatchesPattern(needText, pattern)) ||
      rule.tags.some((tag) =>
        textSearchMatchesPattern(needText, tag.replace(/_/g, " "))
      );

    return ruleMatchesNeed && rule.foods.includes(food.normalizedName as never);
  });
}

function foodExcludedByAssessment(
  food: ManagedFoodCatalogItem,
  answers: unknown
) {
  const diet = answerText(recordValue(answers, "diet"));

  if (
    (diet.includes("plant") || diet.includes("vegan")) &&
    animalManagedFoods.has(food.normalizedName)
  ) {
    return true;
  }

  const allergyValues = new Set([
    ...answerTextValues(recordValue(answers, "allergies")),
    ...answerTextValues(recordValue(answers, "allergy"))
  ].filter((value) => value && value !== "none"));

  for (const allergy of allergyValues) {
    const excludedFoods = managedFoodAllergenMap[allergy] ?? [];

    if (excludedFoods.includes(food.normalizedName)) {
      return true;
    }
  }

  return false;
}

function eligibleManagedFoods(input: AnalysisInput) {
  return input.managedFoods.filter((food) =>
    !foodExcludedByAssessment(food, input.answers)
  );
}

function supportableFoodGapNeedsForVariant(
  variant: FoodGapProductVariant,
  managedFoods: readonly ManagedFoodCatalogItem[]
) {
  return foodGapNeedsForVariant(variant).filter((need) =>
    managedFoods.some((food) => managedFoodSupportsNeed(food, need))
  );
}

function scoreFoodForNeeds(
  food: ManagedFoodCatalogItem,
  needs: readonly ProductNeedCoverage[]
) {
  const foodText = textSearch([
    food.normalizedName,
    food.category,
    food.primaryUseCase,
    ...food.benefitTags,
    ...food.nutrientTags,
    food.translations.en.name,
    food.translations.en.primaryUseCase
  ].filter(Boolean).join(" "));
  const normalizedName = food.normalizedName;
  let score = 0;

  for (const need of needs) {
    if (!managedFoodSupportsNeed(food, need)) {
      continue;
    }

    const needText = `${need.id} ${need.displayName}`;

    for (const rule of foodNeedRules) {
      const ruleMatchesNeed =
        rule.patterns.some((pattern) => textSearchMatchesPattern(needText, pattern)) ||
        rule.tags.some((tag) =>
          textSearchMatchesPattern(needText, tag.replace(/_/g, " "))
        );

      if (!ruleMatchesNeed) {
        continue;
      }

      if (rule.foods.includes(normalizedName as never)) {
        score += 10;
      }

      if (rule.tags.some((tag) => food.nutrientTags.includes(tag) || food.benefitTags.includes(tag))) {
        score += 6;
      }

      if (rule.patterns.some((pattern) => textSearchMatchesPattern(foodText, pattern))) {
        score += 3;
      }
    }

    if (textSearchMatchesPattern(foodText, need.displayName)) {
      score += 2;
    }
  }

  return score;
}

function previousFoodRank(
  food: ManagedFoodCatalogItem,
  previousFoodGuidance?: FoodGuidanceBlueprint | null
) {
  const previousItems = previousFoodGuidance?.foodGuidance ?? [];
  const byFoodId = previousItems.find((item) => item.foodId === food.foodId);
  const byName = previousItems.find((item) =>
    textSearch(
      typeof item.food === "string"
        ? item.food
        : Object.values(item.food).join(" ")
    ).includes(textSearch(food.translations.en.name))
  );
  const rank = byFoodId?.effectivenessRank ?? byName?.effectivenessRank;

  return Number.isFinite(rank) ? Number(rank) : 999;
}

function fallbackFoodSelection(
  input: AnalysisInput,
  variant: FoodGapProductVariant
) {
  const gaps = supportableFoodGapNeedsForVariant(variant, input.managedFoods);

  if (gaps.length < 1) {
    return [];
  }

  const scored = input.managedFoods
    .map((food, index) => ({
      food,
      index,
      previousRank: previousFoodRank(food, input.previousFoodGuidance),
      score: scoreFoodForNeeds(food, gaps)
    }))
    .filter((item) => item.score > 0)
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      if (first.previousRank !== second.previousRank) {
        return first.previousRank - second.previousRank;
      }

      return first.index - second.index;
    });

  return scored
    .slice(0, 6)
    .map((item) => item.food)
    .filter((food, index, all) =>
      index === all.findIndex((candidate) => candidate.foodId === food.foodId)
    );
}

function fallbackItem(
  food: ManagedFoodCatalogItem,
  position: number,
  gaps: readonly ProductNeedCoverage[]
): FoodGapSupportItem {
  const relatedGaps = [...gaps]
    .filter((gap) => managedFoodSupportsNeed(food, gap))
    .sort((first, second) =>
      scoreFoodForNeeds(food, [second]) - scoreFoodForNeeds(food, [first])
    )
    .slice(0, 2);
  const enName = localizedFoodName(food, "en");
  const thName = localizedFoodName(food, "th");
  const serving =
    servingByFood[food.normalizedName] ?? localizedCopy("1 practical serving", "1 ส่วนที่รับประทานได้จริง");
  const frequency =
    frequencyByFood[food.normalizedName] ?? localizedCopy("3-4 times/week", "3-4 ครั้งต่อสัปดาห์");

  return {
    category: {
      en: food.translations.en.category || food.category,
      th: food.translations.th.category || food.category
    },
    food: { en: enName, th: thName },
    foodId: food.foodId,
    frequency,
    gapNeedIds: relatedGaps.map((need) => need.id),
    imageAlt: {
      en: food.translations.en.imageAlt || enName,
      th: food.translations.th.imageAlt || thName
    },
    imagePath: food.imagePath,
    position,
    rationale: localizedCopy(
      `${enName} ${englishFoodSupportVerb(enName)} food-level support around ${localizedNeedNames(relatedGaps, "en")} without changing the product coverage math.`,
      `${thName} ช่วยเสริมจากอาหารสำหรับ ${localizedNeedNames(relatedGaps, "th")} โดยไม่เปลี่ยนการคำนวณความครอบคลุมของผลิตภัณฑ์`
    ),
    serving
  };
}

function fallbackVariant(
  input: AnalysisInput,
  variant: FoodGapProductVariant
): FoodGapSupportVariant {
  const gaps = supportableFoodGapNeedsForVariant(variant, input.managedFoods);
  const selectedFoods = fallbackFoodSelection(input, variant);

  return {
    body: localizedCopy(
      "These foods come from the managed catalogue and are selected only for supplement needs the current product stack does not fully cover.",
      "อาหารเหล่านี้มาจากแคตตาล็อกที่จัดการไว้ และเลือกเฉพาะส่วนของสารอาหารที่ชุดผลิตภัณฑ์ยังครอบคลุมได้ไม่เต็มที่"
    ),
    headline: localizedCopy(
      "Food support for the remaining gaps.",
      "อาหารเสริมแรงสำหรับช่องว่างที่เหลือ"
    ),
    items: selectedFoods.map((food, index) =>
      fallbackItem(food, index + 1, gaps)
    )
  };
}

function variantForPreference(
  variants: readonly FoodGapProductVariant[],
  preference: ProductStackPreference
) {
  return (
    variants.find((variant) => variant.stackPreference === preference) ??
    variants.find((variant) => variant.stackPreference === "balanced") ??
    variants[0] ??
    {
      needCoverage: [],
      stackPreference: preference
    }
  );
}

export function buildFoodGapSupportFallback(input: AnalysisInput): FoodGapSupport {
  const fallbackInput = {
    ...input,
    managedFoods: eligibleManagedFoods(input)
  } satisfies AnalysisInput;

  return {
    generatedAt: new Date().toISOString(),
    version: foodGapSupportVersion,
    variants: {
      balanced: fallbackVariant(
        fallbackInput,
        variantForPreference(fallbackInput.productVariants, "balanced")
      ),
      compact: fallbackVariant(
        fallbackInput,
        variantForPreference(fallbackInput.productVariants, "compact")
      )
    }
  };
}

function readLocalizedObject(
  value: unknown,
  path: string,
  errors: string[]
): Record<"en" | "th", string> {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object with en and th strings`);
    return { en: "", th: "" };
  }

  const extraLocales = Object.keys(value).filter((key) => key !== "en" && key !== "th");

  if (extraLocales.length > 0) {
    errors.push(`${path} has unsupported locales: ${extraLocales.join(", ")}`);
  }

  const en = readText(value, "en");
  const th = readText(value, "th");

  if (!en || !th) {
    errors.push(`${path} must include non-empty en and th strings`);
  }

  for (const [locale, text] of Object.entries({ en, th })) {
    if (placeholderCopyValues.has(textSearch(text))) {
      errors.push(`${path}.${locale} must not copy the schema placeholder text`);
    }

    if (markdownOrHtmlPattern.test(text)) {
      errors.push(`${path}.${locale} must not include HTML or markdown`);
    }

    if (bannedCopyPattern.test(text)) {
      errors.push(`${path}.${locale} includes banned medical wording`);
    }
  }

  return { en, th };
}

function validateFoodGapVariant(
  value: unknown,
  preference: ProductStackPreference,
  catalogById: ReadonlyMap<string, ManagedFoodCatalogItem>,
  allowedNeedIds: ReadonlySet<string>,
  supportableGapNeedIds: ReadonlySet<string>,
  gapById: ReadonlyMap<string, ProductNeedCoverage>,
  errors: string[]
): FoodGapSupportVariant {
  const fallback = {
    body: { en: "", th: "" },
    headline: { en: "", th: "" },
    items: []
  };

  if (!isRecord(value)) {
    errors.push(`variants.${preference} must be an object`);
    return fallback;
  }

  const unexpectedVariantKeys = Object.keys(value).filter((key) =>
    !ALLOWED_VARIANT_KEYS.has(key)
  );

  if (unexpectedVariantKeys.length > 0) {
    errors.push(
      `variants.${preference} has unsupported keys: ${unexpectedVariantKeys.join(", ")}`
    );
  }

  const rawItems = value.items;
  const items: FoodGapSupportItem[] = [];

  if (!Array.isArray(rawItems)) {
    errors.push(`variants.${preference}.items must be an array`);
  } else if (supportableGapNeedIds.size < 1 && rawItems.length !== 0) {
    errors.push(
      `variants.${preference}.items must be empty when no product gaps are food-supportable`
    );
  } else if (
    supportableGapNeedIds.size > 0 &&
    (rawItems.length < 1 || rawItems.length > 6)
  ) {
    errors.push(`variants.${preference}.items must contain 1 to 6 foods`);
  } else {
    const seenFoods = new Set<string>();
    const seenPositions = new Set<number>();

    rawItems.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(`variants.${preference}.items[${index}] must be an object`);
        return;
      }

      const unexpectedItemKeys = Object.keys(item).filter((key) =>
        !ALLOWED_ITEM_KEYS.has(key)
      );

      if (unexpectedItemKeys.length > 0) {
        errors.push(
          `variants.${preference}.items[${index}] has unsupported keys: ${unexpectedItemKeys.join(", ")}`
        );
      }

      const foodId = readText(item, "foodId");
      const food = catalogById.get(foodId);

      if (!food) {
        errors.push(`variants.${preference}.items[${index}].foodId is not a managed food`);
        return;
      }

      if (seenFoods.has(foodId)) {
        errors.push(`variants.${preference}.items[${index}].foodId is duplicated`);
      }

      seenFoods.add(foodId);

      const rawGapNeedIds = item.gapNeedIds;
      const gapNeedIds = Array.isArray(rawGapNeedIds)
        ? rawGapNeedIds.filter((needId): needId is string =>
            typeof needId === "string" && needId.trim().length > 0
          )
        : [];

      if (!Array.isArray(rawGapNeedIds)) {
        errors.push(`variants.${preference}.items[${index}].gapNeedIds must be an array`);
      }

      if (supportableGapNeedIds.size > 0 && gapNeedIds.length < 1) {
        errors.push(
          `variants.${preference}.items[${index}].gapNeedIds must reference at least one supportable product gap`
        );
      }

      const unknownNeedIds = gapNeedIds.filter((needId) =>
        !allowedNeedIds.has(needId)
      );

      if (unknownNeedIds.length > 0) {
        errors.push(
          `variants.${preference}.items[${index}].gapNeedIds includes unknown needs: ${unknownNeedIds.join(", ")}`
        );
      }

      const nonGapNeedIds = gapNeedIds.filter((needId) =>
        supportableGapNeedIds.size > 0
          ? !supportableGapNeedIds.has(needId)
          : allowedNeedIds.has(needId)
      );

      if (nonGapNeedIds.length > 0) {
        errors.push(
          `variants.${preference}.items[${index}].gapNeedIds must reference supportable supplement gaps below 90% only: ${nonGapNeedIds.join(", ")}`
        );
      }

      const unsupportedNeedIds = gapNeedIds.filter((needId) => {
        const need = gapById.get(needId);

        return need ? !managedFoodSupportsNeed(food, need) : false;
      });

      if (unsupportedNeedIds.length > 0) {
        errors.push(
          `variants.${preference}.items[${index}].gapNeedIds includes needs not supported by ${food.translations.en.name}: ${unsupportedNeedIds.join(", ")}`
        );
      }

      const position = Number(item.position);

      if (!Number.isInteger(position) || position < 1 || position > rawItems.length) {
        errors.push(
          `variants.${preference}.items[${index}].position must be an integer from 1 to ${rawItems.length}`
        );
      } else if (seenPositions.has(position)) {
        errors.push(`variants.${preference}.items[${index}].position is duplicated`);
      } else {
        seenPositions.add(position);
      }

      items.push({
        category: {
          en: food.translations.en.category || food.category,
          th: food.translations.th.category || food.category
        },
        food: {
          en: food.translations.en.name,
          th: food.translations.th.name
        },
        foodId,
        frequency: readLocalizedObject(
          item.frequency,
          `variants.${preference}.items[${index}].frequency`,
          errors
        ),
        gapNeedIds,
        imageAlt: {
          en: food.translations.en.imageAlt || food.translations.en.name,
          th: food.translations.th.imageAlt || food.translations.th.name
        },
        imagePath: food.imagePath,
        position,
        rationale: readLocalizedObject(
          item.rationale,
          `variants.${preference}.items[${index}].rationale`,
          errors
        ),
        serving: readLocalizedObject(
          item.serving,
          `variants.${preference}.items[${index}].serving`,
          errors
        )
      });
    });
  }

  return {
    body: readLocalizedObject(value.body, `variants.${preference}.body`, errors),
    headline: readLocalizedObject(
      value.headline,
      `variants.${preference}.headline`,
      errors
    ),
    items: items.sort((first, second) => first.position - second.position)
  };
}

export function validateFoodGapSupportPayload(
  value: unknown,
  input: Readonly<{
    managedFoods: readonly ManagedFoodCatalogItem[];
    productVariants: readonly FoodGapProductVariant[];
  }>
) {
  const errors: string[] = [];
  const catalogById = new Map(input.managedFoods.map((food) => [food.foodId, food]));

  if (!isRecord(value)) {
    return { errors: ["Top-level response must be a JSON object"] };
  }

  const unexpectedTopLevelKeys = Object.keys(value).filter((key) =>
    !ALLOWED_TOP_LEVEL_KEYS.has(key)
  );

  if (unexpectedTopLevelKeys.length > 0) {
    errors.push(
      `Top-level response has unsupported keys: ${unexpectedTopLevelKeys.join(", ")}`
    );
  }

  if (!isRecord(value.variants)) {
    return { errors: [...errors, "variants must be an object"] };
  }

  const unexpectedVariantNames = Object.keys(value.variants).filter((key) =>
    key !== "balanced" && key !== "compact"
  );

  if (unexpectedVariantNames.length > 0) {
    errors.push(`variants has unsupported keys: ${unexpectedVariantNames.join(", ")}`);
  }

  const variantNeedIds = (preference: ProductStackPreference) =>
    new Set(
      variantForPreference(input.productVariants, preference).needCoverage.map(
        (need) => need.id
      )
    );
  const variantGapById = (preference: ProductStackPreference) =>
    new Map(
      foodGapNeedsForVariant(variantForPreference(input.productVariants, preference))
        .map((need) => [need.id, need] as const)
    );
  const variantGapNeedIds = (preference: ProductStackPreference) =>
    new Set(
      supportableFoodGapNeedsForVariant(
        variantForPreference(input.productVariants, preference),
        input.managedFoods
      )
        .map((need) => need.id)
    );
  const variants = {
    balanced: validateFoodGapVariant(
      value.variants.balanced,
      "balanced",
      catalogById,
      variantNeedIds("balanced"),
      variantGapNeedIds("balanced"),
      variantGapById("balanced"),
      errors
    ),
    compact: validateFoodGapVariant(
      value.variants.compact,
      "compact",
      catalogById,
      variantNeedIds("compact"),
      variantGapNeedIds("compact"),
      variantGapById("compact"),
      errors
    )
  };

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors,
    foodGapSupport: {
      generatedAt: new Date().toISOString(),
      version: foodGapSupportVersion,
      variants
    } satisfies FoodGapSupport
  };
}

async function audit(input: AnalysisInput, event: AnalysisAuditEvent) {
  await input.audit?.(event);
}

export async function analyzeFoodGapSupportDeterministically(
  input: AnalysisInput
): Promise<AnalysisResult> {
  const analysisInput = {
    ...input,
    managedFoods: eligibleManagedFoods(input)
  } satisfies AnalysisInput;

  await audit(input, {
    eventType: "food_gap_deterministic_generated",
    level: "low",
    payload: {
      managedFoodCount: analysisInput.managedFoods.length,
      promptVersion: DEFAULT_PROMPT_VERSION,
      supportableGapVariants: STACK_PREFERENCES.filter((preference) =>
        supportableFoodGapNeedsForVariant(
          variantForPreference(analysisInput.productVariants, preference),
          analysisInput.managedFoods
        ).length > 0
      )
    }
  });

  return {
    attempts: 0,
    foodGapSupport: buildFoodGapSupportFallback(analysisInput),
    model: "deterministic",
    promptVersion: DEFAULT_PROMPT_VERSION,
    reasoningEffort: "none"
  };
}
