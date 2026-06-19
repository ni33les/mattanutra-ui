import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AssessmentFlow } from "@/components/assessment-flow";
import { ServiceIssue } from "@/components/service-issue";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { checkDatabaseConnection } from "@/lib/db";
import { devShortcutsEnabledForHost } from "@/lib/dev-shortcuts";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { nutritionQuizPath } from "@/lib/nutrition-paths";
import { getStoredAssessmentPrefill, isUuid } from "@/lib/assessment-store";
import { getAssessmentResumeDraft } from "@/lib/assessment-resume-store";
import { localizedRouteMetadata } from "@/lib/seo";

type NutritionQuizPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams?: Promise<{
    payment?: string;
    plan?: string;
    resume?: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams
}: NutritionQuizPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const query = (await searchParams) ?? {};
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const hasPrivateState = Boolean(query.plan || query.resume || query.payment);

  return localizedRouteMetadata({
    indexable: !hasPrivateState,
    locale,
    routeKey: "nutritionQuiz"
  });
}

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
  const resumeToken =
    typeof query.resume === "string" && query.resume.length > 20
      ? query.resume
      : "";
  const paymentId =
    typeof query.payment === "string" && isUuid(query.payment)
      ? query.payment
      : "";
  const currentPath = nutritionQuizPath(locale, returningPlanId);
  const requestHeaders = await headers();
  const showDevShortcut = devShortcutsEnabledForHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  );
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

  const resumeDraft = resumeToken
    ? await getAssessmentResumeDraft(resumeToken)
    : null;
  const effectivePlanId = returningPlanId || resumeDraft?.planId || "";
  const prefill = effectivePlanId && !resumeDraft
    ? await getStoredAssessmentPrefill(effectivePlanId)
    : null;

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <AssessmentFlow
        initialStage="quiz"
        initialSectionIndex={resumeDraft?.sectionIndex}
        locale={locale}
        paymentId={paymentId || undefined}
        prefillAnswers={resumeDraft?.answers ?? prefill?.answers ?? null}
        prefillContactEmail={resumeDraft?.contactEmail ?? prefill?.contactEmail ?? null}
        returningHealthScore={prefill?.healthScore ?? null}
        returningPlanId={resumeDraft?.planId ?? prefill?.planId ?? undefined}
        resumeToken={resumeToken || undefined}
        showDevShortcut={showDevShortcut}
      />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
