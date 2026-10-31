"use client";

import { Check, Moon, Route, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ListSheetRow, ListSwitch, SheetDone } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { setDetailedTiming, useDetailedTiming } from "@/features/workout/use-detailed-timing";
import { setDistanceUnit, useDistanceUnit } from "@/features/workout/use-distance-unit";
import { applyTheme, isTheme, THEME_KEY, type Theme } from "@/lib/theme";
import {
  buildThemeColors,
  fitButton,
  HEADING_FONTS,
  isHexColor,
  readThemeColors,
  saveThemeColors,
  TEXT_FONTS,
  type ThemePicks
} from "@/lib/theme-custom";
import { cn } from "@/lib/utils";

/**
 * What the themes are called on screen. "Dusk" and "Dawn" read as product
 * names; Dark and Light are the words every phone's settings already use.
 */
const SKIN_LABELS: Record<Theme, string> = {
  system: "Auto",
  dark: "Dark",
  light: "Light"
};

/** Ready-made colours. The first choice in each list is the default, with no colour of its own. */
const PAGE_COLORS = [
  { name: "Ocean", hex: "#2f6fde" },
  { name: "Teal", hex: "#0f9f94" },
  { name: "Forest", hex: "#2e9e5b" },
  { name: "Ember", hex: "#ff5f00" },
  { name: "Rose", hex: "#e0457b" },
  { name: "Plum", hex: "#8b4fd6" },
  { name: "Graphite", hex: "#6b7280" }
];

