"use client";

import { Dumbbell, ShieldCheck, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/use-auth";
import { isSupabaseConfigured } from "@/lib/supabase";

const points = [
  { icon: Dumbbell, label: "Today’s workout opens first" },
  { icon: Zap, label: "Fast tap-first logging in the gym" },
  { icon: ShieldCheck, label: "Your plan follows you to any device" }
];

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn } = useAuth();

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [router, user]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-primary">GymFlow</p>
          <h1 className="mt-2 text-3xl font-bold">Train faster on mobile.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open the app, see today, and log sets with one hand.
          </p>
        </div>
        <div className="space-y-3">
          {points.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3">
              <Icon className="h-5 w-5 text-primary" />
              <p className="text-sm">{label}</p>
            </div>
          ))}
        </div>
        <Button className="mt-6 w-full" size="lg" onClick={() => void signIn()}>
          Continue with Google
        </Button>
        {!isSupabaseConfigured ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign-in.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
