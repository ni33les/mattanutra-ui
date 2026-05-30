import type {
  FoodGapSupportItem,
  FormulationIngredient,
  FormulationResult,
  LocalizedText,
  ProductNeedCoverage,
  ProductStackPreference
} from "@/lib/formulation-types";
import { localizedTextSearchValue, resolveLocalizedText, type Locale } from "@/lib/i18n";
import { managedFoodSeeds } from "@/lib/managed-foods";
import {
  getLocalizedText,
  localizedBenefitTagLabel,
  localizeKnownInlineTerms
} from "@/components/formulation-reveal-copy";

const supplementBenefitRules = [
  {
    patterns: ["inflamm", "omega", "curcumin", "turmeric", "boswellia", "quercetin", "resveratrol", "pine bark"],
    tag: "anti_inflammatory"
  },
  {
    patterns: ["stress", "calm", "relax", "adaptogen", "ashwagandha", "rhodiola", "theanine", "gaba"],
    tag: "stress_support"
  },
  {
    patterns: ["sleep", "melatonin", "magnesium", "glycine", "gaba", "theanine", "cherry"],
    tag: "sleep_support"
  },
  {
    patterns: ["energy", "fatigue", "mitochond", "coq10", "creatine", "carnitine", "nad", "b12", "iron"],
    tag: "energy_support"
  },
  {
    patterns: ["brain", "cognition", "focus", "memory", "nootropic", "threonate", "omega"],
    tag: "cognitive_support"
  },
  {
    patterns: ["heart", "cardio", "blood pressure", "cholesterol", "omega", "coq10"],
    tag: "heart_health"
  },
  {
    patterns: ["gut", "digest", "microbiome", "probiotic", "prebiotic", "fiber", "colostrum"],
    tag: "gut_health"
  },
  {
    patterns: ["immune", "vitamin c", "vitamin d", "zinc", "selenium", "colostrum"],
    tag: "immune_support"
  },
  {
    patterns: ["skin", "hair", "nail", "collagen", "hyaluronic", "ceramide"],
    tag: "skin_health"
  },
  {
    patterns: ["recovery", "muscle", "joint", "training", "protein", "collagen", "creatine"],
    tag: "recovery_support"
  },
  {
    patterns: ["bone", "calcium", "vitamin d", "vitamin k", "k2", "magnesium"],
    tag: "bone_health"
  },
  {
    patterns: ["hormone", "estrogen", "testosterone", "cycle", "pms", "dht", "vitex", "dim"],
    tag: "hormone_support"
  }
] as const;

const supplementNameFallbacks: Record<string, Record<Locale, string>> = {
  citicoline: { en: "Citicoline (CDP-choline)", th: "ซิติโคลีน (ซีดีพี-โคลีน)", "zh-CN": "胞磷胆碱（CDP-胆碱）" },
  coq10: { en: "CoQ10", th: "โคคิวเท็น", "zh-CN": "辅酶 Q10" },
	  magnesium: { en: "Magnesium", th: "แมกนีเซียม", "zh-CN": "镁" },
	  omega_3: { en: "Omega-3", th: "โอเมกา 3", "zh-CN": "Omega-3 脂肪酸" },
	  probiotic: { en: "Multi-strain probiotics", th: "โปรไบโอติกหลายสายพันธุ์", "zh-CN": "多菌株益生菌" },
	  curcumin: { en: "Curcumin", th: "เคอร์คูมิน", "zh-CN": "姜黄素" },
	  theanine: { en: "Theanine", th: "แอล-ธีอะนีน", "zh-CN": "茶氨酸" },
  vitamin_d3: { en: "Vitamin D3", th: "วิตามินดี 3", "zh-CN": "维生素 D3" }
};

