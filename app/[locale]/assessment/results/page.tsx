import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/assessment-store";
import { isLocale, type Locale } from "@/lib/i18n";
import { nutritionQuizPath, nutritionRevealPath } from "@/lib/nutrition-paths";

type AssessmentResultsRedirectPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    plan?: string;
  }>;
}>;

export default async function AssessmentResultsRedirectPage({
  params,
  searchParams
}: AssessmentResultsRedirectPageProps) {
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
