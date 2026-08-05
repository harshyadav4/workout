"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Pass to DialogContent for a sheet that sits flush on the bottom edge instead
// of floating above it. Still capped to the mobile shell width.
export const DRAWER_CONTENT =
  "bottom-0 w-full rounded-b-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-0";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  hideClose,
  ...props
}: DialogPrimitive.DialogContentProps & { hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[28px] border border-white/5 bg-card p-5 shadow-glow outline-none sm:bottom-6",
          className
        )}
        {...props}
      >
        {children}
        {/* aria-label, not the icon: lucide sets aria-hidden on <X> when no a11y
            prop is passed, so without this the button announces as "button". */}
        {hideClose ? null : (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-2 top-2 rounded-full p-3.5 text-muted-foreground transition active:bg-secondary/60"
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
  <DialogPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />
);

export const DialogDescription = ({
  className,
  ...props
}: DialogPrimitive.DialogDescriptionProps) => (
  <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
);
