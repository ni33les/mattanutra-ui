import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FormulationResults } from "@/components/formulation-results";
import { PublicNutritionShell } from "@/components/nutrition-flow/public-nutrition-shell";
import { WebRevealPage } from "@/components/nutrition-flow/web-reveal-page";
import { ServiceIssue } from "@/components/service-issue";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import {
  getStoredAssessmentPrefill,
  getStoredFormulationRead,
  isUuid
} from "@/lib/assessment-store";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionProgressPath,
  nutritionRevealPath
} from "@/lib/nutrition-paths";
import { localizedRouteMetadata } from "@/lib/seo";
import { getFunnelReadiness } from "@/lib/funnel-readiness";
import { isPublicWebAssessment, isWebProductJourney, webProductJourneyEnabled } from "@/lib/web-product-journey";

type NutritionRevealPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    plan?: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function generateMetadata({
  params,
  searchParams
}: NutritionRevealPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const { plan } = await searchParams;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: !plan,
    locale,
    routeKey: "nutritionReveal"
  });
}

export default async function NutritionRevealPage({
  params,
  searchParams
}: NutritionRevealPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const { plan } = await searchParams;
  const planId = typeof plan === "string" && isUuid(plan) ? plan : "";
  const initialStackPreference = "balanced";

  if (!planId) {
    const currentPath = nutritionRevealPath(locale);

    return (
      <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={currentPath}
          title={dictionary.hero.eyebrow}
        />
        <PublicNutritionShell kind="reveal" locale={locale} />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const currentPath = nutritionRevealPath(locale, planId);
  const assessment = await getStoredAssessmentPrefill(planId);

  if (!assessment) {
    const databaseReady = await checkDatabaseConnection();

    if (!databaseReady) {
      return (
        <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
          <TitleBar
            currentLocale={locale}
            currentPath={currentPath}
            title={dictionary.hero.eyebrow}
          />
          <ServiceIssue href={currentPath} locale={locale} />
          <SiteFooter content={dictionary.footer} locale={locale} />
        </main>
      );
    }

    notFound();
  }

  const commerce = isWebProductJourney(assessment.journeyVersion) || (webProductJourneyEnabled() && isPublicWebAssessment(assessment.answers));
  const sourceLocale = commerce ? assessment.locale : locale;
  const readiness = await getFunnelReadiness(planId, sourceLocale);
  if (!commerce && !assessment.plan && !readiness?.hasFullPlanAccess) {
    redirect(nutritionHealthScorePath(locale, planId));
  }

  if (!commerce && !readiness?.readyForReveal) redirect(nutritionProgressPath(locale, planId));
  const stored = commerce && readiness?.formulationStatus === "ready"
    ? await getStoredFormulationRead(planId, { locale: sourceLocale, includeProducts: readiness.readyForReveal && !readiness.refreshPending }) : null;

  if (commerce) return (
    <WebRevealPage
      key={planId}
      locale={locale}
      planId={planId}
      initialResult={stored?.result?.access === "full" ? stored.result : null}
      commerce={{ sourceLocale, answers: assessment.answers as Record<string, unknown>, initial: readiness,
        bootstrap: !isWebProductJourney(readiness?.journeyVersion) }}
    />
  );

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <FormulationResults
        initialResult={stored?.result?.access === "full" ? stored.result : null}
        initialStackPreference={initialStackPreference}
        locale={locale}
        planId={planId}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
