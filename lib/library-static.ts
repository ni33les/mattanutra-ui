import visualKnowledgePayload from "@/content/library/visual-knowledge.json" with { type: "json" };
import type { Locale, LocaleCode } from "@/lib/i18n";

export type VisualKnowledgeBlockType =
  | "heading1"
  | "heading2"
  | "heading3"
  | "listItem"
  | "paragraph";

export type VisualKnowledgeBlock = Readonly<{
  text: string;
  type: VisualKnowledgeBlockType;
}>;

export type VisualKnowledgeFaq = Readonly<{
  answer: string;
  question: string;
}>;

export type VisualKnowledgeQuizOption = Readonly<{
  label: string;
  value: string;
}>;

export type VisualKnowledgeQuizQuestion = Readonly<{
  id: string;
  options: readonly VisualKnowledgeQuizOption[];
  question: string;
}>;

export type VisualKnowledgeQuiz = Readonly<{
  cta: string;
  hint: string;
  questions: readonly VisualKnowledgeQuizQuestion[];
  resultBody: string;
  resultTitle: string;
  title: string;
}>;

type VisualKnowledgeElementTag =
  | "a"
  | "aside"
  | "b"
  | "button"
  | "details"
  | "div"
  | "em"
  | "footer"
  | "figcaption"
  | "figure"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "i"
  | "li"
  | "main"
  | "ol"
  | "p"
  | "section"
  | "small"
  | "span"
  | "strong"
  | "summary"
  | "table"
  | "tbody"
  | "td"
  | "th"
  | "thead"
  | "tr"
  | "ul";

export type VisualKnowledgeNode =
  | Readonly<{
      text: string;
      type: "text";
    }>
  | Readonly<{
      children: readonly VisualKnowledgeNode[];
      type: "fragment";
    }>
  | Readonly<{
      className?: string;
      type: "icon";
    }>
  | Readonly<{
      alt: string;
      className?: string;
      height: number;
      src: string;
      type: "image";
      width: number;
    }>
  | Readonly<{
      attrs?: Readonly<Record<string, string | boolean>>;
      children: readonly VisualKnowledgeNode[];
      tag: VisualKnowledgeElementTag;
      type: "element";
    }>;

export type LibraryVisualPage = Readonly<{
  nodes: readonly VisualKnowledgeNode[];
}>;

export type VisualKnowledgeTranslation = Readonly<{
  blocks: readonly VisualKnowledgeBlock[];
  description: string;
  excerpt: string;
  faqs: readonly VisualKnowledgeFaq[];
  imageAlt: string;
  page?: LibraryVisualPage;
  quiz: VisualKnowledgeQuiz;
  seoTitle: string;
  title: string;
}>;

export type StaticLibraryArticleContent = Readonly<{
  about: readonly string[];
  batch?: number;
  canonicalSlug?: string;
  categorySlug: string;
  citations: readonly string[];
  dateModified: string;
  datePublished: string;
  featured?: boolean;
  nongPose?: string;
  pose: string;
  redirects?: readonly string[];
  shareImage: string;
  slug: string;
  sourceHtmlFile?: string;
  sourceHtml: string;
  sourcePackage: string;
  translations: Record<Locale, VisualKnowledgeTranslation>;
}>;

export type StaticLibraryCategoryContent = Readonly<{
  labels: Record<Locale, string>;
  slug: string;
}>;

type VisualKnowledgePayload = Readonly<{
  articleCount: number;
  articles: readonly StaticLibraryArticleContent[];
  categories: readonly StaticLibraryCategoryContent[];
  canonicalRedirects?: Readonly<Record<string, string>>;
  generatedFrom: string;
}>;

export const visualKnowledgeLibrary =
  visualKnowledgePayload as VisualKnowledgePayload;

export const staticLibraryArticles = visualKnowledgeLibrary.articles;
export const staticLibraryCategories = visualKnowledgeLibrary.categories;
export const staticLibraryArticleCount = visualKnowledgeLibrary.articleCount;

const staticArticleBySlug = new Map(
  staticLibraryArticles.map((article) => [article.slug, article])
);

export function getStaticLibraryArticle(slug: string) {
  return staticArticleBySlug.get(slug) ?? null;
}

export function getStaticLibraryCanonicalSlug(slug: string) {
  if (staticArticleBySlug.has(slug)) {
    return slug;
  }

  return visualKnowledgeLibrary.canonicalRedirects?.[slug] ?? null;
}

export function getStaticLibraryTranslation(
  article: StaticLibraryArticleContent,
  locale: LocaleCode
) {
  return article.translations[locale as Locale] ?? null;
}
