/**
 * A person's own look: a colour for the page, one for the main button, and a font
 * for headings and one for text. Each becomes a set of tokens for Dark and a set
 * for Light, written over the ones in globals.css. Progress colours, the muscle map and status colours stay as they
 * are: they mean something, so a theme does not get to change them.
 *
 * The page's shades are found by brightness, not by lightness in HSL: yellow at
 * 30% is far brighter than blue at 30%. Each shade takes the measured brightness
 * of the same shade in Dusk, so any hue reads as well as Dusk does.
 *
 * Stored as the finished tokens, so the script that runs before first paint only
 * has to copy them across (THEME_BOOTSTRAP in lib/theme.ts).
 */

export const THEME_COLORS_KEY = "gymflow.theme-colors";

export interface ThemePicks {
  /** The page's colour, as #rrggbb. Absent: Dusk, from globals.css. */
  page?: string;
  /** The main button's colour, as #rrggbb. Absent: plain white or ink. */
  button?: string;
  /** A key of TEXT_FONTS. Absent: Instrument Sans. */
  textFont?: string;
  /** A key of HEADING_FONTS. Absent: Outfit. */
  headingFont?: string;
}

/** Text fonts on offer. Each must have a rupee sign. The variables are in app/fonts.ts. */
export const TEXT_FONTS: Record<string, { name: string; variable: string }> = {
  inter: { name: "Inter", variable: "--font-inter" },
  figtree: { name: "Figtree", variable: "--font-figtree" },
  manrope: { name: "Manrope", variable: "--font-manrope" },
  jakarta: { name: "Jakarta", variable: "--font-jakarta" }
};

/** Heading fonts on offer, each at the weight and tracking it looks best at. */
export const HEADING_FONTS: Record<string, { name: string; variable: string; weight: string; track: string }> = {
  serif: { name: "Serif", variable: "--font-instrument-serif", weight: "400", track: "-0.012em" },
  dmserif: { name: "DM Serif", variable: "--font-dm-serif", weight: "400", track: "-0.01em" },
  fraunces: { name: "Fraunces", variable: "--font-fraunces", weight: "500", track: "-0.02em" },
  tight: { name: "Inter Tight", variable: "--font-inter-tight", weight: "600", track: "-0.025em" },
  barlow: { name: "Barlow", variable: "--font-barlow", weight: "600", track: "-0.01em" }
};

function fontTokens(picks: ThemePicks): ThemeTokens {
  const text = picks.textFont ? TEXT_FONTS[picks.textFont] : undefined;
  const heading = picks.headingFont ? HEADING_FONTS[picks.headingFont] : undefined;
  return {
    ...(text ? { "--font-sans": `var(${text.variable})` } : {}),
    ...(heading
      ? { "--font-heading": `var(${heading.variable})`, "--heading-weight": heading.weight, "--heading-track": heading.track }
      : {})
  };
}

export type ThemeTokens = Record<string, string>;

export interface StoredThemeColors {
  picks: ThemePicks;
  dark: ThemeTokens;
  light: ThemeTokens;
}

export type ThemeMode = "dark" | "light";

