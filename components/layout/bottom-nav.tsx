"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, Home, UserCircle2 } from "lucide-react";

import { isTextEntry } from "@/components/ui/use-keyboard";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { isRecordingDue } from "@/lib/body-metrics";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Today", icon: Home },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/profile", label: "You", icon: UserCircle2 }
];

function isOn(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The dock: one plaque floating clear of the bottom edge, four keys in it.
 * The active key is tinted, not filled — a filled key is the one you press,
 * and this one you are already on. On iOS the plaque is glass instead; see
 * `.dock` in globals.css.
 *
 * The key lights the moment it is tapped, before the new page is in: the
 * route can take a beat to load, and a dock that waits for it makes the tap
 * feel missed. The page itself fades in when it lands (`.page-enter`).
 */
export function BottomNav() {
  const pathname = usePathname();
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  const recordingDue = isRecordingDue(measurements, profile);
  const typing = useTyping();
  const pending = usePendingTab(pathname);

  return (
    <nav
      aria-label="Main"
      // Out of the way while typing: on iPhone a fixed bar either rides up on
      // the keyboard or sits behind it, and both cover the field being typed in.
      hidden={typing}
      className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]"
    >
      <div className="dock mx-auto grid max-w-md grid-cols-4 gap-1 rounded-3xl border border-border p-1.5 shadow-dock" data-tour="nav">
        {items.map((item) => {
          const active = pending.href ? pending.href === item.href : isOn(item.href, pathname);
          const Icon = item.icon;
          // Only the You tab carries a dot, and only for something the user
          // asked to be reminded about — a cadence they set themselves.
          const dot = item.href === "/profile" && recordingDue;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isOn(item.href, pathname) ? "page" : undefined}
              // Where the tour's guide flies to before it changes page.
              data-tour={`nav-${item.href}`}
              // `onNavigate`, not `onClick`: it fires only for an in-tab client
              // navigation. A ctrl-click opens a new tab and this pathname never
              // changes, so an onClick left the wrong key lit until the next move.
              onNavigate={() => {
                if (!isOn(item.href, pathname)) {
                  pending.set(item.href);
                }
              }}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "dock-active" : "text-muted-foreground active:bg-secondary/70"
              )}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
                {dot ? (
                  <span
                    className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-warning ring-2 ring-card"
                    aria-hidden
                  />
                ) : null}
              </span>
              <span>
                {item.label}
                {dot ? <span className="sr-only">. A measurement is due</span> : null}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The tab just tapped, until the URL catches up with it. Cleared the moment
 * the path changes — to that tab or anywhere else (the tour, a back swipe).
 */
function usePendingTab(pathname: string) {
  const [href, set] = useState<string | undefined>(undefined);
  useEffect(() => set(undefined), [pathname]);
  return { href, set };
}

/** True while a text field anywhere on the page has focus. */
function useTyping() {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setTyping(isTextEntry(event.target));
    // focusout fires before focus lands on the next field; check where it went.
    const onFocusOut = () => window.setTimeout(() => setTyping(isTextEntry(document.activeElement)), 0);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return typing;
}
