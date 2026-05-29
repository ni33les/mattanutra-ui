"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ExclamationTriangleIcon,
  InformationCircleIcon
} from "@heroicons/react/20/solid";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { LandingReveal } from "@/components/landing-reveal";
import { NutritionProgress } from "@/components/nutrition-progress";
import type {
  FoodGapSupportItem,
  FormulationIngredient,
  FormulationResult,
  LocalizedText,
  ProductNeedCoverage,
  ProductRecommendationOption,
  ProductStackPreference,
  RecommendedProduct
} from "@/lib/formulation-types";
import type { RevealPageCopySlot } from "@/lib/formulation-types";
import { revealPageCopyVersion } from "@/lib/formulation-types";
import { foodTagLabel } from "@/lib/food-tags";
import {
  localeHtmlLang,
  localizedTextSearchValue,
  resolveLocalizedText,
  type Locale
} from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionRevealPath
} from "@/lib/nutrition-paths";
import { managedFoodSeeds } from "@/lib/managed-foods";

type BaseLocale = Exclude<Locale, "zh-CN">;

type FormulationResultsProps = Readonly<{
  initialResult?: FormulationResult | null;
  initialStackPreference?: ProductStackPreference | null;
  locale: Locale;
  planId: string;
}>;

type LoadState = "loading" | "ready" | "error";

const MAX_PRODUCT_MATCHING_POLLS = 80;
const PENDING_SECTION_POLL_INTERVAL_MS = 1_000;
const PENDING_PRODUCT_MATCHING_POLL_INTERVAL_MS = 750;

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

const baseFormulationResultsCopy = {
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
      "Review the formula, product matches, and safety notes selected from your assessment.",
    heroTitle: "Your nutrition reveal is ready",
    loading: "Loading your formulation",
    nutritionProgressBody:
      "We’re preparing your supplement guidance. Your reveal page will appear here as soon as everything is ready.",
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
      "ตรวจสูตร ผลิตภัณฑ์ที่จับคู่ และหมายเหตุด้านความปลอดภัยจากแบบประเมินของคุณ",
    heroTitle: "ผลลัพธ์โภชนาการของคุณพร้อมแล้ว",
    loading: "กำลังโหลดสูตรของคุณ",
    nutritionProgressBody:
      "เรากำลังเตรียมคำแนะนำอาหารเสริม หน้าแสดงผลลัพธ์จะแสดงที่นี่เมื่อทุกอย่างพร้อม",
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
} satisfies Record<BaseLocale, CopyLabels>;

export const formulationResultsCopy = {
  ...baseFormulationResultsCopy,
  "zh-CN": {
    "benefits": "益处",
    "connectChatBody": "选择您偏好的聊天应用，获取针对饮食、作息、旅行、训练和日常生活的定制支持。发送您的计划，顾问可从此推荐继续跟进。",
    "connectChatButton": "打开聊天",
    "connectChatEyebrow": "继续在聊天中",
    "connectChatPlanId": "计划",
    "connectChatQrAlt": "连接 MattaNutra AI 顾问的二维码",
    "connectChatTitle": "连接我们的专业 AI 补充剂顾问，获得持续支持与优化建议。",
    "constraints": "限制",
    "context": "评估摘要",
    "cautions": "注意事项",
    "coveragePrefix": "覆盖",
    "coverageSuffix": "的推荐补充剂",
    "productCoverage": "产品覆盖",
    "doseAdjustedBody": "为保持在 MattaNutra 设定的安全上限内，一种或多种剂量已自动降低。",
    "error": "配方无法加载。请刷新页面后重试。",
    "formula": "补充剂明细",
    "formulaEmptyBody": "每项补充剂建议都需要安全审核后才能显示。审核队列已收到通知。",
    "formulaEmptyTitle": "安全审核进行中",
    "formulaHint": "为您建议的补充剂组合，按作用分组，并提供实用的每日剂量指导。",
    "formulaNoVisibleBody": "已审核的项目不再处于待处理状态。仅显示通过 MattaNutra 审核的补充剂。",
    "formulaNoVisibleTitle": "暂无可见的补充剂建议",
    "foods": "食物指导",
    "foodsEmptyBody": "每项食物建议都需要安全审核后才能显示。审核队列已收到通知。",
    "foodsEmptyTitle": "食物审核进行中",
    "foodsHint": "实用的食物与食材建议，可融入餐食、日常作息及未来的管家式对话中。",
    "foodServing": "份量",
    "finalizeError": "无法交付营养计划。请重试。",
    "finalizePlan": "交付营养计划",
    "finalizeReady": "营养计划已交付",
    "finalizeWaiting": "补充剂指导必须完成后才能交付。",
    "finalizingPlan": "正在交付计划",
    "finalReportDailyFocus": "每日重点",
    "finalReportNextSteps": "后续步骤",
    "finalReportSafetyNotes": "安全提示",
    "finalReportSynergies": "补充剂搭配",
    "generated": "生成时间",
    "goals": "目标",
    "heroSubtitle": "查看根据您的评估选出的配方、产品匹配及安全提示。",
    "heroTitle": "您的营养展示已就绪",
    "loading": "正在加载您的配方",
    "nutritionProgressBody": "我们正在准备您的补充剂指导。一旦全部就绪，展示页面将立即显示。",
    "nutritionProgressFoods": "食物指导",
    "nutritionProgressPending": "准备中",
    "nutritionProgressReady": "就绪",
    "nutritionProgressSupplements": "补充剂指导",
    "nutritionProgressTitle": "正在准备您的指导",
    "dailyDose": "剂量",
    "plan": "计划",
    "previewBadge": "免费预览",
    "previewBody": "您的完整配方已就绪。免费预览显示前三项补充剂推荐；解锁计划后可查看剩余详情并继续。",
    "previewCta": "解锁完整计划",
    "previewLockedBody": "其余个性化推荐已就绪，解锁后即可查看。",
    "previewLockedTitle": "更多推荐已锁定",
    "previewTitle": "先预览，准备好后再解锁",
    "profile": "个人资料",
    "region": "地区",
    "safety": "注意事项",
    "safetyCaptureAddress": "联系方式",
    "safetyCaptureBody": "留下一个联系渠道，我们会在人工审核完成后通知您。",
    "safetyCaptureChannel": "偏好渠道",
    "safetyCaptureChatPlaceholder": "您的账号或号码",
    "safetyCaptureEmailPlaceholder": "you@example.com",
    "safetyCaptureError": "无法保存该联系方式。请重试。",
    "safetyCaptureSubmit": "保存联系方式",
    "safetyCaptureSuccess": "联系方式已保存。我们将通过此渠道发送审核更新。",
    "safetyCaptureTitle": "需要我们稍后联系您吗？",
    "safetyChannelEmail": "电子邮件",
    "safetyChannelLine": "LINE",
    "safetyChannelTelegram": "Telegram",
    "safetyChannelWhatsapp": "WhatsApp",
    "safetyReviewBody": "部分补充剂建议需要人工安全检查。在团队批准前，我们会以审核占位符显示。",
    "safetyReviewTitle": "安全审核已激活",
    "foodSafetyReviewBody": "部分食物建议需要人工安全检查。在团队批准前，我们会以审核占位符显示。",
    "foodSafetyReviewTitle": "食物安全审核已激活",
    "foodUnderReview": "此食物正在由我们的团队审核。",
    "supplementUnderReview": "此补充剂正在由我们的团队审核。",
    "safetyNotes": [
      "这些是可选的健康产品建议，并非医疗建议。",
      "购买前请查看所有标签，了解过敏原、成分及每日使用说明。",
      "如果您处于孕期、哺乳期、正在服药或有健康状况，请咨询合格的临床医生或药师审核该计划。"
    ]
  }
} satisfies Record<Locale, CopyLabels>;

function textMatchesLocale(text: string, locale: Locale) {
  if (!text.trim()) {
    return false;
  }

  if (locale === "th") {
    return thaiScriptPattern.test(text) || !latinWordPattern.test(text);
  }

  if (locale === "zh-CN") {
    return chineseScriptPattern.test(text) || !latinWordPattern.test(text);
  }

  return true;
}

function getLocalizedText(value: LocalizedText, locale: Locale) {
  const text = resolveLocalizedText(value, locale).trim();

  return textMatchesLocale(text, locale) ? text : "";
}

const supplementNameFallbacks: Record<string, Record<Locale, string>> = {
  citicoline: { en: "Citicoline (CDP-choline)", th: "ซิติโคลีน (ซีดีพี-โคลีน)", "zh-CN": "胞磷胆碱（CDP-胆碱）" },
  coq10: { en: "CoQ10", th: "โคคิวเท็น", "zh-CN": "辅酶 Q10" },
	  magnesium: { en: "Magnesium", th: "แมกนีเซียม", "zh-CN": "镁" },
	  omega_3: { en: "Omega-3", th: "โอเมกา 3", "zh-CN": "Omega-3 脂肪酸" },
	  probiotic: { en: "Multi-strain probiotics", th: "โปรไบโอติกหลายสายพันธุ์", "zh-CN": "多菌株益生菌" },
	  curcumin: { en: "Curcumin", th: "เคอร์คูมิน", "zh-CN": "姜黄素" },
	  theanine: { en: "Theanine", th: "แอล-ธีอะนีน", "zh-CN": "茶氨酸" },
  vitamin_d3: { en: "Vitamin D3", th: "วิตามินดี 3", "zh-CN": "维生素 D3" }
};

function supplementFallbackKey(id: string, name: string) {
  const search = normalizeFoodText(`${id} ${name}`);

  if (/citicoline|cdp choline/.test(search)) {
    return "citicoline";
  }

  if (/coq10|coenzyme q10|ubiquin/.test(search)) {
    return "coq10";
  }

  if (/magnesium/.test(search)) {
    return "magnesium";
  }

	  if (/omega 3|omega3|fish oil|epa|dha/.test(search)) {
	    return "omega_3";
	  }

	  if (/probiotic|probiotics|lactobacillus|bifidobacterium/.test(search)) {
	    return "probiotic";
	  }

	  if (/curcumin|turmeric/.test(search)) {
	    return "curcumin";
	  }

  if (/theanine/.test(search)) {
    return "theanine";
  }

  if (/vitamin d|vitamin d3|cholecalciferol/.test(search)) {
    return "vitamin_d3";
  }

  return "";
}

function localizedSupplementName(
  value: LocalizedText,
  id: string,
  locale: Locale
) {
  const localized = getLocalizedText(value, locale);

  if (locale === "en") {
    return localized;
  }

  const english = getLocalizedText(value, "en");
  const hasLocaleSpecificText = localized && localized !== english;

  if (hasLocaleSpecificText) {
    return localized;
  }

  const fallback =
    supplementNameFallbacks[supplementFallbackKey(id, english || localized)];

  return fallback?.[locale] ?? fallback?.en ?? localized;
}

function localizedDoseText(value: LocalizedText, locale: Locale) {
  const text = getLocalizedText(value, locale) || resolveLocalizedText(value, locale).trim();

  if (locale !== "zh-CN") {
    return text;
  }

  return text
    .replace(/\bcapsules?\b/gi, "粒")
    .replace(/\btablets?\b/gi, "片")
    .replace(/\bsoftgels?\b/gi, "软胶囊")
    .replace(/\bservings?\b/gi, "份")
    .replace(/\b(\d+(?:\.\d+)?)\s*billion\s*CFU\b/gi, (_match, amount: string) => {
      const value = Number(amount);

      return Number.isFinite(value) ? `${value * 10} 亿 CFU` : `${amount} billion CFU`;
    })
    .replace(/\bper day\b/gi, "每天")
    .replace(/\/day\b/gi, "/天")
    .replace(/\bday\b/gi, "天");
}

