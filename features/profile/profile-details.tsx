"use client";

import { Archive, Compass, Download, LogIn, LogOut, Target, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow, ListSheetRow, SheetDone, SheetRows } from "@/components/ui/list";
import { takeAccountRemovedNotice } from "@/features/auth/account-removed";
import { useAuth } from "@/features/auth/use-auth";
import { useDietStoreApi } from "@/features/diet/diet-store";
import { RankArc } from "@/features/home/hunter-rank";
import { ClearThisPhone, DataDeletion } from "@/features/profile/data-deletion";
import { useStartTour } from "@/features/tour/tour";
import { useTour } from "@/features/tour/tour-store";
import { DetailedTimingRow, DistanceRow, ThemeRow } from "@/features/profile/theme-toggle";
import { InstallRow } from "@/features/pwa/install-card";
import { RemindersRow } from "@/features/pwa/reminders";
import { RestAlertsRow } from "@/features/pwa/rest-alerts";
import { retrySync, useSyncStatus } from "@/features/workout/sync-status";
import { useWorkoutStore, useWorkoutStoreApi } from "@/features/workout/workout-store";
import { hasGoal } from "@/lib/body-metrics";
import { buildDietExport, parseDietBackupText, type ParsedDietBackup } from "@/lib/diet-backup";
import {
  EMPTY_WORKOUT_BACKUP,
  ImportError,
  importSummary,
  parseExportText,
  type ParsedBackup
} from "@/lib/import-backup";
import { shareOrDownloadJson } from "@/lib/download";
import { buildPRLedger, buildStreaks } from "@/lib/progress-trends";
import { buildExport, syncErrorKind, syncErrorMessage } from "@/lib/sync";
import { todayKey } from "@/lib/utils";

/** user_metadata is provider-controlled and typed `any` — narrow, don't cast. */
function metadataName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

// -- header ---------------------------------------------------------------------

/** Who this is, the rank, and three numbers that say what they have done. */
export function ProfileHeader() {
  const { user } = useAuth();
  const profile = useWorkoutStore((state) => state.profile);
  const logs = useWorkoutStore((state) => state.logs);
  const activeDate = useWorkoutStore((state) => state.activeDate);

  // In the tour, the sample's own name and address, not the signed-in ones.
  const touring = useTour().active;
  const guest = !user && !touring;
  const name = touring ? profile.name : guest ? "Guest" : metadataName(user?.user_metadata?.full_name) ?? profile.name;
  const email = touring ? profile.email : guest ? "Not signed in" : user?.email ?? profile.email;

  const stats = useMemo(() => {
    if (logs.length === 0) {
      return undefined;
    }
    const first = logs.map((log) => log.date).sort()[0];
    return {
      sessions: new Set(logs.map((log) => log.date)).size,
      streak: buildStreaks(logs, { start: first, end: activeDate }).currentWeeks,
      records: buildPRLedger(logs).length
    };
  }, [activeDate, logs]);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="truncate font-heading text-[36px] leading-[1.05]">{name ||"No name yet"}</p>
          <p className="mt-0.5 select-text truncate text-[13.5px] text-muted-foreground">{email || "—"}</p>
        </div>
        {guest ? (
          <Button asChild size="sm" variant="secondary" className="shrink-0">
            <Link href="/login">Sign in</Link>
          </Button>
        ) : null}
      </div>

      <RankArc name={name} />

      {stats ? (
        <dl className="grid grid-cols-3 text-center">
          <Stat label="Workouts" value={stats.sessions} />
          <Stat label="Week streak" value={stats.streak} />
          <Stat label="Records" value={stats.records} />
        </dl>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Your stats show here after your first workout.</p>
      )}
    </section>
  );
}

/** A number and what it counts, with no box: the spacing says they belong together. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-px text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-medium tabular-nums tracking-[-0.02em]">{value}</dd>
    </div>
  );
}

// -- goal ----------------------------------------------------------------------

/** The bodyweight Progress draws a line at, and dates an estimate to. */
export function GoalRow() {
  const goal = useWorkoutStore((state) => state.profile.goalWeightKg);
  return (
    <ListSheetRow icon={Target} label="Goal weight" value={goal ? `${goal} kg` : "Not set"}>
      <GoalForm />
      <SheetDone />
    </ListSheetRow>
  );
}

