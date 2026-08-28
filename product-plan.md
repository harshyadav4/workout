# Product review — plan

Pairs with `product-review.md` (2026-08-14, `18a86ce`).

**Scope.** The engineering half only: STEP 8's roadmap and STEP 9's top five. Monetization,
pricing and positioning (STEPs 12–13) are decisions, not tasks — they stay in the review
until there are users to price.

## What I re-verified before planning

The review's load-bearing claims hold at HEAD:

| Claim | Status |
|---|---|
| Subscriber attached inside `.then` → never attaches if load fails | `supabase-sync.tsx:82`, confirmed. No `pagehide`/`visibilitychange` flush anywhere. |
| `hydrateRemote` replaces `logs` outright | `workout-store.tsx:788` — `logs: payload.logs ?? []`. Confirmed. |
| Manifest 404 | `app/layout.tsx:24` says `/manifest.json`; disk has `public/manifest.webmanifest`. Confirmed. |
| `previousWeight` comes from the template | `workout-helpers.ts:224-225`, rendered at `exercise-ledger.tsx:206`. Confirmed. |
| `restSeconds` is inert text | Exactly one read in the whole app: `exercise-ledger.tsx:172`, a static `· 90s rest` label. Confirmed — the countdown is new UI on top of that, so the timer task is not just a `setInterval`. |
| Timezone hardcoded | 5 sites in `lib/utils.ts` + 1 in `seed-data.ts`. Confirmed. |
| `planner` subsystem dead | Only self-references in `workout-store.tsx` plus `getPlanByDay`/`summarizeDay` in `workout-helpers.ts`. Confirmed. |
| `workout_logs` round-trips `workoutId`/`date`/`peakWeight` | `sync.ts:113-144`. Confirmed — so a real "last top set" is readable from data that already exists. |
| `diffRows` with an empty base emits zero deletes | `sync.ts:242-252`. Confirmed — this makes the offline-recovery path below safe. |

**Status (2026-08-26): all 21 built.** `tsc --noEmit` clean, `npm run check` green (now eleven
invocations — `lib/reconcile.test.ts` and `lib/suggestions.test.ts` are new and both are in the
`check` script), `npm run build` green. Phase 0 was already applied before this pass; 5-21 are new.

Six places where building it decided something the plan left open, or went a different way:

- **Task 5 needed an owner tag before its own item 2 was safe.** "Push against an empty base when
  the load failed" is the fix for a dead session, and it is also how user A's local workouts reach
  user B's account on a shared device — the guard `profile-review.md` credits under *What holds up*
  exists precisely to stop that. So the persisted blob now carries the `userId` that wrote it
  (`claimFor`), the key moved to `gymflow-state-v4`, and an untagged or foreign blob is dropped
  rather than adopted. That is also the root-cause fix for `profile-review.md` #4.
- **The empty base fires only on a *failed* read, never on an unfinished one.** Both leave
  `syncedRef` undefined, and a cold mobile start routinely outlasts the 1500 ms debounce — without
  the distinction, backgrounding the app mid-read pushes stale local rows over newer remote ones.
- **`reconcile` lives in `lib/reconcile.ts`, not `lib/sync.ts`.** The plan said `lib/sync.ts`, but
  that file imports the Supabase client and its own header states the store never imports it. The
  pure function got its own module; it imports only types.
- **Measurements reconcile on `(date, metric)`, not on `id`.** `upsertMeasurement` mints a *new*
  uuid when you re-measure a day, so an id union leaves Tuesday holding two weights and feeds both
  to the girth series the differentiator is built on.
- **Task 10 needed no third `source` value** — see the Open questions section below.
- **Task 21's precondition was assumed, not met.** The plan gates it on task 19's callout "proving
  accurate", which cannot be established in one pass. Built anyway, with 19's hedging carried into
  it verbatim.

## Brief

**The analytics are ahead of the logger, and the logger is what people open.** Every task
below is judged by one question the review sets in STEP 6: *does it get more users to month
three?* Nothing here is a rewrite — the review is right that the code is well-built. It is
21 tasks: six fixes, one deletion, the rest additions.

Order is not by priority score. It is: **things that lose or falsify data → things that make
week one work → the differentiator.** The one place scoring and sequencing disagree is
tasks 5–6, argued there.

---

## Phase 0 — hours, not days

Do these first because they are cheap and two of them make the later work easier.

### 1. Fix the PWA manifest

`app/layout.tsx:24` → `manifest: "/manifest.webmanifest"`. Add real icons (192 + 512 PNG,
`maskable`) to `public/` and to the `"icons": []` array.

