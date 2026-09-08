import type { Locale } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n";

export const AGENTIC_LOCALES = ["en", "th", "zh-CN"] as const;

const MESSAGES: Record<string, Record<(typeof AGENTIC_LOCALES)[number], string>> = {
  "plan.option.target_focused": { "en": "A product focused on requested nutrients. Compare its dose coverage and labelled serving; unknown pill counts remain unknown.", "th": "ผลิตภัณฑ์ที่เน้นสารอาหารตามเป้าหมาย เปรียบเทียบความครอบคลุมของปริมาณและหน่วยบริโภคตามฉลาก หากไม่ทราบจำนวนเม็ดจะยังระบุว่าไม่ทราบ", "zh-CN": "侧重所请求营养素的产品。请比较剂量覆盖和标签份量；未知的每日片数仍标为未知。" },
  "guidance.reference_unknown": { "en": "An applicable reference limit for {nutrientName} is unavailable. Exposure cannot be verified as below a limit; this is missing information, not a measured limit breach. Review the available facts; purchase remains available.", "th": "ไม่มีค่าอ้างอิงที่ใช้ได้สำหรับ {nutrientName} จึงยืนยันไม่ได้ว่าปริมาณต่ำกว่าขีดจำกัด นี่คือข้อมูลที่ขาด ไม่ใช่การยืนยันว่าเกินขีดจำกัด โปรดตรวจสอบข้อมูลที่มี โดยยังซื้อได้", "zh-CN": "缺少适用于 {nutrientName} 的参考限值，无法确认摄入量低于限值。这表示信息不足，并非已测得超标。请查看现有资料，仍可购买。" },
  "guidance.references_unknown": { "en": "Applicable reference limits are unavailable for {nutrients}. Exposure cannot be verified as below those limits. These are information gaps, not measured limit breaches; full advice and sources remain in details. Purchase remains available.", "th": "ไม่มีค่าอ้างอิงที่ใช้ได้สำหรับ {nutrients} จึงยืนยันไม่ได้ว่าปริมาณต่ำกว่าขีดจำกัด เป็นช่องว่างของข้อมูล ไม่ใช่การยืนยันว่าเกินขีดจำกัด ดูคำแนะนำและแหล่งข้อมูลทั้งหมดในรายละเอียด โดยยังซื้อได้", "zh-CN": "缺少适用于 {nutrients} 的参考限值，无法确认摄入量低于这些限值。这些是信息缺口，并非已测得超标；详情保留完整建议和来源，仍可购买。" },
  "guidance.reference_unverified_uncertainty": {"en": "This reference has not been verified as an authoritative limit for this population and form. Treat the threshold as provisional advice and review its source and rationale; it is not medical approval.", "th": "ยังไม่ได้ยืนยันว่าค่าอ้างอิงนี้เป็นขีดจำกัดที่มีหลักฐานเชื่อถือได้สำหรับกลุ่มประชากรและรูปแบบนี้ ให้ถือเกณฑ์เป็นคำแนะนำเบื้องต้นและตรวจสอบแหล่งข้อมูลกับเหตุผล ไม่ใช่การรับรองทางการแพทย์", "zh-CN": "此参考值尚未核实为适用于该人群及营养素形式的权威限值。请将其视为暂定建议，并审查来源和依据；这并非医疗认可。"},
  "plan.matching.targets_already_covered": {"en": "The quantified current intake already meets the requested targets. No new product is recommended; this does not establish medical suitability.", "th": "ปริมาณปัจจุบันที่ทราบเพียงพอต่อเป้าหมายที่ขอ จึงไม่แนะนำผลิตภัณฑ์ใหม่ แต่ไม่ได้ยืนยันความเหมาะสมทางการแพทย์", "zh-CN": "已量化的当前摄入量达到所请求的目标，因此不推荐新增产品；这并不表示医疗适用性已获确认。"},
  "plan.matching.empty_closest_fit": {"en": "The empty basket has the closest dose fit among evaluated choices. No evaluated purchase option improves the default dose-fit priority; review its dose deviations and applicable limit excess. Review any returned purchase alternative and its gaps and advice.", "th": "ตะกร้าว่างมีปริมาณใกล้เป้าหมายที่สุดในตัวเลือกที่ประเมิน ไม่มีตัวเลือกซื้อที่ประเมินแล้วปรับปรุงลำดับความเหมาะสมของปริมาณเริ่มต้น โปรดตรวจสอบความเบี่ยงเบนของปริมาณและส่วนที่เกินค่าอ้างอิง โปรดพิจารณาทางเลือกที่ซื้อได้พร้อมส่วนที่ขาดและคำแนะนำ", "zh-CN": "在已评估的选项中，空购物篮的剂量最接近目标。没有已评估的购买选项能改善默认剂量匹配优先级；请查看剂量偏差及超出适用参考限值的部分。请查看返回的购买替代方案、缺口及建议。"},
  "plan.matching.catalogue_empty": {"en": "This catalogue snapshot contains no product listings to evaluate. No nutritional adequacy or safety conclusion follows from an empty basket.", "th": "แค็ตตาล็อกชุดนี้ไม่มีรายการผลิตภัณฑ์ให้ประเมิน ตะกร้าว่างไม่ได้ยืนยันความเพียงพอทางโภชนาการหรือความปลอดภัย", "zh-CN": "此目录快照中没有可评估的产品条目。空购物篮不能说明营养充足或安全。"},
  "plan.matching.no_eligible_products": {"en": "No catalogue product meets the operational and explicit product requirements. Review the returned rejection counts and discuss relevant product exclusions or form preferences; health advice and numeric preferences did not reject products.", "th": "ไม่มีผลิตภัณฑ์ในแค็ตตาล็อกที่ผ่านข้อกำหนดการขายและผลิตภัณฑ์ที่ระบุ โปรดตรวจสอบสาเหตุและพูดคุยเรื่องผลิตภัณฑ์ที่ยกเว้นหรือรูปแบบที่ต้องการ คำแนะนำสุขภาพและค่าตัวเลขที่ต้องการไม่ได้ใช้ตัดผลิตภัณฑ์", "zh-CN": "没有目录产品符合操作条件及明确的产品要求。请查看返回的排除原因，并讨论相关产品排除或剂型要求；健康建议和数值偏好未用于排除产品。"},
  "plan.matching.no_supported_quantities": {"en": "No physically supported product quantity was generated for these targets from this snapshot. Review target identity, verified label amounts and explicit product requirements. Unknown intake remains unknown.", "th": "ไม่สามารถสร้างปริมาณผลิตภัณฑ์ที่วัดได้จริงสำหรับเป้าหมายเหล่านี้จากข้อมูลชุดนี้ โปรดตรวจสอบสารอาหาร ปริมาณที่ยืนยันบนฉลาก และข้อกำหนดผลิตภัณฑ์ ปริมาณที่ไม่ทราบยังคงไม่ทราบ", "zh-CN": "此快照未能为这些目标生成具有实际计量依据的产品用量。请检查目标名称、已核实的标签数量及明确产品要求。未知摄入量仍为未知。"},
  "plan.matching.no_evaluated_purchase": {"en": "The completed evaluation produced no nonempty purchase choice. Review the target-level candidate counts and refine only the requirements the customer wants to change. Do not infer a health block or nutritional adequacy.", "th": "การประเมินที่เสร็จแล้วไม่มีตัวเลือกซื้อที่มีผลิตภัณฑ์ โปรดดูจำนวนตัวเลือกต่อเป้าหมายและปรับเฉพาะข้อกำหนดที่ลูกค้าต้องการเปลี่ยน อย่าสรุปว่าเป็นการปิดกั้นด้านสุขภาพหรือได้รับสารอาหารเพียงพอ", "zh-CN": "已完成的评估未产生非空购买选项。请查看每项目标的候选数量，仅调整客户希望更改的要求。不能推断存在健康限制或营养已充足。"},
  "plan.matching.search_incomplete": {"en": "No purchase choice was established within the search performed. This is an incomplete search, not proof that no combination exists. Expand search when available or discuss a specific refinement.", "th": "ยังไม่พบตัวเลือกซื้อในการค้นหาที่ดำเนินการ การค้นหายังไม่ครบ ไม่ได้พิสูจน์ว่าไม่มีชุดผลิตภัณฑ์ ใช้การค้นหาเพิ่มเติมเมื่อทำได้หรือหารือการปรับคำขอที่เฉพาะเจาะจง", "zh-CN": "已进行的搜索尚未确定购买选项。搜索尚未完成，不能证明不存在组合。可用时扩大搜索，或讨论具体调整。"},
  "plan.matching.purchase_options_available": {"en": "Evaluated purchase options are available. Compare dose fit, target gaps, health advice and numeric preference differences before confirming one.", "th": "มีตัวเลือกซื้อที่ประเมินแล้ว เปรียบเทียบปริมาณ ส่วนที่ขาด คำแนะนำสุขภาพ และความแตกต่างจากค่าที่ต้องการก่อนยืนยัน", "zh-CN": "已有可购买的评估选项。确认前请比较剂量匹配、目标缺口、健康建议及数值偏好差异。"},
  "plan.matching.explanation_unavailable": {"en": "This saved result does not include a candidate trace explaining its empty basket. Refresh or revise the saved request to obtain a current explanation; do not infer nutritional adequacy or a health block.", "th": "ผลที่บันทึกนี้ไม่มีข้อมูลการประเมินตัวเลือกเพื่ออธิบายตะกร้าว่าง โปรดรีเฟรชหรือแก้ไขคำขอเดิมเพื่อรับคำอธิบายปัจจุบัน อย่าสรุปว่าได้รับสารอาหารเพียงพอหรือถูกปิดกั้นด้านสุขภาพ", "zh-CN": "此已保存结果缺少解释空购物篮的候选评估记录。请刷新或修订已保存请求以获取当前说明；不能推断营养已充足或存在健康限制。"},
  "discovery.conversation": {"en": "Agree the nutrient amounts and whether they mean total daily intake or supplement-only intake before creating the plan. Numeric count and price preferences are advisory; explain trade-offs and retain reported health context.", "th": "ตกลงปริมาณสารอาหารและระบุว่าเป็นปริมาณรวมต่อวันหรือเฉพาะอาหารเสริมก่อนสร้างแผน จำนวนผลิตภัณฑ์ จำนวนเม็ด และราคาที่ต้องการเป็นคำแนะนำ โปรดอธิบายข้อแลกเปลี่ยนและเก็บข้อมูลสุขภาพที่แจ้งไว้", "zh-CN": "创建方案前，请确认营养素数量及其指每日总摄入量还是仅补充剂摄入量。数量和价格偏好仅供参考；说明取舍并保留已报告的健康信息。"},
  "plan.preference.product_count": {"en": "product count", "th": "จำนวนผลิตภัณฑ์", "zh-CN": "产品数量"},
  "plan.preference.daily_pills": {"en": "daily pill count", "th": "จำนวนเม็ดต่อวัน", "zh-CN": "每日药丸数量"},
  "plan.preference.first_order_goods_price": {"en": "first-order goods price", "th": "ราคาสินค้าในการสั่งซื้อครั้งแรก", "zh-CN": "首单商品金额"},
  "plan.preference.not_requested": {"en": "No {preference} preference was supplied. This does not restrict purchase.", "th": "ไม่ได้ระบุความต้องการด้าน{preference} จึงไม่จำกัดการซื้อ", "zh-CN": "未提供{preference}偏好，不限制购买。"},
  "plan.source.algae_alias_clarification": { en: "Algae Omega-3 needs an explicit algae_only source choice to resolve as Omega-3. Your source and dietary choices have been preserved. If algae is intended, patch omega3SourcePreference to algae_only; otherwise use Omega-3 with your agreed source. Other targets and purchase options remain available.", th: "ชื่อ Algae Omega-3 ต้องระบุแหล่ง algae_only อย่างชัดเจนจึงจะจับคู่กับ Omega-3 ได้ ระบบเก็บข้อกำหนดแหล่งที่มาและอาหารเดิมไว้ หากต้องการสาหร่าย ให้แก้ omega3SourcePreference เป็น algae_only มิฉะนั้นใช้ Omega-3 พร้อมแหล่งที่ตกลงกัน เป้าหมายอื่นและตัวเลือกซื้อยังใช้ได้", "zh-CN": "Algae Omega-3 需要明确选择 algae_only 来源才能解析为 Omega-3。已保留您的来源和饮食要求。如需藻类，请将 omega3SourcePreference 修改为 algae_only；否则请使用 Omega-3 并保留约定来源。其他目标和购买选项仍可使用。" },
  "plan.preference.unknown_lower_bound": { en: "The {preference} is at least {lowerBound} {unit}; the total is unknown. Your preference is {preferred} {unit}. Review this advice; selection and purchase remain available.", th: "{preference} มีอย่างน้อย {lowerBound} {unit} แต่ยังไม่ทราบยอดรวม ความต้องการของคุณคือ {preferred} {unit} โปรดพิจารณาคำแนะนำนี้ โดยยังเลือกและซื้อได้", "zh-CN": "{preference}至少为 {lowerBound} {unit}，总量未知。您的偏好为 {preferred} {unit}。请查看此建议，仍可选择和购买。" },
  "plan.preference.unknown": {"en": "The {preference} preference is {preferred} {unit}; the actual amount is unknown. Review the available facts; purchase remains available.", "th": "ความต้องการด้าน{preference} คือ {preferred} {unit} แต่ยังไม่ทราบจำนวนจริง โปรดตรวจสอบข้อมูลที่มี โดยยังซื้อได้", "zh-CN": "{preference}偏好为 {preferred} {unit}，实际数值未知。请查看已有资料，仍可购买。"},
  "plan.preference.within_preference": {"en": "The {preference} is {actual} {unit}, within the stated preference of {preferred} {unit}. This is a preference comparison, not medical approval.", "th": "{preference} เท่ากับ {actual} {unit} อยู่ภายในความต้องการที่ระบุ {preferred} {unit} เป็นการเปรียบเทียบความต้องการ ไม่ใช่การรับรองทางการแพทย์", "zh-CN": "{preference}为 {actual} {unit}，在偏好值 {preferred} {unit} 以内。这是偏好比较，并非医疗认可。"},
  "plan.preference.above_preference": {"en": "The {preference} is {actual} {unit}, above the stated preference of {preferred} {unit}. Review this trade-off; it does not prevent selection or purchase.", "th": "{preference} เท่ากับ {actual} {unit} มากกว่าความต้องการที่ระบุ {preferred} {unit} โปรดพิจารณาข้อแลกเปลี่ยนนี้ โดยยังเลือกและซื้อได้", "zh-CN": "{preference}为 {actual} {unit}，超过偏好值 {preferred} {unit}。请评估此取舍，不妨碍选择或购买。"},
  "guidance.estimated_limit_uncertainty": {
    en: "This advice uses a possible exposure up to {amount} {unit} from reported estimates. It is not a measured total; unknown intake remains unquantified.",
    th: "คำแนะนำนี้ใช้ปริมาณที่อาจได้รับสูงสุด {amount} {unit} จากค่าประมาณที่รายงาน ไม่ใช่ปริมาณรวมที่วัดได้ และปริมาณที่ไม่ทราบยังไม่ถูกนำมาคำนวณ",
    "zh-CN": "此建议使用报告估计值中最高可能达到 {amount} {unit} 的摄入量，并非实测总量；未知摄入量仍未量化。"
  },
  "guidance.unverified_product_facts": {
    en: "Some product quantities or label facts are unverified. Treat reported amounts as provisional; missing physical units, pill counts and supply duration remain unknown. Conflicting nutrient mappings do not establish coverage. Review the label evidence before relying on these amounts.",
    th: "ปริมาณหรือข้อมูลฉลากบางส่วนยังไม่ได้รับการยืนยัน ให้ถือปริมาณที่รายงานเป็นข้อมูลเบื้องต้น หน่วยจริง จำนวนเม็ด และระยะเวลาที่ใช้ได้ซึ่งขาดข้อมูลยังไม่ทราบ การจับคู่สารอาหารที่ขัดแย้งกันไม่ยืนยันความครอบคลุม โปรดตรวจสอบหลักฐานบนฉลากก่อนใช้ปริมาณเหล่านี้",
    "zh-CN": "部分产品用量或标签资料尚未核实。所列数值仅为暂定信息；缺少的实际单位、药丸数量及可用天数仍属未知。存在冲突的营养素对应关系不计入覆盖。依赖这些数值前请核查标签依据。"
  },
  "guidance.incomplete_information": {
    en: "Some health or intake information is unknown or estimated. The quantities shown do not establish complete exposure or medical suitability; discuss relevant uncertainties with a clinician or pharmacist before use.",
    th: "ข้อมูลสุขภาพหรือปริมาณที่รับประทานบางส่วนยังไม่ทราบหรือเป็นค่าประมาณ ปริมาณที่แสดงไม่ยืนยันปริมาณรวมทั้งหมดหรือความเหมาะสมทางการแพทย์ ควรปรึกษาแพทย์หรือเภสัชกรเกี่ยวกับความไม่แน่นอนที่เกี่ยวข้องก่อนใช้",
    "zh-CN": "部分健康或摄入信息未知或为估计值。所示数量不能确认完整总摄入量或医疗适用性；使用前请与医生或药师讨论相关不确定性。"
  },
  "guidance.incomplete_information_uncertainty": {
    en: "Unknown intake is not zero. Reported estimates are not verified measurements.",
    th: "ปริมาณที่ไม่ทราบไม่ได้หมายถึงศูนย์ ค่าประมาณที่รายงานไม่ใช่ค่าที่วัดและตรวจสอบแล้ว",
    "zh-CN": "未知摄入量不等于零。报告的估计值并非经核实的测量值。"
  },
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
  "guidance.continued_dose_increased": {
    en: "The selected products increase {nutrientName} from your reported {threshold} to {exposure} {unit} per day. Review this increase. The reference is your existing dose, not a medical maximum.",
    th: "สินค้าที่เลือกเพิ่ม {nutrientName} จากปริมาณที่คุณแจ้ง {threshold} เป็น {exposure} {unit} ต่อวัน โปรดทบทวนการเพิ่มนี้ ปริมาณอ้างอิงคือขนาดที่คุณใช้อยู่ ไม่ใช่ขีดจำกัดทางการแพทย์",
    "zh-CN": "所选产品将 {nutrientName} 从你报告的每日 {threshold} 增加到 {exposure} {unit}。请考虑这一增量。参考值是你现有的剂量，并非医学上限。"
  },
  "guidance.continued_dose_uncertainty": {
    en: "This comparison uses your reported continued dose and available product facts. It does not establish that either dose is medically appropriate.",
    th: "การเปรียบเทียบนี้ใช้ขนาดที่คุณแจ้งว่าใช้อยู่และข้อมูลสินค้าที่มี ไม่ได้ยืนยันว่าขนาดใดเหมาะสมทางการแพทย์",
    "zh-CN": "此比较使用你报告的现有剂量和可用的产品资料，不能证明任一剂量在医学上适合你。"
  },
  "guidance.dose_review_required_remaining_zero": {
    en: "{nutrientName} remaining allowed is 0 {unit} because of a declared condition. Next action: {nextAction}.",
    th: "{nutrientName} ปริมาณที่ยังได้รับอนุญาตคือ 0 {unit} เนื่องจากภาวะที่แจ้งไว้ ขั้นตอนถัดไป: {nextAction}",
    "zh-CN": "因已声明的健康状况，{nutrientName} 剩余允许量为 0 {unit}。下一步：{nextAction}。"
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
  "mcp.errors.open_query": {
    en: "Evidence does not accept an open query.",
    th: "หลักฐานไม่รับคำค้นแบบเปิด",
    "zh-CN": "证据工具不接受开放查询。"
  },
  "mcp.errors.unreferenced_claim": {
    en: "That claim is not attached to this plan.",
    th: "ข้อกล่าวอ้างนี้ไม่ได้ผูกกับแผนนี้",
    "zh-CN": "该声明未附加到此方案。"
  },
  "mcp.errors.wrong_purpose": {
    en: "This handle cannot be used for that action.",
    th: "รหัสนี้ใช้กับการกระทำนั้นไม่ได้",
    "zh-CN": "此句柄不能用于该操作。"
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
  "mcp.errors.SERVICE_DEADLINE_EXCEEDED": {
    en: "The service deadline was exceeded before a terminal response.",
    th: "บริการหมดเวลาภายในก่อนส่งผลลัพธ์สุดท้าย",
    "zh-CN": "服务在返回最终响应前已超过内部截止时间。"
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
  "mcp.errors.too_short": {
    en: "This value is too short.",
    th: "ค่านี้น้อยเกินไป",
    "zh-CN": "该值过短。"
  },
  "mcp.errors.request_too_broad": {
    en: "This request is too broad. Split it into smaller groups.",
    th: "คำขอกว้างเกินไป โปรดแยกเป้าหมายเป็นกลุ่มย่อย",
    "zh-CN": "该请求范围过宽。请拆成更小的目标组。"
  },
  "plan.summary.request_too_broad": {
    en: "This request is too broad. Split it into smaller groups of targets.",
    th: "คำขอกว้างเกินไป โปรดแยกเป้าหมายเป็นกลุ่มย่อยแล้วส่งใหม่",
    "zh-CN": "该请求范围过宽。请把目标拆成更小的组后再继续。"
  },
  "plan.question.split_request": {
    en: "Split this request into smaller target groups?",
    th: "ต้องการแยกคำขอเป็นกลุ่มเป้าหมายย่อยหรือไม่",
    "zh-CN": "是否把该请求拆成更小的目标组？"
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
  "order.fulfilment_exception": {
    en: "There is a delivery problem. Contact support for the next step.",
    th: "มีปัญหาการจัดส่ง กรุณาติดต่อฝ่ายสนับสนุน",
    "zh-CN": "配送出现问题，请联系支持以获取下一步。"
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
  "plan.question.accept_gap_named": {
    en: "Accept remaining {name} gap",
    th: "ยอมรับส่วนที่ยังขาดของ {name}",
    "zh-CN": "接受剩余的 {name} 缺口"
  },
  "plan.question.remove_target_named": {
    en: "Remove {name} from the request",
    th: "ลบ {name} ออกจากคำขอ",
    "zh-CN": "从请求中移除 {name}"
  },
  "plan.question.unresolved_targets": {
    en: "Review remaining gaps for {names}.",
    th: "ตรวจทานส่วนที่ยังไม่ครบสำหรับ {names}",
    "zh-CN": "请复查 {names} 的剩余缺口。"
  },
  "plan.selection.in_selected_stack": {
    en: "This product is in the selected stack.",
    th: "สินค้านี้เป็นส่วนหนึ่งของสูตรที่เลือก",
    "zh-CN": "该产品在已选组合中。"
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
    en: "This stack cannot proceed until the unresolved request constraints are addressed.",
    th: "สูตรนี้ยังดำเนินการต่อไม่ได้จนกว่าจะแก้ไขข้อจำกัดของคำขอที่ค้างอยู่",
    "zh-CN": "请先处理尚未解决的请求限制，再继续此方案。"
  },
  "plan.question.acknowledge_safety": {
    en: "Confirm the safety facts",
    th: "ยืนยันข้อมูลความปลอดภัย",
    "zh-CN": "确认安全说明"
  },
  "plan.summary.needs_input": {
    en: "One more choice is needed before this stack is ready to buy.",
    th: "ต้องเลือกเพิ่มเติมก่อนที่สูตรนี้จะพร้อมซื้อ",
    "zh-CN": "购买前还需要客户做一个选择。"
  },
  "plan.summary.processing": {
    en: "Matching is still running. Poll this plan until status is ready, needs_input, no_purchase, or blocked.",
    th: "กำลังจับคู่อยู่ ตรวจสอบแผนนี้จนกว่าสถานะจะเป็น ready, needs_input, no_purchase หรือ blocked",
    "zh-CN": "仍在匹配中。请轮询此方案，直到状态为 ready、needs_input、no_purchase 或 blocked。"
  },
  "plan.summary.no_purchase": {
    en: "No purchase is recommended for this result. Review any remaining target gaps and advice with the person.",
    th: "ผลลัพธ์นี้ไม่แนะนำให้ซื้อเพิ่ม โปรดทบทวนเป้าหมายที่ยังไม่ครบและคำแนะนำกับผู้ใช้",
    "zh-CN": "此结果不建议新增购买。请与用户查看尚未满足的目标及建议。"
  },
  "plan.summary.review_options": {
    en: "The closest dose fit adds no product. Purchasable alternatives are available; review their gaps, excess doses and advice before choosing.",
    th: "ตัวเลือกที่ใกล้ขนาดเป้าหมายที่สุดไม่เพิ่มผลิตภัณฑ์ มีทางเลือกที่ซื้อได้ โปรดทบทวนส่วนที่ยังขาด ปริมาณที่เกิน และคำแนะนำก่อนเลือก",
    "zh-CN": "最接近目标剂量的方案不新增产品。另有可购买的选项；请选择前查看缺口、超出剂量及建议。"
  },
  "plan.summary.current_inventory_covers_now": {
    en: "Nothing needs to be bought now. Current stock covers today; replenish later in the requested horizon.",
    th: "ตอนนี้ยังไม่ต้องซื้อ สต็อกปัจจุบันครอบคลุมวันนี้ และต้องเติมภายหลังในช่วงเวลาที่ขอ",
    "zh-CN": "现在不必购买。当前库存覆盖今天；请在所请求的周期内再补货。"
  },
  "plan.summary.ready": {
    en: "A purchasable stack is ready. Confirm with the person first.",
    th: "สูตรพร้อมซื้อแล้ว โปรดยืนยันกับผู้ใช้ก่อน",
    "zh-CN": "可购买组合已就绪。请先与当事人确认。"
  },
  "plan.question.unknown_prerequisite": {
    en: "Should {name} be treated as confirmed, or left unsatisfied?",
    th: "ต้องการยืนยัน {name} หรือปล่อยให้ยังไม่ครบเงื่อนไข",
    "zh-CN": "应将 {name} 视为已确认，还是保持未满足？"
  },
  "plan.question.satisfy_prerequisite": {
    en: "Mark the prerequisite satisfied",
    th: "ยืนยันว่าเงื่อนไขครบแล้ว",
    "zh-CN": "将前提标为已满足"
  },
  "plan.question.leave_prerequisite": {
    en: "Leave the prerequisite unsatisfied",
    th: "ปล่อยให้เงื่อนไขยังไม่ครบ",
    "zh-CN": "保持前提未满足"
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
  "plan.question.inventory_duration": {
    en: "How many days of {name} do you have left?",
    th: "คุณมี {name} เหลืออีกกี่วัน",
    "zh-CN": "你的 {name} 还剩多少天？"
  },
  "plan.question.inventory_duration_days": {
    en: "{days} days",
    th: "{days} วัน",
    "zh-CN": "{days} 天"
  },
  "plan.question.inventory_duration_unknown": {
    en: "I don't know",
    th: "ฉันไม่ทราบ",
    "zh-CN": "我不知道"
  },
  "plan.summary.current_inventory_duration_unknown": {
    en: "Current coverage is known, but future purchase timing cannot yet be calculated.",
    th: "ทราบความครอบคลุมปัจจุบันแล้ว แต่ยังคำนวณจังหวะการซื้อในอนาคตไม่ได้",
    "zh-CN": "当前覆盖已知，但尚无法计算未来购买时间。"
  },
  "plan.selection.covers_target": {
    en: "This product covers {name} at {amount} {unit} per day.",
    th: "สินค้านี้ให้ {name} {amount} {unit} ต่อวัน",
    "zh-CN": "该产品每天提供 {amount} {unit} {name}。"
  },
  "plan.selection.covers_target_named": {
    en: "This product covers {name}.",
    th: "สินค้านี้ครอบคลุม {name}",
    "zh-CN": "该产品覆盖 {name}。"
  },
  "plan.selection.consolidates_targets": {
    en: "This product covers {names} together.",
    th: "สินค้านี้ครอบคลุม {names} ในรายการเดียว",
    "zh-CN": "该产品同时覆盖 {names}。"
  },
  "plan.selection.best_available_dose": {
    en: "This product is the best available {name} dose and still leaves {gap} {unit}.",
    th: "สินค้านี้เป็นขนาด {name} ที่ทำได้ดีที่สุด และยังขาด {gap} {unit}",
    "zh-CN": "该产品是可获得的最佳 {name} 剂量，仍缺 {gap} {unit}。"
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
  "plan.option.closest_dose": {
    en: "Closest dose fit among the evaluated options",
    th: "ปริมาณใกล้เคียงเป้าหมายที่สุดในตัวเลือกที่ประเมิน",
    "zh-CN": "在已评估选项中，剂量最接近目标"
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
  "plan.option.best_available": {
    en: "Best available match",
    th: "ตัวเลือกที่ใช้ได้ดีที่สุด",
    "zh-CN": "当前最佳可得方案"
  },
  "plan.option.no_distinct_alternative": {
    en: "No distinct alternative",
    th: "ไม่มีตัวเลือกอื่นที่ต่างอย่างมีนัย",
    "zh-CN": "没有实质不同的备选方案"
  },
  "plan.explanation.conditional_next_action": {
    en: "Confirm the remaining prerequisite before buying that nutrient.",
    th: "ยืนยันเงื่อนไขที่ยังค้างก่อนซื้อสารอาหารนั้น",
    "zh-CN": "购买该营养素前请先确认剩余前提。"
  },
  "plan.explanation.answer_questions": {
    en: "Answer the remaining questions to continue.",
    th: "ตอบคำถามที่เหลือเพื่อดำเนินการต่อ",
    "zh-CN": "请回答剩余问题后再继续。"
  },
  "plan.explanation.confirm_with_user": {
    en: "Confirm this option with the user before execute.",
    th: "ยืนยันตัวเลือกนี้กับผู้ใช้ก่อน execute",
    "zh-CN": "执行前请与用户确认此方案。"
  },
  "plan.next_action.poll_plan": {
    en: "Matching is in progress. Check this plan again.",
    th: "กำลังจับคู่ โปรดตรวจสอบแผนนี้อีกครั้ง",
    "zh-CN": "正在匹配，请再次查询此方案。"
  },
  "plan.next_action.answer_questions": {
    en: "Answer the remaining request questions to continue.",
    th: "ตอบคำถามเกี่ยวกับคำขอที่เหลือเพื่อดำเนินการต่อ",
    "zh-CN": "请回答剩余的请求问题后继续。"
  },
  "plan.next_action.change_request": {
    en: "Revise this plan to address the reported request issue.",
    th: "แก้ไขแผนนี้เพื่อจัดการปัญหาของคำขอที่แจ้งไว้",
    "zh-CN": "请修订此方案，处理已报告的请求问题。"
  },
  "plan.next_action.confirm_with_user": {
    en: "Review the advice and confirm this option with the person before checkout. Ready describes purchase readiness, not medical approval.",
    th: "ทบทวนคำแนะนำและยืนยันตัวเลือกนี้กับผู้ใช้ก่อนชำระเงิน ความพร้อมหมายถึงพร้อมซื้อ ไม่ใช่การรับรองทางการแพทย์",
    "zh-CN": "请查看建议并与用户确认此选项，再进入结账。就绪表示可购买，并不代表医学认可。"
  },
  "plan.next_action.replenish_later": {
    en: "Review the advice and the planned replenishment schedule.",
    th: "ทบทวนคำแนะนำและกำหนดการเติมสินค้าที่วางไว้",
    "zh-CN": "请查看建议及计划的补货时间。"
  },
  "plan.next_action.review_options": {
    en: "The closest dose fit adds no products. Review the available purchase options and their dose, price and pill trade-offs; select one to continue.",
    th: "ตัวเลือกที่ใกล้เคียงปริมาณเป้าหมายที่สุดไม่เพิ่มสินค้า โปรดเปรียบเทียบตัวเลือกที่ซื้อได้ ทั้งปริมาณ ราคา และจำนวนเม็ด แล้วเลือกเพื่อดำเนินการต่อ",
    "zh-CN": "最接近目标剂量的建议不添加产品。请比较可购买选项的剂量、价格和药丸数量，选择后继续。"
  },
  "plan.next_action.no_purchase": {
    en: "Review remaining target gaps and advice; no new purchase is recommended.",
    th: "ทบทวนเป้าหมายที่ยังไม่ครบและคำแนะนำ โดยไม่แนะนำให้ซื้อเพิ่ม",
    "zh-CN": "请查看尚未满足的目标及建议；目前不建议新增购买。"
  },
  "plan.next_action.split_request": {
    en: "Split the request using the documented target limit and try again.",
    th: "แบ่งคำขอตามจำนวนเป้าหมายสูงสุดที่ระบุไว้แล้วลองอีกครั้ง",
    "zh-CN": "请按已公布的目标数量上限拆分请求，然后重试。"
  },
  "plan.selection.dedicated_unavailable": {
    en: "A dedicated product was not available, so this covering product is used instead.",
    th: "ไม่มีสินค้าเฉพาะทางที่ใช้ได้ จึงใช้สินค้าที่ครอบคลุมเป้าหมายนี้แทน",
    "zh-CN": "没有可用的专用产品，因此改用这款覆盖产品。"
  },
  "plan.tradeoff.selected": {
    en: "Selected option",
    th: "ตัวเลือกที่เลือก",
    "zh-CN": "已选方案"
  },
  "plan.tradeoff.same": {
    en: "No material difference",
    th: "ไม่ต่างจากตัวเลือกที่เลือก",
    "zh-CN": "与已选方案无实质差别"
  },
  "plan.tradeoff.pills_unknown": {
    en: "Daily pill counts cannot yet be compared because physical unit information is incomplete",
    th: "ยังเปรียบเทียบจำนวนเม็ดต่อวันไม่ได้ เนื่องจากข้อมูลหน่วยของผลิตภัณฑ์ไม่ครบถ้วน",
    "zh-CN": "由于产品的实际单位信息不完整，目前无法比较每日服用粒数"
  },
  "plan.tradeoff.composed": {
    en: "{parts}",
    th: "สรุป: {parts}",
    "zh-CN": "对比：{parts}"
  },
  "plan.tradeoff.price_up": {
    en: "{baht} THB more",
    th: "แพงกว่า {baht} บาท",
    "zh-CN": "贵 {baht} THB"
  },
  "plan.tradeoff.price_down": {
    en: "{baht} THB less",
    th: "ถูกกว่า {baht} บาท",
    "zh-CN": "便宜 {baht} THB"
  },
  "plan.tradeoff.coverage_up": {
    en: "{percent} percentage points higher coverage",
    th: "ครอบคลุมเพิ่ม {percent}%",
    "zh-CN": "覆盖率高 {percent} 个百分点"
  },
  "plan.tradeoff.coverage_down": {
    en: "{percent} percentage points lower coverage",
    th: "ครอบคลุมน้อยกว่า {percent}%",
    "zh-CN": "覆盖率低 {percent} 个百分点"
  },
  "plan.tradeoff.pills_up": {
    en: "{count} more daily units",
    th: "เม็ดต่อวันมากกว่า {count}",
    "zh-CN": "每日多 {count} 粒"
  },
  "plan.tradeoff.pills_up_one": {
    en: "{count} more daily unit",
    th: "มากกว่า {count} เม็ดต่อวัน",
    "zh-CN": "每日多 {count} 粒"
  },
  "plan.tradeoff.pills_down": {
    en: "{count} fewer daily units",
    th: "เม็ดต่อวันน้อยกว่า {count}",
    "zh-CN": "每日少 {count} 粒"
  },
  "plan.tradeoff.pills_down_one": {
    en: "{count} fewer daily unit",
    th: "น้อยกว่า {count} เม็ดต่อวัน",
    "zh-CN": "每日少 {count} 粒"
  },
  "plan.tradeoff.products_up": {
    en: "+{count} more items",
    th: "สินค้ามากกว่า {count} รายการ",
    "zh-CN": "多 {count} 件商品"
  },
  "plan.tradeoff.products_down": {
    en: "{count} fewer items",
    th: "สินค้าน้อยกว่า {count} รายการ",
    "zh-CN": "少 {count} 件商品"
  },
  "plan.compact.when.unknown": {
    en: "current stock duration unknown; do not invent a depletion date",
    th: "ไม่ทราบระยะเวลาสต็อกปัจจุบัน ห้ามสมมติวันหมด",
    "zh-CN": "当前库存天数未知，请勿臆造耗尽日期"
  },
  "plan.compact.when.buy_now": {
    en: "buy the day-zero basket now",
    th: "ซื้อตะกร้าวันที่ศูนย์ตอนนี้",
    "zh-CN": "现在购买首日购物篮"
  },
  "plan.compact.when.no_purchase": {
    en: "no purchase required now",
    th: "ยังไม่ต้องซื้อตอนนี้",
    "zh-CN": "现在无需购买"
  },
  "plan.compact.when.follow_schedule": {
    en: "follow the selected option schedule",
    th: "ทำตามตารางของตัวเลือกที่เลือก",
    "zh-CN": "按所选方案的时间表执行"
  },
  "plan.compact.why.no_purchase": {
    en: "Keep current {name}; no purchase is required now.",
    th: "คง {name} ที่มีอยู่ ไม่ต้องซื้อตอนนี้",
    "zh-CN": "保留现有{name}；现在无需购买。"
  },
  "plan.compact.why.duration_unknown": {
    en: "Current stock is present but days remaining were not given, so depletion and future cash stay unknown.",
    th: "มีสต็อกปัจจุบันแต่ไม่ได้ระบุวันที่เหลือ จึงยังไม่ทราบวันหมดและเงินในอนาคต",
    "zh-CN": "已有当前库存但未给出剩余天数，因此耗尽日期和未来现金仍未知。"
  },
  "plan.compact.why.minimum_core": {
    en: "Cover the core targets with {count} product(s).",
    th: "ครอบคลุมเป้าหมายหลักด้วย {count} รายการ",
    "zh-CN": "用 {count} 件产品覆盖核心目标。"
  },
  "plan.compact.why.selected": {
    en: "This option covers {coveredCount} of {requestedCount} requested targets; {gapCount} remain partial or unresolved.",
    th: "ตัวเลือกนี้ครอบคลุม {coveredCount} จาก {requestedCount} เป้าหมายที่ขอ อีก {gapCount} เป้าหมายยังครอบคลุมบางส่วนหรือยังหาคำตอบไม่ได้",
    "zh-CN": "此方案覆盖所请求的 {requestedCount} 个目标中的 {coveredCount} 个；还有 {gapCount} 个仅部分覆盖或尚未解决。"
  },
  "plan.compact.why.status": {
    en: "Plan status is {status}.",
    th: "สถานะแผนคือ {status}",
    "zh-CN": "方案状态为 {status}。"
  },
  "plan.compact.what.dose": {
    en: "{name}: target {amount} {unit}/day; known current {current}, new {delivered}, quantified total {total}, gap {gap} {unit}",
    th: "{name}: เป้าหมาย {amount} {unit}/วัน; ปริมาณเดิมที่ทราบ {current} เพิ่มใหม่ {delivered} รวมที่วัดได้ {total} ขาด {gap} {unit}",
    "zh-CN": "{name}：目标 {amount} {unit}/日；已知现有量 {current}，新增 {delivered}，量化总量 {total}，缺口 {gap} {unit}"
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
