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
