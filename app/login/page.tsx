"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { HorizonArc } from "@/components/ui/progress-arc";
import { useAuth } from "@/features/auth/use-auth";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Sign in with Apple is wired (features/auth/use-auth.tsx, README) but off
 * until the Apple Services ID and key are set up in Supabase — a button that
 * answers with a provider error is worse than no button. Flip to true then.
 */
const APPLE_SIGN_IN = false;

const points = ["Plan your week", "Track your records", "See muscles worked"];

/** Google's standard "G", in its own colours, as Google asks sign-in buttons to show it. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Apple's mark, in the current text colour, as Apple's button guidelines ask. */
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="currentColor">
      <path d="M16.37 12.64c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.31-3.55zM14.18 6.17c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.58-2.57 1.32-.56.65-1.06 1.7-.93 2.7.98.08 1.98-.5 2.59-1.24z" />
    </svg>
  );
}

/** iPhone and iPad (iPadOS reports itself as a Mac; touch points give it away). */
function isApplePhone() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** The keys shrink a little on a short screen, so the page never scrolls. */
const KEY = "h-[clamp(48px,6.7dvh,56px)] w-full";
const QUIET_LINK =
  "inline-flex h-11 items-center rounded px-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Sign in — a door, no longer the only one. The app works without an account
 * (guest mode); this page is where the account is added, from the You tab or
 * a prompt, and "Use without an account" goes straight back. "Take the tour"
 * shows the app on sample data before anyone decides.
 *
 * It follows the theme and wears the app's own sky, with the horizon as its only
 * picture. No number and no marks on the horizon: here it is a sunrise, not a reading.
 *
 * On a phone it is the whole screen, not a card floating on one: the pitch low
 * in the middle, the keys at the bottom where a thumb is. Sized to `100dvh` — the
 * height actually visible — because `100vh` on iPhone Safari is the height with
 * the toolbar hidden, which is what made this page scroll by a few pixels for
 * nothing. The `clamp(…dvh…)` sizes keep it to one screen on short phones too.
 * On a wide screen the same content sits centred, with no box around it.
 */
export default function LoginPage() {
  const router = useRouter();
  const { user, signIn } = useAuth();
  // Apple first on Apple devices, as Apple's guidelines ask when both are
  // offered. Read after mount: the server does not know the device.
  const [appleFirst, setAppleFirst] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [router, user]);

  useEffect(() => setAppleFirst(isApplePhone()), []);

  const open = (provider: "google" | "apple") => {
    setError(undefined);
    signIn(provider).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not open sign-in.");
    });
  };

  const google = (
    <Button key="google" size="lg" className={`${KEY} google-key`} onClick={() => open("google")}>
      <GoogleMark />
      Sign in with Google
    </Button>
  );
  const apple = (
    <Button key="apple" size="lg" className={KEY} onClick={() => open("apple")}>
      <AppleMark />
      Sign in with Apple
    </Button>
  );

  return (
    // Relative and clipped: the sky is 40rem tall, which on a short phone would make the page scroll.
    <main className="relative flex min-h-[100dvh] justify-center overflow-hidden sm:items-center sm:px-4">
      {/* A client page cannot export metadata, so the tag goes here: React 19
          lifts <meta> into <head>. Sign-in is a door, not a page to find in
          search; /about is (app/about). */}
      <meta name="robots" content="noindex, follow" />
      <div className="app-sky print:hidden" aria-hidden />
      <div className="app-glow print:hidden" aria-hidden />

      <div className="flex w-full max-w-md flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+var(--titlebar)+clamp(0px,3.4dvh,40px))] sm:pb-6">
        {/* Edge to edge on a phone. On a wide screen its ends fade instead of stopping dead. */}
        <div
          className="-mx-6 sm:[mask-image:linear-gradient(90deg,transparent,#000_20%,#000_80%,transparent)]"
          aria-hidden
        >
          <HorizonArc litTo={304} height={78} label="" />
        </div>

        <div className="flex flex-1 flex-col justify-end pb-[clamp(14px,3.2dvh,30px)] sm:flex-none sm:pt-14">
          <h1 className="font-heading text-[clamp(42px,7.6dvh,64px)] leading-[1.04]">
            Train.
            <br />
            Level up.
            <br />
            Arise.
          </h1>
          {/* Each sentence stays whole, so a narrow phone breaks the line between them. */}
          <p className="mt-[clamp(6px,1.5dvh,14px)] text-base leading-snug">
            <span className="inline-block">Start where you are.</span>{" "}
            <span className="inline-block">Get stronger each week.</span>
          </p>
          <ul className="mt-[clamp(8px,2.2dvh,20px)] space-y-[clamp(1px,0.6dvh,5px)] text-[15px] leading-snug text-muted-foreground">
            {points.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-2.5">
          {!APPLE_SIGN_IN ? google : appleFirst ? [apple, google] : [google, apple]}
          {error ? (
            <p className="text-center text-[13px] text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button asChild size="lg" variant="secondary" className={KEY}>
            <Link href="/">Use without an account</Link>
          </Button>
        </div>
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          Your data is private and works on any phone.
        </p>
        {/* ?tour=1 starts the tour on sample data (features/tour/tour.tsx). */}
        <div className="flex justify-center gap-6">
          <Link href="/?tour=1" className={QUIET_LINK}>
            Take the tour
          </Link>
          <Link href="/about" className={QUIET_LINK}>
            About Arise
          </Link>
        </div>
        {!isSupabaseConfigured ? (
          <p className="mt-1 text-center text-[13px] text-warning">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign-in.
          </p>
        ) : null}
      </div>
    </main>
  );
}
