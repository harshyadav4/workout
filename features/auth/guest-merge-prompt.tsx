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
}

const prompt = createStore<PromptState>(() => ({}));

export function askGuestMerge(userId: string, summary: string) {
  prompt.setState({ userId, summary });
}

export function GuestMergePrompt() {
  const { userId, summary } = useStore(prompt);
  const store = useWorkoutStoreApi();

  if (!userId || !summary) {
    return null;
  }

  const close = () => prompt.setState({ userId: undefined, summary: undefined });

  const add = () => {
    const guest = readGuestCopy();
    if (guest) {
      store.getState().hydrateRemote(guestAsIncoming(guest, store.getState().profile));
      clearGuestCopy();
    }
    close();
  };

  const keep = () => {
    declineGuestFor(userId);
    close();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(4,7,12,0.6)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-merge-title"
        className="plaque w-full max-w-md rounded-3xl p-5 shadow-2xl"
      >
        <h2 id="guest-merge-title" className="font-display text-xl font-extrabold tracking-tight">
          Add this phone&apos;s data to your account?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This phone has {summary} from before you signed in.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>
            <span className="font-semibold">Add to my account:</span>{" "}
            <span className="text-muted-foreground">combines both into 1 history.</span>
          </li>
          <li>
            <span className="font-semibold">Keep my account only:</span>{" "}
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
