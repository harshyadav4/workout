/**
 * iPhone launch screens for the home-screen app (`appleWebApp.startupImage`).
 * iOS shows one only when its media query matches the phone exactly, so each
 * size names its CSS width, height and pixel ratio. Portrait only: the app is.
 *
 * The PNGs in public/splash are the app's mark centred on the dark ground
 * (#0E1230, `THEME_COLORS.dark`). `npx tsx scripts/build-icons.ts` draws them.
 */

// [CSS width, CSS height, pixel ratio]
const SIZES: Array<[number, number, number]> = [
  [430, 932, 3], // 1290×2796 — 14/15/16 Pro Max, 15/16 Plus
  [393, 852, 3], // 1179×2556 — 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 1284×2778 — 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 1170×2532 — 12, 12 Pro, 13, 13 Pro, 14
  [375, 812, 3], // 1125×2436 — X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // 1242×2688 — XS Max, 11 Pro Max
  [414, 896, 2], // 828×1792 — XR, 11
  [375, 667, 2], // 750×1334 — 6/7/8, SE (2nd/3rd)
  [320, 568, 2] // 640×1136 — 5, SE (1st)
];

export const SPLASH_IMAGES = SIZES.map(([width, height, ratio]) => ({
  url: `/splash/splash-${width * ratio}x${height * ratio}.png`,
  media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`
}));
