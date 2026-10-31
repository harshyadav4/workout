# Arise

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

## Design

The look is a set of tokens and surfaces, all in `app/globals.css`:

- **Two themes.** Dusk (dark) is the palette in `:root`; Dawn (light) is the `light` class.
  Every colour the UI touches is a token, so a theme is a block of numbers and nothing else.
- **Surfaces.** One level only. `.plaque` is a see-through surface in the page, so the sky
  carries through it. `.plaque-solid` is for anything floating (menus, bars, the tour's bubble).
  `.well` is a field or an empty track. `.key-quiet` is a quiet button.
- **Main button.** Plain `--primary`: white on Dusk, ink on Dawn, with no
  gradient and no glow.
- **Warm light.** `--l1`, `--l2` and `--l3` mark only progress. Each card on Progress and
  on Intake keeps its own colour (`--s-*`) for all its charts. Red means a limit passed or a delete,
  and it stays quiet.
- **One arc.** One thin arc shows progress: the rank on You, the week on Today, the sets in a workout,
  the calories on Diet (`components/ui/progress-arc.tsx`).
- **Two typefaces.** Instrument Sans for everything, and Outfit (`font-heading`) for a screen's few
  large words. Its weight and tracking live in one rule in `app/globals.css`. `font-display` maps to
  the sans. Both can change, with the colours, in You → Theme (`lib/theme-custom.ts`, `app/fonts.ts`).
- **Lists and sheets.** A page is rows, and a form lives in a bottom sheet (`components/ui/list.tsx`).
- **One moment.** Logging a set springs the chip, fills the ring, and — behind a switch on the
  You page — plays a synthesised click and a 12 ms haptic (`lib/feedback.ts`). Off by default.
- **Assets.** Icons, launch screens and their checks come from `scripts/build-icons.ts`; the share
  image is `app/opengraph-image.tsx`.

`design-preview/arise-new-design.html` is the mock the design was chosen from.

## Mobile-first choices

- A floating dock with `env(safe-area-inset-bottom)`, one-handed reach
- 44–48px touch targets; `tabular-nums` on every changing number so digits don't jitter
- Today's session is the default landing screen
- Set logging is a strip of tappable chips with one set open at a time
- The store writes `localStorage` synchronously, so the UI never waits on the network;
  Supabase sync runs behind it, debounced

## On the phone

Arise is a web app installed from the browser; there is no store build. What each platform
gets, once the app is on the home screen (`public/manifest.webmanifest`, `public/sw.js`,
`features/pwa/`):

| | iPhone / iPad | Android |
|---|---|---|
| Install | Share › Add to Home Screen (no prompt event exists; the You page shows the steps) | Chrome's install prompt, via the card on You |
| Offline | app shell and code from the worker; data already on the device | same |
| Rest alert, app open | page timer + buzz on the dial (no vibration API) | page timer + vibration |
| Rest alert, phone locked | Web Push, installed app only, iOS 16.4+ | Web Push, tab or installed |
| Notification keys (+15s / Skip) | not shown | shown |
| Badge on the icon | installed app, iOS 16.4+ | installed app |
| Share an AI answer into Plan | — | share sheet › Arise (`share_target`) |
| Retry a failed sync | when the browser fires `online` | `online`, plus Background Sync wakes the worker |
| Sign in | Google, Apple (native sheet with Face ID) | Google, Apple |
| Status bar colour | follows the theme | follows the theme |
| Back while a sheet is open | edge swipe closes the sheet, not the page | back gesture closes the sheet, not the app |
| Tabs | each keeps its scroll position | same |
| Keyboard return key | says Done / Search | same |
| Sheets | slide up, a grabber, swipe down to dismiss (from the grabber, or from the body once it is scrolled to the top) | same |
| Deleting | immediate, with an Undo bar for five seconds (`lib/undo.ts`); list rows also swipe left to delete | same |
| Tap the tab you are on | back to the top of that screen | same |
| Segmented controls (Theme, Distance, Build/Schedule, Gym/Cardio, …) | one key slides to the chosen segment; a swipe on the control moves it one step | same |
| Plan and Progress tabs | swipe the page sideways to switch; a swipe that starts on a row, a chip strip or the body map stays theirs | same |
| Selected muscle on the body map | a brand-coloured ring plus a glow (the ring alone on iPhone, which does not draw filters inside an SVG) | ring and glow |
| Long press on a label or a stat | nothing — text selects only in fields and on About (`select-text`) | same |
| Zoom | none — double tap and pinch do nothing, as in a native app (installed app only on iPhone) | none |
| Updates | a newer build loads itself the next time the app goes to the background, unless a timer or a sheet is in use; otherwise the "New version · Reload" bar | same |
| Keyboard | 1–4 switch tabs, Escape closes a sheet | same |

Installed on a desktop (Chrome, Edge): the window's title bar is the app's own
(`window-controls-overlay`; `--titlebar` in `app/globals.css` pads the pages under it) and the
page has no scrollbar. In a browser tab both stay as the browser draws them. Hover styles apply
only on devices that can hover (`hoverOnlyWhenSupported` in `tailwind.config.ts`), so a tapped
key does not stay lit.

iPhone limits that shape the design: a page's timers stop within seconds of the screen
locking, so anything that must happen then goes through Web Push; notifications, push and the
badge exist only in the installed app; there is no vibration. The server side of push is under
**Rest alerts on a locked phone** below.

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

> **Run `0016_injuries.sql` for injuries to sync.** It adds `injuries`, `pain_logs` and
> `injury_deletions`. Without it injuries stay on the device and everything else syncs as before.
> The next time the app opens after it has run, it sends them.

> **Run `0015_diet_micronutrients.sql` for a meal's foods to sync.** Without it meals still sync, and
> their foods and micronutrients stay on the device.

> **Run `0014_diet.sql` for Diet to sync.** It adds `meals`, `meal_plans`, `scheduled_meal_days`
> and `diet_settings`. The app does not break without it: diet stays on the device, every workout
> table syncs as before, and the next save after the migration sends it all.

> **Run `0008_data_deletion.sql` for "Delete all my data".** It adds
> `profiles.deletion_requested_at` and the `data_archives` table. Without it *Delete all my
> data* refuses with a message naming this migration — it never deletes anything it cannot first archive. Deletion
> keeps the old data hidden in `data_archives` for 7 days; there is no scheduled job, so the
> archive is deleted the first time the user opens the app after the week.
>
> **If "Delete all my data" fails with "refused the change"** (code `42501`, or in the console
> `new row violates row-level security policy for table "data_archives"`), the table's policy
> exists but is empty. A policy created by hand in the dashboard with blank expressions, or a
> table created before the migration ran, leaves `create policy` with nothing to add — and an
> empty policy refuses every row. Check with:
>
> ```sql
> select policyname, qual, with_check from pg_policies where tablename = 'data_archives';
> ```
>
> Both `qual` and `with_check` must read `(auth.uid() = user_id)`. If either is null, recreate it:
>
> ```sql
> drop policy if exists "data archives: own row" on data_archives;
> create policy "data archives: own row" on data_archives
>   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
> ```

> **Run `0007_cardio_and_skills.sql` for cardio distance, Skills and session times.** It adds
> `set_logs.distance_km`, the `skill_goals` table, and `scheduled_sessions.started_at` /
> `finished_at`. Unlike earlier migrations, the app does not break without it: runs sync without
> their distance, sessions sync without their times, and skill goals stay on the device until it
> has run — then all of it syncs on the next save.

> **Run `0006_exercise_media.sql` before deploying "Build with AI".** Exercise templates now
> write a `media_path` column; against a project without it, every template save fails as a sync
> error. The same migration creates the `exercise-media` storage bucket and its policies.

> **Run `0004_progression.sql` before deploying this revision.** `session_templates`
> writes now include a `progression` column, and `pushChanges` throws on the first failed
> write — against a project still on `0003`, *every* session save fails, not just ones using
> a rule, and it surfaces as a sync error rather than as anything naming a migration.


1. Create a Supabase project.
2. Run the migrations in `supabase/migrations/` in order — `0001_init.sql` through
   `0016_injuries.sql`. `0009` makes template ids per user (older projects collide on shared
   ids like `db-0025`); `0010` adds the two Web Push tables.
3. Enable the Google provider under **Authentication → Providers**.
4. Add your local dev origin and deployed domain to the allowed redirect URLs.
5. **Sign in with Apple** (the second button on the login page). In the Apple Developer portal:
   an App ID with the *Sign in with Apple* capability, a **Services ID** (this is the client ID)
   with your Supabase callback URL `https://<project>.supabase.co/auth/v1/callback` as a return
   URL, and a *Sign in with Apple* **key**. Then in Supabase **Authentication → Providers →
   Apple** enter the Services ID and the client secret generated from the key (Supabase's docs
   have the generator). The secret is a JWT that Apple caps at six months — put a reminder in the
   calendar to regenerate it. Until this is done the Apple button returns Supabase's provider
   error, shown under the buttons.

`0001_init.sql` also installs a `security definer` trigger that seeds a `profiles` row on
signup, so the app never has to branch on "profile missing".

### Rest alerts on a locked phone (Web Push)

Rest alerts have two layers: a timer in the page, and — signed in — a push from the server at
the end time, which a locked phone still receives. The push layer needs `0010_push.sql`, one
Edge Function, and a cron job. Without it the switch still works with the page timer alone.

1. Make a key pair and keep the output:

   ```sh
   npm run vapid
   ```

2. Put the **public** key in the app's env (`.env`, and the Vercel project) as
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
3. Give the function its secrets (the private key never goes in the app):

   ```sh
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
     VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=$(openssl rand -hex 24)
   supabase functions deploy send-rest-alerts --no-verify-jwt
   ```

4. Schedule it from Postgres (SQL editor; replace the project ref and the secret):

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule(
     'send-rest-alerts',
     '5 seconds',
     $$ select net.http_post(
          url     := 'https://<project-ref>.supabase.co/functions/v1/send-rest-alerts',
          headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
          body    := '{}'::jsonb
        ) $$
   );
   ```

   `'5 seconds'` needs pg_cron 1.5 or later, which current Supabase projects have. If yours
   rejects it, use `'* * * * *'` and accept up to a minute's delay.

On iPhone the push layer is available only in the app added to the Home Screen (iOS 16.4+).
On Android the browser tab can subscribe too. The switch is on the You page.

### Reminders

The Reminders card on You (signed in) sends, at the lifter's local times: the morning card —
workout today, weigh-in due, tape due, plan ending in a week and the day before, in one
notification — and the evening card — a planned day with nothing logged, and on Sunday the
week's sessions, volume and records. The workout reminder goes an hour before the last
session's start time; the morning time until there is one. Weigh-in and tape come back every
day while still due. Each card opens with the lifter's first name.

The rules are pure and tested (`supabase/functions/_shared/reminders.ts`); the sender gathers
the inputs. Setup, after the Web Push steps above:

```sh
supabase functions deploy send-daily-reminders --no-verify-jwt
```

then run `supabase/cron.sql` (it schedules both senders; the reminders job runs every minute).
Migration `0011_reminders.sql` adds `reminder_settings`, `reminder_log` and the rest alert's
`body` column.

## Build with AI

Plan › Build › **Build with AI** copies a prompt (`lib/ai-prompt.ts`) that a user pastes into any
chat assistant. The assistant interviews them and replies with one JSON object, checked and matched
against the exercise library by `lib/ai-plan.ts`, reviewed on screen, then imported as sessions and
a schedule. Library names map to bundled demos; an exercise outside the library may carry a public
`.gif`, which `app/api/media/route.ts` fetches once (https only, no private addresses, GIF bytes
only, 5 MB cap) and stores per user in Supabase Storage. A stored GIF is deleted when no session
uses its exercise any more. Imports never touch logs, sets or finished days.

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
- `injuries`, `pain_logs` — one 0 to 10 score per injury per day
- `injury_deletions` — only the id of a deleted injury, so it stays deleted on every phone

`session_templates.progression` (0004) holds the rule that decides a session's opening weights;
NULL means no rule, which is what every session saved before it meant.

## Exercise library

1,324 exercises in `public/exercises.json`, fetched client-side on first open of the picker
and cached for the page load. The dataset names a `target` and `secondary` muscles but no
engagement percentages, so `lib/exercises.ts` derives them: `MUSCLE_MAP` widens each coarse
dataset name to every app muscle it could mean, then `HEAD_RULES` narrows it back down by
matching the exercise name. This is inference, not measurement, and the UI is written to say
so.

## Diet

The circle in the middle of the dock flips the whole app between Workout and Diet, and the tabs
rename: Meals, Diet plan, Intake, You. The choice stays on the device (`features/diet/area-store.ts`).

Diet mirrors the workout model and shares no data with it:

| Workout | Diet |
|---|---|
| Exercise (`WorkoutTemplate`) | `Meal` |
| Workout (`SessionTemplate`) | `MealPlan`: one day of eating, each meal with a time |
| `ScheduleConfig`, `ScheduledSession` | `MealScheduleConfig`, `ScheduledMealDay` |
| Logging a set | Ticking a meal |
| `workout-store`, `supabase-sync`, `reconcile` | `diet-store`, `diet-supabase-sync`, `diet-reconcile` |

The rule that shapes it (`lib/meal-schedule.ts`): a meal the user has touched is never rewritten.
A new schedule, an edited plan or a deleted plan only changes meals still unticked, and an eaten
meal keeps the numbers it was eaten at. There is no separate log, so Progress reads eaten meals off
the days. A plan copies a meal's numbers: an edited meal reaches a plan when that plan is next saved.
Diet reads bodyweight and training from the workout side, and only reads them.

Science on Intake (`lib/diet-science.ts`) runs published rules over the meals you ticked,
each with its source behind the ⓘ. The Body goals card starts with the path to your target weight: your weigh-ins,
where your weight goes at what you eat, and the standard pace. Maintenance comes from your food and
scale when there is enough data, and from the Mifflin-St Jeor formula until then.

Micronutrients come from meals built out of library foods (`lib/diet-micros.ts`). A meal only typed
by hand is unknown for them, and unknown is never counted as zero: an average only reads days where
every eaten meal is known. Targets are ICMR-NIN 2020, by sex. Potassium and sodium are WHO 2012, and
fibre is IOM 2005. Vitamin B12 is not in the food table, so it is not shown.

A body goal (`lib/diet-body-goal.ts`) sets lean mass, body fat or both, because weight alone cannot
tell muscle from fat. The app works out the weight that implies and a dated roadmap: lose fat first,
then build. With a body goal, the weight path aims for the end of the next roadmap step at that step's
pace, so the two cards never give opposite advice. All of it is an estimate, and the card names its
sources and limits.

## Food library

542 foods in `public/foods.json`, fetched the same way on first open of the food picker
(`lib/foods.ts`). The values are the Indian Food Composition Tables 2017 (National Institute of
Nutrition, Hyderabad), per 100 g of the raw food, taken from the MIT-packaged `index.csv` at
github.com/ifct2017/compositions. It is not a dependency: fetch that file once and run

```
npm run foods -- /path/to/index.csv
```

Energy arrives in kJ and is stored in kcal. Pure fats (oils, ghee) carry no energy in the table,
so they are written as 100 g fat and 900 kcal per 100 g. Vitamin A and vitamin D are worked out
rather than copied, because those columns mislead: `scripts/build-foods.ts` explains why. The table
has no oats, whey, curd, bread, butter or salt. No prices: cost on a meal is always typed by the user. Diet code is kept apart from workout code on purpose — its own types
(`lib/diet-types.ts`), store, tables and screens — so a meal can never reach the training
aggregations.

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
- Sync errors reach the screen as one sentence plus the Postgres/PostgREST code in brackets
  (`lib/sync.ts`, `syncErrorMessage`), never the raw message — it names tables, constraints and
  policies. The raw text is in the browser console under `[supabase-sync]`. A foreign key
  failure on a push (`23503`) means the account behind the still-valid token was deleted; the
  device confirms that with the server, signs out locally, and the You tab says why.
- Supabase sync is debounced so tapping through sets stays responsive. The store knows
  nothing about Supabase — `features/workout/supabase-sync.tsx` subscribes from outside.
- Dates are `YYYY-MM-DD` keys parsed as `${key}T00:00:00Z` throughout.
- Planned work is tracked in `product-plan.md`, alongside the review it answers.
