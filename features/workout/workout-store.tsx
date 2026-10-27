"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import type { PlanImport } from "@/lib/ai-plan";
import { upsertMeasurement } from "@/lib/body-metrics";
import { releaseUnusedMedia } from "@/lib/media";
import { reconcile } from "@/lib/reconcile";
import { isTouring } from "@/features/tour/tour-store";
import { finishTime } from "@/lib/session-time";
import { muscles, presetWorkouts } from "@/lib/seed-data";
import type {
  BodyMeasurement,
  BodyMetric,
  Muscle,
  PlannedExercise,
  PlannedSet,
  ProfileInfo,
  ScheduleConfig,
  ScheduledSession,
  ScheduleRule,
  SessionTemplate,
  SetLog,
  SkillGoal,
  SkillLevel,
  WorkoutLog,
  WorkoutTemplate
} from "@/lib/types";
import type { RemoteState } from "@/lib/sync";
import {
  buildScheduleSessions,
  mergeGeneratedSessions,
  moveSession,
  type MoveResult
} from "@/lib/schedule";
import {
  buildLogFromSession,
  loggedSetAt,
  buildSessionSummary,
  refreshUpcomingSessions,
  removeExerciseFromExercises,
  plannedExercisesFromTemplate,
  type PerformanceHistory,
  removeSetFromExercises
} from "@/lib/workout-helpers";
import { dateKey, todayKey, weekdayIndex } from "@/lib/utils";

interface WorkoutState {
  muscles: Muscle[];
  templates: WorkoutTemplate[];
  sessionTemplates: SessionTemplate[];
  scheduledSessions: ScheduledSession[];
  scheduleConfig?: ScheduleConfig;
  logs: WorkoutLog[];
  /** Per-set grain beneath `logs`. Written once, never edited. */
  setLogs: SetLog[];
  profile: ProfileInfo;
  measurements: BodyMeasurement[];
  /** Skills being climbed (lib/skills). Progress is read off setLogs, never stored. */
  skillGoals: SkillGoal[];
  activeDate: string;
  selectedMuscleId?: string;
  selectedSessionId?: string;
  /**
   * Which account the persisted copy belongs to. Local-only — never synced, and
   * the reason the offline-recovery push in `supabase-sync` cannot send one
   * user's workouts to another's account on a shared device.
   */
  owner?: string;
  addTemplate: (template: WorkoutTemplate) => boolean;
  createSessionTemplate: (template: SessionTemplate) => boolean;
  updateSessionTemplate: (id: string, template: SessionTemplate) => boolean;
  deleteSessionTemplate: (id: string) => void;
  /** Apply a checked "Build with AI" plan: templates, sessions, then the calendar. */
  importAiPlan: (plan: Pick<PlanImport, "templates" | "sessions" | "scheduleConfig">) => void;
  /** Attach a stored demo GIF to a custom exercise template. */
  setTemplateMedia: (templateId: string, mediaPath: string) => void;
  scheduleSession: (payload: {
    date: string;
    sessionTemplateId?: string;
    sessionName: string;
    exercises: PlannedExercise[];
    type?: "workout" | "rest";
    source?: "manual" | "repeat";
    rule?: ScheduleRule;
  }) => void;
  removeScheduledSession: (id: string) => void;
  moveScheduledSession: (id: string, toDate: string) => MoveResult;
  /** Today's session, built on the spot and started immediately. */
  startAdHocSession: (payload: { name: string; exercises: PlannedExercise[] }) => void;
  generateSchedule: (config: ScheduleConfig) => void;
  selectSession: (sessionId?: string) => void;
  startSession: (sessionId: string) => void;
  updateSessionSet: (
    sessionId: string,
    exerciseId: string,
    setId: string,
    patch: Partial<PlannedSet>
  ) => void;
  addSetToSession: (sessionId: string, exerciseId: string) => void;
  /** The rack was taken. Adds to a session already under way. */
  addExerciseToSession: (sessionId: string, exercises: PlannedExercise[]) => void;
  removeSetFromSession: (sessionId: string, exerciseId: string, setId: string) => void;
  /** Drops one exercise from today's session only. The plan keeps it. */
  removeExerciseFromSession: (sessionId: string, exerciseId: string) => void;
  setSelectedMuscle: (muscleId?: string) => void;
  logTodayWorkout: () => void;
  setActiveDate: (date: string) => void;
  setProfile: (patch: Partial<ProfileInfo>) => void;
  /**
   * Signed in: show this account's copy on this phone — the one saved here
   * before, or an empty one. Never another account's data, and never the
   * guest copy (moving that in is an explicit step, features/auth).
   */
  switchToAccount: (userId: string) => void;
  /** Signed out: show the guest copy. The account copy stays saved for the next sign-in. */
  switchToGuest: () => void;
  /** A guest's "Clear this phone": empty the guest copy. There is no account to archive it in. */
  clearGuestData: () => void;
  /**
   * The local half of "delete all my data": empty this device for a fresh
   * start, keeping the owner, the name and the pending-deletion stamp. The
   * data itself is in the archive by now (lib/archive.ts).
   */
  archiveLocal: (requestedAt: string) => void;
  /**
   * Bring the archive back. `merge` keeps what was logged since and adds the
   * archive to it; `replace` drops what was logged since and returns to the
   * archive exactly. Either way the pending deletion ends.
   */
  restoreArchive: (archive: RemoteState, mode: "merge" | "replace") => void;
  logMeasurement: (metric: BodyMetric, value: number, date?: string) => void;
  hydrateRemote: (payload: RemoteState) => void;
  /** Re-plan sessions not started yet from the latest logs (see refreshUpcomingSessions). */
  refreshUpcoming: () => void;
  addSkillGoal: (goal: SkillGoal) => void;
  removeSkillGoal: (id: string) => void;
  /**
   * A skill moved up a rung: put the new exercise in place of the rung(s)
   * below it in every session that has one. Opt-in from the Skills tab.
   */
  applySkillLevelToPlans: (payload: { replaceWorkoutIds: string[]; level: SkillLevel; template: WorkoutTemplate }) => number;
}

