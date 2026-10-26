import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * Crawlers may read every page: the app's own pages say noindex themselves
 * (app/(app)/layout.tsx), and a crawler has to fetch a page to see that.
 * /about and /llms.txt are the pages meant to be found.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/llms.txt"],
        disallow: ["/api/"]
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
