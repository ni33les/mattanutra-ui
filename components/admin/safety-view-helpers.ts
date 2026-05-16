import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  formatNumber,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import type {
  AdminFoodRow,
  FoodListStatus
} from "@/lib/admin-foods";
import type {
  AdminSupplementRow,
  SupplementListStatus
} from "@/lib/admin-supplements";
import type { Locale } from "@/lib/i18n";
import type { SupplementSafetyFlag } from "@/lib/supplement-safety-flags";
import type {
  FoodNutrientId,
  FoodNutrientProfileValue
} from "@/lib/food-nutrients";
import { foodTagLabel } from "@/lib/food-tags";

export function foodAdminLabels(locale: Locale) {
  if (locale === "th") {
    return {
      allCategories: "ทุกหมวดหมู่",
      allStatuses: "ทุกสถานะ",
      aliases: "ชื่อเรียก",
      allergenFlags: "สารก่อภูมิแพ้",
      benefits: "ประโยชน์",
      blacklisted: "บัญชีดำ",
      category: "หมวดหมู่",
      close: "ปิด",
      conditionFlags: "เงื่อนไขความปลอดภัย",
      confidence: "ความมั่นใจ",
      defaultServing: "ปริมาณเริ่มต้น",
      details: "รายละเอียด",
      empty: "ไม่พบอาหารตามตัวกรองนี้",
      grams: "กรัม",
      inactive: "ปิดใช้",
      nutrientProfile: "ข้อมูลสารอาหารต่อ 100 กรัม",
      nutrients: "สารอาหาร",
      primaryUseCase: "การใช้งานหลัก",
      reviewRequired: "ต้องรีวิว",
      safetyNotes: "หมายเหตุความปลอดภัย",
      save: "บันทึก",
      search: "ค้นหาอาหาร",
      status: "สถานะ",
      total: "ทั้งหมด",
      updateError: "ไม่สามารถบันทึกอาหารนี้ได้",
      whitelisted: "อนุญาต"
    };
  }

  return {
    allCategories: "All categories",
    allStatuses: "All statuses",
    aliases: "Aliases",
    allergenFlags: "Allergen flags",
    benefits: "Benefits",
    blacklisted: "Blacklisted",
    category: "Category",
    close: "Close",
    conditionFlags: "Condition flags",
    confidence: "Confidence",
    defaultServing: "Default serving",
    details: "Details",
    empty: "No foods match these filters.",
    grams: "Grams",
    inactive: "Inactive",
    nutrientProfile: "Nutrient facts per 100g",
    nutrients: "Nutrients",
    primaryUseCase: "Primary use",
    reviewRequired: "Review required",
    safetyNotes: "Safety notes",
    save: "Save",
    search: "Search foods",
    status: "Status",
    total: "Total",
    updateError: "Could not save this food.",
    whitelisted: "Whitelisted"
  };
}

export function supplementStatusLabel(
  labels: AdminContent,
  status: SupplementListStatus
) {
  if (status === "whitelisted") {
    return labels.supplements.whitelisted;
  }

  if (status === "blacklisted") {
    return labels.supplements.blacklisted;
  }

  if (status === "inactive") {
    return labels.supplements.inactive;
  }

  return labels.supplements.reviewRequired;
}

export function supplementStatusClass(status: SupplementListStatus) {
  if (status === "whitelisted") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  if (status === "blacklisted") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "inactive") {
    return "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return "bg-amber-50 text-amber-800 ring-amber-200";
}

export function supplementSafetyFlagLabel(
  labels: AdminContent,
  flag: SupplementSafetyFlag
) {
  return labels.supplements.safetyFlagOptions[flag];
}

export function formatSupplementSafetyFlags(
  labels: AdminContent,
  flags: SupplementSafetyFlag[]
) {
  return flags.length
    ? flags.map((flag) => supplementSafetyFlagLabel(labels, flag)).join(", ")
    : labels.supplements.none;
}

