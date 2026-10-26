import { ImageResponse } from "next/og";

import { OG_ALT, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * The card a link shows in chats and social apps. Every page inherits it.
 * Drawn here, so it never goes stale against a screenshot. No custom font:
 * next/og falls back to its own built-in one, which keeps the build offline.
 */
export const alt = OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0E0F12";
const BRAND = "#3EC5FF";
const VIOLET = "#A374F7";
const GREEN = "#4ADE80";

/**
 * Three progress rings, like Strength, Consistency and Muscles on Progress.
 * Plain circles in a list: Satori does not draw a component or a fragment
 * inside <svg>.
 */
const RINGS = [
  { r: 140, color: BRAND, share: 0.78 },
  { r: 108, color: VIOLET, share: 0.62 },
  { r: 76, color: GREEN, share: 0.88 }
].flatMap(({ r, color, share }) => {
  const length = 2 * Math.PI * r;
  return [
    <circle key={`t${r}`} cx="160" cy="160" r={r} fill="none" stroke="#24262C" strokeWidth="22" />,
    <circle
      key={`a${r}`}
      cx="160"
      cy="160"
      r={r}
      fill="none"
      stroke={color}
      strokeWidth="22"
      strokeLinecap="round"
      strokeDasharray={`${length * share} ${length}`}
      transform="rotate(-90 160 160)"
    />
  ];
});

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 88px",
          background: BG,
          backgroundImage: `radial-gradient(circle at 78% 50%, rgba(62,197,255,0.18), transparent 55%)`,
          color: "#F4F5F7"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 680 }}>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }}>
            {SITE_NAME}
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 44, lineHeight: 1.15, color: "#F4F5F7" }}>
            {SITE_TAGLINE}
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 28, color: "#9AA0AB" }}>
            Log sets. See muscles worked. Works offline.
          </div>
          <div style={{ display: "flex", marginTop: 40, fontSize: 26, color: BRAND }}>
            Free · No sign-up · Installs as an app
          </div>
        </div>
        <svg width="320" height="320" viewBox="0 0 320 320">
          {RINGS}
        </svg>
      </div>
    ),
    size
  );
}
