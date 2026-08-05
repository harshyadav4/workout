# Progress page — plan

## What's there now

`features/progress/progress-dashboard.tsx` (188 lines) renders four `StripChart` cards.
A `StripChart` is a list: one label + one filled track **per logged date**. Against the
seeded year (`scripts/seed-year.ts`, ~250 sessions) that is ~1,000 rows of scroll across
the four cards, and no row can be compared to the one three screens above it. It is a
table wearing a chart's clothes.

Concrete problems, in order of severity:

1. **Two of the four range chips render an empty page.** `startDateForRange`
   (`lib/workout-helpers.ts:169`) hard-codes `2026-03-28 … 2026-04-04` for *weekly* and
   `2026-03-01 … 2026-04-04` for *monthly*. Those dates are in the past and were never
   relative to anything. Today the chips filter every log out.
2. **The *custom* chip is dead.** There is no date picker, so `filterLogsByRange` falls
   through to the all-time branch — a fourth chip that silently duplicates "All Time".
3. **Nothing is comparable.** Every card is an unscaled running total. No "vs the
   previous month", no personal best, no sense of whether a week was a good one.
4. **No consistency view at all.** For a training log, "did I show up" is the first
   question and the page cannot answer it.
5. **Filters live inside a card.** A "Time Range" card scoping the cards below it reads
   as content. It is chrome.

## Brief

The screen you open on the couch, not the one you hold in the gym — Home already owns
the gym. One question: **am I getting stronger, and where is the work going?**

## Direction

App tokens stay: navy `--background` `212 42% 7%`, orange `--primary` `18 95% 58%`,
cyan `--accent` `190 94% 42%`, Space Grotesk / Space Mono. The charts add a palette of
their own, validated with the dataviz validator against the glass-card surface
`#0d1420` in dark mode — every check passes, no eyeballing:

| Role | Value | Used by |
|---|---|---|
| series 1 | `#e8642a` orange | volume, top set, the emphasised mark |
| series 2 | `#12a2b8` teal | second series where one exists |
| series 3 | `#7b6ae0` violet | reserved |
| series 4 | `#2aa25e` green | reserved |
| heat ramp (ordinal) | `#743a1b → #a44f20 → #d16026 → #f5732b` | consistency calendar |
| gridline | `rgba(255,255,255,0.06)` | hairline, solid, never dashed |

Charts come from **recharts 3.10.1** (already installed). The calendar does not — 52×7
cells is a CSS grid, and no chart library does it better than `grid-template-rows`.

## The screen, top to bottom

1. **Filter row** — `4W / 12W / 1Y / All`, relative to today, above everything and
   outside any card. Exercise chips scroll horizontally beneath it. Both scope every
   card below, so the numbers always agree.
2. **Hero + stat tiles** — range volume as the hero figure (≥48px, sans, proportional
   figures) with a signed delta against the previous window of equal length, then three
   tiles: sessions, sets, heaviest lift. No sparklines — the volume chart is directly
   below and would say the same thing twice.
3. **Volume — area chart.** Bucketed by day at 4W, by week above it. Single series, so
   no legend: 2px line, 10% wash, crosshair tooltip. Empty buckets are filled with zero
   so time stays evenly spaced.
4. **The tonnage card — the numbers under the volume.** Volume is a product, so show its
   factors, not just the product: tonnage/week, average session volume, average weight
   per rep (working intensity), reps per set, sets per session. A stat grid, not a chart
   — five headline numbers are a KPI grid, and a grouped bar of five unrelated units
   would be a lie.
5. **Strength growth — dumbbell chart.** First top set → latest top set per exercise over
   the range, one row each, sorted by percent gained, the delta direct-labelled. This is
   the *before → after per item* form, and it answers "am I getting stronger" per lift
   rather than in aggregate.
   *Not estimated 1RM:* `WorkoutLog` stores `totalReps` for the whole exercise, not reps
   per set, so Epley would be fiction dressed as precision. Top set is what was lifted.
