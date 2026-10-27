"use client";

import { CalendarDays, PersonStanding, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import ironArt from "@/features/auth/login-iron.webp";
import { useAuth } from "@/features/auth/use-auth";
import { isSupabaseConfigured } from "@/lib/supabase";

const points = [
  { icon: CalendarDays, label: "Plan your week" },
  { icon: TrendingUp, label: "Track your records" },
  { icon: PersonStanding, label: "See muscles worked" }
];

/** Google's "G", in its own colours, as Google asks sign-in buttons to show it. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
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

/**
 * Sign in — a door, no longer the only one. The app works without an account
 * (guest mode); this page is where the account is added, from the You tab or
 * a prompt, and "Use without an account" goes straight back. "Take the tour"
 * shows the app on sample data before anyone decides.
 *
 * On a phone it is the whole screen, not a card floating on one: the pitch in
 * the middle, the one button at the bottom where a thumb is.
 * Sized to `100dvh` — the height actually visible — because `100vh` on iPhone
 * Safari is the height with the toolbar hidden, which is what made this page
 * scroll by a few pixels for nothing. On a wide screen the same content sits
 * in a plaque.
 *
 * Behind it, an iron aisle in a hardcore gym with mana burning off the plates
 * (our own generated art, no characters). The words sit low, on the part where the art has faded out.
 * Imported rather than linked from public/, so it ships as a hashed file under
 * /_next/static, which the service worker caches: it is there with no signal.
 * `unoptimized` keeps it off /_next/image for the same reason.
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
    <Button
      key="google"
      size="lg"
      variant="secondary"
      className="h-14 w-full text-base font-semibold"
      onClick={() => open("google")}
    >
      <GoogleMark />
      Sign in with Google
    </Button>
  );
  const apple = (
    <Button
      key="apple"
      size="lg"
      variant="secondary"
      className="h-14 w-full text-base font-semibold"
      onClick={() => open("apple")}
    >
      <AppleMark />
      Sign in with Apple
    </Button>
  );

  return (
    <main className="login-night relative flex min-h-[100dvh] items-stretch justify-center overflow-hidden sm:items-center sm:px-4">
      {/* A client page cannot export metadata, so the tag goes here: React 19
          lifts <meta> into <head>. Sign-in is a door, not a page to find in
          search; /about is (app/about). */}
      <meta name="robots" content="noindex, follow" />
      <Image
        src={ironArt}
        alt=""
        fill
        priority
        unoptimized
        placeholder="blur"
        sizes="100vw"
        className="object-cover object-top"
      />
      <div className="login-night-shade absolute inset-0" />

      <div className="relative flex w-full max-w-md flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+2rem)] sm:rounded-3xl sm:border sm:border-border sm:bg-card/85 sm:p-8 sm:shadow-plaque sm:backdrop-blur">
        <div className="flex flex-1 flex-col justify-end pb-10 pt-8 [@media(max-height:700px)]:pb-6 sm:flex-none sm:py-8">
          <h1 className="font-display text-[44px] font-extrabold leading-[0.95] tracking-[-0.03em] [@media(max-height:700px)]:text-[38px]">
            Train.
            <br />
            Level up.
            <br />
            <span className="text-brand">Arise.</span>
          </h1>
          <p className="mt-4 max-w-[19rem] text-[15px] leading-relaxed text-muted-foreground">
            Start where you are. Get stronger each week.
          </p>

          <ul className="mt-8 space-y-4 [@media(max-height:700px)]:mt-5 [@media(max-height:700px)]:space-y-3">
            {points.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3.5">
                <span className="key-quiet flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5 text-brand" />
                </span>
                <span className="text-[15px] font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="space-y-2">{appleFirst ? [apple, google] : [google, apple]}</div>
          {error ? (
            <p className="mt-2 text-center text-xs text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Your data is private and works on any phone.
          </p>
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link href="/">Use without an account</Link>
          </Button>
          {/* ?tour=1 starts the tour on sample data (features/tour/tour.tsx). */}
          <p className="mt-1 text-center text-sm">
            <Link
              href="/?tour=1"
              className="font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Take the tour
            </Link>
          </p>
          <p className="mt-1 text-center text-xs">
            <Link
              href="/about"
              className="text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              About Arise
            </Link>
          </p>
          {!isSupabaseConfigured ? (
            <p className="mt-2 text-center text-xs text-warning">
              Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign-in.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