function supplementFallbackKey(id: string, name: string) {
  const search = normalizeFoodText(`${id} ${name}`);

  if (/citicoline|cdp choline/.test(search)) {
    return "citicoline";
  }

  if (/coq10|coenzyme q10|ubiquin/.test(search)) {
    return "coq10";
  }

  if (/magnesium/.test(search)) {
    return "magnesium";
  }

	  if (/omega 3|omega3|fish oil|epa|dha/.test(search)) {
	    return "omega_3";
	  }

	  if (/probiotic|probiotics|lactobacillus|bifidobacterium/.test(search)) {
	    return "probiotic";
	  }

	  if (/curcumin|turmeric/.test(search)) {
	    return "curcumin";
	  }

  if (/theanine/.test(search)) {
    return "theanine";
  }

  if (/vitamin d|vitamin d3|cholecalciferol/.test(search)) {
    return "vitamin_d3";
  }

  return "";
}

export function localizedSupplementName(
  value: LocalizedText,
  id: string,
  locale: Locale
) {
  const localized = getLocalizedText(value, locale);

  if (locale === "en") {
    return localized;
  }

  const english = getLocalizedText(value, "en");
  const hasLocaleSpecificText = localized && localized !== english;

  if (hasLocaleSpecificText) {
    return localized;
  }

  const fallback =
    supplementNameFallbacks[supplementFallbackKey(id, english || localized)];

  return fallback?.[locale] ?? fallback?.en ?? localized;
}

export function localizedDoseText(value: LocalizedText, locale: Locale) {
  const text = getLocalizedText(value, locale) || resolveLocalizedText(value, locale).trim();

  if (locale !== "zh-CN") {
    return text;
  }

  return text
    .replace(/\bcapsules?\b/gi, "粒")
    .replace(/\btablets?\b/gi, "片")
    .replace(/\bsoftgels?\b/gi, "软胶囊")
    .replace(/\bservings?\b/gi, "份")
    .replace(/\b(\d+(?:\.\d+)?)\s*billion\s*CFU\b/gi, (_match, amount: string) => {
      const value = Number(amount);

      return Number.isFinite(value) ? `${value * 10} 亿 CFU` : `${amount} billion CFU`;
    })
    .replace(/\bper day\b/gi, "每天")
    .replace(/\/day\b/gi, "/天")
    .replace(/\bday\b/gi, "天");
}

function searchableLocalizedText(value: LocalizedText) {
  return localizedTextSearchValue(value);
}

export function supplementBenefitTags(ingredient: FormulationIngredient) {
  const explicitTags = Array.isArray(ingredient.benefitTags)
    ? ingredient.benefitTags
    : [];
  const searchText = [
    ingredient.category,
    searchableLocalizedText(ingredient.supplement),
    searchableLocalizedText(ingredient.rationale)
  ]
    .join(" ")
    .toLowerCase();
  const derivedTags = supplementBenefitRules
    .filter((rule) =>
      rule.patterns.some((pattern) => searchText.includes(pattern))
    )
    .map((rule) => rule.tag);

  return [...new Set([...explicitTags, ...derivedTags])].slice(0, 4);
}

export function localizedIngredientRationale(
  ingredient: FormulationIngredient,
  locale: Locale
) {
  const text = getLocalizedText(ingredient.rationale, locale);

  if (text) {
    return text;
  }

  const supplement = localizedSupplementName(ingredient.supplement, ingredient.id, locale);
  const benefit = supplementBenefitTags(ingredient)[0];
  const benefitLabel = benefit ? localizedBenefitTagLabel(benefit, locale) : "";

  if (locale === "th") {
    return benefitLabel
      ? `${supplement} อยู่ในแผนนี้เพื่อช่วยด้าน${benefitLabel}ตามลำดับความสำคัญของคุณ`
      : `${supplement} อยู่ในแผนนี้ตามเป้าหมายและบริบทด้านความปลอดภัยของคุณ`;
  }

  if (locale === "zh-CN") {
    return benefitLabel
      ? `${supplement} 被纳入本方案，用于围绕${benefitLabel}提供有针对性的支持。`
      : `${supplement} 被纳入本方案，以匹配您的目标、偏好和安全背景。`;
  }

  return benefitLabel
    ? `${supplement} is included for targeted support around ${benefitLabel}.`
    : `${supplement} is included because it fits your goals, preferences, and safety context.`;
}

function normalizeFoodText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .trim();
}

function normalizedFoodTokens(value: string) {
  return normalizeFoodText(value).split(/\s+/).filter(Boolean);
}

