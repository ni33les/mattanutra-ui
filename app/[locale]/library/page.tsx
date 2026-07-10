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

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: LibraryPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const copy = getLibraryCopy(locale);

  return localizedMetadata({
    description: copy.intro,
    locale,
    path: "/library",
    title: `${copy.eyebrow} | MattaNutra`
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
