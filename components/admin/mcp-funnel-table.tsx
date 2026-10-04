"use client";
import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { McpFunnelReport } from "@/lib/admin-mcp-funnel";
import { funnelReportCopy } from "@/lib/funnel-report-copy";
import { FunnelStageTable } from "./funnel-stage-table";

const stages = ["connected", "plan_ready", "confirmed", "checkout_created", "paid", "dispatched", "delivered"] as const;
export function McpFunnelTable({ data, locale }: { data?: McpFunnelReport; locale: Locale }) {
  const c = funnelReportCopy[locale], [language, setLanguage] = useState("");
  const rows = data?.rows.filter(row => !language || row.locale === language) ?? [];
  return <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200" data-testid="mcp-funnel">
    <h2 className="text-lg font-semibold">MCP</h2>
    <p className="mt-2 text-sm text-gray-600">{c.mcpNote}</p>
    {!!data?.rows.length && <label className="my-4 grid w-fit gap-1 text-sm">{c.language}
      <select className="rounded border border-gray-300 px-3 py-2" value={language} onChange={event => setLanguage(event.target.value)}>
        <option value="">{locale === "th" ? "ทั้งหมด" : locale === "zh-CN" ? "全部" : "All"}</option>
        {[...new Set(data.rows.map(row => row.locale))].sort().map(value => <option key={value} value={value}>{value === "unknown" ? c.unknown : value}</option>)}
      </select>
    </label>}
    {!data?.available ? <p className="mt-4 text-sm" role="status">{c.unavailable}</p> : !rows.length ? <p className="mt-4 text-sm">{c.empty}</p> : rows.map(row =>
      <div className="mt-5" key={`${row.attribution}:${row.locale}`}>
        <h3 className="text-sm font-semibold text-gray-700">{row.attribution === "qa_campaign" ? c.qa : row.attribution === "agent_connector" ? c.live : c.unknown} · {row.locale === "unknown" ? c.unknown : row.locale}</h3>
        <FunnelStageTable locale={locale} caption={`MCP: ${row.locale}`} rows={stages.map((stage, index) => ({
          id: stage, label: c.mcpStages[index], count: row[stage], color: (["start", "result", "order", "order", "conversion", "delivered", "delivered"] as const)[index],
          entry: index === 0, denominator: row.transitions[stage]?.denominator, numerator: row.transitions[stage]?.numerator
        }))} />
      </div>
    )}
    <p className="mt-3 text-xs text-gray-600">{c.linkedNote}</p>
  </section>;
}
