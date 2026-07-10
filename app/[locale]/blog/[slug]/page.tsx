import { notFound, permanentRedirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

type LegacyBlogArticlePageProps = Readonly<{
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}>;

export const dynamic = "force-dynamic";

export default async function LegacyBlogArticlePage({
  params
}: LegacyBlogArticlePageProps) {
  const { locale, slug } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  permanentRedirect(`/${locale}/library/${slug}`);
}
