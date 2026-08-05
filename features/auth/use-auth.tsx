"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // getSession resolves from localStorage immediately; onAuthStateChange then
    // keeps it current across refresh, sign-out and other tabs.
    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    signIn: async () => {
      if (!supabase) {
        throw new Error("Supabase is not configured");
      }
      // Redirect rather than popup: popups are blocked by default on mobile
      // browsers, which is where this app is used.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` }
      });
      if (error) {
        throw error;
      }
    },
    // Checked and thrown, like signIn above. The error was being discarded, so
    // an offline sign-out did nothing and said nothing — and with the optional
    // chain, an unconfigured Supabase resolved as success.
    logout: async () => {
      if (!supabase) {
        throw new Error("Supabase is not configured");
      }
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

export { isSupabaseConfigured };
