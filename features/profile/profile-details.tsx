"use client";

import { ChevronRight, Compass, Download, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/use-auth";
import { DataDeletion } from "@/features/profile/data-deletion";
import { useStartTour } from "@/features/tour/tour";
import { useTour } from "@/features/tour/tour-store";
import { DetailedTimingToggle, DistanceUnitToggle, ThemeToggle } from "@/features/profile/theme-toggle";
import { InstallCard } from "@/features/pwa/install-card";
import { retrySync, useSyncStatus } from "@/features/workout/sync-status";
import { useWorkoutStore, useWorkoutStoreApi } from "@/features/workout/workout-store";
import { hasGoal } from "@/lib/body-metrics";
import {
  ImportError,
  importSummary,
  parseExportText,
  type ParsedBackup
} from "@/lib/import-backup";
import { downloadJson } from "@/lib/download";
import { buildPRLedger, buildStreaks } from "@/lib/progress-trends";
import { buildExport } from "@/lib/sync";
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
  const name = touring ? profile.name : metadataName(user?.user_metadata?.full_name) ?? profile.name;
  const email = touring ? profile.email : user?.email ?? profile.email;
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
        </div>

        {stats ? (
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Sessions" value={stats.sessions} hint="days you trained" />
            <Stat label="Week streak" value={stats.streak} hint="weeks in a row with training" />
            <Stat label="Records" value={stats.records} hint="times you beat your best" />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Your sessions, streak and records show here after your first session.</p>
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
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
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
          Shown on your bodyweight chart, with an estimated date. Empty the field to remove it.
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
          {stalled ? "Couldn't read your account" : "Last change hasn't reached the cloud"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {stalled
            ? "What you log here is still being saved to your account. Anything recorded on your other devices is missing until this succeeds."
            : "It's saved on this device and will be sent again with your next change."}
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
        hint="Saves all your data to one file on this phone."
        onClick={() => {
          setError(null);
          try {
            downloadJson(`arise-${todayKey()}.json`, buildExport(store.getState()));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not build the backup.");
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
        label="Restore from a backup"
        hint="Adds what a backup file holds. Nothing you have is deleted."
        onClick={() => fileInput.current?.click()}
      />

      {/* Counted before it is applied, not after. The merge is safe, but a
          wrong file is still a wrong file and the user is the only one who
          can tell — so the numbers go in front of the decision. */}
      {staged ? (
        <div className="rounded-xl bg-muted p-3 text-sm">
          <p>
            This file holds <span className="tabular-nums">{importSummary(staged.counts)}</span>.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Restoring merges — nothing you already have is deleted. Where both sides have the same
            entry, the file wins.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                hydrateRemote(staged.state);
                setStaged(null);
              }}
            >
              Restore it
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setStaged(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-center text-sm text-danger">{error}</p> : null}

      <SyncStatus />
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
        hint="A short walk through the app, with sample data. Your own data is safe."
        onClick={startTour}
      />
    </Section>
  );
}

// -- account ----------------------------------------------------------------------

/** Last on the page, and apart from everything else: the actions that end things. */
export function AccountSection() {
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setPending(true);
    setError(null);
    try {
      await logout();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out. Check your connection.");
      setPending(false);
    }
  };

  return (
    <>
      <InstallCard />
      <Section title="Account">
        <Button variant="outline" className="w-full" disabled={pending} onClick={() => void signOut()}>
          {pending ? "Signing out…" : "Sign out"}
        </Button>
        {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
        <DataDeletion />
      </Section>
    </>
  );
}
