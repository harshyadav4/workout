-- 0011: the "Rest done" notification says what is next.
--
-- The device knows the next set when the rest starts ("Next: Incline press,
-- set 3 of 4, 8 × 60 kg") and writes it here; the sender forwards it. Null
-- means the plain "Time for your next set."
alter table rest_alerts
  add column if not exists body text;

-- Reminders: when and what the server sends each day, one row per lifter.
-- Times are the lifter's local clock; `timezone` (IANA, from the device) is
-- what turns them into an instant. The sender (send-daily-reminders) runs
-- every minute and matches on the hour and minute.
create table if not exists reminder_settings (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  timezone     text not null default 'UTC',
  morning_time time not null default '07:30',
  evening_time time not null default '20:00',
  workout      boolean not null default false, -- "Push day today" on planned days
  weight       boolean not null default false, -- weigh-in due, daily until logged
  measurement  boolean not null default false, -- tape due, daily until logged
  plan         boolean not null default false, -- schedule ends in 7 days, then 1
  streak       boolean not null default false, -- evening: planned day, nothing logged
  recap        boolean not null default false, -- Sunday evening: the week in numbers
  updated_at   timestamptz not null default now()
);

alter table reminder_settings enable row level security;

drop policy if exists "own rows" on reminder_settings;
create policy "own rows" on reminder_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Once a day per kind. No client policy on purpose: only the sender (service
-- role) reads or writes it, so a device can neither forge nor erase a send.
create table if not exists reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null,
  sent_on date not null,
  primary key (user_id, kind, sent_on)
);

alter table reminder_log enable row level security;
