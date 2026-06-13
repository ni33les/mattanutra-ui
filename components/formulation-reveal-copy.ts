import type {
  FormulationResult,
  LocalizedText,
  RecommendedProduct,
  RevealPageCopySlot
} from "@/lib/formulation-types";
import { revealPageCopyVersion } from "@/lib/formulation-types";
import { foodTagLabel } from "@/lib/food-tags";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";

type BaseLocale = Exclude<Locale, "zh-CN">;

export function textMatchesLocale(text: string, locale: Locale) {
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

export function getLocalizedText(value: LocalizedText, locale: Locale) {
  const text = resolveLocalizedText(value, locale).trim();

  return textMatchesLocale(text, locale) ? text : "";
}

export function localizeKnownInlineTerms(text: string, locale: Locale) {
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
    formulaMetaProductFitPending: "PRODUCT FIT · PROCESSING",
    formulaMetaFocus: "Focus",
    formulaSignedPrefix: "Composed",
    foodSupportDefaultBody:
      "Foods do not change the product coverage score. They only appear when the product stack leaves a supplement gap that a managed food can credibly support.",
    foodSupportDefaultHeadline: "Food support, after the products.",
    foodSupportEyebrow: "Food support",
    foodSupportFrequency: "Frequency",
    foodSupportGapLabel: "Supports",
    foodSupportGapBodyTemplate:
      "These foods come from the managed catalogue and are selected around {gaps}. They support the plan in everyday meals without changing product coverage numbers.",
    foodSupportGapHeadlineTemplate: "Food support for {gaps}.",
    foodSupportNoGapsBody:
      "The selected stack has no remaining supportable formula gaps for the managed food catalogue. Keep meals simple and use the products for the measured coverage.",
    foodSupportNoGapsHeadline: "No extra food support needed for this stack.",
    foodSupportPendingBody:
      "Food support updates after product matching finishes because compact and balanced stacks can leave different formula gaps.",
    foodSupportPendingHeadline: "Checking food support for this stack.",
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
      "{supplementSelectedText} nutrients, chosen with intention, sourced and delivered through our verified Chiang Mai pharmacy partner — one payment, one parcel.",
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
    productsPending:
      "Product matching is still finishing. This page will update automatically as soon as the matched stack is ready.",
    productsPendingBadge: "Processing",
    productsPendingCardBody:
      "Checking dose fit, safety limits, serving burden, and marketplace links.",
    productsPendingCardTitle: "Matching against the catalogue",
    productsPendingTitle: "Matching your products now.",
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
    formulaMetaProductFitPending: "ความพอดีของสินค้า · กำลังประมวลผล",
    formulaMetaFocus: "เป้าหมาย",
    formulaSignedPrefix: "จัดทำ",
    foodSupportDefaultBody:
      "อาหารไม่เปลี่ยนคะแนนความครอบคลุมของผลิตภัณฑ์ และจะแสดงเฉพาะเมื่อชุดผลิตภัณฑ์ยังเหลือช่องว่างของสารอาหารที่อาหารในแคตตาล็อกช่วยเสริมได้อย่างน่าเชื่อถือ",
    foodSupportDefaultHeadline: "อาหารสนับสนุนหลังจากชุดผลิตภัณฑ์",
    foodSupportEyebrow: "อาหารสนับสนุน",
    foodSupportFrequency: "ความถี่",
    foodSupportGapLabel: "สนับสนุน",
    foodSupportGapBodyTemplate:
      "อาหารเหล่านี้มาจากแคตตาล็อกที่จัดการไว้ และเลือกโดยดูจาก {gaps} เพื่อช่วยให้แผนทำได้จริงในมื้ออาหาร โดยไม่เปลี่ยนตัวเลขความครอบคลุมของผลิตภัณฑ์",
    foodSupportGapHeadlineTemplate: "อาหารสนับสนุนสำหรับ {gaps}",
    foodSupportNoGapsBody:
      "ชุดที่เลือกตอนนี้ไม่มีช่องว่างในสูตรที่แคตตาล็อกอาหารช่วยเสริมได้อย่างเหมาะสม ให้มื้ออาหารเรียบง่าย และใช้ผลิตภัณฑ์สำหรับความครอบคลุมที่คำนวณไว้",
    foodSupportNoGapsHeadline: "ชุดนี้ยังไม่ต้องมีอาหารเสริมช่องว่างเพิ่มเติม",
    foodSupportPendingBody:
      "คำแนะนำอาหารจะอัปเดตหลังจับคู่ผลิตภัณฑ์เสร็จ เพราะชุดแบบ compact และ balanced อาจเหลือช่องว่างในสูตรต่างกัน",
    foodSupportPendingHeadline: "กำลังตรวจอาหารที่เหมาะกับชุดนี้",
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
      "สารอาหาร {supplementSelectedText} รายการ ถูกเลือกอย่างตั้งใจ จัดหาและส่งผ่านพาร์ทเนอร์ร้านขายยาที่ตรวจสอบแล้วในเชียงใหม่ ชำระครั้งเดียว รับหนึ่งพัสดุ",
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
    productsPending:
      "การจับคู่ผลิตภัณฑ์ยังดำเนินอยู่ หน้านี้จะอัปเดตอัตโนมัติทันทีที่ชุดผลิตภัณฑ์พร้อม",
    productsPendingBadge: "กำลังประมวลผล",
    productsPendingCardBody:
      "กำลังตรวจปริมาณ ความปลอดภัย จำนวนเสิร์ฟ และลิงก์ซื้อสินค้า",
    productsPendingCardTitle: "กำลังจับคู่กับแคตตาล็อก",
    productsPendingTitle: "กำลังจับคู่ผลิตภัณฑ์ของคุณ",
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

export const revealCopy = {
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
    "formulaMetaProductFitPending": "产品匹配度 · 处理中",
    "formulaMetaFocus": "专注",
    "formulaSignedPrefix": "配制于",
    "foodSupportDefaultBody": "食物不会改变产品覆盖评分。只有当产品配方留下补充剂缺口，且可通过管理食物合理支持时，它们才会出现。",
    "foodSupportDefaultHeadline": "产品之后，食物支持。",
    "foodSupportEyebrow": "食物支持",
    "foodSupportFrequency": "频率",
    "foodSupportGapLabel": "支持",
    "foodSupportGapBodyTemplate": "这些食物来自管理目录，围绕 {gaps} 精选。它们在日常饮食中支持计划，而不改变产品覆盖数字。",
    "foodSupportGapHeadlineTemplate": "针对 {gaps} 的食物支持。",
    "foodSupportNoGapsBody": "所选组合目前没有可由管理食物目录合理支持的剩余配方缺口。日常饮食可保持简单，由产品负责已计算的覆盖。",
    "foodSupportNoGapsHeadline": "此组合无需额外食物支持。",
    "foodSupportPendingBody": "食物支持会在产品匹配完成后更新，因为精简和均衡组合可能留下不同的配方缺口。",
    "foodSupportPendingHeadline": "正在检查此组合的食物支持。",
    "foodSupportServing": "份量",
    "foodSupportFormulaGapLabel": "配方缺口",
    "foodSupportTitle": "为缺口选择的食物。",
    "heroEyebrow": "您的 Right Amount 已送达",
    "heroFor": "针对",
    "heroTitle": "您的配方已送达",
    "heroHeadline": "根据您的身体、目标以及实际生活方式打造的配方。",
    "heroMetaGenerated": "生成于",
    "heroMetaPlan": "计划 ID",
    "heroSub": "{supplementSelectedText} 种营养素，精心挑选，并通过我们已验证的清迈药房合作伙伴采购和配送。一次付款，一个包裹。",
    "personalizationBody": "您的配方始于您是谁。身体、位置、对您真正重要的目标，以及我们毫不妥协地尊重的限制。",
    "personalizationEyebrow": "基于您的评估打造",
    "personalizationTitle": "将您告知的一切融入一个计划。",
    "productsBody": "产品显示为来自已批准目录的最接近可用配方。目标是减少瓶数、清晰覆盖且无不必要的重叠。",
    "productsLead": "我们在泰国市场搜索了尽可能接近您配方的产品：经过验证的剂量、足够干净的标签，以及可用的直接市场链接。",
    "productsEmpty": "配方已就绪，但产品目录尚未包含针对这些需求的已批准配方。",
    "productsPending": "产品匹配仍在完成中。匹配组合准备好后，本页会自动更新。",
    "productsPendingBadge": "处理中",
    "productsPendingCardBody": "正在检查剂量匹配、安全上限、服用负担和购买链接。",
    "productsPendingCardTitle": "正在与目录匹配",
    "productsPendingTitle": "正在匹配您的产品。",
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

export const revealProductPendingCards = {
  en: [
    {
      body: "Reading the formula gaps the product stack needs to cover.",
      title: "Reading your formula",
    },
    {
      body: "Filtering for approved products, labels, images, and marketplace links.",
      title: "Checking approved products",
    },
    {
      body: "Comparing dose fit, safety ceilings, overlap, and serving burden.",
      title: "Scoring the stack",
    },
  ],
  th: [
    {
      body: "กำลังอ่านช่องว่างในสูตรที่ชุดผลิตภัณฑ์ต้องครอบคลุม",
      title: "อ่านสูตรของคุณ",
    },
    {
      body: "กรองผลิตภัณฑ์ที่อนุมัติแล้ว ฉลาก รูปภาพ และลิงก์ซื้อ",
      title: "ตรวจผลิตภัณฑ์ที่อนุมัติ",
    },
    {
      body: "เทียบปริมาณ ความปลอดภัย ความซ้ำซ้อน และจำนวนเสิร์ฟ",
      title: "ให้คะแนนชุดผลิตภัณฑ์",
    },
  ],
  "zh-CN": [
    {
      body: "读取产品组合需要覆盖的配方缺口。",
      title: "读取您的配方",
    },
    {
      body: "筛选已批准产品、标签、图片和购买链接。",
      title: "检查已批准产品",
    },
    {
      body: "比较剂量匹配、安全上限、重叠和服用负担。",
      title: "评分产品组合",
    },
  ],
} satisfies Record<Locale, Array<{ body: string; title: string }>>;

export const revealFoodSupportPendingCards = {
  en: [
    {
      body: "Reading the exact gaps left by the selected product stack.",
      title: "Waiting for the stack",
    },
    {
      body: "Matching only managed foods that credibly support those gaps.",
      title: "Checking food fit",
    },
    {
      body: "Keeping food support separate from the measured product coverage.",
      title: "Keeping scores clean",
    },
  ],
  th: [
    {
      body: "อ่านช่องว่างจริงที่ชุดผลิตภัณฑ์ที่เลือกยังเหลือไว้",
      title: "รอชุดผลิตภัณฑ์",
    },
    {
      body: "จับคู่เฉพาะอาหารในแคตตาล็อกที่ช่วยเสริมช่องว่างนั้นได้อย่างสมเหตุผล",
      title: "ตรวจความเหมาะของอาหาร",
    },
    {
      body: "แยกอาหารสนับสนุนออกจากคะแนนความครอบคลุมของผลิตภัณฑ์",
      title: "แยกคะแนนให้ชัด",
    },
  ],
  "zh-CN": [
    {
      body: "读取所选产品组合留下的确切缺口。",
      title: "等待产品组合",
    },
    {
      body: "只匹配能够合理支持这些缺口的管理食物。",
      title: "检查食物匹配",
    },
    {
      body: "将食物支持与产品覆盖评分保持分离。",
      title: "保持评分清晰",
    },
  ],
} satisfies Record<Locale, Array<{ body: string; title: string }>>;

export const revealFinalCopy = {
  en: {
    addBack: "Add back",
    alternatePharmacy: "Alternative",
    assessmentCautions: "Cautions",
    assessmentGoals: "Goals",
    assessmentProfile: "Profile",
    assessmentSymptoms: "Signals",
    basketEmpty: "Select at least one product to continue",
    basketSelected: "Basket items",
    bestValue: "Best value",
    brandFormula: "Formula",
    brandHomeLabel: "MattaNutra home",
    brandTagline: "Know the right amount",
    checkout: "Checkout basket",
    compactInfo:
      "Compact reduces bottle count where the catalogue can still support your Right Amount.",
    deliveryNote: "One payment, one parcel, pharmacy confirmed.",
    fastest: "Fastest",
    foodEmptyBody:
      "The selected stack covers the formula gaps we can currently support with products. Keep meals steady and use Panya if you want a food-first reinforcement guide.",
    foodEmptyTitle:
      "Your stack covers the formula. Food remains optional reinforcement.",
    foodCoverageTitle: "Coverage built across both",
    foodNote:
      "Coverage is built across both: products handle measured formula coverage, foods reinforce the gaps without changing the basket score.",
    formulaHint: "Tap any nutrient to see the reasoning",
    formulaMatch: "Formula match",
    formulaMatchTooltip:
      "How closely the selected products meet the doses in your formula, averaged across covered nutrients.",
    khunAlt: "Khun Dream, Licensed Pharmacist at Delight Pharmacy, Chiang Mai",
    khunCredentialOne: "Thai FDA registered",
    khunCredentialThree: "Chiang Mai based",
    khunCredentialTwo: "Every batch verified",
    khunEyebrow: "Pharmacist verification",
    khunName: "Khun Dream",
    khunQuote:
      "Every MattaNutra order passes my desk. I check the batch, the expiry, and the formula match before it ships. Your body deserves that.",
    khunRole: "Licensed Pharmacist · Delight Pharmacy, Chiang Mai",
    khunTitle: "Checked by Khun Dream before it leaves the pharmacy.",
    lineGenerated: "Generated",
    linePlan: "Plan",
    nutrientDecision: "Decision",
    nutrientSafety: "Safety",
    nutrientWhy: "Why this, for you",
    none: "None",
    panyaButtonLead:
      "Scan the QR or open LINE. The connect message is prefilled; tap send in LINE and Panya will recognise this plan.",
    panyaCopied: "Copied",
    panyaCopyCode: "Copy code",
    panyaCreateCode: "Create new code",
    panyaError: "Could not create a LINE code at this time.",
    panyaExpires: "Code expires soon",
    panyaLivingBody:
      "Your plan is not meant to sit still. Use LINE to keep the conversation going as sleep, stress, travel, food, or symptoms change.",
    panyaLivingHeading: "Ongoing nutrition support, connected to this plan.",
    panyaLoading: "Creating code...",
    panyaOpenLine: "Open LINE",
    panyaPlanBody:
      "Use LINE to ask about your formula, why each nutrient was selected, and how to move from this plan into your daily routine.",
    panyaPlanHeading: "Talk through your nutrition plan with Panya.",
    panyaQrAlt: "MattaNutra LINE connect QR code",
    panyaQrPlaceholder: "Preparing your LINE QR...",
    panyaSection: "Panya support",
    pharmacyBody:
      "All selected products are checked against your formula, stock data, serving burden, and the selected retailer before checkout.",
    pharmacyTitle: "Sourced through the best available pharmacy match.",
    productRemoved: "Removed",
    remove: "Remove",
    selectedPharmacy: "Selected pharmacy",
    shelvesTrust:
      "Verified dosing, clean enough labels, direct marketplace or pharmacy routing, and no unnecessary overlap.",
    subtotal: "Subtotal"
  },
  th: {
    addBack: "เพิ่มกลับ",
    alternatePharmacy: "ตัวเลือกอื่น",
    assessmentCautions: "ข้อควรระวัง",
    assessmentGoals: "เป้าหมาย",
    assessmentProfile: "โปรไฟล์",
    assessmentSymptoms: "สัญญาณ",
    basketEmpty: "เลือกสินค้าอย่างน้อยหนึ่งรายการเพื่อดำเนินการต่อ",
    basketSelected: "สินค้าในตะกร้า",
    bestValue: "คุ้มค่าที่สุด",
    brandFormula: "สูตร",
    brandHomeLabel: "หน้าแรก MattaNutra",
    brandTagline: "รู้ปริมาณที่พอดี",
    checkout: "ชำระเงิน",
    compactInfo:
      "Compact ลดจำนวนขวดเมื่อแคตตาล็อกยังช่วยรองรับ Right Amount ของคุณได้",
    deliveryNote: "ชำระครั้งเดียว จัดส่งหนึ่งพัสดุ ยืนยันโดยร้านขายยา",
    fastest: "เร็วที่สุด",
    foodEmptyBody:
      "ชุดที่เลือกครอบคลุมช่องว่างของสูตรที่ผลิตภัณฑ์รองรับได้ในตอนนี้แล้ว ให้มื้ออาหารสม่ำเสมอ และคุยกับ Panya หากต้องการคู่มืออาหารเสริมเพิ่มเติม",
    foodEmptyTitle:
      "ชุดผลิตภัณฑ์ครอบคลุมสูตรแล้ว อาหารยังเป็นการเสริมทางเลือก",
    foodCoverageTitle: "ความครอบคลุมเกิดจากทั้งสองด้าน",
    foodNote:
      "ความครอบคลุมเกิดจากทั้งสองด้าน: ผลิตภัณฑ์ดูแลตัวเลขสูตร ส่วนอาหารช่วยเสริมช่องว่างโดยไม่เปลี่ยนคะแนนตะกร้า",
    formulaHint: "แตะสารอาหารเพื่อดูเหตุผล",
    formulaMatch: "ความตรงกับสูตร",
    formulaMatchTooltip:
      "ความใกล้เคียงของผลิตภัณฑ์ที่เลือกกับขนาดในสูตร เฉลี่ยจากสารอาหารที่ครอบคลุม",
    khunAlt: "คุณดรีม เภสัชกรประจำ Delight Pharmacy เชียงใหม่",
    khunCredentialOne: "ขึ้นทะเบียน อย. ไทย",
    khunCredentialThree: "ประจำเชียงใหม่",
    khunCredentialTwo: "ตรวจทุกล็อต",
    khunEyebrow: "ตรวจโดยเภสัชกร",
    khunName: "คุณดรีม",
    khunQuote:
      "ทุกคำสั่งซื้อของ MattaNutra ผ่านโต๊ะของฉัน ฉันตรวจล็อต วันหมดอายุ และความตรงกับสูตรก่อนจัดส่ง ร่างกายของคุณสมควรได้รับการดูแลแบบนั้น",
    khunRole: "เภสัชกร · Delight Pharmacy เชียงใหม่",
    khunTitle: "คุณดรีมตรวจอีกครั้งก่อนออกจากร้านขายยา",
    lineGenerated: "สร้างเมื่อ",
    linePlan: "แผน",
    nutrientDecision: "เหตุผลการเลือก",
    nutrientSafety: "ความปลอดภัย",
    nutrientWhy: "ทำไมจึงเหมาะกับคุณ",
    none: "ไม่มี",
    panyaButtonLead:
      "สแกน QR หรือเปิด LINE ข้อความเชื่อมต่อจะถูกใส่ไว้ให้แล้ว กดส่งใน LINE แล้ว Panya จะรู้ว่าเป็นแผนนี้",
    panyaCopied: "คัดลอกแล้ว",
    panyaCopyCode: "คัดลอกรหัส",
    panyaCreateCode: "สร้างรหัสใหม่",
    panyaError: "ไม่สามารถสร้างรหัส LINE ได้ในขณะนี้",
    panyaExpires: "รหัสจะหมดอายุเร็ว ๆ นี้",
    panyaLivingBody:
      "แผนของคุณไม่ควรหยุดนิ่ง ใช้ LINE เพื่อคุยต่อเมื่อการนอน ความเครียด การเดินทาง อาหาร หรืออาการเปลี่ยนไป",
    panyaLivingHeading: "การดูแลโภชนาการต่อเนื่อง ที่เชื่อมกับแผนนี้",
    panyaLoading: "กำลังสร้างรหัส...",
    panyaOpenLine: "เปิด LINE",
    panyaPlanBody:
      "ใช้ LINE เพื่อถามเรื่องสูตรของคุณ เหตุผลที่เลือกสารอาหารแต่ละตัว และวิธีนำแผนนี้ไปใช้ในชีวิตประจำวัน",
    panyaPlanHeading: "คุยเรื่องแผนโภชนาการของคุณกับ Panya",
    panyaQrAlt: "คิวอาร์โค้ดเชื่อมต่อ LINE ของ MattaNutra",
    panyaQrPlaceholder: "กำลังเตรียมคิวอาร์ LINE ของคุณ...",
    panyaSection: "Panya support",
    pharmacyBody:
      "ผลิตภัณฑ์ที่เลือกถูกตรวจเทียบกับสูตร สต็อก จำนวนเสิร์ฟ และร้านค้าที่เลือกก่อนชำระเงิน",
    pharmacyTitle: "จัดจากร้านขายยาที่เหมาะที่สุดในข้อมูลปัจจุบัน",
    productRemoved: "นำออกแล้ว",
    remove: "นำออก",
    selectedPharmacy: "ร้านขายยาที่เลือก",
    shelvesTrust:
      "ขนาดที่ตรวจได้ ฉลากชัดเจน ลิงก์ซื้อหรือเส้นทางร้านขายยา และไม่ซ้ำซ้อนเกินจำเป็น",
    subtotal: "ยอดรวม"
  },
  "zh-CN": {
    addBack: "加回",
    alternatePharmacy: "其他选择",
    assessmentCautions: "注意事项",
    assessmentGoals: "目标",
    assessmentProfile: "档案",
    assessmentSymptoms: "信号",
    basketEmpty: "请至少选择一件产品继续",
    basketSelected: "购物篮商品",
    bestValue: "最优价格",
    brandFormula: "配方",
    brandHomeLabel: "MattaNutra 首页",
    brandTagline: "知道真正合适的量",
    checkout: "结账",
    compactInfo:
      "Compact 会在目录仍可支持你的 Right Amount 时减少瓶数。",
    deliveryNote: "一次付款，一个包裹，由药房确认。",
    fastest: "最快",
    foodEmptyBody:
      "所选组合已覆盖目前可由产品支持的配方缺口。饮食保持稳定即可；如需食物优先的强化指南，可联系 Panya。",
    foodEmptyTitle:
      "你的组合已覆盖配方。食物仍可作为可选强化。",
    foodCoverageTitle: "覆盖来自两个层面",
    foodNote:
      "覆盖来自两个层面：产品负责可衡量的配方覆盖，食物强化缺口但不改变购物篮评分。",
    formulaHint: "点开任一营养素查看理由",
    formulaMatch: "配方匹配",
    formulaMatchTooltip:
      "所选产品与配方剂量的接近程度，按已覆盖营养素平均计算。",
    khunAlt: "Khun Dream，清迈 Delight Pharmacy 执业药师",
    khunCredentialOne: "泰国 FDA 注册",
    khunCredentialThree: "清迈本地",
    khunCredentialTwo: "每批次验证",
    khunEyebrow: "药师核验",
    khunName: "Khun Dream",
    khunQuote:
      "每一份 MattaNutra 订单都会经过我的桌面。我会在发货前检查批次、有效期和配方匹配。你的身体值得这样的确认。",
    khunRole: "执业药师 · 清迈 Delight Pharmacy",
    khunTitle: "离开药房前，由 Khun Dream 再次核验。",
    lineGenerated: "生成",
    linePlan: "方案",
    nutrientDecision: "选择依据",
    nutrientSafety: "安全",
    nutrientWhy: "为什么适合你",
    none: "无",
    panyaButtonLead:
      "扫描二维码或打开 LINE。连接消息会自动填好；在 LINE 中点发送后，Panya 会识别这份方案。",
    panyaCopied: "已复制",
    panyaCopyCode: "复制代码",
    panyaCreateCode: "创建新代码",
    panyaError: "目前无法创建 LINE 代码。",
    panyaExpires: "代码即将过期",
    panyaLivingBody:
      "你的方案不应该停在页面上。当睡眠、压力、旅行、饮食或症状变化时，可通过 LINE 持续沟通。",
    panyaLivingHeading: "与这份方案相连的持续营养支持。",
    panyaLoading: "正在创建代码...",
    panyaOpenLine: "打开 LINE",
    panyaPlanBody:
      "通过 LINE 询问你的配方、每种营养素被选择的原因，以及如何把这份方案融入日常生活。",
    panyaPlanHeading: "和 Panya 一起讨论你的营养方案。",
    panyaQrAlt: "MattaNutra LINE 连接二维码",
    panyaQrPlaceholder: "正在准备你的 LINE 二维码...",
    panyaSection: "Panya 支持",
    pharmacyBody:
      "结账前，每件所选产品都会根据你的配方、库存、服用负担和所选零售方进行核对。",
    pharmacyTitle: "由当前最匹配的药房来源履约。",
    productRemoved: "已移除",
    remove: "移除",
    selectedPharmacy: "已选药房",
    shelvesTrust:
      "验证剂量、清晰标签、购买或药房履约路径，以及避免不必要重叠。",
    subtotal: "小计"
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

export const revealJoiners = {
  en: ", ",
  th: " และ ",
  "zh-CN": "、"
} satisfies Record<Locale, string>;

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

export function localizedCountText(value: number, locale: Locale, capitalize = false) {
  if (locale === "th" || locale === "zh-CN") {
    return String(value);
  }

  const word = englishCountWords.get(value) ?? String(value);

  return capitalize ? capitalizeText(word) : word;
}

export function localizedPlanText(value: unknown, locale: Locale, fallback: string) {
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

export function revealSlotCopy(
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

export function localizedBenefitTagLabel(value: string, locale: Locale) {
  return benefitTagLabels[locale][value] ?? benefitTagLabels.en[value] ?? foodTagLabel(value);
}

export function localizedCategoryLabel(value: string, locale: Locale) {
  return formulaCategoryLabels[locale][value] ?? formulaCategoryLabels.en[value] ?? value;
}

export function localizedContextChip(value: string, locale: Locale) {
  return value
    .split(" / ")
    .map((part) =>
      contextChipLabels[locale][part] ??
      contextChipLabels.en[part] ??
      localizeKnownInlineTerms(part, locale)
    )
    .join(" / ");
}

export function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

export function localizedCoverLabel(
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

export function localizedMarketplaceName(
  value: RecommendedProduct["marketplace"],
  locale: Locale
) {
  return marketplaceLabels[locale][value] ?? marketplaceLabels.en[value] ?? value;
}

export function localizedProductDescription({
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

export type RevealCopy = (typeof revealCopy)["en"];
