"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

import { isTextEntry, useKeyboard } from "@/components/ui/use-keyboard";
import { tick } from "@/lib/feedback";
import { cn } from "@/lib/utils";

// Pass to DialogContent for a sheet that sits flush on the bottom edge instead
// of floating above it. Still capped to the mobile shell width.
export const DRAWER_CONTENT =
  "bottom-0 w-full rounded-b-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-0";

/** How a sheet closes itself — the swipe below needs it; Radix gives Content no way. */
const SheetClose = createContext<(() => void) | null>(null);

/** The key this file adds to `history.state` while a sheet is open. */
const SHEET_STATE = "ariseSheet";
let sheetSerial = 0;

/**
 * One history entry for as long as `open` is true. The Android back gesture
 * (and the iOS edge swipe) pops it, and `close` runs — the sheet goes, the page
 * stays, which is what a native sheet does. Closed any other way (the X, the
 * scrim, Escape, a button), the entry is popped here so the next Back still
 * goes where the user expects.
 *
 * The new state copies the current one: Next keeps its own keys in
 * `history.state` and reloads the page on a popstate whose state lacks them.
 */
function useSheetHistory(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) {
      return;
    }
    const id = ++sheetSerial;
    window.history.pushState({ ...(window.history.state ?? {}), [SHEET_STATE]: id }, "");
    let poppedByBack = false;
    const onPop = () => {
      if (window.history.state?.[SHEET_STATE] !== id) {
        poppedByBack = true;
        closeRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Still our entry on top: the sheet closed from the UI, so drop it. After
      // a route change inside the sheet, Next's entry is on top and stays.
      if (!poppedByBack && window.history.state?.[SHEET_STATE] === id) {
        window.history.back();
      }
    };
  }, [open]);
}

/**
 * Radix's Root, plus the history entry above. Works controlled (`open` +
 * `onOpenChange`) or not (`DialogTrigger` inside): the open state is mirrored
 * here either way, so Back can close it.
 */
export function Dialog({ open, defaultOpen, onOpenChange, children, ...props }: DialogPrimitive.DialogProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
  const isOpen = open ?? uncontrolled;
  const change = (next: boolean) => {
    setUncontrolled(next);
    onOpenChange?.(next);
  };
  const close = () => change(false);
  useSheetHistory(isOpen, close);
  return (
    <SheetClose.Provider value={close}>
      <DialogPrimitive.Root open={isOpen} onOpenChange={change} {...props}>
        {children}
      </DialogPrimitive.Root>
    </SheetClose.Provider>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Room left above a sheet when the keyboard has pushed it up. */
const TOP_GAP = 12;

/**
 * A swipe this far down lets the sheet go, or a flick this fast (px per ms)
 * once it has moved at least the shorter distance — a twitch on the grabber
 * is fast too, and must spring back.
 */
const DISMISS_DISTANCE = 96;
const FLICK_DISTANCE = 40;
const DISMISS_VELOCITY = 0.6;
/** How long the sheet takes to slide off after the finger lets go. */
const DISMISS_MS = 180;

/**
 * Swipe down to dismiss, as a native sheet does — from the grabber, or from
 * the body when it is already scrolled to the top. The sheet follows the
 * finger; past the distance or the speed it slides off and closes, short of
 * them it springs back; a tick marks the point of no return.
 *
 * The grabber uses pointer events with capture and `touch-action: none`. The
 * body uses touch events, because a drag the browser has claimed for
 * scrolling is cancelled before pointer events see it: a touch that starts at
 * scrollTop 0 and moves down is ours (and prevented, so iOS does not
 * rubber-band the body instead); one that moves up is a scroll and is left
 * alone until the next touch.
 */
function useSwipeToDismiss(close: (() => void) | null) {
  const drag = useRef<{ startY: number; dy: number; startedAt: number; ticked: boolean } | null>(null);
  // The sheet element, as a ref for the handlers and as state for the effect
  // below: DialogContent's hooks run while the sheet is still closed (the
  // consumer renders it always; Radix mounts the element only when open), so
  // an effect keyed on the ref object alone ran once, found nothing, and never
  // ran again. The callback ref re-runs it when the element arrives.
  const sheet = useRef<HTMLDivElement | null>(null);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((element: HTMLDivElement | null) => {
    sheet.current = element;
    setNode(element);
  }, []);

  const begin = (y: number) => {
    if (!sheet.current) {
      return;
    }
    drag.current = { startY: y, dy: 0, startedAt: performance.now(), ticked: false };
    // No transition while the finger has it: it must track exactly.
    sheet.current.style.transition = "none";
  };

  const move = (y: number) => {
    const current = drag.current;
    if (!current || !sheet.current) {
      return;
    }
    current.dy = Math.max(0, y - current.startY);
    sheet.current.style.transform = `translate(-50%, ${current.dy}px)`;
    if (!current.ticked && current.dy > DISMISS_DISTANCE) {
      current.ticked = true;
      tick();
    }
  };

  const end = () => {
    const current = drag.current;
    const element = sheet.current;
    drag.current = null;
    if (!current || !element) {
      return;
    }
    const velocity = current.dy / Math.max(1, performance.now() - current.startedAt);
    const flicked = current.dy > FLICK_DISTANCE && velocity > DISMISS_VELOCITY;
    if (close && (current.dy > DISMISS_DISTANCE || flicked)) {
      element.dataset.dismissed = "";
      element.style.transition = `transform ${DISMISS_MS}ms ease-in, opacity ${DISMISS_MS}ms ease-in`;
      element.style.transform = "translate(-50%, 120%)";
      element.style.opacity = "0";
      window.setTimeout(close, DISMISS_MS - 20);
      return;
    }
    element.style.transition = "transform 200ms ease-out";
    element.style.transform = "";
    window.setTimeout(() => {
      element.style.transition = "";
    }, 220);
  };

  // The body: touch events, attached by hand so touchmove can be non-passive.
  useEffect(() => {
    const element = node;
    if (!element) {
      return;
    }
    let pending: { y: number; decided: boolean } | null = null;
    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-grabber]") || element.scrollTop > 0) {
        pending = null;
        return;
      }
      pending = { y: event.touches[0].clientY, decided: false };
    };
    const onMove = (event: TouchEvent) => {
      const y = event.touches[0].clientY;
      if (drag.current) {
        move(y);
        event.preventDefault();
        return;
      }
      if (!pending || pending.decided) {
        return;
      }
      const dy = y - pending.y;
      if (Math.abs(dy) < 8) {
        return;
      }
      pending.decided = true;
      if (dy > 0 && element.scrollTop <= 0) {
        begin(pending.y);
        move(y);
        event.preventDefault();
      }
    };
    const onEnd = () => {
      pending = null;
      if (drag.current) {
        end();
      }
    };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("touchcancel", onEnd);
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- begin/move/end read refs only
  }, [node]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    begin(event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => move(event.clientY);

  return { ref, grabber: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end } };
}

