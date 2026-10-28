"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

/** Where each path was last scrolled to. Module state: it lives as long as the tab. */
const positions = new Map<string, number>();

/**
 * Each tab remembers its scroll position, as a native tab bar does: leave
 * Progress halfway down, come back from Plan, and it is still halfway down.
 * The dock's links pass `scroll={false}`, so this is the only thing that
 * scrolls on a tab change. A path never visited starts at the top, which is
 * also what Next does for every other link.
 */
export function ScrollMemory() {
  const pathname = usePathname();

  // Before paint, so the page never shows its top for a frame first.
  useLayoutEffect(() => {
    window.scrollTo({ top: positions.get(pathname) ?? 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  // One listener for the life of the tab, keyed on the live URL — not on the
  // `pathname` prop. The browser clamps the offset the moment a shorter page
  // replaces a taller one, and that scroll event lands before React has swapped
  // a per-page listener, so a closure over the old path recorded 0 for it.
  useEffect(() => {
    let frame = 0;
    const remember = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => positions.set(window.location.pathname, window.scrollY));
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remember);
    };
  }, []);

  return null;
}
