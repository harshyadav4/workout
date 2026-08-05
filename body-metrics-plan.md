# Body metrics — bodyweight and measurements

> "can we also track weight" · "show on graph" · "measurements like chest, bicep etc, show that user
> can see how its muscle grow" · "on which page will show"

**Status (2026-08-05): built.** `tsc` clean, 9 test suites pass (`lib/body-metrics.test.ts` is new),
`npm run build` green. This resolves `profile-review.md` finding #2, where `profile.weightKg` was a
single scalar that no code path could change and nothing consumed.

Three things below were decided differently once building started, and the text further down has
been left as originally written rather than quietly rewritten:

- **Eleven sites, not fourteen** — dropped neck and the forearm pair, and merged bicep/forearm into
  a single arm measurement per side. Decision 2 offered a trim and this is it.
- **Cadence shipped, reversing decision 3.** You asked to be asked how often. Weight and tape get
  separate cadences (weekly / 2 weeks / monthly / off), because people weigh weekly and measure
  monthly. It is **in-app only**: no notification permission, nothing scheduled server-side. A due
  reading raises a banner on the Profile card *and* a dot on the Profile tab in `bottom-nav.tsx`, so
  it reaches someone sitting on Home. Any single tape reading clears the tape cadence — per-site
  cadences would be more correct and would also mean eleven separate nags.
- **The entry card is `features/profile/measurements-card.tsx`**, not the `weight-card.tsx` named in
  the file table, and it commits every field — height included — through one draft and one Save
  rather than writing per keystroke. `Number("")` is `0`, so a per-keystroke write turns clearing a
  field into recording a zero, which is the same bug as Plan review #9.

Decisions 1 (kg/cm) and 4 (full history, ignoring the Progress window) shipped as written.

## One model, not two

Weight and tape measurements are the same shape: a number, on a date, for a body site. Treating them
as one series is the difference between one table, one action, one chart component and one entry
form — versus two of everything that drift apart.

```ts
export type BodyMetric =
  | "weight"
  | "neck" | "shoulders" | "chest" | "waist" | "hips"
  | "bicepL" | "bicepR" | "forearmL" | "forearmR"
  | "thighL" | "thighR" | "calfL" | "calfR";

export interface BodyMeasurement {
  id: string;
  date: string;   // YYYY-MM-DD
  metric: BodyMetric;
  value: number;  // kg for "weight", cm for every circumference
}
```

Store: `measurements: BodyMeasurement[]` and `logMeasurement(metric, value, date = todayKey())`,
which **upserts on `(date, metric)`** — measuring your chest twice on a Tuesday replaces Tuesday
rather than adding a second point. Kept sorted by date, the way `scheduleSession` already does
(`workout-store.tsx:374`).

`profile.weightKg` becomes **derived** from the newest `weight` entry instead of being a second
source of truth. That retires the dead field without a migration and without two numbers that can
disagree.

**Left and right are separate metrics on purpose.** Arm asymmetry is real and is one of the few
things a tape measure catches that a mirror doesn't. Averaging them at the model level throws that
away permanently; the chart can average for display if it wants.

## Which page — the answer

**Both, split by task.** Logging and viewing are different jobs with different rhythms.

### Entry → Profile

Measuring is occasional, deliberate, and it is personal data, not training data. It belongs on the
page that already means "you" rather than "your training". It also gives Profile a reason to exist:
today it is four read-only rows and a sign-out button.

One card, one row per metric — last value, the change since the previous reading, and a field to
enter today's. Weight pinned to the top since it moves most often.

### Charts → Progress, inside the muscle drilldown

This is the part that answers "see how its muscle grow", and the integration point already exists:

- `progress-dashboard.tsx:178` renders `MuscleMapCard` — the tappable front/back body.
- `:219-233` already opens a **per-muscle drilldown** on tap: `MuscleDoseCard`, `MuscleVolumeCard`,
  `MuscleLiftsCard`, `ConsistencyCard`.

So tapping **Biceps** on the map already opens a panel about biceps. A `MuscleGirthCard` slots in
beside those four, and the question the app answers becomes *"I trained this muscle this hard — did
it actually grow?"* — training input and physical output on one screen. That is a genuinely strong
card, and it exists because the drilldown was already built.

Mapping `MuscleId` → `BodyMetric` is a small lookup, not a redesign: `biceps` → `bicepL`/`bicepR`,
`pecUpper`/`pecLower` → `chest`, the quad heads → `thighL`/`thighR`, `gastrocnemius`/`soleus` →
`calfL`/`calfR`. Muscles with no tape site (`serratus`, `rhomboids`) simply don't render the card —
the same way `MuscleLiftsCard` handles a muscle with no logged lifts.

Bodyweight isn't per-muscle, so it gets its own trend card in the whole-body section of Progress,
near `VolumeTrendCard`.

## Two charting decisions that decide whether this is useful

- **The y-axis must not start at zero.** Bodyweight moves 2–3% and a bicep moves a centimetre over
  months. A zero-based axis renders a year of real change as a flat line. `domain={["dataMin - 1",
  "dataMax + 1"]}` on every one of these charts.
- **Plot a 7-day moving average over the raw readings for weight.** Day-to-day bodyweight is mostly
  water; a raw line reads as noise and invites reacting to it. Faint dots for readings, a solid line
  for the average. Circumferences are measured too rarely to need this — plot those raw.

## Reuse, not new infrastructure

`features/progress/chart-theme.tsx` already exports `axisProps`, `gridProps`, `CHART`,
`ChartTooltip`, `EmptyChart` and `formatKg`; `panel.tsx` gives the card shell. Each chart is
`volume-trend-card.tsx`'s shape with a different series — roughly 40 lines each, no new dependency.

## Files

| File | Change |
|---|---|
| `lib/types.ts` | `BodyMetric`, `BodyMeasurement` |
| `features/workout/workout-store.tsx` | `measurements` state, `logMeasurement` upsert, persist, `hydrateRemote` |
| `lib/body-metrics.ts` *(new)* | series-by-metric, moving average, latest + delta, `MuscleId` → `BodyMetric` map, `unitFor` |
| `features/profile/measurements-card.tsx` *(new)* | the entry card |
| `app/(app)/profile/page.tsx` | mount it (and extract the client leaf, per review #3) |
| `features/progress/muscle-girth-card.tsx` *(new)* | the drilldown chart |
| `features/progress/body-weight-card.tsx` *(new)* | whole-body weight trend |
| `features/progress/progress-dashboard.tsx` | mount both |
| `lib/sync.ts` | `SyncableState` + both directions |
| `supabase/migrations/0002_body_measurements.sql` | new table, RLS matching the existing tables |
| `lib/body-metrics.test.ts` *(new)* | same-day upsert, moving average, and that measurements never reach `buildLogFromSession` |

## Decisions worth confirming before I build

1. **Units.** kg and cm throughout, no imperial toggle. Everything in the app is already kg.
2. **Which sites ship.** The fourteen above is a guess at completeness. A shorter list — weight,
   chest, waist, biceps, thighs — is less to maintain and covers most of what people actually track.
   Say if you want the long list trimmed.
3. **Reminders.** No scheduling or nagging in this pass. Measuring is manual and occasional.
4. **Progress date windows.** These cards read the same window as the rest of Progress. A one-month
   window on a metric measured monthly shows one point; the cards should widen to their own full
   history instead. I'd default to full history and ignore the window — flagging it because it is the
   one place this feature disagrees with the screen it lives on.

Say go and I'll build it, or tell me which of the four to change first.
