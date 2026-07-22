import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LibraryIndex } from "@/components/library-index";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { getLibraryArticles, getLibraryCopy } from "@/lib/library";
import { localizedMetadata } from "@/lib/seo";

type LibraryPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

// Library index is public content; revalidate rather than force-dynamic.
// Keep in sync with marketingPageRevalidateSeconds in lib/public-cache-policy.ts
// (Next segment config requires a static numeric literal).
export const revalidate = 300;

export async function generateMetadata({
  params
}: LibraryPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const copy = getLibraryCopy(locale);

  return localizedMetadata({
    description: copy.documentDescription,
    // Hand-off library index ships an OG image and no twitter:* tags.
    image: "/en/assets/mattanutra-og.png",
    includeTwitter: false,
    locale,
    openGraphDescription: copy.openGraphDescription,
    openGraphTitle: copy.openGraphTitle,
    path: "/library",
    // Hand-off index titles use an em dash, not "| MattaNutra"
    title: copy.documentTitle
  });
}

export default async function LibraryPage({ params }: LibraryPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const currentPath = `/${locale}/library`;
  const articles = await getLibraryArticles(locale);

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
        variant="landing"
      />
      <LibraryIndex articles={articles} locale={locale} />
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
