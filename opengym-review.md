# openGym — gap review

Read against [openGym](https://github.com/DuarteSantos8/openGym) (the `arvids-unavailable` fork
is a mirror; the upstream README is the real document). Feature-for-feature comparison with
GymFlow as of `1547ab1`.

**Excluded as a different product model, not gaps:** Docker self-hosting, passkey/WebAuthn login,
the admin dashboard, multi-profile households, the sideloadable Android APK. openGym is a
self-hosted box; GymFlow is a Supabase account. Those bullets don't transfer.

**Not a gap even though a bullet diff makes it look like one:** the 1,324-exercise library is the
*same* upstream dataset (`hasaneyldrm/exercises-dataset`) — `public/exercises.json`, same ids,
same GIFs. And openGym's "GitHub-style activity heatmap" is `features/progress/year-spine.tsx`
here, shipped under a different name.

---

## 1. Already decided in `product-plan.md`

About half of openGym's feature list is already adjudicated. Listing it as a gap would be
re-litigating a call that's already been made — recorded here only so the diff is complete.

**Declined ("Not doing"):**

| openGym feature | Status |
|---|---|
| Cardio (time + speed) | declined |
| Importers — FitNotes / Strong / Hevy / Apple Health | declined ("CSV import from competitors") |
| Pre-built program library / more starter plans | declined |
| Muscle-recovery modelling | declined |
| Apple Watch / WearOS | declined |

**Deferred with a trigger (`set_logs` running for a month):** supersets, RIR/RPE per set,
e1RM curves, offline service worker, push notifications, CSV export, plate calculator,
per-exercise notes.

### One of those deferrals is now unblocked

**Estimated 1RM.** `lib/progress-metrics.ts:596` argues it away:

> *"Deliberately not an estimated 1RM: a log stores `totalReps` for the whole exercise, not
> reps per set, so Epley here would be a guess wearing a formula."*

That comment is stale. `0003_set_logs.sql` shipped and `SetLog` carries per-set `reps` and
`weight` (`lib/types.ts`). The blocker the comment names is gone — e1RM is computable *today*,
not merely clock-started like supersets and RIR. openGym ships it per exercise, names which set
it came from, refuses to guess above 12 reps, and draws its own curve.

---

## 2. The headline gap: nothing here prescribes a next weight

This is the one openGym feature that appears on neither list, and it's the real difference
between the two apps.

openGym: *"pick a progression rule per routine, override it per exercise — linear, Greyskull LP,
double progression through a rep range, or adding time. Your weights are already right when the
session opens, and every target says* why *it's that number. Missed reps never advance the load,
stalls trigger a deload, and bodyweight exercises progress in reps instead."*

GymFlow: `previousWeight`/`previousReps` are written from history (`lib/workout-helpers.ts:311,350`)
and read back for display (`features/home/exercise-ledger.tsx:39`). That's it. The app shows you
what you lifted last time and lets you type a number. Nothing advances the load, nothing catches a
stall, nothing deloads.

So GymFlow is **descriptive** — plan, log, analyze — right up to the point where the analytics
have diagnosed an under-trained head and suggested lifts for it (task 19 → 21), and then it stops
and hands you a blank weight field. The prescriptive half is missing.

**Honest adjacency:** this sits near "pre-built program library", which is in Not-doing. But a
progression *rule* applied to sessions the user built themselves is not a library of someone
else's programs — it's the arithmetic the user is currently doing in their head between sets.
Different thing; collapse it into the declined item if you disagree.

Cheapest useful version: linear only, one field on `SessionTemplateExercise`, applied when
`plannedExercisesFromTemplate` fills `weight` — which is already the function that reads history.

---

## 3. Genuinely uncovered, and small

- **Reschedule a single day.** `features/planner/plan-schedule.tsx:650` offers only "Remove from
  this day". openGym moves a session to another date without touching the weekly plan — sick day,
  missed session, fewer gym days this week. This fits the calendar-cursor architecture better than
  it fits theirs, and it's the most common real-life edit there is.
- **Import your own export.** `buildExport` exists in `lib/sync.ts:377`; there is no
  `applyExport`, no file input, no read path. Export-only means "yours to keep" is a one-way door
  — the file downloads and nothing can ever read it back.
