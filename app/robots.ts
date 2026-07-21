import type { MetadataRoute } from "next";
import { robotsDisallowPaths } from "@/lib/public-cache-policy";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      disallow: robotsDisallowPaths(),
      userAgent: "*"
    },
    sitemap: absoluteUrl("/sitemap.xml")
  };
}
