import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFoodGapSupportFallback,
  foodGapNeedsForVariant,
  validateFoodGapSupportAiResponse,
  type FoodGapProductVariant,
  type ManagedFoodCatalogItem
} from "../lib/food-gap-support.ts";

const managedFoods: ManagedFoodCatalogItem[] = [
  {
    benefitTags: ["omega_3"],
    category: "Fish",
    foodId: "food-salmon",
    imagePath: "/foods/salmon.webp",
    normalizedName: "salmon",
    nutrientTags: ["omega_3", "vitamin_d"],
    primaryUseCase: "Omega-3 rich fish",
    translations: {
      en: {
        category: "Fish",
        imageAlt: "Salmon fillet",
        name: "Salmon",
        primaryUseCase: "Omega-3 rich fish"
      },
      th: {
        category: "ปลา",
        imageAlt: "ชิ้นปลาแซลมอน",
        name: "ปลาแซลมอน",
        primaryUseCase: "ปลาที่มีโอเมกา 3"
      }
    }
  },
  {
    benefitTags: ["minerals"],
    category: "Seeds",
    foodId: "food-pumpkin",
    imagePath: "/foods/pumpkin_seeds.webp",
    normalizedName: "pumpkin_seeds",
    nutrientTags: ["magnesium", "zinc"],
    primaryUseCase: "Magnesium and zinc rich seed",
    translations: {
      en: {
        category: "Seeds",
        imageAlt: "Pumpkin seeds",
        name: "Pumpkin seeds",
        primaryUseCase: "Magnesium and zinc rich seed"
      },
      th: {
        category: "เมล็ดพืช",
        imageAlt: "เมล็ดฟักทอง",
        name: "เมล็ดฟักทอง",
        primaryUseCase: "เมล็ดพืชที่มีแมกนีเซียมและสังกะสี"
      }
    }
  },
  {
    benefitTags: ["fiber"],
    category: "Whole grains",
    foodId: "food-oats",
    imagePath: "/foods/oats.webp",
    normalizedName: "oats",
    nutrientTags: ["fiber"],
    primaryUseCase: "Beta-glucan fiber",
    translations: {
      en: {
        category: "Whole grains",
        imageAlt: "Oats in a bowl",
        name: "Oats",
        primaryUseCase: "Beta-glucan fiber"
      },
      th: {
        category: "ธัญพืชไม่ขัดสี",
        imageAlt: "ข้าวโอ๊ตในชาม",
        name: "ข้าวโอ๊ต",
        primaryUseCase: "ธัญพืชที่มีใยอาหาร"
      }
    }
  }
];

const productVariant: FoodGapProductVariant = {
  needCoverage: [
    {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 42,
      displayName: "Omega-3",
      id: "supplement:omega-3",
      itemType: "supplement"
    },
    {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 100,
      displayName: "Magnesium",
      id: "supplement:magnesium",
      itemType: "supplement"
    },
    {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 0,
      displayName: "Fiber food",
      id: "food:fiber",
      itemType: "food"
    }
  ],
  stackPreference: "balanced"
};

const compactVariant: FoodGapProductVariant = {
  ...productVariant,
  stackPreference: "compact"
};

