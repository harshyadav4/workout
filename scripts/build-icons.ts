/**
 * Draw the app's mark and every image made from it: the home-screen icons, the
 * favicon and the iPhone launch screens in public/.
 *
 *   npx tsx scripts/build-icons.ts          draw them all, then check them
 *   npx tsx scripts/build-icons.ts --check  only check
 *
 * The mark is a half sun on the horizon with a thin warm arc over it, in the
 * dusk sky. When the palette moves, change COLORS, run this once, and copy
 * the new values into app/opengraph-image.tsx. The check fails until all three
 * agree with globals.css.
 *
 * sharp is not a dependency of ours: Next brings it in.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

import { SPLASH_IMAGES } from "../lib/splash";
import { THEME_COLORS } from "../lib/theme";

const COLORS = {
  /** `--background` in dark. The launch screen's ground has to be exactly this. */
  ground: THEME_COLORS.dark,
  /** The land under the sky on a tile: a stop of `--sky`, so it holds its edge on a black wallpaper. */
  land: "#11163b",
  /** Three more stops of `--sky`, turned over: a real dawn is lightest at the horizon. */
  skyTop: "#171f54",
  skyMiddle: "#1e2b70",
  skyHorizon: "#283a8a",
  /** `--l1`, `--l2`, `--l3`: the arc, faint to full. */
  light1: "#ffe4c9",
  light2: "#ffb68c",
  light3: "#ff9078",
  /** `--sun`: the top of the half sun. */
  sun: "#fff2e6"
} as const;

interface Mark {
  horizon: number;
  arcRadius: number;
  arcWidth: number;
  sunRadius: number;
}

/** The mark on a 512 square. */
const MARK: Mark = { horizon: 372, arcRadius: 168, arcWidth: 16, sunRadius: 72 };

/** The same, drawn again for a 64 square: a heavier line, or it is gone at tab size. */
const FAVICON_MARK: Mark = { horizon: 46, arcRadius: 23, arcWidth: 4.5, sunRadius: 11 };

/** Android may crop a maskable icon to any shape inside this circle of its width. */
const MASKABLE_SAFE_RADIUS = 0.4;
/** Takes the feet of the arc well inside that circle. */
const MASKABLE_SCALE = 0.84;

/** The mark's width on a launch screen, as a share of the screen's. */
const SPLASH_MARK_WIDTH = 0.36;

const FULL_BLEED_ICONS: Array<{ file: string; size: number; mark: Mark }> = [
  { file: "icon-192.png", size: 192, mark: MARK },
  { file: "icon-512.png", size: 512, mark: MARK },
  { file: "apple-touch-icon.png", size: 180, mark: MARK },
  { file: "icon-maskable-512.png", size: 512, mark: aroundCentre(MARK, MASKABLE_SCALE) }
];

const FAVICON = { file: "favicon-64.png", size: 64, corner: 14 };

