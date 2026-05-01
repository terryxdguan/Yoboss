import type { MetadataRoute } from "next";

// Lists only the public, indexable marketing surfaces. Anything behind
// auth is intentionally absent — crawlers can't fetch it anyway, and
// sitemap inclusion only signals "please index", which we don't want
// for app routes. Keep priorities/changeFrequencies pragmatic, not SEO
// theater (Google ignores them in 2024+ but other crawlers still read).
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://yoboss.ai"
  ).replace(/\/+$/, "");

  // Use the same lastModified across pages — we ship marketing copy as
  // part of regular deploys, so every deploy is effectively the
  // last-modified date for all of them. Stamping deploy-time keeps
  // crawlers honest without a per-page tracking system.
  const now = new Date();

  return [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