**Files:** `app/layout.tsx`, `public/manifest.webmanifest`, `public/icon-*.png`
**Check:** `curl` the built app for `/manifest.webmanifest` → 200, and the emitted `<link>`
href matches. Same probe the review ran.

### 2. Delete the `planner` subsystem

`planner`, `plannerMode`, `DailyPlan`, `setPlannerDay`, `addExerciseToDay`, `setPlannerMode`,
`useTodayPlan`, `getTodayPlan`, the `logTodayWorkout` fallback branch, and
`getPlanByDay`/`summarizeDay`. Zero external references.

**Do it before tasks 5–7, 10 and 13** — those all edit `workout-store.tsx`, and this removes ~150 lines
of dual-path branching from the file they land in.

Extract `setAndPersist` in the same pass (~30 repetitions of
`const next = {...}; persist(next); return next;`). Not separately — the review is right
that the duplication is where the dead code hides.

**Files:** `features/workout/workout-store.tsx`, `lib/workout-helpers.ts`, `lib/types.ts`
**Check:** `tsc --noEmit` + `npm run check`. Pure subtraction; if anything referenced it, the
compiler says so.

### 3. Direct numeric weight entry

32 taps to reach 100 kg. The stepper stays; the number itself becomes tappable →
`<input type="number" inputMode="decimal">`. Native input, no picker component. Add a max
bound while in there (`min` is 0 today, `max` is nothing).

**Files:** `features/home/exercise-ledger.tsx`
**Check:** none — it is an input swap. Covered by eye.

### 4. Rewrite the README

It documents Firebase, Firestore and Three.js. None exist. Ten minutes, and it is the first
thing anyone reads.

---

## Phase 1 — stop losing and stop lying

### 5. Fix the data-loss paths

Four changes, from the review's STEP 10 trace:

1. **Attach `store.subscribe` unconditionally**, outside the load promise. Today it lives
   inside `.then`, so a failed load means nothing is ever pushed — not even after signal
   returns.
2. **When `syncedRef.current` is undefined at flush time** (load failed, never hydrated),
   push against an *empty* base. `diffRows` emits zero deletes for an empty base — verified
   above — so this upserts everything local and cannot destroy a remote row. Local work
   reaches the server without a successful read first.
3. **Reconcile at hydrate instead of replacing.** Extract a pure
   `reconcile(local, remote): SyncableState` into `lib/sync.ts`: union `logs` by id,
   newest-wins per `scheduledSessions` id, remote-wins for `profile`/`scheduleConfig`
   (unchanged). `hydrateRemote` calls it.
   **Carry the `templates` preset-merge across** — filter `isPreset` from local, append
   remote by id. It is the one branch in `hydrateRemote` that is already correct, it is not
   a replace, and nothing fails loudly if it is dropped during the extraction.
4. **Flush on `pagehide`.** The 1500 ms debounce loses a set if the tab closes inside it.

**Files:** `features/workout/supabase-sync.tsx`, `features/workout/workout-store.tsx`,
`lib/sync.ts`
**Check:** asserts in `lib/sync.test.ts` for `reconcile` — a local log absent from remote
survives; a remote log absent from local is kept; a session present in both takes the newer;
presets survive. That is the exact failure the review traced, expressed as four assertions.

### 6. `set_logs` — the task with a clock on it

**Second, not first, and not later than that.** Every session logged before it exists is
per-set data that can never be back-filled — it is the only irreversible item in the whole
document. But it must follow task 5: `set_logs` adds a `setLogs` line to `hydrateRemote`, and
written today that line inherits the replace-outright bug task 5 exists to delete. Ship 5
first and this is born into a reconciling sync layer instead of being retrofitted into one.

- `supabase/migrations/0003_set_logs.sql` — `id, user_id, log_id, workout_id, date,
  set_index, reps, weight, completed_at`, RLS with both `using` and `with check`, matching
  `0001_init.sql`'s pattern exactly. `log_id references workout_logs(id) on delete cascade`:
  `writeTable` deletes by vanished id, and without the cascade a log delete either fails or
  orphans its set rows.
- `"set_logs"` in **both** places in `lib/sync.ts` — the `TABLES` type union *and* the
  explicit `await writeTable(...)` sequence in `pushChanges` (`sync.ts:316`), which is where
  write order actually lives. It must follow `workout_logs`.
