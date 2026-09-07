import type { LocalizedText, WebHealthAdvice } from "@/lib/formulation-types";

const copy = {
  en: { target: "The proposed amount exceeds the agreed supplement target. This is a dose comparison, not a medical limit.", continued: "The proposed products increase a nutrient you already plan to continue. The reported continued dose is a comparison reference, not a medical limit or an agreed target.", agreedTarget: "Agreed supplement target", continuedDose: "Reported continued dose", limit: "The proposed amount is at or above the reference limit; for an estimated range, this applies to its upper end.", context: "A possible interaction or health concern applies to the information you supplied. Discuss this with a clinician or pharmacist before use.", unknown: "There is not enough information to assess this ingredient or amount fully.", uncertainty: "This is advisory information, not medical approval. Other intake, individual circumstances and missing information may change the assessment.", reference: "Reference", unavailable: "Reference limit unavailable" },
  th: { target: "ปริมาณที่เสนอสูงกว่าเป้าหมายอาหารเสริมที่ตกลงไว้ นี่เป็นการเปรียบเทียบปริมาณ ไม่ใช่ขีดจำกัดทางการแพทย์", continued: "สินค้าที่เสนอเพิ่มสารอาหารที่คุณวางแผนจะรับประทานต่อ ปริมาณที่คุณรายงานเป็นค่าเปรียบเทียบ ไม่ใช่ขีดจำกัดทางการแพทย์หรือเป้าหมายที่ตกลงไว้", agreedTarget: "เป้าหมายอาหารเสริมที่ตกลงไว้", continuedDose: "ปริมาณที่รายงานว่าจะรับประทานต่อ", limit: "ปริมาณที่เสนอถึงหรือสูงกว่าค่าขีดจำกัดอ้างอิง หากเป็นช่วงประมาณการ ข้อนี้ใช้กับค่าสูงสุดของช่วง", context: "ข้อมูลที่คุณให้มาอาจเกี่ยวข้องกับปฏิกิริยาระหว่างยาหรือข้อควรระวังด้านสุขภาพ ควรปรึกษาแพทย์หรือเภสัชกรก่อนใช้", unknown: "ข้อมูลยังไม่เพียงพอที่จะประเมินส่วนผสมหรือปริมาณนี้ได้ครบถ้วน", uncertainty: "ข้อมูลนี้เป็นคำแนะนำ ไม่ใช่การรับรองทางการแพทย์ ปริมาณที่ได้รับจากแหล่งอื่น ภาวะเฉพาะบุคคล และข้อมูลที่ขาดหายอาจเปลี่ยนการประเมินได้", reference: "ค่าอ้างอิง", unavailable: "ไม่มีข้อมูลขีดจำกัดอ้างอิง" },
  "zh-CN": { target: "建议用量超过已商定的补充剂目标。这是用量比较，并非医学上限。", continued: "建议商品增加了您计划继续摄入的营养素。您报告的继续用量仅用于比较，并非医学上限或已商定的目标。", agreedTarget: "已商定的补充剂目标", continuedDose: "报告的继续用量", limit: "建议用量达到或超过参考上限；如为估计范围，此提示针对范围上限。", context: "您提供的信息提示可能存在相互作用或健康方面的注意事项。使用前请咨询医生或药师。", unknown: "目前信息不足，无法完整评估此成分或用量。", uncertainty: "这是参考建议，并非医学认可。其他来源的摄入量、个人情况及缺失信息可能改变评估结果。", reference: "参考值", unavailable: "参考上限未知" }
} as const;

