import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TitleBar } from "@/components/title-bar";
import { SiteFooter } from "@/components/site-footer";
import { PharmacyLanding } from "@/components/pharmacy/landing";
import { PharmacyQuiz } from "@/components/pharmacy/quiz";
import { PharmacyResults } from "@/components/pharmacy/results";
import { PharmacyProgress } from "@/components/pharmacy/progress";
import { FormulationResults } from "@/components/formulation-results";
import { getFunnelReadiness } from "@/lib/funnel-readiness";
import { isLocale, getDictionary } from "@/lib/i18n";
import { pharmacyPath, pharmacyOrganisationSlug } from "@/lib/pharmacy-journey";
import { resolvePharmacyOrganisation } from "@/lib/pharmacy-in-store";
import { pharmacyAssessment, readPharmacyOrder } from "@/lib/pharmacy-orders";
import { getStoredFormulationRead } from "@/lib/assessment-store";
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
  const currentPath = pharmacyPath(locale, slug, step as "landing" | "quiz" | "progress" | "reveal" | "plan", query);
  let content;
  if (step === "landing") content = <PharmacyLanding locale={locale} slug={pharmacy.slug} name={pharmacy.name} />;
  else if (step === "quiz") content = <PharmacyQuiz locale={locale} pharmacy={pharmacy} query={query} />;
  else {
    const planId = query.plan ?? "";
    const data = await (async () => {
      try {
        const { assessment } = await pharmacyAssessment(planId, slug);
        const order = await readPharmacyOrder(planId, slug, query.order);
        const status = step === "progress" ? await getFunnelReadiness(planId, assessment.locale) : null;
        const stored = order || step === "progress" ? null : await getStoredFormulationRead(planId, { locale: assessment.locale, includeProducts: true });
        return { assessment, order, stored, status };
      } catch (error) { if (error instanceof FunnelError && error.status === 404) notFound(); throw error; }
    })();
    if (step === "progress") {
      if (data.order || data.status?.readyForReveal) redirect(pharmacyPath(locale, slug, "reveal", { plan: planId, order: data.order?.receipt.id }));
      if (!data.status) notFound();
      content = <PharmacyProgress locale={locale} sourceLocale={data.assessment.locale} slug={slug} planId={planId} initial={data.status} />;
    } else {
      const result = data.order?.result ?? (data.stored?.readiness?.readyForReveal ? data.stored.result : null);
      if (!result) redirect(pharmacyPath(locale, slug, "progress", { plan: planId }));
      const revision = data.order?.receipt.revision ?? data.assessment.revision;
      content = step === "reveal" ? <FormulationResults locale={locale} planId={planId} initialResult={result}
        pharmacy={{ slug, name: pharmacy.name, revision, sourceLocale: data.order?.locale ?? data.assessment.locale, receipt: data.order?.receipt ?? null }} />
        : <PharmacyResults locale={locale} sourceLocale={data.order?.locale ?? data.assessment.locale} slug={slug} pharmacyName={pharmacy.name} planId={planId}
          revision={revision} initialResult={result} receipt={data.order?.receipt ?? null} />;
    }
  }
  return <main className={`mn-customer-shell flex min-h-screen flex-col bg-background text-foreground${step === "quiz" ? " mn-customer-shell--quiz" : ""}`}>
    <TitleBar currentLocale={locale} currentPath={currentPath} title={dictionary.hero.eyebrow}
      assessmentHref={pharmacyPath(locale, slug, "quiz")} variant={step === "quiz" ? "quiz" : "default"} />
    {content}
    {step !== "quiz" && <SiteFooter locale={locale} content={dictionary.footer} />}
  </main>;
}
