import type { MarketingPoint } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";

/** Formula generation precedes product matching. Never project generated promises
 * about a purchased routine, matched diet, pill count or budget as established facts. */
export function formulationPlanCopy(locale: Locale): MarketingPoint[] {
  const copy = {
    en: [
      ["Nutrient targets for your plan", "Your answers inform the proposed ingredients and amounts. Product coverage is shown separately."],
      ["See what the products provide", "Compare the matched amounts, remaining gaps and daily quantities before choosing your routine."],
      ["Keep your preferences in view", "Pill count and budget guide matching. Missing product information remains unknown; preferences are not guaranteed outcomes."]
    ],
    th: [
      ["เป้าหมายสารอาหารสำหรับแผนของคุณ", "คำตอบของคุณช่วยกำหนดส่วนผสมและปริมาณที่เสนอ โดยแสดงความครอบคลุมจากผลิตภัณฑ์แยกต่างหาก"],
      ["ดูว่าผลิตภัณฑ์ให้สารอาหารเท่าใด", "เปรียบเทียบปริมาณที่ได้รับ ส่วนที่ยังขาด และปริมาณที่ใช้ต่อวันก่อนเลือกรูปแบบการรับประทาน"],
      ["คำนึงถึงความต้องการของคุณ", "จำนวนเม็ดและงบประมาณใช้ประกอบการจับคู่ ข้อมูลผลิตภัณฑ์ที่ขาดยังถือว่าไม่ทราบ และไม่ได้รับประกันว่าผลลัพธ์จะตรงตามความต้องการทั้งหมด"]
    ],
    "zh-CN": [
      ["您的方案营养目标", "您的回答用于制定建议成分和用量，产品能覆盖多少会单独显示。"],
      ["查看产品实际提供的营养", "选择日常方案前，请比较匹配用量、剩余缺口和每日用量。"],
      ["结合您的偏好", "片数和预算用于指导匹配。缺失的产品信息仍属未知，结果不保证完全符合偏好。"]
    ]
  };
  return copy[locale].map(([title, body], index) => ({ id: ["nutrient-targets", "product-coverage", "routine-preferences"][index], title, body }));
}
