"use client";

import { usePathname } from "next/navigation";

import { BottomNav } from "@/components/layout/bottom-nav";
import { useAuth } from "@/features/auth/use-auth";

/**
 * Pages that show no one's data: they render at once, on the server too, so
 * search engines and AI tools that read the HTML without running it see the
 * real text, not "Loading…". The /r/ short links pass straight through.
 */
const PUBLIC_PAGES = new Set(["/about", "/login"]);

/**
 * No wall any more: the app works signed out, as a guest, and the account is
 * asked for when it is worth something (features/auth, the You tab). What is
 * left is the moment sign-in is still being read from storage — under a
 * second — so the first screen opens on the right copy instead of flashing the
 * guest's and then switching. That moment looks like the app: the dock is
 * already there and the page is a few quiet card shapes, so the splash hands
 * over to the frame and the frame fills in — the way a native app launches. A
 * centred "Loading…" pill, and before that a bare screen, each read as a web
 * page for that second.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const pathname = usePathname();

  if (loading && !PUBLIC_PAGES.has(pathname) && !pathname.startsWith("/r/")) {
    return (
      <div
        className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(env(safe-area-inset-top)+var(--titlebar)+1.5rem)]"
        aria-busy="true"
        aria-label="Loading"
      >
        <div className="space-y-4 motion-safe:animate-pulse" aria-hidden>
          <div className="h-16 rounded-3xl bg-secondary/40" />
          <div className="h-44 rounded-3xl bg-secondary/40" />
          <div className="h-28 rounded-3xl bg-secondary/40" />
          <div className="h-28 rounded-3xl bg-secondary/40" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return <>{children}</>;
}
