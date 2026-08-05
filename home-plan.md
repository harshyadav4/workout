# Home page — plan

## What's there now

`features/home/home-dashboard.tsx` (370 lines) works and typechecks against the current
store. It is not broken so much as it is the wrong screen: a 9-card dashboard where the
gym-floor tool should be.

Concrete problems, in order of severity:

1. **Off days render a dead screen.** In weekly mode, `buildScheduleSessions` emits a
   `type: "rest"` session for rest weekdays but emits *nothing* for an unassigned weekday
   (`schedule.ts:86` → `continue`). With templates saved and no session today, `hasAnyPlan`
   is true, so Home falls through to the main branch with `selectedSession === undefined`
   and renders: "Workout ready", "0 sets • 0 reps • 0 kg volume", no Start button, no
   Finish button, empty muscle map. Any user with a generated schedule hits this.
2. **Completed sessions look identical to planned ones.** `logTodayWorkout` correctly flips
   status to `completed`, but Home never reads `status`, so "Start Session" and "Finish
   Session" stay on screen after you finish. You can log the same day twice.
3. **Set completion is never recorded.** `PlannedSet.completed` exists in the model and
   `updateSessionSet` can patch it — nothing writes it. Mid-session there is no way to see
   which sets are done. This is the single most important thing a gym screen must show.
4. **Home duplicates Progress.** Four `TrendBars` cards and three lifetime metrics are a
   second, worse copy of `/progress`. Every set row of every exercise is expanded at once,
   so a 4-exercise session is a very long scroll to find the set you're on.

Not blockers, noted: `daily-workout.tsx`, `weekly-planner.tsx`, `create-workout-sheet.tsx`,
`workout-catalog.tsx`, `muscle-usage.tsx`, `progress-charts.tsx` are referenced from
nowhere. Dead. Separate cleanup, not part of this.

## Brief

One subject, one job. **The screen you hold at arm's length between sets, one hand, sweaty,
during a 90-second rest.** Its job: show the set in front of me and let me record it in one
tap. Everything that is not that belongs to Plan or Progress.

## Direction

Existing tokens stay — they're good and already carry the app: navy `--background`
`212 42% 7%`, orange `--primary` `18 95% 58%`, cyan `--accent` `190 94% 42%`, cream
`#F7ECD9` on the body map panels. No repalette.

**Type.** Add `Space_Mono` as `--font-mono` alongside Space Grotesk (same family lineage,
so it pairs by design rather than by accident). Every number on this screen — weight, reps,
set index, rest clock — is set in it, tabular, oversized, with the unit as a small suffix.
The numerals *are* the page's personality; a stamped-plate look, not a chart look.

**Signature: the set ledger.** An exercise is one row, not a stack of expanded cards. Its
sets render as a tally of chips — `▮▮▮▯▯` — filled orange as they're completed, hollow
ahead of you. Exactly one set is expanded at a time: the one you're on, with the big
weight/reps steppers and a single full-width **Log set** button that fills the chip and
advances. Tap any chip to go back and fix it. That's the whole interaction. It's the gym
logbook rendered honestly, it's one-handed, and it collapses ~200 lines of always-open set
cards into a dense readable column.

**Motion.** One moment, and only one: the chip fills on log — a fast scale-and-fill stamp.
Behind `prefers-reduced-motion`.

**Layout, top to bottom:**

```
 ┌──────────────────────────────┐
 │ TUE 28 JUL          ● active │   date + state, small caps
 │ Push A                       │   session name, display weight
 │ 12 of 18 sets                │   mono, tabular
 ├──────────────────────────────┤
 │ Bench Press      ▮▮▮▯▯       │   ledger row, collapsed
 │ ┌──────────────────────────┐ │
 │ │ SET 4      last 60kg × 8 │ │   the one open set
 │ │   −   62.5 kg   +        │ │   mono, oversized
 │ │   −    8 reps   +        │ │
 │ │ [       Log set        ] │ │
 │ └──────────────────────────┘ │
 │ Incline DB       ▯▯▯         │
 ├──────────────────────────────┤
 │ [    Finish session    ]     │
 ├──────────────────────────────┤
 │ Muscle map (front / back)    │   kept — it's the app's identity
 └──────────────────────────────┘
```

