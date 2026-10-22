import type { WebProductReport } from "@/lib/admin-web-product-report";
import type { Locale } from "@/lib/i18n";
import { funnelReportCopy } from "@/lib/funnel-report-copy";

const copy = {
  en: {
    title: "Live payments and fulfillment", note: "Sales use persisted live payments with a paid timestamp, including fulfillment failures. Test, mock and internal test records are excluded. Revenue is gross collected, not net of refunds. Payment events are telemetry and may be duplicated or missing.",
    sales: ["Paid payments", "Paying journeys", "Linked orders", "Shipped", "Delivered", "Cancelled", "Returned", "Fulfillment failed", "Paid without order", "Payments with event", "Payments missing event", "Payment events", "Unique payment IDs in events", "Events without a live paid payment"],
    generation: "Generation tasks", generationNote: "Tasks created in the selected period, grouped separately from customer views. Median and p90 measure wall-clock seconds from task creation to completion, including queue and external service waits, for completed tasks with valid timestamps. These are per-task durations, not browser reveal latency or CPU time. Error events and retry attempts are separate counts; repeated generation can create multiple tasks per journey.",
    columns: ["Stage", "Tasks", "Queued", "Running", "Completed", "Failed", "Review", "Cancelled / skipped", "Retries", "Error events", "Timed completions", "Median (s)", "p90 (s)"],
    formula: "Formula", products: "Product matching", revenue: "Gross collected"
  },
  th: {
    title: "การชำระเงินจริงและการจัดส่ง", note: "ยอดขายนับจากรายการชำระเงินจริงที่บันทึกเวลาแล้ว รวมรายการที่ดำเนินคำสั่งซื้อไม่สำเร็จ ไม่รวมรายการทดสอบและจำลอง ยอดเงินเป็นยอดรับรวมก่อนคืนเงิน เหตุการณ์ชำระเงินอาจซ้ำหรือขาดหาย",
    sales: ["รายการชำระแล้ว", "เส้นทางที่ชำระแล้ว", "คำสั่งซื้อที่เชื่อมโยง", "ส่งออกแล้ว", "จัดส่งสำเร็จ", "ยกเลิก", "คืนสินค้า", "ดำเนินคำสั่งซื้อไม่สำเร็จ", "ชำระแล้วไม่มีคำสั่งซื้อ", "ชำระแล้วมีเหตุการณ์", "ชำระแล้วขาดเหตุการณ์", "เหตุการณ์ชำระเงิน", "รหัสชำระเงินไม่ซ้ำในเหตุการณ์", "เหตุการณ์ไม่มีรายการชำระเงินจริง"],
    generation: "งานสร้างผลลัพธ์", generationNote: "นับงานที่สร้างในช่วงที่เลือก แยกจากการดูของลูกค้า ค่ามัธยฐานและ p90 วัดวินาทีที่ผ่านไปตั้งแต่สร้างงานจนเสร็จ รวมเวลารอคิวและบริการภายนอก เฉพาะงานเสร็จที่มีเวลาถูกต้อง เป็นเวลาต่องาน ไม่ใช่เวลารอหน้าผลลัพธ์หรือเวลา CPU แยกจำนวนข้อผิดพลาดและการลองใหม่ หนึ่งเส้นทางอาจมีหลายงาน",
    columns: ["ขั้นตอน", "งาน", "รอคิว", "กำลังทำ", "เสร็จ", "ล้มเหลว", "รอตรวจ", "ยกเลิก / ข้าม", "ลองใหม่", "เหตุการณ์ผิดพลาด", "งานที่วัดเวลา", "มัธยฐาน (วิ)", "p90 (วิ)"],
    formula: "สูตร", products: "จับคู่สินค้า", revenue: "ยอดรับรวม"
  },
  "zh-CN": {
    title: "正式支付与履约", note: "销售额依据已记录付款时间的正式支付，包括履约失败。排除测试、模拟与内部测试记录。收入为收款总额，未扣除退款。付款事件属于遥测，可能重复或缺失。",
    sales: ["已付款笔数", "付款旅程", "关联订单", "已发货", "已送达", "已取消", "已退货", "履约失败", "已付款但无订单", "有事件的付款", "缺少事件的付款", "付款事件数", "事件中的唯一付款编号", "无正式付款记录的事件"],
    generation: "结果生成任务", generationNote: "按所选期间创建的任务统计，与客户浏览分开。中位数和 p90 以秒计量任务创建到完成的实际经过时间，包括排队和外部服务等待，仅统计时间有效的已完成任务。这是单个任务耗时，不是浏览器结果展示延迟或 CPU 时间。错误事件和重试次数分开统计；同一旅程可能有多个生成任务。",
    columns: ["阶段", "任务", "排队", "运行中", "完成", "失败", "待审核", "取消 / 跳过", "重试", "错误事件", "计时完成数", "中位数（秒）", "p90（秒）"],
    formula: "配方", products: "商品匹配", revenue: "收款总额"
  }
} as const;

export function WebProductReportPanel({ report, locale }: { report?: WebProductReport; locale: Locale }) {
  if (!report) return <p className="mt-6 text-sm text-gray-600" role="status">{copy[locale].title}: {funnelReportCopy[locale].unavailable}</p>;
  const labels = copy[locale];
  const sales = report.sales;
  const numbers = [sales.paidPayments, sales.paidJourneys, sales.orders, sales.shipped, sales.delivered, sales.cancelled,
    sales.returned, sales.fulfillmentFailed, sales.paidWithoutOrder, sales.paymentsWithEvent, sales.paymentsMissingEvent,
    sales.paymentEvents, sales.eventPaymentIds, sales.eventsWithoutPaidPayment];
  const display = (value: number | null) => value === null ? "—" : value.toLocaleString(locale, { maximumFractionDigits: 1 });
  return <div className="mt-6 min-w-0 space-y-6" data-testid="web-product-diagnostics">
    <section className="rounded-xl bg-gray-50 p-4">
      <h3 className="font-semibold">{labels.title}</h3>
      <p className="mt-2 text-xs text-gray-600">{labels.note}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{labels.sales.map((label, index) =>
        <div key={label}><dt className="text-xs text-gray-600">{label}</dt><dd className="font-semibold">{display(numbers[index])}</dd></div>)}</dl>
      {sales.revenue.map(row => <p key={row.currency} className="mt-3 text-sm">{labels.revenue}: {row.currency} {display(Number(row.amountMicros) / 1_000_000)}</p>)}
    </section>
    <section>
      <h3 className="font-semibold">{labels.generation}</h3>
      <p className="mt-2 text-xs text-gray-600">{labels.generationNote}</p>
      <div className="mt-3 max-w-full overflow-x-auto" role="region" aria-label={labels.generation} tabIndex={0}><table className="min-w-full text-left text-sm">
        <caption className="sr-only">{labels.generation}</caption>
        <thead><tr>{labels.columns.map(label => <th className="whitespace-nowrap p-2 text-xs font-semibold" key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{report.generation.map(row => <tr key={row.stage} className="border-t border-gray-100">
          <th className="p-2" scope="row">{row.stage === "formula" ? labels.formula : labels.products}</th>
          {[row.tasks, row.queued, row.running, row.completed, row.failed, row.review, row.cancelled, row.retries, row.errorEvents,
            row.timedCompletions, row.medianSeconds, row.p90Seconds].map((value, index) => <td className="p-2 tabular-nums" key={index}>{display(value)}</td>)}
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