function normalizedFoodTextMatchesPattern(value: string, pattern: string) {
  const valueTokens = normalizedFoodTokens(value);
  const patternTokens = normalizedFoodTokens(pattern);

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

export const managedFoodServing: Record<string, Record<Locale, string>> = {
  brown_rice: { en: "1 small bowl", th: "1 ถ้วยเล็ก", "zh-CN": "1 小碗" },
  chia_seeds: { en: "1 tbsp", th: "1 ช้อนโต๊ะ", "zh-CN": "1 汤匙" },
  chickpeas: { en: "1/2 cup cooked", th: "ถั่วสุก 1/2 ถ้วย", "zh-CN": "熟鹰嘴豆 1/2 杯" },
  flaxseed: { en: "1 tbsp ground", th: "บด 1 ช้อนโต๊ะ", "zh-CN": "研磨后 1 汤匙" },
  ginger_tea: { en: "1 cup", th: "1 ถ้วย", "zh-CN": "1 杯" },
  green_tea: { en: "1 cup", th: "1 ถ้วย", "zh-CN": "1 杯" },
  holy_basil: { en: "1 handful cooked", th: "ปรุงสุก 1 กำมือ", "zh-CN": "熟食 1 小把" },
  kimchi: { en: "2-3 tbsp", th: "2-3 ช้อนโต๊ะ", "zh-CN": "2-3 汤匙" },
  lentils: { en: "1/2 cup cooked", th: "เลนทิลสุก 1/2 ถ้วย", "zh-CN": "熟小扁豆 1/2 杯" },
  moringa_leaves: { en: "1 small bowl cooked", th: "ปรุงสุก 1 ถ้วยเล็ก", "zh-CN": "熟食 1 小碗" },
  mung_beans: { en: "1/2 cup cooked", th: "ถั่วเขียวสุก 1/2 ถ้วย", "zh-CN": "熟绿豆 1/2 杯" },
  oats: { en: "1 small bowl", th: "1 ถ้วยเล็ก", "zh-CN": "1 小碗" },
  papaya: { en: "1 small bowl", th: "1 ถ้วยเล็ก", "zh-CN": "1 小碗" },
  pumpkin_seeds: { en: "1 small handful", th: "1 กำมือเล็ก", "zh-CN": "1 小把" },
  salmon: { en: "1 palm-sized portion", th: "1 ชิ้นขนาดฝ่ามือ", "zh-CN": "1 份手掌大小" },
  sardines: { en: "1 small tin or portion", th: "1 กระป๋องเล็กหรือ 1 ส่วน", "zh-CN": "1 小罐或 1 份" },
  sesame_seeds: { en: "1 tbsp", th: "1 ช้อนโต๊ะ", "zh-CN": "1 汤匙" },
  tofu: { en: "1 palm-sized portion", th: "1 ชิ้นขนาดฝ่ามือ", "zh-CN": "1 份手掌大小" },
  turmeric: { en: "1-2 tsp in cooking", th: "1-2 ช้อนชาในอาหาร", "zh-CN": "烹调中加入 1-2 茶匙" },
  unsweetened_yogurt: { en: "1 small bowl", th: "1 ถ้วยเล็ก", "zh-CN": "1 小碗" }
};

export const managedFoodFrequency: Record<string, Record<Locale, string>> = {
  ginger_tea: { en: "3-5 times/week", th: "3-5 ครั้งต่อสัปดาห์", "zh-CN": "每周 3-5 次" },
  green_tea: { en: "3-5 times/week", th: "3-5 ครั้งต่อสัปดาห์", "zh-CN": "每周 3-5 次" },
  kimchi: { en: "3-4 times/week", th: "3-4 ครั้งต่อสัปดาห์", "zh-CN": "每周 3-4 次" },
  salmon: { en: "1-2 times/week", th: "1-2 ครั้งต่อสัปดาห์", "zh-CN": "每周 1-2 次" },
  sardines: { en: "1-2 times/week", th: "1-2 ครั้งต่อสัปดาห์", "zh-CN": "每周 1-2 次" },
  turmeric: { en: "most cooking days", th: "ในมื้ออาหารหลายวันต่อสัปดาห์", "zh-CN": "多数烹调日" }
};

const foodSupportNeedLabels: Record<string, Record<Locale, string>> = {
  calcium: { en: "calcium", th: "แคลเซียม", "zh-CN": "钙" },
  citicoline: { en: "citicoline", th: "ซิติโคลีน", "zh-CN": "胞磷胆碱" },
  coq10: { en: "CoQ10", th: "โคคิวเท็น", "zh-CN": "辅酶 Q10" },
  curcumin: { en: "curcumin", th: "เคอร์คูมิน", "zh-CN": "姜黄素" },
  magnesium: { en: "magnesium", th: "แมกนีเซียม", "zh-CN": "镁" },
  omega: { en: "omega-3", th: "โอเมกา 3", "zh-CN": "Omega-3" },
  probiotic: { en: "probiotic", th: "โปรไบโอติก", "zh-CN": "益生菌" },
  theanine: { en: "theanine", th: "ทีอะนีน", "zh-CN": "茶氨酸" },
  vitamin_b12: { en: "vitamin B12", th: "วิตามินบี 12", "zh-CN": "维生素 B12" },
  vitamin_c: { en: "vitamin C", th: "วิตามินซี", "zh-CN": "维生素 C" },
  vitamin_d: { en: "vitamin D", th: "วิตามินดี", "zh-CN": "维生素 D" },
  zinc: { en: "zinc", th: "สังกะสี", "zh-CN": "锌" }
};

const foodSupportPlaceholderValues = new Set([
  "english body",
  "english headline",
  "one plain wellness sentence no medical claims",
  "thai body",
  "thai headline",
  "หนึ่งประโยคภาษาไทยเพื่อสุขภาวะ ไม่ใช่คำกล่าวอ้างทางการแพทย์"
]);

const managedFoodNeedRules = [
  {
    foods: ["salmon", "sardines", "chia_seeds", "flaxseed"],
    patterns: ["omega", "dha", "epa", "fatty acid"]
  },
  {
    foods: ["pumpkin_seeds", "chia_seeds", "sesame_seeds", "brown_rice", "oats"],
    patterns: ["magnesium"]
  },
  {
    foods: ["salmon", "sardines"],
    patterns: ["vitamin d", "vitamin d3", "d3", "cholecalciferol"]
  },
  {
    foods: ["salmon", "sardines", "unsweetened_yogurt"],
    patterns: ["vitamin b12", "b12", "cobalamin"]
  },
  {
    foods: ["sardines", "sesame_seeds", "unsweetened_yogurt", "tofu"],
    patterns: ["calcium"]
  },
  {
    foods: ["papaya", "moringa_leaves"],
    patterns: ["vitamin c", "ascorb"]
  },
  {
    foods: ["pumpkin_seeds", "sesame_seeds", "chickpeas", "lentils"],
    patterns: ["zinc"]
  },
  {
    foods: ["oats", "lentils", "chickpeas", "mung_beans", "chia_seeds", "flaxseed"],
    patterns: ["fiber", "fibre", "prebiotic", "gut"]
  },
  {
    foods: ["kimchi", "unsweetened_yogurt"],
    patterns: ["probiotic", "microbiome", "gut"]
  },
  {
    foods: ["turmeric"],
    patterns: ["curcumin", "turmeric"]
  },
  {
    foods: ["green_tea", "holy_basil", "moringa_leaves", "turmeric", "papaya"],
    patterns: ["antioxidant", "inflamm", "polyphenol"]
  },
  {
    foods: ["tofu", "chickpeas", "lentils", "mung_beans"],
    patterns: ["muscle", "protein", "recovery"]
  }
] as const;

const managedFoodFallbackPriority: Record<string, number> = {
  pumpkin_seeds: 1,
  chia_seeds: 2,
  sesame_seeds: 3,
  sardines: 4,
  salmon: 5,
  oats: 6,
  unsweetened_yogurt: 7,
  tofu: 8,
  lentils: 9,
  chickpeas: 10,
  brown_rice: 11,
  flaxseed: 12,
  green_tea: 13,
  turmeric: 14,
  ginger_tea: 15,
  kimchi: 16,
  holy_basil: 17,
  moringa_leaves: 18,
  mung_beans: 19,
  papaya: 20
};

function managedFoodPriority(seed: (typeof managedFoodSeeds)[number]) {
  return managedFoodFallbackPriority[seed.normalizedName] ?? 999;
}

export function foodSupportGaps(needCoverage: readonly ProductNeedCoverage[]) {
  return needCoverage
    .filter((need) =>
      need.itemType === "supplement" &&
      Number.isFinite(need.coveragePercent) &&
      need.coveragePercent < 90
    )
    .sort((first, second) => first.coveragePercent - second.coveragePercent);
}

export function foodSupportableGaps(gaps: readonly ProductNeedCoverage[]) {
  return gaps.filter((gap) =>
    managedFoodNeedRules.some((rule) => ruleMatchesNeed(rule, gap))
  );
}

function foodSupportNeedText(need: ProductNeedCoverage) {
  return normalizeFoodText(`${need.id} ${need.displayName}`);
}

function ruleMatchesNeed(
  rule: (typeof managedFoodNeedRules)[number],
  need: ProductNeedCoverage
) {
  const text = `${need.id} ${need.displayName}`;

  return rule.patterns.some((pattern) =>
    normalizedFoodTextMatchesPattern(text, pattern)
  );
}

function managedFoodSeedMatchesGap(
  seed: (typeof managedFoodSeeds)[number],
  gap: ProductNeedCoverage
) {
  return managedFoodNeedRules.some((rule) =>
    ruleMatchesNeed(rule, gap) &&
    rule.foods.includes(seed.normalizedName as never)
  );
}

function scoreManagedFoodSeed(
  seed: (typeof managedFoodSeeds)[number],
  gaps: readonly ProductNeedCoverage[]
) {
  return gaps.reduce(
    (score, gap) =>
      score + (
        managedFoodSeedMatchesGap(seed, gap)
          ? Math.max(10, 100 - gap.coveragePercent)
          : 0
      ),
    0
  );
}

function relatedFoodGapIds(
  seed: (typeof managedFoodSeeds)[number],
  gaps: readonly ProductNeedCoverage[]
) {
  return gaps
    .filter((gap) => managedFoodSeedMatchesGap(seed, gap))
    .map((gap) => gap.id)
    .slice(0, 2);
}

export function managedSeedForFoodSupportItem(item: FoodGapSupportItem) {
  const itemText = normalizeFoodText([
    item.foodId,
    item.food.en,
    item.food.th
  ].filter(Boolean).join(" "));

  return managedFoodSeeds.find((seed) => {
    const seedKeys = [
      seed.normalizedName,
      seed.normalizedName.replace(/_/g, " "),
      seed.name.en,
      seed.name.th,
      seed.name["zh-CN"]
    ].map(normalizeFoodText);

    return seedKeys.some((key) =>
      key && (itemText.includes(key) || key.includes(itemText))
    );
  });
}

function foodSupportNeedLabel(need: ProductNeedCoverage, locale: Locale) {
  const text = foodSupportNeedText(need);
  const key = Object.keys(foodSupportNeedLabels).find((candidate) =>
    text.includes(candidate.replace(/_/g, " "))
  );

  if (key) {
    return foodSupportNeedLabels[key][locale] ?? foodSupportNeedLabels[key].en;
  }

  return localizeKnownInlineTerms(need.displayName, locale);
}

function needIngredientMatchTexts(ingredient: FormulationIngredient) {
  return [
    ingredient.id,
    getLocalizedText(ingredient.supplement, "en"),
    getLocalizedText(ingredient.supplement, "th"),
    supplementFallbackKey(
      ingredient.id,
      getLocalizedText(ingredient.supplement, "en")
    ).replace(/_/g, " ")
  ]
    .map(normalizeFoodText)
    .filter(Boolean);
}

function productNeedMatchTexts(need: ProductNeedCoverage) {
  return [
    need.id,
    need.id.replace(/^supplement:/, ""),
    need.displayName
  ]
    .map(normalizeFoodText)
    .filter(Boolean);
}

function productNeedMatchesIngredient(
  need: ProductNeedCoverage,
  ingredient: FormulationIngredient
) {
  const needTexts = productNeedMatchTexts(need);
  const ingredientTexts = needIngredientMatchTexts(ingredient);

  return needTexts.some((needText) =>
    ingredientTexts.some((ingredientText) =>
      ingredientText.includes(needText) || needText.includes(ingredientText)
    )
  );
}

export function formulaIngredientRowNumbers(ingredients: readonly FormulationIngredient[]) {
  const rowNumbers = new Map<string, number>();
  let rowNumber = 0;

  for (const [, group] of groupedFormulaIngredients([...ingredients])) {
    for (const ingredient of group) {
      rowNumber += 1;
      rowNumbers.set(ingredient.id, rowNumber);
    }
  }

  return rowNumbers;
}

export type FoodSupportFormulaGap = Readonly<{
  coveragePercent: number;
  dailyDose: string;
  id: string;
  label: string;
  rowNumber: number | null;
}>;

export function foodSupportFormulaGapsForItem(
  item: FoodGapSupportItem,
  selectedNeedCoverage: readonly ProductNeedCoverage[],
  ingredients: readonly FormulationIngredient[],
  locale: Locale
): FoodSupportFormulaGap[] {
  const seed = managedSeedForFoodSupportItem(item);
  const supportableGaps = seed
    ? foodSupportGaps(selectedNeedCoverage).filter((gap) =>
        managedFoodSeedMatchesGap(seed, gap)
      )
    : [];
  const explicitIds = new Set(item.gapNeedIds);
  const inferredIds = new Set(
    seed ? relatedFoodGapIds(seed, supportableGaps) : []
  );
  const rowNumbers = formulaIngredientRowNumbers(ingredients);

  return supportableGaps
    .filter((gap) => explicitIds.has(gap.id) || inferredIds.has(gap.id))
    .map((gap) => {
      const ingredient = ingredients.find((candidate) =>
        productNeedMatchesIngredient(gap, candidate)
      );

      return {
        coveragePercent: Math.min(100, Math.max(0, Math.round(gap.coveragePercent))),
        dailyDose: ingredient ? localizedDoseText(ingredient.dailyDose, locale) : "",
        id: gap.id,
        label: ingredient
          ? localizedSupplementName(ingredient.supplement, ingredient.id, locale)
          : foodSupportNeedLabel(gap, locale),
        rowNumber: ingredient ? rowNumbers.get(ingredient.id) ?? null : null
      };
    });
}

export function joinFoodSupportNeeds(
  needs: readonly ProductNeedCoverage[],
  locale: Locale
) {
  const labels = needs.map((need) => foodSupportNeedLabel(need, locale)).slice(0, 2);

  if (labels.length < 1) {
    return locale === "th"
      ? "ช่องว่างที่เหลือ"
      : locale === "zh-CN"
        ? "剩余缺口"
        : "the remaining gaps";
  }

  return labels.length === 1
    ? labels[0]
    : locale === "th"
      ? labels.join(" และ ")
      : locale === "zh-CN"
        ? labels.join("和")
        : `${labels[0]} and ${labels[1]}`;
}

export function joinFoodSupportFormulaGapLabels(
  gaps: readonly FoodSupportFormulaGap[],
  locale: Locale
) {
  const labels = gaps.map((gap) => gap.label).filter(Boolean).slice(0, 2);

  if (labels.length < 1) {
    return locale === "th"
      ? "ช่องว่างที่เหลือ"
      : locale === "zh-CN"
        ? "剩余缺口"
        : "the remaining gaps";
  }

  return labels.length === 1
    ? labels[0]
    : locale === "th"
      ? labels.join(" และ ")
      : locale === "zh-CN"
        ? labels.join("和")
        : `${labels[0]} and ${labels[1]}`;
}

function isFoodSupportPlaceholderCopy(value: string) {
  return foodSupportPlaceholderValues.has(normalizeFoodText(value));
}

export function safeFoodSupportCopy(
  value: LocalizedText,
  locale: Locale,
  fallback: string
) {
  const text = getLocalizedText(value, locale);
  const resolved = text && !isFoodSupportPlaceholderCopy(text) ? text : fallback;

  return localizeKnownInlineTerms(resolved, locale);
}

export function localizedReportText(value: LocalizedText, locale: Locale, fallback: string) {
  return getLocalizedText(value, locale) || fallback;
}

export function localizedReportFallbackTitle(locale: Locale) {
  return locale === "th"
    ? "แผนโภชนาการฉบับสุดท้าย"
    : locale === "zh-CN"
      ? "您的最终营养计划"
      : "Your final nutrition plan";
}

export function localizedReportFallbackBody(locale: Locale) {
  return locale === "th"
    ? "แผนนี้สรุปอาหาร อาหารเสริม ขั้นตอนถัดไป และข้อควรระวังจากข้อมูลที่คุณให้ไว้"
    : locale === "zh-CN"
      ? "这份计划汇总了根据您提供的信息生成的食物、补充剂、下一步行动和安全提醒。"
      : "This plan summarizes food, supplement, next-step, and safety guidance from your answers.";
}

function managedSeedForFoodItem(item: FormulationResult["foodGuidance"][number]) {
  const itemText = normalizeFoodText([
    item.foodId,
    typeof item.food === "string" ? item.food : Object.values(item.food).join(" ")
  ].filter(Boolean).join(" "));

  return managedFoodSeeds.find((seed) => {
    const seedKeys = [
      seed.normalizedName,
      seed.normalizedName.replace(/_/g, " "),
      seed.name.en,
      seed.name.th,
      seed.name["zh-CN"]
    ].map(normalizeFoodText);

    return seedKeys.some((key) =>
      key && (itemText.includes(key) || key.includes(itemText))
    );
  });
}

function previousFoodGuidanceRank(
  seed: (typeof managedFoodSeeds)[number],
  result: FormulationResult
) {
  const index = (result.foodGuidance ?? [])
    .filter((item) => item.safety?.visibility !== "hidden")
    .findIndex((item) => managedSeedForFoodItem(item)?.normalizedName === seed.normalizedName);

  return index >= 0 ? index + 1 : 999;
}

function fallbackManagedFoodSupportItems(
  result: FormulationResult,
  selectedNeedCoverage: readonly ProductNeedCoverage[]
): FoodGapSupportItem[] {
  const gaps = foodSupportGaps(selectedNeedCoverage);
  const supportableGaps = foodSupportableGaps(gaps);

  if (supportableGaps.length < 1) {
    return [];
  }

  const selectedSeeds: Array<(typeof managedFoodSeeds)[number]> = [];
  for (const gap of supportableGaps) {
    const matchingSeeds = managedFoodSeeds
      .filter((seed) => managedFoodSeedMatchesGap(seed, gap))
      .sort((first, second) => managedFoodPriority(first) - managedFoodPriority(second));
    let addedForGap = 0;

    for (const seed of matchingSeeds) {
      if (selectedSeeds.some((candidate) => candidate.normalizedName === seed.normalizedName)) {
        continue;
      }

      selectedSeeds.push(seed);
      addedForGap += 1;

      if (addedForGap >= 2) {
        break;
      }
    }
  }
  const scored = managedFoodSeeds
    .map((seed, index) => ({
      index,
      previousRank: previousFoodGuidanceRank(seed, result),
      score: scoreManagedFoodSeed(seed, gaps),
      seed
    }))
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      if (gaps.length > 0) {
        return managedFoodPriority(first.seed) - managedFoodPriority(second.seed) ||
          first.index - second.index;
      }

      if (first.previousRank !== second.previousRank) {
        return first.previousRank - second.previousRank;
      }

      return managedFoodPriority(first.seed) - managedFoodPriority(second.seed) ||
        first.index - second.index;
    });
  const selected = [
    ...selectedSeeds.map((seed) => ({
      index: managedFoodSeeds.findIndex((candidate) => candidate.normalizedName === seed.normalizedName),
      previousRank: previousFoodGuidanceRank(seed, result),
      score: scoreManagedFoodSeed(seed, gaps),
      seed
    })),
    ...scored.filter((item) =>
      !selectedSeeds.some((seed) => seed.normalizedName === item.seed.normalizedName) &&
      item.score > 0
    )
  ].slice(0, 6);

  return selected.map(({ seed }, index) => {
    const gapNeedIds = relatedFoodGapIds(seed, gaps);
    const relatedNeeds = gaps.filter((gap) => gapNeedIds.includes(gap.id));
    const enNeedText = joinFoodSupportNeeds(relatedNeeds, "en");
    const thNeedText = joinFoodSupportNeeds(relatedNeeds, "th");
    const zhNeedText = joinFoodSupportNeeds(relatedNeeds, "zh-CN");

    return {
      category: {
        en: seed.category.en,
        th: seed.category.th,
        "zh-CN": seed.category["zh-CN"],
      },
      food: { en: seed.name.en, th: seed.name.th, "zh-CN": seed.name["zh-CN"] },
      foodId: seed.normalizedName,
      frequency:
        managedFoodFrequency[seed.normalizedName] ??
        {
          en: "3-4 times/week",
          th: "3-4 ครั้งต่อสัปดาห์",
          "zh-CN": "每周 3-4 次",
        },
      gapNeedIds,
      imageAlt: {
        en: seed.imageAlt.en,
        th: seed.imageAlt.th,
        "zh-CN": seed.imageAlt["zh-CN"],
      },
      imagePath: seed.imagePath,
      position: index + 1,
      rationale: relatedNeeds.length > 0
        ? {
            en: `${seed.name.en} gives food-level support around ${enNeedText} while products stay responsible for the formula math.`,
            th: `${seed.name.th} ช่วยเสริมจากอาหารในส่วนของ${thNeedText} โดยไม่เปลี่ยนการคำนวณความครอบคลุมของผลิตภัณฑ์`,
            "zh-CN": `${seed.name["zh-CN"]} 可通过食物层面支持 ${zhNeedText}，同时产品覆盖计算保持独立。`,
          }
        : {
            en: `${seed.name.en} keeps the plan grounded in everyday food while the product stack handles the formula.`,
            th: `${seed.name.th} ช่วยให้แผนยังยึดกับอาหารในชีวิตประจำวัน ขณะที่ชุดผลิตภัณฑ์ทำหน้าที่ตามสูตร`,
            "zh-CN": `${seed.name["zh-CN"]} 让计划继续贴近日常饮食，同时产品组合负责配方覆盖。`,
          },
      serving:
        managedFoodServing[seed.normalizedName] ??
        {
          en: "1 practical serving",
          th: "1 ส่วนที่รับประทานได้จริง",
          "zh-CN": "1 份实际可用份量",
        }
    };
  });
}

