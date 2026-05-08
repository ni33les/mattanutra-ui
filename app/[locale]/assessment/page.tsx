import { notFound } from "next/navigation";
import { AssessmentFlow } from "@/components/assessment-flow";
import { SiteFooter } from "@/components/site-footer";
import { ServiceIssue } from "@/components/service-issue";
import { TitleBar } from "@/components/title-bar";
import { getStoredAssessmentPrefill, isUuid } from "@/lib/assessment-store";
import { getRandomPublishedTestimonial } from "@/lib/blog";
import { checkDatabaseConnection } from "@/lib/db";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";

type AssessmentPageProps = Readonly<{
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

export default async function AssessmentPage({
  params,
  searchParams
}: AssessmentPageProps) {
  const { locale: rawLocale } = await params;
  const query = (await searchParams) ?? {};

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const returningPlanId =
    typeof query.plan === "string" && isUuid(query.plan) ? query.plan : "";
  const currentPath = returningPlanId
    ? `/${locale}/assessment?plan=${encodeURIComponent(returningPlanId)}`
    : `/${locale}/assessment`;
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
        locale={locale}
        prefillAnswers={prefill?.answers ?? null}
        returningPlan={prefill?.plan ?? null}
        returningPlanId={prefill?.planId ?? undefined}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
