"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { Button } from "@/components/ui/button";
import {
  clearGuestCopy,
  declineGuestFor,
  readGuestCopy,
  useWorkoutStoreApi
} from "@/features/workout/workout-store";
import { guestAsIncoming } from "@/lib/guest-merge";

/**
 * The one question guest mode asks: this phone trained before you signed in,
 * and your account already has history — put the two together?
 *
 * Asked, never assumed, because on a shared phone the guest's sessions may not
 * be yours. Both answers keep everything: "Add" merges (the same safe merge as
 * a backup restore, which deletes nothing), "Keep my account only" leaves the
 * guest copy on the phone, where it is again when you sign out.
 *
 * Opened by the sync layer (features/workout/supabase-sync), outside the
 * workout store for the same reason as sync-status: that store is watched.
 */
interface PromptState {
  userId?: string;
  /** "5 sessions and 2 weigh-ins". */
  summary?: string;
  /** Run on "Add", for copies the workout store does not hold (diet). */
  onAdd?: (() => void)[];
}

const prompt = createStore<PromptState>(() => ({}));

/** A second caller joins the open question rather than replacing it: one question, one answer. */
export function askGuestMerge(userId: string, summary: string, onAdd?: () => void) {
  prompt.setState((current) => {
    const open = current.userId === userId && current.summary;
    return {
      userId,
      summary: open ? `${current.summary}, and ${summary}` : summary,
      onAdd: [...(open ? current.onAdd ?? [] : []), ...(onAdd ? [onAdd] : [])]
    };
  });
}

export function GuestMergePrompt() {
  const { userId, summary, onAdd } = useStore(prompt);
  const store = useWorkoutStoreApi();

  if (!userId || !summary) {
    return null;
  }

  const close = () => prompt.setState({ userId: undefined, summary: undefined, onAdd: undefined });

  const add = () => {
    const guest = readGuestCopy();
    if (guest) {
      store
        .getState()
        .hydrateRemote(guestAsIncoming(guest, store.getState().profile, store.getState().scheduleConfig), "copy");
      clearGuestCopy();
    }
    onAdd?.forEach((run) => run());
    close();
  };

  const keep = () => {
    declineGuestFor(userId);
    close();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--scrim)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-merge-title"
        className="plaque-solid w-full max-w-md rounded-3xl p-5"
      >
        <h2 id="guest-merge-title" className="font-heading text-[28px] leading-tight">
          Add this phone&apos;s data to your account?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This phone has {summary} from before you signed in.
        </p>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed">
          <li>
            <span className="font-medium">Add to my account:</span>{" "}
            <span className="text-muted-foreground">combines both into 1 history.</span>
          </li>
          <li>
            <span className="font-medium">Keep my account only:</span>{" "}
            <span className="text-muted-foreground">the phone keeps it for when you sign out.</span>
          </li>
        </ul>
        <div className="mt-5 space-y-2">
          <Button className="w-full" onClick={add} autoFocus>
            Add to my account
          </Button>
          <Button variant="secondary" className="w-full" onClick={keep}>
            Keep my account only
          </Button>
        </div>
      </div>
    </div>
  );
}