type Rgb = [number, number, number];

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb) {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function toHsl([r, g, b]: Rgb) {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  const light = (max + min) / 2;
  if (chroma === 0) {
    return { h: 0, s: 0, l: light };
  }
  const h = max === red ? ((green - blue) / chroma + 6) % 6 : max === green ? (blue - red) / chroma + 2 : (red - green) / chroma + 4;
  return { h: h * 60, s: chroma / (1 - Math.abs(2 * light - 1)), l: light };
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const channel = (shift: number) => {
    const k = (shift + h / 30) % 12;
    return (l - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return [channel(0), channel(8), channel(4)];
}

/** Relative luminance, as WCAG defines it. */
export function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** One colour laid over another at some opacity. */
export function mix(top: string, under: string, alpha: number) {
  const below = toRgb(under);
  return toHex(toRgb(top).map((channel, index) => channel * alpha + below[index] * (1 - alpha)) as Rgb);
}

/** This hue and saturation at the lightness that gives this brightness. */
function atBrightness(h: number, s: number, target: number) {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 18; step += 1) {
    const middle = (low + high) / 2;
    if (luminance(toHex(fromHsl(h, s, middle))) < target) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return toHex(fromHsl(h, s, (low + high) / 2));
}

/** A colour as the bare "H S% L%" that `hsl(var(--token))` wants. */
function channels(hex: string) {
  const { h, s, l } = toHsl(toRgb(hex));
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

const rgba = (hex: string, alpha: number) => `rgba(${toRgb(hex).join(", ")}, ${alpha})`;

/** A soft light with no visible edge: smooth stops, the hue kept even at alpha 0. */
function softLight(hex: string, alpha: number, position: string) {
  const stops = [
    [1, 0],
    [0.785, 22],
    [0.35, 43],
    [0.065, 61],
    [0, 72]
  ];
  return `radial-gradient(${position}, ${stops.map(([share, at]) => `${rgba(hex, Number((alpha * share).toFixed(3)))} ${at}%`).join(", ")})`;
}

/** The most of this colour that leaves `under` still passing the test. */
function fitAlpha(color: string, under: string, most: number, passes: (mixed: string) => boolean) {
  for (let alpha = most; alpha > 0; alpha -= 0.02) {
    if (passes(mix(color, under, alpha))) {
      return Number(alpha.toFixed(2));
    }
  }
  return 0;
}

/** The ink on the page in each theme: `--foreground` in globals.css, as hex. */
export const PAGE_INK: Record<ThemeMode, string> = { dark: "#f4f6fb", light: "#0f141f" };

/** The shades of Dusk and Dawn in globals.css, whose brightness every hue takes on. */
const SHADES = {
  dark: {
    sky: ["#283a8a", "#1e2b70", "#171f54", "#11163b", "#0e1230"],
    card: "#191c40",
    dock: "#22254e",
    well: "#191c38",
    secondary: "#272b49",
    muted: "#1d203a",
    border: "#252841",
    saturation: 0.6,
    corner: 0.34
  },
  light: {
    sky: ["#b2c0f0", "#ccd5f6", "#e3e6f9", "#eff0fa"],
    well: "#e7e7ef",
    secondary: "#e7e7ef",
    muted: "#ededf3",
    border: "#e2e2e9",
    saturation: 0.72,
    corner: 0.5
  }
} as const;

/** The page's whole set of tokens, from one colour. */
export function pageTokens(hex: string, mode: ThemeMode): ThemeTokens {
  const { h, s } = toHsl(toRgb(hex));
  const shades = SHADES[mode];
  const saturation = Math.min(s, shades.saturation);
  const shade = (like: string) => atBrightness(h, saturation, luminance(like));
  const stops = shades.sky.map(shade);
  const ground = stops[stops.length - 1];
  const neighbour = toHex(fromHsl((h + 28) % 360, Math.max(saturation, 0.1), mode === "dark" ? 0.62 : 0.74));
  const ink = PAGE_INK[mode];
  // The corner holds the most colour. Words pass over it in the head of a page.
  const cornerAlpha = fitAlpha(hex, stops[0], shades.corner, (mixed) => contrast(ink, mixed) >= 4.5 && contrast(mutedInk(h, mode), mixed) >= 3);
  const sky = (at: number[]) => stops.map((stop, index) => `${stop} ${at[index]}%`).join(", ");

  const tokens: ThemeTokens = {
    "--background": channels(ground),
    "--theme-color": ground,
    "--well": channels(shade(shades.well)),
    "--secondary": channels(shade(shades.secondary)),
    "--muted": channels(shade(shades.muted)),
    "--input": channels(shade(shades.secondary)),
    "--border": channels(shade(shades.border)),
    "--muted-foreground": channels(mutedInk(h, mode))
  };
  if (mode === "dark") {
    const card = shade(SHADES.dark.card);
    const dock = shade(SHADES.dark.dock);
    const tint = toHex(fromHsl(h, Math.max(saturation, 0.1), 0.85));
    return {
      ...tokens,
      "--sky": `radial-gradient(120% 52% at 78% -4%, ${rgba(hex, cornerAlpha)} 0%, ${rgba(hex, Number((cornerAlpha * 0.32).toFixed(3)))} 36%, ${rgba(hex, 0)} 62%), ${softLight(neighbour, 0.17, "85% 42% at 4% 30%")}, linear-gradient(180deg, ${sky([0, 24, 48, 72, 100])})`,
      "--app-glow": `${softLight(neighbour, 0.14, "78% 44% at 4% 100%")}, ${softLight(hex, 0.09, "72% 40% at 100% 62%")}`,
      "--surface": rgba(tint, 0.085),
      "--surface-edge": rgba(tint, 0.1),
      "--card": channels(card),
      "--popover": channels(card),
      "--chart-surface": channels(card),
      "--dock": dock,
      "--glass-fill": rgba(dock, 0.72),
      "--scrim": rgba(toHex(fromHsl(h, saturation, 0.05)), 0.55)
    };
  }
  const shadow = toHex(fromHsl(h, 0.45, 0.3));
  return {
    ...tokens,
    "--sky": `radial-gradient(120% 52% at 78% -6%, ${rgba(hex, cornerAlpha)} 0%, ${rgba(hex, Number((cornerAlpha * 0.33).toFixed(3)))} 36%, ${rgba(hex, 0)} 62%), ${softLight(neighbour, 0.22, "85% 42% at 4% 26%")}, linear-gradient(180deg, ${sky([0, 24, 50, 78])})`,
    "--app-glow": `${softLight(neighbour, 0.16, "78% 42% at 4% 100%")}, ${softLight(hex, 0.14, "72% 38% at 100% 64%")}`,
    "--field": toHex(fromHsl(h, 0.2, 0.95)),
    "--shadow-plaque": `inset 0 0 0 1px var(--surface-edge), 0 1px 2px ${rgba(shadow, 0.05)}, 0 10px 28px ${rgba(shadow, 0.09)}`
  };
}

function mutedInk(h: number, mode: ThemeMode) {
  // By brightness too: at one lightness, quiet words on a warm sky read worse than on a blue one.
  return mode === "dark" ? atBrightness(h, 0.26, 0.5) : atBrightness(h, 0.12, 0.06);
}

/**
 * The button's tokens. It moves only as far as it must to stand out from the
 * ground (3:1, for a thing you press), and its words take whichever of white or
 * near-black reads better. One of the two always clears 4.5:1.
 */
export function buttonTokens(hex: string, ground: string, mode: ThemeMode): ThemeTokens {
  const fitted = fitButton(hex, ground, mode);
  const words = contrast("#ffffff", fitted) >= contrast("#0b0d1a", fitted) ? "#ffffff" : "#0b0d1a";
  return { "--primary": channels(fitted), "--primary-foreground": channels(words) };
}

/** The colour a button lands on: the pick, or the nearest one that stands out. */
export function fitButton(hex: string, ground: string, mode: ThemeMode) {
  const { h, s, l } = toHsl(toRgb(hex));
  for (let step = 0; step <= 100; step += 1) {
    const lightness = mode === "dark" ? Math.min(1, l + step / 100) : Math.max(0, l - step / 100);
    const candidate = step === 0 ? hex : toHex(fromHsl(h, s, lightness));
    if (contrast(candidate, ground) >= 3) {
      return candidate;
    }
  }
  return hex;
}

/** The grounds of Dusk and Dawn, for a button when the page keeps its own colour. */
const DEFAULT_GROUND: Record<ThemeMode, string> = { dark: "#0e1230", light: "#eff0fa" };

/** Both themes' tokens for these picks. */
export function buildThemeColors(picks: ThemePicks): StoredThemeColors {
  const tokensFor = (mode: ThemeMode): ThemeTokens => {
    const page = picks.page ? pageTokens(picks.page, mode) : {};
    const ground = page["--theme-color"] ?? DEFAULT_GROUND[mode];
    return { ...page, ...(picks.button ? buttonTokens(picks.button, ground, mode) : {}), ...fontTokens(picks) };
  };
  return { picks, dark: tokensFor("dark"), light: tokensFor("light") };
}

export function readThemeColors(): StoredThemeColors | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(THEME_COLORS_KEY) ?? "null") as StoredThemeColors | null;
    return stored?.dark && stored.light ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** Remember these picks on this phone, or forget them when there are none. */
export function saveThemeColors(picks: ThemePicks) {
  try {
    if (picks.page || picks.button || picks.textFont || picks.headingFont) {
      localStorage.setItem(THEME_COLORS_KEY, JSON.stringify(buildThemeColors(picks)));
    } else {
      localStorage.removeItem(THEME_COLORS_KEY);
    }
  } catch {
    // The colours still apply for this session; they just will not be remembered.
  }
}

/** Every token a set can hold, so that going back to the default clears them all. */
const EVERY_PICK: ThemePicks = { page: "#3b5bdb", button: "#3b5bdb", textFont: "inter", headingFont: "serif" };
const ALL_TOKENS = Object.keys({ ...buildThemeColors(EVERY_PICK).dark, ...buildThemeColors(EVERY_PICK).light });

/** Write this theme's tokens onto <html>, over the ones in globals.css. */
export function applyThemeTokens(tokens: ThemeTokens | undefined) {
  const { style } = document.documentElement;
  ALL_TOKENS.forEach((name) => style.removeProperty(name));
  Object.entries(tokens ?? {}).forEach(([name, value]) => style.setProperty(name, value));
}
