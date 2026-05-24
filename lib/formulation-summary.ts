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
  }
} satisfies Record<Locale, Record<AssessmentPlan, string>>;

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
  return locale === "th"
    ? "ไม่ระบุเพศ / ไม่ระบุส่วนสูง / ไม่ระบุน้ำหนัก"
    : "Sex not shown / height not shown / weight not shown";
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
      ? [locale === "th" ? "ใช้ยาเป็นประจำ" : "Regular medication noted"]
      : []),
    ...(toText(record.kidney) && toText(record.kidney) !== "normal"
      ? [locale === "th" ? "บริบทไต" : `Kidney: ${humanize(toText(record.kidney))}`]
      : []),
    ...(toText(record.liver) && toText(record.liver) !== "normal"
      ? [locale === "th" ? "บริบทตับ" : `Liver: ${humanize(toText(record.liver))}`]
      : []),
    ...(toText(record.surgery) === "yes"
      ? [locale === "th" ? "มีการผ่าตัดเร็ว ๆ นี้" : "Upcoming surgery noted"]
      : []),
    ...(toText(record.antibiotics) === "yes"
      ? [locale === "th" ? "ใช้ยาปฏิชีวนะล่าสุด" : "Recent antibiotics noted"]
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
        : [
            locale === "th"
              ? "ตรวจฉลากเพื่อดูสารก่อแพ้และความไวต่อส่วนผสม"
              : "Review labels for allergies and sensitivities"
          ],
    goals:
      goals.length > 0
        ? goals
        : [locale === "th" ? "สุขภาพโดยรวม" : "General wellness"],
    plan: planLabels[locale][plan],
    profile:
      profileParts.length > 0
        ? profileParts.join(" / ")
        : fallbackProfile(locale),
    region
  };
}