6. **Top set — line chart.** Heaviest set per session for one exercise (the selected
   chip, or the highest-volume exercise when no chip is on — the card names which),
   with the personal best as the one direct-labelled point.
7. **Consistency — calendar heatmap.** One cell per day, a column per week, coloured by
   that day's volume on the ordinal ramp. Horizontally scrollable — 52 columns do not
   fit in `max-w-md`.
8. **Rhythm — which days you actually train.** A column per weekday, sessions logged on
   it across the range, with the two thinnest columns named in a line of copy ("you
   almost never train Wednesday or Sunday"). Beside it the gap numbers: sessions per
   week, average rest between sessions, longest layoff, days since the last one.
9. **Weekly sets per muscle group — bars against the landmark.** Average hard sets per
   week per group, with a reference band at 10–20 sets, the range the hypertrophy
   literature converges on. A set counts for a muscle at engagement ≥ 50, half at ≥ 25 —
   the usual direct/indirect convention. This is the one chart that tells you what to
   change next week.
10. **Muscle split — radar.** Share of volume across the six `MuscleGroup`s: the shape of
    your training rather than its adequacy, which is what #9 measures. Legacy coarse
    muscle ids resolve through `resolveMuscleIds` so old logs still count.
11. **Where the volume goes — horizontal bars.** Exercises by volume, one hue, value at
    the tip, top 8 with the tail folded into "Other".
12. **Body map** — `MuscleMapCard`, unchanged, with the per-muscle focus ranking beneath
    it: most-trained and most-neglected muscle by volume share. The radar compares six
    groups at a glance; the map locates thirty muscles.
13. **The numbers — table.** Every chart above in rows: one line per session (date,
    workout, exercises, sets, reps, volume, top set), most recent first, with a
    per-week rollup toggle. This is the table-view twin dataviz requires — no value on
    the page is reachable only by hovering a chart — and it is the view a nerd actually
    reads once the shapes have told them where to look.

## Signature

The year calendar. It is the only thing on the page that shows all 365 days at once, and
the only one that answers "did I show up" without a number.

---

# Revision 2 — the body is the navigation

The v1 page shipped and read as generic: thirteen cards of equal weight, all aggregate,
nothing you could point at. Aggregates cannot answer the question a lifter actually has,
which is about **one muscle at a time**.

## What changed

**The figure moves to the top and becomes the control.** Tapping a muscle opens a
delimited drill-down block above the whole-body cards, headed with the muscle's name.
The plaque under the figure carries the three facts the tap was asking for: rank
(`#2 of 30 by volume · 11.4%`), last trained, sessions, sets/week.

Drill-down, in order:

1. **The dose** — a radial gauge: hard sets a week on this muscle against the 10–20 band.
   Circular because the reading is "where am I on a fixed scale". The arc goes grey
   outside the band, orange inside it.
2. **Load on <muscle>** — area chart of the volume that *reached* this muscle, each lift
   cut to its engagement share. Not session tonnage counted once per muscle it touched.
3. **The lifts that build it** — one row per lift, first → latest top set and %, tagged
   direct (≥50 engagement) or indirect. Tapping a row opens that lift's top-set line.
4. **When you trained it** — the calendar, filtered to this muscle. Its quartiles
   recompute over the muscle's own days, so shade is relative to how hard you usually
   work it.

**Why there is no single "muscle strength" line.** `peakWeight` is per-exercise. Maxing it
across every lift that hits the lats plots deadlift on pull days and pulldown on the rest —
a sawtooth that tracks which lift you chose, not the muscle. Top sets only compare inside
one lift, so the row is the unit.

**Two bases, deliberately.** `attributeToMuscle` is *unfloored* — it carries every kilo
that reached the muscle, so the load area and the calendar reconcile with the share
printed in the plaque above them. `filterByMuscle` applies **engagement ≥ 25**
(`MUSCLE_FLOOR`) and feeds the lift roster and the sets/week gauge, where "did this work
the muscle" is the actual question. Flooring the attribution would draw a load curve
strictly smaller than the percentage above it; not flooring the roster would list every
compound in the app under every muscle.

**An untrained muscle renders one card, not four.** Thirty muscles means a lot of taps
land on something with no history, and four stacked empty states is the complaint that
started this revision.

## Subtractions

- Radar → **radial bar**, six concentric arcs. Same six groups, real magnitudes, and it
  earns the circular form the flat radar never did.
- `MuscleFocusCard` (most/least pair) → **`MuscleRankCard`**, all 30 muscles ordered, the
  selection highlighted, rows select. The radar + most/least + a rank view were three
  answers to one question; now there is a coarse one (6 groups) and a fine one (30).
- Top-level `TopSetCard` — the drill-down and `StrengthGrowthCard` both cover it.

## Also

- **Default range is now `1y`.** A year of logs shown 12 weeks at a time reads as an empty
  history.
- **The `custom` chip finally works.** Problem 2 at the top of this doc — a chip with no
  picker behind it — is fixed with two `<input type="date">` fields. The platform already
  ships a calendar, a locale-correct format and a keyboard path; a picker component would
  be a dependency and three bugs to own. Opening the chip seeds it with the range you were
  already on, so the first thing you see is the window you just left, editable.
  `previousWindow` and `bucketFor` now measure off the *window* rather than the chip, so a
  hand-picked fortnight gets daily bars and a fair same-length comparison without the chip
  needing a fixed length.
- **Table rows expand.** Tapping a row opens that session's lifts as logged — sets, reps,
  top set, volume. The table was already in date order, so it is the session picker; a
  separate "pick a past workout" browser would be a second source of truth for the same
  logs.
- **Two labelled zones.** A `SectionRule` names the muscle above the drill-down and
  "Everything" above the whole-body cards, so scoped and unscoped numbers never blur.

## Code, revision 2

`lib/progress-metrics.ts` gains `MUSCLE_FLOOR`, `muscleEngagement`, `filterByMuscle`,
`attributeToMuscle` and `muscleWeeklySets`; `ExerciseTotal` gains `sessions` and `topSet`.
`attributeToMuscle` returns *logs*, not a new shape, so every existing builder — trend,
calendar, rest stats — drills into a muscle unchanged. All covered in
`lib/progress-metrics.test.ts`.

New: `muscle-detail.tsx` (plaque, gauge, load area), `muscle-lifts-card.tsx`,
`muscle-rank-card.tsx`. `TopSetChart` split out of `strength-cards.tsx` so a card with its
own header can borrow the line. `MuscleMapCard` gains one optional `footer` slot.

## Code

New `lib/progress-metrics.ts` — pure functions over `WorkoutLog[]`: range windows, day/week
bucketing, calendar cells, muscle-group rollup, top exercises, summary + delta. Covered by
`lib/progress-metrics.test.ts`, wired into `npm run check`.

Cards split one per file under `features/progress/`, with the palette and shared recharts
chrome in `features/progress/chart-theme.ts`.

Deleted from `lib/workout-helpers.ts` — orphaned by this rewrite, used nowhere else:
`ProgressRange`, `startDateForRange`, `filterLogsByRange`, `buildStrengthSeries`,
`buildVolumeSeries`, `buildMetricSeries`, `buildWorkoutBreakdown`. `buildMuscleHeat` and
`normalizeMuscleHeat` stay — the body map still needs them and the test covers them.

## Dates

Log keys are plain `YYYY-MM-DD`. Every parse goes through `new Date(\`${key}T00:00:00Z\`)`
and every weekday read is `getUTCDay()`, the same rule `home-dashboard.tsx` already
follows — otherwise the calendar's weekday columns shift by one under a timezone.

---

# Revision 3 — an instrument, not a card list

Rev 2 fixed *what* the page measures. The complaint now is that none of it lands:
"i can see data but no impact". That is not a metrics problem — `progress-metrics.ts`
is correct and tested. It is a presentation problem and a **resolution** problem: a
year of session data is on the wire and the page still draws it the way it drew
twelve weeks.

## Why it reads as generic

1. **Thirteen cards of one shape.** Every card is the same 28px glass box, same
   header, same ~190px chart. Nothing is bigger, nothing is denser, nothing is a
   different material. The eye gets no entry point, so the page reads as a list of
   widgets rather than a screen with an argument.
2. **Every card explains itself in a paragraph.** Two lines of 14px grey prose ×
   thirteen. The page reads as its own documentation. This is the single loudest
   "generated" tell on the screen.
3. **It measures and never concludes.** Only `readOf()` in `volume-detail-card.tsx`
   says anything. Everything else hands over a number and leaves. Nothing on the
   page tells you whether the year went well.
4. **The signature sits at position 9.** The year calendar — the one striking thing
   here — is nine cards down, 11px cells, scrolling sideways *inside* a rounded box.
5. **Chrome beats ink.** `rounded-[28px]` + `p-4` + glass + `shadow-glow` around a
   190px chart is roughly 130px of data in a 250px box, thirteen times.
6. **One hue.** The palette declares four series and every chart uses `CHART.accent`.
   Nothing on screen says "read this one first".
7. **448px, ten screens.** `MobileShell` hard-codes `max-w-md`. A year of training in
   a single 448px column is most of why it feels endless.

## What the design database contributed

Ran `ui-ux-pro-max` (`--design-system --variance 7 --density 8 --motion 3`). Two
things worth taking, one worth refusing:

- **Take the style verdict — "Data-Dense Dashboard":** *minimal padding, grid layout,
  space-efficient, maximum data visibility, KPI cards, multiple widgets.* That is the
  opposite of what this page currently is, and it matches the diagnosis above.
- **Take the chart form — bullet chart** for "performance vs target, 3–10 in a grid,
  space-constrained". Better than the current bar + `ReferenceArea` for weekly sets,
  and better than the radial gauge in the drill-down.
- **Refuse its palette and fonts** (`#1E40AF`, Fira Code). `globals.css` tokens are
  shared by Home, Plan and Profile. Navy/orange/cyan and Space Grotesk/Mono stay.
  Noted here so it does not get re-litigated later.

## The scoping rule — decide this before any card is written

Every existing builder is fed `view.scoped` (the window, then the exercise chip).
Several of the new charts **cannot be defined over a filtered window** and would
quietly print wrong numbers if wired into the same memo. So there are two classes,
and each card declares which it is:

| Class | Input | Window's job | Cards |
|---|---|---|---|
| **Scoped** | `view.scoped` | filters the data | everything that exists today |
| **Lifetime** | `logs` (unscoped) | *highlights* a region, never filters | ACWR, PR ledger, monotony/strain, cumulative tonnage |

Why each lifetime card has to be:

- **ACWR** needs the 28 days *before* `window.start`. At `4W` the chronic baseline
  does not exist inside the slice; the ratio pins to ~1.0 and the chart is a lie.
- **PR ledger** — a PR is all-time. Computed on a window, "PR" silently means
  "heaviest in these dates", which the user will catch on the first tap.
- **Monotony/strain** need whole Mon–Sun weeks; a window starting mid-week fabricates
  its first point.
- **Cumulative tonnage** is a running total from the first log by definition.

Lifetime cards take `logs` and `window`, and render the window as a shaded region on
their own x-axis. Different prop signature from every card on the page today — that is
the point, and it is what stops two cards on one screen from disagreeing.

## The new charts

Seven, each answering a question the current page cannot. Checked against
`scripts/seed-year.ts` first: 5 sessions/week on a fixed split, ~8% skipped, +30%
progression across the year with ±8% per-session jitter. Enough variance for all of
these to draw something real — noted per card where the seed will look tamer than
real data.

### 1. Load spike — acute vs chronic *(lifetime)*

7-day rolling tonnage over 28-day rolling tonnage, plotted across the whole history,
with the selected window shaded. A line at 1.0, band at 0.8–1.3.

Reads: above the band this week was much heavier than your own last month; below it
you are detraining. **Framed as a spike against your own baseline, not as injury
risk** — the 0.8–1.3 literature is contested and this is seed data.

Form: line with a reference band. Chronic load drawn behind it in `series[1]` teal, so
the ratio and the thing it is a ratio *of* are on one card. The first 28 days are
drawn hollow — the baseline is not warm yet.

*Seed note:* mostly band-hugging with dips where skips cluster, plus a slow rise from
progression. Real logs will be livelier.

### 2. Muscle × month matrix *(scoped)*

30 rows × 12 columns, one cell per muscle per month, shaded by that month's share of
volume reaching the muscle. Rows ordered by total; zero rows kept, not dropped — an
empty row *is* the finding.

This is the chart a year unlocks and twelve weeks cannot: it shows *drift*. "You have
not touched rear delts since March" is a sentence no other card on the page can say.
Tapping a row selects that muscle and drives the existing drill-down.

CSS grid, not a chart library — the same construction `ConsistencyCard` already uses
for its cells. Reuse it.

### 3. The PR ledger *(lifetime)*

Every date any lift set a new all-time top set, newest first: date, lift, old → new.
A year of it is a genuinely satisfying artifact, and the *gap* at the top is the
plateau detector — "no lift has set a PR in 5 weeks" is the most actionable line the
page could carry.

List, not a chart. A timeline of ~40 dots would be less readable than 40 rows, and the
rows are also the table-view twin.

### 4. The top-set wall *(scoped)*

Small multiples: one 88×32 sparkline per lift, top set over the range, in a 3-up grid,
sorted by percent gained. Shared y-scale within a row is wrong here (a 4kg curl vs a
40kg deadlift), so each tile is self-scaled with its first→last delta printed under it
— the tile shows *shape*, the number shows *size*.

Fifteen shapes at once is the Tufte move and it is strictly more useful than fifteen
taps through one big chart.

**Hand-rolled inline SVG `<polyline>`, not recharts.** The page already mounts ~8
`ResponsiveContainer`s in one column; twenty more would be a perf problem and a
dependency on a component that does nothing here but draw a path.

### 5. Split drift *(scoped)*

Stacked area, six muscle groups, share of volume per month across the range. Shows a
specialisation block or a programme that quietly became bench-and-curls. This is where
`CHART.series` finally earns having four entries.

Replaces nothing — `MuscleSplitCard`'s radial bars answer "what is the split *now*",
this answers "how did it get there". If only one survives review, this one does.

### 6. Cumulative tonnage *(lifetime)*

Running total kilos from the first log, with milestone annotations at 100k / 250k /
500k / 1M. "You have moved 1.24 million kilos" is the one number on this page with
emotional weight, and it is currently nowhere.

No year-over-year ghost: there is only one year of logs, so a comparison line would be
invented.

### 7. Monotony & strain *(lifetime)* — the weakest, flag for cut

Foster's monotony (weekly mean daily load ÷ its SD) and strain (weekly load ×
monotony), as a scatter of week-points with quadrant labels.