- One mapper pair, `setLogToRow` / `rowToSetLog`, beside the existing ones.
- `buildLogFromSession` emits set rows alongside the rollup.
- `setLogs` threaded through the store so the sync layer can diff it and task 7 can read it:
  the `SyncableState` field, `createInitialState`, `snapshot()` in `supabase-sync.tsx`, and
  `hydrateRemote`. **This is the half of the task that is not "one mapper."**

`workout_logs` stays exactly as it is, as a derived rollup. Nothing downstream changes.

**Files:** `supabase/migrations/0003_set_logs.sql`, `lib/sync.ts`,
`features/workout/workout-store.tsx`, `features/workout/supabase-sync.tsx`,
`lib/workout-helpers.ts`, `lib/types.ts`
**Check:** asserts in `lib/workout-helpers.test.ts` — a session with 3 completed of 8 sets
emits 3 set rows whose reps/weight match, and a rollup whose `totalVolume` equals the sum of
those rows. Ties the two representations together so they cannot drift.

### 7. Make "previous" real

One function, `lastPerformance(workoutId, logs, setLogs)`: prefers the most recent `set_logs`
rows for that exercise, falls back to the most recent `workout_logs` row's `peakWeight` when
there are none. The fallback is not throwaway — it is what every session logged before task 6
will forever have.

`plannedExercisesFromTemplate` stops writing template values into
`previousWeight`/`previousReps` and reads this instead. Copy changes to
`last top set: 62.5 kg` when the value came from a rollup, because that is what a rollup
actually knows.

**If task 6 slips:** ship this with the `workout_logs` branch alone. It is the same function
minus one lookup, and it removes a false number from the most-glanced-at element in the app.

**Files:** `lib/workout-helpers.ts`, `features/home/exercise-ledger.tsx`,
`features/workout/workout-store.tsx` (the three `previousReps: … ?? 8` sites)
**Check:** asserts in `lib/workout-helpers.test.ts` — set-log source wins over rollup, rollup
used when no set logs exist, `undefined` on a first-ever performance (no "last" line at all,
rather than a fabricated one).

### 8. Rest timer

The data is stored and rendered as inert text. Auto-start a countdown on **Log set** from
`exercise.restSeconds`; persistent bar above the ledger; tappable ±15 s and skip;
`navigator.vibrate` on zero. No schema change, no dependency.

**Files:** `features/home/rest-timer.tsx` (new), `features/home/exercise-ledger.tsx`
**Check:** none — a `setInterval` and a format function. The format function (`95` → `1:35`)
is trivial enough that YAGNI applies.

### 9. User timezone

`Intl.DateTimeFormat().resolvedOptions().timeZone` in place of the six hardcoded
`"Asia/Kolkata"` strings. Native, one line, no dependency. The rest of the date handling is
already correct.

**Files:** `lib/utils.ts`, `lib/seed-data.ts`
**Check:** `lib/schedule.test.ts` and `lib/streak-copy.test.ts` already exercise day
boundaries — run them under `TZ=America/New_York` as well as the default. Add both
invocations to the `check` script.

---

## Phase 2 — make week one work

The review's central finding is that retention is entirely front-loaded: month three is
defensible and week one has no loop at all.

### 10. Quick-log without planning

The 15-tap setup wall is the top of every other funnel. From Home's `setup` and `open`
states: *"What are you training today?"* → six group chips → the eight most common exercises
for that group with sane defaults → tap 2–4 → **Start**. Offer *"Train this again? Save as a
session"* on the finish screen, **after** value.

Reuses `ExercisePicker` and `plannedExercisesFromTemplate`. Needs an ad-hoc `ScheduledSession`
that is not schedule-derived — it must survive `mergeGeneratedSessions`, which today
regenerates every merely-`planned` session.

**Files:** `features/home/home-dashboard.tsx`, `features/planner/exercise-picker.tsx`,
`lib/schedule.ts`, `features/workout/workout-store.tsx`
**Check:** asserts in `lib/schedule.test.ts` — an ad-hoc session survives a regeneration of
the window it sits in. That is the one way this silently breaks.

### 11. A finish screen that pays off

Replace *"Logged. It is on your progress charts."* with: sets, tonnage vs. the last time this
session ran, muscles hit **at head level**, any PR, and one gap callout. This is the emotional
peak of a session and the only place the per-muscle model can show off to a user who has just
earned the right to see it.

**Files:** `features/home/home-dashboard.tsx`, `lib/progress-metrics.ts`
**Check:** asserts in `lib/progress-metrics.test.ts` for the summary builder — no previous
session means no comparison line rather than a `+0%`.

### 12. Screen wake-lock while logging

