"use client";

import { Download, EllipsisVertical, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useInstall } from "@/features/pwa/use-install";

const DISMISS_KEY = "gymflow.installDismissed";

/**
 * "Put Arise on your home screen." Android gets a button that opens the
 * system install sheet when the browser offers one, and the two menu taps when
 * it does not; iPhone gets the two taps Safari needs, because Safari has no
 * install prompt at all. Hidden once installed.
 *
 * `dismissible` is for Home, where it can be closed for good; on the You page
 * it always shows until the app is installed.
 */
export function InstallCard({ dismissible = false }: { dismissible?: boolean }) {
  const state = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(dismissible && localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, [dismissible]);

  if (state.kind === "installed" || state.kind === "unavailable" || dismissed) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Hidden for this visit only.
    }
  };

  return (
    <div className="plaque relative rounded-3xl p-4">
      {dismissible ? (
        <button
          type="button"
          aria-label="Hide this"
          onClick={dismiss}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      <div className="flex items-start gap-3 pr-8">
        <img src="/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight tracking-tight">Install Arise</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Opens full screen from your home screen, and works with no signal in the gym.
          </p>
        </div>
      </div>
      {state.kind === "prompt" ? (
        <Button className="mt-4 w-full" onClick={() => void state.install()}>
          <Download className="h-4 w-4" />
          Install the app
        </Button>
      ) : state.kind === "android" ? (
        <ol className="mt-4 space-y-2 text-sm">
          <li className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
              1
            </span>
            <span className="flex flex-wrap items-center gap-1">
              Tap <EllipsisVertical className="mx-0.5 inline h-4 w-4 text-brand" aria-label="the menu" /> in your
              browser&apos;s toolbar
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
              2
            </span>
            <span className="flex flex-wrap items-center gap-1">
              Choose <Download className="mx-0.5 inline h-4 w-4 text-brand" aria-hidden /> Install app, or Add to
              Home screen
            </span>
          </li>
        </ol>
      ) : (
        <ol className="mt-4 space-y-2 text-sm">
          <li className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
              1
            </span>
            <span className="flex flex-wrap items-center gap-1">
              Tap <Share className="mx-0.5 inline h-4 w-4 text-brand" aria-label="Share" /> Share in Safari&apos;s
              toolbar
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
              2
            </span>
            <span className="flex flex-wrap items-center gap-1">
              Choose <SquarePlus className="mx-0.5 inline h-4 w-4 text-brand" aria-hidden /> Add to Home Screen
            </span>
          </li>
        </ol>
      )}
    </div>
  );
}
