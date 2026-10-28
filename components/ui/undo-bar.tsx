"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { commitNow, undoNow, useUndoOffer } from "@/lib/undo";

/**
 * The Undo bar, just above the dock, while a removal can still come back
 * (lib/undo). Going to the background commits: the bar would otherwise sit
 * there holding a deletion that the next open might not remember offering.
 */
export function UndoBar() {
  const offer = useUndoOffer();

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        commitNow();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (!offer) {
    return null;
  }

  return (
    <div
      role="status"
      className="page-enter fixed inset-x-0 z-40 px-4 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)]"
    >
      <div className="plaque mx-auto flex max-w-md items-center gap-2 rounded-2xl py-1.5 pl-4 pr-1.5">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{offer.label}</p>
        <Button size="sm" variant="secondary" onClick={undoNow}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Undo
        </Button>
      </div>
    </div>
  );
}
