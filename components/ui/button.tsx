"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Keys. The default is the mana-blue key: the one thing on the screen you are meant
 * to press. `secondary` is a quiet key in the surface's own material. `ghost`
 * and `outline` are flat — for actions that should not look like a button
 * until you need them.
 *
 * The press is in the material (`.key:active` moves it down 2px), not a scale
 * transform: a key goes down, it does not shrink.
 */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "key font-display text-[17px] font-bold tracking-tight",
        secondary: "key-quiet text-foreground",
        ghost: "bg-transparent text-foreground hover:bg-secondary/60 active:bg-secondary",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-secondary/60 active:bg-secondary",
        danger: "bg-danger text-danger-foreground shadow-quiet hover:bg-danger/90 active:translate-y-px"
      },
      size: {
        default: "h-12 px-5 text-[15px]",
        sm: "h-10 px-4 text-sm",
        lg: "h-14 px-6 text-base",
        icon: "h-12 w-12"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
