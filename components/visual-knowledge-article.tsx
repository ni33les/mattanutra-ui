import { LibraryVisualPage } from "@/components/library-visual-page";
import { getNamespace } from "@/lib/i18n-messages";
import { absoluteUrl } from "@/lib/seo";
import type { LibraryArticle } from "@/lib/library";

type LibraryArticleActionsCopy = Readonly<{
  copiedLabel: string;
  copyLinkLabel: string;
  shareHeading: string;
  shareLabel: string;
}>;

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

  const actions = getNamespace<LibraryArticleActionsCopy>(
    article.locale,
    "customer.libraryArticleActions"
  );

  return (
    <LibraryVisualPage
      articleUrl={absoluteUrl(article.href)}
      copiedLabel={actions.copiedLabel}
      copyLinkLabel={actions.copyLinkLabel}
      locale={article.locale}
      nodes={nodes}
      quiz={quiz}
      shareHeading={actions.shareHeading}
      shareLabel={actions.shareLabel}
      slug={article.slug}
    />
  );
}