- **Share / print a plan.** openGym exports routines + week schedule as a small file (no logs) or
  a PDF, and importing merges rather than overwrites.
- **Reps per side.** Lunges, single-arm rows. Log the total, display the split, step targets in
  twos. Cheap, and currently every unilateral lift in the library logs a number that means half of
  what it looks like.
- **Themes.** `app/layout.tsx:49` hardcodes `className="dark"`. openGym ships light/dark plus
  8 accent colors per profile.
- **i18n.** openGym has 12 languages. Scope question, not a recommendation.

---

## 4. Where GymFlow is ahead

- **Body measurements.** Unchecked on openGym's roadmap (`[ ] Body measurements (waist, arms…)`).
  Shipped here: 11 sites, left and right kept separate on purpose, with cadence prompts.
- **The 30-muscle model with per-head engagement.** openGym's muscle map shades coarse body parts.
  This one splits delts into three heads, quads into four, hams into two — and per-head weekly set
  targets with an under-stimulation callout are a diagnosis openGym's map cannot make.
- **The volume ↔ girth loop.** Nothing in openGym connects training volume to tape measurements.
- **Warm-up sets excluded from working volume.** openGym's set list doesn't distinguish them, so
  its weekly set counts include warm-ups.

---

## Verdict

One real gap (progression), one stale comment blocking a deferred feature that is now buildable
(e1RM), and five small ones. Everything else is either already decided, already shipped under
another name, or belongs to a product shape GymFlow deliberately isn't.

---

# Second pass — against the fork's own README

The first pass read the upstream README. `arvids-unavailable/openGym` publishes a longer feature
list than that one did, and five of its bullets had no counterpart in the first diff. Read against
the staged tree (the seven gaps in `gap-plan.md` already closed).

## Checked, and not gaps — already here under another name

| openGym bullet | Where it already lives |
|---|---|
| Timed exercises (planks, hangs, wall sits) | `ExerciseMetric = "time"` — planned in Build, held in the ledger |
| Custom exercises | Build registers `custom-${slug(name)}` for any name the library doesn't have |
| Equipment filtering | `filterExercises` + the picker's select |
| Dip belt / added load on bodyweight moves | `setVolume` adds the typed weight to profile bodyweight |
| Screen wake during a workout | `features/home/use-wake-lock.tsx` |
| Rest-timer alerts | `features/home/rest-timer.tsx` — in-app; the *push* half stays deferred |
| Guided demonstrations | `exercise-media-dialog.tsx`, the same dataset's GIFs |

## Declined again, unchanged argument

Passkeys, admin dashboard, multiple profiles, Docker, the APK, guest mode — a self-hosted box's
concerns, not a Supabase account's. Cardio, competitor importers, multiple starter plans, and
percentage/training-max (5/3/1) programming — a program library by another name — stay where
`product-plan.md` put them. i18n and the 8 accent colours are still scope questions rather than
gaps. Per-exercise notes and the plate calculator are unchecked on openGym's *own* roadmap and
deferred here behind the same trigger.

## Three real gaps

### 1. Timed sets logged nothing at all

The worst finding of this pass, and it isn't on openGym's list — it's ours. `metric: "time"` is
plannable and loggable end to end, and then `buildLogFromSession` wrote set rows as
`{reps, weight}` only. `SetLog` had no `durationSeconds`; `set_logs` had no column. A 90-second
plank was recorded as zero reps at zero kg and the seconds were dropped at Finish — the same shape
as the stale e1RM comment the first pass caught, one layer down: the type permitted it, the writer
never wrote it. Nothing could be back-filled, and no rule could read a history that was never
written.

### 2. No progression rule for held lifts

openGym's fourth rule is "adding time". `nextTarget` had a guard — `if (plannedReps <= 0) return
plan` — sitting *above* the rule dispatch, so held lifts were returned unchanged by design.
Gap 1 was its prerequisite: a time rule with no persisted seconds has nothing to judge.

### 3. No goal on the bodyweight chart

openGym draws a goal line across the weigh-in chart. `grep -rn goal` returned nothing here: the
card plotted the readings and the 7-day mean, and a weigh-in chart with no target is only history.

## One paper cut

The picker offered all 28 equipment values regardless of the body part selected, so barbell + waist
was a reachable combination that always returned "no matches" — a dead end the picker had the data
to refuse before you tapped it.