Charts and lifetime totals come off Home entirely. Progress owns them.

## Day states

Home becomes a state machine over one resolver, not a pile of `?.` checks:

| state | when | screen |
|---|---|---|
| `setup` | no templates, no sessions | "Create your first workout system" → /plan |
| `ready` | workout session, `planned` | session card + Start |
| `logging` | workout session, `active` | the ledger, above |
| `done` | workout session, `completed` | completion stamp + what's next |
| `rest` | `type: "rest"` session today | rest card + what's next |
| `open` | plan exists, no session today | **currently broken** — "No session scheduled" + add-one link + what's next |

Resolver goes in `lib/schedule.ts` next to `buildScheduleSessions`, with asserts added to
`lib/schedule.test.ts` — `npm run check` already runs it. No new test file, no framework.

## Tasks

1. **Done.** `resolveDayState()` + `findNextSession()` in `lib/schedule.ts`, asserts in
   `lib/schedule.test.ts`.
2. **Done.** `--font-mono` (Space Mono) in `app/layout.tsx`, `globals.css`,
   `tailwind.config.ts`.
3. **Done.** `home-dashboard.tsx` rewritten around the six states (370 → 300 lines); ledger
   row extracted to `features/home/exercise-ledger.tsx`.
4. **Done.** "Log set" writes `completed: true` through the existing `updateSessionSet`.
   Store API unchanged, so `plan-build.tsx` / `plan-schedule.tsx` were not touched.
5. **Done.** `TrendBars` and the lifetime metric row are off Home.

Not in the original list, but required by task 4: `buildLogFromSession` counted every
planned set regardless of `completed`, so the moment Home started marking sets, a session
cut short would have logged work never done. Moved out of the store into
`lib/workout-helpers.ts` (pure, testable, store API untouched) with the rule: if any set in
the session was marked, only marked sets are logged and untouched exercises drop out; if
nothing was marked, the whole plan counts, which keeps the old finish-in-one-go behaviour
intact. `lib/workout-helpers.test.ts` covers it and `npm run check` runs it.

Two more found while wiring it up, both fixed:

- `lib/seed-data.ts` gave every exercise's sets the ids `"1"`, `"2"`, `"3"`, duplicated
  across exercises. The ledger tracks one open set by id across the whole session, so on a
  fresh install every exercise would have opened a panel at once. Ids are now
  `${workoutId}-plan-set-N` — deterministic, so server and client seed identically — and
  `workout-helpers.test.ts` asserts session-wide uniqueness.
- The muscle map narrowed to the first exercise in the `ready` and `done` states, under a
  caption promising the whole session. Narrowing now happens only while `logging`.

## Closing pass

6. **Done.** The rest-day muscle map was blank while the card promised the next session's
   muscles: rest sessions carry `exercises: []` (`schedule.ts:143`) and `??` stops at an
   empty array, so `next?.exercises` was never reached. `home-dashboard.tsx` now tests for
   work rather than for a session. `open` was only correct by accident — `session` is
   `undefined` there.
7. **Done.** The motion moment is the chip stamp the brief asked for, not the panel
   slide-in that stood in for it. `.set-chip-stamp` in `globals.css` scales the chip from
   0.25 through 1.18 as it fills; Home tracks `stampedSetId` so it plays on the tap and
   nowhere else — not on load, not as focus moves down the ledger. The `.set-panel`
   animation is gone: one moment, and only one.
8. **Done.** All eight dead files deleted (`body-viewer`, `body-viewer-lazy`,
   `daily-workout`, `weekly-planner`, `create-workout-sheet`, `workout-catalog`,
   `muscle-usage`, `progress-charts`). That orphaned `recharts`, `three`,
   `@react-three/fiber` and `@react-three/drei` — all four uninstalled, nothing imported
   them.

## Resolved question

The idle states keep the single "Next: Pull A, Thursday" line. Not today-only, no week
strip — Plan owns the week.

## Still open

- Not seen rendered. `npm run build`, `tsc --noEmit` and `npm run check` pass, but Home
  sits behind the Firebase auth guard and no browser session has been driven through the
  six states, so they are verified by types and asserts, not by eye.
