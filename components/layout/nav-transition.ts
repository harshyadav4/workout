"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A soft change between the four tabs: the old page fades and slides a few
 * pixels away, the new one fades in (the animation is in globals.css). It uses
 * the browser's View Transitions API around the router push.
 *
 * Only for taps on the dock. Everything else — the tour's own router.push, a
 * link in a card — changes page plainly, so code that measures the new page
 * right after a push (the tour does) never sees a page mid-animation.
 *
 * Plain navigation when: the browser has no startViewTransition, the user asks
 * for reduced motion, or `skip` is true.
 */

/** Longest wait for the new page before the snapshot is let go anyway. */
const MAX_WAIT_MS = 1200;

export function useNavTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<(() => void) | null>(null);

  // The new page is in the DOM once the path has changed: let the browser
  // take its "after" picture.
  useLayoutEffect(() => {
    pending.current?.();
    pending.current = null;
  }, [pathname]);

  return useCallback(
    (href: string, direction: 1 | -1, skip = false): boolean => {
      if (
        skip ||
        typeof document === "undefined" ||
        typeof document.startViewTransition !== "function" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return false;
      }
      const root = document.documentElement;
      root.style.setProperty("--tab-slide-out", `${-8 * direction}px`);
      root.style.setProperty("--tab-slide-in", `${8 * direction}px`);
      try {
        document.startViewTransition(
          () =>
            new Promise<void>((resolve) => {
              const timer = window.setTimeout(resolve, MAX_WAIT_MS);
              pending.current = () => {
                window.clearTimeout(timer);
                resolve();
              };
              router.push(href);
            })
        );
      } catch {
        return false;
      }
      return true;
    },
    [router]
  );
}
