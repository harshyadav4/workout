-- Bodyweight and tape measurements.
--
-- One table for both: a weigh-in and a chest measurement are the same shape —
-- a number, on a date, for a site — and splitting them would duplicate the
-- mapping, the RLS policy and the chart for no gain.
--
-- Real columns rather than jsonb, unlike scheduled_sessions: this table is read
-- as a series (one metric, ordered by date), which is exactly the query jsonb
-- would make expensive.

create table body_measurements (
  id      text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date    date not null,
  -- Matches BodyMetric in lib/types.ts. Left and right are separate sites:
  -- limb asymmetry is real and averaging it away at the model level is lossy.
  metric  text not null check (metric in (
    'weight', 'shoulders', 'chest', 'waist', 'hips',
    'armL', 'armR', 'thighL', 'thighR', 'calfL', 'calfR'
  )),
  -- kg for 'weight', cm for every circumference.
  value   numeric not null,

  -- One reading per site per day. The client upserts on this pair, so a second
  -- measurement on the same Tuesday replaces it instead of adding a point;
  -- without the constraint a failed round-trip could still duplicate it.
  unique (user_id, date, metric)
);

create index body_measurements_user_metric_date_idx
  on body_measurements (user_id, metric, date);

alter table body_measurements enable row level security;

create policy "own rows" on body_measurements for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- How often the user intends to record. In-app only — nothing is scheduled
-- server-side and no notification permission is involved; the app asks when
-- you next open it. Null means never chosen, which reads as "off".
alter table profiles add column weight_cadence text
  check (weight_cadence in ('off', 'weekly', 'biweekly', 'monthly'));
alter table profiles add column measurement_cadence text
  check (measurement_cadence in ('off', 'weekly', 'biweekly', 'monthly'));
