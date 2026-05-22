import { notFound, redirect } from "next/navigation";
import { AssessmentFlow } from "@/components/assessment-flow";
import { ServiceIssue } from "@/components/service-issue";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getStoredAssessmentPrefill, isUuid } from "@/lib/assessment-store";
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

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <AssessmentFlow
        initialStage="healthscore"
        locale={locale}
        prefillAnswers={prefill.answers ?? null}
        returningHealthScore={prefill.healthScore}
        returningPlanId={prefill.planId ?? planId}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
