"use client";

import { ThemeProvider } from "next-themes";

import { AuthGuard } from "@/features/auth/auth-guard";
import { AuthProvider } from "@/features/auth/use-auth";
import { SupabaseSync } from "@/features/workout/supabase-sync";
import { WorkoutStoreProvider } from "@/features/workout/workout-store";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="dark">
      <AuthProvider>
        <WorkoutStoreProvider>
          <SupabaseSync />
          <AuthGuard>{children}</AuthGuard>
        </WorkoutStoreProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
