import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildFoodGapSupportFallback,
  foodGapNeedsForVariant,
  managedFoodSupportsNeed,
  validateFoodGapSupportPayload,
  type FoodGapProductVariant,
  type ManagedFoodCatalogItem
} from "../lib/food-gap-support.ts";

const foodGapSupportSource = readFileSync(
  new URL("../lib/food-gap-support.ts", import.meta.url),
  "utf8"
);

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
  },
  {
    benefitTags: ["polyphenols"],
    category: "Tea",
    foodId: "food-green-tea",
    imagePath: "/foods/green_tea.webp",
    normalizedName: "green_tea",
    nutrientTags: ["polyphenols"],
    primaryUseCase: "Polyphenol tea",
    translations: {
      en: {
        category: "Tea",
        imageAlt: "Green tea",
        name: "Green tea",
        primaryUseCase: "Polyphenol tea"
      },
      th: {
        category: "ชา",
        imageAlt: "ชาเขียว",
        name: "ชาเขียว",
        primaryUseCase: "ชาที่มีโพลีฟีนอล"
      }
    }
  },
  {
    benefitTags: ["anti_inflammatory"],
    category: "Spices",
    foodId: "food-turmeric",
    imagePath: "/foods/turmeric.webp",
    normalizedName: "turmeric",
    nutrientTags: ["curcumin"],
    primaryUseCase: "Curcumin-containing spice",
    translations: {
      en: {
        category: "Spices",
        imageAlt: "Turmeric",
        name: "Turmeric",
        primaryUseCase: "Curcumin-containing spice"
      },
      th: {
        category: "เครื่องเทศ",
        imageAlt: "ขมิ้น",
        name: "ขมิ้น",
        primaryUseCase: "เครื่องเทศที่มีเคอร์คูมิน"
      }
    }
  }
];

const productVariant: FoodGapProductVariant = {
  needCoverage: [
    {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 100,
      displayName: "Omega-3",
      id: "supplement:omega-3",
      itemType: "supplement"
    },
    {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 42,
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
          foodId: "food-pumpkin",
          frequency: { en: "3 times/week", th: "3 ครั้งต่อสัปดาห์" },
          gapNeedIds: ["supplement:magnesium"],
          position: 1,
          rationale: { en: "Keeps mineral support practical.", th: "ช่วยให้การเสริมแร่ธาตุทำได้จริง" },
          serving: { en: "1 handful", th: "1 กำมือ" }
        }
      ]
    },
    compact: {
      body: { en: "Use foods for compact-stack support.", th: "ใช้อาหารช่วยเสริมชุดแบบกระชับ" },
      headline: { en: "Compact food support.", th: "อาหารเสริมแรงสำหรับชุดกระชับ" },
      items: [
        {
          foodId: "food-pumpkin",
          frequency: { en: "3 times/week", th: "3 ครั้งต่อสัปดาห์" },
          gapNeedIds: ["supplement:magnesium"],
          position: 1,
          rationale: { en: "Keeps mineral support practical.", th: "ช่วยให้การเสริมแร่ธาตุทำได้จริง" },
          serving: { en: "1 handful", th: "1 กำมือ" }
        }
      ]
    }
  }
};

