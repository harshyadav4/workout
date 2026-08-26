# GymFlow — Product & Engineering Review

**Repo reviewed:** `/home/harsh/self` @ `18a86ce` (main, clean)
**Review date:** 2026-08-14
**Market data retrieved:** 2026-08-14 (sources cited inline; unverified cells marked)

Method: read the full source (~15.9k lines TS/TSX excluding vendored skill data), ran the test suite (`npm run check` — 8/8 files pass), ran `tsc --noEmit` (clean), ran a production build and probed it over HTTP, read the SQL migrations, and checked competitor claims against vendor pages where reachable.

**Evidence grades used throughout.** *Verified by execution* — I ran it and observed the result (the PWA manifest 404; the test and typecheck results). *Verified by code trace* — I followed every reference and there is no other path (the sync data-loss finding; the dead `planner` subsystem; the template-sourced "previous" value). *Inferred* — reasoning from the code, labelled as such. *Unverified* — market cells I could not confirm against a vendor page, marked inline.

---

# STEP 1 — Understand the Repository

## What the application actually does

GymFlow is a **schedule-first workout logger with an unusually deep per-muscle analytics layer**. The defining structural choice — and it is a real choice, not an accident — is that you cannot log a workout that you did not plan in advance. The app is a calendar of pre-built sessions, and Home is the cursor pointing at today's entry.

### Architecture

| Layer | Implementation |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript 5.7 (strict, `tsc --noEmit` clean) |
| Styling | Tailwind 3.4 + shadcn-style local primitives (`components/ui/`, 8 components, all thin) |
| State | Zustand 5 vanilla store in React context (`features/workout/workout-store.tsx`, 898 lines) |
| Persistence | `localStorage` written synchronously inside every store action, via `persist(next)` |
| Backend | Supabase — Postgres accessed directly from the browser under the user's JWT |
| Auth | Supabase Google OAuth, redirect flow (deliberately not popup — mobile blocks popups) |
| Charts | Recharts 3.10, with a shared `chart-theme.tsx` |
| Tests | 8 hand-rolled `tsx` + `node:assert` files on the logic layer. No component or E2E tests. |

**README is stale and describes a different app.** It documents Firebase Auth, Firestore, `@react-three/fiber` and a Three.js muscle map. None of that is in `package.json`; the app is Supabase and the body map is inline SVG (`features/body/front.tsx`, `back.tsx`). Anyone onboarding from the README is misled at step one.

### Routes

Four tabs behind `AuthGuard`, plus `/login`. Every screen is a client component; there are no server components, no API routes, no middleware. `lib/supabase.ts` documents this explicitly and correctly justifies using plain `supabase-js` over `@supabase/ssr`.

- `/` — Home: today's session, set logging, streak, muscle map
- `/plan` — Build (session templates) and Schedule (map templates onto dates)
- `/progress` — ~20 analytics cards with a per-muscle drill-down
- `/profile` — name/height, body measurements, measurement cadence

### Data model

Six tables, all user-owned, **RLS enabled in the same migration that creates them** — with both `using` and `with check` clauses, and a comment explaining why `using` alone would be insufficient. A `security definer` trigger seeds a `profiles` row on signup so the app never branches on "profile missing." This is the strongest part of the codebase.

The jsonb-vs-columns split is deliberate and correctly reasoned: `scheduled_sessions.exercises` stays jsonb because the app loads a whole session, mutates it in memory and writes it back, never querying inside one; `workout_logs` and `body_measurements` get real columns because they are read as aggregated series.

### The core domain types

`WorkoutLog` is where the product's ceiling is set:

```ts
interface WorkoutLog {
  date, sessionId, workoutId, name,
  totalVolume, totalSets, totalReps, peakWeight,
  muscles: WorkoutMuscleTarget[]
}
```

One row **per exercise per session**. Per-set detail does not survive `buildLogFromSession`. This single decision propagates through everything in STEP 11.

### Exercise data

1,324 exercises in `public/exercises.json` (990 KB), fetched client-side on first open of the picker. The dataset carries `target` + `secondary` muscle names but no engagement percentages, so `lib/exercises.ts` derives them: a `MUSCLE_MAP` widens each coarse dataset name to every app muscle it could mean, then `HEAD_RULES` — 18 regexes against the exercise *name* — narrows it back down (`/\bincline\b/ → pecUpper`, `/hammer curl/ → brachialis`). Primary gets 60%, secondaries split 40%.

This is clever and honestly commented. It is also **inference, not measurement** — a point that matters enormously in STEP 4.

## Current Product Map

**Target user** — Unknown; the repository does not state one. Inferred from the code: an intermediate lifter who follows a fixed weekly split, trains largely alone, and cares about per-muscle balance. The 30-muscle model and the tape-measurement integration point at a physique/hypertrophy orientation rather than a strength-sport one (there is no 1RM anywhere, no RPE, no percentage-of-max programming).

**Main problem solved** — "I have a program. Show me today's session, let me log it fast, and tell me over time which muscles I am actually training and whether they are growing."

**Core workflow**
1. Build a session template — name it, add exercises from the library, set sets/reps/weight/rest, optionally adjust per-muscle engagement
2. Schedule — pick a date range, then either map weekdays → templates ("weekly") or define a rotation cycle, plus rest weekdays; hit Generate
3. Home shows today's session as `ready`
4. Start session → tap a set chip → adjust weight/reps with steppers → **Log set** → repeat
5. Finish session → per-exercise logs written, session marked `completed`
6. Progress reads the log history

**Main features**
- Session template builder with a 1,324-exercise library, GIF/step demos, editable muscle engagement
- Two scheduling modes (fixed weekday map, or N-day rotation) with rest days and regeneration that preserves completed work
- Tap-first set logging with an explicit `completed` flag per set
- Anatomical SVG body map (front/back, 30 muscle regions) that follows the set you are on
- Progress: volume trend, cumulative tonnage, weekly sets/group against a 10–20 band, muscle split, muscle drill-down (volume share, sets/week, top lifts, tape girth), PR ledger, acute:chronic load ratio, split drift over months, weekday rhythm, calendar consistency, year spine
- Body measurements: 11 sites, left/right kept separate, with a cadence reminder surfaced as a dot on the Profile tab
- Week-based streak card

**Current user journey** — described in STEP 2.

**Strengths**
- Data model and security are genuinely well-built. RLS from migration 0001, no service-role key in the client, anon key correctly identified as public.
- The comments explain *why*, not *what*, and repeatedly document rejected alternatives. `lib/progress-trends.ts` opens by explaining why window-scoped and all-time metrics live in different files — "computing them on filtered logs produces numbers that are wrong rather than merely narrow."
- **Analytical honesty is a real, rare product asset.** The ACWR card refuses to call itself injury risk because "the literature on it is contested, and a lifting log is not the population it was derived from." The PR ledger refuses to count a first appearance as a PR. `buildWeeklySetsByGroup` credits the *max* across a group's muscles, never the sum, so a bench press isn't reported as 8 sets of chest. Most apps in this category fake precision; this one declines to.
- The sync diff (`diffRows`) compares by reference, exploiting the store's structural sharing so untouched sessions are never rewritten. Neat.
- Accessibility is above average for a hobby project: `aria-label` on every stepper and set chip, `aria-pressed` on toggles, 44–48px touch targets, and colour-only distinctions deliberately avoided (the "pending was `bg-secondary` — 1.34:1" comment shows someone actually measured contrast).

**Weaknesses** — full detail in STEP 10; the short list:
1. Unsynced local writes are destroyed on the next load (data loss, confirmed by code trace)
2. No rest timer
3. The "last" weight shown while logging is the template value, not history
4. Per-set data is discarded at Finish, capping the analytics permanently
5. No way to log an unplanned workout
6. PWA manifest 404s
7. Timezone hardcoded to `Asia/Kolkata`
8. The entire `planner` subsystem is dead code

**Missing functionality** — supersets, RPE/RIR, warm-up sets, functional drop sets, plate calculator, 1RM/e1RM, exercise notes at log time, exercise substitution mid-session, workout duration, CSV export, offline service worker, wearable integration, any social layer.