/**
 * A sheet that behaves with an on-screen keyboard.
 *
 * - Opening it focuses the sheet itself, never the first field in it. Radix
 *   focuses the first focusable element by default, which on a phone means the
 *   keyboard springs up the moment "Build with AI" or the builder opens, over
 *   the very thing you came to read.
 * - While the keyboard is up, the sheet sits on top of it and is no taller than
 *   the space left (see useKeyboard), and the field you tapped scrolls to the
 *   middle of that space instead of under the keyboard or off the top.
 */
export function DialogContent({
  className,
  children,
  hideClose,
  style,
  onOpenAutoFocus,
  onFocusCapture,
  ...props
}: DialogPrimitive.DialogContentProps & { hideClose?: boolean }) {
  const keyboard = useKeyboard();
  const swipe = useSwipeToDismiss(useContext(SheetClose));

  const lifted: CSSProperties | undefined =
    keyboard.inset > 0
      ? {
          bottom: keyboard.inset,
          maxHeight: keyboard.visibleHeight - TOP_GAP,
          // The safe-area padding is for the home indicator, which the
          // keyboard is now covering.
          paddingBottom: 16
        }
      : undefined;

  const centreField = (event: FocusEvent<HTMLDivElement>) => {
    onFocusCapture?.(event);
    const target = event.target;
    if (!isTextEntry(target)) {
      return;
    }
    // After the keyboard has finished animating in, or the measurement is of
    // a sheet still on its way up.
    window.setTimeout(() => target.scrollIntoView({ block: "center", behavior: "smooth" }), 320);
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="sheet-scrim fixed inset-0 z-50 bg-black/60" />
      <DialogPrimitive.Content
        ref={swipe.ref}
        className={cn(
          "sheet plaque fixed bottom-4 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 overflow-y-auto overscroll-contain rounded-3xl p-5 outline-none transition-[bottom,max-height] duration-150 ease-out sm:bottom-6",
          className
        )}
        style={{ ...style, ...lifted }}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          if (!event.defaultPrevented) {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
          }
        }}
        onFocusCapture={centreField}
        {...props}
      >
        {/* The grabber: a native sheet's handle, and the zone a swipe down
            starts from. Full width, so a thumb finds it without aiming. */}
        <div
          data-grabber
          className="-mx-5 -mt-5 mb-1 flex h-8 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          aria-hidden
          {...swipe.grabber}
        >
          <div className="h-1.5 w-10 rounded-full bg-border" />
        </div>
        {children}
        {/* aria-label, not the icon: lucide sets aria-hidden on <X> when no a11y
            prop is passed, so without this the button announces as "button". */}
        {hideClose ? null : (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-2 top-2 rounded-full p-3.5 text-muted-foreground transition-colors hover:text-foreground active:bg-secondary/60"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-4 space-y-1", className)} {...props} />
);

// Wrap the primitives, not bare h2/p — Radix wires aria-labelledby and
// aria-describedby through them and warns when Content has neither.
export const DialogTitle = ({
  className,
  ...props
}: DialogPrimitive.DialogTitleProps) => (
  <DialogPrimitive.Title className={cn("font-display text-xl font-bold tracking-tight", className)} {...props} />
);

export const DialogDescription = ({
  className,
  ...props
}: DialogPrimitive.DialogDescriptionProps) => (
  <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
);
