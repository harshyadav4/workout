import { applyThemeTokens, readThemeColors, THEME_COLORS_KEY } from "@/lib/theme-custom";

export type Theme = "system" | "dark" | "light";

export const THEME_KEY = "gymflow.theme";

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  dark: "Dark",
  light: "Light"
};

/**
 * The status bar colour behind each palette: `--background` from globals.css,
 * as hex because `<meta name="theme-color">` does not take hsl() everywhere.
 */
export const THEME_COLORS = { dark: "#0E1230", light: "#EFF0FA" } as const;

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

  const resolved = resolveTheme(theme, prefersLight);
  document.documentElement.classList.toggle("light", resolved === "light");
  // A person's own colours (lib/theme-custom), for whichever theme this is.
  const tokens = readThemeColors()?.[resolved];
  applyThemeTokens(tokens);
  // The two media-queried tags in the layout follow the system; the manual
  // Dark / Light choice on the You page needs the tag written by hand, or the
  // status bar stays dark above a Dawn page.
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      meta.content = tokens?.["--theme-color"] ?? THEME_COLORS[resolved];
    });
}

/**
 * Runs before first paint, inlined in the document head.
 *
 * Without it the page paints dark and then snaps to light on hydration, which is
 * worse than not offering a light theme at all. Wrapped in try/catch because
 * `localStorage` throws outright in some privacy modes, and a theme preference
 * is never worth a blank page.
 */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"system";var l=t==="light"||(t==="system"&&matchMedia("(prefers-color-scheme: light)").matches);var d=document.documentElement;if(l)d.classList.add("light");var c=l?${JSON.stringify(THEME_COLORS.light)}:${JSON.stringify(THEME_COLORS.dark)};try{var o=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_COLORS_KEY)})||"null"),v=o&&o[l?"light":"dark"];if(v){for(var k in v)d.style.setProperty(k,v[k]);c=v["--theme-color"]||c}}catch(e){}var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].content=c}catch(e){}`;
