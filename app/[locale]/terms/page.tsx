import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/legal-document";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { getLegalContent } from "@/lib/legal-content";
import { localizedRouteMetadata } from "@/lib/seo";

type TermsPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Static legal copy; long revalidate is fine if content ever becomes DB-backed.
export const revalidate = 3600;

export async function generateMetadata({
  params
}: TermsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    locale,
    routeKey: "terms"
  });
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const content = getLegalContent(locale, "terms");

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}/terms`}
        title={dictionary.hero.eyebrow}
      />
      <LegalDocument content={content} />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
