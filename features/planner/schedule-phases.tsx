"use client";

import { offerUndo } from "@/lib/undo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ui/select";
import type { SchedulePhase, SessionTemplate } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Rare edits stay inside the existing schedule sheet. */
export function SchedulePhases({ phases, onChange, templates, startDate, endDate }: {
  phases: SchedulePhase[];
  onChange: (next: SchedulePhase[]) => void;
  templates: SessionTemplate[];
  startDate: string;
  endDate: string;
}) {
  const patch = (index: number, next: Partial<SchedulePhase>) =>
    onChange(phases.map((phase, i) => i === index ? { ...phase, ...next } : phase));
  return (
    <details className="border-t border-sep pt-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-[15px]">
        Dated phases <span className="ml-auto text-muted-foreground tabular-nums">{phases.length || "None"}</span>
      </summary>
      <p className="mb-3 text-[13px] text-muted-foreground">Use a different weekly plan for a deload, tier or exercise change. Other dates follow the normal plan.</p>
      {phases.map((phase, index) => (
        <details key={index} className="border-t border-sep py-2">
          <summary className="min-h-11 cursor-pointer break-words py-2 text-[15px]">{phase.name}</summary>
          <div className="space-y-3 pb-2">
            <label className="block text-xs text-muted-foreground">Name
              <Input className="mt-1" value={phase.name} onChange={(e) => patch(index, { name: e.target.value })} />
            </label>
            <div className="space-y-3">
              <label className="block text-xs text-muted-foreground">From
                <Input className="mt-1 min-w-0" type="date" min={startDate} max={endDate} value={phase.startDate} onChange={(e) => patch(index, { startDate: e.target.value })} />
              </label>
              <label className="block text-xs text-muted-foreground">Through
                <Input className="mt-1 min-w-0" type="date" min={phase.startDate} max={endDate} value={phase.endDate} onChange={(e) => patch(index, { endDate: e.target.value })} />
              </label>
            </div>
            {phase.mode === "rotation" ? (
              <p className="break-words text-sm text-muted-foreground">Rotation: {phase.rotationOrder.map((id) => templates.find((t) => t.id === id)?.name ?? "Rest").join(" → ")}. Rest weekdays: {phase.restWeekdays.map((day) => DAYS[day]).join(", ") || "none"}.</p>
            ) : DAYS.map((day, weekday) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-sm text-muted-foreground">{day}</span>
                <ThemedSelect className="min-w-0 flex-1" aria-label={`${phase.name}: ${day}`}
                  value={phase.restWeekdays.includes(weekday) ? "rest" : phase.weekly[weekday] ?? ""}
                  options={[{ value: "", label: "Off" }, { value: "rest", label: "Rest" }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
                  onValueChange={(value) => {
                    const weekly = { ...phase.weekly };
                    delete weekly[weekday];
                    if (value && value !== "rest") weekly[weekday] = value;
                    patch(index, { weekly, restWeekdays: [...phase.restWeekdays.filter((d) => d !== weekday), ...(value === "rest" ? [weekday] : [])] });
                  }} />
              </div>
            ))}
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => { onChange(phases.filter((_, i) => i !== index)); offerUndo({ label: "Phase removed", undo: () => onChange(phases), commit: () => undefined }); }}>Remove phase</Button>
          </div>
        </details>
      ))}
      <Button variant="ghost" className="w-full" disabled={phases.length >= 32} onClick={() => onChange([...phases, {
        name: "New phase", startDate, endDate, mode: "weekly", weekly: {}, rotationOrder: [], restWeekdays: []
      }])}>Add dated phase</Button>
    </details>
  );
}
