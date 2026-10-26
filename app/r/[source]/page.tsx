import type { Metadata } from "next";

import { SOURCES } from "@/lib/sources";

import { SourceRedirect } from "./source-redirect";

// A hop, not a page: never in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: true }
};

export function generateStaticParams() {
  return Object.keys(SOURCES).map((source) => ({ source }));
}

/**
 * /r/<source>: counted as its own page view (lib/sources explains why), then
 * on to /about with the UTM tags. The move happens in the browser, after the
 * view is recorded — a server redirect would never be counted.
 */
export default async function SourcePage({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  return <SourceRedirect source={source} />;
}
