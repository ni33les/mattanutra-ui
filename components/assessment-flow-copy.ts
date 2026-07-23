import type { Copy } from "@/components/assessment-flow-copy-types";
import { en } from "@/components/assessment-flow-copy-en";
import { th } from "@/components/assessment-flow-copy-th";
import { zhCn } from "@/components/assessment-flow-copy-zh-cn";
import type { Locale } from "@/lib/i18n";
import { getNamespace, t } from "@/lib/i18n-messages";

export const copies: Record<Locale, Copy> = { en, th, "zh-CN": zhCn };

export const gaugeLabelsByLocale = {
  en: ["Basic", "Essentials", "Precision"],
  th: ["พื้นฐาน", "ข้อมูลหลัก", "ความแม่นยำ"],
  "zh-CN": ["基础", "核心", "精准"]
} satisfies Record<Locale, readonly [string, string, string]>;

type AssessmentUiChrome = Readonly<{
  back: string;
  continue: string;
  countryHint: string;
  devDefaults: string;
  formulaPrecision: string;
  heightWeight: string;
  infoLabel: string;
  nameGreeting: (name: string) => string;
  precisionHint: (progress: number, remaining: number) => string;
  precisionMarks: readonly [string, string, string];
  privacyGate: {
    acceptedPrompt: string;
    body: string;
    checkbox: string;
    eyebrow: string;
    helper: string;
    link: string;
    prompt: string;
    required: string;
    title: string;
  };
  processingError: string;
  scoreProcessingSubtitle: string;
  scoreProcessingTitle: string;
  scoreGate: {
    planDescription: string;
    title: string;
  };
  retry: string;
  resume: {
    body: string;
    error: string;
    inputLabel: string;
    invalid: string;
    optional: string;
    placeholder: string;
    privacy: string;
    send: string;
    sending: string;
    sent: string;
    title: string;
  };
  section: (current: number, total: number) => string;
  selectCountry: string;
  stagesAria: string;
  sunHint: string;
  vo2Placeholder: string;
}>;

function assessmentUiForLocale(locale: Locale): AssessmentUiChrome {
  const chrome = getNamespace<{
    back: string;
    continue: string;
    countryHint: string;
    devDefaults: string;
    formulaPrecision: string;
    heightWeight: string;
    infoLabel: string;
    precisionMarks: [string, string, string];
    privacyGate: AssessmentUiChrome["privacyGate"];
    processingError: string;
    resume: AssessmentUiChrome["resume"];
    retry: string;
    scoreGate: AssessmentUiChrome["scoreGate"];
    scoreProcessingSubtitle: string;
    scoreProcessingTitle: string;
    selectCountry: string;
    stagesAria: string;
    sunHint: string;
    vo2Placeholder: string;
  }>(locale, "customer.assessmentUi");

  return {
    ...chrome,
    nameGreeting: (name: string) =>
      t(locale, "customer.assessmentUi.nameGreeting", { name }),
    precisionHint: (progress: number, remaining: number) =>
      remaining > 0
        ? t(locale, "customer.assessmentUi.precisionHint.remaining", {
            progress,
            remaining
          })
        : t(locale, "customer.assessmentUi.precisionHint.done", { progress }),
    section: (current: number, total: number) =>
      t(locale, "customer.assessmentUi.section", { current, total })
  };
}

export const assessmentUiCopy = {
  en: assessmentUiForLocale("en"),
  th: assessmentUiForLocale("th"),
  "zh-CN": assessmentUiForLocale("zh-CN")
} satisfies Record<Locale, AssessmentUiChrome>;
