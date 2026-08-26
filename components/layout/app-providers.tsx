"use client";

import { AuthGuard } from "@/features/auth/auth-guard";
import { AuthProvider } from "@/features/auth/use-auth";
import { SupabaseSync } from "@/features/workout/supabase-sync";
import { WorkoutStoreProvider } from "@/features/workout/workout-store";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WorkoutStoreProvider>
        <SupabaseSync />
        <AuthGuard>{children}</AuthGuard>
      </WorkoutStoreProvider>
    </AuthProvider>
  );
}
