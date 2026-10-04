"use client";
import { useState } from "react";
import { FunnelStageTable } from "./funnel-stage-table";
import { funnelReportCopy } from "@/lib/funnel-report-copy";
import type { Locale } from "@/lib/i18n";
import { pharmacySourceLabels } from "@/lib/pharmacy-acquisition";
import type { PharmacySourceFunnel, PharmacyFunnelStage } from "@/lib/pharmacy-funnel";
const copy = {
  en: {title:"Retail", pharmacy:"Pharmacy", source:"Source", all:"All", landing:"Landing visits", started:"Questionnaires started", captured:"Questionnaires completed", revealed:"Reveals viewed", orders:"Orders placed — unpaid", empty:"No pharmacy journeys in this period.", note:"Percentages show progression from the preceding stage. Orders are unpaid; no HealthScore or online payment is required."},
  th: {title:"Retail", pharmacy:"ร้านยา", source:"แหล่งที่มา", all:"ทั้งหมด", landing:"เข้าหน้าแรก", started:"เริ่มแบบสอบถาม", captured:"ทำแบบสอบถามเสร็จ", revealed:"ดูคำแนะนำ", orders:"สั่งซื้อ — ยังไม่ชำระเงิน", empty:"ไม่มีเส้นทางร้านยาในช่วงเวลานี้", note:"เปอร์เซ็นต์แสดงการดำเนินการต่อจากขั้นตอนก่อนหน้า คำสั่งซื้อยังไม่ชำระเงิน ไม่ต้องผ่านหน้า HealthScore หรือชำระเงินออนไลน์"},
  "zh-CN": {title:"Retail", pharmacy:"药房", source:"来源", all:"全部", landing:"访问首页", started:"开始问卷", captured:"完成问卷", revealed:"查看建议", orders:"已下单 — 未付款", empty:"此期间没有药房访问记录。", note:"百分比表示从上一阶段继续的比例。订单尚未付款；无需查看 HealthScore 或在线付款。"}
};
const stages: PharmacyFunnelStage[] = ["landing","started","captured","revealed","orders"];
export function PharmacySourceFunnelTable({ rows, locale }: { rows: readonly PharmacySourceFunnel[]; locale: Locale }) {
  const c=copy[locale], [pharmacy,setPharmacy]=useState(""), [source,setSource]=useState("");
  const visible=rows.filter(row=>stages.some(stage=>row[stage]>0)&&(!pharmacy||row.pharmacy===pharmacy)&&(!source||row.source===source));
  return <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200" data-testid="pharmacy-source-funnel">
    <h2 className="text-lg font-semibold">{c.title}</h2>
    <div className="my-4 flex flex-wrap gap-4">
      <label className="grid gap-1 text-sm">{c.pharmacy}<select className="rounded border border-gray-300 px-3 py-2" value={pharmacy} onChange={event=>setPharmacy(event.target.value)}>
        <option value="">{c.all}</option>{[...new Set(rows.map(row=>row.pharmacy))].sort().map(slug=><option key={slug} value={slug}>{slug}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">{c.source}<select className="rounded border border-gray-300 px-3 py-2" value={source} onChange={event=>setSource(event.target.value)}>
        <option value="">{c.all}</option>{Object.entries(pharmacySourceLabels[locale]).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    {visible.map(row => <div className="mt-5" key={`${row.pharmacy}:${row.source}`}>
      <h3 className="text-sm font-semibold text-gray-700">{row.pharmacy} · {pharmacySourceLabels[locale][row.source]}</h3>
      <FunnelStageTable locale={locale} caption={`${c.title}: ${row.pharmacy}`} rows={stages.map((stage,index) => ({
        id: stage, label: c[stage], count: row[stage], color: (["entry","start","complete","result","order"] as const)[index],
        entry: index === 0, denominator: row.transitions?.[stage]?.denominator, numerator: row.transitions?.[stage]?.numerator
      }))} />
    </div>)}
    {!visible.length&&<p className="my-4 text-sm text-gray-500">{c.empty}</p>}
    <p className="mt-3 text-xs text-gray-500">{c.note} {funnelReportCopy[locale].linkedNote}</p>
  </section>;
}
