"use client";

import { Download, EllipsisVertical, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ListRow, ListSheet } from "@/components/ui/list";
import { useInstall } from "@/features/pwa/use-install";

const DISMISS_KEY = "gymflow.installDismissed";

/**
 * "Put Arise on your home screen." Android gets a button that opens the
 * system install sheet when the browser offers one, and the two menu taps when
 * it does not; iPhone gets the two taps Safari needs, because Safari has no
 * install prompt at all. Hidden once installed.
 *
 * `dismissible` is for Home, where it can be closed for good. The You page has
 * `InstallRow` below instead, a quiet row until the app is installed.
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
          aria-label="Hide this message"
          onClick={dismiss}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      <div className="flex items-start gap-3 pr-8">
        <img src="/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="text-base font-medium">Install Arise</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Opens full screen and works offline.
          </p>
        </div>
      </div>
      {state.kind === "prompt" ? (
        <Button className="mt-4 w-full" onClick={() => void state.install()}>
          <Download className="h-4 w-4" />
          Install
        </Button>
      ) : state.kind === "android" ? (
        <InstallSteps kind="android" />
      ) : (
        <InstallSteps kind="ios" />
      )}
    </div>
  );
}

/** The two taps a browser with no install button needs. */
function InstallSteps({ kind }: { kind: "android" | "ios" }) {
  const number = (value: number) => (
    <span className="w-5 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
      {value}
    </span>
  );
  return kind === "android" ? (
    <ol className="mt-4 space-y-3 text-sm">
      <li className="flex items-center gap-3">
        {number(1)}
        <span className="flex flex-wrap items-center gap-1">
          Tap <EllipsisVertical className="mx-0.5 inline h-4 w-4 text-muted-foreground" aria-label="the menu" /> in the browser
        </span>
      </li>
      <li className="flex items-center gap-3">
        {number(2)}
        <span className="flex flex-wrap items-center gap-1">
          Choose <Download className="mx-0.5 inline h-4 w-4 text-muted-foreground" aria-hidden /> Install app, or Add to Home screen
        </span>
      </li>
    </ol>
  ) : (
    <ol className="mt-4 space-y-3 text-sm">
      <li className="flex items-center gap-3">
        {number(1)}
        <span className="flex flex-wrap items-center gap-1">
          Tap <Share className="mx-0.5 inline h-4 w-4 text-muted-foreground" aria-label="Share" /> Share in Safari
        </span>
      </li>
      <li className="flex items-center gap-3">
        {number(2)}
        <span className="flex flex-wrap items-center gap-1">
          Choose <SquarePlus className="mx-0.5 inline h-4 w-4 text-muted-foreground" aria-hidden /> Add to Home Screen
        </span>
      </li>
    </ol>
  );
}

/**
 * The same offer as one row on You: it asks for nothing until it is tapped.
 * One tap installs where the browser can do that; elsewhere it shows the taps.
 * Hidden once installed, so the group simply has one row fewer.
 */
export function InstallRow() {
  const state = useInstall();
  const [open, setOpen] = useState(false);

  if (state.kind === "installed" || state.kind === "unavailable") {
    return null;
  }

  return (
    <>
      <ListRow
        icon={Download}
        label="Install Arise"
        value="Works offline"
        onClick={() => (state.kind === "prompt" ? void state.install() : setOpen(true))}
      />
      {state.kind === "prompt" ? null : (
        <ListSheet open={open} onOpenChange={setOpen} title="Install Arise" description="Opens full screen and works offline.">
          <InstallSteps kind={state.kind} />
        </ListSheet>
      )}
    </>
  );
}
