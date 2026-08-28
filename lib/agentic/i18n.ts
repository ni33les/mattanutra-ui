import type { Locale } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n";

export const AGENTIC_LOCALES = ["en", "th", "zh-CN"] as const;

const MESSAGES: Record<string, Record<(typeof AGENTIC_LOCALES)[number], string>> = {
  "checkout.expired": {
    en: "This checkout has expired. Ask the agent to create a new one.",
    th: "การชำระเงินนี้หมดอายุแล้ว ขอให้ผู้ช่วยสร้างรายการใหม่",
    "zh-CN": "结账已过期。请让助手重新创建。"
  },
  "checkout.paid": {
    en: "Payment is confirmed. The agent will see this by polling the order.",
    th: "ยืนยันการชำระเงินแล้ว ผู้ช่วยจะเห็นสถานะนี้เมื่อตรวจสอบคำสั่งซื้อ",
    "zh-CN": "付款已确认。助手会通过查询订单看到此状态。"
  },
  "checkout.pay_mock": {
    en: "Simulate successful payment",
    th: "จำลองการชำระเงินสำเร็จ",
    "zh-CN": "模拟付款成功"
  },
  "checkout.pay_stripe": {
    en: "Continue to Stripe Test Mode",
    th: "ไปที่ Stripe โหมดทดสอบ",
    "zh-CN": "继续前往 Stripe 测试模式"
  },
  "checkout.test_mode": {
    en: "Test mode. No real payment is collected.",
    th: "โหมดทดสอบ ไม่มีการเรียกเก็บเงินจริง",
    "zh-CN": "测试模式。不会收取真实付款。"
  },
  "checkout.title": {
    en: "Complete your MattaNutra order",
    th: "ชำระเงินคำสั่งซื้อ MattaNutra",
    "zh-CN": "完成你的 MattaNutra 订单"
  },
  "checkout.addressLine1": {
    en: "Address",
    th: "ที่อยู่",
    "zh-CN": "地址"
  },
  "checkout.addressLine2": {
    en: "Apartment, suite, or building (optional)",
    th: "ห้อง ชั้น หรืออาคาร (ไม่บังคับ)",
    "zh-CN": "公寓、套房或楼栋（可选）"
  },
  "checkout.agentAuth": {
    en: "I confirm I authorized my AI agent to start this checkout.",
    th: "ฉันยืนยันว่าได้อนุญาตให้ผู้ช่วย AI เริ่มการชำระเงินนี้",
    "zh-CN": "我确认已授权我的 AI 助手发起此次结账。"
  },
  "checkout.city": {
    en: "District / city",
    th: "เขต / เมือง",
    "zh-CN": "区 / 城市"
  },
  "checkout.contact": {
    en: "Contact",
    th: "ผู้ติดต่อ",
    "zh-CN": "联系方式"
  },
  "checkout.country": {
    en: "Country",
    th: "ประเทศ",
    "zh-CN": "国家/地区"
  },
  "checkout.delivery": {
    en: "Delivery address",
    th: "ที่อยู่จัดส่ง",
    "zh-CN": "配送地址"
  },
  "checkout.email": {
    en: "Email",
    th: "อีเมล",
    "zh-CN": "电子邮件"
  },
  "checkout.name": {
    en: "Full name",
    th: "ชื่อ-นามสกุล",
    "zh-CN": "全名"
  },
  "checkout.phone": {
    en: "Phone",
    th: "โทรศัพท์",
    "zh-CN": "电话"
  },
  "checkout.postalCode": {
    en: "Postal code",
    th: "รหัสไปรษณีย์",
    "zh-CN": "邮编"
  },
  "checkout.province": {
    en: "Province / state",
    th: "จังหวัด / รัฐ",
    "zh-CN": "省 / 州"
  },
  "checkout.subtotal": {
    en: "Subtotal",
    th: "ยอดสินค้า",
    "zh-CN": "小计"
  },
  "checkout.shipping": {
    en: "Shipping",
    th: "ค่าจัดส่ง",
    "zh-CN": "运费"
  },
  "checkout.tax": {
    en: "Tax",
    th: "ภาษี",
    "zh-CN": "税费"
  },
  "checkout.total": {
    en: "Total",
    th: "ยอดรวม",
    "zh-CN": "合计"
  },
  "feedback.invitation": {
    en: "Would you like me to send MattaNutra a short summary of what worked well and what could be improved? It is optional and will not affect your plan or order.",
    th: "ต้องการให้ฉันส่งสรุปสั้น ๆ ถึง MattaNutra ว่าอะไรได้ผลดีและอะไรควรปรับปรุงหรือไม่ ไม่บังคับ และจะไม่กระทบแผนหรือคำสั่งซื้อ",
    "zh-CN": "要不要让我向 MattaNutra 发送一段简短反馈，说明哪些地方有帮助、哪些可以改进？这是可选的，不会影响你的方案或订单。"
  },
  "guidance.audience_mismatch": {
    en: "A selected product is not intended for this age or life stage.",
    th: "สินค้าที่เลือกไม่เหมาะกับอายุหรือช่วงชีวิตนี้",
    "zh-CN": "所选产品不适合该年龄或人生阶段。"
  },
  "guidance.condition_review_required": {
    en: "{nutrientName} ({unit}) from {contributors} needs clinician review because of a declared condition. Next action: {nextAction}.",
    th: "{nutrientName} ({unit}) จาก {contributors} ควรให้ผู้เชี่ยวชาญตรวจทานเนื่องจากมีภาวะสุขภาพที่แจ้งไว้ ขั้นตอนถัดไป: {nextAction}",
    "zh-CN": "因已声明的健康状况，{nutrientName}（{unit}，来源 {contributors}）需要临床复核。下一步：{nextAction}。"
  },
  "guidance.dose_review_required": {
    en: "Total exposure from current intake plus selected products needs a dose review.",
    th: "ปริมาณรวมจากการทานอยู่แล้วบวกสินค้าที่เลือกควรได้รับการตรวจทานขนาด",
    "zh-CN": "当前摄入加上所选产品的总暴露量需要剂量复核。"
  },
  "guidance.duplicate_or_overlap": {
    en: "{nutrientName} ({unit}) from {contributors}. remainingGap {remainingGap}; overflow {overflow}.",
    th: "{nutrientName} ({unit}) จาก {contributors}. remainingGap {remainingGap}; overflow {overflow}.",
    "zh-CN": "{nutrientName}（{unit}）来自 {contributors}。remainingGap {remainingGap}；overflow {overflow}。"
  },
  "guidance.informational_overlap": {
    en: "{nutrientName} ({unit}) from {contributors}. Remaining {remainingGap}.",
    th: "{nutrientName} ({unit}) จาก {contributors} คงเหลือ {remainingGap}",
    "zh-CN": "{nutrientName}（{unit}）来自 {contributors}。剩余 {remainingGap}。"
  },
  "guidance.medication_interaction": {
    en: "{nutrientName} from the selected products has a known interaction with a declared medication.",
    th: "โอเมกา 3 จากสินค้าที่เลือกมีปฏิกิริยากับยาที่แจ้งไว้",
    "zh-CN": "{nutrientName}（来源所选产品）与已声明药物存在已知相互作用。"
  },
  "guidance.pediatric_review_required": {
    en: "This paediatric stack needs qualified review before purchase.",
    th: "สูตรสำหรับเด็กนี้ควรให้ผู้เชี่ยวชาญตรวจทานก่อนซื้อ",
    "zh-CN": "该儿童方案在购买前需要合格人员复核。"
  },
  "mcp.errors.availability_changed": {
    en: "Availability changed. Create a new plan revision before checkout.",
    th: "ความพร้อมของสินค้าเปลี่ยนแล้ว สร้างแผนฉบับใหม่ก่อนชำระเงิน",
    "zh-CN": "库存已变化。结账前请创建新的方案版本。"
  },
  "mcp.errors.checkout_expired": {
    en: "Checkout has expired.",
    th: "การชำระเงินหมดอายุแล้ว",
    "zh-CN": "结账已过期。"
  },
  "mcp.errors.consent_required": {
    en: "Feedback requires consentConfirmed=true.",
    th: "ความคิดเห็นต้องยืนยันความยินยอม",
    "zh-CN": "反馈需要 consentConfirmed=true。"
  },
  "mcp.errors.duplicate_supplement": {
    en: "The same supplement concept appears more than once.",
    th: "สารอาหารเดียวกันปรากฏซ้ำ",
    "zh-CN": "同一补充剂概念出现了多次。"
  },
  "mcp.errors.idempotency_conflict": {
    en: "This idempotency key was already used with a different payload.",
    th: "รหัสป้องกันรายการซ้ำนี้ถูกใช้กับข้อมูลอื่นแล้ว",
    "zh-CN": "该幂等键已用于不同的请求内容。"
  },
  "mcp.errors.legacy_id": {
    en: "That identifier is not a current supplement ID. Send a recognised supplement name instead.",
    th: "รหัสนี้ไม่ใช่รหัสสารอาหารปัจจุบัน ส่งชื่อสารอาหารที่ระบบรู้จักแทน",
    "zh-CN": "该标识不是当前补充剂 ID。请改用已识别的补充剂名称。"
  },
  "mcp.errors.unknown_supplement": {
    en: "Unknown supplement name. Use a recognised name such as Folate, Vitamin D3 or Creatine.",
    th: "ไม่รู้จักชื่อสารอาหารนี้ ใช้ชื่อที่ระบบรู้จัก เช่น Folate Vitamin D3 หรือ Creatine",
    "zh-CN": "未知补充剂名称。请使用已识别的名称，例如 Folate、Vitamin D3 或 Creatine。"
  },
  "mcp.errors.not_found": {
    en: "Not found.",
    th: "ไม่พบรายการ",
    "zh-CN": "未找到。"
  },
  "mcp.errors.plan_not_ready": {
    en: "This plan is not ready to execute.",
    th: "แผนนี้ยังไม่พร้อมสร้างคำสั่งซื้อ",
    "zh-CN": "该方案尚未准备好执行。"
  },
  "mcp.errors.positive_number_required": {
    en: "Amount must be greater than zero.",
    th: "ปริมาณต้องมากกว่าศูนย์",
    "zh-CN": "数量必须大于零。"
  },
  "mcp.errors.rate_limited": {
    en: "Too many requests. Retry after pollAfterSeconds.",
    th: "คำขอมากเกินไป ลองใหม่ตามช่วงเวลาที่กำหนด",
    "zh-CN": "请求过多。请在 pollAfterSeconds 后重试。"
  },
  "mcp.errors.required": {
    en: "A required field is missing or invalid.",
    th: "ข้อมูลที่จำเป็นขาดหรือไม่ถูกต้อง",
    "zh-CN": "必填字段缺失或无效。"
  },
  "mcp.errors.revision_conflict": {
    en: "The plan revision is stale. Reload the latest revision.",
    th: "แผนนี้ไม่ใช่ฉบับล่าสุด โหลดฉบับปัจจุบันอีกครั้ง",
    "zh-CN": "方案版本已过期。请重新加载最新版本。"
  },
  "mcp.errors.stale_safety_acknowledgement": {
    en: "safetyAcknowledgement.revision does not match the current plan revision. Reload the latest revision and resubmit the acknowledgement.",
    th: "safetyAcknowledgement.revision ไม่ตรงกับแผนฉบับปัจจุบัน โหลดฉบับล่าสุดแล้วส่งการยืนยันใหม่",
    "zh-CN": "safetyAcknowledgement.revision 与当前方案版本不一致。请重新加载最新版本并再次提交确认。"
  },
  "mcp.errors.temporarily_unavailable": {
    en: "The service is temporarily unavailable.",
    th: "บริการไม่พร้อมชั่วคราว",
    "zh-CN": "服务暂时不可用。"
  },
  "mcp.errors.unexpected_property": {
    en: "Unexpected property.",
    th: "มีฟิลด์ที่ไม่รองรับ",
    "zh-CN": "存在未预期的字段。"
  },
  "mcp.errors.unsafe_content": {
    en: "Feedback cannot include secrets, contact details or a conversation transcript.",
    th: "ความคิดเห็นต้องไม่มีข้อมูลลับ รายละเอียดติดต่อ หรือบทสนทนา",
    "zh-CN": "反馈不得包含密钥、联系方式或对话记录。"
  },
  "mcp.errors.unsupported_country": {
    en: "We cannot deliver to that country yet.",
    th: "เรายังจัดส่งไปประเทศนั้นไม่ได้",
    "zh-CN": "我们暂时无法配送到该国家/地区。"
  },
  "mcp.cannot_deliver": {
    en: "We cannot deliver to {destination} yet. MattaNutra currently delivers to {served}.",
    th: "เรายังจัดส่งไป{destination}ไม่ได้ ขณะนี้ MattaNutra จัดส่งไปที่ {served}",
    "zh-CN": "我们暂时无法配送到{destination}。MattaNutra 目前配送到 {served}。"
  },
  "mcp.errors.unsupported_currency": {
    en: "Currency must match the destination market.",
    th: "สกุลเงินต้องตรงกับตลาดปลายทาง",
    "zh-CN": "货币必须与目的地市场一致。"
  },
  "mcp.unsupported_currency_detail": {
    en: "Currency must be {currency} for {market}.",
    th: "สกุลเงินสำหรับ {market} ต้องเป็น {currency}",
    "zh-CN": "{market} 必须使用 {currency}。"
  },
  "mcp.errors.unsupported_unit": {
    en: "This supplement does not accept that unit.",
    th: "สารอาหารนี้ไม่รับหน่วยดังกล่าว",
    "zh-CN": "该补充剂不接受此单位。"
  },
  "order.not_found": {
    en: "Order not found.",
    th: "ไม่พบคำสั่งซื้อ",
    "zh-CN": "未找到订单。"
  },
  "order.open_unpaid": {
    en: "Checkout is ready. Payment has not been confirmed yet.",
    th: "พร้อมชำระเงินแล้วยังไม่ยืนยันการจ่าย",
    "zh-CN": "结账已就绪。付款尚未确认。"
  },
  "order.paid": {
    en: "Payment is confirmed.",
    th: "ยืนยันการชำระเงินแล้ว",
    "zh-CN": "付款已确认。"
  },
  "order.payment_declined_retry": {
    en: "Payment was declined. The same checkout can be retried.",
    th: "การชำระเงินถูกปฏิเสธ สามารถใช้ลิงก์เดิมลองใหม่ได้",
    "zh-CN": "付款被拒绝。可以使用同一结账链接重试。"
  },
  "order.processing": {
    en: "Payment is processing. Poll again after pollAfterSeconds.",
    th: "กำลังดำเนินการชำระเงิน รอแล้วตรวจสอบอีกครั้ง",
    "zh-CN": "付款处理中。请在 pollAfterSeconds 后再次查询。"
  },
  "order.cancelled": {
    en: "This order was cancelled before payment.",
    th: "คำสั่งซื้อนี้ถูกยกเลิกก่อนชำระเงิน",
    "zh-CN": "该订单在付款前已取消。"
  },
  "order.expired": {
    en: "This order expired before payment.",
    th: "คำสั่งซื้อหมดอายุก่อนชำระเงิน",
    "zh-CN": "该订单在付款前已过期。"
  },
  "order.refunded": {
    en: "This order was refunded.",
    th: "คำสั่งซื้อนี้ได้รับการคืนเงินแล้ว",
    "zh-CN": "该订单已退款。"
  },
  "plan.question.accept_gap": {
    en: "Accept this uncovered target and continue?",
    th: "ยอมรับเป้าหมายที่ยังไม่ครบแล้วไปต่อหรือไม่",
    "zh-CN": "是否接受该未覆盖目标并继续？"
  },
  "plan.question.algae_only": {
    en: "Search algae-only Omega-3 sources?",
    th: "ค้นหา Omega-3 จากสาหร่ายเท่านั้นหรือไม่",
    "zh-CN": "是否只搜索藻类来源的 Omega-3？"
  },
  "plan.question.relax_plant_based": {
    en: "Relax the plant-based constraint to include non-plant products?",
    th: "ผ่อนปรนข้อจำกัดแบบพืชเพื่อรวมสินค้าอื่นหรือไม่",
    "zh-CN": "是否放宽植物来源限制以包含非植物产品？"
  },
  "plan.question.remove_target": {
    en: "Remove this nutrient from the request?",
    th: "ลบสารอาหารนี้ออกจากคำขอหรือไม่",
    "zh-CN": "是否从请求中移除该营养素？"
  },
  "plan.question.safety_review": {
    en: "Review the safety facts and confirm with the person first.",
    th: "ตรวจทานข้อมูลความปลอดภัยแล้วยืนยันกับผู้ใช้ก่อน",
    "zh-CN": "请先查看安全说明并确认，然后我们才会冻结结账。"
  },
  "plan.question.relax_max_price": {
    en: "This stack is over the price cap. Raise the budget, or pick a cheaper complete option?",
    th: "สูตรนี้เกินงบ ต้องการเพิ่มงบหรือเลือกสูตรที่ถูกกว่าหรือไม่",
    "zh-CN": "该组合超出价格上限。要提高预算，还是选择更便宜的完整方案？"
  },
  "plan.question.relax_max_pills": {
    en: "This stack is over the daily pill cap. Raise the limit, or pick a lower-pill option?",
    th: "สูตรนี้เกินจำนวนเม็ดต่อวัน ต้องการเพิ่มขีดจำกัดหรือเลือกสูตรที่เม็ดน้อยกว่าหรือไม่",
    "zh-CN": "该组合超出每日粒数上限。要提高限制，还是选择粒数更少的方案？"
  },
  "plan.question.select_option": {
    en: "Use this complete option instead.",
    th: "ใช้สูตรสำเร็จรูปนี้แทน",
    "zh-CN": "改用这个完整方案。"
  },
  "plan.question.drop_retain": {
    en: "Drop this retained product so matching can continue?",
    th: "ลบสินค้าที่ต้องการคงไว้นี้ออกเพื่อให้จับคู่ต่อได้หรือไม่",
    "zh-CN": "是否取消保留该产品以便继续匹配？"
  },
  "plan.summary.blocked": {
    en: "This stack is blocked until a hard constraint or safety choice is changed.",
    th: "สูตรนี้ถูกบล็อกจนกว่าจะเปลี่ยนข้อจำกัดหรือตัวเลือกความปลอดภัย",
    "zh-CN": "在客户更改硬性限制或安全选择之前，该组合被阻止。"
  },
  "plan.question.acknowledge_safety": {
    en: "Confirm the safety facts",
    th: "ยืนยันข้อมูลความปลอดภัย",
    "zh-CN": "确认安全说明"
  },
  "plan.summary.needs_input": {
    en: "One more choice is needed before this stack is ready to buy.",
    th: "สูตรพร้อมแล้ว โปรดยืนยันกับผู้ใช้ก่อน",
    "zh-CN": "购买前还需要客户做一个选择。"
  },
  "plan.summary.processing": {
    en: "Matching is still running. Poll this plan until status is ready, needs_input, or blocked.",
    th: "กำลังจับคู่อยู่ ตรวจสอบแผนนี้จนกว่าสถานะจะเป็น ready, needs_input หรือ blocked",
    "zh-CN": "仍在匹配中。请轮询此方案，直到状态为 ready、needs_input 或 blocked。"
  },
  "plan.summary.ready": {
    en: "A purchasable stack is ready. Confirm with the person first.",
    th: "สูตรพร้อมซื้อแล้ว โปรดยืนยันกับผู้ใช้ก่อน",
    "zh-CN": "可购买组合已就绪。请先与当事人确认。"
  },
  "plan.question.unassessed_medical_context": {
    en: "This medication or condition is outside the codes MattaNutra can assess. Continue without that assessment?",
    th: "รายการนี้ไม่อยู่ในรหัสที่ประเมินได้ ต้องการไปต่อโดยไม่ประเมินหรือไม่",
    "zh-CN": "该用药或状况不在可评估代码内。是否在不评估的情况下继续？"
  },
  "plan.question.acknowledge_unassessed": {
    en: "Continue without that assessment",
    th: "ไปต่อโดยไม่ประเมิน",
    "zh-CN": "不评估并继续"
  },
  "plan.selection.covers_target": {
    en: "This product covers a requested nutrient.",
    th: "สินค้านี้ครอบคลุมสารอาหารที่ขอ",
    "zh-CN": "该产品覆盖所请求的营养素。"
  },
  "plan.selection.reduces_pills": {
    en: "This product keeps the daily pill count lower.",
    th: "สินค้านี้ช่วยให้จำนวนเม็ดต่อวันต่ำลง",
    "zh-CN": "该产品有助于降低每日粒数。"
  },
  "plan.option.fewest_pills": {
    en: "Fewer daily pills",
    th: "เม็ดต่อวันน้อยกว่า",
    "zh-CN": "更少的每日粒数"
  },
  "plan.option.lowest_cost": {
    en: "Lower cost",
    th: "ค่าใช้จ่ายต่ำกว่า",
    "zh-CN": "更低费用"
  },
  "plan.option.highest_coverage": {
    en: "Higher coverage",
    th: "ครอบคลุมมากกว่า",
    "zh-CN": "更高覆盖"
  },
  "plan.option.balanced": {
    en: "Balanced stack",
    th: "สมดุลทั้งค่าใช้จ่ายและเม็ด",
    "zh-CN": "更均衡的组合"
  },
  "mcp.errors.invalid_request": {
    en: "The request is not valid.",
    th: "คำขอไม่ถูกต้อง",
    "zh-CN": "请求无效。"
  },
  "mcp.errors.stale_revision": {
    en: "This plan changed. Reload the current plan and retry.",
    th: "แผนนี้มีการเปลี่ยนแปลง โหลดแผนปัจจุบันแล้วลองใหม่",
    "zh-CN": "方案已变更。请重新加载当前方案后再试。"
  },
  "support.acknowledgement": {
    en: "Your message is recorded. The case is open and has not yet been reviewed.",
    th: "บันทึกข้อความแล้ว เคสเปิดอยู่และยังไม่ได้รับการตรวจทาน",
    "zh-CN": "已记录你的消息。工单已打开，尚未人工审阅。"
  }
};

export function negotiateLocale(value: unknown): Locale {
  if (typeof value === "string") {
    if (value === "zh" || value.toLowerCase().startsWith("zh")) {
      return "zh-CN";
    }

    if (isLocale(value)) {
      return value;
    }

    const base = value.split("-")[0];

    if (base === "th") {
      return "th";
    }
  }

  return "en";
}

export function agenticMessage(
  locale: Locale,
  key: string,
  vars?: Readonly<Record<string, string | number>>
) {
  const entry = MESSAGES[key];

  if (!entry) {
    return key;
  }

  let text = entry[locale] ?? entry.en;

  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }

  return text;
}

export function hasAgenticMessage(key: string) {
  return Boolean(MESSAGES[key]);
}

export function agenticMessageKeys() {
  return Object.keys(MESSAGES).sort();
}