**Unknown — repository does not provide enough evidence:** deployment target (no `vercel.json`, no CI config, no Dockerfile), error monitoring, analytics/telemetry, whether the app is deployed at all, and whether it has any users beyond the author.

---

# STEP 2 — UX Review, as a Gym User

> **Can someone use this application easily while actively working out?**
>
> **Once a session is scheduled and you have signal: yes, the set-logging loop is genuinely good.** Outside that narrow path: no. First-time setup cannot be completed in a gym, there is no rest timer, the "last time" number is wrong, and logging offline can lose the whole session.

### First visit → onboarding

You sign in with Google and land on Home in the `setup` state: *"Build your first session."* One button, to `/plan?mode=build`.

- **Friction — severe.** Before the app does anything for you, you must name a session, open a dialog, search a 1,324-item library, pick each exercise, set sets/reps/weight/rest for each, save the template, switch to the Schedule tab, choose a date range, choose weekly-vs-rotation, map weekdays to templates, pick rest days, and press Generate. Only then does Home show something loggable.
- **This is not a gym-floor task.** It is a sit-down-at-a-desk task, and it stands between the user and every ounce of value in the product.
- No demo data, no starter programs, no import. `lib/seed-data.ts` has `starter*` fixtures but the code comments confirm they are "kept for local development and no longer handed to real accounts."
- **Missed opportunity:** the library already has `bodyPart` and `equipment` facets. Three taps ("what did you train today?" → chest → 3 exercises) could produce a loggable session immediately.

### Selecting / creating a workout

- The Build/Schedule split is a clear mental model and the URL-backed tab (`/plan?mode=build`) is a nice touch.
- Weekly-vs-rotation is a genuinely good abstraction that most competitors lack — rotation ("push/pull/legs regardless of weekday") is exactly how many people actually train.
- **Friction:** `generateSchedule` regenerates the whole window. `mergeGeneratedSessions` correctly preserves `active`/`completed` sessions, but every merely-`planned` session is replaced. A user who hand-tweaked next Tuesday loses that tweak with no warning beyond a generic confirm dialog.
- **Confusing:** the schedule defaults to an 8-week horizon (`DEFAULT_WEEKS`). Nothing tells the user what happens when it runs out — and nothing regenerates it. In week 9 the app silently becomes an empty calendar.

### Starting a workout

- Home's `ready` state with a full-width **Start session** button is correct and obvious.
- One tap. Good.

### Performing exercises / recording sets

This is the best part of the app.

- The set-chip strip is a strong pattern: each set is a pill, tap it to open the editor, and the open set is auto-advanced to the first incomplete one (`firstPendingSetId`). Tapping a chip is a 48px target.
- Steppers are stacked rather than side-by-side, with a comment explaining that two 44px targets plus a mono `"10 REPS"` label don't fit a 147px half-column. Someone tested this on a real phone.
- The muscle map follows the set you are on. That is a genuinely delightful touch and nothing else on the market does it mid-set.
- The warning banner before Finish ("Only the 3 of 12 sets you logged will be saved") is honest and well-placed.

**But:**

- **No rest timer.** `restSeconds` is captured in the builder, stored in the DB, and rendered as static text — *"90s rest"*. Nothing counts down, nothing notifies. In a gym this is the single most-used feature of a workout app, and every competitor has it (Hevy advertises "Automatic Rest Timers"; Boostcamp has rest timers on the free tier). **The data is already there. Only the timer is missing.**
- **The "last" number is a lie.** The editor shows `last 60kg × 8`. That value comes from the *template*, not from the last time you performed the exercise (`lib/workout-helpers.ts:224-225`). Nothing in the app reads `logs` to populate it. Progressive overload is the core loop of lifting, and the number the user glances at to decide their next weight is not what they lifted.
- **Weight entry is stepper-only, 2.5kg per tap.** Going from a 20kg default to a 100kg squat is 32 taps. There is no direct numeric entry, no long-press acceleration, no plate calculator. `min` is 0 but there is no max, so a fat-fingered hold can run away.
- No warm-up sets, no supersets, no RPE/RIR. `type: "drop"` is auto-assigned to the last set when `sets > 3` — and **nothing in the UI ever reads it**. It is write-only decoration.
- No way to add an exercise mid-session. If the squat rack is taken, your options are to skip the exercise or leave the app.
- No session duration, no timestamp per set.

### Finishing

- **Finish session** commits only `completed` sets. Correct and well-tested.
- The done state is understated but clear. `"Logged. It is on your progress charts."`
- **Missing:** no summary of what you just did versus last time. This is the highest-leverage retention moment in the entire app and it currently says one sentence. No PRs surfaced, no "+340kg on last week," no volume comparison.
- **No undo.** Finish is irreversible from the UI; a mis-tap ends the session and there is no reopen path.

### Seeing progress

- The Progress tab is legitimately the most sophisticated thing in the repo — roughly 20 cards, a muscle drill-down, and consistently thoughtful chart annotations explaining what each number does and does not mean.
- **But it is empty for weeks.** Almost every card needs multiple sessions; ACWR needs four weeks before it shows a ratio at all (correctly — `warm: false` until the baseline exists). A new user sees a wall of near-empty charts.
- **Depth is inverted against usage.** The gym-floor experience is thin and the desk-chair experience is deep. For a product whose stated premise is "used inside a gym," effort has gone to the wrong surface.

### Returning for the next workout

- The streak card is week-based, not day-based, with an explicit comment that a day streak "rewards never resting, which is bad advice dressed as a number." Correct call, and the copy handles the missed-week case gracefully.
- **No notifications of any kind.** No service worker, no push, no reminder. `body-metrics.ts` documents that reminders are in-app only "and no notification permission is involved." Nothing pulls the user back.
- **The PWA cannot be properly installed:** `app/layout.tsx:24` declares `manifest: "/manifest.json"` but the file on disk is `public/manifest.webmanifest`. That URL 404s. And the manifest itself has `"icons": []`, so even with the path fixed there is no home-screen icon. For a mobile-first gym app this is a foundational break.

### Mobile specifics

Good: `max-w-md` shell, bottom nav with `env(safe-area-inset-bottom)`, `viewportFit: "cover"`, `active:scale-95` feedback everywhere, `tabular-nums` on every changing number so digits don't jitter. Recent commits show real iOS Safari debugging.

Bad: no landscape consideration; no wake-lock, so the screen sleeps between sets and you re-unlock with chalky hands every time; bottom nav is always visible during logging, occupying ~76px of the most valuable screen area.

---

# STEP 3 — Competitor Analysis

**Sourcing note.** Vendor feature pages were used where reachable (Hevy, Strong, Boostcamp, Fitbod). Neither Hevy's nor Strong's site publishes prices, and Fitbod's help centre returns 403 to automated fetches, so several pricing and granularity cells rest on third-party reporting or could not be verified at all. **Every such cell is marked.** A table with honest gaps is worth more than a complete one I can't defend.

### The players

**Hevy** — the current default recommendation for most lifters. Free tier is genuinely usable (unlimited logging, 1,000+ exercises), capped at 4 routines / 3 months history / 7 custom exercises. Its moat is polish plus a real social feed. Vendor page confirms automatic rest timers, warmup/drop/failure set marking, 1RM calculation, PRs, exercise notes, Apple Watch + WearOS with offline support. "Hevy Trainer" reportedly launched Feb 2026 generating programs and auto-progressing weights *(third-party)*.

**Strong** — the veteran. Vendor page confirms supersets, custom timers, RPE, warm-up calculator, 1RM, plate/body-part measurements, Apple Watch + Health + Siri, CSV export, and — importantly for this review — **a muscle heat map**. "Free forever" accounts with a Strong PRO tier; specific limits not published.

**Fitbod** — the generator, not the logger. Vendor page confirms "Monitored Recovery" that "uses your training history and recovery to recommend the right muscles for each session," plus equipment-adaptive generation. Reported at $15.99/mo or $95.99/yr *(third-party)* — the most expensive of the loggers. Its value is *deciding for you*.

**JEFIT** — the veteran database play. ~1,400 exercises with animations and muscle diagrams, community routines, ad-supported free tier, Elite reported at $12.99/mo or $69.99/yr *(third-party)*.

