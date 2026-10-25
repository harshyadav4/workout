"use client";

import { useEffect, useState } from "react";

export interface KeyboardFrame {
  /** Pixels the on-screen keyboard covers at the bottom of the layout viewport. */
  inset: number;
  /** Height of what is actually visible above it. */
  visibleHeight: number;
}

const CLOSED: KeyboardFrame = { inset: 0, visibleHeight: 0 };

/**
 * Where the on-screen keyboard is.
 *
 * iPhone Safari does not resize the page when the keyboard opens: it shrinks
 * the *visual* viewport and leaves `position: fixed; bottom: 0` where it was,
 * behind the keyboard. So a bottom sheet with a field in it either hides the
 * field or gets shoved around while Safari scrolls the page to compensate.
 * The VisualViewport API reports the real visible rectangle; this turns it
 * into the one number a sheet needs.
 *
 * Anything under 80px is treated as no keyboard: Safari's toolbar collapsing
 * moves the viewport too, and a sheet should not jump for that.
 */
export function useKeyboard(active = true): KeyboardFrame {
  const [frame, setFrame] = useState<KeyboardFrame>(CLOSED);

  useEffect(() => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !viewport) {
      setFrame(CLOSED);
      return;
    }

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        setFrame(inset > 80 ? { inset, visibleHeight: viewport.height } : CLOSED);
      });
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);

  return frame;
}

/** Text-entry elements: the ones that raise a keyboard. */
export function isTextEntry(element: EventTarget | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element instanceof HTMLTextAreaElement || element.isContentEditable) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "hidden"].includes(element.type);
  }
  return false;
}