export function supplementSearchText(
  labels: AdminContent,
  row: AdminSupplementRow
) {
  return [
    row.name,
    row.category,
    row.ingredientType,
    row.primaryUseCase,
    row.aliases.map((alias) => alias.name).join(" "),
    ...row.safetyFlags.map((flag) => supplementSafetyFlagLabel(labels, flag))
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function toggleSupplementSafetyFlag(
  flags: SupplementSafetyFlag[],
  flag: SupplementSafetyFlag
) {
  return flags.includes(flag)
    ? flags.filter((item) => item !== flag)
    : [...flags, flag];
}

export function foodStatusLabel(
  labels: ReturnType<typeof foodAdminLabels>,
  status: FoodListStatus
) {
  if (status === "whitelisted") {
    return labels.whitelisted;
  }

  if (status === "blacklisted") {
    return labels.blacklisted;
  }

  if (status === "inactive") {
    return labels.inactive;
  }

  return labels.reviewRequired;
}

export function foodStatusClass(status: FoodListStatus) {
  if (status === "whitelisted") {
    return "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]";
  }

  if (status === "blacklisted") {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (status === "inactive") {
    return "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return "bg-amber-50 text-amber-800 ring-amber-200";
}

export function foodSearchText(row: AdminFoodRow) {
  return [
    row.name,
    row.category,
    row.primaryUseCase,
    row.aliases.join(" "),
    row.benefitTags.join(" "),
    row.nutrientTags.join(" "),
    row.nutrientProfile
      .map((nutrient) => `${nutrient.label} ${nutrient.amountPer100g ?? ""}`)
      .join(" "),
    row.allergenFlags.join(" "),
    row.conditionFlags.join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function formatFoodTags(
  labels: ReturnType<typeof foodAdminLabels>,
  tags: string[]
) {
  return tags.length
    ? tags.map(foodTagLabel).join(", ")
    : labels.safetyNotes === "Safety notes"
      ? "None"
      : "ไม่มี";
}

export function formatNutrientAmount(value: number | null, unit: string) {
  if (value === null) {
    return "";
  }

  return `${Number.isInteger(value) ? value : value.toFixed(value < 1 ? 2 : 1)} ${unit}`;
}

export function defaultServingValue(row: AdminFoodRow) {
  return row.defaultServing
    ? `${row.defaultServing.label} · ${formatNutrientAmount(
        row.defaultServing.grams,
        "g"
      )}`
    : "";
}

export function nutrientProfileSummary(row: AdminFoodRow) {
  return row.nutrientProfile
    .filter((nutrient) => nutrient.amountPer100g !== null)
    .slice(0, 4)
    .map((nutrient) =>
      `${nutrient.label} ${formatNutrientAmount(
        nutrient.amountPer100g,
        nutrient.unit
      )}`
    )
    .join(", ");
}

export function formatFoodFlags(
  labels: ReturnType<typeof foodAdminLabels>,
  flags: string[]
) {
  return flags.length
    ? flags.map((flag) => readableToken(flag)).join(", ")
    : labels.safetyNotes === "Safety notes"
      ? "None"
      : "ไม่มี";
}

export function toggleFoodTag<T extends string>(tags: T[], tag: T) {
  return tags.includes(tag)
    ? tags.filter((item) => item !== tag)
    : [...tags, tag].sort();
}

export function updateFoodNutrientProfileValue(
  profile: FoodNutrientProfileValue[],
  nutrientId: FoodNutrientId,
  rawValue: string
) {
  const amount = rawValue.trim() ? Number(rawValue) : null;

  return profile.map((item) =>
    item.nutrientId === nutrientId
      ? {
          ...item,
          amountPer100g:
            amount !== null && Number.isFinite(amount) && amount >= 0
              ? Math.round(amount * 10000) / 10000
              : null,
          confidence: item.confidence ?? "moderate",
          source: item.source ?? "admin"
        }
      : item
  );
}

export function listStatusSummary<
  T extends Readonly<{ listStatus: FoodListStatus | SupplementListStatus }>
>(rows: readonly T[]) {
  return rows.reduce(
    (counts, row) => {
      counts.total += 1;

      if (row.listStatus === "whitelisted") {
        counts.whitelisted += 1;
      } else if (row.listStatus === "blacklisted") {
        counts.blacklisted += 1;
      } else if (row.listStatus === "inactive") {
        counts.inactive += 1;
      } else {
        counts.reviewRequired += 1;
      }

      return counts;
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

export function safetyMetric({
  color,
  id,
  label,
  locale,
  value
}: Readonly<{
  color: string;
  id: string;
  label: string;
  locale: Locale;
  value: number;
}>): BusinessMetric {
  return {
    color,
    id,
    label,
    series: [],
    value: formatNumber(value, locale)
  };
}
