import type { BlogArticleBody, BlogPost } from "@/lib/blog";
import {
  getPublishedBlogPost,
  getPublishedBlogPostLocalePaths,
  getPublishedBlogPosts
} from "@/lib/blog";
import {
  defaultLocale,
  localeHtmlLang,
  publicLocales,
  type Locale,
  type LocaleCode
} from "@/lib/i18n";
import { t, type MessageId } from "@/lib/i18n-messages";
import {
  getStaticLibraryArticle,
  getStaticLibraryCanonicalSlug,
  getStaticLibraryTranslation,
  staticLibraryArticles,
  type StaticLibraryArticleContent,
  type VisualKnowledgeTranslation
} from "@/lib/library-static";
import { absoluteUrl } from "@/lib/seo";

export type LibraryCategorySlug =
  | "energy-longevity"
  | "everyday-nutrition"
  | "foundations"
  | "minerals"
  | "sleep-recovery"
  | "vitamins";

export type LibraryCategory = Readonly<{
  label: string;
  slug: LibraryCategorySlug;
}>;

export type NongPose =
  | "ask"
  | "bloated"
  | "celebrate"
  | "comparing"
  | "coffee"
  | "energetic"
  | "explaining"
  | "gut-bloated"
  | "kneeling"
  | "measuring"
  | "money"
  | "muscular"
  | "open"
  | "reassuring"
  | "sleep-supine"
  | "spicy-bloated"
  | "stressed"
  | "thinking"
  | "vegan"
  | "warning";

const nongPoses = [
  "ask",
  "bloated",
  "celebrate",
  "comparing",
  "coffee",
  "energetic",
  "explaining",
  "gut-bloated",
  "kneeling",
  "measuring",
  "money",
  "muscular",
  "open",
  "reassuring",
  "sleep-supine",
  "spicy-bloated",
  "stressed",
  "thinking",
  "vegan",
  "warning"
] as const satisfies readonly NongPose[];

const nongPoseSet = new Set<string>(nongPoses);

function normalizeNongPoseToken(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const withoutPrefix = trimmed.startsWith("nong_")
    ? trimmed.slice("nong_".length)
    : trimmed.startsWith("nong-")
      ? trimmed.slice("nong-".length)
      : trimmed;
  return withoutPrefix.replaceAll("_", "-");
}

function isNongPose(value: unknown): value is NongPose {
  return typeof value === "string" && nongPoseSet.has(normalizeNongPoseToken(value));
}

function toNongPose(value: unknown): NongPose {
  if (typeof value !== "string") {
    return "thinking";
  }

  const normalized = normalizeNongPoseToken(value);
  return nongPoseSet.has(normalized) ? (normalized as NongPose) : "thinking";
}

export type LibraryArticleSource = "blog" | "static";

export type LibraryArticleSummary = Readonly<{
  category: LibraryCategory;
  datePublished: string;
  excerpt: string;
  hasContent: boolean;
  href: string;
  locale: Locale;
  pose: NongPose;
  shareImage?: string;
  source: LibraryArticleSource;
  title: string;
  slug: string;
}>;

export type LibraryArticle = LibraryArticleSummary &
  Readonly<{
    post?: BlogPost;
    ogDescription?: string;
    ogTitle?: string;
    seoDescription: string;
    seoTitle: string;
    twitterDescription?: string;
    twitterTitle?: string;
    visual?: StaticLibraryArticleContent;
    visualTranslation?: VisualKnowledgeTranslation;
  }>;

type LibraryCopy = Readonly<{
  allCategory: string;
  articleImageAltPrefix: string;
  articleListName: string;
  breadcrumbHome: string;
  breadcrumbLabel: string;
  browse: string;
  categoryLabel: string;
  clearSearch: string;
  ctaBody: string;
  ctaButton: string;
  ctaImageAlt: string;
  ctaTitle: string;
  documentDescription: string;
  documentTitle: string;
  empty: string;
  eyebrow: string;
  openGraphDescription: string;
  openGraphTitle: string;
  featuredListName: string;
  guide: string;
  guideImageAlt: string;
  guideName: string;
  headerGuide: string;
  headerIntro: string;
  headerIntroEmphasis: string;
  headerTitle: string;
  headerTitleAccent: string;
  intro: string;
  landingIntro: string;
  landingTitle: string;
  landingTitleAccent: string;
  loadMore: string;
  noContentNote: string;
  result: string;
  results: string;
  searchLabel: string;
  searchPlaceholder: string;
  sectionIntro: string;
  title: string;
}>;

