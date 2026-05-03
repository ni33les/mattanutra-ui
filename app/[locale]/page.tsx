import { notFound } from "next/navigation";
import { FeatureRow } from "@/components/feature-row";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";

type HomeProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function Home({ params }: HomeProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar currentLocale={locale} title={dictionary.hero.eyebrow} />
      <div className="flex-1" />
      <FeatureRow />
      <SiteFooter />
    </main>
  );
}
