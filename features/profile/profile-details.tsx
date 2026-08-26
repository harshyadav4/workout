"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/use-auth";
import { retrySync, useSyncStatus } from "@/features/workout/sync-status";
import { useWorkoutStore, useWorkoutStoreApi } from "@/features/workout/workout-store";
import { buildExport, type SyncableState } from "@/lib/sync";
import { todayKey } from "@/lib/utils";

/** user_metadata is provider-controlled and typed `any` — narrow, don't cast. */
function metadataName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-3xl bg-secondary/50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold">{value || "—"}</p>
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
      <div className="rounded-3xl border border-danger/40 p-4" role="alert">
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

/**
 * Hands the user their own data back as JSON. Local-first means the durable copy
 * is theirs already; this is the only way to get it off the two devices holding
 * it. The payload itself is built in `lib/sync` — this is only the download.
 */
function downloadExport(state: SyncableState) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify(buildExport(state), null, 2)], { type: "application/json" })
  );
  link.download = `gymflow-${todayKey()}.json`;

  // iOS Safari — which is the whole point of this app — ignores a click on a
  // detached anchor, and revoking the object URL in the same tick cancels the
  // download before it starts.
  // ponytail: the blob is left for unload to collect. One file per deliberate
  // tap is not a leak worth a timer; revoke on a `load` listener if that changes.
  document.body.append(link);
  link.click();
  link.remove();
}

export function ProfileDetails() {
  const { user, logout } = useAuth();
  const profile = useWorkoutStore((state) => state.profile);
  // Read at click time rather than subscribing this card to the whole store.
  const store = useWorkoutStoreApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Card>
      <CardContent className="mt-0 space-y-3">
        {/* Google fills one of these; the profiles trigger stores the same value. */}
        <Field label="Name" value={metadataName(user?.user_metadata?.full_name) ?? profile.name} />
        <Field label="Email" value={user?.email ?? profile.email} />

        <SyncStatus />

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setError(null);
            try {
              downloadExport(store.getState());
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not build the export.");
            }
          }}
        >
          Export my data
        </Button>

        <Button
          variant="secondary"
          className="w-full"
          disabled={pending}
          onClick={() => void signOut()}
        >
          {pending ? "Signing out…" : "Sign out"}
        </Button>
        {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
