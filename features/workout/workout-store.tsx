"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import { upsertMeasurement } from "@/lib/body-metrics";
import { muscles, presetWorkouts } from "@/lib/seed-data";
import type {
  BodyMeasurement,
  BodyMetric,
  DailyPlan,
  Muscle,
  PlannedExercise,
  PlannedSet,
  ProfileInfo,
  ScheduleConfig,
  ScheduledSession,
  ScheduleRule,
  SessionTemplate,
  WorkoutLog,
  WorkoutTemplate
} from "@/lib/types";
import { buildScheduleSessions, mergeGeneratedSessions } from "@/lib/schedule";
import {
  buildLogFromSession,
  plannedExercisesFromTemplate,
  removeSetFromExercises
} from "@/lib/workout-helpers";
import { dateKey, todayKey, weekdayIndex } from "@/lib/utils";

interface WorkoutState {
  muscles: Muscle[];
  templates: WorkoutTemplate[];
  sessionTemplates: SessionTemplate[];
  scheduledSessions: ScheduledSession[];
  scheduleConfig?: ScheduleConfig;
  planner: DailyPlan[];
  logs: WorkoutLog[];
  profile: ProfileInfo;
  measurements: BodyMeasurement[];
  activeDate: string;
  plannerMode: "fixed" | "smart";
  selectedMuscleId?: string;
  selectedSessionId?: string;
  addTemplate: (template: WorkoutTemplate) => boolean;
  createSessionTemplate: (template: SessionTemplate) => boolean;
  updateSessionTemplate: (id: string, template: SessionTemplate) => boolean;
  deleteSessionTemplate: (id: string) => void;
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
  removeSetFromSession: (sessionId: string, exerciseId: string, setId: string) => void;
  setSelectedMuscle: (muscleId?: string) => void;
  setPlannerMode: (mode: "fixed" | "smart") => void;
  setPlannerDay: (dayIndex: number, exercises: PlannedExercise[]) => void;
  addExerciseToDay: (dayIndex: number, exercise: PlannedExercise) => void;
  updateSet: (
    dayIndex: number,
    exerciseId: string,
    setId: string,
    patch: Partial<PlannedSet>
  ) => void;
  addSet: (dayIndex: number, exerciseId: string) => void;
  removeExercise: (dayIndex: number, exerciseId: string) => void;
  logTodayWorkout: () => void;
  setActiveDate: (date: string) => void;
  setProfile: (patch: Partial<ProfileInfo>) => void;
  logMeasurement: (metric: BodyMetric, value: number, date?: string) => void;
  hydrateRemote: (payload: {
    templates?: WorkoutTemplate[];
    sessionTemplates?: SessionTemplate[];
    scheduledSessions?: ScheduledSession[];
    logs?: WorkoutLog[];
    measurements?: BodyMeasurement[];
    profile?: ProfileInfo;
    scheduleConfig?: ScheduleConfig;
  }) => void;
}

const STORAGE_KEY = "gymflow-state-v3";

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cloneExercise(exercise: PlannedExercise): PlannedExercise {
  return {
    ...exercise,
    sets: exercise.sets.map((setItem) => ({ ...setItem }))
  };
}

function exerciseFromSessionTemplate(template: SessionTemplate): PlannedExercise[] {
  return plannedExercisesFromTemplate(template);
}

function calculateExerciseVolume(exercise: PlannedExercise) {
  return exercise.sets.reduce((sum, setItem) => sum + setItem.reps * setItem.weight, 0);
}

function createInitialState(): Omit<
  WorkoutState,
  | "addTemplate"
  | "createSessionTemplate"
  | "updateSessionTemplate"
  | "deleteSessionTemplate"
  | "scheduleSession"
  | "removeScheduledSession"
  | "generateSchedule"
  | "selectSession"
  | "startSession"
  | "updateSessionSet"
  | "addSetToSession"
  | "removeSetFromSession"
  | "setSelectedMuscle"
  | "setPlannerMode"
  | "setPlannerDay"
  | "addExerciseToDay"
  | "updateSet"
  | "addSet"
  | "removeExercise"
  | "logTodayWorkout"
  | "setActiveDate"
  | "setProfile"
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
    planner: [],
    logs: [],
    profile: { name: "", email: "", heightCm: 0, weightKg: 0 },
    measurements: [],
    activeDate: todayKey(),
    plannerMode: "fixed",
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
      planner: state.planner,
      logs: state.logs,
      profile: state.profile,
      measurements: state.measurements,
      activeDate: state.activeDate,
      plannerMode: state.plannerMode,
      selectedMuscleId: state.selectedMuscleId,
      selectedSessionId: state.selectedSessionId
    })
  );
}

