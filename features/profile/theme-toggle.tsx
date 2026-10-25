"use client";

import { useEffect, useState } from "react";

import { feedbackEnabled, haptic, setFeedbackEnabled } from "@/lib/feedback";
import { applyTheme, isTheme, THEME_KEY, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** What the skins are called on screen. The stored values stay `dark` / `light`. */
const SKIN_LABELS: Record<Theme, string> = {
  system: "Auto",
  dark: "Graphite",
  light: "Paper"
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
      <p className="text-xs font-medium text-muted-foreground">Skin</p>
      <div className="well mt-1.5 grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label="Skin">
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

/**
 * The feedback switch: a haptic on every tap, and a click on a logged set.
 * Off until you say so: a phone that clicks in a gym without being asked gets
 * muted, and the web cannot ask for haptics the way a native app can. Read
 * after mount for the same reason as the skin above.
 */
export function FeedbackToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(feedbackEnabled());
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    setFeedbackEnabled(next);
    // The tap listener checked the switch before it flipped, so turning it on
    // would be the one silent tap. Answer it here.
    if (next) {
      haptic();
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-left transition-colors active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>
        <span className="block text-sm font-semibold">Haptics and sound</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          A light buzz on every tap, and a click when you log a set. iPhone needs iOS 18 or newer.
        </span>
      </span>
      <span
        aria-hidden
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "well")}
      >
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
