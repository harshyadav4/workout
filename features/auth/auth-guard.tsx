"use client";

import { usePathname } from "next/navigation";

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
 * guest's and then switching.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const pathname = usePathname();

  if (loading && !PUBLIC_PAGES.has(pathname) && !pathname.startsWith("/r/")) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
          Loading your plan…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
