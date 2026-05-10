import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { Locale } from "@/lib/i18n";
import type { AssessmentSummary } from "@/lib/formulation-types";

const countryLabels: Record<string, string> = {
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
  const region = countryLabels[country] ?? valueLabel(country) ?? "Thailand";
  const sex = valueLabel(record.sex);
  const height = formatHeight(record.heightCm);
  const weight = formatWeight(record.weightKg);
  const profileParts = [sex, height, weight].filter(Boolean);
  const goals = toTextArray(record.goals).map(humanize);
  const symptoms = toTextArray(record.symptoms);
  const conditions = toTextArray(record.conditions);
  const medTypes = toTextArray(record.medTypes);
  const constraints = [
    ...conditions.map(humanize),
    ...medTypes.map(humanize),
    ...(toText(record.meds) === "yes"
      ? [locale === "th" ? "ใช้ยาเป็นประจำ" : "Regular medication noted"]
      : []),
    ...(toText(record.notes) ? [toText(record.notes)] : []),
    ...(symptoms.length > 0 ? symptoms.map(humanize).slice(0, 3) : [])
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
