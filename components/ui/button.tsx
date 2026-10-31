"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Pills. The default is the plain one: the one thing on the screen you are meant
 * to press, white on Dusk and ink on Dawn, with no gradient and no glow.
 * `secondary` is a quiet pill in a soft tint. `ghost` and `outline` are flat —
 * for actions that should not look like a button until you need them.
 */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "key",
        secondary: "key-quiet text-foreground",
        ghost: "bg-transparent text-foreground hover:bg-hi active:bg-hi",
        outline:
          "border border-sep bg-transparent text-foreground hover:bg-hi active:bg-hi",
        danger: "bg-danger text-danger-foreground hover:bg-danger/90"
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
