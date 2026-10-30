-- Diet: meals, meal plans, and the days they are scheduled on. Separate tables
-- with nothing pointing at the workout ones: a meal is not training and must
-- never reach a training aggregation.
--
-- The app treats any of these missing as "nothing yet" (lib/diet-sync.ts): diet
-- stays on the device, every workout table syncs as before, and the next save
-- after this has run sends it all.

-- A reusable meal, for one serving. Real columns: it is one flat record.
create table if not exists meals (
  id        text not null,
  user_id   uuid not null references auth.users (id) on delete cascade,
  name      text not null,
  kcal      numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g   numeric not null default 0,
  fat_g     numeric not null default 0,
  cost_inr  numeric not null default 0,
  -- The IFCT food it was made from, and the weight picked. Null when typed.
  food_id   text,
  grams     numeric,
  -- Per user, as 0009 settled for templates: a restored backup or a merged guest
  -- copy must never collide with another account's id.
  primary key (user_id, id)
);

-- A day of eating. Items are jsonb, like session_templates.exercises: they are
-- only ever read whole, with their plan.
create table if not exists meal_plans (
  id      text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name    text not null,
  items   jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  primary key (user_id, id)
);

-- One date's checklist. The items carry their own status and their own copy of
-- the numbers, so there is no separate log: Progress reads eaten items off these.
create table if not exists scheduled_meal_days (
  id           text not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  meal_plan_id text,
  plan_name    text not null default '',
  items        jsonb not null default '[]'::jsonb,
  source       text not null default 'repeat' check (source in ('manual', 'repeat')),
  primary key (user_id, id),
  -- One day per date. The client upserts on this pair, so two offline devices
  -- that each made a day for Tuesday merge rather than fail.
  unique (user_id, date)
);

-- Targets and the weekly schedule, one row per user. Its own table, not columns
-- on profiles, to keep diet out of the workout tables.
create table if not exists diet_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  kcal_target      numeric,
  protein_target_g numeric,
  carbs_target_g   numeric,
  fat_target_g     numeric,
  schedule_config  jsonb
);

-- For a project that ran this file before these two existed. Safe to run again.
alter table diet_settings add column if not exists carbs_target_g numeric;
alter table diet_settings add column if not exists fat_target_g numeric;

alter table meals enable row level security;
alter table meal_plans enable row level security;
alter table scheduled_meal_days enable row level security;
alter table diet_settings enable row level security;

drop policy if exists "own rows" on meals;
create policy "own rows" on meals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on meal_plans;
create policy "own rows" on meal_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on scheduled_meal_days;
create policy "own rows" on scheduled_meal_days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on diet_settings;
create policy "own rows" on diet_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
