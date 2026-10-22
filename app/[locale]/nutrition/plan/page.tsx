import { notFound, redirect } from "next/navigation";
import { WebPlanDetails } from "@/components/nutrition-flow/web-plan-details";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getStoredAssessmentPrefill, getStoredFormulationRead, isUuid } from "@/lib/assessment-store";
import { getRevisionHealthScore } from "@/lib/assessment-revisions";
import { getFunnelReadiness } from "@/lib/funnel-readiness";
import { getDictionary, isLocale } from "@/lib/i18n";
import { nutritionRevealPath } from "@/lib/nutrition-paths";
import { isWebProductJourney } from "@/lib/web-product-journey";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function WebFullPlan({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ plan?: string }>;
}) {
  const { locale } = await params, { plan } = await searchParams;
  if (!isLocale(locale) || !plan || !isUuid(plan)) notFound();
  const assessment = await getStoredAssessmentPrefill(plan), initial = await getFunnelReadiness(plan, locale);
  if (!assessment || !initial) notFound();
  if (!initial.hasFullPlanAccess || !isWebProductJourney(initial.journeyVersion)) redirect(nutritionRevealPath(locale, plan));
  const [stored, health] = await Promise.all([
    getStoredFormulationRead(plan, { locale, includeProducts: initial.readyForReveal && !initial.refreshPending }),
    getRevisionHealthScore(plan, locale, initial.revision),
  ]);
  const dictionary = getDictionary(locale);
  return <main className="mn-customer-shell min-h-screen bg-background text-foreground">
    <TitleBar currentLocale={locale} currentPath={`/${locale}/nutrition/plan?plan=${plan}`} title={dictionary.hero.eyebrow} />
    <WebPlanDetails locale={locale} planId={plan} initial={initial} initialResult={stored?.result ?? null} health={health} />
    <SiteFooter content={dictionary.footer} locale={locale} />
  </main>;
}
