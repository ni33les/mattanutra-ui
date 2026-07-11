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
  | "brain-focus"
  | "energy-longevity"
  | "everyday-nutrition"
  | "foundations"
  | "joints-mobility"
  | "minerals"
  | "sleep-recovery"
  | "stress-adaptogens"
  | "testing-personalisation"
  | "vitamins";

export type LibraryCategory = Readonly<{
  label: string;
  slug: LibraryCategorySlug;
}>;

export type NongPose =
  | "ask"
  | "celebrate"
  | "comparing"
  | "coffee"
  | "explaining"
  | "kneeling"
  | "measuring"
  | "money"
  | "muscular"
  | "open"
  | "reassuring"
  | "sleep-supine"
  | "stressed"
  | "thinking"
  | "warning";

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
    seoDescription: string;
    seoTitle: string;
    visual?: StaticLibraryArticleContent;
    visualTranslation?: VisualKnowledgeTranslation;
  }>;

type LibraryCopy = Readonly<{
  allCategory: string;
  articleImageAltPrefix: string;
  articleListName: string;
  breadcrumbHome: string;
  browse: string;
  categoryLabel: string;
  clearSearch: string;
  ctaBody: string;
  ctaButton: string;
  ctaImageAlt: string;
  ctaTitle: string;
  empty: string;
  eyebrow: string;
  featuredListName: string;
  guide: string;
  guideImageAlt: string;
  guideName: string;
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
  { label: "Everyday Nutrition", slug: "everyday-nutrition" },
  { label: "Energy & Longevity", slug: "energy-longevity" },
  { label: "Stress & Adaptogens", slug: "stress-adaptogens" },
  { label: "Brain & Focus", slug: "brain-focus" },
  { label: "Joints & Mobility", slug: "joints-mobility" },
  { label: "Testing & Personalisation", slug: "testing-personalisation" }
] as const satisfies readonly LibraryCategory[];

const localizedCategoryLabels = {
  en: {
    "brain-focus": "Brain & Focus",
    "energy-longevity": "Energy & Longevity",
    "everyday-nutrition": "Everyday Nutrition",
    foundations: "Foundations",
    "joints-mobility": "Joints & Mobility",
    minerals: "Minerals",
    "sleep-recovery": "Sleep & Recovery",
    "stress-adaptogens": "Stress & Adaptogens",
    "testing-personalisation": "Testing & Personalisation",
    vitamins: "Vitamins"
  },
  th: {
    "brain-focus": "สมองและสมาธิ",
    "energy-longevity": "พลังงานและอายุยืน",
    "everyday-nutrition": "โภชนาการประจำวัน",
    foundations: "พื้นฐาน",
    "joints-mobility": "ข้อต่อและการเคลื่อนไหว",
    minerals: "แร่ธาตุ",
    "sleep-recovery": "การนอนและการฟื้นตัว",
    "stress-adaptogens": "ความเครียดและสารปรับสมดุล",
    "testing-personalisation": "การตรวจและการปรับให้เหมาะกับคุณ",
    vitamins: "วิตามิน"
  },
  "zh-CN": {
    "brain-focus": "大脑与专注",
    "energy-longevity": "能量与长寿",
    "everyday-nutrition": "日常营养",
    foundations: "基础知识",
    "joints-mobility": "关节与活动力",
    minerals: "矿物质",
    "sleep-recovery": "睡眠与恢复",
    "stress-adaptogens": "压力与适应原",
    "testing-personalisation": "检测与个性化",
    vitamins: "维生素"
  }
} satisfies Record<Locale, Record<LibraryCategorySlug, string>>;

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

