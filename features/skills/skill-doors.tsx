"use client";

import { ChevronRight, Swords, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { useWorkoutStore } from "@/features/workout/workout-store";
import { usesBodyweight } from "@/lib/workout-helpers";
import { cn } from "@/lib/utils";

/*
 * Skills has no tab. It is found — the way the System reveals a window in
 * Solo Leveling — through one of three doors:
 *
 *   1. The rank crest: its Status sheet has a Skills row. Until Skills has
 *      been found, the crest breathes a few times on each visit, very faintly.
 *   2. A [SYSTEM] notice, once, after the first bodyweight exercise or hold.
 *   3. A small gate, drawn in a hairline, under the last card on Today.
 *
 * Hidden is not unreachable: every door is a real button with a spoken name,
 * so a screen reader or keyboard finds Skills like anything else. Opening
 * Skills once marks it found (on this device), which quiets doors 1 and 2.
 */

const FOUND_KEY = "arise.skills.found";
const NOTICE_KEY = "arise.skills.notice-dismissed";

const listeners = new Set<() => void>();

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Unreadable storage: treat as found, so nothing nags on every visit.
    return true;
  }
}

function setFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Not remembered; fine.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Server renders "found": no hint, no notice, nothing to hydrate away. */
function useFlag(key: string) {
  return useSyncExternalStore(subscribe, () => readFlag(key), () => true);
}

export function useSkillsFound() {
  return useFlag(FOUND_KEY);
}

/** Called by the Skills page: whichever door you came through, it is found now. */
export function useMarkSkillsFound() {
  useEffect(() => setFlag(FOUND_KEY), []);
}

/** Door 1: a row in the rank crest's Status sheet. */
export function StatusSkillsDoor({ onNavigate }: { onNavigate?: () => void }) {
  const goals = useWorkoutStore((state) => state.skillGoals);
  return (
    <Link
      href="/skills"
      onClick={onNavigate}
      className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl bg-hi px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Swords className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-medium">Skills</span>
        <span className="block text-[13px] text-muted-foreground">
          {goals.length > 0 ? `${goals.length} ${goals.length === 1 ? "skill" : "skills"} in progress` : "Learn hard exercises in levels"}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/**
 * Door 2: the System speaks, once. Only after something bodyweight or held has
 * been logged — the moment a skill means anything — and never again once
 * Skills is found or the notice is closed.
 */
export function SystemSkillsNotice() {
  const found = useSkillsFound();
  const dismissed = useFlag(NOTICE_KEY);
  const logs = useWorkoutStore((state) => state.logs);
  const setLogs = useWorkoutStore((state) => state.setLogs);
  const templates = useWorkoutStore((state) => state.templates);

  const earned =
    setLogs.some((row) => (row.durationSeconds ?? 0) > 0 && !(row.distanceKm ?? 0)) ||
    logs.some((log) => usesBodyweight(templates.find((template) => template.id === log.workoutId)));

  if (found || dismissed || !earned) {
    return null;
  }

  return (
    <div role="status" className="system-pop notice-line">
      <p className="min-w-0 flex-1">
        <span className="mr-1.5 text-[11.5px] font-semibold tracking-[0.05em] text-muted-foreground">[SYSTEM]</span>
        A new window has opened.{" "}
        <Link href="/skills" className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Skills
        </Link>
      </p>
      <button
        type="button"
        aria-label="Close the System message"
        onClick={() => setFlag(NOTICE_KEY)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** An arch with a door in it, in a 16 × 16 hairline. */
const GATE = "M3 14.5 V6.5 A5 5 0 0 1 13 6.5 V14.5 M5.5 14.5 V7.5 A2.5 2.5 0 0 1 10.5 7.5 V14.5 M1.5 14.5 H14.5 M8 5 V6";

/**
 * Door 3: a faint gate below the last card, for anyone who scrolls that far.
 * Still, so it costs nothing while the page sits open.
 */
export function SkillsGate({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center", className)}>
      <Link
        href="/skills"
        aria-label="Open the Skills page"
        className="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg viewBox="0 0 16 16" className="h-7 w-7" aria-hidden>
          <path d={GATE} fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
