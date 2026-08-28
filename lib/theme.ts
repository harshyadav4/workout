export type Theme = "system" | "dark" | "light";

export const THEME_KEY = "gymflow.theme";

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  dark: "Dark",
  light: "Light"
};

export function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "dark" || value === "light";
}

/**
 * Dark is the default and lives in `:root`, so only light needs a class. That
 * asymmetry is deliberate: if this script fails or storage is unreadable, the
 * page renders the palette it has always rendered rather than an unstyled one.
 */
export function resolveTheme(theme: Theme, prefersLight: boolean): "dark" | "light" {
  if (theme === "system") {
    return prefersLight ? "light" : "dark";
  }
  return theme;
}

export function applyTheme(theme: Theme) {
  const prefersLight =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  document.documentElement.classList.toggle("light", resolveTheme(theme, prefersLight) === "light");
}

/**
 * Runs before first paint, inlined in the document head.
 *
 * Without it the page paints dark and then snaps to light on hydration, which is
 * worse than not offering a light theme at all. Wrapped in try/catch because
 * `localStorage` throws outright in some privacy modes, and a theme preference
 * is never worth a blank page.
 */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"system";var l=t==="light"||(t==="system"&&matchMedia("(prefers-color-scheme: light)").matches);if(l)document.documentElement.classList.add("light")}catch(e){}`;
