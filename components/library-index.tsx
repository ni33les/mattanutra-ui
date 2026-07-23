import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LibraryIndexClient } from "@/components/library-index-client";
import {
  getLibraryCategories,
  getLibraryCopy,
  libraryIndexJsonLd,
  type LibraryArticleSummary
} from "@/lib/library";
import { nutritionQuizPath } from "@/lib/nutrition-paths";
import type { Locale } from "@/lib/i18n";

function HighlightedText({
  className,
  highlight,
  text
}: Readonly<{
  className: string;
  highlight: string;
  text: string;
}>) {
  const index = highlight ? text.indexOf(highlight) : -1;

  if (index < 0) {
    return <>{text}</>;
  }

  return (
    <>
      {text.slice(0, index)}
      <span className={className}>{highlight}</span>
      {text.slice(index + highlight.length)}
    </>
  );
}

export function LibraryIndex({
  articles,
  locale
}: Readonly<{
  articles: readonly LibraryArticleSummary[];
  locale: Locale;
}>) {
  const copy = getLibraryCopy(locale);
  const categories = getLibraryCategories(locale);
  const jsonLd = libraryIndexJsonLd({ articles, locale });
  const denseLocale = locale !== "en";
  const titleClassName = denseLocale
    ? "text-[42px] leading-[1.12] sm:text-[58px] lg:text-[72px]"
    : "text-[56px] leading-[0.96] sm:text-[76px] lg:text-[104px]";
  const introClassName = denseLocale
    ? "text-[20px] leading-[1.65] sm:text-[24px] lg:text-[28px]"
    : "text-[22px] leading-[1.6] sm:text-[28px] lg:text-[36px]";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c")
        }}
      />
      <div id="top" className="bg-cream">
        <nav
          aria-label={copy.breadcrumbLabel}
          className="mx-auto max-w-container px-7 pt-8 text-[18px] text-ash md:pt-12 md:text-[26px]"
          data-library-breadcrumb={true}
        >
          <Link className="transition-colors hover:text-forest-deep" href={`/${locale}`}>
            {copy.breadcrumbHome}
          </Link>
          <span className="mx-2 text-ash-soft md:mx-4">/</span>
          <span className="font-medium text-ink">{copy.eyebrow}</span>
        </nav>

        <section className="border-b border-line bg-cream" data-library-index-header={true}>
          <div className="mx-auto flex max-w-container items-end justify-between gap-10 px-7 py-18 md:py-28">
            <div className="max-w-[1280px]">
              <p className="mb-8 text-sm leading-tight font-semibold tracking-[0.28em] text-forest-deep uppercase md:text-[24px]">
                {copy.eyebrow}
              </p>
              <h1 className={`max-w-full break-words font-display font-medium text-ink ${titleClassName}`}>
                <HighlightedText
                  className="font-normal italic text-forest-deep"
                  highlight={copy.headerTitleAccent}
                  text={copy.headerTitle}
                />
              </h1>
              <p className={`mt-10 max-w-[1260px] text-ink-soft ${introClassName}`}>
                <HighlightedText
                  className="italic text-forest-deep"
                  highlight={copy.headerIntroEmphasis}
                  text={copy.headerIntro}
                />
              </p>
              <p className="mt-10 max-w-[860px] text-[19px] leading-[1.6] text-ash md:text-[28px]">
                <HighlightedText
                  className="font-bold text-forest-deep"
                  highlight={copy.guideName}
                  text={copy.headerGuide}
                />
              </p>
            </div>
            <Image
              alt={copy.guideImageAlt}
              className="hidden h-40 w-auto md:block"
              height={320}
              src="/assets/library/nong/nong-open.webp"
              unoptimized={true}
              width={280}
            />
          </div>
        </section>

        <LibraryIndexClient
          allCategoryLabel={copy.allCategory}
          articleImageAltPrefix={copy.articleImageAltPrefix}
          articles={articles}
          categories={categories}
          categoryLabel={copy.categoryLabel}
          clearSearchLabel={copy.clearSearch}
          emptyLabel={copy.empty}
          loadMoreLabel={copy.loadMore}
          locale={locale}
          noContentNote={copy.noContentNote}
          resultLabel={copy.result}
          resultsLabel={copy.results}
          searchLabel={copy.searchLabel}
          searchPlaceholder={copy.searchPlaceholder}
        />

        <section className="bg-[radial-gradient(circle_at_85%_0%,rgba(45,143,114,0.28),transparent_55%),linear-gradient(160deg,#1F6E58_0%,#0E2D4D_100%)] text-cream">
          <div className="mx-auto flex max-w-container items-center justify-between gap-10 px-7 py-16">
            <div className="max-w-[680px]">
              <p className="text-xs font-semibold tracking-[0.22em] text-forest-glow uppercase">
                {copy.eyebrow}
              </p>
              <h2 className="mt-3 font-display text-[clamp(30px,4vw,46px)] leading-[1.08] whitespace-pre-line text-white">
                {copy.ctaTitle}
              </h2>
              <p className="mt-5 text-[17px] leading-[1.7] text-cream/80">
                {copy.ctaBody}
              </p>
              <Link
                className="mt-7 inline-flex min-h-12 max-w-full items-center justify-center gap-2.5 rounded-pill bg-cream px-8 py-3.5 text-base leading-tight font-bold text-ink transition-transform hover:-translate-y-0.5"
                href={nutritionQuizPath(locale)}
              >
                <span className="min-w-0 break-words">{copy.ctaButton}</span>
                <ArrowRight aria-hidden={true} className="size-[18px]" />
              </Link>
            </div>
            <Image
              alt={copy.ctaImageAlt}
              className="hidden h-48 w-auto md:block"
              height={431}
              src="/assets/library/nong/nong-celebrate.webp"
              unoptimized={true}
              width={340}
            />
          </div>
        </section>
      </div>
    </>
  );
}
