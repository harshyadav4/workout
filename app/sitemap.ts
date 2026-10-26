import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

/** Only the public page. The app's pages are noindex (app/(app)/layout.tsx). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/about"),
      lastModified: new Date("2026-10-27"),
      changeFrequency: "monthly",
      priority: 1
    }
  ];
}