Honest assessment: on the seeded fixed split this lands around 1.0–1.3 every week and
barely moves. It earns its place on real varied training and not much before then.
**Build it last, and cut it if the scatter looks like a blob.**

## The layout

Order top to bottom. Body map stays first — Rev 2 made it the navigation and that
decision holds.

1. **Body map** + plaque *(unchanged)*
2. **Filters** — now sticky to the top edge on scroll, since the page got longer
3. **Drill-down zone** *(unchanged, when a muscle is selected)*
4. **Verdict + hero.** The volume figure and delta as today, plus **one generated
   sentence** above the tiles: what actually happened this range. Reuse the
   `readOf()` pattern from `volume-detail-card.tsx` — do not invent a second one.
5. **The year spine — full-bleed.** The 365-day calendar breaks the card, edge to
   edge, month ticks above, current streak / longest streak / longest layoff inline
   beneath. It moves from position 9 to position 5 and stops being a widget.
6. **§ Getting stronger** — top-set wall · strength growth · PR ledger
7. **§ Where it goes** — muscle × month matrix · focus order · split drift · the split
   · weekly sets *(as bullets)*
8. **§ How hard** — volume + ACWR · under the tonnage · rhythm · monotony
9. **§ The numbers** — the table

### Material, so hierarchy exists

