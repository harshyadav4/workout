"use client";

import { useEffect, useState } from "react";

import { applyTheme, isTheme, THEME_KEY, THEME_LABELS, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

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
      <p className="text-xs text-muted-foreground">Theme</p>
      <div className="mt-1 flex gap-1 rounded-2xl bg-secondary/50 p-1">
        {(Object.keys(THEME_LABELS) as Theme[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={theme === option}
            onClick={() => choose(option)}
            className={cn(
              "min-h-[44px] flex-1 rounded-xl text-sm transition-colors",
              theme === option ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            {THEME_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
