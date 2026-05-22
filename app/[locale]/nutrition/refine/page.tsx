import { notFound } from "next/navigation";
import { FormulationResults } from "@/components/formulation-results";
import { ServiceIssue } from "@/components/service-issue";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getStoredFormulationResult, isUuid } from "@/lib/assessment-store";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { nutritionRefinePath } from "@/lib/nutrition-paths";

type NutritionRefinePageProps = Readonly<{
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

export default async function NutritionRefinePage({
  params,
  searchParams
}: NutritionRefinePageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const { plan } = await searchParams;
  const planId = typeof plan === "string" && isUuid(plan) ? plan : "";

  if (!planId) {
    notFound();
  }

  const currentPath = nutritionRefinePath(locale, planId);
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
        initialResult={initialResult}
        locale={locale}
        planId={planId}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