// v4 adds `owner`. v3 is not migrated on purpose: an untagged blob cannot be
// proved to belong to whoever signs in next, and adopting it on a shared device
// is the account bleed this whole mechanism exists to prevent. Anyone already
// synced gets their data back from the first read.
const STORAGE_KEY = "gymflow-state-v4";

/**
 * Guest mode keeps its own copy. One key for both was the shared-phone leak:
 * sign out, and the next person sees your history. Two keys, and signing out
 * is a switch, not a wipe — offline work is still there when you sign back in.
 */
export const GUEST_STORAGE_KEY = "gymflow-guest-v1";

/** Which copy was on screen, so a reload opens the same one. */
export const ACTIVE_STORAGE_KEY = "gymflow-active";
const RETIRED_STORAGE_KEY = "gymflow-state-v3";

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cloneExercise(exercise: PlannedExercise): PlannedExercise {
  return {
    ...exercise,
    sets: exercise.sets.map((setItem) => ({ ...setItem }))
  };
}

function exerciseFromSessionTemplate(
  template: SessionTemplate,
  history: PerformanceHistory
): PlannedExercise[] {
  return plannedExercisesFromTemplate(template, history);
}

/**
 * Sessions not started yet, re-planned from everything logged so far — so the
 * next one opens at what you last lifted. The same state back when nothing
 * moved, so callers can apply it freely without a write or a sync.
 */
function withFreshUpcoming<S extends Pick<WorkoutState, "scheduledSessions" | "sessionTemplates" | "logs" | "setLogs">>(
  state: S
): S {
  const scheduledSessions = refreshUpcomingSessions(
    state.scheduledSessions,
    state.sessionTemplates,
    { logs: state.logs, setLogs: state.setLogs },
    todayKey()
  );
  return scheduledSessions === state.scheduledSessions ? state : { ...state, scheduledSessions };
}

/** The end of a session being finished now — see finishTime. */
function sessionEnd(session: ScheduledSession): string {
  const logged = session.exercises.flatMap((exercise) =>
    exercise.sets
      .filter((setItem) => setItem.completed && setItem.completedAt)
      .map((setItem) => ({ at: setItem.completedAt as string, rest: exercise.restSeconds }))
  );
  const last = logged.reduce<{ at: string; rest?: number } | undefined>((latest, item) => (!latest || item.at > latest.at ? item : latest), undefined);
  return finishTime(new Date().toISOString(), logged.map((item) => item.at), last?.rest);
}

function createInitialState(): Omit<
  WorkoutState,
  | "addTemplate"
  | "createSessionTemplate"
  | "updateSessionTemplate"
  | "deleteSessionTemplate"
  | "importAiPlan"
  | "setTemplateMedia"
  | "scheduleSession"
  | "removeScheduledSession"
  | "moveScheduledSession"
  | "startAdHocSession"
  | "generateSchedule"
  | "selectSession"
  | "startSession"
  | "updateSessionSet"
  | "addSetToSession"
  | "addExerciseToSession"
  | "removeSetFromSession"
  | "removeExerciseFromSession"
  | "setSelectedMuscle"
  | "logTodayWorkout"
  | "setActiveDate"
  | "setProfile"
  | "switchToAccount"
  | "switchToGuest"
  | "clearGuestData"
  | "archiveLocal"
  | "restoreArchive"
  | "logMeasurement"
  | "hydrateRemote"
  | "refreshUpcoming"
  | "addSkillGoal"
  | "removeSkillGoal"
  | "applySkillLevelToPlans"
> {
  // A new account starts empty and lands in Home's `setup` state. `muscles` and
  // `presetWorkouts` are static reference data that ships with the app, not the
  // user's — they are never stored. The starter* fixtures in lib/seed-data.ts
  // are kept for local development and no longer handed to real accounts.
  return {
    muscles,
    templates: presetWorkouts,
    sessionTemplates: [],
    scheduledSessions: [],
    scheduleConfig: undefined,
    logs: [],
    setLogs: [],
    profile: { name: "", email: "", heightCm: 0, weightKg: 0 },
    measurements: [],
    skillGoals: [],
    activeDate: todayKey(),
    selectedMuscleId: undefined,
    selectedSessionId: undefined
  };
}

