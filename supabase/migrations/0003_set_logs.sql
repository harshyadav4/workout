-- Per-set records.
--
-- `workout_logs` stays exactly as it is: a per-exercise rollup, and still the
-- table every volume and strength aggregation reads. This sits underneath it.
-- The rollup cannot answer "what did my top set weigh last Thursday", and no
-- amount of later work can back-fill a session logged before this table exists —
-- which is the whole reason it is early rather than convenient.

create table set_logs (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- `writeTable` deletes by vanished id. Without the cascade, deleting a log
  -- either fails on this reference or orphans every set row beneath it.
  log_id       text not null references workout_logs (id) on delete cascade,
  workout_id   text not null,
  date         date not null,
  -- Position within the exercise, 0-based. Not a unique key: a set can be
  -- inserted mid-exercise, and renumbering rows on the server is not worth it.
  set_index    integer not null,
  reps         integer not null default 0,
  weight       numeric not null default 0,
  completed_at timestamptz
);

-- The read is always "this exercise, over time, newest first" — the query
-- `lastPerformance` makes, and the one the rollup could never answer.
create index set_logs_user_workout_date_idx on set_logs (user_id, workout_id, date desc);

alter table set_logs enable row level security;

create policy "own rows" on set_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