`navigator.wakeLock.request("screen")` on session start, released on finish/`pagehide`.
Native API, ~15 lines, feature-detected. Re-unlocking with chalky hands between every set.

**Files:** `features/home/home-dashboard.tsx`

### 13. Add an exercise mid-session

The rack is taken and the only options are skip or leave the app. The picker already exists;
this is a store action plus a button in the `logging` state.

**Files:** `features/workout/workout-store.tsx`, `features/home/home-dashboard.tsx`

### 14. Schedule-horizon warning

`DEFAULT_WEEKS` is 8 and nothing regenerates. In week 9 the calendar silently empties. A
banner on Plan when the horizon is inside two weeks, with a one-tap extend.

**Files:** `features/planner/plan-schedule.tsx`, `lib/schedule.ts`
**Check:** assert in `lib/schedule.test.ts` for the "days remaining in horizon" helper.

### 15. Reveal Progress cards as the data supports them

~20 cards is right at month six and a wall of near-empty charts at week one — which is
exactly the week this phase exists to fix. Each card already knows its own data threshold
(`LoadCard` has `warm: false` until four weeks of baseline; `MuscleGirthCard` returns `null`
with no measurements). Lift that into a shared gate so a card that cannot say anything yet is
not rendered at all, and show one honest line in its place: *"Volume trend — after 3 more
sessions."*

Do not hide the *cause*. A blank tab with no explanation is worse than empty charts.

**Files:** `features/progress/progress-dashboard.tsx`, `features/progress/panel.tsx`
**Check:** none — it is a render gate over thresholds the cards already compute.

---

## Phase 3 — the differentiator

Strategy A. Deliberately last: the audit is worthless without daily data, so it is downstream
of Phases 1–2. But two of these correct the *inputs* to the band comparison, so they are not
optional decoration.

### 16. A measurement prompt that actually fires — **the gating dependency**

Girth is half the correlation and nothing collects it. Today the only surface is a dot on the
Profile tab, so a tape reading happens by accident. Prompt on the **finish screen** for the
first session of a cadence period; three sites, not eleven; under 15 seconds.

Without this, `MuscleGirthCard` returns `null` forever and the differentiating chart is
invisible by default. It is correct behaviour and it is also why the feature does not exist
in practice.

**Files:** `features/home/home-dashboard.tsx`, `lib/body-metrics.ts`,
`features/profile/measurements-card.tsx`
**Check:** asserts in `lib/body-metrics.test.ts` — the prompt fires once per cadence period,
not once per session.

### 17. Warm-up set flag

Without it, warm-ups are logged as working sets and inflate exactly the weekly set count the
10–20 band comparison rests on. This corrupts the differentiator, so it belongs here rather
than in a general "logging features" bucket.

Also delete or implement `PlannedSet.type: "drop"` — auto-assigned when `sets > 3`, never
read by any UI. Deleting is the default; implementing needs a reason.

**Files:** `lib/types.ts`, `lib/workout-helpers.ts`, `features/home/exercise-ledger.tsx`,
`lib/progress-metrics.ts`
**Check:** assert in `lib/progress-metrics.test.ts` — warm-up sets excluded from weekly set
counts and from volume.

### 18. Bodyweight-inclusive volume

A pull-up logged at 0 kg contributes zero to every volume chart, every muscle attribution and
the streak card's tonnage. The dataset already has a `"body weight"` equipment class; the
profile already has `weightKg`. Needs a per-exercise "uses bodyweight" flag and the profile
weight in the volume formula.

**Files:** `lib/exercises.ts`, `lib/types.ts`, `lib/workout-helpers.ts`
**Check:** assert in `lib/workout-helpers.test.ts` — a bodyweight exercise scores
`reps × (bodyweight + added)`, and falls back to the old formula when profile weight is 0.

### 19. Per-head weekly-set targets + under-stimulation callout

`buildWeeklySetsByGroup` bands at group level. The differentiator needs it per head, with an
explicit *"lowest of any muscle you train"* callout.

**Keep the hedging.** Per-head engagement is derived by 18 regexes against the exercise name
(`HEAD_RULES`), not measured. The honest framing is *"which region your exercise selection is
biased toward"* — never *"your upper pec received 62% of stimulus."* This codebase already
refuses to call ACWR injury risk; the same standard applies, and overclaiming here forfeits
the one thing that makes the app trustworthy.

**Files:** `lib/progress-metrics.ts`, `features/progress/muscle-cards.tsx`,
`features/progress/muscle-detail.tsx`
**Check:** asserts in `lib/progress-metrics.test.ts`.

