import type { ProductStackPreference } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";

type BaseLocale = Exclude<Locale, "zh-CN">;

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

export const productRecommendationCopy = {
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

export const productStackPreferenceOrder: ProductStackPreference[] = [
  "compact",
  "balanced"
];
