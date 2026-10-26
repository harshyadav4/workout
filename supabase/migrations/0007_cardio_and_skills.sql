-- Cardio, and the skills a hunter is working toward.

-- How far a cardio set went, in km. Miles are a display setting on the device;
-- the stored number is always km, so switching units never rewrites a run.
--
-- Nullable for the same reason as duration_seconds: every row before this is a
-- lifting set or a hold, and NULL means "not a distance set", not "went nowhere".
-- The app keeps syncing without it (lib/sync.ts OPTIONAL_COLUMNS) — runs just
-- lose their distance on the server until this has run.
alter table set_logs
  add column if not exists distance_km numeric;

-- Skill goals: the Pull-up, the Handstand, or a ladder the user built. Only the
-- goal and its levels are stored; how far along it is gets read off set_logs
-- every time (lib/skills.ts), so it can never disagree with what was logged.
-- `levels` is the ladder as it was when the goal was set — tuning the
-- ready-made ladders later must not move anyone's progress.
--
-- The app treats a missing table as "no skills yet" (lib/sync.ts), so it keeps
-- syncing everything else until this has run.
create table if not exists skill_goals (
  id            text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  template_key  text,
  levels        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists skill_goals_user_idx on skill_goals (user_id);

alter table skill_goals enable row level security;

drop policy if exists "own rows" on skill_goals;
create policy "own rows" on skill_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
