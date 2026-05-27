import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/assessment-store";
import { isLocale, locales, type Locale } from "@/lib/i18n";
import { nutritionRevealPath } from "@/lib/nutrition-paths";

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
    notFound();
  }

  redirect(nutritionRevealPath(locale, planId));
}