**Boostcamp** — **the most direct threat to GymFlow's positioning, and the one to study.** Vendor features page confirms a free tier that includes RPE/RIR on every set, rest timers, plate calculator, supersets, drop sets, warm-up templates, automatic PR tracking *including e1RM curves*, a custom program builder with no limits, and 11,000+ programs. Pro from $4.99/mo adds a DOTS-based Strength Score, advanced analytics, and — directly overlapping GymFlow's differentiator — **a per-muscle volume heatmap**.

**Ladder** ($29.99/mo, $179.99/yr Pro; Elite $44.99/mo *(third-party)*) and **Caliber** (free tier; Pro $19/mo; Premium ~$200/mo *(third-party)*) are coaching products, not loggers. Different category, different buyer. Relevant only as evidence that the willingness-to-pay ceiling in fitness is set by *human accountability*, not by software features.

### Comparison

Legend: ✅ has it · ⚠️ partial/limited · ❌ absent · ❓ could not verify

| Feature | GymFlow | Hevy | Strong | Fitbod | JEFIT | Boostcamp |
|---|---|---|---|---|---|---|
| Free tier usable for logging | ✅ | ✅ (capped) | ✅ | ❌ trial only | ✅ (ads) | ✅ |
| **Rest timer** | ❌ | ✅ | ✅ | ✅❓ | ✅❓ | ✅ |
| **"Previous" set from real history** | ❌ (shows template) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Per-set data retained | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supersets | ❌ | ✅ | ✅ | ❓ | ✅❓ | ✅ |
| Drop sets | ⚠️ flag only, unused | ✅ | ✅❓ | ❓ | ❓ | ✅ |
| Warm-up sets | ❌ | ✅ | ✅ | ❓ | ❓ | ✅ |
| RPE / RIR | ❌ | ⚠️❓ | ✅ | ❓ | ❓ | ✅ |
| Plate calculator | ❌ | ✅❓ | ❓ | ❓ | ❓ | ✅ |
| 1RM / e1RM | ❌ (impossible on current schema) | ✅ | ✅ | ❓ | ✅❓ | ✅ |
| PR tracking | ⚠️ top-set weight only | ✅ | ✅ | ❓ | ✅❓ | ✅ |
| Exercise library | ✅ 1,324 | ✅ 1,000+ | ✅❓ | ✅❓ | ✅ 1,400+ | ✅ |
| Program/routine builder | ✅ | ✅ (4 free) | ✅ | n/a generated | ✅ | ✅ unlimited free |
| Pre-built programs | ❌ | ⚠️ community | ❓ | ✅ generated | ✅ community | ✅ 11,000+ |
| **Calendar scheduling (dated)** | ✅ strong | ⚠️❓ | ✅ scheduling | ❓ | ❓ | ⚠️ program-relative |
| Rotation (non-weekday) cycles | ✅ | ❓ | ❓ | ✅ implicit | ❓ | ❓ |
| Muscle heat map | ✅ **30 heads** | ⚠️❓ group | ✅ group❓ | ✅ recovery, group❓ | ✅ diagrams❓ | ✅ Pro, group❓ |
| Muscle recovery model | ❌ | ❌ | ❌ | ✅ core feature | ❓ | ❌ |
| Weekly sets vs evidence band | ✅ 10–20 band | ⚠️ volume charts❓ | ❓ | ❓ | ⚠️❓ | ✅ Pro heatmap |
| Body measurements | ✅ 11 sites, L/R split | ✅❓ | ✅ | ❓ | ✅❓ | ❓ |
| **Volume ↔ girth correlation** | ✅ **per muscle** | ❌ | ❌ | ❌ | ❌ | ❌ |
| Workout generation / AI | ❌ | ✅❓ Trainer | ❌ | ✅ core | ✅❓ | ❌ |
| Social feed | ❌ | ✅ core | ⚠️ sharing | ❌ | ✅ | ⚠️ programs |
| Wearables | ❌ | ✅ Watch+WearOS | ✅ Watch | ❓ | ❓ | ✅ Watch |
| Offline logging | ❌ **loses data** | ✅ | ✅ | ❓ | ❓ | ✅ |
| CSV export | ❌ | ❓ | ✅ | ❓ | ❓ | ❓ |
| Notifications | ❌ | ✅❓ | ❓ | ❓ | ❓ | ❓ |
| Price (verified?) | free | $2.99/mo, $74.99 life *(3p)* | free + PRO *(unpub.)* | $15.99/mo *(3p)* | $12.99/mo *(3p)* | free; Pro $4.99/mo ✅ |

### Reading the table

**Already commoditized — do not invest here.** Rest timers, per-set history, supersets, warm-up/drop sets, e1RM, plate calculators, exercise libraries, PR tracking, muscle heat maps *at group level*. Every one of these exists on at least one **free** tier. Notably, a muscle heat map is *not* a differentiator — Strong ships one, Boostcamp Pro ships a per-muscle volume heatmap, and Fitbod's recovery map is its headline feature.

**Where GymFlow is competitive.** Dated calendar scheduling with true rotation cycles is better than most. The 30-head muscle model is finer-grained than anything I could verify on the market. The analytics *breadth* on Progress rivals paid tiers.

**Where GymFlow is genuinely differentiating (one thing).** **Per-muscle volume correlated against per-muscle tape measurements.** `MUSCLE_SITES` maps each muscle to its measurable sites and `MuscleGirthCard` renders the girth trend *directly beneath the volume chart for the same muscle*. I could not find this in any competitor, and industry write-ups note that apps "focus on volume tracking separately from manual body measurements rather than automatically correlating these metrics." This is the one asset with no visible incumbent.

**Missing and disqualifying.** Rest timer, real previous-set values, offline safety. These are not features — they are the price of entry, and their absence means no experienced lifter will complete a second session.

**Opportunity.** Nobody appears to close the loop *"you trained this muscle this much → it measured this much → here is the relationship."* That is a hypertrophy-feedback product, and GymFlow already has ~70% of the data model for it.

---

# STEP 4 — Real Differentiation

> Not "better UI." The question is what GymFlow can do that Hevy, Strong, Fitbod, JEFIT and Boostcamp structurally will not.

### Strategy A — The Per-Muscle Hypertrophy Audit

| | |
|---|---|
| **Target user** | Intermediate lifter, 1–4 years in, training for physique. Has a split. Suspects something is lagging (side delts, upper chest, rear delts are the classics) and does not know if it is under-trained or just slow. |
| **Problem** | Group-level tracking cannot answer "am I training my *upper* chest?" Every app says "chest: 14 sets." Incline work and flat work are not the same stimulus, and the user knows it. |
| **Competitors** | Boostcamp Pro (per-muscle volume heatmap), Strong (muscle heat map), Fitbod (recovery map). |
| **Why they don't solve it** | All appear to operate at muscle-*group* granularity, and none tie volume to measured outcome. Their heat maps answer "what did I hit," not "is it working." |
| **What GymFlow does differently** | 30 muscle heads, weekly sets per head against the 10–20 evidence band, and the tape trend for that muscle plotted against its volume — already 70% built. |
| **Required features** | Fix the logger (P0); per-head weekly-set targets and an explicit under-stimulated callout; **a working intake path for tape measurements** (see below); per-head exercise recommendations to close a gap. |
| **Difficulty** | Medium. The hard part (30-head model, engagement derivation, girth mapping, drill-down UI) exists — but see the intake gap below before treating this as mostly-done. |
| **Retention** | **High and compounding** — the correlation is worthless at week 1 and valuable at month 6. Data lock-in is the moat. |
| **Monetization** | Strong. Analytics is the classic paid tier and this is a *differentiated* analytic, not a commodity chart. |