Three levels instead of one:

- **Hero** — keeps `Card`: glass, 28px, `shadow-glow`. Exactly one on the page.
- **Panel** — new, for chart blocks: flat `bg-white/[0.02]`, 1px border, 16px radius,
  `p-3`. Roughly 40% less chrome around the same chart, and it stops reading as
  thirteen equal boxes.
- **Full-bleed** — no container at all: the spine and the matrix.

### The prose goes

Every `CardDescription` paragraph moves into a native `<details>` behind a small `ⓘ`
on the panel header. The engagement-floor convention, the 10–20 band, the
why-not-1RM argument — all still one tap away, none of it on screen by default.
`<details>` is free, keyboard-accessible and needs no dependency.

Titles get shorter and lower-case-ish in the mono voice already used for
`SectionRule`; a one-clause caption replaces the paragraph where a caption is genuinely
needed.

### Colour gets a second meaning

Orange stays "the value you are reading". `series[1]` teal becomes **baseline /
comparison** and nothing else — chronic load, the previous window, the target band.
`quiet` stays context. Three roles, consistent across every card, so colour finally
carries information instead of decoration.

### Density

The screen is a phone and stays one. Density comes from the material and the forms
instead: bullets where a 210px bar chart and a 180px gauge were, a 34px sparkline grid
where fifteen separate charts would have gone, and a panel that spends ~40% less of its
height on chrome. Two-column grids stay at the fixed `grid-cols-2` the 448px column can
actually hold.

