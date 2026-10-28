"use client";

import { Trash2 } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";

import { tick } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/** How far the row parks open, showing Delete. */
const REVEAL = 88;
/** Past this share of the row's width, letting go deletes without the button. */
const FULL = 0.45;
/** Movement before a touch is a swipe and not a tap or a scroll. */
const SLOP = 8;

interface Drag {
  x: number;
  y: number;
  dx: number;
  width: number;
  startOpen: boolean;
  mode: "idle" | "swipe" | "scroll";
  ticked: boolean;
}

/**
 * Swipe left on a list row to delete it, the native list idiom. A short swipe
 * parks the row open with a red Delete behind it; a long one deletes on
 * release, with a tick as it crosses the point. A tap on an open row closes
 * it. Vertical movement is left to the page (`touch-pan-y`), so a list still
 * scrolls. Put the delete-with-undo in `onDelete`; this only asks.
 */
export function SwipeRow({
  onDelete,
  disabled,
  label = "Delete",
  className,
  children
}: {
  onDelete: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const front = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const justSwiped = useRef(false);
  const [open, setOpen] = useState(false);

  const slide = (x: number, animate: boolean) => {
    const element = front.current;
    if (!element) {
      return;
    }
    element.style.transition = animate ? "transform 200ms ease-out" : "none";
    element.style.transform = x === 0 ? "" : `translateX(${x}px)`;
  };

  const remove = (width: number) => {
    slide(-width, true);
    setOpen(false);
    window.setTimeout(onDelete, 180);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) {
      return;
    }
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      width: event.currentTarget.offsetWidth,
      startOpen: open,
      mode: "idle",
      ticked: false
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) {
      return;
    }
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.mode === "idle") {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) {
        return;
      }
      if (Math.abs(dy) > Math.abs(dx)) {
        current.mode = "scroll";
        return;
      }
      current.mode = "swipe";
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (current.mode !== "swipe") {
      return;
    }
    const base = current.startOpen ? -REVEAL : 0;
    current.dx = Math.min(0, base + dx);
    slide(current.dx, false);
    const past = -current.dx > current.width * FULL;
    if (past && !current.ticked) {
      current.ticked = true;
      tick();
    }
  };

  const settle = (cancelled: boolean) => {
    const current = drag.current;
    drag.current = null;
    if (!current || current.mode !== "swipe") {
      return;
    }
    justSwiped.current = true;
    window.setTimeout(() => {
      justSwiped.current = false;
    }, 0);
    if (!cancelled && -current.dx > current.width * FULL) {
      remove(current.width);
      return;
    }
    const stayOpen = !cancelled && -current.dx > REVEAL / 2;
    setOpen(stayOpen);
    slide(stayOpen ? -REVEAL : 0, true);
  };

  // A tap on a parked-open row closes it and goes no further.
  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (justSwiped.current || open) {
      event.preventDefault();
      event.stopPropagation();
      if (open) {
        setOpen(false);
        slide(0, true);
      }
    }
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <button
        type="button"
        aria-label={label}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => remove(front.current?.offsetWidth ?? REVEAL)}
        className="absolute inset-y-0 right-0 flex w-[88px] flex-col items-center justify-center gap-1 bg-danger text-[11px] font-semibold text-danger-foreground"
      >
        <Trash2 className="h-5 w-5" aria-hidden />
        {label}
      </button>
      <div
        ref={front}
        className="relative touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => settle(false)}
        onPointerCancel={() => settle(true)}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
