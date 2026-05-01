import type { MetadataRoute } from "next";

// Public marketing surfaces are indexable; everything behind auth (and the
// internal *-preview routes used for design QA) is not. Keep this list in
// sync with the route groups under app/(app)/ — middleware also gates them
// at runtime, but explicit Disallow keeps them out of search results even
// if a leaked URL ever shows up.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://yoboss.ai"
  ).replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/account",
          "/admin",
          "/dashboard",
          "/goals",
          "/progress",
          "/settings",
          "/team",
          "/todos",
          "/workflows",
          // Internal QA-only preview routes (see app/dashboard-preview etc.)
          "/dashboard-preview",
          "/dashboard-main-preview",
          "/todos-layout-preview",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