## Subtractions

- `ExerciseVolumeCard` — the focus order, the split and the top-set wall already say
  where the work goes; a fourth ranking of the same thing is padding.
- `MuscleDoseCard`'s radial gauge → a **bullet** on the same 10–20 scale as the group
  card, so the two finally read on one scale. One gauge for one number was always
  more circle than information.
- `WeeklySetsCard`'s bar + `ReferenceArea` → six **bullets** in a grid.
- Every `CardDescription` paragraph, per above.

## Code

`lib/progress-metrics.ts` gains, all pure over `WorkoutLog[]`, all covered in
`progress-metrics.test.ts`: `buildRollingLoad` (ACWR + chronic), `buildPRLedger`,
`buildMuscleMonthMatrix`, `buildCumulativeVolume`, `buildGroupShareByMonth`,
`buildWeeklyLoadStats` (monotony/strain), `buildStreaks`.

`features/progress/`: `panel.tsx` (the new material + the `ⓘ` details), `load-card.tsx`,
`pr-ledger-card.tsx`, `muscle-month-card.tsx`, `top-set-wall.tsx`, `split-drift-card.tsx`,
`cumulative-card.tsx`, `bullet.tsx`. `consistency-cards.tsx` splits the spine out of the
in-card calendar.

No new dependencies. Matrix and spine are CSS grid; the sparkline wall is inline SVG;
everything else is recharts 3.10.1, already installed.

