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
          aria-label="Breadcrumb"
          className="mx-auto max-w-container px-7 pt-8 text-[13px] text-ash"
        >
          <Link className="transition-colors hover:text-forest-deep" href={`/${locale}`}>
            {copy.breadcrumbHome}
          </Link>
          <span className="mx-1.5 text-ash-soft">/</span>
          <span className="font-medium text-ink-soft">{copy.eyebrow}</span>
        </nav>

        <section className="border-b border-line bg-cream">
          <div className="mx-auto flex max-w-container items-center justify-between gap-10 px-7 py-14 md:py-18">
            <div className="max-w-[760px]">
              <p className="mb-4 text-xs font-semibold tracking-[0.22em] text-forest-deep uppercase">
                {copy.eyebrow}
              </p>
              <h1
                className={`max-w-[800px] break-words font-display leading-[1.08] text-ink ${
                  denseLocale
                    ? "text-[clamp(30px,4.2vw,50px)]"
                    : "text-[clamp(32px,4.6vw,54px)]"
                }`}
              >
                {copy.title}
              </h1>
              <p className="mt-5 max-w-[620px] text-[18px] leading-[1.7] text-ink-soft">
                {copy.intro}
              </p>
              <p className="mt-4 text-[14px] text-ash">
                {copy.guide}{" "}
                <b className="text-forest-deep">{copy.guideName}</b>.
              </p>
            </div>
            <Image
              alt={copy.guideImageAlt}
              className="hidden h-40 w-auto md:block"
              height={466}
              priority={true}
              src="/assets/library/nong/nong-open.webp"
              unoptimized={true}
              width={340}
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
              <h2 className="mt-3 font-display text-[clamp(30px,4vw,46px)] leading-[1.08] text-white">
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
