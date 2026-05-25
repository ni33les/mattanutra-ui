"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import {
  ExclamationTriangleIcon,
  InformationCircleIcon
} from "@heroicons/react/20/solid";
import { NutritionProgress } from "@/components/nutrition-progress";
import type {
  FormulationIngredient,
  FormulationResult,
  LocalizedText,
  ProductRecommendationOption,
  ProductStackPreference,
  RecommendedProduct
} from "@/lib/formulation-types";
import { foodTagLabel } from "@/lib/food-tags";
import {
  localeHtmlLang,
  localizedTextSearchValue,
  resolveLocalizedText,
  type Locale
} from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionRefinePath
} from "@/lib/nutrition-paths";

type FormulationResultsProps = Readonly<{
  initialResult?: FormulationResult | null;
  locale: Locale;
  planId: string;
}>;

type LoadState = "loading" | "ready" | "error";

const MAX_PRODUCT_MATCHING_POLLS = 80;
const PENDING_SECTION_POLL_INTERVAL_MS = 1_000;
const PENDING_PRODUCT_MATCHING_POLL_INTERVAL_MS = 750;
const FOOD_GUIDANCE_VISIBLE = false;

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

type CopyLabels = Record<
  | "connectChatBody"
  | "connectChatButton"
  | "connectChatEyebrow"
  | "connectChatPlanId"
  | "connectChatQrAlt"
  | "connectChatTitle"
  | "benefits"
  | "constraints"
  | "context"
  | "cautions"
  | "coveragePrefix"
  | "coverageSuffix"
  | "productCoverage"
  | "doseAdjustedBody"
  | "error"
  | "formula"
  | "formulaEmptyBody"
  | "formulaEmptyTitle"
  | "formulaHint"
  | "formulaNoVisibleBody"
  | "formulaNoVisibleTitle"
  | "foods"
  | "foodsEmptyBody"
  | "foodsEmptyTitle"
  | "foodsHint"
  | "foodServing"
  | "finalizeError"
  | "finalizePlan"
  | "finalizeReady"
  | "finalizeWaiting"
  | "finalizingPlan"
  | "finalReportDailyFocus"
  | "finalReportNextSteps"
  | "finalReportSafetyNotes"
  | "finalReportSynergies"
  | "generated"
  | "goals"
  | "heroSubtitle"
  | "heroTitle"
  | "loading"
  | "nutritionProgressBody"
  | "nutritionProgressFoods"
  | "nutritionProgressPending"
  | "nutritionProgressReady"
  | "nutritionProgressSupplements"
  | "nutritionProgressTitle"
  | "dailyDose"
  | "plan"
  | "previewBadge"
  | "previewBody"
  | "previewCta"
  | "previewLockedBody"
  | "previewLockedTitle"
  | "previewTitle"
  | "profile"
  | "region"
  | "safety"
  | "safetyCaptureAddress"
  | "safetyCaptureBody"
  | "safetyCaptureChannel"
  | "safetyCaptureChatPlaceholder"
  | "safetyCaptureEmailPlaceholder"
  | "safetyCaptureError"
  | "safetyCaptureSubmit"
  | "safetyCaptureSuccess"
  | "safetyCaptureTitle"
  | "safetyChannelEmail"
  | "safetyChannelLine"
  | "safetyChannelTelegram"
  | "safetyChannelWhatsapp"
  | "safetyReviewBody"
  | "safetyReviewTitle"
  | "foodSafetyReviewBody"
  | "foodSafetyReviewTitle"
  | "foodUnderReview"
  | "supplementUnderReview",
  string
> & {
  safetyNotes: string[];
};

