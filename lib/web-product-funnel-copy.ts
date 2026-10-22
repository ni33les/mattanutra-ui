import type { Locale } from "@/lib/i18n";

type WebProductFunnelCopy = {
  title: string;
  reportingLimit: string;
  history: string;
  note: string;
  conversionNote: string;
  engagement: string;
  engagementNote: string;
  summary: { entered: string; reachedResults: string; converted: string; conversionRate: string };
  stages: Record<string, string>;
};

export const webProductFunnelCopy: Record<Locale, WebProductFunnelCopy> = {
  en: {
    title: "Web product funnel",
    reportingLimit: "This period exceeds the reporting limit. Choose a shorter period.",
    history: "Historical Precision, Pro and HealthScore funnel",
    note: "Counts are distinct recorded journeys at each stage in the selected period. Rates compare journeys recorded at both consecutive stages in order; missing steps are never inferred. Earlier journeys may lack the newer tracking events. Payment confirmed uses persisted live payments, not payment events or unpaid orders.",
    conversionNote: "Quiz-to-paid conversion: journeys with a confirmed live payment after a recorded quiz landing, divided by recorded quiz-landing journeys in this period. Direct checkout arrivals and payments without a recorded quiz landing do not increase this rate. A dash means there is no recorded denominator.",
    engagement: "Optional result engagement",
    engagementNote: "Distinct journeys with a recorded formula, product or HealthScore display in this period. These are optional views, not consecutive checkout steps; a journey can appear in more than one count.",
    summary: { entered: "Quiz landing", reachedResults: "Results displayed", converted: "Live paying journeys", conversionRate: "Quiz-to-paid conversion" },
    stages: {
      quizLandingViewed: "Quiz landing", assessmentStarted: "Quiz started", assessmentCaptured: "Quiz completed",
      revealOpened: "Reveal opened", resultsDisplayed: "Results displayed", basketConfirmed: "Continue to checkout",
      productCheckoutViewed: "Checkout opened", deliveryDetailsCompleted: "Delivery details completed",
      productCheckoutReady: "Payment ready", productPaymentConfirmed: "Payment confirmed",
      formulaViewed: "Formula viewed", productsViewed: "Products viewed", healthscoreDisplayed: "HealthScore displayed"
    }
  },
  th: {
    title: "เส้นทางซื้อสินค้าบนเว็บ",
    reportingLimit: "ช่วงเวลานี้มีข้อมูลเกินขีดจำกัดของรายงาน โปรดเลือกช่วงเวลาที่สั้นลง",
    history: "เส้นทาง Precision, Pro และ HealthScore ในอดีต",
    note: "นับเส้นทางที่บันทึกจริงและไม่ซ้ำในแต่ละขั้นตอนในช่วงเวลาที่เลือก อัตราเปรียบเทียบเส้นทางที่มีบันทึกทั้งสองขั้นตอนตามลำดับ ไม่อนุมานขั้นตอนที่ขาดหาย เส้นทางเก่าอาจไม่มีเหตุการณ์ติดตามแบบใหม่ การยืนยันชำระเงินใช้รายการชำระเงินจริงที่บันทึกไว้ ไม่ใช่เหตุการณ์ชำระเงินหรือคำสั่งซื้อที่ยังไม่ชำระ",
    conversionNote: "อัตราจากหน้าแบบประเมินถึงชำระเงิน: จำนวนเส้นทางที่ยืนยันชำระเงินจริงหลังจากเข้าหน้าแบบประเมิน หารด้วยเส้นทางที่มีบันทึกการเข้าหน้าแบบประเมินในช่วงเวลานี้ การเข้าหน้าชำระเงินโดยตรงหรือชำระเงินโดยไม่มีบันทึกเข้าหน้าแบบประเมินจะไม่เพิ่มอัตรานี้ ขีดหมายถึงไม่มีฐานคำนวณที่บันทึกไว้",
    engagement: "การดูผลลัพธ์เพิ่มเติม",
    engagementNote: "นับเส้นทางไม่ซ้ำที่มีบันทึกการแสดงสูตร สินค้า หรือ HealthScore ในช่วงเวลานี้ เป็นการดูเพิ่มเติม ไม่ใช่ขั้นตอนต่อเนื่องที่ต้องทำก่อนชำระเงิน เส้นทางหนึ่งอาจอยู่ในหลายรายการ",
    summary: { entered: "เข้าหน้าแบบประเมิน", reachedResults: "แสดงผลลัพธ์แล้ว", converted: "เส้นทางที่ชำระเงินจริง", conversionRate: "อัตราจากหน้าแบบประเมินถึงชำระเงิน" },
    stages: {
      quizLandingViewed: "เข้าหน้าแบบประเมิน", assessmentStarted: "เริ่มแบบประเมิน", assessmentCaptured: "ทำแบบประเมินเสร็จ",
      revealOpened: "เปิดหน้าผลลัพธ์", resultsDisplayed: "แสดงผลลัพธ์แล้ว", basketConfirmed: "ไปชำระเงิน",
      productCheckoutViewed: "เปิดหน้าชำระเงิน", deliveryDetailsCompleted: "กรอกข้อมูลจัดส่งครบ",
      productCheckoutReady: "พร้อมชำระเงิน", productPaymentConfirmed: "ยืนยันชำระเงินแล้ว",
      formulaViewed: "ดูสูตรแล้ว", productsViewed: "ดูสินค้าแล้ว", healthscoreDisplayed: "แสดง HealthScore แล้ว"
    }
  },
  "zh-CN": {
    title: "网页商品购买漏斗",
    reportingLimit: "此期间的数据超出报告限制。请选择更短的时间范围。",
    history: "历史 Precision、Pro 与 HealthScore 流程",
    note: "数量为所选期间各阶段有记录的不重复旅程。比率比较按顺序记录了相邻两个阶段的旅程，不推断缺失步骤。较早的旅程可能缺少新的跟踪事件。付款确认依据已保存的正式支付记录，不依据付款事件或未付款订单。",
    conversionNote: "问卷到付款转化率：在记录问卷落地页访问后完成正式付款的旅程数，除以此期间有问卷落地页访问记录的旅程数。直接进入结账或没有问卷落地页记录的付款不会提高此比率。破折号表示没有已记录的计算基数。",
    engagement: "可选结果浏览",
    engagementNote: "统计此期间有配方、商品或 HealthScore 显示记录的不重复旅程。这些是可选浏览，不是连续的结账步骤；同一旅程可计入多项。",
    summary: { entered: "问卷落地页", reachedResults: "已显示结果", converted: "正式付款旅程", conversionRate: "问卷到付款转化率" },
    stages: {
      quizLandingViewed: "问卷落地页", assessmentStarted: "开始问卷", assessmentCaptured: "完成问卷",
      revealOpened: "已打开结果", resultsDisplayed: "已显示结果", basketConfirmed: "前往结账",
      productCheckoutViewed: "已打开结账", deliveryDetailsCompleted: "配送资料已填写完整",
      productCheckoutReady: "可付款", productPaymentConfirmed: "已确认付款",
      formulaViewed: "已查看配方", productsViewed: "已查看商品", healthscoreDisplayed: "已显示 HealthScore"
    }
  }
};
