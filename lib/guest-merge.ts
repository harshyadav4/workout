import type { RemoteState } from "@/lib/sync";
import type { ProfileInfo } from "@/lib/types";

/**
 * What to do, at sign-in, with the training a guest did on this phone.
 *
 * Never silently both ways: a guest copy goes into an empty account by itself
 * (there is nothing to mix it with), into an account with history only when
 * the user says so (it could be someone else's on a shared phone), and
 * nowhere when there is nothing in it or this account already said no.
 *
 * Pure: the sync layer gathers the inputs, this decides.
 */

export type GuestMergeDecision = "nothing" | "move" | "ask";

/** The parts of a copy that count as training. */
interface CopyLike {
  logs: { date: string }[];
  sessionTemplates: unknown[];
  measurements: unknown[];
  scheduledSessions: { type: string }[];
  templates?: { isPreset: boolean }[];
  skillGoals?: unknown[];
}

export interface GuestCounts {
  /** Days with training logged. */
  sessions: number;
  weighIns: number;
  plans: number;
  total: number;
}

export function countCopy(copy: CopyLike): GuestCounts {
  const sessions = new Set(copy.logs.map((log) => log.date)).size;
  const weighIns = copy.measurements.length;
  const plans = copy.sessionTemplates.length;
  const extra =
    copy.scheduledSessions.filter((session) => session.type === "workout").length +
    (copy.templates ?? []).filter((template) => !template.isPreset).length +
    (copy.skillGoals ?? []).length;
  return { sessions, weighIns, plans, total: sessions + weighIns + plans + extra };
}

export function decideGuestMerge({
  guest,
  account,
  declined
}: {
  guest?: CopyLike;
  account: CopyLike;
  /** This account chose "Keep my account only" for the guest copy before. */
  declined: boolean;
}): GuestMergeDecision {
  if (!guest || countCopy(guest).total === 0 || declined) {
    return "nothing";
  }
  return countCopy(account).total === 0 ? "move" : "ask";
}

/** "5 sessions and 2 weigh-ins" — the line the question shows. */
export function describeCounts(counts: GuestCounts): string {
  const parts = [
    counts.sessions ? `${counts.sessions} ${counts.sessions === 1 ? "workout" : "workouts"}` : "",
    counts.plans ? `${counts.plans} ${counts.plans === 1 ? "plan" : "plans"}` : "",
    counts.weighIns ? `${counts.weighIns} ${counts.weighIns === 1 ? "weigh-in" : "weigh-ins"}` : ""
  ].filter(Boolean);
  if (parts.length === 0) {
    return "some data";
  }
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The guest copy as something the merge can take in. No profile: the account's
 * name and email come from the sign-in and must win. Body settings the account
 * lacks — height, goal weight, reminders — come along on `profile` only when
 * the caller passes the account's own profile to fill them into.
 */
export function guestAsIncoming(
  guest: RemoteState,
  accountProfile?: ProfileInfo
): RemoteState {
  const gp = guest.profile;
  const profile =
    accountProfile && gp
      ? {
          ...accountProfile,
          heightCm: accountProfile.heightCm || gp.heightCm,
          goalWeightKg: accountProfile.goalWeightKg ?? gp.goalWeightKg,
          weightCadence: accountProfile.weightCadence ?? gp.weightCadence,
          measurementCadence: accountProfile.measurementCadence ?? gp.measurementCadence
        }
      : undefined;

  return {
    // Presets ship with the app; only what the guest built is theirs.
    templates: guest.templates.filter((template) => !template.isPreset),
    sessionTemplates: guest.sessionTemplates,
    scheduledSessions: guest.scheduledSessions,
    logs: guest.logs,
    setLogs: guest.setLogs,
    measurements: guest.measurements,
    skillGoals: guest.skillGoals,
    profile,
    // The account's schedule wins when it has one (reconcile: remote ?? local).
    scheduleConfig: guest.scheduleConfig
  };
}
