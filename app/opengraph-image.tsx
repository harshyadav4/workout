import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { OG_ALT, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * The card a link shows in chats and social apps. Every page inherits it.
 * Drawn here, so it never goes stale against a screenshot. The font is a file in
 * the repo (app/fonts, SIL OFL), which keeps the build offline: next/og reads
 * TTF or OTF, and passing it one font replaces its built-in one, so all the words
 * are in the serif.
 */
export const alt = OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The icon's scene, wider. The colours are COLORS in scripts/build-icons.ts,
 * written out because this cannot read CSS variables; that script's check fails
 * when they disagree.
 */
const LAND = "#11163b";
const SKY_TOP = "#171f54";
const SKY_MIDDLE = "#1e2b70";
const SKY_HORIZON = "#283a8a";
const LIGHT_1 = "#ffe4c9";
const LIGHT_2 = "#ffb68c";
const LIGHT_3 = "#ff9078";
const SUN = "#fff2e6";
const INK = "#f4f6fb";
const QUIET = "#a1a8b4";

const HORIZON = 472;
const CENTRE = 866;
const ARC_RADIUS = 246;
const ARC_WIDTH = 20;
const SUN_RADIUS = 105;

export default async function OpengraphImage() {
  const heading = await readFile(join(process.cwd(), "app/fonts/Outfit-Medium.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: LAND,
          fontFamily: "Outfit",
          color: INK
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", top: 0, left: 0 }}>
          <defs>
            <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={HORIZON}>
              <stop offset="0" stopColor={SKY_TOP} />
              <stop offset="0.6" stopColor={SKY_MIDDLE} />
              <stop offset="1" stopColor={SKY_HORIZON} />
            </linearGradient>
            <linearGradient
              id="arc"
              gradientUnits="userSpaceOnUse"
              x1={CENTRE - ARC_RADIUS}
              y1="0"
              x2={CENTRE + ARC_RADIUS}
              y2="0"
            >
              <stop offset="0" stopColor={LIGHT_1} />
              <stop offset="0.6" stopColor={LIGHT_2} />
              <stop offset="1" stopColor={LIGHT_3} />
            </linearGradient>
            <linearGradient id="sun" gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON - SUN_RADIUS} x2="0" y2={HORIZON}>
              <stop offset="0" stopColor={SUN} />
              <stop offset="0.55" stopColor={LIGHT_1} />
              <stop offset="1" stopColor={LIGHT_2} />
            </linearGradient>
          </defs>
          <rect width="1200" height={HORIZON} fill="url(#sky)" />
          <path
            d={`M${CENTRE - SUN_RADIUS} ${HORIZON} A${SUN_RADIUS} ${SUN_RADIUS} 0 0 1 ${CENTRE + SUN_RADIUS} ${HORIZON}Z`}
            fill="url(#sun)"
          />
          <path
            d={`M${CENTRE - ARC_RADIUS} ${HORIZON} A${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${CENTRE + ARC_RADIUS} ${HORIZON}`}
            fill="none"
            stroke="url(#arc)"
            strokeWidth={ARC_WIDTH}
          />
        </svg>
        {/* The width breaks the tagline after "tracker". */}
        <div style={{ position: "absolute", top: 96, left: 80, display: "flex", flexDirection: "column", width: 430 }}>
          <div style={{ display: "flex", fontSize: 156, letterSpacing: -2, lineHeight: 1 }}>{SITE_NAME}</div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 50, lineHeight: 1.12 }}>{SITE_TAGLINE}</div>
        </div>
        <div
          style={{ position: "absolute", top: 526, left: 80, display: "flex", fontSize: 34, color: QUIET, whiteSpace: "pre" }}
        >
          {"No sign-up   ·   Works offline   ·   Installs as an app"}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Outfit", data: heading, style: "normal", weight: 500 }]
    }
  );
}