function fallbackFoodSupportItems(
  result: FormulationResult,
  selectedNeedCoverage: readonly ProductNeedCoverage[]
): FoodGapSupportItem[] {
  if (selectedNeedCoverage.length > 0) {
    return fallbackManagedFoodSupportItems(result, selectedNeedCoverage);
  }

  return [];
}

export function selectedFoodSupport(
  result: FormulationResult,
  selectedNeedCoverage: readonly ProductNeedCoverage[],
  selectedPreference?: ProductStackPreference | null
) {
  const variant =
    selectedPreference && result.foodGapSupport?.variants[selectedPreference]
      ? result.foodGapSupport.variants[selectedPreference]
      : result.foodGapSupport?.variants.balanced ??
        result.foodGapSupport?.variants.compact ??
        null;
  const fallbackItems = fallbackFoodSupportItems(result, selectedNeedCoverage);

  return {
    fallbackItems,
    items: fallbackItems.length > 0 ? fallbackItems : variant?.items ?? [],
    variant
  };
}

export function visibleFormulaIngredients(ingredients: FormulationIngredient[]) {
  return ingredients.filter((ingredient) => ingredient.safety?.visibility !== "hidden");
}

export function groupedFormulaIngredients(ingredients: FormulationIngredient[]) {
  const groups = new Map<string, FormulationIngredient[]>();

  for (const ingredient of ingredients) {
    const key = ingredient.category || "Core";
    groups.set(key, [...(groups.get(key) ?? []), ingredient]);
  }

  return [...groups.entries()];
}
