import type { WebHealthAdvice } from "@/lib/formulation-types";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
import { webMatchingCopy } from "@/lib/web-health-advice";

export function WebHealthAdviceText({ advice, locale }: Readonly<{ advice: WebHealthAdvice; locale: Locale }>) {
  const url = advice.evidence.url && /^https?:\/\//i.test(advice.evidence.url) ? advice.evidence.url : null;
  return <div className="mt-3 text-sm leading-relaxed">
    <p>{resolveLocalizedText(advice.message, locale)}</p>
    <p className="mt-1 text-xs">{webMatchingCopy[locale].evidence}: {url
      ? <a className="underline" href={url} target="_blank" rel="noreferrer">{advice.evidence.source}</a>
      : advice.evidence.source}{advice.evidence.confidence ? ` (${advice.evidence.confidence})` : ""}</p>
  </div>;
}
