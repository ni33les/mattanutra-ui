"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  ArrowPathIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  InformationCircleIcon,
  SparklesIcon
} from "@heroicons/react/20/solid";
import type {
  FoodGuidanceItem,
  FormulationIngredient,
  FormulationResult,
  LocalizedText
} from "@/lib/formulation-types";
import { ChatChannelCards } from "@/components/chat-channel-cards";
import { foodTagLabel } from "@/lib/food-tags";
import type { Locale } from "@/lib/i18n";

type FormulationResultsProps = Readonly<{
  locale: Locale;
  planId: string;
}>;

type LoadState = "loading" | "ready" | "error";

const formulationHeroBackgroundImage = "/formulation-couple.jpg";

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
  | "constraints"
  | "context"
  | "coveragePrefix"
  | "coverageSuffix"
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

const copy = {
  en: {
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
    coveragePrefix: "Covers",
    coverageSuffix: "of the recommended supplements",
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
    generated: "Generated",
    goals: "Goals",
    heroSubtitle:
      "A concise food and supplement guidance pack based on the completed assessment.",
    heroTitle: "Your personalised nutritional formulation",
    loading: "Loading your formulation",
    nutritionProgressBody:
      "Your plan is being assembled in sections. Food and supplement guidance will appear here as each engine finishes.",
    nutritionProgressFoods: "Food guidance",
    nutritionProgressPending: "Preparing",
    nutritionProgressReady: "Ready",
    nutritionProgressSupplements: "Supplement guidance",
    nutritionProgressTitle: "Preparing your nutrition plan",
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
    safety: "Safety notes",
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
    coveragePrefix: "ครอบคลุม",
    coverageSuffix: "ของรายการอาหารเสริมที่แนะนำ",
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
    generated: "สร้างเมื่อ",
    goals: "เป้าหมาย",
    heroSubtitle:
      "บรีฟคำแนะนำอาหารและอาหารเสริมจากคำตอบในแบบประเมินของคุณ",
    heroTitle: "สูตรโภชนาการเฉพาะบุคคลของคุณ",
    loading: "กำลังโหลดสูตรของคุณ",
    nutritionProgressBody:
      "ระบบกำลังประกอบแผนเป็นส่วน ๆ คำแนะนำอาหารและอาหารเสริมจะแสดงในหน้านี้เมื่อแต่ละส่วนเสร็จ",
    nutritionProgressFoods: "คำแนะนำอาหาร",
    nutritionProgressPending: "กำลังเตรียม",
    nutritionProgressReady: "พร้อมแล้ว",
    nutritionProgressSupplements: "คำแนะนำอาหารเสริม",
    nutritionProgressTitle: "กำลังเตรียมแผนโภชนาการของคุณ",
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
    safety: "หมายเหตุด้านความปลอดภัย",
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
  return `/${locale}/assessment/results?plan=${encodeURIComponent(planId)}`;
}

function planPaywallHref(locale: Locale, planId: string) {
  return `/${locale}/assessment?plan=${encodeURIComponent(planId)}`;
}

function resultHasPendingSections(result: FormulationResult) {
  const statuses = result.sectionStatuses;

  return Boolean(
    statuses &&
      (statuses.foods === "pending" || statuses.supplements === "pending")
  );
}

export function FormulationResults({ locale, planId }: FormulationResultsProps) {
  const labels = copy[locale];
  const effectivePlanId = planId;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [result, setResult] = useState<FormulationResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

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

          if (resultHasPendingSections(payload)) {
            retryTimer = window.setTimeout(fetchFormulation, 1500);
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

  if (loadState === "loading") {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8">
        <div className="rounded-lg bg-white px-6 py-12 text-center ring-1 ring-foreground/10">
          <ArrowPathIcon
            aria-hidden={true}
            className="mx-auto size-8 animate-spin text-[#3A7BD5]"
          />
          <h1 className="mt-6 text-3xl font-semibold tracking-normal text-[#20343A]">
            {labels.loading}
          </h1>
        </div>
      </section>
    );
  }

  if (loadState === "error" || !result) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8">
        <div className="rounded-lg bg-white px-6 py-12 text-center ring-1 ring-foreground/10">
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
    sectionStatuses.foods !== "ready" ||
    sectionStatuses.supplements !== "ready";
  const lockedSupplementCount = Math.max(
    0,
    Number(result.lockedSupplementCount ?? 0)
  );
  const lockedFoodCount = Math.max(0, Number(result.lockedFoodCount ?? 0));
  const unlockHref = planPaywallHref(locale, effectiveResultPlanId);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
      <div className="relative overflow-hidden rounded-lg bg-[#F3F8FF] p-6 ring-1 ring-[#3A7BD5]/10 sm:p-8 lg:p-10">
        <div
          aria-hidden={true}
          className="absolute inset-0 bg-cover opacity-36"
          style={{
            backgroundImage: `url("${formulationHeroBackgroundImage}")`,
            backgroundPosition: "left 52%"
          }}
        />
        <div
          aria-hidden={true}
          className="absolute inset-0 bg-gradient-to-r from-[#F3F8FF]/92 via-[#F3F8FF]/76 to-[#F3F8FF]/50"
        />
        <div
          aria-hidden={true}
          className="absolute inset-0 bg-gradient-to-b from-[#F3F8FF]/20 via-transparent to-[#F3F8FF]/72"
        />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-center">
          <div>
            <SparklesIcon
              aria-hidden={true}
              className="size-12 text-[#3A7BD5]"
            />
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-5xl">
              {labels.heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              {labels.heroSubtitle}
            </p>
          </div>

          <div className="rounded-lg bg-background/90 p-5 shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#20343A]">
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
              className="font-semibold text-[#3A7BD5] hover:text-[#2F67B8]"
              href={planResultsHref(locale, effectiveResultPlanId)}
            >
              {effectiveResultPlanId}
            </a>
          </p>
        </div>
      </div>

      <SafetyReviewPanel
        labels={labels}
        planId={effectiveResultPlanId}
        result={result}
      />

      {nutritionPending ? (
        <NutritionProgressPanel
          labels={labels}
          statuses={sectionStatuses}
        />
      ) : null}

      {isPreview ? (
        <PreviewPaywallPanel
          labels={labels}
          unlockHref={unlockHref}
        />
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <FoodGuidancePanel
          foods={orderedFoods}
          hasPendingSafetyReview={hasPendingSafetyReview}
          isPending={sectionStatuses.foods !== "ready"}
          labels={labels}
          lockedFoodCount={lockedFoodCount}
          locale={locale}
          unlockHref={unlockHref}
        />

        <FormulaPanel
          hasPendingSafetyReview={hasPendingSafetyReview}
          ingredients={orderedIngredients}
          isPending={sectionStatuses.supplements !== "ready"}
          labels={labels}
          lockedSupplementCount={lockedSupplementCount}
          locale={locale}
          unlockHref={unlockHref}
        />
      </div>

      {isPreview ? null : (
        <ChatConnectPanel
          labels={labels}
          locale={locale}
          planId={effectiveResultPlanId}
        />
      )}

      <div className="mt-8 rounded-lg bg-[#20343A] p-6 text-sm leading-6 text-white/75">
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

type PanelLabels = (typeof copy)["en"];

function NutritionProgressPanel({
  labels,
  statuses
}: Readonly<{
  labels: PanelLabels;
  statuses: NonNullable<FormulationResult["sectionStatuses"]>;
}>) {
  const sections = [
    {
      label: labels.nutritionProgressFoods,
      status: statuses.foods
    },
    {
      label: labels.nutritionProgressSupplements,
      status: statuses.supplements
    }
  ];
  const readyCount = sections.filter((section) => section.status === "ready").length;
  const progress = Math.max(10, Math.round((readyCount / sections.length) * 100));

  return (
    <section className="mt-8 rounded-lg bg-white p-5 ring-1 ring-[#3A7BD5]/15 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ArrowPathIcon
              aria-hidden={true}
              className="size-5 animate-spin text-[#3A7BD5]"
            />
            <h2 className="text-xl font-semibold tracking-normal text-[#20343A]">
              {labels.nutritionProgressTitle}
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.nutritionProgressBody}
          </p>
        </div>

        <div className="w-full lg:w-72">
          <div className="h-2 rounded-full bg-[#E5EDF8]">
            <div
              className="h-full rounded-full bg-[#3A7BD5] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {sections.map((section) => {
              const ready = section.status === "ready";

              return (
                <span
                  className={
                    ready
                      ? "rounded-full bg-[#ECFDF5] px-2.5 py-1 text-xs font-semibold text-[#126B4F] ring-1 ring-[#A7F3D0]"
                      : "rounded-full bg-[#F3F8FF] px-2.5 py-1 text-xs font-semibold text-[#2F67B8] ring-1 ring-[#BFDBFE]"
                  }
                  key={section.label}
                >
                  {section.label}:{" "}
                  {ready
                    ? labels.nutritionProgressReady
                    : labels.nutritionProgressPending}
                </span>
              );
            })}
          </div>
        </div>
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
          <h2 className="text-2xl font-semibold tracking-normal text-[#20343A]">
            {labels.foods}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {labels.foodsHint}
          </p>
        </div>
        <SparklesIcon
          aria-hidden={true}
          className="size-6 flex-none text-[#1FA77A]"
        />
      </div>

      <div className="mt-6 space-y-3">
        {foods.length < 1 && isPending ? (
          <SectionLoadingCards accent="green" />
        ) : foods.length < 1 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 bg-background/60 p-6 text-center">
            <SparklesIcon
              aria-hidden={true}
              className="mx-auto size-7 text-[#1FA77A]"
            />
            <h3 className="mt-4 text-base font-semibold text-[#20343A]">
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
                  <h4 className="text-base font-semibold text-[#20343A]">
                    {food}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {rationale}
                  </p>
                  {tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tags.slice(0, 6).map((tag) => (
                        <span
                          className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-xs font-semibold text-[#126B4F] ring-1 ring-[#A7F3D0]"
                          key={tag}
                        >
                          {foodTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 sm:w-44">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {labels.foodServing}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#20343A]">
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

function SafetyReviewPanel({
  labels,
  planId,
  result
}: Readonly<{
  labels: PanelLabels;
  planId: string;
  result: FormulationResult;
}>) {
  const [address, setAddress] = useState("");
  const [channelType, setChannelType] = useState("line");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const summary = result.safetySummary;
  const foodSummary = result.foodSafetySummary;
  const pendingReviews = pendingReviewCount(result);
  const adjustedCount =
    Math.max(0, Number(summary?.adjustedCount ?? 0)) +
    Math.max(0, Number(foodSummary?.adjustedCount ?? 0));

  if (!summary && !foodSummary) {
    return null;
  }

  if (adjustedCount < 1 && pendingReviews < 1) {
    return null;
  }

  const showReviewNotice =
    Math.max(0, Number(summary?.reviewCount ?? summary?.hiddenCount ?? 0)) > 0;
  const showFoodReviewNotice =
    Math.max(
      0,
      Number(foodSummary?.reviewCount ?? foodSummary?.hiddenCount ?? 0)
    ) > 0;
  const messages = [
    showReviewNotice ? labels.safetyReviewBody : null,
    showFoodReviewNotice ? labels.foodSafetyReviewBody : null,
    adjustedCount > 0 ? labels.doseAdjustedBody : null
  ].filter((message): message is string => Boolean(message));
  const addressPlaceholder =
    channelType === "email"
      ? labels.safetyCaptureEmailPlaceholder
      : labels.safetyCaptureChatPlaceholder;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");

    try {
      const response = await fetch(
        `/api/assessment/${encodeURIComponent(planId)}/communication-channel`,
        {
          body: JSON.stringify({
            address,
            channelType
          }),
          cache: "no-store",
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error("Unable to save contact");
      }

      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="mt-8 rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.78fr)]">
        <div className="flex gap-3">
          <ExclamationTriangleIcon
            aria-hidden={true}
            className="mt-0.5 size-5 flex-none text-amber-500"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#20343A]">
              {labels.safetyReviewTitle}
            </p>
            <div className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          </div>
        </div>

        {showReviewNotice ? (
          <form
            className="rounded-lg bg-[#F3F8FF] p-4 ring-1 ring-[#3A7BD5]/10"
            onSubmit={handleSubmit}
          >
            <p className="text-sm font-semibold text-[#20343A]">
              {labels.safetyCaptureTitle}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {labels.safetyCaptureBody}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-[9rem_1fr] lg:grid-cols-1">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {labels.safetyCaptureChannel}
                </span>
                <select
                  className="mt-2 block w-full rounded-md border border-foreground/10 bg-white px-3 py-2 text-sm font-medium text-[#20343A] outline-none transition focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15"
                  disabled={saveState === "saving"}
                  onChange={(event) => {
                    setChannelType(event.target.value);
                    setSaveState("idle");
                  }}
                  value={channelType}
                >
                  <option value="line">{labels.safetyChannelLine}</option>
                  <option value="whatsapp">{labels.safetyChannelWhatsapp}</option>
                  <option value="telegram">{labels.safetyChannelTelegram}</option>
                  <option value="email">{labels.safetyChannelEmail}</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {labels.safetyCaptureAddress}
                </span>
                <input
                  className="mt-2 block w-full rounded-md border border-foreground/10 bg-white px-3 py-2 text-sm text-[#20343A] outline-none transition placeholder:text-muted-foreground/60 focus:border-[#1FA77A] focus:ring-2 focus:ring-[#1FA77A]/15"
                  disabled={saveState === "saving"}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setSaveState("idle");
                  }}
                  placeholder={addressPlaceholder}
                  type={channelType === "email" ? "email" : "text"}
                  value={address}
                />
              </label>
            </div>

            <button
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-[#3A7BD5] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2f67b4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3A7BD5] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!address.trim() || saveState === "saving"}
              type="submit"
            >
              {labels.safetyCaptureSubmit}
            </button>

            {saveState === "saved" ? (
              <p className="mt-3 text-sm font-medium text-[#126B4F]">
                {labels.safetyCaptureSuccess}
              </p>
            ) : null}
            {saveState === "error" ? (
              <p className="mt-3 text-sm font-medium text-red-700">
                {labels.safetyCaptureError}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ContextItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-[#20343A]">{value}</dd>
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
            className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-[#20343A] ring-1 ring-foreground/10"
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
    <section className="mt-8 overflow-hidden rounded-lg bg-white p-5 ring-1 ring-[#1FA77A]/20 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#126b4f]">
            {labels.previewBadge}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-[#20343A] text-balance">
            {labels.previewTitle}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.previewBody}
          </p>
        </div>
        <a
          className="inline-flex items-center justify-center rounded-md bg-[#1FA77A] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188a65] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]"
          href={unlockHref}
        >
          {labels.previewCta}
        </a>
      </div>
    </section>
  );
}

function ChatConnectPanel({
  labels,
  locale,
  planId
}: Readonly<{ labels: PanelLabels; locale: Locale; planId: string }>) {
  return (
    <section className="mt-8 overflow-hidden rounded-lg bg-white ring-1 ring-foreground/10">
      <div className="p-6 sm:p-8">
        <div className="inline-flex w-fit items-center gap-3 rounded-md bg-[#06C755]/10 px-3 py-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-[#06C755] text-xs font-black tracking-tight text-white">
            AI
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#058B3F]">
            {labels.connectChatEyebrow}
          </span>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <h2 className="max-w-2xl text-2xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-3xl">
              {labels.connectChatTitle}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {labels.connectChatBody}
            </p>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2 text-xs lg:justify-end">
            <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {labels.connectChatPlanId}
            </span>
            <a
              className="max-w-full truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-[11px] font-medium text-[#3A7BD5] ring-1 ring-foreground/10 hover:text-[#2F67B8]"
              href={planResultsHref(locale, planId)}
            >
              {planId}
            </a>
          </div>
        </div>

        <ChatChannelCards
          buttonLabel={labels.connectChatButton}
          className="mt-7"
          planId={planId}
          qrAlt={labels.connectChatQrAlt}
        />
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
  unlockHref
}: Readonly<{
  hasPendingSafetyReview: boolean;
  ingredients: FormulationIngredient[];
  isPending: boolean;
  labels: PanelLabels;
  lockedSupplementCount: number;
  locale: Locale;
  unlockHref: string;
}>) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal text-[#20343A]">
            {labels.formula}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {labels.formulaHint}
          </p>
        </div>
        <BeakerIcon
          aria-hidden={true}
          className="size-6 flex-none text-[#3A7BD5]"
        />
      </div>

      <div className="mt-6 space-y-3">
        {ingredients.length < 1 && isPending ? (
          <SectionLoadingCards accent="blue" />
        ) : ingredients.length < 1 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 bg-background/60 p-6 text-center">
            <BeakerIcon
              aria-hidden={true}
              className="mx-auto size-7 text-[#3A7BD5]"
            />
            <h3 className="mt-4 text-base font-semibold text-[#20343A]">
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
                  <h4 className="text-base font-semibold text-[#20343A]">
                    {supplement}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {rationale}
                  </p>
                  {benefitTags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {benefitTags.map((tag) => (
                        <span
                          className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-xs font-semibold text-[#2F67B8] ring-1 ring-[#BFDBFE]"
                          key={tag}
                        >
                          {foodTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 sm:w-44">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {labels.dailyDose}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#20343A]">
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
      ? "bg-[#ECFDF5] ring-[#A7F3D0]"
      : "bg-[#EFF6FF] ring-[#BFDBFE]";

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
          <h4 className="text-base font-semibold text-[#20343A]">
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
    <article className="rounded-lg border border-[#1FA77A]/20 bg-[#F3FBF7] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[#20343A]">
            {labels.previewLockedTitle}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {labels.previewLockedBody}
          </p>
        </div>
        <a
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#1FA77A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188a65] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1FA77A]"
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
            <div className="h-4 w-40 rounded bg-[#20343A]/20" />
            <div className="mt-3 h-3 w-full max-w-md rounded bg-[#20343A]/10" />
            <div className="mt-2 h-3 w-3/4 rounded bg-[#20343A]/10" />
          </div>
        ))}
      </div>
    </article>
  );
}
