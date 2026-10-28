"use client";

import { useRef, type TouchEvent as ReactTouchEvent } from "react";

/** A swipe across the page this long switches tabs. */
const SWIPE_PX = 64;

/**
 * Swipe the page sideways to switch between a screen's tabs, as Android tabs
 * do. Touch only; a mouse has the control itself. A swipe that starts on
 * something with its own sideways gesture — a row that swipes to delete, a
 * chip strip that scrolls, a field, the body map, a sheet — is left to it.
 */
export function useSwipeTabs(onSwipe: (direction: "left" | "right") => void) {
  // Kept up to date on every move: the browser may end a sideways touch with
  // touchcancel once it treats it as a pan, and that event has no position.
  const start = useRef<{ x: number; y: number; lastX: number; lastY: number } | null>(null);

  const ownsSideways = (target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false;
    }
    if (target.closest('[data-swipe-row], [role="dialog"], [role="group"], [role="tablist"], input, textarea, select, svg')) {
      return true;
    }
    for (let node: Element | null = target; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowX;
      if ((overflow === "auto" || overflow === "scroll") && node.scrollWidth > node.clientWidth) {
        return true;
      }
    }
    return false;
  };

  const onTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const { clientX, clientY } = event.touches[0];
    start.current = ownsSideways(event.target) ? null : { x: clientX, y: clientY, lastX: clientX, lastY: clientY };
  };

  const onTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    if (start.current) {
      start.current.lastX = event.touches[0].clientX;
      start.current.lastY = event.touches[0].clientY;
    }
  };

  const onTouchEnd = () => {
    const from = start.current;
    start.current = null;
    if (!from) {
      return;
    }
    const dx = from.lastX - from.x;
    const dy = from.lastY - from.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) {
      return;
    }
    onSwipe(dx < 0 ? "left" : "right");
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd };
}
