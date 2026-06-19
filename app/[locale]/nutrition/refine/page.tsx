import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/assessment-store";
import { isLocale, locales, type Locale } from "@/lib/i18n";
import { nutritionQuizPath, nutritionRevealPath } from "@/lib/nutrition-paths";
import { localizedRouteMetadata } from "@/lib/seo";

type LegacyNutritionRevealRedirectPageProps = Readonly<{
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

export async function generateMetadata({
  params
}: Pick<LegacyNutritionRevealRedirectPageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: false,
    locale,
    path: "/nutrition/refine",
    routeKey: "nutritionReveal"
  });
}

export default async function LegacyNutritionRevealRedirectPage({
  params,
  searchParams
}: LegacyNutritionRevealRedirectPageProps) {
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

  redirect(nutritionRevealPath(locale, planId));
}
