import type { Locale } from "@/lib/i18n";

const en = {
  title: "Meta campaigns", enabled: "Enabled", disabled: "Disabled", dataset: "Dataset", unspecified: "Unspecified",
  scope: "This section uses the selected date range and the filters below. Counts come from recorded events; missing historical labels remain unspecified.",
  deliveryNote: "Meta accepted means delivery was acknowledged. It does not mean Meta attributed the sale to an ad.",
  reconciliation: "Confirmed payments with a tracking context: {confirmed}. Purchase events recorded: {recorded}. Missing records: {missing}.",
  ids: "Campaign / ad set / ad IDs", campaign: "Campaign", adset: "Ad set", ad: "Ad", search: "Filter by campaign, ad set or ad ID",
  flow: "Flow", language: "Language", all: "All", activity: "Tracked visitor activity", visitors: "Visitors", starts: "Starts",
  completions: "Completions", checkouts: "Checkouts", buyers: "Purchasing visitors", rate: "Purchase rate",
  cohort: "Unique tracking contexts with a PageView in this date range, flow, language and ad group. Each stage counts those visitors once, whether or not earlier stages were recorded. Purchase rate is purchasing visitors ÷ visitors. Cross-browser visits can count separately.",
  sales: "Recorded purchases", type: "Purchase type / offer", plan: "Plan", products: "Products", purchases: "Purchases", revenue: "Purchase value",
  accepted: "Meta accepted", pending: "Pending", failed: "Rejected / suppressed", empty: "No matching records in this date range.",
  salesNote: "Server-confirmed purchases with a tracking context, including purchases without a PageView in this range. Values are gross purchase totals, grouped by currency; refunds and ad spend are not deducted.",
  limit: "Showing up to 200 groups per table. Narrow the date range to see groups outside this limit.",
  ads: "Ad-attributed purchases, spend, CPA and ROAS: Ads reporting not connected. Check these in Meta Ads Manager.",
  delivery: "Event delivery", event: "Event", status: "Delivery status", count: "Count", last: "Last update",
  setup: "Campaign setup", parameters: "Paste into the ad’s URL parameters field", copy: "Copy parameters", copied: "Copied",
  copyFailed: "Copy failed. Select the field and copy manually.", eventsManager: "Open Events Manager",
  setupNote: "Use the production dataset and the standard Purchase event for sales campaigns. For offer-specific reporting, create custom conversions with purchase_type=plan and offer=precision or pro. Use channel=web, retail or mcp to separate flows. DEV_ and UAT_ events are tests; do not use them as production conversion goals."
};

