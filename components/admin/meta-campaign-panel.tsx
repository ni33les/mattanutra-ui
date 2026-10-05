"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { MetaDiagnostics } from "@/lib/meta-diagnostics";
import type { MetaCampaignDimensions } from "@/lib/meta-campaign-report";
import { metaAdUrlParameters } from "@/lib/meta-attribution";
import { metaCampaignCopy } from "@/lib/meta-campaign-copy";
import { funnelStageColors } from "./funnel-stage-table";

export function MetaCampaignPanel({ data, locale }: { data: MetaDiagnostics; locale: Locale }) {
  const t = metaCampaignCopy[locale];
  const [flow, setFlow] = useState(""), [language, setLanguage] = useState(""), [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const flowName = (value: string) => ({ web: "Web", retail: "Retail", mcp: "MCP" }[value] || t.unspecified);
  const matches = (row: MetaCampaignDimensions) => (!flow || row.channel === flow) && (!language || row.locale === language)
    && (!query.trim() || [row.campaignId, row.adsetId, row.adId].some(id => id?.includes(query.trim())));
  const activity = data.campaigns.activity.filter(matches), sales = data.campaigns.sales.filter(matches);
  const dimensions = (row: MetaCampaignDimensions) => <>
    <td className="p-3"><div>{t.campaign}: {row.campaignId || t.unspecified}</div><div>{t.adset}: {row.adsetId || t.unspecified}</div><div>{t.ad}: {row.adId || t.unspecified}</div></td>
    <td className="p-3">{flowName(row.channel)}</td><td className="p-3">{row.locale === "unknown" ? t.unspecified : row.locale}</td>
  </>;
  const key = (row: MetaCampaignDimensions) => [row.campaignId, row.adsetId, row.adId, row.channel, row.locale].join(":");
  const headings = (items: string[], colors: Record<number, string> = {}) => <thead className="bg-gray-50"><tr>{items.map((item, index) =>
    <th key={item} scope="col" className="p-3 text-left text-xs font-semibold text-gray-600" style={colors[index] ? { borderTop: `3px solid ${colors[index]}` } : undefined}>{item}</th>)}</tr></thead>;

  return <section aria-label={t.title} className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-gray-200">
    <h2 className="font-semibold">{t.title} · {data.environment.toUpperCase()} · {data.enabled ? t.enabled : t.disabled}</h2>
    <p className="mt-2 text-sm">{t.dataset}: {data.pixelId || t.unspecified}. {t.scope}</p>
    <p className="mt-2 text-sm">{t.deliveryNote}</p>
    <p className="mt-2 text-sm">{t.reconciliation.replace("{confirmed}", number(data.purchases.confirmed)).replace("{recorded}", number(data.purchases.recorded)).replace("{missing}", number(data.purchases.missing))}</p>
    <div className="my-4 flex flex-wrap gap-3 text-sm">
      <label className="flex flex-col gap-1">{t.search}<input type="search" className="max-w-full rounded-lg border border-gray-300 p-2" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="flex flex-col gap-1">{t.flow}<select className="rounded-lg border border-gray-300 p-2" value={flow} onChange={event => setFlow(event.target.value)}>
        <option value="">{t.all}</option>{["web", "retail", "mcp", "unknown"].map(value => <option key={value} value={value}>{flowName(value)}</option>)}
      </select></label>
      <label className="flex flex-col gap-1">{t.language}<select className="rounded-lg border border-gray-300 p-2" value={language} onChange={event => setLanguage(event.target.value)}>
        <option value="">{t.all}</option>{["en", "th", "zh-CN", "unknown"].map(value => <option key={value} value={value}>{value === "unknown" ? t.unspecified : value}</option>)}
      </select></label>
    </div>
    <h3 className="font-semibold">{t.activity}</h3><p className="mt-1 text-xs text-gray-600">{t.cohort}</p>
    <div className="mt-3 overflow-x-auto"><table aria-label={t.activity} className="w-full text-sm">
      {headings([t.ids, t.flow, t.language, t.visitors, t.starts, t.completions, t.checkouts, t.buyers, t.rate], { 3: funnelStageColors.entry, 4: funnelStageColors.start, 5: funnelStageColors.complete, 6: funnelStageColors.conversion, 7: funnelStageColors.order, 8: funnelStageColors.order })}
      <tbody className="divide-y divide-gray-100">{activity.map(row => <tr key={key(row)}>{dimensions(row)}
        {[row.visitors, row.starts, row.completions, row.checkouts, row.purchasingVisitors].map((value, index) => <td className="p-3 tabular-nums" key={index}>{number(value)}</td>)}
        <td className="p-3 tabular-nums">{row.purchaseRate === null ? "—" : `${number(row.purchaseRate)}%`}</td>
      </tr>)}{!activity.length && <tr><td className="p-3 text-gray-500" colSpan={9}>{t.empty}</td></tr>}</tbody>
    </table></div>
    <h3 className="mt-6 font-semibold">{t.sales}</h3><p className="mt-1 text-xs text-gray-600">{t.salesNote}</p>
    <div className="mt-3 overflow-x-auto"><table aria-label={t.sales} className="w-full text-sm">
      {headings([t.ids, t.flow, t.language, t.type, t.purchases, t.revenue, t.accepted, t.pending, t.failed], { 4: funnelStageColors.order, 5: funnelStageColors.order, 6: funnelStageColors.conversion })}
      <tbody className="divide-y divide-gray-100">{sales.map(row => <tr key={`${key(row)}:${row.purchaseType}:${row.offer}:${row.currency}`}>
        {dimensions(row)}<td className="p-3">{row.purchaseType === "plan" ? t.plan : row.purchaseType === "products" ? t.products : t.unspecified}{row.offer !== "unknown" ? ` / ${row.offer === "precision" ? "Precision" : "Pro"}` : ""}</td>
        <td className="p-3 tabular-nums">{number(row.purchases)}</td><td className="whitespace-nowrap p-3 tabular-nums">{number(row.revenue)} {row.currency === "unknown" ? t.unspecified : row.currency}</td>
        {[row.accepted, row.pending, row.failed].map((value, index) => <td className="p-3 tabular-nums" key={index}>{number(value)}</td>)}
      </tr>)}{!sales.length && <tr><td className="p-3 text-gray-500" colSpan={9}>{t.empty}</td></tr>}</tbody>
    </table></div>
    {data.campaigns.limited && <p className="mt-2 text-sm text-amber-800">{t.limit}</p>}
    <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{t.ads}</p>
    <details className="mt-4"><summary className="cursor-pointer font-semibold">{t.delivery}</summary>
      <div className="overflow-x-auto"><table aria-label={t.delivery} className="mt-3 w-full text-sm">
        {headings([t.event, t.flow, t.status, t.count, t.last])}
        <tbody className="divide-y divide-gray-100">{data.rows.map(row => <tr key={`${row.name}:${row.channel}:${row.status}`}>
          <td className="p-3">{row.name}</td><td className="p-3">{flowName(row.channel)}</td><td className="p-3">{row.status}</td><td className="p-3 tabular-nums">{number(row.count)}</td><td className="p-3">{new Date(row.lastAt).toLocaleString(locale)}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
    <details className="mt-4"><summary className="cursor-pointer font-semibold">{t.setup}</summary>
      <p className="mt-2 text-sm">{t.setupNote}</p>
      <label className="mt-3 block text-sm">{t.parameters}<input readOnly value={metaAdUrlParameters} onFocus={event => event.currentTarget.select()} className="mt-1 w-full rounded-lg border border-gray-300 p-2 font-mono text-xs" /></label>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm"><button type="button" className="rounded-lg border border-gray-300 px-3 py-2" onClick={async () => {
        try { await navigator.clipboard.writeText(metaAdUrlParameters); setCopyStatus(t.copied); } catch { setCopyStatus(t.copyFailed); }
      }}>{t.copy}</button><a className="text-teal-700 underline" href="https://business.facebook.com/events_manager2/" target="_blank" rel="noopener noreferrer">{t.eventsManager}</a><span role="status">{copyStatus}</span></div>
    </details>
  </section>;
}
