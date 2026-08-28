# GymFlow

Mobile-first workout tracker: a dated schedule of sessions, tap-first set logging, and a
per-muscle analytics layer built on a 30-muscle model.

The defining structural choice is that a session is planned before it is logged — the app is
a calendar, and Home is the cursor pointing at today's entry.

## Stack

- Next.js App Router (every screen a client component — no server components, no API routes,
  no middleware)
- TypeScript, strict
- Tailwind CSS with shadcn-style local primitives in `components/ui/`
- Supabase — Postgres reached directly from the browser under the user's JWT, with RLS doing
  the authorization
- Supabase Google OAuth, redirect flow (not popup — mobile blocks popups)
- Zustand vanilla store in a React context, persisted to `localStorage` synchronously
- Recharts for the progress charts
- Inline SVG for the body map (`features/body/front.tsx`, `back.tsx`)

## Mobile-first choices

- Bottom navigation with `env(safe-area-inset-bottom)`, one-handed reach
- 44–48px touch targets; `tabular-nums` on every changing number so digits don't jitter
- Today's session is the default landing screen
- Set logging is a strip of tappable chips with one set open at a time
- The store writes `localStorage` synchronously, so the UI never waits on the network;
  Supabase sync runs behind it, debounced

## Project structure

- `app/` — routes: `/` (Home), `/plan`, `/progress`, `/profile`, `/login`
- `components/ui/` — thin local primitives
- `components/layout/` — shell, bottom nav, providers
- `features/auth` — `AuthGuard`, `use-auth`
- `features/home` — today's session, the set ledger, streak, muscle map
- `features/workout` — the Zustand store and the Supabase sync boundary
- `features/planner` — session builder (Build) and schedule generator (Schedule)
- `features/progress` — the analytics cards and the per-muscle drill-down
- `features/body` — the SVG body map
- `features/profile` — profile and body measurements
- `lib/` — domain logic, all pure and separately tested (`progression`, `one-rep-max`,
  `per-side`, `import-backup`, `theme` among them)
- `supabase/migrations/` — schema, RLS enabled in the same migration that creates the tables

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
cp .env.example .env
```

3. Fill in the Supabase values from **project settings → API**:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

The anon key is public by design — RLS decides what it can reach. There is no service-role
key anywhere in the client.

4. Start the app:

```bash
npm run dev
```

## Supabase setup

> **Run `0004_progression.sql` before deploying this revision.** `session_templates`
> writes now include a `progression` column, and `pushChanges` throws on the first failed
> write — against a project still on `0003`, *every* session save fails, not just ones using
> a rule, and it surfaces as a sync error rather than as anything naming a migration.


1. Create a Supabase project.
2. Run the migrations in `supabase/migrations/` in order — `0001_init.sql` through
   `0004_progression.sql`.
3. Enable the Google provider under **Authentication → Providers**.
4. Add your local dev origin and deployed domain to the allowed redirect URLs.

`0001_init.sql` also installs a `security definer` trigger that seeds a `profiles` row on
signup, so the app never has to branch on "profile missing".

## Data shape

Six tables, all user-owned, all with RLS using both `using` and `with check`:

- `profiles` — name, height, weight, measurement cadences, and the schedule config
- `workout_templates` — user-added exercises (presets ship with the app and are not stored)
- `session_templates` — named sessions with their exercises
- `scheduled_sessions` — dated sessions; `exercises` stays `jsonb` because the app loads a
  whole session, mutates it in memory and writes it back, and never queries inside one
- `workout_logs` — one row per exercise per session, with real columns because it is read as
  an aggregated series
- `body_measurements` — 11 sites, left and right kept separate

`session_templates.progression` (0004) holds the rule that decides a session's opening weights;
NULL means no rule, which is what every session saved before it meant.

## Exercise library

1,324 exercises in `public/exercises.json`, fetched client-side on first open of the picker
and cached for the page load. The dataset names a `target` and `secondary` muscles but no
engagement percentages, so `lib/exercises.ts` derives them: `MUSCLE_MAP` widens each coarse
dataset name to every app muscle it could mean, then `HEAD_RULES` narrows it back down by
matching the exercise name. This is inference, not measurement, and the UI is written to say
so.

## Checks

```bash
npm run check      # the logic-layer test suite
npx tsc --noEmit   # types
npm run build      # production build
```

`npm run check` enumerates its test files explicitly — a new `*.test.ts` has to be added to
the script in `package.json` or it is silently never run.

## Seed data

Preset muscles, workouts and development fixtures live in `lib/seed-data.ts`. The `starter*`
fixtures are for local development and are not handed to real accounts — a new account starts
empty and lands in Home's `setup` state.

```bash
npm run seed       # writes public/seed-data.json
npm run seed:year  # fills a year of logs against a real Supabase project
```

## Notes

- Route protection is client-side via `AuthGuard`; RLS is what actually enforces access.
- Supabase sync is debounced so tapping through sets stays responsive. The store knows
  nothing about Supabase — `features/workout/supabase-sync.tsx` subscribes from outside.
- Dates are `YYYY-MM-DD` keys parsed as `${key}T00:00:00Z` throughout.
- Planned work is tracked in `product-plan.md`, alongside the review it answers.