const localizedLibraryCopy = {
  en: {
    allCategory: "All",
    articleImageAltPrefix: "Nong Matta illustration",
    articleListName: "The MattaNutra Library articles",
    breadcrumbHome: "Home",
    browse: "Browse the Library",
    categoryLabel: "Category",
    clearSearch: "Clear search",
    ctaBody:
      "A few minutes gives MattaNutra the context it needs to turn broad answers into your Right Amount.",
    ctaButton: "Start designing your Right Amount",
    ctaImageAlt: "Nong Matta celebrating",
    ctaTitle: "Ready to make the guidance personal?",
    empty:
      "No articles match yet - try a different word or category. More are on the way.",
    eyebrow: "The MattaNutra Library",
    featuredListName: "The MattaNutra Library - Featured articles",
    guide: "Your guide",
    guideImageAlt: "Nong Matta, the MattaNutra Library guide",
    guideName: "Nong Matta",
    intro:
      "Evidence-aware answers to common supplement questions - clear enough to use, careful enough to trust.",
    landingIntro:
      "Clear, evidence-aware answers to the supplement questions people actually ask - so you can decide from knowing, not guessing.",
    landingTitle: "Learn the",
    landingTitleAccent: "right amount.",
    loadMore: "Load more articles",
    noContentNote: "Full Library article content is being prepared for this locale.",
    result: "article",
    results: "articles",
    searchLabel: "Search the Library",
    searchPlaceholder: "Search the Library - try \"magnesium\" or \"sleep\"",
    sectionIntro: "Plain-language supplement answers, guided by Nong Matta.",
    title: "Evidence-aware answers to your supplement questions"
  },
  th: {
    allCategory: "ทั้งหมด",
    articleImageAltPrefix: "ภาพประกอบน้องมัตตะ",
    articleListName: "บทความในคลังความรู้ MattaNutra",
    breadcrumbHome: "หน้าแรก",
    browse: "ดูคลังความรู้",
    categoryLabel: "หมวดหมู่",
    clearSearch: "ล้างคำค้นหา",
    ctaBody:
      "ใช้เวลาไม่กี่นาทีเพื่อให้ MattaNutra เข้าใจบริบทของคุณ แล้วเปลี่ยนคำตอบกว้าง ๆ เป็นปริมาณที่พอดี",
    ctaButton: "ออกแบบปริมาณที่พอดีของคุณ",
    ctaImageAlt: "น้องมัตตะกำลังฉลอง",
    ctaTitle: "พร้อมทำให้คำแนะนำเป็นของคุณจริง ๆ หรือยัง?",
    empty:
      "ยังไม่พบบทความที่ตรงกัน ลองคำอื่นหรือหมวดหมู่อื่น บทความเพิ่มเติมกำลังมา",
    eyebrow: "คลังความรู้ MattaNutra",
    featuredListName: "บทความแนะนำจากคลังความรู้ MattaNutra",
    guide: "ไกด์ของคุณ",
    guideImageAlt: "น้องมัตตะ ไกด์คลังความรู้ MattaNutra",
    guideName: "น้องมัตตะ",
    intro:
      "คำตอบเรื่องอาหารเสริมที่อ้างอิงหลักฐาน อ่านง่าย ใช้งานได้ และระมัดระวังพอให้เชื่อถือ",
    landingIntro:
      "คำตอบเรื่องอาหารเสริมที่คนถามจริง อ้างอิงหลักฐานและเข้าใจง่าย เพื่อให้คุณตัดสินใจจากความรู้ ไม่ใช่การเดา",
    landingTitle: "เรียนรู้",
    landingTitleAccent: "ปริมาณที่พอดี",
    loadMore: "โหลดบทความเพิ่ม",
    noContentNote: "เนื้อหาบทความฉบับเต็มสำหรับภาษานี้กำลังเตรียมอยู่",
    result: "บทความ",
    results: "บทความ",
    searchLabel: "ค้นหาคลังความรู้",
    searchPlaceholder: "ค้นหาคลังความรู้ เช่น \"แมกนีเซียม\" หรือ \"การนอน\"",
    sectionIntro: "คำตอบเรื่องอาหารเสริมแบบเข้าใจง่าย โดยมีน้องมัตตะเป็นไกด์",
    title: "คำตอบที่อ้างอิงหลักฐานสำหรับคำถามเรื่องอาหารเสริมของคุณ"
  },
  "zh-CN": {
    allCategory: "全部",
    articleImageAltPrefix: "Nong Matta 插图",
    articleListName: "MattaNutra 知识库文章",
    breadcrumbHome: "首页",
    browse: "浏览知识库",
    categoryLabel: "分类",
    clearSearch: "清除搜索",
    ctaBody:
      "几分钟就能让 MattaNutra 了解你的背景，把宽泛建议变成适合你的知量方案。",
    ctaButton: "开始设计你的知量方案",
    ctaImageAlt: "Nong Matta 正在庆祝",
    ctaTitle: "准备让建议真正贴合你了吗？",
    empty: "暂时没有匹配文章。换个关键词或分类试试，更多内容正在准备中。",
    eyebrow: "MattaNutra 知识库",
    featuredListName: "MattaNutra 知识库精选文章",
    guide: "你的向导",
    guideImageAlt: "Nong Matta，MattaNutra 知识库向导",
    guideName: "Nong Matta",
    intro:
      "用证据意识回答常见补充剂问题：足够清楚，可以行动；足够谨慎，值得信任。",
    landingIntro:
      "用清楚、有证据意识的方式回答人们真正会问的补充剂问题，让你基于了解来决定，而不是靠猜。",
    landingTitle: "了解",
    landingTitleAccent: "知量",
    loadMore: "加载更多文章",
    noContentNote: "该语言的完整知识库文章内容正在准备中。",
    result: "篇文章",
    results: "篇文章",
    searchLabel: "搜索知识库",
    searchPlaceholder: "搜索知识库，例如“镁”或“睡眠”",
    sectionIntro: "由 Nong Matta 引导，用通俗语言解释补充剂问题。",
    title: "用证据意识回答你的补充剂问题"
  }
} satisfies Record<Locale, LibraryCopy>;

export function getLibraryCopy(locale: LocaleCode): LibraryCopy {
  return localizedLibraryCopy[locale as Locale] ?? localizedLibraryCopy[defaultLocale];
}

export function getLibraryCategories(locale: LocaleCode): readonly LibraryCategory[] {
  const labels =
    localizedCategoryLabels[locale as Locale] ?? localizedCategoryLabels[defaultLocale];

  return libraryCategories.map((category) => ({
    label: labels[category.slug],
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

function isNongPose(value: unknown): value is NongPose {
  return (
    value === "ask" ||
    value === "celebrate" ||
    value === "comparing" ||
    value === "coffee" ||
    value === "explaining" ||
    value === "kneeling" ||
    value === "measuring" ||
    value === "money" ||
    value === "muscular" ||
    value === "open" ||
    value === "reassuring" ||
    value === "sleep-supine" ||
    value === "stressed" ||
    value === "thinking" ||
    value === "warning"
  );
}

function toNongPose(value: unknown): NongPose {
  return isNongPose(value) ? value : "thinking";
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
  return (await getLibraryArticles(locale)).slice(0, Math.max(1, limit));
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
      seoDescription: translation.description,
      seoTitle: translation.seoTitle,
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