const BUTTON_COLORS = [
  { name: "Orange", hex: "#ff5f00" },
  { name: "Yellow", hex: "#facc15" },
  { name: "Green", hex: "#22c55e" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Pink", hex: "#ec4899" }
];

const SWATCH = "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full";
const SWATCH_DOT = "h-8 w-8 rounded-full shadow-[inset_0_0_0_1px_var(--sep)]";
const SWATCH_ON = "ring-2 ring-inset ring-foreground";

/**
 * One row of colours: the default, the ready-made ones, and any colour at all.
 * The free one is the phone's own colour picker, laid invisibly over its swatch,
 * because iPhone only opens it when the tap lands on the input itself.
 */
function ColourChoice({
  title,
  defaultName,
  defaultDot,
  colors,
  value,
  note,
  onChange
}: {
  title: string;
  defaultName: string;
  defaultDot: string;
  colors: { name: string; hex: string }[];
  value?: string;
  note?: string;
  onChange: (hex?: string) => void;
}) {
  const custom = value !== undefined && !colors.some((color) => color.hex === value);
  return (
    <div className="mt-5">
      <p className="px-1 text-[13.5px] font-semibold text-muted-foreground">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-0.5" role="group" aria-label={title}>
        <button
          type="button"
          aria-label={defaultName}
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
          className={cn(SWATCH, value === undefined && SWATCH_ON)}
        >
          <span aria-hidden className={SWATCH_DOT} style={{ background: defaultDot }} />
        </button>
        {colors.map((color) => (
          <button
            key={color.hex}
            type="button"
            aria-label={color.name}
            aria-pressed={value === color.hex}
            onClick={() => onChange(color.hex)}
            className={cn(SWATCH, value === color.hex && SWATCH_ON)}
          >
            <span aria-hidden className={SWATCH_DOT} style={{ background: color.hex }} />
          </button>
        ))}
        <label className={cn(SWATCH, "cursor-pointer focus-within:ring-2 focus-within:ring-ring", custom && SWATCH_ON)}>
          <span
            aria-hidden
            className={cn(SWATCH_DOT, "flex items-center justify-center")}
            style={{ background: custom ? value : "conic-gradient(#ff5f00, #facc15, #22c55e, #2f6fde, #8b4fd6, #e0457b, #ff5f00)" }}
          >
            {custom ? <Check className="h-4 w-4 text-white mix-blend-difference" /> : null}
          </span>
          <input
            type="color"
            aria-label={`${title}: any colour`}
            value={value ?? "#3b82f6"}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      {note ? <p className="mt-1.5 px-1 text-[13px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** One row of fonts, each named in itself. Opening the sheet is what fetches them. */
function FontChoice({
  title,
  defaultName,
  defaultVariable,
  fonts,
  value,
  onChange
}: {
  title: string;
  defaultName: string;
  defaultVariable: string;
  fonts: Record<string, { name: string; variable: string; weight?: string }>;
  value?: string;
  onChange: (id?: string) => void;
}) {
  const options = [
    { id: undefined, name: defaultName, variable: defaultVariable, weight: undefined as string | undefined },
    ...Object.entries(fonts).map(([id, font]) => ({ id, name: font.name, variable: font.variable, weight: font.weight }))
  ];
  return (
    <div className="mt-5">
      <p className="px-1 text-[13.5px] font-semibold text-muted-foreground">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={title}>
        {options.map((option) => (
          <button
            key={option.name}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            style={{ fontFamily: `var(${option.variable})`, fontWeight: option.weight }}
            className={cn("h-11 rounded-full px-4 text-[15px]", value === option.id ? "key" : "key-quiet")}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Read after mount, never during render. The server has no `localStorage`, so
 * reading it in the initial state would make the first client render disagree
 * with the HTML and React would throw a hydration mismatch. The pre-paint script
 * in the document head is what stops that gap being visible.
 */
export function ThemeRow() {
  const [theme, setTheme] = useState<Theme>("system");
  const [picks, setPicks] = useState<ThemePicks>({});
  const frame = useRef(0);

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
    const saved = readThemeColors()?.picks;
    if (saved) {
      setPicks({
        page: isHexColor(saved.page) ? saved.page : undefined,
        button: isHexColor(saved.button) ? saved.button : undefined,
        textFont: saved.textFont && TEXT_FONTS[saved.textFont] ? saved.textFont : undefined,
        headingFont: saved.headingFont && HEADING_FONTS[saved.headingFont] ? saved.headingFont : undefined
      });
    }
    return () => cancelAnimationFrame(frame.current);
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

  // The whole app repaints as a colour changes, so the phone's picker can drag
  // through colours at its own speed: one repaint a frame at most.
  const choosePicks = (next: ThemePicks) => {
    setPicks(next);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      saveThemeColors(next);
      applyTheme(theme);
    });
  };

  const custom = Boolean(picks.page || picks.button || picks.textFont || picks.headingFont);
  const dark = typeof document === "undefined" || !document.documentElement.classList.contains("light");
  const ground = buildThemeColors(picks)[dark ? "dark" : "light"]["--theme-color"] ?? (dark ? "#0e1230" : "#eff0fa");
  const moved = picks.button !== undefined && fitButton(picks.button, ground, dark ? "dark" : "light") !== picks.button;

  return (
    <ListSheetRow icon={Moon} label="Theme" value={custom ? `${SKIN_LABELS[theme]} · Custom` : SKIN_LABELS[theme]}>
      <Segmented
        aria-label="Theme"
        options={(Object.keys(SKIN_LABELS) as Theme[]).map((option) => ({ id: option, label: SKIN_LABELS[option] }))}
        value={theme}
        onChange={choose}
      />
      <ColourChoice
        title="Background"
        defaultName="Dusk"
        defaultDot="linear-gradient(160deg, #283a8a, #7c60e0)"
        colors={PAGE_COLORS}
        value={picks.page}
        onChange={(page) => choosePicks({ ...picks, page })}
      />
      <ColourChoice
        title="Main button"
        defaultName={dark ? "White" : "Black"}
        defaultDot={dark ? "#f4f6fb" : "#0f141f"}
        colors={BUTTON_COLORS}
        value={picks.button}
        note={moved ? "Changed a little so it stays easy to see." : undefined}
        onChange={(button) => choosePicks({ ...picks, button })}
      />
      <FontChoice
        title="Heading font"
        defaultName="Outfit"
        defaultVariable="--font-outfit"
        fonts={HEADING_FONTS}
        value={picks.headingFont}
        onChange={(headingFont) => choosePicks({ ...picks, headingFont })}
      />
      <FontChoice
        title="Text font"
        defaultName="Instrument"
        defaultVariable="--font-instrument-sans"
        fonts={TEXT_FONTS}
        value={picks.textFont}
        onChange={(textFont) => choosePicks({ ...picks, textFont })}
      />
      <SheetDone />
      {custom ? (
        <button
          type="button"
          onClick={() => choosePicks({})}
          className="mt-2 h-11 w-full rounded-full text-sm font-medium text-muted-foreground active:bg-hi"
        >
          Back to defaults
        </button>
      ) : null}
    </ListSheetRow>
  );
}

/** km or miles for every run on this device. Stored runs are always km. */
export function DistanceRow() {
  const unit = useDistanceUnit();
  return (
    <ListSheetRow icon={Route} label="Distance" value={unit === "mi" ? "Miles" : "Kilometres"}>
      <Segmented
        aria-label="Distance unit"
        options={[
          { id: "km", label: "Kilometres" },
          { id: "mi", label: "Miles" }
        ]}
        value={unit}
        onChange={setDistanceUnit}
      />
      <SheetDone />
    </ListSheetRow>
  );
}

/** Per workout and per set times on the finish card and in the Plan. Always recorded; this shows them. */
export function DetailedTimingRow() {
  const on = useDetailedTiming();
  return (
    <ListSwitch
      icon={Timer}
      label="Detailed timing"
      hint="Shows the time for each exercise and set."
      on={on}
      onToggle={() => setDetailedTiming(!on)}
    />
  );
}
