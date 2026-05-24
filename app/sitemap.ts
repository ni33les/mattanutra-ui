import type { MetadataRoute } from "next";
import { getPublishedBlogPosts } from "@/lib/blog";
import { indexableLocales } from "@/lib/i18n";
import { absoluteUrl, localizedPath } from "@/lib/seo";

const publicStaticPaths = [
  "/",
  "/nutrition/quiz",
  "/terms",
  "/privacy"
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = indexableLocales.flatMap((locale) =>
    publicStaticPaths.map((path) => ({
      changeFrequency: path === "/" ? "weekly" as const : "monthly" as const,
      lastModified: now,
      priority: path === "/" ? 1 : 0.6,
      url: absoluteUrl(localizedPath(locale, path))
    }))
  );
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
