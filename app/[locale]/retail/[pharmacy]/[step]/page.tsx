import { randomUUID } from "node:crypto";
import { PharmacyAcquisitionContext } from "@/components/pharmacy/acquisition-context";
import { pharmacyAcquisitionFromAnswers, pharmacySource } from "@/lib/pharmacy-acquisition";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TitleBar } from "@/components/title-bar";
import { SiteFooter } from "@/components/site-footer";
import { PharmacyLanding } from "@/components/pharmacy/landing";
import { PharmacyQuiz } from "@/components/pharmacy/quiz";
import { PharmacyResults } from "@/components/pharmacy/results";
import { PharmacyCombined } from "@/components/pharmacy/combined";
import { isLocale, getDictionary } from "@/lib/i18n";
import { pharmacyPath, pharmacyOrganisationSlug } from "@/lib/pharmacy-journey";
import { resolvePharmacyOrganisation } from "@/lib/pharmacy-in-store";
import { pharmacyAssessment, readPharmacyOrder } from "@/lib/pharmacy-orders";
import { getStoredFormulationRead, isUuid } from "@/lib/assessment-store";
import { FunnelError } from "@/lib/funnel-errors";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Your pharmacy plan | MattaNutra", robots: { index: false, follow: false } };
export default async function PharmacyJourneyPage({ params, searchParams }: {
  params: Promise<{ locale: string; pharmacy: string; step: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, pharmacy: slug, step } = await params;
  if (!isLocale(locale) || !["landing", "quiz", "progress", "reveal", "plan"].includes(step)) notFound();
  const pharmacy = await resolvePharmacyOrganisation(pharmacyOrganisationSlug(slug));
  if (!pharmacy) notFound();
  const query = await searchParams, dictionary = getDictionary(locale);
  if (step === "progress") redirect(pharmacyPath(locale, slug, "reveal", query));
  const currentPath = pharmacyPath(locale, slug, step as "landing" | "quiz" | "progress" | "reveal" | "plan", query);
  let content;
  let entrySource = pharmacySource(query.source);
  if (step === "landing") {
    if (!isUuid(query.session ?? "")) redirect(pharmacyPath(locale, slug, "landing", { ...query, session: randomUUID(), source: pharmacySource(query.source) }));
    const acquisition = {source: pharmacySource(query.source), ray: query.session!};
    content = <PharmacyAcquisitionContext slug={pharmacy.slug} acquisition={acquisition}>
      <PharmacyLanding locale={locale} slug={pharmacy.slug} name={pharmacy.name} query={{...query, source: acquisition.source}} />
    </PharmacyAcquisitionContext>;
  }
  else if (step === "quiz") content = <PharmacyQuiz locale={locale} pharmacy={pharmacy} query={query} />;
  else {
    const planId = query.plan ?? "";
    const data = await (async () => {
      try {
        const { assessment } = await pharmacyAssessment(planId, slug);
        const order = await readPharmacyOrder(planId, slug, query.order);
        const stored = order ? null : await getStoredFormulationRead(planId, { locale: assessment.locale, includeProducts: true });
        return { assessment, order, stored };
      } catch (error) { if (error instanceof FunnelError && error.status === 404) notFound(); throw error; }
    })();
    const acquisition = pharmacyAcquisitionFromAnswers(data.assessment.answers) ?? {source: "unknown" as const, ray: planId};
    entrySource = acquisition.source;
    const result = data.order?.result ?? (data.stored?.readiness?.formulationStatus === "ready" ? data.stored.result : null);
    const revision = data.order?.receipt.revision ?? data.assessment.revision;
    if (step === "reveal") content = <PharmacyCombined key={`${planId}:${revision}:${locale}:${data.order?.receipt.id ?? "live"}`} locale={locale} sourceLocale={data.order?.locale ?? data.assessment.locale}
      slug={slug} pharmacyName={pharmacy.name} planId={planId} revision={revision}
      initial={data.stored?.readiness ?? null} initialResult={result} initialReceipt={data.order?.receipt ?? null} />;
    else {
      if (!result || (!data.order && !data.stored?.readiness?.readyForReveal)) redirect(pharmacyPath(locale, slug, "reveal", query));
      content = <PharmacyResults locale={locale} sourceLocale={data.order?.locale ?? data.assessment.locale} slug={slug} pharmacyName={pharmacy.name} planId={planId}
        revision={revision} initialResult={result} receipt={data.order?.receipt ?? null} />;
    }
    content = <PharmacyAcquisitionContext slug={pharmacy.slug} acquisition={acquisition}>{content}</PharmacyAcquisitionContext>;
  }
  return <main className={`mn-customer-shell flex min-h-screen flex-col bg-background text-foreground${step === "quiz" ? " mn-customer-shell--quiz" : ""}`}>
    <TitleBar currentLocale={locale} currentPath={currentPath} title={dictionary.hero.eyebrow}
      assessmentHref={pharmacyPath(locale, slug, "quiz", {source: entrySource, session: step === "landing" ? query.session : undefined})} variant={step === "quiz" ? "quiz" : "default"} />
    {content}
    {step !== "quiz" && <SiteFooter locale={locale} content={dictionary.footer} />}
  </main>;
}
