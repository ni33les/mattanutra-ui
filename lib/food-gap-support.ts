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
import { defaultLocale, type Locale } from "@/lib/i18n";

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

type XaiChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  id?: string;
  model?: string;
  usage?: unknown;
};

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-4.3";
const DEFAULT_REASONING_EFFORT = "low";
const DEFAULT_PROMPT_VERSION = "food-gap:v1";
const FOOD_GAP_COVERAGE_THRESHOLD = 90;
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 240_000;
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
    patterns: ["vitamin d"],
    tags: ["vitamin_d"]
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
    foods: ["green_tea", "holy_basil", "moringa_leaves", "turmeric", "papaya"],
    patterns: ["polyphenol", "antioxidant", "inflamm", "curcumin"],
    tags: ["polyphenols", "anti_inflammatory", "antioxidant"]
  },
  {
    foods: ["tofu", "chickpeas", "lentils", "mung_beans"],
    patterns: ["protein", "recovery", "muscle"],
    tags: ["protein"]
  }
] as const;

function configured(value: string | undefined) {
  return value?.trim() ?? "";
}

function getGrokConfig() {
  const apiKey = configured(process.env.XAI_API_KEY);

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model:
      configured(process.env.FOOD_GAP_SUPPORT_MODEL) ||
      configured(process.env.GROK_MODEL) ||
      DEFAULT_GROK_MODEL,
    promptVersion:
      configured(process.env.FOOD_GAP_SUPPORT_PROMPT_VERSION) ||
      DEFAULT_PROMPT_VERSION,
    reasoningEffort:
      configured(process.env.FOOD_GAP_SUPPORT_REASONING_EFFORT) ||
      configured(process.env.FOOD_GUIDANCE_REASONING_EFFORT) ||
      DEFAULT_REASONING_EFFORT
  };
}

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
    const needText = textSearch(`${need.id} ${need.displayName}`);

    for (const rule of foodNeedRules) {
      const ruleMatchesNeed =
        rule.patterns.some((pattern) => needText.includes(pattern)) ||
        rule.tags.some((tag) => needText.includes(tag.replace(/_/g, " ")));

      if (!ruleMatchesNeed) {
        continue;
      }

      if (rule.foods.includes(normalizedName as never)) {
        score += 10;
      }

      if (rule.tags.some((tag) => food.nutrientTags.includes(tag) || food.benefitTags.includes(tag))) {
        score += 6;
      }

      if (rule.patterns.some((pattern) => foodText.includes(pattern))) {
        score += 3;
      }
    }

    if (foodText.includes(needText)) {
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
  const gaps = foodGapNeedsForVariant(variant);
  const scored = input.managedFoods
    .map((food, index) => ({
      food,
      index,
      previousRank: previousFoodRank(food, input.previousFoodGuidance),
      score: gaps.length > 0 ? scoreFoodForNeeds(food, gaps) : 0
    }))
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
    .filter((item) => gaps.length < 1 || item.score > 0)
    .slice(0, 6)
    .map((item) => item.food)
    .concat(
      scored
        .filter((item) => gaps.length < 1 || item.score <= 0)
        .slice(0, 6)
        .map((item) => item.food)
    )
    .filter((food, index, all) =>
      index === all.findIndex((candidate) => candidate.foodId === food.foodId)
    )
    .slice(0, Math.min(6, Math.max(3, input.managedFoods.length)));
}