/**
 * The save, scheduled rather than done: the next task after the action, so
 * React has painted the tap before the whole state is turned into a string
 * and written (a year of sets is about a megabyte — tens of milliseconds on
 * a phone, and it sat inside every tap). A run of taps in one frame collapses
 * into one write. Every read of a saved copy, and the page going away, flush
 * it first, so nothing ever observes storage behind the screen.
 */
let pendingSave: { key: string; state: WorkoutState } | undefined;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

function persist(state: WorkoutState) {
  if (typeof window === "undefined") {
    return;
  }
  // An owner means an account's copy; no owner is the guest's.
  const key = state.owner ? STORAGE_KEY : GUEST_STORAGE_KEY;
  // Signing in or out mid-tick: the other copy's write lands under its own key.
  if (pendingSave && pendingSave.key !== key) {
    flushPersist();
  }
  pendingSave = { key, state };
  if (pendingTimer === undefined) {
    pendingTimer = setTimeout(flushPersist, 0);
  }
}

/** Writes the save that is waiting, if any. Safe to call at any time. */
export function flushPersist() {
  if (pendingTimer !== undefined) {
    clearTimeout(pendingTimer);
    pendingTimer = undefined;
  }
  if (!pendingSave) {
    return;
  }
  const { key, state } = pendingSave;
  pendingSave = undefined;
  write(key, state);
}

function write(key: string, state: WorkoutState) {
  try {
    writeUnchecked(key, state);
  } catch (error) {
    // Quota or private mode. The state on screen is still right and the sync
    // layer still has it; what is lost is the copy for the next reload. This
    // used to throw out of whichever action flushed it — including the
    // account switch, which had already moved the active-copy marker.
    console.warn("[workout-store] could not save to this device", error);
  }
}

function writeUnchecked(key: string, state: WorkoutState) {
  localStorage.setItem(
    key,
    JSON.stringify({
      muscles: state.muscles,
      templates: state.templates,
      sessionTemplates: state.sessionTemplates,
      scheduledSessions: state.scheduledSessions,
      scheduleConfig: state.scheduleConfig,
      logs: state.logs,
      setLogs: state.setLogs,
      profile: state.profile,
      measurements: state.measurements,
      skillGoals: state.skillGoals,
      activeDate: state.activeDate,
      selectedMuscleId: state.selectedMuscleId,
      selectedSessionId: state.selectedSessionId,
      owner: state.owner
    })
  );
}

/** A saved copy, parsed, or undefined when there is none or it is damaged. */
function readSaved(key: string): Partial<WorkoutState> | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  flushPersist();
  return parseSaved(localStorage.getItem(key));
}

function parseSaved(raw: string | null): Partial<WorkoutState> | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as Partial<WorkoutState>;
  } catch {
    return undefined;
  }
}

/** Accounts that chose "Keep my account only" for this phone's guest copy. */
const GUEST_DECLINED_KEY = "gymflow-guest-declined";

/**
 * The guest copy as the merge takes it in — or undefined when there is none.
 * Read from storage, not the screen: at sign-in the screen already shows the
 * account's copy.
 */
export function readGuestCopy(): RemoteState | undefined {
  const saved = readSaved(GUEST_STORAGE_KEY);
  if (!saved || saved.owner) {
    return undefined;
  }
  return savedAsIncoming(saved);
}

/** A saved copy in the shape `reconcile` takes in. */
function savedAsIncoming(saved: Partial<WorkoutState>): RemoteState {
  return {
    templates: saved.templates ?? [],
    sessionTemplates: saved.sessionTemplates ?? [],
    scheduledSessions: saved.scheduledSessions ?? [],
    logs: saved.logs ?? [],
    setLogs: saved.setLogs ?? [],
    measurements: saved.measurements ?? [],
    skillGoals: saved.skillGoals,
    profile: saved.profile,
    scheduleConfig: saved.scheduleConfig
  };
}

/** After the guest copy has moved into an account: so it is never added twice. */
export function clearGuestCopy() {
  if (typeof window !== "undefined") {
    flushPersist();
    localStorage.removeItem(GUEST_STORAGE_KEY);
  }
}

function declinedAccounts(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_DECLINED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function guestDeclinedBy(userId: string): boolean {
  return typeof window !== "undefined" && declinedAccounts().includes(userId);
}

/** "Keep my account only": not asked again for this account on this phone. */
export function declineGuestFor(userId: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(GUEST_DECLINED_KEY, JSON.stringify([...new Set([...declinedAccounts(), userId])]));
  }
}

function markActive(copy: "guest" | "account") {
  if (typeof window !== "undefined") {
    localStorage.setItem(ACTIVE_STORAGE_KEY, copy);
  }
}

