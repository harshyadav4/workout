"use client";

import { useEffect } from "react";

import { feedbackEnabled, haptic, HAPTIC_SWITCH_ATTR } from "@/lib/feedback";

/**
 * What counts as a tap. Labels are left out on purpose: a tap on a label
 * fires a second click on its input, and that one is caught instead, so a
 * checkbox buzzes once, not twice.
 */
const TAPPABLE =
  'button, a[href], summary, select, [role="button"], [role="switch"], [role="tab"], [role="option"], [role="menuitem"], input[type="checkbox"], input[type="radio"]';

/**
 * A light haptic on every tap, app-wide, once the feedback switch on the You
 * page is on. One listener on the document instead of a call in every button,
 * so nothing new has to remember it. Capture phase, so it runs inside the
 * user's gesture before any handler navigates away.
 */
export function TapFeedback() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!feedbackEnabled() || !(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest(`[${HAPTIC_SWITCH_ATTR}]`)) {
        return;
      }
      const hit = event.target.closest(TAPPABLE);
      if (!hit || hit.matches(":disabled") || hit.getAttribute("aria-disabled") === "true") {
        return;
      }
      haptic();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
