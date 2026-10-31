-- Injuries and their pain scores. Health details, so each person sees only their
-- own rows. Separate from the training tables: a pain score must never reach a
-- training aggregation.
--
-- The app treats any of these missing as "nothing yet" (lib/sync.ts): injuries
-- stay on the phone, every other table syncs as before, and the next time the app
-- opens after this has run it sends them all.

-- One injury. `place` is text with no check, as the app reads it through
-- `readInjury`: a new place on the body map must not need a migration. `workout`
-- is jsonb, as it is only ever read whole, with its injury.
create table if not exists injuries (
  id          text not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  place       text not null,
  side        text,
  start_date  date not null,
  worse_with  text,
  stop_sign   boolean not null default false,
  healed_date date,
  workout     jsonb,
  primary key (user_id, id)
);

-- One 0 to 10 score per injury per day. The client upserts on that key, so a
-- second score replaces the first, even from another phone.
--
-- `injury_id` has no foreign key on purpose. A phone that has not yet heard about
-- a deletion can still send a score for that injury, and a failed key would stop
-- every push from that phone. The next read removes such a row.
create table if not exists pain_logs (
  id        text not null,
  user_id   uuid not null references auth.users (id) on delete cascade,
  injury_id text not null,
  date      date not null,
  score     smallint not null check (score between 0 and 10),
  primary key (user_id, id),
  unique (user_id, injury_id, date)
);

-- What keeps a deleted injury deleted. Every other phone may still hold the row,
-- and without this it would send it straight back. The injury's own row and its
-- scores really are deleted, so all that stays behind is an id with no health
-- detail in it.
create table if not exists injury_deletions (
  id         text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table injuries enable row level security;
alter table pain_logs enable row level security;
alter table injury_deletions enable row level security;

drop policy if exists "own rows" on injuries;
create policy "own rows" on injuries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on pain_logs;
create policy "own rows" on pain_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on injury_deletions;
create policy "own rows" on injury_deletions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