**The gating dependency: half of the correlation has no way of being collected.** The *model* is 70% built; the *intake* is not. `isRecordingDue` is documented in `body-metrics.ts` as in-app only — "no notification permission is involved" — and its sole surface is a small dot on the Profile tab (`bottom-nav.tsx`). So a tape reading is recorded only if the user independently opens Profile and notices a dot. Training volume arrives automatically because logging is the daily habit; girth arrives only by accident. **Without an intake path, the differentiating chart renders `null` forever** — `MuscleGirthCard` returns nothing when `hasAny()` is false, which is the correct behaviour and also means the feature is invisible by default. This, not the chart, is the real work in Strategy A: prompt at the right moment (the finish-session screen on the first session of a cadence period is the obvious slot), make entry take under 15 seconds, and default to a small number of sites rather than all 11.

**The honest caveat, and it is significant.** Per-head engagement is derived by **regex against the exercise name** (`HEAD_RULES`), not measured. `/\bincline\b/ → pecUpper` is a reasonable heuristic; it is not EMG data. This codebase's own editorial standard — refusing to call ACWR "injury risk" because the literature is contested — must be applied here too. The honest framing is *"which region of the muscle your exercise selection is biased toward,"* never *"your upper pec received 62% of stimulus."* Overclaiming here would forfeit the one thing that makes the app trustworthy.

### Strategy B — The Program-Adherence Calendar

| | |
|---|---|
| **Target user** | Someone running a fixed multi-week program who wants a dated calendar, not a routine list. |
| **Problem** | Most loggers are routine-libraries; you pick what to do each day. Adherence to a *plan over time* is invisible. |
| **Competitors** | Boostcamp (program-relative), Strong (scheduling). |
| **Why they don't solve it perfectly** | Boostcamp's programs are relative ("week 3 day 2"), not calendar-dated; missing a week shifts everything. GymFlow's dated model with rotation-holds-on-rest-days is genuinely better. |
| **What GymFlow does differently** | Already the schedule model in `lib/schedule.ts` — plus `split-drift-card` literally charts how your split drifted month over month. |
| **Required features** | Programs to adhere *to* (GymFlow has zero pre-built programs; Boostcamp has 11,000 free), adherence scoring, plan-vs-actual. |
| **Difficulty** | High — the missing piece is a content library, which is an editorial/licensing problem, not an engineering one. |
| **Retention** | Medium. |
| **Monetization** | Weak. Boostcamp gives this away free and outguns it on content 11,000-to-0. |

### Strategy C — The Physique Companion

| | |
|---|---|
| **Target user** | Someone who already logs in Hevy and wants a measurement/photo tracker beside it. |
| **Problem** | Body-composition tracking is an afterthought in every logger. |
| **Competitors** | Various standalone measurement/photo apps. |
| **Why they don't solve it** | They have no training data, so they can only show the outcome, never the cause. |
| **What GymFlow does differently** | It has both — but only if the user logs training here. |
| **Required features** | Import from Hevy/Strong CSV, progress photos, trend smoothing. |
| **Difficulty** | Low–medium. |
| **Retention** | **Low.** Measurement cadence is weekly-to-monthly; a product opened monthly is a product that gets deleted. |
| **Monetization** | Weak — cedes the daily habit to a competitor and keeps only the low-frequency surface. |

## Selected positioning: **Strategy A**

**Why.** It is the only one where the existing codebase *is* the moat rather than a starting point. The 30-head muscle taxonomy, `deriveEngagement`, `MUSCLE_SITES`, the drill-down, and the evidence-banded set counts represent the bulk of the work, and they are the parts no competitor appears to have. Strategy B loses to Boostcamp on content it would take years to match. Strategy C surrenders the daily habit loop, which is the only thing that produces retention in this category.

It also fits the codebase's existing character. The refusal to overclaim — visible in `LOAD_BAND`, in `buildPRLedger`, in `buildWeeklySetsByGroup` — is exactly the voice a hypertrophy-audit product needs, because that category is saturated with fake precision. That editorial stance is more defensible than any feature.

**The condition.** Strategy A only works if the logger is good enough to use daily, because the audit is worthless without daily data. **The differentiation is downstream of fixing the basics.** Analytics do not retain users; logging retains users, and analytics make them stay. Ship P0 or none of this matters.

---

# STEP 5 — The Aha Moment

**Currently there isn't one, and the reason is structural:** the first ~15 interactions are configuration, and the payoff (Progress) needs weeks of data. A new user does substantial work and receives charts that are empty by construction.

**The aha should be: *"It already understands what I trained."*** That is achievable in under 60 seconds, and it is the one thing GymFlow can deliver on day one that a spreadsheet cannot — because `deriveEngagement` and the body map already exist.

### Ideal first session

1. **Sign in.** Land not on "Build your first session" but on **"What are you training today?"** — six group chips (chest / back / shoulders / arms / core / legs).
2. **Tap "Chest."** The app filters the library to chest exercises and shows the eight most common, pre-loaded with sane defaults. No dialog, no builder.
3. **Tap three exercises.** A loggable session now exists. Elapsed: ~20 seconds. **No template, no schedule, no date range.**
4. **Tap "Start."** First set opens. Weight and reps have defaults; adjust and hit **Log set**.
5. **The map lights up as the set commits** — and here is the moment: the body map does not colour "chest," it colours **upper pec, lower pec, front delt, triceps** in different intensities. *That* is the thing no other app shows, and it is visible on set one.
6. **A line appears under the map:** *"3 sets toward upper chest. Most hypertrophy reviews converge on 10–20 sets per muscle per week."* Concrete, sourced, actionable, and it frames the next visit.
7. **Finish → a real summary**, not one sentence: sets, tonnage, muscles hit, and *"Rear delts got nothing this week."*
8. **Only now** offer to save it: *"Train this again? Save as a session."* → this is where the builder and scheduler belong — **after** value, not before it.

The re-ordering is the whole point: **let the user log first and plan second.** The current app inverts this, and the inversion is the single largest barrier to adoption in the product.

---

# STEP 6 — Retention Analysis

### Day 1 → Day 2
**Today: almost nothing.** If they scheduled a session for tomorrow it sits on Home — but nothing tells them, because there are no notifications and the PWA doesn't install. The streak card exists but at week 1 says "Start the streak."
**Needs:** the finish-summary payoff (STEP 5.7), and one honest reason to return — *"next: Pull day, tomorrow."*

### Week 1
**Today: weak.** The strongest pull is that the schedule already knows what is next, which is real but passive. Progress is still mostly empty; ACWR is deliberately hollow for four weeks.
**Needs:** *previous-set values* — the single strongest week-1 loop in any logger. "Last time: 60kg × 8" turns each session into a small competition with yourself. GymFlow shows this but the number is wrong, which is worse than absent.

### Month 1
**This is where GymFlow gets good.** Volume trends, split drift, weekly sets against the band, the PR ledger, first tape comparisons. The Progress tab starts paying off exactly here.
**Risk:** most users never arrive, because weeks 1–2 have no loop. **The retention problem is entirely front-loaded.**

### Month 3+
**Genuinely defensible.** Three months of per-muscle history plus tape measurements is not portable — no competitor can import it, and the correlation only exists here. `buildSplitDrift` and the muscle matrix need this much history to say anything, and then they say something no other app can.
**This is the moat, and it is a *time* moat.** Which means every P0 fix should be judged by one question: does it get more users to month 3?

### Loops audit

| Loop | State |
|---|---|
| Progress | ✅ Excellent — best-in-class breadth, honest framing |
| Personal records | ⚠️ Top-set weight only; no e1RM, no rep PRs (schema-blocked) |
| Progressive overload | ❌ **Absent.** No suggestions, and the "previous" value is wrong |
| Streaks | ✅ Week-based, well-judged, good copy |
| Goals | ❌ None |
| Programs | ⚠️ User-built only; no library |
| Social | ❌ None |
| Coaching | ❌ None |
| Personalization | ⚠️ Manual only; nothing adapts |
| Accountability | ❌ None |
| Notifications | ❌ None — no service worker, no push |
| Insights | ⚠️ Charts exist; no narrative, nothing surfaced proactively |
| Historical data | ✅ Strong, and the real moat |
| Recommendations | ❌ None |

**Do not add gamification.** Badges and points would fight the product's voice, which is its most valuable asset. The streak card already demonstrates the right instinct — weeks not days, explicitly because a day streak "rewards never resting, which is bad advice dressed as a number." Hold that line. The retention mechanic here is **feedback**, not reward: showing a lifter something true about their training that they could not see themselves.

