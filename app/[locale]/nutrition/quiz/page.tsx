import { notFound } from "next/navigation";
import { AssessmentFlow } from "@/components/assessment-flow";
import { ServiceIssue } from "@/components/service-issue";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { nutritionQuizPath } from "@/lib/nutrition-paths";
import { getStoredAssessmentPrefill, isUuid } from "@/lib/assessment-store";

type NutritionQuizPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams?: Promise<{
    plan?: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function NutritionQuizPage({
  params,
  searchParams
}: NutritionQuizPageProps) {
  const { locale: rawLocale } = await params;
  const query = (await searchParams) ?? {};

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const returningPlanId =
    typeof query.plan === "string" && isUuid(query.plan) ? query.plan : "";
  const currentPath = nutritionQuizPath(locale, returningPlanId);
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

  const prefill = returningPlanId
    ? await getStoredAssessmentPrefill(returningPlanId)
    : null;

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <AssessmentFlow
        initialStage="quiz"
        locale={locale}
        prefillAnswers={prefill?.answers ?? null}
        returningHealthScore={prefill?.healthScore ?? null}
        returningPlanId={prefill?.planId ?? undefined}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