export const formulationResultsCopy = {
  en: {
    benefits: "Benefits",
    connectChatBody:
      "Choose your preferred chat app for support tailored to your diet, routine, travel, training, and daily life. Send your plan and the advisor can continue from this recommendation.",
    connectChatButton: "Open chat",
    connectChatEyebrow: "Continue in chat",
    connectChatPlanId: "Plan",
    connectChatQrAlt: "QR code to connect with the MattaNutra AI advisor",
    connectChatTitle:
      "Connect with our specialist AI supplement advisor for ongoing support and refinement.",
    constraints: "Constraints",
    context: "Assessment summary",
    cautions: "Cautions",
    coveragePrefix: "Covers",
    coverageSuffix: "of the recommended supplements",
    productCoverage: "Product coverage",
    doseAdjustedBody:
      "One or more doses were automatically reduced to stay within the configured MattaNutra safety ceiling.",
    error:
      "The formulation could not be loaded. Please refresh the page and try again.",
    formula: "Supplement breakdown",
    formulaEmptyBody:
      "Every supplement suggestion needs a safety review before we show it. The review queue has been notified.",
    formulaEmptyTitle: "Safety review in progress",
    formulaHint:
      "Your suggested supplement stack, grouped by role, with practical daily dose guidance.",
    formulaNoVisibleBody:
      "The reviewed items are no longer pending. Only supplements that pass MattaNutra review are shown here.",
    formulaNoVisibleTitle: "No visible supplement suggestions",
    foods: "Food guidance",
    foodsEmptyBody:
      "Every food suggestion needs a safety review before we show it. The review queue has been notified.",
    foodsEmptyTitle: "Food review in progress",
    foodsHint:
      "Practical foods and ingredients to build into meals, routines, and future concierge conversations.",
    foodServing: "Serving",
    finalizeError: "We could not deliver the nutrition plan. Please try again.",
    finalizePlan: "Deliver Nutrition Plan",
    finalizeReady: "Nutrition plan delivered",
    finalizeWaiting: "Supplement guidance must finish before delivery.",
    finalizingPlan: "Delivering plan",
    finalReportDailyFocus: "Daily focus",
    finalReportNextSteps: "Next steps",
    finalReportSafetyNotes: "Safety notes",
    finalReportSynergies: "Supplement fit",
    generated: "Generated",
    goals: "Goals",
    heroSubtitle:
      "Review the supplements, tell us what to change, then refine the plan around your preferences.",
    heroTitle: "Let's refine your nutrition guidance",
    loading: "Loading your formulation",
    nutritionProgressBody:
      "We’re preparing your supplement guidance. The refinement tools will appear here as soon as everything is ready.",
    nutritionProgressFoods: "Food guidance",
    nutritionProgressPending: "Preparing",
    nutritionProgressReady: "Ready",
    nutritionProgressSupplements: "Supplement guidance",
    nutritionProgressTitle: "Preparing your guidance",
    dailyDose: "Dose",
    plan: "Plan",
    previewBadge: "Free preview",
    previewBody:
      "Your full formulation is ready. The free preview shows the top three supplement recommendations; unlock the plan to reveal the remaining details and continue.",
    previewCta: "Unlock full plan",
    previewLockedBody:
      "The rest of your personalised recommendations are ready and will be revealed after unlock.",
    previewLockedTitle: "More recommendations locked",
    previewTitle: "Preview first, unlock when you're ready",
    profile: "Profile",
    region: "Region",
    safety: "Cautions",
    safetyCaptureAddress: "Contact detail",
    safetyCaptureBody:
      "Leave one contact channel and we will tell you when the human review is complete.",
    safetyCaptureChannel: "Preferred channel",
    safetyCaptureChatPlaceholder: "Your handle or number",
    safetyCaptureEmailPlaceholder: "you@example.com",
    safetyCaptureError: "We could not save that contact detail. Please try again.",
    safetyCaptureSubmit: "Save contact",
    safetyCaptureSuccess:
      "Contact saved. We will use this channel for the review update.",
    safetyCaptureTitle: "Want us to come back to you?",
    safetyChannelEmail: "Email",
    safetyChannelLine: "LINE",
    safetyChannelTelegram: "Telegram",
    safetyChannelWhatsapp: "WhatsApp",
    safetyReviewBody:
      "A few supplement suggestions need a human safety check. We show them as review placeholders until the team approves the details.",
    safetyReviewTitle: "Safety review active",
    foodSafetyReviewBody:
      "A few food suggestions need a human safety check. We show them as review placeholders until the team approves the details.",
    foodSafetyReviewTitle: "Food safety review active",
    foodUnderReview: "This food is under review by our team.",
    supplementUnderReview: "This supplement is under review by our team.",
    safetyNotes: [
      "These are optional wellness product suggestions, not medical advice.",
      "Review all labels for allergens, ingredients, and daily use instructions before purchase.",
      "Ask a qualified clinician or pharmacist to review the plan if you are pregnant, breastfeeding, taking medication, or managing a medical condition."
    ]
  },
  th: {
    benefits: "ประโยชน์",
    connectChatBody:
      "เลือกแอปแชตที่คุณสะดวก เพื่อรับการดูแลต่อเนื่องที่ปรับตามอาหาร กิจวัตร การเดินทาง การฝึก และชีวิตประจำวัน ส่งแผนของคุณแล้วผู้ช่วยจะคุยต่อจากคำแนะนำนี้ได้",
    connectChatButton: "เปิดแชต",
    connectChatEyebrow: "คุยต่อในแชต",
    connectChatPlanId: "แผน",
    connectChatQrAlt: "คิวอาร์โค้ดสำหรับเชื่อมต่อผู้ช่วย AI ของ MattaNutra",
    connectChatTitle:
      "เชื่อมต่อกับผู้ช่วย AI เฉพาะทางด้านอาหารเสริมเพื่อการดูแลและปรับแผนต่อเนื่อง",
    constraints: "ข้อจำกัด",
    context: "สรุปแบบประเมิน",
    cautions: "ข้อควรระวัง",
    coveragePrefix: "ครอบคลุม",
    coverageSuffix: "ของรายการอาหารเสริมที่แนะนำ",
    productCoverage: "ความครอบคลุมจากผลิตภัณฑ์",
    doseAdjustedBody:
      "มีการลดขนาดรับประทานบางรายการให้อยู่ในเพดานความปลอดภัยของ MattaNutra โดยอัตโนมัติ",
    error: "ไม่สามารถโหลดสูตรได้ กรุณารีเฟรชหน้าและลองอีกครั้ง",
    formula: "รายการอาหารเสริม",
    formulaEmptyBody:
      "คำแนะนำอาหารเสริมทั้งหมดต้องผ่านการตรวจสอบด้านความปลอดภัยก่อนแสดง ทีมรีวิวได้รับรายการแล้ว",
    formulaEmptyTitle: "กำลังตรวจสอบความปลอดภัย",
    formulaHint:
      "รายการอาหารเสริมที่แนะนำ จัดกลุ่มตามบทบาท พร้อมขนาดรับประทานต่อวันที่ใช้งานได้จริง",
    formulaNoVisibleBody:
      "รายการที่รีวิวแล้วไม่ได้ค้างอยู่ในคิวอีกต่อไป หน้านี้จะแสดงเฉพาะรายการที่ผ่านการตรวจสอบของ MattaNutra",
    formulaNoVisibleTitle: "ยังไม่มีรายการอาหารเสริมที่แสดงได้",
    foods: "คำแนะนำอาหาร",
    foodsEmptyBody:
      "คำแนะนำอาหารทั้งหมดต้องผ่านการตรวจสอบด้านความปลอดภัยก่อนแสดง ทีมรีวิวได้รับรายการแล้ว",
    foodsEmptyTitle: "กำลังตรวจสอบอาหาร",
    foodsHint:
      "อาหารและวัตถุดิบที่นำไปใช้กับมื้ออาหาร กิจวัตร และบทสนทนากับผู้ช่วยดูแลต่อไปได้",
    foodServing: "ปริมาณ",
    finalizeError: "ไม่สามารถส่งมอบแผนโภชนาการได้ กรุณาลองอีกครั้ง",
    finalizePlan: "ส่งมอบแผนโภชนาการ",
    finalizeReady: "ส่งมอบแผนโภชนาการแล้ว",
    finalizeWaiting:
      "ต้องรอคำแนะนำอาหารเสริมให้เสร็จก่อนส่งมอบแผน",
    finalizingPlan: "กำลังส่งมอบแผน",
    finalReportDailyFocus: "สิ่งที่ควรโฟกัสในแต่ละวัน",
    finalReportNextSteps: "ขั้นตอนถัดไป",
    finalReportSafetyNotes: "หมายเหตุด้านความปลอดภัย",
    finalReportSynergies: "ความเหมาะสมของอาหารเสริม",
    generated: "สร้างเมื่อ",
    goals: "เป้าหมาย",
    heroSubtitle:
      "ตรวจคำแนะนำอาหารเสริม บอกเราว่าต้องการเปลี่ยนอะไร แล้วปรับแผนให้เข้ากับคุณ",
    heroTitle: "มาปรับคำแนะนำโภชนาการของคุณกัน",
    loading: "กำลังโหลดสูตรของคุณ",
    nutritionProgressBody:
      "เรากำลังเตรียมคำแนะนำอาหารเสริม เครื่องมือปรับแผนจะแสดงที่นี่เมื่อทุกอย่างพร้อม",
    nutritionProgressFoods: "คำแนะนำอาหาร",
    nutritionProgressPending: "กำลังเตรียม",
    nutritionProgressReady: "พร้อมแล้ว",
    nutritionProgressSupplements: "คำแนะนำอาหารเสริม",
    nutritionProgressTitle: "กำลังเตรียมคำแนะนำของคุณ",
    dailyDose: "ขนาด",
    plan: "แผน",
    previewBadge: "ตัวอย่างฟรี",
    previewBody:
      "สูตรฉบับเต็มของคุณพร้อมแล้ว ตัวอย่างฟรีแสดงคำแนะนำ 3 รายการแรก ปลดล็อกแผนเพื่อดูรายละเอียดที่เหลือและไปต่อ",
    previewCta: "ปลดล็อกแผนฉบับเต็ม",
    previewLockedBody:
      "คำแนะนำเฉพาะบุคคลที่เหลือพร้อมแล้ว และจะแสดงหลังจากปลดล็อก",
    previewLockedTitle: "ยังมีคำแนะนำเพิ่มเติมที่ล็อกอยู่",
    previewTitle: "ดูตัวอย่างก่อน แล้วปลดล็อกเมื่อพร้อม",
    profile: "โปรไฟล์",
    region: "ภูมิภาค",
    safety: "ข้อควรระวัง",
    safetyCaptureAddress: "รายละเอียดติดต่อ",
    safetyCaptureBody:
      "ฝากช่องทางติดต่อไว้หนึ่งช่องทาง แล้วเราจะแจ้งเมื่อทีมตรวจสอบเสร็จ",
    safetyCaptureChannel: "ช่องทางที่สะดวก",
    safetyCaptureChatPlaceholder: "แฮนเดิลหรือหมายเลขของคุณ",
    safetyCaptureEmailPlaceholder: "you@example.com",
    safetyCaptureError: "ไม่สามารถบันทึกช่องทางติดต่อได้ กรุณาลองอีกครั้ง",
    safetyCaptureSubmit: "บันทึกช่องทางติดต่อ",
    safetyCaptureSuccess:
      "บันทึกแล้ว เราจะใช้ช่องทางนี้เพื่อแจ้งผลการตรวจสอบ",
    safetyCaptureTitle: "ต้องการให้เราติดต่อกลับไหม",
    safetyChannelEmail: "อีเมล",
    safetyChannelLine: "LINE",
    safetyChannelTelegram: "Telegram",
    safetyChannelWhatsapp: "WhatsApp",
    safetyReviewBody:
      "คำแนะนำอาหารเสริมบางรายการต้องผ่านการตรวจสอบความปลอดภัยโดยทีมงาน เราจะแสดงเป็นรายการรอตรวจสอบจนกว่าทีมจะอนุมัติรายละเอียด",
    safetyReviewTitle: "มีการตรวจสอบความปลอดภัย",
    foodSafetyReviewBody:
      "คำแนะนำอาหารบางรายการต้องผ่านการตรวจสอบความปลอดภัยโดยทีมงาน เราจะแสดงเป็นรายการรอตรวจสอบจนกว่าทีมจะอนุมัติรายละเอียด",
    foodSafetyReviewTitle: "มีการตรวจสอบความปลอดภัยด้านอาหาร",
    foodUnderReview: "อาหารรายการนี้อยู่ระหว่างการตรวจสอบโดยทีมของเรา",
    supplementUnderReview: "อาหารเสริมรายการนี้อยู่ระหว่างการตรวจสอบโดยทีมของเรา",
    safetyNotes: [
      "คำแนะนำเหล่านี้เป็นตัวเลือกผลิตภัณฑ์เพื่อสุขภาพ ไม่ใช่คำแนะนำทางการแพทย์",
      "ตรวจฉลากทั้งหมดเพื่อดูสารก่อแพ้ ส่วนผสม และวิธีใช้ต่อวันก่อนซื้อ",
      "ปรึกษาแพทย์หรือเภสัชกรหากคุณตั้งครรภ์ ให้นมบุตร ใช้ยา หรือมีโรคประจำตัว"
    ]
  }
} satisfies Record<Locale, CopyLabels>;

function getLocalizedText(value: LocalizedText, locale: Locale) {
  return resolveLocalizedText(value, locale);
}

function searchableLocalizedText(value: LocalizedText) {
  return localizedTextSearchValue(value);
}

