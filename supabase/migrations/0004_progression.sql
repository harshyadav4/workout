-- The rule that decides a session's opening weights.
--
-- jsonb rather than three columns (rule / increment / rep max): it is read and
-- written whole, never queried inside, and the same argument the exercises
-- column makes in 0001 applies here.
--
-- Nullable with no default on purpose. NULL is "no rule", which is exactly what
-- every session saved before this migration meant, so nothing needs backfilling
-- and the app's `progression ?? off` fallback is already the correct reading.
alter table session_templates
  add column if not exists progression jsonb;