function fallbackItem(
  food: ManagedFoodCatalogItem,
  position: number,
  gaps: readonly ProductNeedCoverage[]
): FoodGapSupportItem {
  const relatedGaps = [...gaps]
    .sort((first, second) =>
      scoreFoodForNeeds(food, [second]) - scoreFoodForNeeds(food, [first])
    )
    .slice(0, 2);
  const hasGaps = relatedGaps.length > 0;
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
    rationale: hasGaps
      ? localizedCopy(
          `${enName} gives food-level support around ${localizedNeedNames(relatedGaps, "en")} without changing the product coverage math.`,
          `${thName} ช่วยเสริมจากอาหารสำหรับ ${localizedNeedNames(relatedGaps, "th")} โดยไม่เปลี่ยนการคำนวณความครอบคลุมของผลิตภัณฑ์`
        )
      : localizedCopy(
          `${enName} keeps the plan grounded in everyday food while the product stack handles the formula.`,
          `${thName} ช่วยให้แผนยังยึดกับอาหารในชีวิตประจำวัน ขณะที่ชุดผลิตภัณฑ์ทำหน้าที่ตามสูตร`
        ),
    serving
  };
}

function fallbackVariant(
  input: AnalysisInput,
  variant: FoodGapProductVariant
): FoodGapSupportVariant {
  const gaps = foodGapNeedsForVariant(variant);
  const hasGaps = gaps.length > 0;
  const selectedFoods = fallbackFoodSelection(input, variant);

  return {
    body: hasGaps
      ? localizedCopy(
          "These foods come from the managed catalogue and are selected for the needs the current product stack does not fully cover.",
          "อาหารเหล่านี้มาจากแคตตาล็อกที่จัดการไว้ และเลือกตามส่วนที่ชุดผลิตภัณฑ์ยังครอบคลุมได้ไม่เต็มที่"
        )
      : localizedCopy(
          "Products cover the formula well, so this section shifts to food foundations that keep the plan practical.",
          "เมื่อผลิตภัณฑ์ครอบคลุมสูตรได้ดี ส่วนนี้จึงเน้นอาหารพื้นฐานที่ช่วยให้แผนทำได้จริง"
        ),
    headline: hasGaps
      ? localizedCopy(
          "Food support for the remaining gaps.",
          "อาหารเสริมแรงสำหรับช่องว่างที่เหลือ"
        )
      : localizedCopy(
          "Food foundations for the plan.",
          "อาหารพื้นฐานสำหรับแผนนี้"
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
  return {
    generatedAt: new Date().toISOString(),
    version: foodGapSupportVersion,
    variants: {
      balanced: fallbackVariant(input, variantForPreference(input.productVariants, "balanced")),
      compact: fallbackVariant(input, variantForPreference(input.productVariants, "compact"))
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
  } else if (rawItems.length < 3 || rawItems.length > 6) {
    errors.push(`variants.${preference}.items must contain 3 to 6 foods`);
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

      const unknownNeedIds = gapNeedIds.filter((needId) =>
        !allowedNeedIds.has(needId)
      );

      if (unknownNeedIds.length > 0) {
        errors.push(
          `variants.${preference}.items[${index}].gapNeedIds includes unknown needs: ${unknownNeedIds.join(", ")}`
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

export function validateFoodGapSupportAiResponse(
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
  const variants = {
    balanced: validateFoodGapVariant(
      value.variants.balanced,
      "balanced",
      catalogById,
      variantNeedIds("balanced"),
      errors
    ),
    compact: validateFoodGapVariant(
      value.variants.compact,
      "compact",
      catalogById,
      variantNeedIds("compact"),
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

function systemPrompt(promptVersion: string) {
  return [
    `MattaNutra food gap support engine ${promptVersion}.`,
    "You are selecting supportive managed foods for a paid nutrition reveal page.",
    "The product stack coverage numbers are locked. Foods must never be described as product replacements and must not change product coverage math.",
    "Select only foodId values from the managedFoods catalogue in the user payload. Unknown foods are invalid.",
    "Use foods to support supplement needs with product coverage below 90%. If there are no gaps, choose practical food foundations from the same managed catalogue.",
    "Return copy in English and Thai for every localized field.",
    "Do not include supplements, products, marketplace links, diagnoses, treatment claims, HTML, markdown, or prose outside JSON.",
    "The first character of your response must be { and the last character must be }.",
    "Use double-quoted JSON only. Do not use comments, markdown fences, or trailing commas."
  ].join("\n");
}

function userPrompt(input: AnalysisInput) {
  const variants = STACK_PREFERENCES.map((preference) => {
    const variant = variantForPreference(input.productVariants, preference);
    const gaps = foodGapNeedsForVariant(variant);

    return {
      gapNeedsBelow90Percent: gaps.map((need) => ({
        coveragePercent: need.coveragePercent,
        displayName: need.displayName,
        id: need.id,
        reason: need.bestRejectedReason
      })),
      needCoverage: variant.needCoverage.map((need) => ({
        coveragePercent: need.coveragePercent,
        displayName: need.displayName,
        id: need.id,
        itemType: need.itemType
      })),
      recommendationCount: variant.recommendationCount ?? 0,
      stackCoveragePercent: variant.stackCoveragePercent ?? 0,
      stackPreference: preference
    };
  });

  return JSON.stringify(
    {
      assessment: input.answers,
      context: {
        chatMessages: (input.chatMessages ?? []).map((message) => ({
          body: message.body,
          role: message.role
        })),
        planFeedback: input.planFeedback ?? [],
        previousFoodGuidance: input.previousFoodGuidance,
        previousSupplementGuidance: input.previousFormulation
          ? {
              supplementBreakdown:
                input.previousFormulation.supplementBreakdown?.map((item) => ({
                  dailyDose: item.dailyDose,
                  id: item.id,
                  rationale: item.rationale,
                  status: item.status,
                  supplement: item.supplement
                })) ?? [],
              safetySummary: input.previousFormulation.safetySummary
            }
          : null
      },
      contract: {
        variants: {
          balanced: {
            body: { en: "English body", th: "Thai body" },
            headline: { en: "English headline", th: "Thai headline" },
            items: [
              {
                foodId: "managed food UUID only",
                frequency: { en: "3-4 times/week", th: "3-4 ครั้งต่อสัปดาห์" },
                gapNeedIds: ["use ids from that variant's needCoverage only"],
                position: 1,
                rationale: {
                  en: "One plain wellness sentence; no medical claims",
                  th: "หนึ่งประโยคภาษาไทยเพื่อสุขภาวะ ไม่ใช่คำกล่าวอ้างทางการแพทย์"
                },
                serving: { en: "1 practical serving", th: "1 ส่วนที่รับประทานได้จริง" }
              }
            ]
          },
          compact: "same shape as balanced"
        }
      },
      instructions: [
        "Return exactly one top-level key: variants.",
        "Return exactly variants.balanced and variants.compact.",
        "Each variant must include headline, body, and 3 to 6 items.",
        "Each item must include foodId, gapNeedIds, serving, frequency, rationale, and position.",
        "Use unique foodIds and positions within each variant.",
        "Use only managedFoods.foodId values.",
        "gapNeedIds may be empty only for food-foundation items when product coverage has no relevant gap.",
        "Do not invent or mention products, supplements, counts, doses, safety outcomes, FDA status, or coverage values.",
        "Food copy can be personalized to goals, diet, safety flags, and the product gaps, but must not change locked facts."
      ],
      locale: input.locale,
      managedFoods: input.managedFoods.map((food) => ({
        benefitTags: food.benefitTags,
        category: food.category,
        foodId: food.foodId,
        name: food.translations,
        normalizedName: food.normalizedName,
        nutrientTags: food.nutrientTags,
        primaryUseCase: food.primaryUseCase
      })),
      plan: input.plan,
      planId: input.planId,
      productVariants: variants,
      requiredOutputLocales: [defaultLocale, "th"]
    },
    null,
    2
  );
}

function retryPrompt(errors: string[]) {
  return [
    "The previous JSON response failed validation.",
    "Return corrected JSON only, matching the required contract.",
    "Do not include markdown or prose.",
    "Validation errors:",
    ...errors.map((error) => `- ${error}`)
  ].join("\n");
}

function parseJsonObject(content: string | null | undefined) {
  if (!content) {
    throw new Error("Model returned empty content");
  }

  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      const candidate = trimmed
        .slice(start, end + 1)
        .replace(/,\s*([}\]])/g, "$1");

      return JSON.parse(candidate) as unknown;
    }

    throw new Error("Model returned content that was not valid JSON");
  }
}

async function callGrok({
  apiKey,
  messages,
  model,
  reasoningEffort
}: Readonly<{
  apiKey: string;
  messages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  model: string;
  reasoningEffort?: string;
}>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        messages,
        model,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        response_format: { type: "json_object" },
        stream: false,
        temperature: 0.15
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `xAI request failed with ${response.status}: ${body.slice(0, 500)}`
      );
    }

    return (await response.json()) as XaiChatCompletion;
  } finally {
    clearTimeout(timeout);
  }
}

async function audit(input: AnalysisInput, event: AnalysisAuditEvent) {
  await input.audit?.(event);
}

export async function analyzeFoodGapSupportWithGrok(
  input: AnalysisInput
): Promise<AnalysisResult> {
  const fallback = () => buildFoodGapSupportFallback(input);
  const config = getGrokConfig();

  if (!config || input.managedFoods.length < 1) {
    return {
      attempts: 0,
      fallbackUsed: true,
      foodGapSupport: fallback(),
      model: "deterministic",
      promptVersion: DEFAULT_PROMPT_VERSION,
      reasoningEffort: "none"
    };
  }

  const messages: Array<{
    content: string;
    role: "assistant" | "system" | "user";
  }> = [
    { content: systemPrompt(config.promptVersion), role: "system" },
    { content: userPrompt(input), role: "user" }
  ];
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await audit(input, {
      eventType: "food_gap_grok_attempt_started",
      level: "low",
      payload: {
        attempt,
        model: config.model,
        promptVersion: config.promptVersion,
        reasoningEffort: config.reasoningEffort
      }
    });

    try {
      const completion = await callGrok({
        apiKey: config.apiKey,
        messages,
        model: config.model,
        reasoningEffort: config.reasoningEffort
      });
      const content = completion.choices?.[0]?.message?.content;
      const parsed = parseJsonObject(content);
      const validation = validateFoodGapSupportAiResponse(parsed, {
        managedFoods: input.managedFoods,
        productVariants: input.productVariants
      });

      if (validation.foodGapSupport) {
        await audit(input, {
          eventType: "food_gap_grok_validation_passed",
          level: "low",
          payload: {
            attempt,
            model: completion.model ?? config.model,
            promptVersion: config.promptVersion,
            reasoningEffort: config.reasoningEffort,
            responseId: completion.id,
            usage: completion.usage
          }
        });

        return {
          attempts: attempt,
          foodGapSupport: validation.foodGapSupport,
          model: completion.model ?? config.model,
          promptVersion: config.promptVersion,
          reasoningEffort: config.reasoningEffort,
          responseId: completion.id,
          usage: completion.usage
        };
      }

      lastErrors = validation.errors;
      await audit(input, {
        eventType: "food_gap_grok_validation_failed",
        level: "medium",
        payload: {
          attempt,
          errors: lastErrors,
          responseId: completion.id
        }
      });
      messages.push({ content: content ?? "", role: "assistant" });
      messages.push({ content: retryPrompt(lastErrors), role: "user" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown xAI food gap support error";
      lastErrors = [message];
      await audit(input, {
        eventType: "food_gap_grok_attempt_failed",
        level: "medium",
        payload: {
          attempt,
          error: message
        }
      });
      messages.push({ content: retryPrompt(lastErrors), role: "user" });
    }
  }

  await audit(input, {
    eventType: "food_gap_grok_fallback_used",
    level: "medium",
    payload: {
      errors: lastErrors,
      promptVersion: config.promptVersion
    }
  });

  return {
    attempts: MAX_ATTEMPTS,
    fallbackUsed: true,
    foodGapSupport: fallback(),
    model: config.model,
    promptVersion: config.promptVersion,
    reasoningEffort: config.reasoningEffort
  };
}
