"use client";

import { useEffect, useState } from "react";

import { setDetailedTiming, useDetailedTiming } from "@/features/workout/use-detailed-timing";
import { setDistanceUnit, useDistanceUnit } from "@/features/workout/use-distance-unit";
import { applyTheme, isTheme, THEME_KEY, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * What the themes are called on screen. "Graphite" and "Paper" read as product
 * names; Dark and Light are the words every phone's settings already use.
 */
const SKIN_LABELS: Record<Theme, string> = {
  system: "Auto",
  dark: "Dark",
  light: "Light"
};

/**
 * Read after mount, never during render. The server has no `localStorage`, so
 * reading it in the initial state would make the first client render disagree
 * with the HTML and React would throw a hydration mismatch. The pre-paint script
 * in the document head is what stops that gap being visible.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (isTheme(stored)) {
        setTheme(stored);
      }
    } catch {
      // Storage is unreadable in some privacy modes. System is the right
      // fallback and the page is already painted correctly either way.
    }
  }, []);

  // Following the OS means following it while the app is open, not only at load.
  useEffect(() => {
    if (theme !== "system") {
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // The theme still applies for this session; it just will not be remembered.
    }
  };

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">Theme</p>
      <div className="well mt-1.5 grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label="Theme">
        {(Object.keys(SKIN_LABELS) as Theme[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={theme === option}
            onClick={() => choose(option)}
            className={cn(
              "h-11 rounded-lg text-sm font-semibold transition-colors",
              theme === option ? "key" : "text-muted-foreground"
            )}
          >
            {SKIN_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** km or miles for every run on this device. Stored runs are always km. */
export function DistanceUnitToggle() {
  const unit = useDistanceUnit();
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">Distance</p>
      <div className="well mt-1.5 grid grid-cols-2 gap-1 rounded-xl p-1" role="group" aria-label="Distance unit">
        {(["km", "mi"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={unit === option}
            onClick={() => setDistanceUnit(option)}
            className={cn("h-11 rounded-lg text-sm font-semibold transition-colors", unit === option ? "key" : "text-muted-foreground")}
          >
            {option === "km" ? "Kilometres" : "Miles"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Per workout and per set times on the finish card and in the Plan. Always recorded; this shows them. */
export function DetailedTimingToggle() {
  const on = useDetailedTiming();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setDetailedTiming(!on)}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-left transition-colors active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>
        <span className="block text-sm font-semibold">Detailed timing</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Shows the time for each exercise and set.
        </span>
      </span>
      <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "well")}>
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-card shadow-quiet transition-transform",
            on ? "translate-x-6" : "translate-x-1"
          )}
        />
      </span>
    </button>
  );
}
