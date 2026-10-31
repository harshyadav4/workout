// Run with: npm run check
import assert from "node:assert/strict";

import {
  buildThemeColors,
  buttonTokens,
  HEADING_FONTS,
  TEXT_FONTS,
  contrast,
  fitButton,
  isHexColor,
  mix,
  PAGE_INK,
  pageTokens,
  type ThemeMode
} from "@/lib/theme-custom";

const MODES: ThemeMode[] = ["dark", "light"];

/** Every hue at a few strengths, plus the corners a picker can reach. */
const PICKS: string[] = ["#000000", "#ffffff", "#808080", "#ff5f00", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff0000"];
for (let hue = 0; hue < 360; hue += 15) {
  for (const [s, l] of [[1, 0.5], [0.5, 0.3], [0.5, 0.8], [0.12, 0.5]]) {
    const a = s * Math.min(l, 1 - l);
    const channel = (n: number) => {
      const k = (n + hue / 30) % 12;
      return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, "0");
    };
    PICKS.push(`#${channel(0)}${channel(8)}${channel(4)}`);
  }
}

/** A token's "H S% L%" back to hex, by way of the page's own arithmetic. */
function hexOf(channels: string) {
  const [h, s, l] = channels.split(" ").map((part) => parseFloat(part));
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const skyStops = (sky: string) => sky.slice(sky.lastIndexOf("linear-gradient")).match(/#[0-9a-f]{6}/g) ?? [];

for (const pick of PICKS) {
  assert.ok(isHexColor(pick), pick);
  for (const mode of MODES) {
    const tokens = pageTokens(pick, mode);
    const ink = PAGE_INK[mode];
    const muted = hexOf(tokens["--muted-foreground"]);
    const ground = tokens["--theme-color"];
    const stops = skyStops(tokens["--sky"]);
    assert.ok(stops.length >= 4, `${pick} ${mode}: the sky has its stops`);
    assert.equal(stops[stops.length - 1], ground, `${pick} ${mode}: the sky ends on the ground, so no line shows`);
    assert.ok(hexOf(tokens["--background"]) !== undefined);

    for (const stop of stops) {
      assert.ok(contrast(ink, stop) >= 4.5, `${pick} ${mode}: words on the sky ${stop}: ${contrast(ink, stop)}`);
      assert.ok(contrast(muted, stop) >= 4.5, `${pick} ${mode}: quiet words on the sky ${stop}: ${contrast(muted, stop)}`);
    }

    // The corner: words in the head of a page pass over it.
    const alpha = Number(tokens["--sky"].match(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/)?.[1]);
    const corner = mix(pick, stops[0] as string, alpha);
    assert.ok(contrast(ink, corner) >= 4.5, `${pick} ${mode}: words on the corner: ${contrast(ink, corner)}`);

    // A floating surface in the dark theme is solid.
    if (mode === "dark") {
      const card = hexOf(tokens["--card"]);
      assert.ok(contrast(ink, card) >= 4.5, `${pick}: words on a card`);
      assert.ok(contrast(muted, card) >= 4.5, `${pick}: quiet words on a card: ${contrast(muted, card)}`);
    }

    // The button, on this page and on the default page.
    for (const under of [ground, mode === "dark" ? "#0e1230" : "#eff0fa"]) {
      const fitted = fitButton(pick, under, mode);
      assert.ok(contrast(fitted, under) >= 2.99, `${pick} ${mode}: the button stands out on ${under}: ${contrast(fitted, under)}`);
      const button = buttonTokens(pick, under, mode);
      assert.ok(
        contrast(hexOf(button["--primary"]), hexOf(button["--primary-foreground"])) >= 4.4,
        `${pick} ${mode}: words on the button`
      );
    }
  }
}

// A colour that already stands out is not touched.
assert.equal(fitButton("#ff5f00", "#0e1230", "dark"), "#ff5f00");

// Words on a pale button go dark; words on a deep one go white.
assert.equal(hexOf(buttonTokens("#facc15", "#0e1230", "dark")["--primary-foreground"]), "#0b0d1a");
assert.equal(hexOf(buttonTokens("#3730a3", "#eff0fa", "light")["--primary-foreground"]), "#ffffff");

// One pick does not touch the other's tokens.
{
  const buttonOnly = buildThemeColors({ button: "#ff5f00" });
  assert.equal(buttonOnly.dark["--sky"], undefined);
  assert.equal(buttonOnly.dark["--background"], undefined);
  assert.ok(buttonOnly.dark["--primary"]);
  const pageOnly = buildThemeColors({ page: "#ff5f00" });
  assert.equal(pageOnly.dark["--primary"], undefined);
  assert.ok(pageOnly.dark["--sky"]);
  assert.deepEqual(buildThemeColors({}).dark, {});
}

// Progress, the muscle map and status colours stay out of it.
for (const tokens of [pageTokens("#ff5f00", "dark"), pageTokens("#ff5f00", "light")]) {
  for (const name of Object.keys(tokens)) {
    assert.ok(!/^--(s-|l[123]$|sun$|heat|map|success|warning|danger|brand|foreground)/.test(name), name);
  }
}

// A font pick touches only fonts, in both themes, and a default pick touches nothing.
{
  const fonts = buildThemeColors({ textFont: "inter", headingFont: "tight" });
  assert.equal(fonts.dark["--font-sans"], "var(--font-inter)");
  assert.equal(fonts.light["--font-heading"], "var(--font-inter-tight)");
  assert.equal(fonts.dark["--heading-weight"], "600");
  assert.equal(fonts.dark["--sky"], undefined);
  assert.equal(fonts.dark["--primary"], undefined);
  assert.deepEqual(buildThemeColors({ textFont: "gone", headingFont: "gone" }).dark, {}, "a font that no longer exists is ignored");
  for (const font of [...Object.values(TEXT_FONTS), ...Object.values(HEADING_FONTS)]) {
    assert.ok(font.variable.startsWith("--font-"), font.name);
  }
}

console.log("theme-custom ok");
