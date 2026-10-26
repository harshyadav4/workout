"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/use-auth";
import { useSyncStatus } from "@/features/workout/sync-status";
import { useWorkoutStore, useWorkoutStoreApi } from "@/features/workout/workout-store";
import { archiveUserData, discardArchive, loadArchive, restoreToAccount } from "@/lib/archive";
import { DELETION_GRACE_DAYS, daysToRestore, deletionDate, deletionDue } from "@/lib/deletion";
import { snapshotState } from "@/lib/sync";

/** Typed to confirm. A word, not a checkbox: a thumb slips onto a checkbox. */
const CONFIRM_WORD = "DELETE";

function formatDay(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

/** "Type DELETE" — the one guard in front of anything that cannot be undone. */
function ConfirmWord({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-3 block text-xs font-medium text-muted-foreground">
      Type {CONFIRM_WORD} to confirm
      <Input
        className="mt-1.5"
        value={value}
        autoCapitalize="characters"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

const confirmedWord = (typed: string) => typed.trim().toUpperCase() === CONFIRM_WORD;

/**
 * On every page while old data is archived: when it goes, and the way back.
 *
 * The app itself stays usable — the archive is out of sight, so the lifter can
 * start fresh — and the restore asks what to do with anything logged since.
 *
 * It also deletes the archive once the week is over, on the first open after
 * it, and only once this device has read the account: a stale local copy must
 * never delete an archive that was restored from another phone.
 */
export function DeletionBanner() {
  const { user } = useAuth();
  const store = useWorkoutStoreApi();
  const requestedAt = useWorkoutStore((state) => state.profile.deletionRequestedAt);
  const setProfile = useWorkoutStore((state) => state.setProfile);
  const restoreArchive = useWorkoutStore((state) => state.restoreArchive);
  const hasNewData = useWorkoutStore(
    (state) =>
      state.logs.length > 0 ||
      state.measurements.length > 0 ||
      state.sessionTemplates.length > 0 ||
      state.templates.some((template) => !template.isPreset)
  );
  const { lastSyncedAt, error } = useSyncStatus();
  const [stage, setStage] = useState<"idle" | "choose" | "delete">("idle");
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const finishing = useRef(false);

  const loaded = lastSyncedAt !== undefined && !error;
  const due = deletionDue(requestedAt, new Date());

  // Deletes the archive for good. The GIFs still used by current exercises stay.
  const finish = async () => {
    if (!user) {
      throw new Error("Sign in first.");
    }
    await discardArchive(user.id, store.getState().templates);
    setProfile({ deletionRequestedAt: undefined });
  };

  useEffect(() => {
    if (!due || !loaded || !user || finishing.current) {
      return;
    }
    finishing.current = true;
    finish().catch((cause: unknown) => {
      finishing.current = false;
      setFailure(messageOf(cause, "Could not delete your old data."));
    });
    // `finish` reads the store at call time; the trigger is the deadline and the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, loaded, user]);

  if (!requestedAt) {
    return null;
  }

  const restore = async (mode: "merge" | "replace") => {
    if (!user) {
      return;
    }
    setPending(true);
    setFailure(undefined);
    try {
      restoreArchive(await loadArchive(user.id), mode);
      // The account is made to match this phone before the archive goes, so a
      // failed upload leaves the archive in place.
      await restoreToAccount(user.id, snapshotState(store.getState()));
      setStage("idle");
    } catch (cause) {
      setFailure(messageOf(cause, "Could not restore your data."));
    }
    setPending(false);
  };

  const deleteNow = async () => {
    setPending(true);
    setFailure(undefined);
    try {
      await finish();
    } catch (cause) {
      setFailure(messageOf(cause, "Could not delete your old data."));
    }
    setPending(false);
  };

  if (due) {
    return (
      <div className="rounded-xl border border-border bg-card p-4" role="status">
        <p className="text-sm font-semibold">Deleting your old data…</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The {DELETION_GRACE_DAYS} days to restore are over. Anything you logged since stays.
        </p>
        {failure ? <p className="mt-1 text-xs text-danger">{failure}</p> : null}
      </div>
    );
  }

  const left = daysToRestore(requestedAt, new Date());

  return (
    <div className="rounded-xl border border-danger/40 bg-card p-4" role="alert">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Archive className="h-4 w-4 shrink-0 text-danger" aria-hidden />
        Your old data is hidden
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        It is deleted for good on {formatDay(deletionDate(requestedAt))}. You have {left}{" "}
        {left === 1 ? "day" : "days"} to bring it back.
      </p>

      {stage === "idle" ? (
        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onClick={() => (hasNewData ? setStage("choose") : void restore("merge"))}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {pending ? "Restoring…" : "Restore"}
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-danger/40 text-danger"
            onClick={() => setStage("delete")}
          >
            Delete now
          </Button>
        </div>
      ) : null}

      {stage === "choose" ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold">You logged new data since. What should happen to it?</p>
          <Button className="h-auto w-full flex-col items-start py-3 text-left" disabled={pending} onClick={() => void restore("merge")}>
            <span>Keep it, and add my old data back</span>
            <span className="text-xs font-normal opacity-80">Both together, as one history.</span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto w-full flex-col items-start py-3 text-left"
            disabled={pending}
            onClick={() => void restore("replace")}
          >
            <span>Remove it, and go back to my old data</span>
            <span className="text-xs font-normal text-muted-foreground">
              Everything logged since the request is deleted.
            </span>
          </Button>
          <Button variant="ghost" className="w-full" disabled={pending} onClick={() => setStage("idle")}>
            Cancel
          </Button>
        </div>
      ) : null}

      {stage === "delete" ? (
        <div className="mt-3">
          <p className="text-sm">
            Delete your old data now, without waiting? Anything logged since stays.{" "}
            <span className="font-semibold">This cannot be undone.</span>
          </p>
          <ConfirmWord value={typed} onChange={setTyped} />
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              disabled={!confirmedWord(typed) || pending}
              onClick={() => void deleteNow()}
            >
              {pending ? "Deleting…" : "Delete now"}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={pending}
              onClick={() => {
                setStage("idle");
                setTyped("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {failure ? <p className="mt-2 text-sm text-danger">{failure}</p> : null}
    </div>
  );
}

/** The request, on the profile page. */
export function DataDeletion() {
  const { user } = useAuth();
  const store = useWorkoutStoreApi();
  const requestedAt = useWorkoutStore((state) => state.profile.deletionRequestedAt);
  const archiveLocal = useWorkoutStore((state) => state.archiveLocal);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();

  if (requestedAt) {
    return (
      <p className="text-sm text-muted-foreground">
        Your old data is hidden and waiting to be deleted. Restore it or delete it now from the
        notice at the top of the page.
      </p>
    );
  }

  const request = async () => {
    if (!user) {
      setFailure("Sign in first.");
      return;
    }
    setPending(true);
    setFailure(undefined);
    try {
      // Snapshot first, clear second: if the archive cannot be written,
      // nothing has been removed.
      archiveLocal(await archiveUserData(user.id, snapshotState(store.getState())));
      setConfirming(false);
      setTyped("");
    } catch (cause) {
      setFailure(messageOf(cause, "Could not delete your data."));
    }
    setPending(false);
  };

  if (!confirming) {
    return (
      <Button
        variant="outline"
        className="w-full border-danger/40 text-danger"
        onClick={() => setConfirming(true)}
      >
        Delete all my data
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-danger/40 p-4">
      <p className="text-sm font-semibold text-danger">Delete all your data?</p>
      <p className="mt-2 text-sm text-muted-foreground">
        This removes your sessions, plans, records, weigh-ins, measurements, skills and your own
        exercises from this phone and your account. The app starts fresh, and your sign-in stays.
      </p>
      <p className="mt-2 text-sm">
        Your old data is <span className="font-semibold">hidden for {DELETION_GRACE_DAYS} days</span>{" "}
        first. In that time you can bring it back — together with anything new, or instead of it.
        After that, it is deleted for good the next time you open the app.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">Tip: download a backup first, in Your data above.</p>
      <ConfirmWord value={typed} onChange={setTyped} />
      {failure ? <p className="mt-2 text-sm text-danger">{failure}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button
          variant="danger"
          className="flex-1"
          disabled={!confirmedWord(typed) || pending}
          onClick={() => void request()}
        >
          {pending ? "Deleting…" : "Delete"}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setFailure(undefined);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
