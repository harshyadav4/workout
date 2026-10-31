"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { closeTourLink, readFirstOpen, readTourLinkClosed, showTourLink } from "@/features/tour/autostart-rule";
import { useStartTour } from "@/features/tour/tour";
import { useTour } from "@/features/tour/tour-store";
import { todayKey } from "@/lib/utils";

/**
 * One quiet line on Home for the first week (features/tour/autostart-rule):
 * the tour again, for anyone who skipped it or wants a second look. The You
 * tab keeps it after that.
 */
export function TourLink() {
  const touring = useTour().active;
  const startTour = useStartTour();
  // Read after mount: the server has no storage, and a first render that
  // disagreed with the HTML would be a hydration error.
  const [saved, setSaved] = useState<{ firstOpen?: string; closed: boolean }>({ closed: true });

  useEffect(() => {
    setSaved({ firstOpen: readFirstOpen(todayKey()), closed: readTourLinkClosed() });
  }, []);

  if (!showTourLink({ ...saved, today: todayKey(), touring })) {
    return null;
  }

  const close = () => {
    closeTourLink();
    setSaved((current) => ({ ...current, closed: true }));
  };

  return (
    <div className="notice-line">
      <p className="min-w-0 flex-1">
        New here?{" "}
        <button
          type="button"
          onClick={startTour}
          className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Take the tour
        </button>
      </p>
      <button
        type="button"
        aria-label="Hide this message"
        onClick={close}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
