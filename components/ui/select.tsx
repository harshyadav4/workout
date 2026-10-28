"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "well flex h-12 w-full items-center justify-between gap-2 rounded-lg px-4 text-left text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[placeholder]:text-muted-foreground [&>span]:truncate",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

/**
 * The open list: a plaque under the trigger, as wide as it, never taller than
 * the room left on screen. `popper` rather than Radix's default item-aligned
 * mode, which jumps the list so the chosen row sits over the trigger — on a
 * phone that covers the field you just tapped.
 */
export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", sideOffset = 6, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={sideOffset}
      className={cn(
        "plaque z-[60] overflow-hidden rounded-xl text-card-foreground",
        position === "popper" &&
          "max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]",
        className
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="select-list max-h-[inherit] overflow-y-auto p-1">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex min-h-11 cursor-default select-none items-center rounded-lg py-2.5 pl-4 pr-10 text-[15px] outline-none data-[highlighted]:bg-secondary data-[state=checked]:font-semibold data-[state=checked]:text-brand",
      className
    )}
    {...props}
  >
    <span className="absolute right-3 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-brand" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

/** Radix forbids "" as an item value; this stands in for "nothing chosen". */
const NONE = "__none__";

/**
 * The app's dropdown in one line: a list of options, a value, a change handler.
 * Replaces the native `<select>`, whose open menu is drawn by the phone in its
 * own colours and ignores the skin. `""` is allowed as a value ("Off", "Any").
 */
export function ThemedSelect({
  value,
  onValueChange,
  options,
  className,
  ...props
}: {
  value: string;
  onValueChange: (next: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <Select
      value={value === "" ? NONE : value}
      onValueChange={(next) => onValueChange(next === NONE ? "" : next)}
    >
      <SelectTrigger className={className} aria-label={props["aria-label"]} id={props.id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || NONE} value={option.value === "" ? NONE : option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
