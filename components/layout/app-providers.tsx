"use client";

import { AuthGuard } from "@/features/auth/auth-guard";
import { AuthProvider } from "@/features/auth/use-auth";
import { AppBadge } from "@/features/pwa/app-badge";
import { SupabaseSync } from "@/features/workout/supabase-sync";
import { WorkoutStoreProvider } from "@/features/workout/workout-store";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WorkoutStoreProvider>
        <SupabaseSync />
        <AppBadge />
        <AuthGuard>{children}</AuthGuard>
      </WorkoutStoreProvider>
    </AuthProvider>
  );
}
