import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/assessment-store";
import { isLocale, type Locale } from "@/lib/i18n";
import { nutritionQuizPath } from "@/lib/nutrition-paths";
import { localizedRouteMetadata } from "@/lib/seo";

type AssessmentRedirectPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams?: Promise<{
    plan?: string;
    reassessment?: string;
  }>;
}>;

export async function generateMetadata({
  params
}: Pick<AssessmentRedirectPageProps, "params">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: false,
    locale,
    path: "/assessment",
    routeKey: "nutritionQuiz"
  });
}

export default async function AssessmentRedirectPage({
  params,
  searchParams
}: AssessmentRedirectPageProps) {
  const { locale: rawLocale } = await params;
  const query = (await searchParams) ?? {};

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const planId =
    typeof query.plan === "string" && isUuid(query.plan) ? query.plan : "";

  redirect(
    nutritionQuizPath(locale, planId, {
      reassessment: query.reassessment === "1" ? "1" : undefined
    })
  );
}
