import type { MetadataRoute } from "next";

const SITE_URL = "https://hankhsu.com";

// Everything is public and crawlable except the analytics API, which is
// machine-only and has nothing worth indexing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