export const libraryCategories = [
  { label: "Foundations", slug: "foundations" },
  { label: "Vitamins", slug: "vitamins" },
  { label: "Minerals", slug: "minerals" },
  { label: "Sleep & Recovery", slug: "sleep-recovery" },
  { label: "Energy & Longevity", slug: "energy-longevity" },
  { label: "Everyday Nutrition", slug: "everyday-nutrition" }
] as const satisfies readonly LibraryCategory[];

const libraryCategoryMessageIds = {
  "energy-longevity": "customer.libraryCategories.energyLongevity",
  "everyday-nutrition": "customer.libraryCategories.everydayNutrition",
  foundations: "customer.libraryCategories.foundations",
  minerals: "customer.libraryCategories.minerals",
  "sleep-recovery": "customer.libraryCategories.sleepRecovery",
  vitamins: "customer.libraryCategories.vitamins"
} satisfies Record<LibraryCategorySlug, MessageId>;

const categoryBySlug = new Map<LibraryCategorySlug, LibraryCategory>(
  libraryCategories.map((category) => [category.slug, category])
);

export const launchLibraryArticles = staticLibraryArticles
  .map((article) => ({
    categorySlug: toCategorySlug(article.categorySlug),
    datePublished: article.datePublished,
    excerpt: article.translations.en.excerpt,
    pose: toNongPose(article.nongPose ?? article.pose),
    slug: article.slug,
    title: article.translations.en.title
  }))
  .sort((first, second) => second.datePublished.localeCompare(first.datePublished));

const staticSlugs = new Set(staticLibraryArticles.map((article) => article.slug));

const libraryCopyMessageIds = {
  allCategory: "customer.libraryIndex.allCategory",
  articleImageAltPrefix: "customer.libraryIndex.articleImageAltPrefix",
  articleListName: "customer.libraryIndex.articleListName",
  breadcrumbHome: "customer.libraryIndex.breadcrumbHome",
  breadcrumbLabel: "customer.libraryIndex.breadcrumbLabel",
  browse: "customer.libraryIndex.browse",
  categoryLabel: "customer.libraryIndex.categoryLabel",
  clearSearch: "customer.libraryIndex.clearSearch",
  ctaBody: "customer.libraryIndex.ctaBody",
  ctaButton: "customer.libraryIndex.ctaButton",
  ctaImageAlt: "customer.libraryIndex.ctaImageAlt",
  ctaTitle: "customer.libraryIndex.ctaTitle",
  documentDescription: "customer.libraryIndex.documentDescription",
  documentTitle: "customer.libraryIndex.documentTitle",
  empty: "customer.libraryIndex.empty",
  eyebrow: "customer.libraryIndex.eyebrow",
  openGraphDescription: "customer.libraryIndex.openGraphDescription",
  openGraphTitle: "customer.libraryIndex.openGraphTitle",
  featuredListName: "customer.libraryIndex.featuredListName",
  guide: "customer.libraryIndex.guide",
  guideImageAlt: "customer.libraryIndex.guideImageAlt",
  guideName: "customer.libraryIndex.guideName",
  headerGuide: "customer.libraryIndex.headerGuide",
  headerIntro: "customer.libraryIndex.headerIntro",
  headerIntroEmphasis: "customer.libraryIndex.headerIntroEmphasis",
  headerTitle: "customer.libraryIndex.headerTitle",
  headerTitleAccent: "customer.libraryIndex.headerTitleAccent",
  intro: "customer.libraryIndex.intro",
  landingIntro: "customer.libraryIndex.landingIntro",
  landingTitle: "customer.libraryIndex.landingTitle",
  landingTitleAccent: "customer.libraryIndex.landingTitleAccent",
  loadMore: "customer.libraryIndex.loadMore",
  noContentNote: "customer.libraryIndex.noContentNote",
  result: "customer.libraryIndex.result",
  results: "customer.libraryIndex.results",
  searchLabel: "customer.libraryIndex.searchLabel",
  searchPlaceholder: "customer.libraryIndex.searchPlaceholder",
  sectionIntro: "customer.libraryIndex.sectionIntro",
  title: "customer.libraryIndex.title"
} satisfies Record<keyof LibraryCopy, MessageId>;

