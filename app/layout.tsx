import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";

import "@/app/globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { TapFeedback } from "@/components/layout/tap-feedback";
import { RegisterServiceWorker } from "@/features/pwa/register-sw";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { THEME_BOOTSTRAP, THEME_COLORS } from "@/lib/theme";
import { SPLASH_IMAGES } from "@/lib/splash";

// Everything you read is set in this. Numbers get `tabular-nums` so a stepper
// does not jitter as it runs.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

// Everything you care about — the session's name, the weight on the bar, the
// number on the ring. The optical-size axis means the same file draws a big
// headline with tight joins and a small label with open ones.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz"],
  display: "swap"
});

export const metadata: Metadata = {
  // Relative URLs below (canonical, the social card from opengraph-image.tsx)
  // resolve against this. lib/site.ts says where it comes from.
  metadataBase: new URL(SITE_URL),
  // A page sets its own title and gets "Title · Arise".
  title: { default: `${SITE_NAME} · ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  // The image comes from app/opengraph-image.tsx; Next adds it on its own.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en",
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/"
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION
  },
  alternates: { canonical: "/" },
  // Next emits this string verbatim and does not resolve it against public/, so
  // it has to match the file on disk. It said "/manifest.json" and 404'd, which
  // silently cost the app its install prompt.
  manifest: "/manifest.webmanifest",
  // iOS ignores the manifest's icons for the home screen and reads
  // apple-touch-icon instead, so both are declared.
  icons: {
    icon: [
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" }
  },
  // iPhone: open full screen from the home screen, under the right name, with
  // the status bar drawn over the app's own dark top.
  appleWebApp: {
    capable: true,
    title: "Arise",
    statusBarStyle: "black-translucent",
    // The launch screen while the app opens, instead of a white flash.
    startupImage: SPLASH_IMAGES
  },
  applicationName: "Arise",
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  // One per palette: the browser picks by system setting; `applyTheme`
  // rewrites both when the user picks Dark or Light by hand.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light }
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: shrink the page above the keyboard instead of covering it.
  // iPhone ignores this; the sheets handle it there (components/ui/use-keyboard).
  interactiveWidget: "resizes-content"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No `dark` class: Graphite is the palette in `:root`, so it is what renders
    // if anything about the theme script fails. Only Paper is a class.
    //
    // suppressHydrationWarning: the bootstrap script below adds that class
    // before React loads, so on Paper the server HTML and the client disagree
    // about <html class>. That is the intended order of events, not a bug, and
    // the attribute stops React logging it as one on every page.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Before first paint, or the page flashes dark and snaps to light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${inter.variable} ${bricolage.variable}`}>
        <AppProviders>{children}</AppProviders>
        <RegisterServiceWorker />
        {/* Page views on Vercel (no cookies). Counts nothing in development. */}
        <Analytics />
        <TapFeedback />
      </body>
    </html>
  );
}
