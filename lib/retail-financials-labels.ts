import type { Locale } from "@/lib/i18n";

export type RetailFinancialsLabelSet = Readonly<{
  actual: string;
  actualPayouts: string;
  action: string;
  all: string;
  confirmedAt: string;
  confirmed: string;
  confirmedReference: string;
  confirmReceived: string;
  created: string;
  currency: string;
  customer: string;
  customerFallback: string;
  due: string;
  exportCsv: string;
  exportPdf: string;
  gross: string;
  grossCustomerAmount: string;
  grossSales: string;
  itemPlural: string;
  itemSingular: string;
  margin: string;
  markPaid: string;
  mattanutraMargin: string;
  mattanutraMarginAmount: string;
  needsReview: string;
  noSettlements: string;
  nominal: string;
  nominalPayouts: string;
  order: string;
  orderNumber: string;
  orderStatus: string;
  organisation: string;
  outstanding: string;
  paid: string;
  paidAmount: string;
  paidAt: string;
  paidMethod: string;
  paidReference: string;
  payable: string;
  paymentId: string;
  pending: string;
  receivable: string;
  received: string;
  receivedAt: string;
  receivedMethod: string;
  receivedReference: string;
  awaitingConfirmation: string;
  reference: string;
  recorded: string;
  receiptReference: string;
  retailer: string;
  retailerBalances: string;
  retailerFinancialStatement: string;
  retailerPayableAmount: string;
  settlementRollup: string;
  saving: string;
  settlementStatement: string;
  settlementUpdateFailed: string;
  settlements: string;
  shipped: string;
  shippedAt: string;
  status: string;
  totalReceivable: string;
  trackPlatform: string;
  trackRetail: string;
  voided: string;
}>;