function loadState() {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  // Not read, so not left lying around either — it is a full copy of whoever
  // last used this device.
  localStorage.removeItem(RETIRED_STORAGE_KEY);

  // The copy that was on screen. A phone from before guest mode has no marker
  // and one account copy, which is the one to open.
  const active = localStorage.getItem(ACTIVE_STORAGE_KEY);
  const saved =
    active === "guest"
      ? readSaved(GUEST_STORAGE_KEY)
      : readSaved(STORAGE_KEY) ?? readSaved(GUEST_STORAGE_KEY);

  return saved ? { ...createInitialState(), ...saved } : createInitialState();
}

function getTodayScheduledSessions(state: Pick<WorkoutState, "scheduledSessions" | "activeDate">) {
  return state.scheduledSessions.filter((session) => session.date === state.activeDate);
}

function getSelectedOrFirstTodaySession(
  state: Pick<WorkoutState, "scheduledSessions" | "activeDate" | "selectedSessionId">
) {
  const todaySessions = getTodayScheduledSessions(state);

  return (
    todaySessions.find((session) => session.id === state.selectedSessionId) ?? todaySessions[0]
  );
}

/** Exported for the tour's tests; the app makes one, inside the provider. */
export function createWorkoutStore() {
  const initial = loadState();

  return createStore<WorkoutState>()((set, get) => {
    // Every action ended with the same three lines: build `next`, `persist` it,
    // return it. Stating that once is what makes an action's actual work
    // visible — the deleted planner subsystem hid two unreachable branches
    // inside that boilerplate.
    const setAndPersist = (updater: (state: WorkoutState) => WorkoutState) =>
      set((state) => {
        const next = updater(state);
        // Never while the tour's sample is on screen: the phone's copy is the
        // real data, and it is what comes back if the page reloads mid-tour.
        if (!isTouring()) {
          persist(next);
        }
        return next;
      });

    return {
      ...initial,
      addTemplate: (template) => {
        const exists = get().templates.some(
          (item) => normalizeName(item.name) === normalizeName(template.name)
        );

        if (exists) {
          return false;
        }

        setAndPersist((state) => ({
          ...state,
          templates: [template, ...state.templates]
        }));

        return true;
      },
      createSessionTemplate: (template) => {
        const exists = get().sessionTemplates.some(
          (item) => normalizeName(item.name) === normalizeName(template.name)
        );

        if (exists) {
          return false;
        }

        setAndPersist((state) => ({
          ...state,
          sessionTemplates: [template, ...state.sessionTemplates]
        }));

        return true;
      },
      // Keeps the template's id so schedule configs and scheduled sessions
      // pointing at it stay valid across a rename.
      updateSessionTemplate: (id, template) => {
        const taken = get().sessionTemplates.some(
          (item) => item.id !== id && normalizeName(item.name) === normalizeName(template.name)
        );

        if (taken) {
          return false;
        }

        setAndPersist((state) => {
          const sessionTemplates = state.sessionTemplates.map((item) =>
            item.id === id ? { ...template, id } : item
          );
          // An exercise edited out of the session may have been the last user
          // of a stored GIF.
          return { ...state, sessionTemplates, templates: releaseUnusedMedia(state.templates, sessionTemplates, state.scheduledSessions) };
        });

        return true;
      },
      deleteSessionTemplate: (id) =>
        setAndPersist((state) => {
          const sessionTemplates = state.sessionTemplates.filter((template) => template.id !== id);
          // Clearing a template's mediaPath is what makes the sync layer delete
          // the stored GIF — see `removedMediaPaths` in lib/sync.ts.
          return { ...state, sessionTemplates, templates: releaseUnusedMedia(state.templates, sessionTemplates, state.scheduledSessions) };
        }),
      importAiPlan: ({ templates, sessions, scheduleConfig }) =>
        setAndPersist((state) => {
          // New exercise templates first, skipping any id already registered —
          // buildPlanImport reuses by name, so a clash here is a re-import.
          const knownIds = new Set(state.templates.map((template) => template.id));
          const nextTemplates = [
            ...templates.filter((template) => !knownIds.has(template.id)),
            ...state.templates
          ];
          // Replacements keep the id the calendar already points at.
          const replacing = new Map(
            sessions.filter((item) => item.replaces).map((item) => [item.replaces!, item.template])
          );
          const added = sessions.filter((item) => !item.replaces).map((item) => item.template);
          const sessionTemplates = [
            ...added,
            ...state.sessionTemplates.map((template) => replacing.get(template.id) ?? template)
          ];
          const base = {
            ...state,
            templates: releaseUnusedMedia(nextTemplates, sessionTemplates, state.scheduledSessions),
            sessionTemplates
          };
          if (!scheduleConfig) {
            return base;
          }
          // The same path as "Generate schedule": planned days in the range are
          // replaced, started and finished ones are kept.
          return {
            ...base,
            scheduleConfig,
            scheduledSessions: mergeGeneratedSessions(
              base.scheduledSessions,
              buildScheduleSessions(scheduleConfig, sessionTemplates, (template) =>
                plannedExercisesFromTemplate(template, base)
              )
            ),
            selectedSessionId: undefined
          };
        }),
      setTemplateMedia: (templateId, mediaPath) =>
        setAndPersist((state) => ({
          ...state,
          templates: state.templates.map((template) =>
            template.id === templateId ? { ...template, mediaPath } : template
          )
        })),
      scheduleSession: ({
        date,
        sessionTemplateId,
        sessionName,
        exercises,
        type = "workout",
        source = "manual",
        rule
      }) =>
        setAndPersist((state) => {
          const parsed = new Date(`${date}T00:00:00`);
          const sessions: ScheduledSession[] = [];
          const makeSession = (targetDate: string) => ({
            id: crypto.randomUUID(),
            date: targetDate,
            dayIndex: weekdayIndex(new Date(`${targetDate}T00:00:00`)),
            sessionTemplateId,
            sessionName,
            exercises: exercises.map(cloneExercise),
            type,
            status: "planned" as const,
            source
          });

          sessions.push(makeSession(date));

          if (rule?.repeatMode === "weekly" && rule.weekdays?.length) {
            for (let offset = 1; offset <= 21; offset += 1) {
              const nextDate = new Date(parsed);
              nextDate.setDate(parsed.getDate() + offset);
              if (rule.weekdays.includes(nextDate.getDay())) {
                sessions.push(makeSession(dateKey(nextDate)));
              }
            }
          }

          if (rule?.repeatMode === "every_n_days" && rule.intervalDays) {
            for (
              let step = rule.intervalDays;
              step <= rule.intervalDays * 4;
              step += rule.intervalDays
            ) {
              const nextDate = new Date(parsed);
              nextDate.setDate(parsed.getDate() + step);
              sessions.push(makeSession(dateKey(nextDate)));
            }
          }

          const explicitRestDates = new Set<string>(rule?.restDates ?? []);
          if (rule?.restWeekdays?.length) {
            for (let offset = 0; offset <= 21; offset += 1) {
              const nextDate = new Date(parsed);
              nextDate.setDate(parsed.getDate() + offset);
              if (rule.restWeekdays.includes(nextDate.getDay())) {
                explicitRestDates.add(dateKey(nextDate));
              }
            }
          }

          explicitRestDates.forEach((restDate) => {
            sessions.push({
              id: crypto.randomUUID(),
              date: restDate,
              dayIndex: weekdayIndex(new Date(`${restDate}T00:00:00`)),
              sessionName: "Rest Day",
              exercises: [],
              type: "rest",
              status: "planned",
              source: "repeat"
            });
          });

          const deduped = [...state.scheduledSessions];
          sessions.forEach((session) => {
            const exists = deduped.some(
              (item) =>
                item.date === session.date &&
                normalizeName(item.sessionName) === normalizeName(session.sessionName)
            );
            if (!exists) {
              deduped.push(session);
            }
          });

          return {
            ...state,
            scheduledSessions: deduped.sort((a, b) => a.date.localeCompare(b.date)),
            selectedSessionId: sessions[0]?.id ?? state.selectedSessionId
          };
        }),
      removeScheduledSession: (id) =>
        setAndPersist((state) => ({
          ...state,
          scheduledSessions: state.scheduledSessions.filter((session) => session.id !== id)
        })),
      // The decision of whether a move is legal lives in `lib/schedule`, pure and
      // tested. A refusal leaves the state exactly as it was — the caller reads
      // the reason off the same result to show it.
      moveScheduledSession: (id, toDate) => {
        const result = moveSession(get().scheduledSessions, id, toDate, todayKey());
        if (result.ok) {
          setAndPersist((state) => ({ ...state, scheduledSessions: result.sessions }));
        }
        return result;
      },
      startAdHocSession: ({ name, exercises }) =>
        setAndPersist((state) => {
          const session: ScheduledSession = {
            id: crypto.randomUUID(),
            date: state.activeDate,
            dayIndex: weekdayIndex(new Date(`${state.activeDate}T00:00:00`)),
            sessionName: name,
            exercises,
            type: "workout",
            // Started, not planned — there is nothing to "start" later, you are
            // already in the gym. And `manual`, so regenerating the schedule
            // leaves it alone; see mergeGeneratedSessions.
            status: "active",
            source: "manual",
            // The session clock starts the moment it is created and started.
            startedAt: new Date().toISOString()
          };

          return {
            ...state,
            scheduledSessions: [...state.scheduledSessions, session].sort((a, b) =>
              a.date.localeCompare(b.date)
            ),
            selectedSessionId: session.id
          };
        }),
      generateSchedule: (config) =>
        setAndPersist((state) => ({
          ...state,
          scheduleConfig: config,
          scheduledSessions: mergeGeneratedSessions(
            state.scheduledSessions,
            buildScheduleSessions(config, state.sessionTemplates, (template) =>
              plannedExercisesFromTemplate(template, state)
            )
          ),
          selectedSessionId: undefined
        })),
      selectSession: (sessionId) =>
        setAndPersist((state) => ({ ...state, selectedSessionId: sessionId })),
      // Re-planned on the way in, so the numbers you start with are current
      // even if the app has been open since before your last session.
      startSession: (sessionId) =>
        setAndPersist((current) => {
          const state = withFreshUpcoming(current);
          return {
            ...state,
            selectedSessionId: sessionId,
            scheduledSessions: state.scheduledSessions.map((session) =>
              session.id === sessionId && session.type === "workout"
                ? // The clock starts on Start — once: re-starting keeps the first time.
                  { ...session, status: "active" as const, startedAt: session.startedAt ?? new Date().toISOString() }
                : session
            )
          };
        }),
      updateSessionSet: (sessionId, exerciseId, setId, patch) =>
        setAndPersist((state) => ({
          ...state,
          scheduledSessions: state.scheduledSessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  exercises: session.exercises.map((exercise) =>
                    exercise.id === exerciseId
                      ? {
                          ...exercise,
                          sets: exercise.sets.map((setItem) =>
                            setItem.id === setId
                              ? {
                                  ...setItem,
                                  ...patch,
                                  // Stamped the first time it is logged; a later
                                  // correction keeps when it was actually done.
                                  ...(patch.completed && !setItem.completedAt
                                    ? { completedAt: new Date().toISOString() }
                                    : {})
                                }
                              : setItem
                          )
                        }
                      : exercise
                  )
                }
              : session
          )
        })),
      // A new set starts where the latest session that reached it left it —
      // add a 4th set and it is your last 4th set, from whichever session last
      // had one. A set nobody has done yet copies the one above it.
      addSetToSession: (sessionId, exerciseId) =>
        setAndPersist((state) => ({
          ...state,
          scheduledSessions: state.scheduledSessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  exercises: session.exercises.map((exercise) => {
                    if (exercise.id !== exerciseId) {
                      return exercise;
                    }
                    const above = exercise.sets.at(-1);
                    // Logged set rows count working sets only, so index the same way.
                    const index = exercise.sets.filter((setItem) => setItem.type !== "warmup").length;
                    const logged = loggedSetAt(exercise.workoutId, state.setLogs, index);
                    return {
                      ...exercise,
                      sets: [
                        ...exercise.sets,
                        {
                          id: crypto.randomUUID(),
                          reps: logged?.reps ?? above?.reps ?? 8,
                          weight: logged?.weight ?? above?.weight ?? 20,
                          // Without this a 4th set on a hold clones reps 0
                          // and no duration — a silent zero-second set.
                          durationSeconds: logged ? logged.durationSeconds : above?.durationSeconds,
                          // What you did on this set last time when there is
                          // one; else the set you just did. Undefined when this
                          // is the first — no invented 8 × 20kg.
                          previousReps: logged?.reps ?? above?.reps,
                          previousWeight: logged?.weight ?? above?.weight,
                          type: "normal" as const
                        }
                      ]
                    };
                  })
                }
              : session
          )
        })),
      addExerciseToSession: (sessionId, exercises) =>
        setAndPersist((state) => ({
          ...state,
          scheduledSessions: state.scheduledSessions.map((session) =>
            session.id === sessionId
              ? { ...session, exercises: [...session.exercises, ...exercises] }
              : session
          )
        })),
      removeSetFromSession: (sessionId, exerciseId, setId) =>
        setAndPersist((state) => ({
          ...state,
          scheduledSessions: state.scheduledSessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  exercises: removeSetFromExercises(session.exercises, exerciseId, setId)
                }
              : session
          )
        })),
      removeExerciseFromSession: (sessionId, exerciseId) =>
        setAndPersist((state) => ({
          ...state,
          scheduledSessions: state.scheduledSessions.map((session) =>
            session.id === sessionId
              ? { ...session, exercises: removeExerciseFromExercises(session.exercises, exerciseId) }
              : session
          )
        })),
      setSelectedMuscle: (muscleId) =>
        setAndPersist((state) => ({ ...state, selectedMuscleId: muscleId })),
      logTodayWorkout: () =>
        setAndPersist((state) => {
          const selectedSession = getSelectedOrFirstTodaySession(state);
          if (!selectedSession) {
            return state;
          }

          // Bodyweight movements score reps × (you + added), so the profile weight
          // is part of the volume figure.
          const logged = buildLogFromSession(
            selectedSession,
            state.templates,
            state.profile.weightKg
          );

          // Then everything ahead picks up what was just lifted.
          return withFreshUpcoming({
            ...state,
            logs: [...logged.logs, ...state.logs],
            setLogs: [...logged.setLogs, ...state.setLogs],
            scheduledSessions: state.scheduledSessions.map((session) =>
              session.id === selectedSession.id
                ? {
                    ...session,
                    status: "completed" as const,
                    // When it really ended: a Finish tapped long after the last
                    // set is cut back to that set and its rest (lib/session-time).
                    finishedAt: session.startedAt ? sessionEnd(session) : undefined
                  }
                : session
            )
          });
        }),
      setActiveDate: (date) =>
        setAndPersist((state) => ({
          ...state,
          activeDate: date,
          selectedSessionId:
            state.scheduledSessions.find((session) => session.date === date)?.id ??
            state.selectedSessionId
        })),
      setProfile: (patch) =>
        setAndPersist((state) => ({
          ...state,
          profile: { ...state.profile, ...patch }
        })),
      // profile.weightKg follows the newest weigh-in rather than being a second
      // source of truth that can disagree with the series.
      logMeasurement: (metric, value, date = todayKey()) =>
        setAndPersist((state) => {
          const measurements = upsertMeasurement(state.measurements, {
            id: crypto.randomUUID(),
            date,
            metric,
            value
          });
          const latestWeight = measurements.filter((item) => item.metric === "weight").at(-1);

          return {
            ...state,
            measurements,
            profile: latestWeight
              ? { ...state.profile, weightKg: latestWeight.value }
              : state.profile
          };
        }),
      /**
       * Establish that what is on screen belongs to `userId` before anything
       * is pushed from it.
       *
       * The guest copy and the account copy live under different keys. Signing
       * in switches to the account's copy; signing out switches to the guest's.
       * Neither switch deletes the other copy: offline work survives signing
       * back in on your own phone, and a shared phone never shows the next
       * person your history. Another account's copy is dropped, never merged.
       */
      switchToAccount: (userId) =>
        setAndPersist((state) => {
          if (state.owner === userId) {
            return state;
          }
          markActive("account");
          const saved = readSaved(STORAGE_KEY);
          const fresh = { ...state, ...createInitialState(), activeDate: todayKey() };
          // This account's copy from an earlier visit — offline work included —
          // or an empty one. Another account's copy is dropped, never shown.
          return saved?.owner === userId
            ? { ...fresh, ...saved, owner: userId, activeDate: todayKey() }
            : { ...fresh, owner: userId };
        }),
      clearGuestData: () =>
        setAndPersist((state) =>
          state.owner ? state : { ...state, ...createInitialState(), owner: undefined, activeDate: todayKey() }
        ),
      switchToGuest: () =>
        setAndPersist((state) => {
          if (!state.owner) {
            return state;
          }
          markActive("guest");
          const saved = readSaved(GUEST_STORAGE_KEY);
          const fresh = { ...state, ...createInitialState(), owner: undefined, activeDate: todayKey() };
          return saved && !saved.owner ? { ...fresh, ...saved, owner: undefined, activeDate: todayKey() } : fresh;
        }),
      // The owner stays so the next sign-in by the same account does not read
      // an untagged blob. The stamp stays so every screen knows an archive is
      // waiting, and so the sync layer leaves its GIFs alone.
      archiveLocal: (requestedAt) =>
        setAndPersist((state) => {
          const fresh = createInitialState();
          return {
            ...state,
            ...fresh,
            owner: state.owner,
            profile: {
              ...fresh.profile,
              name: state.profile.name,
              email: state.profile.email,
              deletionRequestedAt: requestedAt
            }
          };
        }),
      // Through `reconcile`, like a backup restore: union by id, the archive's
      // copy winning where both have the same entry. `replace` starts from an
      // empty base, so what was logged since is gone and the sync layer
      // deletes it from the account.
      restoreArchive: (archive, mode) =>
        setAndPersist((state) => {
          const base = mode === "replace" ? { ...state, ...createInitialState(), owner: state.owner } : state;
          const merged = reconcile(base, archive);
          return withFreshUpcoming({
            ...base,
            ...merged,
            profile: { ...merged.profile, deletionRequestedAt: undefined }
          });
        }),
      // Was a replace-outright, which destroyed every local write that had not
      // reached Supabase yet — the failure `lib/reconcile.ts` exists to end.
      // Logs from another device can move the plan, so re-plan after merging.
      hydrateRemote: (payload) =>
        setAndPersist((state) => withFreshUpcoming({ ...state, ...reconcile(state, payload) })),
      refreshUpcoming: () => setAndPersist((state) => withFreshUpcoming(state)),
      addSkillGoal: (goal) =>
        setAndPersist((state) => ({ ...state, skillGoals: [...state.skillGoals, goal] })),
      removeSkillGoal: (id) =>
        setAndPersist((state) => ({ ...state, skillGoals: state.skillGoals.filter((goal) => goal.id !== id) })),
      applySkillLevelToPlans: ({ replaceWorkoutIds, level, template }) => {
        let replaced = 0;
        setAndPersist((state) => {
          const templates = state.templates.some((item) => item.id === template.id)
            ? state.templates
            : [...state.templates, template];
          const sessionTemplates = state.sessionTemplates.map((session) => {
            if (!session.exercises.some((exercise) => replaceWorkoutIds.includes(exercise.workoutId))) {
              return session;
            }
            const exercises = session.exercises.map((exercise) => {
              if (!replaceWorkoutIds.includes(exercise.workoutId)) {
                return exercise;
              }
              replaced += 1;
              // The rung's bar becomes the plan: its sets and its reps or hold.
              return {
                ...exercise,
                workoutId: template.id,
                name: level.name,
                muscles: template.muscles,
                metric: level.metric === "time" ? ("time" as const) : undefined,
                sets: level.sets,
                reps: level.metric === "time" ? 0 : level.target,
                durationSeconds: level.metric === "time" ? level.target : undefined,
                weight: 0,
                weights: undefined
              };
            });
            const next = { ...session, exercises, workoutIds: [...new Set(exercises.map((exercise) => exercise.workoutId))] };
            return { ...next, summary: buildSessionSummary(next) };
          });
          // Sessions not started yet pick the new exercise up straight away.
          return withFreshUpcoming({ ...state, templates, sessionTemplates });
        });
        return replaced;
      }
    };
  });
}

