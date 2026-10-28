"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";

import { isTextEntry, useKeyboard } from "@/components/ui/use-keyboard";
import { cn } from "@/lib/utils";

// Pass to DialogContent for a sheet that sits flush on the bottom edge instead
// of floating above it. Still capped to the mobile shell width.
export const DRAWER_CONTENT =
  "bottom-0 w-full rounded-b-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-0";

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
  useSheetHistory(isOpen, () => change(false));
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={change} {...props}>
      {children}
    </DialogPrimitive.Root>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Room left above a sheet when the keyboard has pushed it up. */
const TOP_GAP = 12;

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
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <DialogPrimitive.Content
        className={cn(
          "plaque fixed bottom-4 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 overflow-y-auto overscroll-contain rounded-3xl p-5 outline-none transition-[bottom,max-height] duration-150 ease-out sm:bottom-6",
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
