"use client";

import { useLayoutEffect, useRef, type SyntheticEvent } from "react";

/** A swapped-in view owns its scroll and return target, not the whole dialog. */
export function useSheetNavigation(view: string) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, { top: number; anchor?: string }>());
  const capture = (event: SyntheticEvent) => {
    const sheet = ref.current?.closest<HTMLElement>('[role="dialog"]');
    if (!sheet) return;
    const target = event.target instanceof Element ? event.target : null;
    positions.current.set(view, {
      top: sheet.scrollTop,
      anchor: target?.closest<HTMLElement>('[data-sheet-anchor]')?.dataset.sheetAnchor
    });
  };

  useLayoutEffect(() => {
    if (view === "closed") {
      positions.current.clear();
      return;
    }
    const root = ref.current;
    const sheet = root?.closest<HTMLElement>('[role="dialog"]');
    if (!root || !sheet) return;
    const saved = positions.current.get(view);
    if (saved?.anchor) {
      const target = [...root.querySelectorAll<HTMLElement>('[data-sheet-anchor]')]
        .find((item) => item.dataset.sheetAnchor === saved.anchor);
      // Focus the row, never a text field: returning must not raise the keyboard.
      target?.focus({ preventScroll: true });
    }
    sheet.scrollTop = saved?.top ?? 0;
  }, [view]);

  return { ref, onClickCapture: capture, onKeyDownCapture: capture };
}
