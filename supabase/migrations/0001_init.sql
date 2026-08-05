-- GymFlow schema. Five tables, all user-owned.
--
-- Identity comes from Supabase's auth.users, so there is no users table here.
-- Static reference data (the 30 muscles, the 1324-row exercise library, the
-- preset workouts) ships with the app and is deliberately not stored.
--
-- Primary keys are text, not uuid: the client already generates ids
-- (crypto.randomUUID(), and db-0001 style for library exercises).

create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  name            text,
  email           text,
  height_cm       numeric,
  weight_kg       numeric,
  -- ScheduleConfig is 1:1 with the user, so it folds in here rather than
  -- earning a sixth table.
  schedule_config jsonb,
  updated_at      timestamptz not null default now()
);

-- User-added exercises only. Presets live in lib/seed-data.ts.
create table workout_templates (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  category     text,
  db_id        text, -- source id in public/exercises.json
  equipment    text,
  muscles      jsonb not null default '[]'::jsonb, -- WorkoutMuscleTarget[]
  default_sets jsonb
);

create table session_templates (
  id        text primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  name      text not null,
  exercises jsonb not null default '[]'::jsonb, -- SessionTemplateExercise[]
  summary   jsonb not null
);

-- exercises stays jsonb: the app loads a whole session, mutates it in memory
-- and writes it back. It never queries inside one, so normalising into
-- planned_exercises/planned_sets would buy joins for queries nobody runs.
create table scheduled_sessions (
  id                  text primary key,
  user_id             uuid not null references auth.users (id) on delete cascade,
  date                date not null,
  day_index           smallint not null,
  session_template_id text,
  session_name        text not null,
  type                text not null check (type in ('workout', 'rest')),
  status              text not null check (status in ('planned', 'active', 'completed')),
  source              text not null check (source in ('manual', 'repeat')),
  exercises           jsonb not null default '[]'::jsonb -- PlannedExercise[], sets nested
);

create index scheduled_sessions_user_date_idx on scheduled_sessions (user_id, date);

-- The immutable record, and the one table that gets real columns: it is the
-- only place a query earns its keep (buildVolumeSeries / buildStrengthSeries
-- in lib/workout-helpers.ts aggregate over date and volume).
create table workout_logs (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  session_id   text,
  workout_id   text not null,
  name         text not null,
  total_volume numeric not null default 0,
  total_sets   integer,
  total_reps   integer,
  peak_weight  numeric,
  muscles      jsonb not null default '[]'::jsonb
);

create index workout_logs_user_date_idx on workout_logs (user_id, date desc);

-- Row Level Security -------------------------------------------------------
--
-- This is the whole security model: supabase-js talks to Postgres straight
-- from the browser under the user's own JWT, and these policies decide which
-- rows it can see. Both clauses are required — `using` alone gates reads but
-- would still let a user INSERT a row owned by someone else.
--
-- RLS is enabled here, in the same migration that creates the tables, so no
-- table ever exists unprotected.

alter table profiles enable row level security;
alter table workout_templates enable row level security;
alter table session_templates enable row level security;
alter table scheduled_sessions enable row level security;
alter table workout_logs enable row level security;

create policy "own profile" on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "own rows" on workout_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows" on session_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows" on scheduled_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows" on workout_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Give every new account a profile row, so the app never has to branch on
-- "profile missing". security definer because the trigger runs as the auth
-- system, not as the new user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