function supplementBenefitTags(ingredient: FormulationIngredient) {
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

function planResultsHref(locale: Locale, planId: string) {
  return nutritionRefinePath(locale, planId);
}

function planPaywallHref(locale: Locale, planId: string) {
  return nutritionHealthScorePath(locale, planId);
}

function resultHasPendingSections(result: FormulationResult) {
  const statuses = result.sectionStatuses;

  return Boolean(
    statuses &&
      (statuses.foods === "pending" ||
        statuses.supplements === "pending" ||
        statuses.report === "pending")
  );
}

function resultHasPendingProductRecommendations(result: FormulationResult) {
  if (result.access === "preview") {
    return false;
  }

  const productStatus = result.productRecommendations?.status;

  if (productStatus === "pending") {
    return true;
  }

  return Boolean(
    !productStatus &&
      result.sectionStatuses?.foods === "ready" &&
      result.sectionStatuses?.supplements === "ready"
  );
}

function supplementProductCoverageById(
  productRecommendations: FormulationResult["productRecommendations"] | undefined
) {
  const coverage = new Map<string, number>();

  for (const item of productRecommendations?.needCoverage ?? []) {
    if (item.itemType !== "supplement") {
      continue;
    }

    const supplementId = item.id.startsWith("supplement:")
      ? item.id.slice("supplement:".length)
      : item.id;

    coverage.set(
      supplementId,
      Math.min(100, Math.max(0, Math.round(item.coveragePercent)))
    );
  }

  return coverage;
}

function productRecommendationOptionsForResult(result: FormulationResult) {
  if (result.productRecommendationOptions?.length) {
    return result.productRecommendationOptions;
  }

  if (!result.productRecommendations) {
    return [];
  }

  return [{
    id: result.productRecommendations.stackPreference ?? "balanced",
    productRecommendations: result.productRecommendations,
    recommendations: result.recommendations
  }] satisfies ProductRecommendationOption[];
}

function selectProductRecommendationOption(
  options: readonly ProductRecommendationOption[],
  selectedPreference: ProductStackPreference | null
) {
  return (
    options.find((option) => option.id === selectedPreference) ??
    options.find((option) => option.id === "balanced") ??
    options[0]
  );
}

export function FormulationResults({
  initialResult = null,
  locale,
  planId
}: FormulationResultsProps) {
  const labels = formulationResultsCopy[locale];
  const effectivePlanId = planId;
  const [loadState, setLoadState] = useState<LoadState>(
    initialResult ? "ready" : "loading"
  );
  const [result, setResult] = useState<FormulationResult | null>(initialResult);
  const [selectedProductStackPreference, setSelectedProductStackPreference] =
    useState<ProductStackPreference | null>(null);
  const productPollAttemptsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    productPollAttemptsRef.current = 0;

    async function fetchFormulation() {
      try {
        const response = await fetch(
          `/api/assessment/${encodeURIComponent(effectivePlanId)}/formulation?locale=${locale}`,
          { cache: "no-store" }
        );

        if (response.status === 202) {
          retryTimer = window.setTimeout(fetchFormulation, 1000);
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load formulation");
        }

        const payload = (await response.json()) as FormulationResult;

        if (!cancelled) {
          setResult(payload);
          setLoadState("ready");

          const productMatchingPending =
            resultHasPendingProductRecommendations(payload);
          const shouldPollProductMatching =
            productMatchingPending &&
            productPollAttemptsRef.current < MAX_PRODUCT_MATCHING_POLLS;

          if (productMatchingPending) {
            productPollAttemptsRef.current += 1;
          }

          if (resultHasPendingSections(payload) || shouldPollProductMatching) {
            retryTimer = window.setTimeout(
              fetchFormulation,
              shouldPollProductMatching
                ? PENDING_PRODUCT_MATCHING_POLL_INTERVAL_MS
                : PENDING_SECTION_POLL_INTERVAL_MS
            );
          }
        }
      } catch {
        if (!cancelled) {
          setLoadState("error");
        }
      }
    }

    fetchFormulation();

    return () => {
      cancelled = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [effectivePlanId, locale]);

  useEffect(() => {
    if (!result) {
      return;
    }

    const options = productRecommendationOptionsForResult(result);
    const defaultPreference =
      result.productRecommendations?.stackPreference ??
      options.find((option) => option.id === "balanced")?.id ??
      options[0]?.id ??
      null;

    startTransition(() => {
      setSelectedProductStackPreference((current) =>
        current && options.some((option) => option.id === current)
          ? current
          : defaultPreference
      );
    });
  }, [result]);

  if (loadState === "loading") {
    return (
      <NutritionGuidancePreparingPanel
        labels={labels}
        locale={locale}
      />
    );
  }

  if (loadState === "error" || !result) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
        <NutritionProgress
          className="mb-8"
          current="refine"
          locale={locale}
        />
        <div className="rounded-lg bg-white p-6 text-center ring-1 ring-foreground/10 sm:p-8">
          <ExclamationTriangleIcon
            aria-hidden={true}
            className="mx-auto size-10 text-amber-500"
          />
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            {labels.error}
          </p>
        </div>
      </section>
    );
  }

  const orderedIngredients = [...result.supplementBreakdown].sort(
    (first, second) => first.effectivenessRank - second.effectivenessRank
  );
  const formattedDate = new Intl.DateTimeFormat(
    localeHtmlLang(locale),
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(new Date(result.generatedAt));
  const effectiveResultPlanId = result.planId || effectivePlanId;
  const isPreview = result.access === "preview";
  const sectionStatuses = result.sectionStatuses ?? {
    foods: (result.foodGuidance ?? []).length > 0 ? "ready" : "pending",
    supplements: orderedIngredients.length > 0 ? "ready" : "pending"
  };
  const nutritionPending =
    (FOOD_GUIDANCE_VISIBLE && sectionStatuses.foods !== "ready") ||
    sectionStatuses.supplements !== "ready";
  const unlockHref = planPaywallHref(locale, effectiveResultPlanId);
  const productRecommendationOptions = productRecommendationOptionsForResult(result);
  const selectedProductRecommendationOption = selectProductRecommendationOption(
    productRecommendationOptions,
    selectedProductStackPreference
  );
  const activeProductRecommendations =
    selectedProductRecommendationOption?.productRecommendations ??
    result.productRecommendations;
  const activeProductRecommendationItems =
    selectedProductRecommendationOption?.recommendations ?? result.recommendations;
  const productCoverageBySupplementId = supplementProductCoverageById(
    activeProductRecommendations
  );

  if (nutritionPending) {
    return (
      <NutritionGuidancePreparingPanel
        labels={labels}
        locale={locale}
      />
    );
  }

  return (
    <RevealResultsPage
      activeProductRecommendations={activeProductRecommendations}
      formattedDate={formattedDate}
      ingredients={orderedIngredients}
      isPreview={isPreview}
      labels={labels}
      locale={locale}
      onProductStackPreferenceChange={setSelectedProductStackPreference}
      planId={effectiveResultPlanId}
      productCoverageBySupplementId={productCoverageBySupplementId}
      productRecommendationOptions={productRecommendationOptions}
      products={activeProductRecommendationItems}
      result={result}
      selectedProductStackPreference={
        selectedProductRecommendationOption?.id ??
        selectedProductStackPreference
      }
      unlockHref={unlockHref}
    />
  );
}

type PanelLabels = (typeof formulationResultsCopy)["en"];

function NutritionGuidancePreparingPanel({
  labels,
  locale
}: Readonly<{
  labels: PanelLabels;
  locale: Locale;
}>) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
      <NutritionProgress
        className="mb-8"
        current="refine"
        locale={locale}
        pending={true}
      />
      <div
        aria-live="polite"
        className="rounded-lg bg-white p-6 ring-1 ring-foreground/10 transition-colors sm:p-8"
      >
        <h1 className="max-w-2xl text-2xl font-semibold tracking-normal text-[var(--mn-ink)] sm:text-3xl">
          {labels.nutritionProgressTitle}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {labels.nutritionProgressBody}
        </p>
      </div>
    </section>
  );
}

