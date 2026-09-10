import { preferenceMessage, type PreferenceAssessment } from "@/lib/matcher/preferences";
import type { WebHealthAdvice } from "@/lib/formulation-types";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
import { partitionWebMatchingAdvice, webRoutineCopy, webMatchingCopy } from "@/lib/web-health-advice";

export function WebMatchingPillCount({ count, lowerBound, locale }: Readonly<{ count: number | null; lowerBound?: number; locale: Locale }>) {
  return <span>{webMatchingCopy[locale].pills}: {count == null ? lowerBound != null && lowerBound > 0 ? webRoutineCopy[locale].lower(lowerBound) : webMatchingCopy[locale].pillsUnknown : count}</span>;
}

export function WebHealthAdviceText({ advice, locale }: Readonly<{ advice: WebHealthAdvice; locale: Locale }>) {
  const url = advice.evidence.url && /^https?:\/\//i.test(advice.evidence.url) ? advice.evidence.url : null;
  return <div className="mt-3 text-sm leading-relaxed" data-advice-code={advice.code}>
    <p>{resolveLocalizedText(advice.message, locale)}</p>
    <p className="mt-1 text-xs">{webMatchingCopy[locale].evidence}: {url
      ? <a className="underline" href={url} target="_blank" rel="noreferrer">{advice.evidence.source}</a>
      : advice.evidence.source}{advice.evidence.confidence ? ` (${advice.evidence.confidence})` : ""}</p>
  </div>;
}

export function WebPreferenceAdvice({ preferences, locale }: Readonly<{ preferences?: readonly PreferenceAssessment[]; locale: Locale }>) {
  const requested = preferences?.filter(row => row.status !== "not_requested") ?? [];
  if (!requested.length) return null;
  return <div className="mt-3 space-y-2 text-sm leading-relaxed">
    {requested.map(row => <p key={row.kind} data-preference={row.kind} data-prominent={row.prominent ? "true" : undefined} className={row.prominent ? "font-semibold" : undefined}>
      {preferenceMessage(["first_order_goods_price", "monthly_goods_price"].includes(row.kind) ? { ...row, actual: row.actual == null ? null : row.actual / 100, preferred: row.preferred == null ? null : row.preferred / 100, unit: row.unit.replace(/_minor$/, "") } : row, locale)}
    </p>)}
  </div>;
}

/** Alternative cards disclose details on demand; the selected basket exposes its medical cautions. */
export function WebMatchingAdvice({ advice, locale, selected }: Readonly<{ advice: readonly WebHealthAdvice[]; locale: Locale; selected: boolean }>) {
  const rows = partitionWebMatchingAdvice(advice), copy = webRoutineCopy[locale];
  const details = selected ? rows.details : [...rows.medical, ...rows.details];
  return <>
    {selected && rows.medical.length > 0 ? <aside data-testid="medical-cautions" aria-label={copy.medical} className="my-4 rounded-xl border border-[var(--mn-line)] p-5">
      <h3 className="font-semibold">{copy.medical}</h3>
      {rows.medical.map((row, index) => <WebHealthAdviceText key={`${row.code}:${index}`} advice={row} locale={locale} />)}
    </aside> : null}
    {details.length > 0 ? <details className="my-3 text-sm" data-testid="matching-advice-details"><summary className="cursor-pointer underline">{copy.details} ({details.length})</summary>
      {details.map((row, index) => <WebHealthAdviceText key={`${row.code}:${index}`} advice={row} locale={locale} />)}
    </details> : null}
  </>;
}