---

# STEP 7 — Features I Should NOT Build Yet

**Social feed / following.** Hevy's feed works because it has years of network effects. A feed with no users is an empty room that advertises failure, and it costs moderation, privacy, and abuse infrastructure forever. It does not serve the solo lifter doing an audit.

**AI workout generation.** Fitbod's entire product is this, funded accordingly. Building a worse generator ties the roadmap to inference cost and — critically — **contradicts Strategy A**: the audit's value is telling *you* what your *own* choices produced. Generating the plan makes the audit tautological.

**Apple Watch / WearOS apps.** Real value in a gym, but a separate platform, separate build, separate release. This is a Next.js PWA. Fix the manifest and get 80% of the "phone on the bench" benefit for 1% of the cost.

**Pre-built program library.** Boostcamp has 11,000+ free. This is content acquisition and licensing, not engineering, and it is unwinnable head-on. Three good starter templates for onboarding — not a library.

**Muscle-recovery modelling.** Tempting given the muscle map, but Fitbod owns it, the science is contested, and the app's own standard (`LOAD_BAND`'s refusal to claim injury risk) would demand so many caveats the feature would say nothing. Skip it.

**Normalizing `scheduled_sessions.exercises` out of jsonb.** The migration comment already reasons this correctly: nothing queries inside a session. Leave it.

**Nutrition, cardio, sleep, HRV, wearable sync.** Every one dilutes a product whose only credible claim is depth on one axis. A hypertrophy-audit tool that also tracks macros is neither.

**CSV import from competitors.** Sounds like a growth hack; it is a per-competitor parser treadmill, and imported data has no per-set structure to feed the differentiator anyway. Revisit only if users actually ask.

**A rewrite of anything.** The code is well-built. Every problem in this review is an addition or a localized change.

---

# STEP 8 — Roadmap

Impact and Effort are 1–10. **Priority Score = Impact / Effort.**

### P0 — Critical (blocks serious use)

| Feature | User Problem | Impact | Effort | Score |
|---|---|---:|---:|---|
| Fix unsynced-write data loss | A logged workout silently disappears | 10 | 3 | **3.3** |
| Rest timer | Every competitor has one; core gym-floor need | 9 | 2 | **4.5** |
| **(a)** Stop showing the template as "last" — read from existing logs | The overload number on screen is wrong | 9 | 2 | **4.5** |
| **(b)** Persist per-set rows (`set_logs`) | Unblocks e1RM, rep PRs, true set-level history | 9 | 4 | **2.3** |
| Fix PWA manifest + icons | Can't install the "mobile-first" app | 7 | 1 | **7.0** |
| Quick-log an unplanned workout | Setup wall blocks first value | 9 | 4 | **2.3** |
| User timezone instead of `Asia/Kolkata` | Day boundary wrong for everyone else | 7 | 2 | **3.5** |

### P1 — High Impact

| Feature | User Problem | Impact | Effort | Score |
|---|---|---:|---:|---|
| Real finish-session summary | Best retention moment is one sentence | 8 | 2 | **4.0** |
| Direct numeric weight entry | 32 taps to reach 100kg | 7 | 1 | **7.0** |
| Onboarding: "what are you training today?" | No aha moment | 9 | 3 | **3.0** |
| Add exercise mid-session | Rack taken → leave the app | 7 | 2 | **3.5** |
| Warm-up sets | Standard; skews volume if logged as working sets | 6 | 2 | **3.0** |
| Screen wake-lock while logging | Re-unlock every set with chalky hands | 6 | 1 | **6.0** |
| Bodyweight-exercise volume | Pull-ups score zero volume everywhere | 7 | 3 | **2.3** |
| Schedule-horizon expiry warning | Calendar silently empties in week 9 | 6 | 2 | **3.0** |
| Delete dead `planner` subsystem | ~150 lines of dead branches in the core store | 5 | 1 | **5.0** |

### P2 — Differentiation

| Feature | User Problem | Impact | Effort | Score |
|---|---|---:|---:|---|
| Per-head weekly-set targets + gap callout | "Which muscle am I under-training?" | 9 | 3 | **3.0** |
| Measurement prompt that actually fires | **Gating dependency** — girth is half the differentiator and nothing collects it | 9 | 2 | **4.5** |
| Volume↔girth correlation callout | Closes the loop no competitor closes | 9 | 4 | **2.3** |
| Exercise suggestions to close a per-head gap | Turns diagnosis into action | 8 | 4 | **2.0** |
| Supersets | Common; currently unrepresentable | 6 | 4 | **1.5** |
| RPE/RIR capture | Needed for any real progression logic | 6 | 3 | **2.0** |

### P3 — Future

| Feature | User Problem | Impact | Effort | Score |
|---|---|---:|---:|---|
| Progress photos | Visual change the tape misses | 6 | 4 | **1.5** |
| Offline service worker | True gym-basement operation | 7 | 5 | **1.4** |
| Push notifications | No re-engagement channel | 6 | 5 | **1.2** |
| CSV export | Data portability / trust | 4 | 2 | **2.0** |
| Plate calculator | Convenience | 4 | 2 | **2.0** |
| e1RM curves | Once per-set data exists | 5 | 3 | **1.7** |

**Sequencing note.** Raw score favours the manifest fix (7.0) and numeric entry (7.0) — do those first, they are hours of work. But per-set logging (2.3) must be scheduled early despite a mediocre score, because it is a **schema change that gates four other items** and every week of logs written under the old shape is a week of data that can never be back-filled.

---

# STEP 9 — The 80/20: Top 5 Changes

### 1. Stop destroying unsynced workouts

**What.** Reconcile local and remote in `hydrateRemote` instead of letting remote win outright; track a dirty flag; flush on `visibilitychange`/`pagehide`; and attach the store subscriber even when the initial `loadUserState()` fails.

**Why.** Two confirmed paths lose a completed workout (full trace in STEP 10). Gyms have bad signal. This is not an edge case — it is the *modal* environment for this app.

**Impact.** Prevents the one failure that guarantees uninstallation. A user who loses a session does not file a bug; they leave and tell people the app lost their workout.

**Complexity.** Medium (3/10). The diffing infrastructure already exists in `lib/sync.ts`.

**Why it beats everything else.** Every other feature assumes the data survives. This one is not a feature; it is whether the product is trustworthy.

### 2. Rest timer

**What.** Auto-start a countdown on **Log set** using the `restSeconds` already stored. Show it persistently; make it adjustable; vibrate on completion via `navigator.vibrate`.

**Why.** The data is captured, stored in the DB, and rendered as inert text. Every competitor including free tiers has this. It is the most-looked-at screen element in a real session.

**Impact.** Removes the most obvious "this app is unfinished" signal.

**Complexity.** Low (2/10) — one component, one `setInterval`, no schema change.

**Why it beats everything else.** Highest ratio of perceived completeness to effort in the entire repo.

### 3. Make "previous" real — in two separable steps

**These are two different jobs and should not be bundled.** Bundling them is how the cheap, urgent half gets deferred behind the expensive half.

**(a) Stop showing the template as "last." Ships now, no migration.**
Today `previousWeight`/`previousReps` come from the template (`workout-helpers.ts:224-225`), so the editor's *"last 60kg × 8"* is the plan, not history — and progressive overload is the core loop of lifting. **You do not need the new table to fix the wrong number.** `workout_logs` already stores `workoutId`, `date` and `peakWeight` per exercise, so the last matching log yields the heaviest set you actually performed. Show that — *"last top set: 62.5 kg"* — which is true, useful, and what most lifters actually reference. Effort: 2/10. This removes a false number from the most-glanced-at element in the app.

**(b) Persist per-set rows. The migration with a deadline.**
Write a `set_logs` row per completed set (exercise, set index, reps, weight, timestamp, later RPE). Discarding per-set data makes e1RM, rep PRs, rep-range analysis and true set-level history **permanently impossible** — `top-set-wall.tsx:59` already concedes exactly this in a comment. Effort: 4/10 — new table, migration, sync mapper, one changed write path; existing aggregates stay as a derived rollup so nothing downstream breaks.

