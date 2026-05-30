"use client";

import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import {
  localizedSupplementName,
  localizedReportFallbackBody,
  localizedReportFallbackTitle,
  localizedReportText,
} from "@/components/formulation-support-helpers";
import type { PanelLabels } from "@/components/formulation-results-helpers";
import { planRevealHref } from "@/components/formulation-results-helpers";
import {
  getLocalizedText,
  revealCopy,
  revealSlotCopy,
} from "@/components/formulation-reveal-copy";
import type { FormulationResult } from "@/lib/formulation-types";
import type { Locale } from "@/lib/i18n";

export function PreviewPaywallPanel({
  labels,
  unlockHref,
}: Readonly<{
  labels: PanelLabels;
  unlockHref: string;
}>) {
  return (
    <section className="mt-8 overflow-hidden rounded-lg bg-white p-5 ring-1 ring-[color-mix(in_srgb,var(--mn-teal)_20%,transparent)] sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#126b4f]">
            {labels.previewBadge}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--mn-ink)] text-balance">
            {labels.previewTitle}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.previewBody}
          </p>
        </div>
        <a className="mn-green-button" href={unlockHref}>
          {labels.previewCta}
        </a>
      </div>
    </section>
  );
}

export function FinalReportPanel({
  labels,
  locale,
  report,
}: Readonly<{
  labels: PanelLabels;
  locale: Locale;
  report: NonNullable<FormulationResult["nutritionReport"]>;
}>) {
  const sections = [
    {
      items: report.dailyFocus ?? [],
      title: labels.finalReportDailyFocus,
    },
    {
      items: report.synergies ?? [],
      title: labels.finalReportSynergies,
    },
    {
      items: report.nextSteps ?? [],
      title: labels.finalReportNextSteps,
    },
  ];

  return (
    <div className="mt-6 rounded-lg border border-[color-mix(in_srgb,var(--mn-gold)_15%,transparent)] bg-[var(--mn-mint)] p-5">
      <h3 className="text-2xl font-semibold tracking-normal text-[var(--mn-ink)] text-balance">
        {localizedReportText(
          report.title,
          locale,
          localizedReportFallbackTitle(locale),
        )}
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {localizedReportText(
          report.summary,
          locale,
          localizedReportFallbackBody(locale),
        )}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <div
            className="rounded-lg bg-white p-4 ring-1 ring-foreground/10"
            key={section.title}
          >
            <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--mn-ink)]">
              {section.title}
            </h4>
            <div className="mt-3 space-y-3">
              {section.items.map((item) => (
                <div key={item.id}>
                  <p className="text-sm font-semibold text-[var(--mn-ink)]">
                    {localizedReportText(item.title, locale, section.title)}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {localizedReportText(
                      item.body,
                      locale,
                      localizedReportFallbackBody(locale),
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {report.safetyNotes.length > 0 ? (
        <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-foreground/10">
          <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--mn-ink)]">
            {labels.finalReportSafetyNotes}
          </h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {report.safetyNotes.map((note, index) => (
              <li key={index}>
                {localizedReportText(
                  note,
                  locale,
                  labels.safetyNotes[index % labels.safetyNotes.length],
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function RevealClosingSection({
  copy,
  labels,
  locale,
  planId,
  result,
}: Readonly<{
  copy: typeof revealCopy.en;
  labels: PanelLabels;
  locale: Locale;
  planId: string;
  result: FormulationResult;
}>) {
  const cautions = [
    ...(result.cautions ?? []).map((caution) => ({
      body: getLocalizedText(caution.body, locale) || copy.wellnessOnly,
      title: caution.title ? getLocalizedText(caution.title, locale) : "",
    })),
    ...result.supplementBreakdown.flatMap((ingredient) =>
      (ingredient.cautions ?? []).map((caution) => ({
        body: getLocalizedText(caution.body, locale) || copy.wellnessOnly,
        title: caution.title
          ? getLocalizedText(caution.title, locale)
          : localizedSupplementName(
              ingredient.supplement,
              ingredient.id,
              locale,
            ),
      })),
    ),
  ].filter((caution) => caution.body);
  const hasStatinContext = result.assessmentSummary.constraints.some(
    (constraint) => /statin|สแตติน/i.test(constraint),
  );
  const safetyHeadline = hasStatinContext
    ? copy.statinCautionsTitle
    : copy.cautionsTitle;
  const safetyBody = revealSlotCopy(
    result,
    "safetyBody",
    locale,
    copy.wellnessOnly,
  );
  const closingTitle = copy.closingTitle;
  const closingBody = revealSlotCopy(
    result,
    "closingBody",
    locale,
    copy.closingBody,
  );

  return (
    <section className="relative overflow-hidden border-t border-[var(--mn-line)] bg-[var(--mn-teal-deep)] py-24 text-[#f5f0e2]">
      <div
        aria-hidden={true}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(184,149,74,0.12)_0%,transparent_48%),radial-gradient(circle_at_80%_80%,rgba(220,232,224,0.07)_0%,transparent_56%)]"
      />
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 sm:px-8">
        <div
          className="relative rounded-[10px] bg-white/[0.06] p-6 ring-1 ring-[#f5f0e2]/15 sm:p-8"
          data-reveal
        >
          <div className="flex gap-4">
            <span className="mt-1 grid size-11 shrink-0 place-items-center rounded-full bg-[var(--mn-gold-soft)] text-[var(--mn-teal-deep)]">
              <InformationCircleIcon aria-hidden={true} className="size-6" />
            </span>
            <div>
              <h2 className="font-serif text-2xl font-normal italic text-[var(--mn-gold-soft)]">
                {safetyHeadline}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#f5f0e2]/85">
                {safetyBody}
              </p>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[#f5f0e2]/80">
                {cautions.length > 0
                  ? cautions.map((caution, index) => (
                      <div key={`${caution.title}:${index}`}>
                        {caution.title ? (
                          <p className="font-semibold text-[#f5f0e2]">
                            {caution.title}
                          </p>
                        ) : null}
                        <p>{caution.body}</p>
                      </div>
                    ))
                  : labels.safetyNotes.map((note) => <p key={note}>{note}</p>)}
                <p>{copy.wellnessOnly}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative text-center" data-reveal>
          <p className="font-serif text-5xl font-light italic leading-none text-[var(--mn-gold-soft)] sm:text-7xl">
            मत्तञ्ञुतā
          </p>
          <p className="mn-mono-label mt-4 text-xs uppercase tracking-[0.24em] text-[#f5f0e2]/55">
            {copy.etymologyLine}
          </p>
          <h2
            className={`mx-auto mt-8 max-w-3xl font-serif text-4xl font-normal text-[#f5f0e2] ${
              locale === "th"
                ? "leading-[1.45] break-words [overflow-wrap:anywhere]"
                : "leading-tight text-balance"
            }`}
          >
            {locale === "en" ? (
              <>
                <em>{closingTitle}</em> — not from more, but from{" "}
                <em>exactly enough.</em>
              </>
            ) : (
              closingTitle
            )}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#f5f0e2]/75">
            {closingBody}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--mn-gold-soft)] px-7 py-4 text-sm font-semibold text-[var(--mn-teal-deep)] transition hover:bg-[#f2ddaa] motion-reduce:transition-none"
              onClick={() => window.print()}
              type="button"
            >
              <ArrowDownTrayIcon aria-hidden={true} className="size-4" />
              {copy.print}
            </button>
            <a
              className="inline-flex items-center justify-center rounded-full border border-[#f5f0e2]/30 px-7 py-4 text-sm font-semibold text-[#f5f0e2] transition hover:border-[var(--mn-gold-soft)] hover:text-[var(--mn-gold-soft)] motion-reduce:transition-none"
              href={planRevealHref(locale, planId)}
            >
              {copy.save}
            </a>
            <a
              className="inline-flex items-center justify-center rounded-full border border-[#f5f0e2]/30 px-7 py-4 text-sm font-semibold text-[#f5f0e2] transition hover:border-[var(--mn-gold-soft)] hover:text-[var(--mn-gold-soft)] motion-reduce:transition-none"
              href={`/${locale}/nutrition/quiz`}
            >
              {copy.reassess}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
