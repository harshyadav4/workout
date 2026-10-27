-- 0010: Web Push for "Rest alerts".
--
-- A page timer cannot fire while a phone is locked, which is exactly when the
-- rest alert is wanted. So the device registers a push subscription — the
-- address its browser hands out — and each rest writes one row saying when to
-- send. An Edge Function (supabase/functions/send-rest-alerts), run by pg_cron
-- every few seconds, sends the due ones and deletes them. See README.

-- One row per device. The endpoint is the browser's address and is unique
-- across the push service; `p256dh` and `auth` are the keys that let the
-- server encrypt for that one device.
create table if not exists push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "own rows" on push_subscriptions;
create policy "own rows" on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One pending alert per lifter: a new rest replaces the last. The sender
-- deletes the row once sent; skipping the rest deletes it from the device.
create table if not exists rest_alerts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  fire_at    timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists rest_alerts_fire_idx on rest_alerts (fire_at);

alter table rest_alerts enable row level security;

drop policy if exists "own rows" on rest_alerts;
create policy "own rows" on rest_alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
