"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import type { PlanImport } from "@/lib/ai-plan";
import { upsertMeasurement } from "@/lib/body-metrics";
import { releaseUnusedMedia } from "@/lib/media";
import { reconcile } from "@/lib/reconcile";
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
  setSelectedMuscle: (muscleId?: string) => void;
  logTodayWorkout: () => void;
  setActiveDate: (date: string) => void;
  setProfile: (patch: Partial<ProfileInfo>) => void;
  claimFor: (userId: string) => void;
  logMeasurement: (metric: BodyMetric, value: number, date?: string) => void;
  hydrateRemote: (payload: RemoteState) => void;
}

// v4 adds `owner`. v3 is not migrated on purpose: an untagged blob cannot be
// proved to belong to whoever signs in next, and adopting it on a shared device
// is the account bleed this whole mechanism exists to prevent. Anyone already
// synced gets their data back from the first read.
const STORAGE_KEY = "gymflow-state-v4";
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
  | "setSelectedMuscle"
  | "logTodayWorkout"
  | "setActiveDate"
  | "setProfile"
  | "claimFor"
  | "logMeasurement"
  | "hydrateRemote"
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
    activeDate: todayKey(),
    selectedMuscleId: undefined,
    selectedSessionId: undefined
  };
}

function persist(state: WorkoutState) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
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
      activeDate: state.activeDate,
      selectedMuscleId: state.selectedMuscleId,
      selectedSessionId: state.selectedSessionId,
      owner: state.owner
    })
  );
}

function loadState() {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  // Not read, so not left lying around either — it is a full copy of whoever
  // last used this device.
  localStorage.removeItem(RETIRED_STORAGE_KEY);

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createInitialState();
  }

  try {
    return {
      ...createInitialState(),
      ...JSON.parse(raw)
    };
  } catch {
    return createInitialState();
  }
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

function createWorkoutStore() {
  const initial = loadState();

  return createStore<WorkoutState>()((set, get) => {
    // Every action ended with the same three lines: build `next`, `persist` it,
    // return it. Stating that once is what makes an action's actual work
    // visible — the deleted planner subsystem hid two unreachable branches
    // inside that boilerplate.
    const setAndPersist = (updater: (state: WorkoutState) => WorkoutState) =>
      set((state) => {
        const next = updater(state);
        persist(next);
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
          return { ...state, sessionTemplates, templates: releaseUnusedMedia(state.templates, sessionTemplates) };
        });

        return true;
      },
      deleteSessionTemplate: (id) =>
        setAndPersist((state) => {
          const sessionTemplates = state.sessionTemplates.filter((template) => template.id !== id);
          // Clearing a template's mediaPath is what makes the sync layer delete
          // the stored GIF — see `removedMediaPaths` in lib/sync.ts.
          return { ...state, sessionTemplates, templates: releaseUnusedMedia(state.templates, sessionTemplates) };
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
            templates: releaseUnusedMedia(nextTemplates, sessionTemplates),
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
        const result = moveSession(get().scheduledSessions, id, toDate);
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
            source: "manual"
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
      startSession: (sessionId) =>
        setAndPersist((state) => ({
          ...state,
          selectedSessionId: sessionId,
          scheduledSessions: state.scheduledSessions.map((session) =>
            session.id === sessionId && session.type === "workout"
              ? { ...session, status: "active" as const }
              : session
          )
        })),
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
                            setItem.id === setId ? { ...setItem, ...patch } : setItem
                          )
                        }
                      : exercise
                  )
                }
              : session
          )
        })),
      addSetToSession: (sessionId, exerciseId) =>
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
                          sets: [
                            ...exercise.sets,
                            {
                              id: crypto.randomUUID(),
                              reps: exercise.sets.at(-1)?.reps ?? 8,
                              weight: exercise.sets.at(-1)?.weight ?? 20,
                              // Without this a 4th set on a hold clones reps 0
                              // and no duration — a silent zero-second set.
                              durationSeconds: exercise.sets.at(-1)?.durationSeconds,
                              // The set you just did, genuinely. Undefined when
                              // this is the first — no invented 8 × 20kg.
                              previousReps: exercise.sets.at(-1)?.reps,
                              previousWeight: exercise.sets.at(-1)?.weight,
                              type: "normal" as const
                            }
                          ]
                        }
                      : exercise
                  )
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

          return {
            ...state,
            logs: [...logged.logs, ...state.logs],
            setLogs: [...logged.setLogs, ...state.setLogs],
            scheduledSessions: state.scheduledSessions.map((session) =>
              session.id === selectedSession.id
                ? { ...session, status: "completed" as const }
                : session
            )
          };
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
       * Establish that the persisted copy belongs to `userId` before anything
       * is pushed from it.
       *
       * A different owner — or none, which is every v3 blob and every fresh
       * install — means this data is not theirs, so it is dropped rather than
       * merged or uploaded. Signing *out* deliberately does not clear it: work
       * done offline should survive signing back in on your own device. It is
       * the change of owner that matters, not the absence of a session.
       */
      claimFor: (userId) =>
        setAndPersist((state) =>
          state.owner === userId
            ? state
            : { ...state, ...createInitialState(), owner: userId }
        ),
      // Was a replace-outright, which destroyed every local write that had not
      // reached Supabase yet — the failure `lib/reconcile.ts` exists to end.
      hydrateRemote: (payload) =>
        setAndPersist((state) => ({ ...state, ...reconcile(state, payload) }))
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
  // scheduled session after the store was saved on an earlier day.
  useEffect(() => {
    const store = storeRef.current;
    if (store && store.getState().activeDate !== todayKey()) {
      store.getState().setActiveDate(todayKey());
    }
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
