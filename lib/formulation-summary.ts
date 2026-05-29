import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";
import type { AssessmentSummary } from "@/lib/formulation-types";

const countryLabels: Record<Locale, Record<string, string>> = {
  en: {
    AU: "Australia",
    CA: "Canada",
    CN: "China",
    DE: "Germany",
    FR: "France",
    GB: "United Kingdom",
    ID: "Indonesia",
    IN: "India",
    JP: "Japan",
    KR: "South Korea",
    MM: "Myanmar",
    MY: "Malaysia",
    OTHER: "Other",
    PH: "Philippines",
    SG: "Singapore",
    TH: "Thailand",
    US: "United States",
    VN: "Vietnam"
  },
  th: {
    AU: "ออสเตรเลีย",
    CA: "แคนาดา",
    CN: "จีน",
    DE: "เยอรมนี",
    FR: "ฝรั่งเศส",
    GB: "สหราชอาณาจักร",
    ID: "อินโดนีเซีย",
    IN: "อินเดีย",
    JP: "ญี่ปุ่น",
    KR: "เกาหลีใต้",
    MM: "เมียนมา",
    MY: "มาเลเซีย",
    OTHER: "อื่น ๆ",
    PH: "ฟิลิปปินส์",
    SG: "สิงคโปร์",
    TH: "ประเทศไทย",
    US: "สหรัฐอเมริกา",
    VN: "เวียดนาม"
  },
  "zh-CN": {
    AU: "澳大利亚",
    CA: "加拿大",
    CN: "中国",
    DE: "德国",
    FR: "法国",
    GB: "英国",
    ID: "印度尼西亚",
    IN: "印度",
    JP: "日本",
    KR: "韩国",
    MM: "缅甸",
    MY: "马来西亚",
    OTHER: "其他",
    PH: "菲律宾",
    SG: "新加坡",
    TH: "泰国",
    US: "美国",
    VN: "越南"
  }
};

const answerLabels: Record<Locale, Record<string, string>> = {
  en: {
    energy: "Energy",
    fatigue: "Fatigue",
    female: "Female",
    fitness: "Fitness",
    focus: "Focus",
    male: "Male",
    sleep: "Sleep",
    statin: "Statin"
  },
  th: {
    energy: "พลังงาน",
    fatigue: "อ่อนเพลีย",
    female: "หญิง",
    fitness: "ฟิตเนส",
    focus: "สมาธิ",
    male: "ชาย",
    sleep: "การนอน",
    statin: "สแตติน"
  },
  "zh-CN": {
    energy: "精力",
    fatigue: "疲劳",
    female: "女性",
    fitness: "健身",
    focus: "专注",
    male: "男性",
    sleep: "睡眠",
    statin: "他汀"
  }
};

const planLabels = {
  en: {
    precision: "Precision",
    pro: "Pro"
  },
  th: {
    precision: "ความแม่นยำ",
    pro: "โปร"
  },
  "zh-CN": {
    precision: "精准",
    pro: "专业"
  }
} satisfies Record<Locale, Record<AssessmentPlan, string>>;

const summaryCopy = {
  en: {
    fallbackGoals: "General wellness",
    fallbackProfile: "Sex not shown / height not shown / weight not shown",
    labelAntibiotics: "Recent antibiotics noted",
    labelKidney(value: string) {
      return `Kidney: ${humanize(value)}`;
    },
    labelLiver(value: string) {
      return `Liver: ${humanize(value)}`;
    },
    labelMedication: "Regular medication noted",
    labelSurgery: "Upcoming surgery noted",
    reviewLabels: "Review labels for allergies and sensitivities"
  },
  th: {
    fallbackGoals: "สุขภาพโดยรวม",
    fallbackProfile: "ไม่ระบุเพศ / ไม่ระบุส่วนสูง / ไม่ระบุน้ำหนัก",
    labelAntibiotics: "ใช้ยาปฏิชีวนะล่าสุด",
    labelKidney() {
      return "บริบทไต";
    },
    labelLiver() {
      return "บริบทตับ";
    },
    labelMedication: "ใช้ยาเป็นประจำ",
    labelSurgery: "มีการผ่าตัดเร็ว ๆ นี้",
    reviewLabels: "ตรวจฉลากเพื่อดูสารก่อแพ้และความไวต่อส่วนผสม"
  },
  "zh-CN": {
    fallbackGoals: "整体健康",
    fallbackProfile: "未显示性别 / 未显示身高 / 未显示体重",
    labelAntibiotics: "近期使用过抗生素",
    labelKidney(value: string) {
      return `肾脏：${humanize(value)}`;
    },
    labelLiver(value: string) {
      return `肝脏：${humanize(value)}`;
    },
    labelMedication: "有规律用药",
    labelSurgery: "近期有手术安排",
    reviewLabels: "检查标签中的过敏原和敏感成分"
  }
} satisfies Record<Locale, {
  fallbackGoals: string;
  fallbackProfile: string;
  labelAntibiotics: string;
  labelKidney(value: string): string;
  labelLiver(value: string): string;
  labelMedication: string;
  labelSurgery: string;
  reviewLabels: string;
}>;

function toRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function toTextArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => toText(item)).filter(Boolean)
    : [];
}

function humanize(value: string) {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function valueLabel(value: unknown) {
  const text = toText(value);
  return text ? humanize(text) : "";
}

function localizedValueLabel(value: unknown, locale: Locale) {
  const text = toText(value);

  return text ? answerLabels[locale][text] ?? humanize(text) : "";
}

function formatHeight(value: unknown) {
  const cm = Number(value);

  if (!Number.isFinite(cm) || cm <= 0) {
    return "";
  }

  return `${Math.round(cm)} cm`;
}

function formatWeight(value: unknown) {
  const kg = Number(value);

  if (!Number.isFinite(kg) || kg <= 0) {
    return "";
  }

  return `${Math.round(kg)} kg`;
}

function fallbackProfile(locale: Locale) {
  return summaryCopy[locale].fallbackProfile;
}

export function buildAssessmentSummary({
  answers,
  locale,
  plan
}: Readonly<{
  answers?: unknown;
  locale: Locale;
  plan: AssessmentPlan;
}>): AssessmentSummary {
  const record = toRecord(answers);
  const country = toText(record.country) || "TH";
  const region = countryLabels[locale][country] ?? valueLabel(country) ?? "Thailand";
  const sex = localizedValueLabel(record.sex, locale);
  const height = formatHeight(record.heightCm);
  const weight = formatWeight(record.weightKg);
  const profileParts = [sex, height, weight].filter(Boolean);
  const goals = toTextArray(record.goals).map((value) =>
    localizedValueLabel(value, locale)
  );
  const symptoms = toTextArray(record.symptoms);
  const medTypes = toTextArray(record.medTypes);
  const supplementSensitivities = toTextArray(record.suppAllergies).filter(
    (item) => item !== "none"
  );
  const constraints = [
    ...medTypes.map((value) => localizedValueLabel(value, locale)),
    ...(toText(record.meds) === "yes"
      ? [summaryCopy[locale].labelMedication]
      : []),
    ...(toText(record.kidney) && toText(record.kidney) !== "normal"
      ? [summaryCopy[locale].labelKidney(toText(record.kidney))]
      : []),
    ...(toText(record.liver) && toText(record.liver) !== "normal"
      ? [summaryCopy[locale].labelLiver(toText(record.liver))]
      : []),
    ...(toText(record.surgery) === "yes"
      ? [summaryCopy[locale].labelSurgery]
      : []),
    ...(toText(record.antibiotics) === "yes"
      ? [summaryCopy[locale].labelAntibiotics]
      : []),
    ...(supplementSensitivities.length > 0
      ? supplementSensitivities.map(humanize)
      : []),
    ...(symptoms.length > 0
      ? symptoms.map((value) => localizedValueLabel(value, locale)).slice(0, 3)
      : [])
  ];

  return {
    constraints:
      constraints.length > 0
        ? constraints
        : [summaryCopy[locale].reviewLabels],
    goals:
      goals.length > 0
        ? goals
        : [summaryCopy[locale].fallbackGoals],
    plan: planLabels[locale][plan],
    profile:
      profileParts.length > 0
        ? profileParts.join(" / ")
        : fallbackProfile(locale),
    region
  };
}
