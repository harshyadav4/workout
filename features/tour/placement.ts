/**
 * Where the guide sits: the sprite and its bubble as one row, next to the
 * part being explained — below it when there is room, above it when not —
 * and never over the bottom navigation, which must stay visible so a page
 * change can be seen. Pure, so every case is tested (placement.test.ts).
 */

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface GuideLayout {
  /** The row's top edge, in viewport pixels. */
  top: number;
  left: number;
  width: number;
  /** Where the row sits relative to the lit part. */
  side: "below" | "above" | "over" | "centre";
  /** Where the sprite's eyes look, each in -1…1. */
  gaze: { x: number; y: number };
}

/** Side gutter, matching the app's 16px. */
export const GUTTER = 16;

/** Space between the lit part and the guide. */
export const GAP = 12;

/** Widest the row gets, so it reads like a note, not a banner, on a tablet. */
export const MAX_WIDTH = 420;

/** The sprite's box, to the left of the bubble. */
export const SPRITE = { width: 56, height: 64 };

export function placeGuide({
  target,
  viewport,
  topLimit,
  bottomLimit,
  rowHeight
}: {
  /** The lit part, or undefined for a step with nothing to point at. */
  target?: Box;
  viewport: { width: number; height: number };
  /** Nothing above this: the status bar. */
  topLimit: number;
  /** Nothing below this: the top of the bottom navigation. */
  bottomLimit: number;
  /** The row's height as rendered: the taller of the sprite and the bubble. */
  rowHeight: number;
}): GuideLayout {
  const width = Math.min(MAX_WIDTH, viewport.width - GUTTER * 2);
  const left = Math.round((viewport.width - width) / 2);
  const clamp = (top: number) => Math.max(topLimit, Math.min(top, bottomLimit - rowHeight));

  if (!target) {
    return {
      top: Math.round(clamp((topLimit + bottomLimit - rowHeight) / 2)),
      left,
      width,
      side: "centre",
      gaze: { x: 0, y: 0 }
    };
  }

  const below = target.top + target.height + GAP;
  const above = target.top - GAP - rowHeight;
  let top: number;
  let side: GuideLayout["side"];

  if (below + rowHeight <= bottomLimit) {
    top = below;
    side = "below";
  } else if (above >= topLimit) {
    top = above;
    side = "above";
  } else {
    // A part taller than the room around it: sit on its lower edge, inside
    // the screen, where the eye ends after reading it top to bottom.
    top = bottomLimit - rowHeight;
    side = "over";
  }
  top = Math.round(clamp(top));

  // The eyes look from the sprite's centre to the part's centre.
  const fromX = left + SPRITE.width / 2;
  const fromY = top + rowHeight / 2;
  const dx = target.left + target.width / 2 - fromX;
  const dy = target.top + target.height / 2 - fromY;
  const length = Math.hypot(dx, dy) || 1;

  return { top, left, width, side, gaze: { x: dx / length, y: dy / length } };
}