const revealCopy = {
  en: {
    ingredientCount: "ingredients",
    catalogueProducts: "approved products",
    catalogueSupplements: "supplements in catalogue",
    compactCoverageLabel: "Stack coverage",
    contributionLabel: "of selected stack",
    distilledEyebrow: "Distilled",
    distilledSummaryTemplate:
      "{supplementTotal} catalogue supplements assessed, {supplementSelected} selected for your formula, {productTotal} approved products checked, and {productSelected} recommended for you.",
    distilledTitle: "From broad possibility to a focused formula.",
    formulaEyebrow: "Your formula",
    formulaLead:
      "These are the supplement priorities selected from your answers, cautions and product coverage.",
    formulaTitle: "The exact stack selected for you.",
    heroEyebrow: "Your Right Amount",
    heroTitle: "Your Right Amount",
    heroHeadline:
      "Your plan has been distilled into the few things most likely to matter.",
    heroMetaGenerated: "Generated",
    heroMetaPlan: "Plan ID",
    heroSub:
      "We have turned your assessment into a practical formula and matched it to available products where the catalogue can support it.",
    personalizationBody:
      "Your result is shaped by your profile, goals, country, budget, preferences and cautions. These signals explain why this is not a generic supplement list.",
    personalizationEyebrow: "Personalisation",
    personalizationTitle: "We built this around your context.",
    productsBody:
      "Products are shown as the closest available stack from the approved catalogue. The goal is fewer bottles, clear coverage and no unnecessary overlap.",
    productsEmpty:
      "The formula is ready, but the product catalogue does not yet contain an approved stack for these needs.",
    productsTitle: "From shelves to certainty.",
    supplementsRecommended: "supplements recommended",
    productsRecommended: "products recommended for you",
    productDoseRecommended: "Recommended dose",
    productServingUnit: "servings",
    productSingleServingUnit: "serving",
    productMatchTemplate:
      "Matches {covers} and accounts for {percent}% of the selected stack.",
    productServingMatchTemplate:
      "Use {servings} {servingUnit}. Matches {covers} and accounts for {percent}% of the selected stack.",
    selectedProducts: "Selected products",
    selectedSuffix: "selected",
    tableAmount: "Daily amount",
    tableCoverage: "Product fit",
    tableName: "Supplement",
    tableReason: "Why it is here",
    viewProduct: "View product",
    cautionsTitle: "Cautions checked",
    closingTitle: "The wisdom of knowing the right amount",
    closingBody:
      "Not from more, but from exactly enough. This formula is the practical version of that idea: the right priorities, in the right amounts, with product choices where the data is strong enough.",
    etymologyLine: "Pāli · knowing the right amount",
    print: "Print or save PDF",
    save: "Open this plan",
    reassess: "Reassess later",
    wellnessOnly:
      "Wellness information only. Share this plan with a physician or pharmacist if you use medication, are pregnant or breastfeeding, have a medical condition, or your situation changes."
  },
  th: {
    ingredientCount: "ส่วนผสม",
    catalogueProducts: "ผลิตภัณฑ์ที่อนุมัติแล้ว",
    catalogueSupplements: "อาหารเสริมในแคตตาล็อก",
    compactCoverageLabel: "ความครอบคลุมของชุดสินค้า",
    contributionLabel: "ของชุดที่เลือก",
    distilledEyebrow: "กลั่นให้ชัด",
    distilledSummaryTemplate:
      "ประเมินอาหารเสริมในแคตตาล็อก {supplementTotal} รายการ เลือก {supplementSelected} รายการสำหรับสูตรของคุณ ตรวจผลิตภัณฑ์ที่อนุมัติแล้ว {productTotal} รายการ และแนะนำ {productSelected} รายการสำหรับคุณ",
    distilledTitle: "จากตัวเลือกมากมาย สู่สูตรที่โฟกัสเฉพาะคุณ",
    formulaEyebrow: "สูตรของคุณ",
    formulaLead:
      "นี่คือลำดับความสำคัญของอาหารเสริมที่เลือกจากคำตอบ ข้อควรระวัง และความครอบคลุมของผลิตภัณฑ์",
    formulaTitle: "ชุดอาหารเสริมที่เลือกให้คุณ",
    heroEyebrow: "ปริมาณที่พอดีของคุณ",
    heroTitle: "ปริมาณที่พอดีของคุณ",
    heroHeadline: "แผนของคุณถูกกลั่นให้เหลือสิ่งที่น่าจะสำคัญที่สุด",
    heroMetaGenerated: "สร้างเมื่อ",
    heroMetaPlan: "รหัสแผน",
    heroSub:
      "เราแปลงแบบประเมินของคุณเป็นสูตรที่ใช้งานได้จริง และจับคู่กับผลิตภัณฑ์ที่มีข้อมูลเพียงพอในแคตตาล็อก",
    personalizationBody:
      "ผลลัพธ์นี้ใช้โปรไฟล์ เป้าหมาย ประเทศ งบประมาณ ความชอบ และข้อควรระวังของคุณ จึงไม่ใช่รายการอาหารเสริมทั่วไป",
    personalizationEyebrow: "เฉพาะบุคคล",
    personalizationTitle: "เราสร้างแผนจากบริบทของคุณ",
    productsBody:
      "ผลิตภัณฑ์ที่แสดงคือชุดที่ใกล้ที่สุดจากแคตตาล็อกที่อนุมัติแล้ว เป้าหมายคือขวดน้อยลง ความครอบคลุมชัดเจน และไม่ซ้ำซ้อนเกินจำเป็น",
    productsEmpty:
      "สูตรพร้อมแล้ว แต่แคตตาล็อกยังไม่มีชุดผลิตภัณฑ์ที่อนุมัติสำหรับความต้องการนี้",
    productsTitle: "จากชั้นวางสู่ความชัดเจน",
    supplementsRecommended: "อาหารเสริมที่แนะนำ",
    productsRecommended: "ผลิตภัณฑ์ที่แนะนำสำหรับคุณ",
    productDoseRecommended: "ขนาดที่แนะนำ",
    productServingUnit: "หน่วยบริโภค",
    productSingleServingUnit: "หน่วยบริโภค",
    productMatchTemplate:
      "ครอบคลุม {covers} และคิดเป็น {percent}% ของชุดที่เลือก",
    productServingMatchTemplate:
      "ใช้ {servings} {servingUnit} ครอบคลุม {covers} และคิดเป็น {percent}% ของชุดที่เลือก",
    selectedProducts: "ผลิตภัณฑ์ที่เลือก",
    selectedSuffix: "รายการที่เลือก",
    tableAmount: "ปริมาณต่อวัน",
    tableCoverage: "ความพอดีของสินค้า",
    tableName: "อาหารเสริม",
    tableReason: "เหตุผลที่อยู่ในแผน",
    viewProduct: "ดูสินค้า",
    cautionsTitle: "ตรวจข้อควรระวังแล้ว",
    closingTitle: "ปัญญาแห่งการรู้ปริมาณที่พอดี",
    closingBody:
      "ไม่ใช่จากการเพิ่มให้มากขึ้น แต่จากการเลือกให้พอดี สูตรนี้คือการนำแนวคิดนั้นมาใช้จริง: ลำดับที่ถูกต้อง ปริมาณที่เหมาะ และผลิตภัณฑ์ที่ข้อมูลแข็งแรงพอ",
    etymologyLine: "บาลี · การรู้ปริมาณที่พอดี",
    print: "พิมพ์หรือบันทึก PDF",
    save: "เปิดแผนนี้",
    reassess: "ประเมินใหม่ภายหลัง",
    wellnessOnly:
      "ข้อมูลเพื่อสุขภาวะเท่านั้น โปรดแบ่งปันแผนนี้กับแพทย์หรือเภสัชกรหากคุณใช้ยา ตั้งครรภ์ ให้นมบุตร มีโรคประจำตัว หรือสถานการณ์เปลี่ยนแปลง"
  }
} satisfies Record<Locale, Record<string, string>>;

const benefitTagLabels: Record<Locale, Record<string, string>> = {
  en: {
    anti_inflammatory: "Anti inflammatory",
    bone_health: "Bone health",
    cognitive_support: "Cognitive support",
    energy_support: "Energy support",
    gut_health: "Gut health",
    heart_health: "Heart health",
    hormone_support: "Hormone support",
    immune_support: "Immune support",
    recovery_support: "Recovery support",
    skin_health: "Skin health",
    sleep_support: "Sleep support",
    stress_support: "Stress support"
  },
  th: {
    anti_inflammatory: "ช่วยลดการอักเสบ",
    bone_health: "บำรุงกระดูก",
    cognitive_support: "สนับสนุนสมองและสมาธิ",
    energy_support: "สนับสนุนพลังงาน",
    gut_health: "ดูแลลำไส้",
    heart_health: "ดูแลหัวใจ",
    hormone_support: "สนับสนุนสมดุลฮอร์โมน",
    immune_support: "สนับสนุนภูมิคุ้มกัน",
    recovery_support: "ช่วยฟื้นตัว",
    skin_health: "ดูแลผิว",
    sleep_support: "สนับสนุนการนอน",
    stress_support: "ช่วยรับมือความเครียด"
  }
};

const formulaCategoryLabels: Record<Locale, Record<string, string>> = {
  en: {
    "Advanced Gut Health": "Advanced gut health",
    "Fatty Acids": "Fatty acids",
    Herbals: "Herbals",
    Longevity: "Longevity",
    Minerals: "Minerals",
    Vitamins: "Vitamins"
  },
  th: {
    "Advanced Gut Health": "สุขภาพลำไส้ขั้นสูง",
    "Fatty Acids": "กรดไขมัน",
    Herbals: "สมุนไพร",
    Longevity: "การดูแลระยะยาว",
    Minerals: "แร่ธาตุ",
    Vitamins: "วิตามิน"
  }
};

const contextChipLabels: Record<Locale, Record<string, string>> = {
  en: {
    Energy: "Energy",
    Fatigue: "Fatigue",
    Female: "Female",
    Fitness: "Fitness",
    Focus: "Focus",
    Precision: "Precision",
    Sleep: "Sleep",
    Statin: "Statin",
    Thailand: "Thailand"
  },
  th: {
    Energy: "พลังงาน",
    Fatigue: "อ่อนเพลีย",
    Female: "หญิง",
    Fitness: "ฟิตเนส",
    Focus: "สมาธิ",
    Precision: "ความแม่นยำ",
    Sleep: "การนอน",
    Statin: "สแตติน",
    Thailand: "ประเทศไทย"
  }
};

const marketplaceLabels: Record<Locale, Record<string, string>> = {
  en: {
    "Imported product": "Imported product",
    "Lazada Thailand": "Lazada Thailand",
    "Shopee Thailand": "Shopee Thailand"
  },
  th: {
    "Imported product": "สินค้าในแคตตาล็อก",
    "Lazada Thailand": "ลาซาด้า ประเทศไทย",
    "Shopee Thailand": "ช้อปปี้ ประเทศไทย"
  }
};

const revealJoiners = {
  en: ", ",
  th: " และ "
} satisfies Record<Locale, string>;

