-- 0012: nudges when away.
--
-- A fresh account that never logged a set hears from the app on day 1, 3 and
-- 7; a lifter who stopped hears at 3, 7 and 14 days after the last set, then
-- nothing until they train again (supabase/functions/_shared/reminders.ts).
alter table reminder_settings
  add column if not exists away boolean not null default false;
