"use client";

import { Dumbbell, ShieldCheck, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/use-auth";
import { isSupabaseConfigured } from "@/lib/supabase";

const points = [
  { icon: Dumbbell, label: "Plan a session once, run it for months" },
  { icon: Zap, label: "Log a set in one tap, rest timer included" },
  { icon: ShieldCheck, label: "Your history follows you to any phone" }
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
          <p className="flex items-center gap-2 text-sm font-semibold text-brand">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            GymFlow
          </p>
          <h1 className="mt-3 font-display text-[38px] font-extrabold leading-[0.98] tracking-[-0.025em]">
            Lift. Log it.<br />Leave.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Today's session opens first. Sets take one tap. Everything else waits until you are
            off the floor.
          </p>
        </div>
        <div className="space-y-3">
          {points.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3">
              <Icon className="h-5 w-5 shrink-0 text-brand" />
              <p className="text-sm font-medium">{label}</p>
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
