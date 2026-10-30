-- A meal's foods, and the micronutrients summed from them. Null on a meal typed
-- by hand, which means unknown, not zero. Plan items and meal days already hold
-- their numbers in jsonb, so they carry micronutrients with no change here.
--
-- The app keeps syncing without these (lib/diet-sync.ts): meals save, and their
-- foods stay on the device until this has run.
alter table meals add column if not exists ingredients jsonb;
alter table meals add column if not exists micros jsonb;

-- The body goal: how much lean mass and how lean, beside the daily targets. The
-- weight goal alone cannot tell muscle from fat. Null means no goal set.
alter table diet_settings add column if not exists lean_goal_kg numeric;
alter table diet_settings add column if not exists body_fat_goal_percent numeric;
