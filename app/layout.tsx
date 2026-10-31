import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";

import "@/app/globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { TapFeedback } from "@/components/layout/tap-feedback";
import { RegisterServiceWorker } from "@/features/pwa/register-sw";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { FONT_VARIABLES } from "@/app/fonts";
import { THEME_BOOTSTRAP, THEME_COLORS } from "@/lib/theme";
import { SPLASH_IMAGES } from "@/lib/splash";

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
  // No pinch zoom, with `touch-action: pan-x pan-y` in globals.css for the
  // browsers that read that instead. iPhone honours this only in the
  // installed app; in Safari it zooms regardless. See the note in globals.css
  // on what it costs.
  maximumScale: 1,
  userScalable: false,
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
    // No `dark` class: Blue hour is the palette in `:root`, so it is what renders
    // if anything about the theme script fails. Only Dawn is a class.
    //
    // The font variables go here, not on <body>: Tailwind's base rule sets the
    // font on <html>, and a variable declared lower down is invisible to it.
    //
    // suppressHydrationWarning: the bootstrap script below adds that class
    // before React loads, so on Dawn the server HTML and the client disagree
    // about <html class>. That is the intended order of events, not a bug, and
    // the attribute stops React logging it as one on every page.
    <html lang="en" className={FONT_VARIABLES} suppressHydrationWarning>
      <head>
        {/* Before first paint, or the page flashes dark and snaps to light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {/* Drags the window when installed on a desktop; zero height elsewhere. */}
        <div className="titlebar-drag" aria-hidden />
        <AppProviders>{children}</AppProviders>
        <RegisterServiceWorker />
        {/* Page views on Vercel (no cookies). Counts nothing in development. */}
        <Analytics />
        <TapFeedback />
      </body>
    </html>
  );
}
