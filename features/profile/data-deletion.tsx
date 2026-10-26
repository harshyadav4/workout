"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { InfoNote } from "@/components/ui/info-note";
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
          The {DELETION_GRACE_DAYS} days to restore it are over. Newer data stays.
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
        {left} {left === 1 ? "day" : "days"} left to restore it. It goes for good on{" "}
        {formatDay(deletionDate(requestedAt))}.
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
          <p className="text-sm font-semibold">You have new data. What happens to it?</p>
          <Button className="h-auto w-full flex-col items-start py-3 text-left" disabled={pending} onClick={() => void restore("merge")}>
            <span>Keep new data</span>
            <span className="text-xs font-normal opacity-80">Restores old data and combines both.</span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto w-full flex-col items-start py-3 text-left"
            disabled={pending}
            onClick={() => void restore("replace")}
          >
            <span>Delete new data</span>
            <span className="text-xs font-normal text-muted-foreground">Restores old data only.</span>
          </Button>
          <Button variant="ghost" className="w-full" disabled={pending} onClick={() => setStage("idle")}>
            Cancel
          </Button>
        </div>
      ) : null}

      {stage === "delete" ? (
        <div className="mt-3">
          <p className="text-sm">
            This deletes your old data now. Newer data stays.{" "}
            <span className="font-semibold">You cannot undo this.</span>
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
      <p className="text-sm text-muted-foreground">Your old data is hidden. Use the notice at the top to restore it.</p>
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
      <InfoNote
        heading={<p className="text-sm font-semibold text-danger">Delete all your data?</p>}
        note={
          <>
            <p>You stay signed in.</p>
            <p>
              During the {DELETION_GRACE_DAYS} days, you can restore your data. You can keep your new data with it,
              or replace your new data with it.
            </p>
            <p>After {DELETION_GRACE_DAYS} days, the app deletes it the next time you open the app.</p>
          </>
        }
      />
      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
        <li>Deletes workouts, plans, records, weigh-ins, measurements, skills and your exercises.</li>
        <li>Deletes from this phone and your account.</li>
        <li>
          <span className="font-semibold text-foreground">You have {DELETION_GRACE_DAYS} days to restore it.</span> Then you
          cannot undo it.
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Tip: download a backup first.</p>
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

/**
 * A guest's version of "Delete all my data". No week to restore: there is no
 * account to keep an archive in, and the text says so before the word is typed.
 */
export function ClearThisPhone() {
  const clearGuestData = useWorkoutStore((state) => state.clearGuestData);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return <p className="text-center text-sm text-muted-foreground" role="status">Data on this phone is deleted.</p>;
  }

  if (!confirming) {
    return (
      <Button
        variant="outline"
        className="w-full border-danger/40 text-danger"
        onClick={() => setConfirming(true)}
      >
        Delete data on this phone
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-danger/40 p-4">
      <p className="text-sm font-semibold text-danger">Delete data on this phone?</p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li>Deletes your workouts, plans, records and weigh-ins.</li>
        <li>No other copy exists.</li>
        <li className="font-semibold text-foreground">You cannot undo this.</li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Tip: download a backup first.</p>
      <ConfirmWord value={typed} onChange={setTyped} />
      <div className="mt-3 flex gap-2">
        <Button
          variant="danger"
          className="flex-1"
          disabled={!confirmedWord(typed)}
          onClick={() => {
            clearGuestData();
            setDone(true);
          }}
        >
          Delete
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setConfirming(false);
            setTyped("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
