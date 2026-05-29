import { notFound, redirect } from "next/navigation";
import { FormulationResults } from "@/components/formulation-results";
import { ServiceIssue } from "@/components/service-issue";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getStoredFormulationResult, isUuid } from "@/lib/assessment-store";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { nutritionQuizPath, nutritionRevealPath } from "@/lib/nutrition-paths";

type NutritionRevealPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    plan?: string;
    stack?: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
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
  const { plan, stack } = await searchParams;
  const planId = typeof plan === "string" && isUuid(plan) ? plan : "";
  const initialStackPreference =
    stack === "compact" || stack === "balanced" ? stack : null;

  if (!planId) {
    redirect(nutritionQuizPath(locale));
  }

  const currentPath = nutritionRevealPath(locale, planId);
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

  const initialResult = await getStoredFormulationResult(planId, {
    locale,
    mode: "full"
  });

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <FormulationResults
        initialStackPreference={initialStackPreference}
        initialResult={initialResult}
        locale={locale}
        planId={planId}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