## Decisions taken, not asked

- **The subtractions happen.** Every one of them is replaced by something better in
  this same plan, not left as a hole. Reversible if any of them turns out to be
  missed.
- **The page stays mobile-only at `max-w-md`.** A wider column was tried and reverted on
  the user's call: this is a phone UI. It also rules out `sm:` grid variants inside the
  page — `sm:` keys off the viewport, not the container, so a three-column grid inside a
  fixed 448px column would be narrower on a desktop browser, not denser. One column count,
  sized for the phone.

## Open — does not block

**A screenshot of `/progress`.** "UI is not correct" is a visual complaint and the
Chrome extension is not connected here, so everything above is reasoned from the code
rather than from looking at it. Paste one if it is handy and it will sharpen the visual
calls; the metrics layer below does not depend on it.

## Shipped — what changed against this plan

Three deviations, all decided against evidence rather than taste:

1. **The lifetime builders live in a new `lib/progress-trends.ts`, not in
   `progress-metrics.ts`.** The latter was already 796 lines against an 800 ceiling, and
   the split falls exactly on the scoping seam this plan says must never blur:
   `progress-metrics.ts` is window-scoped, `progress-trends.ts` is not. Mixing them up now
   requires importing from the wrong file on purpose.
2. **Monotony and strain ship as a builder with no card.** The plan said build it last and
   cut it if the scatter blobs. Measured against a year of the seeded split, monotony sits
   between 0.96 and 1.20 for half the weeks and never leaves 0.63–1.24 — well below the
   ~1.5 where the measure starts saying anything, because a fixed weekly split *is*
   monotonous by construction. `buildWeeklyLoadStats` and its tests stay ready for real
   varied training; drawing it now would be a chart of noise with a scientific label.
