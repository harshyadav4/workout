"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";

/**
 * A number field you can empty.
 *
 * A plain controlled `<Input value={n} onChange={e => set(Number(e.target.value))}>`
 * turns a cleared field into `Number("") === 0` on the spot, so the 0 can never
 * be deleted — backspace writes it straight back. This keeps the raw text while
 * you type and only reports parseable numbers upwards; an empty field reports
 * nothing, and on blur it shows the last real value again. Focus selects the
 * contents, so one tap and a digit replaces rather than appends.
 *
 * Callers still clamp on save (see `clampNumber` in plan-build): this
 * component is about typing, not about valid ranges.
 */
export function NumberInput({
  value,
  onValueChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (next: number) => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);

  return (
    <Input
      {...props}
      type="number"
      inputMode={props.inputMode ?? "decimal"}
      value={draft ?? String(value)}
      onFocus={(event) => {
        event.target.select();
        props.onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const parsed = Number(raw);
        if (raw.trim() !== "" && Number.isFinite(parsed)) {
          onValueChange(parsed);
        }
      }}
      onBlur={(event) => {
        setDraft(null);
        props.onBlur?.(event);
      }}
    />
  );
}
