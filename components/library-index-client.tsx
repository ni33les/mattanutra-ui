"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  LibraryArticleSummary,
  LibraryCategory,
  LibraryCategorySlug
} from "@/lib/library";

type LibraryIndexClientProps = Readonly<{
  allCategoryLabel: string;
  articles: readonly LibraryArticleSummary[];
  categories: readonly LibraryCategory[];
  categoryLabel: string;
  clearSearchLabel: string;
  emptyLabel: string;
  initialVisibleCount?: number;
  loadMoreLabel: string;
  noContentNote: string;
  resultLabel: string;
  resultsLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
}>;

type ActiveCategory = LibraryCategorySlug | "all";

function nongPoseAsset(pose: LibraryArticleSummary["pose"]) {
  return `/assets/library/nong/nong-${pose}.webp`;
}

function categoryTone(slug: LibraryCategorySlug) {
  switch (slug) {
    case "foundations":
      return "from-mint to-cream";
    case "vitamins":
      return "from-gold-tint to-cream";
    case "minerals":
      return "from-sand-soft to-cream";
    case "sleep-recovery":
      return "from-mint-deep to-cream";
    case "energy-longevity":
      return "from-forest-glow/70 to-cream";
    case "everyday-nutrition":
      return "from-cream-deep to-mint";
    case "brain-focus":
      return "from-gold-tint to-mint";
    case "joints-mobility":
      return "from-sand-soft to-mint-deep";
    case "stress-adaptogens":
      return "from-forest-glow/60 to-gold-tint";
    case "testing-personalisation":
      return "from-paper to-mint-deep";
  }
}

function isCategorySlug(
  value: string,
  categories: readonly LibraryCategory[]
): value is LibraryCategorySlug {
  return categories.some((category) => category.slug === value);
}

function searchableText(article: LibraryArticleSummary) {
  return `${article.title} ${article.category.label} ${article.excerpt}`.toLowerCase();
}

