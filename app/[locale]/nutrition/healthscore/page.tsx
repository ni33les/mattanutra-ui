import { getRevisionHealthScore, getRevisionFormulationNutrientCount } from "@/lib/assessment-revisions";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicNutritionShell } from "@/components/nutrition-flow/public-nutrition-shell";
import { HealthScoreCopyGate } from "@/components/nutrition-flow/healthscore-copy-gate";
import { HealthScorePanel, HealthScorePaymentPanel } from "@/components/nutrition-flow/healthscore-panel";
import { webProductCopy } from "@/components/nutrition-flow/web-product-copy";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { firstNameFromAssessmentAnswers } from "@/lib/assessment-first-name";
import {
  getStoredAssessmentPrefill,
  hasHealthScoreAiCopy,
  isUuid
} from "@/lib/assessment-store";
import { computeHealthScore, type HealthScoreResult } from "@/lib/health-score";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionQuizPath,
  nutritionRevealPath
} from "@/lib/nutrition-paths";
import { assessmentSkipsHealthScore } from "@/lib/pharmacy-in-store";
import { getFunnelReadiness } from "@/lib/funnel-readiness";
import { localizedRouteMetadata } from "@/lib/seo";
import { cachedEvaluatedIngredientCatalogueCount } from "@/lib/supplement-catalogue-count";
import { isPublicWebAssessment, isWebProductJourney, webProductJourneyEnabled } from "@/lib/web-product-journey";

type NutritionHealthScorePageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    plan?: string;
    view?: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams
}: NutritionHealthScorePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const { plan } = await searchParams;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: !plan,
    locale,
    routeKey: "nutritionHealthScore"
  });
}

function refreshedHealthScore(
  answers: unknown,
  evaluatedIngredientCount: number,
  locale: Locale,
  storedHealthScore: HealthScoreResult | null | undefined,
  storedLocale: Locale,
  chosenNutrients: number | null
): HealthScoreResult {
  const refreshed = computeHealthScore(answers ?? null, locale, {
    evaluatedIngredientCount,
    ...(chosenNutrients == null ? {} : { chosenNutrients })
  });
  const refreshedPageContent = refreshed.pageContent;

  if (!refreshedPageContent || !storedHealthScore || storedLocale !== locale) {
    return refreshed;
  }

  return {
    ...refreshed,
    advice: storedHealthScore.advice ?? refreshed.advice,
    pageContent: {
      ...refreshedPageContent,
      ...(storedHealthScore.pageContent?.aiCopy
        ? {
            aiCopy: storedHealthScore.pageContent.aiCopy
          }
        : {})
    }
  } satisfies HealthScoreResult;
}

export default async function NutritionHealthScorePage({
  params,
  searchParams
}: NutritionHealthScorePageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const { plan, view } = await searchParams;
  const planId = typeof plan === "string" && isUuid(plan) ? plan : "";

  if (!planId) {
    const currentPath = nutritionHealthScorePath(locale);

    return (
      <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={currentPath}
          title={dictionary.hero.eyebrow}
        />
        <PublicNutritionShell kind="healthScore" locale={locale} />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const currentPath = `${nutritionHealthScorePath(locale, planId)}${view === "optional" ? "&view=optional" : ""}`;
  const prefill = await getStoredAssessmentPrefill(planId);

  const commerce = prefill && (isWebProductJourney(prefill.journeyVersion) || (webProductJourneyEnabled() && isPublicWebAssessment(prefill.answers)));
  if (commerce && view !== "optional") {
    redirect(nutritionRevealPath(locale, planId));
  }

  if (!commerce && assessmentSkipsHealthScore(prefill?.answers)) {
    redirect(nutritionRevealPath(locale, planId));
  }

  if (!prefill) {
    redirect(nutritionQuizPath(locale, planId));
  }

  const [currentHealthScore, readiness, chosenNutrients] = await Promise.all([
    getRevisionHealthScore(planId, locale, prefill.revision), getFunnelReadiness(planId, locale),
    getRevisionFormulationNutrientCount(planId, locale, prefill.revision)
  ]);
  if (!readiness?.readyForHealthScore || readiness.revision !== prefill.revision || !hasHealthScoreAiCopy(currentHealthScore, locale)) {
    return (
      <main className="mn-customer-shell flex min-h-screen flex-col bg-[var(--mn-cream)] text-[var(--mn-ink)]">
        <TitleBar
          currentLocale={locale}
          currentPath={currentPath}
          title={dictionary.hero.eyebrow}
        />
        {commerce && <p className="mx-auto w-full max-w-6xl px-6 py-5"><a href={nutritionRevealPath(locale, planId)}>{webProductCopy[locale].back}</a></p>}
        <HealthScoreCopyGate locale={locale} planId={planId} />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const healthScore = refreshedHealthScore(
    prefill.answers ?? null,
    cachedEvaluatedIngredientCatalogueCount(),
    locale,
    currentHealthScore,
    locale,
    chosenNutrients
  );
  const firstName = firstNameFromAssessmentAnswers(prefill.answers);

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-[var(--mn-cream)] text-[var(--mn-ink)]">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      {commerce && <p className="mx-auto w-full max-w-6xl px-6 py-5"><a href={nutritionRevealPath(locale, planId)}>{webProductCopy[locale].back}</a></p>}
      {commerce ? <HealthScorePanel firstName={firstName ?? undefined} locale={locale} planId={planId} revision={prefill.revision} result={healthScore} /> : <HealthScorePaymentPanel
        key={`${planId}:${prefill.revision}:${locale}`}
        firstName={firstName ?? undefined}
        locale={locale}
        planId={prefill.planId ?? planId}
        revision={prefill.revision}
        result={healthScore}
      />}
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