**Impact.** (a) fixes the week-1 retention loop this week. (b) lifts the ceiling on the entire analytics layer.

**Why it beats everything else.** (b) is the only change in this document that is *irreversible if deferred* — every session logged before it ships is data that can never be recovered at set level. (a) is the cheapest correctness fix in the app and should not wait for it.

### 4. Let people log without planning first

**What.** A "Log something now" path from Home's empty states: pick a muscle group, tap 2–4 exercises, start immediately. Offer to save as a template *afterwards*.

**Why.** Today the shortest path from signup to logging one set runs through the session builder *and* the scheduler — a desk task standing between the user and all value. Nobody evaluates an app this way.

**Impact.** Converts installs into first sessions, which is the top of every other funnel.

**Complexity.** Medium (4/10) — reuses `ExercisePicker` and `plannedExercisesFromTemplate`; needs an ad-hoc session that isn't schedule-derived.

**Why it beats everything else.** Fixes acquisition rather than retention. Retention fixes are worthless while the funnel's first step is a 15-tap configuration wizard.

### 5. Fix the manifest, then make the finish screen pay off

**What.** Two small changes: point `metadata.manifest` at `/manifest.webmanifest` (or rename the file) and add real icons; then replace *"Logged. It is on your progress charts."* with an actual summary — sets, tonnage vs last time, muscles hit, any PR, and one gap callout.

**Why.** The manifest is a one-line 404 that prevents home-screen install for a product whose entire premise is mobile gym use. The finish screen is the emotional peak of a session — the moment the user is most receptive — and it currently says one sentence.

**Impact.** Install-ability plus the single best retention surface in the app.

**Complexity.** Very low (1/10) and low (2/10).

**Why it beats everything else.** The manifest fix is ten minutes for a foundational capability. The summary is where GymFlow can *show off the per-muscle model* to a user who has just earned the right to see it.

---

# STEP 10 — Technical Architecture Review

*(switching to engineering perspective)*

**Overall: high implementation quality, incomplete product surface.** This is not a codebase that needs a rewrite. It needs additions and about six targeted fixes. The comments are the best I have seen in a project this size — they document rejected alternatives and failure modes, which is the hard kind to write.

## Critical defects

### 1. Unsynced local writes are destroyed on next load — **confirmed by code trace**

Two paths, both ending in permanent loss of a completed workout.

**Path A — offline at mount (the gym-basement case).**
`SupabaseSync` calls `loadUserState()`. Offline, it rejects → the `.catch` logs `[supabase-sync] load failed` and returns. Consequences:
- `hydrateRemote` never runs
- `syncedRef.current` stays `undefined`
- **`store.subscribe(...)` is never attached** — it is registered *inside* the `.then`

The user logs an entire workout. `persist()` writes localStorage on every action, so it looks fine. But no subscriber exists, so no flush is ever scheduled — **even after connectivity returns**. On the next reload (now online), `loadUserState()` succeeds, `hydrateRemote` sets `logs: payload.logs ?? []` (remote wins outright), and `persist(next)` overwrites localStorage with the stale remote. **The workout is gone.**

**Path B — push fails, or the tab closes inside the debounce.**
`flush()` is debounced 1500 ms and there is **no `visibilitychange`/`pagehide` flush**. Close the app within 1.5 s of the last set — or have the push fail (`syncedRef` is deliberately left unchanged to force a retry, but only if another store change ever arrives) — and the same `hydrateRemote` overwrite destroys it on next load.

The comment at `workout-store.tsx:766-772` defends remote-wins by reasoning about a *failed read* ("sync throws on failure and never calls this"). The actual failure is a **successful read of stale remote after an unsynced local write**, which it does not cover.

**Fix:** mark local state dirty on write and clear on successful push; if dirty at hydrate, reconcile (union of logs by id, newest-wins for sessions) instead of replacing; attach the subscriber regardless of load outcome; flush on `pagehide`.

### 2. Per-set data discarded at commit

`buildLogFromSession` collapses each exercise to `{totalVolume, totalSets, totalReps, peakWeight}`. Permanently blocks e1RM, per-set PRs, rep-range analysis, set-level history, and correct previous-set values. Not a bug — a schema decision with a large, compounding cost. Fix early; every day of delay is unrecoverable data.

### 3. PWA manifest 404 — **verified by execution, not inference**

`app/layout.tsx:24` declares `manifest: "/manifest.json"`; the file on disk is `public/manifest.webmanifest`. Next.js emits the string verbatim and does not resolve it against `public/`. Confirmed against a production build (`next build && next start`):

```
<link rel="manifest" href="/manifest.json"/>   ← emitted
GET /manifest.json         → 404 Not Found
GET /manifest.webmanifest  → 200 OK
```

Also `"icons": []`, so even with the href corrected there is no home-screen icon. One-line fix, foundational impact for a mobile-first app.

### 4. Hardcoded timezone

`lib/utils.ts` pins `dateKey()` and `weekdayIndex()` to `Asia/Kolkata`. Every user's day boundary, weekday mapping and streak is computed in IST. A single-user assumption in shipped code. (The rest of the date handling is *excellent* — `YYYY-MM-DD` keys parsed as `${key}T00:00:00Z` throughout, with the convention documented. Only the entry point is wrong.)

## Technical Debt

**Dead code — the `planner` subsystem.** `planner`, `plannerMode`, `DailyPlan`, `setPlannerDay`, `addExerciseToDay`, `setPlannerMode`, `updateSet`, `addSet`, `removeExercise`, `useTodayPlan`, `getTodayPlan`, plus the fallback branch in `logTodayWorkout` and `getPlanByDay`/`summarizeDay` in `workout-helpers.ts`. Grep confirms **zero references outside the store itself**. This is roughly 150 lines of dual-path branching in the most complex file in the repo, and it makes `updateSet`/`addSet` read as if they have two live modes when one is unreachable. Delete it.

**Write-only fields.** `PlannedSet.type: "drop"` is assigned when `sets > 3` and never read by any component. Either implement drop-set semantics or drop the field.

**Repetitive store actions.** Every action ends with the same `const next = {...state, ...}; persist(next); return next;`. A `setAndPersist` wrapper would remove ~30 repetitions. Cosmetic, low priority — but it is also where the dead-code duplication hides.

**Volume ignores bodyweight.** `reps × weight` means a pull-up logged at 0 kg contributes zero to every volume chart, every muscle attribution, and the streak card's tonnage. The dataset has a `"body weight"` equipment class, so this is a large and silent category of missing data. Needs a bodyweight input on the profile plus a per-exercise "uses bodyweight" flag.

**990 KB `exercises.json`** fetched whole on first picker open, parsed on the main thread. Cached in a module-level variable, so once per page load. Acceptable today; a served, indexed endpoint would be better at scale.

**Third-party media hot-linking.** `MEDIA_BASE` points at `raw.githubusercontent.com/hasaneyldrm/exercises-dataset`. Not a CDN, subject to rate limits, and breaks entirely if that repo is renamed or deleted. Mirror the assets.

**Stale README.** Documents Firebase, Firestore and Three.js. Actively misleading.

**No component or E2E tests.** The 8 logic-layer test files are good and genuinely test behaviour (not implementation), but the session-logging flow — the highest-risk path — has no coverage.

## What is genuinely good

- **Security.** RLS in migration 0001 with both clauses; no service-role key client-side; the anon key correctly documented as public; `.env` gitignored and untracked (verified). For a solo project this is unusually disciplined.
- **The store's sync boundary.** The store knows nothing about Supabase; `supabase-sync.tsx` subscribes externally. Clean separation, and it means `persist()` stays synchronous so the UI never waits on the network.
- **Reference-equality diffing** in `diffRows` exploiting structural sharing — untouched sessions are never rewritten. Correct and cheap.
- **The window-scoped vs all-time file split** in the progress layer, with the reasoning documented at the top of `progress-trends.ts`. That split prevents a whole class of subtle wrongness.
- **`MAX_DAYS` / `MAX_POINTS` ceilings** on every date loop.

## Architecture changes worth making now

