/**
 * Where a visitor came from, by the short link they used: /r/<source>.
 *
 * Vercel's free plan shows Pages and Referrers but not UTM tags, and many apps
 * (WhatsApp, Instagram) hide the referrer. So each place gets its own path,
 * counted in the Pages panel, and the visitor lands on /about with the UTM
 * tags anyway — ready for a UTM report later, with no change.
 *
 * A fixed list: any other name counts as "other", so a typo or a made-up link
 * cannot fill the report with junk.
 */
export const SOURCES = {
  reddit: "social",
  instagram: "social",
  x: "social",
  facebook: "social",
  youtube: "video",
  whatsapp: "messaging",
  telegram: "messaging",
  email: "email",
  friends: "referral",
  qr: "offline",
  producthunt: "launch",
  share: "app-share"
} as const;

export type Source = keyof typeof SOURCES;

export const CAMPAIGN = "launch";

export function isSource(value: string): value is Source {
  return Object.hasOwn(SOURCES, value);
}

/** The landing address for a short link, with its UTM tags. */
export function landingPath(value: string): string {
  const source = isSource(value) ? value : "other";
  const medium = isSource(value) ? SOURCES[value] : "unknown";
  const params = new URLSearchParams({ utm_source: source, utm_medium: medium, utm_campaign: CAMPAIGN });
  return `/about?${params.toString()}`;
}