### 20. Volume ↔ girth callout

The loop no competitor closes: *"you trained this muscle this much → it measured this much."*
`MuscleGirthCard` already renders the girth trend beneath the volume chart for the same
muscle; this adds the sentence that states the relationship, with an explicit minimum-data
gate (no claim under ~8 weeks) rather than a correlation computed on three points.

**Files:** `features/progress/muscle-girth-card.tsx`, `lib/progress-trends.ts`
**Check:** asserts in `lib/progress-trends.test.ts` — below the data threshold it returns no
statement at all.

### 21. Exercise suggestions to close a per-head gap

What turns diagnosis into action, and the last of Strategy A's required features. Task 19
says *"side delts: 4 sets/week, the lowest of any muscle you train."* This adds *"these
exercises in your library bias toward it"* — a filter over `deriveEngagement` for the head in
question, ranked by engagement share, restricted to equipment the user already uses.

**Only after 19 ships and the callout proves accurate.** A suggestion built on a diagnosis
nobody trusts is worse than no suggestion, and the diagnosis is regex-derived. Same hedge as
19: *"biased toward"*, never *"targets."*

**Files:** `lib/exercises.ts`, `features/progress/muscle-detail.tsx`
**Check:** assert in a new `lib/suggestions.test.ts` — a known incline movement ranks above a
known flat one for `pecUpper`. **Add it to the `check` script.**

---

## Not doing

Carried from STEP 7, plus what the phases above displace. Not "later" — **decided against**:

- Social feed, AI workout generation, Apple Watch / WearOS, pre-built program library,
  muscle-recovery modelling, CSV import from competitors, nutrition/cardio/sleep/HRV.
- Normalizing `scheduled_sessions.exercises` out of jsonb — the migration comment already
  argues this correctly.
- Adopting `@supabase/ssr` or adding a server layer — `lib/supabase.ts` argues both correctly.
- Gamification. The week-based streak already shows the right instinct; the retention
  mechanic here is feedback, not reward.
- A rewrite of anything.

**Deferred, with a trigger rather than a date:** supersets and RPE/RIR (revisit once `set_logs`
has run for a month and the schema shape is proven), progress photos, offline service worker,
push notifications, CSV export, plate calculator.

**Shipped since, closing the openGym gaps** (see `opengym-review.md`, `gap-plan.md`):

- **e1RM — no longer deferred.** Its blocker was that logs stored `totalReps` per exercise, not
  per set. `set_logs` removed that; `lib/one-rep-max.ts` reads it and nothing else. The old
  comment at `progress-metrics.ts` is now scoped to `WorkoutLog` rather than claiming the app
  cannot do it.
- **Progression rules** (`lib/progression.ts`) — linear and double, stalls, deloads, bodyweight
  in reps. The one gap openGym had that neither list here had adjudicated.
- Reps per side, import-a-backup, reschedule a day, light theme, share/print a plan.

## Open questions

- **Task 5, reconcile semantics for deletions.** "Union logs by id" means a log deleted on
  another device comes back. Correct trade for now — losing a workout is far worse than
  resurrecting one — but it wants a `deleted_at` tombstone eventually. Not in this plan.
- ~~**Task 10, the ad-hoc session's shape.**~~ **Settled: neither.** Reading
  `mergeGeneratedSessions` showed everything it generates is already `source: "repeat"`, so the
  clause became `status !== "planned" || source !== "repeat"` — the generator only replaces its own
  previous output. An ad-hoc session is plain `source: "manual"`, no new enum value. It also fixed a
  latent bug the plan did not name: a session scheduled by hand from Plan and still `planned` was
  being regenerated away too.
- **`exercises.json` at 990 KB** and `raw.githubusercontent.com` hot-linking. Both real, both
  from the review's tech-debt list, neither blocking a user today. Mirror the media when it
  first breaks.
- **Delete-account is still open** (from `profile-review.md` #10). The client SDK cannot delete a
  Supabase user: it is either a truthfully-labelled "delete all my data" or a `security definer` RPC
  migration reaching `auth.users`. Export shipped; this waits on that call.
- **No component or E2E tests.** The eight logic-layer files are good, but the
  session-logging flow — the highest-risk path, and the one Phase 1 rewrites — has no
  coverage. Every task above adds asserts to existing files; none of them covers the flow
  end to end. Worth one Playwright spec after Phase 1 lands.

## Reminder for every task above

`npm run check` enumerates its test files explicitly in `package.json`. A new `*.test.ts`
that is not added there is silently never run.
