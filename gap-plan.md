# Closing the openGym gaps — all seven shipped

Scope = the gaps in `opengym-review.md`. **Not** the things `product-plan.md` already declined
(cardio, competitor importers, program library) or deferred behind a trigger that has not fired
(supersets, RIR, service worker, push). Those stay decided.

Seven tasks, value order. Each lands with its check.

### 1. Progression — the headline
`lib/progression.ts`, pure. Reads the same `lastPerformance` that
`plannedExercisesFromTemplate` already calls, returns `{ weight, reps, reason }`.
Rules: `off` (today's behaviour), `linear`, `double` (rep range, then load).
Missed reps never advance. Two stalls at a weight → 10% deload. Zero-weight lifts
progress in reps. Per-session-template default, per-exercise override.
The `reason` string is not decoration — it is the "why is it that number" the review named.

### 2. Estimated 1RM — deferral unblocked
`progress-metrics.ts:596` says it can't be done because logs store `totalReps` per exercise.
`SetLog` has per-set reps now. Epley off the best eligible set, refuse above 12 reps, name
the set it came from. Series + a card.

### 3. Reps per side
`perSide` on the exercise. Log the total, show the split, step targets in twos.

### 4. Import the export back
`buildExport` exists with no read path. Add `parseExport` + merge, reusing `reconcile`.

### 5. Reschedule a day
`plan-schedule.tsx` only removes. Move a session to another date, weekly plan untouched.

### 6. Themes
`app/layout.tsx:49` hardcodes `dark`. Light/dark/system, persisted.

### 7. Print a plan
`window.print()` + a print stylesheet. No PDF library.

Skipped: i18n (scope question, not a gap), accent colours (theme is the useful half).

Every new `*.test.ts` must be added to `npm run check` or it never runs.

---

## What shipped

| # | Gap | Landed in |
|---|---|---|
| 1 | Progression rules | `lib/progression.ts` + `plannedExercisesFromTemplate`, picker in Build, `0004_progression.sql` |
| 2 | Estimated 1RM | `lib/one-rep-max.ts`, `features/progress/one-rep-max-card.tsx` |
| 3 | Reps per side | `lib/per-side.ts`, ledger stepper, Build toggle |
| 4 | Import a backup | `lib/import-backup.ts` → the store's existing `hydrateRemote` |
| 5 | Reschedule a day | `moveSession` in `lib/schedule.ts`, Plan's day dialog |
| 6 | Themes | `lib/theme.ts`, light palette in `globals.css`, toggle on Profile |
| 7 | Share / print a plan | `buildPlanExport`, `lib/download.ts`, `@media print` |

Seven new test files, all added to `npm run check` (21 runs, green).

**Deploy prerequisite (first pass):** run `supabase/migrations/0004_progression.sql` before shipping this.
`sessionTemplateToRow` always writes `progression` now, and `pushChanges` throws on the first
failed write — so on a project still at `0003`, saving *any* session fails, not just one with a
rule set.

**Two decisions worth knowing about:**

A progression rule moves an exercise **as a block**, so a 40/50/60 ramp becomes 42.5/52.5/62.5
rather than being flattened to one number. The first cut let the rule overwrite every set, which
silently discarded per-set weights typed in the builder.

A rescheduled day leaves a **manual rest day** behind it. An empty date is one the generator
refills, which would duplicate the session that just moved — `lib/schedule.test.ts` asserts the
move survives a regeneration.

**Not done, deliberately:** i18n (a scope question, not a gap), accent colours (the theme is the
useful half), and everything `product-plan.md` already declined or deferred behind a trigger that
has not fired.

---

# Second pass — `opengym-review.md`, appended section

Read against the fork's own README, which lists more than upstream's did. Three gaps and one
paper cut; everything else on the longer list is already here, already declined, or already
deferred behind a trigger that hasn't fired.

| # | Gap | Landed in |
|---|---|---|
| 8 | Held seconds were discarded at Finish | `SetLog.durationSeconds`, `buildLogFromSession`, `lib/sync.ts` mappers, `0005` |
| 9 | No progression rule for held lifts | the `time` rule in `lib/progression.ts` |
| 10 | No goal on the bodyweight chart | `ProfileInfo.goalWeightKg`, Profile input, a reference line on `body-weight-card` |
| — | Picker offered equipment the body part didn't have | `features/planner/exercise-picker.tsx` |

**Check the database is actually where you think it is.** The project this was first
deployed against turned out to be at `0001` — `0002` and `0003` had never been run, so
`set_logs` and `body_measurements` did not exist and `loadUserState` had been failing on
them since long before this branch. `0004` applied cleanly anyway, because it only touches
a table `0001` creates, which makes a successful `0004` no evidence at all that `0003` ran.
Run every file in order and read what each one says.

**Deploy prerequisite (second pass):** run `supabase/migrations/0005_duration_and_goal.sql`
*as well as* `0004`, before shipping. Both new columns are written unconditionally by their
mappers and `pushChanges` throws on the first failed write, so on a project still at `0004` the
two things that break are **finishing a workout** and **logging a weigh-in** — the second because
`profileChanged` keys off the profile object and `profile.weightKg` is derived from the newest
weigh-in, so the prompt on Home and the Body card both push a profile row. It is not only an edit
on the Profile screen, and it is the wider blast radius of the two. On a project still at `0003`,
`0004`'s own prerequisite above still applies and saving any session fails as well.

The failure is at least legible: `syncErrorMessage` surfaces Postgres's own text, so the sync
status reads `column profiles.goal_weight_kg does not exist` rather than a generic network error,
and `retrySync` succeeds once the migration is run — nothing is lost, the local store is the
source of truth until the push lands.

**Why 8 came before 9:** a time rule reads a history of held seconds, and nothing was writing one.
`metric: "time"` was plannable and loggable and then thrown away at the seam — the same shape as
the stale e1RM comment the first pass caught, one layer further down. Sessions logged before `0005`
cannot be back-filled; the rule simply has no history for those lifts and falls back to the plan's
own numbers, which is what it already does for a first-ever session.

**Two properties of the time rule worth knowing:**

It **replays** the target forward from the template, oldest session first, rather than reading it
off the last row. A bar records what you attempted, so `last.weight` *is* last session's target;
a hold records only how long you lasted, which after a near-miss is short of it — comparing
against the template's own 45s would clear it forever and the stall and deload branches could
never fire. The cost is that hand-editing a template's hold reinterprets history: after a manual
raise the first session or two read as misses, it deloads once, then re-converges.

It is **the only rule for held lifts, and only for held lifts.** A session set to `time` leaves
its rep exercises on the plan's own numbers with no note attached — a bench press has no seconds
to judge. That is benign rather than correct: the per-exercise override that would let one session
run `linear` on the bench and `time` on the plank exists in `SessionTemplateExercise.progression`
and is still not exposed in Build.

**Still not done, deliberately:** Greyskull LP (a third variant of arithmetic two rules already
cover), 5/3/1 training-max programming (a program library by another name), i18n, accent colours,
guest mode, and everything the first pass declined.
