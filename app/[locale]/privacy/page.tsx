import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/legal-document";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { getLegalContent } from "@/lib/legal-content";
import { localizedMetadata } from "@/lib/seo";

type PrivacyPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: PrivacyPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const content = getLegalContent(locale, "privacy");

  return localizedMetadata({
    description: content.intro,
    locale,
    path: "/privacy",
    title: `MattaNutra | ${content.title}`
  });
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const content = getLegalContent(locale, "privacy");

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}/privacy`}
        title={dictionary.hero.eyebrow}
      />
      <LegalDocument content={content} />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
