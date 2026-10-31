import {
  Barlow_Semi_Condensed,
  DM_Serif_Display,
  Figtree,
  Fraunces,
  Instrument_Sans,
  Instrument_Serif,
  Inter,
  Inter_Tight,
  Manrope,
  Outfit,
  Plus_Jakarta_Sans
} from "next/font/google";

/**
 * Every font the app can wear. Only the two defaults are preloaded: a browser
 * fetches a face the first time something on screen uses it, so an unused choice
 * costs one line of CSS. globals.css names the defaults as `--font-sans` and
 * `--font-heading`, and lib/theme-custom writes another variable over either.
 */

// Everything you read is set in this. Numbers get `tabular-nums` so a stepper
// does not jitter as it runs.
const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });

// A screen's few large words: a greeting, the session's name, a sheet's title.
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

// Text choices. latin-ext is what holds the rupee sign.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap", preload: false });
const figtree = Figtree({ subsets: ["latin", "latin-ext"], variable: "--font-figtree", display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-manrope", display: "swap", preload: false });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-jakarta", display: "swap", preload: false });

// Heading choices.
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument-serif", display: "swap", preload: false });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-dm-serif", display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", preload: false });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", preload: false });
const barlow = Barlow_Semi_Condensed({ subsets: ["latin"], weight: "600", variable: "--font-barlow", display: "swap", preload: false });

/** The classes that declare them all. They must sit on <html>: Tailwind sets the font there. */
export const FONT_VARIABLES = [
  instrumentSans,
  outfit,
  inter,
  figtree,
  manrope,
  jakarta,
  instrumentSerif,
  dmSerif,
  fraunces,
  interTight,
  barlow
]
  .map((font) => font.variable)
  .join(" ");