function GoalForm() {
  const profile = useWorkoutStore((state) => state.profile);
  const setProfile = useWorkoutStore((state) => state.setProfile);
  // Null is "untouched", so the field still mirrors the store when a sync or an
  // import lands after mount. Once typed in, what was typed wins — including the
  // empty string, which is how a goal is removed.
  const [goalDraft, setGoalDraft] = useState<string | null>(null);

  return (
    // Written on change rather than behind a save button: it is one number,
    // and blank has to mean "no goal".
    <label className="block">
      <span className="text-[13.5px] font-medium text-muted-foreground">Goal bodyweight (kg)</span>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.1}
        className="mt-2"
        placeholder="No goal"
        value={goalDraft ?? (profile.goalWeightKg ? String(profile.goalWeightKg) : "")}
        onChange={(event) => {
          const raw = event.target.value;
          setGoalDraft(raw);
          // Anything that is not a real, positive weight clears the goal
          // rather than being stored: `Number("")` is 0 and `Number("kg")`
          // is NaN, and neither is a target anyone set.
          const parsed = Number(raw);
          setProfile({ goalWeightKg: hasGoal(parsed) ? parsed : undefined });
        }}
      />
      <span className="mt-2 block text-[13px] text-muted-foreground">
        Shows on the bodyweight chart. Clear it for no goal.
      </span>
    </label>
  );
}

// -- app ------------------------------------------------------------------------

export function AppSection() {
  return (
    <ListGroup title="App">
      <InstallRow />
      <ThemeRow />
      <DistanceRow />
      <DetailedTimingRow />
      <RestAlertsRow />
      <RemindersRow />
    </ListGroup>
  );
}

// -- your data --------------------------------------------------------------------

/**
 * A failed sync stays on the page, not behind a row: it is the one thing here
 * that needs attention without being asked for. `text-danger` sits on the ground
 * and the border carries the colour.
 */
