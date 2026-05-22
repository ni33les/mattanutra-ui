"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  InformationCircleIcon,
  SparklesIcon
} from "@heroicons/react/20/solid";
import { NutritionProgress } from "@/components/nutrition-progress";
import type {
  FoodGuidanceItem,
  FormulationCaution,
  FormulationIngredient,
  FormulationResult,
  LocalizedText,
  ProductRecommendationOption,
  ProductStackPreference,
  RecommendedProduct
} from "@/lib/formulation-types";
import { foodTagLabel } from "@/lib/food-tags";
import type { Locale } from "@/lib/i18n";
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
      "เลือกแอปแชตที่คุณสะดวก เพื่อรับการดูแลต่อเนื่องที่ปรับตามอาหาร กิจวัตร การเดินทาง การฝึก และชีวิตประจำวัน ส่งแผนของคุณแล้ว advisor จะคุยต่อจากคำแนะนำนี้ได้",
    connectChatButton: "เปิดแชต",
    connectChatEyebrow: "คุยต่อในแชต",
    connectChatPlanId: "แผน",
    connectChatQrAlt: "QR code สำหรับเชื่อมต่อ MattaNutra AI advisor",
    connectChatTitle:
      "เชื่อมต่อกับ AI advisor เฉพาะทางด้านอาหารเสริมเพื่อการดูแลและปรับแผนต่อเนื่อง",
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
      "อาหารและวัตถุดิบที่นำไปใช้กับมื้ออาหาร กิจวัตร และบทสนทนากับ concierge ต่อไปได้",
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
    safetyChannelEmail: "Email",
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
  if (typeof value === "string") {
    return value;
  }

  return value[locale] || value.en || value.th;
}

