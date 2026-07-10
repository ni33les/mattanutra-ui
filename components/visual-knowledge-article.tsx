import { LibraryVisualPage } from "@/components/library-visual-page";
import { absoluteUrl } from "@/lib/seo";
import type { LibraryArticle } from "@/lib/library";

function shareLabel(locale: LibraryArticle["locale"]) {
  if (locale === "th") {
    return "แชร์";
  }

  if (locale === "zh-CN") {
    return "分享";
  }

  return "Share";
}

function copiedLabel(locale: LibraryArticle["locale"]) {
  if (locale === "th") {
    return "คัดลอกแล้ว";
  }

  if (locale === "zh-CN") {
    return "已复制";
  }

  return "Copied";
}

export function VisualKnowledgeArticle({
  article
}: Readonly<{
  article: LibraryArticle;
}>) {
  const nodes = article.visualTranslation?.page?.nodes;
  const quiz = article.visualTranslation?.quiz;

  if (!article.visual || !nodes?.length || !quiz) {
    return null;
  }

  return (
    <LibraryVisualPage
      articleUrl={absoluteUrl(article.href)}
      copiedLabel={copiedLabel(article.locale)}
      locale={article.locale}
      nodes={nodes}
      quiz={quiz}
      shareLabel={shareLabel(article.locale)}
      slug={article.slug}
    />
  );
}