1. **Add `set_logs`.** Keep `workout_logs` as a derived rollup so nothing downstream breaks. One migration, one mapper, one write path.
2. **Make hydration reconcile rather than replace.** Highest-severity fix.
3. **Delete the `planner` subsystem.** Pure subtraction; makes the store meaningfully easier to reason about.
4. **Extract `setAndPersist`.** Do it while deleting the dead code, not separately.

**Do not** normalize `scheduled_sessions.exercises`, adopt `@supabase/ssr`, or introduce a server layer. All three are correctly argued against in the existing comments.

---

# STEP 11 — Workout Logic Review

| Concern | State | Notes |
|---|---|---|
| **Exercises** | ✅ Good | 1,324-item library, custom exercises, per-exercise muscle engagement editable |
| **Sets** | ⚠️ Partial | Add/remove works; the last set can't be removed (deliberate, well-reasoned); **per-set data discarded at Finish** |
| **Reps** | ⚠️ Partial | Stepper only, min 1; no direct entry; not retained per set |
| **Weight** | ⚠️ Partial | 2.5 kg steps, no direct entry, no unit switching (kg hardcoded throughout), no max bound |
| **RPE / RIR** | ❌ Absent | No field, no type, no capture. Boostcamp has this free on every set |
| **Rest periods** | ⚠️ Data only | Stored and displayed as text; **no timer** |
| **Warm-up sets** | ❌ Absent | No concept. Warm-ups logged as working sets inflate volume and set counts |
| **Supersets** | ❌ Absent | No grouping in the model |
| **Drop sets** | ⚠️ Cosmetic | `type: "drop"` auto-assigned when `sets > 3`; **never read by any UI**; no load-drop logic |
| **Progressive overload** | ❌ Absent | No suggestions, no auto-progression, and the "previous" value is the template |
| **Personal records** | ⚠️ Weak | `buildPRLedger` tracks top-set weight only. Correctly refuses to count a first appearance as a PR. No rep PRs, no volume PRs, no e1RM |
| **Exercise history** | ⚠️ Aggregate only | Per-exercise per-session totals; no set-level history |
| **Volume** | ⚠️ Flawed | `reps × weight`; **bodyweight exercises score zero**. Engagement-weighted muscle attribution is good |
| **Muscle groups** | ✅ Excellent | 30 heads, 6 groups, `DIRECT_ENGAGEMENT` 50 / indirect 25 convention documented; group credit is max-not-sum |
| **Workout history** | ✅ Good | Full log history, calendar, table, drill-down |
| **Program structure** | ⚠️ Partial | Templates + schedule, but no mesocycles, no periodization, no deloads, no progression rules |
| **Recovery** | ❌ Absent | Rest days schedulable; no recovery/fatigue model (a deliberate and defensible omission) |
| **Goals** | ❌ Absent | No target weights, no target measurements, no target dates |

### Missing logic that would materially improve the product

**1. Per-set persistence (prerequisite for most of the rest).** Everything below is blocked on it.

**2. e1RM.** Once per-set data exists, the standard estimators are Epley — `1RM = w × (1 + r/30)` (Epley, 1985) — and Brzycki — `1RM = w × 36/(37 − r)` (Brzycki, 1993). Both are accepted approximations that degrade above ~10 reps; that caveat should be shown, in keeping with this codebase's existing standard. Note `top-set-wall.tsx` already explains it deliberately avoids Epley *because* logs store reps per exercise rather than per set — the code has already diagnosed this correctly.

**3. Warm-up set flag.** Without it, volume and weekly set counts are inflated by sets that carry little stimulus — which directly corrupts the 10–20 band comparison that is core to Strategy A.

**4. Bodyweight-inclusive volume.** A user doing weighted pull-ups and dips currently sees a volume chart that under-reports their training badly.

