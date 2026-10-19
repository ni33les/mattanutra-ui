import { copies } from "@/components/assessment-flow-copy";
import type { Locale } from "@/lib/i18n";

export const webProductCopy = {
  en: {
    availableProducts: "Available products", matchingProducts: "Matching your personalised plan to available products", reviewBasket: "Choose your products", deliveryNext: "Continue to enter your delivery details and pay securely with Stripe.", pricingPending: "Product pricing is being checked. Please return to your saved plan shortly.", fullFormula: "These details describe your complete recommendation. Your selected basket may cover fewer nutrients.", affected: "Nutrients affected by your selection",
    preparing: "Your personalised plan is taking shape", matching: "Your formula is ready. Finding the products that fit.",
    ready: "Your personalised supplement plan", free: "Your assessment and full plan are free. Pay only for the products you choose, plus delivery.",
    saved: "Your answers are saved. You can return using this private link.", estimate: "Matching usually takes 1–2 minutes. Your formula appears as soon as it is ready.",
    slower: "This is taking a little longer. Your answers are safe; you can keep reading or return later.",
    failed: "We could not finish this step. Your saved answers and completed formula are still here.",
    retry: "Try again", copy: "Copy private plan link", copied: "Private link copied", copyFailed: "Copy the private link below to return later.",
    previous: "Previous detail", next: "Next detail", pause: "Pause details", play: "Resume details", details: "What we are considering",
    goals: "Your goals", goalsBody: "Your saved priorities help us put the most relevant recommendations first.",
    diet: "Your diet", dietBody: "The food habits you shared help us consider what your diet already provides.",
    supplements: "What you already take", supplementsBody: "Your supplement answers provide context for the formula. Check the details and cautions before adding anything new.",
    process: "From your answers to a practical plan", processBody: "First we prepare your nutrient recommendations and amounts. Then we match them with available products and show their prices.",
    unspecified: "Not specified", deeper: "Explore your assessment and detailed plan", subset: "Review how your selection changes formula coverage. The suggested doses have not changed.",
    unknownCoverage: "Coverage will change with your selection. Review the ingredients in the products you keep.",
    coverage: "Selected basket coverage", removed: "No longer covered by this selection", empty: "Choose at least one product to continue.",
    back: "Back to my products", health: "View my free HealthScore", plan: "Read my full plan", edit: "Review my answers", continue: "Continue to checkout", noProducts: "Your formula is ready. There are no products to purchase for this result."
  },
  th: {
    availableProducts: "ผลิตภัณฑ์ที่มีจำหน่าย", matchingProducts: "จับคู่แผนเฉพาะคุณกับผลิตภัณฑ์ที่มีจำหน่าย", reviewBasket: "เลือกผลิตภัณฑ์ของคุณ", deliveryNext: "ดำเนินการต่อเพื่อกรอกข้อมูลจัดส่งและชำระเงินอย่างปลอดภัยผ่าน Stripe", pricingPending: "กำลังตรวจสอบราคาผลิตภัณฑ์ โปรดกลับมาที่แผนที่บันทึกไว้ในอีกสักครู่", fullFormula: "รายละเอียดนี้อธิบายคำแนะนำฉบับเต็ม ตะกร้าที่เลือกอาจครอบคลุมสารอาหารน้อยลง", affected: "สารอาหารที่ได้รับผลจากการเลือก",
    preparing: "กำลังจัดทำแผนเฉพาะคุณ", matching: "สูตรของคุณพร้อมแล้ว กำลังค้นหาผลิตภัณฑ์ที่เหมาะสม",
    ready: "แผนอาหารเสริมเฉพาะคุณ", free: "ทำแบบประเมินและดูแผนฉบับเต็มฟรี ชำระเฉพาะผลิตภัณฑ์ที่เลือกและค่าจัดส่ง",
    saved: "บันทึกคำตอบแล้ว คุณกลับมาได้ด้วยลิงก์ส่วนตัวนี้", estimate: "การจับคู่ผลิตภัณฑ์มักใช้เวลา 1–2 นาที สูตรจะแสดงทันทีที่พร้อม",
    slower: "ขั้นตอนนี้ใช้เวลานานกว่าปกติเล็กน้อย คำตอบยังอยู่ คุณอ่านต่อหรือกลับมาภายหลังได้",
    failed: "ยังดำเนินการขั้นตอนนี้ไม่สำเร็จ คำตอบที่บันทึกไว้และสูตรที่เสร็จแล้วจะยังคงอยู่",
    retry: "ลองอีกครั้ง", copy: "คัดลอกลิงก์แผนส่วนตัว", copied: "คัดลอกลิงก์ส่วนตัวแล้ว", copyFailed: "คัดลอกลิงก์ส่วนตัวด้านล่างเพื่อกลับมาภายหลัง",
    previous: "รายละเอียดก่อนหน้า", next: "รายละเอียดถัดไป", pause: "หยุดเลื่อนรายละเอียด", play: "เลื่อนรายละเอียดต่อ", details: "ข้อมูลที่เรานำมาพิจารณา",
    goals: "เป้าหมายของคุณ", goalsBody: "เป้าหมายที่บันทึกไว้ช่วยจัดลำดับคำแนะนำที่เกี่ยวข้องกับคุณ",
    diet: "อาหารของคุณ", dietBody: "พฤติกรรมการกินที่คุณแจ้งช่วยให้เราพิจารณาสารอาหารที่ได้รับจากอาหารอยู่แล้ว",
    supplements: "อาหารเสริมที่ใช้อยู่", supplementsBody: "คำตอบเรื่องอาหารเสริมเป็นบริบทสำหรับสูตร โปรดอ่านรายละเอียดและข้อควรระวังก่อนเพิ่มอาหารเสริมใหม่",
    process: "จากคำตอบสู่แผนที่นำไปใช้ได้", processBody: "เราเตรียมคำแนะนำสารอาหารและปริมาณก่อน แล้วจึงจับคู่กับผลิตภัณฑ์ที่มีจำหน่ายพร้อมแสดงราคา",
    unspecified: "ไม่ได้ระบุ", deeper: "ดูผลประเมินและแผนฉบับละเอียด", subset: "ตรวจสอบความครอบคลุมของรายการที่เลือก ปริมาณที่แนะนำยังไม่เปลี่ยนแปลง",
    unknownCoverage: "ความครอบคลุมเปลี่ยนไปตามรายการที่เลือก โปรดตรวจสอบส่วนประกอบของผลิตภัณฑ์ที่เก็บไว้",
    coverage: "ความครอบคลุมของตะกร้าที่เลือก", removed: "รายการที่ไม่ครอบคลุมแล้ว", empty: "เลือกอย่างน้อยหนึ่งผลิตภัณฑ์เพื่อดำเนินการต่อ",
    back: "กลับไปที่ผลิตภัณฑ์", health: "ดู HealthScore ฟรี", plan: "อ่านแผนฉบับเต็ม", edit: "ทบทวนคำตอบ", continue: "ดำเนินการชำระเงิน", noProducts: "สูตรของคุณพร้อมแล้ว ผลลัพธ์นี้ไม่มีผลิตภัณฑ์ที่ต้องซื้อ"
  },
  "zh-CN": {
    availableProducts: "可购买的产品", matchingProducts: "将您的个性化方案与可购买的产品匹配", reviewBasket: "选择您的产品", deliveryNext: "继续填写配送信息，并通过 Stripe 安全付款。", pricingPending: "正在核实产品价格，请稍后返回已保存的方案。", fullFormula: "这些详情描述完整推荐方案。您选择的购物篮可能覆盖较少的营养素。", affected: "受当前选择影响的营养素",
    preparing: "正在制定您的个性化方案", matching: "您的配方已准备好，正在匹配合适的产品。",
    ready: "您的个性化营养补充方案", free: "评估和完整方案免费。您只需支付所选产品和配送费用。",
    saved: "您的回答已保存。可以通过此私人链接随时返回。", estimate: "产品匹配通常需要1–2分钟。配方准备好后会立即显示。",
    slower: "这次需要稍长一些时间。您的回答已保存，可以继续阅读或稍后返回。",
    failed: "我们暂时未能完成这一步。已保存的回答和完成的配方仍然保留。",
    retry: "重试", copy: "复制私人方案链接", copied: "私人链接已复制", copyFailed: "请复制下面的私人链接，以便稍后返回。",
    previous: "上一条详情", next: "下一条详情", pause: "暂停轮播", play: "继续轮播", details: "我们正在考虑的信息",
    goals: "您的目标", goalsBody: "您保存的目标帮助我们优先呈现相关建议。",
    diet: "您的饮食", dietBody: "您提供的饮食习惯帮助我们考虑食物中已有的营养。",
    supplements: "您目前服用的补充剂", supplementsBody: "您的补充剂信息为配方提供参考。添加新产品前，请查看详细说明和注意事项。",
    process: "从您的回答到可执行的方案", processBody: "我们先制定营养素和用量建议，再匹配可购买的产品并显示价格。",
    unspecified: "未填写", deeper: "查看评估和完整方案", subset: "请查看当前选择对配方覆盖情况的影响。建议用量保持不变。",
    unknownCoverage: "覆盖情况会随您的选择变化。请检查保留产品中的成分。",
    coverage: "所选购物篮的覆盖情况", removed: "当前选择不再覆盖", empty: "请至少选择一种产品后继续。",
    back: "返回我的产品", health: "查看免费 HealthScore", plan: "阅读完整方案", edit: "检查我的回答", continue: "继续结账", noProducts: "您的配方已准备好，此结果没有需要购买的产品。"
  }
} satisfies Record<Locale, Record<string, string>>;

/** Only saved, explicitly provided answers appear in waiting cards. */
export function webPreparationCards(answers: Record<string, unknown>, locale: Locale) {
  const c = webProductCopy[locale], labels = copies[locale];
  const label = (value: unknown, options: readonly { value: string; label: string }[]) =>
    typeof value === "string" ? options.find(option => option.value === value)?.label ?? c.unspecified : c.unspecified;
  const goals = Array.isArray(answers.goals) ? answers.goals.map(value => label(value, labels.goals.goalOptions)).filter(value => value !== c.unspecified) : [];
  return [
    { id: "goals", title: c.goals, value: goals.join(" · ") || c.unspecified, body: c.goalsBody },
    { id: "diet", title: c.diet, value: label(answers.diet, labels.food.dietOptions), body: c.dietBody },
    { id: "supplements", title: c.supplements, value: label(answers.supplements, labels.safety.supplementsOptions), body: c.supplementsBody },
    { id: "process", title: c.process, value: "", body: c.processBody }
  ];
}