function localizeKnownInlineTerms(text: string, locale: Locale) {
  if (locale !== "zh-CN") {
    return text;
  }

  return text
    .replace(/\bSingapore\b/g, "新加坡")
    .replace(/\bThailand\b/g, "泰国")
    .replace(/\bCurcumin\b/g, "姜黄素")
    .replace(/\bVitamin D3\b/g, "维生素 D3")
    .replace(/\bVitamin D\b/g, "维生素 D")
    .replace(/\bCoQ10\b/g, "辅酶 Q10")
    .replace(/\bMagnesium\b/g, "镁")
    .replace(/\bTheanine\b/g, "茶氨酸")
    .replace(/\bMulti-strain probiotics\b/g, "多菌株益生菌")
    .replace(/\bprobiotics\b/gi, "益生菌")
    .replace(/\bprobiotic\b/gi, "益生菌")
    .replace(/\b10 billion CFU\b/gi, "100 亿 CFU");
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

function localizedIngredientRationale(
  ingredient: FormulationIngredient,
  locale: Locale
) {
  const text = getLocalizedText(ingredient.rationale, locale);

  if (text) {
    return text;
  }

  const supplement = localizedSupplementName(ingredient.supplement, ingredient.id, locale);
  const benefit = supplementBenefitTags(ingredient)[0];
  const benefitLabel = benefit ? localizedBenefitTagLabel(benefit, locale) : "";

  if (locale === "th") {
    return benefitLabel
      ? `${supplement} อยู่ในแผนนี้เพื่อช่วยด้าน${benefitLabel}ตามลำดับความสำคัญของคุณ`
      : `${supplement} อยู่ในแผนนี้ตามเป้าหมายและบริบทด้านความปลอดภัยของคุณ`;
  }

  if (locale === "zh-CN") {
    return benefitLabel
      ? `${supplement} 被纳入本方案，用于围绕${benefitLabel}提供有针对性的支持。`
      : `${supplement} 被纳入本方案，以匹配您的目标、偏好和安全背景。`;
  }

  return benefitLabel
    ? `${supplement} is included for targeted support around ${benefitLabel}.`
    : `${supplement} is included because it fits your goals, preferences, and safety context.`;
}

function planRevealHref(locale: Locale, planId: string) {
  return nutritionRevealPath(locale, planId);
}

function planRevealStackHref(
  locale: Locale,
  planId: string,
  stackPreference: ProductStackPreference
) {
  const params = new URLSearchParams({
    plan: planId,
    stack: stackPreference
  });

  return `/${locale}/nutrition/reveal?${params.toString()}`;
}

function replaceRevealStackUrl(
  locale: Locale,
  planId: string,
  stackPreference: ProductStackPreference
) {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(
    window.history.state,
    "",
    planRevealStackHref(locale, planId, stackPreference)
  );
}

function planPaywallHref(locale: Locale, planId: string) {
  return nutritionHealthScorePath(locale, planId);
}

function resultHasPendingSections(result: FormulationResult) {
  const statuses = result.sectionStatuses;

  return Boolean(
    statuses &&
      (statuses.foodSupport === "pending" ||
        statuses.foods === "pending" ||
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

function normalizeFoodText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .trim();
}

function normalizedFoodTokens(value: string) {
  return normalizeFoodText(value).split(/\s+/).filter(Boolean);
}

function normalizedFoodTextMatchesPattern(value: string, pattern: string) {
  const valueTokens = normalizedFoodTokens(value);
  const patternTokens = normalizedFoodTokens(pattern);

  if (patternTokens.length < 1 || valueTokens.length < 1) {
    return false;
  }

  if (patternTokens.length === 1) {
    const [patternToken] = patternTokens;

    if (!patternToken) {
      return false;
    }

    return valueTokens.some((token) =>
      patternToken.length <= 3
        ? token === patternToken
        : token === patternToken || token.startsWith(patternToken)
    );
  }

  return valueTokens.some((_, startIndex) =>
    patternTokens.every((patternToken, offset) => {
      const token = valueTokens[startIndex + offset];

      return Boolean(
        token &&
          (token === patternToken ||
            (patternToken.length > 1 && token.startsWith(patternToken)))
      );
    })
  );
}

const managedFoodServing: Record<string, Record<Locale, string>> = {
  brown_rice: { en: "1 small bowl", th: "1 ถ้วยเล็ก", "zh-CN": "1 小碗" },
  chia_seeds: { en: "1 tbsp", th: "1 ช้อนโต๊ะ", "zh-CN": "1 汤匙" },
  chickpeas: { en: "1/2 cup cooked", th: "ถั่วสุก 1/2 ถ้วย", "zh-CN": "熟鹰嘴豆 1/2 杯" },
  flaxseed: { en: "1 tbsp ground", th: "บด 1 ช้อนโต๊ะ", "zh-CN": "研磨后 1 汤匙" },
  ginger_tea: { en: "1 cup", th: "1 ถ้วย", "zh-CN": "1 杯" },
  green_tea: { en: "1 cup", th: "1 ถ้วย", "zh-CN": "1 杯" },
  holy_basil: { en: "1 handful cooked", th: "ปรุงสุก 1 กำมือ", "zh-CN": "熟食 1 小把" },
  kimchi: { en: "2-3 tbsp", th: "2-3 ช้อนโต๊ะ", "zh-CN": "2-3 汤匙" },
  lentils: { en: "1/2 cup cooked", th: "เลนทิลสุก 1/2 ถ้วย", "zh-CN": "熟小扁豆 1/2 杯" },
  moringa_leaves: { en: "1 small bowl cooked", th: "ปรุงสุก 1 ถ้วยเล็ก", "zh-CN": "熟食 1 小碗" },
  mung_beans: { en: "1/2 cup cooked", th: "ถั่วเขียวสุก 1/2 ถ้วย", "zh-CN": "熟绿豆 1/2 杯" },
  oats: { en: "1 small bowl", th: "1 ถ้วยเล็ก", "zh-CN": "1 小碗" },
  papaya: { en: "1 small bowl", th: "1 ถ้วยเล็ก", "zh-CN": "1 小碗" },
  pumpkin_seeds: { en: "1 small handful", th: "1 กำมือเล็ก", "zh-CN": "1 小把" },
  salmon: { en: "1 palm-sized portion", th: "1 ชิ้นขนาดฝ่ามือ", "zh-CN": "1 份手掌大小" },
  sardines: { en: "1 small tin or portion", th: "1 กระป๋องเล็กหรือ 1 ส่วน", "zh-CN": "1 小罐或 1 份" },
  sesame_seeds: { en: "1 tbsp", th: "1 ช้อนโต๊ะ", "zh-CN": "1 汤匙" },
  tofu: { en: "1 palm-sized portion", th: "1 ชิ้นขนาดฝ่ามือ", "zh-CN": "1 份手掌大小" },
  turmeric: { en: "1-2 tsp in cooking", th: "1-2 ช้อนชาในอาหาร", "zh-CN": "烹调中加入 1-2 茶匙" },
  unsweetened_yogurt: { en: "1 small bowl", th: "1 ถ้วยเล็ก", "zh-CN": "1 小碗" }
};

const managedFoodFrequency: Record<string, Record<Locale, string>> = {
  ginger_tea: { en: "3-5 times/week", th: "3-5 ครั้งต่อสัปดาห์", "zh-CN": "每周 3-5 次" },
  green_tea: { en: "3-5 times/week", th: "3-5 ครั้งต่อสัปดาห์", "zh-CN": "每周 3-5 次" },
  kimchi: { en: "3-4 times/week", th: "3-4 ครั้งต่อสัปดาห์", "zh-CN": "每周 3-4 次" },
  salmon: { en: "1-2 times/week", th: "1-2 ครั้งต่อสัปดาห์", "zh-CN": "每周 1-2 次" },
  sardines: { en: "1-2 times/week", th: "1-2 ครั้งต่อสัปดาห์", "zh-CN": "每周 1-2 次" },
  turmeric: { en: "most cooking days", th: "ในมื้ออาหารหลายวันต่อสัปดาห์", "zh-CN": "多数烹调日" }
};

const foodSupportNeedLabels: Record<string, Record<Locale, string>> = {
  calcium: { en: "calcium", th: "แคลเซียม", "zh-CN": "钙" },
  citicoline: { en: "citicoline", th: "ซิติโคลีน", "zh-CN": "胞磷胆碱" },
  coq10: { en: "CoQ10", th: "โคคิวเท็น", "zh-CN": "辅酶 Q10" },
  curcumin: { en: "curcumin", th: "เคอร์คูมิน", "zh-CN": "姜黄素" },
  magnesium: { en: "magnesium", th: "แมกนีเซียม", "zh-CN": "镁" },
  omega: { en: "omega-3", th: "โอเมกา 3", "zh-CN": "Omega-3" },
  probiotic: { en: "probiotic", th: "โปรไบโอติก", "zh-CN": "益生菌" },
  theanine: { en: "theanine", th: "ทีอะนีน", "zh-CN": "茶氨酸" },
  vitamin_b12: { en: "vitamin B12", th: "วิตามินบี 12", "zh-CN": "维生素 B12" },
  vitamin_c: { en: "vitamin C", th: "วิตามินซี", "zh-CN": "维生素 C" },
  vitamin_d: { en: "vitamin D", th: "วิตามินดี", "zh-CN": "维生素 D" },
  zinc: { en: "zinc", th: "สังกะสี", "zh-CN": "锌" }
};

const foodSupportPlaceholderValues = new Set([
  "english body",
  "english headline",
  "one plain wellness sentence no medical claims",
  "thai body",
  "thai headline",
  "หนึ่งประโยคภาษาไทยเพื่อสุขภาวะ ไม่ใช่คำกล่าวอ้างทางการแพทย์"
]);

const managedFoodNeedRules = [
  {
    foods: ["salmon", "sardines", "chia_seeds", "flaxseed"],
    patterns: ["omega", "dha", "epa", "fatty acid"]
  },
  {
    foods: ["pumpkin_seeds", "chia_seeds", "sesame_seeds", "brown_rice", "oats"],
    patterns: ["magnesium"]
  },
  {
    foods: ["salmon", "sardines"],
    patterns: ["vitamin d", "vitamin d3", "d3", "cholecalciferol"]
  },
  {
    foods: ["salmon", "sardines", "unsweetened_yogurt"],
    patterns: ["vitamin b12", "b12", "cobalamin"]
  },
  {
    foods: ["sardines", "sesame_seeds", "unsweetened_yogurt", "tofu"],
    patterns: ["calcium"]
  },
  {
    foods: ["papaya", "moringa_leaves"],
    patterns: ["vitamin c", "ascorb"]
  },
  {
    foods: ["pumpkin_seeds", "sesame_seeds", "chickpeas", "lentils"],
    patterns: ["zinc"]
  },
  {
    foods: ["oats", "lentils", "chickpeas", "mung_beans", "chia_seeds", "flaxseed"],
    patterns: ["fiber", "fibre", "prebiotic", "gut"]
  },
  {
    foods: ["kimchi", "unsweetened_yogurt"],
    patterns: ["probiotic", "microbiome", "gut"]
  },
  {
    foods: ["turmeric"],
    patterns: ["curcumin", "turmeric"]
  },
  {
    foods: ["green_tea", "holy_basil", "moringa_leaves", "turmeric", "papaya"],
    patterns: ["antioxidant", "inflamm", "polyphenol"]
  },
  {
    foods: ["tofu", "chickpeas", "lentils", "mung_beans"],
    patterns: ["muscle", "protein", "recovery"]
  }
] as const;

const managedFoodFallbackPriority: Record<string, number> = {
  pumpkin_seeds: 1,
  chia_seeds: 2,
  sesame_seeds: 3,
  sardines: 4,
  salmon: 5,
  oats: 6,
  unsweetened_yogurt: 7,
  tofu: 8,
  lentils: 9,
  chickpeas: 10,
  brown_rice: 11,
  flaxseed: 12,
  green_tea: 13,
  turmeric: 14,
  ginger_tea: 15,
  kimchi: 16,
  holy_basil: 17,
  moringa_leaves: 18,
  mung_beans: 19,
  papaya: 20
};

function managedFoodPriority(seed: (typeof managedFoodSeeds)[number]) {
  return managedFoodFallbackPriority[seed.normalizedName] ?? 999;
}

function foodSupportGaps(needCoverage: readonly ProductNeedCoverage[]) {
  return needCoverage
    .filter((need) =>
      need.itemType === "supplement" &&
      Number.isFinite(need.coveragePercent) &&
      need.coveragePercent < 90
    )
    .sort((first, second) => first.coveragePercent - second.coveragePercent);
}

function foodSupportableGaps(gaps: readonly ProductNeedCoverage[]) {
  return gaps.filter((gap) =>
    managedFoodNeedRules.some((rule) => ruleMatchesNeed(rule, gap))
  );
}

function foodSupportNeedText(need: ProductNeedCoverage) {
  return normalizeFoodText(`${need.id} ${need.displayName}`);
}

function ruleMatchesNeed(
  rule: (typeof managedFoodNeedRules)[number],
  need: ProductNeedCoverage
) {
  const text = `${need.id} ${need.displayName}`;

  return rule.patterns.some((pattern) =>
    normalizedFoodTextMatchesPattern(text, pattern)
  );
}

function managedFoodSeedMatchesGap(
  seed: (typeof managedFoodSeeds)[number],
  gap: ProductNeedCoverage
) {
  return managedFoodNeedRules.some((rule) =>
    ruleMatchesNeed(rule, gap) &&
    rule.foods.includes(seed.normalizedName as never)
  );
}

function scoreManagedFoodSeed(
  seed: (typeof managedFoodSeeds)[number],
  gaps: readonly ProductNeedCoverage[]
) {
  return gaps.reduce(
    (score, gap) =>
      score + (
        managedFoodSeedMatchesGap(seed, gap)
          ? Math.max(10, 100 - gap.coveragePercent)
          : 0
      ),
    0
  );
}

function relatedFoodGapIds(
  seed: (typeof managedFoodSeeds)[number],
  gaps: readonly ProductNeedCoverage[]
) {
  return gaps
    .filter((gap) => managedFoodSeedMatchesGap(seed, gap))
    .map((gap) => gap.id)
    .slice(0, 2);
}

function managedSeedForFoodSupportItem(item: FoodGapSupportItem) {
  const itemText = normalizeFoodText([
    item.foodId,
    item.food.en,
    item.food.th
  ].filter(Boolean).join(" "));

  return managedFoodSeeds.find((seed) => {
    const seedKeys = [
      seed.normalizedName,
      seed.normalizedName.replace(/_/g, " "),
      seed.name.en,
      seed.name.th,
      seed.name["zh-CN"]
    ].map(normalizeFoodText);

    return seedKeys.some((key) =>
      key && (itemText.includes(key) || key.includes(itemText))
    );
  });
}

function foodSupportNeedLabel(need: ProductNeedCoverage, locale: Locale) {
  const text = foodSupportNeedText(need);
  const key = Object.keys(foodSupportNeedLabels).find((candidate) =>
    text.includes(candidate.replace(/_/g, " "))
  );

  if (key) {
    return foodSupportNeedLabels[key][locale] ?? foodSupportNeedLabels[key].en;
  }

  return localizeKnownInlineTerms(need.displayName, locale);
}

function needIngredientMatchTexts(ingredient: FormulationIngredient) {
  return [
    ingredient.id,
    getLocalizedText(ingredient.supplement, "en"),
    getLocalizedText(ingredient.supplement, "th"),
    supplementFallbackKey(
      ingredient.id,
      getLocalizedText(ingredient.supplement, "en")
    ).replace(/_/g, " ")
  ]
    .map(normalizeFoodText)
    .filter(Boolean);
}

function productNeedMatchTexts(need: ProductNeedCoverage) {
  return [
    need.id,
    need.id.replace(/^supplement:/, ""),
    need.displayName
  ]
    .map(normalizeFoodText)
    .filter(Boolean);
}

function productNeedMatchesIngredient(
  need: ProductNeedCoverage,
  ingredient: FormulationIngredient
) {
  const needTexts = productNeedMatchTexts(need);
  const ingredientTexts = needIngredientMatchTexts(ingredient);

  return needTexts.some((needText) =>
    ingredientTexts.some((ingredientText) =>
      ingredientText.includes(needText) || needText.includes(ingredientText)
    )
  );
}

function formulaIngredientRowNumbers(ingredients: readonly FormulationIngredient[]) {
  const rowNumbers = new Map<string, number>();
  let rowNumber = 0;

  for (const [, group] of groupedFormulaIngredients([...ingredients])) {
    for (const ingredient of group) {
      rowNumber += 1;
      rowNumbers.set(ingredient.id, rowNumber);
    }
  }

  return rowNumbers;
}

type FoodSupportFormulaGap = Readonly<{
  coveragePercent: number;
  dailyDose: string;
  id: string;
  label: string;
  rowNumber: number | null;
}>;

function foodSupportFormulaGapsForItem(
  item: FoodGapSupportItem,
  selectedNeedCoverage: readonly ProductNeedCoverage[],
  ingredients: readonly FormulationIngredient[],
  locale: Locale
): FoodSupportFormulaGap[] {
  const seed = managedSeedForFoodSupportItem(item);
  const supportableGaps = seed
    ? foodSupportGaps(selectedNeedCoverage).filter((gap) =>
        managedFoodSeedMatchesGap(seed, gap)
      )
    : [];
  const explicitIds = new Set(item.gapNeedIds);
  const inferredIds = new Set(
    seed ? relatedFoodGapIds(seed, supportableGaps) : []
  );
  const rowNumbers = formulaIngredientRowNumbers(ingredients);

  return supportableGaps
    .filter((gap) => explicitIds.has(gap.id) || inferredIds.has(gap.id))
    .map((gap) => {
      const ingredient = ingredients.find((candidate) =>
        productNeedMatchesIngredient(gap, candidate)
      );

      return {
        coveragePercent: Math.min(100, Math.max(0, Math.round(gap.coveragePercent))),
        dailyDose: ingredient ? localizedDoseText(ingredient.dailyDose, locale) : "",
        id: gap.id,
        label: ingredient
          ? localizedSupplementName(ingredient.supplement, ingredient.id, locale)
          : foodSupportNeedLabel(gap, locale),
        rowNumber: ingredient ? rowNumbers.get(ingredient.id) ?? null : null
      };
    });
}

function joinFoodSupportNeeds(
  needs: readonly ProductNeedCoverage[],
  locale: Locale
) {
  const labels = needs.map((need) => foodSupportNeedLabel(need, locale)).slice(0, 2);

  if (labels.length < 1) {
    return locale === "th"
      ? "ช่องว่างที่เหลือ"
      : locale === "zh-CN"
        ? "剩余缺口"
        : "the remaining gaps";
  }

  return labels.length === 1
    ? labels[0]
    : locale === "th"
      ? labels.join(" และ ")
      : locale === "zh-CN"
        ? labels.join("和")
        : `${labels[0]} and ${labels[1]}`;
}

function joinFoodSupportFormulaGapLabels(
  gaps: readonly FoodSupportFormulaGap[],
  locale: Locale
) {
  const labels = gaps.map((gap) => gap.label).filter(Boolean).slice(0, 2);

  if (labels.length < 1) {
    return locale === "th"
      ? "ช่องว่างที่เหลือ"
      : locale === "zh-CN"
        ? "剩余缺口"
        : "the remaining gaps";
  }

  return labels.length === 1
    ? labels[0]
    : locale === "th"
      ? labels.join(" และ ")
      : locale === "zh-CN"
        ? labels.join("和")
        : `${labels[0]} and ${labels[1]}`;
}

function isFoodSupportPlaceholderCopy(value: string) {
  return foodSupportPlaceholderValues.has(normalizeFoodText(value));
}

function safeFoodSupportCopy(
  value: LocalizedText,
  locale: Locale,
  fallback: string
) {
  const text = getLocalizedText(value, locale);
  const resolved = text && !isFoodSupportPlaceholderCopy(text) ? text : fallback;

  return localizeKnownInlineTerms(resolved, locale);
}

function localizedReportText(value: LocalizedText, locale: Locale, fallback: string) {
  return getLocalizedText(value, locale) || fallback;
}

function localizedReportFallbackTitle(locale: Locale) {
  return locale === "th"
    ? "แผนโภชนาการฉบับสุดท้าย"
    : locale === "zh-CN"
      ? "您的最终营养计划"
      : "Your final nutrition plan";
}

function localizedReportFallbackBody(locale: Locale) {
  return locale === "th"
    ? "แผนนี้สรุปอาหาร อาหารเสริม ขั้นตอนถัดไป และข้อควรระวังจากข้อมูลที่คุณให้ไว้"
    : locale === "zh-CN"
      ? "这份计划汇总了根据您提供的信息生成的食物、补充剂、下一步行动和安全提醒。"
      : "This plan summarizes food, supplement, next-step, and safety guidance from your answers.";
}

function managedSeedForFoodItem(item: FormulationResult["foodGuidance"][number]) {
  const itemText = normalizeFoodText([
    item.foodId,
    typeof item.food === "string" ? item.food : Object.values(item.food).join(" ")
  ].filter(Boolean).join(" "));

  return managedFoodSeeds.find((seed) => {
    const seedKeys = [
      seed.normalizedName,
      seed.normalizedName.replace(/_/g, " "),
      seed.name.en,
      seed.name.th,
      seed.name["zh-CN"]
    ].map(normalizeFoodText);

    return seedKeys.some((key) =>
      key && (itemText.includes(key) || key.includes(itemText))
    );
  });
}

function previousFoodGuidanceRank(
  seed: (typeof managedFoodSeeds)[number],
  result: FormulationResult
) {
  const index = (result.foodGuidance ?? [])
    .filter((item) => item.safety?.visibility !== "hidden")
    .findIndex((item) => managedSeedForFoodItem(item)?.normalizedName === seed.normalizedName);

  return index >= 0 ? index + 1 : 999;
}

function fallbackManagedFoodSupportItems(
  result: FormulationResult,
  selectedNeedCoverage: readonly ProductNeedCoverage[]
): FoodGapSupportItem[] {
  const gaps = foodSupportGaps(selectedNeedCoverage);
  const supportableGaps = foodSupportableGaps(gaps);

  if (supportableGaps.length < 1) {
    return [];
  }

  const selectedSeeds: Array<(typeof managedFoodSeeds)[number]> = [];
  for (const gap of supportableGaps) {
    const matchingSeeds = managedFoodSeeds
      .filter((seed) => managedFoodSeedMatchesGap(seed, gap))
      .sort((first, second) => managedFoodPriority(first) - managedFoodPriority(second));
    let addedForGap = 0;

    for (const seed of matchingSeeds) {
      if (selectedSeeds.some((candidate) => candidate.normalizedName === seed.normalizedName)) {
        continue;
      }

      selectedSeeds.push(seed);
      addedForGap += 1;

      if (addedForGap >= 2) {
        break;
      }
    }
  }
  const scored = managedFoodSeeds
    .map((seed, index) => ({
      index,
      previousRank: previousFoodGuidanceRank(seed, result),
      score: scoreManagedFoodSeed(seed, gaps),
      seed
    }))
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      if (gaps.length > 0) {
        return managedFoodPriority(first.seed) - managedFoodPriority(second.seed) ||
          first.index - second.index;
      }

      if (first.previousRank !== second.previousRank) {
        return first.previousRank - second.previousRank;
      }

      return managedFoodPriority(first.seed) - managedFoodPriority(second.seed) ||
        first.index - second.index;
    });
  const selected = [
    ...selectedSeeds.map((seed) => ({
      index: managedFoodSeeds.findIndex((candidate) => candidate.normalizedName === seed.normalizedName),
      previousRank: previousFoodGuidanceRank(seed, result),
      score: scoreManagedFoodSeed(seed, gaps),
      seed
    })),
    ...scored.filter((item) =>
      !selectedSeeds.some((seed) => seed.normalizedName === item.seed.normalizedName) &&
      item.score > 0
    )
  ].slice(0, 6);

  return selected.map(({ seed }, index) => {
    const gapNeedIds = relatedFoodGapIds(seed, gaps);
    const relatedNeeds = gaps.filter((gap) => gapNeedIds.includes(gap.id));
    const enNeedText = joinFoodSupportNeeds(relatedNeeds, "en");
    const thNeedText = joinFoodSupportNeeds(relatedNeeds, "th");

    return {
      category: { en: seed.category.en, th: seed.category.th },
      food: { en: seed.name.en, th: seed.name.th },
      foodId: seed.normalizedName,
      frequency:
        managedFoodFrequency[seed.normalizedName] ??
        { en: "3-4 times/week", th: "3-4 ครั้งต่อสัปดาห์" },
      gapNeedIds,
      imageAlt: { en: seed.imageAlt.en, th: seed.imageAlt.th },
      imagePath: seed.imagePath,
      position: index + 1,
      rationale: relatedNeeds.length > 0
        ? {
            en: `${seed.name.en} gives food-level support around ${enNeedText} while products stay responsible for the formula math.`,
            th: `${seed.name.th} ช่วยเสริมจากอาหารในส่วนของ${thNeedText} โดยไม่เปลี่ยนการคำนวณความครอบคลุมของผลิตภัณฑ์`
          }
        : {
            en: `${seed.name.en} keeps the plan grounded in everyday food while the product stack handles the formula.`,
            th: `${seed.name.th} ช่วยให้แผนยังยึดกับอาหารในชีวิตประจำวัน ขณะที่ชุดผลิตภัณฑ์ทำหน้าที่ตามสูตร`
          },
      serving:
        managedFoodServing[seed.normalizedName] ??
        { en: "1 practical serving", th: "1 ส่วนที่รับประทานได้จริง" }
    };
  });
}

function fallbackFoodSupportItems(
  result: FormulationResult,
  selectedNeedCoverage: readonly ProductNeedCoverage[]
): FoodGapSupportItem[] {
  if (selectedNeedCoverage.length > 0) {
    return fallbackManagedFoodSupportItems(result, selectedNeedCoverage);
  }

  return [];
}

function selectedFoodSupport(
  result: FormulationResult,
  selectedNeedCoverage: readonly ProductNeedCoverage[],
  selectedPreference?: ProductStackPreference | null
) {
  const variant =
    selectedPreference && result.foodGapSupport?.variants[selectedPreference]
      ? result.foodGapSupport.variants[selectedPreference]
      : result.foodGapSupport?.variants.balanced ??
        result.foodGapSupport?.variants.compact ??
        null;

  return {
    fallbackItems: variant ? [] : fallbackFoodSupportItems(result, selectedNeedCoverage),
    variant
  };
}

export function FormulationResults({
  initialStackPreference = null,
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
    useState<ProductStackPreference | null>(() => initialStackPreference);
  const productPollAttemptsRef = useRef(0);

  const refreshFormulationResult = useCallback(async () => {
    const response = await fetch(
      `/api/assessment/${encodeURIComponent(effectivePlanId)}/formulation?locale=${locale}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as FormulationResult;

    setResult(payload);
    setLoadState("ready");

    return true;
  }, [effectivePlanId, locale]);

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

    void fetchFormulation();

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
          current="reveal"
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
  const nutritionPending = sectionStatuses.supplements !== "ready";
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
      onProductStackRefresh={refreshFormulationResult}
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
        current="reveal"
        locale={locale}
        pending={true}
      />
      <div
        aria-live="polite"
        className="rounded-lg bg-white p-6 ring-1 ring-foreground/10 transition-colors sm:p-8"
      >
        <h1 className="mn-hero-title max-w-2xl text-2xl font-semibold tracking-normal text-[var(--mn-ink)] sm:text-3xl">
          {labels.nutritionProgressTitle}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {labels.nutritionProgressBody}
        </p>
      </div>
    </section>
  );
}

const baseRevealCopy = {
  en: {
    ingredientCount: "ingredients",
    catalogueProducts: "approved products",
    catalogueSupplements: "Ingredients evaluated",
    compactCoverageLabel: "Catalogue fit",
    contributionLabel: "of selected stack",
    distilledEyebrow: "The distillation",
    distilledSummaryTemplate: "{supplementTotal} ingredients evaluated. {supplementSelected} selected for you.",
    distilledFoot:
      "Each one screened against your disclosed cautions, your goals, and the catalogue evidence. Nothing in your formula was added because it sells well. Each was added because it earned its place for you.",
    distilledTitle:
      "We evaluated the catalogue. Only what earned a place stayed.",
    distilledTitleTemplate:
      "We evaluated {supplementTotalText} ingredients. {supplementSelectedText} earned a place in your formula.",
    formulaEyebrow: "Your formula",
    formulaLead:
      "Every dose below is sized to your body, your goals, and the safety context you shared. Product fit shows how closely the selected stack covers each nutrient.",
    formulaTitle: "Exactly enough.",
    formulaTitleTemplate: "{supplementSelectedText} nutrients. Exactly enough.",
    formulaMetaEvaluated: "Precision tier",
    formulaMetaSelected: "selected",
    formulaMetaNoPadding: "no padding",
    formulaMetaTier: "FORMULA · PRECISION TIER",
    formulaMetaNrv: "PRODUCT FIT · SELECTED STACK",
    formulaMetaFocus: "Focus",
    formulaSignedPrefix: "Composed",
    foodSupportDefaultBody:
      "Foods do not change the product coverage score. They only appear when the product stack leaves a supplement gap that a managed food can credibly support.",
    foodSupportDefaultHeadline: "Food support, after the products.",
    foodSupportEmpty:
      "Food support will appear here once the managed food catalogue and product stack are ready.",
    foodSupportEyebrow: "Food support",
    foodSupportFrequency: "Frequency",
    foodSupportGapLabel: "Supports",
    foodSupportGapBodyTemplate:
      "These foods come from the managed catalogue and are selected around {gaps}. They support the plan in everyday meals without changing product coverage numbers.",
    foodSupportGapHeadlineTemplate: "Food support for {gaps}.",
    foodSupportServing: "Serving",
    foodSupportFormulaGapLabel: "Formula gap",
    foodSupportTitle: "Foods chosen to support the gaps.",
    heroEyebrow: "Your Right Amount Has Arrived",
    heroFor: "For",
    heroTitle: "Your formula has arrived",
    heroHeadline:
      "A formula built around your body, your goals, and the way you actually live.",
    heroMetaGenerated: "Generated",
    heroMetaPlan: "Plan ID",
    heroSub:
      "No guesswork. No pharmacy aisle confusion. {supplementSelectedText} nutrients, chosen with intention, paired with the exact products to buy.",
    personalizationBody:
      "Your formula begins with who you are. Body, location, the goals that actually matter to you, and the constraints we honour without compromise.",
    personalizationEyebrow: "Built from your assessment",
    personalizationTitle: "Everything you told us, folded into one plan.",
    productsBody:
      "Products are shown as the closest available stack from the approved catalogue. The goal is fewer bottles, clear coverage, and no unnecessary overlap.",
    productsLead:
      "We searched the Thai market for products that meet your formula as closely as the catalogue allows: verified dosing, clean enough labels, and direct marketplace links where available.",
    productsEmpty:
      "The formula is ready, but the product catalogue does not yet contain an approved stack for these needs.",
    productsEyebrow: "From shelves to certainty",
    productsTitle: "From shelves to certainty.",
    productsAllTitleTemplate:
      "{productSelectedText} bottles. All {supplementSelectedTextLower} nutrients.",
    productsPartialTitleTemplate:
      "{productSelectedText} bottles. {coveredText} of {supplementSelectedTextLower} nutrients.",
    supplementsRecommended: "Selected for you",
    productsRecommended: "products recommended for you",
    productDoseRecommended: "Recommended dose",
    productVerified: "Matched",
    productServingUnit: "servings",
    productSingleServingUnit: "serving",
    productMatchTemplate:
      "Matches {covers} and accounts for {percent}% of the selected stack.",
    productServingMatchTemplate:
      "Use {servings} {servingUnit}. Matches {covers} and accounts for {percent}% of the selected stack.",
    selectedProducts: "Bottles",
    selectedSuffix: "selected",
    begin: "Begin",
    tableAmount: "Daily amount",
    tableCoverage: "Product fit",
    tableName: "Nutrient",
    tableReason: "Why this, for you",
    viewProduct: "View product",
    cautionsTitle: "Safety check complete.",
    statinCautionsTitle: "Statin-aware safety check complete.",
    coverageHeadlineTemplate: "All {supplementCount} nutrients delivered.",
    coveragePartialHeadlineTemplate:
      "Products cover {coveredText} of {supplementSelectedText} nutrients.",
    coverageSub:
      "Every product is checked against your formula, serving burden, and catalogue data before it appears here.",
    bottles: "Bottles",
    prioritiesCovered: "Nutrients covered",
    closingTitle: "The wisdom of knowing the right amount",
    closingBody:
      "Your formula is the embodiment of this idea. The right nutrients. The right amounts. The right products where the data is strong enough. Now your body has what it needs to do the rest.",
    etymologyLine: "Mattaññutā · Pāli",
    print: "Download formula PDF",
    save: "Save to my plan",
    reassess: "Schedule 60-day re-assessment",
    wellnessOnly:
      "Wellness information only. Share this plan with a physician or pharmacist if you use medication, are pregnant or breastfeeding, have a medical condition, or your situation changes."
  },
  th: {
    ingredientCount: "ส่วนผสม",
    catalogueProducts: "ผลิตภัณฑ์ที่อนุมัติแล้ว",
    catalogueSupplements: "ส่วนผสมที่ประเมิน",
    compactCoverageLabel: "ความพอดีกับแคตตาล็อก",
    contributionLabel: "ของชุดที่เลือก",
    distilledEyebrow: "การคัดให้เหลือสิ่งจำเป็น",
    distilledSummaryTemplate:
      "ประเมินส่วนผสม {supplementTotal} รายการ และเลือก {supplementSelected} รายการสำหรับคุณ",
    distilledFoot:
      "แต่ละรายการถูกคัดจากข้อควรระวังที่คุณแจ้ง เป้าหมายของคุณ และข้อมูลในแคตตาล็อก ไม่มีรายการใดถูกใส่เข้ามาเพราะขายดี แต่เพราะสมควรอยู่ในสูตรของคุณ",
    distilledTitle: "เราประเมินทั้งแคตตาล็อก และเก็บไว้เฉพาะสิ่งที่เหมาะกับคุณจริง ๆ",
    distilledTitleTemplate:
      "เราประเมินส่วนผสม {supplementTotalText} รายการ และมี {supplementSelectedText} รายการที่ได้อยู่ในสูตรของคุณ",
    formulaEyebrow: "สูตรของคุณ",
    formulaLead:
      "ปริมาณด้านล่างปรับตามร่างกาย เป้าหมาย และบริบทความปลอดภัยที่คุณให้ไว้ ความพอดีของสินค้าแสดงว่าชุดที่เลือกครอบคลุมสารอาหารแต่ละรายการได้แค่ไหน",
    formulaTitle: "พอดี ไม่มากเกินจำเป็น",
    formulaTitleTemplate: "{supplementSelectedText} สารอาหาร ในปริมาณที่พอดี",
    formulaMetaEvaluated: "ระดับความแม่นยำ",
    formulaMetaSelected: "เลือก",
    formulaMetaNoPadding: "ไม่เติมเกินจำเป็น",
    formulaMetaTier: "สูตร · ระดับความแม่นยำ",
    formulaMetaNrv: "ความพอดีของสินค้า · ชุดที่เลือก",
    formulaMetaFocus: "เป้าหมาย",
    formulaSignedPrefix: "จัดทำ",
    foodSupportDefaultBody:
      "อาหารไม่เปลี่ยนคะแนนความครอบคลุมของผลิตภัณฑ์ และจะแสดงเฉพาะเมื่อชุดผลิตภัณฑ์ยังเหลือช่องว่างของสารอาหารที่อาหารในแคตตาล็อกช่วยเสริมได้อย่างน่าเชื่อถือ",
    foodSupportDefaultHeadline: "อาหารสนับสนุนหลังจากชุดผลิตภัณฑ์",
    foodSupportEmpty:
      "คำแนะนำอาหารจะแสดงที่นี่เมื่อแคตตาล็อกอาหารและชุดผลิตภัณฑ์พร้อม",
    foodSupportEyebrow: "อาหารสนับสนุน",
    foodSupportFrequency: "ความถี่",
    foodSupportGapLabel: "สนับสนุน",
    foodSupportGapBodyTemplate:
      "อาหารเหล่านี้มาจากแคตตาล็อกที่จัดการไว้ และเลือกโดยดูจาก {gaps} เพื่อช่วยให้แผนทำได้จริงในมื้ออาหาร โดยไม่เปลี่ยนตัวเลขความครอบคลุมของผลิตภัณฑ์",
    foodSupportGapHeadlineTemplate: "อาหารสนับสนุนสำหรับ {gaps}",
    foodSupportServing: "ปริมาณ",
    foodSupportFormulaGapLabel: "ช่องว่างในสูตร",
    foodSupportTitle: "อาหารที่เลือกเพื่อช่วยเติมช่องว่าง",
    heroEyebrow: "ปริมาณที่พอดีของคุณพร้อมแล้ว",
    heroFor: "สำหรับ",
    heroTitle: "สูตรของคุณพร้อมแล้ว",
    heroHeadline: "สูตรที่สร้างจากร่างกาย เป้าหมาย และวิถีชีวิตจริงของคุณ",
    heroMetaGenerated: "สร้างเมื่อ",
    heroMetaPlan: "รหัสแผน",
    heroSub:
      "ไม่ใช่การเดา ไม่ใช่การหยิบจากชั้นวางแบบสุ่ม สารอาหาร {supplementSelectedText} รายการถูกเลือกอย่างตั้งใจ แล้วจับคู่กับผลิตภัณฑ์ที่ซื้อได้จริงเมื่อข้อมูลรองรับ",
    personalizationBody:
      "สูตรนี้เริ่มจากตัวคุณ ทั้งข้อมูลร่างกาย ที่อยู่ เป้าหมายที่สำคัญจริง และข้อจำกัดที่ต้องเคารพอย่างจริงจัง",
    personalizationEyebrow: "สร้างจากแบบประเมินของคุณ",
    personalizationTitle: "ทุกอย่างที่คุณบอกเรา ถูกพับรวมเป็นแผนเดียว",
    productsBody:
      "ผลิตภัณฑ์ที่แสดงคือชุดที่ใกล้ที่สุดจากแคตตาล็อกที่อนุมัติแล้ว เป้าหมายคือขวดน้อยลง ความครอบคลุมชัดเจน และไม่ซ้ำซ้อนเกินจำเป็น",
    productsLead:
      "เราค้นหาผลิตภัณฑ์ในตลาดไทยที่ตรงกับสูตรของคุณมากที่สุดเท่าที่แคตตาล็อกรองรับ โดยดูปริมาณที่ตรวจได้ ฉลากที่ชัดเจน และลิงก์ซื้อเมื่อมีข้อมูลเพียงพอ",
    productsEmpty:
      "สูตรพร้อมแล้ว แต่แคตตาล็อกยังไม่มีชุดผลิตภัณฑ์ที่อนุมัติสำหรับความต้องการนี้",
    productsEyebrow: "จากชั้นวางสู่ความชัดเจน",
    productsTitle: "จากชั้นวางสู่ความชัดเจน",
    productsAllTitleTemplate:
      "{productSelectedText} ขวด ครอบคลุมสารอาหารครบ {supplementSelectedText} รายการ",
    productsPartialTitleTemplate:
      "{productSelectedText} ขวด ครอบคลุมสารอาหาร {coveredText} จาก {supplementSelectedText} รายการ",
    supplementsRecommended: "เลือกสำหรับคุณ",
    productsRecommended: "ผลิตภัณฑ์ที่แนะนำสำหรับคุณ",
    productDoseRecommended: "ขนาดที่แนะนำ",
    productVerified: "จับคู่แล้ว",
    productServingUnit: "หน่วยบริโภค",
    productSingleServingUnit: "หน่วยบริโภค",
    productMatchTemplate:
      "ครอบคลุม {covers} และคิดเป็น {percent}% ของชุดที่เลือก",
    productServingMatchTemplate:
      "ใช้ {servings} {servingUnit} ครอบคลุม {covers} และคิดเป็น {percent}% ของชุดที่เลือก",
    selectedProducts: "ขวด",
    selectedSuffix: "รายการที่เลือก",
    begin: "เริ่ม",
    tableAmount: "ปริมาณต่อวัน",
    tableCoverage: "ความพอดีของสินค้า",
    tableName: "สารอาหาร",
    tableReason: "เหตุผลที่เหมาะกับคุณ",
    viewProduct: "ดูสินค้า",
    cautionsTitle: "ตรวจความปลอดภัยแล้ว",
    statinCautionsTitle: "ตรวจความปลอดภัยโดยคำนึงถึงสแตตินแล้ว",
    coverageHeadlineTemplate: "ส่งมอบสารอาหารครบ {supplementCount} รายการ",
    coveragePartialHeadlineTemplate:
      "ผลิตภัณฑ์ครอบคลุมสารอาหาร {coveredText} จาก {supplementSelectedText} รายการ",
    coverageSub:
      "ผลิตภัณฑ์ทุกตัวถูกเทียบกับสูตร ภาระการรับประทาน และข้อมูลแคตตาล็อกก่อนแสดงบนหน้านี้",
    bottles: "ขวด",
    prioritiesCovered: "สารอาหารที่ครอบคลุม",
    closingTitle: "ปัญญาแห่งการรู้ปริมาณที่พอดี",
    closingBody:
      "สูตรนี้คือการนำแนวคิดนั้นมาใช้จริง: สารอาหารที่เหมาะ ปริมาณที่เหมาะ และผลิตภัณฑ์ที่ข้อมูลแข็งแรงพอ เพื่อให้ร่างกายได้สิ่งที่ต้องใช้ต่อจากนี้",
    etymologyLine: "มัตตัญญุตา · บาลี",
    print: "ดาวน์โหลดสูตรเป็น PDF",
    save: "บันทึกแผนของฉัน",
    reassess: "นัดประเมินอีกครั้งใน 60 วัน",
    wellnessOnly:
      "ข้อมูลเพื่อสุขภาวะเท่านั้น โปรดแบ่งปันแผนนี้กับแพทย์หรือเภสัชกรหากคุณใช้ยา ตั้งครรภ์ ให้นมบุตร มีโรคประจำตัว หรือสถานการณ์เปลี่ยนแปลง"
  }
} satisfies Record<BaseLocale, Record<string, string>>;

const revealCopy = {
  ...baseRevealCopy,
  "zh-CN": {
    "ingredientCount": "成分",
    "catalogueProducts": "已批准产品",
    "catalogueSupplements": "已评估成分",
    "compactCoverageLabel": "目录匹配度",
    "contributionLabel": "所选配方占比",
    "distilledEyebrow": "精炼过程",
    "distilledSummaryTemplate": "{supplementTotal} 种成分已评估。为您精选 {supplementSelected} 种。",
    "distilledFoot": "每种成分均经过您披露的注意事项、目标以及目录证据的筛选。您的配方中没有任何成分是因为畅销而添加的。每种成分都是因为适合您而被加入的。",
    "distilledTitle": "我们评估了目录。仅保留了合适的内容。",
    "distilledTitleTemplate": "我们评估了 {supplementTotalText} 种成分。{supplementSelectedText} 种在您的配方中占有一席之地。",
    "formulaEyebrow": "您的配方",
    "formulaLead": "以下每种剂量均根据您的身体、目标以及您分享的安全背景进行调整。产品匹配度显示所选配方对每种营养素的覆盖程度。",
    "formulaTitle": "恰到好处。",
    "formulaTitleTemplate": "{supplementSelectedText} 种营养素。恰到好处。",
    "formulaMetaEvaluated": "精准层级",
    "formulaMetaSelected": "已选",
    "formulaMetaNoPadding": "无多余添加",
    "formulaMetaTier": "配方 · 精准层级",
    "formulaMetaNrv": "产品匹配度 · 所选配方",
    "formulaMetaFocus": "专注",
    "formulaSignedPrefix": "配制于",
    "foodSupportDefaultBody": "食物不会改变产品覆盖评分。只有当产品配方留下补充剂缺口，且可通过管理食物合理支持时，它们才会出现。",
    "foodSupportDefaultHeadline": "产品之后，食物支持。",
    "foodSupportEmpty": "当管理食物目录和产品配方准备就绪后，食物支持将显示在此处。",
    "foodSupportEyebrow": "食物支持",
    "foodSupportFrequency": "频率",
    "foodSupportGapLabel": "支持",
    "foodSupportGapBodyTemplate": "这些食物来自管理目录，围绕 {gaps} 精选。它们在日常饮食中支持计划，而不改变产品覆盖数字。",
    "foodSupportGapHeadlineTemplate": "针对 {gaps} 的食物支持。",
    "foodSupportServing": "份量",
    "foodSupportFormulaGapLabel": "配方缺口",
    "foodSupportTitle": "为缺口选择的食物。",
    "heroEyebrow": "您的 Right Amount 已送达",
    "heroFor": "针对",
    "heroTitle": "您的配方已送达",
    "heroHeadline": "根据您的身体、目标以及实际生活方式打造的配方。",
    "heroMetaGenerated": "生成于",
    "heroMetaPlan": "计划 ID",
    "heroSub": "无需猜测。无需药房货架困惑。{supplementSelectedText} 种营养素，精心挑选，并搭配确切的购买产品。",
    "personalizationBody": "您的配方始于您是谁。身体、位置、对您真正重要的目标，以及我们毫不妥协地尊重的限制。",
    "personalizationEyebrow": "基于您的评估打造",
    "personalizationTitle": "将您告知的一切融入一个计划。",
    "productsBody": "产品显示为来自已批准目录的最接近可用配方。目标是减少瓶数、清晰覆盖且无不必要的重叠。",
    "productsLead": "我们在泰国市场搜索了尽可能接近您配方的产品：经过验证的剂量、足够干净的标签，以及可用的直接市场链接。",
    "productsEmpty": "配方已就绪，但产品目录尚未包含针对这些需求的已批准配方。",
    "productsEyebrow": "从货架到确定性",
    "productsTitle": "从货架到确定性。",
    "productsAllTitleTemplate": "{productSelectedText} 瓶。全部 {supplementSelectedTextLower} 种营养素。",
    "productsPartialTitleTemplate": "{productSelectedText} 瓶。{coveredText} 种 {supplementSelectedTextLower} 营养素。",
    "supplementsRecommended": "为您精选",
    "productsRecommended": "为您推荐的产品",
    "productDoseRecommended": "推荐剂量",
    "productVerified": "匹配",
    "productServingUnit": "份",
    "productSingleServingUnit": "份",
    "productMatchTemplate": "匹配 {covers} 并占所选配方的 {percent}%。",
    "productServingMatchTemplate": "使用 {servings} {servingUnit}。匹配 {covers} 并占所选配方的 {percent}%。",
    "selectedProducts": "瓶数",
    "selectedSuffix": "已选",
    "begin": "开始",
    "tableAmount": "每日量",
    "tableCoverage": "产品匹配度",
    "tableName": "营养素",
    "tableReason": "为何为您选择此成分",
    "viewProduct": "查看产品",
    "cautionsTitle": "安全检查完成。",
    "statinCautionsTitle": "他汀类药物感知安全检查完成。",
    "coverageHeadlineTemplate": "已提供全部 {supplementCount} 种营养素。",
    "coveragePartialHeadlineTemplate": "产品覆盖 {coveredText} 种 {supplementSelectedText} 营养素。",
    "coverageSub": "每种产品在显示前均已根据您的配方、份量负担和目录数据进行检查。",
    "bottles": "瓶",
    "prioritiesCovered": "已覆盖营养素",
    "closingTitle": "知晓适量的智慧",
    "closingBody": "您的配方体现了这一理念。正确的营养素。正确的量。在数据足够强的地方选择正确的产品。现在您的身体拥有所需的一切来完成其余部分。",
    "etymologyLine": "Mattaññutā · Pāli",
    "print": "下载配方 PDF",
    "save": "保存到我的计划",
    "reassess": "安排 60 天重新评估",
    "wellnessOnly": "仅限健康信息。如果您使用药物、怀孕或哺乳、有健康状况或情况发生变化，请与医生或药剂师分享此计划。"
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
  },
  "zh-CN": {
    anti_inflammatory: "抗炎支持",
    bone_health: "骨骼健康",
    cognitive_support: "认知支持",
    energy_support: "精力支持",
    gut_health: "肠道健康",
    heart_health: "心脏健康",
    hormone_support: "激素支持",
    immune_support: "免疫支持",
    recovery_support: "恢复支持",
    skin_health: "皮肤健康",
    sleep_support: "睡眠支持",
    stress_support: "压力支持"
  }
};

	const formulaCategoryLabels: Record<Locale, Record<string, string>> = {
	  en: {
	    "Advanced Gut Health": "Advanced gut health",
	    Antioxidants: "Antioxidants",
	    Cardiometabolic: "Cardiometabolic",
	    "Fatty Acids": "Fatty acids",
    Herbals: "Herbals",
    Longevity: "Longevity",
    Minerals: "Minerals",
    Vitamins: "Vitamins"
  },
	  th: {
	    "Advanced Gut Health": "สุขภาพลำไส้ขั้นสูง",
	    Antioxidants: "สารต้านอนุมูลอิสระ",
	    Cardiometabolic: "หัวใจและเมตาบอลิซึม",
	    "Fatty Acids": "กรดไขมัน",
    Herbals: "สมุนไพร",
    Longevity: "การดูแลระยะยาว",
    Minerals: "แร่ธาตุ",
    Vitamins: "วิตามิน"
  },
	  "zh-CN": {
	    "Advanced Gut Health": "高级肠道健康",
	    Antioxidants: "抗氧化",
	    Cardiometabolic: "心血管代谢",
	    "Fatty Acids": "脂肪酸",
    Herbals: "草本",
    Longevity: "长寿健康",
    Minerals: "矿物质",
    Vitamins: "维生素"
  }
};

const contextChipLabels: Record<Locale, Record<string, string>> = {
  en: {
	    Energy: "Energy",
	    Digestion: "Digestion",
	    Fatigue: "Fatigue",
    Female: "Female",
	    Fitness: "Fitness",
	    Focus: "Focus",
	    Heart: "Heart",
    Male: "Male",
    Mood: "Mood",
	    Pro: "Pro",
	    Precision: "Precision",
    "Regular medication noted": "Regular medication noted",
	    Sleep: "Sleep",
	    Singapore: "Singapore",
	    Statin: "Statin",
	    Stress: "Stress",
	    "Upcoming surgery noted": "Upcoming surgery noted",
    Thailand: "Thailand"
  },
  th: {
	    Energy: "พลังงาน",
	    Digestion: "ระบบย่อย",
	    Fatigue: "อ่อนเพลีย",
    Female: "หญิง",
	    Fitness: "ฟิตเนส",
	    Focus: "สมาธิ",
	    Heart: "หัวใจ",
    Male: "ชาย",
    Mood: "อารมณ์",
	    Pro: "โปร",
	    Precision: "ความแม่นยำ",
    "Regular medication noted": "มีการใช้ยาเป็นประจำ",
	    Sleep: "การนอน",
	    Singapore: "สิงคโปร์",
	    Statin: "สแตติน",
	    Stress: "ความเครียด",
	    "Upcoming surgery noted": "มีแผนผ่าตัด",
    Thailand: "ประเทศไทย"
  },
  "zh-CN": {
	    Energy: "精力",
	    Digestion: "消化",
	    Fatigue: "疲劳",
    Female: "女性",
	    Fitness: "健身",
	    Focus: "专注",
	    Heart: "心血管",
    Male: "男性",
    Mood: "情绪",
	    Pro: "专业",
	    Precision: "精准",
    "Regular medication noted": "有规律用药",
	    Sleep: "睡眠",
	    Singapore: "新加坡",
	    Statin: "他汀",
	    Stress: "压力",
	    "Upcoming surgery noted": "近期有手术安排",
    Thailand: "泰国"
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
  },
  "zh-CN": {
    "Imported product": "目录产品",
    "Lazada Thailand": "Lazada 泰国",
    "Shopee Thailand": "Shopee 泰国"
  }
};

const revealJoiners = {
  en: ", ",
  th: " และ ",
  "zh-CN": "、"
} satisfies Record<Locale, string>;

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);

    query.addEventListener("change", listener);

    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}

function useInViewOnce<T extends HTMLElement>() {
  const reducedMotion = useReducedMotion();
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    const element = ref.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const prepareFrame = window.requestAnimationFrame(() => setVisible(false));
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          window.cancelAnimationFrame(prepareFrame);
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );

    observer.observe(element);

    const fallback = window.setTimeout(() => setVisible(true), 1800);

    return () => {
      window.cancelAnimationFrame(prepareFrame);
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, [reducedMotion]);

  return { ref, visible: visible || reducedMotion } as const;
}

function CountUpNumber({
  active,
  className,
  duration = 1000,
  value
}: Readonly<{
  active: boolean;
  className?: string;
  duration?: number;
  value: number;
}>) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (reducedMotion || !active) {
      return undefined;
    }

    let frame = 0;
    const startedAt = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplay(Math.round(value * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [active, duration, reducedMotion, value]);

  return <span className={className}>{reducedMotion || !active ? value : display}</span>;
}

const thaiScriptPattern = /[\u0E00-\u0E7F]/;
const chineseScriptPattern = /[\u3400-\u9FFF]/;
const latinWordPattern = /[A-Za-z]{2,}/;
const englishCountWords = new Map<number, string>([
  [0, "no"],
  [1, "one"],
  [2, "two"],
  [3, "three"],
  [4, "four"],
  [5, "five"],
  [6, "six"],
  [7, "seven"],
  [8, "eight"],
  [9, "nine"],
  [10, "ten"],
  [11, "eleven"],
  [12, "twelve"],
  [13, "thirteen"],
  [14, "fourteen"],
  [15, "fifteen"],
  [16, "sixteen"],
  [17, "seventeen"],
  [18, "eighteen"],
  [19, "nineteen"],
  [20, "twenty"]
]);

function capitalizeText(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function localizedCountText(value: number, locale: Locale, capitalize = false) {
  if (locale === "th" || locale === "zh-CN") {
    return String(value);
  }

  const word = englishCountWords.get(value) ?? String(value);

  return capitalize ? capitalizeText(word) : word;
}

function localizedPlanText(value: unknown, locale: Locale, fallback: string) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const text = typeof record[locale] === "string" ? record[locale].trim() : "";

    if (text) {
      return text;
    }
  }

  if (typeof value === "string" && value.trim()) {
    const text = value.trim();

    if (
      locale === "th"
        ? thaiScriptPattern.test(text)
        : locale === "zh-CN"
          ? /[\u3400-\u9FFF]/.test(text)
          : !thaiScriptPattern.test(text) && !/[\u3400-\u9FFF]/.test(text)
    ) {
      return text;
    }
  }

  return fallback;
}

function revealSlotCopy(
  result: FormulationResult,
  slot: RevealPageCopySlot,
  locale: Locale,
  fallback: string
) {
  const revealPageCopy = result.nutritionReport?.revealPageCopy;

  if (revealPageCopy?.version !== revealPageCopyVersion) {
    return fallback;
  }

  return localizedPlanText(revealPageCopy[slot], locale, fallback);
}

function localizedBenefitTagLabel(value: string, locale: Locale) {
  return benefitTagLabels[locale][value] ?? benefitTagLabels.en[value] ?? foodTagLabel(value);
}

function localizedCategoryLabel(value: string, locale: Locale) {
  return formulaCategoryLabels[locale][value] ?? formulaCategoryLabels.en[value] ?? value;
}

function localizedContextChip(value: string, locale: Locale) {
  return value
    .split(" / ")
    .map((part) =>
      contextChipLabels[locale][part] ??
      contextChipLabels.en[part] ??
      localizeKnownInlineTerms(part, locale)
    )
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

function revealHeroMetaItems(result: FormulationResult, locale: Locale) {
  const profileParts = result.assessmentSummary.profile
    .split("/")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !/not shown|ไม่ระบุ/i.test(part)
    );
  const values = [...profileParts, result.assessmentSummary.region].filter(Boolean);

  return values.map((value) =>
    locale === "en" ? value.toUpperCase() : localizedContextChip(value, locale)
  );
}

function productCoveredNeedCount(products: RecommendedProduct[]) {
  return new Set(products.flatMap((product) => product.covers)).size;
}

function RevealDistillationCard({
  fromCount,
  fromLabel,
  toCount,
  toLabel,
  variant = "card"
}: Readonly<{
  fromCount: number;
  fromLabel: string;
  toCount: number;
  toLabel: string;
  variant?: "card" | "plain";
}>) {
  const { ref, visible } = useInViewOnce<HTMLDivElement>();

  return (
    <div
      className={
        variant === "card"
          ? "rounded-[var(--mn-radius-xl)] border border-[var(--mn-line)] bg-[var(--mn-paper)] px-6 py-8 shadow-[var(--mn-shadow-soft)]"
          : ""
      }
      ref={ref}
    >
      <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-14">
        <div>
          <div className="font-serif text-7xl font-light leading-none text-[var(--mn-ash-soft)] sm:text-8xl">
            <CountUpNumber active={visible} duration={1100} value={fromCount} />
          </div>
          <p className="mn-mono-label mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-ash)] max-sm:leading-[1.35]">
            {fromLabel}
          </p>
        </div>
        <div className="font-serif text-5xl italic text-[var(--mn-gold)] max-sm:rotate-90">
          →
        </div>
        <div>
          <div className="font-serif text-7xl font-light leading-none text-[var(--mn-teal-deep)] sm:text-8xl">
            <CountUpNumber active={visible} duration={1400} value={toCount} />
          </div>
          <p className="mn-mono-label mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-ink-soft)] max-sm:leading-[1.35]">
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
  onProductStackRefresh,
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
  onProductStackRefresh: () => Promise<boolean>;
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
      localizedSupplementName(ingredient.supplement, ingredient.id, locale)
    ])
  );
  const catalogueSupplementCount = Math.max(
    recommendedSupplementCount,
    Number(result.catalogueSupplementCount ?? result.totalSupplementCount ?? 0),
    recommendedSupplementCount
  );
  const selectedCoverage = selectedStackCoverage(activeProductRecommendations, products);
  const productNeedCount = productCoveredNeedCount(products);
  const productOptions = productStackPreferenceOrder.flatMap((preference) => {
    const option = productRecommendationOptions.find((item) => item.id === preference);

    return option ? [option] : [];
  });
  const selectedProductRecommendationOption = selectProductRecommendationOption(
    productOptions,
    selectedProductStackPreference ?? null
  );
  const displayFirstName =
    typeof result.firstName === "string" && result.firstName.trim()
      ? result.firstName.trim()
      : "";
  const supplementSelectedText = localizedCountText(
    recommendedSupplementCount,
    locale,
    true
  );
  const heroSub =
    locale === "en"
      ? `No guesswork. No pharmacy aisle confusion. ${supplementSelectedText} ${
          recommendedSupplementCount === 1 ? "nutrient" : "nutrients"
        }, chosen with intention, paired with the exact products to buy.`
      : formatTemplate(copy.heroSub, { supplementSelectedText });
  const breadcrumbsTitle = copy.personalizationTitle;
  const breadcrumbsBody = revealSlotCopy(
    result,
    "breadcrumbsBody",
    locale,
    copy.personalizationBody
  );
  const distillNarrative = formatTemplate(copy.distilledTitleTemplate, {
    supplementSelectedText,
    supplementTotalText: localizedCountText(catalogueSupplementCount, locale)
  });
  const distillFoot = revealSlotCopy(
    result,
    "distillFoot",
    locale,
    copy.distilledFoot
  );
  const heroMeta = revealHeroMetaItems(result, locale);

  return (
    <section className="w-full overflow-hidden">
      <LandingReveal />

      <section className="relative isolate flex min-h-[calc(100svh-5rem)] w-full items-center justify-center overflow-hidden px-6 py-24 text-center sm:px-8 lg:py-28">
        <div
          aria-hidden={true}
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_48%,rgba(220,232,224,0.58)_0%,rgba(220,232,224,0.26)_34%,transparent_68%),var(--mn-cream)]"
        />
        <div
          aria-hidden={true}
          className="absolute left-1/2 top-1/2 -z-10 size-[min(46rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(220,232,224,0.48)_0%,rgba(220,232,224,0.22)_38%,transparent_70%)] [animation:mn-hero-breathe_18s_ease-in-out_infinite_alternate] motion-reduce:animate-none"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center" data-reveal>
          <p className="mn-mono-label text-xs font-medium uppercase tracking-[0.24em] text-[var(--mn-teal)]">
            {copy.heroEyebrow}
          </p>
          {displayFirstName ? (
            <>
              <p className="mt-9 font-serif text-2xl italic leading-8 text-[var(--mn-ink-soft)] sm:text-[1.75rem]">
                {copy.heroFor}
              </p>
              <h1
                className={`mn-hero-title mt-3 max-w-5xl break-words font-serif text-6xl font-normal italic leading-[0.98] tracking-normal text-[var(--mn-teal-deep)] sm:text-8xl lg:text-[8.25rem] ${
                  locale === "th" ? "leading-[1.22]" : ""
                }`}
              >
                {displayFirstName}
                <span className="text-[var(--mn-gold)]">.</span>
              </h1>
            </>
          ) : (
            <h1
              className={`mn-hero-title mt-10 max-w-4xl break-words font-serif text-5xl font-normal italic leading-[1.02] tracking-normal text-[var(--mn-teal-deep)] sm:text-7xl lg:text-8xl ${
                locale === "th" ? "leading-[1.22]" : "text-balance"
              }`}
            >
              {copy.heroTitle}
            </h1>
          )}
          <p
            className={`mn-hero-subtitle mt-8 max-w-3xl font-serif text-3xl font-normal text-[var(--mn-ink)] sm:text-[2.75rem] ${
              locale === "th"
                ? "break-words leading-[1.45] [overflow-wrap:anywhere]"
                : "leading-[1.18] text-balance"
            }`}
          >
            {locale === "en" ? (
              <>
                A formula built around <em>your body, your goals,</em>
                <br className="hidden sm:block" />
                {" "}and the way you actually live.
              </>
            ) : (
              copy.heroHeadline
            )}
          </p>
          <p
            className={`mt-6 max-w-2xl text-base text-[var(--mn-ink-soft)] ${
              locale === "th" ? "leading-8" : "leading-7"
            }`}
          >
            {heroSub}
          </p>
          <div className="mt-12 flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-[var(--mn-paper)]/65 px-4 py-3 font-[family:var(--mn-font-mono)] text-[0.68rem] tracking-[0.04em] text-[var(--mn-ink-soft)] shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] backdrop-blur-sm sm:gap-3 sm:px-5">
            {heroMeta.map((item, index) => (
              <span className="inline-flex min-w-0 items-center gap-1.5" key={`${item}:${index}`}>
                {index > 0 ? (
                  <span
                    aria-hidden={true}
                    className="mr-1 hidden h-3 w-px bg-[var(--mn-line)] sm:inline-block"
                  />
                ) : null}
                <span className="min-w-0 truncate">{item}</span>
              </span>
            ))}
          </div>
          <a
            className="mn-mono-label mt-12 inline-flex flex-col items-center gap-3 text-[0.65rem] font-medium uppercase tracking-[0.24em] text-[var(--mn-ash)]"
            href="#formula"
          >
            {copy.begin}
            <span aria-hidden={true} className="h-9 w-px bg-[var(--mn-ash)]" />
          </a>
        </div>
      </section>

      <section className="border-y border-[var(--mn-line)] py-16">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div data-reveal>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              01 · {copy.personalizationEyebrow}
            </p>
            <h2
              className={`mt-4 font-serif text-4xl font-medium text-[var(--mn-ink)] ${
                locale === "th"
                  ? "leading-[1.45] break-words [overflow-wrap:anywhere]"
                  : "leading-tight text-balance"
              }`}
            >
              {locale === "en" ? (
                <>
                  Everything you told us, <em>folded into one plan</em>.
                </>
              ) : (
                breadcrumbsTitle
              )}
            </h2>
          </div>
          <p className="text-base leading-8 text-[var(--mn-ink-soft)]" data-reveal>
            {breadcrumbsBody}
          </p>
          <div className="lg:col-span-2" data-reveal>
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
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]" data-reveal>
            02 · {copy.distilledEyebrow}
          </p>
          <h2
            className={`mx-auto mt-6 max-w-3xl font-serif text-4xl font-medium text-[var(--mn-ink)] ${
              locale === "th"
                ? "leading-[1.45] break-words [overflow-wrap:anywhere]"
                : "leading-tight text-balance"
            }`}
            data-reveal
          >
            {locale === "en" ? (
              <>
                We evaluated{" "}
                <em>{localizedCountText(catalogueSupplementCount, locale)}</em>{" "}
                ingredients.
                <br />
                {" "}
                {localizedCountText(recommendedSupplementCount, locale, true)} earned a place in your formula.
              </>
            ) : (
              distillNarrative
            )}
          </h2>
          <div className="mt-12 grid gap-5" data-reveal>
            <RevealDistillationCard
              fromCount={catalogueSupplementCount}
              fromLabel={copy.catalogueSupplements}
              toCount={recommendedSupplementCount}
              toLabel={copy.supplementsRecommended}
            />
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-7 text-[var(--mn-ink-soft)]" data-reveal>
            {distillFoot}
          </p>
        </div>
      </section>

      {isPreview ? (
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
          <PreviewPaywallPanel labels={labels} unlockHref={unlockHref} />
        </div>
      ) : null}

      <RevealFormulaSection
        catalogueSupplementCount={catalogueSupplementCount}
        copy={copy}
        formattedDate={formattedDate}
        ingredients={visibleIngredients}
        locale={locale}
        productCoverageBySupplementId={productCoverageBySupplementId}
        result={result}
      />

      <RevealProductsSection
        copy={copy}
        locale={locale}
        onProductStackPreferenceChange={onProductStackPreferenceChange}
        onProductStackRefresh={onProductStackRefresh}
        planId={planId}
        productNeedCount={productNeedCount}
        productOptions={productOptions}
        products={products}
        result={result}
        selectedCoverage={selectedCoverage}
        selectedProductStackPreference={selectedProductStackPreference}
        supplementLabelById={supplementLabelById}
      />

      <RevealFoodSupportSection
        copy={copy}
        locale={locale}
        result={result}
        selectedNeedCoverage={
          selectedProductRecommendationOption?.productRecommendations.needCoverage ??
          result.productRecommendations?.needCoverage ??
          []
        }
        selectedProductStackPreference={
          selectedProductRecommendationOption?.id ?? selectedProductStackPreference
        }
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
  catalogueSupplementCount,
  copy,
  formattedDate,
  ingredients,
  locale,
  productCoverageBySupplementId,
  result
}: Readonly<{
  catalogueSupplementCount: number;
  copy: typeof revealCopy.en;
  formattedDate: string;
  ingredients: FormulationIngredient[];
  locale: Locale;
  productCoverageBySupplementId: ReadonlyMap<string, number>;
  result: FormulationResult;
}>) {
  const ingredientRowNumber = formulaIngredientRowNumbers(ingredients);
  const supplementSelectedText = localizedCountText(ingredients.length, locale, true);
  const formulaLead = revealSlotCopy(result, "formulaLead", locale, copy.formulaLead);
  const formulaTitle = formatTemplate(copy.formulaTitleTemplate, {
    supplementSelectedText
  });
  const nutrientNoun = ingredients.length === 1 ? "nutrient" : "nutrients";
  const formulaFocus =
    result.assessmentSummary.goals.length > 0
      ? result.assessmentSummary.goals
          .map((goal) => localizedContextChip(goal, locale))
          .join(revealJoiners[locale])
      : result.assessmentSummary.plan;
  const signedFor = result.firstName?.trim()
    ? locale === "en"
      ? `${copy.formulaSignedPrefix} for ${result.firstName.trim()}, ${formattedDate}.`
      : locale === "th"
        ? `${copy.formulaSignedPrefix}สำหรับ ${result.firstName.trim()}, ${formattedDate}`
        : locale === "zh-CN"
          ? `${copy.formulaSignedPrefix} ${result.firstName.trim()}，${formattedDate}`
          : `${copy.formulaSignedPrefix} ${result.firstName.trim()}, ${formattedDate}`
    : locale === "en"
      ? `${copy.formulaSignedPrefix}, ${formattedDate}.`
      : locale === "th"
        ? `${copy.formulaSignedPrefix}เมื่อ ${formattedDate}`
        : locale === "zh-CN"
          ? `${copy.formulaSignedPrefix} ${formattedDate}`
          : `${copy.formulaSignedPrefix} ${formattedDate}`;

  return (
    <section className="border-t border-[var(--mn-line)] py-20" id="formula">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-end" data-reveal>
          <div>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              03 · {copy.formulaEyebrow}
            </p>
            <h2
              className={`mt-4 font-serif text-5xl font-medium text-[var(--mn-ink)] ${
                locale === "th"
                  ? "leading-[1.4] break-words [overflow-wrap:anywhere]"
                : "leading-tight text-balance"
              }`}
            >
              {locale === "en" ? (
                <>
                  {supplementSelectedText} {nutrientNoun}. <em>Exactly enough.</em>
                </>
              ) : (
                formulaTitle
              )}
            </h2>
          </div>
          <p className="text-base leading-8 text-[var(--mn-ink-soft)]">
            {formulaLead}
          </p>
        </div>

        <div className="mt-10 rounded-lg bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] sm:p-8" data-reveal>
          <div className="grid gap-3 border-b border-[var(--mn-line)] pb-5 text-sm sm:grid-cols-3 sm:items-center">
            <p className="mn-mono-label text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--mn-ash)]">
              {copy.formulaMetaTier}
            </p>
            <p className="font-serif text-lg font-medium text-[var(--mn-teal-deep)] sm:text-center">
              {copy.formulaMetaFocus}: {formulaFocus}
            </p>
            <p className="mn-mono-label text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--mn-ash)] sm:text-right">
              {copy.formulaMetaNrv}
            </p>
          </div>

          <div
            className={`hidden grid-cols-[3rem_1.2fr_2fr_0.9fr_0.8fr] gap-5 border-b border-[var(--mn-line)] py-4 text-[0.65rem] font-semibold text-[var(--mn-ash)] lg:grid ${
              locale === "th"
                ? "tracking-normal"
                : "uppercase tracking-[0.18em]"
            }`}
          >
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
                const supplement = localizedSupplementName(
                  ingredient.supplement,
                  ingredient.id,
                  locale
                );
                const rationale = localizedIngredientRationale(ingredient, locale);
                const dailyDose = localizedDoseText(ingredient.dailyDose, locale);
                const coverage =
                  productCoverageBySupplementId.get(ingredient.id) ?? 0;
                const benefit = supplementBenefitTags(ingredient)[0];

                return (
                  <article
                    className="grid gap-3 border-b border-[var(--mn-line)] py-5 last:border-b-0 lg:grid-cols-[3rem_1.2fr_2fr_0.9fr_0.8fr] lg:gap-5"
                    data-reveal
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

          <div className="mt-6 flex flex-col gap-2 border-t border-[var(--mn-line)] pt-5 font-[family:var(--mn-font-mono)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--mn-ash)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              {locale === "en"
                ? `${catalogueSupplementCount} EVALUATED · ${ingredients.length} SELECTED · 0 PADDING`
                : `${catalogueSupplementCount} ${copy.catalogueSupplements} · ${ingredients.length} ${copy.formulaMetaSelected} · 0 ${copy.formulaMetaNoPadding}`}
            </div>
            <div className="normal-case tracking-normal text-[var(--mn-ink-soft)]">
              {signedFor}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevealProductsSection({
  copy,
  locale,
  onProductStackPreferenceChange,
  onProductStackRefresh,
  planId,
  productNeedCount,
  productOptions,
  products,
  result,
  selectedCoverage,
  selectedProductStackPreference,
  supplementLabelById
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  onProductStackPreferenceChange: (preference: ProductStackPreference) => void;
  onProductStackRefresh: () => Promise<boolean>;
  planId: string;
  productNeedCount: number;
  productOptions: ProductRecommendationOption[];
  products: RecommendedProduct[];
  result: FormulationResult;
  selectedCoverage: number;
  selectedProductStackPreference?: ProductStackPreference | null;
  supplementLabelById: ReadonlyMap<string, string>;
}>) {
  const labels = productRecommendationCopy[locale];
  const [pendingStackPreference, setPendingStackPreference] =
    useState<ProductStackPreference | null>(null);
  const supplementSelectedCount = result.supplementBreakdown.filter(
    (ingredient) => ingredient.safety?.visibility !== "hidden"
  ).length;
  const productSelectedText = localizedCountText(products.length, locale, true);
  const supplementSelectedText = localizedCountText(supplementSelectedCount, locale, true);
  const bottleNoun = products.length === 1 ? "bottle" : "bottles";
  const nutrientNoun = supplementSelectedCount === 1 ? "nutrient" : "nutrients";
  const coveredProductNeedCount = Math.min(
    Math.max(0, productNeedCount),
    Math.max(0, supplementSelectedCount)
  );
  const hasFullProductCoverage =
    supplementSelectedCount > 0 && coveredProductNeedCount >= supplementSelectedCount;
  const fallbackProductsTitle = formatTemplate(
    hasFullProductCoverage
      ? copy.productsAllTitleTemplate
      : copy.productsPartialTitleTemplate,
    {
      coveredText: localizedCountText(coveredProductNeedCount, locale, true),
      productSelectedText,
      supplementSelectedText,
      supplementSelectedTextLower: localizedCountText(supplementSelectedCount, locale)
    }
  );
  const productsTitle = fallbackProductsTitle;
  const productsLead = revealSlotCopy(result, "productsLead", locale, copy.productsLead);
  const coverageHeadline = hasFullProductCoverage
    ? formatTemplate(copy.coverageHeadlineTemplate, {
        supplementCount: supplementSelectedCount
      })
    : formatTemplate(copy.coveragePartialHeadlineTemplate, {
        coveredText: localizedCountText(coveredProductNeedCount, locale),
        supplementSelectedText: localizedCountText(supplementSelectedCount, locale)
      });
  const productOptionsById = new Map(
    productOptions.map((option) => [option.id, option])
  );
  const controlPreferences =
    productOptions.length > 0 || result.productRecommendations
      ? productStackPreferenceOrder
      : [];

  async function requestProductStackPreference(preference: ProductStackPreference) {
    const existingOption = productOptionsById.get(preference);

    if (existingOption) {
      onProductStackPreferenceChange(preference);
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
        window.setTimeout(() => {
          void onProductStackRefresh();
        }, 1000);
        window.setTimeout(() => {
          void onProductStackRefresh();
        }, 3000);
        window.setTimeout(() => {
          void onProductStackRefresh();
        }, 6000);
      }
    } finally {
      window.setTimeout(() => {
        setPendingStackPreference((current) =>
          current === preference ? null : current
        );
      }, 1200);
    }
  }

  return (
    <section className="border-t border-[var(--mn-line)] bg-[var(--mn-cream-deep)] py-20">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="mx-auto max-w-3xl text-center" data-reveal>
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
            04 · {copy.productsEyebrow}
          </p>
          <h2
            className={`mt-4 font-serif text-5xl font-medium text-[var(--mn-ink)] ${
              locale === "th"
                ? "leading-[1.4] break-words [overflow-wrap:anywhere]"
                : "leading-tight text-balance"
            }`}
          >
            {locale === "en" ? (
              <>
                {productSelectedText} {bottleNoun}.{" "}
                <em>
                  {hasFullProductCoverage
                    ? `All ${localizedCountText(supplementSelectedCount, locale)} ${nutrientNoun}.`
                    : `${localizedCountText(coveredProductNeedCount, locale, true)} of ${localizedCountText(
                        supplementSelectedCount,
                        locale
                      )} ${nutrientNoun}.`}
                </em>
              </>
            ) : (
              productsTitle
            )}
          </h2>
          <p className="mt-4 text-base leading-8 text-[var(--mn-ink-soft)]">
            {productsLead}
          </p>
        </div>

        {controlPreferences.length > 1 ? (
          <div className="mt-8 flex justify-center" data-reveal>
            <div className="inline-flex flex-wrap justify-center gap-2 rounded-full bg-[var(--mn-paper)] p-1 ring-1 ring-[var(--mn-line)]">
              {controlPreferences.map((preference) => {
                const available = productOptionsById.has(preference);
                const pending = pendingStackPreference === preference;
                const selected = preference === selectedProductStackPreference;
                const className = `rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition disabled:cursor-wait disabled:opacity-70 ${
                  selected
                    ? "bg-[var(--mn-teal)] text-white"
                    : available
                      ? "text-[var(--mn-ink-soft)] hover:bg-[var(--mn-mint)]"
                      : "text-[var(--mn-ash)] hover:bg-[var(--mn-mint)]"
                }`;
                const label = pending
                  ? labels.preferenceUpdating
                  : preference === "compact"
                    ? labels.preferenceCompact
                    : labels.preferenceBalanced;
                const title = pending
                  ? labels.preferenceUpdating
                  : preference === "compact"
                    ? labels.preferenceCompactHint
                    : labels.preferenceBalancedHint;

                if (available) {
                  return (
                    <button
                      aria-pressed={selected}
                      className={className}
                      key={preference}
                      onClick={() => {
                        onProductStackPreferenceChange(preference);
                        replaceRevealStackUrl(locale, planId, preference);
                      }}
                      title={title}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                }

                return (
                  <button
                    aria-pressed={selected}
                    className={className}
                    disabled={pending}
                    key={preference}
                    onClick={() => {
                      void requestProductStackPreference(preference);
                    }}
                    title={title}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
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
          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4" data-reveal>
            {products.map((product, index) => (
              <article
                className="group flex flex-col overflow-hidden rounded-[1.25rem] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)] transition hover:-translate-y-1 hover:ring-[var(--mn-teal)] motion-reduce:transition-none"
                key={`${product.recommendationRunId ?? "product"}:${product.id}`}
              >
                <div className="relative flex h-60 items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#fff,var(--mn-mint))]">
                  <span className="absolute left-4 top-4 z-10 font-serif text-3xl italic text-[var(--mn-gold)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="absolute right-4 top-4 z-10 rounded-full bg-white/85 px-3 py-1 text-[0.65rem] font-bold text-[var(--mn-teal-deep)] ring-1 ring-[var(--mn-line)]">
                    {copy.productVerified}
                  </span>
                  <div
                    aria-hidden={true}
                    className="absolute bottom-5 h-5 w-28 rounded-full bg-[color-mix(in_srgb,var(--mn-ink)_14%,transparent)] blur-md transition group-hover:scale-110 motion-reduce:transition-none"
                  />
                  {product.imageUrl ? (
                    <img
                      alt=""
                      className="relative z-[1] h-full w-full object-contain p-8 transition duration-500 group-hover:-translate-y-1 group-hover:scale-[1.03] motion-reduce:transition-none"
                      src={product.imageUrl}
                    />
                  ) : (
                    <div className="relative z-[1] grid size-32 place-items-center rounded-[1.5rem] bg-white font-serif text-4xl italic text-[var(--mn-teal-deep)] shadow-sm ring-1 ring-[var(--mn-line)]">
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

        <div className="mt-8 rounded-xl bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]" data-reveal>
          <div className="grid gap-5 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div>
              <h3 className="font-serif text-3xl font-medium leading-tight text-[var(--mn-ink)]">
                {coverageHeadline}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)]">
                {copy.coverageSub}
              </p>
            </div>
            <div>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--mn-line)]">
                <div
                  className="h-full rounded-full bg-[var(--mn-teal)] transition-[width] duration-1000 motion-reduce:transition-none"
                  style={{ width: `${Math.min(100, Math.max(0, selectedCoverage))}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
              <CountUpNumber active={true} duration={900} value={products.length} />
            </p>
            <p className="text-sm text-[var(--mn-ash)]">{copy.selectedProducts}</p>
          </div>
          <div>
            <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
              <CountUpNumber active={true} duration={1000} value={productNeedCount} />
              /{Math.max(productNeedCount, supplementSelectedCount)}
            </p>
            <p className="text-sm text-[var(--mn-ash)]">{copy.prioritiesCovered}</p>
          </div>
          <div>
            <p className="font-serif text-4xl font-medium text-[var(--mn-teal-deep)]">
              <CountUpNumber active={true} duration={1100} value={selectedCoverage} />%
            </p>
            <p className="text-sm text-[var(--mn-ash)]">{copy.compactCoverageLabel}</p>
          </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevealFoodSupportSection({
  copy,
  locale,
  result,
  selectedNeedCoverage,
  selectedProductStackPreference
}: Readonly<{
  copy: typeof revealCopy.en;
  locale: Locale;
  result: FormulationResult;
  selectedNeedCoverage: readonly ProductNeedCoverage[];
  selectedProductStackPreference?: ProductStackPreference | null;
}>) {
  const { fallbackItems, variant } = selectedFoodSupport(
    result,
    selectedNeedCoverage,
    selectedProductStackPreference
  );
  const visibleIngredients = visibleFormulaIngredients(result.supplementBreakdown);
  const items = (variant?.items ?? fallbackItems).filter((item) =>
    foodSupportFormulaGapsForItem(
      item,
      selectedNeedCoverage,
      visibleIngredients,
      locale
    ).length > 0
  );
  const fallbackGaps = foodSupportGaps(selectedNeedCoverage);
  const fallbackSupportableGaps = foodSupportableGaps(fallbackGaps);
  const fallbackGapText = joinFoodSupportNeeds(
    fallbackSupportableGaps.length > 0 ? fallbackSupportableGaps : fallbackGaps,
    locale
  );
  const headline = variant
    ? safeFoodSupportCopy(
        variant.headline,
        locale,
        fallbackGaps.length > 0
          ? formatTemplate(copy.foodSupportGapHeadlineTemplate, {
              gaps: fallbackGapText
            })
          : copy.foodSupportDefaultHeadline
      )
    : fallbackGaps.length > 0
      ? formatTemplate(copy.foodSupportGapHeadlineTemplate, {
          gaps: fallbackGapText
        })
      : copy.foodSupportDefaultHeadline;
  const body = variant
    ? safeFoodSupportCopy(
        variant.body,
        locale,
        fallbackGaps.length > 0
          ? formatTemplate(copy.foodSupportGapBodyTemplate, {
              gaps: fallbackGapText
            })
          : copy.foodSupportDefaultBody
      )
    : fallbackGaps.length > 0
      ? formatTemplate(copy.foodSupportGapBodyTemplate, {
          gaps: fallbackGapText
        })
      : copy.foodSupportDefaultBody;

  if (items.length < 1) {
    return null;
  }

  return (
    <section className="border-t border-[var(--mn-line)] bg-[var(--mn-cream)] py-20">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div data-reveal>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.2em] text-[var(--mn-teal-deep)]">
              05 · {copy.foodSupportEyebrow}
            </p>
            <h2
              className={`mt-4 font-serif text-4xl font-medium text-[var(--mn-ink)] sm:text-5xl ${
                locale === "th"
                  ? "leading-[1.38] break-words [overflow-wrap:anywhere]"
                  : "leading-tight text-balance"
              }`}
            >
              {headline || copy.foodSupportTitle}
            </h2>
          </div>
          <p className="text-base leading-8 text-[var(--mn-ink-soft)]" data-reveal>
            {body}
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const seed = managedSeedForFoodSupportItem(item);
            const name =
              getLocalizedText(item.food, locale) ||
              seed?.name[locale] ||
              seed?.name.en ||
              "";
            const imageAlt =
              getLocalizedText(item.imageAlt, locale) ||
              seed?.imageAlt[locale] ||
              seed?.imageAlt.en ||
              name;
            const category =
              getLocalizedText(item.category, locale) ||
              seed?.category[locale] ||
              seed?.category.en ||
              "";
            const serving =
              getLocalizedText(item.serving, locale) ||
              (seed ? managedFoodServing[seed.normalizedName]?.[locale] : "") ||
              "";
            const frequency =
              getLocalizedText(item.frequency, locale) ||
              (seed ? managedFoodFrequency[seed.normalizedName]?.[locale] : "") ||
              "";
            const formulaGaps = foodSupportFormulaGapsForItem(
              item,
              selectedNeedCoverage,
              visibleIngredients,
              locale
            ).slice(0, 3);
            const itemRationale = safeFoodSupportCopy(
              item.rationale,
              locale,
              locale === "th"
                ? `${name} ช่วยเสริมจากอาหารในส่วนของ${joinFoodSupportFormulaGapLabels(
                    formulaGaps,
                    "th"
                  )} โดยไม่เปลี่ยนการคำนวณความครอบคลุมของผลิตภัณฑ์`
                : locale === "zh-CN"
                  ? `${name} 可通过食物层面支持 ${joinFoodSupportFormulaGapLabels(
                      formulaGaps,
                      "zh-CN"
                    )}，同时产品覆盖计算保持独立。`
                : `${name} ${name.endsWith("s") ? "give" : "gives"} food-level support around ${joinFoodSupportFormulaGapLabels(
                    formulaGaps,
                    "en"
                  )} while product coverage stays separate.`
            );

            return (
              <article
                className="overflow-hidden rounded-[1.25rem] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]"
                data-reveal
                key={`${selectedProductStackPreference ?? "food"}:${item.foodId}:${item.position}`}
              >
                <div className="relative h-52 overflow-hidden bg-[var(--mn-mint)]">
                  {item.imagePath ? (
                    <Image
                      alt={imageAlt}
                      className="object-cover"
                      fill={true}
                      loading="lazy"
                      src={item.imagePath}
                    />
                  ) : (
                    <div className="grid h-full place-items-center bg-[var(--mn-mint)] font-serif text-5xl italic text-[var(--mn-teal-deep)]">
                      {name.slice(0, 1)}
                    </div>
                  )}
                  <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--mn-teal-deep)] ring-1 ring-[var(--mn-line)]">
                    {String(item.position).padStart(2, "0")}
                  </span>
                </div>
                <div className="p-5">
                  <p className="mn-mono-label text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--mn-ash)]">
                    {category}
                  </p>
                  <h3
                    className={`mt-2 font-serif text-2xl font-medium text-[var(--mn-ink)] ${
                      locale === "th" ? "leading-9" : "leading-tight"
                    }`}
                  >
                    {name}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                    {itemRationale}
                  </p>

                  {formulaGaps.length > 0 ? (
                    <div className="mt-4 rounded-lg bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
                      <p
                        className={`text-xs font-bold text-[var(--mn-ash)] ${
                          locale === "th"
                            ? ""
                            : "uppercase tracking-[0.12em]"
                        }`}
                      >
                        {copy.foodSupportGapLabel}
                      </p>
                      <div className="mt-3 space-y-2">
                        {formulaGaps.map((gap) => (
                          <div
                            className="rounded-md bg-[var(--mn-paper)] p-3 ring-1 ring-[var(--mn-line)]"
                            key={gap.id}
                          >
                            <div className="min-w-0">
                              <p className="text-[0.7rem] font-semibold text-[var(--mn-ash)]">
                                {copy.foodSupportFormulaGapLabel}
                                {gap.rowNumber
                                  ? ` ${String(gap.rowNumber).padStart(2, "0")}`
                                  : ""}
                              </p>
                              <p
                                className={`mt-1 font-serif text-lg font-medium text-[var(--mn-ink)] ${
                                  locale === "th" ? "leading-7" : "leading-tight"
                                }`}
                              >
                                {gap.label}
                              </p>
                              {gap.dailyDose ? (
                                <p className="mt-1 text-xs font-semibold text-[var(--mn-ink-soft)]">
                                  {gap.dailyDose}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 rounded-lg bg-[var(--mn-cream)] p-4 text-sm ring-1 ring-[var(--mn-line)] sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                        {copy.foodSupportServing}
                      </p>
                      <p className="mt-1 font-semibold text-[var(--mn-ink)]">
                        {serving}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--mn-ash)]">
                        {copy.foodSupportFrequency}
                      </p>
                      <p className="mt-1 font-semibold text-[var(--mn-ink)]">
                        {frequency}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
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
      body: getLocalizedText(caution.body, locale) || copy.wellnessOnly,
      title: caution.title ? getLocalizedText(caution.title, locale) : ""
    })),
    ...result.supplementBreakdown.flatMap((ingredient) =>
      (ingredient.cautions ?? []).map((caution) => ({
        body: getLocalizedText(caution.body, locale) || copy.wellnessOnly,
        title:
          caution.title
            ? getLocalizedText(caution.title, locale)
            : localizedSupplementName(ingredient.supplement, ingredient.id, locale)
      }))
    )
  ].filter((caution) => caution.body);
  const hasStatinContext = result.assessmentSummary.constraints.some((constraint) =>
    /statin|สแตติน/i.test(constraint)
  );
  const safetyHeadline = hasStatinContext
    ? copy.statinCautionsTitle
    : copy.cautionsTitle;
  const safetyBody = revealSlotCopy(
    result,
    "safetyBody",
    locale,
    copy.wellnessOnly
  );
  const closingTitle = copy.closingTitle;
  const closingBody = revealSlotCopy(
    result,
    "closingBody",
    locale,
    copy.closingBody
  );

  return (
    <section className="relative overflow-hidden border-t border-[var(--mn-line)] bg-[var(--mn-teal-deep)] py-24 text-[#f5f0e2]">
      <div
        aria-hidden={true}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(184,149,74,0.12)_0%,transparent_48%),radial-gradient(circle_at_80%_80%,rgba(220,232,224,0.07)_0%,transparent_56%)]"
      />
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 sm:px-8">
        <div className="relative rounded-[10px] bg-white/[0.06] p-6 ring-1 ring-[#f5f0e2]/15 sm:p-8" data-reveal>
          <div className="flex gap-4">
            <span className="mt-1 grid size-11 shrink-0 place-items-center rounded-full bg-[var(--mn-gold-soft)] text-[var(--mn-teal-deep)]">
              <InformationCircleIcon aria-hidden={true} className="size-6" />
            </span>
            <div>
              <h2 className="font-serif text-2xl font-normal italic text-[var(--mn-gold-soft)]">
                {safetyHeadline}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#f5f0e2]/85">
                {safetyBody}
              </p>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[#f5f0e2]/80">
                {cautions.length > 0 ? (
                  cautions.map((caution, index) => (
                    <div key={`${caution.title}:${index}`}>
                      {caution.title ? (
                        <p className="font-semibold text-[#f5f0e2]">
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

        <div className="relative text-center" data-reveal>
          <p className="font-serif text-5xl font-light italic leading-none text-[var(--mn-gold-soft)] sm:text-7xl">
            मत्तञ्ञुतā
          </p>
          <p className="mn-mono-label mt-4 text-xs uppercase tracking-[0.24em] text-[#f5f0e2]/55">
            {copy.etymologyLine}
          </p>
          <h2
            className={`mx-auto mt-8 max-w-3xl font-serif text-4xl font-normal text-[#f5f0e2] ${
              locale === "th"
                ? "leading-[1.45] break-words [overflow-wrap:anywhere]"
                : "leading-tight text-balance"
              }`}
          >
            {locale === "en" ? (
              <>
                <em>{closingTitle}</em> — not from more, but from{" "}
                <em>exactly enough.</em>
              </>
            ) : (
              closingTitle
            )}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#f5f0e2]/75">
            {closingBody}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--mn-gold-soft)] px-7 py-4 text-sm font-semibold text-[var(--mn-teal-deep)] transition hover:bg-[#f2ddaa] motion-reduce:transition-none"
              onClick={() => window.print()}
              type="button"
            >
              <ArrowDownTrayIcon aria-hidden={true} className="size-4" />
              {copy.print}
            </button>
            <a
              className="inline-flex items-center justify-center rounded-full border border-[#f5f0e2]/30 px-7 py-4 text-sm font-semibold text-[#f5f0e2] transition hover:border-[var(--mn-gold-soft)] hover:text-[var(--mn-gold-soft)] motion-reduce:transition-none"
              href={planRevealHref(locale, planId)}
            >
              {copy.save}
            </a>
            <a
              className="inline-flex items-center justify-center rounded-full border border-[#f5f0e2]/30 px-7 py-4 text-sm font-semibold text-[#f5f0e2] transition hover:border-[var(--mn-gold-soft)] hover:text-[var(--mn-gold-soft)] motion-reduce:transition-none"
              href={`/${locale}/nutrition/quiz`}
            >
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
        {localizedReportText(report.title, locale, localizedReportFallbackTitle(locale))}
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {localizedReportText(report.summary, locale, localizedReportFallbackBody(locale))}
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
                    {localizedReportText(item.title, locale, section.title)}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {localizedReportText(item.body, locale, localizedReportFallbackBody(locale))}
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
              <li key={index}>
                {localizedReportText(note, locale, labels.safetyNotes[index % labels.safetyNotes.length])}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const baseProductRecommendationCopy = {
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
} satisfies Record<BaseLocale, Record<string, string>>;

const productRecommendationCopy = {
  ...baseProductRecommendationCopy,
  "zh-CN": {
    completeEmptyBody:
      "产品匹配已完成，但当前目录中还没有解析完成、安全、可购买且适合此计划的产品。",
    completeEmptyTitle: "产品匹配已完成",
    emptyBody:
      "我们正在将你的最终计划与泰国目录中的可用产品匹配。营养计划已经准备好，产品匹配会单独更新。",
    emptyTitle: "正在匹配产品",
    failedBody:
      "你的营养计划已经准备好，但产品匹配需要先处理后才能显示产品选项。",
    failedTitle: "产品匹配需要审核",
    matched: "已匹配",
    needsCovered: "产品覆盖的需求",
    needsReviewed: "已审核的客户需求",
    needs: "占",
    ofYourNeeds: "所选组合",
    preferenceCompact: "精简",
    preferenceCompactHint: "最多 3 个产品",
    preferenceBalanced: "均衡",
    preferenceBalancedHint: "最多 6 个产品，平衡覆盖度、简单度、剂量和成本",
    preferenceUpdating: "正在切换产品组合...",
    recommendedDose: "建议剂量",
    servingInstruction: "每天服用该产品 {count} 份。",
    stack: "组合覆盖度",
    title: "推荐产品",
    unmatchedTitle: "尚未覆盖的补充剂需求",
    view: "查看产品"
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
