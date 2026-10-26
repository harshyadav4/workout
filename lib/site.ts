/**
 * The public face of the app: its address, name and the words search engines
 * and AI answer engines read. One place, so the metadata, the /about page,
 * robots.txt, the sitemap and the social card all say the same thing.
 */

/**
 * The address the site lives at, without a trailing slash.
 * 1. NEXT_PUBLIC_SITE_URL, when you set one (a custom domain).
 * 2. Vercel's production domain, which Vercel sets on every deploy.
 * 3. The current live address.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://workout-one-pearl.vercel.app")
).replace(/\/+$/, "");

export const SITE_NAME = "Arise";

/** Short. Fits under the name on the social card. */
export const SITE_TAGLINE = "Free workout tracker with a muscle map";

/** The social card's alt text (app/opengraph-image.tsx). */
export const OG_ALT = `${SITE_NAME}: ${SITE_TAGLINE}. Log sets, see muscles worked, track records.`;

/** The search-result description. About 150 characters, keywords in plain words. */
export const SITE_DESCRIPTION =
  "Arise is a free workout tracker and gym log app. Log sets in one tap, see the muscles you work on a body map, and import an AI workout plan. No sign-up needed.";

export const SITE_KEYWORDS = [
  "free workout tracker",
  "gym log app",
  "workout log",
  "muscle map workout app",
  "see muscles worked",
  "AI workout plan",
  "ChatGPT workout plan",
  "workout app no sign up",
  "offline gym tracker",
  "workout tracker PWA"
];

/** An absolute URL for a path on this site. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
