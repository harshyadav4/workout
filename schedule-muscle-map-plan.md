# Schedule muscle map

## What
Plan → Schedule tab: tapping a day in the week strip shows which muscles that
day's scheduled session(s) hit, using a body SVG (front + back, heat-shaded).

## Reuse — nothing new gets built
- `MuscleMapCard` (`features/home/muscle-map-card.tsx`) — front/back SVG, heat
  legend, tap-to-select. Already used on Home. No changes.
- `buildMuscleHighlightsFromWorkoutIds(workoutIds, templates)`
  (`lib/workout-helpers.ts`) — turns a list of exercise `workoutId`s into
  `BodyMuscleHighlight[]`. No changes.
- `state.templates` — the exercise catalog (muscle engagement per exercise),
  already read the same way on Home.

## Change — one file: `features/planner/plan-schedule.tsx`
1. Read `templates` from `useWorkoutStore`.
2. `dayWorkoutIds` = workout-type sessions for the selected day → their
   exercises' `workoutId`s. Memoized on `sessionsForDay`.
3. `dayHighlights = buildMuscleHighlightsFromWorkoutIds(dayWorkoutIds, templates)`.
4. Local `useState` for the tapped muscle — own state, not Home's global
   `selectedMuscleId` (this is a hypothetical future day, not "today"; sharing
   would make picking a muscle here silently change what Home highlights).
5. Render `MuscleMapCard` right under the day's session list, only when
   `dayWorkoutIds.length > 0` — a rest day or empty day has nothing to show,
   so nothing renders (no empty "all idle" body for no reason).
   - Title: "Muscles this day hits"
   - Description names the selected day, e.g. "Sat 16 — worked at a glance."

## Placement decision (ui-ux-pro-max)
Always-open, not a collapse/expand toggle. It's the direct answer to what
this tab is for (planning a day), not secondary trivia — hiding it behind a
tap adds an interaction for zero benefit and risks layout shift when it
opens. Sits inline in the same card as the day's session list, same density
as the rest of the page.

## Skipped
- No new SVG/highlight logic — both already exist and already do this job on
  Home, just fed a different set of `workoutId`s.
- No global state for the tapped muscle — add it only if some other screen
  needs to read the same selection later.