const WorkoutStoreContext = createContext<StoreApi<WorkoutState> | null>(null);

export function WorkoutStoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<StoreApi<WorkoutState>>(null);

  if (!storeRef.current) {
    storeRef.current = createWorkoutStore();
  }

  // activeDate is persisted; re-sync it to today on mount so Home shows today's
  // scheduled session after the store was saved on an earlier day — and again
  // every time the app comes back to the front. An installed app stays open
  // for days: opened from the switcher the morning after, it used to keep
  // yesterday's date, show yesterday's session as done, and write a new
  // session's logs under yesterday.
  useEffect(() => {
    const resync = () => {
      const store = storeRef.current;
      if (!store) {
        return;
      }
      if (store.getState().activeDate !== todayKey()) {
        store.getState().setActiveDate(todayKey());
        // Sessions planned for the days since catch up with the latest logs.
        store.getState().refreshUpcoming();
      }
    };
    resync();
    // Sessions scheduled before this rule, or before logs since, catch up.
    storeRef.current?.getState().refreshUpcoming();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        resync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
    };
  }, []);

  // Another tab saved. Each tab writes its whole state under one key, so the
  // next save here would have overwritten that tab's sets with this tab's
  // older copy. Merge it in instead — through `reconcile`, which never drops a
  // row — and without saving: the merged state is written by this tab's next
  // action, and a save here would bounce the event back and forth for ever.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const store = storeRef.current;
      if (!store || !event.newValue || isTouring()) {
        return;
      }
      const state = store.getState();
      if (event.key !== (state.owner ? STORAGE_KEY : GUEST_STORAGE_KEY)) {
        return;
      }
      const saved = parseSaved(event.newValue);
      // Another account's copy, or a guest copy under an account: not ours to mix in.
      if (!saved || (saved.owner ?? undefined) !== (state.owner ?? undefined)) {
        return;
      }
      store.setState((current) => ({ ...current, ...reconcile(current, savedAsIncoming(saved)) }));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The save waits for the next task; the page may not get one. `pagehide` is
  // what a phone fires when the app is swiped away, and hidden is the last
  // thing some browsers fire at all.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        flushPersist();
      }
    };
    window.addEventListener("pagehide", flushPersist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushPersist);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return (
    <WorkoutStoreContext.Provider value={storeRef.current}>{children}</WorkoutStoreContext.Provider>
  );
}