export function webHealthAdvice(input: Readonly<{
  code: string;
  kind: "limit" | "context" | "unknown" | "target" | "continued";
  ingredient: string;
  amount?: number | null;
  amountRange?: { minimum: number; maximum: number } | null;
  unit?: string | null;
  limit?: { amount: number; unit: string; sourceScope?: string; population?: string } | null;
  referenceDose?: { amount: number; unit: string; basis: "agreed_target" | "continued_dose" } | null;
  evidence?: string | null;
  authorityUrl?: string | null;
  confidence?: string | null;
}>): WebHealthAdvice {
  const message: Record<string, string> = {};
  const uncertainty: Record<string, string> = {};
  for (const [locale, text] of Object.entries(copy)) {
    const amount = input.amountRange ? `${input.amountRange.minimum}–${input.amountRange.maximum} ${input.unit ?? ""}`.trim()
      : input.amount == null ? "?" : `${input.amount} ${input.unit ?? ""}`.trim();
    const limit = input.referenceDose ? `${input.referenceDose.basis === "continued_dose" ? text.continuedDose : text.agreedTarget}: ${input.referenceDose.amount} ${input.referenceDose.unit}` : input.limit ? `${text.reference}: ${input.limit.amount} ${input.limit.unit}` : text.unavailable;
    const ingredient = ["Health information", "Ingredient"].includes(input.ingredient)
      ? locale === "th" ? "ข้อมูลสุขภาพ" : locale === "zh-CN" ? "健康信息" : "Health information"
      : input.ingredient;
    message[locale] = `${ingredient}: ${amount}. ${limit}. ${text[input.kind]} ${text.uncertainty}`;
    uncertainty[locale] = text.uncertainty;
  }
  return {
    code: input.code,
    severity: input.kind === "target" || input.kind === "continued" ? "info" : input.kind === "unknown" ? "medium" : "high",
    ingredient: input.ingredient,
    amount: input.amount ?? null,
    amountRange: input.amountRange ?? null,
    unit: input.unit ?? null,
    referenceDose: input.referenceDose ?? null,
    referenceLimit: input.limit ? { amount: input.limit.amount, unit: input.limit.unit, sourceScope: input.limit.sourceScope ?? "supplemental", population: input.limit.population ?? "adult" } : null,
    evidence: { source: input.evidence || "MattaNutra catalogue metadata; independent evidence not supplied", url: input.authorityUrl ?? null, confidence: input.confidence ?? null },
    message,
    uncertainty
  };
}

export function joinedAdviceMessage(advice: readonly WebHealthAdvice[]): LocalizedText {
  return Object.fromEntries(Object.keys(copy).map(locale => [locale,
    advice.map(item => typeof item.message === "string" ? item.message : item.message[locale] ?? item.message.en ?? "").join("\n")
  ]));
}

export const webMatchingCopy = {
  en: { evidence: "Evidence", retry: "Retry alternative search", advice: "Health advice", alternatives: "Other options", none: "No distinct option with fewer concerns was found within these requirements.", incomplete: "The alternative search is incomplete. You can retry it.", coverage: "Coverage", pills: "Daily pill count", pillsUnknown: "Unknown — physical unit information is incomplete", subtotal: "Product subtotal; delivery calculated at checkout", choose: "Confirm this option", replan: "Exclude removed products and replan", clear: "Clear product exclusions and replan", error: "Replanning failed. Please retry." },
  th: { evidence: "หลักฐาน", retry: "ลองค้นหาตัวเลือกอื่นอีกครั้ง", advice: "คำแนะนำด้านสุขภาพ", alternatives: "ตัวเลือกอื่น", none: "ไม่พบตัวเลือกที่แตกต่างและมีข้อควรระวังน้อยกว่าภายใต้ข้อกำหนดเหล่านี้", incomplete: "การค้นหาตัวเลือกอื่นยังไม่เสร็จสมบูรณ์ คุณลองใหม่ได้", coverage: "ความครอบคลุม", pills: "จำนวนเม็ดต่อวัน", pillsUnknown: "ไม่ทราบ เนื่องจากข้อมูลหน่วยของผลิตภัณฑ์ไม่ครบถ้วน", subtotal: "ราคารวมสินค้า คำนวณค่าจัดส่งเมื่อชำระเงิน", choose: "ยืนยันตัวเลือกนี้", replan: "ยกเว้นสินค้าที่นำออกและจัดแผนใหม่", clear: "ล้างรายการยกเว้นสินค้าและจัดแผนใหม่", error: "จัดแผนใหม่ไม่สำเร็จ โปรดลองอีกครั้ง" },
  "zh-CN": { evidence: "依据", retry: "重试其他选项搜索", advice: "健康建议", alternatives: "其他选项", none: "在这些要求内，未找到注意事项更少的不同选项。", incomplete: "其他选项的搜索尚未完成，您可以重试。", coverage: "覆盖率", pills: "每日粒数", pillsUnknown: "未知，产品的实际单位信息不完整", subtotal: "商品小计；运费在结账时计算", choose: "确认此选项", replan: "排除已移除的商品并重新规划", clear: "清除商品排除项并重新规划", error: "重新规划失败，请重试。" }
} as const;