3. **The dose gauge became a bullet too.** Only the group card was listed for it, but the
   drill-down measures the identical thing for one muscle. Two shapes for one measurement
   is why the two numbers never read as the same unit.

Colour values were solved numerically, not picked. Notably the heat ramp now runs
mid-to-bright rather than dark-to-bright: on a near-black card a dark first step lands in
the surface's own luminance, which is why a light training day and a rest day were
1.85:1 apart — the single most important reading in the signature chart was the one you
could not make. It clears 3.03:1 now.

## Order of work

1. `lib/progress-metrics.ts` — the seven builders + tests, green under `npm run check`.
   Fully specified, needs no screenshot, and every card depends on it.
2. `panel.tsx` + the material/colour/density pass over the existing cards.
3. The new cards, in the order listed above; monotony last, and cut if it blobs.

### One granularity call, settled here

`buildMuscleMonthMatrix` is scoped, so at `4W` it would be 30 rows × 1 column — the
focus order with extra steps. Columns therefore come off the window, not off the
calendar: **months above 120 days, weeks below it**, and the card renders nothing under
6 columns. The title follows the bucket ("Muscle × month" / "Muscle × week").

## Fixed during the build, worth recording

- **The calendar was rendering twice** — the spine at the top and the old whole-body
  `ConsistencyCard` further down, same builder, same 365 cells. It was meant to move, not
  to be copied. Making the page longer is the complaint being fixed.
- **The spine is fed scoped data**, so its heading follows the range rather than always
  saying "The year". At `4W` a 28-cell grid under that title, with "best run" meaning a
  streak inside four weeks, is exactly the class of error the scoping table exists to stop.
- **`domain={[0, "dataMax * 3"]}`** on the load card's hidden axis was silently invalid:
  recharts only parses `dataMin - N` and `dataMax + N` (`ChartUtils.js:495`). The chronic
  backdrop needed the function form.
- **`buildStreaks` broke a streak every Monday.** The window ends today, not on a Sunday,
  so the final week is usually partial — and an untrained partial week was counted as a
  miss. Eight straight weeks reported as zero. Now skipped rather than counted false, with
  a test for both that and the completed-empty-week case that *is* a break.
- **Milestone dots** were placed with `points.find(p => p.key >= date)`, which lands on the
  following Monday and falls back to the far-left point when a milestone is crossed in the
  final week. Snapped to the milestone's own week instead.
- **Matrix column headers were 3px out of step** with their columns (padding where the
  rows use a gapped flex), and `month: "narrow"` rendered Jan, Jun and Jul all as "J".
- **`foldTail` deleted** — the card that called it is gone.

`npm run lint` is a pre-existing dead script: there is no eslint config or dependency in
this project, and `next lint` was removed in Next 16. Not fixed here; out of scope.