function localizedBenefitTagLabel(value: string, locale: Locale) {
  return benefitTagLabels[locale][value] ?? benefitTagLabels.en[value] ?? foodTagLabel(value);
}

function localizedCategoryLabel(value: string, locale: Locale) {
  return formulaCategoryLabels[locale][value] ?? formulaCategoryLabels.en[value] ?? value;
}

function localizedContextChip(value: string, locale: Locale) {
  return value
    .split(" / ")
    .map((part) => contextChipLabels[locale][part] ?? contextChipLabels.en[part] ?? part)
    .join(" / ");
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function localizedCoverLabel(
  value: string,
  locale: Locale,
  supplementLabelById: ReadonlyMap<string, string>
) {
  const fallback = foodTagLabel(value.replaceAll("-", "_"));

  return (
    supplementLabelById.get(value) ??
    supplementLabelById.get(value.replace(/^supplement:/, "")) ??
    formulaCategoryLabels[locale][value] ??
    formulaCategoryLabels.en[value] ??
    fallback
  );
}

function localizedMarketplaceName(
  value: RecommendedProduct["marketplace"],
  locale: Locale
) {
  return marketplaceLabels[locale][value] ?? marketplaceLabels.en[value] ?? value;
}

function localizedProductDescription({
  copy,
  locale,
  product,
  supplementLabelById
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  product: RecommendedProduct;
  supplementLabelById: ReadonlyMap<string, string>;
}>) {
  const percent = product.stackContributionPercent ?? product.productCoveragePercent ?? 0;
  const covers = product.covers
    .map((cover) => localizedCoverLabel(cover, locale, supplementLabelById))
    .join(revealJoiners[locale]);

  if (product.servingMultiplier && product.servingMultiplier > 1) {
    return formatTemplate(copy.productServingMatchTemplate, {
      covers,
      percent,
      servings: product.servingMultiplier,
      servingUnit:
        product.servingMultiplier === 1
          ? copy.productSingleServingUnit
          : copy.productServingUnit
    });
  }

  return formatTemplate(copy.productMatchTemplate, { covers, percent });
}

function visibleFormulaIngredients(ingredients: FormulationIngredient[]) {
  return ingredients.filter((ingredient) => ingredient.safety?.visibility !== "hidden");
}

function groupedFormulaIngredients(ingredients: FormulationIngredient[]) {
  const groups = new Map<string, FormulationIngredient[]>();

  for (const ingredient of ingredients) {
    const key = ingredient.category || "Core";
    groups.set(key, [...(groups.get(key) ?? []), ingredient]);
  }

  return [...groups.entries()];
}

function revealContextChips(result: FormulationResult) {
  return [
    { kind: "profile", value: result.assessmentSummary.profile },
    { kind: "profile", value: result.assessmentSummary.region },
    { kind: "profile", value: result.assessmentSummary.plan },
    ...result.assessmentSummary.goals.map((value) => ({ kind: "goal", value })),
    ...result.assessmentSummary.constraints.map((value) => ({
      kind: "constraint",
      value
    }))
  ].filter((chip) => chip.value);
}

function productCoveredNeedCount(products: RecommendedProduct[]) {
  return new Set(products.flatMap((product) => product.covers)).size;
}

function recommendedProductCount(products: RecommendedProduct[]) {
  return new Set(products.map((product) => product.productId || product.id)).size;
}

function RevealDistillationCard({
  fromCount,
  fromLabel,
  toCount,
  toLabel
}: Readonly<{
  fromCount: number;
  fromLabel: string;
  toCount: number;
  toLabel: string;
}>) {
  return (
    <div className="rounded-[var(--mn-radius-xl)] border border-[var(--mn-line)] bg-[var(--mn-paper)] px-6 py-8 shadow-[var(--mn-shadow-soft)]">
      <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-14">
        <div>
          <div className="font-serif text-7xl font-light leading-none text-[var(--mn-ash-soft)] sm:text-8xl">
            {fromCount}
          </div>
          <p className="mn-mono-label mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-ash)]">
            {fromLabel}
          </p>
        </div>
        <div className="font-serif text-5xl italic text-[var(--mn-gold)]">
          →
        </div>
        <div>
          <div className="font-serif text-7xl font-light leading-none text-[var(--mn-teal-deep)] sm:text-8xl">
            {toCount}
          </div>
          <p className="mn-mono-label mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-ink-soft)]">
            {toLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function selectedStackCoverage(
  productRecommendations: FormulationResult["productRecommendations"] | undefined,
  products: RecommendedProduct[]
) {
  return Math.max(
    0,
    Math.round(
      productRecommendations?.stackCoveragePercent ??
        Math.max(0, ...products.map((product) => product.stackCoveragePercent ?? 0))
    )
  );
}

function RevealResultsPage({
  activeProductRecommendations,
  formattedDate,
  ingredients,
  isPreview,
  labels,
  locale,
  onProductStackPreferenceChange,
  planId,
  productCoverageBySupplementId,
  productRecommendationOptions,
  products,
  result,
  selectedProductStackPreference,
  unlockHref
}: Readonly<{
  activeProductRecommendations?: FormulationResult["productRecommendations"];
  formattedDate: string;
  ingredients: FormulationIngredient[];
  isPreview: boolean;
  labels: PanelLabels;
  locale: Locale;
  onProductStackPreferenceChange: (preference: ProductStackPreference) => void;
  planId: string;
  productCoverageBySupplementId: ReadonlyMap<string, number>;
  productRecommendationOptions: ProductRecommendationOption[];
  products: RecommendedProduct[];
  result: FormulationResult;
  selectedProductStackPreference?: ProductStackPreference | null;
  unlockHref: string;
}>) {
  const copy = revealCopy[locale];
  const visibleIngredients = visibleFormulaIngredients(ingredients);
  const recommendedSupplementCount = visibleIngredients.length;
  const supplementLabelById = new Map(
    visibleIngredients.map((ingredient) => [
      ingredient.id,
      getLocalizedText(ingredient.supplement, locale)
    ])
  );
  const catalogueSupplementCount = Math.max(
    recommendedSupplementCount,
    Number(result.catalogueSupplementCount ?? result.totalSupplementCount ?? 0),
    recommendedSupplementCount
  );
  const selectedProductCount = recommendedProductCount(products);
  const catalogueProductCount = Math.max(
    selectedProductCount,
    Number(result.catalogueProductCount ?? 0)
  );
  const selectedCoverage = selectedStackCoverage(activeProductRecommendations, products);
  const productNeedCount = productCoveredNeedCount(products);
  const productOptions = productStackPreferenceOrder.flatMap((preference) => {
    const option = productRecommendationOptions.find((item) => item.id === preference);

    return option ? [option] : [];
  });

  return (
    <section className="w-full">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col items-center justify-center px-6 py-20 text-center sm:px-8">
        <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.24em] text-[var(--mn-teal-deep)]">
          {copy.heroEyebrow}
        </p>
        <p className="mt-8 font-serif text-2xl italic leading-8 text-[var(--mn-ink-soft)]">
          {localizedContextChip(result.assessmentSummary.profile, locale)}
        </p>
        <h1 className="mt-3 max-w-4xl font-serif text-6xl font-medium leading-none tracking-normal text-[var(--mn-teal-deep)] text-balance sm:text-7xl lg:text-8xl">
          {copy.heroTitle}
        </h1>
        <p className="mt-8 max-w-3xl font-serif text-3xl font-medium leading-tight text-[var(--mn-ink)] text-balance sm:text-4xl">
          {copy.heroHeadline}
        </p>
        <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--mn-ink-soft)]">
          {copy.heroSub}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 rounded-full bg-[var(--mn-paper)] px-5 py-3 text-xs text-[var(--mn-ash)] ring-1 ring-[var(--mn-line)]">
          <span>{copy.heroMetaPlan}: {planId}</span>
          <span aria-hidden={true} className="h-3 w-px bg-[var(--mn-line)]" />
          <span>{copy.heroMetaGenerated}: {formattedDate}</span>
        </div>
      </section>

      <section className="border-y border-[var(--mn-line)] py-16">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              01 · {copy.personalizationEyebrow}
            </p>
            <h2 className="mt-4 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance">
              {copy.personalizationTitle}
            </h2>
          </div>
          <p className="text-base leading-8 text-[var(--mn-ink-soft)]">
            {copy.personalizationBody}
          </p>
          <div className="lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              {revealContextChips(result).map((chip) => (
                <span
                  className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${
                    chip.kind === "goal"
                      ? "bg-white text-[var(--mn-teal-deep)] ring-[var(--mn-teal)]"
                      : chip.kind === "constraint"
                        ? "bg-[var(--mn-gold-tint)] text-[#6d5427] ring-transparent"
                        : "bg-[var(--mn-mint)] text-[var(--mn-ink)] ring-transparent"
                  }`}
                  key={`${chip.kind}:${chip.value}`}
                >
                  {localizedContextChip(chip.value, locale)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 text-center">
        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
            02 · {copy.distilledEyebrow}
          </p>
          <h2 className="mx-auto mt-6 max-w-3xl font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance">
            {copy.distilledTitle}
          </h2>
          <div className="mt-12 grid gap-5">
            <RevealDistillationCard
              fromCount={catalogueSupplementCount}
              fromLabel={copy.catalogueSupplements}
              toCount={recommendedSupplementCount}
              toLabel={copy.supplementsRecommended}
            />
            <RevealDistillationCard
              fromCount={catalogueProductCount}
              fromLabel={copy.catalogueProducts}
              toCount={selectedProductCount}
              toLabel={copy.productsRecommended}
            />
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-7 text-[var(--mn-ink-soft)]">
            {formatTemplate(copy.distilledSummaryTemplate, {
              productSelected: selectedProductCount,
              productTotal: catalogueProductCount,
              supplementSelected: recommendedSupplementCount,
              supplementTotal: catalogueSupplementCount
            })}
          </p>
        </div>
      </section>

      {isPreview ? (
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
          <PreviewPaywallPanel labels={labels} unlockHref={unlockHref} />
        </div>
      ) : null}

      <RevealFormulaSection
        copy={copy}
        ingredients={visibleIngredients}
        locale={locale}
        productCoverageBySupplementId={productCoverageBySupplementId}
      />

      <RevealProductsSection
        copy={copy}
        locale={locale}
        onProductStackPreferenceChange={onProductStackPreferenceChange}
        planId={planId}
        productNeedCount={productNeedCount}
        productOptions={productOptions}
        products={products}
        selectedCoverage={selectedCoverage}
        selectedProductStackPreference={selectedProductStackPreference}
        supplementLabelById={supplementLabelById}
      />

      <RevealClosingSection
        copy={copy}
        labels={labels}
        locale={locale}
        planId={planId}
        result={result}
      />
    </section>
  );
}

function RevealFormulaSection({
  copy,
  ingredients,
  locale,
  productCoverageBySupplementId
}: Readonly<{
  copy: typeof revealCopy.en;
  ingredients: FormulationIngredient[];
  locale: Locale;
  productCoverageBySupplementId: ReadonlyMap<string, number>;
}>) {
  // Compute stable row numbers declaratively (avoids mutation during render)
  const ingredientRowNumber = new Map<string, number>();
  let n = 0;
  for (const [, group] of groupedFormulaIngredients(ingredients)) {
    for (const ing of group) {
      ingredientRowNumber.set(ing.id, ++n);
    }
  }

  return (
    <section className="border-t border-[var(--mn-line)] py-20" id="formula">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              03 · {copy.formulaEyebrow}
            </p>
            <h2 className="mt-4 font-serif text-5xl font-medium leading-tight text-[var(--mn-ink)] text-balance">
              {copy.formulaTitle}
            </h2>
          </div>
          <p className="text-base leading-8 text-[var(--mn-ink-soft)]">
            {copy.formulaLead}
          </p>
        </div>

        <div className="mt-10 rounded-lg bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] sm:p-8">
          <div className="hidden grid-cols-[3rem_1.2fr_2fr_0.9fr_0.8fr] gap-5 border-b border-[var(--mn-line)] pb-4 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--mn-ash)] lg:grid">
            <div />
            <div>{copy.tableName}</div>
            <div>{copy.tableReason}</div>
            <div>{copy.tableAmount}</div>
            <div className="text-right">{copy.tableCoverage}</div>
          </div>

          {groupedFormulaIngredients(ingredients).map(([category, group]) => (
            <div key={category}>
              <div className="mt-6 flex items-center gap-3 border-b border-dashed border-[var(--mn-line)] pb-3 font-serif text-sm italic text-[var(--mn-gold)]">
                <span className="size-1.5 rounded-full bg-[var(--mn-gold)]" />
                {localizedCategoryLabel(category, locale)}
                <span className="ml-auto font-mono text-[0.65rem] not-italic uppercase tracking-[0.18em] text-[var(--mn-ash)]">
                  {group.length} {copy.selectedSuffix}
                </span>
              </div>
              {group.map((ingredient) => {
                const rowNumber = ingredientRowNumber.get(ingredient.id) ?? 0;
                const supplement = getLocalizedText(ingredient.supplement, locale);
                const rationale = getLocalizedText(ingredient.rationale, locale);
                const dailyDose = getLocalizedText(ingredient.dailyDose, locale);
                const coverage =
                  productCoverageBySupplementId.get(ingredient.id) ?? 0;
                const benefit = supplementBenefitTags(ingredient)[0];

                return (
                  <article
                    className="grid gap-3 border-b border-[var(--mn-line)] py-5 last:border-b-0 lg:grid-cols-[3rem_1.2fr_2fr_0.9fr_0.8fr] lg:gap-5"
                    key={ingredient.id}
                  >
                    <div className="font-serif text-2xl italic text-[var(--mn-gold)]">
                      {String(rowNumber).padStart(2, "0")}
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-medium leading-tight text-[var(--mn-ink)]">
                        {supplement}
                      </h3>
                      <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                        {localizedCategoryLabel(ingredient.category, locale)}
                      </p>
                    </div>
                    <div className="text-sm leading-6 text-[var(--mn-ink-soft)]">
                      {rationale}
                      {benefit ? (
                        <span className="mt-2 block w-max max-w-full rounded-full bg-[var(--mn-mint)] px-3 py-1 text-xs font-semibold text-[var(--mn-teal-deep)]">
                          {localizedBenefitTagLabel(benefit, locale)}
                        </span>
                      ) : null}
                    </div>
                    <div className="font-mono text-sm font-semibold text-[var(--mn-ink)]">
                      {dailyDose}
                    </div>
                    <div className="font-mono text-sm font-semibold text-[var(--mn-teal-deep)] lg:text-right">
                      {coverage}%
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RevealProductsSection({
  copy,
  locale,
  onProductStackPreferenceChange,
  planId,
  productNeedCount,
  productOptions,
  products,
  selectedCoverage,
  selectedProductStackPreference,
  supplementLabelById
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  onProductStackPreferenceChange: (preference: ProductStackPreference) => void;
  planId: string;
  productNeedCount: number;
  productOptions: ProductRecommendationOption[];
  products: RecommendedProduct[];
  selectedCoverage: number;
  selectedProductStackPreference?: ProductStackPreference | null;
  supplementLabelById: ReadonlyMap<string, string>;
}>) {
  const labels = productRecommendationCopy[locale];

  return (
    <section className="border-t border-[var(--mn-line)] bg-[var(--mn-cream-deep)] py-20">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
            04 · {copy.selectedProducts}
          </p>
          <h2
            className={`mt-4 font-serif text-5xl font-medium text-[var(--mn-ink)] text-balance ${
              locale === "th" ? "leading-[1.35]" : "leading-tight"
            }`}
          >
            {copy.productsTitle}
          </h2>
          <p className="mt-4 text-base leading-8 text-[var(--mn-ink-soft)]">
            {copy.productsBody}
          </p>
        </div>

        {productOptions.length > 1 ? (
          <div className="mt-8 flex justify-center">
            <div className="inline-flex flex-wrap justify-center gap-2 rounded-full bg-[var(--mn-paper)] p-1 ring-1 ring-[var(--mn-line)]">
              {productOptions.map((option) => (
                <button
                  aria-pressed={option.id === selectedProductStackPreference}
                  className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] ${
                    option.id === selectedProductStackPreference
                      ? "bg-[var(--mn-teal)] text-white"
                      : "text-[var(--mn-ink-soft)] hover:bg-[var(--mn-mint)]"
                  }`}
                  key={option.id}
                  onClick={() => onProductStackPreferenceChange(option.id)}
                  type="button"
                >
                  {option.id === "compact"
                      ? labels.preferenceCompact
                      : labels.preferenceBalanced}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {products.length < 1 ? (
          <div className="mt-10 rounded-lg bg-[var(--mn-paper)] p-8 text-center ring-1 ring-[var(--mn-line)]">
            <p className="text-sm leading-6 text-[var(--mn-ink-soft)]">
              {copy.productsEmpty}
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {products.map((product, index) => (
              <article
                className="flex flex-col overflow-hidden rounded-xl bg-[var(--mn-paper)] ring-1 ring-[var(--mn-line)] transition hover:-translate-y-1 hover:ring-[var(--mn-teal)]"
                key={`${product.recommendationRunId ?? "product"}:${product.id}`}
              >
                <div className="relative flex h-56 items-center justify-center bg-white">
                  <span className="absolute left-4 top-4 font-serif text-3xl italic text-[var(--mn-gold)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {product.imageUrl ? (
                    <img
                      alt=""
                      className="h-full w-full object-contain p-8"
                      src={product.imageUrl}
                    />
                  ) : (
                    <div className="grid size-32 place-items-center rounded-2xl bg-[var(--mn-mint)] font-serif text-4xl italic text-[var(--mn-teal-deep)]">
                      MN
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="mn-mono-label text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--mn-ash)]">
                    {localizedMarketplaceName(product.marketplace, locale)}
                  </p>
                  <h3
                    className={`mt-2 min-h-12 font-serif text-xl font-medium text-[var(--mn-ink)] ${
                      locale === "th" ? "leading-8" : "leading-tight"
                    }`}
                  >
                    {product.name}
                  </h3>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {product.covers.slice(0, 4).map((cover) => (
                      <span
                        className="rounded-full bg-[var(--mn-mint)] px-2.5 py-1 text-xs font-semibold text-[var(--mn-teal-deep)]"
                        key={cover}
                      >
                        {localizedCoverLabel(cover, locale, supplementLabelById)}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-6 text-[var(--mn-ink-soft)]">
                    {localizedProductDescription({
                      copy,
                      locale,
                      product,
                      supplementLabelById
                    })}
                  </p>
                  <div className="mt-5 rounded-lg bg-[var(--mn-cream)] p-3 text-sm text-[var(--mn-ink-soft)] ring-1 ring-[var(--mn-line)]">
                    <strong className="text-[var(--mn-ink)]">
                      {product.servingMultiplier && product.servingMultiplier > 1
                        ? `${product.servingMultiplier} ${copy.productServingUnit}`
                        : copy.productDoseRecommended}
                    </strong>
                    <br />
                    {product.stackContributionPercent ?? product.productCoveragePercent ?? 0}% {copy.contributionLabel}
                  </div>
                  <a
                    className="mt-4 inline-flex items-center justify-between rounded-full bg-[var(--mn-teal)] px-4 py-3 text-sm font-bold text-white hover:bg-[var(--mn-teal-deep)]"
                    href={product.url}
                    onClick={() => trackMarketplaceClick(planId, product)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {copy.viewProduct}
                    <span aria-hidden={true}>→</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-3 rounded-xl bg-[var(--mn-paper)] p-5 ring-1 ring-[var(--mn-line)] md:grid-cols-3">
          <div>
            <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
              {products.length}
            </p>
            <p className="text-sm text-[var(--mn-ash)]">{copy.selectedProducts}</p>
          </div>
          <div>
            <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
              {productNeedCount}
            </p>
            <p className="text-sm text-[var(--mn-ash)]">{labels.needsCovered}</p>
          </div>
          <div>
            <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
              {selectedCoverage}%
            </p>
            <p className="text-sm text-[var(--mn-ash)]">{copy.compactCoverageLabel}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevealClosingSection({
  copy,
  labels,
  locale,
  planId,
  result
}: Readonly<{
  copy: typeof revealCopy.en;
  labels: PanelLabels;
  locale: Locale;
  planId: string;
  result: FormulationResult;
}>) {
  const cautions = [
    ...(result.cautions ?? []).map((caution) => ({
      body: getLocalizedText(caution.body, locale),
      title: caution.title ? getLocalizedText(caution.title, locale) : ""
    })),
    ...result.supplementBreakdown.flatMap((ingredient) =>
      (ingredient.cautions ?? []).map((caution) => ({
        body: getLocalizedText(caution.body, locale),
        title:
          caution.title
            ? getLocalizedText(caution.title, locale)
            : getLocalizedText(ingredient.supplement, locale)
      }))
    )
  ];

  return (
    <section className="border-t border-[var(--mn-line)] py-20">
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 sm:px-8">
        <div className="rounded-xl bg-[var(--mn-paper)] p-6 ring-1 ring-[var(--mn-line)] sm:p-8">
          <div className="flex gap-4">
            <InformationCircleIcon
              aria-hidden={true}
              className="mt-1 size-6 shrink-0 text-[var(--mn-teal-deep)]"
            />
            <div>
              <h2 className="font-serif text-3xl font-medium text-[var(--mn-ink)]">
                {copy.cautionsTitle}
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                {cautions.length > 0 ? (
                  cautions.map((caution, index) => (
                    <div key={`${caution.title}:${index}`}>
                      {caution.title ? (
                        <p className="font-semibold text-[var(--mn-ink)]">
                          {caution.title}
                        </p>
                      ) : null}
                      <p>{caution.body}</p>
                    </div>
                  ))
                ) : (
                  labels.safetyNotes.map((note) => <p key={note}>{note}</p>)
                )}
                <p>{copy.wellnessOnly}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="font-serif text-5xl font-medium italic text-[var(--mn-teal-deep)]">
            Mattaññutā
          </p>
          <p className="mn-mono-label mt-2 text-xs uppercase tracking-[0.2em] text-[var(--mn-ash)]">
            {copy.etymologyLine}
          </p>
          <h2 className="mx-auto mt-8 max-w-3xl font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] text-balance">
            {copy.closingTitle}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[var(--mn-ink-soft)]">
            {copy.closingBody}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              className="mn-primary-button"
              onClick={() => window.print()}
              type="button"
            >
              {copy.print}
            </button>
            <a className="mn-secondary-button" href={planResultsHref(locale, planId)}>
              {copy.save}
            </a>
            <a className="mn-secondary-button" href={`/${locale}/nutrition/quiz`}>
              {copy.reassess}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewPaywallPanel({
  labels,
  unlockHref
}: Readonly<{
  labels: PanelLabels;
  unlockHref: string;
}>) {
  return (
    <section className="mt-8 overflow-hidden rounded-lg bg-white p-5 ring-1 ring-[color-mix(in_srgb,var(--mn-teal)_20%,transparent)] sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#126b4f]">
            {labels.previewBadge}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--mn-ink)] text-balance">
            {labels.previewTitle}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.previewBody}
          </p>
        </div>
        <a
          className="mn-green-button"
          href={unlockHref}
        >
          {labels.previewCta}
        </a>
      </div>
    </section>
  );
}

export function FinalReportPanel({
  labels,
  locale,
  report
}: Readonly<{
  labels: PanelLabels;
  locale: Locale;
  report: NonNullable<FormulationResult["nutritionReport"]>;
}>) {
  const sections = [
    {
      items: report.dailyFocus ?? [],
      title: labels.finalReportDailyFocus
    },
    {
      items: report.synergies ?? [],
      title: labels.finalReportSynergies
    },
    {
      items: report.nextSteps ?? [],
      title: labels.finalReportNextSteps
    }
  ];

  return (
    <div className="mt-6 rounded-lg border border-[color-mix(in_srgb,var(--mn-gold)_15%,transparent)] bg-[var(--mn-mint)] p-5">
      <h3 className="text-2xl font-semibold tracking-normal text-[var(--mn-ink)] text-balance">
        {getLocalizedText(report.title, locale)}
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {getLocalizedText(report.summary, locale)}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <div
            className="rounded-lg bg-white p-4 ring-1 ring-foreground/10"
            key={section.title}
          >
            <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--mn-ink)]">
              {section.title}
            </h4>
            <div className="mt-3 space-y-3">
              {section.items.map((item) => (
                <div key={item.id}>
                  <p className="text-sm font-semibold text-[var(--mn-ink)]">
                    {getLocalizedText(item.title, locale)}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {getLocalizedText(item.body, locale)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {report.safetyNotes.length > 0 ? (
        <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-foreground/10">
          <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--mn-ink)]">
            {labels.finalReportSafetyNotes}
          </h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {report.safetyNotes.map((note, index) => (
              <li key={index}>{getLocalizedText(note, locale)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const productRecommendationCopy = {
  en: {
    completeEmptyBody:
      "Product matching has finished, but the current catalogue does not contain parsed, safe, available products that match this plan yet.",
    completeEmptyTitle: "Product matching complete",
    emptyBody:
      "We are matching your final plan against available Thailand catalogue products. Your nutrition plan is ready; product matches update separately.",
    emptyTitle: "Product matching in progress",
    failedBody:
      "Your nutrition plan is ready, but product matching needs attention before we can show product options.",
    failedTitle: "Product matching needs review",
    matched: "Matched",
    needsCovered: "Needs covered by products",
    needsReviewed: "client needs reviewed",
    needs: "Accounts for",
    ofYourNeeds: "of selected stack",
    preferenceCompact: "Compact",
    preferenceCompactHint: "Up to 3 products",
    preferenceBalanced: "Balanced",
    preferenceBalancedHint: "Up to 6 products, balancing coverage, simplicity, dose and cost",
    preferenceUpdating: "Switching product stack...",
    recommendedDose: "Recommended dose",
    servingInstruction: "Take {count} daily servings of this product.",
    stack: "Stack coverage",
    title: "Recommended products",
    unmatchedTitle: "Unmet supplement needs",
    view: "View product"
  },
  th: {
    completeEmptyBody:
      "การจับคู่สินค้าเสร็จแล้ว แต่แคตตาล็อกปัจจุบันยังไม่มีสินค้าที่อ่านฉลากแล้ว ปลอดภัย พร้อมจำหน่าย และตรงกับแผนนี้",
    completeEmptyTitle: "จับคู่สินค้าเสร็จแล้ว",
    emptyBody:
      "เรากำลังจับคู่แผนสุดท้ายของคุณกับสินค้าที่มีในตลาดไทย แผนโภชนาการของคุณพร้อมแล้ว ส่วนสินค้าแนะนำจะอัปเดตแยกต่างหาก",
    emptyTitle: "กำลังจับคู่สินค้า",
    failedBody:
      "แผนโภชนาการของคุณพร้อมแล้ว แต่การจับคู่สินค้าต้องตรวจสอบก่อนแสดงตัวเลือกสินค้า",
    failedTitle: "ต้องตรวจสอบการจับคู่สินค้า",
    matched: "จับคู่แล้ว",
    needsCovered: "ความต้องการที่ผลิตภัณฑ์ครอบคลุม",
    needsReviewed: "ความต้องการที่ตรวจแล้ว",
    needs: "คิดเป็น",
    ofYourNeeds: "ของชุดที่เลือก",
    preferenceCompact: "ชุดเล็ก",
    preferenceCompactHint: "สูงสุด 3 รายการ",
    preferenceBalanced: "สมดุล",
    preferenceBalancedHint: "สูงสุด 6 รายการ โดยสมดุลระหว่างความครอบคลุม ความง่าย ปริมาณ และราคา",
    preferenceUpdating: "กำลังเปลี่ยนชุดสินค้า...",
    recommendedDose: "ขนาดที่แนะนำ",
    servingInstruction: "รับประทานผลิตภัณฑ์นี้ {count} หน่วยบริโภคต่อวัน",
    stack: "ความครอบคลุมของชุดสินค้า",
    title: "สินค้าแนะนำ",
    unmatchedTitle: "ความต้องการอาหารเสริมที่ยังไม่ครอบคลุม",
    view: "ดูสินค้า"
  }
} satisfies Record<Locale, Record<string, string>>;

const productStackPreferenceOrder: ProductStackPreference[] = [
  "compact",
  "balanced"
];

function trackMarketplaceClick(
  planId: string,
  product: RecommendedProduct
) {
  const payload = JSON.stringify({
    affiliate: product.affiliate,
    marketplace: product.marketplace,
    planId,
    productCoveragePercent: product.productCoveragePercent,
    productId: product.productId ?? product.id,
    rank: product.rank ?? product.priority,
    recommendationRunId: product.recommendationRunId,
    stackContributionPercent: product.stackContributionPercent,
    stackCoveragePercent: product.stackCoveragePercent
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/products/click",
      new Blob([payload], { type: "application/json" })
    );
    return;
  }

  void fetch("/api/products/click", {
    body: payload,
    headers: {
      "Content-Type": "application/json"
    },
    keepalive: true,
    method: "POST"
  });
}

export function ProductRecommendationsPanel({
  locale,
  onRefreshRequested,
  onStackPreferenceChange,
  planId,
  productRecommendationOptions = [],
  productRecommendations,
  recommendations,
  selectedStackPreference
}: Readonly<{
  locale: Locale;
  onRefreshRequested?: () => void;
  onStackPreferenceChange?: (preference: ProductStackPreference) => void;
  planId: string;
  productRecommendationOptions?: ProductRecommendationOption[];
  productRecommendations?: FormulationResult["productRecommendations"];
  recommendations: RecommendedProduct[];
  selectedStackPreference?: ProductStackPreference | null;
}>) {
  const labels = productRecommendationCopy[locale];
  const [pendingStackPreference, setPendingStackPreference] =
    useState<ProductStackPreference | null>(null);
  const stackOptionsById = new Map(
    productRecommendationOptions.map((option) => [option.id, option])
  );
  const stackOptions = productStackPreferenceOrder.flatMap((preference) => {
    const option = stackOptionsById.get(preference);

    return option ? [option] : [];
  });
  const controlPreferences =
    productRecommendations || productRecommendationOptions.length > 0
      ? productStackPreferenceOrder
      : stackOptions.map((option) => option.id);
  const preferenceLabels = {
    balanced: labels.preferenceBalanced,
    compact: labels.preferenceCompact
  } satisfies Record<ProductStackPreference, string>;
  const preferenceHints = {
    balanced: labels.preferenceBalancedHint,
    compact: labels.preferenceCompactHint
  } satisfies Record<ProductStackPreference, string>;
  const preferenceControl =
    controlPreferences.length > 1 ? (
      <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white text-xs font-semibold shadow-sm">
        {controlPreferences.map((preference) => {
          const selected = preference === selectedStackPreference;
          const available = stackOptionsById.has(preference);
          const pending = preference === pendingStackPreference;

          return (
            <button
              aria-pressed={selected}
              disabled={pending}
              className={`px-3 py-2 transition ${
                selected
                  ? "bg-[var(--mn-teal)] text-white"
                  : available
                    ? "bg-white text-[var(--mn-ink)] hover:bg-gray-50"
                    : "bg-white text-gray-400 hover:bg-gray-50"
              } disabled:cursor-wait disabled:opacity-70`}
              key={preference}
              onClick={async () => {
                if (available) {
                  onStackPreferenceChange?.(preference);
                  return;
                }

                setPendingStackPreference(preference);

                try {
                  const response = await fetch(
                    `/api/assessment/${encodeURIComponent(planId)}/product-recommendations`,
                    {
                      body: JSON.stringify({ stackPreference: preference }),
                      cache: "no-store",
                      headers: {
                        "Content-Type": "application/json"
                      },
                      method: "POST"
                    }
                  );

                  if (response.ok) {
                    window.setTimeout(() => onRefreshRequested?.(), 1000);
                    window.setTimeout(() => onRefreshRequested?.(), 3000);
                    window.setTimeout(() => onRefreshRequested?.(), 6000);
                  }
                } finally {
                  window.setTimeout(() => {
                    setPendingStackPreference((current) =>
                      current === preference ? null : current
                    );
                  }, 1200);
                }
              }}
              title={
                pending ? labels.preferenceUpdating : preferenceHints[preference]
              }
              type="button"
            >
              {pending ? labels.preferenceUpdating : preferenceLabels[preference]}
            </button>
          );
        })}
      </div>
    ) : null;
  const stackCoverage = Math.max(
    0,
    Math.round(
      productRecommendations?.stackCoveragePercent ??
        Math.max(0, ...recommendations.map((item) => item.stackCoveragePercent ?? 0))
    )
  );
  const emptyTitle =
    productRecommendations?.status === "failed"
      ? labels.failedTitle
      : productRecommendations?.status === "partial" ||
          productRecommendations?.status === "ready"
        ? labels.completeEmptyTitle
        : labels.emptyTitle;
  const emptyBody =
    productRecommendations?.status === "failed"
      ? labels.failedBody
      : productRecommendations?.status === "partial" ||
          productRecommendations?.status === "ready"
        ? labels.completeEmptyBody
        : labels.emptyBody;
  const isTerminal =
    productRecommendations?.status === "partial" ||
    productRecommendations?.status === "ready" ||
    productRecommendations?.status === "failed";

  if (recommendations.length < 1) {
    return (
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-xl font-semibold tracking-normal text-[var(--mn-ink)]">
            {emptyTitle}
          </h3>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {preferenceControl}
            {isTerminal ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                {productRecommendations?.stackCoveragePercent ?? 0}%
              </span>
            ) : null}
          </div>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {emptyBody}
        </p>
        {productRecommendations?.notes ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            {productRecommendations.notes}
          </p>
        ) : null}
        {productRecommendations ? (
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
              <span className="font-semibold text-[var(--mn-ink)]">
                {productRecommendations.matchedCount}
              </span>{" "}
              <span className="text-gray-500">{labels.matched}</span>
            </div>
            <div className="rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
              <span className="font-semibold text-[var(--mn-ink)]">
                {productRecommendations.needsCount}
              </span>{" "}
              <span className="text-gray-500">{labels.needsReviewed}</span>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold tracking-normal text-[var(--mn-ink)]">
          {labels.title}
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {preferenceControl}
          <p className="text-sm font-medium text-gray-500">
            {labels.stack}: <span className="text-[var(--mn-ink)]">{stackCoverage}%</span>
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {recommendations.map((product) => (
          <article
            className="flex flex-col overflow-hidden rounded-lg bg-[#F8FAFC] ring-1 ring-gray-200"
            key={`${product.recommendationRunId ?? "product"}:${product.id}`}
          >
            {product.imageUrl ? (
              <img
                alt=""
                className="h-40 w-full object-cover"
                src={product.imageUrl}
              />
            ) : (
              <div className="flex h-40 items-center justify-center bg-white text-sm font-semibold text-gray-400">
                {product.marketplace}
              </div>
            )}
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-base font-semibold leading-7 text-[var(--mn-ink)]">
                  {product.name}
                </h4>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                  {product.stackContributionPercent ?? product.productCoveragePercent ?? 0}%
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {labels.needs}{" "}
                {product.stackContributionPercent ?? product.productCoveragePercent ?? 0}%{" "}
                {labels.ofYourNeeds} · {product.marketplace}
              </p>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                {product.description}
              </p>
              {product.servingMultiplier && product.servingMultiplier > 1 ? (
                <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 ring-1 ring-amber-100">
                  <span className="font-semibold">
                    {labels.recommendedDose}:{" "}
                  </span>
                  {formatTemplate(labels.servingInstruction, {
                    count: product.servingMultiplier
                  })}
                </div>
              ) : null}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--mn-ink)]">
                  {product.price
                    ? `${product.price.amount} ${product.price.currency}`
                    : ""}
                </p>
                <a
                  className="rounded-md bg-[var(--mn-teal)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--mn-teal-deep)]"
                  href={product.url}
                  onClick={() => trackMarketplaceClick(planId, product)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {labels.view}
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
