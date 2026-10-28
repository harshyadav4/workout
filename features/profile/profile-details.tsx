"use client";

import { ChevronRight, Compass, Download, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { takeAccountRemovedNotice } from "@/features/auth/account-removed";
import { useAuth } from "@/features/auth/use-auth";
import { ClearThisPhone, DataDeletion } from "@/features/profile/data-deletion";
import { useStartTour } from "@/features/tour/tour";
import { useTour } from "@/features/tour/tour-store";
import { DetailedTimingToggle, DistanceUnitToggle, ThemeToggle } from "@/features/profile/theme-toggle";
import { RemindersCard } from "@/features/pwa/reminders";
import { RestAlertsToggle } from "@/features/pwa/rest-alerts";
import { retrySync, useSyncStatus } from "@/features/workout/sync-status";
import { useWorkoutStore, useWorkoutStoreApi } from "@/features/workout/workout-store";
import { hasGoal } from "@/lib/body-metrics";
import {
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

/**
 * A titled group, like a phone's settings screen: the title outside the card,
 * so the page reads as a list of sections rather than one long card that does
 * six jobs.
 */
export function Section({
  title,
  tour,
  children
}: {
  title: string;
  /** The tour's marker for this section (features/tour/tour-steps). */
  tour?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" data-tour={tour}>
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <Card>
        <CardContent className="mt-0 space-y-3">{children}</CardContent>
      </Card>
    </section>
  );
}

// -- header ---------------------------------------------------------------------

/** Who this is, and three numbers that say what they have done. */
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
  const initial = name?.trim()[0]?.toUpperCase() ?? email?.trim()[0]?.toUpperCase() ?? "?";

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
    <Card>
      <CardContent className="mt-0 space-y-4">
        <div className="flex items-center gap-4">
          <span
            className="key-quiet flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-2xl font-extrabold"
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[22px] font-extrabold leading-none tracking-tight">
              {name || "No name yet"}
            </p>
            <p className="mt-1.5 truncate text-sm text-muted-foreground">{email || "—"}</p>
          </div>
          {guest ? (
            <Button asChild size="sm" className="ml-auto shrink-0">
              <Link href="/login">Sign in</Link>
            </Button>
          ) : null}
        </div>

        {stats ? (
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Workouts" value={stats.sessions} hint="days trained" />
            <Stat label="Week streak" value={stats.streak} hint="weeks in a row" />
            <Stat label="Records" value={stats.records} hint="records set" />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Your stats show here after your first workout.</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A number with the one line that says what it counts. "Week streak: 1" next
 * to "Sessions: 242" read as a bug until the units were on the tile.
 */
function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="well flex flex-col rounded-lg p-3">
      {/* Two lines tall: a label that wraps on a narrow phone must not push
          its number below the others in the row. */}
      <dt className="min-h-8 text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-xl font-extrabold leading-none tabular-nums">{value}</dd>
      <dd className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</dd>
    </div>
  );
}

// -- goal ----------------------------------------------------------------------

/** The bodyweight Progress draws a line at, and dates an estimate to. */
export function GoalsSection() {
  const profile = useWorkoutStore((state) => state.profile);
  const setProfile = useWorkoutStore((state) => state.setProfile);
  // Null is "untouched", so the field still mirrors the store when a sync or an
  // import lands after mount. Once typed in, what was typed wins — including the
  // empty string, which is how a goal is removed.
  const [goalDraft, setGoalDraft] = useState<string | null>(null);

  return (
    <Section title="Your goal">
      {/* Written on change rather than behind a save button: it is one number,
          and blank has to mean "no goal". */}
      <label className="block rounded-xl bg-muted p-4">
        <span className="text-xs font-medium text-muted-foreground">Goal bodyweight (kg)</span>
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
        <span className="mt-2 block text-xs text-muted-foreground">
          Shows on the bodyweight chart. Clear it for no goal.
        </span>
      </label>
    </Section>
  );
}

// -- settings ---------------------------------------------------------------------

export function SettingsSection() {
  return (
    <Section title="Settings">
      <ThemeToggle />
      <DistanceUnitToggle />
      <DetailedTimingToggle />
      <RestAlertsToggle />
      <RemindersCard />
    </Section>
  );
}

// -- your data --------------------------------------------------------------------

/**
 * Whether the cloud copy is current. `text-danger` sits on the card rather than
 * on a `bg-secondary/50` fill: on the fill it measures 4.15:1 and fails, on the
 * card it is 4.67:1. The border carries the colour instead.
 */
function SyncStatus() {
  const { lastSyncedAt, error } = useSyncStatus();

  if (error) {
    // Since the subscriber attaches before the read, a failed load no longer
    // stops this device saving — it stops it *receiving*. That is a different
    // sentence and the only one of the two worth a button.
    const stalled = error.stage === "load";
    return (
      <div className="rounded-xl border border-danger/40 p-4" role="alert">
        <p className="text-sm font-semibold text-danger">
          {stalled ? "Cannot read your account" : "Last change not saved to your account"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {stalled
            ? "New data still saves, but data from other devices does not show."
            : "It is on this phone and sends with your next change."}
        </p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{error.message}</p>
        {stalled ? (
          <Button variant="secondary" className="mt-3 w-full" onClick={retrySync}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (!lastSyncedAt) {
    return null;
  }

  return (
    <p className="px-1 text-xs text-muted-foreground" role="status">
      {/* Time only, no date: this resets on reload, so it is always today. */}
      Saved to your account at{" "}
      {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </p>
  );
}

/** A row that opens or does something — a label, a hint, and a chevron. */
function ActionRow({
  icon: Icon,
  label,
  hint,
  onClick
}: {
  icon: typeof Download;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-muted px-4 py-3 text-left transition-colors active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

export function DataSection() {
  const signedIn = Boolean(useAuth().user);
  // `hydrateRemote` is the sync path's merge — reconcile(local, incoming), which
  // is deletion-blind. Reusing it is what makes an import unable to destroy
  // anything: a stale backup adds what it holds and removes nothing.
  const hydrateRemote = useWorkoutStore((state) => state.hydrateRemote);
  // Read at click time rather than subscribing this card to the whole store.
  const store = useWorkoutStoreApi();
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<ParsedBackup | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    setError(null);
    try {
      setStaged(parseExportText(await file.text()));
    } catch (cause) {
      setError(cause instanceof ImportError ? cause.message : "Could not read that file.");
    }
  };

  return (
    <Section title="Your data" tour="profile-data">
      <ActionRow
        icon={Download}
        label="Download a backup"
        hint="A file with all your data."
        onClick={() => {
          setError(null);
          const failed = (cause: unknown) =>
            setError(cause instanceof Error ? cause.message : "Could not make the backup.");
          try {
            // Built and handed over in the same tap: the share sheet needs it.
            shareOrDownloadJson(`arise-${todayKey()}.json`, buildExport(store.getState()), "Arise backup").catch(failed);
          } catch (cause) {
            failed(cause);
          }
        }}
      />

      {/* The other half of the backup. Without it "yours to keep" is a
          one-way door: the file downloads and nothing can read it back. */}
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
      <ActionRow
        icon={Upload}
        label="Restore a backup"
        hint="Adds data from a backup file. Deletes nothing."
        onClick={() => fileInput.current?.click()}
      />

      {/* Counted before it is applied, not after. The merge is safe, but a
          wrong file is still a wrong file and the user is the only one who
          can tell — so the numbers go in front of the decision. */}
      {staged ? (
        <div className="rounded-xl bg-muted p-3 text-sm">
          <InfoNote
            heading={
              <>
                <p>
                  This file contains <span className="tabular-nums">{importSummary(staged.counts)}</span>.
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
                hydrateRemote(staged.state);
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

      {error ? <p className="text-center text-sm text-danger">{error}</p> : null}

      {signedIn ? (
        <SyncStatus />
      ) : (
        <p className="px-1 text-xs text-muted-foreground" role="status">
          Saved on this phone only.{" "}
          <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          to save it in your account.
        </p>
      )}
    </Section>
  );
}

// -- help -------------------------------------------------------------------------

/** The tour again, any time: the sample swaps in, and your data comes back after. */
export function HelpSection() {
  const startTour = useStartTour();
  return (
    <Section title="Help">
      <ActionRow
        icon={Compass}
        label="Take the tour"
        hint="A short guide on sample data."
        onClick={startTour}
      />
    </Section>
  );
}

// -- account ----------------------------------------------------------------------

/** Last on the page, and apart from everything else: the actions that end things. */
export function AccountSection() {
  const { user, logout } = useAuth();
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
      <Section title="Account">
        {accountRemoved ? (
          <p className="rounded-xl border border-danger/40 p-4 text-sm text-danger" role="alert">
            Your account was removed. Sign in again to start fresh.
          </p>
        ) : null}
        <InfoNote
          heading={<p className="text-sm text-muted-foreground">Your data is on this phone only.</p>}
          note={
            <>
              <p>You use Arise without an account.</p>
              <p>Sign in to save your data in your account. Then it shows on all your devices.</p>
              <p>The data on this phone joins your account when you sign in.</p>
            </>
          }
        />
        <Button asChild className="w-full">
          <Link href="/login">Sign in with Google</Link>
        </Button>
        <ClearThisPhone />
      </Section>
    );
  }

  return (
    <Section title="Account">
      <Button variant="outline" className="w-full" disabled={pending} onClick={() => void signOut()}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
      <DataDeletion />
    </Section>
  );
}
