"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { BarChart3, CalendarDays, ClipboardList, Home, UserCircle2, UtensilsCrossed } from "lucide-react";

import { isTextEntry } from "@/components/ui/use-keyboard";
import { useArea } from "@/features/diet/area-store";
import { AreaSwitch } from "@/features/diet/area-switch";
import { useWorkoutStore } from "@/features/workout/workout-store";
import { isRecordingDue } from "@/lib/body-metrics";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Today", icon: Home },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/profile", label: "You", icon: UserCircle2 }
];

/** The same four places on the Diet side, named for what they hold there. */
const dietItems = [
  { href: "/", label: "Meals", icon: UtensilsCrossed },
  { href: "/plan", label: "Diet plan", icon: ClipboardList },
  { href: "/progress", label: "Intake", icon: BarChart3 },
  { href: "/profile", label: "You", icon: UserCircle2 }
];

/** The circle sits between the second and third tab. */
const SWITCH_BEFORE = 2;

function isOn(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The dock: one pill floating clear of the bottom edge, four tabs in it. The
 * active tab is a soft tint, not filled — a filled pill is the one you press,
 * and this one you are already on. On iOS the pill is glass instead; see
 * `.dock` in globals.css.
 *
 * The tab lights the moment it is tapped, before the new page is in: the
 * route can take a beat to load, and a dock that waits for it makes the tap
 * feel missed. The page itself fades in when it lands (`.page-enter`).
 */
export function BottomNav() {
  const pathname = usePathname();
  const measurements = useWorkoutStore((state) => state.measurements);
  const profile = useWorkoutStore((state) => state.profile);
  // After mount: the server cannot see this phone's readings, so a dot in the
  // first render would not match its HTML and React would rebuild the page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const recordingDue = mounted && isRecordingDue(measurements, profile);
  const typing = useTyping();
  const pending = usePendingTab(pathname);
  const shown = useArea() === "diet" ? dietItems : items;
  useTabKeys();

  return (
    <nav
      aria-label="Main"
      // Out of the way while typing: on iPhone a fixed bar either rides up on
      // the keyboard or sits behind it, and both cover the field being typed in.
      hidden={typing}
      className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.25rem)]"
    >
      <div className="dock mx-auto grid max-w-md grid-cols-[1fr_1fr_3.5rem_1fr_1fr] items-center gap-0.5 rounded-[34px] p-[5px] shadow-dock" data-tour="nav">
        {shown.map((item, index) => {
          const active = pending.href ? pending.href === item.href : isOn(item.href, pathname);
          const Icon = item.icon;
          // Only the You tab carries a dot, and only for something the user
          // asked to be reminded about — a cadence they set themselves.
          const dot = item.href === "/profile" && recordingDue;
          return (
            <Fragment key={item.href}>
            {index === SWITCH_BEFORE ? <AreaSwitch /> : null}
            <Link
              href={item.href}
              // No scroll-to-top from Next: ScrollMemory puts each tab back
              // where it was left.
              scroll={false}
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
              // The tab you are on: back to its top, as a native tab bar does.
              onClick={(event) => {
                if (isOn(item.href, pathname)) {
                  event.preventDefault();
                  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                  window.scrollTo({ top: 0, behavior: reduce ? ("instant" as ScrollBehavior) : "smooth" });
                }
              }}
              className={cn(
                "flex h-[58px] flex-col items-center justify-center gap-[3px] rounded-[29px] text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "dock-active font-semibold" : "font-medium text-muted-foreground active:bg-hi"
              )}
            >
              <span className="relative">
                <Icon className="h-[21px] w-[21px]" strokeWidth={1.6} />
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
            </Fragment>
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

/**
 * Keys 1–4 switch tabs, for the installed desktop app and a phone with a
 * keyboard. Not while typing, not with a sheet open (Escape is its key), and
 * not with a modifier held — those are the browser's shortcuts.
 */
function useTabKeys() {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTextEntry(event.target)) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) {
        return;
      }
      const item = items[Number(event.key) - 1];
      if (item && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        router.push(item.href, { scroll: false });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);
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
