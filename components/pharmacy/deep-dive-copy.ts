import type { Locale } from "@/lib/i18n";

const en = {
  forName: (name: string) => `For ${name}`,
  opening: "Everything behind your recommendation — why each nutrient is in your formula, what we noticed in your answers, and the safety information recorded with your plan. Take as long as you like.",
  pictureTitle: ["Everything you told us, ", "folded into one plan."],
  noticedTitle: ["The details that ", "shaped your plan."],
  methodTitle: ["From your answers ", "to your recommendation."],
  formulaTitle: (n: number) => `${n} nutrients.`, formulaEmphasis: "Your amounts, explained.",
  productTitle: (n: number) => `${n} products.`,
  coverageTitle: (n: number, total: number) => `${n} of your ${total} nutrients covered.`,
  foodTitle: ["Where food can support ", "the rest of your plan."],
  safetyTitle: ["The safety information ", "that belongs with your plan."],
  goals: "Your goals", constraints: "Your preferences and health context", region: "Location", profile: "Your picture",
  pending: "Your saved explanation will appear here when it is ready.",
  noFindings: "No separate observations were recorded in this assessment.",
  methodBody: "Your answers inform the HealthScore and the AI-written explanation. Your formula is matched to products at this pharmacy. The recommendation balances dose fit with routine and cost preferences; health findings remain advice to review with your pharmacist.",
  howTo: "How to read your plan", grouping: "The groups explain why nutrients were chosen. Read the reasoning and amount for each one alongside the product coverage.",
  why: "Why this, for you", decision: "The decision", safety: "Safety", proposedDose: "Proposed daily amount", coverage: "Coverage in the recommendation",
  recommended: "These are the products in your recommendation at this pharmacy. Return to the reveal to choose which products to order.",
  ordered: "These are the products in your saved order. Quantities and prices below come from that order; payment is at the pharmacy counter.",
  unknownProducts: "Product coverage is not fully quantified in the saved recommendation.",
  foodHowTo: "What food can and cannot do here", foodNote: "Food can support your routine, but nutrient amounts vary with ingredients, portions and preparation. These suggestions do not establish that a supplement target has been met.",
  noFood: "No separate food suggestions were recorded for this plan.",
  safetyIntro: "These are the relevant findings recorded with your formula and selected recommendation. Missing information is not a completed safety check. Discuss your medications, conditions and any changes with the pharmacist before use.",
  noSafety: "No additional ingredient-specific cautions were recorded. This does not establish medical clearance.",
  keep: "Keep your complete plan", keepBody: "Receive your private plan link in MattaNutra’s LINE chat, or copy it below. Your order reference, when available, stays with the link.",
  copyError: "The link could not be copied. You can copy the page address instead.",
  meaning: "From the Pāli — the wisdom of knowing the right amount.",
  closing: "Your answers. Your goals. A plan you can understand, and a conversation you can continue with your pharmacist.",
  composed: "Prepared", wellness: "Wellness information only, not a diagnosis or treatment. Do not start or stop medication based on this plan. Review it with a clinician or pharmacist when your circumstances change."
};
type Copy = typeof en;
const th: Copy = {
  forName: name => `สำหรับ ${name}`,
  opening: "รายละเอียดเบื้องหลังคำแนะนำของคุณ — เหตุผลที่เลือกสารอาหารแต่ละชนิด สิ่งที่เราพบจากคำตอบ และข้อมูลความปลอดภัยที่บันทึกไว้ในแผน ค่อย ๆ อ่านได้ตามสะดวก",
  pictureTitle: ["ทุกคำตอบของคุณ ", "รวมเป็นแผนเดียว"], noticedTitle: ["รายละเอียดที่ ", "มีผลต่อแผนของคุณ"], methodTitle: ["จากคำตอบของคุณ ", "สู่คำแนะนำ"],
  formulaTitle: n => `สารอาหาร ${n} ชนิด`, formulaEmphasis: "พร้อมเหตุผลของแต่ละปริมาณ", productTitle: n => `ผลิตภัณฑ์ ${n} รายการ`, coverageTitle: (n, total) => `ครอบคลุมสารอาหาร ${n} จาก ${total} ชนิด`,
  foodTitle: ["อาหารช่วยสนับสนุน ", "ส่วนที่เหลือของแผนได้อย่างไร"], safetyTitle: ["ข้อมูลความปลอดภัย ", "ที่ควรอ่านควบคู่กับแผน"],
  goals: "เป้าหมายของคุณ", constraints: "ความต้องการและข้อมูลสุขภาพ", region: "สถานที่", profile: "ภาพรวมของคุณ", pending: "คำอธิบายที่บันทึกไว้จะแสดงที่นี่เมื่อพร้อม", noFindings: "การประเมินนี้ไม่ได้บันทึกข้อสังเกตแยกไว้",
  methodBody: "คำตอบของคุณใช้ประกอบ HealthScore และคำอธิบายที่เขียนด้วย AI จากนั้นจึงจับคู่สูตรกับผลิตภัณฑ์ของร้านยานี้ โดยพิจารณาความเหมาะสมของปริมาณ กิจวัตร และราคา ข้อค้นพบด้านสุขภาพเป็นคำแนะนำที่ควรทบทวนกับเภสัชกร",
  howTo: "วิธีอ่านแผนของคุณ", grouping: "แต่ละกลุ่มอธิบายเหตุผลที่เลือกสารอาหาร โปรดอ่านเหตุผลและปริมาณของแต่ละชนิดควบคู่กับความครอบคลุมจากผลิตภัณฑ์",
  why: "ทำไมจึงเลือกให้คุณ", decision: "เหตุผลของปริมาณ", safety: "ความปลอดภัย", proposedDose: "ปริมาณที่เสนอต่อวัน", coverage: "ความครอบคลุมในชุดที่แนะนำ",
  recommended: "นี่คือผลิตภัณฑ์ที่แนะนำจากร้านยานี้ กลับไปหน้าคำแนะนำเพื่อเลือกผลิตภัณฑ์ที่ต้องการสั่ง",
  ordered: "นี่คือผลิตภัณฑ์ในรายการสั่งซื้อที่บันทึกไว้ จำนวนและราคาด้านล่างมาจากรายการนั้น ชำระเงินที่เคาน์เตอร์ร้านยา",
  unknownProducts: "ข้อมูลที่บันทึกไว้ยังระบุความครอบคลุมจากผลิตภัณฑ์ได้ไม่ครบถ้วน",
  foodHowTo: "อาหารช่วยได้แค่ไหน", foodNote: "อาหารช่วยสนับสนุนกิจวัตรของคุณได้ แต่ปริมาณสารอาหารแตกต่างกันตามวัตถุดิบ ขนาดมื้อ และวิธีปรุง คำแนะนำเหล่านี้ไม่ได้ยืนยันว่าได้รับครบตามเป้าหมายอาหารเสริมแล้ว", noFood: "แผนนี้ไม่ได้บันทึกคำแนะนำอาหารแยกไว้",
  safetyIntro: "นี่คือข้อค้นพบที่เกี่ยวข้องซึ่งบันทึกไว้กับสูตรและชุดที่แนะนำ ข้อมูลที่ขาดหายไม่ได้หมายความว่าตรวจสอบความปลอดภัยครบแล้ว โปรดแจ้งยา ภาวะสุขภาพ และการเปลี่ยนแปลงต่าง ๆ ให้เภสัชกรทราบก่อนใช้", noSafety: "ไม่มีข้อควรระวังเฉพาะสารอาหารเพิ่มเติมที่บันทึกไว้ ทั้งนี้ไม่ได้ยืนยันความปลอดภัยทางการแพทย์",
  keep: "เก็บแผนฉบับเต็มของคุณ", keepBody: "รับลิงก์แผนส่วนตัวในแชต LINE ของ MattaNutra หรือคัดลอกลิงก์ด้านล่าง เมื่อมีเลขอ้างอิงรายการสั่งซื้อ เลขนั้นจะอยู่ในลิงก์ด้วย", copyError: "คัดลอกลิงก์ไม่สำเร็จ คุณคัดลอกที่อยู่ของหน้านี้แทนได้",
  meaning: "จากภาษาบาลี — ปัญญาแห่งการรู้จักปริมาณที่พอดี", closing: "คำตอบของคุณ เป้าหมายของคุณ แผนที่คุณเข้าใจได้ และบทสนทนาที่ต่อยอดกับเภสัชกรได้", composed: "จัดทำเมื่อ",
  wellness: "ข้อมูลเพื่อสุขภาวะ ไม่ใช่การวินิจฉัยหรือการรักษา อย่าเริ่มหรือหยุดยาโดยอาศัยแผนนี้ โปรดทบทวนกับแพทย์หรือเภสัชกรเมื่อสถานการณ์ของคุณเปลี่ยนไป"
};
const zh: Copy = {
  forName: name => `为 ${name} 制定`, opening: "建议背后的完整说明——为何选择每种营养素、您的回答透露了什么，以及方案中记录的安全信息。请按自己的节奏阅读。",
  pictureTitle: ["将您的回答，", "汇成一份方案。"], noticedTitle: ["这些细节，", "影响了您的方案。"], methodTitle: ["从您的回答，", "到您的建议。"],
  formulaTitle: n => `${n} 种营养素。`, formulaEmphasis: "逐一说明建议用量。", productTitle: n => `${n} 件产品。`, coverageTitle: (n, total) => `覆盖 ${total} 种营养素中的 ${n} 种。`,
  foodTitle: ["食物如何支持", "方案的其余部分。"], safetyTitle: ["应与方案一起阅读的", "安全信息。"],
  goals: "您的目标", constraints: "偏好与健康情况", region: "所在地", profile: "您的情况", pending: "保存的说明准备好后会显示在这里。", noFindings: "这次评估未记录单独的观察说明。",
  methodBody: "您的回答用于 HealthScore 和 AI 撰写的说明，再将配方匹配到这家药房的产品。建议综合考虑用量契合度、日常使用和费用偏好；健康方面的发现仍需与药剂师一起审阅。",
  howTo: "如何阅读您的方案", grouping: "分组说明了选择营养素的原因。请结合产品覆盖情况，阅读每种营养素的理由与用量。", why: "为什么适合您", decision: "用量的理由", safety: "安全信息", proposedDose: "建议每日用量", coverage: "推荐组合的覆盖率",
  recommended: "这些是这家药房为您推荐的产品。返回建议页，选择希望订购的产品。", ordered: "这些产品来自您保存的订单。下方数量和价格以该订单为准，请在药房柜台付款。", unknownProducts: "已保存的建议尚不能完整量化产品覆盖情况。",
  foodHowTo: "食物能做什么，不能做什么", foodNote: "食物可以支持您的日常营养，但营养含量随食材、分量和烹饪方法而变化。这些建议并不证明已达到营养补充目标。", noFood: "此方案未记录单独的食物建议。",
  safetyIntro: "以下是配方与推荐组合中记录的相关发现。缺少信息并不代表已完成安全检查。使用前请与药剂师讨论您的用药、健康状况及其变化。", noSafety: "未记录额外的营养素专属注意事项。这并不代表已获得医疗安全确认。",
  keep: "保存您的完整方案", keepBody: "在 MattaNutra 的 LINE 聊天中接收私人方案链接，或在下方复制。若已有订单编号，链接会保留该编号。", copyError: "无法复制链接，您可以改为复制本页地址。", meaning: "源自巴利语——懂得适量的智慧。", closing: "您的回答，您的目标。一份能够理解的方案，一场可以与药剂师继续的交流。", composed: "制定日期", wellness: "仅供健康参考，不作诊断或治疗。请勿根据此方案开始或停止用药。情况变化时，请与医生或药剂师重新审阅。"
};
export const pharmacyDeepDiveCopy: Record<Locale, Copy> = { en, th, "zh-CN": zh };
