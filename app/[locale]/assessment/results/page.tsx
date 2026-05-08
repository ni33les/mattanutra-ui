import { notFound } from "next/navigation";
import { FormulationResults } from "@/components/formulation-results";
import { SiteFooter } from "@/components/site-footer";
import { ServiceIssue } from "@/components/service-issue";
import { TitleBar } from "@/components/title-bar";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";

type AssessmentResultsPageProps = Readonly<{
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

export default async function AssessmentResultsPage({
  params,
  searchParams
}: AssessmentResultsPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const { plan } = await searchParams;
  const planId = plan ?? "demo";
  const currentPath = `/${locale}/assessment/results?plan=${planId}`;
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

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <FormulationResults locale={locale} planId={planId} />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
