import { Suspense } from "react";

import { TourOverlay } from "@/features/tour/tour";
import { TourAutostart } from "@/features/tour/tour-autostart";

export default function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      {/* Once for every page, so the tour lives across page changes. Suspense
          because it reads ?tour=1 from the URL. */}
      <Suspense>
        <TourOverlay />
        <TourAutostart />
      </Suspense>
    </>
  );
}
