import type { Metadata } from "next";
import { Suspense } from "react";

import { ScrollMemory } from "@/components/layout/scroll-memory";
import { GuestMergePrompt } from "@/features/auth/guest-merge-prompt";
import { UpdateBar } from "@/features/pwa/update-bar";
import { TourOverlay } from "@/features/tour/tour";
import { TourAutostart } from "@/features/tour/tour-autostart";

// The app's own pages show a person's training, so search engines keep them
// out of results. /about is the public page (app/about).
export const metadata: Metadata = {
  robots: { index: false, follow: true }
};

export default function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      {/* Each tab keeps its scroll position across the dock. */}
      <ScrollMemory />
      {/* Once for every page, so the tour lives across page changes. Suspense
          because it reads ?tour=1 from the URL. */}
      {/* The sign-in question about this phone's guest training. */}
      <GuestMergePrompt />
      {/* "New version · Reload" when a newer build is live. */}
      <UpdateBar />
      <Suspense>
        <TourOverlay />
        <TourAutostart />
      </Suspense>
    </>
  );
}
