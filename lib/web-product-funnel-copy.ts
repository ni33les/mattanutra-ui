import type { Locale } from "@/lib/i18n";
export const webProductFunnelCopy: Record<Locale, { title: string; history: string; note: string; stages: Record<string, string> }> = {
  en: { title: "Web product funnel", history: "Optional HealthScore and historical plan purchases",
    note: "Counts show observed journeys. Formula and product views require displayed results; payment events are shown separately from reconciled live sales below. Missing stages are not inferred. Earlier campaigns did not record the new reveal stages.",
    stages: { landingViewed: "Entry", assessmentStarted: "Assessment started", assessmentCaptured: "Assessment saved",
      revealOpened: "Reveal opened", formulaViewed: "Formula viewed", productsViewed: "Products viewed", basketConfirmed: "Basket confirmed",
      productCheckoutReady: "Payment ready", productPaymentSucceeded: "Payment event recorded", retailOrderShipped: "Order shipped", retailOrderDelivered: "Order delivered" } },
  th: { title: "เส้นทางซื้อสินค้าบนเว็บ", history: "HealthScore เพิ่มเติมและการซื้อแผนในอดีต",
    note: "นับเส้นทางที่บันทึกจริง การดูสูตรและสินค้าต้องแสดงผลแล้ว การชำระเงินต้องยืนยันแล้ว ไม่อนุมานขั้นตอนที่หายไป แคมเปญก่อนหน้าไม่ได้บันทึกขั้นตอนแสดงผลใหม่",
    stages: { landingViewed: "เข้าชม", assessmentStarted: "เริ่มแบบประเมิน", assessmentCaptured: "บันทึกแบบประเมิน",
      revealOpened: "เปิดหน้าผลลัพธ์", formulaViewed: "ดูสูตรแล้ว", productsViewed: "ดูสินค้าแล้ว", basketConfirmed: "ยืนยันตะกร้า",
      productCheckoutReady: "พร้อมชำระเงิน", productPaymentSucceeded: "บันทึกเหตุการณ์ชำระเงิน", retailOrderShipped: "ส่งออกแล้ว", retailOrderDelivered: "จัดส่งสำเร็จ" } },
  "zh-CN": { title: "网页商品购买漏斗", history: "可选健康评分与历史方案购买",
    note: "仅统计已记录的旅程。配方和商品浏览要求实际显示结果；付款要求确认到账。不推测缺失阶段。早期广告系列未记录新的展示阶段。",
    stages: { landingViewed: "进入", assessmentStarted: "开始评估", assessmentCaptured: "评估已保存",
      revealOpened: "已打开结果", formulaViewed: "已查看配方", productsViewed: "已查看商品", basketConfirmed: "已确认购物篮",
      productCheckoutReady: "可付款", productPaymentSucceeded: "已记录付款事件", retailOrderShipped: "订单已发货", retailOrderDelivered: "订单已送达" } }
};