**5. Per-head weekly set targets.** `buildWeeklySetsByGroup` bands at the *group* level against 10–20 sets/week. The differentiator requires this at the head level. Evidence base: Schoenfeld, Ogborn & Krieger (2017) found a graded dose-response with each additional weekly set associated with an effect-size increase of 0.023 (≈0.37% additional gain), and categorized weekly sets as <5 / 5–9 / 10+ per muscle — [PubMed 27433992](https://pubmed.ncbi.nlm.nih.gov/27433992/). A more recent meta-regression extends this — [PubMed 41343037](https://pubmed.ncbi.nlm.nih.gov/41343037/). **The 10–20 framing is a reasonable practical range, not a precisely established optimum, and the UI should keep saying so** — the existing comment ("the weekly range most hypertrophy reviews converge on") is appropriately hedged; keep that tone.

**6. Progression rules on templates.** Even simple linear progression ("+2.5 kg when all sets hit top of range") would convert the app from a record into a coach, and it needs only per-set data plus one rule field.

**No claim in this section rests on my own inference about exercise science.** Where I could not cite, I have said the logic is missing rather than prescribing a specific protocol.

---

# STEP 12 — Monetization

### Options assessed

**Free / ad-supported.** JEFIT does ads on free. Ads in a gym app during a set are hostile, and at low volume the revenue is negligible. No.

**Pure subscription (no free tier).** Fitbod's model, reportedly $15.99/mo. Requires a product that delivers value in the trial window. GymFlow's value is explicitly cumulative — it is *worst* in week 1 and *best* at month 3. This model is structurally wrong for this product.

**Freemium.** Every viable competitor uses it. Correct baseline.

**Lifetime purchase.** Hevy reportedly offers $74.99 lifetime. Valuable as an *option* — it converts the segment that distrusts subscriptions, and it fits an app whose value is personal-data accumulation.

**Coaching / human accountability.** Ladder ($29.99/mo) and Caliber (~$200/mo premium) show this is where real willingness-to-pay lives — but it is an operations business, not a software one. Out of scope for a solo builder.

**Premium programs.** Boostcamp gives 11,000+ away free. Unwinnable.

**AI features as the paid tier.** Contradicts Strategy A and adds per-user marginal cost. No.

## Recommendation: freemium, with the differentiator paid and the logger permanently free

**Free, forever, no caps:**
- Unlimited logging, unlimited sessions, unlimited history
- Full exercise library, custom exercises
- Rest timer, previous-set values, PRs, basic volume/streak charts
- Scheduling and templates
- Body measurements

**Why uncapped.** Hevy caps free at 4 routines / 3 months history. GymFlow cannot win a feature-cap war against a more polished incumbent, and — decisively — **capping history destroys the only moat**. The month-3 correlation *is* the product. Paywalling history would be paywalling the reason to stay.

**Paid ("GymFlow Insight"):**
- Per-muscle-head volume analysis and under-stimulation callouts
- Volume ↔ girth correlation
- Split drift, muscle matrix, ACWR load bands, year spine
- Custom date ranges and comparison windows
- Data export

**When the paywall appears.** Not on a timer and not at signup. **At the moment the user first has enough data for the paid feature to be true** — roughly session 8–12, or the first time they log a tape measurement with 4+ weeks of training behind it. The prompt should show the real insight, partially: *"Your upper chest is averaging 6 sets/week — the lowest of any muscle you train. Your chest measurement is flat over 8 weeks. See the full breakdown →"*

That is honest, specific, personal, and impossible for a competitor to show. It is also only possible because the user stayed — which aligns the paywall with the retention loop instead of fighting it.

**Price.** $3.99/mo, $29.99/yr, $69.99 lifetime. Deliberately at Hevy's level and far below Fitbod/JEFIT: this is a *narrower* product than Fitbod, and pricing above a more complete incumbent invites an unfavourable comparison. The lifetime tier matters disproportionately for a product about owning your own long-term data.

**What users would realistically pay for.** Not charts — charts are commoditized. They pay for **a specific, personal, true statement about their own body that no other app can make.** That is the only thing on this list a competitor cannot copy in a quarter.

---

# STEP 13 — Market Opportunity (blunt)

**1. Is this solving a real problem?** Partially. "Which muscle am I under-training, and is it actually growing?" is a real question that intermediate lifters ask constantly and no app answers well. But the app as it stands mostly solves "log a pre-planned workout," which is solved to death.

**2. Is the market too crowded?** Yes — brutally. Hevy, Strong, JEFIT, Boostcamp and Fitbod are established, well-funded, and several are free. There is no room for another general-purpose workout tracker. There is room for a narrow tool that does one thing incumbents structurally don't.

**3. Is my product just another workout tracker?** **Today, yes — and a less complete one.** It lacks a rest timer, real previous-set values, supersets, warm-up sets, RPE and e1RM, all of which Boostcamp gives away free. The per-muscle-head model and girth correlation are real differentiators, but they are buried behind a setup wall and invisible until month 3.

**4. Strongest niche.** The intermediate physique-focused lifter with a lagging body part, who already trains consistently and wants to know whether their exercise selection is biased toward the region they think it is.

**5. Can it realistically compete?** Not as a general tracker — no. As a per-muscle hypertrophy audit tool, yes, but only for a narrow audience and only after the logging basics reach parity. Be clear-eyed: this is a "thousands of engaged users" opportunity, not a "displace Hevy" one. That can still be a good business for a solo builder at $30–70/user.

**6. What would make users switch?** Almost nothing will make them *switch* — switching costs are enormous once history accumulates elsewhere. Realistic paths: (a) they *add* GymFlow alongside their logger for the audit, which is a weak position; or (b) you catch them at a decision point — new lifter, returning after a break, or frustrated with a lagging body part. **(b) is the real acquisition channel**, and the messaging should target it explicitly.

**7. Moat.** Accumulated per-muscle-head training history correlated with the user's own tape measurements. Non-portable, non-importable, compounding, and it exists nowhere else. Time is the barrier — which cuts both ways: it protects you from copying, and it means every user must survive three months before the moat forms.

**8. Best positioning.** Not a tracker, not a planner, not an AI coach, not social. **A progress-analysis tool for hypertrophy, with a logger good enough to use daily.** The logger is table stakes you must pay; the analysis is the product.

**The blunt version.** The engineering is better than the product. Considerable effort has gone into a genuinely sophisticated analytics layer sitting on top of a logger that cannot survive a session in a basement gym and shows a "previous weight" that is not the previous weight. The differentiator is real but unproven — and it rests on regex-derived engagement values, which means the claims must stay carefully hedged. Fix the logger, surface the differentiator on day one instead of month three, and there is a defensible niche product. Leave it as-is and it is a well-built app that nobody has a reason to open twice.

---

# STEP 14 — Final Verdict

## Product Score

| Dimension | Score | Rationale |
|---|:--:|---|
| UX | **5**/10 | Set-logging loop is genuinely good; setup wall, no rest timer, no aha moment |
| UI | **8**/10 | Cohesive, mobile-first, real contrast and touch-target discipline, restrained |
| Technical quality | **7**/10 | Excellent security/data model/comments; one critical data-loss bug and dead code |
| Workout functionality | **4**/10 | Missing rest timer, real previous values, supersets, warm-ups, RPE, e1RM |
| Differentiation | **6**/10 | Per-head + girth correlation is real and rare — but hidden and inference-based |
| Retention potential | **4**/10 | Strong at month 3+, nearly zero in week 1, which is where users are lost |
| Monetization | **5**/10 | Clear viable path; nothing implemented; no payments, no tiers |
| Market opportunity | **4**/10 | Saturated category; a narrow defensible niche exists |
| **Overall** | **5.5**/10 | High-quality engineering, incomplete product |

## Current Position

GymFlow is a well-engineered, schedule-first workout logger with an analytics layer that is more sophisticated than several paid competitors, wrapped around a logging experience that is missing features every free competitor ships. The data model, RLS-from-migration-one security posture, and the documented reasoning throughout the code are all above the standard of most commercial apps in this category. But the product is inverted against its own users: the deepest work sits on the Progress tab, which is empty for a new user's first month, while the gym-floor experience — the thing the README, the login page and the layout all promise — lacks a rest timer and shows a "previous weight" that comes from the plan rather than from history.

## Biggest Problem

**A user can lose a completed workout.** If `loadUserState()` fails at mount — which is exactly what happens in a basement gym — the sync subscriber is never attached, so nothing is ever pushed even after signal returns; on the next load the successful remote read overwrites localStorage and the session is gone. A second path does the same when the tab closes inside the 1500 ms debounce, since nothing flushes on `pagehide`. Beneath that sits a structural problem with a deadline: per-set data is discarded at Finish, which permanently caps the analytics *and* makes the correct previous-set value impossible. Every day this ships is a day of data that cannot be recovered later.

## Biggest Opportunity

Nobody in this market closes the loop between *training a specific muscle* and *that muscle measurably changing*. GymFlow already has both halves — a 30-head muscle model with engagement derivation, and `MUSCLE_SITES` mapping muscles to tape sites, with the girth chart already rendering directly beneath the volume chart for the same muscle. No competitor I could verify does this; Strong, Fitbod and Boostcamp Pro all ship muscle heat maps, but at group level and never tied to measured outcome. The opportunity is to make that correlation the *product* rather than the twentieth card on a tab most users never reach — while keeping the claims as carefully hedged as this codebase already keeps its ACWR card, because the per-head values are regex-derived inference, not measurement.

## What I Would Build Next

1. **Fix the data-loss paths** — reconcile at hydrate instead of remote-wins, attach the subscriber unconditionally, flush on `pagehide`.
2. **Rest timer** — the data already exists; this is one component and a `setInterval`.
3. **Real previous-set values, then per-set logging** — first read "last top set" from the logs you already store (cheap, removes a false number this week); then add `set_logs`, the one change whose cost grows every day it is deferred.
4. **Quick-log without planning** — "what are you training today?" → 3 taps → logging, with the muscle map lighting up per-head on set one.
5. **A finish-session summary that pays off** — sets, tonnage vs last time, PRs, and one per-muscle gap callout.

## What I Would Remove / Simplify

1. **The entire `planner` subsystem** — `planner`, `plannerMode`, `DailyPlan`, `setPlannerDay`, `addExerciseToDay`, `updateSet`, `addSet`, `removeExercise`, `useTodayPlan`, and the `logTodayWorkout` fallback. Zero external references; ~150 lines of unreachable branching in the most complex file.
2. **`PlannedSet.type: "drop"`** — assigned but never read. Implement it or delete it.
3. **The mandatory build-then-schedule onboarding** — keep both, but move them *after* the first logged session.
4. **The stale README** — it documents Firebase, Firestore and Three.js, none of which exist.
5. **Progress-tab density for new users** — ~20 cards is right at month 6 and overwhelming at week 1. Reveal progressively as the data supports each card.

## Product Direction

> **This product should become the per-muscle hypertrophy audit for intermediate lifters who want to know which muscle they are under-training and whether it is actually growing.**

---

## Sources

- [Hevy — official site](https://www.hevyapp.com/) (features verified; pricing not published)
- [Strong — official site](https://www.strong.app/) (features verified; pricing not published)
- [Boostcamp — official features page](https://www.boostcamp.app/features) (features and Pro pricing verified)
- [Fitbod — official site](https://fitbod.me/) (features verified; pricing not published; help centre returned 403)
- [Hevy Review 2026 — pricing](https://www.sensai.fit/blog/hevy-review-2026) *(third-party)*
- [Fitbod Review 2026 — pricing](https://www.sensai.fit/blog/fitbod-review-2026) *(third-party)*
- [Jefit — pricing and features](https://sports.toolsinfo.com/tool/jefit) *(third-party)*
- [Ladder app review — pricing](https://www.garagegymreviews.com/ladder-app-review) *(third-party)*
- [Boostcamp — powerlifting app comparison](https://www.boostcamp.app/best/powerlifting)
- [Schoenfeld, Ogborn & Krieger (2017), dose-response meta-analysis — PubMed 27433992](https://pubmed.ncbi.nlm.nih.gov/27433992/)
- [Resistance Training Dose Response meta-regressions — PubMed 41343037](https://pubmed.ncbi.nlm.nih.gov/41343037/)
- [Muscle thickness correlates to muscle cross-sectional area — PMC5873262](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5873262/)

*Epley (1985) and Brzycki (1993) 1RM formulas are referenced in STEP 11 as standard published estimators.*
