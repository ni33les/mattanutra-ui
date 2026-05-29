import assert from "node:assert/strict";
import test from "node:test";
import {
  adminLocalizedFoodText,
  adminLocalizedProductText,
  adminLocalizedSupplementText
} from "../lib/admin-localized-display.ts";

test("admin localized product display uses requested locale before canonical English", () => {
  const product = {
    description: "Canonical description",
    title: "Canonical English product",
    translations: {
      en: {
        description: "English product description",
        locale: "en",
        status: "complete",
        title: "English product",
        updatedAt: null
      },
      th: {
        description: "รายละเอียดสินค้าไทย",
        locale: "th",
        status: "complete",
        title: "สินค้าไทย",
        updatedAt: null
      },
      "zh-CN": {
        description: "中文产品说明",
        locale: "zh-CN",
        status: "complete",
        title: "中文产品",
        updatedAt: null
      }
    }
  };

  const zh = adminLocalizedProductText(product as never, "zh-CN");

  assert.equal(zh.title.value, "中文产品");
  assert.equal(zh.title.canonicalValue, "Canonical English product");
  assert.equal(zh.title.fallbackUsed, false);
  assert.equal(zh.description.value, "中文产品说明");
});

test("admin localized display reports fallback when requested locale is missing", () => {
  const supplement = {
    aliases: [{ id: "alias-1", name: "Canonical alias" }],
    category: "canonical_category",
    name: "Canonical supplement",
    primaryUseCase: "Canonical use",
    safetyNotes: "Canonical notes",
    translations: {
      en: {
        aliases: ["English alias"],
        categoryLabel: "English category",
        locale: "en",
        name: "English supplement",
        primaryUseCase: "English use",
        safetyNotes: "English notes",
        status: "complete",
        updatedAt: null
      }
    }
  };

  const zh = adminLocalizedSupplementText(supplement as never, "zh-CN");

  assert.equal(zh.name.value, "English supplement");
  assert.equal(zh.name.canonicalValue, "Canonical supplement");
  assert.equal(zh.name.fallbackUsed, true);
  assert.equal(zh.name.sourceLocale, "en");
  assert.deepEqual(zh.aliases, ["English alias"]);
});

test("admin localized food display uses translated food names and image alt text", () => {
  const food = {
    category: "canonical_category",
    name: "Canonical food",
    primaryUseCase: "Canonical use",
    translations: {
      en: {
        category: "English category",
        imageAlt: "English alt",
        name: "English food",
        primaryUseCase: "English use",
        status: "complete"
      },
      th: {
        category: "หมวดอาหาร",
        imageAlt: "รูปอาหารไทย",
        name: "อาหารไทย",
        primaryUseCase: "ใช้แบบไทย",
        status: "complete"
      }
    }
  };

  const th = adminLocalizedFoodText(food as never, "th");

  assert.equal(th.name.value, "อาหารไทย");
  assert.equal(th.imageAlt.value, "รูปอาหารไทย");
  assert.equal(th.category.value, "หมวดอาหาร");
  assert.equal(th.name.fallbackUsed, false);
});
