import type { MetadataRoute } from "next";
import { indexableLocales } from "@/lib/i18n";
import { getRenderableLibraryArticles } from "@/lib/library";
import { absoluteUrl, localizedSeoStaticSitemapEntries } from "@/lib/seo";
import { connectProviders } from "@/lib/connect";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = localizedSeoStaticSitemapEntries(now);
  const libraryIndexEntries = indexableLocales.map((locale) => ({
    changeFrequency: "weekly" as const,
    lastModified: now,
    priority: 0.8,
    url: absoluteUrl(`/${locale}/library`)
  }));
  const libraryEntries = (
    await Promise.all(
      indexableLocales.map(async (locale) =>
        (await getRenderableLibraryArticles(locale)).map((article) => ({
          changeFrequency: "monthly" as const,
          lastModified: new Date(article.datePublished),
          priority: 0.5,
          url: absoluteUrl(article.href)
        }))
      )
    )
  ).flat();

  const connectEntries = indexableLocales.flatMap(locale => ["", ...connectProviders].map(provider => ({
    url: absoluteUrl(`/${locale}/connect${provider ? `/${provider}` : ""}`), changeFrequency: "monthly" as const,
    priority: provider ? 0.7 : 0.8, lastModified: new Date("2026-10-03")
  })));
  return [...staticEntries, ...connectEntries, ...libraryIndexEntries, ...libraryEntries];
}
