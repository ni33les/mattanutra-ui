"use client";

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "./dashboard-content";
import type { AdminLeadRow } from "@/lib/admin-query-data";
import { questionLabel, type QuestionnaireBucket, type QuestionnaireDropoffPage, type QuestionnaireFunnelReport,
  type QuestionnaireJourney, type QuestionFunnelRow } from "@/lib/questionnaire-dropoffs";
import { questionnaireFunnelCopy } from "@/lib/questionnaire-funnel-copy";
import { AdminModal } from "./ui";
import { LeadDetailsModal } from "./marketing-leads";
import { compactId, formatGeneratedAt, formatNumber, formatPercent } from "./dashboard-shared";

type Selection = { bucket: QuestionnaireBucket; label: string; question?: string; version?: string };
type Props = { report?: QuestionnaireFunnelReport; journey: QuestionnaireJourney; pharmacy?: string; source?: string;
  locale: Locale; labels: AdminContent; canReadLeads?: boolean };

export function QuestionnaireFunnel(props: Props) {
  const { report, journey, pharmacy, source, locale, canReadLeads } = props;
  const c = questionnaireFunnelCopy[locale];
  const [selection, setSelection] = useState<Selection | null>(null);
  const groups = report?.groups.filter(g => g.journey === journey && (!pharmacy || g.pharmacy === pharmacy) && (!source || g.source === source)) ?? [];
  const rows = new Map<string, QuestionFunnelRow>();
  for (const group of groups) for (const row of group.questions) {
    const key = `${row.version}:${row.key}`, current = rows.get(key);
    rows.set(key, current ? { ...row, reached: current.reached + row.reached, continued: current.continued + row.continued,
      inProgress: current.inProgress + row.inProgress, dropped: current.dropped + row.dropped, unknown: current.unknown + row.unknown } : { ...row });
  }
  const questions = [...rows.values()].sort((a,b) => a.version.localeCompare(b.version) || a.order - b.order);
  const largest = questions.filter(q => q.dropped > 0).sort((a,b) => b.dropped - a.dropped || a.order - b.order)[0];
  if (!report) return null;
  function countButton(count: number, selected: Selection) {
    return canReadLeads && count ? <button type="button" className="font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-600"
      aria-label={`${selected.label}: ${formatNumber(count, locale)} ${c.dropped}`} onClick={() => setSelection(selected)}>{formatNumber(count, locale)}</button> : formatNumber(count, locale);
  }
  return <div className="mt-5 border-t border-gray-200 pt-4" data-testid="questionnaire-funnel">
    <h3 className="text-sm font-semibold text-gray-900">{c.title}</h3>
    {!report.databaseAvailable ? <p role="status" className="mt-2 text-sm text-amber-700">{c.unavailable}</p> : <>
      <p className="mt-2 text-sm text-gray-700">{largest ? <>{c.largest}: {questionLabel(largest.key, largest.version, locale)?.question} · {countButton(largest.dropped,
        { bucket: "dropped", question: largest.key, version: largest.version, label: questionLabel(largest.key, largest.version, locale)!.question })}</> : c.none}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-emerald-800">{c.expand} · {c.unit}</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm" aria-label={`${c.title}: ${journey}${pharmacy ? ` / ${pharmacy}` : ""}`}>
            <thead><tr>{[c.question,c.reached,c.continued,c.active,c.dropped,c.rate].map((label,i) => <th className={`px-3 py-2 ${i ? "text-right" : "text-left"}`} scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{questions.map(row => {
              const label = questionLabel(row.key,row.version,locale)!;
              return <tr key={`${row.version}:${row.key}`} className="border-t border-gray-100">
                <th scope="row" className="min-w-64 max-w-lg px-3 py-3 text-left font-normal"><span className="block text-xs text-gray-500">{label.section}</span>{label.question}</th>
                {[row.reached,row.continued,row.inProgress].map((n,i) => <td className="px-3 py-3 text-right tabular-nums" key={i}>{formatNumber(n,locale)}</td>)}
                <td className="px-3 py-3 text-right">{countButton(row.dropped,{bucket:"dropped",question:row.key,version:row.version,label:label.question})}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatPercent(row.reached ? 100 * row.dropped / row.reached : 0,locale)}</td>
              </tr>;
            })}</tbody>
          </table>
          {!questions.length && <p className="py-3 text-sm text-gray-500">{c.empty}</p>}
        </div>
        <p className="mt-2 text-xs text-gray-500">{c.evidence}</p>
        {questions.some(q => q.unknown) && <p className="mt-1 text-xs text-amber-700">{c.missing}: {formatNumber(questions.reduce((n,q) => n+q.unknown,0),locale)}</p>}
      </details>
      <div className="mt-3 space-y-1 text-sm text-gray-600">
        {(["unknown","transition","submission_failed","submission_pending"] as const).map(bucket => {
          const count = groups.reduce((n,g) => n+g[bucket],0), label = bucket === "unknown" ? c.history : c[bucket];
          return count ? <p key={bucket}>{label}: {countButton(count,{bucket,label})}{bucket === "unknown" && <span className="block text-xs text-gray-500">{c.historyNote}</span>}</p> : null;
        })}
      </div>
      <p className="mt-3 text-xs text-gray-500">{c.note}</p>
    </>}
    {selection && <QuestionnaireDropoffDialog {...props} report={report} selection={selection} onClose={() => setSelection(null)} />}
  </div>;
}

function QuestionnaireDropoffDialog({ report, journey, pharmacy, source, locale, labels, selection, onClose }: Props & {
  report: QuestionnaireFunnelReport; selection: Selection; onClose: () => void;
}) {
  const c = questionnaireFunnelCopy[locale];
  const [q,setQ] = useState(""), [cursor,setCursor] = useState(0), [limit,setLimit] = useState(50);
  const [responseState,setResponseState] = useState<{params:string;data:QuestionnaireDropoffPage} | null>(null);
  const [error,setError] = useState(false), [reload,setReload] = useState(0);
  const [lead,setLead] = useState<AdminLeadRow | null>(null), [opening,setOpening] = useState(false);
  const params = useMemo(() => {
    const p = new URLSearchParams({ ...report.filters, range:report.range, generatedAt:report.generatedAt, journey,
      bucket:selection.bucket, displayLocale:locale, q, cursor:String(cursor), limit:String(limit) });
    if (pharmacy) p.set("pharmacy",pharmacy);
    if (source) p.set("questionnaireSource",source);
    if (selection.question) p.set("question",selection.question);
    if (selection.version) p.set("version",selection.version);
    return p.toString();
  },[report,journey,pharmacy,source,selection,locale,q,cursor,limit]);
  const data = responseState?.params === params ? responseState.data : null;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setError(false);
      void fetch(`/api/admin/questionnaire-dropoffs?${params}`,{cache:"no-store",signal:controller.signal})
        .then(async response => { if (!response.ok) throw new Error("Unable to load"); return response.json() as Promise<QuestionnaireDropoffPage>; })
        .then(data => { if (!controller.signal.aborted) setResponseState({params,data}); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    },200);
    return () => { clearTimeout(timer); controller.abort(); };
  },[params,reload]);
  async function openLead(key: string) {
    setOpening(true); setError(false);
    try {
      const p = new URLSearchParams(params); p.set("attempt",key);
      const response = await fetch(`/api/admin/questionnaire-dropoffs?${p}`,{cache:"no-store"});
      if (!response.ok) throw new Error("Unable to load");
      const result = await response.json() as QuestionnaireDropoffPage;
      if (!result.lead) throw new Error("No lead");
      setLead(result.lead);
    } catch { setError(true); } finally { setOpening(false); }
  }
  if (lead) return <LeadDetailsModal row={lead} labels={labels} locale={locale} onClose={() => setLead(null)} />;
  const total = data?.total ?? 0;
  return <AdminModal onClose={onClose} panelClassName="max-w-5xl">
    <div className="border-b border-gray-100 px-6 py-5 pr-14"><h2 className="text-lg font-semibold">{selection.label}</h2><p className="mt-1 text-sm text-gray-500">{c.unit}</p></div>
    <div className="max-h-[75vh] space-y-4 overflow-y-auto p-6">
      <input type="search" aria-label={c.search} placeholder={c.search} value={q} onChange={e => {setQ(e.target.value);setCursor(0);}} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      {error ? <p role="alert">{c.error} <button className="underline" onClick={() => setReload(n=>n+1)}>{c.retry}</button></p> : !data ? <p role="status">{c.loading}</p> : <>
        <p className="text-sm text-gray-600">{formatNumber(total,locale)} {c.matches}</p>
        <div className="overflow-x-auto"><table className="min-w-full text-sm">
          <thead><tr>{[c.lead,c.lastAnswer,c.lastSeen].map(label=><th className="px-3 py-2 text-left" key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.key} className="border-t border-gray-100">
            <td className="px-3 py-3"><button className="text-left font-medium text-emerald-800 underline" disabled={opening} onClick={() => void openLead(row.key)} aria-label={`${c.details}: ${row.contactEmail || compactId(row.key)}`}>{row.contactEmail || compactId(row.ray || row.key)}</button><span className="block text-xs text-gray-500">{compactId(row.key)}</span></td>
            <td className="min-w-48 px-3 py-3">{questionLabel(row.lastAnsweredKey,row.version,locale)?.question ?? c.unknownQuestion}</td>
            <td className="whitespace-nowrap px-3 py-3">{formatGeneratedAt(row.lastSeenAt,locale)}</td>
          </tr>)}</tbody>
        </table></div>
        {!data.rows.length && <p>{c.noAttempts}</p>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label>{c.pageSize} <select className="rounded border p-1" value={limit} onChange={e=>{setLimit(Number(e.target.value));setCursor(0);}}>{[25,50,100].map(n=><option key={n}>{n}</option>)}</select></label>
          {[[c.first,0],[c.previous,Math.max(0,cursor-limit)],[c.next,cursor+limit],[c.last,Math.max(0,(Math.ceil(total/limit)-1)*limit)]].map(([label,target],i)=><button className="rounded border px-2 py-1 disabled:opacity-40" key={label} disabled={i<2 ? cursor===0 : cursor+limit>=total} onClick={()=>setCursor(Number(target))}>{label}</button>)}
          <span>{total ? cursor+1 : 0}–{Math.min(cursor+limit,total)} / {formatNumber(total,locale)}</span>
        </div>
      </>}
    </div>
  </AdminModal>;
}
