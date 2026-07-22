import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BlogArticle } from "@/components/blog-article";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { VisualKnowledgeArticle } from "@/components/visual-knowledge-article";
import { getDictionary, isLocale, type Locale, type LocaleCode } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";
import {
  getLibraryArticle,
  getLibraryArticleLocalePaths,
  getLibraryCopy,
  libraryArticleBreadcrumbJsonLd,
  libraryArticleFaqJsonLd,
  libraryArticleJsonLd
} from "@/lib/library";
import { localizedMetadata } from "@/lib/seo";

type LibraryArticlePageProps = Readonly<{
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}>;

type ArticleCta = {
  body: string;
  eyebrow: string;
  href: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  title: string;
};

// Library articles are public content; revalidate rather than force-dynamic.
// Keep in sync with marketingPageRevalidateSeconds in lib/public-cache-policy.ts
// (Next segment config requires a static numeric literal).
export const revalidate = 300;

function getArticleCta(locale: LocaleCode) {
  return {
    ...getNamespace<Omit<ArticleCta, "href" | "secondaryHref">>(
      locale,
      "customer.blogArticleCta"
    ),
    href: `/${locale}/nutrition/quiz`,
    secondaryHref: `/${locale}/library`
  };
}

export async function generateMetadata({
  params
}: LibraryArticlePageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;

  if (!isLocale(rawLocale)) {
    return {};
  }

  const locale: Locale = rawLocale;
  const article = await getLibraryArticle(locale, slug);

  if (!article) {
    return {};
  }

  const translatedPaths = await getLibraryArticleLocalePaths(
    article.post?.translationGroupId ?? article.slug,
    article.slug
  );

  const libraryCopy = getLibraryCopy(locale);
  const openGraphTitle = article.ogTitle ?? article.seoTitle;
  const openGraphDescription = article.ogDescription ?? article.seoDescription;
  const twitterTitle = article.twitterTitle ?? openGraphTitle;
  const twitterDescription =
    article.twitterDescription ?? openGraphDescription;

  return localizedMetadata({
    description: article.seoDescription,
    image: article.shareImage,
    locale,
    openGraphDescription,
    openGraphTitle,
    path: `/library/${article.slug}`,
    // Hand-off document titles: "<seoTitle> | คลังความรู้ MattaNutra" / "| The MattaNutra Library"
    title: `${article.seoTitle} | ${libraryCopy.eyebrow}`,
    translatedPaths,
    // Hand-off social titles are bare (no library suffix); descriptions often differ.
    twitterDescription,
    twitterTitle
  });
}

export default async function LibraryArticlePage({
  params
}: LibraryArticlePageProps) {
  const { locale: rawLocale, slug } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const currentPath = `/${locale}/library/${slug}`;
  const article = await getLibraryArticle(locale, slug);

  if (!article) {
    notFound();
  }

  if (article.slug !== slug) {
    permanentRedirect(`/${locale}/library/${article.slug}`);
  }

  const localizedPaths = await getLibraryArticleLocalePaths(
    article.post?.translationGroupId ?? article.slug,
    article.slug
  );
  const jsonLd = [
    libraryArticleJsonLd(article),
    libraryArticleFaqJsonLd(article),
    libraryArticleBreadcrumbJsonLd(article)
  ].filter(Boolean);

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        localizedPaths={localizedPaths}
        title={dictionary.hero.eyebrow}
        variant="landing"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c")
        }}
      />
      {article.visual ? (
        <VisualKnowledgeArticle article={article} />
      ) : article.post ? (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
          <BlogArticle cta={getArticleCta(locale)} post={article.post} />
        </div>
      ) : null}
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