export const metaCampaignCopy: Record<Locale, typeof en> = {
  en,
  th: {
    title: "แคมเปญ Meta", enabled: "เปิดใช้งาน", disabled: "ปิดใช้งาน", dataset: "ชุดข้อมูล", unspecified: "ไม่ระบุ",
    scope: "ส่วนนี้ใช้ช่วงวันที่ที่เลือกและตัวกรองด้านล่าง จำนวนมาจากเหตุการณ์ที่บันทึกไว้ ข้อมูลเก่าที่ไม่มีป้ายกำกับจะแสดงว่าไม่ระบุ",
    deliveryNote: "Meta รับแล้ว หมายถึงระบบยืนยันว่าได้รับเหตุการณ์ ไม่ได้หมายความว่ายอดขายมาจากโฆษณา",
    reconciliation: "การชำระเงินที่ยืนยันแล้วและมีข้อมูลเชื่อมโยงการติดตาม: {confirmed} บันทึก Purchase แล้ว: {recorded} ขาดบันทึก: {missing}",
    ids: "ID แคมเปญ / ชุดโฆษณา / โฆษณา", campaign: "แคมเปญ", adset: "ชุดโฆษณา", ad: "โฆษณา", search: "กรองด้วย ID แคมเปญ ชุดโฆษณา หรือโฆษณา",
    flow: "ช่องทาง", language: "ภาษา", all: "ทั้งหมด", activity: "กิจกรรมผู้เข้าชมที่ติดตามได้", visitors: "ผู้เข้าชม", starts: "เริ่มต้น",
    completions: "ทำเสร็จ", checkouts: "เริ่มชำระเงิน", buyers: "ผู้เข้าชมที่ซื้อ", rate: "อัตราการซื้อ",
    cohort: "นับข้อมูลการติดตามที่ไม่ซ้ำและมี PageView ในช่วงวันที่ ช่องทาง ภาษา และกลุ่มโฆษณานี้ แต่ละขั้นนับผู้เข้าชมคนเดิมครั้งเดียว แม้ไม่มีบันทึกขั้นก่อนหน้า อัตราการซื้อคือผู้เข้าชมที่ซื้อ ÷ ผู้เข้าชม การใช้คนละเบราว์เซอร์อาจถูกนับแยกกัน",
    sales: "การซื้อที่บันทึกไว้", type: "ประเภทการซื้อ / แพ็กเกจ", plan: "แผน", products: "สินค้า", purchases: "การซื้อ", revenue: "มูลค่าการซื้อ",
    accepted: "Meta รับแล้ว", pending: "รอดำเนินการ", failed: "ปฏิเสธ / ระงับ", empty: "ไม่มีข้อมูลที่ตรงกันในช่วงวันที่นี้",
    salesNote: "การซื้อที่เซิร์ฟเวอร์ยืนยันและมีข้อมูลเชื่อมโยงการติดตาม รวมรายการที่ไม่มี PageView ในช่วงนี้ มูลค่าเป็นยอดซื้อรวม แยกตามสกุลเงิน ยังไม่หักการคืนเงินหรือค่าโฆษณา",
    limit: "แสดงสูงสุด 200 กลุ่มต่อตาราง ลดช่วงวันที่เพื่อดูกลุ่มที่อยู่นอกขีดจำกัดนี้",
    ads: "ยอดซื้อที่มาจากโฆษณา ค่าใช้จ่าย CPA และ ROAS: ยังไม่เชื่อมต่อรายงานโฆษณา ดูข้อมูลเหล่านี้ใน Meta Ads Manager",
    delivery: "การส่งเหตุการณ์", event: "เหตุการณ์", status: "สถานะการส่ง", count: "จำนวน", last: "อัปเดตล่าสุด",
    setup: "ตั้งค่าแคมเปญ", parameters: "วางในช่องพารามิเตอร์ URL ของโฆษณา", copy: "คัดลอกพารามิเตอร์", copied: "คัดลอกแล้ว",
    copyFailed: "คัดลอกไม่สำเร็จ เลือกข้อความในช่องแล้วคัดลอกด้วยตนเอง", eventsManager: "เปิด Events Manager",
    setupNote: "ใช้ชุดข้อมูลจริงและเหตุการณ์มาตรฐาน Purchase สำหรับแคมเปญยอดขาย หากต้องการรายงานแยกแพ็กเกจ ให้สร้างคอนเวอร์ชันแบบกำหนดเองด้วย purchase_type=plan และ offer=precision หรือ pro ใช้ channel=web, retail หรือ mcp เพื่อแยกช่องทาง เหตุการณ์ DEV_ และ UAT_ เป็นการทดสอบ อย่าใช้เป็นเป้าหมายคอนเวอร์ชันจริง"
  },
  "zh-CN": {
    title: "Meta 广告系列", enabled: "已启用", disabled: "已停用", dataset: "数据集", unspecified: "未指定",
    scope: "此部分使用所选日期范围及下方筛选条件。计数来自已记录的事件；历史数据缺少的标签保留为未指定。",
    deliveryNote: "Meta 已接收仅表示确认收到事件，不表示该销售已归因于广告。",
    reconciliation: "已确认且有关联跟踪信息的付款：{confirmed}。已记录 Purchase 事件：{recorded}。缺失记录：{missing}。",
    ids: "广告系列 / 广告组 / 广告 ID", campaign: "广告系列", adset: "广告组", ad: "广告", search: "按广告系列、广告组或广告 ID 筛选",
    flow: "渠道", language: "语言", all: "全部", activity: "已跟踪访客活动", visitors: "访客", starts: "开始",
    completions: "完成", checkouts: "开始结账", buyers: "购买访客", rate: "购买率",
    cohort: "统计在此日期范围、渠道、语言和广告分组内有 PageView 的唯一跟踪记录。各阶段对同一访客只计一次，无论是否记录了之前的阶段。购买率为购买访客 ÷ 访客。跨浏览器访问可能分别计数。",
    sales: "已记录购买", type: "购买类型 / 套餐", plan: "方案", products: "商品", purchases: "购买次数", revenue: "购买金额",
    accepted: "Meta 已接收", pending: "待处理", failed: "拒绝 / 已停止发送", empty: "此日期范围内没有匹配记录。",
    salesNote: "服务器确认且有关联跟踪信息的购买，包括此范围内没有 PageView 的购买。金额为购买总额，按币种分组，未扣除退款或广告支出。",
    limit: "每个表最多显示 200 个分组。缩小日期范围可查看超出此限制的分组。",
    ads: "广告归因购买、支出、CPA 和 ROAS：尚未连接广告报表。请在 Meta Ads Manager 中查看。",
    delivery: "事件发送", event: "事件", status: "发送状态", count: "数量", last: "最后更新",
    setup: "广告系列设置", parameters: "粘贴到广告的 URL 参数字段", copy: "复制参数", copied: "已复制",
    copyFailed: "复制失败，请选中字段并手动复制。", eventsManager: "打开 Events Manager",
    setupNote: "销售广告系列应使用生产环境数据集和标准 Purchase 事件。若要按套餐报告，可创建自定义转化，条件为 purchase_type=plan 且 offer=precision 或 pro。使用 channel=web、retail 或 mcp 区分渠道。DEV_ 和 UAT_ 事件用于测试，不应作为生产环境转化目标。"
  }
};