const retailFinancialsLabelSets: Record<Locale, RetailFinancialsLabelSet> = {
  en: {
    actual: "Actual",
    actualPayouts: "Actual payouts",
    action: "Action",
    all: "All",
    confirmedAt: "Confirmed At",
    confirmed: "Confirmed",
    confirmedReference: "Confirmed Reference",
    confirmReceived: "Confirm received",
    created: "Created",
    currency: "Currency",
    customer: "Customer",
    customerFallback: "Customer",
    due: "Due",
    exportCsv: "Export CSV",
    exportPdf: "Export PDF",
    gross: "Gross",
    grossCustomerAmount: "Gross Customer Amount",
    grossSales: "Gross sales",
    itemPlural: "items",
    itemSingular: "item",
    margin: "Margin",
    markPaid: "Mark paid",
    mattanutraMargin: "MattaNutra margin",
    mattanutraMarginAmount: "MattaNutra Margin Amount",
    needsReview: "Needs review",
    noSettlements: "No retailer settlements in this timeframe.",
    nominal: "Nominal",
    nominalPayouts: "Nominal payouts",
    order: "Order",
    orderNumber: "Order Number",
    orderStatus: "Order Status",
    organisation: "Organisation",
    outstanding: "Outstanding",
    paid: "Paid",
    paidAmount: "Paid Amount",
    paidAt: "Paid At",
    paidMethod: "Paid Method",
    paidReference: "Paid Reference",
    payable: "Payable",
    paymentId: "Payment ID",
    pending: "Pending",
    receivable: "Receivable",
    received: "Received",
    receivedAt: "Received At",
    receivedMethod: "Received Method",
    receivedReference: "Received Reference",
    awaitingConfirmation: "Awaiting confirmation",
    reference: "Reference",
    recorded: "Recorded",
    receiptReference: "Receipt reference",
    retailer: "Retailer",
    retailerBalances: "Retailer balances",
    retailerFinancialStatement: "Retail financial statement",
    retailerPayableAmount: "Retailer Payable Amount",
    settlementRollup: "Settlement rollup",
    saving: "Saving...",
    settlementStatement: "Settlement statement",
    settlementUpdateFailed: "Settlement update failed",
    settlements: "Settlements",
    shipped: "Shipped",
    shippedAt: "Shipped At",
    status: "Status",
    totalReceivable: "Total receivable",
    trackPlatform: "Track retailer settlement balances across all pharmacies.",
    trackRetail:
      "Track receivables, received funds, and receipt confirmations for this retailer.",
    voided: "Voided"
  },
  th: {
    actual: "จ่ายจริง",
    actualPayouts: "ยอดจ่ายจริง",
    action: "การดำเนินการ",
    all: "ทั้งหมด",
    confirmedAt: "ยืนยันเมื่อ",
    confirmed: "ยืนยันแล้ว",
    confirmedReference: "เลขอ้างอิงการยืนยัน",
    confirmReceived: "ยืนยันรับเงิน",
    created: "สร้างเมื่อ",
    currency: "สกุลเงิน",
    customer: "ลูกค้า",
    customerFallback: "ลูกค้า",
    due: "ถึงกำหนด",
    exportCsv: "ส่งออก CSV",
    exportPdf: "ส่งออก PDF",
    gross: "ยอดขายรวม",
    grossCustomerAmount: "ยอดชำระจากลูกค้า",
    grossSales: "ยอดขายรวม",
    itemPlural: "รายการ",
    itemSingular: "รายการ",
    margin: "มาร์จิน",
    markPaid: "บันทึกว่าจ่ายแล้ว",
    mattanutraMargin: "มาร์จิน MattaNutra",
    mattanutraMarginAmount: "มาร์จิน MattaNutra",
    needsReview: "ต้องตรวจสอบ",
    noSettlements: "ไม่มีรายการชำระร้านค้าในช่วงเวลานี้",
    nominal: "ตั้งหนี้",
    nominalPayouts: "ยอดตั้งหนี้",
    order: "คำสั่งซื้อ",
    orderNumber: "เลขคำสั่งซื้อ",
    orderStatus: "สถานะคำสั่งซื้อ",
    organisation: "องค์กร",
    outstanding: "คงค้าง",
    paid: "จ่ายแล้ว",
    paidAmount: "ยอดจ่ายแล้ว",
    paidAt: "จ่ายเมื่อ",
    paidMethod: "วิธีจ่าย",
    paidReference: "เลขอ้างอิงการจ่าย",
    payable: "ยอดร้านค้าจะได้รับ",
    paymentId: "รหัสการชำระเงิน",
    pending: "รอดำเนินการ",
    receivable: "ยอดที่จะได้รับ",
    received: "รับแล้ว",
    receivedAt: "รับเมื่อ",
    receivedMethod: "วิธีรับ",
    receivedReference: "เลขอ้างอิงการรับ",
    awaitingConfirmation: "รอยืนยัน",
    reference: "เลขอ้างอิง",
    recorded: "บันทึกแล้ว",
    receiptReference: "เลขอ้างอิงการรับเงิน",
    retailer: "ร้านค้า",
    retailerBalances: "ยอดคงเหลือร้านค้า",
    retailerFinancialStatement: "รายงานการเงินร้านค้า",
    retailerPayableAmount: "ยอดร้านค้าจะได้รับ",
    settlementRollup: "สรุปรายการชำระ",
    saving: "กำลังบันทึก...",
    settlementStatement: "รายการชำระร้านค้า",
    settlementUpdateFailed: "อัปเดตรายการชำระไม่สำเร็จ",
    settlements: "รายการชำระ",
    shipped: "จัดส่งแล้ว",
    shippedAt: "จัดส่งเมื่อ",
    status: "สถานะ",
    totalReceivable: "ยอดรับรวม",
    trackPlatform: "ติดตามยอดชำระร้านค้าของทุก pharmacy",
    trackRetail:
      "ติดตามยอดที่จะได้รับ ยอดที่รับแล้ว และการยืนยันรับเงินของร้านค้านี้",
    voided: "ยกเลิกแล้ว"
  },
  "zh-CN": {
    actual: "实际",
    actualPayouts: "实际付款",
    action: "操作",
    all: "全部",
    confirmedAt: "确认时间",
    confirmed: "已确认",
    confirmedReference: "确认参考",
    confirmReceived: "确认收到",
    created: "创建",
    currency: "币种",
    customer: "客户",
    customerFallback: "客户",
    due: "应付",
    exportCsv: "导出 CSV",
    exportPdf: "导出 PDF",
    gross: "销售总额",
    grossCustomerAmount: "客户支付总额",
    grossSales: "销售总额",
    itemPlural: "件商品",
    itemSingular: "件商品",
    margin: "毛利",
    markPaid: "标记已付款",
    mattanutraMargin: "MattaNutra 毛利",
    mattanutraMarginAmount: "MattaNutra 毛利金额",
    needsReview: "需要复核",
    noSettlements: "此时间段内没有零售结算。",
    nominal: "名义",
    nominalPayouts: "名义付款",
    order: "订单",
    orderNumber: "订单号",
    orderStatus: "订单状态",
    organisation: "组织",
    outstanding: "未结清",
    paid: "已付款",
    paidAmount: "已付金额",
    paidAt: "付款时间",
    paidMethod: "付款方式",
    paidReference: "付款参考",
    payable: "应付零售商",
    paymentId: "支付 ID",
    pending: "待处理",
    receivable: "应收",
    received: "已收",
    receivedAt: "收到时间",
    receivedMethod: "收款方式",
    receivedReference: "收款参考",
    awaitingConfirmation: "待确认",
    reference: "参考",
    recorded: "已记录",
    receiptReference: "收款参考",
    retailer: "零售商",
    retailerBalances: "零售商余额",
    retailerFinancialStatement: "零售财务报表",
    retailerPayableAmount: "应付零售商金额",
    settlementRollup: "结算汇总",
    saving: "正在保存...",
    settlementStatement: "结算明细",
    settlementUpdateFailed: "结算更新失败",
    settlements: "结算",
    shipped: "已发货",
    shippedAt: "发货时间",
    status: "状态",
    totalReceivable: "应收总额",
    trackPlatform: "跟踪所有药房的零售商结算余额。",
    trackRetail: "跟踪此零售商的应收款、已收款和收款确认。",
    voided: "已作废"
  }
};

export function retailFinancialsLabels(locale: Locale) {
  return retailFinancialsLabelSets[locale] ?? retailFinancialsLabelSets.en;
}

export function retailFinancialsStatusLabel(status: string, locale: Locale) {
  const labels = retailFinancialsLabels(locale);

  if (status === "confirmed") {
    return labels.confirmed;
  }

  if (status === "due") {
    return labels.due;
  }

  if (status === "needs_review") {
    return labels.needsReview;
  }

  if (status === "paid") {
    return labels.awaitingConfirmation;
  }

  if (status === "pending") {
    return labels.pending;
  }

  if (status === "voided") {
    return labels.voided;
  }

  return status;
}