export function LibraryIndexClient({
  allCategoryLabel,
  articles,
  categories,
  categoryLabel,
  clearSearchLabel,
  emptyLabel,
  initialVisibleCount,
  loadMoreLabel,
  noContentNote,
  resultLabel,
  resultsLabel,
  searchLabel,
  searchPlaceholder
}: LibraryIndexClientProps) {
  const initialCount = initialVisibleCount ?? articles.length;
  const [activeCategory, setActiveCategory] = useState<ActiveCategory>("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(initialCount);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");

    if (!isCategorySlug(hash, categories)) {
      return;
    }

    const timeout = window.setTimeout(() => setActiveCategory(hash), 0);

    return () => window.clearTimeout(timeout);
  }, [categories]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return articles.filter((article) => {
      const categoryMatch =
        activeCategory === "all" || article.category.slug === activeCategory;
      const queryMatch =
        !normalizedQuery || searchableText(article).includes(normalizedQuery);

      return categoryMatch && queryMatch;
    });
  }, [activeCategory, articles, query]);

  const visibleArticles = filtered.slice(0, visibleCount);
  const showCount = query.trim() || activeCategory !== "all";

  function chooseCategory(category: ActiveCategory) {
    setActiveCategory(category);
    setVisibleCount(initialCount);

    if (category === "all") {
      history.replaceState(null, "", window.location.pathname);
      return;
    }

    history.replaceState(null, "", `#${category}`);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setVisibleCount(initialCount);
  }

  return (
    <section className="bg-paper py-16">
      <div className="mx-auto max-w-container px-7">
        <div className="mx-auto max-w-[760px]">
          <label className="sr-only" htmlFor="lib-search">
            {searchLabel}
          </label>
          <div className="relative">
            <Search
              aria-hidden={true}
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ash-soft"
            />
            <input
              autoComplete="off"
              className="w-full rounded-pill border border-line bg-paper py-3.5 pr-11 pl-11 text-[15px] text-ink placeholder:text-ash-soft transition focus:border-forest focus:ring-2 focus:ring-forest/20 focus:outline-none"
              id="lib-search"
              onChange={(event) => updateQuery(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label={clearSearchLabel}
                className="absolute top-1/2 right-3.5 -translate-y-1/2 text-ash transition-colors hover:text-ink"
                onClick={() => updateQuery("")}
                type="button"
              >
                <X aria-hidden={true} className="size-5" />
              </button>
            ) : null}
          </div>
        </div>

        <div
          aria-label={categoryLabel}
          className="mt-7 flex flex-wrap justify-center gap-2.5"
          data-library-filters={true}
        >
          <button
            className={
              activeCategory === "all"
                ? "inline-flex min-h-9 items-center justify-center rounded-pill bg-forest-deep px-4 py-2 text-center text-[13px] leading-tight font-semibold text-white transition-colors"
                : "inline-flex min-h-9 items-center justify-center rounded-pill border border-line px-4 py-2 text-center text-[13px] leading-tight font-semibold text-ink-soft transition-colors hover:border-forest hover:text-forest-deep"
            }
            onClick={() => chooseCategory("all")}
            type="button"
          >
            {allCategoryLabel}
          </button>
          {categories.map((category) => (
            <button
              className={
                activeCategory === category.slug
                  ? "inline-flex min-h-9 items-center justify-center rounded-pill bg-forest-deep px-4 py-2 text-center text-[13px] leading-tight font-semibold text-white transition-colors"
                  : "inline-flex min-h-9 items-center justify-center rounded-pill border border-line px-4 py-2 text-center text-[13px] leading-tight font-semibold text-ink-soft transition-colors hover:border-forest hover:text-forest-deep"
              }
              key={category.slug}
              onClick={() => chooseCategory(category.slug)}
              type="button"
            >
              {category.label}
            </button>
          ))}
        </div>

        {showCount ? (
          <p className="mt-8 mb-6 text-[13px] text-ash">
            {filtered.length} {filtered.length === 1 ? resultLabel : resultsLabel}
          </p>
        ) : null}

        <div
          className={`${showCount ? "mt-0" : "mt-10"} grid gap-7 sm:grid-cols-2 lg:grid-cols-3`}
          data-library-grid={true}
        >
          {visibleArticles.map((article) => {
            const card = (
              <>
                <div
                  className={`flex h-36 items-end justify-center bg-gradient-to-br sm:h-40 ${categoryTone(
                    article.category.slug
                  )} px-5 pt-4`}
                >
                  <Image
                    alt={`Nong Matta illustration - ${article.category.label}`}
                    className="h-[120px] w-auto object-contain sm:h-[136px]"
                    height={674}
                    loading="lazy"
                    src={nongPoseAsset(article.pose)}
                    unoptimized={true}
                    width={340}
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="mb-2 text-[11px] leading-tight font-bold tracking-[0.16em] text-forest-deep uppercase [overflow-wrap:anywhere]">
                    {article.category.label}
                  </p>
                  <h2 className="text-[18px] leading-snug font-semibold text-ink transition-colors [overflow-wrap:anywhere] group-hover:text-forest-deep md:text-[19px]">
                    {article.title}
                  </h2>
                  <p className="mt-3 text-[14px] leading-relaxed text-ash [overflow-wrap:anywhere]">
                    {article.excerpt}
                  </p>
                  {!article.hasContent ? (
                    <p className="mt-4 text-[12px] leading-relaxed text-ash-soft [overflow-wrap:anywhere]">
                      {noContentNote}
                    </p>
                  ) : null}
                </div>
              </>
            );
            const className = article.hasContent
              ? "group flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-cream transition-all hover:-translate-y-1 hover:shadow-soft"
              : "flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-cream";

            return article.hasContent ? (
              <Link
                className={className}
                data-cat={article.category.slug}
                data-library-card={true}
                href={article.href}
                key={`${article.locale}:${article.slug}`}
              >
                {card}
              </Link>
            ) : (
              <article
                className={className}
                data-cat={article.category.slug}
                data-library-card={true}
                key={`${article.locale}:${article.slug}`}
              >
                {card}
              </article>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-ash">{emptyLabel}</p>
        ) : null}

        {visibleCount < filtered.length ? (
          <div className="mt-10 text-center">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-pill border border-forest px-7 py-2.5 text-center text-[15px] leading-tight font-semibold text-forest-deep transition-colors hover:bg-forest-deep hover:text-white"
              onClick={() => setVisibleCount((count) => count + initialCount)}
              type="button"
            >
              {loadMoreLabel}
            </button>
          </div>
        ) : null}

        <div className="mt-12 text-center">
          <Link
            className="inline-flex items-center gap-2 font-semibold text-forest-deep transition-colors hover:text-ink"
            href="#top"
          >
            {searchLabel}
            <ArrowRight aria-hidden={true} className="size-4 -rotate-90" />
          </Link>
        </div>
      </div>
    </section>
  );
}
