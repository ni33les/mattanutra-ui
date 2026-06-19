import type { MetadataRoute } from "next";
import { getPublishedBlogPosts } from "@/lib/blog";
import { indexableLocales } from "@/lib/i18n";
import { absoluteUrl, localizedSeoStaticSitemapEntries } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = localizedSeoStaticSitemapEntries(now);
  const blogEntries = (
    await Promise.all(
      indexableLocales.map(async (locale) =>
        (await getPublishedBlogPosts(locale, 500)).map((post) => ({
          changeFrequency: "monthly" as const,
          lastModified: new Date(post.datetime),
          priority: 0.5,
          url: absoluteUrl(post.href)
        }))
      )
    )
  ).flat();

  return [...staticEntries, ...blogEntries];
}
