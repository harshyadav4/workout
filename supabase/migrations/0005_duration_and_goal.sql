-- Two columns, one deploy.

-- The seconds a held set actually lasted.
--
-- `metric: "time"` has been plannable and loggable since the ledger learned
-- about holds, but `buildLogFromSession` only ever wrote reps and weight — so a
-- 90-second plank was recorded as a set of zero reps at zero kg and the number
-- the lifter actually hit was discarded at Finish. Nothing could be back-filled
-- and no rule could read a history that was never written.
--
-- Nullable: every row before this migration is a rep set, and a rep set has no
-- duration. NULL means "not a held set", not "held for nothing".
alter table set_logs
  add column if not exists duration_seconds integer;

-- The bodyweight the lifter is aiming at, drawn as a line across the weigh-in
-- chart. One scalar, on the profile, because it is a setting and not a series —
-- the readings are the series and they live in body_measurements.
alter table profiles
  add column if not exists goal_weight_kg numeric;
