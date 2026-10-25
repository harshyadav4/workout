import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A small state word. Tints, never solid fills: solid would need its own
 * foreground token per tone to stay legible, and a badge is read, not pressed.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-brand/15 text-brand",
        secondary: "bg-secondary text-muted-foreground",
        outline: "border border-border bg-transparent text-foreground",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        accent: "bg-accent/15 text-accent",
        danger: "bg-danger/15 text-danger"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
