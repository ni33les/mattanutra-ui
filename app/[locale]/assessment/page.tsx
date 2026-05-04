import { notFound } from "next/navigation";
import { AssessmentFlow } from "@/components/assessment-flow";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";

type AssessmentPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AssessmentPage({ params }: AssessmentPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}/assessment`}
        title={dictionary.hero.eyebrow}
      />
      <AssessmentFlow locale={locale} />
    </main>
  );
}
