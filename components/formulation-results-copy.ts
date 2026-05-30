import type { Locale } from "@/lib/i18n";

type BaseLocale = Exclude<Locale, "zh-CN">;

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
