"use client";

import { CalendarDays, PersonStanding, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import ironArt from "@/features/auth/login-iron.webp";
import { useAuth } from "@/features/auth/use-auth";
import { isSupabaseConfigured } from "@/lib/supabase";

const points = [
  { icon: CalendarDays, label: "Plan your week in minutes." },
  { icon: TrendingUp, label: "Track PRs and strength gains." },
  { icon: PersonStanding, label: "See which muscles you worked." }
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

/**
 * The front door.
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

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [router, user]);

  return (
    <main className="login-night relative flex min-h-[100dvh] items-stretch justify-center overflow-hidden sm:items-center sm:px-4">
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
            Start weak. Show up daily. Become the one nobody saw coming.
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
          <Button
            size="lg"
            variant="secondary"
            className="h-14 w-full text-base font-semibold"
            onClick={() => void signIn()}
          >
            <GoogleMark />
            Continue with Google
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Your progress is saved to your account. Only you see it.
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
