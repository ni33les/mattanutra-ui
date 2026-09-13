import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TitleBar } from "@/components/title-bar";
import { SiteFooter } from "@/components/site-footer";
import { PharmacyLanding } from "@/components/pharmacy/landing";
import { PharmacyQuiz } from "@/components/pharmacy/quiz";
import { PharmacyResults } from "@/components/pharmacy/results";
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
  if (!isLocale(locale) || !["landing", "quiz", "reveal", "plan"].includes(step)) notFound();
  const pharmacy = await resolvePharmacyOrganisation(pharmacyOrganisationSlug(slug));
  if (!pharmacy) notFound();
  const query = await searchParams, dictionary = getDictionary(locale);
  const currentPath = pharmacyPath(locale, slug, step as "landing" | "quiz" | "reveal" | "plan", query);
  let content;
  if (step === "landing") content = <PharmacyLanding locale={locale} slug={pharmacy.slug} name={pharmacy.name} />;
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
    content = <PharmacyResults locale={locale} sourceLocale={data.order?.locale ?? data.assessment.locale} slug={slug} pharmacyName={pharmacy.name} planId={planId}
      revision={data.order?.receipt.revision ?? data.assessment.revision} deep={step === "plan"}
      initialResult={data.order?.result ?? (data.stored?.readiness?.readyForReveal ? data.stored.result : null)} receipt={data.order?.receipt ?? null} />;
  }
  return <main className={`mn-customer-shell flex min-h-screen flex-col bg-background text-foreground${step === "quiz" ? " mn-customer-shell--quiz" : ""}`}>
    <TitleBar currentLocale={locale} currentPath={currentPath} title={dictionary.hero.eyebrow}
      assessmentHref={pharmacyPath(locale, slug, "quiz")} variant={step === "quiz" ? "quiz" : "default"} />
    {content}
    {step !== "quiz" && <SiteFooter locale={locale} content={dictionary.footer} />}
  </main>;
}