describe("food gap support", () => {
  it("keeps food gap selection deterministic, without model calls", () => {
    assert.match(foodGapSupportSource, /analyzeFoodGapSupportDeterministically/);
    assert.doesNotMatch(foodGapSupportSource, /callGrokChatCompletion/);
    assert.doesNotMatch(foodGapSupportSource, /FOOD_GAP_SUPPORT_MODEL/);
    assert.doesNotMatch(foodGapSupportSource, /XAI_API_KEY/);
  });

  it("extracts supplement gaps below the food-support threshold only", () => {
    const gaps = foodGapNeedsForVariant(productVariant);

    assert.deepEqual(gaps.map((gap) => gap.id), ["supplement:magnesium"]);
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
    assert.equal(fallback.variants.balanced.items[0]?.foodId, "food-pumpkin");
    assert.equal(fallback.variants.balanced.items[0]?.imagePath, "/foods/pumpkin_seeds.webp");
    assert.deepEqual(fallback.variants.balanced.items[0]?.gapNeedIds, ["supplement:magnesium"]);
  });

  it("validates and enriches deterministic payload from the managed food catalogue", () => {
    const validation = validateFoodGapSupportPayload(validResponse, {
      managedFoods,
      productVariants: [productVariant, compactVariant]
    });

    assert.deepEqual(validation.errors, []);
    assert.equal(validation.foodGapSupport?.variants.balanced.items[0]?.food.en, "Pumpkin seeds");
    assert.equal(validation.foodGapSupport?.variants.balanced.items[0]?.imagePath, "/foods/pumpkin_seeds.webp");
  });

  it("does not match DHA inside ashwagandha as an omega food gap", () => {
    const ashwagandhaNeed = {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 42,
      displayName: "Ashwagandha",
      id: "supplement:ashwagandha",
      itemType: "supplement" as const
    };

    assert.equal(managedFoodSupportsNeed(managedFoods[0]!, ashwagandhaNeed), false);

    const ashwagandhaVariant: FoodGapProductVariant = {
      needCoverage: [ashwagandhaNeed],
      stackPreference: "balanced"
    };
    const fallback = buildFoodGapSupportFallback({
      answers: {},
      locale: "en",
      managedFoods,
      plan: "precision",
      planId: "plan-ashwagandha",
      productVariants: [
        ashwagandhaVariant,
        { ...ashwagandhaVariant, stackPreference: "compact" }
      ]
    });

    assert.deepEqual(fallback.variants.balanced.items, []);
    assert.deepEqual(fallback.variants.compact.items, []);
  });

  it("rejects food links that only match a substring inside ashwagandha", () => {
    const badResponse = structuredClone(validResponse);
    badResponse.variants.balanced.items[0].foodId = "food-salmon";
    badResponse.variants.balanced.items[0].gapNeedIds = ["supplement:ashwagandha"];

    const ashwagandhaVariant: FoodGapProductVariant = {
      needCoverage: [
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 42,
          displayName: "Ashwagandha",
          id: "supplement:ashwagandha",
          itemType: "supplement"
        },
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 42,
          displayName: "Magnesium",
          id: "supplement:magnesium",
          itemType: "supplement"
        }
      ],
      stackPreference: "balanced"
    };

    const validation = validateFoodGapSupportPayload(badResponse, {
      managedFoods,
      productVariants: [ashwagandhaVariant, compactVariant]
    });

    assert.match(validation.errors.join("\n"), /supportable supplement gaps below 90% only/);
  });

  it("only maps a curcumin gap to turmeric, not generic polyphenol foods", () => {
    const curcuminNeed = {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 42,
      displayName: "Curcumin",
      id: "supplement:curcumin",
      itemType: "supplement" as const
    };
    const greenTea = managedFoods.find((food) => food.normalizedName === "green_tea")!;
    const turmeric = managedFoods.find((food) => food.normalizedName === "turmeric")!;

    assert.equal(managedFoodSupportsNeed(greenTea, curcuminNeed), false);
    assert.equal(managedFoodSupportsNeed(turmeric, curcuminNeed), true);

    const curcuminVariant: FoodGapProductVariant = {
      needCoverage: [curcuminNeed],
      stackPreference: "balanced"
    };
    const fallback = buildFoodGapSupportFallback({
      answers: {},
      locale: "en",
      managedFoods,
      plan: "precision",
      planId: "plan-curcumin",
      productVariants: [
        curcuminVariant,
        { ...curcuminVariant, stackPreference: "compact" }
      ]
    });

    assert.deepEqual(
      fallback.variants.balanced.items.map((item) => item.food.en),
      ["Turmeric"]
    );
  });

  it("maps Vitamin D3 and Vitamin B12 gaps to exact managed food supports", () => {
    const vitaminD3Need = {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 20,
      displayName: "Vitamin D3",
      id: "supplement:vitamin-d3",
      itemType: "supplement" as const
    };
    const vitaminB12Need = {
      bestRejectedProductId: null,
      bestRejectedReason: null,
      coveragePercent: 10,
      displayName: "Vitamin B12",
      id: "supplement:vitamin-b12",
      itemType: "supplement" as const
    };
    const salmon = managedFoods.find((food) => food.normalizedName === "salmon")!;
    const pumpkinSeeds = managedFoods.find((food) => food.normalizedName === "pumpkin_seeds")!;

    assert.equal(managedFoodSupportsNeed(salmon, vitaminD3Need), true);
    assert.equal(managedFoodSupportsNeed(salmon, vitaminB12Need), true);
    assert.equal(managedFoodSupportsNeed(pumpkinSeeds, vitaminB12Need), false);

    const vitaminVariant: FoodGapProductVariant = {
      needCoverage: [vitaminD3Need, vitaminB12Need],
      stackPreference: "compact"
    };
    const fallback = buildFoodGapSupportFallback({
      answers: {},
      locale: "en",
      managedFoods,
      plan: "precision",
      planId: "plan-vitamins",
      productVariants: [
        { ...vitaminVariant, stackPreference: "balanced" },
        vitaminVariant
      ]
    });

    assert.deepEqual(
      fallback.variants.compact.items.map((item) => item.food.en),
      ["Salmon"]
    );
    assert.match(
      fallback.variants.compact.items[0]?.rationale.en ?? "",
      /Salmon gives food-level support around Vitamin D3 and Vitamin B12/
    );
  });

  it("requires food items to point at a product supplement gap when one exists", () => {
    const missingGapResponse = structuredClone(validResponse);
    missingGapResponse.variants.balanced.items[0].gapNeedIds = [];

    const validation = validateFoodGapSupportPayload(missingGapResponse, {
      managedFoods,
      productVariants: [productVariant, compactVariant]
    });

    assert.match(validation.errors.join("\n"), /must reference at least one supportable product gap/);
  });

  it("rejects unknown foods, missing locales, extra fields, and medical wording", () => {
    const badResponse = structuredClone(validResponse);
    badResponse.variants.balanced.items[0].foodId = "food-unknown";
    delete (badResponse.variants.compact.body as Record<string, string>).th;
    (badResponse.variants.compact.items[0] as Record<string, unknown>).extra = true;
    badResponse.variants.compact.items[0].rationale.en = "This can treat a disease.";

    const validation = validateFoodGapSupportPayload(badResponse, {
      managedFoods,
      productVariants: [productVariant, compactVariant]
    });

    assert.match(validation.errors.join("\n"), /not a managed food/);
    assert.match(validation.errors.join("\n"), /must include non-empty en and th/);
    assert.match(validation.errors.join("\n"), /unsupported keys/);
    assert.match(validation.errors.join("\n"), /banned medical wording/);
  });

  it("rejects unsupported food-to-gap links", () => {
    const badResponse = structuredClone(validResponse);
    badResponse.variants.balanced.items[0].gapNeedIds = ["supplement:omega-3"];

    const validation = validateFoodGapSupportPayload(badResponse, {
      managedFoods,
      productVariants: [{
        ...productVariant,
        needCoverage: productVariant.needCoverage.map((need) =>
          need.id === "supplement:omega-3"
            ? { ...need, coveragePercent: 42 }
            : need
        )
      }, compactVariant]
    });

    assert.match(validation.errors.join("\n"), /not supported by Pumpkin seeds/);
  });

  it("rejects copied schema placeholder copy", () => {
    const badResponse = structuredClone(validResponse);
    badResponse.variants.balanced.body.en = "English body";
    badResponse.variants.balanced.items[0].rationale.en =
      "One plain wellness sentence; no medical claims";

    const validation = validateFoodGapSupportPayload(badResponse, {
      managedFoods,
      productVariants: [productVariant, compactVariant]
    });

    assert.match(validation.errors.join("\n"), /schema placeholder text/);
  });

  it("omits food cards when product gaps have no supportable managed food", () => {
    const creatineGap: FoodGapProductVariant = {
      needCoverage: [
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 0,
          displayName: "Creatine",
          id: "supplement:creatine",
          itemType: "supplement"
        }
      ],
      stackPreference: "balanced"
    };
    const fallback = buildFoodGapSupportFallback({
      answers: {},
      locale: "en",
      managedFoods,
      plan: "precision",
      planId: "plan-1",
      productVariants: [creatineGap, { ...creatineGap, stackPreference: "compact" }]
    });

    assert.deepEqual(fallback.variants.balanced.items, []);
    assert.deepEqual(fallback.variants.compact.items, []);
  });

  it("filters animal managed foods for plant-based assessments", () => {
    const omegaGap: FoodGapProductVariant = {
      needCoverage: [
        {
          bestRejectedProductId: null,
          bestRejectedReason: null,
          coveragePercent: 0,
          displayName: "Omega-3",
          id: "supplement:omega-3",
          itemType: "supplement"
        }
      ],
      stackPreference: "balanced"
    };
    const fallback = buildFoodGapSupportFallback({
      answers: { diet: "plant" },
      locale: "en",
      managedFoods: [managedFoods[0]!],
      plan: "precision",
      planId: "plan-1",
      productVariants: [omegaGap, { ...omegaGap, stackPreference: "compact" }]
    });

    assert.deepEqual(fallback.variants.balanced.items, []);
  });
});
