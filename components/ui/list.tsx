"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import * as React from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DRAWER_CONTENT
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A titled group of rows, like a phone's settings screen: the title outside,
 * one soft surface, and nothing boxed inside it. The surface holds the rows and
 * draws the lines between them (`.list-row` in globals.css).
 */
export function ListGroup({
  title,
  aside,
  tour,
  className,
  children
}: {
  title?: string;
  /** A small note at the far end of the title line. */
  aside?: string;
  /** The tour's marker for this group (features/tour/tour-steps). */
  tour?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-2", className)} data-tour={tour}>
      {title ? (
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-[13.5px] font-semibold text-muted-foreground">{title}</h2>
          {aside ? <span className="text-[12.5px] tabular-nums text-muted-foreground">{aside}</span> : null}
        </div>
      ) : null}
      <div className="plaque overflow-hidden rounded-3xl">{children}</div>
    </section>
  );
}

const ROW = "list-row flex min-h-[54px] w-full items-center gap-3 py-2 pl-4 pr-3.5";
const PRESSABLE =
  "text-left transition-colors active:bg-hi disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

interface RowContent {
  icon?: LucideIcon;
  label: React.ReactNode;
  hint?: React.ReactNode;
  value?: React.ReactNode;
}

function RowBody({ icon: Icon, label, hint, value, end }: RowContent & { end?: React.ReactNode }) {
  return (
    <>
      {Icon ? <Icon className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-medium">{label}</span>
        {hint ? <span className="mt-px block text-[13px] text-muted-foreground">{hint}</span> : null}
      </span>
      {value ? <span className="shrink-0 whitespace-nowrap text-[15px] tabular-nums text-muted-foreground">{value}</span> : null}
      {end}
    </>
  );
}

/**
 * One row. With `onClick` it is a button and shows a chevron, because it opens
 * something; `noChevron` is for a row that acts at once, such as Sign out.
 * Without `onClick` it only reads. The value sits on the right, so a list reads
 * like a list of facts.
 */
export function ListRow({
  onClick,
  disabled,
  noChevron,
  ...content
}: RowContent & { onClick?: () => void; disabled?: boolean; noChevron?: boolean }) {
  const marker = { "data-icon": content.icon ? "" : undefined };
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(ROW, PRESSABLE)} {...marker}>
      <RowBody
        {...content}
        end={noChevron ? null : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />}
      />
    </button>
  ) : (
    <div className={ROW} {...marker}>
      <RowBody {...content} />
    </div>
  );
}

/** The whole row is the switch: a thumb should not have to find the small part. */
export function ListSwitch({
  on,
  disabled,
  onToggle,
  ...content
}: RowContent & { on: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(ROW, PRESSABLE)}
      data-icon={content.icon ? "" : undefined}
    >
      <RowBody
        {...content}
        end={
          <span aria-hidden className={cn("relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors", on ? "bg-[var(--l2)]" : "bg-track")}>
            <span
              className={cn(
                "absolute left-0.5 top-0.5 h-[26px] w-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.28)] transition-transform",
                on && "translate-x-5"
              )}
            />
          </span>
        }
      />
    </button>
  );
}

/** A bottom sheet with a title: where a form lives, so the page does not have to hold it. */
export function ListSheet({
  open,
  onOpenChange,
  title,
  description,
  titleClassName,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  titleClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No description: Radix wants `aria-describedby` said out loud, or it warns. */}
      <DialogContent
        className={`${DRAWER_CONTENT} max-h-[88dvh] overflow-y-auto`}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader className="pr-9">
          <DialogTitle className={titleClassName}>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** A row that opens a sheet. `children` can take `close`, for a Save that finishes the job. */
export function ListSheetRow({
  title,
  description,
  children,
  ...content
}: RowContent & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow {...content} onClick={() => setOpen(true)} />
      <ListSheet open={open} onOpenChange={setOpen} title={title ?? content.label} description={description}>
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </ListSheet>
    </>
  );
}

/** Rows inside a sheet: no surface of their own, and lined up with the sheet's title. */
export function SheetRows({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4">{children}</div>;
}

/** For a sheet whose controls save on tap, so all it needs is a way out. */
export function SheetDone() {
  return (
    <DialogClose asChild>
      <Button className="mt-5 w-full">Done</Button>
    </DialogClose>
  );
}
