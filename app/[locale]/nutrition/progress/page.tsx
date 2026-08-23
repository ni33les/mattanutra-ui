import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JourneyProgress } from "@/components/nutrition-flow/journey-progress";
import { TitleBar } from "@/components/title-bar";
import { isUuid } from "@/lib/assessment-store";
import { isLocale, locales, type Locale } from "@/lib/i18n";
import { getNutritionJourneySnapshot } from "@/lib/nutrition-journey-read";
import {
  nutritionHealthScorePath,
  nutritionProgressPath,
  nutritionQuizPath,
  nutritionRevealPath
} from "@/lib/nutrition-paths";
import { localizedRouteMetadata } from "@/lib/seo";

type NutritionProgressPageProps = Readonly<{
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
}: NutritionProgressPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const { plan } = await searchParams;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: !plan,
    locale,
    routeKey: "nutritionReveal"
  });
}

export default async function NutritionProgressPage({
  params,
  searchParams
}: NutritionProgressPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const { plan } = await searchParams;
  const planId = typeof plan === "string" && isUuid(plan) ? plan : "";

  if (!planId) {
    redirect(nutritionQuizPath(locale));
  }

  const snapshot = await getNutritionJourneySnapshot(planId);

  if (!snapshot) {
    redirect(nutritionQuizPath(locale));
  }

  if (snapshot.readyForReveal) {
    redirect(nutritionRevealPath(locale, planId));
  }

  if (snapshot.status === "healthscore_only") {
    redirect(nutritionHealthScorePath(locale, planId));
  }

  const currentPath = nutritionProgressPath(locale, planId);

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-[var(--mn-cream)] text-[var(--mn-ink)]">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title="MattaNutra"
        variant="landing"
      />
      <JourneyProgress initial={snapshot} locale={locale} planId={planId} />
    </main>
  );
}