const publicPath = (file: string) => resolve(process.cwd(), "public", file.replace(/^\//, ""));

/** Shrink a mark toward the middle of the 512 square. */
function aroundCentre(mark: Mark, scale: number): Mark {
  return {
    horizon: 256 + (mark.horizon - 256) * scale,
    arcRadius: mark.arcRadius * scale,
    arcWidth: mark.arcWidth * scale,
    sunRadius: mark.sunRadius * scale
  };
}

/** The half sun and the arc, standing on the horizon. Both end flat on it. */
function drawMark({ horizon, arcRadius, arcWidth, sunRadius }: Mark, centreX: number) {
  const left = centreX - arcRadius;
  const right = centreX + arcRadius;
  return `
    <defs>
      <linearGradient id="arc" gradientUnits="userSpaceOnUse" x1="${left}" y1="0" x2="${right}" y2="0">
        <stop offset="0" stop-color="${COLORS.light1}"/>
        <stop offset="0.6" stop-color="${COLORS.light2}"/>
        <stop offset="1" stop-color="${COLORS.light3}"/>
      </linearGradient>
      <linearGradient id="sun" gradientUnits="userSpaceOnUse" x1="0" y1="${horizon - sunRadius}" x2="0" y2="${horizon}">
        <stop offset="0" stop-color="${COLORS.sun}"/>
        <stop offset="0.55" stop-color="${COLORS.light1}"/>
        <stop offset="1" stop-color="${COLORS.light2}"/>
      </linearGradient>
    </defs>
    <path d="M${centreX - sunRadius} ${horizon} A${sunRadius} ${sunRadius} 0 0 1 ${centreX + sunRadius} ${horizon}Z" fill="url(#sun)"/>
    <path d="M${left} ${horizon} A${arcRadius} ${arcRadius} 0 0 1 ${right} ${horizon}" fill="none" stroke="url(#arc)" stroke-width="${arcWidth}"/>`;
}

/** Sky down to the horizon, land below it, the mark on the line. */
function drawScene(mark: Mark, side: number) {
  return `
    <defs>
      <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${mark.horizon}">
        <stop offset="0" stop-color="${COLORS.skyTop}"/>
        <stop offset="0.6" stop-color="${COLORS.skyMiddle}"/>
        <stop offset="1" stop-color="${COLORS.skyHorizon}"/>
      </linearGradient>
    </defs>
    <rect width="${side}" height="${side}" fill="${COLORS.land}"/>
    <rect width="${side}" height="${mark.horizon}" fill="url(#sky)"/>
    ${drawMark(mark, side / 2)}`;
}

function svg(body: string, width: number, height: number, viewBox = `0 0 ${width} ${height}`) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`);
}

function splashSize(url: string) {
  const match = url.match(/splash-(\d+)x(\d+)\.png$/);
  if (!match) throw new Error(`No size in the splash name ${url}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** The mark alone on the flat ground, so the first frame of the app takes over without an edge. */
function drawSplash(width: number, height: number) {
  const fullWidth = MARK.arcRadius * 2 + MARK.arcWidth;
  const scale = (width * SPLASH_MARK_WIDTH) / fullWidth;
  const markHeight = (MARK.arcRadius + MARK.arcWidth / 2) * scale;
  const mark: Mark = {
    horizon: (height + markHeight) / 2,
    arcRadius: MARK.arcRadius * scale,
    arcWidth: MARK.arcWidth * scale,
    sunRadius: MARK.sunRadius * scale
  };
  return `<rect width="${width}" height="${height}" fill="${COLORS.ground}"/>${drawMark(mark, width / 2)}`;
}

async function build() {
  for (const { file, size, mark } of FULL_BLEED_ICONS) {
    await sharp(svg(drawScene(mark, 512), size, size, "0 0 512 512"))
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(publicPath(file));
  }

  const rounded = `<clipPath id="tile"><rect width="${FAVICON.size}" height="${FAVICON.size}" rx="${FAVICON.corner}"/></clipPath>
    <g clip-path="url(#tile)">${drawScene(FAVICON_MARK, FAVICON.size)}</g>`;
  await sharp(svg(rounded, FAVICON.size, FAVICON.size)).png({ compressionLevel: 9 }).toFile(publicPath(FAVICON.file));

  for (const { url } of SPLASH_IMAGES) {
    const { width, height } = splashSize(url);
    await sharp(svg(drawSplash(width, height), width, height))
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(publicPath(url));
  }
}

const rgb = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

async function check() {
  const failures: string[] = [];
  const must = (ok: boolean, message: string) => {
    if (!ok) failures.push(message);
  };

  // Exact sizes, and no alpha on anything a phone shows full-bleed.
  for (const { file, size } of [...FULL_BLEED_ICONS, FAVICON]) {
    const { width, height, format, hasAlpha } = await sharp(publicPath(file)).metadata();
    must(format === "png", `${file} is not a PNG`);
    must(width === size && height === size, `${file} is ${width}x${height}, not ${size}x${size}`);
    if (file !== FAVICON.file) must(!hasAlpha, `${file} has an alpha channel`);
  }

  // The maskable icon: nothing warm outside the safe circle.
  const maskable = await sharp(publicPath("icon-maskable-512.png")).raw().toBuffer({ resolveWithObject: true });
  const { width: side, channels } = maskable.info;
  let outside = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const red = maskable.data[(y * side + x) * channels];
      if (red > 60 && Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2) > side * MASKABLE_SAFE_RADIUS) outside++;
    }
  }
  must(outside === 0, `icon-maskable-512.png has ${outside} warm pixels outside the safe zone`);

  // Launch screens: the listed files exist, at their size, on the exact ground, with the mark centred.
  const ground = rgb(COLORS.ground);
  for (const { url } of SPLASH_IMAGES) {
    if (!existsSync(publicPath(url))) {
      must(false, `lib/splash.ts lists ${url}, which does not exist`);
      continue;
    }
    const { width, height } = splashSize(url);
    const { data, info } = await sharp(publicPath(url)).raw().toBuffer({ resolveWithObject: true });
    must(info.width === width && info.height === height, `${url} is ${info.width}x${info.height}`);
    must(info.channels === 3, `${url} has an alpha channel`);
    let [left, right, top, bottom] = [width, 0, height, 0];
    let offGroundEdge = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * info.channels;
        if (data[at] === ground[0] && data[at + 1] === ground[1] && data[at + 2] === ground[2]) continue;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) offGroundEdge++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    must(offGroundEdge === 0, `${url} has ${offGroundEdge} edge pixels off the ground colour`);
    must(Math.abs(left + right + 1 - width) <= 2, `${url}: the mark is off centre sideways`);
    must(Math.abs(top + bottom + 1 - height) <= 2, `${url}: the mark is off centre up and down`);
  }

  // The manifest lists only files that exist, at the size it says.
  const manifest = JSON.parse(readFileSync(publicPath("manifest.webmanifest"), "utf8"));
  must(manifest.theme_color === COLORS.ground, "manifest theme_color is not the ground");
  must(manifest.background_color === COLORS.ground, "manifest background_color is not the ground");
  const listed: Array<{ src: string; sizes: string }> = [
    ...manifest.icons,
    ...manifest.shortcuts.flatMap((shortcut: { icons: unknown[] }) => shortcut.icons),
    ...manifest.screenshots
  ];
  for (const { src, sizes } of listed) {
    if (!existsSync(publicPath(src))) {
      must(false, `The manifest lists ${src}, which does not exist`);
      continue;
    }
    const { width, height } = await sharp(publicPath(src)).metadata();
    must(sizes === `${width}x${height}`, `The manifest says ${src} is ${sizes}; it is ${width}x${height}`);
  }

  // The palette still agrees with the app, and the share card with this file.
  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  const token = (name: string) => root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].toLowerCase() ?? "";
  must(token("l1") === COLORS.light1, `--l1 is ${token("l1")}, COLORS says ${COLORS.light1}`);
  must(token("l2") === COLORS.light2, `--l2 is ${token("l2")}, COLORS says ${COLORS.light2}`);
  must(token("l3") === COLORS.light3, `--l3 is ${token("l3")}, COLORS says ${COLORS.light3}`);
  must(token("sun") === COLORS.sun, `--sun is ${token("sun")}, COLORS says ${COLORS.sun}`);
  for (const stop of [COLORS.land, COLORS.skyTop, COLORS.skyMiddle, COLORS.skyHorizon]) {
    must(token("sky").includes(stop), `${stop} is no longer a stop of --sky`);
  }
  const card = readFileSync(resolve(process.cwd(), "app/opengraph-image.tsx"), "utf8");
  for (const [name, color] of Object.entries(COLORS)) {
    if (name !== "ground") must(card.includes(color), `app/opengraph-image.tsx does not use ${color}`);
  }

  if (failures.length > 0) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
    process.exit(1);
  }
  console.log(`OK ${FULL_BLEED_ICONS.length + 1} icons, ${SPLASH_IMAGES.length} launch screens, ${listed.length} manifest entries`);
}

async function main() {
  if (!process.argv.includes("--check")) await build();
  await check();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
