import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LibraryIndex } from "@/components/library-index";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { getLibraryArticles, getLibraryCopy } from "@/lib/library";
import {
  libraryIndexManualSocialMeta,
  localizedMetadata
} from "@/lib/seo";

type LibraryPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
}>;

// Library index is public content; revalidate rather than force-dynamic.
// Keep in sync with marketingPageRevalidateSeconds in lib/public-cache-policy.ts
// (Next segment config requires a static numeric literal).
export const revalidate = 300;

const libraryIndexOgImageByLocale: Partial<Record<Locale, string>> = {
  th: "/assets/og/mattanutra-library-th.jpg"
};
const defaultLibraryIndexOgImage = "/en/assets/mattanutra-og.png";

function libraryIndexOgImageFor(locale: Locale) {
  return libraryIndexOgImageByLocale[locale] ?? defaultLibraryIndexOgImage;
}

export async function generateMetadata({
  params
}: LibraryPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const copy = getLibraryCopy(locale);
  const libraryIndexOgImage = libraryIndexOgImageFor(locale);

  return localizedMetadata({
    description: copy.documentDescription,
    // Emit OG + twitter:card via hoisted <meta> so Next cannot auto-fill
    // twitter:title / twitter:description / twitter:image from openGraph.
    image: libraryIndexOgImage,
    includeTwitter: false,
    locale,
    manualSocialTags: true,
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
  const copy = getLibraryCopy(locale);
  const social = libraryIndexManualSocialMeta({
    description: copy.openGraphDescription,
    image: libraryIndexOgImageFor(locale),
    locale,
    title: copy.openGraphTitle
  });

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      {social.tags.map((tag) =>
        "property" in tag ? (
          <meta
            content={tag.content}
            key={tag.property}
            property={tag.property}
          />
        ) : (
          <meta content={tag.content} key={tag.name} name={tag.name} />
        )
      )}
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
