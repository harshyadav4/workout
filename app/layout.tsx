import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";

import "@/app/globals.css";
import { AppProviders } from "@/components/layout/app-providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans"
});

// Every number on Home — weight, reps, set index — is set in this. Same family
// lineage as Space Grotesk, and the fixed advance keeps digits from jittering
// as a stepper runs.
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "GymFlow",
  description: "Mobile-first workout tracking for the gym floor",
  // Next emits this string verbatim and does not resolve it against public/, so
  // it has to match the file on disk. It said "/manifest.json" and 404'd, which
  // silently cost the app its install prompt.
  manifest: "/manifest.webmanifest",
  // iOS ignores the manifest's icons for the home screen and reads
  // apple-touch-icon instead, so both are declared.
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#0d1420",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

import { THEME_BOOTSTRAP } from "@/lib/theme";

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No `dark` class: dark is the palette in `:root`, so it is what renders
    // if anything about the theme script fails. Only light is a class.
    <html lang="en">
      <head>
        {/* Before first paint, or the page flashes dark and snaps to light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${spaceGrotesk.variable} ${spaceMono.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
