import { preferenceMessage, type PreferenceAssessment } from "@/lib/matcher/preferences";
import type { WebHealthAdvice } from "@/lib/formulation-types";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
import { webMatchingCopy } from "@/lib/web-health-advice";

export function WebMatchingPillCount({ count, locale }: Readonly<{ count: number | null; locale: Locale }>) {
  return <span>{webMatchingCopy[locale].pills}: {count == null ? webMatchingCopy[locale].pillsUnknown : count}</span>;
}

export function WebHealthAdviceText({ advice, locale }: Readonly<{ advice: WebHealthAdvice; locale: Locale }>) {
  const url = advice.evidence.url && /^https?:\/\//i.test(advice.evidence.url) ? advice.evidence.url : null;
  return <div className="mt-3 text-sm leading-relaxed">
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
      {preferenceMessage(row.kind === "first_order_goods_price" ? { ...row, actual: row.actual == null ? null : row.actual / 100, preferred: row.preferred == null ? null : row.preferred / 100, unit: row.unit.replace(/_minor$/, "") } : row, locale)}
    </p>)}
  </div>;
}
