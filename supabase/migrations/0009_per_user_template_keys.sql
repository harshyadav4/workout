-- 0009: exercise and session template ids are unique per user, not globally.
--
-- The client mints these ids from content: a library exercise is `db-0025` for
-- everyone who adds it, and a workout called "Push" is `session-push`. With a
-- global primary key the second user to add Barbell Bench Press hit the first
-- user's row — `on conflict do update` against a row RLS hides fails — and
-- because workout_templates is the first table a push writes, every later push
-- for that user (sets, logs, weigh-ins) failed with it.
--
-- `(user_id, id)` keeps the ids as they are. supabase-js upserts on the primary
-- key, so the client needs no change; RLS already scopes deletes to the user.
-- Nothing references these tables by foreign key.
alter table workout_templates drop constraint if exists workout_templates_pkey;
alter table workout_templates add primary key (user_id, id);

alter table session_templates drop constraint if exists session_templates_pkey;
alter table session_templates add primary key (user_id, id);