function searchableLocalizedText(value: LocalizedText) {
  return typeof value === "string" ? value : `${value.en} ${value.th}`;
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

function pendingReviewCount(result: FormulationResult) {
  const summary = result.safetySummary;
  const foodSummary = result.foodSafetySummary;

  return (
    Math.max(0, Number(summary?.reviewCount ?? summary?.hiddenCount ?? 0)) +
    Math.max(
      0,
      Number(foodSummary?.reviewCount ?? foodSummary?.hiddenCount ?? 0)
    )
  );
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
  const [refreshNonce, setRefreshNonce] = useState(0);
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
  }, [effectivePlanId, locale, refreshNonce]);

  useEffect(() => {
    if (!result) {
      setSelectedProductStackPreference(null);
      return;
    }

    const options = productRecommendationOptionsForResult(result);
    const defaultPreference =
      result.productRecommendations?.stackPreference ??
      options.find((option) => option.id === "balanced")?.id ??
      options[0]?.id ??
      null;

    setSelectedProductStackPreference((current) =>
      current && options.some((option) => option.id === current)
        ? current
        : defaultPreference
    );
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
  const orderedFoods = [...(result.foodGuidance ?? [])].sort(
    (first, second) => first.effectivenessRank - second.effectivenessRank
  );
  const formattedDate = new Intl.DateTimeFormat(
    locale === "th" ? "th-TH" : "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(new Date(result.generatedAt));
  const effectiveResultPlanId = result.planId || effectivePlanId;
  const hasPendingSafetyReview = pendingReviewCount(result) > 0;
  const isPreview = result.access === "preview";
  const sectionStatuses = result.sectionStatuses ?? {
    foods: orderedFoods.length > 0 ? "ready" : "pending",
    supplements: orderedIngredients.length > 0 ? "ready" : "pending"
  };
  const nutritionPending =
    (FOOD_GUIDANCE_VISIBLE && sectionStatuses.foods !== "ready") ||
    sectionStatuses.supplements !== "ready";
  const lockedSupplementCount = Math.max(
    0,
    Number(result.lockedSupplementCount ?? 0)
  );
  const lockedFoodCount = Math.max(0, Number(result.lockedFoodCount ?? 0));
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
    <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
      <NutritionProgress
        className="mb-8"
        current="refine"
        locale={locale}
      />

      <div className="mn-formulation-hero-card p-6 sm:p-8 lg:p-10">
        <div
          aria-hidden={true}
          className="mn-formulation-hero-background absolute inset-0 bg-cover opacity-36"
        />
        <div
          aria-hidden={true}
          className="mn-formulation-hero-wash"
        />
        <div
          aria-hidden={true}
          className="mn-formulation-hero-bottom-wash"
        />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-center">
          <div>
            <SparklesIcon
              aria-hidden={true}
              className="size-12 text-[var(--mn-gold)]"
            />
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-normal text-[var(--mn-ink)] text-balance sm:text-5xl">
              {labels.heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              {labels.heroSubtitle}
            </p>
          </div>

          <div className="rounded-lg bg-background/90 p-5 shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--mn-ink)]">
              {labels.context}
            </p>
            <dl className="mt-4 space-y-4 text-sm">
              <ContextItem
                label={labels.plan}
                value={result.assessmentSummary.plan}
              />
              <ContextItem
                label={labels.profile}
                value={result.assessmentSummary.profile}
              />
              <ContextItem
                label={labels.region}
                value={result.assessmentSummary.region}
              />
              <ContextChips
                label={labels.goals}
                values={result.assessmentSummary.goals}
              />
              <ContextChips
                label={labels.constraints}
                values={result.assessmentSummary.constraints}
              />
            </dl>
          </div>
        </div>

        <div className="relative mt-8 border-t border-foreground/10 pt-5 text-xs font-normal leading-5 text-muted-foreground">
          <p>
            {labels.generated}: {formattedDate}
          </p>
          <p className="mt-1">
            {labels.plan}:{" "}
            <a
              className="font-semibold text-[var(--mn-gold)] hover:text-[var(--mn-teal-deep)]"
              href={planResultsHref(locale, effectiveResultPlanId)}
            >
              {effectiveResultPlanId}
            </a>
          </p>
        </div>
      </div>

      {isPreview ? (
        <PreviewPaywallPanel
          labels={labels}
          unlockHref={unlockHref}
        />
      ) : null}

      {result.cautions?.length ? (
        <CautionsPanel
          cautions={result.cautions}
          labels={labels}
          locale={locale}
        />
      ) : null}

      <div className={`mt-8 grid gap-8 ${FOOD_GUIDANCE_VISIBLE ? "lg:grid-cols-2" : ""}`}>
        {FOOD_GUIDANCE_VISIBLE ? (
          <FoodGuidancePanel
            foods={orderedFoods}
            hasPendingSafetyReview={hasPendingSafetyReview}
            isPending={sectionStatuses.foods !== "ready"}
            labels={labels}
            lockedFoodCount={lockedFoodCount}
            locale={locale}
            unlockHref={unlockHref}
          />
        ) : null}

        <FormulaPanel
          hasPendingSafetyReview={hasPendingSafetyReview}
          ingredients={orderedIngredients}
          isPending={sectionStatuses.supplements !== "ready"}
          labels={labels}
          lockedSupplementCount={lockedSupplementCount}
          locale={locale}
          productCoverageBySupplementId={productCoverageBySupplementId}
          unlockHref={unlockHref}
        />
      </div>

      {isPreview ? null : (
        <ProductRecommendationsPanel
          locale={locale}
          onRefreshRequested={() => setRefreshNonce((value) => value + 1)}
          onStackPreferenceChange={setSelectedProductStackPreference}
          planId={effectiveResultPlanId}
          productRecommendationOptions={productRecommendationOptions}
          productRecommendations={activeProductRecommendations}
          recommendations={activeProductRecommendationItems}
          selectedStackPreference={
            selectedProductRecommendationOption?.id ??
            selectedProductStackPreference
          }
        />
      )}

      <div className="mt-8 rounded-lg bg-[var(--mn-ink)] p-6 text-sm leading-6 text-white/75">
        <div className="flex gap-3">
          <InformationCircleIcon
            aria-hidden={true}
            className="mt-0.5 size-5 flex-none text-white"
          />
          <div>
            <p className="font-semibold uppercase tracking-[0.12em] text-white">
              {labels.safety}
            </p>
            <ul className="mt-3 space-y-2">
              {labels.safetyNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

type PanelLabels = (typeof formulationResultsCopy)["en"];

function CautionsPanel({
  cautions,
  labels,
  locale
}: Readonly<{
  cautions: FormulationCaution[];
  labels: PanelLabels;
  locale: Locale;
}>) {
  return (
    <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50/70 p-5 text-sm leading-6 text-amber-950 sm:p-6">
      <div className="flex gap-3">
        <ExclamationTriangleIcon
          aria-hidden={true}
          className="mt-0.5 size-5 flex-none text-amber-600"
        />
        <div>
          <h2 className="font-semibold uppercase tracking-[0.12em]">
            {labels.cautions}
          </h2>
          <ul className="mt-3 space-y-3">
            {cautions.map((caution) => (
              <li key={caution.id}>
                {caution.title ? (
                  <p className="font-semibold">
                    {getLocalizedText(caution.title, locale)}
                  </p>
                ) : null}
                <p>{getLocalizedText(caution.body, locale)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

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

function FoodGuidancePanel({
  foods,
  hasPendingSafetyReview,
  isPending,
  labels,
  lockedFoodCount,
  locale,
  unlockHref
}: Readonly<{
  foods: FoodGuidanceItem[];
  hasPendingSafetyReview: boolean;
  isPending: boolean;
  labels: PanelLabels;
  lockedFoodCount: number;
  locale: Locale;
  unlockHref: string;
}>) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal text-[var(--mn-ink)]">
            {labels.foods}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {labels.foodsHint}
          </p>
        </div>
        <SparklesIcon
          aria-hidden={true}
          className="size-6 flex-none text-[var(--mn-teal)]"
        />
      </div>

      <div className="mt-6 space-y-3">
        {foods.length < 1 && isPending ? (
          <SectionLoadingCards accent="green" />
        ) : foods.length < 1 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 bg-background/60 p-6 text-center">
            <SparklesIcon
              aria-hidden={true}
              className="mx-auto size-7 text-[var(--mn-teal)]"
            />
            <h3 className="mt-4 text-base font-semibold text-[var(--mn-ink)]">
              {hasPendingSafetyReview
                ? labels.foodsEmptyTitle
                : labels.formulaNoVisibleTitle}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {hasPendingSafetyReview
                ? labels.foodsEmptyBody
                : labels.formulaNoVisibleBody}
            </p>
          </div>
        ) : foods.map((item) => {
          const food = getLocalizedText(item.food, locale);
          const underReview = item.safety?.visibility === "hidden";
          const rationale = getLocalizedText(item.rationale, locale);
          const serving = getLocalizedText(item.serving, locale);
          const frequency = getLocalizedText(item.frequency, locale);
          const tags = [...(item.benefitTags ?? []), ...(item.nutrientTags ?? [])];

          if (underReview) {
            return (
              <ReviewPlaceholderCard
                key={item.id}
                message={labels.foodUnderReview}
                title={food}
              />
            );
          }

          return (
            <article
              key={item.id}
              className="rounded-lg border border-foreground/10 bg-white p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h4 className="text-base font-semibold text-[var(--mn-ink)]">
                    {food}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {rationale}
                  </p>
                  {tags.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {labels.benefits}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tags.slice(0, 6).map((tag) => (
                          <span
                            className="rounded-full bg-[var(--mn-mint-deep)] px-2 py-0.5 text-xs font-semibold text-[var(--mn-teal-deep)] ring-1 ring-[var(--mn-teal-glow)]"
                            key={tag}
                          >
                            {foodTagLabel(tag)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 sm:w-44">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {labels.foodServing}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--mn-ink)]">
                    {serving}
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    {frequency}
                  </p>
                </div>
              </div>
            </article>
          );
        })}

        {lockedFoodCount > 0 ? (
          <LockedFormulaPreview
            count={lockedFoodCount}
            labels={labels}
            unlockHref={unlockHref}
          />
        ) : null}
      </div>
    </section>
  );
}

function ContextItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-[var(--mn-ink)]">{value}</dd>
    </div>
  );
}

function ContextChips({
  label,
  values
}: Readonly<{ label: string; values: string[] }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--mn-ink)] ring-1 ring-foreground/10"
          >
            {value}
          </span>
        ))}
      </dd>
    </div>
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
    needsReviewed: "client needs reviewed",
    needs: "Adds",
    ofYourNeeds: "to product coverage",
    preferenceCompact: "Compact",
    preferenceCompactHint: "Fewest products within a small coverage tolerance",
    preferenceBalanced: "Balanced",
    preferenceBalancedHint: "Best overall mix of coverage, simplicity, dose and cost",
    preferenceMaxCoverage: "Max coverage",
    preferenceMaxCoverageHint: "Prioritise every extra point of coverage",
    preferenceUpdating: "Switching product stack...",
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
    needsReviewed: "ความต้องการที่ตรวจแล้ว",
    needs: "เพิ่ม",
    ofYourNeeds: "ให้ความครอบคลุมของสินค้า",
    preferenceCompact: "ชุดเล็ก",
    preferenceCompactHint: "เลือกจำนวนสินค้าน้อยที่สุดเมื่อความครอบคลุมใกล้เคียงกัน",
    preferenceBalanced: "สมดุล",
    preferenceBalancedHint: "สมดุลระหว่างความครอบคลุม ความง่าย ปริมาณ และราคา",
    preferenceMaxCoverage: "ครอบคลุมสูงสุด",
    preferenceMaxCoverageHint: "ให้ความสำคัญกับความครอบคลุมสูงสุด",
    preferenceUpdating: "กำลังเปลี่ยนชุดสินค้า...",
    stack: "ความครอบคลุมของชุดสินค้า",
    title: "สินค้าแนะนำ",
    unmatchedTitle: "ความต้องการอาหารเสริมที่ยังไม่ครอบคลุม",
    view: "ดูสินค้า"
  }
} satisfies Record<Locale, Record<string, string>>;

const productStackPreferenceOrder: ProductStackPreference[] = [
  "compact",
  "balanced",
  "max_coverage"
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
    compact: labels.preferenceCompact,
    max_coverage: labels.preferenceMaxCoverage
  } satisfies Record<ProductStackPreference, string>;
  const preferenceHints = {
    balanced: labels.preferenceBalancedHint,
    compact: labels.preferenceCompactHint,
    max_coverage: labels.preferenceMaxCoverageHint
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
                <h4 className="text-base font-semibold text-[var(--mn-ink)]">
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

function FormulaPanel({
  hasPendingSafetyReview,
  ingredients,
  isPending,
  labels,
  lockedSupplementCount,
  locale,
  productCoverageBySupplementId,
  unlockHref
}: Readonly<{
  hasPendingSafetyReview: boolean;
  ingredients: FormulationIngredient[];
  isPending: boolean;
  labels: PanelLabels;
  lockedSupplementCount: number;
  locale: Locale;
  productCoverageBySupplementId: ReadonlyMap<string, number>;
  unlockHref: string;
}>) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal text-[var(--mn-ink)]">
            {labels.formula}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {labels.formulaHint}
          </p>
        </div>
        <BeakerIcon
          aria-hidden={true}
          className="size-6 flex-none text-[var(--mn-gold)]"
        />
      </div>

      <div className="mt-6 space-y-3">
        {ingredients.length < 1 && isPending ? (
          <SectionLoadingCards accent="blue" />
        ) : ingredients.length < 1 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 bg-background/60 p-6 text-center">
            <BeakerIcon
              aria-hidden={true}
              className="mx-auto size-7 text-[var(--mn-gold)]"
            />
            <h3 className="mt-4 text-base font-semibold text-[var(--mn-ink)]">
              {hasPendingSafetyReview
                ? labels.formulaEmptyTitle
                : labels.formulaNoVisibleTitle}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {hasPendingSafetyReview
                ? labels.formulaEmptyBody
                : labels.formulaNoVisibleBody}
            </p>
          </div>
        ) : ingredients.map((ingredient) => {
          const supplement = getLocalizedText(ingredient.supplement, locale);
          const underReview = ingredient.safety?.visibility === "hidden";
          const rationale = getLocalizedText(ingredient.rationale, locale);
          const dailyDose = getLocalizedText(ingredient.dailyDose, locale);
          const benefitTags = supplementBenefitTags(ingredient);
          const productCoverage =
            productCoverageBySupplementId.get(ingredient.id) ?? 0;

          if (underReview) {
            return (
              <ReviewPlaceholderCard
                key={ingredient.id}
                message={labels.supplementUnderReview}
                title={supplement}
              />
            );
          }

          return (
            <article
              key={ingredient.id}
              className="rounded-lg border border-foreground/10 bg-white p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h4 className="text-base font-semibold text-[var(--mn-ink)]">
                    {supplement}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {rationale}
                  </p>
                  {ingredient.cautions?.length ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                      <p className="font-semibold uppercase tracking-[0.12em]">
                        {labels.cautions}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {ingredient.cautions.map((caution) => (
                          <li key={caution.id}>
                            {caution.title ? (
                              <span className="font-semibold">
                                {getLocalizedText(caution.title, locale)}:{" "}
                              </span>
                            ) : null}
                            {getLocalizedText(caution.body, locale)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-4 max-w-md">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <span>{labels.productCoverage}</span>
                      <span className="text-[var(--mn-ink)]">
                        {productCoverage}%
                      </span>
                    </div>
                    <progress
                      aria-label={labels.productCoverage}
                      className="mn-progress mn-progress--soft mt-2"
                      max={100}
                      value={productCoverage}
                    />
                  </div>
                  {benefitTags.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {labels.benefits}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {benefitTags.map((tag) => (
                          <span
                            className="rounded-full bg-[var(--mn-mint)] px-2 py-0.5 text-xs font-semibold text-[var(--mn-teal-deep)] ring-1 ring-[var(--mn-line)]"
                            key={tag}
                          >
                            {foodTagLabel(tag)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 sm:w-44">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {labels.dailyDose}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--mn-ink)]">
                    {dailyDose}
                  </p>
                </div>
              </div>
            </article>
          );
        })}

        {lockedSupplementCount > 0 ? (
          <LockedFormulaPreview
            count={lockedSupplementCount}
            labels={labels}
            unlockHref={unlockHref}
          />
        ) : null}
      </div>
    </section>
  );
}

function SectionLoadingCards({
  accent
}: Readonly<{
  accent: "blue" | "green";
}>) {
  const rows = Array.from({ length: 3 });
  const tint =
    accent === "green"
      ? "bg-[var(--mn-mint-deep)] ring-[var(--mn-teal-glow)]"
      : "bg-[var(--mn-mint)] ring-[var(--mn-line)]";

  return (
    <>
      {rows.map((_, index) => (
        <article
          className="rounded-lg border border-foreground/10 bg-white p-4"
          key={index}
        >
          <div className="animate-pulse">
            <div className={`h-4 w-32 rounded-md ring-1 ${tint}`} />
            <div className="mt-3 h-3 w-full rounded-md bg-foreground/10" />
            <div className="mt-2 h-3 w-4/5 rounded-md bg-foreground/10" />
            <div className="mt-4 flex gap-2">
              <div className={`h-5 w-20 rounded-full ring-1 ${tint}`} />
              <div className={`h-5 w-24 rounded-full ring-1 ${tint}`} />
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

function ReviewPlaceholderCard({
  message,
  title
}: Readonly<{
  message: string;
  title: string;
}>) {
  return (
    <article className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex gap-3">
        <span className="flex size-9 flex-none items-center justify-center rounded-full bg-white text-amber-600 ring-1 ring-amber-200">
          <HeartIcon aria-hidden={true} className="size-5" />
        </span>
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-[var(--mn-ink)]">
            {title}
          </h4>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            {message}
          </p>
        </div>
      </div>
    </article>
  );
}

function LockedFormulaPreview({
  count,
  labels,
  unlockHref
}: Readonly<{
  count: number;
  labels: PanelLabels;
  unlockHref: string;
}>) {
  const placeholderRows = Array.from({ length: Math.min(count, 3) });

  return (
    <article className="rounded-lg border border-[color-mix(in_srgb,var(--mn-teal)_20%,transparent)] bg-[var(--mn-mint-deep)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[var(--mn-ink)]">
            {labels.previewLockedTitle}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {labels.previewLockedBody}
          </p>
        </div>
        <a
          className="mn-green-button mn-green-button--compact"
          href={unlockHref}
        >
          {labels.previewCta}
        </a>
      </div>

      <div
        aria-hidden={true}
        className="mt-4 space-y-3 opacity-75 blur-[2px]"
      >
        {placeholderRows.map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-white/80 bg-white/80 p-4"
          >
            <div className="h-4 w-40 rounded bg-[color-mix(in_srgb,var(--mn-ink)_20%,transparent)]" />
            <div className="mt-3 h-3 w-full max-w-md rounded bg-[color-mix(in_srgb,var(--mn-ink)_10%,transparent)]" />
            <div className="mt-2 h-3 w-3/4 rounded bg-[color-mix(in_srgb,var(--mn-ink)_10%,transparent)]" />
          </div>
        ))}
      </div>
    </article>
  );
}