function loadState() {
  if (typeof window === "undefined") {
    return createInitialState();
  }

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

function getSelectedOrFirstTodaySession(state: Pick<
  WorkoutState,
  "scheduledSessions" | "activeDate" | "selectedSessionId"
>) {
  const todaySessions = getTodayScheduledSessions(state);

  return (
    todaySessions.find((session) => session.id === state.selectedSessionId) ??
    todaySessions[0]
  );
}

function getTodayPlan(planner: DailyPlan[]) {
  const index = weekdayIndex();
  return planner.find((item) => item.dayIndex === index) ?? { dayIndex: index, exercises: [] };
}


function createWorkoutStore() {
  const initial = loadState();

  return createStore<WorkoutState>()((set, get) => ({
    ...initial,
    addTemplate: (template) => {
      const exists = get().templates.some(
        (item) => normalizeName(item.name) === normalizeName(template.name)
      );

      if (exists) {
        return false;
      }

      set((state) => {
        const next = { ...state, templates: [template, ...state.templates] };
        persist(next);
        return next;
      });

      return true;
    },
    createSessionTemplate: (template) => {
      const exists = get().sessionTemplates.some(
        (item) => normalizeName(item.name) === normalizeName(template.name)
      );

      if (exists) {
        return false;
      }

      set((state) => {
        const next = {
          ...state,
          sessionTemplates: [template, ...state.sessionTemplates]
        };
        persist(next);
        return next;
      });

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

      set((state) => {
        const next = {
          ...state,
          sessionTemplates: state.sessionTemplates.map((item) =>
            item.id === id ? { ...template, id } : item
          )
        };
        persist(next);
        return next;
      });

      return true;
    },
    deleteSessionTemplate: (id) =>
      set((state) => {
        const next = {
          ...state,
          sessionTemplates: state.sessionTemplates.filter((template) => template.id !== id)
        };
        persist(next);
        return next;
      }),
    scheduleSession: ({ date, sessionTemplateId, sessionName, exercises, type = "workout", source = "manual", rule }) =>
      set((state) => {
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
          for (let step = rule.intervalDays; step <= rule.intervalDays * 4; step += rule.intervalDays) {
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

        const next = {
          ...state,
          scheduledSessions: deduped.sort((a, b) => a.date.localeCompare(b.date)),
          selectedSessionId: sessions[0]?.id ?? state.selectedSessionId
        };
        persist(next);
        return next;
      }),
    removeScheduledSession: (id) =>
      set((state) => {
        const next = {
          ...state,
          scheduledSessions: state.scheduledSessions.filter((session) => session.id !== id)
        };
        persist(next);
        return next;
      }),
    generateSchedule: (config) =>
      set((state) => {
        const next = {
          ...state,
          scheduleConfig: config,
          scheduledSessions: mergeGeneratedSessions(
            state.scheduledSessions,
            buildScheduleSessions(config, state.sessionTemplates, plannedExercisesFromTemplate)
          ),
          selectedSessionId: undefined
        };
        persist(next);
        return next;
      }),
    selectSession: (sessionId) =>
      set((state) => {
        const next = { ...state, selectedSessionId: sessionId };
        persist(next);
        return next;
      }),
    startSession: (sessionId) =>
      set((state) => {
        const next = {
          ...state,
          selectedSessionId: sessionId,
          scheduledSessions: state.scheduledSessions.map((session) =>
            session.id === sessionId && session.type === "workout"
              ? { ...session, status: "active" as const }
              : session
          )
        };
        persist(next);
        return next;
      }),
    updateSessionSet: (sessionId, exerciseId, setId, patch) =>
      set((state) => {
        const next = {
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
        };
        persist(next);
        return next;
      }),
    addSetToSession: (sessionId, exerciseId) =>
      set((state) => {
        const next = {
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
                              previousReps: exercise.sets.at(-1)?.reps ?? 8,
                              previousWeight: exercise.sets.at(-1)?.weight ?? 20,
                              type: "normal" as const
                            }
                          ]
                        }
                      : exercise
                  )
                }
              : session
          )
        };
        persist(next);
        return next;
      }),
    removeSetFromSession: (sessionId, exerciseId, setId) =>
      set((state) => {
        const next = {
          ...state,
          scheduledSessions: state.scheduledSessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  exercises: removeSetFromExercises(session.exercises, exerciseId, setId)
                }
              : session
          )
        };
        persist(next);
        return next;
      }),
    setSelectedMuscle: (muscleId) =>
      set((state) => {
        const next = { ...state, selectedMuscleId: muscleId };
        persist(next);
        return next;
      }),
    setPlannerMode: (mode) =>
      set((state) => {
        const next = { ...state, plannerMode: mode };
        persist(next);
        return next;
      }),
    setPlannerDay: (dayIndex, exercises) =>
      set((state) => {
        const nextPlanner = [
          ...state.planner.filter((item) => item.dayIndex !== dayIndex),
          { dayIndex, exercises }
        ].sort((a, b) => a.dayIndex - b.dayIndex);
        const next = { ...state, planner: nextPlanner };
        persist(next);
        return next;
      }),
    addExerciseToDay: (dayIndex, exercise) =>
      set((state) => {
        const existing = state.planner.find((item) => item.dayIndex === dayIndex);
        const planner = existing
          ? state.planner.map((item) =>
              item.dayIndex === dayIndex
                ? { ...item, exercises: [...item.exercises, exercise] }
                : item
            )
          : [...state.planner, { dayIndex, exercises: [exercise] }];
        const next = { ...state, planner };
        persist(next);
        return next;
      }),
    updateSet: (dayIndex, exerciseId, setId, patch) =>
      set((state) => {
        const selectedSession = getSelectedOrFirstTodaySession(state);
        if (selectedSession) {
          const next = {
            ...state,
            scheduledSessions: state.scheduledSessions.map((session) =>
              session.id === selectedSession.id
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
          };
          persist(next);
          return next;
        }

        const planner = state.planner.map((day) =>
          day.dayIndex === dayIndex
            ? {
                ...day,
                exercises: day.exercises.map((exercise) =>
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
            : day
        );
        const next = { ...state, planner };
        persist(next);
        return next;
      }),
    addSet: (dayIndex, exerciseId) =>
      set((state) => {
        const selectedSession = getSelectedOrFirstTodaySession(state);
        if (selectedSession) {
          const next = {
            ...state,
            scheduledSessions: state.scheduledSessions.map((session) =>
              session.id === selectedSession.id
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
                                previousReps: exercise.sets.at(-1)?.reps ?? 8,
                                previousWeight: exercise.sets.at(-1)?.weight ?? 20,
                                type: "normal" as const
                              }
                            ]
                          }
                        : exercise
                    )
                  }
                : session
            )
          };
          persist(next);
          return next;
        }

        const planner = state.planner.map((day) =>
          day.dayIndex === dayIndex
            ? {
                ...day,
                exercises: day.exercises.map((exercise) =>
                  exercise.id === exerciseId
                    ? {
                        ...exercise,
                        sets: [
                          ...exercise.sets,
                          {
                            id: crypto.randomUUID(),
                            reps: exercise.sets.at(-1)?.reps ?? 8,
                            weight: exercise.sets.at(-1)?.weight ?? 20,
                            previousReps: exercise.sets.at(-1)?.reps ?? 8,
                            previousWeight: exercise.sets.at(-1)?.weight ?? 20,
                            type: "normal" as const
                          }
                        ]
                      }
                    : exercise
                )
              }
            : day
        );
        const next = { ...state, planner };
        persist(next);
        return next;
      }),
    removeExercise: (dayIndex, exerciseId) =>
      set((state) => {
        const selectedSession = getSelectedOrFirstTodaySession(state);
        if (selectedSession) {
          const next = {
            ...state,
            scheduledSessions: state.scheduledSessions.map((session) =>
              session.id === selectedSession.id
                ? {
                    ...session,
                    exercises: session.exercises.filter((exercise) => exercise.id !== exerciseId)
                  }
                : session
            )
          };
          persist(next);
          return next;
        }

        const planner = state.planner.map((day) =>
          day.dayIndex === dayIndex
            ? {
                ...day,
                exercises: day.exercises.filter((exercise) => exercise.id !== exerciseId)
              }
            : day
        );
        const next = { ...state, planner };
        persist(next);
        return next;
      }),
    logTodayWorkout: () =>
      set((state) => {
        const selectedSession = getSelectedOrFirstTodaySession(state);
        if (selectedSession) {
          const newLogs = buildLogFromSession(selectedSession, state.templates);
          const next = {
            ...state,
            logs: [...newLogs, ...state.logs],
            scheduledSessions: state.scheduledSessions.map((session) =>
              session.id === selectedSession.id
                ? { ...session, status: "completed" as const }
                : session
            )
          };
          persist(next);
          return next;
        }

        const todayPlan = getTodayPlan(state.planner);
        const logs = todayPlan.exercises.map((exercise) => {
          const template = state.templates.find((item) => item.id === exercise.workoutId);
          return {
            id: crypto.randomUUID(),
            date: state.activeDate,
            workoutId: exercise.workoutId,
            name: exercise.templateName,
            totalVolume: calculateExerciseVolume(exercise),
            totalSets: exercise.sets.length,
            totalReps: exercise.sets.reduce((sum, setItem) => sum + setItem.reps, 0),
            peakWeight: exercise.sets.reduce((peak, setItem) => Math.max(peak, setItem.weight), 0),
            muscles: template?.muscles ?? []
          };
        });
        const next = { ...state, logs: [...logs, ...state.logs] };
        persist(next);
        return next;
      }),
    setActiveDate: (date) =>
      set((state) => {
        const next = {
          ...state,
          activeDate: date,
          selectedSessionId:
            state.scheduledSessions.find((session) => session.date === date)?.id ??
            state.selectedSessionId
        };
        persist(next);
        return next;
      }),
    setProfile: (patch) =>
      set((state) => {
        const next = { ...state, profile: { ...state.profile, ...patch } };
        persist(next);
        return next;
      }),
    // profile.weightKg follows the newest weigh-in rather than being a second
    // source of truth that can disagree with the series.
    logMeasurement: (metric, value, date = todayKey()) =>
      set((state) => {
        const measurements = upsertMeasurement(state.measurements, {
          id: crypto.randomUUID(),
          date,
          metric,
          value
        });
        const latestWeight = measurements.filter((item) => item.metric === "weight").at(-1);
        const next = {
          ...state,
          measurements,
          profile: latestWeight
            ? { ...state.profile, weightKg: latestWeight.value }
            : state.profile
        };
        persist(next);
        return next;
      }),
    // The remote copy wins outright — it is the durable one, and an empty
    // result means a genuinely empty account, not a failed read (sync throws on
    // failure and never calls this). Falling back to local on empty would
    // resurrect deleted sessions on every sign-in.
    //
    // `templates` merges instead: presets ship with the app and are not stored,
    // so the remote list holds only what the user added.
    hydrateRemote: (payload) =>
      set((state) => {
        const presets = state.templates.filter((template) => template.isPreset);
        const remoteTemplates = payload.templates ?? [];
        const next = {
          ...state,
          templates: [
            ...presets,
            ...remoteTemplates.filter(
              (template) => !presets.some((preset) => preset.id === template.id)
            )
          ],
          sessionTemplates: payload.sessionTemplates ?? [],
          scheduledSessions: payload.scheduledSessions ?? [],
          scheduleConfig: payload.scheduleConfig ?? state.scheduleConfig,
          logs: payload.logs ?? [],
          measurements: payload.measurements ?? [],
          // Was `?? state.profile`, which kept the *previous* signed-in user's
          // name on a shared device when the new account had no profiles row.
          // Every other field here already lets the remote win outright.
          profile: payload.profile ?? createInitialState().profile
        };
        persist(next);
        return next;
      })
  }));
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
    <WorkoutStoreContext.Provider value={storeRef.current}>
      {children}
    </WorkoutStoreContext.Provider>
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

export function useTodayPlan() {
  const scheduledSessions = useWorkoutStore((state) => state.scheduledSessions);
  const activeDate = useWorkoutStore((state) => state.activeDate);
  const selectedSessionId = useWorkoutStore((state) => state.selectedSessionId);
  const planner = useWorkoutStore((state) => state.planner);

  const scheduledSession = useMemo(
    () =>
      getSelectedOrFirstTodaySession({
        scheduledSessions,
        activeDate,
        selectedSessionId
      }),
    [activeDate, scheduledSessions, selectedSessionId]
  );

  if (scheduledSession) {
    return { dayIndex: scheduledSession.dayIndex, exercises: scheduledSession.exercises };
  }

  return getTodayPlan(planner);
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

export function buildExercisesFromSessionTemplate(template: SessionTemplate) {
  return exerciseFromSessionTemplate(template);
}
