"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/use-auth";
import { useWorkoutStore } from "@/features/workout/workout-store";

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

export function ProfileDetails() {
  const { user, logout } = useAuth();
  const profile = useWorkoutStore((state) => state.profile);
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