function SyncError() {
  const { error } = useSyncStatus();

  if (!error) {
    return null;
  }

  // Since the subscriber attaches before the read, a failed load no longer
  // stops this device saving — it stops it *receiving*. That is a different
  // sentence and the only one of the two worth a button.
  const stalled = error.stage === "load";
  return (
    <div className="rounded-3xl border border-danger/40 p-4" role="alert">
      <p className="text-sm font-semibold text-danger">
        {stalled ? "Cannot read your account" : "Last change not saved to your account"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {stalled
          ? "New data still saves, but data from other devices does not show."
          : "It is on this phone and sends with your next change."}
      </p>
      <p className="mt-1 select-text break-words text-xs text-muted-foreground">{error.message}</p>
      {stalled ? (
        <Button variant="secondary" className="mt-3 w-full" onClick={retrySync}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function DataSection() {
  const startTour = useStartTour();
  return (
    <div className="space-y-3">
      <SyncError />
      <ListGroup title="Data" tour="profile-data">
        <BackupRow />
        {/* The tour again, any time: the sample swaps in, and your data comes back after. */}
        <ListRow icon={Compass} label="Take the tour" onClick={startTour} />
      </ListGroup>
    </div>
  );
}

function BackupRow() {
  const signedIn = Boolean(useAuth().user);
  const { lastSyncedAt } = useSyncStatus();
  // `hydrateRemote` is the sync path's merge — reconcile(local, incoming), which
  // is deletion-blind. Reusing it is what makes an import unable to destroy
  // anything: a stale backup adds what it holds and removes nothing.
  const hydrateRemote = useWorkoutStore((state) => state.hydrateRemote);
  // Read at click time rather than subscribing this row to the whole store.
  const store = useWorkoutStoreApi();
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<ParsedBackup | null>(null);
  const [stagedDiet, setStagedDiet] = useState<ParsedDietBackup | undefined>();
  const dietStore = useDietStoreApi();
  const fileInput = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const diet = parseDietBackupText(text);
      setStagedDiet(diet);
      try {
        setStaged(parseExportText(text));
      } catch (cause) {
        // Someone who only uses Diet has a backup with no workout rows in it,
        // which is a good file, so restore its diet and add no workouts.
        if (!diet || !(cause instanceof ImportError)) {
          throw cause;
        }
        setStaged({ state: EMPTY_WORKOUT_BACKUP, counts: {} });
      }
    } catch (cause) {
      setError(cause instanceof ImportError ? cause.message : "Could not read that file.");
    }
  };

  // Time only, no date: this resets on reload, so it is always today.
  const savedAt = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : undefined;

  return (
    <ListSheetRow
      icon={Archive}
      label="Backup and restore"
      value={signedIn ? (savedAt ? `Saved ${savedAt}` : undefined) : "On this phone"}
    >
      <SheetRows>
        <ListRow
          icon={Download}
          label="Download a backup"
          hint="A file with all your data."
          onClick={() => {
            setError(null);
            const failed = (cause: unknown) =>
              setError(cause instanceof Error ? cause.message : "Could not make the backup.");
            try {
              // Built and handed over in the same tap: the share sheet needs it.
              shareOrDownloadJson(`arise-${todayKey()}.json`, { ...buildExport(store.getState()), diet: buildDietExport(dietStore.getState()) }, "Arise backup").catch(failed);
            } catch (cause) {
              failed(cause);
            }
          }}
        />

        {/* The other half of the backup. Without it "yours to keep" is a
            one-way door: the file downloads and nothing can read it back. */}
        <ListRow
          icon={Upload}
          label="Restore a backup"
          hint="Adds data from a backup file. Deletes nothing."
          onClick={() => fileInput.current?.click()}
        />
      </SheetRows>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice still fires a change.
          event.target.value = "";
          if (file) {
            void readFile(file);
          }
        }}
      />

      {/* Counted before it is applied, not after. The merge is safe, but a
          wrong file is still a wrong file and the user is the only one who
          can tell — so the numbers go in front of the decision. */}
      {staged ? (
        <div className="mt-3 border-t border-sep pt-3 text-sm">
          <InfoNote
            heading={
              <>
                <p>
                  This file contains <span className="tabular-nums">{importSummary({ ...staged.counts, ...stagedDiet?.counts })}</span>.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">The app adds it to your data and deletes nothing.</p>
              </>
            }
            note={<p>If an item is in both, the app keeps the one from the file.</p>}
          />
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                hydrateRemote(staged.state, "copy");
                if (stagedDiet) {
                  dietStore.getState().hydrateDiet(stagedDiet.state);
                }
                setStaged(null);
              }}
            >
              Restore
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setStaged(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-center text-sm text-danger">{error}</p> : null}

      {signedIn ? (
        savedAt ? (
          <p className="mt-3 text-[13px] text-muted-foreground" role="status">
            Saved to your account at {savedAt}.
          </p>
        ) : null
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground" role="status">
          Saved on this phone only.{" "}
          <Link href="/login" className="font-semibold text-foreground underline underline-offset-2">
            Sign in
          </Link>{" "}
          to save it in your account.
        </p>
      )}
    </ListSheetRow>
  );
}

// -- account ----------------------------------------------------------------------

/**
 * Last on the page. The action people use is a normal row. The one that ends
 * things is a quiet line below it, apart from the group: it gets its red and its
 * typed word only inside the sheet, once someone has come looking for it.
 */
export function AccountSection() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why this device is suddenly signed out, when the sync layer did it: the
  // account was deleted on the server. Read when signed out, so the flag set
  // just before that sign-out is already there; shown until the next sign-in.
  const [accountRemoved, setAccountRemoved] = useState(false);
  useEffect(() => {
    if (user) {
      setAccountRemoved(false);
    } else if (takeAccountRemovedNotice()) {
      setAccountRemoved(true);
    }
  }, [user]);

  const signOut = async () => {
    setPending(true);
    setError(null);
    try {
      await logout();
    } catch (cause) {
      // Never the raw text — an auth error can quote the request. Offline is the
      // one case worth its own sentence here.
      setError(
        syncErrorKind(cause) === "offline"
          ? "Could not sign out. Check your internet connection."
          : syncErrorMessage(cause)
      );
    }
    // Signed out, the page stays: it becomes the guest's.
    setPending(false);
  };

  if (!user) {
    return (
      <div className="space-y-3">
        {accountRemoved ? (
          <p className="rounded-3xl border border-danger/40 p-4 text-sm text-danger" role="alert">
            Your account was removed. Sign in again to start fresh.
          </p>
        ) : null}
        <ListGroup title="Account">
          <ListRow
            icon={LogIn}
            label="Sign in with Google"
            hint="Your data is only on this phone. Sign in to keep it on all your devices."
            onClick={() => router.push("/login")}
          />
        </ListGroup>
        <ClearThisPhone />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ListGroup title="Account">
        <ListRow
          icon={LogOut}
          label={pending ? "Signing out…" : "Sign out"}
          disabled={pending}
          noChevron
          onClick={() => void signOut()}
        />
      </ListGroup>
      {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
      <DataDeletion />
    </div>
  );
}
