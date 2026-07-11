import type { MetadataRoute } from "next";

const SITE_URL = "https://hankhsu.com";

// The three real routes. `lastModified` is stamped at build time — the site
// redeploys on every content change, so the build date tracks "last updated"
// closely enough for crawlers without per-route bookkeeping.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/experience`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/contact`, lastModified, changeFrequency: "yearly", priority: 0.6 },
  ];
}
