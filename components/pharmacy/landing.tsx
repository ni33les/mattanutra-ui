import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { pharmacyCopy } from "@/lib/pharmacy-copy";
import { pharmacyPath } from "@/lib/pharmacy-journey";
export function PharmacyLanding({ locale, slug, name }: { locale: Locale; slug: string; name: string }) {
  const copy = pharmacyCopy[locale];
  return <section className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-16 sm:px-8 sm:py-24" data-testid="pharmacy-landing">
    <div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-widest text-[var(--mn-teal-deep)]">{name} · {copy.eyebrow}</p>
      <h1 className="mt-6 font-serif text-5xl leading-tight text-[var(--mn-ink)] sm:text-7xl">{copy.hero}</h1>
      <p className="mt-8 text-xl leading-relaxed">{copy.intro}</p><p className="mt-5 max-w-2xl leading-8 text-[var(--mn-ink-soft)]">{copy.body}</p>
      <div className="mt-9 flex flex-wrap items-center gap-5"><Link className="rounded-xl bg-[var(--mn-teal-deep)] px-7 py-4 text-lg font-semibold text-white" href={pharmacyPath(locale, slug, "quiz")}>{copy.start} →</Link><strong>{copy.free}</strong></div>
      <p className="mt-4 text-sm text-[var(--mn-ink-soft)]">{copy.thorough}</p><p className="mt-7 text-sm">{copy.privacy}</p>
    </div><div className="flex flex-wrap gap-6 border-t border-[var(--mn-line)] pt-7 text-sm font-semibold">{[copy.founded, copy.science, copy.registered].map(text => <span key={text}>{text}</span>)}</div>
  </section>;
}