const validResponse = {
  variants: {
    balanced: {
      body: { en: "Use foods for the remaining support.", th: "ใช้อาหารเพื่อช่วยเสริมส่วนที่เหลือ" },
      headline: { en: "Food support for the gaps.", th: "อาหารช่วยเสริมช่องว่าง" },
      items: [
        {
          foodId: "food-salmon",
          frequency: { en: "1-2 times/week", th: "1-2 ครั้งต่อสัปดาห์" },
          gapNeedIds: ["supplement:omega-3"],
          position: 1,
          rationale: { en: "Adds food-level omega support.", th: "ช่วยเสริมโอเมกาจากอาหาร" },
          serving: { en: "1 portion", th: "1 ส่วน" }
        },
        {
          foodId: "food-pumpkin",
          frequency: { en: "3 times/week", th: "3 ครั้งต่อสัปดาห์" },
          gapNeedIds: [],
          position: 2,
          rationale: { en: "Keeps mineral support practical.", th: "ช่วยให้การเสริมแร่ธาตุทำได้จริง" },
          serving: { en: "1 handful", th: "1 กำมือ" }
        },
        {
          foodId: "food-oats",
          frequency: { en: "3 times/week", th: "3 ครั้งต่อสัปดาห์" },
          gapNeedIds: [],
          position: 3,
          rationale: { en: "Keeps the plan grounded in meals.", th: "ช่วยให้แผนผูกกับมื้ออาหารจริง" },
          serving: { en: "1 bowl", th: "1 ถ้วย" }
        }
      ]
    },
    compact: {
      body: { en: "Use foods for compact-stack support.", th: "ใช้อาหารช่วยเสริมชุดแบบกระชับ" },
      headline: { en: "Compact food support.", th: "อาหารเสริมแรงสำหรับชุดกระชับ" },
      items: [
        {
          foodId: "food-salmon",
          frequency: { en: "1-2 times/week", th: "1-2 ครั้งต่อสัปดาห์" },
          gapNeedIds: ["supplement:omega-3"],
          position: 1,
          rationale: { en: "Adds food-level omega support.", th: "ช่วยเสริมโอเมกาจากอาหาร" },
          serving: { en: "1 portion", th: "1 ส่วน" }
        },
        {
          foodId: "food-pumpkin",
          frequency: { en: "3 times/week", th: "3 ครั้งต่อสัปดาห์" },
          gapNeedIds: [],
          position: 2,
          rationale: { en: "Keeps mineral support practical.", th: "ช่วยให้การเสริมแร่ธาตุทำได้จริง" },
          serving: { en: "1 handful", th: "1 กำมือ" }
        },
        {
          foodId: "food-oats",
          frequency: { en: "3 times/week", th: "3 ครั้งต่อสัปดาห์" },
          gapNeedIds: [],
          position: 3,
          rationale: { en: "Keeps the plan grounded in meals.", th: "ช่วยให้แผนผูกกับมื้ออาหารจริง" },
          serving: { en: "1 bowl", th: "1 ถ้วย" }
        }
      ]
    }
  }
};

describe("food gap support", () => {
  it("extracts supplement gaps below the food-support threshold only", () => {
    const gaps = foodGapNeedsForVariant(productVariant);

    assert.deepEqual(gaps.map((gap) => gap.id), ["supplement:omega-3"]);
  });

  it("builds a managed-food fallback for product gaps", () => {
    const fallback = buildFoodGapSupportFallback({
      answers: {},
      locale: "en",
      managedFoods,
      plan: "precision",
      planId: "plan-1",
      productVariants: [productVariant, compactVariant]
    });

    assert.equal(fallback.version, "food-gap:v1");
    assert.equal(fallback.variants.balanced.items[0]?.foodId, "food-salmon");
    assert.equal(fallback.variants.balanced.items[0]?.imagePath, "/foods/salmon.webp");
    assert.deepEqual(fallback.variants.balanced.items[0]?.gapNeedIds, ["supplement:omega-3"]);
  });

  it("validates and enriches AI output from the managed food catalogue", () => {
    const validation = validateFoodGapSupportAiResponse(validResponse, {
      managedFoods,
      productVariants: [productVariant, compactVariant]
    });

    assert.deepEqual(validation.errors, []);
    assert.equal(validation.foodGapSupport?.variants.balanced.items[0]?.food.en, "Salmon");
    assert.equal(validation.foodGapSupport?.variants.balanced.items[0]?.imagePath, "/foods/salmon.webp");
  });

  it("rejects unknown foods, missing locales, extra fields, and medical wording", () => {
    const badResponse = structuredClone(validResponse);
    badResponse.variants.balanced.items[0].foodId = "food-unknown";
    delete (badResponse.variants.compact.body as Record<string, string>).th;
    (badResponse.variants.compact.items[1] as Record<string, unknown>).extra = true;
    badResponse.variants.compact.items[2].rationale.en = "This can treat a disease.";

    const validation = validateFoodGapSupportAiResponse(badResponse, {
      managedFoods,
      productVariants: [productVariant, compactVariant]
    });

    assert.match(validation.errors.join("\n"), /not a managed food/);
    assert.match(validation.errors.join("\n"), /must include non-empty en and th/);
    assert.match(validation.errors.join("\n"), /unsupported keys/);
    assert.match(validation.errors.join("\n"), /banned medical wording/);
  });
});