export function getLibraryCopy(locale: LocaleCode): LibraryCopy {
  const copy = {} as Record<keyof LibraryCopy, string>;

  for (const key of Object.keys(libraryCopyMessageIds) as Array<keyof LibraryCopy>) {
    copy[key] = t(locale, libraryCopyMessageIds[key]);
  }

  return copy as LibraryCopy;
}

export function getLibraryCategories(locale: LocaleCode): readonly LibraryCategory[] {
  return libraryCategories.map((category) => ({
    label: t(locale, libraryCategoryMessageIds[category.slug]),
    slug: category.slug
  }));
}

export function categoryForSlug(
  slug: LibraryCategorySlug,
  locale: LocaleCode = defaultLocale
): LibraryCategory {
  return (
    getLibraryCategories(locale).find((category) => category.slug === slug) ??
    categoryBySlug.get(slug) ??
    libraryCategories[0]
  );
}

export function nongPoseAsset(pose: NongPose) {
  return `/assets/library/nong/nong-${pose}.webp`;
}

export function libraryArticleHref(locale: LocaleCode, slug: string) {
  return `/${locale}/library/${slug}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isCategorySlug(value: unknown): value is LibraryCategorySlug {
  return Boolean(
    typeof value === "string" && categoryBySlug.has(value as LibraryCategorySlug)
  );
}

function toCategorySlug(value: unknown): LibraryCategorySlug {
  return isCategorySlug(value) ? value : "foundations";
}

function hasStructuredBody(body: BlogArticleBody) {
  return Boolean(
    body.intro?.trim() ||
      body.closing?.trim() ||
      body.sectionBody?.trim() ||
      body.sectionTitle?.trim() ||
      body.points?.some((point) => point.title.trim() || point.body.trim())
  );
}

function postHasContent(post: BlogPost) {
  return Boolean(post.contentMarkdown.trim() || hasStructuredBody(post.body));
}

function isLibraryPost(post: BlogPost) {
  const metadata = metadataRecord(post.metadata);

  return (
    metadata.contentSurface === "library" ||
    metadata.content_surface === "library" ||
    staticSlugs.has(post.slug)
  );
}

function summaryFromStaticArticle(
  article: StaticLibraryArticleContent,
  locale: Locale
): LibraryArticleSummary | null {
  const translation = getStaticLibraryTranslation(article, locale);

  if (!translation) {
    return null;
  }

  return {
    category: categoryForSlug(toCategorySlug(article.categorySlug), locale),
    datePublished: article.datePublished,
    excerpt: translation.excerpt,
    hasContent: Boolean(
      translation.page?.nodes.length ?? translation.blocks.length
    ),
    href: libraryArticleHref(locale, article.slug),
    locale,
    pose: toNongPose(article.nongPose ?? article.pose),
    shareImage: article.shareImage,
    slug: article.slug,
    source: "static",
    title: translation.title
  };
}

function summaryFromPost(post: BlogPost): LibraryArticleSummary | null {
  const metadata = metadataRecord(post.metadata);
  const categorySlug =
    optionalString(metadata.libraryCategory) ??
    optionalString(metadata.library_category);
  const pose =
    optionalString(metadata.nongPose) ??
    optionalString(metadata.nong_pose);

  if (!isCategorySlug(categorySlug) || !isNongPose(pose) || !isLibraryPost(post)) {
    return null;
  }

  return {
    category: categoryForSlug(categorySlug, post.locale),
    datePublished:
      optionalString(metadata.datePublished) ??
      optionalString(metadata.date_published) ??
      optionalString(metadata.librarySortDate) ??
      post.datetime,
    excerpt: post.excerpt,
    hasContent: postHasContent(post),
    href: libraryArticleHref(post.locale, post.slug),
    locale: post.locale,
    pose,
    slug: post.slug,
    source: "blog",
    title: post.title
  };
}

async function publishedLibraryPosts(locale: Locale) {
  try {
    return await getPublishedBlogPosts(locale, 500);
  } catch {
    return [] as BlogPost[];
  }
}

export async function getLibraryArticles(locale: Locale) {
  const summaries = new Map<string, LibraryArticleSummary>();

  for (const article of staticLibraryArticles) {
    const summary = summaryFromStaticArticle(article, locale);

    if (summary) {
      summaries.set(summary.slug, summary);
    }
  }

  for (const post of await publishedLibraryPosts(locale)) {
    if (summaries.has(post.slug)) {
      continue;
    }

    const summary = summaryFromPost(post);

    if (summary) {
      summaries.set(summary.slug, summary);
    }
  }

  return [...summaries.values()].sort((first, second) => {
    const dateSort = second.datePublished.localeCompare(first.datePublished);

    return dateSort || first.title.localeCompare(second.title);
  });
}

export async function getFeaturedLibraryArticles(locale: Locale, limit = 3) {
  const safeLimit = Math.max(1, limit);
  const articles = await getLibraryArticles(locale);
  const bySlug = new Map(articles.map((article) => [article.slug, article]));

  // Hand-off rule: prefer manifest featured:true, then fill by datePublished desc.
  const featuredFromManifest = staticLibraryArticles
    .filter((article) => article.featured)
    .map((article) => bySlug.get(article.slug))
    .filter((article): article is LibraryArticleSummary => Boolean(article));

  const selected: LibraryArticleSummary[] = [];
  const seen = new Set<string>();

  for (const article of featuredFromManifest) {
    if (seen.has(article.slug)) {
      continue;
    }
    selected.push(article);
    seen.add(article.slug);
    if (selected.length >= safeLimit) {
      return selected;
    }
  }

  const remainder = articles
    .filter((article) => !seen.has(article.slug))
    .sort((first, second) => {
      const dateSort = second.datePublished.localeCompare(first.datePublished);
      return dateSort || first.title.localeCompare(second.title);
    });

  for (const article of remainder) {
    selected.push(article);
    if (selected.length >= safeLimit) {
      break;
    }
  }

  return selected;
}

function shuffledArticles<T>(articles: readonly T[]) {
  const shuffled = [...articles];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index]
    ];
  }

  return shuffled;
}

export async function getRandomLibraryArticles(locale: Locale, limit = 3) {
  return shuffledArticles(await getLibraryArticles(locale)).slice(
    0,
    Math.max(1, limit)
  );
}

export async function getRenderableLibraryArticles(locale: Locale) {
  return (await getLibraryArticles(locale)).filter((article) => article.hasContent);
}

export async function getLibraryArticle(
  locale: Locale,
  slug: string
): Promise<LibraryArticle | null> {
  const canonicalStaticSlug = getStaticLibraryCanonicalSlug(slug);
  const staticArticle = canonicalStaticSlug
    ? getStaticLibraryArticle(canonicalStaticSlug)
    : null;

  if (staticArticle) {
    const summary = summaryFromStaticArticle(staticArticle, locale);
    const translation = getStaticLibraryTranslation(staticArticle, locale);

    if (!summary || !translation) {
      return null;
    }

    return {
      ...summary,
      ogDescription: translation.ogDescription ?? translation.description,
      ogTitle: translation.ogTitle ?? translation.seoTitle,
      seoDescription: translation.description,
      seoTitle: translation.seoTitle,
      twitterDescription:
        translation.twitterDescription ??
        translation.ogDescription ??
        translation.description,
      twitterTitle:
        translation.twitterTitle ?? translation.ogTitle ?? translation.seoTitle,
      visual: staticArticle,
      visualTranslation: translation
    } satisfies LibraryArticle;
  }

  let post: BlogPost | null = null;

  try {
    post = await getPublishedBlogPost(locale, slug);
  } catch {
    post = null;
  }

  if (!post) {
    return null;
  }

  const summary = summaryFromPost(post);

  if (!summary || !postHasContent(post)) {
    return null;
  }

  return {
    ...summary,
    post: {
      ...post,
      href: summary.href
    },
    seoDescription: post.seoDescription || summary.excerpt,
    seoTitle: post.seoTitle || summary.title
  } satisfies LibraryArticle;
}

export async function getLibraryArticleLocalePaths(
  translationGroupIdOrSlug: string,
  slug?: string
) {
  const requestedSlug = slug ?? translationGroupIdOrSlug;
  const articleSlug =
    getStaticLibraryCanonicalSlug(requestedSlug) ?? requestedSlug;

  if (getStaticLibraryArticle(articleSlug)) {
    return Object.fromEntries(
      publicLocales.map((locale) => [locale, libraryArticleHref(locale, articleSlug)])
    ) as Partial<Record<LocaleCode, string>>;
  }

  if (slug) {
    try {
      const paths = await getPublishedBlogPostLocalePaths(translationGroupIdOrSlug);

      if (Object.keys(paths).length > 0) {
        return Object.fromEntries(
          Object.entries(paths).map(([locale, path]) => [
            locale,
            path.replace(`/${locale}/blog/`, `/${locale}/library/`)
          ])
        ) as Partial<Record<LocaleCode, string>>;
      }
    } catch {
      // Fall through to stable locale path generation.
    }
  }

  return Object.fromEntries(
    publicLocales.map((locale) => [locale, libraryArticleHref(locale, articleSlug)])
  ) as Partial<Record<LocaleCode, string>>;
}

export function libraryIndexJsonLd(input: Readonly<{
  articles: readonly LibraryArticleSummary[];
  locale: Locale;
}>) {
  const url = absoluteUrl(`/${input.locale}/library`);
  const copy = getLibraryCopy(input.locale);

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: absoluteUrl(`/${input.locale}`),
          name: copy.breadcrumbHome,
          position: 1
        },
        {
          "@type": "ListItem",
          item: url,
          name: copy.eyebrow,
          position: 2
        }
      ]
    },
    description: copy.intro,
    inLanguage: localeHtmlLang(input.locale),
    isPartOf: {
      "@type": "WebSite",
      name: "MattaNutra",
      url: absoluteUrl("/")
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: input.articles.map((article, index) => ({
        "@type": "ListItem",
        name: article.title,
        position: index + 1,
        url: absoluteUrl(article.href)
      })),
      name: copy.articleListName
    },
    name: copy.eyebrow,
    url
  };
}

export function libraryFeaturedJsonLd(articles: readonly LibraryArticleSummary[]) {
  const locale = articles[0]?.locale ?? defaultLocale;
  const copy = getLibraryCopy(locale);

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    inLanguage: localeHtmlLang(locale),
    itemListElement: articles.map((article, index) => ({
      "@type": "ListItem",
      name: article.title,
      position: index + 1,
      url: absoluteUrl(article.href)
    })),
    name: copy.featuredListName
  };
}

export function libraryArticleJsonLd(article: LibraryArticle) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    about: article.visual?.about,
    citation: article.visual?.citations,
    dateModified: article.visual?.dateModified ?? article.datePublished,
    datePublished: article.datePublished,
    description: article.seoDescription,
    headline: article.title,
    image: article.shareImage ? absoluteUrl(article.shareImage) : undefined,
    inLanguage: localeHtmlLang(article.locale),
    mainEntityOfPage: absoluteUrl(article.href),
    publisher: {
      "@type": "Organization",
      name: "MattaNutra",
      url: absoluteUrl("/")
    },
    url: absoluteUrl(article.href)
  };
}

export function libraryArticleFaqJsonLd(article: LibraryArticle) {
  if (!article.visualTranslation?.faqs.length) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.visualTranslation.faqs.map((faq) => ({
      "@type": "Question",
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer
      },
      name: faq.question
    }))
  };
}

export function libraryArticleBreadcrumbJsonLd(article: LibraryArticle) {
  const copy = getLibraryCopy(article.locale);

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        item: absoluteUrl(`/${article.locale}`),
        name: copy.breadcrumbHome,
        position: 1
      },
      {
        "@type": "ListItem",
        item: absoluteUrl(`/${article.locale}/library`),
        name: copy.eyebrow,
        position: 2
      },
      {
        "@type": "ListItem",
        item: absoluteUrl(article.href),
        name: article.title,
        position: 3
      }
    ]
  };
}
