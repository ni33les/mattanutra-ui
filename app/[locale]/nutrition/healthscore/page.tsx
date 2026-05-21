import { notFound, redirect } from "next/navigation";
import { AssessmentFlow } from "@/components/assessment-flow";
import { HealthScoreAnalysisWait } from "@/components/healthscore-analysis-wait";
import { ServiceIssue } from "@/components/service-issue";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import {
  getStoredAssessmentPrefill,
  getStoredHealthScoreAnalysisSnapshot,
  isUuid
} from "@/lib/assessment-store";
import { getRandomPublishedTestimonial } from "@/lib/blog";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import {
  nutritionHealthScorePath,
  nutritionQuizPath
} from "@/lib/nutrition-paths";

type NutritionHealthScorePageProps = Readonly<{
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
  const { plan } = await searchParams;
  const planId = typeof plan === "string" && isUuid(plan) ? plan : "";

  if (!planId) {
    redirect(nutritionQuizPath(locale));
  }

  const currentPath = nutritionHealthScorePath(locale, planId);
  const databaseReady = await checkDatabaseConnection();

  if (!databaseReady) {
    return (
      <main className="flex min-h-screen flex-col bg-background text-foreground">
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

  const prefill = await getStoredAssessmentPrefill(planId);

  if (!prefill?.healthScore) {
    redirect(nutritionQuizPath(locale, planId));
  }

  const scoreAnalysis = await getStoredHealthScoreAnalysisSnapshot(planId);

  if (scoreAnalysis?.status !== "ready") {
    return (
      <main className="flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={currentPath}
          title={dictionary.hero.eyebrow}
        />
        <HealthScoreAnalysisWait locale={locale} planId={planId} />
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const exampleTestimonial = await getRandomPublishedTestimonial(locale);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <AssessmentFlow
        exampleTestimonial={exampleTestimonial}
        initialStage="healthscore"
        locale={locale}
        prefillAnswers={prefill.answers ?? null}
        returningHealthScore={scoreAnalysis.healthScore}
        returningPlan={prefill.plan ?? null}
        returningPlanId={prefill.planId ?? planId}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