export function useWorkoutStore<T>(selector: (store: WorkoutState) => T) {
  const store = useContext(WorkoutStoreContext);

  if (!store) {
    throw new Error("useWorkoutStore must be used inside WorkoutStoreProvider");
  }

  return useStore(store, selector);
}

/** The raw store, for `subscribe()`. Used by supabase-sync to watch every change. */
export function useWorkoutStoreApi() {
  const store = useContext(WorkoutStoreContext);

  if (!store) {
    throw new Error("useWorkoutStoreApi must be used inside WorkoutStoreProvider");
  }

  return store;
}

export function useTodaySessions() {
  const scheduledSessions = useWorkoutStore((state) => state.scheduledSessions);
  const activeDate = useWorkoutStore((state) => state.activeDate);

  return useMemo(
    () => getTodayScheduledSessions({ scheduledSessions, activeDate }),
    [activeDate, scheduledSessions]
  );
}

export function useSelectedTodaySession() {
  const scheduledSessions = useWorkoutStore((state) => state.scheduledSessions);
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const selectedSessionId = useWorkoutStore((state) => state.selectedSessionId);

  return useMemo(
    () =>
      getSelectedOrFirstTodaySession({
        scheduledSessions,
        activeDate,
        selectedSessionId
      }),
    [activeDate, scheduledSessions, selectedSessionId]
  );
}

/**
 * Needs the store's history, so it is a hook rather than a bare function — the
 * numbers it writes into `previousWeight`/`previousReps` are read off what this
 * account has actually logged.
 */
export function useExercisesFromSessionTemplate() {
  const logs = useWorkoutStore((state) => state.logs);
  const setLogs = useWorkoutStore((state) => state.setLogs);

  return useCallback(
    (template: SessionTemplate) => exerciseFromSessionTemplate(template, { logs, setLogs }),
    [logs, setLogs]
  );
}
