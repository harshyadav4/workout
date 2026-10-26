"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/use-auth";
import { DetailedTimingToggle, DistanceUnitToggle, FeedbackToggle, ThemeToggle } from "@/features/profile/theme-toggle";
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
import { buildExport } from "@/lib/sync";
import { todayKey } from "@/lib/utils";

/** user_metadata is provider-controlled and typed `any` — narrow, don't cast. */
function metadataName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Who this is: an initial, the name, the address. One block, not two grey boxes. */
function Identity({ name, email }: { name?: string; email?: string }) {
  const initial = name?.trim()[0]?.toUpperCase() ?? email?.trim()[0]?.toUpperCase() ?? "?";
  return (
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
  );
}

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
      Synced at{" "}
      {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </p>
  );
}

export function ProfileDetails() {
  const { user, logout } = useAuth();
  const profile = useWorkoutStore((state) => state.profile);
  // `hydrateRemote` is the sync path's merge — reconcile(local, incoming), which
  // is deletion-blind. Reusing it is what makes an import unable to destroy
  // anything: a stale backup adds what it holds and removes nothing.
  const hydrateRemote = useWorkoutStore((state) => state.hydrateRemote);
  const setProfile = useWorkoutStore((state) => state.setProfile);
  // Read at click time rather than subscribing this card to the whole store.
  const store = useWorkoutStoreApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<ParsedBackup | null>(null);
  // Null is "untouched", so the field still mirrors the store when a sync or an
  // import lands after mount. Once typed in, what was typed wins — including the
  // empty string, which the placeholder trick used for Height could not express.
  const [goalDraft, setGoalDraft] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    setError(null);
    try {
      setStaged(parseExportText(await file.text()));
    } catch (cause) {
      setError(
        cause instanceof ImportError ? cause.message : "Could not read that file."
      );
    }
  };

  const signOut = async () => {
    setPending(true);
    setError(null);
    try {
      await logout();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not sign out. Check your connection."
      );
      setPending(false);
    }
  };

  return (
    <>
    <InstallCard />
    <Card>
      <CardContent className="mt-0 space-y-3">
        {/* Google fills the name; the profiles trigger stores the same value. */}
        <Identity
          name={metadataName(user?.user_metadata?.full_name) ?? profile.name}
          email={user?.email ?? profile.email}
        />

        {/* Written on change rather than behind a save button: it is one number,
            and blank has to mean "no goal" — the Body card's save deliberately
            skips empty fields, which is right for readings and could never
            clear this. */}
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
            Drawn across the bodyweight chart on Progress. Empty the field to remove it.
          </span>
        </label>

        <SyncStatus />

        <ThemeToggle />

        <DistanceUnitToggle />

        <DetailedTimingToggle />

        <FeedbackToggle />

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            setError(null);
            try {
              downloadJson(`arise-${todayKey()}.json`, buildExport(store.getState()));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not build the export.");
            }
          }}
        >
          Export my data
        </Button>

        {/* The other half of the export. Without it "yours to keep" is a
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
        <Button variant="secondary" className="w-full" onClick={() => fileInput.current?.click()}>
          Import a backup
        </Button>

        {/* Counted before it is applied, not after. The merge is safe, but a
            wrong file is still a wrong file and the user is the only one who
            can tell — so the numbers go in front of the decision. */}
        {staged ? (
          <div className="rounded-xl bg-muted p-3 text-sm">
            <p>
              This file holds <span className="tabular-nums">{importSummary(staged.counts)}</span>.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Importing merges — nothing you already have is deleted. Where both sides have the
              same entry, the file wins.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  hydrateRemote(staged.state);
                  setStaged(null);
                }}
              >
                Merge it in
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setStaged(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <Button
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() => void signOut()}
        >
          {pending ? "Signing out…" : "Sign out"}
        </Button>
        {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
      </CardContent>
    </Card>
    </>
  );
}
